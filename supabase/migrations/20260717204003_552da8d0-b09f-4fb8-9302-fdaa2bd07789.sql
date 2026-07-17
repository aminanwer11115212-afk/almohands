-- The trigger runs SECURITY DEFINER and bypasses RLS, so clients never need INSERT rights.
DROP POLICY IF EXISTS "History insert by authenticated" ON public.special_order_history;
REVOKE INSERT ON public.special_order_history FROM authenticated;

-- Hide the trigger helpers from the public API surface.
REVOKE EXECUTE ON FUNCTION public.log_special_order_status_change() FROM PUBLIC, authenticated, anon;
