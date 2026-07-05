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
} from "lucide-react";
import logo from "@/assets/logo.png";
import { AppShell } from "@/components/AppShell";
import { MenuTile } from "@/components/MenuTile";
import { formatSDG } from "@/lib/format";
import { useDashboardStats } from "@/hooks/use-dashboard-stats";
import { supabase } from "@/integrations/supabase/client";

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
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setEmail(session?.user?.email ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <AppShell
      title="المهندس"
      rightAction={
        email ? (
          <button
            onClick={() => supabase.auth.signOut()}
            className="p-2 rounded-md hover:bg-white/10 transition"
            aria-label="تسجيل الخروج"
          >
            <LogOut className="size-5" />
          </button>
        ) : (
          <Link to="/auth" className="p-2 rounded-md hover:bg-white/10 transition" aria-label="تسجيل الدخول">
            <LogIn className="size-5" />
          </Link>
        )
      }
    >
      <div className="flex flex-col items-center text-center pt-2 pb-6">
        <img
          src={logo}
          alt="شعار المهندس لقطع غيار السيارات"
          width={96}
          height={96}
          className="size-24 object-contain"
        />
        <h2 className="mt-2 text-2xl font-extrabold text-brand">المهندس</h2>
        <p className="text-xs text-muted-foreground">نظام إدارة قطع غيار السيارات</p>
      </div>

      <section className="rounded-2xl bg-brand text-brand-foreground p-4 shadow-card mb-5">
        <div className="flex items-center justify-between">
          <span className="text-xs opacity-80">مبيعات هذا الشهر</span>
          <span className="text-[11px] bg-white/15 rounded-full px-2 py-0.5">SDG</span>
        </div>
        <div className="mt-2 text-2xl font-extrabold nums">{formatSDG(stats?.thisMonth ?? 0)}</div>
        <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
          <div className="rounded-xl bg-white/10 p-2">
            <div className="opacity-75">اليوم</div>
            <div className="font-bold nums">{formatSDG(stats?.today ?? 0)}</div>
          </div>
          <div className="rounded-xl bg-white/10 p-2">
            <div className="opacity-75">الشهر الماضي</div>
            <div className="font-bold nums">{formatSDG(stats?.lastMonth ?? 0)}</div>
          </div>
        </div>
      </section>

      <h3 className="text-sm font-bold text-muted-foreground mb-3 px-1">القائمة الرئيسية</h3>
      <div className="grid grid-cols-3 gap-3">
        <MenuTile to="/cashier" icon={ShoppingCart} label="الكاشير" />
        <MenuTile to="/products" icon={Package} label="مخزن المنتجات" />
        <MenuTile to="/accounts" icon={BarChart3} label="إدارة الحسابات" />
        <MenuTile to="/customers" icon={Users} label="العملاء" />
        <MenuTile to="/suppliers" icon={Truck} label="الموردين" />
        <MenuTile to="/expenses" icon={Wallet} label="المصروفات" />
        <MenuTile to="/prices" icon={Tags} label="تعديل الأسعار" />
        <MenuTile to="/import" icon={FileSpreadsheet} label="استيراد إكسل" />
        <MenuTile to="/invoices" icon={Receipt} label="الفواتير" />
        <MenuTile to="/returns" icon={RotateCcw} label="المرتجعات" />
        <MenuTile to="/permissions" icon={ShieldCheck} label="الصلاحيات" />
        <MenuTile to="/settings" icon={Settings} label="الإعدادات" />
      </div>

      <p className="mt-8 text-center text-[11px] text-muted-foreground">
        إصدار تجريبي — البيانات المعروضة للعرض فقط
      </p>
    </AppShell>
  );
}
