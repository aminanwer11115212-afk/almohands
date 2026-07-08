import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { PermissionGate } from "@/components/PermissionGate";
import { supabase } from "@/integrations/supabase/client";
import { formatSDG } from "@/lib/format";
import { XCircle, Receipt, Eye, Search, FileSpreadsheet, FileText, ArrowUpDown } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { toast } from "sonner";

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

function CancelledInvoicesPage() {
  const [users, setUsers] = useState<Map<string, string>>(new Map());
  const [search, setSearch] = useState("");
  const [reasonFilter, setReasonFilter] = useState("");
  const [cashierFilter, setCashierFilter] = useState<string>("");
  const [sortKey, setSortKey] = useState<SortKey>("cancelled_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["invoices-cancelled"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("id, invoice_number, total, customer_name, cancellation_reason, cancelled_at, cancelled_by, user_id, created_at, status")
        .eq("status", "cancelled")
        .order("cancelled_at", { ascending: false, nullsFirst: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as Row[];
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

  const cashiers = useMemo(() => {
    const set = new Set(rows.map((r) => r.cancelled_by || r.user_id).filter(Boolean) as string[]);
    return Array.from(set);
  }, [rows]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    const rs = reasonFilter.trim().toLowerCase();
    let out = rows.filter((r) => {
      if (s) {
        const hay = [
          String(r.invoice_number),
          r.customer_name ?? "",
          r.cancellation_reason ?? "",
        ].join(" ").toLowerCase();
        if (!hay.includes(s)) return false;
      }
      if (rs && !(r.cancellation_reason ?? "").toLowerCase().includes(rs)) return false;
      if (cashierFilter && (r.cancelled_by || r.user_id) !== cashierFilter) return false;
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
  }, [rows, search, reasonFilter, cashierFilter, sortKey, sortDir]);

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

  function exportPDF() {
    if (filtered.length === 0) { toast.info("لا توجد بيانات للتصدير"); return; }
    const rowsX = buildExportRows();
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(12);
    doc.text(`Cancelled Invoices - ${new Date().toLocaleDateString()}`, 14, 12);
    const headers = Object.keys(rowsX[0]);
    autoTable(doc, {
      startY: 18,
      head: [headers],
      body: rowsX.map((r) => headers.map((h) => String((r as any)[h] ?? ""))),
      styles: { fontSize: 7, halign: "right" },
      headStyles: { fillColor: [220, 38, 38] },
    });
    doc.save(`cancelled-invoices-${Date.now()}.pdf`);
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

        {/* Filters */}
        <div className="rounded-xl bg-card border border-border p-3 shadow-card space-y-2">
          <div className="grid sm:grid-cols-2 gap-2">
            <div className="relative">
              <Search className="size-4 absolute top-1/2 -translate-y-1/2 start-2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="بحث بالرقم أو العميل أو السبب..."
                className="w-full h-10 rounded-lg border border-border bg-background ps-8 pe-3 text-sm"
              />
            </div>
            <input
              value={reasonFilter}
              onChange={(e) => setReasonFilter(e.target.value)}
              placeholder="تصفية سبب الإلغاء..."
              className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm"
            />
            <select
              value={cashierFilter}
              onChange={(e) => setCashierFilter(e.target.value)}
              className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm"
            >
              <option value="">كل الكاشير</option>
              {cashiers.map((id) => (
                <option key={id} value={id}>{users.get(id) ?? id.slice(0, 8)}</option>
              ))}
            </select>
            <div className="flex gap-2">
              <button onClick={exportXLSX} className="flex-1 h-10 rounded-lg bg-emerald-600 text-white text-sm font-bold flex items-center justify-center gap-1">
                <FileSpreadsheet className="size-4" /> Excel
              </button>
              <button onClick={exportPDF} className="flex-1 h-10 rounded-lg bg-rose-600 text-white text-sm font-bold flex items-center justify-center gap-1">
                <FileText className="size-4" /> PDF
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1 flex-wrap">
            <span className="font-bold">ترتيب:</span>
            {(["cancelled_at", "invoice_number", "total", "customer_name"] as SortKey[]).map((k) => (
              <button
                key={k}
                onClick={() => toggleSort(k)}
                className={`px-2 py-1 rounded-md border inline-flex items-center gap-1 ${sortKey === k ? "bg-brand text-brand-foreground border-brand" : "bg-background border-border"}`}
              >
                {k === "cancelled_at" ? "تاريخ الإلغاء" : k === "invoice_number" ? "رقم الفاتورة" : k === "total" ? "الإجمالي" : "العميل"}
                {sortKey === k && <ArrowUpDown className="size-3" />}
                {sortKey === k && <span>{sortDir === "asc" ? "↑" : "↓"}</span>}
              </button>
            ))}
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
          <div className="space-y-2">
            {filtered.map((r) => {
              const actor = r.cancelled_by ? users.get(r.cancelled_by) ?? "غير معروف" : "—";
              return (
                <div key={r.id} className="rounded-xl bg-card border border-border p-3 shadow-card">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold">فاتورة #{r.invoice_number}</span>
                        <span className="text-xs rounded-full bg-red-100 text-red-700 px-2 py-0.5">ملغاة</span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {r.customer_name || "بدون عميل"} · {new Date(r.created_at).toLocaleString("ar-EG")}
                      </div>
                    </div>
                    <div className="text-end">
                      <div className="font-bold nums">{formatSDG(Number(r.total))}</div>
                      <Link
                        to="/invoices/$invoiceId"
                        params={{ invoiceId: r.id }}
                        search={{ autoprint: 0 }}
                        className="text-xs text-brand inline-flex items-center gap-1 mt-1"
                      >
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
                      <div className="truncate">{actor}</div>
                      {r.cancelled_at && (
                        <div className="text-muted-foreground mt-0.5">
                          {new Date(r.cancelled_at).toLocaleString("ar-EG")}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
