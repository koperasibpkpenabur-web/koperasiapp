-- ============================================================================
-- SCRIPT MIGRASI SUPABASE AUTH & ROW LEVEL SECURITY (RLS)
-- SISTEM KOPERASI BPK PENABUR (SINARA)
-- ============================================================================
-- Jalankan seluruh script ini di Supabase SQL Editor:
-- https://supabase.com/dashboard/project/fxyssksvbuxnbthfrpzy/sql/new
-- ============================================================================

-- 1. Pastikan ekstensi pgcrypto aktif untuk enkripsi password bcrypt
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Migrasikan akun yang ada saat ini dari public.app_users ke auth.users
DO $$
DECLARE
  v_users RECORD;
  v_email TEXT;
  v_has_provider_id BOOLEAN;
BEGIN
  -- Cek apakah kolom provider_id ada di auth.identities
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'auth' AND table_name = 'identities' AND column_name = 'provider_id'
  ) INTO v_has_provider_id;

  -- Loop setiap user yang memiliki password di app_users
  FOR v_users IN 
    SELECT id, username, password, name, role 
    FROM public.app_users 
    WHERE password IS NOT NULL AND password <> ''
  LOOP
    -- Jika username belum mengandung '@', beri domain '@koperasi.local'
    IF position('@' in v_users.username) = 0 THEN
      v_email := lower(trim(v_users.username)) || '@koperasi.local';
    ELSE
      v_email := lower(trim(v_users.username));
    END IF;

    -- Masukkan akun ke auth.users (ID sama persis dengan app_users agar foreign key aman)
    INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      confirmation_token,
      recovery_token
    )
    VALUES (
      '00000000-0000-0000-0000-000000000000',
      v_users.id,
      'authenticated',
      'authenticated',
      v_email,
      crypt(v_users.password, gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('name', v_users.name, 'role', v_users.role, 'username', v_users.username),
      now(),
      now(),
      '',
      ''
    )
    ON CONFLICT (id) DO UPDATE SET
      email = EXCLUDED.email,
      encrypted_password = EXCLUDED.encrypted_password,
      raw_user_meta_data = EXCLUDED.raw_user_meta_data,
      email_confirmed_at = COALESCE(auth.users.email_confirmed_at, now()),
      updated_at = now();

    -- Masukkan identitas ke auth.identities jika belum ada (gunakan gen_random_uuid() bertipe UUID)
    IF NOT EXISTS (SELECT 1 FROM auth.identities WHERE user_id = v_users.id AND provider = 'email') THEN
      IF v_has_provider_id THEN
        EXECUTE 'INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at) VALUES (gen_random_uuid(), $1, $2, $3, $4, now(), now(), now())'
        USING v_users.id, jsonb_build_object('sub', v_users.id, 'email', v_email), 'email', v_users.id::text;
      ELSE
        EXECUTE 'INSERT INTO auth.identities (id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at) VALUES (gen_random_uuid(), $1, $2, $3, now(), now(), now())'
        USING v_users.id, jsonb_build_object('sub', v_users.id, 'email', v_email), 'email';
      END IF;
    END IF;
  END LOOP;
END $$;

-- 3. FUNGSI ADMIN RPC (SECURITY DEFINER)
-- Memungkinkan Admin di Web membuat user & reset password tanpa service_role key

-- A. Fungsi Tambah Pengguna Baru
CREATE OR REPLACE FUNCTION public.admin_create_user(
  p_email text,
  p_password text,
  p_name text,
  p_role text,
  p_school_name text DEFAULT '',
  p_school_level text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id uuid := gen_random_uuid();
  v_clean_email text;
  v_raw_username text := lower(trim(p_email));
  v_has_provider_id boolean;
BEGIN
  IF position('@' in v_raw_username) = 0 THEN
    v_clean_email := v_raw_username || '@koperasi.local';
  ELSE
    v_clean_email := v_raw_username;
  END IF;

  -- 1. Insert ke auth.users
  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    recovery_token
  )
  VALUES (
    '00000000-0000-0000-0000-000000000000',
    v_user_id,
    'authenticated',
    'authenticated',
    v_clean_email,
    crypt(p_password, gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('name', p_name, 'role', p_role, 'username', v_raw_username),
    now(),
    now(),
    '',
    ''
  );

  -- 2. Insert ke auth.identities
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'auth' AND table_name = 'identities' AND column_name = 'provider_id'
  ) INTO v_has_provider_id;

  IF v_has_provider_id THEN
    EXECUTE 'INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at) VALUES (gen_random_uuid(), $1, $2, $3, $4, now(), now(), now())'
    USING v_user_id, jsonb_build_object('sub', v_user_id, 'email', v_clean_email), 'email', v_user_id::text;
  ELSE
    EXECUTE 'INSERT INTO auth.identities (id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at) VALUES (gen_random_uuid(), $1, $2, $3, now(), now(), now())'
    USING v_user_id, jsonb_build_object('sub', v_user_id, 'email', v_clean_email), 'email';
  END IF;

  -- 3. Insert ke public.app_users
  INSERT INTO public.app_users (
    id,
    username,
    name,
    role,
    school_name,
    school_level,
    created_at
  )
  VALUES (
    v_user_id,
    v_raw_username,
    p_name,
    p_role,
    p_school_name,
    p_school_level,
    now()
  );

  RETURN jsonb_build_object('success', true, 'id', v_user_id);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- B. Fungsi Ganti Password Pengguna oleh Admin
CREATE OR REPLACE FUNCTION public.admin_reset_password(
  p_user_id uuid,
  p_new_password text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  UPDATE auth.users
  SET encrypted_password = crypt(p_new_password, gen_salt('bf')),
      updated_at = now()
  WHERE id = p_user_id;

  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- C. Fungsi Hapus Pengguna oleh Admin
CREATE OR REPLACE FUNCTION public.admin_delete_user(
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  -- Hapus identitas & akun dari auth
  DELETE FROM auth.identities WHERE user_id = p_user_id;
  DELETE FROM auth.users WHERE id = p_user_id;
  -- Hapus profil dari app_users
  DELETE FROM public.app_users WHERE id = p_user_id;

  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Berikan izin akses RPC ke role web (anon & authenticated)
GRANT EXECUTE ON FUNCTION public.admin_create_user TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_reset_password TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_delete_user TO anon, authenticated, service_role;

-- 4. HAPUS KOLOM PASSWORD DARI public.app_users
-- Menghilangkan alert "Sensitive data publicly accessible"
ALTER TABLE public.app_users DROP COLUMN IF EXISTS password;

-- 5. AKTIFKAN ROW LEVEL SECURITY (RLS) DI SELURUH TABEL
ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_whitelist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_school_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_stocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_payables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kalkulator_size_charts ENABLE ROW LEVEL SECURITY;

-- 6. BUAT POLICIES UNTUK USER TERAUTENTIKASI (AUTHENTICATED)
DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'app_users',
    'school_whitelist',
    'products',
    'orders',
    'order_items',
    'returns',
    'notifications',
    'app_settings',
    'vendors',
    'vendor_school_assignments',
    'vendor_stocks',
    'vendor_payables',
    'kalkulator_size_charts'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Allow authenticated users full access" ON public.%I', tbl);
    EXECUTE format('CREATE POLICY "Allow authenticated users full access" ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)', tbl);
  END LOOP;
END $$;

-- Khusus school_whitelist: izinkan anon membaca untuk verifikasi login Google awal
DROP POLICY IF EXISTS "Allow anon read school_whitelist" ON public.school_whitelist;
CREATE POLICY "Allow anon read school_whitelist" ON public.school_whitelist FOR SELECT TO anon USING (true);
