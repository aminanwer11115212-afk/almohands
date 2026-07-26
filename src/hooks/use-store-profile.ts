import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  canUseLocalData,
  fromLocalRow,
  localInsert,
  localQueryOne,
  localUpdate,
  requireUserId,
} from "@/lib/data/local";

export type StoreProfile = {
  id: string;
  user_id: string;
  name: string;
  phone: string;
  address: string;
  tax_number: string;
  currency: string;
  logo_url: string | null;
  invoice_header: string;
  invoice_footer: string;
  show_logo: boolean;
  show_tax: boolean;
  show_qr: boolean;
  print_size: string;
  print_copies: number;
  auto_print: boolean;
};

export type StoreProfileInput = Partial<Omit<StoreProfile, "id" | "user_id">>;

async function fetchStoreProfile(): Promise<StoreProfile | null> {
  if (canUseLocalData()) {
    let uid: string;
    try {
      uid = await requireUserId();
    } catch {
      return null;
    }
    const row = await localQueryOne<Record<string, unknown>>(
      `SELECT * FROM store_profile WHERE user_id = ? LIMIT 1`,
      [uid],
    );
    return row ? fromLocalRow<StoreProfile>("store_profile", row) : null;
  }

  const { data: session } = await supabase.auth.getSession();
  const uid = session.session?.user?.id;
  if (!uid) return null;
  const { data, error } = await supabase
    .from("store_profile")
    .select("*")
    .eq("user_id", uid)
    .maybeSingle();
  if (error) throw error;
  return (data as StoreProfile | null) ?? null;
}

export function useStoreProfile() {
  return useQuery({
    queryKey: ["store-profile"],
    queryFn: fetchStoreProfile,
    staleTime: 60_000,
  });
}

export function useSaveStoreProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: StoreProfileInput) => {
      if (canUseLocalData()) {
        const uid = await requireUserId();
        // Emulate the remote upsert on user_id: one profile row per user.
        const existing = await localQueryOne<{ id: string }>(
          `SELECT id FROM store_profile WHERE user_id = ? LIMIT 1`,
          [uid],
        );
        let id: string;
        if (existing) {
          id = existing.id;
          await localUpdate("store_profile", id, { ...input }, { touchUpdatedAt: true });
        } else {
          id = await localInsert(
            "store_profile",
            { user_id: uid, ...input },
            { withUpdatedAt: true },
          );
        }
        const row = await localQueryOne<Record<string, unknown>>(
          `SELECT * FROM store_profile WHERE id = ?`,
          [id],
        );
        if (!row) throw new Error("تعذر حفظ بيانات المتجر");
        return fromLocalRow<StoreProfile>("store_profile", row);
      }

      const { data: session } = await supabase.auth.getSession();
      const uid = session.session?.user?.id;
      if (!uid) throw new Error("يجب تسجيل الدخول");
      const { data, error } = await supabase
        .from("store_profile")
        .upsert({ user_id: uid, ...input }, { onConflict: "user_id" })
        .select("*")
        .single();
      if (error) throw error;
      return data as StoreProfile;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["store-profile"] }),
  });
}
