import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface Supplier {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  balance: number;
  notes: string | null;
  createdAt: string;
}

function toSupplier(row: any): Supplier {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    address: row.address,
    balance: Number(row.balance),
    notes: row.notes,
    createdAt: row.created_at,
  };
}

export function useSuppliers(q: string) {
  return useQuery({
    queryKey: ["suppliers", q],
    queryFn: async () => {
      let query = supabase.from("suppliers").select("*").order("name");
      if (q.trim()) {
        const safe = q.trim().replace(/[,()]/g, " ");
        query = query.or(`name.ilike.%${safe}%,phone.ilike.%${safe}%,address.ilike.%${safe}%`);
      }
      const { data, error } = await query.limit(200);
      if (error) throw error;
      return (data ?? []).map(toSupplier);
    },
    staleTime: 10_000,
  });
}

export function useAddSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; phone?: string; address?: string; notes?: string }) => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("غير مسجل الدخول");
      const { error } = await supabase.from("suppliers").insert({
        user_id: u.user.id,
        name: input.name,
        phone: input.phone || null,
        address: input.address || null,
        notes: input.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["suppliers"] }),
  });
}

export function useUpdateSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; name: string; phone?: string; address?: string; notes?: string }) => {
      const { error } = await supabase.from("suppliers").update({
        name: input.name,
        phone: input.phone || null,
        address: input.address || null,
        notes: input.notes || null,
      } as never).eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["suppliers"] }),
  });
}

export function useDeleteSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (s: Supplier) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("suppliers").delete().eq("id", s.id);
      if (error) throw error;
      if (u.user) {
        await supabase.from("audit_logs").insert({
          user_id: u.user.id,
          action: "supplier.deleted",
          table_name: "suppliers",
          record_id: s.id,
          details: { name: s.name, phone: s.phone, address: s.address, balance: s.balance },
        } as never);
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["suppliers"] }),
  });
}
