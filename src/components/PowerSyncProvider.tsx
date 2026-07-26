import { useEffect, useState, type ReactNode } from "react";
import { PowerSyncContext } from "@powersync/react";
import type { PowerSyncDatabase } from "@powersync/web";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getPowerSyncUrl } from "@/lib/powersync/config.functions";
import {
  cacheUserId,
  clearHasSyncedOnce,
  getCachedUserId,
  markHasSyncedOnce,
  registerLocalDb,
  setSyncConfigured,
} from "@/lib/data/local";

const URL_CACHE_KEY = "powersync.url";

function readCachedUrl(): string | null {
  try {
    return localStorage.getItem(URL_CACHE_KEY);
  } catch {
    return null;
  }
}

function writeCachedUrl(url: string | null): void {
  try {
    if (url) localStorage.setItem(URL_CACHE_KEY, url);
    else localStorage.removeItem(URL_CACHE_KEY);
  } catch {
    /* storage unavailable */
  }
}

/**
 * Wraps the app with a live PowerSync database.
 *
 * Offline-first behaviour:
 * - The POWERSYNC_URL is cached in localStorage, so a fully offline app start
 *   still opens the local mirror without needing the server fn.
 * - The local database is initialized and exposed immediately; the network
 *   connection is layered on top when a session exists and we are online.
 * - Explicit sign-out only *disconnects* (local data survives so the same user
 *   can keep working offline). Data is wiped only when a *different* user
 *   signs in on this device.
 * - After sync batches complete, the React Query cache is invalidated so the
 *   UI reflects freshly downloaded rows.
 */
export function PowerSyncProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<PowerSyncDatabase | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    let cancelled = false;
    let currentDb: PowerSyncDatabase | null = null;
    let authSub: { unsubscribe: () => void } | null = null;
    let removeStatusListener: (() => void) | null = null;
    let invalidateTimer: ReturnType<typeof setTimeout> | null = null;

    (async () => {
      try {
        // Resolve the PowerSync endpoint: server fn when reachable, cached
        // value otherwise (critical for offline app starts).
        let url = readCachedUrl();
        try {
          const fresh = await getPowerSyncUrl();
          url = fresh.url ?? null;
          writeCachedUrl(url);
        } catch {
          console.info("[PowerSync] server unreachable — using cached endpoint:", url ?? "none");
        }
        if (cancelled) return;

        if (!url) {
          setSyncConfigured(false);
          console.info("[PowerSync] POWERSYNC_URL not set — running in direct-Supabase mode.");
          return;
        }
        setSyncConfigured(true);

        const [{ getPowerSync }, { createSupabaseConnector }] = await Promise.all([
          import("@/lib/powersync/db"),
          import("@/lib/powersync/connector"),
        ]);

        currentDb = getPowerSync();
        await currentDb.init();
        if (cancelled) {
          return;
        }
        registerLocalDb(currentDb);
        setDb(currentDb);

        // Refresh UI shortly after download batches finish.
        let wasDownloading = false;
        removeStatusListener = currentDb.registerListener({
          statusChanged: (status) => {
            if (status.hasSynced) markHasSyncedOnce();
            const downloading = Boolean(status.dataFlowStatus?.downloading);
            if (wasDownloading && !downloading) {
              if (invalidateTimer) clearTimeout(invalidateTimer);
              invalidateTimer = setTimeout(() => {
                queryClient.invalidateQueries();
              }, 500);
            }
            wasDownloading = downloading;
          },
        });

        const connector = createSupabaseConnector(url);

        const connect = async () => {
          if (!currentDb) return;
          try {
            await currentDb.connect(connector);
          } catch (err) {
            console.error("[PowerSync] connect failed:", err);
          }
        };

        const { data: sessionData } = await supabase.auth.getSession();
        const initialUserId = sessionData.session?.user?.id ?? null;
        if (initialUserId) {
          // A different account on the same device must not see the previous
          // account's mirror — wipe before connecting.
          const previous = getCachedUserId();
          if (previous && previous !== initialUserId) {
            clearHasSyncedOnce();
            await currentDb.disconnectAndClear();
          }
          cacheUserId(initialUserId);
          await connect();
        }

        const { data } = supabase.auth.onAuthStateChange((event, session) => {
          void (async () => {
            if (!currentDb) return;
            try {
              if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
                const uid = session?.user?.id ?? null;
                if (uid) {
                  const previous = getCachedUserId();
                  if (previous && previous !== uid) {
                    clearHasSyncedOnce();
                    await currentDb.disconnectAndClear();
                  }
                  cacheUserId(uid);
                  await connect();
                }
              } else if (event === "SIGNED_OUT") {
                // Keep local data: same user may sign back in offline.
                await currentDb.disconnect();
              }
            } catch (err) {
              console.error("[PowerSync] auth transition failed:", err);
            }
          })();
        });
        authSub = data.subscription;
      } catch (err) {
        console.error("[PowerSync] init failed:", err);
      }
    })();

    return () => {
      cancelled = true;
      authSub?.unsubscribe();
      removeStatusListener?.();
      if (invalidateTimer) clearTimeout(invalidateTimer);
      registerLocalDb(null);
      if (currentDb) {
        currentDb.disconnect().catch(() => {});
      }
    };
  }, [queryClient]);

  if (!db) return <>{children}</>;
  return <PowerSyncContext.Provider value={db}>{children}</PowerSyncContext.Provider>;
}
