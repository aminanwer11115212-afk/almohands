import { createFileRoute, Link } from "@tanstack/react-router";
import { PermissionGate } from "@/components/PermissionGate";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Phone, Wrench, Receipt, Printer, Share2, Loader2, AlertCircle, Package, FileDown, Info } from "lucide-react";
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
  const [invFrom, setInvFrom] = useState("");
  const [invTo, setInvTo] = useState("");
  const [invQuick, setInvQuick] = useState<"" | "7d" | "30d" | "month" | "year">("");

  const invRange = useMemo(() => {
    if (!invQuick) return null;
    const now = new Date();
    const t = new Date(now); t.setHours(23, 59, 59, 999);
    const f = new Date(now);
    if (invQuick === "7d") f.setDate(now.getDate() - 7);
    else if (invQuick === "30d") f.setDate(now.getDate() - 30);
    else if (invQuick === "month") { f.setDate(1); f.setHours(0, 0, 0, 0); }
    else if (invQuick === "year") { f.setMonth(0, 1); f.setHours(0, 0, 0, 0); }
    return { from: f.toISOString(), to: t.toISOString() };
  }, [invQuick]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["customer-ledger", customerId, invFrom, invTo, invQuick],
    queryFn: async () => {
      const { data: cust, error: cErr } = await supabase
        .from("customers")
        .select("*")
        .eq("id", customerId)
        .maybeSingle();
      if (cErr) throw cErr;
      if (!cust) return { customer: null, invoices: [] as InvoiceRow[] };

      let iq = supabase
        .from("invoices")
        .select("id, invoice_number, total, paid, remaining, status, payment_method, created_at")
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false })
        .limit(500);
      if (invRange) iq = iq.gte("created_at", invRange.from).lte("created_at", invRange.to);
      else {
        if (invFrom) iq = iq.gte("created_at", new Date(invFrom).toISOString());
        if (invTo) { const end = new Date(invTo); end.setHours(23, 59, 59, 999); iq = iq.lte("created_at", end.toISOString()); }
      }
      const { data: invs, error: iErr } = await iq;
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
          <div className="p-3 border-b border-border flex items-center gap-2 flex-wrap">
            <Receipt className="size-4 text-brand" />
            <h2 className="font-bold text-sm">سجل الفواتير</h2>
            <span className="text-xs text-muted-foreground">({totals.count})</span>
          </div>
          <div className="p-3 border-b border-border space-y-2 print:hidden">
            <div className="rounded-md border border-sky-200 bg-sky-50 p-2 text-[11px] text-sky-900 flex items-start gap-1.5">
              <Info className="size-3.5 shrink-0 mt-0.5" />
              <span>الأسعار المعروضة ضمن كل فاتورة محفوظة كما وقت البيع — أي زيادة سعر أو تعديل مديونية لاحقًا لا يُطبَّق على الفواتير القديمة، فقط على الفواتير الجديدة.</span>
            </div>
            <div className="grid sm:grid-cols-3 gap-2">
              <input type="date" value={invFrom} disabled={!!invQuick} onChange={(e) => setInvFrom(e.target.value)} className="h-9 rounded-lg border border-border bg-background px-2 text-sm disabled:opacity-50" />
              <input type="date" value={invTo} disabled={!!invQuick} onChange={(e) => setInvTo(e.target.value)} className="h-9 rounded-lg border border-border bg-background px-2 text-sm disabled:opacity-50" />
              <div className="flex flex-wrap gap-1 text-xs">
                {([["", "الكل"], ["7d", "7ي"], ["30d", "30ي"], ["month", "الشهر"], ["year", "السنة"]] as const).map(([v, l]) => (
                  <button key={v} onClick={() => setInvQuick(v)} className={`px-2 py-1 rounded-md border ${invQuick === v ? "bg-brand text-brand-foreground border-brand" : "bg-background border-border"}`}>{l}</button>
                ))}
              </div>
            </div>
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

        <ProductsPurchasedSection customerId={customerId} customerName={c.name} />
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

