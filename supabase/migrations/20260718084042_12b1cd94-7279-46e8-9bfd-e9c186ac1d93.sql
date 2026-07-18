
-- Atomic invoice deletion with full audit + verification.
CREATE OR REPLACE FUNCTION public.delete_invoice_atomic(
  _invoice_id uuid,
  _reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor              uuid := auth.uid();
  is_admin_actor     boolean;
  inv                public.invoices%ROWTYPE;
  items_snapshot     jsonb;
  payments_snapshot  jsonb;
  accounts_snapshot  jsonb;
  stock_restored     jsonb := '[]'::jsonb;
  payments_count     int := 0;
  payments_total     numeric := 0;
  items_count        int := 0;
  it                 record;
  net_qty            numeric;
  result             jsonb;
BEGIN
  IF actor IS NULL THEN
    RAISE EXCEPTION 'غير مصرح — يجب تسجيل الدخول' USING ERRCODE = '42501';
  END IF;

  -- Lock the invoice row for the duration of the transaction.
  SELECT * INTO inv FROM public.invoices WHERE id = _invoice_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'الفاتورة غير موجودة' USING ERRCODE = 'P0002';
  END IF;

  is_admin_actor := public.has_role(actor, 'admin'::app_role);
  IF NOT is_admin_actor AND inv.user_id <> actor THEN
    RAISE EXCEPTION 'ممنوع — لا تملك صلاحية حذف هذه الفاتورة' USING ERRCODE = '42501';
  END IF;

  -- ===== 1) Snapshot everything BEFORE we touch it =====
  SELECT COALESCE(jsonb_agg(to_jsonb(ii.*) ORDER BY ii.created_at), '[]'::jsonb),
         COUNT(*)::int
    INTO items_snapshot, items_count
    FROM public.invoice_items ii
   WHERE ii.invoice_id = _invoice_id;

  SELECT COALESCE(jsonb_agg(to_jsonb(p.*) ORDER BY p.created_at), '[]'::jsonb),
         COUNT(*)::int,
         COALESCE(SUM(p.amount), 0)
    INTO payments_snapshot, payments_count, payments_total
    FROM public.payments p
   WHERE p.invoice_id = _invoice_id;

  -- Aggregate amount per account that will be reversed when we delete payments.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'account_id', account_id,
           'deducted',   sum_amount
         )), '[]'::jsonb)
    INTO accounts_snapshot
    FROM (
      SELECT account_id, SUM(amount) AS sum_amount
        FROM public.payments
       WHERE invoice_id = _invoice_id AND account_id IS NOT NULL
       GROUP BY account_id
    ) a;

  -- ===== 2) Restore stock (net of already-accepted returns) =====
  FOR it IN
    SELECT ii.product_id,
           ii.product_name,
           SUM(ii.quantity) AS sold_qty
      FROM public.invoice_items ii
     WHERE ii.invoice_id = _invoice_id
       AND ii.product_id IS NOT NULL
     GROUP BY ii.product_id, ii.product_name
  LOOP
    -- Subtract quantities already returned & accepted so we don't double-restore.
    SELECT it.sold_qty - COALESCE((
             SELECT SUM(r.quantity)
               FROM public.returns r
              WHERE r.invoice_id = _invoice_id
                AND r.product_id = it.product_id
                AND r.status = 'accepted'
           ), 0)
      INTO net_qty;

    IF net_qty > 0 THEN
      UPDATE public.products
         SET quantity = quantity + net_qty
       WHERE id = it.product_id;

      stock_restored := stock_restored || jsonb_build_object(
        'product_id',   it.product_id,
        'product_name', it.product_name,
        'restored_qty', net_qty
      );
    END IF;
  END LOOP;

  -- ===== 3) Delete linked payments (no FK cascade on payments.invoice_id) =====
  DELETE FROM public.payments WHERE invoice_id = _invoice_id;

  -- ===== 4) Detach any returns rows (invoice_id becomes NULL — history preserved) =====
  UPDATE public.returns SET invoice_id = NULL WHERE invoice_id = _invoice_id;

  -- ===== 5) Delete the invoice (invoice_items cascade) =====
  DELETE FROM public.invoices WHERE id = _invoice_id;

  -- ===== 6) Rich audit log =====
  INSERT INTO public.audit_logs (user_id, action, table_name, record_id, details)
  VALUES (
    actor,
    'invoice_delete_atomic',
    'invoices',
    _invoice_id,
    jsonb_build_object(
      'deleted_by',        actor,
      'is_admin_actor',    is_admin_actor,
      'reason',            _reason,
      'invoice_owner',     inv.user_id,
      'invoice_number',    inv.invoice_number,
      'invoice_total',     inv.total,
      'invoice_paid',      inv.paid,
      'invoice_remaining', inv.remaining,
      'customer_id',       inv.customer_id,
      'customer_name',     inv.customer_name,
      'created_at',        inv.created_at,
      'deleted_at',        now(),
      'items_count',       items_count,
      'items',             items_snapshot,
      'payments_count',    payments_count,
      'payments_total',    payments_total,
      'payments',          payments_snapshot,
      'accounts_impact',   accounts_snapshot,
      'stock_restored',    stock_restored
    )
  );

  -- ===== 7) Build verification payload =====
  result := jsonb_build_object(
    'ok',                true,
    'invoice_id',        _invoice_id,
    'invoice_number',    inv.invoice_number,
    'items_deleted',     items_count,
    'payments_deleted',  payments_count,
    'payments_total',    payments_total,
    'accounts_impact',   accounts_snapshot,
    'stock_restored',    stock_restored,
    'deleted_at',        now()
  );

  -- Post-delete verification: rows really gone?
  IF EXISTS (SELECT 1 FROM public.invoices WHERE id = _invoice_id)
     OR EXISTS (SELECT 1 FROM public.invoice_items WHERE invoice_id = _invoice_id)
     OR EXISTS (SELECT 1 FROM public.payments WHERE invoice_id = _invoice_id) THEN
    RAISE EXCEPTION 'فشل التحقق بعد الحذف — بقيت بيانات مرتبطة بالفاتورة' USING ERRCODE = 'P0001';
  END IF;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_invoice_atomic(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_invoice_atomic(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_invoice_atomic(uuid, text) TO service_role;
