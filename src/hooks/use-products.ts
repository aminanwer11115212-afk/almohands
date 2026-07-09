import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toProduct, type Product } from "@/types/product";

export type SortKey = "name" | "quantity" | "sale_price";

export interface ProductsQueryParams {
  q: string;
  sort: SortKey;
  asc: boolean;
}

export const productsQueryKey = (params: ProductsQueryParams) =>
  ["products", params] as const;

export async function fetchProducts(params: ProductsQueryParams): Promise<Product[]> {
  let query = supabase
    .from("products")
    .select("*")
    .order(params.sort, { ascending: params.asc });

  const q = params.q.trim();
  if (q) {
    const safe = q.replace(/[,()]/g, " ");
    query = query.or(`name.ilike.%${safe}%,barcode.ilike.%${safe}%,category.ilike.%${safe}%`);
  }

  const { data, error } = await query.limit(500);
  if (error) throw error;
  return (data ?? []).map(toProduct);
}

export function useProducts(params: ProductsQueryParams) {
  return useQuery({
    queryKey: productsQueryKey(params),
    queryFn: () => fetchProducts(params),
    staleTime: 10_000,
  });
}

export function useDeleteProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: Product) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("products").delete().eq("id", p.id);
      if (error) throw error;
      if (u.user) {
        await supabase.from("audit_logs").insert({
          user_id: u.user.id,
          action: "product.deleted",
          table_name: "products",
          record_id: p.id,
          details: {
            name: p.name,
            barcode: p.barcode,
            quantity: p.quantity,
            cost_price: p.costPrice,
            sale_price: p.salePrice,
          },
        } as never);
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["products"] }),
  });
}
