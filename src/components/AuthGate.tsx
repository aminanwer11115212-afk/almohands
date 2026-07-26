import { useEffect, useState, type ReactNode } from "react";
import { useRouterState, useRouter } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

/**
 * Global authentication gate.
 * - Any route except `/auth` requires an active Supabase session.
 * - Unauthenticated users are redirected to `/auth?next=<current path>`.
 * - Offline-tolerant: when the device is offline and this browser was
 *   previously signed in, the user stays in — token refresh needs network,
 *   and kicking a cashier out mid-shift because the connection dropped would
 *   make offline mode useless. The flag is cleared only on explicit sign-out.
 */
const PUBLIC_PATHS = new Set<string>(["/auth"]);
const WAS_AUTHED_KEY = "app.wasAuthed";

function readWasAuthed(): boolean {
  try {
    return localStorage.getItem(WAS_AUTHED_KEY) === "1";
  } catch {
    return false;
  }
}

function writeWasAuthed(v: boolean): void {
  try {
    if (v) localStorage.setItem(WAS_AUTHED_KEY, "1");
    else localStorage.removeItem(WAS_AUTHED_KEY);
  } catch {
    /* storage unavailable */
  }
}

function offlineGrace(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false && readWasAuthed();
}

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  // Allow OAuth / well-known / MCP infra paths
  if (pathname.startsWith("/.well-known")) return true;
  if (pathname.startsWith("/.mcp")) return true;
  if (pathname.startsWith("/.lovable")) return true;
  if (pathname.startsWith("/api/")) return true;
  return false;
}

export function AuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [status, setStatus] = useState<"checking" | "authed" | "guest">("checking");

  useEffect(() => {
    let alive = true;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!alive) return;
        if (data.session) {
          writeWasAuthed(true);
          setStatus("authed");
        } else {
          setStatus(offlineGrace() ? "authed" : "guest");
        }
      })
      .catch(() => {
        if (alive) setStatus(offlineGrace() ? "authed" : "guest");
      });

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!alive) return;
      if (session) {
        writeWasAuthed(true);
        setStatus("authed");
        return;
      }
      if (event === "SIGNED_OUT") {
        writeWasAuthed(false);
        setStatus("guest");
        return;
      }
      // No session for another reason (e.g. failed token refresh while
      // offline): keep the user in when we have the offline grace flag.
      setStatus(offlineGrace() ? "authed" : "guest");
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (status !== "guest") return;
    if (isPublic(pathname)) return;
    const next = encodeURIComponent(
      pathname + (typeof window !== "undefined" ? window.location.search : ""),
    );
    router.navigate({ to: "/auth", search: { next: decodeURIComponent(next) }, replace: true });
  }, [status, pathname, router]);

  if (isPublic(pathname)) return <>{children}</>;

  if (status === "checking") {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background" dir="rtl">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin text-brand" />
          <p className="text-sm">جاري التحقق من الجلسة...</p>
        </div>
      </div>
    );
  }

  if (status === "guest") {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background" dir="rtl">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin text-brand" />
          <p className="text-sm">إعادة توجيه لصفحة الدخول...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
