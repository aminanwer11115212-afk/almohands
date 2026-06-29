import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { formatSDG } from "@/lib/format";
import { accountSummary } from "@/data/mock";

export const Route = createFileRoute("/accounts")({
  head: () => ({ meta: [{ title: "إدارة الحسابات — المهندس" }] }),
  component: AccountsPage,
});

const mainTabs = ["نظرة عامة", "بيانات مجمعة", "التقارير"] as const;
const subTabs = ["المبيعات", "الأرباح", "المنتجات الأكثر مبيعا", "المنتجات الأكثر ربحا"] as const;

function AccountsPage() {
  const [mainTab, setMainTab] = useState<(typeof mainTabs)[number]>("نظرة عامة");
  const [subTab, setSubTab] = useState<(typeof subTabs)[number]>("المبيعات");

  const isProfit = subTab === "الأرباح";
  const values = isProfit
    ? {
        today: accountSummary.profit.today,
        yesterday: accountSummary.profit.yesterday,
        thisMonth: accountSummary.profit.thisMonth,
        lastMonth: accountSummary.profit.lastMonth,
      }
    : {
        today: accountSummary.today,
        yesterday: accountSummary.yesterday,
        thisMonth: accountSummary.thisMonth,
        lastMonth: accountSummary.lastMonth,
      };

  return (
    <AppShell title="إدارة الحسابات" showBack>
      <div className="-mx-4 -mt-4 bg-header text-header-foreground">
        <div className="grid grid-cols-3 text-sm">
          {mainTabs.map((t) => {
            const active = mainTab === t;
            return (
              <button
                key={t}
                onClick={() => setMainTab(t)}
                className={`py-3 font-bold border-b-2 transition ${active ? "border-[var(--accent-gold)] text-[var(--accent-gold)]" : "border-transparent text-header-foreground/80"}`}
              >
                {t}
              </button>
            );
          })}
        </div>
      </div>

      <div className="-mx-4 bg-card border-b border-border overflow-x-auto">
        <div className="flex justify-around min-w-max px-2">
          {subTabs.map((t) => {
            const active = subTab === t;
            return (
              <button
                key={t}
                onClick={() => setSubTab(t)}
                className={`px-4 py-3 text-xs font-bold whitespace-nowrap border-b-2 transition ${active ? "border-[var(--accent-gold)] text-brand" : "border-transparent text-muted-foreground"}`}
              >
                {t}
              </button>
            );
          })}
        </div>
      </div>

      {mainTab === "نظرة عامة" && (subTab === "المبيعات" || subTab === "الأرباح") ? (
        <div className="mt-4 space-y-3">
          <StatCard label="اليوم" value={values.today} />
          <StatCard label="أمس" value={values.yesterday} />
          <StatCard label="هذا الشهر" value={values.thisMonth} />
          <StatCard label="الشهر الماضي" value={values.lastMonth} />
        </div>
      ) : null}

      {mainTab === "نظرة عامة" && (subTab === "المنتجات الأكثر مبيعا" || subTab === "المنتجات الأكثر ربحا") ? (
        <div className="mt-4 rounded-2xl bg-card border border-border shadow-card divide-y divide-border">
          {[
            { n: "زيت محرك 5W30 ٤ لتر", v: 320 },
            { n: "فلتر هواء كورولا 2018", v: 210 },
            { n: "بطارية 70 امبير", v: 145 },
            { n: "باكم فرامل 2016 عالي تايون", v: 120 },
            { n: "ماستر 3Y", v: 95 },
          ].map((r, i) => (
            <div key={r.n} className="flex items-center justify-between px-4 py-3">
              <span className="grid place-items-center size-7 rounded-full bg-brand/10 text-brand text-xs font-bold">
                {i + 1}
              </span>
              <span className="flex-1 text-end px-3 font-semibold text-sm">{r.n}</span>
              <span className="text-sm font-bold text-brand nums">{r.v}</span>
            </div>
          ))}
        </div>
      ) : null}

      {mainTab !== "نظرة عامة" ? (
        <div className="mt-10 text-center text-muted-foreground text-sm">
          هذا القسم سيتم تفعيله عند ربط قاعدة البيانات.
        </div>
      ) : null}
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
