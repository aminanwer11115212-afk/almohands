import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { PermissionGate } from "@/components/PermissionGate";
import { supabase } from "@/integrations/supabase/client";
import { ShieldAlert, Eye, FileSpreadsheet, Search } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import * as XLSX from "xlsx";
import { toast } from "sonner";

export const Route = createFileRoute("/audit/cancellations")({
  head: () => ({ meta: [{ title: "سجل إلغاءات الفواتير — المهندس" }] }),
  component: () => (
    <PermissionGate perm="invoices.write">
      <AuditCancellationsPage />
    </PermissionGate>
  ),
});

type LogRow = {
  id: string;
  user_id: string;
  action: string;
  record_id: string | null;
  details: any;
  created_at: string;
};

function AuditCancellationsPage() {
  const [users, setUsers] = useState<Map<string, string>>(new Map());
  const [cashier, setCashier] = useState("");
  const [reason, setReason] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["audit-cancellations", from, to],
    queryFn: async () => {
      let q = supabase
        .from("audit_logs")
        .select("id, user_id, action, record_id, details, created_at")
        .eq("action", "invoice.cancelled")
        .order("created_at", { ascending: false })
        .limit(1000);
      if (from) q = q.gte("created_at", new Date(from).toISOString());
      if (to) {
        const end = new Date(to); end.setHours(23, 59, 59, 999);
        q = q.lte("created_at", end.toISOString());
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as LogRow[];
    },
  });

  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc("admin_list_users");
      const map = new Map<string, string>();
      (data ?? []).forEach((u: { user_id: string; email: string }) => map.set(u.user_id, u.email));
      setUsers(map);
    })();
  }, []);

  const cashiers = useMemo(() => Array.from(new Set(rows.map((r) => r.user_id))), [rows]);

  const filtered = useMemo(() => {
    const rs = reason.trim().toLowerCase();
    return rows.filter((r) => {
      if (cashier && r.user_id !== cashier) return false;
      const rsn = String(r.details?.reason ?? "").toLowerCase();
      if (rs && !rsn.includes(rs)) return false;
      return true;
    });
  }, [rows, cashier, reason]);

  function exportXLSX() {
    if (filtered.length === 0) { toast.info("لا توجد بيانات للتصدير"); return; }
    const data = filtered.map((r) => ({
      "التاريخ": new Date(r.created_at).toLocaleString("ar-EG"),
      "رقم الفاتورة": r.details?.invoice_number ?? "—",
      "الكاشير": users.get(r.user_id) ?? r.user_id.slice(0, 8),
      "سبب الإلغاء": r.details?.reason ?? "— (لم يُذكر)",
      "معرف الفاتورة": r.record_id ?? "—",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = Object.keys(data[0]).map(() => ({ wch: 20 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "إلغاءات");
    XLSX.writeFile(wb, `cancellations-audit-${Date.now()}.xlsx`);
    toast.success(`تم تصدير ${data.length} سجل`);
  }

  return (
    <AppShell title="سجل إلغاءات الفواتير" showBack>
      <div className="mx-auto max-w-5xl space-y-3">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <div className="flex items-center gap-2 font-bold">
            <ShieldAlert className="size-4" /> سجل التدقيق — إلغاءات الفواتير ({filtered.length} من {rows.length})
          </div>
          <div className="text-xs mt-0.5 opacity-80">يوثق كل عملية إلغاء فاتورة مع المستخدم والسبب والوقت من جدول audit_logs.</div>
        </div>

        <div className="rounded-xl bg-card border border-border p-3 shadow-card grid sm:grid-cols-4 gap-2">
          <select value={cashier} onChange={(e) => setCashier(e.target.value)} className="h-10 rounded-lg border border-border bg-background px-3 text-sm">
            <option value="">كل الكاشير</option>
            {cashiers.map((id) => (
              <option key={id} value={id}>{users.get(id) ?? id.slice(0, 8)}</option>
            ))}
          </select>
          <div className="relative">
            <Search className="size-4 absolute top-1/2 -translate-y-1/2 start-2 text-muted-foreground" />
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="تصفية سبب..." className="w-full h-10 rounded-lg border border-border bg-background ps-8 pe-3 text-sm" />
          </div>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-10 rounded-lg border border-border bg-background px-2 text-sm" />
          <div className="flex gap-2">
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="flex-1 h-10 rounded-lg border border-border bg-background px-2 text-sm" />
            <button onClick={exportXLSX} className="h-10 px-3 rounded-lg bg-emerald-600 text-white text-sm font-bold inline-flex items-center gap-1">
              <FileSpreadsheet className="size-4" />
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="text-center py-10 text-muted-foreground">جاري التحميل...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">لا توجد سجلات مطابقة</div>
        ) : (
          <div className="space-y-2">
            {filtered.map((r) => (
              <div key={r.id} className="rounded-xl bg-card border border-border p-3 shadow-card text-sm">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="min-w-0">
                    <div className="font-bold">فاتورة #{r.details?.invoice_number ?? "—"}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {users.get(r.user_id) ?? r.user_id.slice(0, 8)} · {new Date(r.created_at).toLocaleString("ar-EG")}
                    </div>
                  </div>
                  {r.record_id && (
                    <Link to="/invoices/$invoiceId" params={{ invoiceId: r.record_id }} search={{ autoprint: 0 }} className="text-xs text-brand inline-flex items-center gap-1">
                      <Eye className="size-3" /> عرض
                    </Link>
                  )}
                </div>
                <div className="mt-2 rounded-md bg-muted/50 p-2 text-xs">
                  <span className="font-semibold text-muted-foreground">السبب: </span>
                  {r.details?.reason ?? "— (لم يُذكر)"}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
