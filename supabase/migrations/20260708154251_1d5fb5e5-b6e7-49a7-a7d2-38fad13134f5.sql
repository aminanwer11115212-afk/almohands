
-- Allow non-admin roles (e.g. cashier/seller) to READ the store owner's catalog
-- so they can actually sell. Products, customers, payment methods belong to the
-- admin account; sellers reference them from their own invoices.

CREATE POLICY "Sellers view admin products"
  ON public.products FOR SELECT TO authenticated
  USING (public.has_role(user_id, 'admin'));

CREATE POLICY "Sellers view admin customers"
  ON public.customers FOR SELECT TO authenticated
  USING (public.has_role(user_id, 'admin'));

CREATE POLICY "Sellers view admin payment_methods"
  ON public.payment_methods FOR SELECT TO authenticated
  USING (public.has_role(user_id, 'admin'));

-- Stock triggers currently require the product to be owned by the same user
-- as the invoice/purchase. That breaks when a cashier sells an admin-owned
-- product. Trigger runs SECURITY DEFINER, so drop the user_id scoping and
-- look up products by id only.

CREATE OR REPLACE FUNCTION public.decrement_product_stock()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  current_qty numeric;
  prod_name   text;
BEGIN
  IF NEW.product_id IS NOT NULL THEN
    SELECT quantity, name INTO current_qty, prod_name
      FROM public.products
     WHERE id = NEW.product_id
     FOR UPDATE;

    IF current_qty IS NULL THEN
      RAISE EXCEPTION 'المنتج غير موجود' USING ERRCODE = 'P0001';
    END IF;
    IF current_qty < NEW.quantity THEN
      RAISE EXCEPTION 'الكمية غير كافية للصنف: %', COALESCE(prod_name, '?') USING ERRCODE = 'P0001';
    END IF;

    UPDATE public.products
       SET quantity = quantity - NEW.quantity
     WHERE id = NEW.product_id;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.increment_stock_on_purchase()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE old_cost numeric;
BEGIN
  IF NEW.product_id IS NOT NULL THEN
    SELECT cost_price INTO old_cost FROM public.products
      WHERE id = NEW.product_id FOR UPDATE;

    UPDATE public.products
       SET quantity = quantity + NEW.quantity,
           cost_price = CASE WHEN NEW.cost_price > 0 THEN NEW.cost_price ELSE cost_price END
     WHERE id = NEW.product_id;

    IF NEW.cost_price > 0 AND old_cost IS DISTINCT FROM NEW.cost_price THEN
      INSERT INTO public.price_history(user_id, product_id, old_price, new_price, source, purchase_id)
      VALUES (NEW.user_id, NEW.product_id, COALESCE(old_cost,0), NEW.cost_price, 'purchase', NEW.purchase_id);
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.restore_stock_on_return_accepted()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'accepted'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'accepted')
     AND NEW.product_id IS NOT NULL THEN
    UPDATE public.products
      SET quantity = quantity + NEW.quantity
      WHERE id = NEW.product_id;
  END IF;
  RETURN NEW;
END;
$function$;

-- Notify admins whenever a non-admin cancels or deletes an invoice.

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
    title_txt := 'إلغاء فاتورة #' || inv_no;
    msg_txt := 'قام الكاشير بإلغاء الفاتورة رقم ' || inv_no || ' بإجمالي ' || inv_total::text || '.';
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

DROP TRIGGER IF EXISTS trg_notify_admin_on_invoice_cancel_upd ON public.invoices;
CREATE TRIGGER trg_notify_admin_on_invoice_cancel_upd
  AFTER UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.notify_admin_on_invoice_cancel();

DROP TRIGGER IF EXISTS trg_notify_admin_on_invoice_cancel_del ON public.invoices;
CREATE TRIGGER trg_notify_admin_on_invoice_cancel_del
  AFTER DELETE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.notify_admin_on_invoice_cancel();
