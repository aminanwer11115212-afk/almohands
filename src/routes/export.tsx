import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { PermissionGate } from "@/components/PermissionGate";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Download, FileText, Database, Trash2, FileSpreadsheet, CheckCircle2, XCircle, Calendar, Filter, Clock, RefreshCw } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { formatNumber } from "@/lib/format";


export const Route = createFileRoute("/export")({
  head: () => ({ meta: [{ title: "تصدير البيانات — المهندس" }] }),
  component: ExportPageGuarded,
});

const TABLES = [
  { key: "products", label: "المنتجات", dateCol: "created_at" },
  { key: "customers", label: "العملاء", dateCol: "created_at" },
  { key: "suppliers", label: "الموردين", dateCol: "created_at" },
  { key: "invoices", label: "الفواتير", dateCol: "created_at" },
  { key: "invoice_items", label: "بنود الفواتير", dateCol: "created_at" },
  { key: "expenses", label: "المصروفات", dateCol: "expense_date" },
  { key: "returns", label: "المرتجعات", dateCol: "created_at" },
  { key: "purchases", label: "المشتريات", dateCol: "created_at" },
  { key: "payments", label: "المدفوعات", dateCol: "created_at" },
] as const;

type TableKey = typeof TABLES[number]["key"];

function toCSV(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\n");
}

function toJSON(rows: unknown[]): string { return JSON.stringify(rows, null, 2); }

