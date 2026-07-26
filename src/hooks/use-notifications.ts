import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { canUseLocalData, localQueryOne } from "@/lib/data/local";

export function useUnreadNotifications() {
  const qc = useQueryClient();
  useEffect(() => {
    const ch = supabase
      .channel("notifications-unread")
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, () => {
        qc.invalidateQueries({ queryKey: ["notifications-unread"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  return useQuery({
    queryKey: ["notifications-unread"],
    queryFn: async () => {
      if (canUseLocalData()) {
        const row = await localQueryOne<{ n: number }>(
          `SELECT COUNT(*) AS n FROM notifications WHERE read = 0`,
        );
        return Number(row?.n ?? 0);
      }

      const { count, error } = await supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("read", false);
      if (error) throw error;
      return count ?? 0;
    },
    staleTime: 30_000,
  });
}
