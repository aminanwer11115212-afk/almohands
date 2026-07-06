
DO $$
DECLARE
  new_id uuid := gen_random_uuid();
  existing_id uuid;
BEGIN
  SELECT id INTO existing_id FROM auth.users WHERE email = 'amin123456@gmail.com';
  IF existing_id IS NULL THEN
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
      'amin123456@gmail.com',
      extensions.crypt('aminaminamin', extensions.gen_salt('bf')),
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Admin"}'::jsonb,
      '', '', '', '', '', '', '', ''
    );
    existing_id := new_id;
  ELSE
    UPDATE auth.users
      SET encrypted_password = extensions.crypt('aminaminamin', extensions.gen_salt('bf')),
          email_confirmed_at = COALESCE(email_confirmed_at, now()),
          updated_at = now()
      WHERE id = existing_id;
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (existing_id, 'admin'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;
END $$;
