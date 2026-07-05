import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Search, Trash2, Plus, Minus, Loader2, CheckCircle2, Receipt,
  Wallet, Landmark, Package, X, User, Printer, Eye,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { formatSDG, formatNumber } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";
import { useProducts } from "@/hooks/use-products";
import { usePaymentMethods, type PaymentMethodType } from "@/hooks/use-payment-methods";
import { useStoreProfile } from "@/hooks/use-store-profile";
import { useCustomers } from "@/hooks/use-customers";
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
  const [activeCategory, setActiveCategory] = useState<string>("__all__");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [showCustomerList, setShowCustomerList] = useState(false);
  const [discount, setDiscount] = useState("0");
  const [paid, setPaid] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastInvoice, setLastInvoice] = useState<{ id: string; number: number } | null>(null);
  const [paymentType, setPaymentType] = useState<PaymentMethodType>("cash");
  const [paymentMethodId, setPaymentMethodId] = useState<string>("");

  const searchRef = useRef<HTMLInputElement>(null);

  const { data: products = [] } = useProducts({ q: query, sort: "name", asc: true });
  const { data: paymentMethods = [] } = usePaymentMethods(true);
  const { data: storeProfile } = useStoreProfile();

  // Auto-focus search on mount
  useEffect(() => {
    searchRef.current?.focus();
  }, []);

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

  // Realtime product updates
  useEffect(() => {
    const channel = supabase
      .channel("cashier-products")
      .on("postgres_changes", { event: "*", schema: "public", table: "products" }, () =>
        queryClient.invalidateQueries({ queryKey: ["products"] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  // Extract categories from products
  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      const c = (p.category ?? "").trim();
      if (c) set.add(c);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ar"));
  }, [products]);

  const visibleProducts = useMemo(() => {
    if (activeCategory === "__all__") return products;
    return products.filter((p) => (p.category ?? "").trim() === activeCategory);
  }, [products, activeCategory]);

  const subtotal = useMemo(
    () => cart.reduce((s, i) => s + i.unitPrice * i.quantity, 0),
    [cart],
  );
  const discountNum = Math.min(subtotal, Math.max(0, parseNumber(discount, { min: 0 })));
  const total = Math.max(0, subtotal - discountNum);
  const paidNum = paid === "" ? total : Math.max(0, parseNumber(paid, { min: 0 }));
  const remaining = total - paidNum;
  const totalItems = cart.reduce((s, i) => s + i.quantity, 0);

  function addProduct(p: Product) {
    setCart((prev) => {
      const found = prev.find((i) => i.productId === p.id);
      if (found) {
        if (found.quantity + 1 > p.quantity) {
          toast.error(`الكمية القصوى: ${p.quantity}`);
          return prev;
        }
        return prev.map((i) =>
          i.productId === p.id ? { ...i, quantity: i.quantity + 1 } : i,
        );
      }
      if (p.quantity <= 0) {
        toast.error("المنتج غير متوفر");
        return prev;
      }
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

  function setItemQty(id: string, qty: number) {
    setCart((prev) =>
      prev
        .map((i) =>
          i.productId === id
            ? { ...i, quantity: Math.min(i.maxQty, Math.max(0, qty)) }
            : i,
        )
        .filter((i) => i.quantity > 0),
    );
  }

  function removeItem(id: string) {
    setCart((prev) => prev.filter((i) => i.productId !== id));
  }

  function clearCart() {
    if (cart.length === 0) return;
    if (confirm("مسح السلة بالكامل؟")) {
      setCart([]);
      setDiscount("0");
      setPaid("");
      toast.success("تم مسح السلة");
    }
  }

  async function checkout() {
    if (cart.length === 0) {
      setError("أضف منتجات للسلة أولاً");
      toast.error("السلة فارغة");
      return;
    }
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
          payment_method_id: paymentMethodId || null,
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
        await supabase.from("invoices").delete().eq("id", inv.id);
        throw e2;
      }

      setLastInvoice({ id: inv.id, number: inv.invoice_number });
      setCart([]);
      setCustomerName("");
      setCustomerPhone("");
      setDiscount("0");
      setPaid("");
      setQuery("");
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success(`تم حفظ الفاتورة #${inv.invoice_number}`);

      // Auto-print: navigate directly to preview with autoprint flag
      if (storeProfile?.auto_print) {
        navigate({
          to: "/invoices/$invoiceId",
          params: { invoiceId: inv.id },
          search: { autoprint: 1 },
        });
        return;
      }
      searchRef.current?.focus();
    } catch (err) {
      const msg = getErrorMessage(err, "تعذّر إتمام البيع");
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // F2 → checkout
      if (e.key === "F2") {
        e.preventDefault();
        if (!saving && cart.length > 0) checkout();
      }
      // Esc → clear search or focus back
      if (e.key === "Escape") {
        if (query) setQuery("");
        else searchRef.current?.focus();
      }
      // Ctrl+K / / → focus search
      if ((e.ctrlKey && e.key === "k") || (e.key === "/" && document.activeElement?.tagName !== "INPUT")) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [saving, cart.length, query]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AppShell title="الكاشير" showBack>
      {lastInvoice !== null && (
        <div className="mb-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 p-3 flex items-center flex-wrap gap-2">
          <CheckCircle2 className="size-5 shrink-0" />
          <div className="text-sm flex-1 min-w-[180px]">
            تم حفظ الفاتورة رقم <span className="font-bold nums">#{lastInvoice.number}</span> بنجاح.
          </div>
          <button
            onClick={() =>
              navigate({
                to: "/invoices/$invoiceId",
                params: { invoiceId: lastInvoice.id },
                search: { autoprint: 0 },
              })
            }
            className="flex items-center gap-1.5 text-xs font-bold bg-white border border-emerald-300 hover:bg-emerald-100 rounded-lg px-3 py-1.5"
          >
            <Eye className="size-3.5" /> معاينة
          </button>
          <button
            onClick={() =>
              navigate({
                to: "/invoices/$invoiceId",
                params: { invoiceId: lastInvoice.id },
                search: { autoprint: 1 },
              })
            }
            className="flex items-center gap-1.5 text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 rounded-lg px-3 py-1.5"
          >
            <Printer className="size-3.5" /> طباعة
          </button>
          <button
            onClick={() => navigate({ to: "/invoices" })}
            className="text-xs underline"
          >
            كل الفواتير
          </button>
          <button onClick={() => setLastInvoice(null)} className="p-1" aria-label="إغلاق">
            <X className="size-4" />
          </button>
        </div>
      )}

      {/* POS Layout: products grid | sticky cart */}
      <div className="grid gap-3 lg:grid-cols-[1fr_400px] xl:grid-cols-[1fr_440px]">
        {/* Left: search + categories + product grid */}
        <div className="min-w-0 space-y-3">
          {/* Search bar */}
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && visibleProducts.length > 0) {
                  addProduct(visibleProducts[0]);
                  setQuery("");
                }
              }}
              placeholder="ابحث بالاسم أو الباركود… (اضغط / للتركيز)"
              className="w-full h-12 rounded-xl border border-border bg-card pr-9 pl-24 text-sm outline-none focus:border-brand shadow-sm"
            />
            <div className="absolute left-2 top-1/2 -translate-y-1/2 flex items-center gap-1 text-[10px] text-muted-foreground">
              <kbd className="px-1.5 py-0.5 rounded border border-border bg-muted">F2</kbd>
              <span>دفع</span>
            </div>
          </div>

          {/* Category chips */}
          {categories.length > 0 && (
            <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
              <CategoryChip
                active={activeCategory === "__all__"}
                onClick={() => setActiveCategory("__all__")}
              >
                الكل ({products.length})
              </CategoryChip>
              {categories.map((c) => {
                const n = products.filter((p) => (p.category ?? "").trim() === c).length;
                return (
                  <CategoryChip
                    key={c}
                    active={activeCategory === c}
                    onClick={() => setActiveCategory(c)}
                  >
                    {c} ({n})
                  </CategoryChip>
                );
              })}
            </div>
          )}

          {/* Product grid */}
          <div className="rounded-2xl border border-border bg-card p-2 min-h-[300px]">
            {visibleProducts.length === 0 ? (
              <div className="p-12 text-center text-sm text-muted-foreground flex flex-col items-center gap-3">
                <Package className="size-10 opacity-40" />
                {query ? "لا يوجد منتج مطابق" : "لا توجد منتجات في هذا التصنيف"}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                {visibleProducts.slice(0, 60).map((p) => {
                  const outOfStock = p.quantity <= 0;
                  const inCart = cart.find((c) => c.productId === p.id);
                  const low = p.quantity > 0 && p.quantity <= (p.minQuantity || 0);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => addProduct(p)}
                      disabled={outOfStock}
                      className={`group relative text-right p-3 rounded-xl border transition-all ${
                        outOfStock
                          ? "opacity-40 cursor-not-allowed border-border bg-muted/30"
                          : "border-border bg-background hover:border-brand hover:shadow-md active:scale-[0.98]"
                      } ${inCart ? "ring-2 ring-brand" : ""}`}
                    >
                      {inCart && (
                        <span className="absolute top-1.5 left-1.5 size-6 rounded-full bg-brand text-brand-foreground text-xs font-bold grid place-items-center nums">
                          {inCart.quantity}
                        </span>
                      )}
                      <div className="text-sm font-bold line-clamp-2 min-h-[2.5rem]">{p.name}</div>
                      <div className="mt-2 flex items-center justify-between text-xs">
                        <span
                          className={`nums ${outOfStock ? "text-rose-600" : low ? "text-amber-600" : "text-muted-foreground"}`}
                        >
                          {outOfStock ? "نفد" : `${formatNumber(p.quantity)} ${p.unit}`}
                        </span>
                        <span className="font-bold text-brand nums">{formatSDG(p.salePrice)}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
            {visibleProducts.length > 60 && (
              <p className="text-center text-xs text-muted-foreground mt-2">
                عرض 60 من {visibleProducts.length} — استخدم البحث للتصفية
              </p>
            )}
          </div>
        </div>

        {/* Right: sticky cart panel */}
        <div className="lg:sticky lg:top-4 lg:h-fit lg:max-h-[calc(100vh-2rem)] flex flex-col rounded-2xl border border-border bg-card shadow-lg overflow-hidden">
          {/* Cart header */}
          <div className="px-4 py-3 bg-brand text-brand-foreground flex items-center gap-2">
            <Receipt className="size-4" />
            <span className="font-bold text-sm">السلة</span>
            <span className="mr-auto text-xs opacity-90 nums">
              {formatNumber(cart.length)} صنف · {formatNumber(totalItems)} قطعة
            </span>
            {cart.length > 0 && (
              <button
                onClick={clearCart}
                className="text-xs bg-white/15 hover:bg-white/25 rounded-md px-2 py-1"
              >
                مسح
              </button>
            )}
          </div>

          {/* Customer */}
          <div className="p-3 border-b border-border grid grid-cols-2 gap-2">
            <div className="relative col-span-2 sm:col-span-1">
              <User className="absolute right-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="عميل نقدي"
                className="w-full h-9 rounded-lg border border-border bg-background pr-7 pl-2 text-xs outline-none focus:border-brand"
              />
            </div>
            <input
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              placeholder="الهاتف"
              dir="ltr"
              className="col-span-2 sm:col-span-1 h-9 rounded-lg border border-border bg-background px-2 text-xs outline-none focus:border-brand text-left"
            />
          </div>

          {/* Cart items */}
          <div className="flex-1 overflow-auto min-h-[160px] max-h-[380px]">
            {cart.length === 0 ? (
              <div className="h-full min-h-[160px] grid place-items-center p-6 text-center text-sm text-muted-foreground">
                <div>
                  <Package className="size-8 mx-auto opacity-30 mb-2" />
                  انقر على منتج لإضافته
                </div>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {cart.map((i) => (
                  <li key={i.productId} className="p-2.5 flex items-center gap-2">
                    <button
                      onClick={() => removeItem(i.productId)}
                      className="p-1 text-destructive hover:bg-destructive/10 rounded"
                      aria-label="حذف"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold truncate">{i.name}</div>
                      <div className="text-[11px] text-muted-foreground nums">
                        {formatSDG(i.unitPrice)} = {" "}
                        <span className="font-bold text-foreground">
                          {formatSDG(i.unitPrice * i.quantity)}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button
                        onClick={() => updateQty(i.productId, -1)}
                        className="size-6 grid place-items-center rounded border border-border hover:bg-muted"
                      >
                        <Minus className="size-3" />
                      </button>
                      <input
                        type="number"
                        value={i.quantity}
                        onChange={(e) => setItemQty(i.productId, Number(e.target.value) || 0)}
                        className="w-10 h-6 text-center text-xs font-bold nums border border-border rounded bg-background outline-none focus:border-brand"
                      />
                      <button
                        onClick={() => updateQty(i.productId, +1)}
                        disabled={i.quantity >= i.maxQty}
                        className="size-6 grid place-items-center rounded border border-border hover:bg-muted disabled:opacity-40"
                      >
                        <Plus className="size-3" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Payment method */}
          <div className="p-3 border-t border-border space-y-2">
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setPaymentType("cash");
                  const def = cashAccounts.find((m) => m.is_default) ?? cashAccounts[0];
                  setPaymentMethodId(def?.id ?? "");
                }}
                className={`h-9 rounded-lg border flex items-center justify-center gap-1.5 text-xs font-bold ${paymentType === "cash" ? "bg-emerald-50 border-emerald-500 text-emerald-700" : "border-border bg-background"}`}
              >
                <Wallet className="size-3.5" /> نقدي
              </button>
              <button
                type="button"
                onClick={() => {
                  setPaymentType("bank");
                  const def = bankAccounts.find((m) => m.is_default) ?? bankAccounts[0];
                  setPaymentMethodId(def?.id ?? "");
                }}
                className={`h-9 rounded-lg border flex items-center justify-center gap-1.5 text-xs font-bold ${paymentType === "bank" ? "bg-blue-50 border-blue-500 text-blue-700" : "border-border bg-background"}`}
              >
                <Landmark className="size-3.5" /> بنكي
              </button>
            </div>
            {paymentType === "bank" && (
              bankAccounts.length === 0 ? (
                <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded p-1.5">
                  لا توجد حسابات بنكية.{" "}
                  <Link to="/payment-methods" className="underline font-bold">أضف</Link>
                </div>
              ) : (
                <select
                  value={paymentMethodId}
                  onChange={(e) => setPaymentMethodId(e.target.value)}
                  className="w-full h-8 rounded border border-border bg-background px-2 text-xs"
                >
                  <option value="">— اختر الحساب —</option>
                  {bankAccounts.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}{m.bank_name ? ` (${m.bank_name})` : ""}
                    </option>
                  ))}
                </select>
              )
            )}
          </div>

          {/* Totals */}
          <div className="p-3 bg-muted/50 border-t border-border space-y-1.5">
            <Row label="الفرعي" value={formatSDG(subtotal)} />
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">الخصم</span>
              <input
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
                type="number"
                inputMode="decimal"
                className="w-24 h-7 rounded border border-border bg-background text-left px-2 text-xs font-bold nums outline-none focus:border-brand"
              />
            </div>
            <div className="flex items-center justify-between pt-1.5 border-t border-border">
              <span className="text-sm font-bold">المطلوب</span>
              <span className="text-lg font-extrabold nums text-brand">{formatSDG(total)}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">المدفوع</span>
              <input
                value={paid}
                onChange={(e) => setPaid(e.target.value)}
                type="number"
                inputMode="decimal"
                placeholder={String(total)}
                className="w-24 h-7 rounded border border-border bg-background text-left px-2 text-xs font-bold nums outline-none focus:border-brand"
              />
            </div>
            {remaining > 0 && (
              <Row label="الباقي" value={formatSDG(remaining)} highlight="rose" />
            )}
            {remaining < 0 && (
              <Row label="مرتجع للعميل" value={formatSDG(-remaining)} highlight="emerald" />
            )}
          </div>

          {error && (
            <p className="px-3 pb-2 text-xs text-destructive text-center">{error}</p>
          )}

          <button
            onClick={checkout}
            disabled={saving || cart.length === 0}
            className="mx-3 mb-3 h-12 rounded-xl bg-emerald-600 text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50 hover:bg-emerald-700 transition"
          >
            {saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <>
                إتمام البيع · {formatSDG(total)}
                <kbd className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded">F2</kbd>
              </>
            )}
          </button>
        </div>
      </div>
    </AppShell>
  );
}

function CategoryChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 h-8 px-3 rounded-full text-xs font-bold transition ${
        active
          ? "bg-brand text-brand-foreground shadow"
          : "bg-muted text-foreground hover:bg-muted/70"
      }`}
    >
      {children}
    </button>
  );
}

function Row({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: "rose" | "emerald";
}) {
  const color =
    highlight === "rose" ? "text-rose-600" : highlight === "emerald" ? "text-emerald-600" : "";
  return (
    <div className="flex items-center justify-between">
      <span className={`text-xs ${color || "text-muted-foreground"}`}>{label}</span>
      <span className={`text-xs font-bold nums ${color}`}>{value}</span>
    </div>
  );
}
