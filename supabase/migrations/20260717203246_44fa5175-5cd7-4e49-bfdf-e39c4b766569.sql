-- Status change history for special_orders
CREATE TABLE public.special_order_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.special_orders(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  changed_by uuid,
  from_status text,
  to_status text NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.special_order_history TO authenticated;
GRANT ALL ON public.special_order_history TO service_role;

ALTER TABLE public.special_order_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "special_order_history_owner_select" ON public.special_order_history
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "special_order_history_owner_insert" ON public.special_order_history
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_special_order_history_order ON public.special_order_history(order_id, created_at DESC);

-- Trigger: record status changes automatically
CREATE OR REPLACE FUNCTION public.log_special_order_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.special_order_history (order_id, user_id, changed_by, from_status, to_status, reason)
    VALUES (NEW.id, NEW.user_id, auth.uid(), NULL, NEW.status, NULL);
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.special_order_history (order_id, user_id, changed_by, from_status, to_status, reason)
    VALUES (NEW.id, NEW.user_id, auth.uid(), OLD.status, NEW.status, NEW.cancellation_reason);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_special_order_status_history
  AFTER INSERT OR UPDATE OF status ON public.special_orders
  FOR EACH ROW EXECUTE FUNCTION public.log_special_order_status_change();

-- Link between special order and invoice (auto-fill invoice from order)
ALTER TABLE public.special_orders
  ADD COLUMN IF NOT EXISTS invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_special_orders_invoice ON public.special_orders(invoice_id);