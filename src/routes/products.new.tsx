import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2, Save } from "lucide-react";
import { z } from "zod";
import { AppShell } from "@/components/AppShell";
import { PermissionGate } from "@/components/PermissionGate";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { getErrorMessage, parseNumber } from "@/lib/errors";
import { toast } from "sonner";

export const Route = createFileRoute("/products/new")({
  head: () => ({ meta: [{ title: "إضافة منتج — المهندس" }] }),
  component: NewProductPageGuarded,
});

const UNITS = ["قطعة", "علبة", "كرتون", "لتر", "كجم", "متر"];

const productSchema = z.object({
  name: z.string().trim().min(1, "اسم المنتج مطلوب").max(200, "الاسم طويل جداً"),
  barcode: z.string().trim().max(64, "الباركود طويل جداً").optional(),
  partNumber: z.string().trim().max(64, "رقم القطعة طويل").optional(),
  category: z.string().trim().max(80, "اسم الفئة طويل").optional(),
  unit: z.enum(UNITS as [string, ...string[]]),
  location: z.string().trim().max(50, "الموقع طويل جداً").optional(),
  quantity: z.number().min(0, "الكمية لا يمكن أن تكون سالبة").max(1_000_000, "الكمية كبيرة جداً"),
  minQuantity: z.number().min(0, "الحد الأدنى لا يمكن أن يكون سالباً").max(1_000_000),
  costPrice: z.number().min(0, "السعر لا يمكن أن يكون سالباً").max(1e12),
  salePrice: z.number().min(0, "السعر لا يمكن أن يكون سالباً").max(1e12),
  notes: z.string().trim().max(1000, "الملاحظات طويلة جداً").optional(),
});

function NewProductPageGuarded() {
  return (
    <PermissionGate perm="products.write">
      <NewProductPage />
    </PermissionGate>
  );
}

function NewProductPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
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
  const [error, setError] = useState<string | null>(null);

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
    if (parsed.data.salePrice > 0 && parsed.data.costPrice > parsed.data.salePrice) {
      toast.warning("تنبيه: سعر التكلفة أعلى من سعر البيع");
    }

    setSaving(true);
    try {
      const { data: userData, error: authErr } = await supabase.auth.getUser();
      if (authErr) throw authErr;
      const userId = userData.user?.id;
      if (!userId) {
        navigate({ to: "/auth" });
        return;
      }
      const p = parsed.data;
      const { error } = await supabase.from("products").insert({
        user_id: userId,
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
      } as never);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success("تم حفظ المنتج");
      navigate({ to: "/products" });
    } catch (err) {
      const msg = getErrorMessage(err, "تعذّر حفظ المنتج");
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }


  return (
    <AppShell title="إضافة منتج" showBack>
      <form onSubmit={onSubmit} className="space-y-3 pb-24">
        <Field label="اسم المنتج *">
          <input value={name} onChange={(e) => setName(e.target.value)} required className="ip" placeholder="مثال: فلتر زيت تويوتا" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="الباركود">
            <input value={barcode} onChange={(e) => setBarcode(e.target.value)} dir="ltr" className="ip text-left" />
          </Field>
          <Field label="رقم القطعة (Part No.)">
            <input value={partNumber} onChange={(e) => setPartNumber(e.target.value)} dir="ltr" className="ip text-left" placeholder="مثال: 90915-YZZE2" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="الفئة">
            <input value={category} onChange={(e) => setCategory(e.target.value)} className="ip" placeholder="فلاتر" />
          </Field>
          <Field label="الموقع (الرف)">
            <input value={location} onChange={(e) => setLocation(e.target.value)} className="ip" placeholder="A-12" />
          </Field>
        </div>
        <div>
          <Field label="الوحدة">
            <select value={unit} onChange={(e) => setUnit(e.target.value)} className="ip">
              {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
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
          {saving ? <Loader2 className="size-4 animate-spin" /> : <><Save className="size-4" /> حفظ المنتج</>}
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
