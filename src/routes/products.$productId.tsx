import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Loader2, Save, Trash2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { toProduct } from "@/types/product";

export const Route = createFileRoute("/products/$productId")({
  head: () => ({ meta: [{ title: "تعديل منتج — المهندس" }] }),
  component: EditProductPage,
});

const UNITS = ["قطعة", "علبة", "كرتون", "لتر", "كجم", "متر"];

function EditProductPage() {
  const { productId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: product, isLoading: loadingProduct } = useQuery({
    queryKey: ["product", productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("id", productId)
        .single();
      if (error) throw error;
      return toProduct(data);
    },
  });

  const [name, setName] = useState("");
  const [barcode, setBarcode] = useState("");
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

  useEffect(() => {
    if (product) {
      setName(product.name);
      setBarcode(product.barcode ?? "");
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
    setSaving(true);
    try {
      const { error } = await supabase
        .from("products")
        .update({
          name: name.trim(),
          barcode: barcode.trim() || null,
          category: category.trim() || null,
          unit,
          location: location.trim() || null,
          quantity: Number(quantity) || 0,
          min_quantity: Number(minQuantity) || 0,
          cost_price: Number(costPrice) || 0,
          sale_price: Number(salePrice) || 0,
          notes: notes.trim() || null,
        })
        .eq("id", productId);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["products"] });
      navigate({ to: "/products" });
    } catch (err) {
      setError((err as Error).message || "تعذّر حفظ التعديلات");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!confirm("هل أنت متأكد من حذف هذا المنتج؟")) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from("products").delete().eq("id", productId);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["products"] });
      navigate({ to: "/products" });
    } catch (err) {
      setError((err as Error).message || "تعذّر حذف المنتج");
      setDeleting(false);
    }
  }

  if (loadingProduct) {
    return (
      <AppShell title="تعديل منتج" showBack>
        <div className="py-20 grid place-items-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
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
          className="w-full h-12 rounded-xl border border-destructive text-destructive font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {deleting ? <Loader2 className="size-4 animate-spin" /> : <><Trash2 className="size-4" /> حذف المنتج</>}
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