function download(filename: string, content: string | Blob, mime = "text/csv;charset=utf-8") {
  const blob = content instanceof Blob ? content : new Blob(["\ufeff" + content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

async function fetchTable(name: TableKey, from?: string, to?: string) {
  const meta = TABLES.find((t) => t.key === name)!;
  let q: any = supabase.from(name).select("*");
  if (from) q = q.gte(meta.dateCol, new Date(from).toISOString());
  if (to) { const end = new Date(to); end.setHours(23, 59, 59, 999); q = q.lte(meta.dateCol, end.toISOString()); }
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

function ExportPageGuarded() {
  return (
    <PermissionGate perm="import_export">
      <ExportPage />
    </PermissionGate>
  );
}

function ExportPage() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Set<TableKey>>(new Set(["products"]));
  const [format, setFormat] = useState<"csv" | "json" | "pdf">("csv");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [logStatus, setLogStatus] = useState<"all" | "success" | "failed">("all");
  const [busy, setBusy] = useState(false);

  const { data: logs = [] } = useQuery({
    queryKey: ["export_logs", logStatus],
    queryFn: async () => {
      let q = supabase.from("export_logs").select("*").order("created_at", { ascending: false }).limit(100);
      if (logStatus !== "all") q = q.eq("status", logStatus);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const logMut = useMutation({
    mutationFn: async (entry: { export_type: string; format: string; tables: string[]; row_count: number; status: string; error_message?: string; duration_ms?: number; notes?: string }) => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("no user");
      const { error } = await supabase.from("export_logs").insert({ ...entry, user_id: u.user.id });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["export_logs"] }),
  });

  const deleteLog = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("export_logs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["export_logs"] }),
  });

  const toggle = (k: TableKey) => {
    const s = new Set(selected);
    s.has(k) ? s.delete(k) : s.add(k);
    setSelected(s);
  };
  const selectAll = () => setSelected(new Set(TABLES.map((t) => t.key)));
  const clearAll = () => setSelected(new Set());

  const runExport = async () => {
    if (selected.size === 0) return toast.error("اختر جدولاً واحداً على الأقل");
    setBusy(true);
    const started = Date.now();
    try {
      let total = 0;
      if (format === "pdf") {
        const doc = new jsPDF();
        let first = true;
        for (const key of selected) {
          const rows = (await fetchTable(key, from, to)) as Record<string, unknown>[];
          total += rows.length;
          if (!first) doc.addPage();
          first = false;
          doc.setFontSize(14);
          doc.text(key, 14, 15);
          if (rows.length > 0) {
            const headers = Object.keys(rows[0]);
            autoTable(doc, { startY: 20, head: [headers], body: rows.map((r) => headers.map((h) => String(r[h] ?? ""))), styles: { fontSize: 7 } });
          }
        }
        doc.save(`export-${Date.now()}.pdf`);
      } else {
        for (const key of selected) {
          const rows = await fetchTable(key, from, to);
          total += rows.length;
          if (format === "csv") {
            download(`${key}-${Date.now()}.csv`, toCSV(rows as Record<string, unknown>[]));
          } else {
            download(`${key}-${Date.now()}.json`, toJSON(rows), "application/json");
          }
        }
      }
      await logMut.mutateAsync({
        export_type: "partial",
        format,
        tables: [...selected],
        row_count: total,
        status: "success",
        duration_ms: Date.now() - started,
        notes: from || to ? `فلترة تاريخ: ${from || "?"} → ${to || "?"}` : undefined,
      });
      toast.success(`تم تصدير ${formatNumber(total)} سجل`);
    } catch (e: any) {
      await logMut.mutateAsync({
        export_type: "partial", format, tables: [...selected], row_count: 0,
        status: "failed", error_message: e?.message || "unknown", duration_ms: Date.now() - started,
      }).catch(() => {});
      toast.error("فشل التصدير: " + (e?.message || ""));
    } finally {
      setBusy(false);
    }
  };

  const fullBackup = async () => {
    setBusy(true);
    const started = Date.now();
    try {
      const backup: Record<string, unknown> = { exported_at: new Date().toISOString() };
      let total = 0;
      for (const t of TABLES) {
        const rows = await fetchTable(t.key);
        backup[t.key] = rows;
        total += rows.length;
      }
      download(`backup-${Date.now()}.json`, JSON.stringify(backup, null, 2), "application/json");
      await logMut.mutateAsync({
        export_type: "full_backup", format: "json",
        tables: TABLES.map((t) => t.key), row_count: total,
        status: "success", duration_ms: Date.now() - started,
        notes: "نسخة احتياطية كاملة",
      });
      toast.success(`نسخة احتياطية: ${formatNumber(total)} سجل`);
    } catch (e: any) {
      await logMut.mutateAsync({
        export_type: "full_backup", format: "json", tables: TABLES.map((t) => t.key), row_count: 0,
        status: "failed", error_message: e?.message || "unknown", duration_ms: Date.now() - started,
      }).catch(() => {});
      toast.error("فشل النسخ الاحتياطي");
    } finally {
      setBusy(false);
    }
  };

  const stats = useMemo(() => {
    const success = logs.filter((l: any) => l.status === "success").length;
    const failed = logs.filter((l: any) => l.status === "failed").length;
    const rows = logs.reduce((s: number, l: any) => s + (l.row_count || 0), 0);
    return { success, failed, rows };
  }, [logs]);

  return (
    <AppShell title="تصدير البيانات" showBack>
      <section className="rounded-2xl bg-card border p-4 shadow-card mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold">اختر الجداول</h2>
          <div className="flex gap-2 text-xs">
            <button onClick={selectAll} className="text-brand hover:underline">الكل</button>
            <button onClick={clearAll} className="text-muted-foreground hover:underline">مسح</button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {TABLES.map((t) => (
            <label key={t.key} className="flex items-center gap-2 rounded-lg border p-2 text-sm cursor-pointer hover:bg-muted/50">
              <input type="checkbox" checked={selected.has(t.key)} onChange={() => toggle(t.key)} className="size-4" />
              {t.label}
            </label>
          ))}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <label className="text-xs text-muted-foreground">
            <span className="flex items-center gap-1 mb-1"><Calendar className="size-3" /> من تاريخ</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-full h-10 rounded-lg border border-border bg-background px-2 text-sm nums" />
          </label>
          <label className="text-xs text-muted-foreground">
            <span className="flex items-center gap-1 mb-1"><Calendar className="size-3" /> إلى تاريخ</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-full h-10 rounded-lg border border-border bg-background px-2 text-sm nums" />
          </label>
        </div>

        <div className="mt-3">
          <div className="text-xs text-muted-foreground mb-1">الصيغة</div>
          <div className="grid grid-cols-3 gap-2">
            {(["csv", "json", "pdf"] as const).map((f) => (
              <button key={f} onClick={() => setFormat(f)}
                className={`h-10 rounded-lg border text-sm font-bold ${format === f ? "bg-brand text-brand-foreground border-brand" : "bg-background border-border"}`}>
                {f.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <button onClick={runExport} disabled={busy}
          className="mt-4 w-full flex items-center justify-center gap-2 rounded-lg bg-brand text-brand-foreground px-3 py-2.5 text-sm font-bold disabled:opacity-60">
          {format === "csv" ? <FileSpreadsheet className="size-4" /> : format === "pdf" ? <FileText className="size-4" /> : <Download className="size-4" />}
          تصدير الآن
        </button>
      </section>

      <section className="rounded-2xl bg-card border p-4 shadow-card mb-4">
        <h2 className="text-sm font-bold mb-2 flex items-center gap-2">
          <Database className="size-4" /> نسخة احتياطية كاملة
        </h2>
        <p className="text-xs text-muted-foreground mb-3">يشمل جميع الجداول بصيغة JSON قابلة للاستيراد لاحقاً.</p>
        <button onClick={fullBackup} disabled={busy}
          className="w-full flex items-center justify-center gap-2 rounded-lg bg-header text-header-foreground px-3 py-2 text-sm font-bold disabled:opacity-60">
          <Download className="size-4" /> تنزيل النسخة الكاملة
        </button>
      </section>

      <section className="rounded-2xl bg-card border p-4 shadow-card">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h2 className="text-sm font-bold flex items-center gap-2"><Filter className="size-4" /> سجل عمليات التصدير</h2>
          <select value={logStatus} onChange={(e) => setLogStatus(e.target.value as any)}
            className="h-8 rounded-md border border-border bg-background px-2 text-xs">
            <option value="all">الكل</option>
            <option value="success">ناجحة</option>
            <option value="failed">فاشلة</option>
          </select>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 p-2 text-center">
            <div className="text-[10px] text-muted-foreground">ناجحة</div>
            <div className="font-bold text-emerald-600 nums">{formatNumber(stats.success)}</div>
          </div>
          <div className="rounded-lg bg-rose-50 dark:bg-rose-950/30 p-2 text-center">
            <div className="text-[10px] text-muted-foreground">فاشلة</div>
            <div className="font-bold text-rose-600 nums">{formatNumber(stats.failed)}</div>
          </div>
          <div className="rounded-lg bg-muted p-2 text-center">
            <div className="text-[10px] text-muted-foreground">إجمالي السجلات</div>
            <div className="font-bold nums">{formatNumber(stats.rows)}</div>
          </div>
        </div>

        {logs.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">لا توجد عمليات بعد</p>
        ) : (
          <ul className="space-y-2">
            {logs.map((l: any) => (
              <li key={l.id} className="flex items-start justify-between rounded-lg border p-2 text-xs gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 font-bold">
                    {l.status === "success" ? <CheckCircle2 className="size-3.5 text-emerald-600" /> : <XCircle className="size-3.5 text-rose-600" />}
                    {l.export_type === "full_backup" ? "نسخة احتياطية" : "تصدير"} · {String(l.format).toUpperCase()}
                    {l.duration_ms != null && (
                      <span className="ms-auto text-muted-foreground font-normal flex items-center gap-0.5">
                        <Clock className="size-3" />{formatNumber(l.duration_ms)}ms
                      </span>
                    )}
                  </div>
                  <div className="text-muted-foreground truncate">{(l.tables ?? []).join(", ")} — {formatNumber(l.row_count)} سجل</div>
                  {l.error_message && <div className="text-rose-600 truncate">خطأ: {l.error_message}</div>}
                  {l.notes && <div className="text-muted-foreground text-[10px]">{l.notes}</div>}
                  <div className="text-muted-foreground nums text-[10px]">{new Date(l.created_at).toLocaleString("ar")}</div>
                </div>
                <button onClick={() => deleteLog.mutate(l.id)} className="p-1.5 rounded-md hover:bg-muted shrink-0" aria-label="حذف">
                  <Trash2 className="size-3.5 text-destructive" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AppShell>
  );
}
