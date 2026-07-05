import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface Customer {
  id: string;
  name: string;
  phone: string | null;
  workshop: string | null;
  creditLimit: number;
  balance: number;
  notes: string | null;
  createdAt: string;
}

function toCustomer(row: any): Customer {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    workshop: row.workshop,
    creditLimit: Number(row.credit_limit),
    balance: Number(row.balance),
    notes: row.notes,
    createdAt: row.created_at,
  };
}

export function useCustomers(q: string) {
  return useQuery({
    queryKey: ["customers", q],
    queryFn: async () => {
      let query = supabase.from("customers").select("*").order("name");
      if (q.trim()) {
        const safe = q.trim().replace(/[,()]/g, " ");
        query = query.or(`name.ilike.%${safe}%,phone.ilike.%${safe}%,workshop.ilike.%${safe}%`);
      }
      const { data, error } = await query.limit(200);
      if (error) throw error;
      return (data ?? []).map(toCustomer);
    },
    staleTime: 10_000,
  });
}

export function useAddCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; phone?: string; workshop?: string; creditLimit?: number; notes?: string }) => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("غير مسجل الدخول");
      const { error } = await supabase.from("customers").insert({
        user_id: u.user.id,
        name: input.name,
        phone: input.phone || null,
        workshop: input.workshop || null,
        credit_limit: input.creditLimit ?? 0,
        notes: input.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["customers"] }),
  });
}
