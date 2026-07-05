import type { ReactNode } from "react";
import { useRequirePermission } from "@/hooks/use-require-permission";
import type { Permission } from "@/hooks/use-permissions";
import { AppShell } from "@/components/AppShell";
import { Loader2 } from "lucide-react";

/**
 * Wraps a page so its inner component only mounts after the permission check
 * settles. Keeps hooks inside the inner component unconditional (Rules of
 * Hooks safe) — the wrapper alone owns the guard hook.
 */
export function PermissionGate({ perm, children }: { perm: Permission; children: ReactNode }) {
  const { isChecking, allowed } = useRequirePermission(perm);
  if (isChecking) {
    return (
      <AppShell title="" showBack>
        <div className="grid place-items-center py-16 text-muted-foreground">
          <Loader2 className="size-6 animate-spin" />
        </div>
      </AppShell>
    );
  }
  if (!allowed) return null;
  return <>{children}</>;
}
