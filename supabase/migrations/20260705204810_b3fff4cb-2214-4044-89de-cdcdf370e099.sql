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
     WHERE id = NEW.product_id AND user_id = NEW.user_id
     FOR UPDATE;

    IF current_qty IS NULL THEN
      RAISE EXCEPTION 'المنتج غير موجود' USING ERRCODE = 'P0001';
    END IF;
    IF current_qty < NEW.quantity THEN
      RAISE EXCEPTION 'الكمية غير كافية للصنف: %', COALESCE(prod_name, '?') USING ERRCODE = 'P0001';
    END IF;

    UPDATE public.products
       SET quantity = quantity - NEW.quantity
     WHERE id = NEW.product_id AND user_id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$function$;