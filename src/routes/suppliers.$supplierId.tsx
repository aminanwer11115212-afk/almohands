import { createFileRoute, Link } from "@tanstack/react-router";
import { PermissionGate } from "@/components/PermissionGate";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Phone, MapPin, Truck, Loader2, AlertCircle, Printer, Info } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { formatSDG } from "@/lib/format";

export const Route = createFileRoute("/suppliers/$supplierId")({
  head: () => ({ meta: [{ title: "كشف حساب المورد — المهندس" }] }),
  component: () => (<PermissionGate perm="suppliers.view"><SupplierStatementPage /></PermissionGate>),
});

const statusLabels: Record<string, string> = { paid: "مدفوعة", partial: "جزئية", pending: "معلّقة" };
const statusClasses: Record<string, string> = {
  paid: "bg-emerald-100 text-emerald-700",
  partial: "bg-amber-100 text-amber-700",
  pending: "bg-rose-100 text-rose-700",
};

type QuickRange = "" | "7d" | "30d" | "month" | "year";

function computeRange(q: QuickRange) {
  if (!q) return null;
  const now = new Date();
  const to = new Date(now); to.setHours(23, 59, 59, 999);
  const from = new Date(now);
  if (q === "7d") from.setDate(now.getDate() - 7);
  else if (q === "30d") from.setDate(now.getDate() - 30);
  else if (q === "month") { from.setDate(1); from.setHours(0, 0, 0, 0); }
  else if (q === "year") { from.setMonth(0, 1); from.setHours(0, 0, 0, 0); }
  return { from: from.toISOString(), to: to.toISOString() };
}

