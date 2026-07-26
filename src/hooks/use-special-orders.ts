import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  canUseLocalData,
  genId,
  localQuery,
  localTransaction,
  localUpdate,
  nowIso,
  requireUserId,
} from "@/lib/data/local";

export type SpecialOrderPriority = "low" | "normal" | "high" | "urgent";
export type SpecialOrderStatus =
  | "requested"
  | "contacted"
  | "ordered"
  | "arrived"
  | "delivered"
  | "cancelled";

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
  invoice_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface SpecialOrderHistoryEntry {
  id: string;
  order_id: string;
  changed_by: string | null;
  from_status: SpecialOrderStatus | null;
  to_status: SpecialOrderStatus;
  reason: string | null;
  created_at: string;
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

/** Mirror of the remote trg_special_order_status_history trigger. */
async function insertLocalHistory(
  tx: { execute: (sql: string, params?: unknown[]) => Promise<unknown> },
  entry: {
    userId: string;
    orderId: string;
    fromStatus: SpecialOrderStatus | null;
    toStatus: SpecialOrderStatus;
    reason: string | null;
    now: string;
  },
): Promise<void> {
  await tx.execute(
    `INSERT INTO special_order_history (id, user_id, order_id, changed_by, from_status, to_status, reason, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      genId(),
      entry.userId,
      entry.orderId,
      entry.userId,
      entry.fromStatus,
      entry.toStatus,
      entry.reason,
      entry.now,
    ],
  );
}

async function readLocalOrderStatus(
  tx: { execute: (sql: string, params?: unknown[]) => Promise<unknown> },
  id: string,
): Promise<SpecialOrderStatus | null> {
  const res = (await tx.execute(`SELECT status FROM special_orders WHERE id = ?`, [id])) as {
    rows?: { _array?: { status?: SpecialOrderStatus }[] };
  };
  return res.rows?._array?.[0]?.status ?? null;
}

export function useSpecialOrders() {
  return useQuery({
    queryKey: ["special-orders"],
    queryFn: async () => {
      if (canUseLocalData()) {
        return localQuery<SpecialOrder>(`SELECT * FROM special_orders ORDER BY created_at DESC`);
      }

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
      if (canUseLocalData()) {
        const userId = await requireUserId();
        const now = nowIso();
        const orderId = genId();
        await localTransaction(async (tx) => {
          await tx.execute(
            `INSERT INTO special_orders (id, user_id, customer_id, customer_name, customer_phone, item_name, description, quantity, target_price, supplier_id, supplier_name, notes, priority, expected_at, status, invoice_id, cancellation_reason, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              orderId,
              userId,
              input.customer_id || null,
              input.customer_name || null,
              input.customer_phone || null,
              input.item_name,
              input.description || null,
              input.quantity,
              input.target_price ?? null,
              input.supplier_id || null,
              input.supplier_name || null,
              input.notes || null,
              input.priority,
              input.expected_at || null,
              "requested",
              null,
              null,
              now,
              now,
            ],
          );
          await insertLocalHistory(tx, {
            userId,
            orderId,
            fromStatus: null,
            toStatus: "requested",
            reason: null,
            now,
          });
        });
        return;
      }

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
      if (canUseLocalData()) {
        await localUpdate(
          "special_orders",
          input.id,
          {
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
          },
          { touchUpdatedAt: true },
        );
        return;
      }

      const { error } = await supabase
        .from("special_orders")
        .update({
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
        } as never)
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["special-orders"] }),
  });
}

export function useUpdateSpecialOrderStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      status: SpecialOrderStatus;
      cancellation_reason?: string | null;
    }) => {
      if (canUseLocalData()) {
        const userId = await requireUserId();
        const now = nowIso();
        const reason = input.status === "cancelled" ? input.cancellation_reason || null : null;
        await localTransaction(async (tx) => {
          const prev = await readLocalOrderStatus(tx, input.id);
          await tx.execute(
            `UPDATE special_orders SET status = ?, cancellation_reason = ?, updated_at = ? WHERE id = ?`,
            [input.status, reason, now, input.id],
          );
          if (prev !== input.status) {
            await insertLocalHistory(tx, {
              userId,
              orderId: input.id,
              fromStatus: prev,
              toStatus: input.status,
              reason,
              now,
            });
          }
        });
        return;
      }

      const { error } = await supabase
        .from("special_orders")
        .update({
          status: input.status,
          cancellation_reason:
            input.status === "cancelled" ? input.cancellation_reason || null : null,
        } as never)
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["special-orders"] }),
  });
}

export function useDeleteSpecialOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      if (canUseLocalData()) {
        await localTransaction(async (tx) => {
          await tx.execute(`DELETE FROM special_order_history WHERE order_id = ?`, [id]);
          await tx.execute(`DELETE FROM special_orders WHERE id = ?`, [id]);
        });
        return;
      }

      const { error } = await supabase.from("special_orders").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["special-orders"] }),
  });
}

/** Read chronological status history (newest first) for one order. */
export function useSpecialOrderHistory(orderId: string | null | undefined) {
  return useQuery({
    queryKey: ["special-order-history", orderId],
    enabled: !!orderId,
    queryFn: async () => {
      if (canUseLocalData()) {
        return localQuery<SpecialOrderHistoryEntry>(
          `SELECT * FROM special_order_history WHERE order_id = ? ORDER BY created_at DESC`,
          [orderId!],
        );
      }

      const { data, error } = await (
        supabase as unknown as {
          from: (t: string) => {
            select: (c: string) => {
              eq: (
                c: string,
                v: string,
              ) => {
                order: (
                  c: string,
                  o: { ascending: boolean },
                ) => Promise<{ data: SpecialOrderHistoryEntry[] | null; error: Error | null }>;
              };
            };
          };
        }
      )
        .from("special_order_history")
        .select("*")
        .eq("order_id", orderId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },

    staleTime: 5_000,
  });
}

/** Attach a saved invoice id to a special order (idempotent). */
export function useLinkSpecialOrderInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { orderId: string; invoiceId: string }) => {
      if (canUseLocalData()) {
        const userId = await requireUserId();
        const now = nowIso();
        await localTransaction(async (tx) => {
          const prev = await readLocalOrderStatus(tx, input.orderId);
          await tx.execute(
            `UPDATE special_orders SET invoice_id = ?, status = 'delivered', updated_at = ? WHERE id = ?`,
            [input.invoiceId, now, input.orderId],
          );
          if (prev !== "delivered") {
            await insertLocalHistory(tx, {
              userId,
              orderId: input.orderId,
              fromStatus: prev,
              toStatus: "delivered",
              reason: null,
              now,
            });
          }
        });
        return;
      }

      const { error } = await supabase
        .from("special_orders")
        .update({ invoice_id: input.invoiceId, status: "delivered" } as never)
        .eq("id", input.orderId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["special-orders"] }),
  });
}
