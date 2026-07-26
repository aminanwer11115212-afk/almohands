import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  canUseLocalData,
  localDelete,
  localInsert,
  localQuery,
  requireUserId,
} from "@/lib/data/local";

export interface Expense {
  id: string;
  user_id: string;
  target: string;
  amount: number;
  date: string;
  notes: string | null;
  account_id: string | null;
  created_at: string;
}

export function useExpenses(opts?: { accountId?: string | null }) {
  return useQuery({
    queryKey: ["expenses", opts?.accountId ?? "all"],
    queryFn: async () => {
      if (canUseLocalData()) {
        let sql = `SELECT * FROM expenses`;
        const args: unknown[] = [];
        if (opts?.accountId) {
          sql += ` WHERE account_id = ?`;
          args.push(opts.accountId);
        }
        sql += ` ORDER BY date DESC`;
        return (await localQuery<Expense>(sql, args)) as Expense[];
      }

      let q = supabase.from("expenses").select("*").order("date", { ascending: false });
      if (opts?.accountId) q = q.eq("account_id", opts.accountId);
      const { data, error } = await q;
      if (error) throw error;
      return data as Expense[];
    },
  });
}

export function useAddExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      target: string;
      amount: number;
      date: string;
      notes?: string;
      account_id?: string | null;
    }) => {
      if (canUseLocalData()) {
        const userId = await requireUserId();
        await localInsert(
          "expenses",
          {
            user_id: userId,
            target: input.target,
            amount: input.amount,
            date: input.date,
            notes: input.notes || null,
            account_id: input.account_id || null,
          },
          { withUpdatedAt: true },
        );
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase.from("expenses").insert({
        user_id: user.id,
        target: input.target,
        amount: input.amount,
        date: input.date,
        notes: input.notes || null,
        account_id: input.account_id || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["account-balances"] });
    },
  });
}

export function useDeleteExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      if (canUseLocalData()) {
        await localDelete("expenses", id);
        return;
      }

      const { error } = await supabase.from("expenses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["account-balances"] });
    },
  });
}
