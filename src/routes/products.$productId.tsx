import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PermissionGate } from "@/components/PermissionGate";
import { useState, useEffect } from "react";
import { Loader2, Save, Trash2, AlertCircle } from "lucide-react";
import { z } from "zod";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { toProduct } from "@/types/product";
import { getErrorMessage, parseNumber } from "@/lib/errors";
import { toast } from "sonner";

export const Route = createFileRoute("/products/$productId")({
  head: () => ({ meta: [{ title: "تعديل منتج — المهندس" }] }),
  component: () => (<PermissionGate perm="products.write"><EditProductPage /></PermissionGate>),
});

const UNITS = ["قطعة", "علبة", "كرتون", "لتر", "كجم", "متر"];

const productSchema = z.object({
  name: z.string().trim().min(1, "اسم المنتج مطلوب").max(200, "الاسم طويل جداً"),
  barcode: z.string().trim().max(64).optional(),
  partNumber: z.string().trim().max(64).optional(),
  category: z.string().trim().max(80).optional(),
  unit: z.enum(UNITS as [string, ...string[]]),
  location: z.string().trim().max(50).optional(),
  quantity: z.number().min(0, "الكمية سالبة").max(1_000_000),
  minQuantity: z.number().min(0).max(1_000_000),
  costPrice: z.number().min(0).max(1e12),
  salePrice: z.number().min(0).max(1e12),
  notes: z.string().trim().max(1000).optional(),
});

