import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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
