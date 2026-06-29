import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/expenses")({
  head: () => ({ meta: [{ title: "المصروفات — المهندس" }] }),
  component: ExpensesPage,
});

function ExpensesPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [target, setTarget] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today);

  return (
    <AppShell title="المصروفات" showBack>
      <p className="text-xs text-muted-foreground text-center leading-relaxed">
        المصروفات تشمل اى مبالغ مدفوعة مباشرة مثل المرتبات او فاتورة الكهرباء وغيرها...
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
        }}
        className="mt-4 space-y-4"
      >
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
          className="w-full h-12 rounded-xl bg-brand text-brand-foreground font-bold shadow-card hover:opacity-95 transition"
        >
          حفظ
        </button>
      </form>
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
