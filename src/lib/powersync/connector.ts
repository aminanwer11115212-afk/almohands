import type { AbstractPowerSyncDatabase, PowerSyncBackendConnector } from "@powersync/web";
import { UpdateType } from "@powersync/web";
import { supabase } from "@/integrations/supabase/client";
import { BOOLEAN_COLUMNS, JSON_COLUMNS } from "./column-meta";

/**
 * Bridges PowerSync's local operation queue with Supabase.
 * - fetchCredentials: gives PowerSync the endpoint + user JWT to open the sync stream.
 * - uploadData: replays the local write queue against the Supabase Data API.
 *   Transient failures (network, 5xx) are re-thrown so PowerSync retries.
 *   Permanent failures (constraint violations, unknown columns, RLS) are logged
 *   and the transaction is completed anyway — otherwise one poison operation
 *   would block the entire queue forever.
 */

// Postgres error classes that will never succeed on retry:
// 22xxx data exception, 23xxx integrity constraint, 42xxx syntax/undefined object.
const FATAL_CODES = [/^22\d{3}$/, /^23\d{3}$/, /^42\d{3}$/];

function isFatalError(err: unknown): boolean {
  const code = (err as { code?: string })?.code;
  if (typeof code !== "string") return false;
  return FATAL_CODES.some((re) => re.test(code));
}

/** Convert local SQLite representations back to what Postgres expects. */
function toPostgresRow(table: string, data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...data };
  for (const col of BOOLEAN_COLUMNS[table] ?? []) {
    if (col in out && out[col] != null)
      out[col] = out[col] === 1 || out[col] === "1" || out[col] === true;
  }
  for (const col of JSON_COLUMNS[table] ?? []) {
    const v = out[col];
    if (typeof v === "string" && v.length > 0) {
      try {
        out[col] = JSON.parse(v);
      } catch {
        // leave as-is; Postgres will reject and we surface the error below
      }
    }
  }
  return out;
}

export function createSupabaseConnector(powersyncUrl: string): PowerSyncBackendConnector {
  return {
    async fetchCredentials() {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      const session = data.session;
      if (!session) {
        // Signed out: returning null signals PowerSync to wait/retry.
        return null;
      }
      return {
        endpoint: powersyncUrl,
        token: session.access_token,
        expiresAt: session.expires_at ? new Date(session.expires_at * 1000) : undefined,
      };
    },

    async uploadData(database: AbstractPowerSyncDatabase) {
      const transaction = await database.getNextCrudTransaction();
      if (!transaction) return;

      let lastOp: { table: string; op: string; id: string } | null = null;
      try {
        for (const op of transaction.crud) {
          lastOp = { table: op.table, op: op.op, id: op.id };
          // Dynamic table names — Supabase types are per-table literal unions,
          // so we cast to bypass strict inference for the sync bridge.
          const table = (supabase as any).from(op.table);
          if (op.op === UpdateType.PUT) {
            const row = toPostgresRow(op.table, { ...(op.opData ?? {}) });
            const { error } = await table.upsert({ id: op.id, ...row });
            if (error) throw error;
          } else if (op.op === UpdateType.PATCH) {
            const row = toPostgresRow(op.table, { ...(op.opData ?? {}) });
            const { error } = await table.update(row).eq("id", op.id);
            if (error) throw error;
          } else if (op.op === UpdateType.DELETE) {
            const { error } = await table.delete().eq("id", op.id);
            if (error) throw error;
          }
        }
        await transaction.complete();
      } catch (err) {
        if (isFatalError(err)) {
          // Data-shaped error: retrying can never succeed. Drop the transaction
          // so the rest of the queue keeps flowing, but leave a loud trace.
          console.error("[PowerSync] discarding non-retryable upload op:", lastOp, err);
          await transaction.complete();
          return;
        }
        // Transient (offline / 5xx / auth refresh): keep queue and retry later.
        console.warn("[PowerSync] uploadData will retry:", lastOp, err);
        throw err;
      }
    },
  };
}
