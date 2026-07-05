import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { formatSDG, formatNumber } from "@/lib/format";
import { toast } from "sonner";
import { Loader2, TrendingUp, TrendingDown, Calculator, AlertTriangle } from "lucide-react";
import { useRequirePermission } from "@/hooks/use-require-permission";

export const Route = createFileRoute("/prices")({
  head: () => ({ meta: [{ title: "تعديل الأسعار — المهندس" }] }),
  component: PricesPage,
});

/** تقريب لأعلى لأقرب 100 (مثال: 1250 → 1300، 1201 → 1300، 1000 → 1000) */
function roundUpToHundred(n: number): number {
  if (!isFinite(n) || n <= 0) return 0;
  return Math.ceil(n / 100) * 100;
}

type MiniProduct = {
  id: string;
  name: string;
  category: string | null;
  sale_price: number;
  cost_price: number;
};

function PricesPage() {
  const { isChecking: __permChk, allowed: __permOk } = useRequirePermission("products.write");
  if (__permChk || !__permOk) return null;
  const qc = useQueryClient();
  const [target, setTarget] = useState<"sale_price" | "cost_price">("sale_price");
  const [dir, setDir] = useState<"inc" | "dec">("inc");
  const [category, setCategory] = useState<string>("__all__");
  const [percentStr, setPercentStr] = useState<string>("");
  const [confirm, setConfirm] = useState(false);

  const percent = Math.max(0, Math.min(500, Number(percentStr) || 0));

  // Load categories + products (scoped to current user by RLS)
  const { data: products = [], isLoading } = useQuery({
    queryKey: ["prices-products"],
    queryFn: async (): Promise<MiniProduct[]> => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, category, sale_price, cost_price")
        .order("name");
      if (error) throw error;
      return (data ?? []) as MiniProduct[];
    },
    staleTime: 30_000,
  });

  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      const c = (p.category ?? "").trim();
      if (c) set.add(c);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ar"));
  }, [products]);

  const affected = useMemo(() => {
    return products.filter((p) =>
      category === "__all__" ? true : (p.category ?? "").trim() === category,
    );
  }, [products, category]);

  const preview = useMemo(() => {
    if (percent <= 0 || affected.length === 0) return null;
    const factor = dir === "inc" ? 1 + percent / 100 : 1 - percent / 100;
    let sumOld = 0;
    let sumNew = 0;
    const rows = affected.map((p) => {
      const oldPrice = Number(p[target]) || 0;
      const raw = oldPrice * factor;
      const newPrice = roundUpToHundred(raw);
      sumOld += oldPrice;
      sumNew += newPrice;
      return { id: p.id, name: p.name, oldPrice, newPrice };
    });
    return { rows, sumOld, sumNew, count: rows.length };
  }, [affected, dir, percent, target]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!preview || preview.count === 0) throw new Error("لا توجد منتجات للتحديث");
      // Batched updates
      const results = await Promise.all(
        preview.rows.map((r) => {
          const patch =
            target === "sale_price"
              ? { sale_price: r.newPrice }
              : { cost_price: r.newPrice };
          return supabase.from("products").update(patch).eq("id", r.id);
        }),
      );
      const failed = results.filter((r) => r.error);
      if (failed.length) throw new Error(`فشل تحديث ${failed.length} منتج`);
      return preview.count;
    },
    onSuccess: (count) => {
      toast.success(`تم تحديث ${formatNumber(count)} منتج بنجاح`);
      qc.invalidateQueries({ queryKey: ["prices-products"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      setConfirm(false);
      setPercentStr("");
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : "تعذّر التحديث");
    },
  });

  const canSubmit = percent > 0 && (preview?.count ?? 0) > 0 && !mutation.isPending;

  return (
    <AppShell title="تعديل الاسعار" showBack>
      <div className="max-w-5xl mx-auto grid gap-4 lg:grid-cols-[380px_1fr]">
        {/* Control panel */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (canSubmit) setConfirm(true);
          }}
          className="rounded-2xl border border-border bg-card shadow-card p-4 space-y-5 h-fit lg:sticky lg:top-4"
        >
          <div className="flex items-center gap-2 text-brand">
            <Calculator className="size-5" />
            <h2 className="font-bold">تحديث جماعي للأسعار</h2>
          </div>

          {/* Target */}
          <div>
            <div className="text-xs font-bold mb-2 text-muted-foreground">السعر المستهدف</div>
            <div className="grid grid-cols-2 gap-2">
              <Pill active={target === "sale_price"} onClick={() => setTarget("sale_price")}>
                سعر البيع
              </Pill>
              <Pill active={target === "cost_price"} onClick={() => setTarget("cost_price")}>
                سعر الشراء
              </Pill>
            </div>
          </div>

          {/* Direction */}
          <div>
            <div className="text-xs font-bold mb-2 text-muted-foreground">نوع التعديل</div>
            <div className="grid grid-cols-2 gap-2">
              <Pill active={dir === "inc"} onClick={() => setDir("inc")} color="emerald">
                <TrendingUp className="size-4" /> زيادة
              </Pill>
              <Pill active={dir === "dec"} onClick={() => setDir("dec")} color="rose">
                <TrendingDown className="size-4" /> نقصان
              </Pill>
            </div>
          </div>

          {/* Category */}
          <div>
            <label className="block text-xs font-bold mb-2 text-muted-foreground">التصنيف</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full h-11 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-brand"
            >
              <option value="__all__">جميع المنتجات ({products.length})</option>
              {categories.map((c) => {
                const n = products.filter((p) => (p.category ?? "").trim() === c).length;
                return (
                  <option key={c} value={c}>
                    {c} ({n})
                  </option>
                );
              })}
            </select>
          </div>

          {/* Percent */}
          <div>
            <label className="block text-xs font-bold mb-2 text-muted-foreground">
              النسبة المئوية
            </label>
            <div className="flex items-stretch gap-2">
              <span className="shrink-0 grid place-items-center w-12 rounded-xl border border-border bg-muted text-brand font-bold">
                %
              </span>
              <input
                type="number"
                value={percentStr}
                onChange={(e) => setPercentStr(e.target.value)}
                placeholder="مثال: 15"
                min={0}
                max={500}
                step="0.1"
                className="flex-1 h-11 rounded-xl border border-border bg-background px-3 text-sm text-end outline-none focus:border-brand nums"
              />
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              التقريب: لأعلى لأقرب 100 (مثال: 1250 → 1300)
            </p>
          </div>

          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full h-12 rounded-xl bg-brand text-brand-foreground font-bold shadow-card disabled:opacity-40 disabled:cursor-not-allowed"
          >
            معاينة التعديل ({preview?.count ?? 0} منتج)
          </button>
        </form>

        {/* Preview */}
        <div className="rounded-2xl border border-border bg-card shadow-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-muted/50">
            <h3 className="font-bold text-sm">المعاينة</h3>
            <p className="text-xs text-muted-foreground">
              {isLoading
                ? "جارٍ التحميل…"
                : preview
                  ? `${formatNumber(preview.count)} منتج · مجموع الأسعار: ${formatSDG(preview.sumOld)} → ${formatSDG(preview.sumNew)}`
                  : "أدخل نسبة مئوية لعرض التغييرات"}
            </p>
          </div>

          {preview && preview.rows.length > 0 ? (
            <div className="max-h-[520px] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card border-b border-border text-xs">
                  <tr>
                    <th className="text-right p-2 font-bold">المنتج</th>
                    <th className="text-center p-2 font-bold w-28">السعر الحالي</th>
                    <th className="text-center p-2 font-bold w-28">السعر الجديد</th>
                    <th className="text-center p-2 font-bold w-20">الفرق</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {preview.rows.slice(0, 200).map((r) => {
                    const diff = r.newPrice - r.oldPrice;
                    return (
                      <tr key={r.id}>
                        <td className="p-2 truncate max-w-[220px]">{r.name}</td>
                        <td className="p-2 text-center nums text-muted-foreground">
                          {formatSDG(r.oldPrice)}
                        </td>
                        <td className="p-2 text-center nums font-bold">{formatSDG(r.newPrice)}</td>
                        <td
                          className={`p-2 text-center nums text-xs ${diff >= 0 ? "text-emerald-600" : "text-rose-600"}`}
                        >
                          {diff >= 0 ? "+" : ""}
                          {formatSDG(diff)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {preview.rows.length > 200 && (
                <p className="p-2 text-center text-xs text-muted-foreground border-t border-border">
                  … و {formatNumber(preview.rows.length - 200)} منتج آخر
                </p>
              )}
            </div>
          ) : (
            <div className="p-8 text-center text-sm text-muted-foreground">
              لا توجد معاينة بعد
            </div>
          )}
        </div>
      </div>

      {/* Confirmation dialog */}
      {confirm && preview && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-card shadow-2xl p-5 space-y-4">
            <div className="flex items-start gap-3">
              <div className="size-10 rounded-full bg-amber-100 grid place-items-center shrink-0">
                <AlertTriangle className="size-5 text-amber-600" />
              </div>
              <div>
                <h3 className="font-bold">تأكيد التحديث</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  سيتم تحديث <span className="font-bold text-foreground">{preview.count}</span>{" "}
                  منتج ({target === "sale_price" ? "سعر البيع" : "سعر الشراء"})
                  {dir === "inc" ? " بالزيادة " : " بالنقصان "}
                  <span className="font-bold text-foreground nums">{percent}%</span> مع التقريب
                  لأعلى لأقرب 100. لا يمكن التراجع تلقائياً.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirm(false)}
                className="flex-1 h-11 rounded-xl border border-border font-bold"
                disabled={mutation.isPending}
              >
                إلغاء
              </button>
              <button
                onClick={() => mutation.mutate()}
                disabled={mutation.isPending}
                className="flex-1 h-11 rounded-xl bg-brand text-brand-foreground font-bold flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : "تأكيد التحديث"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

function Pill({
  active,
  onClick,
  children,
  color = "brand",
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  color?: "brand" | "emerald" | "rose";
}) {
  const activeMap = {
    brand: "bg-brand text-brand-foreground border-brand",
    emerald: "bg-emerald-600 text-white border-emerald-600",
    rose: "bg-rose-600 text-white border-rose-600",
  } as const;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-11 rounded-xl border flex items-center justify-center gap-1.5 text-sm font-bold transition ${
        active ? activeMap[color] : "border-border bg-background text-foreground hover:bg-muted"
      }`}
    >
      {children}
    </button>
  );
}
