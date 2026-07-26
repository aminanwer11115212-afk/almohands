import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toProduct, type Product, type ProductRow } from "@/types/product";
import {
  canUseLocalData,
  fromLocalRow,
  localDelete,
  localInsert,
  localQuery,
  requireUserId,
} from "@/lib/data/local";

export type SortKey = "name" | "quantity" | "sale_price";

export interface ProductsQueryParams {
  q: string;
  sort: SortKey;
  asc: boolean;
}

export const productsQueryKey = (params: ProductsQueryParams) =>
  ["products", params] as const;

const SORT_COLUMNS: Record<SortKey, string> = {
  name: "name",
  quantity: "quantity",
  sale_price: "sale_price",
};

/** Offline-first read from the PowerSync mirror. */
async function fetchProductsLocal(params: ProductsQueryParams): Promise<Product[]> {
  const sortCol = SORT_COLUMNS[params.sort] ?? "name";
  const dir = params.asc ? "ASC" : "DESC";
  const q = params.q.trim();
  let sql = `SELECT * FROM products`;
  const args: unknown[] = [];
  if (q) {
    const like = `%${q.replace(/[%_]/g, " ")}%`;
    sql += ` WHERE (name LIKE ? OR barcode LIKE ? OR category LIKE ? OR part_number LIKE ? OR location LIKE ?)`;
    args.push(like, like, like, like, like);
  }
  sql += ` ORDER BY ${sortCol} ${dir}`;
  const rows = await localQuery<Record<string, unknown>>(sql, args);
  return rows.map((r) => toProduct(fromLocalRow<ProductRow>("products", r)));
}

export async function fetchProducts(params: ProductsQueryParams): Promise<Product[]> {
  if (canUseLocalData()) return fetchProductsLocal(params);

  let query = supabase
    .from("products")
    .select("*")
    .order(params.sort, { ascending: params.asc });

  const q = params.q.trim();
  if (q) {
    const safe = q.replace(/[,()]/g, " ");
    query = query.or(`name.ilike.%${safe}%,barcode.ilike.%${safe}%,category.ilike.%${safe}%,part_number.ilike.%${safe}%,location.ilike.%${safe}%`);
  }

  // Paginate to bypass PostgREST's 1000-row default cap; supports 10k+ products.
  const PAGE = 1000;
  const MAX = 20000;
  const all: any[] = [];
  for (let from = 0; from < MAX; from += PAGE) {
    const { data, error } = await query.range(from, from + PAGE - 1);
    if (error) throw error;
    const batch = data ?? [];
    all.push(...batch);
    if (batch.length < PAGE) break;
  }
  return all.map(toProduct);
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
      if (canUseLocalData()) {
        const userId = await requireUserId();
        await localDelete("products", p.id);
        await localInsert("audit_logs", {
          user_id: userId,
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
        });
        return;
      }

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
