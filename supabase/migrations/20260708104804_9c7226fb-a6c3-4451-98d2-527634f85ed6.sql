
-- ============================================================
-- Financial Accounts extension
-- We reuse `payment_methods` as the accounts registry (cash / bank / wallet / card),
-- and link expenses + payments to a specific account so we can compute a
-- running balance per account.
-- ============================================================

-- 1. Link expenses to an account (nullable — legacy rows stay untouched).
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES public.payment_methods(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_expenses_account_id ON public.expenses(account_id);

-- 2. Link customer/supplier payments to an account too.
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES public.payment_methods(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_payments_account_id ON public.payments(account_id);

-- 3. Optional opening balance per account (so a bank starts with real cash).
ALTER TABLE public.payment_methods
  ADD COLUMN IF NOT EXISTS opening_balance numeric NOT NULL DEFAULT 0;

-- 4. Helper view: current balance per account for the *current* user.
--    Balance = opening + Σ(customer payments in) − Σ(supplier payments out) − Σ(expenses out)
CREATE OR REPLACE VIEW public.account_balances AS
SELECT
  pm.id                       AS account_id,
  pm.user_id                  AS user_id,
  pm.name                     AS name,
  pm.type                     AS type,
  pm.bank_name                AS bank_name,
  pm.is_default               AS is_default,
  pm.is_active                AS is_active,
  pm.opening_balance          AS opening_balance,
  COALESCE(pin.total, 0)      AS incoming,
  COALESCE(pout.total, 0)     AS outgoing_supplier,
  COALESCE(exp.total, 0)      AS outgoing_expense,
  ( pm.opening_balance
    + COALESCE(pin.total, 0)
    - COALESCE(pout.total, 0)
    - COALESCE(exp.total, 0) ) AS balance
FROM public.payment_methods pm
LEFT JOIN LATERAL (
  SELECT SUM(p.amount) AS total
    FROM public.payments p
   WHERE p.account_id = pm.id
     AND p.user_id    = pm.user_id
     AND p.party_type = 'customer'
) pin ON true
LEFT JOIN LATERAL (
  SELECT SUM(p.amount) AS total
    FROM public.payments p
   WHERE p.account_id = pm.id
     AND p.user_id    = pm.user_id
     AND p.party_type = 'supplier'
) pout ON true
LEFT JOIN LATERAL (
  SELECT SUM(e.amount) AS total
    FROM public.expenses e
   WHERE e.account_id = pm.id
     AND e.user_id    = pm.user_id
) exp ON true;

-- Views inherit privileges from base tables + need explicit grants for the API.
GRANT SELECT ON public.account_balances TO authenticated;
GRANT ALL    ON public.account_balances TO service_role;
