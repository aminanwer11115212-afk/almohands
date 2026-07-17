
-- Special orders / customer request queue
CREATE TABLE public.special_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_name text,
  customer_phone text,
  item_name text NOT NULL,
  description text,
  quantity numeric NOT NULL DEFAULT 1 CHECK (quantity > 0),
  target_price numeric,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  supplier_name text,
  notes text,
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','contacted','ordered','arrived','delivered','cancelled')),
  cancellation_reason text,
  expected_at date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.special_orders TO authenticated;
GRANT ALL ON public.special_orders TO service_role;

ALTER TABLE public.special_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "special_orders_owner_select" ON public.special_orders
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "special_orders_owner_insert" ON public.special_orders
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "special_orders_owner_update" ON public.special_orders
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "special_orders_owner_delete" ON public.special_orders
  FOR DELETE TO authenticated USING (auth.uid() = user_id AND public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_special_orders_user_status ON public.special_orders(user_id, status, created_at DESC);
CREATE INDEX idx_special_orders_customer ON public.special_orders(customer_id);

CREATE TRIGGER update_special_orders_updated_at
  BEFORE UPDATE ON public.special_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER log_special_order_delete
  AFTER DELETE ON public.special_orders
  FOR EACH ROW EXECUTE FUNCTION public.log_row_delete();
