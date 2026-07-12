import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { PermissionGate } from "@/components/PermissionGate";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Search, Plus, ArrowUpDown, Loader2, Printer, Pencil, Save, X,
  AlertTriangle, Package, DollarSign, Boxes, Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { formatNumber, formatSDG } from "@/lib/format";
import { useProducts, useDeleteProduct, type SortKey } from "@/hooks/use-products";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { useCan } from "@/hooks/use-permissions";
import { useStoreProfile } from "@/hooks/use-store-profile";
import { handleError } from "@/lib/errors";
import logo from "@/assets/logo.png";
import type { Product } from "@/types/product";
import { buildInventoryReportHtml } from "@/lib/inventory-print";

const searchSchema = z.object({
  q: fallback(z.string(), "").default(""),
  sort: fallback(z.enum(["name", "quantity", "sale_price"]), "name").default("name"),
  asc: fallback(z.boolean(), true).default(true),
  low: fallback(z.boolean(), false).default(false),
});

type ProductsSearch = z.infer<typeof searchSchema>;

export const Route = createFileRoute("/products/")({
  validateSearch: zodValidator(searchSchema),
  head: () => ({ meta: [{ title: "مخزن المنتجات — المهندس" }] }),
  component: () => (<PermissionGate perm="products.view"><ProductsPage /></PermissionGate>),
});

type Draft = {
  quantity: string;
  cost_price: string;
  sale_price: string;
  min_quantity: string;
};

