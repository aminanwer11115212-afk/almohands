import { useEffect, useState, type ReactNode } from "react";
import { PowerSyncContext } from "@powersync/react";
import type { PowerSyncDatabase } from "@powersync/web";
import { supabase } from "@/integrations/supabase/client";
import { getPowerSyncUrl } from "@/lib/powersync/config.functions";

/**
 * Wraps the app with a live PowerSync database.
 *
 * Behaviour:
 * - Runs only in the browser (parent should mount inside <ClientOnly />).
 * - Fetches POWERSYNC_URL from a server fn on mount.
 * - Connects when a Supabase session exists; disconnects on sign-out.
 * - Silently no-ops if POWERSYNC_URL is not configured yet, so the app still
 *   works before the user finishes the PowerSync dashboard setup.
 */
export function PowerSyncProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<PowerSyncDatabase | null>(null);

  useEffect(() => {
    let cancelled = false;
    let currentDb: PowerSyncDatabase | null = null;
    let authSub: { unsubscribe: () => void } | null = null;

    (async () => {
      try {
        const { url } = await getPowerSyncUrl();
        if (!url) {
          console.info("[PowerSync] POWERSYNC_URL not set — skipping local sync init.");
          return;
        }
        if (cancelled) return;

        const [{ getPowerSync }, { createSupabaseConnector }] = await Promise.all([
          import("@/lib/powersync/db"),
          import("@/lib/powersync/connector"),
        ]);

        currentDb = getPowerSync();
        await currentDb.init();
        if (cancelled) return;
        setDb(currentDb);

        const connector = createSupabaseConnector(url);
        const applySession = async (hasSession: boolean) => {
          if (!currentDb) return;
          try {
            if (hasSession) {
              await currentDb.connect(connector);
            } else {
              await currentDb.disconnectAndClear();
            }
          } catch (err) {
            console.error("[PowerSync] connect/disconnect failed:", err);
          }
        };

        const { data: sessionData } = await supabase.auth.getSession();
        await applySession(Boolean(sessionData.session));

        const { data } = supabase.auth.onAuthStateChange((event, session) => {
          if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "TOKEN_REFRESHED") {
            void applySession(Boolean(session));
          }
        });
        authSub = data.subscription;
      } catch (err) {
        console.error("[PowerSync] init failed:", err);
      }
    })();

    return () => {
      cancelled = true;
      authSub?.unsubscribe();
      if (currentDb) {
        currentDb.disconnect().catch(() => {});
      }
    };
  }, []);

  if (!db) return <>{children}</>;
  return <PowerSyncContext.Provider value={db}>{children}</PowerSyncContext.Provider>;
}
