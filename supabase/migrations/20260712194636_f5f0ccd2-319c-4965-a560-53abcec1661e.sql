GRANT EXECUTE ON FUNCTION public.__test_create_auth_user(text, text, boolean, boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.__test_delete_auth_user(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.__test_count_null_auth_tokens() TO anon, authenticated;