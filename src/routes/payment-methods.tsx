import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { PermissionGate } from "@/components/PermissionGate";
import { Wallet, Landmark, Plus, Trash2, Star, Loader2, CheckCircle2 } from "lucide-react";
import {
  usePaymentMethods,
  useCreatePaymentMethod,
  useUpdatePaymentMethod,
  useDeletePaymentMethod,
  type PaymentMethod,
  type PaymentMethodType,
} from "@/hooks/use-payment-methods";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/errors";

export const Route = createFileRoute("/payment-methods")({
  head: () => ({ meta: [{ title: "طرق الدفع — المهندس" }] }),
  component: PaymentMethodsPageGuarded,
});

type FormState = {
  name: string;
  type: PaymentMethodType;
  bank_name: string;
  account_number: string;
  account_holder: string;
  iban: string;
  notes: string;
  is_default: boolean;
};

const emptyForm: FormState = {
  name: "",
  type: "cash",
  bank_name: "",
  account_number: "",
  account_holder: "",
  iban: "",
  notes: "",
  is_default: false,
};

function PaymentMethodsPageGuarded() {
  return (
    <PermissionGate perm="payment_methods.write">
      <PaymentMethodsPage />
    </PermissionGate>
  );
}

function PaymentMethodsPage() {
  const { data: methods = [], isLoading } = usePaymentMethods(false);
  const createMut = useCreatePaymentMethod();
  const updateMut = useUpdatePaymentMethod();
  const deleteMut = useDeletePaymentMethod();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [open, setOpen] = useState(false);

  async function submit(e?: React.FormEvent | React.MouseEvent) {
    e?.preventDefault?.();
    if (createMut.isPending) return;
    if (!form.name.trim()) {
      toast.error("أدخل اسم طريقة الدفع");
      return;
    }
    if (form.type === "bank" && !form.account_number.trim()) {
      toast.error("رقم الحساب مطلوب للحساب البنكي");
      return;
    }
    try {
      await createMut.mutateAsync({
        name: form.name.trim(),
        type: form.type,
        bank_name: form.type === "bank" ? form.bank_name.trim() || null : null,
        account_number: form.type === "bank" ? form.account_number.trim() || null : null,
        account_holder: form.type === "bank" ? form.account_holder.trim() || null : null,
        iban: form.type === "bank" ? form.iban.trim() || null : null,
        notes: form.notes.trim() || null,
        is_default: form.is_default,
        is_active: true,
      });
      toast.success("تمت إضافة طريقة الدفع");
      setForm(emptyForm);
      setOpen(false);
    } catch (err) {
      console.error("[payment-methods] create failed", err);
      toast.error(getErrorMessage(err, "تعذّرت الإضافة"));
    }
  }

  async function toggleActive(m: PaymentMethod) {
    try {
      await updateMut.mutateAsync({ id: m.id, patch: { is_active: !m.is_active } });
    } catch (err) {
      toast.error(getErrorMessage(err, "تعذّر التحديث"));
    }
  }
  async function setDefault(m: PaymentMethod) {
    try {
      await updateMut.mutateAsync({ id: m.id, patch: { is_default: true } });
      toast.success("تم تعيينها كطريقة افتراضية");
    } catch (err) {
      toast.error(getErrorMessage(err, "تعذّر التحديث"));
    }
  }
  async function remove(m: PaymentMethod) {
    if (!confirm(`حذف ${m.name}؟`)) return;
    try {
      await deleteMut.mutateAsync(m.id);
      toast.success("تم الحذف");
    } catch (err) {
      toast.error(getErrorMessage(err, "تعذّر الحذف"));
    }
  }

  return (
    <AppShell title="طرق الدفع" showBack>
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          سجّل حسابات الدفع النقدية والبنكية للمحل. ستظهر تفاصيل الحساب البنكي على الفاتورة عند اختياره.
        </p>

        <div className="flex justify-end">
          <button
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-primary text-primary-foreground font-semibold text-sm"
          >
            <Plus className="size-4" /> إضافة طريقة دفع
          </button>
        </div>

        {open && (
          <form onSubmit={submit} className="bg-card border border-border rounded-xl p-4 space-y-3 shadow-sm">
            <div className="grid grid-cols-2 gap-3">
              <Field label="الاسم">
                <input
                  className="input"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="مثال: بنك الخرطوم — حساب المحل"
                  required
                  maxLength={80}
                />
              </Field>
              <Field label="النوع">
                <select
                  className="input"
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value as PaymentMethodType })}
                >
                  <option value="cash">نقدي</option>
                  <option value="bank">حساب بنكي</option>
                </select>
              </Field>
            </div>

            {form.type === "bank" && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="اسم البنك">
                  <input className="input" value={form.bank_name} onChange={(e) => setForm({ ...form, bank_name: e.target.value })} maxLength={80} />
                </Field>
                <Field label="رقم الحساب">
                  <input className="input" dir="ltr" value={form.account_number} onChange={(e) => setForm({ ...form, account_number: e.target.value })} maxLength={40} />
                </Field>
                <Field label="اسم صاحب الحساب">
                  <input className="input" value={form.account_holder} onChange={(e) => setForm({ ...form, account_holder: e.target.value })} maxLength={120} />
                </Field>
                <Field label="IBAN (اختياري)">
                  <input className="input" dir="ltr" value={form.iban} onChange={(e) => setForm({ ...form, iban: e.target.value })} maxLength={40} />
                </Field>
              </div>
            )}

            <Field label="ملاحظات (اختياري)">
              <textarea className="input min-h-16" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} maxLength={300} />
            </Field>

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.is_default} onChange={(e) => setForm({ ...form, is_default: e.target.checked })} />
              تعيينها كطريقة افتراضية
            </label>

            <div className="flex gap-2">
              <button type="submit" disabled={createMut.isPending} className="btn-primary inline-flex items-center justify-center gap-2">
                {createMut.isPending && <Loader2 className="size-4 animate-spin" />}
                حفظ
              </button>
              <button type="button" onClick={() => { setOpen(false); setForm(emptyForm); }} className="btn-secondary">
                إلغاء
              </button>
            </div>
          </form>
        )}

        {isLoading ? (
          <div className="text-center text-sm text-muted-foreground py-8">جارٍ التحميل…</div>
        ) : methods.length === 0 ? (
          <div className="text-center text-sm text-muted-foreground py-8 bg-card rounded-xl border border-dashed border-border">
            لا توجد طرق دفع مسجّلة بعد
          </div>
        ) : (
          <ul className="space-y-2">
            {methods.map((m) => (
              <li key={m.id} className={`bg-card border rounded-xl p-4 flex items-start gap-3 ${m.is_active ? "border-border" : "border-border opacity-60"}`}>
                <div className={`size-10 grid place-items-center rounded-lg shrink-0 ${m.type === "cash" ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"}`}>
                  {m.type === "cash" ? <Wallet className="size-5" /> : <Landmark className="size-5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-sm">{m.name}</span>
                    {m.is_default && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                        <Star className="size-3" /> افتراضية
                      </span>
                    )}
                    {!m.is_active && (
                      <span className="text-[10px] font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                        غير نشط
                      </span>
                    )}
                  </div>
                  {m.type === "bank" && (
                    <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                      {m.bank_name && <div>{m.bank_name}</div>}
                      {m.account_number && <div className="nums" dir="ltr">حساب: {m.account_number}</div>}
                      {m.account_holder && <div>باسم: {m.account_holder}</div>}
                      {m.iban && <div className="nums" dir="ltr">IBAN: {m.iban}</div>}
                    </div>
                  )}
                  {m.notes && <div className="text-xs text-muted-foreground mt-1">{m.notes}</div>}
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  {!m.is_default && (
                    <button onClick={() => setDefault(m)} title="تعيين كافتراضية" className="p-2 rounded-lg hover:bg-muted text-amber-600">
                      <Star className="size-4" />
                    </button>
                  )}
                  <button onClick={() => toggleActive(m)} title={m.is_active ? "إيقاف" : "تفعيل"} className="p-2 rounded-lg hover:bg-muted text-emerald-600">
                    <CheckCircle2 className="size-4" />
                  </button>
                  <button onClick={() => remove(m)} title="حذف" className="p-2 rounded-lg hover:bg-muted text-destructive">
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <style>{`
        .input { width: 100%; height: 2.5rem; border-radius: 0.5rem; border: 1px solid var(--input); background: var(--background); color: var(--foreground); padding: 0 0.75rem; font-size: 0.875rem; outline: none; }
        .input:focus-visible { box-shadow: 0 0 0 2px var(--ring); border-color: var(--ring); }
        textarea.input { padding: 0.5rem 0.75rem; height: auto; }
        .btn-primary { height: 2.5rem; padding: 0 1rem; border-radius: 0.5rem; background: var(--primary); color: var(--primary-foreground); font-weight: 600; font-size: 0.875rem; }
        .btn-primary:disabled { opacity: 0.5; }
        .btn-secondary { height: 2.5rem; padding: 0 1rem; border-radius: 0.5rem; background: var(--secondary); color: var(--foreground); font-weight: 600; font-size: 0.875rem; border: 1px solid var(--border); }
      `}</style>
    </AppShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
