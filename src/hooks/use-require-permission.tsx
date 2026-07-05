import { useEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useMyRole, can, type Permission } from "@/hooks/use-permissions";

/**
 * Client-side permission guard. If the current user's effective role lacks
 * `perm`, show a toast and redirect. Server enforcement is still RLS.
 */
export function useRequirePermission(perm: Permission, redirectTo: string = "/") {
  const navigate = useNavigate();
  const { role, isLoading } = useMyRole();
  const toasted = useRef(false);

  const allowed = can(role, perm);
  const isChecking = isLoading;

  useEffect(() => {
    if (isChecking) return;
    if (!allowed) {
      if (!toasted.current) {
        toasted.current = true;
        toast.error("ليس لديك صلاحية الوصول لهذه الصفحة");
      }
      navigate({ to: redirectTo, replace: true });
    }
  }, [isChecking, allowed, navigate, redirectTo]);

  return { isChecking, allowed };
}
