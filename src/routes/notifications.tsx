import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, Check, Trash2, CheckCheck } from "lucide-react";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/errors";

export const Route = createFileRoute("/notifications")({
  head: () => ({ meta: [{ title: "الإشعارات — المهندس" }] }),
  component: NotificationsPage,
});

function NotificationsPage() {
  const qc = useQueryClient();

  const { data: items = [] } = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel("notifications-page")
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, () => {
        qc.invalidateQueries({ queryKey: ["notifications"] });
        qc.invalidateQueries({ queryKey: ["notifications-unread"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("notifications").update({ read: true }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
      qc.invalidateQueries({ queryKey: ["notifications-unread"] });
    },
    onError: (err) => toast.error(getErrorMessage(err, "تعذّر تحديث الإشعار")),
  });

  const markAll = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("notifications").update({ read: true }).eq("read", false);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم تعليم الكل كمقروء");
      qc.invalidateQueries({ queryKey: ["notifications"] });
      qc.invalidateQueries({ queryKey: ["notifications-unread"] });
    },
    onError: (err) => toast.error(getErrorMessage(err, "تعذّر تحديث الإشعارات")),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("notifications").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
      qc.invalidateQueries({ queryKey: ["notifications-unread"] });
    },
    onError: (err) => toast.error(getErrorMessage(err, "تعذّر حذف الإشعار")),
  });

  const unreadCount = items.filter((i) => !i.read).length;

  return (
    <AppShell title="الإشعارات" showBack>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-muted-foreground">
          غير مقروءة: <span className="font-bold nums">{unreadCount}</span>
        </p>
        {unreadCount > 0 && (
          <button
            onClick={() => markAll.mutate()}
            className="flex items-center gap-1 text-xs bg-brand text-brand-foreground rounded-lg px-3 py-1.5"
          >
            <CheckCheck className="size-4" /> تعليم الكل كمقروء
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border bg-card p-6 text-center text-sm text-muted-foreground">
          لا توجد إشعارات
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((n) => (
            <li
              key={n.id}
              className={`rounded-xl border p-3 flex items-start gap-3 ${
                n.read ? "bg-card" : "bg-accent/30 border-brand/40"
              }`}
            >
              <div className="mt-0.5">
                <AlertTriangle className={`size-5 ${n.read ? "text-muted-foreground" : "text-brand"}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm">{n.title}</div>
                {n.message && <div className="text-xs text-muted-foreground mt-0.5">{n.message}</div>}
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[11px] text-muted-foreground nums">
                    {new Date(n.created_at).toLocaleString("ar")}
                  </span>
                  {n.product_id && (
                    <Link
                      to="/products/$productId"
                      params={{ productId: n.product_id }}
                      className="text-[11px] text-brand underline"
                    >
                      عرض المنتج
                    </Link>
                  )}
                </div>
              </div>
              <div className="flex flex-col gap-1">
                {!n.read && (
                  <button
                    onClick={() => markRead.mutate(n.id)}
                    className="p-1.5 rounded-md hover:bg-muted"
                    aria-label="تعليم كمقروء"
                  >
                    <Check className="size-4" />
                  </button>
                )}
                <button
                  onClick={() => del.mutate(n.id)}
                  className="p-1.5 rounded-md hover:bg-muted"
                  aria-label="حذف"
                >
                  <Trash2 className="size-4 text-destructive" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
