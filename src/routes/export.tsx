import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { PermissionGate } from "@/components/PermissionGate";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Download, FileText, Database, Trash2, FileSpreadsheet, CheckCircle2, XCircle, Calendar, Filter, Clock, RefreshCw, StopCircle, Loader2 } from "lucide-react";
import { exportPdfFromRows } from "@/lib/pdf-html-export";
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

/** Standard Arabic column headers — match the ones the import page detects. */
const STANDARD_HEADERS: Partial<Record<TableKey, Record<string, string>>> = {
  products: {
    name: "الاسم", barcode: "الباركود", part_number: "رقم القطعة", category: "الفئة", unit: "الوحدة",
    location: "الموقع (الرف)", quantity: "الكمية", min_quantity: "الحد الأدنى",
    cost_price: "سعر الشراء", sale_price: "سعر البيع", notes: "ملاحظات",
  },
};

/** Auto/technical columns pushed to the end when ordering exported rows. */
const AUTO_COLS_LAST = ["id", "user_id", "created_at", "updated_at"];

/** Canonical, stable column order per table — guarantees identical output between exports. */
const SCHEMA_ORDER: Partial<Record<TableKey, string[]>> = {
  products: ["name", "barcode", "category", "unit", "location", "quantity", "min_quantity", "cost_price", "sale_price", "notes"],
  customers: ["name", "phone", "email", "address", "notes", "balance"],
  suppliers: ["name", "phone", "email", "address", "notes"],
  invoices: ["invoice_number", "customer_id", "status", "subtotal", "discount", "tax", "total", "paid", "payment_method_id", "transaction_ref", "notes", "cancelled_at", "cancelled_by", "cancellation_reason"],
  invoice_items: ["invoice_id", "product_id", "product_name", "quantity", "unit_price", "discount", "total"],
  expenses: ["expense_date", "category", "description", "amount", "payment_method_id", "notes"],
  returns: ["invoice_id", "product_id", "quantity", "reason", "refund_amount", "notes"],
  purchases: ["supplier_id", "purchase_number", "subtotal", "discount", "tax", "total", "paid", "notes"],
  payments: ["invoice_id", "amount", "payment_method_id", "transaction_ref", "notes"],
};

/** Reorder columns deterministically: canonical schema first, then any extras, then tech columns last. */
function orderCols(cols: string[], table?: TableKey): string[] {
  const canonical = (table && SCHEMA_ORDER[table]) || [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of canonical) if (cols.includes(c) && !seen.has(c)) { out.push(c); seen.add(c); }
  const extras = cols.filter((c) => !seen.has(c) && !AUTO_COLS_LAST.includes(c)).sort();
  for (const c of extras) { out.push(c); seen.add(c); }
  for (const c of AUTO_COLS_LAST) if (cols.includes(c) && !seen.has(c)) { out.push(c); seen.add(c); }
  return out;
}

/** Dev-only invariant: CSV headers (standard mode) must equal the import page's canonical Arabic labels. */
function assertHeadersMatchImport(table: TableKey, cols: string[], headers: string[]) {
  const map = STANDARD_HEADERS[table];
  if (!map) return;
  const expectedCols = Object.keys(map);
  const missing = expectedCols.filter((c) => !cols.includes(c));
  if (missing.length) console.warn(`[export] ${table}: أعمدة مفقودة عن معيار الاستيراد:`, missing);
  const mismatched = cols.map((c, i) => ({ c, want: map[c], got: headers[i] })).filter((x) => x.want && x.want !== x.got);
  if (mismatched.length) console.error(`[export] ${table}: عناوين CSV لا تطابق أسماء الاستيراد`, mismatched);
}

function toCSV(rows: Record<string, unknown>[], table?: TableKey, headerMap?: Record<string, string>): string {
  if (rows.length === 0) return "";
  const allKeys = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  const cols = headerMap ? Object.keys(headerMap).filter((c) => allKeys.includes(c)) : orderCols(allKeys, table);
  const headers = headerMap ? cols.map((c) => headerMap[c]) : cols;
  if (headerMap && table) assertHeadersMatchImport(table, cols, headers);
  const esc = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}

function toJSON(rows: Record<string, unknown>[], table?: TableKey): string {
  if (rows.length === 0) return "[]";
  const allKeys = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  const cols = orderCols(allKeys, table);
  const ordered = rows.map((r) => Object.fromEntries(cols.map((c) => [c, r[c]])));
  return JSON.stringify(ordered, null, 2);
}

