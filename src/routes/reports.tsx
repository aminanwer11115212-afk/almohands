import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  TrendingUp,
  TrendingDown,
  Package,
  Users,
  Receipt,
  Wallet,
  BarChart3,
  Layers,
  UserCircle2,
  CreditCard,
  RotateCcw,
  Calendar,
  Download,
  FileSpreadsheet,
} from "lucide-react";
import * as XLSX from "xlsx";
import { exportPdfFromRows } from "@/lib/pdf-html-export";
import { AppShell } from "@/components/AppShell";
import { PermissionGate } from "@/components/PermissionGate";
import { formatSDG, formatNumber } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";
import { useMyRole, ROLE_LABELS, type AppRole } from "@/hooks/use-permissions";
import { toast } from "sonner";

export const Route = createFileRoute("/reports")({
  head: () => ({ meta: [{ title: "التقارير — المهندس" }] }),
  component: ReportsGuarded,
});

function ReportsGuarded() {
  return (
    <PermissionGate perm="reports.view">
      <ReportsPage />
    </PermissionGate>
  );
}

/* ------------------------ types & helpers ------------------------ */

type Period = "day" | "yesterday" | "week" | "month" | "last30" | "lastMonth" | "year" | "all";
type Tab = "overview" | "detailed" | "by-user";

const PERIODS: { key: Period; label: string }[] = [
  { key: "day", label: "اليوم" },
  { key: "yesterday", label: "أمس" },
  { key: "week", label: "آخر 7 أيام" },
  { key: "month", label: "هذا الشهر" },
  { key: "last30", label: "آخر 30 يوم" },
  { key: "lastMonth", label: "الشهر الماضي" },
  { key: "year", label: "السنة" },
  { key: "all", label: "مدى العمل" },
];

function periodRange(period: Period): { from: string | null; to: string | null } {
  const now = new Date();
  const startOfToday = new Date(now); startOfToday.setHours(0, 0, 0, 0);
  if (period === "day") return { from: startOfToday.toISOString(), to: null };
  if (period === "yesterday") {
    const y = new Date(startOfToday); y.setDate(y.getDate() - 1);
    return { from: y.toISOString(), to: startOfToday.toISOString() };
  }
  if (period === "week") {
    const d = new Date(startOfToday); d.setDate(d.getDate() - 6);
    return { from: d.toISOString(), to: null };
  }
  if (period === "month") {
    const d = new Date(startOfToday); d.setDate(1);
    return { from: d.toISOString(), to: null };
  }
  if (period === "last30") {
    const d = new Date(startOfToday); d.setDate(d.getDate() - 29);
    return { from: d.toISOString(), to: null };
  }
  if (period === "lastMonth") {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: start.toISOString(), to: end.toISOString() };
  }
  if (period === "year") return { from: new Date(now.getFullYear(), 0, 1).toISOString(), to: null };
  return { from: null, to: null };
}

const PM_LABELS: Record<string, string> = {
  cash: "نقداً",
  bank: "تحويل بنكي",
  credit: "آجل",
  other: "أخرى",
};

type Row = Record<string, any>;

/* ------------------------ export helpers ------------------------ */

function buildInvoiceRows(
  invoices: any[],
  directory: { id: string; email: string }[],
) {
  const dir = new Map(directory.map((d) => [d.id, d.email]));
  return invoices.map((inv) => ({
    "رقم الفاتورة": inv.invoice_number,
    "التاريخ": new Date(inv.created_at).toLocaleString("ar-EG"),
    "الكاشير": dir.get(inv.user_id) ?? inv.user_id.slice(0, 8),
    "العميل": inv.customer_name ?? "—",
    "الحالة": inv.status === "cancelled" ? "ملغاة" : inv.status === "paid" ? "مدفوعة" : inv.status === "partial" ? "جزئي" : "معلقة",
    "طريقة الدفع": PM_LABELS[String(inv.payment_method || "cash")] ?? inv.payment_method ?? "—",
    "رقم العملية": inv.reference_number ?? "—",
    "الإجمالي": Number(inv.total ?? 0),
    "المدفوع": Number(inv.paid ?? 0),
    "المتبقي": Number(inv.remaining ?? 0),
    "الخصم": Number(inv.discount ?? 0),
    "سبب الإلغاء": inv.status === "cancelled" ? (inv.cancellation_reason ?? "— (لم يُذكر)") : "",
    "تاريخ الإلغاء": inv.cancelled_at ? new Date(inv.cancelled_at).toLocaleString("ar-EG") : "",
    "ألغيت بواسطة": inv.cancelled_by ? (dir.get(inv.cancelled_by) ?? inv.cancelled_by.slice(0, 8)) : "",
  }));
}

