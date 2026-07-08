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
  CreditCard,
  UserCircle2,
} from "lucide-react";

import type { LucideIcon } from "lucide-react";
import logo from "@/assets/logo.png";
import { useMyRole, can, type Permission } from "@/hooks/use-permissions";

type NavItem = { to: string; label: string; icon: LucideIcon; perm: Permission };

const PRIMARY: NavItem[] = [
  { to: "/", label: "الرئيسية", icon: Home, perm: "cashier.use" },
  { to: "/cashier", label: "الكاشير", icon: ShoppingCart, perm: "cashier.use" },
  { to: "/products", label: "المنتجات", icon: Package, perm: "products.view" },
  { to: "/invoices", label: "الفواتير", icon: Receipt, perm: "invoices.view" },
  { to: "/accounts", label: "الحسابات", icon: BarChart3, perm: "accounts.view" },
];

const SECONDARY: NavItem[] = [
  { to: "/customers", label: "العملاء", icon: Users, perm: "customers.view" },
  { to: "/suppliers", label: "الموردين", icon: Truck, perm: "suppliers.view" },
  { to: "/expenses", label: "المصروفات", icon: Wallet, perm: "expenses.view" },
  { to: "/prices", label: "الأسعار", icon: Tags, perm: "products.write" },
  { to: "/returns", label: "المرتجعات", icon: RotateCcw, perm: "returns.view" },
  { to: "/reports", label: "التقارير", icon: PieChart, perm: "reports.view" },
];

const UTILITY: NavItem[] = [
  { to: "/payment-methods", label: "طرق الدفع", icon: CreditCard, perm: "payment_methods.view" },
  { to: "/import", label: "استيراد", icon: FileSpreadsheet, perm: "import_export" },
  { to: "/export", label: "تصدير", icon: Download, perm: "import_export" },
  { to: "/notifications", label: "الإشعارات", icon: Bell, perm: "cashier.use" },
  { to: "/permissions", label: "الصلاحيات", icon: ShieldCheck, perm: "permissions.manage" },
  { to: "/settings", label: "الإعدادات", icon: Settings, perm: "settings.write" },
  { to: "/about", label: "حول المطوّر", icon: UserCircle2, perm: "cashier.use" },
];


function NavGroup({ label, items, currentPath }: { label: string; items: NavItem[]; currentPath: string }) {
  if (items.length === 0) return null;
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
  const { role } = useMyRole();
  const filter = (items: NavItem[]) => items.filter((i) => can(role, i.perm));

  return (
    <aside
      className="hidden md:flex sticky top-0 h-dvh w-56 lg:w-64 shrink-0 flex-col bg-header text-header-foreground border-l border-white/10 z-40"
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
        <NavGroup label="الأساسيات" items={filter(PRIMARY)} currentPath={currentPath} />
        <NavGroup label="الإدارة" items={filter(SECONDARY)} currentPath={currentPath} />
        <NavGroup label="أدوات" items={filter(UTILITY)} currentPath={currentPath} />
      </nav>

      <div className="p-4 border-t border-white/10">
        <Link
          to="/about"
          className="block rounded-2xl bg-white/5 hover:bg-white/10 transition p-3 text-[11px] leading-relaxed text-white/70"
        >
          <div className="font-bold text-white/90 mb-1">نظام المهندس</div>
          طوّره أمين أنور أحمد — تعرّف على المطوّر
        </Link>
      </div>

    </aside>
  );
}
