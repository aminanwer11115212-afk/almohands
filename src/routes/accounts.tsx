import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { formatSDG } from "@/lib/format";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/accounts")({
  head: () => ({ meta: [{ title: "إدارة الحسابات — المهندس" }] }),
  component: AccountsPage,
});

const mainTabs = ["نظرة عامة", "بيانات مجمعة", "التقارير"] as const;
const subTabs = ["المبيعات", "الأرباح", "المصروفات"] as const;

function useAccountStats() {
  return useQuery({
    queryKey: ["account-stats"],
    queryFn: async () => {
      const now = new Date();
      const todayStr = now.toISOString().slice(0, 10);
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().slice(0, 10);
      const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastMonthStart = lastMonth.toISOString().slice(0, 10);
      const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().slice(0, 10);

      const { data: invoices } = await supabase
        .from("invoices")
        .select("total, created_at");

      const { data: expenses } = await supabase
        .from("expenses")
        .select("amount, date");

      const inv = invoices || [];
      const exp = expenses || [];

      const sumInv = (filter: (d: string) => boolean) =>
        inv.filter((i) => filter(i.created_at?.slice(0, 10) || "")).reduce((s, i) => s + (Number(i.total) || 0), 0);

      const sumExp = (filter: (d: string) => boolean) =>
        exp.filter((e) => filter(e.date || "")).reduce((s, e) => s + (Number(e.amount) || 0), 0);

      const isToday = (d: string) => d === todayStr;
      const isYesterday = (d: string) => d === yesterdayStr;
      const isThisMonth = (d: string) => d >= monthStart;
      const isLastMonth = (d: string) => d >= lastMonthStart && d <= lastMonthEnd;

      return {
        sales: { today: sumInv(isToday), yesterday: sumInv(isYesterday), thisMonth: sumInv(isThisMonth), lastMonth: sumInv(isLastMonth) },
        profit: { today: sumInv(isToday) - sumExp(isToday), yesterday: sumInv(isYesterday) - sumExp(isYesterday), thisMonth: sumInv(isThisMonth) - sumExp(isThisMonth), lastMonth: sumInv(isLastMonth) - sumExp(isLastMonth) },
        expenses: { today: sumExp(isToday), yesterday: sumExp(isYesterday), thisMonth: sumExp(isThisMonth), lastMonth: sumExp(isLastMonth) },
      };
    },
  });
}

function AccountsPage() {
  const [mainTab, setMainTab] = useState<(typeof mainTabs)[number]>("نظرة عامة");
  const [subTab, setSubTab] = useState<(typeof subTabs)[number]>("المبيعات");
  const { data: stats, isLoading } = useAccountStats();

  const values = stats
    ? subTab === "الأرباح" ? stats.profit : subTab === "المصروفات" ? stats.expenses : stats.sales
    : { today: 0, yesterday: 0, thisMonth: 0, lastMonth: 0 };

  return (
    <AppShell title="إدارة الحسابات" showBack>
      <div className="-mx-4 -mt-4 bg-header text-header-foreground">
        <div className="grid grid-cols-3 text-sm">
          {mainTabs.map((t) => (
            <button
              key={t}
              onClick={() => setMainTab(t)}
              className={`py-3 font-bold border-b-2 transition ${mainTab === t ? "border-[var(--accent-gold)] text-[var(--accent-gold)]" : "border-transparent text-header-foreground/80"}`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="-mx-4 bg-card border-b border-border overflow-x-auto">
        <div className="flex justify-around min-w-max px-2">
          {subTabs.map((t) => (
            <button
              key={t}
              onClick={() => setSubTab(t)}
              className={`px-4 py-3 text-xs font-bold whitespace-nowrap border-b-2 transition ${subTab === t ? "border-[var(--accent-gold)] text-brand" : "border-transparent text-muted-foreground"}`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {mainTab === "نظرة عامة" && (
        <div className="mt-4 space-y-3">
          {isLoading ? (
            <p className="text-center text-muted-foreground text-sm">جاري التحميل...</p>
          ) : (
            <>
              <StatCard label="اليوم" value={values.today} />
              <StatCard label="أمس" value={values.yesterday} />
              <StatCard label="هذا الشهر" value={values.thisMonth} />
              <StatCard label="الشهر الماضي" value={values.lastMonth} />
            </>
          )}
        </div>
      )}

      {mainTab !== "نظرة عامة" && (
        <div className="mt-10 text-center text-muted-foreground text-sm">
          قريباً — التقارير التفصيلية والبيانات المجمعة.
        </div>
      )}
    </AppShell>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-card shadow-card border border-border p-4">
      <div className="text-sm text-muted-foreground text-end">{label}</div>
      <div className="mt-1 text-end text-2xl font-extrabold text-brand nums">{formatSDG(value)}</div>
    </div>
  );
}