function download(filename: string, content: string | Blob, mime = "text/csv;charset=utf-8") {
  const blob = content instanceof Blob ? content : new Blob(["\ufeff" + content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

async function fetchTable(name: TableKey, from?: string, to?: string) {
  const all: any[] = [];
  await streamTablePages(name, from, to, async (batch) => { all.push(...batch); });
  return all;
}

/**
 * تدفّق (streaming) الصفحات من قاعدة البيانات: يستدعي onPage لكل دفعة بدون
 * تجميع كل السجلات في الذاكرة — لتصدير 10k+ صف بسلاسة.
 */
async function streamTablePages(
  name: TableKey,
  from: string | undefined,
  to: string | undefined,
  onPage: (batch: any[], offset: number) => Promise<boolean | void>,
) {
  const meta = TABLES.find((t) => t.key === name)!;
  const PAGE = 1000;
  const MAX_ROWS = 200000;
  for (let off = 0; off < MAX_ROWS; off += PAGE) {
    let q: any = supabase.from(name).select("*");
    if (from) q = q.gte(meta.dateCol, new Date(from).toISOString());
    if (to) { const end = new Date(to); end.setHours(23, 59, 59, 999); q = q.lte(meta.dateCol, end.toISOString()); }
    const { data, error } = await q.range(off, off + PAGE - 1);
    if (error) throw error;
    const batch = data ?? [];
    const cont = await onPage(batch, off);
    if (cont === false) return;
    if (batch.length < PAGE) return;
  }
}

/** يبني رأس CSV مرة واحدة ثم يُرجع دالة تحوّل كل دفعة إلى نص CSV بدون رأس. */
function makeCsvWriter(headerCols: string[], headerLabels: string[]) {
  const esc = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = headerLabels.join(",") + "\n";
  const rowsToCsv = (rows: Record<string, unknown>[]) =>
    rows.map((r) => headerCols.map((c) => esc(r[c])).join(",")).join("\n") + "\n";
  return { header, rowsToCsv };
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
  const [standardHeaders, setStandardHeaders] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ table: string; done: number } | null>(null);
  const abortRef = useRef<{ cancelled: boolean } | null>(null);
  const cancelExport = () => {
    if (abortRef.current) {
      abortRef.current.cancelled = true;
      toast.message("جارٍ الإلغاء…", { id: "export-progress" });
    }
  };

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
    mutationFn: async (entry: { export_type: string; format: string; tables: string[]; row_count: number; status: string; error_message?: string; duration_ms?: number; notes?: string; payload?: any }) => {
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

  // Realtime notifications on export log inserts. Guarded against StrictMode double-mount.
  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    (async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id;
      if (!uid || cancelled) return;
      const ch = supabase
        .channel(`export_logs:${uid}:${crypto.randomUUID()}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "export_logs", filter: `user_id=eq.${uid}` }, (p) => {
          const row = p.new as { status: string; row_count: number; export_type: string; error_message: string | null };
          if (row.status === "success") toast.success(`تصدير ناجح: ${row.row_count} سجل (${row.export_type === "full_backup" ? "نسخة احتياطية" : "تصدير"})`);
          else toast.error(`فشل التصدير${row.error_message ? `: ${row.error_message}` : ""}`);
          qc.invalidateQueries({ queryKey: ["export_logs"] });
        })
        .subscribe();
      if (cancelled) { supabase.removeChannel(ch); return; }
      channel = ch;
    })();
    return () => { cancelled = true; if (channel) supabase.removeChannel(channel); };
  }, [qc]);



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
    abortRef.current = { cancelled: false };
    const started = Date.now();
    try {
      let total = 0;
      for (const key of selected) {
        if (abortRef.current?.cancelled) throw new Error("ألغيت العملية بواسطة المستخدم");
        setProgress({ table: key, done: 0 });

        if (format === "pdf") {
          // PDF لا يدعم streaming حقيقي — نجمّع مع تحديث تقدم لكل صفحة
          const rows: Record<string, unknown>[] = [];
          await streamTablePages(key, from, to, async (batch) => {
            if (abortRef.current?.cancelled) return false;
            rows.push(...(batch as Record<string, unknown>[]));
            setProgress({ table: key, done: rows.length });
            toast.message(`${key}: ${formatNumber(rows.length)} سجل`, { id: "export-progress" });
          });
          total += rows.length;
          if (rows.length === 0) continue;
          const allKeys = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
          const headers = orderCols(allKeys, key);
          exportPdfFromRows({
            title: key,
            subtitle: new Date().toLocaleString("ar-EG"),
            headers,
            rows: rows.map((r) => headers.map((h) => String(r[h] ?? ""))),
          });
          continue;
        }

        // CSV / JSON: نبني الملف كأجزاء (chunks) في Blob بدون تجميع كل شيء في سلسلة نصية واحدة.
        const parts: BlobPart[] = ["\ufeff"]; // BOM لدعم العربية
        let rowCount = 0;
        let csvWriter: ReturnType<typeof makeCsvWriter> | null = null;
        let schemaCols: string[] | null = null;

        await streamTablePages(key, from, to, async (batch) => {
          if (abortRef.current?.cancelled) return false;
          if (batch.length === 0) return;

          if (format === "csv") {
            if (!csvWriter) {
              const headerMap = standardHeaders ? STANDARD_HEADERS[key] : undefined;
              const allKeys = Array.from(new Set(batch.flatMap((r: any) => Object.keys(r))));
              const cols = headerMap ? Object.keys(headerMap).filter((c) => allKeys.includes(c)) : orderCols(allKeys, key);
              const labels = headerMap ? cols.map((c) => headerMap[c]) : cols;
              csvWriter = makeCsvWriter(cols, labels);
              parts.push(csvWriter.header);
            }
            parts.push(csvWriter.rowsToCsv(batch as Record<string, unknown>[]));
          } else {
            // JSON streaming: بناء المصفوفة قطعة قطعة
            if (!schemaCols) {
              const allKeys = Array.from(new Set(batch.flatMap((r: any) => Object.keys(r))));
              schemaCols = orderCols(allKeys, key);
              parts.push("[\n");
            }
            const ordered = (batch as Record<string, unknown>[]).map((r) =>
              Object.fromEntries(schemaCols!.map((c) => [c, r[c]])),
            );
            const text = ordered.map((o) => "  " + JSON.stringify(o)).join(",\n");
            parts.push(rowCount === 0 ? text : ",\n" + text);
          }

          rowCount += batch.length;
          setProgress({ table: key, done: rowCount });
          toast.message(`${key}: ${formatNumber(rowCount)} سجل`, { id: "export-progress" });
          // إفساح المجال للـ UI + زر الإلغاء
          await new Promise((r) => setTimeout(r, 0));
        });

        if (format === "json") parts.push(schemaCols ? "\n]\n" : "[]");
        if (rowCount === 0 && format === "csv") continue;

        const mime = format === "csv" ? "text/csv;charset=utf-8" : "application/json;charset=utf-8";
        const ext = format;
        const blob = new Blob(parts, { type: mime });
        download(`${key}-${Date.now()}.${ext}`, blob, mime);
        total += rowCount;
      }

      const partialPayload = { export_type: "partial", format, tables: [...selected], from, to };
      await logMut.mutateAsync({
        export_type: "partial",
        format,
        tables: [...selected],
        row_count: total,
        status: "success",
        duration_ms: Date.now() - started,
        notes: from || to ? `فلترة تاريخ: ${from || "?"} → ${to || "?"}` : undefined,
        payload: partialPayload,
      });
      const { data: au } = await supabase.auth.getUser();
      if (au?.user) await supabase.from("audit_logs").insert({
        user_id: au.user.id, action: "data.export", table_name: [...selected].join(","),
        details: { format, tables: [...selected], row_count: total, from, to, duration_ms: Date.now() - started },
      }).then(() => undefined, () => undefined);
      toast.success(`تم تصدير ${formatNumber(total)} سجل`);
    } catch (e: any) {
      await logMut.mutateAsync({
        export_type: "partial", format, tables: [...selected], row_count: 0,
        status: "failed", error_message: e?.message || "unknown", duration_ms: Date.now() - started,
        payload: { export_type: "partial", format, tables: [...selected], from, to },
      }).catch(() => {});
      const { data: au } = await supabase.auth.getUser();
      if (au?.user) await supabase.from("audit_logs").insert({
        user_id: au.user.id, action: "data.export.failed", table_name: [...selected].join(","),
        details: { format, tables: [...selected], from, to, error: e?.message ?? "unknown", duration_ms: Date.now() - started },
      }).then(() => undefined, () => undefined);
      toast.error("فشل التصدير: " + (e?.message || ""));
    } finally {
      setBusy(false);
      setProgress(null);
      abortRef.current = null;
    }
  };

  const fullBackup = async () => {
    setBusy(true);
    abortRef.current = { cancelled: false };
    const started = Date.now();
    try {
      // نسخة احتياطية streaming: نكتب JSON قطعة قطعة بدل تحميل كل شيء في الذاكرة.
      const parts: BlobPart[] = [`{\n  "exported_at": ${JSON.stringify(new Date().toISOString())}`];
      let total = 0;
      for (const t of TABLES) {
        if (abortRef.current?.cancelled) throw new Error("ألغيت العملية بواسطة المستخدم");
        setProgress({ table: t.key, done: 0 });
        parts.push(`,\n  ${JSON.stringify(t.key)}: [\n`);
        let count = 0;
        await streamTablePages(t.key, undefined, undefined, async (batch) => {
          if (abortRef.current?.cancelled) return false;
          if (batch.length === 0) return;
          const text = batch.map((r: any) => "    " + JSON.stringify(r)).join(",\n");
          parts.push(count === 0 ? text : ",\n" + text);
          count += batch.length;
          setProgress({ table: t.key, done: count });
          toast.message(`${t.key}: ${formatNumber(count)} سجل`, { id: "export-progress" });
          await new Promise((r) => setTimeout(r, 0));
        });
        parts.push("\n  ]");
        total += count;
      }
      parts.push("\n}\n");
      const blob = new Blob(parts, { type: "application/json;charset=utf-8" });
      download(`backup-${Date.now()}.json`, blob, "application/json");
      await logMut.mutateAsync({
        export_type: "full_backup", format: "json",
        tables: TABLES.map((t) => t.key), row_count: total,
        status: "success", duration_ms: Date.now() - started,
        notes: "نسخة احتياطية كاملة (streaming)",
        payload: { export_type: "full_backup", format: "json" },
      });
      const { data: au } = await supabase.auth.getUser();
      if (au?.user) await supabase.from("audit_logs").insert({
        user_id: au.user.id, action: "data.export.backup", table_name: "*",
        details: { row_count: total, duration_ms: Date.now() - started },
      }).then(() => undefined, () => undefined);
      toast.success(`نسخة احتياطية: ${formatNumber(total)} سجل`);
    } catch (e: any) {
      await logMut.mutateAsync({
        export_type: "full_backup", format: "json", tables: TABLES.map((t) => t.key), row_count: 0,
        status: "failed", error_message: e?.message || "unknown", duration_ms: Date.now() - started,
        payload: { export_type: "full_backup", format: "json" },
      }).catch(() => {});
      toast.error("فشل النسخ الاحتياطي: " + (e?.message || ""));
    } finally {
      setBusy(false);
      setProgress(null);
      abortRef.current = null;
    }
  };


  function retryFromLog(l: any) {
    const p = l?.payload;
    if (!p) { toast.error("لا يمكن إعادة تشغيل هذه العملية"); return; }
    if (!confirm("سيتم إعادة تشغيل العملية بنفس الإعدادات. متابعة؟")) return;
    if (p.export_type === "full_backup") { void fullBackup(); return; }
    if (Array.isArray(p.tables)) setSelected(new Set(p.tables));
    if (p.format) setFormat(p.format);
    if (typeof p.from === "string") setFrom(p.from);
    if (typeof p.to === "string") setTo(p.to);
    setTimeout(() => { void runExport(); }, 0);
  }



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

        {format === "csv" && selected.has("products") && (
          <label className="mt-3 flex items-start gap-2 rounded-lg border p-2.5 text-xs cursor-pointer bg-brand/5 border-brand/20">
            <input type="checkbox" checked={standardHeaders} onChange={(e) => setStandardHeaders(e.target.checked)} className="size-4 mt-0.5" />
            <span>
              <span className="font-bold block">استخدم أسماء الأعمدة المعيارية (متوافق مع الاستيراد)</span>
              <span className="text-muted-foreground">
                يستبدل أسماء الأعمدة الإنجليزية بالعربية (الاسم، الباركود، سعر الشراء، سعر البيع…) لتتمكّن من إعادة استيراد نفس الملف مباشرةً.
              </span>
            </span>
          </label>
        )}


        {progress && (
          <div className="mt-4 rounded-lg border border-brand/40 bg-brand/5 p-3 text-xs flex items-center justify-between gap-2">
            <span className="flex items-center gap-1 font-bold">
              <Loader2 className="size-3.5 animate-spin" /> {progress.table} · {formatNumber(progress.done)} سجل
            </span>
            <button onClick={cancelExport} className="inline-flex items-center gap-1 px-2 h-7 rounded-md bg-destructive text-white font-bold">
              <StopCircle className="size-3.5" /> إلغاء
            </button>
          </div>
        )}
        <button onClick={busy ? cancelExport : runExport} disabled={!busy && selected.size === 0}
          className={`mt-4 w-full flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-bold disabled:opacity-60 ${busy ? "bg-destructive text-white" : "bg-brand text-brand-foreground"}`}>
          {busy ? <><StopCircle className="size-4" /> إلغاء العملية</> : <>{format === "csv" ? <FileSpreadsheet className="size-4" /> : format === "pdf" ? <FileText className="size-4" /> : <Download className="size-4" />} تصدير الآن</>}
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
                <div className="flex items-center gap-1 shrink-0">
                  {l.payload && (
                    <button onClick={() => retryFromLog(l)} disabled={busy} className="p-1.5 rounded-md hover:bg-muted disabled:opacity-50" aria-label="إعادة المحاولة" title="إعادة المحاولة">
                      <RefreshCw className="size-3.5 text-brand" />
                    </button>
                  )}
                  <button onClick={() => deleteLog.mutate(l.id)} className="p-1.5 rounded-md hover:bg-muted" aria-label="حذف">
                    <Trash2 className="size-3.5 text-destructive" />
                  </button>
                </div>

              </li>
            ))}
          </ul>
        )}
      </section>
    </AppShell>
  );
}
