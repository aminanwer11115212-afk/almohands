import type { AbstractPowerSyncDatabase, PowerSyncBackendConnector } from "@powersync/web";
import { UpdateType } from "@powersync/web";
import { supabase } from "@/integrations/supabase/client";

/**
 * Bridges PowerSync's local operation queue with Supabase.
 * - fetchCredentials: gives PowerSync the endpoint + user JWT to open the sync stream.
 * - uploadData: replays the local write queue against Supabase Data API.
 *   MUST throw on transient failures so PowerSync retries (do not swallow errors).
 */
export function createSupabaseConnector(powersyncUrl: string): PowerSyncBackendConnector {
  return {
    async fetchCredentials() {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      const session = data.session;
      if (!session) {
        // Signed out: signal PowerSync to disconnect. Returning null triggers retry.
        return null;
      }
      return {
        endpoint: powersyncUrl,
        token: session.access_token,
        expiresAt: session.expires_at
          ? new Date(session.expires_at * 1000)
          : undefined,
      };
    },

    async uploadData(database: AbstractPowerSyncDatabase) {
      const transaction = await database.getNextCrudTransaction();
      if (!transaction) return;

      try {
        for (const op of transaction.crud) {
          // Dynamic table names — Supabase types are per-table literal unions,
          // so we cast to bypass strict inference for the sync bridge.
          const table = (supabase as any).from(op.table);
          if (op.op === UpdateType.PUT) {
            const { error } = await table.upsert({ id: op.id, ...(op.opData ?? {}) });
            if (error) throw error;
          } else if (op.op === UpdateType.PATCH) {
            const { error } = await table.update(op.opData ?? {}).eq("id", op.id);
            if (error) throw error;
          } else if (op.op === UpdateType.DELETE) {
            const { error } = await table.delete().eq("id", op.id);
            if (error) throw error;
          }
        }
        await transaction.complete();
      } catch (err) {
        // Re-throw so PowerSync keeps the queue and retries later.
        console.error("[PowerSync] uploadData failed:", err);
        throw err;
      }
    },
  };
}
