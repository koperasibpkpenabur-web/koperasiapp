-- ============================================================================
-- SCRIPT HARDENING KEAMANAN, ATOMIC STOCK RPC & CENTRAL DATA (TAHAP 1)
-- SISTEM KOPERASI BPK PENABUR (AKSARA -> SIAP KANVAS PENABUR)
-- ============================================================================
-- Jalankan seluruh script ini SEKALI di Supabase SQL Editor:
-- https://supabase.com/dashboard/project/fxyssksvbuxnbthfrpzy/sql/new
-- ============================================================================
-- Catatan:
-- 1. Script ini bersifat idempoten (aman dijalankan ulang).
-- 2. Disarankan buat Backup Database di Dashboard Supabase sebelum eksekusi.
-- 3. Setelah menjalankan script ini, deploy versi frontend AKSARA terbaru.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ----------------------------------------------------------------------------
-- BAGIAN 1: SINKRONISASI PROFIL AUTH & PEMBUATAN HELPER ROLE YANG AMAN
-- ----------------------------------------------------------------------------

-- Pastikan kolom auth_user_id ada untuk menautkan akun Google/Email lama yang
-- mungkin memiliki app_users.id berbeda dengan auth.users.id
ALTER TABLE public.app_users
  ADD COLUMN IF NOT EXISTS auth_user_id uuid;

CREATE INDEX IF NOT EXISTS idx_app_users_auth_user_id
  ON public.app_users (auth_user_id);

CREATE INDEX IF NOT EXISTS idx_app_users_username_lower
  ON public.app_users (lower(trim(username)));

