import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  canUseLocalData,
  fromLocalRow,
  localDelete,
  localExecute,
  localInsert,
  localQuery,
  localQueryOne,
  localUpdate,
  nowIso,
  requireUserId,
} from "@/lib/data/local";

export type PaymentMethodType = "cash" | "bank";

export type PaymentMethod = {
  id: string;
  user_id: string;
  name: string;
  type: PaymentMethodType;
  bank_name: string | null;
  account_number: string | null;
  account_holder: string | null;
  iban: string | null;
  notes: string | null;
  is_active: boolean;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

export type PaymentMethodInput = {
  name: string;
  type: PaymentMethodType;
  bank_name?: string | null;
  account_number?: string | null;
  account_holder?: string | null;
  iban?: string | null;
  notes?: string | null;
  is_active?: boolean;
  is_default?: boolean;
};

export function usePaymentMethods(activeOnly = false) {
  return useQuery({
    queryKey: ["payment-methods", activeOnly],
    queryFn: async (): Promise<PaymentMethod[]> => {
      if (canUseLocalData()) {
        let sql = `SELECT * FROM payment_methods`;
        if (activeOnly) sql += ` WHERE is_active = 1`;
        sql += ` ORDER BY is_default DESC, created_at ASC`;
        const rows = await localQuery<Record<string, unknown>>(sql);
        return rows.map((r) => fromLocalRow<PaymentMethod>("payment_methods", r));
      }

      let q = supabase.from("payment_methods").select("*").order("is_default", { ascending: false }).order("created_at", { ascending: true });
      if (activeOnly) q = q.eq("is_active", true);
      const { data, error } = await q;
      if (error) throw error;
      return (data as PaymentMethod[]) ?? [];
    },
    staleTime: 30_000,
  });
}

async function getUid() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  const uid = data.user?.id;
  if (!uid) throw new Error("يجب تسجيل الدخول");
  return uid;
}

async function clearOtherDefaultsLocal(uid: string, exceptId?: string) {
  let sql = `UPDATE payment_methods SET is_default = 0, updated_at = ? WHERE user_id = ? AND is_default = 1`;
  const args: unknown[] = [nowIso(), uid];
  if (exceptId) {
    sql += ` AND id != ?`;
    args.push(exceptId);
  }
  await localExecute(sql, args);
}

async function getPaymentMethodLocal(id: string): Promise<PaymentMethod> {
  const row = await localQueryOne<Record<string, unknown>>(
    `SELECT * FROM payment_methods WHERE id = ?`,
    [id],
  );
  if (!row) throw new Error("طريقة الدفع غير موجودة");
  return fromLocalRow<PaymentMethod>("payment_methods", row);
}

async function clearOtherDefaults(uid: string, exceptId?: string) {
  let q = supabase.from("payment_methods").update({ is_default: false }).eq("user_id", uid).eq("is_default", true);
  if (exceptId) q = q.neq("id", exceptId);
  const { error } = await q;
  if (error) throw error;
}

export function useCreatePaymentMethod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: PaymentMethodInput) => {
      if (canUseLocalData()) {
        const userId = await requireUserId();
        if (input.is_default) await clearOtherDefaultsLocal(userId);
        const id = await localInsert(
          "payment_methods",
          {
            user_id: userId,
            name: input.name,
            type: input.type,
            bank_name: input.bank_name ?? null,
            account_number: input.account_number ?? null,
            account_holder: input.account_holder ?? null,
            iban: input.iban ?? null,
            notes: input.notes ?? null,
            is_active: input.is_active ?? true,
            is_default: input.is_default ?? false,
            opening_balance: 0,
          },
          { withUpdatedAt: true },
        );
        return getPaymentMethodLocal(id);
      }

      const uid = await getUid();
      if (input.is_default) await clearOtherDefaults(uid);
      const { data, error } = await supabase
        .from("payment_methods")
        .insert({ user_id: uid, ...input })
        .select("*")
        .single();
      if (error) throw error;
      return data as PaymentMethod;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["payment-methods"] }),
  });
}

export function useUpdatePaymentMethod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<PaymentMethodInput> }) => {
      if (canUseLocalData()) {
        const userId = await requireUserId();
        if (patch.is_default) await clearOtherDefaultsLocal(userId, id);
        await localUpdate("payment_methods", id, { ...patch }, { touchUpdatedAt: true });
        return getPaymentMethodLocal(id);
      }

      const uid = await getUid();
      if (patch.is_default) await clearOtherDefaults(uid, id);
      const { data, error } = await supabase
        .from("payment_methods")
        .update(patch)
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return data as PaymentMethod;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["payment-methods"] }),
  });
}

export function useDeletePaymentMethod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      if (canUseLocalData()) {
        await localDelete("payment_methods", id);
        return;
      }

      const { error } = await supabase.from("payment_methods").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["payment-methods"] }),
  });
}
