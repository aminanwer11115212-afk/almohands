import { createFileRoute, Link } from "@tanstack/react-router";
import { PermissionGate } from "@/components/PermissionGate";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Phone, Wrench, Receipt, Printer, Share2, Loader2, AlertCircle, Package, FileDown } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { formatSDG } from "@/lib/format";
import { openWhatsAppShare } from "@/lib/invoice-share";
import { useStoreProfile } from "@/hooks/use-store-profile";

export const Route = createFileRoute("/customers/$customerId")({
  head: () => ({ meta: [{ title: "دفتر العميل — المهندس" }] }),
  component: () => (<PermissionGate perm="customers.view"><CustomerLedgerPage /></PermissionGate>),
});

type InvoiceRow = {
  id: string;
  invoice_number: number;
  total: number;
  paid: number;
  remaining: number;
  status: string;
  payment_method: string;
  created_at: string;
};

const statusLabels: Record<string, string> = {
  paid: "مدفوعة",
  partial: "جزئية",
  pending: "معلّقة",
};

const statusClasses: Record<string, string> = {
  paid: "bg-emerald-100 text-emerald-700",
  partial: "bg-amber-100 text-amber-700",
  pending: "bg-rose-100 text-rose-700",
};

function CustomerLedgerPage() {
  const { customerId } = Route.useParams();
  const { data: storeProfile } = useStoreProfile();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["customer-ledger", customerId],
    queryFn: async () => {
      const { data: cust, error: cErr } = await supabase
        .from("customers")
        .select("*")
        .eq("id", customerId)
        .maybeSingle();
      if (cErr) throw cErr;
      if (!cust) return { customer: null, invoices: [] as InvoiceRow[] };

      const { data: invs, error: iErr } = await supabase
        .from("invoices")
        .select("id, invoice_number, total, paid, remaining, status, payment_method, created_at")
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false })
        .limit(500);
      if (iErr) throw iErr;
      return { customer: cust, invoices: (invs ?? []) as InvoiceRow[] };
    },
  });

  const totals = useMemo(() => {
    const invs = data?.invoices ?? [];
    let total = 0, paid = 0, remaining = 0, pendingCount = 0;
    for (const inv of invs) {
      total += Number(inv.total) || 0;
      paid += Number(inv.paid) || 0;
      remaining += Number(inv.remaining) || 0;
      if (Number(inv.remaining) > 0) pendingCount++;
    }
    return { total, paid, remaining, pendingCount, count: invs.length };
  }, [data?.invoices]);

  if (isLoading) {
    return (
      <AppShell title="دفتر العميل" showBack>
        <div className="py-16 grid place-items-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
      </AppShell>
    );
  }
  if (isError || !data?.customer) {
    return (
      <AppShell title="دفتر العميل" showBack>
        <div className="py-12 text-center text-sm text-destructive flex flex-col items-center gap-2">
          <AlertCircle className="size-6" />
          العميل غير موجود
          <Link to="/customers" className="text-brand underline text-xs">رجوع لقائمة العملاء</Link>
        </div>
      </AppShell>
    );
  }

  const c = data.customer;
  const invoices = data.invoices;

  function shareStatementViaWhatsApp() {
    const storeName = storeProfile?.name || "المتجر";
    const lines: string[] = [];
    lines.push(`🧾 *كشف حساب — ${storeName}*`);
    lines.push(`العميل: ${c.name}`);
    lines.push(`عدد الفواتير: ${totals.count}`);
    lines.push(`إجمالي المبيعات: ${formatSDG(totals.total)}`);
    lines.push(`المدفوع: ${formatSDG(totals.paid)}`);
    if (totals.remaining > 0) lines.push(`*المتبقي: ${formatSDG(totals.remaining)}*`);
    lines.push("");
    if (invoices.length > 0) {
      lines.push("*آخر الفواتير:*");
      invoices.slice(0, 10).forEach((inv) => {
        const d = new Date(inv.created_at).toLocaleDateString("ar-EG");
        const st = statusLabels[inv.status] || inv.status;
        lines.push(`#${inv.invoice_number} — ${d} — ${formatSDG(inv.total)} — ${st}${Number(inv.remaining) > 0 ? ` — متبقي ${formatSDG(inv.remaining)}` : ""}`);
      });
    }
    openWhatsAppShare(c.phone, lines.join("\n"));
  }

  function printLedger() {
    window.print();
  }

  return (
    <AppShell title="دفتر العميل" showBack>
      <div className="space-y-4 print:space-y-3">
        {/* Header card */}
        <section className="rounded-2xl border border-border bg-card shadow-card p-4 print:shadow-none">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <h1 className="text-xl font-extrabold">{c.name}</h1>
              <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
                {c.phone && (
                  <span className="flex items-center gap-1"><Phone className="size-3.5" /><span dir="ltr">{c.phone}</span></span>
                )}
                {c.workshop && (
                  <span className="flex items-center gap-1"><Wrench className="size-3.5" />{c.workshop}</span>
                )}
                {Number(c.credit_limit) > 0 && (
                  <span>الحد الائتماني: <span className="nums font-bold">{formatSDG(Number(c.credit_limit))}</span></span>
                )}
              </div>
              {c.notes && <p className="mt-2 text-xs text-muted-foreground border-t border-border pt-2">{c.notes}</p>}
            </div>
            <div className="flex flex-wrap gap-2 print:hidden">
              <button onClick={printLedger} className="inline-flex items-center gap-1.5 text-xs font-bold bg-white border border-border hover:bg-muted rounded-lg px-3 py-2">
                <Printer className="size-3.5" /> طباعة
              </button>
              <button onClick={shareStatementViaWhatsApp} className="inline-flex items-center gap-1.5 text-xs font-bold bg-emerald-500 text-white hover:bg-emerald-600 rounded-lg px-3 py-2">
                <Share2 className="size-3.5" /> واتساب
              </button>
            </div>
          </div>
        </section>

        {/* Totals summary */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard label="عدد الفواتير" value={String(totals.count)} tone="brand" />
          <SummaryCard label="إجمالي المبيعات" value={formatSDG(totals.total)} tone="brand" />
          <SummaryCard label="المدفوع" value={formatSDG(totals.paid)} tone="ok" />
          <SummaryCard label="الرصيد المتبقي" value={formatSDG(totals.remaining)} tone={totals.remaining > 0 ? "warn" : "ok"} hint={totals.pendingCount > 0 ? `${totals.pendingCount} فاتورة غير مكتملة` : "لا توجد ذمم"} />
        </section>

        {/* Invoices table */}
        <section className="rounded-2xl border border-border bg-card shadow-card overflow-hidden print:shadow-none">
          <div className="p-3 border-b border-border flex items-center gap-2">
            <Receipt className="size-4 text-brand" />
            <h2 className="font-bold text-sm">سجل الفواتير</h2>
            <span className="text-xs text-muted-foreground">({totals.count})</span>
          </div>
          {invoices.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">لا توجد فواتير لهذا العميل بعد</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="text-right px-3 py-2">رقم</th>
                    <th className="text-right px-3 py-2">التاريخ</th>
                    <th className="text-right px-3 py-2">الدفع</th>
                    <th className="text-right px-3 py-2">الحالة</th>
                    <th className="text-left px-3 py-2">الإجمالي</th>
                    <th className="text-left px-3 py-2">المدفوع</th>
                    <th className="text-left px-3 py-2">المتبقي</th>
                    <th className="text-right px-3 py-2 print:hidden"></th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => {
                    const d = new Date(inv.created_at);
                    const dateStr = d.toLocaleDateString("ar-EG");
                    const rem = Number(inv.remaining) || 0;
                    return (
                      <tr key={inv.id} className="border-t border-border hover:bg-muted/40">
                        <td className="px-3 py-2 nums font-bold">#{inv.invoice_number}</td>
                        <td className="px-3 py-2 nums text-xs text-muted-foreground">{dateStr}</td>
                        <td className="px-3 py-2 text-xs">{inv.payment_method === "bank" ? "بنكي" : inv.payment_method === "mixed" ? "مختلط" : "نقدي"}</td>
                        <td className="px-3 py-2">
                          <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full ${statusClasses[inv.status] || "bg-muted"}`}>
                            {statusLabels[inv.status] || inv.status}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-left nums">{formatSDG(Number(inv.total))}</td>
                        <td className="px-3 py-2 text-left nums text-emerald-700">{formatSDG(Number(inv.paid))}</td>
                        <td className={`px-3 py-2 text-left nums font-bold ${rem > 0 ? "text-rose-700" : "text-muted-foreground"}`}>
                          {formatSDG(rem)}
                        </td>
                        <td className="px-3 py-2 text-right print:hidden">
                          <Link
                            to="/invoices/$invoiceId"
                            params={{ invoiceId: inv.id }}
                            search={{ autoprint: 0 }}
                            className="text-xs text-brand underline"
                          >
                            فتح
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-muted/50 text-sm font-bold">
                  <tr>
                    <td colSpan={4} className="px-3 py-2 text-right">الإجمالي</td>
                    <td className="px-3 py-2 text-left nums">{formatSDG(totals.total)}</td>
                    <td className="px-3 py-2 text-left nums text-emerald-700">{formatSDG(totals.paid)}</td>
                    <td className={`px-3 py-2 text-left nums ${totals.remaining > 0 ? "text-rose-700" : ""}`}>{formatSDG(totals.remaining)}</td>
                    <td className="print:hidden"></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </section>
      </div>

      <style>{`
        @media print {
          body { background: white !important; }
          .print\\:hidden { display: none !important; }
        }
      `}</style>
    </AppShell>
  );
}

function SummaryCard({
  label, value, tone = "brand", hint,
}: { label: string; value: string; tone?: "brand" | "ok" | "warn"; hint?: string }) {
  const cls =
    tone === "warn" ? "text-rose-700" : tone === "ok" ? "text-emerald-700" : "text-brand";
  return (
    <div className="rounded-xl border border-border bg-card p-3 shadow-card">
      <div className="text-[11px] font-bold text-muted-foreground">{label}</div>
      <div className={`text-lg font-extrabold nums mt-0.5 ${cls}`}>{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground mt-0.5">{hint}</div>}
    </div>
  );
}
