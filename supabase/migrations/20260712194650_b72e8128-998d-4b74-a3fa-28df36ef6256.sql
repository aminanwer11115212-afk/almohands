REVOKE EXECUTE ON FUNCTION public.__test_create_auth_user(text, text, boolean, boolean) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.__test_delete_auth_user(text) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.__test_count_null_auth_tokens() FROM anon, authenticated, PUBLIC;