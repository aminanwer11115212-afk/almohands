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
} from "lucide-react";
import logo from "@/assets/logo.png";
import { AppShell } from "@/components/AppShell";
import { MenuTile } from "@/components/MenuTile";
import { DashboardInsights } from "@/components/DashboardInsights";
import { formatSDG } from "@/lib/format";
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
      subtitle="مرحباً بك مجدداً، إليك ملخص أداء اليوم"
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
      {/* Mobile-only brand identity block (desktop shows brand in sidebar) */}
      <section className="lg:hidden flex flex-col items-center text-center pt-1 pb-5" aria-label="هوية النظام">
        <div className="grid size-20 place-items-center rounded-3xl bg-card shadow-card ring-1 ring-border">
          <img
            src={logo}
            alt="شعار المهندس لقطع غيار السيارات"
            width={64}
            height={64}
            className="size-16 object-contain"
          />
        </div>
        <h2 className="mt-3 text-2xl font-extrabold text-brand font-display">المهندس</h2>
        <p className="text-xs text-muted-foreground">إدارة كاملة للمخزن والمبيعات</p>
      </section>

      {/* KPI row */}
      <section aria-label="ملخص المبيعات" className="grid grid-cols-4 lg:grid-cols-12 gap-3 sm:gap-4 lg:gap-6 mb-6 lg:mb-8">
        {/* Featured monthly */}
        <article className="col-span-4 sm:col-span-3 lg:col-span-6 rounded-3xl bg-brand-gradient text-brand-foreground p-5 lg:p-7 shadow-elevated relative overflow-hidden">
          <div
            className="absolute -top-16 -left-16 size-48 rounded-full bg-white/10 blur-2xl"
            aria-hidden="true"
          />
          <div className="relative">
            <div className="flex items-center justify-between">
              <span className="text-xs lg:text-sm opacity-85">مبيعات هذا الشهر</span>
              <span className="text-[10px] font-semibold bg-white/15 rounded-full px-2 py-0.5">SDG</span>
            </div>
            <div className="mt-2 text-3xl lg:text-4xl font-extrabold nums leading-tight font-display">
              {formatSDG(stats?.thisMonth ?? 0)}
            </div>
            {growth !== null && (
              <div className="mt-3 inline-flex items-center gap-1 text-[11px] lg:text-xs bg-white/10 rounded-full px-2.5 py-1">
                <TrendingUp className={`size-3 ${growth < 0 ? "rotate-180" : ""}`} aria-hidden="true" />
                <span className="nums">
                  {growth >= 0 ? "+" : ""}
                  {growth.toFixed(1)}%
                </span>
                <span className="opacity-80">مقارنة بالشهر الماضي</span>
              </div>
            )}
          </div>
        </article>

        <article className="col-span-2 sm:col-span-1 lg:col-span-3 rounded-3xl bg-card p-4 lg:p-5 shadow-card border border-border">
          <div className="text-[11px] lg:text-xs text-muted-foreground font-semibold">اليوم</div>
          <div className="mt-1 lg:mt-2 text-lg lg:text-2xl font-extrabold text-foreground nums leading-tight font-display">
            {formatSDG(stats?.today ?? 0)}
          </div>
        </article>

        <article className="col-span-2 sm:col-span-1 lg:col-span-3 rounded-3xl bg-card p-4 lg:p-5 shadow-card border border-border">
          <div className="text-[11px] lg:text-xs text-muted-foreground font-semibold">الشهر الماضي</div>
          <div className="mt-1 lg:mt-2 text-lg lg:text-2xl font-extrabold text-foreground nums leading-tight font-display">
            {formatSDG(stats?.lastMonth ?? 0)}
          </div>
        </article>
      </section>

      {/* Insights: chart + recent + pending + low-stock */}
      <DashboardInsights />

      {/* Menu — bento grid */}
      <section aria-labelledby="menu-title">
        <div className="mb-3 lg:mb-4 flex items-center justify-between px-1">
          <h3 id="menu-title" className="text-sm lg:text-base font-bold text-foreground font-display">
            القائمة الرئيسية
          </h3>
          <span className="text-[11px] lg:text-xs text-muted-foreground">14 قسم</span>
        </div>

        <nav aria-label="أقسام النظام" className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3 lg:gap-4">
          <MenuTile to="/cashier" icon={ShoppingCart} label="الكاشير" hint="نقطة البيع" variant="highlight" span="2" />
          <MenuTile to="/products" icon={Package} label="المنتجات" hint="المخزن" />
          <MenuTile to="/invoices" icon={Receipt} label="الفواتير" />
          <MenuTile to="/accounts" icon={BarChart3} label="الحسابات" />
          <MenuTile to="/customers" icon={Users} label="العملاء" />
          <MenuTile to="/suppliers" icon={Truck} label="الموردين" />
          <MenuTile to="/expenses" icon={Wallet} label="المصروفات" />
          <MenuTile to="/prices" icon={Tags} label="الأسعار" />
          <MenuTile to="/returns" icon={RotateCcw} label="المرتجعات" />
          <MenuTile to="/reports" icon={PieChart} label="التقارير" />
          <MenuTile to="/import" icon={FileSpreadsheet} label="استيراد" />
          <MenuTile to="/export" icon={Download} label="تصدير" />
          <MenuTile to="/permissions" icon={ShieldCheck} label="الصلاحيات" />
          <MenuTile to="/settings" icon={Settings} label="الإعدادات" />
        </nav>
      </section>

      <p className="mt-8 text-center text-[11px] text-muted-foreground">
        إصدار تجريبي — البيانات المعروضة للعرض فقط
      </p>
    </AppShell>
  );
}
