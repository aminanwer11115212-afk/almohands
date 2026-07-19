
-- 1) Dedicated Postgres role for PowerSync (read-only + replication)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'powersync_role') THEN
    CREATE ROLE powersync_role WITH LOGIN REPLICATION BYPASSRLS PASSWORD 'UhqCcEdU5zP7Q8pSNYahxkrvfHd2ae3ggJbTx7syjtA';
  ELSE
    ALTER ROLE powersync_role WITH LOGIN REPLICATION BYPASSRLS PASSWORD 'UhqCcEdU5zP7Q8pSNYahxkrvfHd2ae3ggJbTx7syjtA';
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO powersync_role;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO powersync_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO powersync_role;

-- 2) REPLICA IDENTITY FULL for every synced table (PowerSync needs full row images)
ALTER TABLE public.products              REPLICA IDENTITY FULL;
ALTER TABLE public.customers             REPLICA IDENTITY FULL;
ALTER TABLE public.invoices              REPLICA IDENTITY FULL;
ALTER TABLE public.invoice_items         REPLICA IDENTITY FULL;
ALTER TABLE public.payments              REPLICA IDENTITY FULL;
ALTER TABLE public.purchases             REPLICA IDENTITY FULL;
ALTER TABLE public.purchase_items        REPLICA IDENTITY FULL;
ALTER TABLE public.suppliers             REPLICA IDENTITY FULL;
ALTER TABLE public.price_history         REPLICA IDENTITY FULL;
ALTER TABLE public.expenses              REPLICA IDENTITY FULL;
ALTER TABLE public.payment_methods       REPLICA IDENTITY FULL;
ALTER TABLE public.returns               REPLICA IDENTITY FULL;
ALTER TABLE public.special_orders        REPLICA IDENTITY FULL;
ALTER TABLE public.special_order_history REPLICA IDENTITY FULL;
ALTER TABLE public.notifications         REPLICA IDENTITY FULL;
ALTER TABLE public.audit_logs            REPLICA IDENTITY FULL;
ALTER TABLE public.import_logs           REPLICA IDENTITY FULL;
ALTER TABLE public.export_logs           REPLICA IDENTITY FULL;
ALTER TABLE public.user_roles            REPLICA IDENTITY FULL;
ALTER TABLE public.store_profile         REPLICA IDENTITY FULL;

-- 3) Logical replication PUBLICATION consumed by PowerSync
DROP PUBLICATION IF EXISTS powersync;
CREATE PUBLICATION powersync FOR TABLE
  public.products, public.customers, public.invoices, public.invoice_items, public.payments,
  public.purchases, public.purchase_items, public.suppliers, public.price_history,
  public.expenses, public.payment_methods, public.returns,
  public.special_orders, public.special_order_history,
  public.notifications, public.audit_logs, public.import_logs, public.export_logs,
  public.user_roles, public.store_profile;
