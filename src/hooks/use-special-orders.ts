import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type SpecialOrderPriority = "low" | "normal" | "high" | "urgent";
export type SpecialOrderStatus = "requested" | "contacted" | "ordered" | "arrived" | "delivered" | "cancelled";

export interface SpecialOrder {
  id: string;
  user_id: string;
  customer_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  item_name: string;
  description: string | null;
  quantity: number;
  target_price: number | null;
  supplier_id: string | null;
  supplier_name: string | null;
  notes: string | null;
  priority: SpecialOrderPriority;
  status: SpecialOrderStatus;
  cancellation_reason: string | null;
  expected_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SpecialOrderInput {
  customer_id?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  item_name: string;
  description?: string | null;
  quantity: number;
  target_price?: number | null;
  supplier_id?: string | null;
  supplier_name?: string | null;
  notes?: string | null;
  priority: SpecialOrderPriority;
  expected_at?: string | null;
}

export function useSpecialOrders() {
  return useQuery({
    queryKey: ["special-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("special_orders")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as SpecialOrder[];
    },
    staleTime: 10_000,
  });
}

export function useAddSpecialOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SpecialOrderInput) => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("غير مسجل الدخول");
      const { error } = await supabase.from("special_orders").insert({
        user_id: u.user.id,
        customer_id: input.customer_id || null,
        customer_name: input.customer_name || null,
        customer_phone: input.customer_phone || null,
        item_name: input.item_name,
        description: input.description || null,
        quantity: input.quantity,
        target_price: input.target_price ?? null,
        supplier_id: input.supplier_id || null,
        supplier_name: input.supplier_name || null,
        notes: input.notes || null,
        priority: input.priority,
        expected_at: input.expected_at || null,
        status: "requested",
      } as never);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["special-orders"] }),
  });
}

export function useUpdateSpecialOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string } & SpecialOrderInput) => {
      const { error } = await supabase.from("special_orders").update({
        customer_id: input.customer_id || null,
        customer_name: input.customer_name || null,
        customer_phone: input.customer_phone || null,
        item_name: input.item_name,
        description: input.description || null,
        quantity: input.quantity,
        target_price: input.target_price ?? null,
        supplier_id: input.supplier_id || null,
        supplier_name: input.supplier_name || null,
        notes: input.notes || null,
        priority: input.priority,
        expected_at: input.expected_at || null,
      } as never).eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["special-orders"] }),
  });
}

export function useUpdateSpecialOrderStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; status: SpecialOrderStatus; cancellation_reason?: string | null }) => {
      const { error } = await supabase.from("special_orders").update({
        status: input.status,
        cancellation_reason: input.status === "cancelled" ? (input.cancellation_reason || null) : null,
      } as never).eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["special-orders"] }),
  });
}

export function useDeleteSpecialOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("special_orders").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["special-orders"] }),
  });
}
