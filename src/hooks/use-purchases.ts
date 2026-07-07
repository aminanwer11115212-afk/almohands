import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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

export function usePurchases(q: string) {
  return useQuery({
    queryKey: ["purchases", q],
    queryFn: async () => {
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
