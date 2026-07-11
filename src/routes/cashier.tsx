import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { PermissionGate } from "@/components/PermissionGate";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Search, Trash2, Plus, Minus, Loader2, CheckCircle2, Receipt,
  Wallet, Landmark, Package, X, User, Printer, Eye, Share2, Camera,
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
import { buildInvoiceText, openWhatsAppShare } from "@/lib/invoice-share";
import { InvoiceActionsModal } from "@/components/InvoiceActionsModal";
import { BarcodeScannerDialog } from "@/components/BarcodeScannerDialog";

export const Route = createFileRoute("/cashier")({
  head: () => ({ meta: [{ title: "الكاشير — المهندس" }] }),
  component: () => (<PermissionGate perm="cashier.use"><CashierPage /></PermissionGate>),
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
  const [scannerOpen, setScannerOpen] = useState(false);
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
  const [lastInvoice, setLastInvoice] = useState<{
    id: string;
    number: number;
    phone: string;
    text: string;
  } | null>(null);
  const [actionsModalId, setActionsModalId] = useState<string | null>(null);
  const [paymentType, setPaymentType] = useState<PaymentMethodType>("cash");
  const [paymentMethodId, setPaymentMethodId] = useState<string>("");
  const [referenceNumber, setReferenceNumber] = useState<string>("");


  const searchRef = useRef<HTMLInputElement>(null);

  const { data: products = [] } = useProducts({ q: query, sort: "name", asc: true });
  const { data: paymentMethods = [] } = usePaymentMethods(true);
  const { data: storeProfile } = useStoreProfile();
  const { data: customerMatches = [] } = useCustomers(customerName);

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

      // Resolve/save customer: reuse selected, or auto-create when a name is entered.
      let customerId: string | null = selectedCustomerId;
      let createdCustomerId: string | null = null;
      const trimmedName = customerName.trim();
      if (!customerId && trimmedName) {
        const { data: existing } = await supabase
          .from("customers")
          .select("id")
          .eq("user_id", userId)
          .ilike("name", trimmedName)
          .limit(1)
          .maybeSingle();
        if (existing?.id) {
          customerId = existing.id;
          if (phone) {
            await supabase.from("customers").update({ phone }).eq("id", existing.id);
          }
        } else {
          const { data: created, error: cErr } = await supabase
            .from("customers")
            .insert({ user_id: userId, name: trimmedName, phone: phone || null })
            .select("id")
            .single();
          if (cErr) throw cErr;
          customerId = created?.id ?? null;
          createdCustomerId = customerId;
        }
      }

      let savedInvoice: { id: string; number: number; phone: string; text: string } | null = null;
      try {
        const { data: inv, error: e1 } = await supabase
          .from("invoices")
          .insert({
            user_id: userId,
            customer_id: customerId,
            customer_name: trimmedName || null,
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
            reference_number: paymentType === "bank" ? (referenceNumber.trim() || null) : null,
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

        const shareText = buildInvoiceText(
          { invoice_number: inv.invoice_number, customer_name: trimmedName || null, total, paid: paidNum, remaining, created_at: new Date().toISOString() },
          cart.map((i) => ({ product_name: i.name, quantity: i.quantity, unit_price: i.unitPrice, line_total: i.unitPrice * i.quantity })),
          storeProfile?.name || "المتجر",
          { includeItems: true, footer: storeProfile?.invoice_footer || undefined },
        );
        savedInvoice = { id: inv.id, number: inv.invoice_number, phone, text: shareText };
        setLastInvoice(savedInvoice);
      } catch (invErr) {
        // Roll back a customer we just created; leave pre-existing ones untouched.
        if (createdCustomerId) {
          await supabase.from("customers").delete().eq("id", createdCustomerId);
        }
        throw invErr;
      }
      setCart([]);
      setCustomerName("");
      setCustomerPhone("");
      setSelectedCustomerId(null);
      setDiscount("0");
      setPaid("");
      setReferenceNumber("");
      setQuery("");

      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      if (savedInvoice) {
        toast.success(`تم حفظ الفاتورة #${savedInvoice.number}`);
        // Auto-print: navigate directly to preview with autoprint flag
        if (storeProfile?.auto_print) {
          navigate({
            to: "/invoices/$invoiceId",
            params: { invoiceId: savedInvoice.id },
            search: { autoprint: 1 },
          });
          return;
        }
        // Otherwise open the actions modal (print / WhatsApp / preview / return)
        setActionsModalId(savedInvoice.id);
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

  // Keep the latest checkout in a ref so the global keydown handler always
  // calls the current version (avoids stale-closure bugs on payment/discount
  // changes without rebinding the listener).
  const checkoutRef = useRef(checkout);
  useEffect(() => {
    checkoutRef.current = checkout;
  });

  // Keyboard shortcuts — bound once.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "F2") {
        e.preventDefault();
        checkoutRef.current();
      }
      if (e.key === "Escape") {
        if (query) setQuery("");
        else searchRef.current?.focus();
      }
      if ((e.ctrlKey && e.key === "k") || (e.key === "/" && document.activeElement?.tagName !== "INPUT")) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [query]);

  return (
    <AppShell title="الكاشير" showBack>
      <InvoiceActionsModal
        invoiceId={actionsModalId}
        open={actionsModalId !== null}
        onOpenChange={(v) => { if (!v) setActionsModalId(null); }}
      />

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
            onClick={() => openWhatsAppShare(lastInvoice.phone, lastInvoice.text)}
            className="flex items-center gap-1.5 text-xs font-bold bg-emerald-500 text-white hover:bg-emerald-600 rounded-lg px-3 py-1.5"
            title="مشاركة عبر واتساب"
          >
            <Share2 className="size-3.5" /> واتساب
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
          <div className="flex gap-2">
            <div className="relative flex-1">
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
                placeholder="ابحث بالاسم/الباركود/رقم القطعة/الرف…"
                className="w-full h-12 rounded-xl border border-border bg-card pr-9 pl-24 text-sm outline-none focus:border-brand shadow-sm"
              />
              <div className="absolute left-2 top-1/2 -translate-y-1/2 flex items-center gap-1 text-[10px] text-muted-foreground">
                <kbd className="px-1.5 py-0.5 rounded border border-border bg-muted">F2</kbd>
                <span>دفع</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setScannerOpen(true)}
              aria-label="مسح باركود بالكاميرا"
              title="مسح الباركود بالكاميرا"
              className="h-12 px-3 rounded-xl border border-border bg-card hover:bg-muted flex items-center gap-1.5 text-xs font-bold shrink-0"
            >
              <Camera className="size-4" />
              <span className="hidden sm:inline">مسح</span>
            </button>
          </div>

          <BarcodeScannerDialog
            open={scannerOpen}
            onClose={() => setScannerOpen(false)}
            onDetected={(code) => {
              const found = products.find(
                (p) => (p.barcode ?? "").trim() === code.trim(),
              );
              if (found) {
                addProduct(found);
                toast.success(`تمت إضافة: ${found.name}`);
              } else {
                setQuery(code);
                toast.warning("لم يُعثر على منتج بهذا الباركود — تم وضعه في البحث");
              }
            }}
          />


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
                      {(p.partNumber || p.location) && (
                        <div className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground" dir="ltr">
                          {p.partNumber && <span className="px-1 rounded bg-muted">#{p.partNumber}</span>}
                          {p.location && <span className="px-1 rounded bg-muted">📍{p.location}</span>}
                        </div>
                      )}
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
                onChange={(e) => {
                  setCustomerName(e.target.value);
                  setSelectedCustomerId(null);
                  setShowCustomerList(true);
                }}
                onFocus={() => setShowCustomerList(true)}
                onBlur={() => setTimeout(() => setShowCustomerList(false), 150)}
                placeholder="عميل نقدي — ابحث أو أضف"
                className="w-full h-9 rounded-lg border border-border bg-background pr-7 pl-7 text-xs outline-none focus:border-brand"
              />
              {selectedCustomerId && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCustomerId(null);
                    setCustomerName("");
                    setCustomerPhone("");
                  }}
                  className="absolute left-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-muted"
                  aria-label="مسح العميل"
                >
                  <X className="size-3.5 text-muted-foreground" />
                </button>
              )}
              {showCustomerList && customerName.trim().length > 0 && customerMatches.length > 0 && !selectedCustomerId && (
                <ul className="absolute z-20 top-full mt-1 right-0 left-0 max-h-56 overflow-auto rounded-lg border border-border bg-popover shadow-lg text-xs">
                  {customerMatches.slice(0, 8).map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setSelectedCustomerId(c.id);
                          setCustomerName(c.name);
                          setCustomerPhone(c.phone ?? "");
                          setShowCustomerList(false);
                        }}
                        className="w-full text-right px-3 py-2 hover:bg-muted flex items-center justify-between gap-2"
                      >
                        <span className="font-medium truncate">{c.name}</span>
                        {c.phone && <span className="text-muted-foreground nums text-[11px]" dir="ltr">{c.phone}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <input
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              placeholder="الهاتف"
              dir="ltr"
              className="col-span-2 sm:col-span-1 h-9 rounded-lg border border-border bg-background px-2 text-xs outline-none focus:border-brand text-left"
            />
            {selectedCustomerId && (
              <div className="col-span-2 text-[11px] text-brand flex items-center gap-1">
                <CheckCircle2 className="size-3" /> عميل محفوظ — سيُربط بالفاتورة
              </div>
            )}
            {!selectedCustomerId && customerName.trim().length > 0 && (
              <div className="col-span-2 text-[11px] text-muted-foreground">
                عميل جديد — سيُحفظ تلقائياً عند إتمام البيع
              </div>
            )}
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
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => updateQty(i.productId, -1)}
                        aria-label="إنقاص"
                        className="size-9 grid place-items-center rounded-lg border border-border hover:bg-muted active:scale-95 transition"
                      >
                        <Minus className="size-4" />
                      </button>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        value={i.quantity}
                        onChange={(e) => setItemQty(i.productId, Number(e.target.value) || 0)}
                        className="w-14 h-9 text-center text-sm font-bold nums border border-border rounded-lg bg-background outline-none focus:border-brand"
                      />
                      <button
                        onClick={() => updateQty(i.productId, +1)}
                        disabled={i.quantity >= i.maxQty}
                        aria-label="زيادة"
                        className="size-9 grid place-items-center rounded-lg border border-border hover:bg-muted active:scale-95 transition disabled:opacity-40"
                      >
                        <Plus className="size-4" />
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
            {paymentType === "bank" && (
              <div>
                <label className="block text-[11px] text-muted-foreground mb-1">
                  رقم العملية / التحويل البنكي <span className="text-[10px]">(اختياري — يُعرض في التقارير للحساب البنكي)</span>
                </label>
                <input
                  value={referenceNumber}
                  onChange={(e) => setReferenceNumber(e.target.value)}
                  placeholder="مثال: TRX-123456789"
                  className="w-full h-8 rounded border border-border bg-background px-2 text-xs nums"
                />
              </div>
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
