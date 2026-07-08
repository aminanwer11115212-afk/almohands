/**
 * Pure, testable core of the "save invoice edits" transaction used by
 * `src/routes/invoices.$invoiceId.tsx`. Extracted so we can unit-test the
 * pre-flight / re-check / stock-consistency logic against a mock Supabase
 * client, including two concurrent sessions racing each other.
 *
 * The function speaks a tiny subset of the supabase-js interface — enough
 * that a real `SupabaseClient` satisfies it via structural typing, and a
 * hand-rolled mock in tests can too.
 */

import { invoiceEditRowsSchema, type InvoiceItemEdit } from "@/lib/schemas";

export type SaveInvoiceInput = {
  invoice: {
    id: string;
    invoice_number: number;
    paid: number;
  };
  rows: InvoiceItemEdit[];
};

export type SaveInvoiceResult = {
  newTotal: number;
  paid: number;
  remaining: number;
  status: "paid" | "partial" | "pending";
};

/**
 * Minimal shape of the supabase-js query builder that we exercise.
 * The real client is structurally compatible; tests provide a fake.
 */
export type MinimalSupabase = {
  from(table: string): {
    select: (cols: string) => {
      in: (col: string, vals: string[]) => Promise<{ data: any[] | null; error: any }>;
      eq: (col: string, val: string) => {
        maybeSingle: () => Promise<{ data: any | null; error: any }>;
      };
    };
    update: (values: Record<string, any>) => {
      eq: (col: string, val: string) => Promise<{ error: any }>;
    };
  };
};

/**
 * Run the full save transaction:
 *   1. Zod-validate rows
 *   2. Pre-flight stock check for INCREASED quantities
 *   3. Persist each item row
 *   4. Re-read product stock and apply delta with a >=0 guard (race safety)
 *   5. Recompute invoice totals and update the invoice header
 *
 * Throws with a user-facing Arabic message on any failure so the calling
 * mutation surface can pass it straight to `toast`.
 */
export async function saveInvoiceEdits(
  supabase: MinimalSupabase,
  input: SaveInvoiceInput,
): Promise<SaveInvoiceResult> {
  const parsed = invoiceEditRowsSchema.safeParse(input.rows);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const rowIdx = typeof first?.path?.[0] === "number" ? (first.path[0] as number) + 1 : 0;
    const field = first?.path?.[1];
    const label = field === "quantity" ? "الكمية" : field === "unit_price" ? "سعر الوحدة" : "الحقل";
    const msg = rowIdx
      ? `الصف ${rowIdx} — ${label}: ${first?.message ?? "قيمة غير صالحة"}`
      : (first?.message ?? "بيانات غير صالحة");
    throw new Error(msg);
  }
  const rows = parsed.data;

  // ---- 1) Pre-flight stock check for increased quantities ----
  const increases = rows.filter((r) => r.product_id && r.quantity > r._origQty);
  if (increases.length > 0) {
    const ids = Array.from(new Set(increases.map((r) => r.product_id!) as string[]));
    const { data: prods, error } = await supabase.from("products").select("id, name, quantity").in("id", ids);
    if (error) throw error;
    const map = new Map<string, { id: string; name: string; quantity: number }>();
    for (const p of prods ?? []) map.set(p.id, { id: p.id, name: p.name, quantity: Number(p.quantity) || 0 });
    for (const r of increases) {
      const p = map.get(r.product_id!);
      if (!p) continue;
      const delta = r.quantity - r._origQty;
      if (p.quantity < delta) {
        const shortage = delta - p.quantity;
        throw new Error(
          `الكمية المطلوبة للصنف "${p.name}" تتجاوز المخزون المتاح (متبقٍ ${p.quantity}، النقص ${shortage}).`,
        );
      }
    }
  }

  // ---- 2) Persist item rows ----
  for (const row of rows) {
    const lineTotal = row.quantity * row.unit_price;
    const { error } = await supabase
      .from("invoice_items")
      .update({ quantity: row.quantity, unit_price: row.unit_price, line_total: lineTotal })
      .eq("id", row.id);
    if (error) throw error;
  }

  // ---- 3) Apply stock deltas with a race-safe re-check ----
  for (const row of rows) {
    const delta = row.quantity - row._origQty;
    if (delta === 0 || !row.product_id) continue;
    const { data: prod, error: prodErr } = await supabase
      .from("products").select("quantity").eq("id", row.product_id).maybeSingle();
    if (prodErr) throw prodErr;
    if (!prod) continue;
    const currentQty = Number(prod.quantity) || 0;
    const newQty = currentQty - delta;
    if (newQty < 0) {
      throw new Error("تعذّر تحديث المخزون — تغيّر رصيد الصنف قبل الحفظ. أعد المحاولة.");
    }
    const { error: stockErr } = await supabase
      .from("products").update({ quantity: newQty }).eq("id", row.product_id);
    if (stockErr) throw stockErr;
  }

  // ---- 4) Recompute totals ----
  const newTotal = rows.reduce((s, r) => s + r.quantity * r.unit_price, 0);
  const paid = Math.min(Number(input.invoice.paid) || 0, newTotal);
  const remaining = Math.max(0, newTotal - paid);
  const status: SaveInvoiceResult["status"] =
    newTotal === 0 ? "paid" : remaining === 0 ? "paid" : paid > 0 ? "partial" : "pending";

  const { error: invErr } = await supabase
    .from("invoices")
    .update({ total: newTotal, paid, remaining, status })
    .eq("id", input.invoice.id);
  if (invErr) throw invErr;

  return { newTotal, paid, remaining, status };
}
