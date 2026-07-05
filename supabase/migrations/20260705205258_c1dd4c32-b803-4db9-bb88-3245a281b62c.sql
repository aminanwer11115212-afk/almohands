
-- Per-user invoice numbering
CREATE OR REPLACE FUNCTION public.assign_invoice_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_no bigint;
BEGIN
  IF NEW.user_id IS NULL THEN
    RAISE EXCEPTION 'user_id مطلوب للفاتورة';
  END IF;

  -- Serialize per-user to avoid race conditions
  PERFORM pg_advisory_xact_lock(hashtextextended('invoice_no:' || NEW.user_id::text, 0));

  SELECT COALESCE(MAX(invoice_number), 0) + 1
    INTO next_no
    FROM public.invoices
   WHERE user_id = NEW.user_id;

  NEW.invoice_number := next_no;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_invoice_number ON public.invoices;
CREATE TRIGGER trg_assign_invoice_number
BEFORE INSERT ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.assign_invoice_number();

-- Drop the global sequence default (trigger now owns numbering)
ALTER TABLE public.invoices ALTER COLUMN invoice_number DROP DEFAULT;

-- Ensure uniqueness per user
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public' AND indexname='invoices_user_number_unique'
  ) THEN
    CREATE UNIQUE INDEX invoices_user_number_unique
      ON public.invoices(user_id, invoice_number);
  END IF;
END $$;