function EditProductPage() {
  const { productId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: product, isLoading: loadingProduct, error: loadError } = useQuery({
    queryKey: ["product", productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("id", productId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return toProduct(data);
    },
    retry: 1,
  });

  const [name, setName] = useState("");
  const [barcode, setBarcode] = useState("");
  const [partNumber, setPartNumber] = useState("");
  const [category, setCategory] = useState("");
  const [unit, setUnit] = useState("قطعة");
  const [location, setLocation] = useState("");
  const [quantity, setQuantity] = useState("0");
  const [minQuantity, setMinQuantity] = useState("0");
  const [costPrice, setCostPrice] = useState("0");
  const [salePrice, setSalePrice] = useState("0");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (product) {
      setName(product.name);
      setBarcode(product.barcode ?? "");
      setPartNumber(product.partNumber ?? "");
      setCategory(product.category ?? "");
      setUnit(product.unit);
      setLocation(product.location ?? "");
      setQuantity(String(product.quantity));
      setMinQuantity(String(product.minQuantity));
      setCostPrice(String(product.costPrice));
      setSalePrice(String(product.salePrice));
      setNotes(product.notes ?? "");
    }
  }, [product]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const parsed = productSchema.safeParse({
      name,
      barcode: barcode.trim() || undefined,
      partNumber: partNumber.trim() || undefined,
      category: category.trim() || undefined,
      unit,
      location: location.trim() || undefined,
      quantity: parseNumber(quantity, { min: 0 }),
      minQuantity: parseNumber(minQuantity, { min: 0 }),
      costPrice: parseNumber(costPrice, { min: 0 }),
      salePrice: parseNumber(salePrice, { min: 0 }),
      notes: notes.trim() || undefined,
    });
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message ?? "بيانات غير صحيحة";
      setError(msg);
      toast.error(msg);
      return;
    }

    setSaving(true);
    try {
      const p = parsed.data;
      const { error } = await supabase
        .from("products")
        .update({
          name: p.name,
          barcode: p.barcode ?? null,
          part_number: p.partNumber ?? null,
          category: p.category ?? null,
          unit: p.unit,
          location: p.location ?? null,
          quantity: p.quantity,
          min_quantity: p.minQuantity,
          cost_price: p.costPrice,
          sale_price: p.salePrice,
          notes: p.notes ?? null,
        } as never)
        .eq("id", productId);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["product", productId] });
      toast.success("تم حفظ التعديلات");
      navigate({ to: "/products" });
    } catch (err) {
      const msg = getErrorMessage(err, "تعذّر حفظ التعديلات");
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      toast("اضغط الحذف مرة أخرى للتأكيد", { duration: 4000 });
      setTimeout(() => setConfirmDelete(false), 4000);
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      const { error } = await supabase.from("products").delete().eq("id", productId);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success("تم حذف المنتج");
      navigate({ to: "/products" });
    } catch (err) {
      const msg = getErrorMessage(err, "تعذّر حذف المنتج");
      setError(msg);
      toast.error(msg);
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  if (loadingProduct) {
    return (
      <AppShell title="تعديل منتج" showBack>
        <div className="py-20 grid place-items-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
      </AppShell>
    );
  }

  if (loadError) {
    return (
      <AppShell title="تعديل منتج" showBack>
        <div className="py-20 grid place-items-center gap-3 text-center">
          <AlertCircle className="size-8 text-destructive" />
          <p className="text-sm text-destructive">{getErrorMessage(loadError, "تعذّر تحميل بيانات المنتج")}</p>
          <button
            onClick={() => queryClient.invalidateQueries({ queryKey: ["product", productId] })}
            className="text-xs px-3 py-1.5 rounded-lg border border-border"
          >إعادة المحاولة</button>
        </div>
      </AppShell>
    );
  }

  if (!product) {
    return (
      <AppShell title="تعديل منتج" showBack>
        <div className="py-20 grid place-items-center gap-3 text-center">
          <AlertCircle className="size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">المنتج غير موجود أو تم حذفه</p>
          <button
            onClick={() => navigate({ to: "/products" })}
            className="text-xs px-3 py-1.5 rounded-lg border border-border"
          >الرجوع للمنتجات</button>
        </div>
      </AppShell>
    );
  }


  return (
    <AppShell title="تعديل منتج" showBack>
      <form onSubmit={onSubmit} className="space-y-3 pb-24">
        <Field label="اسم المنتج *">
          <input value={name} onChange={(e) => setName(e.target.value)} required className="ip" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="الباركود">
            <input value={barcode} onChange={(e) => setBarcode(e.target.value)} dir="ltr" className="ip text-left" />
          </Field>
          <Field label="الفئة">
            <input value={category} onChange={(e) => setCategory(e.target.value)} className="ip" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="الوحدة">
            <select value={unit} onChange={(e) => setUnit(e.target.value)} className="ip">
              {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </Field>
          <Field label="الموقع (الرف)">
            <input value={location} onChange={(e) => setLocation(e.target.value)} className="ip" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="الكمية">
            <input type="number" inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="ip" />
          </Field>
          <Field label="الحد الأدنى">
            <input type="number" inputMode="numeric" value={minQuantity} onChange={(e) => setMinQuantity(e.target.value)} className="ip" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="سعر التكلفة (SDG)">
            <input type="number" inputMode="decimal" value={costPrice} onChange={(e) => setCostPrice(e.target.value)} className="ip" />
          </Field>
          <Field label="سعر البيع (SDG)">
            <input type="number" inputMode="decimal" value={salePrice} onChange={(e) => setSalePrice(e.target.value)} className="ip" />
          </Field>
        </div>
        <Field label="ملاحظات">
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="ip py-2 h-auto" />
        </Field>

        {error && <p className="text-xs text-destructive text-center">{error}</p>}

        <button
          type="submit"
          disabled={saving}
          className="w-full h-12 rounded-xl bg-brand text-brand-foreground font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {saving ? <Loader2 className="size-4 animate-spin" /> : <><Save className="size-4" /> حفظ التعديلات</>}
        </button>

        <button
          type="button"
          onClick={onDelete}
          disabled={deleting}
          className={`w-full h-12 rounded-xl border font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60 ${confirmDelete ? "bg-destructive text-destructive-foreground border-destructive" : "border-destructive text-destructive"}`}
        >
          {deleting ? <Loader2 className="size-4 animate-spin" /> : <><Trash2 className="size-4" /> {confirmDelete ? "تأكيد الحذف" : "حذف المنتج"}</>}
        </button>

      </form>

      <style>{`
        .ip {
          width: 100%; height: 2.75rem; border-radius: 0.75rem;
          border: 1px solid var(--border); background: var(--card);
          color: var(--foreground);
          padding: 0 0.75rem; font-size: 0.875rem; outline: none;
        }
        .ip:focus-visible { border-color: var(--brand); box-shadow: 0 0 0 2px color-mix(in oklab, var(--brand) 30%, transparent); }
      `}</style>
    </AppShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs text-muted-foreground mb-1 text-end">{label}</span>
      {children}
    </label>
  );
}
