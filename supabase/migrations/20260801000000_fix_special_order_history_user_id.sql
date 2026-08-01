-- Fix: creating a special order (PreOrder) failed with
-- "بعض الحقول المطلوبة فارغة" (Postgres NOT NULL violation, code 23502).
--
-- Root cause: an earlier migration created public.special_order_history with a
-- `user_id uuid NOT NULL` column, but a later migration replaced the
-- AFTER INSERT/UPDATE trigger function log_special_order_status_change() with a
-- version that inserts history rows WITHOUT populating user_id. Because the
-- trigger fires on every special_orders INSERT (and status UPDATE), the history
-- INSERT violated the NOT NULL constraint and the whole special order write was
-- rolled back — so no pre-order could ever be saved.
--
-- Fix: recreate the trigger function so it always writes user_id (the order's
-- owner, which also satisfies the owner-based RLS policy). The column is added
-- defensively with IF NOT EXISTS so this migration is safe regardless of which
-- of the two historical schema variants a given database ended up with.

ALTER TABLE public.special_order_history
  ADD COLUMN IF NOT EXISTS user_id uuid;

CREATE OR REPLACE FUNCTION public.log_special_order_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.special_order_history
      (order_id, user_id, changed_by, from_status, to_status, reason)
    VALUES (NEW.id, NEW.user_id, auth.uid(), NULL, NEW.status, NULL);
  ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.special_order_history
      (order_id, user_id, changed_by, from_status, to_status, reason)
    VALUES (NEW.id, NEW.user_id, auth.uid(), OLD.status, NEW.status,
            CASE WHEN NEW.status = 'cancelled' THEN NEW.cancellation_reason ELSE NULL END);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_special_order_status_history ON public.special_orders;
CREATE TRIGGER trg_special_order_status_history
  AFTER INSERT OR UPDATE OF status ON public.special_orders
  FOR EACH ROW EXECUTE FUNCTION public.log_special_order_status_change();
