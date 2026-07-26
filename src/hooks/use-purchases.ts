import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  canUseLocalData,
  genId,
  localQuery,
  localQueryOne,
  localTransaction,
  nowIso,
  requireUserId,
} from "@/lib/data/local";

export interface PurchaseRow {
  id: string;
  purchase_number: number;
  supplier_id: string | null;
  supplier_name: string | null;
  total: number;
  paid: number;
  remaining: number;
  status: string;
  notes: string | null;
  created_at: string;
}

export interface PurchaseItemInput {
  product_id?: string | null;
  product_name: string;
  quantity: number;
  cost_price: number;
}

/** Offline-first read from the PowerSync mirror. */
async function fetchPurchasesLocal(q: string): Promise<PurchaseRow[]> {
  const term = q.trim();
  let sql = `SELECT * FROM purchases`;
  const args: unknown[] = [];
  if (term) {
    const like = `%${term.replace(/[%_]/g, " ")}%`;
    const asNum = Number(term);
    if (Number.isInteger(asNum) && asNum > 0) {
      sql += ` WHERE (purchase_number = ? OR supplier_name LIKE ?)`;
      args.push(asNum, like);
    } else {
      sql += ` WHERE supplier_name LIKE ?`;
      args.push(like);
    }
  }
  sql += ` ORDER BY created_at DESC LIMIT 200`;
  return localQuery<PurchaseRow>(sql, args);
}

export function usePurchases(q: string) {
  return useQuery({
    queryKey: ["purchases", q],
    queryFn: async () => {
      if (canUseLocalData()) return fetchPurchasesLocal(q);

      let query = supabase
        .from("purchases")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (q.trim()) {
        const safe = q.trim().replace(/[,()]/g, " ");
        const asNum = Number(safe);
        if (Number.isInteger(asNum) && asNum > 0) {
          query = query.or(`purchase_number.eq.${asNum},supplier_name.ilike.%${safe}%`);
        } else {
          query = query.ilike("supplier_name", `%${safe}%`);
        }
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as PurchaseRow[];
    },
    staleTime: 10_000,
  });
}

export function usePurchase(id: string | null) {
  return useQuery({
    enabled: !!id,
    queryKey: ["purchase", id],
    queryFn: async () => {
      if (canUseLocalData()) {
        const [purchase, items] = await Promise.all([
          localQueryOne<PurchaseRow>(`SELECT * FROM purchases WHERE id = ?`, [id!]),
          localQuery<any>(
            `SELECT * FROM purchase_items WHERE purchase_id = ? ORDER BY created_at`,
            [id!],
          ),
        ]);
        return { purchase, items };
      }

      const [p, items] = await Promise.all([
        supabase.from("purchases").select("*").eq("id", id!).maybeSingle(),
        supabase.from("purchase_items").select("*").eq("purchase_id", id!).order("created_at"),
      ]);
      if (p.error) throw p.error;
      if (items.error) throw items.error;
      return { purchase: p.data as PurchaseRow | null, items: items.data ?? [] };
    },
  });
}

export function useCreatePurchase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      supplier_id?: string | null;
      supplier_name?: string;
      paid: number;
      notes?: string;
      items: PurchaseItemInput[];
    }) => {
      if (canUseLocalData()) {
        const userId = await requireUserId();
        if (input.items.length === 0) throw new Error("أضف صنفاً واحداً على الأقل");

        const total = input.items.reduce(
          (s, it) => s + Number(it.cost_price) * Number(it.quantity),
          0,
        );
        const paid = Math.max(0, Math.min(Number(input.paid) || 0, total));
        const remaining = total - paid;
        const status = remaining <= 0 ? "paid" : paid > 0 ? "partial" : "pending";

        const purchaseId = genId();
        const now = nowIso();

        return localTransaction(async (tx) => {
          // Sequence number: mirrors the remote assign_purchase_number trigger,
          // which skips assignment when we provide a non-zero number.
          const seq = (await tx.execute(
            `SELECT COALESCE(MAX(purchase_number), 0) + 1 AS n FROM purchases`,
          )) as { rows?: { _array?: { n: number }[] } };
          const purchaseNumber = Number(seq.rows?._array?.[0]?.n ?? 1);

          await tx.execute(
            `INSERT INTO purchases (id, user_id, purchase_number, supplier_id, supplier_name, total, paid, remaining, status, notes, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              purchaseId,
              userId,
              purchaseNumber,
              input.supplier_id || null,
              input.supplier_name || null,
              total,
              paid,
              remaining,
              status,
              input.notes || null,
              now,
              now,
            ],
          );

          for (const it of input.items) {
            await tx.execute(
              `INSERT INTO purchase_items (id, user_id, purchase_id, product_id, product_name, quantity, cost_price, total, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                genId(),
                userId,
                purchaseId,
                it.product_id || null,
                it.product_name,
                Number(it.quantity),
                Number(it.cost_price),
                Number(it.cost_price) * Number(it.quantity),
                now,
              ],
            );
            // Mirror the remote increment_stock_on_purchase trigger so stock
            // reflects the purchase immediately while offline. price_history is
            // left to the remote trigger (it syncs back) to avoid duplicates.
            if (it.product_id) {
              await tx.execute(
                `UPDATE products
                    SET quantity = quantity + ?,
                        cost_price = CASE WHEN ? > 0 THEN ? ELSE cost_price END,
                        updated_at = ?
                  WHERE id = ?`,
                [
                  Number(it.quantity),
                  Number(it.cost_price),
                  Number(it.cost_price),
                  now,
                  it.product_id,
                ],
              );
            }
          }

          const row: PurchaseRow = {
            id: purchaseId,
            purchase_number: purchaseNumber,
            supplier_id: input.supplier_id || null,
            supplier_name: input.supplier_name || null,
            total,
            paid,
            remaining,
            status,
            notes: input.notes || null,
            created_at: now,
          };
          return row;
        });
      }

      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("غير مسجل الدخول");
      if (input.items.length === 0) throw new Error("أضف صنفاً واحداً على الأقل");

      const total = input.items.reduce(
        (s, it) => s + Number(it.cost_price) * Number(it.quantity),
        0,
      );
      const paid = Math.max(0, Math.min(Number(input.paid) || 0, total));
      const remaining = total - paid;
      const status = remaining <= 0 ? "paid" : paid > 0 ? "partial" : "pending";

      const { data: purchase, error: pErr } = await supabase
        .from("purchases")
        .insert({
          user_id: u.user.id,
          supplier_id: input.supplier_id || null,
          supplier_name: input.supplier_name || null,
          total,
          paid,
          remaining,
          status,
          notes: input.notes || null,
        })
        .select()
        .single();
      if (pErr) throw pErr;

      const rows = input.items.map((it) => ({
        user_id: u.user!.id,
        purchase_id: purchase.id,
        product_id: it.product_id || null,
        product_name: it.product_name,
        quantity: Number(it.quantity),
        cost_price: Number(it.cost_price),
        total: Number(it.cost_price) * Number(it.quantity),
      }));
      const { error: iErr } = await supabase.from("purchase_items").insert(rows);
      if (iErr) throw iErr;

      return purchase as PurchaseRow;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchases"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["price-history"] });
    },
  });
}
