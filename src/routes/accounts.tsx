import { createFileRoute, Link } from "@tanstack/react-router";
import { PermissionGate } from "@/components/PermissionGate";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { formatSDG } from "@/lib/format";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAccountBalances, type AccountBalance } from "@/hooks/use-account-balances";
import { useExpenses, useAddExpense } from "@/hooks/use-expenses";
import { toast } from "sonner";
import {
  Wallet, Landmark, Smartphone, CreditCard, TrendingUp, TrendingDown,
  Plus, ArrowDownCircle, ArrowUpCircle, Receipt,
} from "lucide-react";

export const Route = createFileRoute("/accounts")({
  head: () => ({ meta: [{ title: "إدارة الحسابات — المهندس" }] }),
  component: () => (<PermissionGate perm="accounts.view"><AccountsPage /></PermissionGate>),
});

const mainTabs = ["نظرة عامة", "الحسابات", "المصروفات", "التقارير"] as const;
type MainTab = (typeof mainTabs)[number];

function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function accountIcon(type: string, bank?: string | null) {
  if (type === "bank") return bank?.toLowerCase().includes("wallet") || bank?.toLowerCase().includes("mobile") ? Smartphone : Landmark;
  if (type === "cash") return Wallet;
  return CreditCard;
}

function accountTypeLabel(type: string) {
  if (type === "bank") return "حساب بنكي";
  if (type === "cash") return "حساب نقدي";
  return "بطاقة";
}

