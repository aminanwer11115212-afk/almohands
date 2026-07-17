import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { hasBackupForToday, runLocalBackup } from "@/lib/local-backup";

/**
 * Auto local-backup lifecycle:
 * - Once per calendar day at the first authenticated app open  → kind="open"
 * - Once per calendar day at the last visible→hidden transition → kind="close"
 * Both fire without any user confirmation. The browser saves each file
 * to the device's default Downloads folder (works on laptop + phone).
 * We never fire twice for the same (kind, day) pair.
 */
export function useAutoLocalBackup() {
  const closeFiredRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function maybeOpenBackup() {
      try {
        const { data } = await supabase.auth.getSession();
        if (cancelled || !data.session) return;
        if (hasBackupForToday("open")) return;
        await runLocalBackup("open");
        toast.success("تم حفظ نسخة احتياطية محلية (بداية اليوم)");
      } catch (err) {
        // Silent — full detail lives in the backup history.
        console.warn("[auto-backup:open]", err);
      }
    }

    // Delay slightly so the app hydrates and the auth session is ready.
    const t = window.setTimeout(maybeOpenBackup, 2500);

    async function maybeCloseBackup() {
      if (closeFiredRef.current) return;
      if (hasBackupForToday("close")) { closeFiredRef.current = true; return; }
      try {
        const { data } = await supabase.auth.getSession();
        if (!data.session) return;
        closeFiredRef.current = true;
        await runLocalBackup("close");
        toast.success("تم حفظ نسخة احتياطية محلية (نهاية الجلسة)");
      } catch (err) {
        console.warn("[auto-backup:close]", err);
      }
    }

    const onVisibility = () => {
      if (document.visibilityState === "hidden") void maybeCloseBackup();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", maybeCloseBackup);

    return () => {
      cancelled = true;
      window.clearTimeout(t);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", maybeCloseBackup);
    };
  }, []);
}
