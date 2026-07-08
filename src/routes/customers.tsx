import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Search, Plus, Phone, Wrench, CreditCard, Loader2, X, ChevronLeft, Receipt, TrendingDown } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { formatSDG } from "@/lib/format";
import { useCustomers, useAddCustomer } from "@/hooks/use-customers";

export const Route = createFileRoute("/customers")({
  head: () => ({ meta: [{ title: "العملاء — المهندس" }] }),
  component: CustomersPage,
});

function CustomersPage() {
  const [q, setQ] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const { data: customers = [], isLoading, isError } = useCustomers(q);

  return (
    <AppShell title="العملاء" showBack>
      <div className="relative mb-4">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="ابحث بالاسم أو الهاتف أو الورشة"
          className="w-full h-12 rounded-xl border border-border bg-card pr-9 pl-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
        />
      </div>

      {isLoading ? (
        <div className="py-16 grid place-items-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
      ) : isError ? (
        <p className="py-10 text-center text-sm text-destructive">تعذّر تحميل العملاء</p>
      ) : customers.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          {q ? "لا توجد نتائج" : "لا يوجد عملاء بعد — اضغط + لإضافة عميل"}
        </p>
      ) : (
        <ul className="space-y-3">
          {customers.map((c) => (
            <li key={c.id}>
              <Link
                to="/customers/$customerId"
                params={{ customerId: c.id }}
                className="block rounded-2xl border border-border bg-card p-4 shadow-card hover:border-brand hover:shadow-md transition"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-bold text-foreground truncate flex items-center gap-1.5">
                      {c.name}
                      <ChevronLeft className="size-3.5 text-muted-foreground" />
                    </h3>
                    {c.phone && (
                      <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
                        <Phone className="size-3" /> <span dir="ltr">{c.phone}</span>
                      </div>
                    )}
                    {c.workshop && (
                      <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
                        <Wrench className="size-3" /> {c.workshop}
                      </div>
                    )}
                  </div>
                  <div className="text-left shrink-0">
                    {c.balance > 0 && (
                      <div className="text-xs text-destructive font-bold nums">دين: {formatSDG(c.balance)}</div>
                    )}
                    {c.creditLimit > 0 && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                        <CreditCard className="size-3" />
                        <span className="nums">{formatSDG(c.creditLimit)}</span>
                      </div>
                    )}
                  </div>
                </div>
                {c.notes && <p className="mt-2 text-xs text-muted-foreground border-t border-border pt-2">{c.notes}</p>}
              </Link>
            </li>
          ))}
        </ul>
      )}

      <button
        onClick={() => setShowAdd(true)}
        className="fixed bottom-6 left-6 grid place-items-center size-14 rounded-full bg-brand text-brand-foreground shadow-fab hover:scale-105 transition"
        aria-label="إضافة عميل"
      >
        <Plus className="size-7" />
      </button>

      {showAdd && <AddCustomerModal onClose={() => setShowAdd(false)} />}
    </AppShell>
  );
}

function AddCustomerModal({ onClose }: { onClose: () => void }) {
  const addCustomer = useAddCustomer();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [workshop, setWorkshop] = useState("");
  const [creditLimit, setCreditLimit] = useState("");
  const [notes, setNotes] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await addCustomer.mutateAsync({
      name: name.trim(),
      phone: phone.trim(),
      workshop: workshop.trim(),
      creditLimit: Number(creditLimit) || 0,
      notes: notes.trim(),
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        className="w-full max-w-lg bg-card rounded-2xl p-5 space-y-3 shadow-xl"
      >
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-bold">إضافة عميل</h2>
          <button type="button" onClick={onClose} className="p-1"><X className="size-5" /></button>
        </div>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="اسم العميل *" required
          className="w-full h-11 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-brand" />
        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="رقم الهاتف" dir="ltr"
          className="w-full h-11 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-brand text-left" />
        <input value={workshop} onChange={(e) => setWorkshop(e.target.value)} placeholder="اسم الورشة"
          className="w-full h-11 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-brand" />
        <input value={creditLimit} onChange={(e) => setCreditLimit(e.target.value)} placeholder="الحد الائتماني" type="number" inputMode="decimal"
          className="w-full h-11 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-brand text-left" />
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="ملاحظات" rows={2}
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand resize-none" />
        <button type="submit" disabled={addCustomer.isPending || !name.trim()}
          className="w-full h-12 rounded-xl bg-brand text-brand-foreground font-bold flex items-center justify-center gap-2 disabled:opacity-60">
          {addCustomer.isPending ? <Loader2 className="size-5 animate-spin" /> : "حفظ العميل"}
        </button>
        {addCustomer.isError && <p className="text-xs text-destructive text-center">{(addCustomer.error as Error).message}</p>}
      </form>
    </div>
  );
}
