import type { Database } from "@/integrations/supabase/types";

export type ProductRow = Database["public"]["Tables"]["products"]["Row"];
export type ProductInsert = Database["public"]["Tables"]["products"]["Insert"];
export type ProductUpdate = Database["public"]["Tables"]["products"]["Update"];

export interface Product {
  id: string;
  name: string;
  barcode: string | null;
  category: string | null;
  unit: string;
  location: string | null;
  quantity: number;
  minQuantity: number;
  costPrice: number;
  salePrice: number;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export const toProduct = (r: ProductRow): Product => ({
  id: r.id,
  name: r.name,
  barcode: r.barcode,
  category: r.category,
  unit: r.unit,
  location: r.location,
  quantity: Number(r.quantity),
  minQuantity: Number(r.min_quantity),
  costPrice: Number(r.cost_price),
  salePrice: Number(r.sale_price),
  notes: r.notes,
  isActive: r.is_active,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});
