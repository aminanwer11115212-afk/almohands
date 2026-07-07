import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus, Search, Truck, X, Loader2, Trash2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { PermissionGate } from "@/components/PermissionGate";
import { formatSDG } from "@/lib/format";
import { usePurchases, useCreatePurchase, type PurchaseItemInput } from "@/hooks/use-purchases";
import { useSuppliers } from "@/hooks/use-suppliers";
import { useProducts } from "@/hooks/use-products";
import { toast } from "sonner";

export const Route = createFileRoute("/purchases")({
  head: () => ({ meta: [{ title: "المشتريات — المهندس" }] }),
  component: () => (
    <PermissionGate perm="suppliers.write">
      <PurchasesPage />
    </PermissionGate>
  ),
});

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

function PurchasesPage() {
  const [q, setQ] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const { data: purchases = [], isLoading } = usePurchases(q);

  const totals = useMemo(() => {
    return purchases.reduce(
      (a, p) => {
        a.count++;
        a.total += Number(p.total) || 0;
        a.paid += Number(p.paid) || 0;
        a.remaining += Number(p.remaining) || 0;
        return a;
      },
      { count: 0, total: 0, paid: 0, remaining: 0 },
    );
  }, [purchases]);

  return (
    <AppShell title="فواتير المشتريات" showBack>
      <div className="relative mb-3">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="بحث برقم الفاتورة أو اسم المورد"
          className="w-full h-11 rounded-xl border border-border bg-card pr-9 pl-3 text-sm outline-none focus:border-brand"
        />
      </div>

      <div className="grid grid-cols-3 gap-2 mb-3 text-center">
        <SummaryCard label="فواتير" value={String(totals.count)} />
        <SummaryCard label="الإجمالي" value={formatSDG(totals.total)} />
        <SummaryCard label="المتبقي للموردين" value={formatSDG(totals.remaining)} />
      </div>

      {isLoading ? (
        <div className="py-16 grid place-items-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
      ) : purchases.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
          <Truck className="size-8 opacity-50" />
          لا توجد فواتير مشتريات — اضغط + لإضافة
        </div>
      ) : (
        <ul className="space-y-2">
          {purchases.map((p) => (
            <li key={p.id} className="bg-card rounded-xl border border-border p-3 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-brand">#{p.purchase_number}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${statusClasses[p.status] ?? "bg-muted"}`}>
                      {statusLabels[p.status] ?? p.status}
                    </span>
                  </div>
                  <div className="text-sm truncate mt-0.5">{p.supplier_name || "مورد غير محدد"}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {new Date(p.created_at).toLocaleString("ar-EG", { dateStyle: "short", timeStyle: "short" })}
                  </div>
                </div>
                <div className="text-left shrink-0">
                  <div className="text-sm font-bold nums">{formatSDG(Number(p.total))}</div>
                  {Number(p.remaining) > 0 && (
                    <div className="text-[11px] text-rose-600 nums">متبقي {formatSDG(Number(p.remaining))}</div>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <button
        onClick={() => setShowAdd(true)}
        className="fixed bottom-6 left-6 grid place-items-center size-14 rounded-full bg-brand text-brand-foreground shadow-fab hover:scale-105 transition"
        aria-label="فاتورة شراء جديدة"
      >
        <Plus className="size-7" />
      </button>

      {showAdd && <CreatePurchaseModal onClose={() => setShowAdd(false)} />}
    </AppShell>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card rounded-xl border border-border p-2 shadow-sm">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="text-sm font-bold mt-1 truncate nums">{value}</div>
    </div>
  );
}

function CreatePurchaseModal({ onClose }: { onClose: () => void }) {
  const create = useCreatePurchase();
  const { data: suppliers = [] } = useSuppliers("");
  const { data: products = [] } = useProducts({ q: "", sort: "name", asc: true });
  const [supplierId, setSupplierId] = useState<string>("");
  const [supplierName, setSupplierName] = useState("");
  const [paid, setPaid] = useState<number>(0);
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<(PurchaseItemInput & { key: number })[]>([
    { key: Date.now(), product_id: null, product_name: "", quantity: 1, cost_price: 0 },
  ]);

  const total = items.reduce((s, i) => s + Number(i.quantity) * Number(i.cost_price), 0);
  const remaining = Math.max(0, total - Number(paid || 0));

  function updateItem(idx: number, patch: Partial<PurchaseItemInput>) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }
  function addItem() {
    setItems((prev) => [...prev, { key: Date.now(), product_id: null, product_name: "", quantity: 1, cost_price: 0 }]);
  }
  function removeItem(idx: number) {
    setItems((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev));
  }
  function pickProduct(idx: number, pid: string) {
    const p = products.find((x) => x.id === pid);
    if (!p) return;
    updateItem(idx, { product_id: pid, product_name: p.name, cost_price: Number(p.costPrice) || 0 });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const valid = items.filter((i) => i.product_name.trim() && Number(i.quantity) > 0);
    if (valid.length === 0) {
      toast.error("أضف صنفاً واحداً على الأقل");
      return;
    }
    try {
      await create.mutateAsync({
        supplier_id: supplierId || null,
        supplier_name: supplierName || suppliers.find((s) => s.id === supplierId)?.name || undefined,
        paid: Number(paid) || 0,
        notes,
        items: valid.map(({ key: _k, ...rest }) => rest),
      });
      toast.success("تم حفظ فاتورة الشراء");
      onClose();
    } catch (err) {
      toast.error((err as Error).message || "تعذّر الحفظ");
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-2 sm:p-4" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl bg-card rounded-2xl p-4 shadow-xl max-h-[92vh] overflow-y-auto space-y-3"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">فاتورة شراء جديدة</h2>
          <button type="button" onClick={onClose} className="p-1"><X className="size-5" /></button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <select
            value={supplierId}
            onChange={(e) => { setSupplierId(e.target.value); setSupplierName(""); }}
            className="h-11 rounded-xl border border-border bg-background px-3 text-sm"
          >
            <option value="">— اختر مورد —</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <input
            value={supplierName}
            onChange={(e) => setSupplierName(e.target.value)}
            placeholder="أو اكتب اسم المورد يدوياً"
            className="h-11 rounded-xl border border-border bg-background px-3 text-sm"
          />
        </div>

        <div className="space-y-2">
          <div className="text-xs font-bold text-muted-foreground">الأصناف</div>
          {items.map((it, idx) => (
            <div key={it.key} className="grid grid-cols-12 gap-1.5 items-center border border-border rounded-lg p-2">
              <select
                value={it.product_id || ""}
                onChange={(e) => pickProduct(idx, e.target.value)}
                className="col-span-12 sm:col-span-5 h-9 rounded-md border border-border bg-background px-2 text-xs"
              >
                <option value="">— اختر منتج —</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <input
                value={it.product_name}
                onChange={(e) => updateItem(idx, { product_name: e.target.value })}
                placeholder="أو اسم يدوي"
                className="col-span-6 sm:col-span-3 h-9 rounded-md border border-border bg-background px-2 text-xs"
              />
              <input
                type="number"
                min="0"
                step="1"
                value={it.quantity}
                onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) })}
                placeholder="كمية"
                className="col-span-3 sm:col-span-1 h-9 rounded-md border border-border bg-background px-2 text-xs text-center"
              />
              <input
                type="number"
                min="0"
                step="0.01"
                value={it.cost_price}
                onChange={(e) => updateItem(idx, { cost_price: Number(e.target.value) })}
                placeholder="سعر الشراء"
                className="col-span-2 sm:col-span-2 h-9 rounded-md border border-border bg-background px-2 text-xs text-center"
              />
              <button
                type="button"
                onClick={() => removeItem(idx)}
                className="col-span-1 h-9 grid place-items-center text-destructive hover:bg-destructive/10 rounded-md"
                aria-label="حذف"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addItem}
            className="w-full h-9 rounded-lg border border-dashed border-border text-xs text-muted-foreground hover:bg-muted"
          >
            + إضافة صنف
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="bg-muted rounded-lg p-2 text-center">
            <div className="text-[11px] text-muted-foreground">الإجمالي</div>
            <div className="font-bold nums">{formatSDG(total)}</div>
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground">المبلغ المدفوع</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={paid}
              onChange={(e) => setPaid(Number(e.target.value))}
              className="w-full h-10 rounded-lg border border-border bg-background px-2 text-sm text-center nums"
            />
            <div className="text-[11px] text-rose-600 nums text-center mt-1">
              متبقي: {formatSDG(remaining)}
            </div>
          </div>
        </div>

        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="ملاحظات"
          rows={2}
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm resize-none"
        />

        <button
          type="submit"
          disabled={create.isPending}
          className="w-full h-12 rounded-xl bg-brand text-brand-foreground font-bold flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {create.isPending ? <Loader2 className="size-5 animate-spin" /> : "حفظ الفاتورة"}
        </button>
      </form>
    </div>
  );
}
