import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp, TrendingDown, Package, Users, Receipt, Wallet } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { formatSDG } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reports")({
  head: () => ({ meta: [{ title: "التقارير — المهندس" }] }),
  component: ReportsPage,
});

type Period = "week" | "month" | "year";

function startOf(unit: "day" | "month", offset = 0) {
  const d = new Date();
  if (unit === "day") {
    d.setDate(d.getDate() + offset);
    d.setHours(0, 0, 0, 0);
  } else {
    d.setMonth(d.getMonth() + offset, 1);
    d.setHours(0, 0, 0, 0);
  }
  return d.toISOString();
}

function useReportData(period: Period) {
  return useQuery({
    queryKey: ["reports", period],
    queryFn: async () => {
      const now = new Date();
      let from: string;
      if (period === "week") {
        from = startOf("day", -7);
      } else if (period === "month") {
        from = startOf("month");
      } else {
        const y = new Date(now.getFullYear(), 0, 1);
        from = y.toISOString();
      }

      const [invoicesRes, expensesRes, customersRes, productsRes, topProductsRes] = await Promise.all([
        supabase.from("invoices").select("total, created_at").gte("created_at", from),
        supabase.from("expenses").select("amount").gte("created_at", from),
        supabase.from("customers").select("id", { count: "exact", head: true }),
        supabase.from("products").select("id, quantity"),
        supabase.from("invoice_items").select("product_name, quantity").gte("created_at", from),
      ]);

      const invoices = invoicesRes.data ?? [];
      const expenses = expensesRes.data ?? [];
      const totalSales = invoices.reduce((s, r) => s + (r.total || 0), 0);
      const totalExpenses = expenses.reduce((s, r) => s + (r.amount || 0), 0);
      const profit = totalSales - totalExpenses;
      const invoiceCount = invoices.length;
      const customerCount = customersRes.count ?? 0;

      // Low stock
      const products = productsRes.data ?? [];
      const lowStock = products.filter((p: any) => (p.quantity ?? 0) <= 5).length;

      // Top products
      const productMap = new Map<string, number>();
      for (const item of topProductsRes.data ?? []) {
        const name = (item as any).product_name ?? "غير معروف";
        productMap.set(name, (productMap.get(name) ?? 0) + ((item as any).quantity ?? 0));
      }
      const topProducts = [...productMap.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, qty]) => ({ name, qty }));

      return { totalSales, totalExpenses, profit, invoiceCount, customerCount, lowStock, topProducts };
    },
    staleTime: 60_000,
  });
}

function StatCard({ icon: Icon, label, value, trend }: { icon: any; label: string; value: string; trend?: "up" | "down" }) {
  return (
    <div className="rounded-xl bg-card border border-border p-3 flex items-center gap-3">
      <div className="size-10 rounded-lg bg-brand/10 flex items-center justify-center">
        <Icon className="size-5 text-brand" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="font-bold text-sm nums truncate">{value}</div>
      </div>
      {trend && (
        trend === "up"
          ? <TrendingUp className="size-4 text-emerald-500" />
          : <TrendingDown className="size-4 text-rose-500" />
      )}
    </div>
  );
}

function ReportsPage() {
  const [period, setPeriod] = useState<Period>("month");
  const { data, isLoading } = useReportData(period);

  const periods: { key: Period; label: string }[] = [
    { key: "week", label: "أسبوع" },
    { key: "month", label: "شهر" },
    { key: "year", label: "سنة" },
  ];

  return (
    <AppShell title="التقارير" showBack>
      {/* Period selector */}
      <div className="flex gap-2 mb-4">
        {periods.map((p) => (
          <button
            key={p.key}
            onClick={() => setPeriod(p.key)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${
              period === p.key ? "bg-brand text-brand-foreground" : "bg-muted text-muted-foreground"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-center py-10 text-muted-foreground">جاري التحميل...</div>
      ) : data ? (
        <div className="space-y-4">
          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-3">
            <StatCard icon={Receipt} label="المبيعات" value={formatSDG(data.totalSales)} trend="up" />
            <StatCard icon={Wallet} label="المصروفات" value={formatSDG(data.totalExpenses)} trend="down" />
            <StatCard icon={TrendingUp} label="صافي الربح" value={formatSDG(data.profit)} trend={data.profit >= 0 ? "up" : "down"} />
            <StatCard icon={Receipt} label="عدد الفواتير" value={String(data.invoiceCount)} />
            <StatCard icon={Users} label="العملاء" value={String(data.customerCount)} />
            <StatCard icon={Package} label="منتجات منخفضة" value={String(data.lowStock)} trend={data.lowStock > 0 ? "down" : "up"} />
          </div>

          {/* Top products */}
          <div className="rounded-xl bg-card border border-border p-4">
            <h3 className="text-sm font-bold mb-3">الأكثر مبيعاً</h3>
            {data.topProducts.length === 0 ? (
              <p className="text-xs text-muted-foreground">لا توجد بيانات</p>
            ) : (
              <div className="space-y-2">
                {data.topProducts.map((p, i) => {
                  const maxQty = data.topProducts[0].qty;
                  return (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-5">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs truncate">{p.name}</div>
                        <div className="h-2 rounded-full bg-muted overflow-hidden mt-1">
                          <div
                            className="h-full rounded-full bg-brand"
                            style={{ width: `${(p.qty / maxQty) * 100}%` }}
                          />
                        </div>
                      </div>
                      <span className="text-xs font-bold nums">{p.qty}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