function SupplierStatementPage() {
  const { supplierId } = Route.useParams();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [quick, setQuick] = useState<QuickRange>("");

  const { data, isLoading, isError } = useQuery({
    queryKey: ["supplier-statement", supplierId, from, to, quick],
    queryFn: async () => {
      const range = computeRange(quick);
      const fromIso = range ? range.from : (from ? new Date(from).toISOString() : null);
      const toIso = range ? range.to : (to ? (() => { const d = new Date(to); d.setHours(23,59,59,999); return d.toISOString(); })() : null);
      let pq = supabase.from("purchases").select("*").eq("supplier_id", supplierId).order("created_at", { ascending: false }).limit(500);
      let payq = supabase.from("payments").select("*").eq("party_type", "supplier").eq("party_id", supplierId).order("created_at", { ascending: false }).limit(500);
      if (fromIso) { pq = pq.gte("created_at", fromIso); payq = payq.gte("created_at", fromIso); }
      if (toIso) { pq = pq.lte("created_at", toIso); payq = payq.lte("created_at", toIso); }
      const [s, purchases, payments] = await Promise.all([
        supabase.from("suppliers").select("*").eq("id", supplierId).maybeSingle(),
        pq,
        payq,
      ]);
      if (s.error) throw s.error;
      if (purchases.error) throw purchases.error;
      if (payments.error) throw payments.error;
      return { supplier: s.data, purchases: purchases.data ?? [], payments: payments.data ?? [] };
    },
  });


  const totals = useMemo(() => {
    const purchases = data?.purchases ?? [];
    const payments = data?.payments ?? [];
    let total = 0, paid = 0, remaining = 0;
    for (const p of purchases) {
      total += Number(p.total) || 0;
      paid += Number(p.paid) || 0;
      remaining += Number(p.remaining) || 0;
    }
    const separatePayments = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
    return { total, paid, remaining, separatePayments, count: purchases.length };
  }, [data]);

  if (isLoading) {
    return (
      <AppShell title="كشف حساب المورد" showBack>
        <div className="py-16 grid place-items-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
      </AppShell>
    );
  }
  if (isError || !data?.supplier) {
    return (
      <AppShell title="كشف حساب المورد" showBack>
        <div className="py-12 text-center text-sm text-destructive flex flex-col items-center gap-2">
          <AlertCircle className="size-6" />
          المورد غير موجود
          <Link to="/suppliers" className="text-brand underline text-xs">رجوع لقائمة الموردين</Link>
        </div>
      </AppShell>
    );
  }

  const s = data.supplier;

  return (
    <AppShell title="كشف حساب المورد" showBack>
      <div className="space-y-4">
        <section className="rounded-2xl border border-border bg-card shadow-card p-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <h1 className="text-xl font-extrabold flex items-center gap-2">
                <Truck className="size-5 text-brand" />
                {s.name}
              </h1>
              <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
                {s.phone && <span className="flex items-center gap-1"><Phone className="size-3.5" /><span dir="ltr">{s.phone}</span></span>}
                {s.address && <span className="flex items-center gap-1"><MapPin className="size-3.5" />{s.address}</span>}
              </div>
              {s.notes && <p className="mt-2 text-xs text-muted-foreground border-t border-border pt-2">{s.notes}</p>}
            </div>
            <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 text-xs font-bold bg-white border border-border hover:bg-muted rounded-lg px-3 py-2 print:hidden">
              <Printer className="size-3.5" /> طباعة
            </button>
          </div>
        </section>

        <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Sc label="عدد الفواتير" value={String(totals.count)} />
          <Sc label="إجمالي المشتريات" value={formatSDG(totals.total)} />
          <Sc label="المدفوع" value={formatSDG(totals.paid)} tone="ok" />
          <Sc label="الرصيد للمورد" value={formatSDG(totals.remaining)} tone={totals.remaining > 0 ? "warn" : "ok"} />
        </section>

        <section className="rounded-2xl border border-border bg-card shadow-card overflow-hidden">
          <div className="p-3 border-b border-border font-bold text-sm">فواتير المشتريات ({totals.count})</div>
          {data.purchases.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">لا توجد مشتريات من هذا المورد بعد</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="text-right px-3 py-2">رقم</th>
                    <th className="text-right px-3 py-2">التاريخ</th>
                    <th className="text-right px-3 py-2">الحالة</th>
                    <th className="text-left px-3 py-2">الإجمالي</th>
                    <th className="text-left px-3 py-2">المدفوع</th>
                    <th className="text-left px-3 py-2">المتبقي</th>
                  </tr>
                </thead>
                <tbody>
                  {data.purchases.map((p: any) => {
                    const rem = Number(p.remaining) || 0;
                    return (
                      <tr key={p.id} className="border-t border-border hover:bg-muted/40">
                        <td className="px-3 py-2 nums font-bold">#{p.purchase_number}</td>
                        <td className="px-3 py-2 nums text-xs text-muted-foreground">{new Date(p.created_at).toLocaleDateString("ar-EG")}</td>
                        <td className="px-3 py-2">
                          <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full ${statusClasses[p.status] || "bg-muted"}`}>
                            {statusLabels[p.status] || p.status}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-left nums">{formatSDG(Number(p.total))}</td>
                        <td className="px-3 py-2 text-left nums text-emerald-700">{formatSDG(Number(p.paid))}</td>
                        <td className={`px-3 py-2 text-left nums font-bold ${rem > 0 ? "text-rose-700" : "text-muted-foreground"}`}>{formatSDG(rem)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {data.payments.length > 0 && (
          <section className="rounded-2xl border border-border bg-card shadow-card overflow-hidden">
            <div className="p-3 border-b border-border font-bold text-sm">دفعات منفصلة</div>
            <ul className="divide-y divide-border">
              {data.payments.map((pay: any) => (
                <li key={pay.id} className="p-3 flex items-center justify-between text-sm">
                  <div>
                    <div className="text-xs text-muted-foreground">{new Date(pay.created_at).toLocaleString("ar-EG")}</div>
                    {pay.notes && <div className="text-xs">{pay.notes}</div>}
                  </div>
                  <div className="font-bold nums text-emerald-700">{formatSDG(Number(pay.amount))}</div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </AppShell>
  );
}

function Sc({ label, value, tone = "brand" }: { label: string; value: string; tone?: "brand" | "ok" | "warn" }) {
  const cls = tone === "warn" ? "text-rose-700" : tone === "ok" ? "text-emerald-700" : "text-brand";
  return (
    <div className="rounded-xl border border-border bg-card p-3 shadow-card">
      <div className="text-[11px] font-bold text-muted-foreground">{label}</div>
      <div className={`text-lg font-extrabold nums mt-0.5 ${cls}`}>{value}</div>
    </div>
  );
}
