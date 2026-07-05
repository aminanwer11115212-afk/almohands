CREATE OR REPLACE FUNCTION public.__test_create_auth_user(
  p_email text,
  p_password text,
  p_confirm boolean,
  p_null_tokens boolean
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
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
    extensions.crypt(p_password, extensions.gen_salt('bf')),
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