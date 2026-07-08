DROP VIEW IF EXISTS public.account_balances;
CREATE VIEW public.account_balances
WITH (security_invoker = on) AS
SELECT
  pm.id AS account_id,
  pm.user_id,
  pm.name,
  pm.type,
  pm.bank_name,
  pm.is_default,
  pm.is_active,
  pm.opening_balance,
  COALESCE(pin.total, 0) + COALESCE(invp.total, 0) AS incoming,
  COALESCE(pin.total, 0) AS customer_payments,
  COALESCE(invp.total, 0) AS invoice_paid,
  COALESCE(pout.total, 0) AS outgoing_supplier,
  COALESCE(exp.total, 0) AS outgoing_expense,
  pm.opening_balance
    + COALESCE(pin.total, 0)
    + COALESCE(invp.total, 0)
    - COALESCE(pout.total, 0)
    - COALESCE(exp.total, 0) AS balance
FROM public.payment_methods pm
LEFT JOIN LATERAL (
  SELECT SUM(p.amount) AS total FROM public.payments p
  WHERE p.account_id = pm.id AND p.user_id = pm.user_id AND p.party_type = 'customer'
) pin ON true
LEFT JOIN LATERAL (
  SELECT SUM(p.amount) AS total FROM public.payments p
  WHERE p.account_id = pm.id AND p.user_id = pm.user_id AND p.party_type = 'supplier'
) pout ON true
LEFT JOIN LATERAL (
  SELECT SUM(e.amount) AS total FROM public.expenses e
  WHERE e.account_id = pm.id AND e.user_id = pm.user_id
) exp ON true
LEFT JOIN LATERAL (
  SELECT SUM(i.paid) AS total FROM public.invoices i
  WHERE i.payment_method_id = pm.id
    AND i.user_id = pm.user_id
    AND i.status <> 'cancelled'
) invp ON true;