-- ============================================================================
-- SCRIPT SOLUSI TUNTAS SUPABASE AUTH, MANAJEMEN AKUN & RESET PASSWORD
-- SISTEM KOPERASI BPK PENABUR (SINARA)
-- ============================================================================
-- Jalankan seluruh script ini di Supabase SQL Editor:
-- https://supabase.com/dashboard/project/fxyssksvbuxnbthfrpzy/sql/new
-- ============================================================================

-- 1. PASTIKAN EKSTENSI PGCRYPTO AKTIF DI SKEMA EXTENSIONS
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- 2. HAPUS FUNGSI LAMA YANG BENTROK (OVERLOAD) AGAR TIDAK ADA ERROR PGRST203
DROP FUNCTION IF EXISTS public.admin_create_user(text, text, text, text, text, text, text);
DROP FUNCTION IF EXISTS public.admin_create_user(text, text, text, text, text, text);
DROP FUNCTION IF EXISTS public.admin_create_user(text, text, text, text);
DROP FUNCTION IF EXISTS public.admin_reset_password(uuid, text);
DROP FUNCTION IF EXISTS public.admin_delete_user(uuid);

-- 3. BUAT FUNGSI ADMIN_CREATE_USER YANG BERSIH & ROBUST (MENCEGAH DUPLIKAT EMAIL)
CREATE OR REPLACE FUNCTION public.admin_create_user(
  p_email text,
  p_password text,
  p_name text,
  p_role text,
  p_school_name text DEFAULT '',
  p_school_level text DEFAULT '',
  p_username text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_user_id uuid;
  v_clean_email text;
  v_raw_username text;
  v_has_provider_id boolean;
  v_existing_auth_id uuid;
  v_existing_app_id uuid;
BEGIN
  -- Tentukan username bersih
  IF p_username IS NOT NULL AND trim(p_username) <> '' THEN
    v_raw_username := lower(trim(p_username));
  ELSE
    v_raw_username := lower(trim(p_email));
  END IF;

  -- Tentukan email resmi sistem
  IF position('@' in v_raw_username) = 0 THEN
    v_clean_email := v_raw_username || '@koperasi.local';
  ELSE
    v_clean_email := v_raw_username;
  END IF;

  -- Cek apakah email ini sudah ada di auth.users sebelumnya
  SELECT id INTO v_existing_auth_id 
  FROM auth.users 
  WHERE lower(trim(email)) = v_clean_email 
  LIMIT 1;

  IF v_existing_auth_id IS NOT NULL THEN
    v_user_id := v_existing_auth_id;
  ELSE
    -- Jika belum ada di auth.users, cek apakah sudah ada di app_users
    SELECT id INTO v_existing_app_id 
    FROM public.app_users 
    WHERE lower(trim(username)) = v_raw_username 
    LIMIT 1;

    IF v_existing_app_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_existing_app_id) THEN
      v_user_id := v_existing_app_id;
    ELSE
      v_user_id := gen_random_uuid();
    END IF;
  END IF;

  -- A. Masukkan atau Perbarui akun di auth.users (mencegah duplicate key)
  IF v_existing_auth_id IS NOT NULL THEN
    UPDATE auth.users
    SET encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
        raw_user_meta_data = jsonb_build_object(
          'name', p_name, 
          'role', p_role, 
          'username', v_raw_username,
          'school_name', p_school_name,
          'school_level', p_school_level
        ),
        confirmation_token = COALESCE(confirmation_token, ''),
        recovery_token = COALESCE(recovery_token, ''),
        email_change_token_new = COALESCE(email_change_token_new, ''),
        email_change = COALESCE(email_change, ''),
        phone_change = COALESCE(phone_change, ''),
        phone_change_token = COALESCE(phone_change_token, ''),
        email_change_token_current = COALESCE(email_change_token_current, ''),
        reauthentication_token = COALESCE(reauthentication_token, ''),
        is_sso_user = COALESCE(is_sso_user, false),
        is_anonymous = COALESCE(is_anonymous, false),
        email_confirmed_at = COALESCE(email_confirmed_at, now()),
        updated_at = now()
    WHERE id = v_user_id;
  ELSE
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
      recovery_token,
      email_change_token_new,
      email_change,
      phone_change,
      phone_change_token,
      email_change_token_current,
      reauthentication_token,
      is_sso_user,
      is_anonymous
    )
    VALUES (
      '00000000-0000-0000-0000-000000000000',
      v_user_id,
      'authenticated',
      'authenticated',
      v_clean_email,
      extensions.crypt(p_password, extensions.gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object(
        'name', p_name, 
        'role', p_role, 
        'username', v_raw_username,
        'school_name', p_school_name,
        'school_level', p_school_level
      ),
      now(),
      now(),
      '', '', '', '', '', '', '', '',
      false,
      false
    );
  END IF;

  -- B. Masukkan identitas ke auth.identities jika belum ada
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'auth' AND table_name = 'identities' AND column_name = 'provider_id'
  ) INTO v_has_provider_id;

  IF NOT EXISTS (SELECT 1 FROM auth.identities WHERE user_id = v_user_id AND provider = 'email') THEN
    IF v_has_provider_id THEN
      EXECUTE 'INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at) VALUES (gen_random_uuid(), $1, $2, $3, $4, now(), now(), now())'
      USING v_user_id, jsonb_build_object('sub', v_user_id, 'email', v_clean_email), 'email', v_user_id::text;
    ELSE
      EXECUTE 'INSERT INTO auth.identities (id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at) VALUES (gen_random_uuid(), $1, $2, $3, now(), now(), now())'
      USING v_user_id, jsonb_build_object('sub', v_user_id, 'email', v_clean_email), 'email';
    END IF;
  END IF;

  -- C. Masukkan/Perbarui profil di public.app_users
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
    NULLIF(trim(p_school_name), ''),
    NULLIF(trim(p_school_level), ''),
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    username = EXCLUDED.username,
    name = EXCLUDED.name,
    role = EXCLUDED.role,
    school_name = EXCLUDED.school_name,
    school_level = EXCLUDED.school_level;

  RETURN jsonb_build_object('success', true, 'id', v_user_id, 'user_id', v_user_id);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- 4. BUAT FUNGSI ADMIN_RESET_PASSWORD DENGAN AUTO-SINKRONISASI
