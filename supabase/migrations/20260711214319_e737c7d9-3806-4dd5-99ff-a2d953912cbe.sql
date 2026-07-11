
DROP POLICY IF EXISTS "Sellers view admin products" ON public.products;
DROP POLICY IF EXISTS "Staff view admin products" ON public.products;
CREATE POLICY "Staff view admin products" ON public.products
  FOR SELECT TO authenticated
  USING (
    has_role(user_id, 'admin'::app_role)
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'seller'::app_role)
      OR has_role(auth.uid(), 'accountant'::app_role)
      OR has_role(auth.uid(), 'warehouse'::app_role)
    )
  );

DROP POLICY IF EXISTS "Sellers view admin customers" ON public.customers;
DROP POLICY IF EXISTS "Staff view admin customers" ON public.customers;
CREATE POLICY "Staff view admin customers" ON public.customers
  FOR SELECT TO authenticated
  USING (
    has_role(user_id, 'admin'::app_role)
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'seller'::app_role)
      OR has_role(auth.uid(), 'accountant'::app_role)
    )
  );

DROP POLICY IF EXISTS "Sellers view admin payment_methods" ON public.payment_methods;
DROP POLICY IF EXISTS "Staff view admin payment_methods" ON public.payment_methods;
CREATE POLICY "Staff view admin payment_methods" ON public.payment_methods
  FOR SELECT TO authenticated
  USING (
    has_role(user_id, 'admin'::app_role)
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'seller'::app_role)
      OR has_role(auth.uid(), 'accountant'::app_role)
    )
  );

-- Lock down SECURITY DEFINER functions exposed via API
REVOKE ALL ON FUNCTION public.restore_stock_on_return_accepted() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_low_stock() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.decrement_product_stock() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assign_invoice_number() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.log_product_price_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assign_purchase_number() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_admin_on_cashier_invoice() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_admin_on_invoice_cancel() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.increment_stock_on_purchase() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.__test_count_null_auth_tokens() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.__test_delete_auth_user(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.__test_create_auth_user(text, text, boolean, boolean) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.admin_list_users() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated;

REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
