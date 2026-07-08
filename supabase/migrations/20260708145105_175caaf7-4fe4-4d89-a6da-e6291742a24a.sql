
-- 1) reference number for bank transactions
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS reference_number text;
CREATE INDEX IF NOT EXISTS invoices_reference_number_idx ON public.invoices (reference_number) WHERE reference_number IS NOT NULL;

-- 2) allow the notifications table to store an invoice reference
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS invoice_id uuid;

-- 3) trigger: notify all admins whenever a cashier (non-admin) inserts a POS invoice
CREATE OR REPLACE FUNCTION public.notify_admin_on_cashier_invoice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  admin_id uuid;
  is_admin_creator boolean;
  title_txt text;
  msg_txt text;
BEGIN
  -- Only care about POS invoices
  IF NEW.source IS DISTINCT FROM 'pos' THEN
    RETURN NEW;
  END IF;

  is_admin_creator := public.has_role(NEW.user_id, 'admin');
  IF is_admin_creator THEN
    RETURN NEW; -- admin creating their own invoice, no need to notify
  END IF;

  IF NEW.customer_id IS NULL AND (NEW.customer_name IS NULL OR btrim(NEW.customer_name) = '') THEN
    title_txt := 'فاتورة كاشير بدون عميل #' || NEW.invoice_number;
    msg_txt := 'أنشأ الكاشير فاتورة رقم ' || NEW.invoice_number || ' بدون تحديد عميل — يرجى المراجعة.';
  ELSE
    title_txt := 'فاتورة كاشير جديدة #' || NEW.invoice_number;
    msg_txt := 'أنشأ الكاشير فاتورة رقم ' || NEW.invoice_number || ' بإجمالي ' || NEW.total::text || '.';
  END IF;

  FOR admin_id IN
    SELECT ur.user_id FROM public.user_roles ur WHERE ur.role = 'admin'
  LOOP
    INSERT INTO public.notifications (user_id, type, title, message, invoice_id)
    VALUES (admin_id, 'cashier_alert', title_txt, msg_txt, NEW.id);
  END LOOP;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.notify_admin_on_cashier_invoice() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_notify_admin_on_cashier_invoice ON public.invoices;
CREATE TRIGGER trg_notify_admin_on_cashier_invoice
AFTER INSERT ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.notify_admin_on_cashier_invoice();
