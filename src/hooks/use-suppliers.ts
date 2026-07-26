import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  canUseLocalData,
  localDelete,
  localInsert,
  localQuery,
  localUpdate,
  requireUserId,
} from "@/lib/data/local";

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

/** Offline-first read from the PowerSync mirror. */
async function fetchSuppliersLocal(q: string): Promise<Supplier[]> {
  const term = q.trim();
  let sql = `SELECT * FROM suppliers`;
  const args: unknown[] = [];
  if (term) {
    const like = `%${term.replace(/[%_]/g, " ")}%`;
    sql += ` WHERE (name LIKE ? OR phone LIKE ? OR address LIKE ?)`;
    args.push(like, like, like);
  }
  sql += ` ORDER BY name LIMIT 200`;
  const rows = await localQuery<Record<string, unknown>>(sql, args);
  return rows.map(toSupplier);
}

export function useSuppliers(q: string) {
  return useQuery({
    queryKey: ["suppliers", q],
    queryFn: async () => {
      if (canUseLocalData()) return fetchSuppliersLocal(q);

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
      if (canUseLocalData()) {
        const userId = await requireUserId();
        await localInsert(
          "suppliers",
          {
            user_id: userId,
            name: input.name,
            phone: input.phone || null,
            address: input.address || null,
            notes: input.notes || null,
            balance: 0,
          },
          { withUpdatedAt: true },
        );
        return;
      }

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
      if (canUseLocalData()) {
        await localUpdate(
          "suppliers",
          input.id,
          {
            name: input.name,
            phone: input.phone || null,
            address: input.address || null,
            notes: input.notes || null,
          },
          { touchUpdatedAt: true },
        );
        return;
      }

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
      if (canUseLocalData()) {
        const userId = await requireUserId();
        await localDelete("suppliers", s.id);
        await localInsert("audit_logs", {
          user_id: userId,
          action: "supplier.deleted",
          table_name: "suppliers",
          record_id: s.id,
          details: { name: s.name, phone: s.phone, address: s.address, balance: s.balance },
        });
        return;
      }

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