-- Mendukung pencarian via ID maupun via email/username
CREATE OR REPLACE FUNCTION public.admin_reset_password(
  p_user_id uuid,
  p_new_password text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_exists_in_auth boolean;
  v_user RECORD;
  v_clean_email text;
  v_has_provider_id boolean;
  v_auth_id_by_email uuid;
BEGIN
  -- 1. Cek apakah user ada di auth.users berdasarkan ID langsung
  SELECT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) INTO v_exists_in_auth;

  IF v_exists_in_auth THEN
    UPDATE auth.users
    SET encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf')),
        updated_at = now()
    WHERE id = p_user_id;
    RETURN jsonb_build_object('success', true);
  END IF;

  -- 2. Jika ID tidak ada di auth.users, ambil datanya dari public.app_users
  SELECT id, username, name, role, school_name, school_level
  INTO v_user
  FROM public.app_users
  WHERE id = p_user_id;

  IF v_user.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Pengguna tidak ditemukan di sistem database');
  END IF;

  IF position('@' in v_user.username) = 0 THEN
    v_clean_email := lower(trim(v_user.username)) || '@koperasi.local';
  ELSE
    v_clean_email := lower(trim(v_user.username));
  END IF;

  -- 3. Cek apakah ada di auth.users berdasarkan email (jika ID berbeda)
  SELECT id INTO v_auth_id_by_email 
  FROM auth.users 
  WHERE lower(trim(email)) = v_clean_email 
  LIMIT 1;

  IF v_auth_id_by_email IS NOT NULL THEN
    UPDATE auth.users
    SET encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf')),
        updated_at = now()
    WHERE id = v_auth_id_by_email;
    RETURN jsonb_build_object('success', true);
  END IF;

  -- 4. Jika akun belum terdaftar sama sekali di auth.users (misal akun Tirtamarta baru) -> daftarkan
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
    recovery_token,
    email_change_token_new,
    email_change,
    phone_change,
    phone_change_token,
    email_change_token_current,
    reauthentication_token,
    is_sso_user,
    is_anonymous
  )
  VALUES (
    '00000000-0000-0000-0000-000000000000',
    v_user.id,
    'authenticated',
    'authenticated',
    v_clean_email,
    extensions.crypt(p_new_password, extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object(
      'name', v_user.name, 
      'role', v_user.role, 
      'username', v_user.username,
      'school_name', v_user.school_name,
      'school_level', v_user.school_level
    ),
    now(),
    now(),
    '', '', '', '', '', '', '', '',
    false,
    false
  );

  -- Daftarkan ke auth.identities
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'auth' AND table_name = 'identities' AND column_name = 'provider_id'
  ) INTO v_has_provider_id;

  IF NOT EXISTS (SELECT 1 FROM auth.identities WHERE user_id = v_user.id AND provider = 'email') THEN
    IF v_has_provider_id THEN
      EXECUTE 'INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at) VALUES (gen_random_uuid(), $1, $2, $3, $4, now(), now(), now())'
      USING v_user.id, jsonb_build_object('sub', v_user.id, 'email', v_clean_email), 'email', v_user.id::text;
    ELSE
      EXECUTE 'INSERT INTO auth.identities (id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at) VALUES (gen_random_uuid(), $1, $2, $3, now(), now(), now())'
      USING v_user.id, jsonb_build_object('sub', v_user.id, 'email', v_clean_email), 'email';
    END IF;
  END IF;

  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- 5. BUAT FUNGSI ADMIN_DELETE_USER
