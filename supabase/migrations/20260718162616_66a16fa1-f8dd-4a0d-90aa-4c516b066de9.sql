
REVOKE EXECUTE ON FUNCTION public.recompute_invoice_totals(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_payments_recompute_invoice() FROM PUBLIC, anon, authenticated;
