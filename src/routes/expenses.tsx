import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useExpenses, useAddExpense, useDeleteExpense } from "@/hooks/use-expenses";
import { formatSDG } from "@/lib/format";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { useRequirePermission } from "@/hooks/use-require-permission";

export const Route = createFileRoute("/expenses")({
  head: () => ({ meta: [{ title: "المصروفات — المهندس" }] }),
  component: ExpensesPage,
});

function ExpensesPage() {
  const { isChecking: __permChk, allowed: __permOk } = useRequirePermission("expenses.write");
  if (__permChk || !__permOk) return null;
  const today = new Date().toISOString().slice(0, 10);
  const [target, setTarget] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today);

  const { data: expenses = [], isLoading } = useExpenses();
  const addExpense = useAddExpense();
  const deleteExpense = useDeleteExpense();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!target.trim() || !amount) return;
    addExpense.mutate(
      { target: target.trim(), amount: parseFloat(amount), date },
      {
        onSuccess: () => {
          toast.success("تم حفظ المصروف");
          setTarget("");
          setAmount("");
          setDate(today);
        },
        onError: () => toast.error("فشل في الحفظ"),
      }
    );
  };

  return (
    <AppShell title="المصروفات" showBack>
      <p className="text-xs text-muted-foreground text-center leading-relaxed">
        المصروفات تشمل اى مبالغ مدفوعة مباشرة مثل المرتبات او فاتورة الكهرباء وغيرها...
      </p>

      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <Field label="جهة الصرف">
          <input
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="ادخل جهة الصرف"
            className="w-full h-12 rounded-xl border-2 border-brand/30 bg-muted px-4 text-sm text-end outline-none focus:border-brand"
          />
        </Field>

        <Field label="المبلغ المصروف">
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="ادخل المبلغ المصروف"
            className="w-full h-12 rounded-xl border-2 border-brand/30 bg-muted px-4 text-sm text-end outline-none focus:border-brand nums"
          />
        </Field>

        <Field label="تاريخ الصرف">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full h-12 rounded-xl border-2 border-brand/30 bg-card px-4 text-sm text-center outline-none focus:border-brand nums"
          />
        </Field>

        <button
          type="submit"
          disabled={addExpense.isPending}
          className="w-full h-12 rounded-xl bg-brand text-brand-foreground font-bold shadow-card hover:opacity-95 transition disabled:opacity-60"
        >
          {addExpense.isPending ? "جاري الحفظ..." : "حفظ"}
        </button>
      </form>

      {/* List */}
      <div className="mt-6 space-y-2">
        <h3 className="text-sm font-bold text-end">المصروفات السابقة</h3>
        {isLoading && <p className="text-center text-muted-foreground text-xs">جاري التحميل...</p>}
        {!isLoading && expenses.length === 0 && (
          <p className="text-center text-muted-foreground text-xs">لا توجد مصروفات</p>
        )}
        {expenses.map((ex) => (
          <div key={ex.id} className="flex items-center justify-between rounded-xl bg-card border border-border p-3">
            <button
              onClick={() => deleteExpense.mutate(ex.id, { onSuccess: () => toast.success("تم الحذف") })}
              className="text-destructive p-1"
            >
              <Trash2 size={16} />
            </button>
            <div className="flex-1 text-end px-2">
              <div className="text-sm font-semibold">{ex.target}</div>
              <div className="text-xs text-muted-foreground nums">{ex.date}</div>
            </div>
            <span className="font-bold text-brand nums">{formatSDG(ex.amount)}</span>
          </div>
        ))}
      </div>
    </AppShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-bold text-end mb-1">{label}</label>
      {children}
    </div>
  );
}
