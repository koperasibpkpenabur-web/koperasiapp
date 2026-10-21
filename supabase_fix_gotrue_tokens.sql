-- ============================================================================
-- SCRIPT PERBAIKAN CEPAT SUPABASE AUTH
-- ============================================================================
-- Jalankan query ini di Supabase SQL Editor untuk memperbaiki
-- error internal GoTrue "Database error querying schema":
-- ============================================================================

-- 1. Update kolom token string agar tidak bernilai NULL (Go scanner requirement)
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
  is_anonymous = COALESCE(is_anonymous, false)
WHERE email LIKE '%@koperasi.local';

-- 2. Update fungsi admin_create_user agar user baru langsung terisi string kosong
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
SET search_path = public, auth, extensions
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

  -- 1. Insert ke auth.users lengkap dengan string non-null
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
    jsonb_build_object('name', p_name, 'role', p_role, 'username', v_raw_username),
    now(),
    now(),
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    false,
    false
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
