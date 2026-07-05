import { Link, useRouterState } from "@tanstack/react-router";
import {
  Home,
  ShoppingCart,
  Package,
  Receipt,
  BarChart3,
  Users,
  Truck,
  Wallet,
  Tags,
  RotateCcw,
  PieChart,
  FileSpreadsheet,
  Download,
  Bell,
  ShieldCheck,
  Settings,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import logo from "@/assets/logo.png";

type NavItem = { to: string; label: string; icon: LucideIcon };

const PRIMARY: NavItem[] = [
  { to: "/", label: "الرئيسية", icon: Home },
  { to: "/cashier", label: "الكاشير", icon: ShoppingCart },
  { to: "/products", label: "المنتجات", icon: Package },
  { to: "/invoices", label: "الفواتير", icon: Receipt },
  { to: "/accounts", label: "الحسابات", icon: BarChart3 },
];

const SECONDARY: NavItem[] = [
  { to: "/customers", label: "العملاء", icon: Users },
  { to: "/suppliers", label: "الموردين", icon: Truck },
  { to: "/expenses", label: "المصروفات", icon: Wallet },
  { to: "/prices", label: "الأسعار", icon: Tags },
  { to: "/returns", label: "المرتجعات", icon: RotateCcw },
  { to: "/reports", label: "التقارير", icon: PieChart },
];

const UTILITY: NavItem[] = [
  { to: "/import", label: "استيراد", icon: FileSpreadsheet },
  { to: "/export", label: "تصدير", icon: Download },
  { to: "/notifications", label: "الإشعارات", icon: Bell },
  { to: "/permissions", label: "الصلاحيات", icon: ShieldCheck },
  { to: "/settings", label: "الإعدادات", icon: Settings },
];

function NavGroup({ label, items, currentPath }: { label: string; items: NavItem[]; currentPath: string }) {
  return (
    <div className="space-y-1">
      <div className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-white/40">
        {label}
      </div>
      {items.map((item) => {
        const active = currentPath === item.to || (item.to !== "/" && currentPath.startsWith(item.to));
        const Icon = item.icon;
        return (
          <Link
            key={item.to}
            to={item.to}
            className={
              "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors " +
              (active
                ? "bg-white/10 text-white font-semibold"
                : "text-white/70 hover:bg-white/5 hover:text-white")
            }
          >
            <Icon className="size-4 shrink-0" aria-hidden="true" />
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </div>
  );
}

export function AppSidebar() {
  const currentPath = useRouterState({ select: (s) => s.location.pathname });

  return (
    <aside
      className="hidden lg:flex sticky top-0 h-dvh w-64 shrink-0 flex-col bg-header text-header-foreground border-l border-white/10"
      aria-label="القائمة الرئيسية"
    >
      <div className="flex items-center gap-3 px-6 h-16 border-b border-white/10">
        <div className="grid size-9 place-items-center rounded-xl bg-card shadow-card">
          <img src={logo} alt="" width={28} height={28} className="size-7 object-contain" />
        </div>
        <div className="min-w-0">
          <div className="text-base font-bold font-display leading-none">المهندس</div>
          <div className="text-[11px] text-white/60 mt-0.5 truncate">قطع غيار السيارات</div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        <NavGroup label="الأساسيات" items={PRIMARY} currentPath={currentPath} />
        <NavGroup label="الإدارة" items={SECONDARY} currentPath={currentPath} />
        <NavGroup label="أدوات" items={UTILITY} currentPath={currentPath} />
      </nav>

      <div className="p-4 border-t border-white/10">
        <div className="rounded-2xl bg-white/5 p-3 text-[11px] leading-relaxed text-white/70">
          <div className="font-bold text-white/90 mb-1">إصدار تجريبي</div>
          البيانات المعروضة للعرض فقط
        </div>
      </div>
    </aside>
  );
}