function ProductsPage() {
  const { q, sort, asc, low } = Route.useSearch();
  const navigate = useNavigate({ from: "/products/" });
  const queryClient = useQueryClient();
  const canWrite = useCan("products.write");
  const { data: rows = [], isLoading, isError, error } = useProducts({ q, sort, asc });
  const { data: store } = useStoreProfile();

  // Bulk edit state
  const [editMode, setEditMode] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<Product | null>(null);
  const savingRef = useRef(false);

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel("products-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "products" },
        () => queryClient.invalidateQueries({ queryKey: ["products"] }))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  const filtered = useMemo(
    () => (low ? rows.filter((p) => p.quantity <= p.minQuantity) : rows),
    [rows, low],
  );

  const totals = useMemo(() => {
    let qty = 0, cost = 0, sale = 0, lowCount = 0;
    for (const p of rows) {
      qty += p.quantity;
      cost += p.quantity * p.costPrice;
      sale += p.quantity * p.salePrice;
      if (p.quantity <= p.minQuantity) lowCount++;
    }
    return { qty, cost, sale, count: rows.length, lowCount };
  }, [rows]);

  function setSearch(patch: Partial<ProductsSearch>) {
    navigate({ search: (prev: ProductsSearch) => ({ ...prev, ...patch }), replace: true });
  }
  function toggleSort(key: SortKey) {
    setSearch({ sort: key, asc: sort === key ? !asc : true });
  }

  function beginEdit() {
    const d: Record<string, Draft> = {};
    for (const p of filtered) {
      d[p.id] = {
        quantity: String(p.quantity),
        cost_price: String(p.costPrice),
        sale_price: String(p.salePrice),
        min_quantity: String(p.minQuantity),
      };
    }
    setDrafts(d);
    setEditMode(true);
  }
  function cancelEdit() {
    setDrafts({});
    setEditMode(false);
  }
  function updateDraft(id: string, field: keyof Draft, value: string) {
    setDrafts((s) => ({ ...s, [id]: { ...s[id], [field]: value } }));
  }

  const saveAll = useMutation({
    mutationFn: async () => {
      const updates: { id: string; patch: Record<string, number> }[] = [];
      for (const p of filtered) {
        const d = drafts[p.id]; if (!d) continue;
        const nq = Number(d.quantity), nc = Number(d.cost_price),
              ns = Number(d.sale_price), nm = Number(d.min_quantity);
        if (![nq, nc, ns, nm].every((n) => Number.isFinite(n) && n >= 0)) {
          throw new Error(`قيمة غير صالحة في المنتج: ${p.name}`);
        }
        const patch: Record<string, number> = {};
        if (nq !== p.quantity) patch.quantity = nq;
        if (nc !== p.costPrice) patch.cost_price = nc;
        if (ns !== p.salePrice) patch.sale_price = ns;
        if (nm !== p.minQuantity) patch.min_quantity = nm;
        if (Object.keys(patch).length) updates.push({ id: p.id, patch });
      }
      if (!updates.length) return 0;
      for (const u of updates) {
        const { error } = await supabase.from("products").update(u.patch as never).eq("id", u.id);
        if (error) throw error;
      }
      return updates.length;
    },
    onSuccess: (n) => {
      toast.success(n ? `تم حفظ ${n} منتج` : "لا توجد تغييرات");
      queryClient.invalidateQueries({ queryKey: ["products"] });
      cancelEdit();
    },
    onError: (e) => handleError(e, "فشل حفظ التعديلات"),
  });

  async function handleSaveAll() {
    if (savingRef.current) return;
    savingRef.current = true; setSaving(true);
    try { await saveAll.mutateAsync(); }
    finally { savingRef.current = false; setSaving(false); }
  }

  function handlePrint() {
    if (!rows.length) { toast.error("لا توجد منتجات للطباعة"); return; }
    openPrintWindow({
      rows: filtered.length ? filtered : rows,
      totals,
      storeName: store?.name || "المهندس",
      logoUrl: logo,
    });
  }

  return (
    <AppShell title="مخزن المنتجات" showBack>
      {/* Stats */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
        <StatCard icon={<Package className="size-4" />} label="عدد الأصناف" value={formatNumber(totals.count)} />
        <StatCard icon={<Boxes className="size-4" />} label="إجمالي الكمية" value={formatNumber(totals.qty)} />
        <StatCard icon={<DollarSign className="size-4" />} label="قيمة المخزون (تكلفة)" value={formatSDG(totals.cost)} />
        <StatCard icon={<AlertTriangle className="size-4" />} label="أصناف منخفضة"
          value={formatNumber(totals.lowCount)}
          tone={totals.lowCount > 0 ? "warn" : "default"} />
      </section>

      {/* Toolbar */}
      <div className="flex flex-wrap items-stretch gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            type="text"
            value={q}
            onChange={(e) => setSearch({ q: e.target.value })}
            placeholder="ابحث بالاسم/الباركود/الصنف/رقم القطعة/الرف"
            className="w-full h-11 rounded-xl border border-border bg-card pr-9 pl-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
          />
        </div>
        <button type="button" onClick={() => setSearch({ low: !low })}
          className={`h-11 px-3 rounded-xl border text-sm font-bold transition ${
            low ? "border-destructive bg-destructive/10 text-destructive" : "border-border bg-card text-muted-foreground"
          }`}>
          <AlertTriangle className="inline size-4 ml-1" /> منخفض المخزون
        </button>
        <button type="button" onClick={handlePrint}
          className="h-11 px-3 rounded-xl border border-border bg-card text-sm font-bold hover:bg-muted">
          <Printer className="inline size-4 ml-1" /> طباعة الجرد
        </button>
        {canWrite && !editMode && (
          <button type="button" onClick={beginEdit}
            className="h-11 px-3 rounded-xl border border-brand text-brand text-sm font-bold hover:bg-brand/10">
            <Pencil className="inline size-4 ml-1" /> تعديل جماعي
          </button>
        )}
        {editMode && (
          <>
            <button type="button" onClick={handleSaveAll} disabled={saving}
              className="h-11 px-3 rounded-xl bg-brand text-brand-foreground text-sm font-bold disabled:opacity-60">
              {saving ? <Loader2 className="inline size-4 ml-1 animate-spin" /> : <Save className="inline size-4 ml-1" />}
              حفظ الكل
            </button>
            <button type="button" onClick={cancelEdit} disabled={saving}
              className="h-11 px-3 rounded-xl border border-border bg-card text-sm">
              <X className="inline size-4 ml-1" /> إلغاء
            </button>
          </>
        )}
      </div>

      {/* Table */}
      <div className="mt-3 rounded-2xl overflow-hidden border border-border bg-card shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead className="bg-muted text-muted-foreground text-xs">
              <tr>
                <Th onClick={() => toggleSort("name")} active={sort === "name"} asc={asc} className="text-right min-w-[180px]">المنتج</Th>
                <Th className="text-center">الباركود / رقم القطعة / الرف</Th>
                <Th onClick={() => toggleSort("quantity")} active={sort === "quantity"} asc={asc} className="text-center w-24">الكمية</Th>
                <Th className="text-center w-24">حد أدنى</Th>
                <Th className="text-center w-28">سعر الشراء</Th>
                <Th onClick={() => toggleSort("sale_price")} active={sort === "sale_price"} asc={asc} className="text-center w-28">سعر البيع</Th>
                <Th className="text-center w-28">قيمة المخزون</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr><td colSpan={7} className="py-10 text-center"><Loader2 className="inline size-5 animate-spin" /></td></tr>
              ) : isError ? (
                <tr><td colSpan={7} className="py-10 text-center text-destructive">{(error as Error)?.message || "تعذّر تحميل المنتجات"}</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="py-10 text-center text-muted-foreground">
                  {q ? "لا توجد منتجات مطابقة" : low ? "لا توجد أصناف منخفضة" : "لا توجد منتجات بعد — اضغط + لإضافة منتج"}
                </td></tr>
              ) : filtered.map((p) => {
                const isLow = p.quantity <= p.minQuantity;
                const d = drafts[p.id];
                return (
                  <tr key={p.id} className={isLow ? "bg-destructive/5" : "hover:bg-muted/40"}>
                    <td className="px-3 py-2 text-right font-semibold">
                      <div className="flex items-center gap-2">
                        <Link to="/products/$productId" params={{ productId: p.id }} className="hover:text-brand flex-1 min-w-0 truncate">
                          {p.name}
                        </Link>
                        {isLow && <span className="text-[10px] text-destructive shrink-0">● منخفض</span>}
                        {canWrite && !editMode && (
                          <button
                            type="button"
                            onClick={() => setDeleting(p)}
                            className="shrink-0 grid place-items-center size-7 rounded-md text-muted-foreground hover:bg-destructive hover:text-destructive-foreground"
                            aria-label="حذف المنتج" title="حذف المنتج"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-2 text-center text-muted-foreground nums text-xs" dir="ltr">
                      <div>{p.barcode || "—"}</div>
                      {p.partNumber && <div className="text-[10px] opacity-80">#{p.partNumber}</div>}
                      {p.location && <div className="text-[10px] opacity-70">📍{p.location}</div>}
                    </td>
                    <td className="px-2 py-2 text-center nums">
                      {editMode && d ? <EditCell value={d.quantity} onChange={(v) => updateDraft(p.id, "quantity", v)} /> : formatNumber(p.quantity)}
                    </td>
                    <td className="px-2 py-2 text-center nums text-muted-foreground">
                      {editMode && d ? <EditCell value={d.min_quantity} onChange={(v) => updateDraft(p.id, "min_quantity", v)} /> : formatNumber(p.minQuantity)}
                    </td>
                    <td className="px-2 py-2 text-center nums">
                      {editMode && d ? <EditCell value={d.cost_price} onChange={(v) => updateDraft(p.id, "cost_price", v)} /> : formatNumber(p.costPrice)}
                    </td>
                    <td className="px-2 py-2 text-center nums font-bold">
                      {editMode && d ? <EditCell value={d.sale_price} onChange={(v) => updateDraft(p.id, "sale_price", v)} /> : formatNumber(p.salePrice)}
                    </td>
                    <td className="px-2 py-2 text-center nums text-muted-foreground">
                      {formatNumber(p.quantity * p.costPrice)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {filtered.length > 0 && (
              <tfoot className="bg-muted/60 font-bold">
                <tr>
                  <td className="px-3 py-2 text-right">الإجمالي</td>
                  <td></td>
                  <td className="text-center nums">{formatNumber(filtered.reduce((s, p) => s + p.quantity, 0))}</td>
                  <td></td>
                  <td></td>
                  <td></td>
                  <td className="text-center nums">{formatNumber(filtered.reduce((s, p) => s + p.quantity * p.costPrice, 0))}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {canWrite && !editMode && (
        <Link to="/products/new"
          className="fixed bottom-6 left-6 grid place-items-center size-14 rounded-full bg-brand text-brand-foreground shadow-fab hover:scale-105 transition"
          aria-label="إضافة منتج">
          <Plus className="size-7" />
        </Link>
      )}
      {deleting && <DeleteProductModal product={deleting} onClose={() => setDeleting(null)} />}
    </AppShell>
  );
}

function DeleteProductModal({ product, onClose }: { product: Product; onClose: () => void }) {
  const del = useDeleteProduct();
  async function handleDelete() {
    try {
      await del.mutateAsync(product);
      toast.success("تم حذف المنتج");
      onClose();
    } catch (err) {
      handleError(err, "تعذّر حذف المنتج");
    }
  }
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md bg-card rounded-2xl p-5 shadow-xl space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-destructive">حذف منتج</h2>
          <button type="button" onClick={onClose} className="p-1"><X className="size-5" /></button>
        </div>
        <p className="text-sm">
          هل أنت متأكد من حذف <span className="font-bold">{product.name}</span>؟
        </p>
        {product.quantity > 0 && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs p-2">
            ⚠️ يوجد رصيد بالمخزون: {formatNumber(product.quantity)} — لن يمكن استرجاعه.
          </div>
        )}
        <div className="rounded-lg bg-sky-50 border border-sky-200 text-sky-900 text-[11px] p-2">
          سيُسجَّل الحذف في سجل التدقيق (audit_logs).
        </div>
        <div className="flex gap-2 pt-2">
          <button onClick={onClose} className="flex-1 h-11 rounded-xl border border-border bg-background text-sm font-bold">إلغاء</button>
          <button onClick={handleDelete} disabled={del.isPending}
            className="flex-1 h-11 rounded-xl bg-destructive text-destructive-foreground font-bold flex items-center justify-center gap-2 disabled:opacity-60">
            {del.isPending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
            حذف نهائي
          </button>
        </div>
      </div>
    </div>
  );
}

function Th({ children, onClick, active, asc, className = "" }: {
  children: React.ReactNode; onClick?: () => void; active?: boolean; asc?: boolean; className?: string;
}) {
  const inner = (
    <span className="inline-flex items-center gap-1 justify-center">
      {children}
      {onClick && <ArrowUpDown className={`size-3 ${active ? "text-brand" : "opacity-40"} ${active && !asc ? "rotate-180" : ""}`} />}
    </span>
  );
  return (
    <th className={`px-2 py-2 font-bold ${className}`}>
      {onClick ? <button type="button" onClick={onClick} className="w-full">{inner}</button> : inner}
    </th>
  );
}

function EditCell({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="number" min="0" step="any" value={value} onChange={(e) => onChange(e.target.value)}
      className="w-20 h-8 text-center rounded-md border border-border bg-background text-xs nums outline-none focus:border-brand"
    />
  );
}

function StatCard({ icon, label, value, tone = "default" }: {
  icon: React.ReactNode; label: string; value: string; tone?: "default" | "warn";
}) {
  return (
    <div className={`rounded-xl border p-3 ${tone === "warn" ? "border-destructive/40 bg-destructive/5" : "border-border bg-card"}`}>
      <div className="flex items-center gap-1 text-xs text-muted-foreground">{icon} {label}</div>
      <div className={`mt-1 text-base font-extrabold nums ${tone === "warn" ? "text-destructive" : "text-foreground"}`}>{value}</div>
    </div>
  );
}

/* ---------------- Print ---------------- */

import { buildInventoryReportHtml } from "@/lib/inventory-print";

function openPrintWindow(opts: {
  rows: Product[];
  totals: { qty: number; cost: number; sale: number; count: number; lowCount: number };
  storeName: string;
  logoUrl: string;
}) {
  const html = buildInventoryReportHtml({
    rows: opts.rows.map((p) => ({
      name: p.name,
      barcode: p.barcode,
      partNumber: p.partNumber,
      location: p.location,
      quantity: p.quantity,
      costPrice: p.costPrice,
      salePrice: p.salePrice,
    })),
    totals: opts.totals,
    storeName: opts.storeName,
    logoUrl: opts.logoUrl,
  });

  const w = window.open("", "_blank", "width=900,height=700");
  if (!w) { toast.error("فعّل النوافذ المنبثقة للطباعة"); return; }
  w.document.open(); w.document.write(html); w.document.close();
}

