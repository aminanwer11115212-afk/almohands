import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { PermissionGate } from "@/components/PermissionGate";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Search, Plus, ArrowUpDown, Loader2, Printer, Pencil, Save, X,
  AlertTriangle, Package, DollarSign, Boxes, Trash2, Keyboard,
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

const PAGE_SIZES = [50, 100, 200, 300, 500] as const;

const searchSchema = z.object({
  q: fallback(z.string(), "").default(""),
  sort: fallback(z.enum(["name", "quantity", "sale_price"]), "name").default("name"),
  asc: fallback(z.boolean(), true).default(true),
  low: fallback(z.boolean(), false).default(false),
  category: fallback(z.string(), "").default(""),
  page: fallback(z.number().int(), 1).default(1),
  pageSize: fallback(z.number().int(), 50).default(50),
  filter: fallback(z.string(), "").default(""),
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
  const { q, sort, asc, low, category, page, pageSize, filter } = Route.useSearch();
  const navigate = useNavigate({ from: "/products/" });
  const queryClient = useQueryClient();
  const canWrite = useCan("products.write");
  const effectiveLow = low || filter === "low-stock";
  const { data: rows = [], isLoading, isError, error } = useProducts({ q, sort, asc });
  const { data: store } = useStoreProfile();

  // Bulk edit state
  const [editMode, setEditMode] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<Product[] | null>(null);
  const savingRef = useRef(false);

  // Selection & keyboard navigation
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [focusedIdx, setFocusedIdx] = useState(0);
  const tableWrapRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel("products-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "products" },
        () => queryClient.invalidateQueries({ queryKey: ["products"] }))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  // Distinct categories from full dataset (before category filter).
  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const p of rows) if (p.category) set.add(p.category);
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ar"));
  }, [rows]);

  const filtered = useMemo(() => {
    return rows.filter((p) => {
      if (low && p.quantity > p.minQuantity) return false;
      if (category && (p.category ?? "") !== category) return false;
      return true;
    });
  }, [rows, low, category]);

  // Pagination — slice filtered.
  const safePageSize = (PAGE_SIZES as readonly number[]).includes(pageSize) ? pageSize : 50;
  const totalPages = Math.max(1, Math.ceil(filtered.length / safePageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const pageStart = (safePage - 1) * safePageSize;
  const pageRows = useMemo(
    () => filtered.slice(pageStart, pageStart + safePageSize),
    [filtered, pageStart, safePageSize],
  );

  // Snap page back into range when filters shrink the result set.
  useEffect(() => {
    if (safePage !== page) {
      navigate({ search: (prev: ProductsSearch) => ({ ...prev, page: safePage }), replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalPages]);

  // Clamp focused index to the current page (preserve selection).
  useEffect(() => {
    setFocusedIdx((i) => Math.min(Math.max(0, i), Math.max(0, pageRows.length - 1)));
  }, [pageRows]);


  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function toggleSelectAll() {
    setSelected((prev) => {
      const visIds = pageRows.map((p) => p.id);
      const allChecked = visIds.length > 0 && visIds.every((id) => prev.has(id));
      const next = new Set(prev);
      if (allChecked) visIds.forEach((id) => next.delete(id));
      else visIds.forEach((id) => next.add(id));
      return next;
    });
  }
  function scrollRowIntoView(id: string) {
    rowRefs.current[id]?.scrollIntoView({ block: "nearest" });
  }
  function handleTableKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (editMode) return;
    const target = e.target as HTMLElement;
    if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
    if (!pageRows.length) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = Math.min(pageRows.length - 1, focusedIdx + 1);
      setFocusedIdx(next);
      scrollRowIntoView(pageRows[next].id);
      if (e.shiftKey) toggleSelect(pageRows[next].id);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const next = Math.max(0, focusedIdx - 1);
      setFocusedIdx(next);
      scrollRowIntoView(pageRows[next].id);
      if (e.shiftKey) toggleSelect(pageRows[next].id);
    } else if (e.key === "Home") {
      e.preventDefault(); setFocusedIdx(0); scrollRowIntoView(pageRows[0].id);
    } else if (e.key === "End") {
      e.preventDefault();
      const last = pageRows.length - 1;
      setFocusedIdx(last); scrollRowIntoView(pageRows[last].id);
    } else if (e.key === "PageDown") {
      e.preventDefault();
      if (safePage < totalPages) setSearch({ page: safePage + 1 });
    } else if (e.key === "PageUp") {
      e.preventDefault();
      if (safePage > 1) setSearch({ page: safePage - 1 });
    } else if (e.key === " ") {
      e.preventDefault();
      toggleSelect(pageRows[focusedIdx].id);
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
      e.preventDefault();
      toggleSelectAll();
    } else if (e.key === "Escape") {
      if (selected.size) { e.preventDefault(); setSelected(new Set()); }
    } else if (e.key === "Delete" || e.key === "Backspace") {
      if (!canWrite) return;
      e.preventDefault();
      const targets = selected.size
        ? rows.filter((p) => selected.has(p.id))
        : [pageRows[focusedIdx]];
      if (targets.length) setDeleting(targets);


    } else if (e.key === "Enter") {
      const p = filtered[focusedIdx];
      if (p) navigate({ to: "/products/$productId", params: { productId: p.id } });
    }
  }

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
    for (const p of pageRows) {
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
      for (const p of pageRows) {
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
        <select
          value={category}
          onChange={(e) => setSearch({ category: e.target.value, page: 1 })}
          aria-label="فلترة حسب النوع"
          data-testid="category-filter"
          className="h-11 px-3 rounded-xl border border-border bg-card text-sm outline-none focus:border-brand min-w-[140px]"
        >
          <option value="">كل الأنواع ({formatNumber(categories.length)})</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select
          value={safePageSize}
          onChange={(e) => setSearch({ pageSize: Number(e.target.value), page: 1 })}
          aria-label="عدد المنتجات في الصفحة"
          data-testid="page-size"
          className="h-11 px-3 rounded-xl border border-border bg-card text-sm outline-none focus:border-brand"
        >
          {PAGE_SIZES.map((n) => <option key={n} value={n}>{n} / صفحة</option>)}
        </select>
        <button type="button" onClick={() => setSearch({ low: !low, page: 1 })}
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

      {/* Keyboard hint + bulk actions */}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1"><Keyboard className="size-3.5" /> أسهم ↑/↓ للتنقل، Space للتحديد، Ctrl+A للكل، Delete للحذف، Enter للفتح</span>
        {selected.size > 0 && (
          <span className="ms-auto flex items-center gap-2">
            <span className="font-bold text-foreground">{formatNumber(selected.size)} محدد</span>
            <button type="button" onClick={() => setSelected(new Set())}
              className="h-7 px-2 rounded-md border border-border bg-card hover:bg-muted">مسح التحديد</button>
            {canWrite && (
              <button type="button"
                onClick={() => setDeleting(rows.filter((p) => selected.has(p.id)))}
                className="h-7 px-2 rounded-md bg-destructive text-destructive-foreground font-bold inline-flex items-center gap-1"
                data-testid="bulk-delete">
                <Trash2 className="size-3.5" /> حذف المحدد ({formatNumber(selected.size)})
              </button>
            )}
          </span>
        )}
      </div>

      {/* Table */}
      <div
        ref={tableWrapRef}
        tabIndex={0}
        onKeyDown={handleTableKeyDown}
        className="mt-2 rounded-2xl overflow-hidden border border-border bg-card shadow-card outline-none focus:ring-2 focus:ring-brand/40"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead className="bg-muted text-muted-foreground text-xs">
              <tr>
                <th className="w-10 px-2 py-2">
                  {(() => {
                    const visSelected = pageRows.filter((p) => selected.has(p.id)).length;
                    const allChecked = pageRows.length > 0 && visSelected === pageRows.length;
                    return (
                      <input
                        type="checkbox"
                        aria-label="تحديد الكل"
                        checked={allChecked}
                        ref={(el) => { if (el) el.indeterminate = visSelected > 0 && !allChecked; }}
                        onChange={toggleSelectAll}
                      />
                    );
                  })()}
                </th>
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
                Array.from({ length: Math.min(safePageSize, 10) }).map((_, i) => (
                  <tr key={`sk-${i}`} data-testid="skeleton-row" className="animate-pulse">
                    <td className="px-2 py-3"><div className="size-4 rounded bg-muted mx-auto" /></td>
                    <td className="px-2 py-3"><div className="h-4 w-40 rounded bg-muted" /></td>
                    <td className="px-2 py-3"><div className="h-4 w-32 rounded bg-muted mx-auto" /></td>
                    <td className="px-2 py-3"><div className="h-4 w-10 rounded bg-muted mx-auto" /></td>
                    <td className="px-2 py-3"><div className="h-4 w-10 rounded bg-muted mx-auto" /></td>
                    <td className="px-2 py-3"><div className="h-4 w-16 rounded bg-muted mx-auto" /></td>
                    <td className="px-2 py-3"><div className="h-4 w-16 rounded bg-muted mx-auto" /></td>
                    <td className="px-2 py-3"><div className="h-4 w-20 rounded bg-muted mx-auto" /></td>
                  </tr>
                ))
              ) : isError ? (
                <tr><td colSpan={8} className="py-10 text-center text-destructive">{(error as Error)?.message || "تعذّر تحميل المنتجات"}</td></tr>
              ) : pageRows.length === 0 ? (
                <tr><td colSpan={8} className="py-12 text-center">
                  {(q || category || low) ? (
                    <div className="flex flex-col items-center gap-3 text-muted-foreground">
                      <Search className="size-8 opacity-40" />
                      <div className="font-bold text-foreground">لا توجد منتجات مطابقة للفلاتر</div>
                      <div className="text-xs">
                        {q && <span className="mx-1">البحث: «{q}»</span>}
                        {category && <span className="mx-1">النوع: «{category}»</span>}
                        {low && <span className="mx-1">منخفض المخزون فقط</span>}
                      </div>
                      <button type="button"
                        onClick={() => setSearch({ q: "", category: "", low: false, page: 1 })}
                        className="h-8 px-3 rounded-md border border-border bg-card hover:bg-muted text-xs font-bold">
                        <X className="inline size-3.5 ml-1" /> مسح جميع الفلاتر
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-3 text-muted-foreground">
                      <Package className="size-8 opacity-40" />
                      <div className="font-bold text-foreground">لا توجد منتجات بعد</div>
                      {canWrite && <Link to="/products/new" className="h-8 px-3 rounded-md bg-brand text-brand-foreground text-xs font-bold inline-flex items-center gap-1">
                        <Plus className="size-3.5" /> إضافة أول منتج
                      </Link>}
                    </div>
                  )}
                </td></tr>
              ) : pageRows.map((p, idx) => {
                const isLow = p.quantity <= p.minQuantity;
                const isSelected = selected.has(p.id);
                const isFocused = idx === focusedIdx;
                const d = drafts[p.id];
                const rowClass = [
                  isSelected ? "bg-brand/10" : isLow ? "bg-destructive/5" : "hover:bg-muted/40",
                  isFocused ? "ring-2 ring-inset ring-brand" : "",
                ].join(" ");
                return (
                  <tr
                    key={p.id}
                    ref={(el) => { rowRefs.current[p.id] = el; }}
                    className={rowClass}
                    onClick={() => setFocusedIdx(idx)}
                  >
                    <td className="px-2 py-2 text-center">
                      <input
                        type="checkbox"
                        aria-label={`تحديد ${p.name}`}
                        checked={isSelected}
                        onChange={() => toggleSelect(p.id)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </td>
                    <td className="px-3 py-2 text-right font-semibold">
                      <div className="flex items-center gap-2">
                        <Link to="/products/$productId" params={{ productId: p.id }} className="hover:text-brand flex-1 min-w-0 truncate">
                          {p.name}
                        </Link>
                        {isLow && <span className="text-[10px] text-destructive shrink-0">● منخفض</span>}
                        {canWrite && !editMode && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setDeleting([p]); }}
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
                  <td></td>
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

      {/* Pagination */}
      {filtered.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs" data-testid="pagination">
          <span className="text-muted-foreground">
            عرض <span className="font-bold text-foreground nums">{formatNumber(pageStart + 1)}</span>
            {" - "}
            <span className="font-bold text-foreground nums">{formatNumber(Math.min(pageStart + safePageSize, filtered.length))}</span>
            {" من "}
            <span className="font-bold text-foreground nums">{formatNumber(filtered.length)}</span>
            {" منتج"}
          </span>
          <div className="flex items-center gap-1">
            <button type="button" disabled={safePage <= 1}
              onClick={() => setSearch({ page: 1 })}
              className="h-8 px-2 rounded-md border border-border bg-card disabled:opacity-40">« الأولى</button>
            <button type="button" disabled={safePage <= 1}
              onClick={() => setSearch({ page: safePage - 1 })}
              data-testid="prev-page"
              className="h-8 px-2 rounded-md border border-border bg-card disabled:opacity-40">‹ السابق</button>
            <span className="px-3 nums font-bold">
              {formatNumber(safePage)} / {formatNumber(totalPages)}
            </span>
            <button type="button" disabled={safePage >= totalPages}
              onClick={() => setSearch({ page: safePage + 1 })}
              data-testid="next-page"
              className="h-8 px-2 rounded-md border border-border bg-card disabled:opacity-40">التالي ›</button>
            <button type="button" disabled={safePage >= totalPages}
              onClick={() => setSearch({ page: totalPages })}
              className="h-8 px-2 rounded-md border border-border bg-card disabled:opacity-40">الأخيرة »</button>
          </div>
        </div>
      )}


      {canWrite && !editMode && (
        <Link to="/products/new"
          className="fixed bottom-6 left-6 grid place-items-center size-14 rounded-full bg-brand text-brand-foreground shadow-fab hover:scale-105 transition"
          aria-label="إضافة منتج">
          <Plus className="size-7" />
        </Link>
      )}
      {deleting && deleting.length > 0 && (
        <DeleteProductModal products={deleting} onClose={() => setDeleting(null)} onDone={() => setSelected(new Set())} />
      )}
    </AppShell>
  );
}

function DeleteProductModal({ products, onClose, onDone }: { products: Product[]; onClose: () => void; onDone?: () => void }) {
  const del = useDeleteProduct();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const isBulk = products.length > 1;
  const withStock = products.filter((p) => p.quantity > 0);

  async function handleDelete() {
    setBusy(true);
    try {
      const ids = products.map((p) => p.id);
      // Snapshot raw rows for potential Undo before deletion.
      const { data: snapshot } = await supabase.from("products").select("*").in("id", ids);
      const rawRows = snapshot ?? [];

      let ok = 0; const failed: string[] = [];
      for (const p of products) {
        try { await del.mutateAsync(p); ok++; }
        catch (e) { failed.push(p.name); console.error(e); }
      }

      if (ok) {
        toast.success(
          isBulk ? `تم حذف ${ok} منتج` : "تم حذف المنتج",
          {
            duration: 8000,
            action: rawRows.length > 0 ? {
              label: "تراجع",
              onClick: async () => {
                try {
                  const { error } = await supabase.from("products").insert(rawRows as never);
                  if (error) throw error;
                  qc.invalidateQueries({ queryKey: ["products"] });
                  toast.success(isBulk ? `تم استرجاع ${rawRows.length} منتج` : "تم استرجاع المنتج");
                } catch (e) {
                  handleError(e, "تعذّر الاسترجاع");
                }
              },
            } : undefined,
          },
        );
      }
      if (failed.length) toast.error(`تعذّر حذف: ${failed.slice(0, 3).join("، ")}${failed.length > 3 ? "…" : ""}`);
      onDone?.();
      onClose();
    } catch (err) {
      handleError(err, "تعذّر حذف المنتج");
    } finally {
      setBusy(false);
    }
  }
  const pending = busy || del.isPending;
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose} data-testid="delete-modal">
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md bg-card rounded-2xl p-5 shadow-xl space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-destructive">
            {isBulk ? `تأكيد حذف ${formatNumber(products.length)} منتج` : "تأكيد حذف منتج"}
          </h2>
          <button type="button" onClick={onClose} className="p-1"><X className="size-5" /></button>
        </div>
        {isBulk ? (
          <div className="text-sm space-y-1">
            <p>هل أنت متأكد من حذف <span className="font-bold text-destructive">{formatNumber(products.length)}</span> منتج؟</p>
            <ul className="max-h-40 overflow-auto rounded-md border border-border bg-muted/40 text-xs p-2 space-y-0.5">
              {products.slice(0, 20).map((p) => <li key={p.id}>• {p.name}</li>)}
              {products.length > 20 && <li className="text-muted-foreground">… و{formatNumber(products.length - 20)} أخرى</li>}
            </ul>
          </div>
        ) : (
          <p className="text-sm">هل أنت متأكد من حذف <span className="font-bold">{products[0].name}</span>؟</p>
        )}
        {withStock.length > 0 && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs p-2">
            ⚠️ {isBulk ? `${withStock.length} منتج يحتوي على رصيد بالمخزون` : `يوجد رصيد بالمخزون: ${formatNumber(products[0].quantity)}`}.
          </div>
        )}
        <div className="rounded-lg bg-sky-50 border border-sky-200 text-sky-900 text-[11px] p-2">
          سيُسجَّل الحذف في سجل التدقيق. يمكنك التراجع خلال 8 ثوانٍ من ظهور الإشعار.
        </div>
        <div className="flex gap-2 pt-2">
          <button onClick={onClose} className="flex-1 h-11 rounded-xl border border-border bg-background text-sm font-bold" data-testid="cancel-delete">إلغاء</button>
          <button onClick={handleDelete} disabled={pending} data-testid="confirm-delete"
            className="flex-1 h-11 rounded-xl bg-destructive text-destructive-foreground font-bold flex items-center justify-center gap-2 disabled:opacity-60">
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
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

