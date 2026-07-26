import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { canUseLocalData, localQuery } from "@/lib/data/local";

export type AccountBalance = {
  account_id: string;
  user_id: string;
  name: string;
  type: "cash" | "bank" | string;
  bank_name: string | null;
  is_default: boolean;
  is_active: boolean;
  opening_balance: number;
  incoming: number;            // customer payments + invoice paid
  customer_payments: number;   // payments table (party=customer)
  invoice_paid: number;        // invoices.paid where payment_method_id = pm.id
  outgoing_supplier: number;   // supplier payments out
  outgoing_expense: number;    // expenses out
  balance: number;
};

type LocalBalanceRow = {
  account_id: string;
  user_id: string;
  name: string;
  type: string;
  bank_name: string | null;
  is_default: number | null;
  is_active: number | null;
  opening_balance: number | null;
  invoice_paid: number | null;
  customer_payments: number | null;
  outgoing_expense: number | null;
  outgoing_supplier: number | null;
};

/**
 * Offline-first equivalent of the Postgres `account_balances` view, computed
 * from the synced payment_methods / payments / expenses mirrors.
 */
async function fetchAccountBalancesLocal(): Promise<AccountBalance[]> {
  const rows = await localQuery<LocalBalanceRow>(
    `SELECT
       pm.id AS account_id,
       pm.user_id,
       pm.name,
       pm.type,
       pm.bank_name,
       pm.is_default,
       pm.is_active,
       COALESCE(pm.opening_balance, 0) AS opening_balance,
       COALESCE((SELECT SUM(p.amount) FROM payments p
                  WHERE p.account_id = pm.id AND p.invoice_id IS NOT NULL), 0) AS invoice_paid,
       COALESCE((SELECT SUM(p.amount) FROM payments p
                  WHERE p.account_id = pm.id AND p.party_type = 'customer' AND p.invoice_id IS NULL), 0) AS customer_payments,
       COALESCE((SELECT SUM(e.amount) FROM expenses e
                  WHERE e.account_id = pm.id), 0) AS outgoing_expense,
       COALESCE((SELECT SUM(p.amount) FROM payments p
                  WHERE p.account_id = pm.id AND p.party_type = 'supplier'), 0) AS outgoing_supplier
     FROM payment_methods pm
     ORDER BY pm.is_default DESC`,
  );

  return rows.map((r) => {
    const opening = Number(r.opening_balance ?? 0);
    const invoicePaid = Number(r.invoice_paid ?? 0);
    const customerPayments = Number(r.customer_payments ?? 0);
    const outgoingExpense = Number(r.outgoing_expense ?? 0);
    const outgoingSupplier = Number(r.outgoing_supplier ?? 0);
    const incoming = invoicePaid + customerPayments;
    return {
      account_id: r.account_id,
      user_id: r.user_id,
      name: r.name,
      type: r.type,
      bank_name: r.bank_name ?? null,
      is_default: r.is_default === 1,
      is_active: r.is_active === 1,
      opening_balance: opening,
      incoming,
      customer_payments: customerPayments,
      invoice_paid: invoicePaid,
      outgoing_supplier: outgoingSupplier,
      outgoing_expense: outgoingExpense,
      balance: opening + incoming - outgoingExpense - outgoingSupplier,
    };
  });
}

export function useAccountBalances() {
  return useQuery({
    queryKey: ["account-balances"],
    queryFn: async (): Promise<AccountBalance[]> => {
      if (canUseLocalData()) return fetchAccountBalancesLocal();

      // The DB view enforces per-user visibility via security_invoker + payment_methods RLS.
      const { data, error } = await supabase
        .from("account_balances" as never)
        .select("*")
        .order("is_default", { ascending: false });
      if (error) throw error;
      return ((data as unknown) as AccountBalance[]) ?? [];
    },
    staleTime: 20_000,
  });
}