/* ------------------------------------------------------------------ */
/* Overview stats (sales/profit/expenses per period)                    */
/* ------------------------------------------------------------------ */
function useAccountStats() {
  return useQuery({
    queryKey: ["account-stats"],
    queryFn: async () => {
      const now = new Date();
      const todayStr = toLocalDateStr(now);
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = toLocalDateStr(yesterday);
      const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastMonthStart = toLocalDateStr(lastMonth);
      const lastMonthEnd = toLocalDateStr(new Date(now.getFullYear(), now.getMonth(), 0));

      const [invRes, expRes] = await Promise.all([
        supabase.from("invoices").select("total, created_at").gte("created_at", lastMonthStart),
        supabase.from("expenses").select("amount, date").gte("date", lastMonthStart),
      ]);
      if (invRes.error) throw invRes.error;
      if (expRes.error) throw expRes.error;

      const inv = invRes.data ?? [];
      const exp = expRes.data ?? [];

      const sumInv = (f: (d: string) => boolean) =>
        inv.filter((i) => f(i.created_at ? toLocalDateStr(new Date(i.created_at)) : ""))
          .reduce((s, i) => s + (Number(i.total) || 0), 0);
      const sumExp = (f: (d: string) => boolean) =>
        exp.filter((e) => f(e.date || "")).reduce((s, e) => s + (Number(e.amount) || 0), 0);

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

/* ================================================================== */
/*                              PAGE                                    */
/* ================================================================== */
function AccountsPage() {
  const [mainTab, setMainTab] = useState<MainTab>("نظرة عامة");
  const { data: balances = [], isLoading: balLoading } = useAccountBalances();

  const totals = useMemo(() => {
    return balances.reduce(
      (acc, a) => {
        acc.balance += Number(a.balance) || 0;
        acc.incoming += Number(a.incoming) || 0;
        acc.outgoing += Number(a.outgoing_supplier) + Number(a.outgoing_expense);
        if (a.type === "cash") acc.cash += Number(a.balance) || 0;
        if (a.type === "bank") acc.bank += Number(a.balance) || 0;
        return acc;
      },
      { balance: 0, incoming: 0, outgoing: 0, cash: 0, bank: 0 }
    );
  }, [balances]);

  return (
    <AppShell title="إدارة الحسابات" showBack>
      {/* Top summary — always visible */}
      <div className="grid grid-cols-2 gap-2 mt-1">
        <SummaryTile label="إجمالي الرصيد" value={totals.balance} icon={Wallet} tone="brand" />
        <SummaryTile label="واردات" value={totals.incoming} icon={ArrowDownCircle} tone="ok" />
        <SummaryTile label="صادرات" value={totals.outgoing} icon={ArrowUpCircle} tone="warn" />
        <SummaryTile label={`نقدي / بنك`} value={totals.cash} value2={totals.bank} icon={Landmark} tone="neutral" />
      </div>

      {/* Tabs */}
      <div className="-mx-4 mt-4 bg-header text-header-foreground">
        <div className="grid grid-cols-4 text-xs">
          {mainTabs.map((t) => (
            <button
              key={t}
              onClick={() => setMainTab(t)}
              className={`py-3 font-bold border-b-2 transition ${
                mainTab === t ? "border-[var(--accent-gold)] text-[var(--accent-gold)]" : "border-transparent text-header-foreground/80"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {mainTab === "نظرة عامة" && <OverviewTab />}
      {mainTab === "الحسابات" && <AccountsTab balances={balances} loading={balLoading} />}
      {mainTab === "المصروفات" && <ExpensesShortcutTab balances={balances} />}
      {mainTab === "التقارير" && (
        <div className="mt-8 text-center text-muted-foreground text-sm">
          <Link to="/reports" className="underline text-brand font-bold">افتح التقارير المفصلة</Link>
        </div>
      )}
    </AppShell>
  );
}

/* ------------------------------------------------------------------ */
/* Overview tab (existing periodic stats)                              */
/* ------------------------------------------------------------------ */
function OverviewTab() {
  const [sub, setSub] = useState<"المبيعات" | "الأرباح" | "المصروفات">("المبيعات");
  const { data: stats, isLoading } = useAccountStats();
  const values = stats
    ? sub === "الأرباح" ? stats.profit : sub === "المصروفات" ? stats.expenses : stats.sales
    : { today: 0, yesterday: 0, thisMonth: 0, lastMonth: 0 };

  return (
    <>
      <div className="-mx-4 bg-card border-b border-border overflow-x-auto">
        <div className="flex justify-around min-w-max px-2">
          {(["المبيعات", "الأرباح", "المصروفات"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setSub(t)}
              className={`px-4 py-3 text-xs font-bold whitespace-nowrap border-b-2 transition ${
                sub === t ? "border-[var(--accent-gold)] text-brand" : "border-transparent text-muted-foreground"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {isLoading ? (
          <p className="text-center text-muted-foreground text-sm">جاري التحميل...</p>
        ) : (
          <>
            <PeriodCard label="اليوم" value={values.today} />
            <PeriodCard label="أمس" value={values.yesterday} />
            <PeriodCard label="هذا الشهر" value={values.thisMonth} />
            <PeriodCard label="الشهر الماضي" value={values.lastMonth} />
          </>
        )}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Accounts tab — list every bank/cash account with balance            */
/* ------------------------------------------------------------------ */
function AccountsTab({ balances, loading }: { balances: AccountBalance[]; loading: boolean }) {
  if (loading) return <p className="mt-6 text-center text-muted-foreground text-sm">جاري التحميل...</p>;
  if (balances.length === 0) {
    return (
      <div className="mt-8 text-center space-y-3">
        <Landmark className="w-10 h-10 mx-auto text-muted-foreground" />
        <p className="text-sm text-muted-foreground">لا توجد حسابات مالية بعد</p>
        <Link
          to="/payment-methods"
          className="inline-flex items-center gap-1 h-10 px-4 rounded-xl bg-brand text-brand-foreground text-sm font-bold"
        >
          <Plus className="w-4 h-4" /> أضف حساب أول
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold">الحسابات ({balances.length})</h3>
        <Link
          to="/payment-methods"
          className="text-xs font-bold text-brand flex items-center gap-1"
        >
          <Plus className="w-3.5 h-3.5" /> إدارة
        </Link>
      </div>

      {balances.map((a) => {
        const Icon = accountIcon(a.type, a.bank_name);
        const negative = a.balance < 0;
        return (
          <div
            key={a.account_id}
            className="rounded-2xl bg-card border border-border shadow-card p-4 space-y-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="text-end">
                <div className={`text-2xl font-extrabold nums ${negative ? "text-destructive" : "text-brand"}`}>
                  {formatSDG(Number(a.balance) || 0)}
                </div>
                <div className="text-[11px] text-muted-foreground">الرصيد الحالي</div>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-end">
                  <div className="font-bold text-sm">{a.name}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {accountTypeLabel(a.type)}
                    {a.bank_name ? ` • ${a.bank_name}` : ""}
                    {a.is_default ? " • افتراضي" : ""}
                  </div>
                </div>
                <div className="w-10 h-10 rounded-xl bg-brand/10 text-brand flex items-center justify-center">
                  <Icon className="w-5 h-5" />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              <MiniStat icon={TrendingUp} label="واردات" value={Number(a.incoming) || 0} tone="ok" />
              <MiniStat icon={TrendingDown} label="مصروفات" value={Number(a.outgoing_expense) || 0} tone="warn" />
              <MiniStat icon={Receipt} label="للموردين" value={Number(a.outgoing_supplier) || 0} tone="neutral" />
            </div>

            {Number(a.opening_balance) !== 0 && (
              <div className="text-[11px] text-muted-foreground text-end">
                رصيد افتتاحي: <span className="nums">{formatSDG(Number(a.opening_balance) || 0)}</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Expenses shortcut — quick add + recent list, scoped by account      */
/* ------------------------------------------------------------------ */
function ExpensesShortcutTab({ balances }: { balances: AccountBalance[] }) {
  const today = new Date().toISOString().slice(0, 10);
  const defaultAcc = balances.find((a) => a.is_default) ?? balances[0];
  const [target, setTarget] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today);
  const [accountId, setAccountId] = useState<string>(defaultAcc?.account_id ?? "");

  const addExpense = useAddExpense();
  const { data: recent = [], isLoading } = useExpenses(
    accountId ? { accountId } : undefined
  );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!target.trim() || !amount) return;
    const num = parseFloat(amount);
    if (!isFinite(num) || num <= 0) {
      toast.error("المبلغ يجب أن يكون رقمًا موجبًا");
      return;
    }
    addExpense.mutate(
      { target: target.trim(), amount: num, date, account_id: accountId || null },
      {
        onSuccess: () => {
          toast.success("تم خصم المصروف من الحساب");
          setTarget("");
          setAmount("");
        },
        onError: () => toast.error("فشل الحفظ"),
      }
    );
  };

  return (
    <div className="mt-4 space-y-4">
      <form onSubmit={submit} className="rounded-2xl bg-card border border-border p-4 space-y-3">
        <div className="text-sm font-bold text-end">خصم مصروف من حساب</div>

        <div className="grid grid-cols-2 gap-2">
          <select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className="h-11 rounded-xl border-2 border-brand/30 bg-card px-3 text-sm text-end"
          >
            <option value="">— بدون حساب —</option>
            {balances.map((a) => (
              <option key={a.account_id} value={a.account_id}>
                {a.name} ({accountTypeLabel(a.type)})
              </option>
            ))}
          </select>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-11 rounded-xl border-2 border-brand/30 bg-card px-3 text-sm text-center nums"
          />
        </div>

        <input
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          placeholder="جهة الصرف (مثال: كهرباء)"
          className="w-full h-11 rounded-xl border-2 border-brand/30 bg-muted px-3 text-sm text-end"
        />
        <input
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="المبلغ"
          className="w-full h-11 rounded-xl border-2 border-brand/30 bg-muted px-3 text-sm text-end nums"
        />

        <button
          type="submit"
          disabled={addExpense.isPending}
          className="w-full h-11 rounded-xl bg-brand text-brand-foreground font-bold disabled:opacity-60"
        >
          {addExpense.isPending ? "جاري..." : "خصم المصروف"}
        </button>
      </form>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold">
            {accountId ? "آخر مصروفات هذا الحساب" : "آخر المصروفات"}
          </h3>
          <Link to="/expenses" className="text-xs text-brand font-bold">عرض الكل</Link>
        </div>
        {isLoading && <p className="text-center text-muted-foreground text-xs">جاري التحميل...</p>}
        {!isLoading && recent.length === 0 && (
          <p className="text-center text-muted-foreground text-xs py-4">لا توجد مصروفات</p>
        )}
        {recent.slice(0, 10).map((ex) => (
          <div key={ex.id} className="flex items-center justify-between rounded-xl bg-card border border-border p-3">
            <span className="font-bold text-destructive nums">- {formatSDG(ex.amount)}</span>
            <div className="flex-1 text-end px-2">
              <div className="text-sm font-semibold">{ex.target}</div>
              <div className="text-xs text-muted-foreground nums">{ex.date}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tiny display helpers                                                */
/* ------------------------------------------------------------------ */
function SummaryTile({
  label, value, value2, icon: Icon, tone,
}: {
  label: string;
  value: number;
  value2?: number;
  icon: React.ComponentType<{ className?: string }>;
  tone: "brand" | "ok" | "warn" | "neutral";
}) {
  const toneClass =
    tone === "brand" ? "text-brand" :
    tone === "ok" ? "text-emerald-600" :
    tone === "warn" ? "text-rose-600" : "text-foreground";
  return (
    <div className="rounded-xl bg-card border border-border p-3 shadow-card">
      <div className="flex items-center justify-between">
        <Icon className={`w-4 h-4 ${toneClass}`} />
        <div className="text-[11px] text-muted-foreground">{label}</div>
      </div>
      <div className={`mt-1 text-end font-extrabold nums ${toneClass} ${value2 !== undefined ? "text-sm" : "text-lg"}`}>
        {value2 !== undefined
          ? <>{formatSDG(value)} <span className="text-muted-foreground">/</span> {formatSDG(value2)}</>
          : formatSDG(value)}
      </div>
    </div>
  );
}

function PeriodCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-card shadow-card border border-border p-4">
      <div className="text-sm text-muted-foreground text-end">{label}</div>
      <div className="mt-1 text-end text-2xl font-extrabold text-brand nums">{formatSDG(value)}</div>
    </div>
  );
}

function MiniStat({
  icon: Icon, label, value, tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  tone: "ok" | "warn" | "neutral";
}) {
  const toneClass =
    tone === "ok" ? "text-emerald-600" :
    tone === "warn" ? "text-rose-600" : "text-muted-foreground";
  return (
    <div className="rounded-lg bg-muted/40 p-2">
      <div className="flex items-center justify-center gap-1">
        <Icon className={`w-3 h-3 ${toneClass}`} />
        <div className="text-[10px] text-muted-foreground">{label}</div>
      </div>
      <div className={`text-xs font-bold nums ${toneClass}`}>{formatSDG(value)}</div>
    </div>
  );
}
