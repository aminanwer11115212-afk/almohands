
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'low_stock',
  title text NOT NULL,
  message text,
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own notifications"
  ON public.notifications FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_notifications_user_read ON public.notifications(user_id, read, created_at DESC);

-- Trigger: notify on low stock
CREATE OR REPLACE FUNCTION public.notify_low_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.quantity <= NEW.min_quantity
     AND (TG_OP = 'INSERT' OR OLD.quantity > NEW.min_quantity OR OLD.min_quantity < NEW.min_quantity)
     AND NEW.min_quantity > 0
  THEN
    -- Avoid duplicates: skip if an unread low_stock alert already exists for this product
    IF NOT EXISTS (
      SELECT 1 FROM public.notifications
      WHERE product_id = NEW.id AND type = 'low_stock' AND read = false
    ) THEN
      INSERT INTO public.notifications (user_id, type, title, message, product_id)
      VALUES (
        NEW.user_id,
        'low_stock',
        'انخفاض المخزون: ' || NEW.name,
        'الكمية المتبقية ' || NEW.quantity || ' — الحد الأدنى ' || NEW.min_quantity,
        NEW.id
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_low_stock
AFTER INSERT OR UPDATE OF quantity, min_quantity ON public.products
FOR EACH ROW EXECUTE FUNCTION public.notify_low_stock();
