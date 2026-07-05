import { useEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

/**
 * Client-side admin route guard.
 * - While checking: returns { isChecking: true } so the page can render a spinner.
 * - If the current user is NOT an admin: shows a clear error toast and redirects to `/`.
 * - If admin: returns { isAdmin: true }.
 *
 * Server-side enforcement still lives in the admin server functions
 * (`ensureAdmin` + RLS). This hook is UX polish, not a security boundary.
 */
export function useRequireAdmin(redirectTo: string = "/") {
  const navigate = useNavigate();
  const toastedRef = useRef(false);

  const query = useQuery({
    queryKey: ["is-admin"],
    queryFn: async () => {
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw userErr;
      const uid = userData.user?.id;
      if (!uid) return false;
      const { data, error } = await supabase.rpc("has_role", {
        _user_id: uid,
        _role: "admin",
      });
      if (error) throw error;
      return Boolean(data);
    },
    staleTime: 60_000,
    retry: 1,
  });

  const isChecking = query.isLoading || query.isFetching;
  const isAdmin = query.data === true;

  useEffect(() => {
    if (isChecking) return;
    if (query.isError) {
      if (!toastedRef.current) {
        toastedRef.current = true;
        toast.error("تعذّر التحقق من الصلاحيات. تم إرجاعك للصفحة الرئيسية.");
      }
      navigate({ to: redirectTo, replace: true });
      return;
    }
    if (!isAdmin) {
      if (!toastedRef.current) {
        toastedRef.current = true;
        toast.error("هذه الصفحة مخصّصة للمدير فقط. ليس لديك صلاحية الوصول.");
      }
      navigate({ to: redirectTo, replace: true });
    }
  }, [isChecking, isAdmin, query.isError, navigate, redirectTo]);

  return { isChecking, isAdmin, error: query.error as Error | null };
}
