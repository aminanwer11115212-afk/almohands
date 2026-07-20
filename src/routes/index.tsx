import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Package,
  ShoppingCart,
  Users,
  Truck,
  Wallet,
  Receipt,
  BarChart3,
  FileSpreadsheet,
  Tags,
  RotateCcw,
  Settings,
  ShieldCheck,
  LogIn,
  LogOut,
  PieChart,
  Download,
  Bell,
  TrendingUp,
  UserCircle2,
  ShoppingBag,
  History,
  Plus,
  UserPlus,
  Receipt as ReceiptIcon,
  Wallet as WalletIcon,
  AlertTriangle,
  Clock,
  Coins,
  CreditCard,
} from "lucide-react";
import logo from "@/assets/logo.png";
import { AppShell } from "@/components/AppShell";
import { MenuTile } from "@/components/MenuTile";
import { DashboardInsights } from "@/components/DashboardInsights";
import { InstallAppDialog } from "@/components/InstallAppDialog";
import { formatSDG, formatNumber } from "@/lib/format";
import { useDashboardStats } from "@/hooks/use-dashboard-stats";
import { useUnreadNotifications } from "@/hooks/use-notifications";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/errors";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "المهندس — الرئيسية" },
      { name: "description", content: "لوحة تحكم نظام إدارة قطع غيار السيارات." },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  const [email, setEmail] = useState<string | null>(null);
  const [installOpen, setInstallOpen] = useState(false);
  const { data: stats } = useDashboardStats();
  const { data: unread = 0 } = useUnreadNotifications();

  useEffect(() => {
    let alive = true;
    supabase.auth.getUser().then(({ data }) => {
      if (alive) setEmail(data.user?.email ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      setEmail(session?.user?.email ?? null);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const growth =
    stats && stats.lastMonth > 0
      ? ((stats.thisMonth - stats.lastMonth) / stats.lastMonth) * 100
      : null;

  return (
    <AppShell
      title="لوحة التحكم"
      subtitle="ملخص أداء اليوم مع اختصارات سريعة"
      rightAction={
        <div className="flex items-center gap-1">
          <Link
            to="/notifications"
            className="relative grid size-10 place-items-center rounded-full hover:bg-white/10 lg:hover:bg-muted focus-visible:bg-white/10 lg:focus-visible:bg-muted transition"
            aria-label={unread > 0 ? `الإشعارات (${unread} غير مقروءة)` : "الإشعارات"}
          >
            <Bell className="size-5" aria-hidden="true" />
            {unread > 0 && (
              <span
                className="absolute top-1 left-1 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center nums ring-2 ring-header lg:ring-background"
                aria-hidden="true"
              >
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </Link>
          {email ? (
            <button
              onClick={async () => {
                try {
                  const { error } = await supabase.auth.signOut();
                  if (error) throw error;
                  toast.success("تم تسجيل الخروج");
                } catch (err) {
                  toast.error(getErrorMessage(err, "تعذّر تسجيل الخروج"));
                }
              }}
              className="grid size-10 place-items-center rounded-full hover:bg-white/10 lg:hover:bg-muted focus-visible:bg-white/10 lg:focus-visible:bg-muted transition"
              aria-label="تسجيل الخروج"
            >
              <LogOut className="size-5" aria-hidden="true" />
            </button>
          ) : (
            <Link
              to="/auth"
              className="grid size-10 place-items-center rounded-full hover:bg-white/10 lg:hover:bg-muted focus-visible:bg-white/10 lg:focus-visible:bg-muted transition"
              aria-label="تسجيل الدخول"
            >
              <LogIn className="size-5" aria-hidden="true" />
            </Link>
          )}
        </div>
      }
    >
      {/* Compact brand + hero row (logo beside daily mini reports) */}
      <section
        aria-label="الملخص اليومي"
        className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-4 mb-5"
      >
        {/* Brand block — logo + name (compact, always visible) */}
        <button
          type="button"
          onClick={() => setInstallOpen(true)}
          className="group flex items-center gap-3 rounded-2xl bg-card border border-border shadow-card px-4 py-3 hover:border-brand/40 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
          aria-label="تثبيت تطبيق المهندس على جهازك"
        >
          <div className="grid size-14 place-items-center rounded-2xl bg-brand-soft ring-1 ring-brand/20 shrink-0 group-active:scale-95 transition">
            <img
              src={logo}
              alt="شعار المهندس"
              width={44}
              height={44}
              className="size-11 object-contain"
            />
          </div>
          <div className="text-start min-w-0">
            <h2 className="text-lg font-extrabold text-brand font-display leading-tight truncate">المهندس</h2>
            <p className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Download className="size-3" aria-hidden="true" />
              اضغط للتثبيت
            </p>
          </div>
        </button>

        {/* Hero KPI: month sales */}
        <article className="rounded-2xl bg-brand-gradient text-brand-foreground px-4 py-3 shadow-elevated relative overflow-hidden">
          <div className="absolute -top-10 -left-10 size-40 rounded-full bg-white/10 blur-2xl" aria-hidden="true" />
          <div className="relative flex items-center justify-between gap-3">
            <div className="min-w-0">
              <span className="text-[11px] opacity-85">مبيعات هذا الشهر</span>
              <div className="mt-0.5 text-2xl sm:text-3xl font-extrabold nums leading-tight font-display break-words">
                {formatSDG(stats?.thisMonth ?? 0)}
              </div>
              {growth !== null && (
                <div className="mt-1.5 inline-flex items-center gap-1 text-[10px] bg-white/15 rounded-full px-2 py-0.5">
                  <TrendingUp className={`size-3 ${growth < 0 ? "rotate-180" : ""}`} aria-hidden="true" />
                  <span className="nums">{growth >= 0 ? "+" : ""}{growth.toFixed(1)}%</span>
                  <span className="opacity-80">عن الشهر الماضي</span>
                </div>
              )}
            </div>
            <span className="hidden sm:block text-[10px] font-semibold bg-white/15 rounded-full px-2 py-0.5 shrink-0">SDG</span>
          </div>
        </article>
      </section>

      <InstallAppDialog open={installOpen} onClose={() => setInstallOpen(false)} />

      {/* Daily mini reports strip — 6 tiles (all interactive with quick filters) */}
      <section aria-label="تقارير اليوم" className="grid grid-cols-3 sm:grid-cols-6 gap-2 sm:gap-3 mb-5">
        <MiniStat icon={Coins} tone="emerald" label="مبيعات اليوم" value={formatSDG(stats?.today ?? 0)} to="/invoices" search={{ range: "today" }} />
        <MiniStat icon={ReceiptIcon} tone="sky" label="عدد الفواتير" value={formatNumber(stats?.todayCount ?? 0)} to="/invoices" search={{ range: "today" }} />
        <MiniStat icon={CreditCard} tone="brand" label="تحصيلات اليوم" value={formatSDG(stats?.todayPaid ?? 0)} to="/reports" search={{ range: "today" }} />
        <MiniStat icon={WalletIcon} tone="rose" label="مصروفات اليوم" value={formatSDG(stats?.todayExpenses ?? 0)} to="/expenses" search={{ range: "today" }} />
        <MiniStat icon={Clock} tone="amber" label="فواتير معلّقة" value={formatNumber(stats?.pendingCount ?? 0)} to="/invoices" search={{ status: "pending" }} />
        <MiniStat icon={AlertTriangle} tone="rose" label="مخزون منخفض" value={formatNumber(stats?.lowStockCount ?? 0)} to="/products" search={{ filter: "low-stock" }} />
      </section>

      {/* Quick action buttons — enhanced spacing + focus/press states */}
      <section aria-label="إجراءات سريعة" className="mb-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-3">
          <QuickAction to="/cashier" icon={ShoppingCart} label="فاتورة جديدة" primary />
          <QuickAction to="/products/new" icon={Plus} label="منتج جديد" />
          <QuickAction to="/customers" icon={UserPlus} label="عميل جديد" />
          <QuickAction to="/expenses" icon={Wallet} label="مصروف" />
          <QuickAction to="/purchases" icon={ShoppingBag} label="مشتريات" />
          <QuickAction to="/reports" icon={PieChart} label="التقارير" />
        </div>
      </section>

      {/* Insights: chart + recent + pending + low-stock */}
      <DashboardInsights />

      {/* Menu — bento grid */}
      <section aria-labelledby="menu-title">
        <div className="mb-3 lg:mb-4 flex items-center justify-between px-1">
          <h3 id="menu-title" className="text-sm lg:text-base font-bold text-foreground font-display">
            القائمة الرئيسية
          </h3>
          <span className="text-[11px] lg:text-xs text-muted-foreground">17 قسم</span>
        </div>

        <nav aria-label="أقسام النظام" className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3 lg:gap-4">
          <MenuTile to="/cashier" icon={ShoppingCart} label="الكاشير" hint="نقطة البيع" variant="highlight" span="2" />
          <MenuTile to="/products" icon={Package} label="المنتجات" hint="المخزن" />
          <MenuTile to="/invoices" icon={Receipt} label="الفواتير" />
          <MenuTile to="/purchases" icon={ShoppingBag} label="المشتريات" />
          <MenuTile to="/accounts" icon={BarChart3} label="الحسابات" />
          <MenuTile to="/customers" icon={Users} label="العملاء" />
          <MenuTile to="/suppliers" icon={Truck} label="الموردين" />
          <MenuTile to="/expenses" icon={Wallet} label="المصروفات" />
          <MenuTile to="/prices" icon={Tags} label="الأسعار" />
          <MenuTile to="/price-history" icon={History} label="سجل الأسعار" />
          <MenuTile to="/returns" icon={RotateCcw} label="المرتجعات" />
          <MenuTile to="/reports" icon={PieChart} label="التقارير" />
          <MenuTile to="/import" icon={FileSpreadsheet} label="استيراد" />
          <MenuTile to="/export" icon={Download} label="تصدير" />
          <MenuTile to="/permissions" icon={ShieldCheck} label="الصلاحيات" />
          <MenuTile to="/settings" icon={Settings} label="الإعدادات" />
          <MenuTile to="/about" icon={UserCircle2} label="حول المطوّر" />
        </nav>
      </section>

      <p className="mt-8 text-center text-[11px] text-muted-foreground">
        © {new Date().getFullYear()} نظام المهندس — طوّره أمين أنور أحمد
      </p>
    </AppShell>
  );
}

/* --------------------- helper components --------------------- */

type Tone = "brand" | "emerald" | "sky" | "amber" | "rose";

const TONE_BG: Record<Tone, string> = {
  brand: "bg-brand/10 text-brand",
  emerald: "bg-emerald-500/10 text-emerald-600",
  sky: "bg-sky-500/10 text-sky-600",
  amber: "bg-amber-500/10 text-amber-600",
  rose: "bg-rose-500/10 text-rose-600",
};

function MiniStat({
  icon: Icon,
  label,
  value,
  tone,
  to,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  tone: Tone;
  to?: string;
}) {
  const inner = (
    <div className="min-w-0 rounded-xl bg-card border border-border shadow-card p-2.5 sm:p-3 flex items-center gap-2 hover:border-brand/30 transition">
      <div className={`size-8 sm:size-9 rounded-lg grid place-items-center shrink-0 ${TONE_BG[tone]}`}>
        <Icon className="size-4 sm:size-[18px]" />
      </div>
      <div className="min-w-0">
        <div className="text-[10px] sm:text-[11px] text-muted-foreground font-semibold truncate">{label}</div>
        <div className="text-xs sm:text-sm font-extrabold nums leading-tight truncate">{value}</div>
      </div>
    </div>
  );
  if (to) {
    return (
      <Link to={to} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 rounded-xl">
        {inner}
      </Link>
    );
  }
  return inner;
}

function QuickAction({
  to,
  icon: Icon,
  label,
  primary,
}: {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  primary?: boolean;
}) {
  return (
    <Link
      to={to}
      className={[
        "flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs sm:text-sm font-bold transition",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50",
        primary
          ? "bg-brand-gradient text-brand-foreground shadow-elevated hover:opacity-95"
          : "bg-card border border-border shadow-card text-foreground hover:border-brand/40 hover:text-brand",
      ].join(" ")}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      <span className="truncate">{label}</span>
    </Link>
  );
}
