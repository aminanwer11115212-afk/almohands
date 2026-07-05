import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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
