import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { formatSDG } from "@/lib/format";
import { Printer, ArrowRight } from "lucide-react";
import logo from "@/assets/logo.png";

export const Route = createFileRoute("/invoices/$invoiceId")({
  head: () => ({ meta: [{ title: "فاتورة — المهندس" }] }),
  component: InvoiceDetailPage,
});

function InvoiceDetailPage() {
  const { invoiceId } = Route.useParams();

  const { data, isLoading } = useQuery({
    queryKey: ["invoice", invoiceId],
    queryFn: async () => {
      const { data: inv, error } = await supabase
        .from("invoices")
        .select("*")
        .eq("id", invoiceId)
        .maybeSingle();
      if (error) throw error;
      const { data: items } = await supabase
        .from("invoice_items")
        .select("*")
        .eq("invoice_id", invoiceId);
      let paymentMethod = null;
      if (inv?.payment_method_id) {
        const { data: pm } = await supabase
          .from("payment_methods")
          .select("*")
          .eq("id", inv.payment_method_id)
          .maybeSingle();
        paymentMethod = pm;
      }
      const { data: store } = await supabase
        .from("store_profile")
        .select("*")
        .maybeSingle();
      return { inv, items: items ?? [], paymentMethod, store };
    },
  });

  if (isLoading) {
    return (
      <AppShell title="فاتورة" showBack>
        <div className="p-6 text-center text-sm text-muted-foreground">جارٍ التحميل…</div>
      </AppShell>
    );
  }
  if (!data?.inv) {
    return (
      <AppShell title="فاتورة" showBack>
        <div className="p-6 text-center text-sm text-destructive">الفاتورة غير موجودة</div>
      </AppShell>
    );
  }

  const { inv, items, paymentMethod, store } = data;
  const storeName = store?.name || "المهندس";
  const storePhone = store?.phone || "0960514233";
  const storeAddress = store?.address || "";
  const invoiceFooter = store?.invoice_footer || "شكراً لتعاملكم معنا";
  const paymentLabel = inv.payment_method === "bank" ? "تحويل بنكي" : inv.payment_method === "mixed" ? "مختلط" : "نقدي";

  return (
    <div className="min-h-dvh bg-background print:bg-white">
      <header className="bg-header text-header-foreground shadow print:hidden">
        <div className="mx-auto max-w-2xl px-4 h-14 flex items-center gap-3">
          <Link to="/invoices" search={{ q: "", status: "all", from: "", to: "" }} className="p-2 rounded-md hover:bg-white/10">
            <ArrowRight className="size-5" />
          </Link>
          <h1 className="text-lg font-bold flex-1">فاتورة #{inv.invoice_number}</h1>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1 text-sm bg-white/10 rounded-lg px-3 py-1.5"
          >
            <Printer className="size-4" /> طباعة
          </button>
        </div>
      </header>

      <main id="print-area" className="mx-auto max-w-2xl px-4 py-6 print:p-4">
        <div className="text-center border-b pb-4 mb-4">
          <img src={logo} alt={storeName} className="mx-auto size-24 object-contain" />
          <h2 className="text-xl font-extrabold text-brand mt-2">{storeName}</h2>
          {storeAddress && <p className="text-xs text-muted-foreground">{storeAddress}</p>}
          <p className="text-xs text-muted-foreground nums" dir="ltr">{storePhone}</p>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm mb-4">
          <div>
            <div className="text-xs text-muted-foreground">رقم الفاتورة</div>
            <div className="font-bold nums">#{inv.invoice_number}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">التاريخ</div>
            <div className="font-bold nums">
              {new Date(inv.created_at).toLocaleString("ar-EG", { dateStyle: "short", timeStyle: "short" })}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">العميل</div>
            <div className="font-bold">{inv.customer_name || "عميل نقدي"}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">الهاتف</div>
            <div className="font-bold nums">{inv.customer_phone || "—"}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">طريقة الدفع</div>
            <div className="font-bold">{paymentLabel}</div>
          </div>
        </div>

        <table className="w-full text-sm border-collapse mb-4">
          <thead>
            <tr className="bg-muted">
              <th className="text-right p-2 border">الصنف</th>
              <th className="text-center p-2 border">الكمية</th>
              <th className="text-center p-2 border">السعر</th>
              <th className="text-center p-2 border">الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id}>
                <td className="p-2 border">{it.product_name}</td>
                <td className="p-2 border text-center nums">{it.quantity}</td>
                <td className="p-2 border text-center nums">{formatSDG(Number(it.unit_price))}</td>
                <td className="p-2 border text-center nums">{formatSDG(Number(it.line_total))}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="border-t pt-3 space-y-1 text-sm">
          <div className="flex justify-between">
            <span>الإجمالي</span>
            <span className="font-bold nums">{formatSDG(Number(inv.total))}</span>
          </div>
          <div className="flex justify-between">
            <span>المدفوع</span>
            <span className="font-bold nums">{formatSDG(Number(inv.paid))}</span>
          </div>
          {Number(inv.remaining) > 0 && (
            <div className="flex justify-between text-rose-600">
              <span>المتبقي</span>
              <span className="font-bold nums">{formatSDG(Number(inv.remaining))}</span>
            </div>
          )}
        </div>

        {paymentMethod && paymentMethod.type === "bank" && (
          <div className="mt-4 border border-blue-300 bg-blue-50 rounded-lg p-3 text-sm">
            <div className="font-bold text-blue-800 mb-1">تفاصيل التحويل البنكي</div>
            <div className="space-y-0.5 text-blue-900">
              {paymentMethod.bank_name && <div>البنك: <span className="font-bold">{paymentMethod.bank_name}</span></div>}
              {paymentMethod.account_holder && <div>صاحب الحساب: <span className="font-bold">{paymentMethod.account_holder}</span></div>}
              {paymentMethod.account_number && <div dir="ltr" className="text-right">رقم الحساب: <span className="font-bold nums">{paymentMethod.account_number}</span></div>}
              {paymentMethod.iban && <div dir="ltr" className="text-right">IBAN: <span className="font-bold nums">{paymentMethod.iban}</span></div>}
            </div>
          </div>
        )}

        <p className="text-center text-xs text-muted-foreground mt-8 whitespace-pre-line">{invoiceFooter}</p>
      </main>


      <style>{`
        @media print {
          @page { margin: 10mm; }
          body { background: white; }
          .print\\:hidden { display: none !important; }
        }
      `}</style>
    </div>
  );
}
