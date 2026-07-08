import { Link } from "@tanstack/react-router";
import {
  TrendingUp,
  Clock,
  Receipt,
  AlertTriangle,
  ChevronLeft,
  Package,
} from "lucide-react";
import { useDashboardInsights, type DashInvoice, type DailyPoint } from "@/hooks/use-dashboard-insights";
import { formatSDG, formatNumber } from "@/lib/format";

const PM_LABELS: Record<string, string> = {
  cash: "نقداً",
  bank: "بنكي",
  credit: "آجل",
  other: "أخرى",
};

export function DashboardInsights() {
  const { data, isLoading } = useDashboardInsights();

  if (isLoading || !data) {
    return (
      <section className="grid gap-4 lg:grid-cols-3 mb-6 lg:mb-8">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-2xl bg-card border border-border h-64 animate-pulse" />
        ))}
      </section>
    );
  }

  return (
    <section aria-label="لوحة الأداء" className="grid gap-4 lg:grid-cols-3 mb-6 lg:mb-8">
      {/* Chart — spans 2 on desktop */}
      <div className="lg:col-span-2 min-w-0 rounded-2xl bg-card border border-border shadow-card p-4 overflow-hidden">

        <PanelHeader
          icon={TrendingUp}
          title="مبيعات آخر 14 يوم"
          hint={`إجمالي: ${formatSDG(data.daily.reduce((s, d) => s + d.amount, 0))}`}
        />
        <SalesChart data={data.daily} />
      </div>

      {/* Pending invoices */}
      <div className="min-w-0 rounded-2xl bg-card border border-border shadow-card p-4 flex flex-col overflow-hidden">
        <PanelHeader
          icon={Clock}
          title="فواتير معلّقة"
          hint={data.pending.length ? formatSDG(data.pendingTotal) : undefined}
          tone="amber"
          to="/invoices"
        />
        {data.pending.length === 0 ? (
          <Empty text="لا توجد فواتير آجلة" />
        ) : (
          <ul className="divide-y divide-border -mx-1 mt-1 overflow-hidden flex-1">
            {data.pending.slice(0, 5).map((inv) => (
              <InvoiceRow key={inv.id} inv={inv} showRemaining />
            ))}
          </ul>
        )}
      </div>

      {/* Recent invoices — spans 2 */}
      <div className="lg:col-span-2 min-w-0 rounded-2xl bg-card border border-border shadow-card p-4 overflow-hidden">
        <PanelHeader icon={Receipt} title="آخر الفواتير" to="/invoices" />
        {data.recent.length === 0 ? (
          <Empty text="لم يتم إصدار أي فواتير بعد" />
        ) : (
          <ul className="divide-y divide-border -mx-1 mt-1">
            {data.recent.map((inv) => (
              <InvoiceRow key={inv.id} inv={inv} />
            ))}
          </ul>
        )}
      </div>

      {/* Low stock */}
      <div className="min-w-0 rounded-2xl bg-card border border-border shadow-card p-4 overflow-hidden">
        <PanelHeader
          icon={AlertTriangle}
          title="مخزون منخفض"
          hint={data.lowStockCount ? `${formatNumber(data.lowStockCount)} صنف` : undefined}

          tone="rose"
          to="/products"
        />
        {data.lowStock.length === 0 ? (
          <Empty text="المخزون بحالة جيدة" />
        ) : (
          <ul className="mt-1 space-y-1.5">
            {data.lowStock.slice(0, 5).map((p) => (
              <li key={p.id} className="flex items-center gap-2 text-xs">
                <Package className="size-3.5 text-rose-500 shrink-0" />
                <span className="flex-1 truncate">{p.name}</span>
                <span className="nums font-bold text-rose-600">
                  {formatNumber(p.quantity)}
                </span>
                <span className="text-[10px] text-muted-foreground nums">
                  / {formatNumber(p.min_quantity)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/* ---------------- pieces ---------------- */

function PanelHeader({
  icon: Icon,
  title,
  hint,
  tone,
  to,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  hint?: string;
  tone?: "amber" | "rose";
  to?: string;
}) {
  const toneClass =
    tone === "amber"
      ? "bg-amber-500/10 text-amber-600"
      : tone === "rose"
        ? "bg-rose-500/10 text-rose-600"
        : "bg-brand/10 text-brand";
  return (
    <div className="flex items-center justify-between mb-2">
      <div className="flex items-center gap-2 min-w-0">
        <div className={`size-8 rounded-lg grid place-items-center shrink-0 ${toneClass}`}>
          <Icon className="size-4" />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-bold truncate">{title}</h3>
          {hint && (
            <p className="text-[11px] text-muted-foreground nums truncate">{hint}</p>
          )}
        </div>
      </div>
      {to && (
        <Link
          to={to}
          className="text-[11px] text-brand font-bold flex items-center gap-0.5 hover:underline shrink-0"
        >
          الكل <ChevronLeft className="size-3" />
        </Link>
      )}
    </div>
  );
}

function InvoiceRow({ inv, showRemaining }: { inv: DashInvoice; showRemaining?: boolean }) {
  return (
    <li>
      <Link
        to="/invoices/$invoiceId"
        params={{ invoiceId: inv.id }}
        className="flex items-center gap-2 px-1 py-2 rounded-lg hover:bg-muted/60 transition"
      >
        <div className="size-8 rounded-full bg-brand/10 text-brand grid place-items-center text-[11px] font-bold nums shrink-0">
          #{inv.invoice_number}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-bold truncate">
            {inv.customer_name || "عميل نقدي"}
          </div>
          <div className="text-[10px] text-muted-foreground flex items-center gap-1.5">
            <span>{formatDate(inv.created_at)}</span>
            <span>·</span>
            <span>{PM_LABELS[String(inv.payment_method ?? "")] ?? inv.payment_method ?? "—"}</span>
          </div>
        </div>
        <div className="text-end shrink-0">
          <div className="text-xs font-bold nums">
            {formatSDG(Number(inv.total || 0))}
          </div>
          {showRemaining && (
            <div className="text-[10px] font-bold text-amber-600 nums">
              متبقٍ {formatSDG(Number(inv.remaining || 0))}
            </div>
          )}
        </div>
      </Link>
    </li>
  );
}

function SalesChart({ data }: { data: DailyPoint[] }) {
  const max = Math.max(...data.map((d) => d.amount), 0);
  const hasData = max > 0;
  const n = data.length;

  if (!hasData) {
    return (
      <div className="mt-2 h-32 rounded-lg border border-dashed border-border/60 grid place-items-center text-center px-4">
        <div>
          <p className="text-xs font-bold text-muted-foreground">لا توجد مبيعات خلال آخر 14 يوماً</p>
          <p className="text-[10px] text-muted-foreground/70 mt-1">ستظهر هنا فور تسجيل أول فاتورة</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-2 w-full overflow-hidden" role="img" aria-label="مخطط المبيعات اليومي" dir="ltr">
      <div className="relative h-32">
        {/* grid baseline */}
        <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
          <div className="border-t border-dashed border-border/40" />
          <div className="border-t border-dashed border-border/40" />
          <div className="border-t border-border/60" />
        </div>

        {/* bars */}
        <div className="relative flex items-end gap-[3px] sm:gap-1 h-full">
          {data.map((d) => {
            const pct = (d.amount / max) * 100;
            const isZero = d.amount === 0;
            return (
              <div
                key={d.date}
                className="flex-1 min-w-0 flex flex-col justify-end h-full"
                title={`${d.label}: ${formatSDG(d.amount)}`}
              >
                <div
                  className={`w-full rounded-t transition-all ${
                    isZero
                      ? "bg-muted/40"
                      : "bg-gradient-to-t from-brand to-brand/60 hover:to-brand/80"
                  }`}
                  style={{ height: isZero ? "2px" : `${Math.max(pct, 6)}%` }}
                />
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-1 flex items-start gap-[3px] sm:gap-1">
        {data.map((d, i) => {
          const showMobile = i % 3 === 0 || i === n - 1;
          const showDesktop = i % 2 === 0 || i === n - 1;
          return (
            <div key={d.date} className="flex-1 min-w-0 text-center">
              <span
                className={`nums text-[8px] sm:text-[9px] text-muted-foreground ${showMobile ? "inline" : "hidden"} ${showDesktop ? "sm:inline" : "sm:hidden"}`}
              >
                {d.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="flex-1 grid place-items-center text-xs text-muted-foreground py-6">
      {text}
    </div>
  );
}

function formatDate(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dayStart = new Date(d);
  dayStart.setHours(0, 0, 0, 0);
  const diffDays = Math.round((today.getTime() - dayStart.getTime()) / 86400000);
  if (diffDays === 0)
    return `اليوم ${d.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })}`;
  if (diffDays === 1) return "أمس";
  if (diffDays < 7) return `قبل ${diffDays} أيام`;
  return d.toLocaleDateString("ar-EG", { day: "2-digit", month: "2-digit" });
}
