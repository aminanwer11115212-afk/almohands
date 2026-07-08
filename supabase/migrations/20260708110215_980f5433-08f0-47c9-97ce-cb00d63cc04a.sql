
REVOKE EXECUTE ON FUNCTION public.__test_count_null_auth_tokens() FROM PUBLIC, authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.__test_delete_auth_user(text) FROM PUBLIC, authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.__test_create_auth_user(text, text, boolean, boolean) FROM PUBLIC, authenticated, anon;
