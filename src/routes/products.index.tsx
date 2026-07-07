import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Search, Plus, ArrowUpDown, Loader2, Printer, Pencil, Save, X,
  AlertTriangle, Package, DollarSign, Boxes,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { formatNumber, formatSDG } from "@/lib/format";
import { useProducts, type SortKey } from "@/hooks/use-products";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { useCan } from "@/hooks/use-permissions";
import { useStoreProfile } from "@/hooks/use-store-profile";
import { handleError } from "@/lib/errors";
import logo from "@/assets/logo.png";
import type { Product } from "@/types/product";

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
  component: ProductsPage,
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
            placeholder="ابحث بالاسم أو الباركود أو الصنف"
            className="w-full h-11 rounded-xl border border-border bg-card pr-9 pl-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
          />
        </div>
        <button type="button" onClick={() => setSearch({ low: !low })}
          className={`h-11 px-3 rounded-xl border text-sm font-bold transition ${
            low ? "border-warn bg-warn/10 text-warn" : "border-border bg-card text-muted-foreground"
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
                <Th className="text-center">الباركود</Th>
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
                  <tr key={p.id} className={isLow ? "bg-warn/5" : "hover:bg-muted/40"}>
                    <td className="px-3 py-2 text-right font-semibold">
                      <Link to="/products/$productId" params={{ productId: p.id }} className="hover:text-brand">
                        {p.name}
                      </Link>
                      {isLow && <span className="mr-2 text-[10px] text-warn">● منخفض</span>}
                    </td>
                    <td className="px-2 py-2 text-center text-muted-foreground nums text-xs">{p.barcode || "—"}</td>
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
    </AppShell>
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
    <div className={`rounded-xl border p-3 ${tone === "warn" ? "border-warn/40 bg-warn/5" : "border-border bg-card"}`}>
      <div className="flex items-center gap-1 text-xs text-muted-foreground">{icon} {label}</div>
      <div className={`mt-1 text-base font-extrabold nums ${tone === "warn" ? "text-warn" : "text-foreground"}`}>{value}</div>
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
  const { rows, totals, storeName, logoUrl } = opts;
  const today = new Intl.DateTimeFormat("ar-EG-u-nu-latn", {
    year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(new Date());

  const rowsHtml = rows.map((p, i) => `
    <tr>
      <td class="c">${i + 1}</td>
      <td class="r">${escapeHtml(p.name)}</td>
      <td class="c mono">${escapeHtml(p.barcode || "—")}</td>
      <td class="c">${fmt(p.quantity)}</td>
      <td class="c">${fmt(p.costPrice)}</td>
      <td class="c">${fmt(p.salePrice)}</td>
      <td class="c strong">${fmt(p.quantity * p.costPrice)}</td>
    </tr>`).join("");

  const html = `<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"/>
<title>جرد المخزون — ${escapeHtml(storeName)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; font-family: 'Cairo', sans-serif; color: #0c2340; background: #fff; font-weight: 600; }
  @page { size: A4; margin: 10mm; }
  .sheet { padding: 6mm 8mm; }
  .header { display: flex; align-items: center; justify-content: space-between; gap: 12px; border-bottom: 3px double #0c2340; padding-bottom: 8px; margin-bottom: 10px; }
  .header img { height: 64px; width: 64px; object-fit: contain; }
  .header .title { text-align: center; flex: 1; }
  .header h1 { margin: 0; font-size: 22px; font-weight: 800; letter-spacing: .5px; }
  .header .sub { font-size: 12px; color: #465569; margin-top: 2px; }
  .meta { display: flex; justify-content: space-between; font-size: 11px; color: #465569; margin-bottom: 8px; }
  table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
  thead th { background: #0c2340; color: #fff; padding: 6px 4px; font-weight: 700; border: 1px solid #0c2340; }
  tbody td { padding: 5px 4px; border: 1px solid #d5dbe4; }
  tbody tr:nth-child(even) td { background: #f6f8fb; }
  .c { text-align: center; } .r { text-align: right; } .strong { font-weight: 800; }
  .mono { font-family: 'Courier New', monospace; font-size: 10.5px; }
  tfoot td { background: #eef2f7; font-weight: 800; padding: 7px 4px; border: 1px solid #0c2340; text-align: center; }
  .summary { margin-top: 10px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
  .summary .card { border: 1px solid #d5dbe4; border-radius: 6px; padding: 6px 8px; }
  .summary .lbl { font-size: 10px; color: #465569; }
  .summary .val { font-size: 13px; font-weight: 800; margin-top: 2px; }
  .footer { margin-top: 12px; text-align: center; font-size: 10px; color: #465569; border-top: 1px solid #d5dbe4; padding-top: 6px; }
  @media print { .noprint { display: none !important; } }
  .noprint { position: fixed; top: 8px; left: 8px; z-index: 10; }
  .noprint button { padding: 8px 14px; border: 0; background: #0c2340; color: #fff; border-radius: 6px; font-family: inherit; font-weight: 700; cursor: pointer; }
</style></head>
<body>
  <div class="noprint"><button onclick="window.print()">طباعة</button></div>
  <div class="sheet">
    <div class="header">
      <img src="${logoUrl}" alt="المهندس"/>
      <div class="title">
        <h1>${escapeHtml(storeName)}</h1>
        <div class="sub">تقرير جرد المخزون الشامل</div>
      </div>
      <img src="${logoUrl}" alt="المهندس"/>
    </div>
    <div class="meta"><span>تاريخ الطباعة: ${today}</span><span>عدد الأصناف: ${fmt(rows.length)}</span></div>
    <table>
      <thead><tr>
        <th style="width:34px">#</th><th>المنتج</th><th style="width:110px">الباركود</th>
        <th style="width:60px">الكمية</th><th style="width:80px">سعر الشراء</th>
        <th style="width:80px">سعر البيع</th><th style="width:96px">قيمة التكلفة</th>
      </tr></thead>
      <tbody>${rowsHtml}</tbody>
      <tfoot><tr>
        <td colspan="3">الإجماليات</td>
        <td>${fmt(totals.qty)}</td><td>—</td><td>—</td>
        <td>${fmt(totals.cost)}</td>
      </tr></tfoot>
    </table>
    <div class="summary">
      <div class="card"><div class="lbl">عدد الأصناف</div><div class="val">${fmt(totals.count)}</div></div>
      <div class="card"><div class="lbl">إجمالي الكمية</div><div class="val">${fmt(totals.qty)}</div></div>
      <div class="card"><div class="lbl">قيمة المخزون (تكلفة)</div><div class="val">${fmt(totals.cost)}</div></div>
      <div class="card"><div class="lbl">قيمة المخزون (بيع)</div><div class="val">${fmt(totals.sale)}</div></div>
    </div>
    <div class="footer">© ${new Date().getFullYear()} ${escapeHtml(storeName)} — نظام المهندس لإدارة قطع غيار السيارات</div>
  </div>
  <script>window.addEventListener('load',()=>setTimeout(()=>window.print(),400));</script>
</body></html>`;

  const w = window.open("", "_blank", "width=900,height=700");
  if (!w) { toast.error("فعّل النوافذ المنبثقة للطباعة"); return; }
  w.document.open(); w.document.write(html); w.document.close();
}

function fmt(n: number) { return new Intl.NumberFormat("en-US").format(Math.round(n * 100) / 100); }
function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
