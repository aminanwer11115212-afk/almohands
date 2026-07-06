import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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
      const { error } = await supabase.from("payment_methods").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["payment-methods"] }),
  });
}
