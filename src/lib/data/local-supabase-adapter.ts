/**
 * MinimalSupabase implemented against the local PowerSync mirror.
 *
 * `saveInvoiceEdits` (src/lib/invoice-save.ts) speaks a tiny structural subset
 * of the supabase-js query builder. This adapter implements that same subset
 * with plain SQL over the local SQLite mirror so the exact same business logic
 * runs offline-first without modification:
 *   - from(t).select(cols).in(col, vals)          → SELECT … WHERE col IN (…)
 *   - from(t).select(cols).eq(col, v).maybeSingle → SELECT … WHERE col = ? LIMIT 1
 *   - from(t).update(values).eq(col, v)           → UPDATE … SET … WHERE col = ?
 *
 * Values are converted for SQLite (booleans → 0/1, objects → JSON text,
 * undefined → null) on write, and rows converted back to Postgres shapes on
 * read via fromLocalRow.
 */

import type { MinimalSupabase } from "@/lib/invoice-save";
import {
  canUseLocalData,
  fromLocalRow,
  localExecute,
  localQuery,
  localQueryOne,
  nowIso,
  toSqlValue,
} from "@/lib/data/local";

/**
 * Local tables that carry an updated_at column. Postgres touches updated_at
 * via BEFORE UPDATE triggers; the mirror has no triggers, so the adapter
 * stamps it on UPDATE when the caller didn't set it explicitly.
 */
const TABLES_WITH_UPDATED_AT = new Set([
  "products",
  "customers",
  "suppliers",
  "invoices",
  "purchases",
  "expenses",
  "payment_methods",
  "returns",
  "special_orders",
  "store_profile",
]);

export function createLocalSupabaseAdapter(): MinimalSupabase {
  return {
    from(table: string) {
      return {
        select(cols: string) {
          const colSql = (cols ?? "*").trim() || "*";
          return {
            in: async (col: string, vals: string[]) => {
              try {
                if (vals.length === 0) return { data: [] as any[], error: null };
                const placeholders = vals.map(() => "?").join(", ");
                const rows = await localQuery<Record<string, unknown>>(
                  `SELECT ${colSql} FROM ${table} WHERE ${col} IN (${placeholders})`,
                  vals,
                );
                return {
                  data: rows.map((r) => fromLocalRow<any>(table, r)),
                  error: null,
                };
              } catch (error) {
                return { data: null, error };
              }
            },
            eq: (col: string, val: string) => ({
              maybeSingle: async () => {
                try {
                  const row = await localQueryOne<Record<string, unknown>>(
                    `SELECT ${colSql} FROM ${table} WHERE ${col} = ? LIMIT 1`,
                    [val],
                  );
                  return {
                    data: row ? fromLocalRow<any>(table, row) : null,
                    error: null,
                  };
                } catch (error) {
                  return { data: null, error };
                }
              },
            }),
          };
        },
        update(values: Record<string, any>) {
          return {
            eq: async (col: string, val: string) => {
              try {
                const data: Record<string, unknown> = { ...values };
                if (TABLES_WITH_UPDATED_AT.has(table) && data.updated_at == null) {
                  data.updated_at = nowIso();
                }
                const colsToSet = Object.keys(data);
                if (colsToSet.length === 0) return { error: null };
                const sets = colsToSet.map((c) => `${c} = ?`).join(", ");
                const params = colsToSet.map((c) => toSqlValue(data[c]));
                await localExecute(`UPDATE ${table} SET ${sets} WHERE ${col} = ?`, [
                  ...params,
                  val,
                ]);
                return { error: null };
              } catch (error) {
                return { error };
              }
            },
          };
        },
      };
    },
  };
}

/** Singleton adapter instance over the local mirror. */
export const localSupabase: MinimalSupabase = createLocalSupabaseAdapter();

/**
 * Pick the MinimalSupabase-compatible client for the current data mode:
 * the local-mirror adapter when the mirror is usable, otherwise the real
 * supabase-js client (structurally compatible with MinimalSupabase).
 * Intended for callers of saveInvoiceEdits.
 */
export async function getInvoiceSaveClient(): Promise<MinimalSupabase> {
  if (canUseLocalData()) return localSupabase;
  const { supabase } = await import("@/integrations/supabase/client");
  return supabase as unknown as MinimalSupabase;
}
