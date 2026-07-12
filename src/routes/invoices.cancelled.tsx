import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { PermissionGate } from "@/components/PermissionGate";
import { supabase } from "@/integrations/supabase/client";
import { formatSDG } from "@/lib/format";
import { XCircle, Receipt, Eye, Search, FileSpreadsheet, FileText, ArrowUpDown, FileJson, FileDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import * as XLSX from "xlsx";
import { exportPdfFromRows } from "@/lib/pdf-html-export";
import { toast } from "sonner";
import { buildCsvBlob, jsonBlob, saveBlob } from "@/lib/csv-export";

export const Route = createFileRoute("/invoices/cancelled")({
  head: () => ({ meta: [{ title: "الفواتير الملغاة — المهندس" }] }),
  component: () => (
    <PermissionGate perm="invoices.write">
      <CancelledInvoicesPage />
    </PermissionGate>
  ),
});

type Row = {
  id: string;
  invoice_number: number;
  total: number;
  customer_name: string | null;
  cancellation_reason: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  user_id: string;
  created_at: string;
  status: string;
};

type SortKey = "cancelled_at" | "invoice_number" | "total" | "customer_name";
type QuickRange = "" | "7d" | "30d" | "month";

const PAGE_SIZE = 20;

function computeRange(q: QuickRange): { from: string; to: string } | null {
  if (!q) return null;
  const now = new Date();
  const to = new Date(now); to.setHours(23, 59, 59, 999);
  const from = new Date(now);
  if (q === "7d") from.setDate(now.getDate() - 7);
  else if (q === "30d") from.setDate(now.getDate() - 30);
  else if (q === "month") { from.setDate(1); from.setHours(0, 0, 0, 0); }
  return { from: from.toISOString(), to: to.toISOString() };
}

function CancelledInvoicesPage() {
  const [users, setUsers] = useState<Map<string, string>>(new Map());
  const [adminIds, setAdminIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [reasonFilter, setReasonFilter] = useState("");
  const [cashierFilter, setCashierFilter] = useState<string>("");
  const [userType, setUserType] = useState<"" | "cashier" | "admin">("");
  const [onlyCashier, setOnlyCashier] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("cancelled_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [quick, setQuick] = useState<QuickRange>("");
  const [dFrom, setDFrom] = useState("");
  const [dTo, setDTo] = useState("");
  const [page, setPage] = useState(1);
  const [showReturns, setShowReturns] = useState(true);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["invoices-cancelled", quick, dFrom, dTo],
    queryFn: async () => {
      let q = supabase
        .from("invoices")
        .select("id, invoice_number, total, customer_name, cancellation_reason, cancelled_at, cancelled_by, user_id, created_at, status")
        .eq("status", "cancelled")
        .order("cancelled_at", { ascending: false, nullsFirst: false })
        .limit(2000);
      const range = computeRange(quick);
      const fromIso = range ? range.from : (dFrom ? new Date(dFrom).toISOString() : null);
      const toIso = range ? range.to : (dTo ? (() => { const d = new Date(dTo); d.setHours(23,59,59,999); return d.toISOString(); })() : null);
      if (fromIso) q = q.gte("cancelled_at", fromIso);
      if (toIso) q = q.lte("cancelled_at", toIso);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const { data: returns = [] } = useQuery({
    queryKey: ["invoices-cancelled-returns", quick, dFrom, dTo],
    queryFn: async () => {
      let q = supabase
        .from("returns")
        .select("id, invoice_id, product_name, quantity, reason, status, created_at, user_id")
        .eq("status", "accepted")
        .order("created_at", { ascending: false })
        .limit(1000);
      const range = computeRange(quick);
      const fromIso = range ? range.from : (dFrom ? new Date(dFrom).toISOString() : null);
      const toIso = range ? range.to : (dTo ? (() => { const d = new Date(dTo); d.setHours(23,59,59,999); return d.toISOString(); })() : null);
      if (fromIso) q = q.gte("created_at", fromIso);
      if (toIso) q = q.lte("created_at", toIso);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; invoice_id: string | null; product_name: string; quantity: number; reason: string | null; status: string; created_at: string; user_id: string }>;
    },
  });

  // Fetch invoice items for cancelled invoices to reconcile sold vs returned qty
  const cancelledIds = useMemo(() => rows.map((r) => r.id), [rows]);
  const { data: itemsByInvoice = new Map<string, number>() } = useQuery({
    queryKey: ["invoices-cancelled-items", cancelledIds.slice(0, 300).join(",")],
    enabled: cancelledIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("invoice_items")
        .select("invoice_id, quantity")
        .in("invoice_id", cancelledIds);
      const m = new Map<string, number>();
      (data ?? []).forEach((it: { invoice_id: string; quantity: number }) => {
        m.set(it.invoice_id, (m.get(it.invoice_id) ?? 0) + Number(it.quantity || 0));
      });
      return m;
    },
  });

  useEffect(() => {
    (async () => {
      const [{ data: usersList }, { data: roles }] = await Promise.all([
        supabase.rpc("admin_list_users"),
        supabase.from("user_roles").select("user_id, role").eq("role", "admin"),
      ]);
      const map = new Map<string, string>();
      (usersList ?? []).forEach((u: { user_id: string; email: string }) => map.set(u.user_id, u.email));
      setUsers(map);
      setAdminIds(new Set((roles ?? []).map((r: { user_id: string }) => r.user_id)));
    })();
  }, []);

  useEffect(() => { setPage(1); }, [search, reasonFilter, cashierFilter, userType, onlyCashier, quick, dFrom, dTo]);

  const cashiers = useMemo(() => {
    const set = new Set(rows.map((r) => r.cancelled_by || r.user_id).filter(Boolean) as string[]);
    return Array.from(set);
  }, [rows]);

  // Map invoice_id → returns aggregate (qty sum)
  const returnsByInvoice = useMemo(() => {
    const m = new Map<string, { qty: number; items: typeof returns }>();
    for (const r of returns) {
      if (!r.invoice_id) continue;
      const cur = m.get(r.invoice_id) ?? { qty: 0, items: [] as typeof returns };
      cur.qty += Number(r.quantity) || 0;
      cur.items.push(r);
      m.set(r.invoice_id, cur);
    }
    return m;
  }, [returns]);

  // Returns on invoices that are NOT cancelled (standalone partial returns section)
  const standaloneReturns = useMemo(() => {
    const cancelledIds = new Set(rows.map((r) => r.id));
    return returns.filter((r) => !r.invoice_id || !cancelledIds.has(r.invoice_id));
  }, [returns, rows]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    const rs = reasonFilter.trim().toLowerCase();
    let out = rows.filter((r) => {
      if (s) {
        const hay = [String(r.invoice_number), r.customer_name ?? "", r.cancellation_reason ?? ""].join(" ").toLowerCase();
        if (!hay.includes(s)) return false;
      }
      if (rs && !(r.cancellation_reason ?? "").toLowerCase().includes(rs)) return false;
      if (cashierFilter && (r.cancelled_by || r.user_id) !== cashierFilter) return false;
      const who = r.cancelled_by || r.user_id;
      if (userType === "cashier" && (!who || adminIds.has(who))) return false;
      if (userType === "admin" && (!who || !adminIds.has(who))) return false;
      if (onlyCashier) {
        if (!who || adminIds.has(who)) return false;
      }
      return true;
    });
    out = [...out].sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      const va: any = a[sortKey] ?? "";
      const vb: any = b[sortKey] ?? "";
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
      return String(va).localeCompare(String(vb), "ar") * dir;
    });
    return out;
  }, [rows, search, reasonFilter, cashierFilter, userType, onlyCashier, adminIds, sortKey, sortDir]);


  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = useMemo(() => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [filtered, page]);

  function buildExportRows() {
    return filtered.map((r) => ({
      "رقم الفاتورة": r.invoice_number,
      "التاريخ": new Date(r.created_at).toLocaleString("ar-EG"),
      "العميل": r.customer_name ?? "—",
      "الإجمالي": Number(r.total),
      "الحالة": "ملغاة",
      "سبب الإلغاء": r.cancellation_reason ?? "— (لم يُذكر)",
      "تاريخ الإلغاء": r.cancelled_at ? new Date(r.cancelled_at).toLocaleString("ar-EG") : "—",
      "ألغيت بواسطة": r.cancelled_by ? (users.get(r.cancelled_by) ?? r.cancelled_by.slice(0, 8)) : "—",
      "الكاشير الأصلي": users.get(r.user_id) ?? r.user_id.slice(0, 8),
    }));
  }

  function download(blob: Blob, name: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 500);
  }

  function exportXLSX() {
    if (filtered.length === 0) { toast.info("لا توجد بيانات للتصدير"); return; }
    const rowsX = buildExportRows();
    const ws = XLSX.utils.json_to_sheet(rowsX);
    ws["!cols"] = Object.keys(rowsX[0]).map(() => ({ wch: 18 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "فواتير ملغاة");
    XLSX.writeFile(wb, `cancelled-invoices-${Date.now()}.xlsx`);
    toast.success(`تم تصدير ${rowsX.length} فاتورة`);
  }

  function exportCSV() {
    if (filtered.length === 0) { toast.info("لا توجد بيانات للتصدير"); return; }
    const rowsX = buildExportRows();
    const headers = Object.keys(rowsX[0]);
    const lines = [headers.join(",")];
    for (const r of rowsX) lines.push(headers.map((h) => {
      const v = String((r as any)[h] ?? "");
      return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
    }).join(","));
    download(new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" }), `cancelled-invoices-${Date.now()}.csv`);
    toast.success(`تم تصدير ${rowsX.length} فاتورة`);
  }

  function exportJSON() {
    if (filtered.length === 0) { toast.info("لا توجد بيانات للتصدير"); return; }
    download(new Blob([JSON.stringify(buildExportRows(), null, 2)], { type: "application/json" }), `cancelled-invoices-${Date.now()}.json`);
    toast.success(`تم تصدير ${filtered.length} فاتورة`);
  }

  function exportPDF() {
    if (filtered.length === 0) { toast.info("لا توجد بيانات للتصدير"); return; }
    const rowsX = buildExportRows();
    const headers = Object.keys(rowsX[0]);
    exportPdfFromRows({
      title: "الفواتير الملغاة",
      subtitle: new Date().toLocaleString("ar-EG"),
      headers,
      rows: rowsX.map((r) => headers.map((h) => String((r as any)[h] ?? ""))),
    });
    toast.success(`تم تصدير ${rowsX.length} فاتورة`);
  }

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("desc"); }
  }

  return (
    <AppShell title="الفواتير الملغاة" showBack>
      <div className="mx-auto max-w-5xl space-y-3">
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          <div className="flex items-center gap-2 font-bold">
            <XCircle className="size-4" /> فواتير ألغيت — {filtered.length} من {rows.length}
          </div>
          <div className="text-xs mt-0.5 opacity-80">تعرض الفواتير التي تم إلغاؤها بواسطة الكاشير أو المدير مع السبب والوقت.</div>
        </div>

        <div className="rounded-xl bg-card border border-border p-3 shadow-card space-y-2">
          <div className="grid sm:grid-cols-2 gap-2">
            <div className="relative">
              <Search className="size-4 absolute top-1/2 -translate-y-1/2 start-2 text-muted-foreground" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث بالرقم أو العميل أو السبب..." className="w-full h-10 rounded-lg border border-border bg-background ps-8 pe-3 text-sm" />
            </div>
            <input value={reasonFilter} onChange={(e) => setReasonFilter(e.target.value)} placeholder="تصفية سبب الإلغاء..." className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm" />
            <select value={cashierFilter} onChange={(e) => setCashierFilter(e.target.value)} className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm">
              <option value="">كل الكاشير</option>
              {cashiers.map((id) => (<option key={id} value={id}>{users.get(id) ?? id.slice(0, 8)}</option>))}
            </select>
            <div className="flex gap-1 flex-wrap">
              <button onClick={exportXLSX} title="Excel" className="h-10 px-2 rounded-lg bg-emerald-600 text-white text-xs font-bold flex items-center gap-1"><FileSpreadsheet className="size-4" />Excel</button>
              <button onClick={exportCSV} title="CSV" className="h-10 px-2 rounded-lg bg-sky-600 text-white text-xs font-bold flex items-center gap-1"><FileDown className="size-4" />CSV</button>
              <button onClick={exportJSON} title="JSON" className="h-10 px-2 rounded-lg bg-indigo-600 text-white text-xs font-bold flex items-center gap-1"><FileJson className="size-4" />JSON</button>
              <button onClick={exportPDF} title="PDF" className="h-10 px-2 rounded-lg bg-rose-600 text-white text-xs font-bold flex items-center gap-1"><FileText className="size-4" />PDF</button>
            </div>
          </div>
          <div className="grid sm:grid-cols-3 gap-2">
            <select value={userType} onChange={(e) => setUserType(e.target.value as any)} className="h-10 rounded-lg border border-border bg-background px-3 text-sm">
              <option value="">كل أنواع المستخدمين</option>
              <option value="cashier">كاشير فقط</option>
              <option value="admin">مدير فقط</option>
            </select>
            <input type="date" value={dFrom} disabled={!!quick} onChange={(e) => setDFrom(e.target.value)} className="h-10 rounded-lg border border-border bg-background px-2 text-sm disabled:opacity-50" />
            <input type="date" value={dTo} disabled={!!quick} onChange={(e) => setDTo(e.target.value)} className="h-10 rounded-lg border border-border bg-background px-2 text-sm disabled:opacity-50" />
          </div>
          <div className="flex items-center gap-1 text-xs flex-wrap">
            <span className="font-bold text-muted-foreground">نطاق سريع:</span>
            {([["", "الكل"], ["7d", "آخر 7 أيام"], ["30d", "آخر 30 يوم"], ["month", "هذا الشهر"]] as [QuickRange, string][]).map(([v, label]) => (
              <button key={v} onClick={() => setQuick(v)} className={`px-2 py-1 rounded-md border ${quick === v ? "bg-brand text-brand-foreground border-brand" : "bg-background border-border"}`}>{label}</button>
            ))}
            <label className="ms-auto flex items-center gap-1 cursor-pointer">
              <input type="checkbox" checked={showReturns} onChange={(e) => setShowReturns(e.target.checked)} className="size-3.5" />
              <span>عرض الإرجاعات الجزئية</span>
            </label>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1 flex-wrap">
            <span className="font-bold">ترتيب:</span>
            {(["cancelled_at", "invoice_number", "total", "customer_name"] as SortKey[]).map((k) => (
              <button key={k} onClick={() => toggleSort(k)} className={`px-2 py-1 rounded-md border inline-flex items-center gap-1 ${sortKey === k ? "bg-brand text-brand-foreground border-brand" : "bg-background border-border"}`}>
                {k === "cancelled_at" ? "تاريخ الإلغاء" : k === "invoice_number" ? "رقم الفاتورة" : k === "total" ? "الإجمالي" : "العميل"}
                {sortKey === k && <ArrowUpDown className="size-3" />}
                {sortKey === k && <span>{sortDir === "asc" ? "↑" : "↓"}</span>}
              </button>
            ))}
            <label className="ms-auto flex items-center gap-1 cursor-pointer">
              <input type="checkbox" checked={onlyCashier} onChange={(e) => setOnlyCashier(e.target.checked)} className="size-3.5" />
              <span>من الكاشير فقط</span>
            </label>
          </div>

        </div>

        {isLoading ? (
          <div className="text-center py-10 text-muted-foreground">جاري التحميل...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            <Receipt className="size-10 mx-auto mb-2 opacity-40" />
            لا توجد فواتير مطابقة
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {pageRows.map((r) => {
                const actor = r.cancelled_by ? users.get(r.cancelled_by) ?? "غير معروف" : "—";
                const who = r.cancelled_by || r.user_id;
                const byCashier = who ? !adminIds.has(who) : false;
                return (
                  <div key={r.id} className="rounded-xl bg-card border border-border p-3 shadow-card">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold">فاتورة #{r.invoice_number}</span>
                          <span className="text-xs rounded-full bg-red-100 text-red-700 px-2 py-0.5">ملغاة</span>
                          {byCashier && <span className="text-xs rounded-full bg-amber-100 text-amber-800 px-2 py-0.5">بواسطة كاشير</span>}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {r.customer_name || "بدون عميل"} · {new Date(r.created_at).toLocaleString("ar-EG")}
                        </div>
                      </div>
                      <div className="text-end">
                        <div className="font-bold nums">{formatSDG(Number(r.total))}</div>
                        <Link to="/invoices/$invoiceId" params={{ invoiceId: r.id }} search={{ autoprint: 0 }} className="text-xs text-brand inline-flex items-center gap-1 mt-1">
                          <Eye className="size-3" /> عرض
                        </Link>
                      </div>
                    </div>
                    <div className="mt-2 grid sm:grid-cols-2 gap-2 text-xs">
                      <div className="rounded-md bg-muted/50 p-2">
                        <div className="font-semibold text-muted-foreground mb-0.5">السبب</div>
                        <div>{r.cancellation_reason || "— (لم يُذكر)"}</div>
                      </div>
                      <div className="rounded-md bg-muted/50 p-2">
                        <div className="font-semibold text-muted-foreground mb-0.5">ألغيت بواسطة</div>
                        <div className="truncate">{actor} {who && (adminIds.has(who) ? <span className="text-[10px] text-brand">(مدير)</span> : <span className="text-[10px] text-amber-700">(كاشير)</span>)}</div>
                        {r.cancelled_at && <div className="text-muted-foreground mt-0.5">{new Date(r.cancelled_at).toLocaleString("ar-EG")}</div>}
                      </div>
                    </div>
                    {(() => {
                      const ret = returnsByInvoice.get(r.id);
                      const soldQty = itemsByInvoice.get(r.id) ?? 0;
                      const retQty = ret?.qty ?? 0;
                      const mismatch = soldQty > 0 && retQty !== soldQty;
                      return (
                        <>
                          <div className={`mt-2 rounded-md p-2 text-xs border ${
                            mismatch
                              ? "bg-amber-50 border-amber-300 text-amber-900"
                              : retQty > 0
                                ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                                : "bg-muted/40 border-border text-muted-foreground"
                          }`}>
                            <div className="font-bold flex items-center justify-between gap-2">
                              <span>🔄 تسوية المخزون</span>
                              <span className="nums">
                                مُباع: {soldQty} · مُرتجع: {retQty}
                                {mismatch && <span className="ms-1">⚠️ فرق {Math.abs(soldQty - retQty)}</span>}
                                {!mismatch && retQty === soldQty && soldQty > 0 && <span className="ms-1">✓ مطابق</span>}
                              </span>
                            </div>
                            {mismatch && (
                              <div className="mt-1 text-[11px]">
                                {retQty < soldQty
                                  ? `لم يتم إرجاع ${soldQty - retQty} قطعة إلى المخزون — يرجى المراجعة.`
                                  : `عدد المرتجعات أكثر من المُباع بـ ${retQty - soldQty} قطعة.`}
                              </div>
                            )}
                          </div>
                          {ret && ret.items.length > 0 && (
                            <div className="mt-2 rounded-md bg-emerald-50 border border-emerald-200 p-2 text-xs">
                              <div className="font-bold text-emerald-800 mb-1">📦 عاد للمخزون ({ret.qty} قطعة)</div>
                              <ul className="space-y-0.5 text-emerald-900">
                                {ret.items.map((it) => (
                                  <li key={it.id}>• {it.product_name} × {it.quantity}{it.reason ? ` — ${it.reason}` : ""}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                );
              })}
            </div>
            <Pager page={page} totalPages={totalPages} onChange={setPage} total={filtered.length} />
          </>
        )}

        {showReturns && standaloneReturns.length > 0 && (
          <section className="rounded-xl bg-card border border-border p-3 shadow-card">
            <div className="font-bold text-sm mb-2 flex items-center gap-2">
              <span className="rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5 text-xs">إرجاع جزئي</span>
              <span>مرتجعات مقبولة على فواتير غير ملغاة ({standaloneReturns.length})</span>
            </div>
            <ul className="divide-y divide-border text-xs">
              {standaloneReturns.slice(0, 50).map((it) => (
                <li key={it.id} className="py-2 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{it.product_name} × {it.quantity}</div>
                    <div className="text-muted-foreground text-[11px]">{new Date(it.created_at).toLocaleString("ar-EG")}{it.reason ? ` — ${it.reason}` : ""}</div>
                  </div>
                  {it.invoice_id && (
                    <Link to="/invoices/$invoiceId" params={{ invoiceId: it.invoice_id }} search={{ autoprint: 0 }} className="text-xs text-brand inline-flex items-center gap-1 shrink-0">
                      <Eye className="size-3" /> فتح الفاتورة
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </AppShell>
  );
}


function Pager({ page, totalPages, total, onChange }: { page: number; totalPages: number; total: number; onChange: (p: number) => void }) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between gap-2 text-xs pt-2">
      <div className="text-muted-foreground">صفحة {page} من {totalPages} · {total} سجل</div>
      <div className="flex gap-1">
        <button disabled={page <= 1} onClick={() => onChange(page - 1)} className="h-8 px-2 rounded-md border border-border bg-background disabled:opacity-40 inline-flex items-center gap-1"><ChevronRight className="size-3.5" />السابق</button>
        <button disabled={page >= totalPages} onClick={() => onChange(page + 1)} className="h-8 px-2 rounded-md border border-border bg-background disabled:opacity-40 inline-flex items-center gap-1">التالي<ChevronLeft className="size-3.5" /></button>
      </div>
    </div>
  );
}
