
-- 1) purchases
CREATE TABLE public.purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  purchase_number bigint NOT NULL DEFAULT 0,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  supplier_name text,
  total numeric NOT NULL DEFAULT 0,
  paid numeric NOT NULL DEFAULT 0,
  remaining numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchases TO authenticated;
GRANT ALL ON public.purchases TO service_role;
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own purchases" ON public.purchases FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_purchases_updated_at BEFORE UPDATE ON public.purchases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) purchase_items
CREATE TABLE public.purchase_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  purchase_id uuid NOT NULL REFERENCES public.purchases(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  quantity numeric NOT NULL DEFAULT 0,
  cost_price numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_items TO authenticated;
GRANT ALL ON public.purchase_items TO service_role;
ALTER TABLE public.purchase_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own purchase_items" ON public.purchase_items FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 3) price_history
CREATE TABLE public.price_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  old_price numeric NOT NULL DEFAULT 0,
  new_price numeric NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'manual',
  purchase_id uuid REFERENCES public.purchases(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.price_history TO authenticated;
GRANT ALL ON public.price_history TO service_role;
ALTER TABLE public.price_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own price_history" ON public.price_history FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 4) payments (used for customer & supplier statements)
CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  party_type text NOT NULL CHECK (party_type IN ('customer','supplier')),
  party_id uuid NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  method text,
  invoice_id uuid,
  purchase_id uuid REFERENCES public.purchases(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own payments" ON public.payments FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_payments_party ON public.payments(party_type, party_id);
CREATE INDEX idx_price_history_product ON public.price_history(product_id, created_at DESC);
CREATE INDEX idx_purchase_items_purchase ON public.purchase_items(purchase_id);

-- 5) auto invoice number for purchases (per user)
CREATE OR REPLACE FUNCTION public.assign_purchase_number()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE next_no bigint;
BEGIN
  IF NEW.user_id IS NULL THEN RAISE EXCEPTION 'user_id required'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('purchase_no:' || NEW.user_id::text, 0));
  SELECT COALESCE(MAX(purchase_number),0)+1 INTO next_no FROM public.purchases WHERE user_id = NEW.user_id;
  NEW.purchase_number := next_no;
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.assign_purchase_number() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_assign_purchase_number BEFORE INSERT ON public.purchases
  FOR EACH ROW WHEN (NEW.purchase_number = 0 OR NEW.purchase_number IS NULL)
  EXECUTE FUNCTION public.assign_purchase_number();

-- 6) increment stock + log price change on purchase_items insert
CREATE OR REPLACE FUNCTION public.increment_stock_on_purchase()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE old_cost numeric;
BEGIN
  IF NEW.product_id IS NOT NULL THEN
    SELECT cost_price INTO old_cost FROM public.products
      WHERE id = NEW.product_id AND user_id = NEW.user_id FOR UPDATE;

    UPDATE public.products
       SET quantity = quantity + NEW.quantity,
           cost_price = CASE WHEN NEW.cost_price > 0 THEN NEW.cost_price ELSE cost_price END
     WHERE id = NEW.product_id AND user_id = NEW.user_id;

    IF NEW.cost_price > 0 AND old_cost IS DISTINCT FROM NEW.cost_price THEN
      INSERT INTO public.price_history(user_id, product_id, old_price, new_price, source, purchase_id)
      VALUES (NEW.user_id, NEW.product_id, COALESCE(old_cost,0), NEW.cost_price, 'purchase', NEW.purchase_id);
    END IF;
  END IF;
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.increment_stock_on_purchase() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_increment_stock_on_purchase AFTER INSERT ON public.purchase_items
  FOR EACH ROW EXECUTE FUNCTION public.increment_stock_on_purchase();

-- 7) log manual product cost_price changes
CREATE OR REPLACE FUNCTION public.log_product_price_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.cost_price IS DISTINCT FROM NEW.cost_price THEN
    INSERT INTO public.price_history(user_id, product_id, old_price, new_price, source)
    VALUES (NEW.user_id, NEW.id, COALESCE(OLD.cost_price,0), NEW.cost_price, 'manual');
  END IF;
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.log_product_price_change() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_log_product_price_change AFTER UPDATE OF cost_price ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.log_product_price_change();
