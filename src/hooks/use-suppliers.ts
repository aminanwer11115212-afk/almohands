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
