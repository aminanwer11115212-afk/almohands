import { useEffect, useState, type ReactNode } from "react";
import { useRouterState, useRouter } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

/**
 * Global authentication gate.
 * - Any route except `/auth` requires an active Supabase session.
 * - Unauthenticated users are redirected to `/auth?next=<current path>`.
 * - Listens to auth changes so signing out from anywhere immediately kicks
 *   the user back to the sign-in screen.
 */
const PUBLIC_PATHS = new Set<string>(["/auth"]);

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

    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setStatus(data.session ? "authed" : "guest");
    }).catch(() => {
      if (alive) setStatus("guest");
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!alive) return;
      setStatus(session ? "authed" : "guest");
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (status !== "guest") return;
    if (isPublic(pathname)) return;
    const next = encodeURIComponent(pathname + (typeof window !== "undefined" ? window.location.search : ""));
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
