
-- 1) Auto-recompute invoice paid/remaining/status on payments changes
CREATE OR REPLACE FUNCTION public.recompute_invoice_totals(_invoice_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv_total numeric;
  inv_status text;
  sum_paid numeric;
BEGIN
  IF _invoice_id IS NULL THEN RETURN; END IF;
  SELECT total, status INTO inv_total, inv_status FROM public.invoices WHERE id = _invoice_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT COALESCE(SUM(amount),0) INTO sum_paid FROM public.payments WHERE invoice_id = _invoice_id;

  UPDATE public.invoices
     SET paid = sum_paid,
         remaining = GREATEST(inv_total - sum_paid, 0),
         status = CASE
           WHEN inv_status = 'cancelled' THEN 'cancelled'
           WHEN sum_paid >= inv_total AND inv_total > 0 THEN 'paid'
           WHEN sum_paid > 0 THEN 'partial'
           ELSE 'pending'
         END
   WHERE id = _invoice_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_payments_recompute_invoice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recompute_invoice_totals(OLD.invoice_id);
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.invoice_id IS DISTINCT FROM NEW.invoice_id THEN
      PERFORM public.recompute_invoice_totals(OLD.invoice_id);
    END IF;
    PERFORM public.recompute_invoice_totals(NEW.invoice_id);
    RETURN NEW;
  ELSE
    PERFORM public.recompute_invoice_totals(NEW.invoice_id);
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_payments_recompute_invoice ON public.payments;
CREATE TRIGGER trg_payments_recompute_invoice
AFTER INSERT OR UPDATE OR DELETE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.tg_payments_recompute_invoice();

-- 2) Reconcile the two mismatched invoices by inserting legacy adjustment payments
-- Invoice #9 diff = 6000, Invoice #32 diff = 3445500
INSERT INTO public.payments (user_id, party_type, party_id, amount, method, invoice_id, account_id, notes)
SELECT i.user_id, 'customer', i.customer_id, (i.paid - COALESCE((SELECT SUM(amount) FROM public.payments WHERE invoice_id = i.id),0)),
       'bank', i.id, 'dc18c0ca-d3c9-462f-818d-0265d37e7810', 'تسوية سابقة — مطابقة تلقائية'
FROM public.invoices i
WHERE i.id IN ('9f7bfbe4-e090-4637-ae18-367600853aca','dfe4ab67-1709-4078-a4d0-fc6501b5240c')
  AND (i.paid - COALESCE((SELECT SUM(amount) FROM public.payments WHERE invoice_id = i.id),0)) > 0;

-- 3) Assign cashier role to mkmk1@gmail.com (idempotent)
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'seller'::app_role FROM auth.users u
WHERE u.email = 'mkmk1@gmail.com'
  AND NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = u.id);

-- 4) Revoke EXECUTE on delete_invoice_atomic from anon
REVOKE EXECUTE ON FUNCTION public.delete_invoice_atomic(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.delete_invoice_atomic(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_invoice_atomic(uuid, text) TO authenticated;
