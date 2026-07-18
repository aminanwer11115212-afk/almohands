
CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION public.tg_payments_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid := auth.uid();
  action_txt text;
  rec_id uuid;
  owner_id uuid;
  details jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    action_txt := 'payment.insert';
    rec_id := NEW.id;
    owner_id := NEW.user_id;
    details := jsonb_build_object('row', to_jsonb(NEW), 'reason', NEW.notes, 'actor', actor);
  ELSIF TG_OP = 'UPDATE' THEN
    action_txt := 'payment.update';
    rec_id := NEW.id;
    owner_id := NEW.user_id;
    details := jsonb_build_object('before', to_jsonb(OLD), 'after', to_jsonb(NEW), 'reason', NEW.notes, 'actor', actor);
  ELSE
    action_txt := 'payment.delete';
    rec_id := OLD.id;
    owner_id := OLD.user_id;
    details := jsonb_build_object('row', to_jsonb(OLD), 'reason', OLD.notes, 'actor', actor);
  END IF;

  INSERT INTO public.audit_logs (user_id, action, table_name, record_id, details)
  VALUES (COALESCE(actor, owner_id), action_txt, 'payments', rec_id, details);

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS payments_audit_ins ON public.payments;
DROP TRIGGER IF EXISTS payments_audit_upd ON public.payments;
DROP TRIGGER IF EXISTS payments_audit_del ON public.payments;
CREATE TRIGGER payments_audit_ins AFTER INSERT ON public.payments FOR EACH ROW EXECUTE FUNCTION public.tg_payments_audit();
CREATE TRIGGER payments_audit_upd AFTER UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.tg_payments_audit();
CREATE TRIGGER payments_audit_del AFTER DELETE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.tg_payments_audit();

CREATE OR REPLACE FUNCTION public.reconcile_invoice_paid_all()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  fixed_count int := 0;
  first_owner uuid;
  inv_rec record;
BEGIN
  FOR inv_rec IN
    SELECT i.id
      FROM public.invoices i
      JOIN public.payments p ON p.invoice_id = i.id
     GROUP BY i.id, i.paid, i.total, i.status
    HAVING ABS(i.paid - COALESCE(SUM(p.amount),0)) > 0.001
        OR (i.status <> 'cancelled' AND (
              (COALESCE(SUM(p.amount),0) >= i.total AND i.total > 0 AND i.status <> 'paid')
           OR (COALESCE(SUM(p.amount),0) > 0 AND COALESCE(SUM(p.amount),0) < i.total AND i.status <> 'partial')
           OR (COALESCE(SUM(p.amount),0) = 0 AND i.status <> 'pending')
        ))
  LOOP
    PERFORM public.recompute_invoice_totals(inv_rec.id);
    fixed_count := fixed_count + 1;
  END LOOP;

  SELECT user_id INTO first_owner FROM public.user_roles WHERE role = 'admin' LIMIT 1;
  IF first_owner IS NOT NULL THEN
    INSERT INTO public.audit_logs (user_id, action, table_name, record_id, details)
    VALUES (first_owner, 'invoices.reconcile', 'invoices', NULL,
            jsonb_build_object('fixed_count', fixed_count, 'ran_at', now(), 'system', true));
  END IF;

  RETURN jsonb_build_object('ok', true, 'fixed_count', fixed_count);
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_invoice_paid_all() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reconcile_invoice_paid_all() FROM anon;
GRANT EXECUTE ON FUNCTION public.reconcile_invoice_paid_all() TO service_role;

DO $$
BEGIN
  PERFORM cron.unschedule('reconcile-invoice-paid-daily');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'reconcile-invoice-paid-daily',
  '15 2 * * *',
  $$ SELECT public.reconcile_invoice_paid_all(); $$
);

SELECT public.reconcile_invoice_paid_all();