type PurchasedItem = {
  id: string;
  product_name: string;
  quantity: number;
  unit: string;
  unit_price: number;
  line_total: number;
  created_at: string;
  invoice_id: string;
  invoice_number: number | null;
  invoice_status: string | null;
};

function ProductsPurchasedSection({ customerId, customerName }: { customerId: string; customerName: string }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [quick, setQuick] = useState<"" | "7d" | "30d" | "month" | "year">("");
  const [search, setSearch] = useState("");

  const range = useMemo(() => {
    if (!quick) return null;
    const now = new Date();
    const t = new Date(now); t.setHours(23, 59, 59, 999);
    const f = new Date(now);
    if (quick === "7d") f.setDate(now.getDate() - 7);
    else if (quick === "30d") f.setDate(now.getDate() - 30);
    else if (quick === "month") { f.setDate(1); f.setHours(0, 0, 0, 0); }
    else if (quick === "year") { f.setMonth(0, 1); f.setHours(0, 0, 0, 0); }
    return { from: f.toISOString(), to: t.toISOString() };
  }, [quick]);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["customer-products", customerId, from, to, quick],
    queryFn: async () => {
      let q = supabase
        .from("invoices")
        .select("id, invoice_number, status, created_at, invoice_items(id, product_name, quantity, unit, unit_price, line_total, created_at)")
        .eq("customer_id", customerId)
        .neq("status", "cancelled")
        .order("created_at", { ascending: false })
        .limit(500);
      if (range) q = q.gte("created_at", range.from).lte("created_at", range.to);
      else {
        if (from) q = q.gte("created_at", new Date(from).toISOString());
        if (to) { const end = new Date(to); end.setHours(23, 59, 59, 999); q = q.lte("created_at", end.toISOString()); }
      }
      const { data, error } = await q;
      if (error) throw error;
      const out: PurchasedItem[] = [];
      for (const inv of (data ?? []) as any[]) {
        for (const it of (inv.invoice_items ?? [])) {
          out.push({
            id: it.id,
            product_name: it.product_name,
            quantity: Number(it.quantity),
            unit: it.unit,
            unit_price: Number(it.unit_price),
            line_total: Number(it.line_total),
            created_at: inv.created_at,
            invoice_id: inv.id,
            invoice_number: inv.invoice_number,
            invoice_status: inv.status,
          });
        }
      }
      return out;
    },
  });

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return items;
    return items.filter((i) => i.product_name.toLowerCase().includes(s));
  }, [items, search]);

  const grouped = useMemo(() => {
    const m = new Map<string, { name: string; qty: number; total: number; times: number }>();
    for (const it of filtered) {
      const key = it.product_name;
      const cur = m.get(key) ?? { name: key, qty: 0, total: 0, times: 0 };
      cur.qty += it.quantity;
      cur.total += it.line_total;
      cur.times += 1;
      m.set(key, cur);
    }
    return Array.from(m.values()).sort((a, b) => b.total - a.total);
  }, [filtered]);

  const totalQty = filtered.reduce((s, i) => s + i.quantity, 0);
  const totalSum = filtered.reduce((s, i) => s + i.line_total, 0);

  function exportCSV() {
    if (filtered.length === 0) return;
    const headers = ["التاريخ", "رقم الفاتورة", "المنتج", "الكمية", "الوحدة", "السعر", "الإجمالي"];
    const lines = [headers.join(",")];
    for (const it of filtered) {
      const row = [
        new Date(it.created_at).toLocaleDateString("ar-EG"),
        String(it.invoice_number ?? ""),
        it.product_name,
        String(it.quantity),
        it.unit,
        String(it.unit_price),
        String(it.line_total),
      ].map((v) => /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
      lines.push(row.join(","));
    }
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `products-${customerName}-${Date.now()}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 500);
  }

  return (
    <section className="rounded-2xl border border-border bg-card shadow-card overflow-hidden print:hidden">
      <div className="p-3 border-b border-border flex items-center gap-2 flex-wrap">
        <Package className="size-4 text-brand" />
        <h2 className="font-bold text-sm">المنتجات المشتراة</h2>
        <span className="text-xs text-muted-foreground">({filtered.length} سطر · {totalQty} قطعة · {formatSDG(totalSum)})</span>
        <button onClick={exportCSV} className="ms-auto h-8 px-2 rounded-md bg-sky-600 text-white text-xs font-bold inline-flex items-center gap-1">
          <FileDown className="size-3.5" /> CSV
        </button>
      </div>
      <div className="p-3 space-y-2 border-b border-border">
        <div className="grid sm:grid-cols-4 gap-2">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث بالمنتج..." className="h-9 rounded-lg border border-border bg-background px-3 text-sm" />
          <input type="date" value={from} disabled={!!quick} onChange={(e) => setFrom(e.target.value)} className="h-9 rounded-lg border border-border bg-background px-2 text-sm disabled:opacity-50" />
          <input type="date" value={to} disabled={!!quick} onChange={(e) => setTo(e.target.value)} className="h-9 rounded-lg border border-border bg-background px-2 text-sm disabled:opacity-50" />
          <div className="flex flex-wrap gap-1 text-xs">
            {([["", "الكل"], ["7d", "7ي"], ["30d", "30ي"], ["month", "الشهر"], ["year", "السنة"]] as const).map(([v, l]) => (
              <button key={v} onClick={() => setQuick(v)} className={`px-2 py-1 rounded-md border ${quick === v ? "bg-brand text-brand-foreground border-brand" : "bg-background border-border"}`}>{l}</button>
            ))}
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="py-10 text-center"><Loader2 className="size-5 animate-spin text-muted-foreground inline" /></div>
      ) : filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">لا توجد مشتريات في هذا النطاق</p>
      ) : (
        <>
          {grouped.length > 0 && (
            <div className="p-3 border-b border-border bg-muted/30">
              <div className="text-xs font-bold text-muted-foreground mb-1.5">ملخص حسب المنتج</div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                {grouped.slice(0, 12).map((g) => (
                  <div key={g.name} className="rounded-md bg-card border border-border px-2 py-1.5 text-xs flex justify-between gap-2">
                    <span className="truncate font-semibold">{g.name}</span>
                    <span className="nums text-muted-foreground shrink-0">{g.qty} · {formatSDG(g.total)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="text-right px-3 py-2">التاريخ</th>
                  <th className="text-right px-3 py-2">الفاتورة</th>
                  <th className="text-right px-3 py-2">المنتج</th>
                  <th className="text-left px-3 py-2">الكمية</th>
                  <th className="text-left px-3 py-2">السعر</th>
                  <th className="text-left px-3 py-2">الإجمالي</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 300).map((it) => (
                  <tr key={it.id} className="border-t border-border hover:bg-muted/40">
                    <td className="px-3 py-2 text-xs nums text-muted-foreground">{new Date(it.created_at).toLocaleDateString("ar-EG")}</td>
                    <td className="px-3 py-2 nums text-xs">
                      <Link to="/invoices/$invoiceId" params={{ invoiceId: it.invoice_id }} search={{ autoprint: 0 }} className="text-brand underline">#{it.invoice_number ?? "—"}</Link>
                    </td>
                    <td className="px-3 py-2 font-semibold">{it.product_name}</td>
                    <td className="px-3 py-2 text-left nums">{it.quantity} <span className="text-xs text-muted-foreground">{it.unit}</span></td>
                    <td className="px-3 py-2 text-left nums text-muted-foreground">{formatSDG(it.unit_price)}</td>
                    <td className="px-3 py-2 text-left nums font-bold">{formatSDG(it.line_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length > 300 && (
              <div className="text-xs text-muted-foreground text-center py-2">تم عرض أول 300 سطر · صدّر CSV للحصول على الكل</div>
            )}
          </div>
        </>
      )}
    </section>
  );
}

