-- Test-only helpers for auth login regression tests.
-- Both functions strictly refuse any email that does not match the
-- regression-test pattern, so they cannot be used to touch real users
-- even though they run with elevated privileges.

CREATE OR REPLACE FUNCTION public.__test_create_auth_user(
  p_email text,
  p_password text,
  p_confirm boolean,
  p_null_tokens boolean
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_id uuid := gen_random_uuid();
BEGIN
  IF p_email IS NULL OR p_email !~ '^test-login-[a-z0-9-]+@regression\.test$' THEN
    RAISE EXCEPTION 'refusing to create user outside regression-test namespace';
  END IF;

  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, email_change, email_change_token_new,
    email_change_token_current, recovery_token,
    phone_change, phone_change_token, reauthentication_token
  ) VALUES (
    new_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    p_email,
    crypt(p_password, gen_salt('bf')),
    CASE WHEN p_confirm THEN now() ELSE NULL END,
    now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    '', '', '', '', '', '', '', ''
  );

  IF p_null_tokens THEN
    UPDATE auth.users
       SET confirmation_token = NULL,
           email_change = NULL,
           email_change_token_new = NULL,
           email_change_token_current = NULL,
           recovery_token = NULL,
           phone_change = NULL,
           phone_change_token = NULL,
           reauthentication_token = NULL
     WHERE id = new_id;
  END IF;

  RETURN new_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.__test_delete_auth_user(p_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_email IS NULL OR p_email !~ '^test-login-[a-z0-9-]+@regression\.test$' THEN
    RAISE EXCEPTION 'refusing to delete user outside regression-test namespace';
  END IF;
  DELETE FROM auth.users WHERE email = p_email;
END;
$$;

CREATE OR REPLACE FUNCTION public.__test_count_null_auth_tokens()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::int FROM auth.users
   WHERE confirmation_token IS NULL
      OR email_change IS NULL
      OR email_change_token_new IS NULL
      OR email_change_token_current IS NULL
      OR recovery_token IS NULL
      OR phone_change IS NULL
      OR phone_change_token IS NULL
      OR reauthentication_token IS NULL;
$$;

REVOKE ALL ON FUNCTION public.__test_create_auth_user(text, text, boolean, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.__test_delete_auth_user(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.__test_count_null_auth_tokens() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.__test_create_auth_user(text, text, boolean, boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.__test_delete_auth_user(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.__test_count_null_auth_tokens() TO anon, authenticated;