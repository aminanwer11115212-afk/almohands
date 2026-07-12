/* Product audit-log helpers. Extracted so tests can drive them against a
 * hand-rolled Supabase mock without spinning up the real client. */

export type MinimalAuditSupabase = {
  auth: { getUser: () => Promise<{ data: { user: { id: string } | null } }> };
  from: (table: string) => {
    insert: (row: Record<string, unknown>) => Promise<{ error: unknown }>;
  };
};

export type ProductAuditAction = "product.created" | "product.updated" | "product.deleted";

export type ProductAuditDetails = {
  name?: string | null;
  barcode?: string | null;
  quantity?: number | null;
  cost_price?: number | null;
  sale_price?: number | null;
  reason?: string | null;
  changes?: Record<string, { from: unknown; to: unknown }>;
};

/** Insert a product audit row. Never throws — auditing must not break the
 *  main mutation flow. Returns whether the row was inserted. */
export async function logProductAudit(
  supabase: MinimalAuditSupabase,
  action: ProductAuditAction,
  productId: string,
  details: ProductAuditDetails,
): Promise<boolean> {
  try {
    const { data } = await supabase.auth.getUser();
    const uid = data.user?.id;
    if (!uid) return false;
    const { error } = await supabase.from("audit_logs").insert({
      user_id: uid,
      action,
      table_name: "products",
      record_id: productId,
      details,
    });
    return !error;
  } catch {
    return false;
  }
}

/** Compute a compact diff between the previous product row and the next one. */
export function diffProduct(
  prev: Record<string, unknown>,
  next: Record<string, unknown>,
  fields: readonly string[],
): Record<string, { from: unknown; to: unknown }> {
  const out: Record<string, { from: unknown; to: unknown }> = {};
  for (const f of fields) {
    const a = prev[f] ?? null;
    const b = next[f] ?? null;
    if (a !== b) out[f] = { from: a, to: b };
  }
  return out;
}

export const PRODUCT_AUDIT_FIELDS = [
  "name", "barcode", "part_number", "category", "unit", "location",
  "quantity", "min_quantity", "cost_price", "sale_price", "notes",
] as const;
