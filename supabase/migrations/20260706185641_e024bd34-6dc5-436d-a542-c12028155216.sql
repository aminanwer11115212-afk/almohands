-- Update trigger function to also handle INSERT case
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
      WHERE id = NEW.product_id AND user_id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$function$;

-- Recreate trigger to fire on both INSERT and UPDATE
DROP TRIGGER IF EXISTS restore_stock_on_return ON public.returns;
CREATE TRIGGER restore_stock_on_return
  AFTER INSERT OR UPDATE ON public.returns
  FOR EACH ROW
  EXECUTE FUNCTION public.restore_stock_on_return_accepted();