CREATE OR REPLACE FUNCTION public.admin_delete_user(
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
BEGIN
  DELETE FROM auth.identities WHERE user_id = p_user_id;
  DELETE FROM auth.users WHERE id = p_user_id;
  DELETE FROM public.app_users WHERE id = p_user_id;
  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- 6. BERIKAN IZIN AKSES RPC KE ANON & AUTHENTICATED
GRANT EXECUTE ON FUNCTION public.admin_create_user TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_reset_password TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_delete_user TO anon, authenticated, service_role;

-- 7. PERBAIKI SEMUA TOKEN NULL PADA AKUN AUTH YANG SUDAH ADA
UPDATE auth.users
SET 
  confirmation_token = COALESCE(confirmation_token, ''),
  recovery_token = COALESCE(recovery_token, ''),
  email_change_token_new = COALESCE(email_change_token_new, ''),
  email_change = COALESCE(email_change, ''),
  phone_change = COALESCE(phone_change, ''),
  phone_change_token = COALESCE(phone_change_token, ''),
  email_change_token_current = COALESCE(email_change_token_current, ''),
  reauthentication_token = COALESCE(reauthentication_token, ''),
  is_sso_user = COALESCE(is_sso_user, false),
  is_anonymous = COALESCE(is_anonymous, false);

-- 8. SINKRONISASIKAN AKUN YANG BELUM ADA DI AUTH.USERS (MISAL TIRTAMARTA 1 & 2)
-- Catatan: Mengecualikan akun yang email/ID-nya sudah ada di auth.users agar tidak memicu users_email_partial_key
DO $$
DECLARE
  v_usr RECORD;
  v_email TEXT;
  v_has_provider_id BOOLEAN;
  v_default_pass TEXT := 'koperasi123';
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'auth' AND table_name = 'identities' AND column_name = 'provider_id'
  ) INTO v_has_provider_id;

  FOR v_usr IN 
    SELECT au.id, au.username, au.name, au.role, au.school_name, au.school_level
    FROM public.app_users au
  LOOP
    IF position('@' in v_usr.username) = 0 THEN
      v_email := lower(trim(v_usr.username)) || '@koperasi.local';
    ELSE
      v_email := lower(trim(v_usr.username));
    END IF;

    -- HANYA INSERT jika ID dan EMAIL belum pernah ada sama sekali di auth.users
    IF NOT EXISTS (
      SELECT 1 FROM auth.users 
      WHERE id = v_usr.id OR lower(trim(email)) = v_email
    ) THEN
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
        recovery_token,
        email_change_token_new,
        email_change,
        phone_change,
        phone_change_token,
        email_change_token_current,
        reauthentication_token,
        is_sso_user,
        is_anonymous
      )
      VALUES (
        '00000000-0000-0000-0000-000000000000',
        v_usr.id,
        'authenticated',
        'authenticated',
        v_email,
        extensions.crypt(v_default_pass, extensions.gen_salt('bf')),
        now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object(
          'name', v_usr.name, 
          'role', v_usr.role, 
          'username', v_usr.username,
          'school_name', v_usr.school_name,
          'school_level', v_usr.school_level
        ),
        now(),
        now(),
        '', '', '', '', '', '', '', '',
        false,
        false
      );

      -- Masukkan ke auth.identities
      IF NOT EXISTS (SELECT 1 FROM auth.identities WHERE user_id = v_usr.id AND provider = 'email') THEN
        IF v_has_provider_id THEN
          EXECUTE 'INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at) VALUES (gen_random_uuid(), $1, $2, $3, $4, now(), now(), now())'
          USING v_usr.id, jsonb_build_object('sub', v_usr.id, 'email', v_email), 'email', v_usr.id::text;
        ELSE
          EXECUTE 'INSERT INTO auth.identities (id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at) VALUES (gen_random_uuid(), $1, $2, $3, now(), now(), now())'
          USING v_usr.id, jsonb_build_object('sub', v_usr.id, 'email', v_email), 'email';
        END IF;
      END IF;
    END IF;
  END LOOP;
END $$;