function exportInvoicesXLSX(invoices: any[], directory: { id: string; email: string }[], periodLabel: string) {
  if (invoices.length === 0) { toast.info("لا توجد فواتير للتصدير"); return; }
  const rows = buildInvoiceRows(invoices, directory);
  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = Object.keys(rows[0]).map(() => ({ wch: 16 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "الفواتير");
  XLSX.writeFile(wb, `reports-${periodLabel}-${Date.now()}.xlsx`);
  toast.success(`تم تصدير ${rows.length} فاتورة`);
}

function exportInvoicesPDF(invoices: any[], directory: { id: string; email: string }[], periodLabel: string) {
  if (invoices.length === 0) { toast.info("لا توجد فواتير للتصدير"); return; }
  try {
    const rows = buildInvoiceRows(invoices, directory);
    const headers = Object.keys(rows[0]);
    exportPdfFromRows({
      title: `تقرير الفواتير — ${periodLabel}`,
      subtitle: new Date().toLocaleString("ar-EG"),
      headers,
      orientation: "landscape",
      rows: rows.map((r) => headers.map((h) => String((r as any)[h] ?? ""))),
    });
    toast.success(`تم تصدير ${rows.length} فاتورة`);
  } catch (e) {
    console.error("[reports.exportPDF]", e);
    toast.error("تعذّر تصدير PDF — جرّب مجدداً");
  }
}

/* ------------------------ shared data ------------------------ */

function useReportBundle(period: Period) {
  const { from, to } = periodRange(period);
  return useQuery({
    queryKey: ["reports-bundle", period],
    queryFn: async () => {
      // Invoices
      let qInv = supabase
        .from("invoices")
        .select(
          "id, user_id, invoice_number, total, subtotal, discount, paid, remaining, payment_method, reference_number, status, customer_name, created_at, cancellation_reason, cancelled_at, cancelled_by",
        )
        .order("created_at", { ascending: false });
      if (from) qInv = qInv.gte("created_at", from);
      if (to) qInv = qInv.lt("created_at", to);

      // Invoice items (for top products & profit)
      let qItems = supabase
        .from("invoice_items")
        .select("invoice_id, user_id, product_name, quantity, unit_price, cost_price, line_total, created_at");
      if (from) qItems = qItems.gte("created_at", from);
      if (to) qItems = qItems.lt("created_at", to);

      // Expenses
      let qExp = supabase
        .from("expenses")
        .select("user_id, amount, target, date, notes, created_at");
      if (from) qExp = qExp.gte("created_at", from);
      if (to) qExp = qExp.lt("created_at", to);

      // Returns
      let qRet = supabase
        .from("returns")
        .select("user_id, invoice_id, product_id, product_name, quantity, status, created_at");
      if (from) qRet = qRet.gte("created_at", from);
      if (to) qRet = qRet.lt("created_at", to);

      const [inv, items, exp, ret, prods, cust] = await Promise.all([
        qInv,
        qItems,
        qExp,
        qRet,
        supabase.from("products").select("id, user_id, name, quantity, min_quantity, sale_price"),
        supabase.from("customers").select("id, user_id", { count: "exact" }),
      ]);

      if (inv.error) throw inv.error;
      if (items.error) throw items.error;
      if (exp.error) throw exp.error;
      if (ret.error) throw ret.error;
      if (prods.error) throw prods.error;

      return {
        invoices: (inv.data ?? []) as Row[],
        items: (items.data ?? []) as Row[],
        expenses: (exp.data ?? []) as Row[],
        returns: (ret.data ?? []) as Row[],
        products: (prods.data ?? []) as Row[],
        customerCount: cust.count ?? 0,
      };
    },
    staleTime: 30_000,
  });
}

function useUserDirectory(enabled: boolean) {
  return useQuery({
    queryKey: ["admin-user-directory"],
    enabled,
    queryFn: async () => {
      const [{ data: userList, error: uErr }, { data: roleList, error: rErr }] = await Promise.all([
        supabase.rpc("admin_list_users"),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      if (uErr) throw uErr;
      if (rErr) throw rErr;
      const roles = new Map<string, AppRole[]>();
      for (const r of roleList ?? []) {
        const arr = roles.get(r.user_id) ?? [];
        arr.push(r.role as AppRole);
        roles.set(r.user_id, arr);
      }
      return (userList ?? []).map((u: any) => ({
        id: u.user_id as string,
        email: (u.email as string) ?? "—",
        roles: roles.get(u.user_id) ?? [],
      }));
    },
    staleTime: 5 * 60_000,
  });
}

/* ------------------------ page ------------------------ */

function ReportsPage() {
  const [tab, setTab] = useState<Tab>("overview");
  const [period, setPeriod] = useState<Period>("month");
  const { data, isLoading } = useReportBundle(period);
  const { isAdmin } = useMyRole();
  const userDir = useUserDirectory(isAdmin && tab === "by-user");

  const stats = useMemo(() => {
    if (!data) return null;
    const totalSales = data.invoices.reduce((s, r) => s + Number(r.total || 0), 0);
    const totalPaid = data.invoices.reduce((s, r) => s + Number(r.paid || 0), 0);
    const totalRemaining = data.invoices.reduce((s, r) => s + Number(r.remaining || 0), 0);
    const totalDiscount = data.invoices.reduce((s, r) => s + Number(r.discount || 0), 0);
    const totalExpenses = data.expenses.reduce((s, r) => s + Number(r.amount || 0), 0);
    const cogs = data.items.reduce(
      (s, r) => s + Number(r.cost_price || 0) * Number(r.quantity || 0),
      0,
    );
    const grossProfit = totalSales - cogs;
    const netProfit = grossProfit - totalExpenses;
    const invoiceCount = data.invoices.length;
    const avgTicket = invoiceCount ? totalSales / invoiceCount : 0;
    const lowStock = data.products.filter(
      (p) => Number(p.quantity || 0) <= Number(p.min_quantity || 0) && Number(p.min_quantity || 0) > 0,
    ).length;

    // Payment methods
    const pmMap = new Map<string, { count: number; amount: number }>();
    for (const inv of data.invoices) {
      const k = String(inv.payment_method || "cash");
      const cur = pmMap.get(k) ?? { count: 0, amount: 0 };
      cur.count += 1;
      cur.amount += Number(inv.total || 0);
      pmMap.set(k, cur);
    }

    // Top products
    const prodMap = new Map<string, { qty: number; revenue: number }>();
    for (const it of data.items) {
      const name = String(it.product_name || "غير معروف");
      const cur = prodMap.get(name) ?? { qty: 0, revenue: 0 };
      cur.qty += Number(it.quantity || 0);
      cur.revenue += Number(it.line_total || 0);
      prodMap.set(name, cur);
    }
    const topProducts = [...prodMap.entries()]
      .sort((a, b) => b[1].qty - a[1].qty)
      .slice(0, 10)
      .map(([name, v]) => ({ name, qty: v.qty, revenue: v.revenue }));

    // Expenses per category
    const expByTarget = new Map<string, number>();
    for (const e of data.expenses) {
      const k = String(e.target || "أخرى");
      expByTarget.set(k, (expByTarget.get(k) ?? 0) + Number(e.amount || 0));
    }
    const expBreakdown = [...expByTarget.entries()]
      .map(([target, amount]) => ({ target, amount }))
      .sort((a, b) => b.amount - a.amount);

    // Daily sales series (last 14 buckets)
    const dayMap = new Map<string, number>();
    for (const inv of data.invoices) {
      const d = new Date(inv.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      dayMap.set(key, (dayMap.get(key) ?? 0) + Number(inv.total || 0));
    }
    const daily = [...dayMap.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .slice(-14)
      .map(([date, amount]) => ({ date, amount }));

    const returnsCount = data.returns.length;
    const acceptedReturns = data.returns.filter((r) => r.status === "accepted").length;

    // Per-invoice profit map: Σ((unit_price - cost_price) × quantity); discount is
    // aggregated on the invoice header, so subtract it once below. Accepted returns
    // reverse the sale for their (invoice, product) — subtract that portion of profit.
    const profitByInvoice = new Map<string, number>();
    const marginByLine = new Map<string, { unit: number; cost: number }>();
    for (const it of data.items as any[]) {
      const invId = String(it.invoice_id ?? "");
      if (!invId) continue;
      const qty = Number(it.quantity) || 0;
      const unit = Number(it.unit_price) || 0;
      const cost = Number(it.cost_price) || 0;
      profitByInvoice.set(invId, (profitByInvoice.get(invId) ?? 0) + (unit - cost) * qty);
      marginByLine.set(`${invId}::${(it as any).product_name ?? ""}`, { unit, cost });
    }
    for (const r of data.returns as any[]) {
      if (r.status !== "accepted" || !r.invoice_id) continue;
      const invId = String(r.invoice_id);
      const m = marginByLine.get(`${invId}::${r.product_name ?? ""}`);
      if (!m) continue;
      const rq = Number(r.quantity) || 0;
      profitByInvoice.set(invId, (profitByInvoice.get(invId) ?? 0) - (m.unit - m.cost) * rq);
    }
    for (const inv of data.invoices) {
      const disc = Number(inv.discount || 0);
      if (disc && profitByInvoice.has(inv.id)) {
        profitByInvoice.set(inv.id, (profitByInvoice.get(inv.id) ?? 0) - disc);
      }
    }

    return {
      totalSales,
      totalPaid,
      totalRemaining,
      totalDiscount,
      totalExpenses,
      cogs,
      grossProfit,
      netProfit,
      invoiceCount,
      avgTicket,
      lowStock,
      customerCount: data.customerCount,
      pmBreakdown: [...pmMap.entries()].map(([k, v]) => ({ key: k, ...v })),
      topProducts,
      expBreakdown,
      daily,
      returnsCount,
      acceptedReturns,
      profitByInvoice,
    };
  }, [data]);

  const perUser = useMemo(() => {
    if (!data || !isAdmin) return [];
    const map = new Map<
      string,
      {
        user_id: string;
        invoiceCount: number;
        sales: number;
        paid: number;
        remaining: number;
        discount: number;
        expenses: number;
        cogs: number;
        returnsQty: number;
        pm: Map<string, number>;
      }
    >();
    const bucket = (uid: string) =>
      map.get(uid) ??
      (map
        .set(uid, {
          user_id: uid,
          invoiceCount: 0,
          sales: 0,
          paid: 0,
          remaining: 0,
          discount: 0,
          expenses: 0,
          cogs: 0,
          returnsQty: 0,
          pm: new Map(),
        })
        .get(uid) as any);

    for (const inv of data.invoices) {
      const b = bucket(inv.user_id);
      b.invoiceCount += 1;
      b.sales += Number(inv.total || 0);
      b.paid += Number(inv.paid || 0);
      b.remaining += Number(inv.remaining || 0);
      b.discount += Number(inv.discount || 0);
      const pmKey = String(inv.payment_method || "cash");
      b.pm.set(pmKey, (b.pm.get(pmKey) ?? 0) + Number(inv.total || 0));
    }
    for (const it of data.items) {
      const b = bucket(it.user_id);
      b.cogs += Number(it.cost_price || 0) * Number(it.quantity || 0);
    }
    for (const e of data.expenses) {
      const b = bucket(e.user_id);
      b.expenses += Number(e.amount || 0);
    }
    for (const r of data.returns) {
      const b = bucket(r.user_id);
      b.returnsQty += Number(r.quantity || 0);
    }
    return [...map.values()].sort((a, b) => b.sales - a.sales);
  }, [data, isAdmin]);

  const tabs: { key: Tab; label: string; icon: any; adminOnly?: boolean }[] = [
    { key: "overview", label: "عام", icon: BarChart3 },
    { key: "detailed", label: "تفصيلي", icon: Layers },
    { key: "by-user", label: "حسب المستخدم", icon: UserCircle2, adminOnly: true },
  ];

  return (
    <AppShell title="التقارير" showBack>
      {/* Tabs */}
      <div className="flex gap-1 mb-3 rounded-xl bg-muted p-1">
        {tabs
          .filter((t) => !t.adminOnly || isAdmin)
          .map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition ${
                tab === t.key
                  ? "bg-card text-brand shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <t.icon className="size-4" />
              {t.label}
            </button>
          ))}
      </div>

      {/* Period */}
      <div className="flex gap-1 mb-4 overflow-x-auto">
        {PERIODS.map((p) => (
          <button
            key={p.key}
            onClick={() => setPeriod(p.key)}
            className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              period === p.key
                ? "bg-brand text-brand-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/70"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Export */}
      {isAdmin && data?.invoices && (
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            onClick={() => exportInvoicesXLSX(data.invoices, userDir.data ?? [], PERIODS.find((p) => p.key === period)?.label ?? period)}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700"
          >
            <FileSpreadsheet className="size-4" /> تصدير Excel
          </button>
          <button
            onClick={() => exportInvoicesPDF(data.invoices, userDir.data ?? [], PERIODS.find((p) => p.key === period)?.label ?? period)}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-red-600 text-white text-xs font-bold hover:bg-red-700"
          >
            <Download className="size-4" /> تصدير PDF
          </button>
          <span className="text-xs text-muted-foreground self-center">
            تفاصيل فواتير الكاشير خلال الفترة المحددة
          </span>
        </div>
      )}



      {isLoading || !stats ? (
        <div className="text-center py-10 text-muted-foreground">جاري التحميل...</div>
      ) : tab === "overview" ? (
        <OverviewTab stats={stats} isAdmin={isAdmin} />
      ) : tab === "detailed" ? (
        <DetailedTab stats={stats} invoices={data!.invoices} isAdmin={isAdmin} />
      ) : (
        <ByUserTab perUser={perUser} directory={userDir.data ?? []} loading={userDir.isLoading} />
      )}
    </AppShell>
  );
}

/* ------------------------ Overview ------------------------ */

function OverviewTab({ stats, isAdmin }: { stats: NonNullable<ReturnType<typeof useComputed>>; isAdmin: boolean }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <StatCard icon={Receipt} label="المبيعات" value={formatSDG(stats.totalSales)} trend="up" />
        <StatCard
          icon={Wallet}
          label="المصروفات"
          value={formatSDG(stats.totalExpenses)}
          trend="down"
        />
        {isAdmin && (
          <>
            <StatCard
              icon={TrendingUp}
              label="صافي الربح"
              value={formatSDG(stats.netProfit)}
              trend={stats.netProfit >= 0 ? "up" : "down"}
            />
            <StatCard
              icon={TrendingUp}
              label="مجمل الربح"
              value={formatSDG(stats.grossProfit)}
              trend={stats.grossProfit >= 0 ? "up" : "down"}
            />
          </>
        )}
        <StatCard icon={Receipt} label="عدد الفواتير" value={formatNumber(stats.invoiceCount)} />
        <StatCard icon={Receipt} label="متوسط الفاتورة" value={formatSDG(stats.avgTicket)} />
        <StatCard icon={CreditCard} label="مدفوع" value={formatSDG(stats.totalPaid)} />
        <StatCard
          icon={CreditCard}
          label="متبقٍ (آجل)"
          value={formatSDG(stats.totalRemaining)}
          trend={stats.totalRemaining > 0 ? "down" : "up"}
        />
        <StatCard icon={Users} label="العملاء" value={formatNumber(stats.customerCount)} />
        <StatCard
          icon={Package}
          label="منتجات منخفضة"
          value={formatNumber(stats.lowStock)}
          trend={stats.lowStock > 0 ? "down" : "up"}
        />
        <StatCard icon={RotateCcw} label="مرتجعات" value={formatNumber(stats.returnsCount)} />
        <StatCard icon={Wallet} label="خصومات" value={formatSDG(stats.totalDiscount)} />
      </div>

      {/* Sales chart */}
      <Card title="المبيعات اليومية" icon={Calendar}>
        {stats.daily.length === 0 ? (
          <EmptyLine />
        ) : (
          <MiniBars data={stats.daily} />
        )}
      </Card>

      {/* Top products */}
      <Card title="الأكثر مبيعاً" icon={Package}>
        {stats.topProducts.length === 0 ? (
          <EmptyLine />
        ) : (
          <div className="space-y-2">
            {stats.topProducts.slice(0, 5).map((p, i) => {
              const max = stats.topProducts[0].qty || 1;
              return (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-5">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs truncate">{p.name}</div>
                      <div className="text-[11px] text-muted-foreground nums shrink-0">
                        {formatSDG(p.revenue)}
                      </div>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden mt-1">
                      <div
                        className="h-full rounded-full bg-brand"
                        style={{ width: `${(p.qty / max) * 100}%` }}
                      />
                    </div>
                  </div>
                  <span className="text-xs font-bold nums">{formatNumber(p.qty)}</span>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

/* ------------------------ Detailed ------------------------ */

function DetailedTab({
  stats,
  invoices,
  isAdmin,
}: {
  stats: NonNullable<ReturnType<typeof useComputed>>;
  invoices: Row[];
  isAdmin: boolean;
}) {
  const [pmFilter, setPmFilter] = useState<string>("all");
  const filteredInvoices = useMemo(
    () => (pmFilter === "all" ? invoices : invoices.filter((i) => String(i.payment_method) === pmFilter)),
    [invoices, pmFilter],
  );

  return (
    <div className="space-y-4">
      {/* Payment methods breakdown */}
      <Card title="طرق الدفع" icon={CreditCard}>
        {stats.pmBreakdown.length === 0 ? (
          <EmptyLine />
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {stats.pmBreakdown.map((p) => {
              const pct = stats.totalSales ? (p.amount / stats.totalSales) * 100 : 0;
              return (
                <button
                  key={p.key}
                  onClick={() => setPmFilter(pmFilter === p.key ? "all" : p.key)}
                  className={`rounded-lg border p-2 text-right transition ${
                    pmFilter === p.key ? "border-brand bg-brand/5" : "border-border hover:bg-muted/50"
                  }`}
                >
                  <div className="text-[11px] text-muted-foreground">
                    {PM_LABELS[p.key] ?? p.key}
                  </div>
                  <div className="text-sm font-bold nums">{formatSDG(p.amount)}</div>
                  <div className="text-[10px] text-muted-foreground nums">
                    {formatNumber(p.count)} فاتورة · {pct.toFixed(1)}%
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </Card>

      {/* Expenses breakdown */}
      <Card title="تفصيل المصروفات" icon={Wallet}>
        {stats.expBreakdown.length === 0 ? (
          <EmptyLine />
        ) : (
          <div className="space-y-1.5">
            {stats.expBreakdown.map((e) => {
              const pct = stats.totalExpenses ? (e.amount / stats.totalExpenses) * 100 : 0;
              return (
                <div key={e.target} className="flex items-center gap-2 text-xs">
                  <div className="flex-1 truncate">{e.target}</div>
                  <div className="w-24 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className="h-full bg-rose-500" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="w-24 text-end nums font-bold">{formatSDG(e.amount)}</div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Invoices list */}
      <Card
        title={`الفواتير (${formatNumber(filteredInvoices.length)})`}
        icon={Receipt}
        subtitle={
          pmFilter !== "all"
            ? `مصفّى حسب: ${PM_LABELS[pmFilter] ?? pmFilter}`
            : undefined
        }
      >
        {filteredInvoices.length === 0 ? (
          <EmptyLine />
        ) : (
          <div className="max-h-[500px] overflow-auto -mx-4">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-card border-b border-border">
                <tr className="text-[11px] text-muted-foreground">
                  <th className="text-right px-2 py-1.5">#</th>
                  <th className="text-right px-2 py-1.5">التاريخ</th>
                  <th className="text-right px-2 py-1.5">العميل</th>
                  <th className="text-center px-2 py-1.5">الدفع</th>
                  <th className="text-end px-2 py-1.5">المبلغ</th>
                  <th className="text-end px-2 py-1.5">الربح</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredInvoices.slice(0, 200).map((inv) => {
                  const profit = stats.profitByInvoice.get(inv.id) ?? 0;
                  const total = Number(inv.total || 0);
                  const margin = total > 0 ? (profit / total) * 100 : 0;
                  return (
                  <tr key={inv.id}>
                    <td className="px-2 py-1.5 nums">#{inv.invoice_number}</td>
                    <td className="px-2 py-1.5 text-muted-foreground">
                      {new Date(inv.created_at).toLocaleDateString("ar-EG", {
                        day: "2-digit",
                        month: "2-digit",
                      })}
                    </td>
                    <td className="px-2 py-1.5 truncate max-w-[120px]">
                      {inv.customer_name || "—"}
                    </td>
                    <td className="px-2 py-1.5 text-center text-[10px]">
                      <span className="px-1.5 py-0.5 rounded bg-muted">
                        {PM_LABELS[String(inv.payment_method)] ?? inv.payment_method}
                      </span>
                      {inv.payment_method === "bank" && (inv as any).reference_number && (
                        <div className="mt-0.5 text-[10px] text-muted-foreground nums" title="رقم العملية البنكية">
                          #{(inv as any).reference_number}
                        </div>
                      )}
                    </td>

                    <td className="px-2 py-1.5 text-end nums font-bold">
                      {formatSDG(Number(inv.total || 0))}
                    </td>
                    <td className={`px-2 py-1.5 text-end nums font-bold ${profit >= 0 ? "text-emerald-700" : "text-rose-600"}`}>
                      {formatSDG(profit)}
                      <div className="text-[9px] text-muted-foreground font-normal">
                        {margin.toFixed(1)}%
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
            {filteredInvoices.length > 200 && (
              <p className="text-center text-[11px] text-muted-foreground p-2">
                عرض أول 200 من {formatNumber(filteredInvoices.length)}
              </p>
            )}
          </div>
        )}
      </Card>

      {/* Top products full table */}
      <Card title="أفضل المنتجات" icon={Package}>
        {stats.topProducts.length === 0 ? (
          <EmptyLine />
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[11px] text-muted-foreground border-b border-border">
                <th className="text-right p-1.5">المنتج</th>
                <th className="text-center p-1.5">الكمية</th>
                <th className="text-end p-1.5">الإيراد</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {stats.topProducts.map((p, i) => (
                <tr key={i}>
                  <td className="p-1.5 truncate max-w-[180px]">{p.name}</td>
                  <td className="p-1.5 text-center nums">{formatNumber(p.qty)}</td>
                  <td className="p-1.5 text-end nums font-bold">{formatSDG(p.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

/* ------------------------ By-user (admin) ------------------------ */

function ByUserTab({
  perUser,
  directory,
  loading,
}: {
  perUser: {
    user_id: string;
    invoiceCount: number;
    sales: number;
    paid: number;
    remaining: number;
    discount: number;
    expenses: number;
    cogs: number;
    returnsQty: number;
    pm: Map<string, number>;
  }[];
  directory: { id: string; email: string; roles: AppRole[] }[];
  loading: boolean;
}) {
  const dirMap = useMemo(() => new Map(directory.map((d) => [d.id, d])), [directory]);

  // include zero-activity users too
  const rows = useMemo(() => {
    const seen = new Set(perUser.map((u) => u.user_id));
    const extras = directory
      .filter((d) => !seen.has(d.id))
      .map((d) => ({
        user_id: d.id,
        invoiceCount: 0,
        sales: 0,
        paid: 0,
        remaining: 0,
        discount: 0,
        expenses: 0,
        cogs: 0,
        returnsQty: 0,
        pm: new Map<string, number>(),
      }));
    return [...perUser, ...extras];
  }, [perUser, directory]);

  if (loading) {
    return <div className="text-center py-10 text-muted-foreground">جاري تحميل قائمة المستخدمين...</div>;
  }

  if (rows.length === 0) {
    return <div className="text-center py-10 text-muted-foreground">لا يوجد مستخدمون بعد</div>;
  }

  const totalSales = rows.reduce((s, r) => s + r.sales, 0);

  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-brand/5 border border-brand/20 p-3 text-xs">
        <span className="font-bold text-brand">إجمالي المبيعات:</span>{" "}
        <span className="nums font-bold">{formatSDG(totalSales)}</span>
        <span className="text-muted-foreground"> · {formatNumber(rows.length)} مستخدم</span>
      </div>

      {rows.map((u) => {
        const info = dirMap.get(u.user_id);
        const label = info?.email ?? `مستخدم ${u.user_id.slice(0, 6)}`;
        const roleLabel =
          info?.roles && info.roles.length > 0
            ? info.roles.map((r) => ROLE_LABELS[r]).join("، ")
            : "—";
        const profit = u.sales - u.cogs - u.expenses;
        const pmEntries = [...u.pm.entries()].sort((a, b) => b[1] - a[1]);
        const share = totalSales ? (u.sales / totalSales) * 100 : 0;

        return (
          <div
            key={u.user_id}
            className="rounded-xl bg-card border border-border shadow-card p-3 space-y-3"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <div className="size-8 rounded-full bg-brand/10 grid place-items-center">
                    <UserCircle2 className="size-5 text-brand" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-bold truncate">{label}</div>
                    <div className="text-[11px] text-muted-foreground">{roleLabel}</div>
                  </div>
                </div>
              </div>
              <div className="text-end shrink-0">
                <div className="text-sm font-bold text-brand nums">{formatSDG(u.sales)}</div>
                <div className="text-[10px] text-muted-foreground nums">
                  {share.toFixed(1)}% من الإجمالي
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              <MiniStat label="فواتير" value={formatNumber(u.invoiceCount)} />
              <MiniStat label="مدفوع" value={formatSDG(u.paid)} />
              <MiniStat label="آجل" value={formatSDG(u.remaining)} />
              <MiniStat
                label="ربح صافٍ"
                value={formatSDG(profit)}
                tone={profit >= 0 ? "up" : "down"}
              />
              <MiniStat label="مصروفات" value={formatSDG(u.expenses)} />
              <MiniStat label="مرتجعات" value={formatNumber(u.returnsQty)} />
            </div>

            {pmEntries.length > 0 && (
              <div>
                <div className="text-[11px] font-bold text-muted-foreground mb-1">طرق الدفع</div>
                <div className="flex flex-wrap gap-1.5">
                  {pmEntries.map(([k, v]) => (
                    <span
                      key={k}
                      className="text-[11px] rounded-full bg-muted px-2 py-0.5 nums"
                    >
                      {PM_LABELS[k] ?? k}: {formatSDG(v)}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------ tiny UI helpers ------------------------ */

// dummy for type extraction
function useComputed() {
  return null as unknown as {
    totalSales: number;
    totalPaid: number;
    totalRemaining: number;
    totalDiscount: number;
    totalExpenses: number;
    cogs: number;
    grossProfit: number;
    netProfit: number;
    invoiceCount: number;
    avgTicket: number;
    lowStock: number;
    customerCount: number;
    pmBreakdown: { key: string; count: number; amount: number }[];
    topProducts: { name: string; qty: number; revenue: number }[];
    expBreakdown: { target: string; amount: number }[];
    daily: { date: string; amount: number }[];
    returnsCount: number;
    acceptedReturns: number;
    profitByInvoice: Map<string, number>;
  };
}

function StatCard({
  icon: Icon,
  label,
  value,
  trend,
}: {
  icon: any;
  label: string;
  value: string;
  trend?: "up" | "down";
}) {
  return (
    <div className="rounded-xl bg-card border border-border p-2.5 flex items-center gap-2">
      <div className="size-9 rounded-lg bg-brand/10 flex items-center justify-center shrink-0">
        <Icon className="size-4 text-brand" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] text-muted-foreground">{label}</div>
        <div className="font-bold text-xs nums truncate">{value}</div>
      </div>
      {trend &&
        (trend === "up" ? (
          <TrendingUp className="size-3.5 text-emerald-500 shrink-0" />
        ) : (
          <TrendingDown className="size-3.5 text-rose-500 shrink-0" />
        ))}
    </div>
  );
}

function Card({
  title,
  subtitle,
  icon: Icon,
  children,
}: {
  title: string;
  subtitle?: string;
  icon?: any;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl bg-card border border-border p-3">
      <div className="flex items-center gap-2 mb-2">
        {Icon && <Icon className="size-4 text-brand" />}
        <div>
          <h3 className="text-sm font-bold">{title}</h3>
          {subtitle && <p className="text-[10px] text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

function MiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "up" | "down";
}) {
  return (
    <div className="rounded-lg bg-muted/50 p-1.5">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div
        className={`text-xs font-bold nums truncate ${
          tone === "up" ? "text-emerald-600" : tone === "down" ? "text-rose-600" : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function MiniBars({ data }: { data: { date: string; amount: number }[] }) {
  const max = Math.max(...data.map((d) => d.amount), 1);
  return (
    <div className="flex items-end gap-1 h-24">
      {data.map((d) => {
        const h = (d.amount / max) * 100;
        return (
          <div key={d.date} className="flex-1 flex flex-col items-center gap-1 min-w-0">
            <div
              className="w-full bg-brand/70 rounded-t hover:bg-brand transition"
              style={{ height: `${Math.max(h, 4)}%` }}
              title={`${d.date}: ${formatSDG(d.amount)}`}
            />
            <div className="text-[9px] text-muted-foreground truncate w-full text-center">
              {d.date.slice(5)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function EmptyLine() {
  return <p className="text-xs text-muted-foreground text-center py-4">لا توجد بيانات</p>;
}
