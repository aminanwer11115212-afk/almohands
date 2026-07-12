
-- B10: Prevent duplicate invoice numbers per user
CREATE UNIQUE INDEX IF NOT EXISTS invoices_user_number_uidx
  ON public.invoices(user_id, invoice_number);

-- Same guard for purchases
CREATE UNIQUE INDEX IF NOT EXISTS purchases_user_number_uidx
  ON public.purchases(user_id, purchase_number);

-- B6: Unified audit trigger for row deletions on customers/products/suppliers
CREATE OR REPLACE FUNCTION public.log_row_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid := auth.uid();
BEGIN
  INSERT INTO public.audit_logs (user_id, action, table_name, record_id, details)
  VALUES (
    COALESCE(actor, OLD.user_id),
    'delete',
    TG_TABLE_NAME,
    OLD.id,
    jsonb_build_object(
      'row', to_jsonb(OLD),
      'deleted_by', actor,
      'row_owner', OLD.user_id
    )
  );
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_customers_audit_delete ON public.customers;
CREATE TRIGGER trg_customers_audit_delete
  AFTER DELETE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.log_row_delete();

DROP TRIGGER IF EXISTS trg_products_audit_delete ON public.products;
CREATE TRIGGER trg_products_audit_delete
  AFTER DELETE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.log_row_delete();

DROP TRIGGER IF EXISTS trg_suppliers_audit_delete ON public.suppliers;
CREATE TRIGGER trg_suppliers_audit_delete
  AFTER DELETE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.log_row_delete();

-- Performance indexes (Phase 5 prep)
CREATE INDEX IF NOT EXISTS invoices_user_created_idx  ON public.invoices(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS purchases_user_created_idx ON public.purchases(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_user_created_idx ON public.notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_user_created_idx ON public.audit_logs(user_id, created_at DESC);
