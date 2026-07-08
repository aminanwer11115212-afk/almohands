import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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

export function useAccountBalances() {
  return useQuery({
    queryKey: ["account-balances"],
    queryFn: async (): Promise<AccountBalance[]> => {
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
