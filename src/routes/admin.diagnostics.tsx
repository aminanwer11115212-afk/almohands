import { createFileRoute } from "@tanstack/react-router";
import { PermissionGate } from "@/components/PermissionGate";
import { AppShell } from "@/components/AppShell";
import { useEffect, useState } from "react";
import { RefreshCw, Camera, Activity, Bell, Copy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { readLastScannerStatus, type ScannerStatus } from "@/lib/scanner-status";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/diagnostics")({
  head: () => ({ meta: [{ title: "تشخيص النظام — المهندس" }] }),
  component: () => (
    <PermissionGate perm="permissions.manage">
      <DiagnosticsPage />
    </PermissionGate>
  ),
});

type AuditRow = {
  id: string; action: string; table_name: string | null;
  record_id: string | null; created_at: string; details: unknown;
};
type NotifRow = {
  id: string; type: string; title: string; message: string | null;
  created_at: string; read: boolean; invoice_id: string | null; product_id: string | null;
};

function DiagnosticsPage() {
  const [status, setStatus] = useState<ScannerStatus | null>(null);
  const [audits, setAudits] = useState<AuditRow[]>([]);
  const [notifs, setNotifs] = useState<NotifRow[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    setLoading(true);
    setStatus(readLastScannerStatus());
    try {
      const [{ data: a }, { data: n }] = await Promise.all([
        supabase.from("audit_logs").select("id,action,table_name,record_id,created_at,details")
          .order("created_at", { ascending: false }).limit(10),
        supabase.from("notifications").select("id,type,title,message,created_at,read,invoice_id,product_id")
          .order("created_at", { ascending: false }).limit(10),
      ]);
      setAudits((a ?? []) as AuditRow[]);
      setNotifs((n ?? []) as NotifRow[]);
    } finally { setLoading(false); }
  };

  useEffect(() => { void refresh(); }, []);

  const copy = (v: string) => {
    navigator.clipboard?.writeText(v).then(() => toast.success("تم النسخ"));
  };

  return (
    <AppShell title="تشخيص النظام" subtitle="آخر حالة الماسح + آخر السجلات والإشعارات" showBack>
      <div className="p-4 space-y-4 max-w-4xl mx-auto">
        <div className="flex items-center gap-2">
          <button
            onClick={refresh}
            disabled={loading}
            className="h-9 px-3 rounded-lg border border-border bg-card hover:bg-muted text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
          >
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} /> تحديث
          </button>
        </div>

        {/* Scanner status */}
        <section className="rounded-2xl border border-border bg-card overflow-hidden">
          <header className="px-4 py-2 border-b border-border flex items-center gap-2 text-sm font-bold bg-muted/40">
            <Camera className="size-4" /> آخر حالة ماسح الباركود
          </header>
          {status ? (
            <div className="p-4 text-xs space-y-1">
              <div><span className="text-muted-foreground">الحالة: </span><b>{status.label}</b> <span className="text-muted-foreground">({status.reason})</span></div>
              <div className="text-muted-foreground">{status.detail}</div>
              <div className="text-muted-foreground">الوقت: {new Date(status.ts).toLocaleString("ar-EG")}</div>
              {status.context && (
                <pre className="mt-2 rounded-lg bg-muted/60 p-2 text-[10px] font-mono overflow-auto" dir="ltr">
                  {JSON.stringify(status.context, null, 2)}
                </pre>
              )}
            </div>
          ) : (
            <div className="p-6 text-center text-xs text-muted-foreground">لا توجد حالة مسجّلة بعد.</div>
          )}
        </section>

        {/* Audit logs */}
        <section className="rounded-2xl border border-border bg-card overflow-hidden">
          <header className="px-4 py-2 border-b border-border flex items-center gap-2 text-sm font-bold bg-muted/40">
            <Activity className="size-4" /> آخر أحداث التدقيق (audit_logs)
          </header>
          {audits.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">لا توجد أحداث.</div>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-muted/30 text-[11px]"><tr>
                <th className="text-right px-3 py-2">الوقت</th>
                <th className="text-right px-3 py-2">الحدث</th>
                <th className="text-right px-3 py-2">الجدول</th>
                <th className="text-right px-3 py-2">Record ID</th>
                <th className="text-right px-3 py-2">التفاصيل</th>
              </tr></thead>
              <tbody>
                {audits.map((r) => (
                  <tr key={r.id} className="border-t border-border align-top">
                    <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{new Date(r.created_at).toLocaleString("ar-EG")}</td>
                    <td className="px-3 py-2 font-bold">{r.action}</td>
                    <td className="px-3 py-2">{r.table_name ?? "—"}</td>
                    <td className="px-3 py-2">
                      {r.record_id ? (
                        <button onClick={() => copy(r.record_id!)} className="inline-flex items-center gap-1 font-mono text-[10px] hover:text-brand" dir="ltr">
                          <Copy className="size-3" /> {r.record_id.slice(0, 8)}…
                        </button>
                      ) : "—"}
                    </td>
                    <td className="px-3 py-2 text-[10px] font-mono max-w-[260px] truncate" dir="ltr">
                      {r.details ? JSON.stringify(r.details) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* Notifications */}
        <section className="rounded-2xl border border-border bg-card overflow-hidden">
          <header className="px-4 py-2 border-b border-border flex items-center gap-2 text-sm font-bold bg-muted/40">
            <Bell className="size-4" /> آخر الإشعارات
          </header>
          {notifs.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">لا توجد إشعارات.</div>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-muted/30 text-[11px]"><tr>
                <th className="text-right px-3 py-2">الوقت</th>
                <th className="text-right px-3 py-2">النوع</th>
                <th className="text-right px-3 py-2">العنوان</th>
                <th className="text-right px-3 py-2">مقروء</th>
                <th className="text-right px-3 py-2">مرجع</th>
              </tr></thead>
              <tbody>
                {notifs.map((r) => {
                  const ref = r.invoice_id || r.product_id;
                  return (
                    <tr key={r.id} className="border-t border-border align-top">
                      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{new Date(r.created_at).toLocaleString("ar-EG")}</td>
                      <td className="px-3 py-2 font-bold">{r.type}</td>
                      <td className="px-3 py-2">
                        {r.title}
                        {r.message && <div className="text-[10px] text-muted-foreground mt-0.5">{r.message}</div>}
                      </td>
                      <td className="px-3 py-2">{r.read ? "نعم" : "لا"}</td>
                      <td className="px-3 py-2">
                        {ref ? (
                          <button onClick={() => copy(ref)} className="inline-flex items-center gap-1 font-mono text-[10px] hover:text-brand" dir="ltr">
                            <Copy className="size-3" /> {ref.slice(0, 8)}…
                          </button>
                        ) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </AppShell>
  );
}
