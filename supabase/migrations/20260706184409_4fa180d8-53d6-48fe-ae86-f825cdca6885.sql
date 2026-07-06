-- Revoke EXECUTE from public/anon/authenticated on SECURITY DEFINER functions
-- that are only invoked by triggers or internal test harness (not user-callable).

REVOKE EXECUTE ON FUNCTION public.restore_stock_on_return_accepted() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_low_stock() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.decrement_product_stock() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.assign_invoice_number() FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.__test_count_null_auth_tokens() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.__test_delete_auth_user(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.__test_create_auth_user(text, text, boolean, boolean) FROM PUBLIC, anon, authenticated;

-- has_role: used inside RLS policies (runs as SECURITY DEFINER within policy context);
-- revoke from anon and PUBLIC. Keep for authenticated so app code can check its own role.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;

-- admin_list_users: gated internally by has_role('admin'); keep execute only for authenticated.
REVOKE EXECUTE ON FUNCTION public.admin_list_users() FROM PUBLIC, anon;