
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS cancellation_reason text,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid;

CREATE OR REPLACE FUNCTION public.notify_admin_on_invoice_cancel()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  admin_id uuid;
  actor uuid := auth.uid();
  is_admin_actor boolean;
  title_txt text;
  msg_txt text;
  target_inv uuid;
  inv_no bigint;
  inv_total numeric;
  reason_txt text;
BEGIN
  is_admin_actor := actor IS NOT NULL AND public.has_role(actor, 'admin');
  IF is_admin_actor THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'DELETE' THEN
    target_inv := OLD.id;
    inv_no := OLD.invoice_number;
    inv_total := OLD.total;
    title_txt := 'حذف فاتورة #' || inv_no;
    msg_txt := 'قام مستخدم غير مدير بحذف الفاتورة رقم ' || inv_no || ' بإجمالي ' || inv_total::text || '.';
  ELSIF TG_OP = 'UPDATE'
        AND NEW.status = 'cancelled'
        AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    target_inv := NEW.id;
    inv_no := NEW.invoice_number;
    inv_total := NEW.total;
    reason_txt := COALESCE(NULLIF(btrim(NEW.cancellation_reason), ''), 'بدون سبب مذكور');
    title_txt := 'إلغاء فاتورة #' || inv_no;
    msg_txt := 'قام الكاشير بإلغاء الفاتورة رقم ' || inv_no
               || ' بإجمالي ' || inv_total::text
               || ' — السبب: ' || reason_txt;
  ELSE
    RETURN COALESCE(NEW, OLD);
  END IF;

  FOR admin_id IN SELECT ur.user_id FROM public.user_roles ur WHERE ur.role = 'admin' LOOP
    INSERT INTO public.notifications (user_id, type, title, message, invoice_id)
    VALUES (admin_id, 'cashier_alert', title_txt, msg_txt,
            CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE target_inv END);
  END LOOP;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- Allow non-admin owners (cashiers) to cancel their own invoices, restricted to
-- flipping status to 'cancelled' plus the cancellation metadata. Financial
-- fields and lines stay untouched. Admin retains full UPDATE via existing
-- "Users update own invoices" (they own their own) or a broader admin-only
-- policy path; here we add a narrow cancel policy for owners.
--
-- Owners already have UPDATE via "Users update own invoices" (auth.uid()=user_id).
-- Nothing else needs adding at the RLS layer; app code will restrict the
-- fields written on the cashier UI.
