import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  canUseLocalData,
  localInsert,
  localQuery,
  localTransaction,
  nowIso,
  requireUserId,
} from "@/lib/data/local";

export type ReturnStatus = "pending" | "accepted" | "rejected";

export interface ReturnItem {
  id: string;
  user_id: string;
  invoice_id: string | null;
  product_id: string | null;
  product_name: string;
  quantity: number;
  reason: string | null;
  status: ReturnStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export function useReturns() {
  return useQuery({
    queryKey: ["returns"],
    queryFn: async () => {
      if (canUseLocalData()) {
        return localQuery<ReturnItem>(`SELECT * FROM returns ORDER BY created_at DESC`);
      }

      const { data, error } = await supabase
        .from("returns")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as ReturnItem[];
    },
  });
}

export function useAddReturn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      product_name: string;
      quantity: number;
      reason?: string;
      product_id?: string;
      invoice_id?: string;
    }) => {
      if (canUseLocalData()) {
        const userId = await requireUserId();
        await localInsert(
          "returns",
          {
            user_id: userId,
            product_name: input.product_name,
            quantity: input.quantity,
            reason: input.reason || null,
            product_id: input.product_id || null,
            invoice_id: input.invoice_id || null,
            // Remote relies on the DB default; there are no defaults locally.
            status: "pending",
          },
          { withUpdatedAt: true },
        );
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase.from("returns").insert({
        user_id: user.id,
        product_name: input.product_name,
        quantity: input.quantity,
        reason: input.reason || null,
        product_id: input.product_id || null,
        invoice_id: input.invoice_id || null,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["returns"] }),
  });
}

export function useUpdateReturnStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status, notes }: { id: string; status: ReturnStatus; notes?: string }) => {
      if (canUseLocalData()) {
        const now = nowIso();
        await localTransaction(async (tx) => {
          const res = (await tx.execute(`SELECT * FROM returns WHERE id = ?`, [id])) as {
            rows?: { _array?: { status?: string; product_id?: string | null; quantity?: number }[] };
          };
          const prev = res.rows?._array?.[0];

          await tx.execute(
            `UPDATE returns SET status = ?, notes = ?, updated_at = ? WHERE id = ?`,
            [status, notes || null, now, id],
          );

          // Mirror the remote restore_stock_on_return_accepted trigger.
          if (status === "accepted" && prev && prev.status !== "accepted" && prev.product_id) {
            await tx.execute(
              `UPDATE products SET quantity = quantity + ?, updated_at = ? WHERE id = ?`,
              [Number(prev.quantity) || 0, now, prev.product_id],
            );
          }
        });
        return;
      }

      const { error } = await supabase
        .from("returns")
        .update({ status, notes: notes || null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["returns"] });
      qc.invalidateQueries({ queryKey: ["products"] });
    },
  });
}
