import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Search, Trash2, Plus, Minus, Loader2, CheckCircle2, Receipt, Wallet, Landmark } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { formatSDG, formatNumber } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";
import { useProducts } from "@/hooks/use-products";
import { usePaymentMethods, type PaymentMethodType } from "@/hooks/use-payment-methods";
import type { Product } from "@/types/product";
import { useQueryClient } from "@tanstack/react-query";
import { getErrorMessage, parseNumber } from "@/lib/errors";
import { toast } from "sonner";


export const Route = createFileRoute("/cashier")({
  head: () => ({ meta: [{ title: "الكاشير — المهندس" }] }),
  component: CashierPage,
});

type CartItem = {
  productId: string;
  name: string;
  unit: string;
  unitPrice: number;
  costPrice: number;
  quantity: number;
  maxQty: number;
};

function CashierPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [discount, setDiscount] = useState("0");
  const [paid, setPaid] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastInvoiceNo, setLastInvoiceNo] = useState<number | null>(null);
  const [paymentType, setPaymentType] = useState<PaymentMethodType>("cash");
  const [paymentMethodId, setPaymentMethodId] = useState<string>("");

  const { data: products = [] } = useProducts({ q: query, sort: "name", asc: true });
  const { data: paymentMethods = [] } = usePaymentMethods(true);

  // Auto-select default payment method
  useEffect(() => {
    if (paymentMethodId) return;
    const def = paymentMethods.find((m) => m.is_default);
    if (def) {
      setPaymentType(def.type);
      setPaymentMethodId(def.id);
    }
  }, [paymentMethods, paymentMethodId]);

  const bankAccounts = useMemo(() => paymentMethods.filter((m) => m.type === "bank"), [paymentMethods]);
  const cashAccounts = useMemo(() => paymentMethods.filter((m) => m.type === "cash"), [paymentMethods]);

  useEffect(() => {
    const channel = supabase
      .channel("cashier-products")
      .on("postgres_changes", { event: "*", schema: "public", table: "products" }, () =>
        queryClient.invalidateQueries({ queryKey: ["products"] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  const subtotal = useMemo(
    () => cart.reduce((s, i) => s + i.unitPrice * i.quantity, 0),
    [cart],
  );
  const discountNum = Math.min(subtotal, Math.max(0, parseNumber(discount, { min: 0 })));
  const total = Math.max(0, subtotal - discountNum);
  const paidNum = paid === "" ? total : Math.max(0, parseNumber(paid, { min: 0 }));
  const remaining = total - paidNum;


  function addProduct(p: Product) {
    setCart((prev) => {
      const found = prev.find((i) => i.productId === p.id);
      if (found) {
        if (found.quantity + 1 > p.quantity) return prev;
        return prev.map((i) =>
          i.productId === p.id ? { ...i, quantity: i.quantity + 1 } : i,
        );
      }
      if (p.quantity <= 0) return prev;
      return [
        ...prev,
        {
          productId: p.id,
          name: p.name,
          unit: p.unit,
          unitPrice: p.salePrice,
          costPrice: p.costPrice,
          quantity: 1,
          maxQty: p.quantity,
        },
      ];
    });
    setQuery("");
  }

  function updateQty(id: string, delta: number) {
    setCart((prev) =>
      prev
        .map((i) =>
          i.productId === id
            ? { ...i, quantity: Math.min(i.maxQty, Math.max(0, i.quantity + delta)) }
            : i,
        )
        .filter((i) => i.quantity > 0),
    );
  }
  function removeItem(id: string) {
    setCart((prev) => prev.filter((i) => i.productId !== id));
  }

  async function checkout() {
    if (cart.length === 0) {
      setError("أضف منتجات للسلة أولاً");
      toast.error("السلة فارغة");
      return;
    }
    // Validate phone shape if provided
    const phone = customerPhone.trim();
    if (phone && !/^[0-9+\-\s()]{6,20}$/.test(phone)) {
      setError("رقم الهاتف غير صالح");
      toast.error("رقم الهاتف غير صالح");
      return;
    }
    if (customerName.length > 120 || phone.length > 30) {
      setError("بيانات العميل طويلة جداً");
      return;
    }
    // Sanity: quantities within stock
    const overStock = cart.find((i) => i.quantity > i.maxQty || i.quantity <= 0);
    if (overStock) {
      const msg = `الكمية غير صالحة للصنف: ${overStock.name}`;
      setError(msg);
      toast.error(msg);
      return;
    }
    if (paymentType === "bank" && !paymentMethodId) {
      setError("اختر حساباً بنكياً");
      toast.error("اختر حساباً بنكياً");
      return;
    }



    setError(null);
    setSaving(true);
    try {
      const { data: u, error: authErr } = await supabase.auth.getUser();
      if (authErr) throw authErr;
      const userId = u.user?.id;
      if (!userId) { navigate({ to: "/auth" }); return; }

      const status = remaining <= 0 ? "paid" : paidNum > 0 ? "partial" : "pending";

      const { data: inv, error: e1 } = await supabase
        .from("invoices")
        .insert({
          user_id: userId,
          customer_name: customerName.trim() || null,
          customer_phone: phone || null,
          source: "pos",
          status,
          subtotal,
          discount: discountNum,
          total,
          paid: paidNum,
          remaining,
          payment_method: paymentType,
          payment_method_id: paymentType === "bank" ? (paymentMethodId || null) : (paymentMethodId || null),
        })
        .select("id, invoice_number")
        .single();
      if (e1) throw e1;
      if (!inv) throw new Error("تعذّر إنشاء الفاتورة");

      const items = cart.map((i) => ({
        invoice_id: inv.id,
        user_id: userId,
        product_id: i.productId,
        product_name: i.name,
        unit: i.unit,
        quantity: i.quantity,
        unit_price: i.unitPrice,
        cost_price: i.costPrice,
        line_total: i.unitPrice * i.quantity,
      }));
      const { error: e2 } = await supabase.from("invoice_items").insert(items);
      if (e2) {
        // Best-effort rollback: delete the invoice we just created
        await supabase.from("invoices").delete().eq("id", inv.id);
        throw e2;
      }

      setLastInvoiceNo(inv.invoice_number);
      setCart([]);
      setCustomerName("");
      setCustomerPhone("");
      setDiscount("0");
      setPaid("");
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success(`تم حفظ الفاتورة #${inv.invoice_number}`);
    } catch (err) {
      const msg = getErrorMessage(err, "تعذّر إتمام البيع");
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }


  return (
    <AppShell title="الكاشير" showBack>
      {lastInvoiceNo !== null && (
        <div className="mb-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 flex items-center gap-3">
          <CheckCircle2 className="size-5 shrink-0" />
          <div className="text-sm">
            تم حفظ الفاتورة رقم <span className="font-bold nums">#{lastInvoiceNo}</span> بنجاح.
          </div>
          <button onClick={() => setLastInvoiceNo(null)} className="mr-auto text-xs underline">إغلاق</button>
        </div>
      )}

      {/* Product search */}
      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ابحث عن منتج بالاسم أو الباركود"
          className="w-full h-12 rounded-xl border border-border bg-card pr-9 pl-3 text-sm outline-none focus:border-brand"
        />
        {query && products.length > 0 && (
          <div className="absolute z-20 top-full mt-1 right-0 left-0 max-h-64 overflow-auto rounded-xl border border-border bg-card shadow-lg">
            {products.slice(0, 10).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => addProduct(p)}
                disabled={p.quantity <= 0}
                className="w-full text-end px-3 py-2.5 hover:bg-muted disabled:opacity-50 border-b last:border-0 border-border flex items-center justify-between gap-3"
              >
                <span className="text-xs text-muted-foreground nums">
                  متوفر: {formatNumber(p.quantity)} · {formatSDG(p.salePrice)}
                </span>
                <span className="text-sm font-bold truncate">{p.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Cart */}
      <div className="mt-4 rounded-2xl border border-border bg-card shadow-card overflow-hidden">
        <div className="px-4 py-2 bg-muted text-xs font-bold text-muted-foreground flex items-center gap-2">
          <Receipt className="size-3.5" /> السلة ({cart.length})
        </div>
        {cart.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">ابحث عن منتج لإضافته</p>
        ) : (
          <ul className="divide-y divide-border">
            {cart.map((i) => (
              <li key={i.productId} className="p-3 flex items-center gap-2">
                <button onClick={() => removeItem(i.productId)} className="p-1.5 text-destructive" aria-label="حذف">
                  <Trash2 className="size-4" />
                </button>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold truncate">{i.name}</div>
                  <div className="text-xs text-muted-foreground nums">
                    {formatSDG(i.unitPrice)} × {i.quantity} = <span className="font-bold text-foreground">{formatSDG(i.unitPrice * i.quantity)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => updateQty(i.productId, -1)} className="size-7 grid place-items-center rounded-lg border border-border">
                    <Minus className="size-3.5" />
                  </button>
                  <span className="w-7 text-center text-sm font-bold nums">{i.quantity}</span>
                  <button onClick={() => updateQty(i.productId, +1)} disabled={i.quantity >= i.maxQty} className="size-7 grid place-items-center rounded-lg border border-border disabled:opacity-40">
                    <Plus className="size-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Customer */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <input
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
          placeholder="اسم العميل (اختياري)"
          className="h-11 rounded-xl border border-border bg-card px-3 text-sm outline-none focus:border-brand"
        />
        <input
          value={customerPhone}
          onChange={(e) => setCustomerPhone(e.target.value)}
          placeholder="الهاتف (اختياري)"
          dir="ltr"
          className="h-11 rounded-xl border border-border bg-card px-3 text-sm outline-none focus:border-brand text-left"
        />
      </div>

      {/* Totals */}
      <div className="mt-4 rounded-2xl bg-brand text-brand-foreground p-4 shadow-card space-y-2">
        <Row label="الإجمالي الفرعي" value={formatSDG(subtotal)} />
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs opacity-80">الخصم</span>
          <input
            value={discount}
            onChange={(e) => setDiscount(e.target.value)}
            type="number"
            inputMode="decimal"
            className="w-28 h-9 rounded-lg bg-white/15 text-brand-foreground placeholder:text-white/60 text-left px-2 text-sm font-bold nums outline-none"
          />
        </div>
        <div className="border-t border-white/15 pt-2">
          <Row label="المطلوب" value={formatSDG(total)} bold />
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs opacity-80">المدفوع</span>
          <input
            value={paid}
            onChange={(e) => setPaid(e.target.value)}
            type="number"
            inputMode="decimal"
            placeholder={String(total)}
            className="w-28 h-9 rounded-lg bg-white/15 text-brand-foreground placeholder:text-white/60 text-left px-2 text-sm font-bold nums outline-none"
          />
        </div>
        <Row label="الباقي" value={formatSDG(Math.max(0, remaining))} bold />
        {remaining < 0 && <Row label="المرتجع للعميل" value={formatSDG(-remaining)} />}
      </div>

      {error && <p className="mt-3 text-xs text-destructive text-center">{error}</p>}

      <button
        onClick={checkout}
        disabled={saving || cart.length === 0}
        className="mt-4 w-full h-14 rounded-xl bg-emerald-600 text-white font-bold text-base flex items-center justify-center gap-2 disabled:opacity-60"
      >
        {saving ? <Loader2 className="size-5 animate-spin" /> : <>إتمام البيع · {formatSDG(total)}</>}
      </button>
    </AppShell>
  );
}

function Row({ label, value, bold = false }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={`text-xs ${bold ? "opacity-100" : "opacity-80"}`}>{label}</span>
      <span className={`nums ${bold ? "text-lg font-extrabold" : "text-sm font-bold"}`}>{value}</span>
    </div>
  );
}
