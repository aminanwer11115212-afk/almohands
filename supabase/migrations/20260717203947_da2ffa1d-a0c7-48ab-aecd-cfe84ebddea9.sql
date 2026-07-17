-- 1) Link special orders to invoices
ALTER TABLE public.special_orders
  ADD COLUMN IF NOT EXISTS invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_special_orders_invoice_id ON public.special_orders(invoice_id);

-- 2) Status change history for special orders
CREATE TABLE IF NOT EXISTS public.special_order_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.special_orders(id) ON DELETE CASCADE,
  changed_by uuid,
  from_status text,
  to_status text NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.special_order_history TO authenticated;
GRANT ALL ON public.special_order_history TO service_role;

ALTER TABLE public.special_order_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "History readable by order owner or admin" ON public.special_order_history;
CREATE POLICY "History readable by order owner or admin"
  ON public.special_order_history FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.special_orders so
      WHERE so.id = special_order_history.order_id
        AND so.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "History insert by authenticated" ON public.special_order_history;
CREATE POLICY "History insert by authenticated"
  ON public.special_order_history FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_special_order_history_order_id
  ON public.special_order_history(order_id, created_at DESC);

-- 3) Trigger to auto-log status transitions
CREATE OR REPLACE FUNCTION public.log_special_order_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.special_order_history(order_id, changed_by, from_status, to_status, reason)
    VALUES (NEW.id, auth.uid(), NULL, NEW.status, NULL);
  ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.special_order_history(order_id, changed_by, from_status, to_status, reason)
    VALUES (NEW.id, auth.uid(), OLD.status, NEW.status,
            CASE WHEN NEW.status = 'cancelled' THEN NEW.cancellation_reason ELSE NULL END);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_special_order_status_history ON public.special_orders;
CREATE TRIGGER trg_special_order_status_history
  AFTER INSERT OR UPDATE OF status ON public.special_orders
  FOR EACH ROW EXECUTE FUNCTION public.log_special_order_status_change();
