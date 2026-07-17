-- Allow payments without a party (e.g. anonymous POS invoice extra payments)
ALTER TABLE public.payments ALTER COLUMN party_id DROP NOT NULL;

-- Prevent double-counting when an invoice's original paid amount was recorded
-- under one account (invoices.payment_method_id) and an ADDITIONAL payment
-- against that same invoice is later recorded via the payments table.
-- We subtract Σ(payments.amount linked to those invoices, party_type='customer')
-- from the account's invoice_paid total so each dollar is counted once.
CREATE OR REPLACE VIEW public.account_balances
WITH (security_invoker=true) AS
SELECT pm.id AS account_id,
    pm.user_id,
    pm.name,
    pm.type,
    pm.bank_name,
    pm.is_default,
    pm.is_active,
    pm.opening_balance,
    COALESCE(pin.total, 0::numeric) + COALESCE(invp.total, 0::numeric) - COALESCE(dbl.total, 0::numeric) AS incoming,
    COALESCE(pin.total, 0::numeric) AS customer_payments,
    COALESCE(invp.total, 0::numeric) - COALESCE(dbl.total, 0::numeric) AS invoice_paid,
    COALESCE(pout.total, 0::numeric) AS outgoing_supplier,
    COALESCE(exp.total, 0::numeric) AS outgoing_expense,
    pm.opening_balance
      + COALESCE(pin.total, 0::numeric)
      + COALESCE(invp.total, 0::numeric)
      - COALESCE(dbl.total, 0::numeric)
      - COALESCE(pout.total, 0::numeric)
      - COALESCE(exp.total, 0::numeric) AS balance
FROM public.payment_methods pm
LEFT JOIN LATERAL (
  SELECT sum(p.amount) AS total FROM public.payments p
  WHERE p.account_id = pm.id AND p.user_id = pm.user_id AND p.party_type = 'customer'
) pin ON true
LEFT JOIN LATERAL (
  SELECT sum(p.amount) AS total FROM public.payments p
  WHERE p.account_id = pm.id AND p.user_id = pm.user_id AND p.party_type = 'supplier'
) pout ON true
LEFT JOIN LATERAL (
  SELECT sum(e.amount) AS total FROM public.expenses e
  WHERE e.account_id = pm.id AND e.user_id = pm.user_id
) exp ON true
LEFT JOIN LATERAL (
  SELECT sum(i.paid) AS total FROM public.invoices i
  WHERE i.payment_method_id = pm.id AND i.user_id = pm.user_id AND i.status <> 'cancelled'
) invp ON true
LEFT JOIN LATERAL (
  -- payments that top-up invoices whose original payment_method_id = pm.id
  SELECT sum(p.amount) AS total
  FROM public.payments p
  JOIN public.invoices i ON i.id = p.invoice_id
  WHERE p.user_id = pm.user_id
    AND p.party_type = 'customer'
    AND p.invoice_id IS NOT NULL
    AND i.payment_method_id = pm.id
    AND i.status <> 'cancelled'
) dbl ON true;