-- Jika kolom plaintext password masih ada di app_users, migrasikan akun tersisa lalu hapus kolomnya
DO $$
DECLARE
  v_has_password boolean;
  v_usr RECORD;
  v_email text;
  v_has_provider_id boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'app_users' AND column_name = 'password'
  ) INTO v_has_password;

  IF v_has_password THEN
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'auth' AND table_name = 'identities' AND column_name = 'provider_id'
    ) INTO v_has_provider_id;

    FOR v_usr IN EXECUTE 'SELECT id, username, password, name, role, school_name, school_level FROM public.app_users WHERE password IS NOT NULL AND password <> ''''' LOOP
      IF position('@' in v_usr.username) = 0 THEN
        v_email := lower(trim(v_usr.username)) || '@koperasi.local';
      ELSE
        v_email := lower(trim(v_usr.username));
      END IF;

      IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_usr.id OR lower(trim(email)) = v_email) THEN
        INSERT INTO auth.users (
          instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
          raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
          confirmation_token, recovery_token, email_change_token_new, email_change,
          phone_change, phone_change_token, email_change_token_current, reauthentication_token,
          is_sso_user, is_anonymous
        ) VALUES (
          '00000000-0000-0000-0000-000000000000', v_usr.id, 'authenticated', 'authenticated',
          v_email, extensions.crypt(v_usr.password, extensions.gen_salt('bf')), now(),
          '{"provider":"email","providers":["email"]}'::jsonb,
          jsonb_build_object('name', v_usr.name, 'role', v_usr.role, 'username', v_usr.username, 'school_name', v_usr.school_name, 'school_level', v_usr.school_level),
          now(), now(), '', '', '', '', '', '', '', '', false, false
        );

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

    ALTER TABLE public.app_users DROP COLUMN IF EXISTS password;
  END IF;
END $$;

-- Tautkan app_users.auth_user_id ke auth.users yang sudah ada berdasarkan ID atau email/username
UPDATE public.app_users au
SET auth_user_id = u.id
FROM auth.users u
WHERE au.auth_user_id IS NULL
  AND (
    au.id = u.id
    OR lower(trim(au.username)) = lower(trim(u.email))
    OR (
      position('@' in au.username) = 0
      AND lower(trim(au.username)) || '@koperasi.local' = lower(trim(u.email))
    )
  );

-- Helper: mengembalikan app_users.id milik pemanggil saat ini (mendukung akun Auth langsung maupun akun Google sekolah lama)
CREATE OR REPLACE FUNCTION public.current_app_user_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_uid uuid;
  v_email text;
  v_app_id uuid;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN NULL;
  END IF;

  v_email := lower(trim(COALESCE(auth.jwt() ->> 'email', '')));

  SELECT au.id INTO v_app_id
  FROM public.app_users au
  WHERE au.auth_user_id = v_uid
     OR au.id = v_uid
     OR (v_email <> '' AND lower(trim(au.username)) = v_email)
     OR (v_email LIKE '%@koperasi.local' AND position('@' in au.username) = 0 AND lower(trim(au.username)) || '@koperasi.local' = v_email)
     OR (v_email LIKE '%@bpkpenaburjakarta.or.id' AND position('@' in au.username) = 0 AND lower(trim(au.username)) || '@bpkpenaburjakarta.or.id' = v_email)
  ORDER BY
    CASE
      WHEN au.auth_user_id = v_uid THEN 0
      WHEN au.id = v_uid THEN 1
      ELSE 2
    END
  LIMIT 1;

  RETURN v_app_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.current_app_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
  SELECT role FROM public.app_users WHERE id = public.current_app_user_id() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
  SELECT COALESCE(public.current_app_role() = 'admin', false)
      OR auth.role() = 'service_role';
$$;

CREATE OR REPLACE FUNCTION public.is_kopkar_or_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
  SELECT COALESCE(public.current_app_role() IN ('admin', 'kopkar'), false)
      OR auth.role() = 'service_role';
$$;

CREATE OR REPLACE FUNCTION public.is_internal_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
  SELECT COALESCE(public.current_app_role() IN ('admin', 'kopkar', 'pengurus'), false)
      OR auth.role() = 'service_role';
$$;

REVOKE ALL ON FUNCTION public.current_app_user_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_app_role() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_kopkar_or_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_internal_staff() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.current_app_user_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_app_role() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_kopkar_or_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_internal_staff() TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- BAGIAN 2: PERKETAT RPC MANAJEMEN PENGGUNA (KHUSUS ADMIN, CABUT AKSES ANON)
-- ----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.admin_create_user(text, text, text, text, text, text, text);
DROP FUNCTION IF EXISTS public.admin_create_user(text, text, text, text, text, text);
DROP FUNCTION IF EXISTS public.admin_create_user(text, text, text, text);
DROP FUNCTION IF EXISTS public.admin_reset_password(uuid, text);
DROP FUNCTION IF EXISTS public.admin_delete_user(uuid);

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
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Akses ditolak: hanya Administrator yang diizinkan menambah pengguna.');
  END IF;

  IF p_username IS NOT NULL AND trim(p_username) <> '' THEN
    v_raw_username := lower(trim(p_username));
  ELSE
    v_raw_username := lower(trim(p_email));
  END IF;

  IF position('@' in v_raw_username) = 0 THEN
    v_clean_email := v_raw_username || '@koperasi.local';
  ELSE
    v_clean_email := v_raw_username;
  END IF;

  SELECT id INTO v_existing_auth_id
  FROM auth.users
  WHERE lower(trim(email)) = v_clean_email
  LIMIT 1;

  IF v_existing_auth_id IS NOT NULL THEN
    v_user_id := v_existing_auth_id;
  ELSE
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
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change,
      phone_change, phone_change_token, email_change_token_current, reauthentication_token,
      is_sso_user, is_anonymous
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', v_user_id, 'authenticated', 'authenticated',
      v_clean_email, extensions.crypt(p_password, extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('name', p_name, 'role', p_role, 'username', v_raw_username, 'school_name', p_school_name, 'school_level', p_school_level),
      now(), now(), '', '', '', '', '', '', '', '', false, false
    );
  END IF;

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

  INSERT INTO public.app_users (
    id, auth_user_id, username, name, role, school_name, school_level, created_at
  ) VALUES (
    v_user_id, v_user_id, v_raw_username, p_name, p_role,
    NULLIF(trim(p_school_name), ''), NULLIF(trim(p_school_level), ''), now()
  )
  ON CONFLICT (id) DO UPDATE SET
    auth_user_id = EXCLUDED.auth_user_id,
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
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Akses ditolak: hanya Administrator yang diizinkan mereset password.');
  END IF;

  SELECT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) INTO v_exists_in_auth;

  IF v_exists_in_auth THEN
    UPDATE auth.users
    SET encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf')),
        updated_at = now()
    WHERE id = p_user_id;
    RETURN jsonb_build_object('success', true);
  END IF;

  SELECT id, auth_user_id, username, name, role, school_name, school_level
  INTO v_user
  FROM public.app_users
  WHERE id = p_user_id;

  IF v_user.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Pengguna tidak ditemukan di sistem database');
  END IF;

  IF v_user.auth_user_id IS NOT NULL AND EXISTS (SELECT 1 FROM auth.users WHERE id = v_user.auth_user_id) THEN
    UPDATE auth.users
    SET encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf')),
        updated_at = now()
    WHERE id = v_user.auth_user_id;
    RETURN jsonb_build_object('success', true);
  END IF;

  IF position('@' in v_user.username) = 0 THEN
    v_clean_email := lower(trim(v_user.username)) || '@koperasi.local';
  ELSE
    v_clean_email := lower(trim(v_user.username));
  END IF;

  SELECT id INTO v_auth_id_by_email
  FROM auth.users
  WHERE lower(trim(email)) = v_clean_email
  LIMIT 1;

  IF v_auth_id_by_email IS NOT NULL THEN
    UPDATE auth.users
    SET encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf')),
        updated_at = now()
    WHERE id = v_auth_id_by_email;

    UPDATE public.app_users SET auth_user_id = v_auth_id_by_email WHERE id = v_user.id;
    RETURN jsonb_build_object('success', true);
  END IF;

  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    phone_change, phone_change_token, email_change_token_current, reauthentication_token,
    is_sso_user, is_anonymous
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', v_user.id, 'authenticated', 'authenticated',
    v_clean_email, extensions.crypt(p_new_password, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('name', v_user.name, 'role', v_user.role, 'username', v_user.username, 'school_name', v_user.school_name, 'school_level', v_user.school_level),
    now(), now(), '', '', '', '', '', '', '', '', false, false
  );

  UPDATE public.app_users SET auth_user_id = v_user.id WHERE id = v_user.id;

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

CREATE OR REPLACE FUNCTION public.admin_delete_user(
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_auth_id uuid;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Akses ditolak: hanya Administrator yang diizinkan menghapus pengguna.');
  END IF;

  SELECT auth_user_id INTO v_auth_id FROM public.app_users WHERE id = p_user_id;

  DELETE FROM auth.identities WHERE user_id IN (p_user_id, v_auth_id);
  DELETE FROM auth.users WHERE id IN (p_user_id, v_auth_id);
  DELETE FROM public.app_users WHERE id = p_user_id;

  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_create_user(text, text, text, text, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_reset_password(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_delete_user(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.admin_create_user(text, text, text, text, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_reset_password(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(uuid) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- BAGIAN 3: CENTRAL DATA SCHEMA (AKSARA + KANVAS READY)
-- ----------------------------------------------------------------------------

-- 3A. Kolom unit pada order_items + backfill aman untuk data lama
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS unit text;

UPDATE public.order_items
SET unit = CASE
  WHEN type = 'buku' THEN 'pack'
  WHEN lower(name) LIKE '%kaos kaki%' OR lower(name) LIKE '%kaus kaki%' OR lower(name) LIKE '%sepatu%' THEN 'psg'
  ELSE 'pcs'
END
WHERE unit IS NULL OR trim(unit) = '';

-- 3B. Ekstensi kolom Kanvas PENABUR pada master products
-- Catatan: products.code sengaja TIDAK dipaksa UNIQUE karena model yang sama
-- (misal SRG-SD-01 Kemeja Putih) berbagi kode lintas ukuran S/M/L/XL.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS variant_group text,
  ADD COLUMN IF NOT EXISTS is_kanvas_active boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_products_code_lower
  ON public.products (lower(trim(code)));

CREATE INDEX IF NOT EXISTS idx_products_sku_composite
  ON public.products (
    lower(trim(name)),
    level,
    COALESCE(lower(trim(size)), ''),
    COALESCE(lower(trim(school_name)), '')
  );

-- 3C. Tabel Ledger Mutasi Stok (jejak keluar-masuk seluruh stok)
CREATE TABLE IF NOT EXISTS public.stock_mutations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  product_id text NOT NULL,
  vendor_id uuid,
  mutation_source text NOT NULL CHECK (mutation_source IN ('gudang', 'vendor', 'rusak')),
  delta integer NOT NULL,
  balance_after integer NOT NULL,
  ref_type text NOT NULL,
  ref_id text,
  actor_user_id uuid,
  actor_name text,
  notes text
);

CREATE INDEX IF NOT EXISTS idx_stock_mutations_product
  ON public.stock_mutations (product_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_stock_mutations_ref
  ON public.stock_mutations (ref_id);

-- 3D. Tabel Pesanan Orang Tua Kanvas PENABUR (masuk ke role Sekolah + Invoice Siswa)
CREATE TABLE IF NOT EXISTS public.parent_orders (
  id text PRIMARY KEY,
  parent_auth_user_id uuid,
  school_user_id uuid REFERENCES public.app_users(id) ON DELETE SET NULL,
  school_name text NOT NULL,
  school_level text,
  student_name text NOT NULL,
  student_class text,
  parent_name text NOT NULL,
  parent_phone text,
  parent_email text,
  order_phase text,
  total_kopkar numeric NOT NULL DEFAULT 0,
  total_fee_school numeric NOT NULL DEFAULT 0,
  total_amount numeric NOT NULL DEFAULT 0,
  payment_method text,
  payment_status text NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'pending_verification', 'paid')),
  payment_receipt_url text,
  paid_at timestamptz,
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'confirmed', 'ready_pickup', 'completed', 'cancelled')),
  linked_aksara_order_id text REFERENCES public.orders(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.parent_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_order_id text NOT NULL REFERENCES public.parent_orders(id) ON DELETE CASCADE,
  product_id text REFERENCES public.products(id) ON DELETE SET NULL,
  product_code text,
  product_name text NOT NULL,
  category text NOT NULL,
  size text,
  unit text NOT NULL DEFAULT 'pcs',
  quantity integer NOT NULL CHECK (quantity > 0),
  price_kopkar numeric NOT NULL DEFAULT 0,
  fee_school numeric NOT NULL DEFAULT 0,
  price_student numeric NOT NULL DEFAULT 0,
  subtotal numeric NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_parent_orders_school
  ON public.parent_orders (school_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_parent_orders_parent_auth
  ON public.parent_orders (parent_auth_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_parent_order_items_order
  ON public.parent_order_items (parent_order_id);

-- 3E. Storage Bucket untuk foto produk Kanvas PENABUR
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- BAGIAN 4: GENERATOR NOMOR ATOMIC (WIB / Asia/Jakarta)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.generate_order_id()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_date_str text;
  v_prefix text;
  v_max_seq int := 0;
  v_next_seq text;
BEGIN
  v_date_str := to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYYYMMDD');
  v_prefix := 'ORD-' || v_date_str || '-';

  PERFORM pg_advisory_xact_lock(hashtext('order_id_generation_' || v_date_str));

  SELECT COALESCE(
    MAX(
      CASE
        WHEN id ~ ('^' || v_prefix || '[0-9]+$')
        THEN substring(id from ('^' || v_prefix || '([0-9]+)$'))::int
        ELSE 0
      END
    ),
    0
  ) INTO v_max_seq
  FROM public.orders
  WHERE id LIKE v_prefix || '%';

  v_next_seq := lpad((v_max_seq + 1)::text, 3, '0');
  RETURN v_prefix || v_next_seq;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_return_id()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_year_str text;
  v_prefix text;
  v_max_seq int := 0;
  v_next_seq text;
BEGIN
  v_year_str := to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYYY');
  v_prefix := 'RET-' || v_year_str || '-';

  PERFORM pg_advisory_xact_lock(hashtext('return_id_generation_' || v_year_str));

  SELECT COALESCE(
    MAX(
      CASE
        WHEN id ~ ('^' || v_prefix || '[0-9]+$')
        THEN substring(id from ('^' || v_prefix || '([0-9]+)$'))::int
        ELSE 0
      END
    ),
    0
  ) INTO v_max_seq
  FROM public.returns
  WHERE id LIKE v_prefix || '%';

  v_next_seq := lpad((v_max_seq + 1)::text, 3, '0');
  RETURN v_prefix || v_next_seq;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_parent_order_id()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_date_str text;
  v_prefix text;
  v_max_seq int := 0;
  v_next_seq text;
BEGIN
  v_date_str := to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYYYMMDD');
  v_prefix := 'KNV-' || v_date_str || '-';

  PERFORM pg_advisory_xact_lock(hashtext('parent_order_id_generation_' || v_date_str));

  SELECT COALESCE(
    MAX(
      CASE
        WHEN id ~ ('^' || v_prefix || '[0-9]+$')
        THEN substring(id from ('^' || v_prefix || '([0-9]+)$'))::int
        ELSE 0
      END
    ),
    0
  ) INTO v_max_seq
  FROM public.parent_orders
  WHERE id LIKE v_prefix || '%';

  v_next_seq := lpad((v_max_seq + 1)::text, 3, '0');
  RETURN v_prefix || v_next_seq;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_order_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.generate_return_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.generate_parent_order_id() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.generate_order_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.generate_return_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.generate_parent_order_id() TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- BAGIAN 5: ATOMIC STOCK & WORKFLOW RPCS (ANTI-RACE CONDITION & ANTI-MINUS)
-- ----------------------------------------------------------------------------

-- Helper internal untuk mencari vendor_id yang diplot ke sekolah
CREATE OR REPLACE FUNCTION public._resolve_vendor_for_school(
  p_school_user_id uuid,
  p_item_name text
)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT vendor_id
  FROM public.vendor_school_assignments
  WHERE school_user_id = p_school_user_id
  ORDER BY
    CASE
      WHEN clothing_type IS NOT NULL
       AND lower(trim(clothing_type)) = lower(trim(COALESCE(p_item_name, '')))
      THEN 0
      ELSE 1
    END,
    created_at ASC
  LIMIT 1;
$$;

-- 5A. Guru On The Spot: validasi stok cukup -> buat order -> potong stok secara atomic
CREATE OR REPLACE FUNCTION public.create_ots_order_atomic(
  p_school_user_id uuid,
  p_school_name text,
  p_school_level text,
  p_order_phase text,
  p_notes text,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_role text;
  v_caller_app_id uuid;
  v_order_id text;
  v_now timestamptz := now();
  v_item jsonb;
  v_req RECORD;
  v_prod RECORD;
  v_total_kopkar numeric := 0;
  v_total_fee numeric := 0;
  v_total_student numeric := 0;
  v_missing text[] := ARRAY[]::text[];
  v_qty int;
  v_new_stock int;
  v_unit text;
BEGIN
  v_role := public.current_app_role();
  v_caller_app_id := public.current_app_user_id();

  IF NOT (v_role IN ('admin', 'kopkar', 'guru_ots') OR auth.role() = 'service_role') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Akses ditolak untuk membuat pesanan OTS.');
  END IF;

  IF v_role = 'guru_ots' AND p_school_user_id <> v_caller_app_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'ID akun Guru OTS tidak sesuai.');
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Daftar item pesanan tidak boleh kosong.');
  END IF;

  -- Agregasi permintaan per product_id & lock baris products berurutan untuk mencegah deadlock
  FOR v_req IN
    SELECT
      trim(elem ->> 'productId') AS product_id,
      SUM((elem ->> 'quantity')::int) AS total_qty,
      MIN(elem ->> 'name') AS item_name,
      MIN(elem ->> 'size') AS item_size
    FROM jsonb_array_elements(p_items) elem
    GROUP BY trim(elem ->> 'productId')
    ORDER BY trim(elem ->> 'productId')
  LOOP
    IF v_req.product_id IS NULL OR v_req.product_id = '' THEN
      RETURN jsonb_build_object('success', false, 'error', 'Item OTS harus terhubung ke Master Produk (productId wajib ada).');
    END IF;

    IF v_req.total_qty IS NULL OR v_req.total_qty <= 0 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Kuantitas barang harus lebih dari 0.');
    END IF;

    SELECT id, name, size, stock INTO v_prod
    FROM public.products
    WHERE id = v_req.product_id
    FOR UPDATE;

    IF v_prod.id IS NULL THEN
      v_missing := array_append(v_missing, format('• %s (produk tidak ditemukan di Master Barang)', COALESCE(v_req.item_name, v_req.product_id)));
    ELSIF COALESCE(v_prod.stock, 0) < v_req.total_qty THEN
      v_missing := array_append(
        v_missing,
        format(
          '• %s%s (Diminta: %s, Stok Gudang Tersedia: %s)',
          v_prod.name,
          CASE WHEN COALESCE(v_prod.size, '') <> '' THEN ' [' || v_prod.size || ']' ELSE '' END,
          v_req.total_qty,
          COALESCE(v_prod.stock, 0)
        )
      );
    END IF;
  END LOOP;

  IF array_length(v_missing, 1) > 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error',
      E'Pesanan On The Spot tidak dapat diproses karena stok gudang kurang:\n' || array_to_string(v_missing, E'\n') || E'\n\nHarap tunggu restock barang tersedia sebelum membuat pesanan.'
    );
  END IF;

  -- Hitung total finansial dari item yang dikirim
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qty := COALESCE((v_item ->> 'quantity')::int, 0);
    v_total_kopkar := v_total_kopkar + COALESCE((v_item ->> 'priceKopkar')::numeric, 0) * v_qty;
    v_total_fee := v_total_fee + COALESCE((v_item ->> 'feeSchool')::numeric, 0) * v_qty;
    v_total_student := v_total_student + COALESCE(
      NULLIF((v_item ->> 'priceStudent')::numeric, 0),
      COALESCE((v_item ->> 'priceKopkar')::numeric, 0) + COALESCE((v_item ->> 'feeSchool')::numeric, 0)
    ) * v_qty;
  END LOOP;

  v_order_id := public.generate_order_id();

  INSERT INTO public.orders (
    id, school_user_id, school_name, school_level, order_phase,
    status, notes, total_price_kopkar, total_fee_school, total_price_student,
    payment_status, fee_status, receive_info, created_at
  ) VALUES (
    v_order_id,
    p_school_user_id,
    p_school_name,
    p_school_level,
    COALESCE(NULLIF(trim(p_order_phase), ''), 'On The Spot'),
    'received',
    p_notes,
    v_total_kopkar,
    v_total_fee,
    v_total_student,
    'unpaid',
    'locked',
    jsonb_build_object(
      'receivedBy', COALESCE(NULLIF(trim(p_school_name), ''), 'Petugas / Guru OTS'),
      'isChecked', true,
      'receivedAt', v_now,
      'notes', 'Barang langsung diambil di Koperasi (On The Spot)'
    ),
    v_now
  );

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qty := (v_item ->> 'quantity')::int;
    v_unit := COALESCE(
      NULLIF(trim(v_item ->> 'unit'), ''),
      CASE WHEN (v_item ->> 'type') = 'buku' THEN 'pack' ELSE 'pcs' END
    );

    INSERT INTO public.order_items (
      order_id, product_id, code, name, type, quantity,
      price_kopkar, fee_school, price_student, size, unit
    ) VALUES (
      v_order_id,
      v_item ->> 'productId',
      v_item ->> 'code',
      v_item ->> 'name',
      v_item ->> 'type',
      v_qty,
      COALESCE((v_item ->> 'priceKopkar')::numeric, 0),
      COALESCE((v_item ->> 'feeSchool')::numeric, 0),
      COALESCE((v_item ->> 'priceStudent')::numeric, 0),
      v_item ->> 'size',
      v_unit
    );
  END LOOP;

  -- Potong stok & tulis ledger mutasi stok
  FOR v_req IN
    SELECT
      trim(elem ->> 'productId') AS product_id,
      SUM((elem ->> 'quantity')::int) AS total_qty
    FROM jsonb_array_elements(p_items) elem
    GROUP BY trim(elem ->> 'productId')
    ORDER BY trim(elem ->> 'productId')
  LOOP
    UPDATE public.products
    SET stock = COALESCE(stock, 0) - v_req.total_qty
    WHERE id = v_req.product_id
    RETURNING stock INTO v_new_stock;

    INSERT INTO public.stock_mutations (
      product_id, mutation_source, delta, balance_after, ref_type, ref_id, actor_user_id, actor_name, notes
    ) VALUES (
      v_req.product_id, 'gudang', -v_req.total_qty, v_new_stock, 'order_ots', v_order_id, v_caller_app_id, p_school_name, 'Pemesanan OTS langsung ambil'
    );
  END LOOP;

  RETURN jsonb_build_object('success', true, 'order_id', v_order_id);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- 5B. Kirim Barang Utama (validasi & potong stok gudang + vendor secara atomic)
CREATE OR REPLACE FUNCTION public.ship_order_atomic(
  p_order_id text,
  p_shipping_data jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_order RECORD;
  v_item RECORD;
  v_shipped_it jsonb;
  v_kopkar_qty int;
  v_vendor_qty int;
  v_vendor_id uuid;
  v_missing text[] := ARRAY[]::text[];
  v_prod RECORD;
  v_vstock RECORD;
  v_new_stock int;
  v_caller_app_id uuid;
  v_final_shipping jsonb;
  v_history_entry jsonb;
BEGIN
  IF NOT public.is_kopkar_or_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Akses ditolak: hanya Staf Koperasi atau Admin yang dapat mengirim pesanan.');
  END IF;

  v_caller_app_id := public.current_app_user_id();

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF v_order.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Pesanan tidak ditemukan.');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.order_items WHERE order_id = p_order_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tidak ada rincian barang dalam pesanan ini.');
  END IF;

  -- Tahap 1: Validasi seluruh kecukupan stok Gudang Kopkar & Stok Vendor sebelum ada mutasi
  FOR v_item IN SELECT * FROM public.order_items WHERE order_id = p_order_id ORDER BY product_id NULLS LAST LOOP
    IF v_item.product_id IS NULL THEN
      CONTINUE;
    END IF;

    SELECT elem INTO v_shipped_it
    FROM jsonb_array_elements(COALESCE(p_shipping_data -> 'shippedItems', '[]'::jsonb)) elem
    WHERE (
      NULLIF(trim(elem ->> 'productId'), '') IS NOT NULL
      AND trim(elem ->> 'productId') = v_item.product_id
    ) OR (
      NULLIF(trim(elem ->> 'productId'), '') IS NULL
      AND lower(trim(COALESCE(elem ->> 'name', ''))) = lower(trim(COALESCE(v_item.name, '')))
      AND lower(trim(COALESCE(elem ->> 'type', ''))) = lower(trim(COALESCE(v_item.type, '')))
      AND lower(trim(COALESCE(elem ->> 'size', ''))) = lower(trim(COALESCE(v_item.size, '')))
    )
    LIMIT 1;

    IF v_shipped_it IS NOT NULL THEN
      v_kopkar_qty := COALESCE((v_shipped_it ->> 'kopkarQty')::int, 0);
      v_vendor_qty := COALESCE((v_shipped_it ->> 'vendorQty')::int, 0);
    ELSIF COALESCE(p_shipping_data ->> 'source', '') = 'vendor' THEN
      v_kopkar_qty := 0;
      v_vendor_qty := v_item.quantity;
    ELSE
      v_kopkar_qty := v_item.quantity;
      v_vendor_qty := 0;
    END IF;

    IF v_kopkar_qty > 0 THEN
      SELECT id, name, size, stock INTO v_prod FROM public.products WHERE id = v_item.product_id FOR UPDATE;
      IF COALESCE(v_prod.stock, 0) < v_kopkar_qty THEN
        v_missing := array_append(
          v_missing,
          format('• %s%s (Butuh Gudang: %s, Tersedia: %s)', v_item.name, CASE WHEN COALESCE(v_item.size, '') <> '' THEN ' [' || v_item.size || ']' ELSE '' END, v_kopkar_qty, COALESCE(v_prod.stock, 0))
        );
      END IF;
    END IF;

    IF v_vendor_qty > 0 THEN
      v_vendor_id := public._resolve_vendor_for_school(v_order.school_user_id, v_item.name);
      IF v_vendor_id IS NULL THEN
        v_missing := array_append(
          v_missing,
          format('• %s%s (Sekolah belum di-plotting ke Vendor untuk pengiriman penjahit)', v_item.name, CASE WHEN COALESCE(v_item.size, '') <> '' THEN ' [' || v_item.size || ']' ELSE '' END)
        );
      ELSE
        SELECT id, quantity INTO v_vstock
        FROM public.vendor_stocks
        WHERE vendor_id = v_vendor_id AND product_id = v_item.product_id
        FOR UPDATE;

        IF v_vstock.id IS NULL OR COALESCE(v_vstock.quantity, 0) < v_vendor_qty THEN
          v_missing := array_append(
            v_missing,
            format('• %s%s (Butuh Vendor: %s, Stok Penjahit Tersedia: %s)', v_item.name, CASE WHEN COALESCE(v_item.size, '') <> '' THEN ' [' || v_item.size || ']' ELSE '' END, v_vendor_qty, COALESCE(v_vstock.quantity, 0))
          );
        END IF;
      END IF;
    END IF;
  END LOOP;

  IF array_length(v_missing, 1) > 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error',
      E'Pengiriman tidak dapat dilakukan karena stok tidak mencukupi:\n\n' || array_to_string(v_missing, E'\n')
    );
  END IF;

  -- Tahap 2: Potong stok Gudang & Vendor + tulis stock_mutations
  FOR v_item IN SELECT * FROM public.order_items WHERE order_id = p_order_id ORDER BY product_id NULLS LAST LOOP
    IF v_item.product_id IS NULL THEN
      CONTINUE;
    END IF;

    SELECT elem INTO v_shipped_it
    FROM jsonb_array_elements(COALESCE(p_shipping_data -> 'shippedItems', '[]'::jsonb)) elem
    WHERE (
      NULLIF(trim(elem ->> 'productId'), '') IS NOT NULL
      AND trim(elem ->> 'productId') = v_item.product_id
    ) OR (
      NULLIF(trim(elem ->> 'productId'), '') IS NULL
      AND lower(trim(COALESCE(elem ->> 'name', ''))) = lower(trim(COALESCE(v_item.name, '')))
      AND lower(trim(COALESCE(elem ->> 'type', ''))) = lower(trim(COALESCE(v_item.type, '')))
      AND lower(trim(COALESCE(elem ->> 'size', ''))) = lower(trim(COALESCE(v_item.size, '')))
    )
    LIMIT 1;

    IF v_shipped_it IS NOT NULL THEN
      v_kopkar_qty := COALESCE((v_shipped_it ->> 'kopkarQty')::int, 0);
      v_vendor_qty := COALESCE((v_shipped_it ->> 'vendorQty')::int, 0);
    ELSIF COALESCE(p_shipping_data ->> 'source', '') = 'vendor' THEN
      v_kopkar_qty := 0;
      v_vendor_qty := v_item.quantity;
    ELSE
      v_kopkar_qty := v_item.quantity;
      v_vendor_qty := 0;
    END IF;

    IF v_kopkar_qty > 0 THEN
      UPDATE public.products
      SET stock = COALESCE(stock, 0) - v_kopkar_qty
      WHERE id = v_item.product_id
      RETURNING stock INTO v_new_stock;

      INSERT INTO public.stock_mutations (
        product_id, mutation_source, delta, balance_after, ref_type, ref_id, actor_user_id, actor_name, notes
      ) VALUES (
        v_item.product_id, 'gudang', -v_kopkar_qty, v_new_stock, 'ship', p_order_id, v_caller_app_id, p_shipping_data ->> 'shippedBy', 'Pengiriman Gudang Kopkar'
      );
    END IF;

    IF v_vendor_qty > 0 THEN
      v_vendor_id := public._resolve_vendor_for_school(v_order.school_user_id, v_item.name);
      IF v_vendor_id IS NOT NULL THEN
        UPDATE public.vendor_stocks
        SET quantity = COALESCE(quantity, 0) - v_vendor_qty, last_updated = now()
        WHERE vendor_id = v_vendor_id AND product_id = v_item.product_id
        RETURNING quantity INTO v_new_stock;

        INSERT INTO public.stock_mutations (
          product_id, vendor_id, mutation_source, delta, balance_after, ref_type, ref_id, actor_user_id, actor_name, notes
        ) VALUES (
          v_item.product_id, v_vendor_id, 'vendor', -v_vendor_qty, v_new_stock, 'ship', p_order_id, v_caller_app_id, p_shipping_data ->> 'shippedBy', 'Pengiriman Dropship Vendor'
        );
      END IF;
    END IF;
  END LOOP;

  v_history_entry := p_shipping_data - 'shippingHistory';
  v_final_shipping := p_shipping_data || jsonb_build_object('shippingHistory', jsonb_build_array(v_history_entry));

  UPDATE public.orders
  SET status = 'shipped',
      shipping_info = v_final_shipping
  WHERE id = p_order_id;

  RETURN jsonb_build_object('success', true, 'shipping_info', v_final_shipping);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- 5C. Kirim Kekurangan (validasi stok Kopkar + Vendor, simpan shippingHistory tanpa menimpa Surat Jalan 1)
CREATE OR REPLACE FUNCTION public.ship_remaining_order_atomic(
  p_order_id text,
  p_additional_shipping_data jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_order RECORD;
  v_new_it jsonb;
  v_order_it RECORD;
  v_kopkar_qty int;
  v_vendor_qty int;
  v_vendor_id uuid;
  v_missing text[] := ARRAY[]::text[];
  v_prod RECORD;
  v_vstock RECORD;
  v_new_stock int;
  v_caller_app_id uuid;
  v_old_shipping jsonb;
  v_merged_items jsonb;
  v_old_it jsonb;
  v_found_idx int;
  v_old_history jsonb;
  v_new_history_entry jsonb;
  v_new_shipping jsonb;
  v_new_receive jsonb;
  v_i int;
BEGIN
  IF NOT public.is_kopkar_or_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Akses ditolak.');
  END IF;

  v_caller_app_id := public.current_app_user_id();

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF v_order.id IS NULL OR v_order.shipping_info IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Pesanan atau riwayat Surat Jalan awal tidak ditemukan.');
  END IF;

  -- Validasi kecukupan stok Kopkar & Vendor untuk item tambahan
  FOR v_new_it IN SELECT * FROM jsonb_array_elements(COALESCE(p_additional_shipping_data -> 'shippedItems', '[]'::jsonb)) LOOP
    v_kopkar_qty := COALESCE((v_new_it ->> 'kopkarQty')::int, 0);
    v_vendor_qty := COALESCE((v_new_it ->> 'vendorQty')::int, 0);
    IF v_kopkar_qty <= 0 AND v_vendor_qty <= 0 THEN
      CONTINUE;
    END IF;

    SELECT * INTO v_order_it
    FROM public.order_items
    WHERE order_id = p_order_id
      AND (
        (NULLIF(trim(v_new_it ->> 'productId'), '') IS NOT NULL AND product_id = trim(v_new_it ->> 'productId'))
        OR (
          lower(trim(COALESCE(name, ''))) = lower(trim(COALESCE(v_new_it ->> 'name', '')))
          AND lower(trim(COALESCE(type, ''))) = lower(trim(COALESCE(v_new_it ->> 'type', '')))
          AND lower(trim(COALESCE(size, ''))) = lower(trim(COALESCE(v_new_it ->> 'size', '')))
        )
      )
    LIMIT 1;

    IF v_order_it.product_id IS NULL THEN
      CONTINUE;
    END IF;

    IF v_kopkar_qty > 0 THEN
      SELECT id, stock INTO v_prod FROM public.products WHERE id = v_order_it.product_id FOR UPDATE;
      IF COALESCE(v_prod.stock, 0) < v_kopkar_qty THEN
        v_missing := array_append(
          v_missing,
          format('• %s%s (Butuh Gudang: %s, Tersedia: %s)', v_order_it.name, CASE WHEN COALESCE(v_order_it.size, '') <> '' THEN ' [' || v_order_it.size || ']' ELSE '' END, v_kopkar_qty, COALESCE(v_prod.stock, 0))
        );
      END IF;
    END IF;

    IF v_vendor_qty > 0 THEN
      v_vendor_id := public._resolve_vendor_for_school(v_order.school_user_id, v_order_it.name);
      IF v_vendor_id IS NULL THEN
        v_missing := array_append(
          v_missing,
          format('• %s%s (Sekolah belum di-plotting ke Vendor)', v_order_it.name, CASE WHEN COALESCE(v_order_it.size, '') <> '' THEN ' [' || v_order_it.size || ']' ELSE '' END)
        );
      ELSE
        SELECT id, quantity INTO v_vstock
        FROM public.vendor_stocks
        WHERE vendor_id = v_vendor_id AND product_id = v_order_it.product_id
        FOR UPDATE;

        IF v_vstock.id IS NULL OR COALESCE(v_vstock.quantity, 0) < v_vendor_qty THEN
          v_missing := array_append(
            v_missing,
            format('• %s%s (Butuh Vendor: %s, Stok Penjahit Tersedia: %s)', v_order_it.name, CASE WHEN COALESCE(v_order_it.size, '') <> '' THEN ' [' || v_order_it.size || ']' ELSE '' END, v_vendor_qty, COALESCE(v_vstock.quantity, 0))
          );
        END IF;
      END IF;
    END IF;
  END LOOP;

  IF array_length(v_missing, 1) > 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error',
      E'Pengiriman susulan tidak dapat dilakukan karena stok tidak mencukupi:\n\n' || array_to_string(v_missing, E'\n')
    );
  END IF;

  -- Potong stok hanya untuk tambahan pengiriman
  FOR v_new_it IN SELECT * FROM jsonb_array_elements(COALESCE(p_additional_shipping_data -> 'shippedItems', '[]'::jsonb)) LOOP
    v_kopkar_qty := COALESCE((v_new_it ->> 'kopkarQty')::int, 0);
    v_vendor_qty := COALESCE((v_new_it ->> 'vendorQty')::int, 0);
    IF v_kopkar_qty <= 0 AND v_vendor_qty <= 0 THEN
      CONTINUE;
    END IF;

    SELECT * INTO v_order_it
    FROM public.order_items
    WHERE order_id = p_order_id
      AND (
        (NULLIF(trim(v_new_it ->> 'productId'), '') IS NOT NULL AND product_id = trim(v_new_it ->> 'productId'))
        OR (
          lower(trim(COALESCE(name, ''))) = lower(trim(COALESCE(v_new_it ->> 'name', '')))
          AND lower(trim(COALESCE(type, ''))) = lower(trim(COALESCE(v_new_it ->> 'type', '')))
          AND lower(trim(COALESCE(size, ''))) = lower(trim(COALESCE(v_new_it ->> 'size', '')))
        )
      )
    LIMIT 1;

    IF v_order_it.product_id IS NULL THEN
      CONTINUE;
    END IF;

    IF v_kopkar_qty > 0 THEN
      UPDATE public.products
      SET stock = COALESCE(stock, 0) - v_kopkar_qty
      WHERE id = v_order_it.product_id
      RETURNING stock INTO v_new_stock;

      INSERT INTO public.stock_mutations (
        product_id, mutation_source, delta, balance_after, ref_type, ref_id, actor_user_id, actor_name, notes
      ) VALUES (
        v_order_it.product_id, 'gudang', -v_kopkar_qty, v_new_stock, 'ship_remaining', p_order_id, v_caller_app_id, p_additional_shipping_data ->> 'shippedBy', 'Pengiriman Susulan Gudang'
      );
    END IF;

    IF v_vendor_qty > 0 THEN
      v_vendor_id := public._resolve_vendor_for_school(v_order.school_user_id, v_order_it.name);
      IF v_vendor_id IS NOT NULL THEN
        UPDATE public.vendor_stocks
        SET quantity = COALESCE(quantity, 0) - v_vendor_qty, last_updated = now()
        WHERE vendor_id = v_vendor_id AND product_id = v_order_it.product_id
        RETURNING quantity INTO v_new_stock;

        INSERT INTO public.stock_mutations (
          product_id, vendor_id, mutation_source, delta, balance_after, ref_type, ref_id, actor_user_id, actor_name, notes
        ) VALUES (
          v_order_it.product_id, v_vendor_id, 'vendor', -v_vendor_qty, v_new_stock, 'ship_remaining', p_order_id, v_caller_app_id, p_additional_shipping_data ->> 'shippedBy', 'Pengiriman Susulan Vendor'
        );
      END IF;
    END IF;
  END LOOP;

  -- Gabungkan shippedItems & pelihara shippingHistory (agar Surat Jalan 1 tetap tersimpan)
  v_old_shipping := v_order.shipping_info;
  v_merged_items := COALESCE(v_old_shipping -> 'shippedItems', '[]'::jsonb);

  FOR v_new_it IN SELECT * FROM jsonb_array_elements(COALESCE(p_additional_shipping_data -> 'shippedItems', '[]'::jsonb)) LOOP
    v_found_idx := NULL;
    FOR v_i IN 0 .. jsonb_array_length(v_merged_items) - 1 LOOP
      v_old_it := v_merged_items -> v_i;
      IF (
        NULLIF(trim(v_new_it ->> 'productId'), '') IS NOT NULL
        AND NULLIF(trim(v_old_it ->> 'productId'), '') IS NOT NULL
        AND trim(v_new_it ->> 'productId') = trim(v_old_it ->> 'productId')
      ) OR (
        lower(trim(COALESCE(v_old_it ->> 'name', ''))) = lower(trim(COALESCE(v_new_it ->> 'name', '')))
        AND lower(trim(COALESCE(v_old_it ->> 'type', ''))) = lower(trim(COALESCE(v_new_it ->> 'type', '')))
        AND lower(trim(COALESCE(v_old_it ->> 'size', ''))) = lower(trim(COALESCE(v_new_it ->> 'size', '')))
      ) THEN
        v_found_idx := v_i;
        EXIT;
      END IF;
    END LOOP;

    IF v_found_idx IS NOT NULL THEN
      v_old_it := v_merged_items -> v_found_idx;
      v_old_it := v_old_it || jsonb_build_object(
        'productId', COALESCE(NULLIF(trim(v_old_it ->> 'productId'), ''), NULLIF(trim(v_new_it ->> 'productId'), '')),
        'shippedQty', COALESCE((v_old_it ->> 'shippedQty')::int, 0) + COALESCE((v_new_it ->> 'shippedQty')::int, 0),
        'kopkarQty', COALESCE((v_old_it ->> 'kopkarQty')::int, 0) + COALESCE((v_new_it ->> 'kopkarQty')::int, 0),
        'vendorQty', COALESCE((v_old_it ->> 'vendorQty')::int, 0) + COALESCE((v_new_it ->> 'vendorQty')::int, 0)
      );
      v_merged_items := jsonb_set(v_merged_items, ARRAY[v_found_idx::text], v_old_it, false);
    ELSE
      v_merged_items := v_merged_items || jsonb_build_array(v_new_it);
    END IF;
  END LOOP;

  v_old_history := COALESCE(
    v_old_shipping -> 'shippingHistory',
    jsonb_build_array(v_old_shipping - 'shippingHistory')
  );
  v_new_history_entry := (p_additional_shipping_data - 'shippingHistory') || jsonb_build_object('isSusulan', true);
  v_old_history := v_old_history || jsonb_build_array(v_new_history_entry);

  v_new_shipping := p_additional_shipping_data || jsonb_build_object(
    'shippedItems', v_merged_items,
    'shippingHistory', v_old_history
  );

  v_new_receive := COALESCE(v_order.receive_info, '{}'::jsonb) || jsonb_build_object(
    'isPartial', false,
    'isSusulan', true
  );

  UPDATE public.orders
  SET shipping_info = v_new_shipping,
      receive_info = v_new_receive
  WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'success', true,
    'shipping_info', v_new_shipping,
    'receive_info', v_new_receive
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- 5D. Batal Kirim (kembalikan stok secara atomic)
CREATE OR REPLACE FUNCTION public.cancel_shipment_atomic(
  p_order_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_order RECORD;
  v_item RECORD;
  v_shipping jsonb;
  v_shipped_it jsonb;
  v_kopkar_qty int;
  v_vendor_qty int;
  v_vendor_id uuid;
  v_new_stock int;
  v_caller_app_id uuid;
BEGIN
  IF NOT public.is_kopkar_or_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Akses ditolak.');
  END IF;

  v_caller_app_id := public.current_app_user_id();

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF v_order.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Pesanan tidak ditemukan.');
  END IF;

  v_shipping := v_order.shipping_info;
  IF v_shipping IS NOT NULL THEN
    FOR v_item IN SELECT * FROM public.order_items WHERE order_id = p_order_id ORDER BY product_id NULLS LAST LOOP
      IF v_item.product_id IS NULL THEN
        CONTINUE;
      END IF;

      SELECT elem INTO v_shipped_it
      FROM jsonb_array_elements(COALESCE(v_shipping -> 'shippedItems', '[]'::jsonb)) elem
      WHERE (
        NULLIF(trim(elem ->> 'productId'), '') IS NOT NULL
        AND trim(elem ->> 'productId') = v_item.product_id
      ) OR (
        lower(trim(COALESCE(elem ->> 'name', ''))) = lower(trim(COALESCE(v_item.name, '')))
        AND lower(trim(COALESCE(elem ->> 'type', ''))) = lower(trim(COALESCE(v_item.type, '')))
        AND lower(trim(COALESCE(elem ->> 'size', ''))) = lower(trim(COALESCE(v_item.size, '')))
      )
      LIMIT 1;

      v_kopkar_qty := COALESCE((v_shipped_it ->> 'kopkarQty')::int, 0);
      v_vendor_qty := COALESCE((v_shipped_it ->> 'vendorQty')::int, 0);

      IF v_kopkar_qty = 0 AND v_vendor_qty = 0 AND COALESCE(v_shipping ->> 'source', '') <> '' THEN
        IF (v_shipping ->> 'source') = 'vendor' THEN
          v_vendor_qty := v_item.quantity;
        ELSE
          v_kopkar_qty := v_item.quantity;
        END IF;
      END IF;

      IF v_kopkar_qty > 0 THEN
        UPDATE public.products
        SET stock = COALESCE(stock, 0) + v_kopkar_qty
        WHERE id = v_item.product_id
        RETURNING stock INTO v_new_stock;

        INSERT INTO public.stock_mutations (
          product_id, mutation_source, delta, balance_after, ref_type, ref_id, actor_user_id, notes
        ) VALUES (
          v_item.product_id, 'gudang', v_kopkar_qty, v_new_stock, 'cancel_ship', p_order_id, v_caller_app_id, 'Batal kirim (revert ke gudang)'
        );
      END IF;

      IF v_vendor_qty > 0 THEN
        v_vendor_id := public._resolve_vendor_for_school(v_order.school_user_id, v_item.name);
        IF v_vendor_id IS NOT NULL THEN
          UPDATE public.vendor_stocks
          SET quantity = COALESCE(quantity, 0) + v_vendor_qty, last_updated = now()
          WHERE vendor_id = v_vendor_id AND product_id = v_item.product_id
          RETURNING quantity INTO v_new_stock;

          IF v_new_stock IS NOT NULL THEN
            INSERT INTO public.stock_mutations (
              product_id, vendor_id, mutation_source, delta, balance_after, ref_type, ref_id, actor_user_id, notes
            ) VALUES (
              v_item.product_id, v_vendor_id, 'vendor', v_vendor_qty, v_new_stock, 'cancel_ship', p_order_id, v_caller_app_id, 'Batal kirim (revert ke vendor)'
            );
          END IF;
        END IF;
      END IF;
    END LOOP;
  END IF;

  UPDATE public.orders
  SET status = 'approved',
      shipping_info = NULL,
      receive_info = NULL
  WHERE id = p_order_id;

  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- 5E. Terima Retur (atomic restock/rusak + tambah return_balance sekolah)
CREATE OR REPLACE FUNCTION public.receive_return_atomic(
  p_return_id text,
  p_accepted_by_name text,
  p_accepted_notes text,
  p_is_restocked boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_ret RECORD;
  v_item jsonb;
  v_prod_id text;
  v_qty int;
  v_prod RECORD;
  v_total_tagihan numeric := 0;
  v_total_fee numeric := 0;
  v_new_stock int;
  v_caller_app_id uuid;
BEGIN
  IF NOT public.is_kopkar_or_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Akses ditolak.');
  END IF;

  v_caller_app_id := public.current_app_user_id();

  SELECT * INTO v_ret FROM public.returns WHERE id = p_return_id FOR UPDATE;
  IF v_ret.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Data retur tidak ditemukan.');
  END IF;

  IF v_ret.status = 'koperasi_diterima' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Retur ini sudah pernah diterima sebelumnya.');
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_ret.items, '[]'::jsonb)) LOOP
    v_prod_id := NULLIF(trim(v_item ->> 'productId'), '');
    v_qty := COALESCE((v_item ->> 'quantity')::int, 0);
    IF v_prod_id IS NULL OR v_qty <= 0 THEN
      CONTINUE;
    END IF;

    SELECT id, stock, stock_rusak, price_student, fee_school
    INTO v_prod
    FROM public.products
    WHERE id = v_prod_id
    FOR UPDATE;

    IF v_prod.id IS NOT NULL THEN
      v_total_tagihan := v_total_tagihan + COALESCE(v_prod.price_student, 0) * v_qty;
      v_total_fee := v_total_fee + COALESCE(v_prod.fee_school, 0) * v_qty;

      IF p_is_restocked THEN
        UPDATE public.products
        SET stock = COALESCE(stock, 0) + v_qty
        WHERE id = v_prod_id
        RETURNING stock INTO v_new_stock;

        INSERT INTO public.stock_mutations (
          product_id, mutation_source, delta, balance_after, ref_type, ref_id, actor_user_id, actor_name, notes
        ) VALUES (
          v_prod_id, 'gudang', v_qty, v_new_stock, 'return_restock', p_return_id, v_caller_app_id, p_accepted_by_name, 'Restock barang retur'
        );
      ELSIF v_ret.reason_category = 'Rusak' THEN
        UPDATE public.products
        SET stock_rusak = COALESCE(stock_rusak, 0) + v_qty
        WHERE id = v_prod_id
        RETURNING stock_rusak INTO v_new_stock;

        INSERT INTO public.stock_mutations (
          product_id, mutation_source, delta, balance_after, ref_type, ref_id, actor_user_id, actor_name, notes
        ) VALUES (
          v_prod_id, 'rusak', v_qty, v_new_stock, 'return_rusak', p_return_id, v_caller_app_id, p_accepted_by_name, 'Catat stok rusak dari retur'
        );
      END IF;
    END IF;
  END LOOP;

  IF v_total_tagihan > 0 OR v_total_fee > 0 THEN
    UPDATE public.app_users
    SET return_balance_tagihan = COALESCE(return_balance_tagihan, 0) + v_total_tagihan,
        return_balance_fee = COALESCE(return_balance_fee, 0) + v_total_fee
    WHERE lower(id::text) = lower(trim(COALESCE(v_ret.school_user_id::text, '')));
  END IF;

  UPDATE public.returns
  SET status = 'koperasi_diterima',
      koperasi_diterima_at = now(),
      koperasi_diterima_by_name = p_accepted_by_name,
      koperasi_diterima_notes = p_accepted_notes,
      is_restocked = COALESCE(p_is_restocked, false)
  WHERE id = p_return_id;

  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- 5F. Penyesuaian Stok Gudang Manual / Restock (atomic + stock_mutations)
CREATE OR REPLACE FUNCTION public.adjust_product_stock_atomic(
  p_product_id text,
  p_delta integer,
  p_ref_type text DEFAULT 'manual',
  p_notes text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_prod RECORD;
  v_new_stock int;
  v_caller_app_id uuid;
BEGIN
  IF NOT public.is_kopkar_or_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Akses ditolak.');
  END IF;

  v_caller_app_id := public.current_app_user_id();

  SELECT id, stock INTO v_prod FROM public.products WHERE id = p_product_id FOR UPDATE;
  IF v_prod.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Produk tidak ditemukan.');
  END IF;

  v_new_stock := GREATEST(0, COALESCE(v_prod.stock, 0) + p_delta);

  UPDATE public.products
  SET stock = v_new_stock
  WHERE id = p_product_id;

  INSERT INTO public.stock_mutations (
    product_id, mutation_source, delta, balance_after, ref_type, actor_user_id, notes
  ) VALUES (
    p_product_id, 'gudang', v_new_stock - COALESCE(v_prod.stock, 0), v_new_stock, COALESCE(NULLIF(trim(p_ref_type), ''), 'manual'), v_caller_app_id, p_notes
  );

  RETURN jsonb_build_object('success', true, 'new_stock', v_new_stock);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- 5G. Konfirmasi Penerimaan Barang Sekolah + Rekam Hutang Vendor secara atomic
CREATE OR REPLACE FUNCTION public.receive_order_atomic(
  p_order_id text,
  p_receive_info jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_order RECORD;
  v_item RECORD;
  v_shipped_it jsonb;
  v_shipping jsonb;
  v_vendor_qty int;
  v_total_vendor_hpp numeric := 0;
  v_vendor_name text := 'Unknown Vendor';
  v_supplier text;
  v_caller_app_id uuid;
  v_role text;
BEGIN
  v_caller_app_id := public.current_app_user_id();
  v_role := public.current_app_role();

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF v_order.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Pesanan tidak ditemukan.');
  END IF;

  IF NOT (
    public.is_kopkar_or_admin()
    OR (v_role IN ('sekolah', 'guru_ots') AND v_order.school_user_id = v_caller_app_id)
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Akses ditolak untuk mengonfirmasi penerimaan pesanan ini.');
  END IF;

  IF v_order.status = 'received' THEN
    RETURN jsonb_build_object('success', true);
  END IF;

  IF v_order.status <> 'shipped' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Pesanan belum berstatus dikirim.');
  END IF;

  UPDATE public.orders
  SET status = 'received',
      receive_info = p_receive_info
  WHERE id = p_order_id;

  v_shipping := v_order.shipping_info;
  IF v_shipping IS NOT NULL THEN
    FOR v_item IN SELECT * FROM public.order_items WHERE order_id = p_order_id LOOP
      IF v_item.product_id IS NULL THEN
        CONTINUE;
      END IF;

      SELECT elem INTO v_shipped_it
      FROM jsonb_array_elements(COALESCE(v_shipping -> 'shippedItems', '[]'::jsonb)) elem
      WHERE (
        NULLIF(trim(elem ->> 'productId'), '') IS NOT NULL
        AND trim(elem ->> 'productId') = v_item.product_id
      ) OR (
        lower(trim(COALESCE(elem ->> 'name', ''))) = lower(trim(COALESCE(v_item.name, '')))
        AND lower(trim(COALESCE(elem ->> 'type', ''))) = lower(trim(COALESCE(v_item.type, '')))
        AND lower(trim(COALESCE(elem ->> 'size', ''))) = lower(trim(COALESCE(v_item.size, '')))
      )
      LIMIT 1;

      IF v_shipped_it IS NOT NULL THEN
        v_vendor_qty := COALESCE((v_shipped_it ->> 'vendorQty')::int, 0);
      ELSIF COALESCE(v_shipping ->> 'source', '') = 'vendor' THEN
        v_vendor_qty := v_item.quantity;
      ELSE
        v_vendor_qty := 0;
      END IF;

      IF v_vendor_qty > 0 THEN
        v_total_vendor_hpp := v_total_vendor_hpp + (COALESCE(v_item.price_kopkar, 0) * v_vendor_qty);
        SELECT supplier_name INTO v_supplier FROM public.products WHERE id = v_item.product_id;
        IF v_supplier IS NOT NULL AND trim(v_supplier) <> '' THEN
          v_vendor_name := v_supplier;
        END IF;
      END IF;
    END LOOP;

    IF v_total_vendor_hpp > 0 AND NOT EXISTS (SELECT 1 FROM public.vendor_payables WHERE order_id = p_order_id) THEN
      INSERT INTO public.vendor_payables (
        vendor_name, order_id, school_name, total_amount, status
      ) VALUES (
        v_vendor_name, p_order_id, v_order.school_name, v_total_vendor_hpp, 'pending'
      );
    END IF;
  END IF;

  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public._resolve_vendor_for_school(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_ots_order_atomic(uuid, text, text, text, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ship_order_atomic(text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ship_remaining_order_atomic(text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_shipment_atomic(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.receive_return_atomic(text, text, text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.adjust_product_stock_atomic(text, integer, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.receive_order_atomic(text, jsonb) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_ots_order_atomic(uuid, text, text, text, text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ship_order_atomic(text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ship_remaining_order_atomic(text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_shipment_atomic(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.receive_return_atomic(text, text, text, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.adjust_product_stock_atomic(text, integer, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.receive_order_atomic(text, jsonb) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- BAGIAN 6: TRIGGER PENJAGA KOLOM FINANSIAL & STATUS WORKFLOW (SEKOLAH / GURU)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_order_update_by_school()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
BEGIN
  IF public.is_kopkar_or_admin() THEN
    RETURN NEW;
  END IF;

  -- Akun non-kopkar/admin (misal sekolah) hanya boleh mengonfirmasi penerimaan barang,
  -- mengajukan pembatalan, atau mengunggah catatan bukti transfer
  IF NEW.school_user_id IS DISTINCT FROM OLD.school_user_id
     OR NEW.total_price_kopkar IS DISTINCT FROM OLD.total_price_kopkar
     OR NEW.total_fee_school IS DISTINCT FROM OLD.total_fee_school
     OR NEW.total_price_student IS DISTINCT FROM OLD.total_price_student
     OR NEW.payment_status IS DISTINCT FROM OLD.payment_status
     OR NEW.paid_at IS DISTINCT FROM OLD.paid_at
     OR NEW.fee_status IS DISTINCT FROM OLD.fee_status
     OR NEW.fee_disbursed_at IS DISTINCT FROM OLD.fee_disbursed_at
     OR NEW.fee_disbursed_by IS DISTINCT FROM OLD.fee_disbursed_by
     OR NEW.fee_disbursed_notes IS DISTINCT FROM OLD.fee_disbursed_notes
     OR NEW.processed_by IS DISTINCT FROM OLD.processed_by
     OR NEW.processed_at IS DISTINCT FROM OLD.processed_at
     OR NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason
     OR NEW.shipping_info IS DISTINCT FROM OLD.shipping_info
  THEN
    RAISE EXCEPTION 'Akses ditolak: Sekolah tidak diperbolehkan mengubah nominal finansial, pelunasan, atau data pengiriman.';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (
      (OLD.status = 'shipped' AND NEW.status = 'received')
      OR (OLD.status IN ('pending', 'approved') AND NEW.status = 'cancellation_requested')
    ) THEN
      RAISE EXCEPTION 'Akses ditolak: Transisi status pesanan tidak diizinkan untuk role Sekolah.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_order_update ON public.orders;
CREATE TRIGGER trg_guard_order_update
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_order_update_by_school();

CREATE OR REPLACE FUNCTION public.guard_return_update_by_school()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
BEGIN
  IF public.is_kopkar_or_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.school_user_id IS DISTINCT FROM OLD.school_user_id
     OR NEW.items IS DISTINCT FROM OLD.items
     OR NEW.confirmed_at IS DISTINCT FROM OLD.confirmed_at
     OR NEW.confirmed_by_name IS DISTINCT FROM OLD.confirmed_by_name
     OR NEW.koperasi_diterima_at IS DISTINCT FROM OLD.koperasi_diterima_at
     OR NEW.koperasi_diterima_by_name IS DISTINCT FROM OLD.koperasi_diterima_by_name
     OR NEW.koperasi_diterima_notes IS DISTINCT FROM OLD.koperasi_diterima_notes
     OR NEW.is_restocked IS DISTINCT FROM OLD.is_restocked
     OR NEW.rejected_at IS DISTINCT FROM OLD.rejected_at
     OR NEW.rejected_by_name IS DISTINCT FROM OLD.rejected_by_name
     OR NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason
  THEN
    RAISE EXCEPTION 'Akses ditolak: Sekolah tidak dapat mengubah hasil verifikasi Koperasi.';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (OLD.status = 'koperasi_confirmed' AND NEW.status = 'sekolah_dikirim') THEN
      RAISE EXCEPTION 'Akses ditolak: Transisi status retur tidak diizinkan untuk role Sekolah.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_return_update ON public.returns;
CREATE TRIGGER trg_guard_return_update
  BEFORE UPDATE ON public.returns
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_return_update_by_school();

-- ----------------------------------------------------------------------------
-- BAGIAN 7: AKTIFKAN & KETATKAN ROW LEVEL SECURITY (RLS) PER ROLE & PEMILIK
-- ----------------------------------------------------------------------------

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
ALTER TABLE public.stock_mutations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parent_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parent_order_items ENABLE ROW LEVEL SECURITY;

-- Hapus seluruh policy longgar lama (termasuk anon & USING (true))
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'app_users', 'school_whitelist', 'products', 'orders', 'order_items',
        'returns', 'notifications', 'app_settings', 'vendors',
        'vendor_school_assignments', 'vendor_stocks', 'vendor_payables',
        'kalkulator_size_charts', 'stock_mutations', 'parent_orders', 'parent_order_items'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', pol.policyname, pol.schemaname, pol.tablename);
  END LOOP;
END $$;

-- 1) app_users
CREATE POLICY "app_users_select_strict"
  ON public.app_users FOR SELECT TO authenticated
  USING (
    public.is_internal_staff()
    OR id = public.current_app_user_id()
    OR auth_user_id = auth.uid()
    OR lower(trim(username)) = lower(trim(COALESCE(auth.jwt() ->> 'email', '')))
  );

CREATE POLICY "app_users_insert_admin_kopkar_or_google_school"
  ON public.app_users FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    OR (public.is_kopkar_or_admin() AND role = 'sekolah')
    OR (
      role = 'sekolah'
      AND COALESCE(auth.jwt() ->> 'email', '') <> ''
      AND lower(trim(username)) = lower(trim(auth.jwt() ->> 'email'))
      AND (auth_user_id IS NULL OR auth_user_id = auth.uid())
      AND EXISTS (
        SELECT 1 FROM public.school_whitelist sw
        WHERE lower(trim(sw.email)) = lower(trim(auth.jwt() ->> 'email'))
      )
    )
  );

CREATE POLICY "app_users_update_strict"
  ON public.app_users FOR UPDATE TO authenticated
  USING (
    public.is_admin()
    OR (public.is_kopkar_or_admin() AND role IN ('sekolah', 'guru_ots'))
    OR (
      role = 'sekolah'
      AND (
        id = public.current_app_user_id()
        OR auth_user_id = auth.uid()
        OR lower(trim(username)) = lower(trim(COALESCE(auth.jwt() ->> 'email', '')))
      )
    )
  )
  WITH CHECK (
    public.is_admin()
    OR (public.is_kopkar_or_admin() AND role IN ('sekolah', 'guru_ots'))
    OR (
      role = 'sekolah'
      AND (auth_user_id IS NULL OR auth_user_id = auth.uid())
    )
  );

CREATE POLICY "app_users_delete_admin_only"
  ON public.app_users FOR DELETE TO authenticated
  USING (public.is_admin());

-- 2) school_whitelist (ANON DITUTUP TOTAL; Google login cek setelah authenticated)
CREATE POLICY "school_whitelist_select_auth"
  ON public.school_whitelist FOR SELECT TO authenticated
  USING (
    public.is_internal_staff()
    OR lower(trim(email)) = lower(trim(COALESCE(auth.jwt() ->> 'email', '')))
  );

CREATE POLICY "school_whitelist_write_admin_only"
  ON public.school_whitelist FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 3) products
CREATE POLICY "products_select_authenticated"
  ON public.products FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "products_insert_kopkar_admin"
  ON public.products FOR INSERT TO authenticated
  WITH CHECK (public.is_kopkar_or_admin());

CREATE POLICY "products_update_kopkar_admin"
  ON public.products FOR UPDATE TO authenticated
  USING (public.is_kopkar_or_admin())
  WITH CHECK (public.is_kopkar_or_admin());

CREATE POLICY "products_delete_kopkar_admin"
  ON public.products FOR DELETE TO authenticated
  USING (public.is_kopkar_or_admin());

-- 4) orders
CREATE POLICY "orders_select_role_or_owner"
  ON public.orders FOR SELECT TO authenticated
  USING (
    public.is_internal_staff()
    OR school_user_id = public.current_app_user_id()
  );

CREATE POLICY "orders_insert_role_or_owner"
  ON public.orders FOR INSERT TO authenticated
  WITH CHECK (
    public.is_kopkar_or_admin()
    OR (
      public.current_app_role() = 'sekolah'
      AND school_user_id = public.current_app_user_id()
      AND status = 'pending'
      AND payment_status = 'unpaid'
      AND fee_status = 'locked'
    )
    OR (
      public.current_app_role() = 'guru_ots'
      AND school_user_id = public.current_app_user_id()
      AND payment_status = 'unpaid'
    )
  );

CREATE POLICY "orders_update_role_or_owner"
  ON public.orders FOR UPDATE TO authenticated
  USING (
    public.is_kopkar_or_admin()
    OR (
      public.current_app_role() IN ('sekolah', 'guru_ots')
      AND school_user_id = public.current_app_user_id()
    )
  )
  WITH CHECK (
    public.is_kopkar_or_admin()
    OR (
      public.current_app_role() IN ('sekolah', 'guru_ots')
      AND school_user_id = public.current_app_user_id()
    )
  );

CREATE POLICY "orders_delete_admin_only"
  ON public.orders FOR DELETE TO authenticated
  USING (public.is_admin());

-- 5) order_items
CREATE POLICY "order_items_select_via_order"
  ON public.order_items FOR SELECT TO authenticated
  USING (
    public.is_internal_staff()
    OR EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_id AND o.school_user_id = public.current_app_user_id()
    )
  );

CREATE POLICY "order_items_insert_via_order"
  ON public.order_items FOR INSERT TO authenticated
  WITH CHECK (
    public.is_kopkar_or_admin()
    OR EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_id AND o.school_user_id = public.current_app_user_id()
    )
  );

CREATE POLICY "order_items_update_kopkar_admin"
  ON public.order_items FOR UPDATE TO authenticated
  USING (public.is_kopkar_or_admin())
  WITH CHECK (public.is_kopkar_or_admin());

CREATE POLICY "order_items_delete_admin_only"
  ON public.order_items FOR DELETE TO authenticated
  USING (public.is_admin());

-- 6) returns (returns.school_user_id bertipe text di skema lama, jadi cast ::text di kedua sisi)
CREATE POLICY "returns_select_role_or_owner"
  ON public.returns FOR SELECT TO authenticated
  USING (
    public.is_internal_staff()
    OR school_user_id::text = public.current_app_user_id()::text
  );

CREATE POLICY "returns_insert_role_or_owner"
  ON public.returns FOR INSERT TO authenticated
  WITH CHECK (
    public.is_kopkar_or_admin()
    OR (
      public.current_app_role() IN ('sekolah', 'guru_ots')
      AND school_user_id::text = public.current_app_user_id()::text
      AND status = 'pending'
    )
  );

CREATE POLICY "returns_update_role_or_owner"
  ON public.returns FOR UPDATE TO authenticated
  USING (
    public.is_kopkar_or_admin()
    OR (
      public.current_app_role() = 'sekolah'
      AND school_user_id::text = public.current_app_user_id()::text
    )
  )
  WITH CHECK (
    public.is_kopkar_or_admin()
    OR (
      public.current_app_role() = 'sekolah'
      AND school_user_id::text = public.current_app_user_id()::text
    )
  );

CREATE POLICY "returns_delete_admin_only"
  ON public.returns FOR DELETE TO authenticated
  USING (public.is_admin());

-- 7) notifications
CREATE POLICY "notifications_select_authenticated"
  ON public.notifications FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "notifications_write_kopkar_admin"
  ON public.notifications FOR ALL TO authenticated
  USING (public.is_kopkar_or_admin())
  WITH CHECK (public.is_kopkar_or_admin());

-- 8) app_settings
CREATE POLICY "app_settings_select_authenticated"
  ON public.app_settings FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "app_settings_write_kopkar_admin"
  ON public.app_settings FOR ALL TO authenticated
  USING (public.is_kopkar_or_admin())
  WITH CHECK (public.is_kopkar_or_admin());

-- 9) Modul Vendor & Produksi (Internal staff lihat; HANYA Kopkar/Admin ubah — Pengurus Read-Only)
CREATE POLICY "vendors_select_internal"
  ON public.vendors FOR SELECT TO authenticated
  USING (public.is_internal_staff());

CREATE POLICY "vendors_write_kopkar_admin"
  ON public.vendors FOR ALL TO authenticated
  USING (public.is_kopkar_or_admin())
  WITH CHECK (public.is_kopkar_or_admin());

CREATE POLICY "vendor_assignments_select_internal"
  ON public.vendor_school_assignments FOR SELECT TO authenticated
  USING (public.is_internal_staff());

CREATE POLICY "vendor_assignments_write_kopkar_admin"
  ON public.vendor_school_assignments FOR ALL TO authenticated
  USING (public.is_kopkar_or_admin())
  WITH CHECK (public.is_kopkar_or_admin());

CREATE POLICY "vendor_stocks_select_internal"
  ON public.vendor_stocks FOR SELECT TO authenticated
  USING (public.is_internal_staff());

CREATE POLICY "vendor_stocks_write_kopkar_admin"
  ON public.vendor_stocks FOR ALL TO authenticated
  USING (public.is_kopkar_or_admin())
  WITH CHECK (public.is_kopkar_or_admin());

CREATE POLICY "vendor_payables_select_internal"
  ON public.vendor_payables FOR SELECT TO authenticated
  USING (public.is_internal_staff());

CREATE POLICY "vendor_payables_write_kopkar_admin"
  ON public.vendor_payables FOR ALL TO authenticated
  USING (public.is_kopkar_or_admin())
  WITH CHECK (public.is_kopkar_or_admin());

CREATE POLICY "kalkulator_size_charts_select_internal"
  ON public.kalkulator_size_charts FOR SELECT TO authenticated
  USING (public.is_internal_staff());

CREATE POLICY "kalkulator_size_charts_write_kopkar_admin"
  ON public.kalkulator_size_charts FOR ALL TO authenticated
  USING (public.is_kopkar_or_admin())
  WITH CHECK (public.is_kopkar_or_admin());

-- 10) stock_mutations ledger
CREATE POLICY "stock_mutations_select_internal"
  ON public.stock_mutations FOR SELECT TO authenticated
  USING (public.is_internal_staff());

CREATE POLICY "stock_mutations_insert_kopkar_admin"
  ON public.stock_mutations FOR INSERT TO authenticated
  WITH CHECK (public.is_kopkar_or_admin());

-- 11) parent_orders & parent_order_items (Kanvas PENABUR -> Sekolah)
CREATE POLICY "parent_orders_select_strict"
  ON public.parent_orders FOR SELECT TO authenticated
  USING (
    public.is_internal_staff()
    OR school_user_id = public.current_app_user_id()
    OR parent_auth_user_id = auth.uid()
  );

CREATE POLICY "parent_orders_insert_auth"
  ON public.parent_orders FOR INSERT TO authenticated
  WITH CHECK (
    public.is_kopkar_or_admin()
    OR parent_auth_user_id = auth.uid()
    OR (public.current_app_role() = 'sekolah' AND school_user_id = public.current_app_user_id())
  );

CREATE POLICY "parent_orders_update_kopkar_admin_or_school"
  ON public.parent_orders FOR UPDATE TO authenticated
  USING (
    public.is_kopkar_or_admin()
    OR (public.current_app_role() = 'sekolah' AND school_user_id = public.current_app_user_id())
  )
  WITH CHECK (
    public.is_kopkar_or_admin()
    OR (public.current_app_role() = 'sekolah' AND school_user_id = public.current_app_user_id())
  );

CREATE POLICY "parent_orders_delete_admin_only"
  ON public.parent_orders FOR DELETE TO authenticated
  USING (public.is_admin());

CREATE POLICY "parent_order_items_select_via_order"
  ON public.parent_order_items FOR SELECT TO authenticated
  USING (
    public.is_internal_staff()
    OR EXISTS (
      SELECT 1 FROM public.parent_orders po
      WHERE po.id = parent_order_id
        AND (po.school_user_id = public.current_app_user_id() OR po.parent_auth_user_id = auth.uid())
    )
  );

CREATE POLICY "parent_order_items_insert_via_order"
  ON public.parent_order_items FOR INSERT TO authenticated
  WITH CHECK (
    public.is_kopkar_or_admin()
    OR EXISTS (
      SELECT 1 FROM public.parent_orders po
      WHERE po.id = parent_order_id
        AND (po.school_user_id = public.current_app_user_id() OR po.parent_auth_user_id = auth.uid())
    )
  );

CREATE POLICY "parent_order_items_update_kopkar_admin"
  ON public.parent_order_items FOR UPDATE TO authenticated
  USING (public.is_kopkar_or_admin())
  WITH CHECK (public.is_kopkar_or_admin());

CREATE POLICY "parent_order_items_delete_admin_only"
  ON public.parent_order_items FOR DELETE TO authenticated
  USING (public.is_admin());

-- 12) Storage policies untuk bucket product-images
DROP POLICY IF EXISTS "product_images_public_select" ON storage.objects;
DROP POLICY IF EXISTS "product_images_kopkar_admin_insert" ON storage.objects;
DROP POLICY IF EXISTS "product_images_kopkar_admin_update" ON storage.objects;
DROP POLICY IF EXISTS "product_images_kopkar_admin_delete" ON storage.objects;

CREATE POLICY "product_images_public_select"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'product-images');

CREATE POLICY "product_images_kopkar_admin_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'product-images' AND public.is_kopkar_or_admin());

CREATE POLICY "product_images_kopkar_admin_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'product-images' AND public.is_kopkar_or_admin())
  WITH CHECK (bucket_id = 'product-images' AND public.is_kopkar_or_admin());

CREATE POLICY "product_images_kopkar_admin_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'product-images' AND public.is_kopkar_or_admin());
