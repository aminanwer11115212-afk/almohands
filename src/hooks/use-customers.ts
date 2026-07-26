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

export interface Customer {
  id: string;
  name: string;
  phone: string | null;
  workshop: string | null;
  address: string | null;
  creditLimit: number;
  balance: number;
  notes: string | null;
  createdAt: string;
  // Aggregated finance snapshot (from invoices):
  invoicesCount: number;
  totalInvoiced: number;
  totalPaid: number;
  totalRemaining: number;
}

function toCustomer(row: any, agg?: { count: number; total: number; paid: number; remaining: number }): Customer {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    workshop: row.workshop,
    address: row.address ?? null,
    creditLimit: Number(row.credit_limit),
    balance: Number(row.balance),
    notes: row.notes,
    createdAt: row.created_at,
    invoicesCount: agg?.count ?? 0,
    totalInvoiced: agg?.total ?? 0,
    totalPaid: agg?.paid ?? 0,
    totalRemaining: agg?.remaining ?? 0,
  };
}

/** Offline-first read from the PowerSync mirror. */
async function fetchCustomersLocal(q: string): Promise<Customer[]> {
  const term = q.trim();
  let sql = `SELECT * FROM customers`;
  const args: unknown[] = [];
  if (term) {
    const like = `%${term.replace(/[%_]/g, " ")}%`;
    sql += ` WHERE (name LIKE ? OR phone LIKE ? OR workshop LIKE ?)`;
    args.push(like, like, like);
  }
  sql += ` ORDER BY name LIMIT 200`;
  const customers = await localQuery<Record<string, unknown>>(sql, args);
  if (customers.length === 0) return [];

  // Aggregate invoices per customer in a single query.
  const ids = customers.map((c) => c.id as string);
  const placeholders = ids.map(() => "?").join(", ");
  const invAgg = await localQuery<{
    customer_id: string;
    n: number;
    total: number | null;
    paid: number | null;
    remaining: number | null;
  }>(
    `SELECT customer_id, COUNT(*) as n, SUM(total) as total, SUM(paid) as paid, SUM(remaining) as remaining
     FROM invoices WHERE customer_id IN (${placeholders}) GROUP BY customer_id`,
    ids,
  );

  const agg = new Map<string, { count: number; total: number; paid: number; remaining: number }>();
  for (const row of invAgg) {
    if (!row.customer_id) continue;
    agg.set(row.customer_id, {
      count: Number(row.n) || 0,
      total: Number(row.total) || 0,
      paid: Number(row.paid) || 0,
      remaining: Number(row.remaining) || 0,
    });
  }
  return customers.map((c) => toCustomer(c, agg.get(c.id as string)));
}

export function useCustomers(q: string) {
  return useQuery({
    queryKey: ["customers", q],
    queryFn: async () => {
      if (canUseLocalData()) return fetchCustomersLocal(q);

      let query = supabase.from("customers").select("*").order("name");
      if (q.trim()) {
        const safe = q.trim().replace(/[,()]/g, " ");
        query = query.or(`name.ilike.%${safe}%,phone.ilike.%${safe}%,workshop.ilike.%${safe}%`);
      }
      const { data, error } = await query.limit(200);
      if (error) throw error;
      const customers = data ?? [];
      if (customers.length === 0) return [];

      // Aggregate invoices per customer in a single query.
      const ids = customers.map((c: any) => c.id);
      const { data: invs, error: iErr } = await supabase
        .from("invoices")
        .select("customer_id, total, paid, remaining")
        .in("customer_id", ids);
      if (iErr) throw iErr;

      const agg = new Map<string, { count: number; total: number; paid: number; remaining: number }>();
      for (const inv of invs ?? []) {
        const cid = (inv as any).customer_id as string | null;
        if (!cid) continue;
        const cur = agg.get(cid) ?? { count: 0, total: 0, paid: 0, remaining: 0 };
        cur.count += 1;
        cur.total += Number((inv as any).total) || 0;
        cur.paid += Number((inv as any).paid) || 0;
        cur.remaining += Number((inv as any).remaining) || 0;
        agg.set(cid, cur);
      }
      return customers.map((c: any) => toCustomer(c, agg.get(c.id)));
    },
    staleTime: 10_000,
  });
}


export function useAddCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; phone?: string; workshop?: string; address?: string; creditLimit?: number; notes?: string }) => {
      if (canUseLocalData()) {
        const userId = await requireUserId();
        await localInsert(
          "customers",
          {
            user_id: userId,
            name: input.name,
            phone: input.phone || null,
            workshop: input.workshop || null,
            address: input.address || null,
            credit_limit: input.creditLimit ?? 0,
            notes: input.notes || null,
            balance: 0,
          },
          { withUpdatedAt: true },
        );
        return;
      }

      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("غير مسجل الدخول");
      const { error } = await supabase.from("customers").insert({
        user_id: u.user.id,
        name: input.name,
        phone: input.phone || null,
        workshop: input.workshop || null,
        address: input.address || null,
        credit_limit: input.creditLimit ?? 0,
        notes: input.notes || null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["customers"] }),
  });
}

export function useUpdateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; name: string; phone?: string; workshop?: string; address?: string; creditLimit?: number; notes?: string }) => {
      if (canUseLocalData()) {
        await localUpdate(
          "customers",
          input.id,
          {
            name: input.name,
            phone: input.phone || null,
            workshop: input.workshop || null,
            address: input.address || null,
            credit_limit: input.creditLimit ?? 0,
            notes: input.notes || null,
          },
          { touchUpdatedAt: true },
        );
        return;
      }

      const { error } = await supabase.from("customers").update({
        name: input.name,
        phone: input.phone || null,
        workshop: input.workshop || null,
        address: input.address || null,
        credit_limit: input.creditLimit ?? 0,
        notes: input.notes || null,
      } as never).eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["customers"] }),
  });
}

export function useDeleteCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      if (canUseLocalData()) {
        await localDelete("customers", id);
        return;
      }

      const { error } = await supabase.from("customers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["customers"] }),
  });
}
