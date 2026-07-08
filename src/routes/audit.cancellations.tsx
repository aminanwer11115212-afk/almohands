import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { PermissionGate } from "@/components/PermissionGate";
import { supabase } from "@/integrations/supabase/client";
import { ShieldAlert, Eye, FileSpreadsheet, Search, FileDown, FileJson, ExternalLink, ChevronLeft, ChevronRight } from "lucide-react";
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

type QuickRange = "" | "7d" | "30d" | "month";
const PAGE_SIZE = 20;

function computeRange(q: QuickRange) {
  if (!q) return null;
  const now = new Date();
  const to = new Date(now); to.setHours(23, 59, 59, 999);
  const from = new Date(now);
  if (q === "7d") from.setDate(now.getDate() - 7);
  else if (q === "30d") from.setDate(now.getDate() - 30);
  else if (q === "month") { from.setDate(1); from.setHours(0, 0, 0, 0); }
  return { from: from.toISOString(), to: to.toISOString() };
}

function AuditCancellationsPage() {
  const [users, setUsers] = useState<Map<string, string>>(new Map());
  const [cashier, setCashier] = useState("");
  const [reason, setReason] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [quick, setQuick] = useState<QuickRange>("");
  const [page, setPage] = useState(1);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["audit-cancellations", from, to, quick],
    queryFn: async () => {
      let q = supabase
        .from("audit_logs")
        .select("id, user_id, action, record_id, details, created_at")
        .eq("action", "invoice.cancelled")
        .order("created_at", { ascending: false })
        .limit(2000);
      const range = computeRange(quick);
      if (range) q = q.gte("created_at", range.from).lte("created_at", range.to);
      else {
        if (from) q = q.gte("created_at", new Date(from).toISOString());
        if (to) { const end = new Date(to); end.setHours(23, 59, 59, 999); q = q.lte("created_at", end.toISOString()); }
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

  useEffect(() => { setPage(1); }, [cashier, reason, from, to, quick]);

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

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = useMemo(() => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [filtered, page]);

  function buildRows() {
    return filtered.map((r) => ({
      "التاريخ": new Date(r.created_at).toLocaleString("ar-EG"),
      "رقم الفاتورة": r.details?.invoice_number ?? "—",
      "الكاشير": users.get(r.user_id) ?? r.user_id.slice(0, 8),
      "سبب الإلغاء": r.details?.reason ?? "— (لم يُذكر)",
      "معرف الفاتورة": r.record_id ?? "—",
    }));
  }

  function download(blob: Blob, name: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 500);
  }

  function exportXLSX() {
    if (filtered.length === 0) { toast.info("لا توجد بيانات للتصدير"); return; }
    const data = buildRows();
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = Object.keys(data[0]).map(() => ({ wch: 20 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "إلغاءات");
    XLSX.writeFile(wb, `cancellations-audit-${Date.now()}.xlsx`);
    toast.success(`تم تصدير ${data.length} سجل`);
  }

  function exportCSV() {
    if (filtered.length === 0) { toast.info("لا توجد بيانات للتصدير"); return; }
    const data = buildRows();
    const headers = Object.keys(data[0]);
    const lines = [headers.join(",")];
    for (const r of data) lines.push(headers.map((h) => {
      const v = String((r as any)[h] ?? "");
      return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
    }).join(","));
    download(new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" }), `cancellations-audit-${Date.now()}.csv`);
    toast.success(`تم تصدير ${data.length} سجل`);
  }

  function exportJSON() {
    if (filtered.length === 0) { toast.info("لا توجد بيانات للتصدير"); return; }
    download(new Blob([JSON.stringify(buildRows(), null, 2)], { type: "application/json" }), `cancellations-audit-${Date.now()}.json`);
    toast.success(`تم تصدير ${filtered.length} سجل`);
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

        <div className="rounded-xl bg-card border border-border p-3 shadow-card space-y-2">
          <div className="grid sm:grid-cols-4 gap-2">
            <select value={cashier} onChange={(e) => setCashier(e.target.value)} className="h-10 rounded-lg border border-border bg-background px-3 text-sm">
              <option value="">كل الكاشير</option>
              {cashiers.map((id) => (<option key={id} value={id}>{users.get(id) ?? id.slice(0, 8)}</option>))}
            </select>
            <div className="relative">
              <Search className="size-4 absolute top-1/2 -translate-y-1/2 start-2 text-muted-foreground" />
              <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="تصفية سبب..." className="w-full h-10 rounded-lg border border-border bg-background ps-8 pe-3 text-sm" />
            </div>
            <input type="date" value={from} disabled={!!quick} onChange={(e) => setFrom(e.target.value)} className="h-10 rounded-lg border border-border bg-background px-2 text-sm disabled:opacity-50" />
            <input type="date" value={to} disabled={!!quick} onChange={(e) => setTo(e.target.value)} className="h-10 rounded-lg border border-border bg-background px-2 text-sm disabled:opacity-50" />
          </div>
          <div className="flex items-center gap-1 text-xs flex-wrap">
            <span className="font-bold text-muted-foreground">نطاق:</span>
            {([["", "مخصص"], ["7d", "آخر 7 أيام"], ["30d", "آخر 30 يوم"], ["month", "هذا الشهر"]] as [QuickRange, string][]).map(([v, label]) => (
              <button key={v} onClick={() => setQuick(v)} className={`px-2 py-1 rounded-md border ${quick === v ? "bg-brand text-brand-foreground border-brand" : "bg-background border-border"}`}>{label}</button>
            ))}
            <div className="ms-auto flex gap-1">
              <button onClick={exportXLSX} className="h-8 px-2 rounded-md bg-emerald-600 text-white text-xs font-bold inline-flex items-center gap-1"><FileSpreadsheet className="size-3.5" />Excel</button>
              <button onClick={exportCSV} className="h-8 px-2 rounded-md bg-sky-600 text-white text-xs font-bold inline-flex items-center gap-1"><FileDown className="size-3.5" />CSV</button>
              <button onClick={exportJSON} className="h-8 px-2 rounded-md bg-indigo-600 text-white text-xs font-bold inline-flex items-center gap-1"><FileJson className="size-3.5" />JSON</button>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="text-center py-10 text-muted-foreground">جاري التحميل...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">لا توجد سجلات مطابقة</div>
        ) : (
          <>
            <div className="space-y-2">
              {pageRows.map((r) => (
                <div key={r.id} className="rounded-xl bg-card border border-border p-3 shadow-card text-sm">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div className="min-w-0">
                      <div className="font-bold">فاتورة #{r.details?.invoice_number ?? "—"}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {users.get(r.user_id) ?? r.user_id.slice(0, 8)} · {new Date(r.created_at).toLocaleString("ar-EG")}
                      </div>
                    </div>
                    {r.record_id && (
                      <div className="flex gap-1">
                        <Link to="/invoices/$invoiceId" params={{ invoiceId: r.record_id }} search={{ autoprint: 0 }} className="text-xs inline-flex items-center gap-1 h-8 px-2 rounded-md border border-border bg-background hover:bg-muted">
                          <Eye className="size-3.5" /> عرض
                        </Link>
                        <Link to="/invoices/$invoiceId" params={{ invoiceId: r.record_id }} search={{ autoprint: 0 }} className="text-xs inline-flex items-center gap-1 h-8 px-2 rounded-md bg-brand text-brand-foreground font-bold">
                          <ExternalLink className="size-3.5" /> فتح
                        </Link>
                      </div>
                    )}
                  </div>
                  <div className="mt-2 rounded-md bg-muted/50 p-2 text-xs">
                    <span className="font-semibold text-muted-foreground">السبب: </span>
                    {r.details?.reason ?? "— (لم يُذكر)"}
                  </div>
                </div>
              ))}
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between gap-2 text-xs pt-2">
                <div className="text-muted-foreground">صفحة {page} من {totalPages} · {filtered.length} سجل</div>
                <div className="flex gap-1">
                  <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="h-8 px-2 rounded-md border border-border bg-background disabled:opacity-40 inline-flex items-center gap-1"><ChevronRight className="size-3.5" />السابق</button>
                  <button disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="h-8 px-2 rounded-md border border-border bg-background disabled:opacity-40 inline-flex items-center gap-1">التالي<ChevronLeft className="size-3.5" /></button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
