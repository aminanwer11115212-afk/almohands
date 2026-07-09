import { createFileRoute, Link } from "@tanstack/react-router";
import { PermissionGate } from "@/components/PermissionGate";
import { useState } from "react";
import { Search, Plus, Phone, Wrench, CreditCard, Loader2, X, ChevronLeft, Receipt, TrendingDown, MapPin, Pencil, Trash2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { formatSDG } from "@/lib/format";
import { useCustomers, useAddCustomer, useUpdateCustomer, useDeleteCustomer, type Customer } from "@/hooks/use-customers";
import { toast } from "sonner";

export const Route = createFileRoute("/customers/")({
  head: () => ({ meta: [{ title: "العملاء — المهندس" }] }),
  component: () => (<PermissionGate perm="customers.view"><CustomersPage /></PermissionGate>),
});

function CustomersPage() {
  const [q, setQ] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [deleting, setDeleting] = useState<Customer | null>(null);
  const { data: customers = [], isLoading, isError } = useCustomers(q);

  const totals = customers.reduce(
    (a, c) => {
      a.invoices += c.invoicesCount;
      a.total += c.totalInvoiced;
      a.paid += c.totalPaid;
      a.remaining += c.totalRemaining;
      return a;
    },
    { invoices: 0, total: 0, paid: 0, remaining: 0 },
  );

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

      {customers.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
          <MiniStat label="عملاء" value={String(customers.length)} tone="brand" />
          <MiniStat label="فواتير" value={String(totals.invoices)} tone="brand" />
          <MiniStat label="مدفوع" value={formatSDG(totals.paid)} tone="ok" />
          <MiniStat label="مديونية" value={formatSDG(totals.remaining)} tone={totals.remaining > 0 ? "warn" : "ok"} />
        </div>
      )}

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
          {customers.map((c) => {
            const debt = c.totalRemaining > 0 ? c.totalRemaining : c.balance;
            const overLimit = c.creditLimit > 0 && debt > c.creditLimit;
            return (
              <li key={c.id} className={
                "relative rounded-2xl border bg-card p-4 shadow-card hover:shadow-md transition " +
                (overLimit ? "border-rose-300" : "border-border hover:border-brand")
              }>
                <div className="absolute top-2 left-2 flex gap-1">
                  <button
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setEditing(c); }}
                    className="grid place-items-center size-7 rounded-lg bg-muted/60 hover:bg-brand hover:text-brand-foreground text-muted-foreground"
                    aria-label="تعديل"
                    title="تعديل"
                  >
                    <Pencil className="size-3.5" />
                  </button>
                  <button
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDeleting(c); }}
                    className="grid place-items-center size-7 rounded-lg bg-muted/60 hover:bg-destructive hover:text-destructive-foreground text-muted-foreground"
                    aria-label="حذف"
                    title="حذف"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
                <Link to="/customers/$customerId" params={{ customerId: c.id }} className="block">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 pe-16">
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
                      {c.address && (
                        <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
                          <MapPin className="size-3" /> {c.address}
                        </div>
                      )}
                    </div>
                    <div className="text-left shrink-0 space-y-0.5 mt-7">
                      {debt > 0 ? (
                        <div className={`text-xs font-bold nums ${overLimit ? "text-rose-700" : "text-destructive"}`}>
                          دين: {formatSDG(debt)}
                        </div>
                      ) : (
                        <div className="text-[11px] text-emerald-700 font-bold">مسدّد</div>
                      )}
                      {c.creditLimit > 0 && (
                        <div className={`flex items-center gap-1 text-[11px] nums ${overLimit ? "text-rose-600 font-bold" : "text-muted-foreground"}`}>
                          <CreditCard className="size-3" />
                          <span>حد {formatSDG(c.creditLimit)}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2 text-center border-t border-border pt-2">
                    <MiniInline icon={Receipt} label="فواتير" value={String(c.invoicesCount)} />
                    <MiniInline label="مبيعات" value={formatSDG(c.totalInvoiced)} />
                    <MiniInline icon={TrendingDown} label="مدفوع" value={formatSDG(c.totalPaid)} tone="ok" />
                  </div>
                  {overLimit && (
                    <p className="mt-2 text-[11px] text-rose-700 font-bold text-center">
                      ⚠️ تجاوز الحد الائتماني
                    </p>
                  )}
                  {c.notes && <p className="mt-2 text-xs text-muted-foreground border-t border-border pt-2">{c.notes}</p>}
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <button
        onClick={() => setShowAdd(true)}
        className="fixed bottom-6 left-6 grid place-items-center size-14 rounded-full bg-brand text-brand-foreground shadow-fab hover:scale-105 transition"
        aria-label="إضافة عميل"
      >
        <Plus className="size-7" />
      </button>

      {showAdd && <CustomerFormModal mode="add" onClose={() => setShowAdd(false)} />}
      {editing && <CustomerFormModal mode="edit" customer={editing} onClose={() => setEditing(null)} />}
      {deleting && <DeleteCustomerModal customer={deleting} onClose={() => setDeleting(null)} />}
    </AppShell>
  );
}

function CustomerFormModal({ mode, customer, onClose }: { mode: "add" | "edit"; customer?: Customer; onClose: () => void }) {
  const addCustomer = useAddCustomer();
  const updateCustomer = useUpdateCustomer();
  const [name, setName] = useState(customer?.name ?? "");
  const [phone, setPhone] = useState(customer?.phone ?? "");
  const [workshop, setWorkshop] = useState(customer?.workshop ?? "");
  const [address, setAddress] = useState(customer?.address ?? "");
  const [creditLimit, setCreditLimit] = useState(customer ? String(customer.creditLimit || "") : "");
  const [notes, setNotes] = useState(customer?.notes ?? "");
  const busy = addCustomer.isPending || updateCustomer.isPending;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      const payload = {
        name: name.trim(),
        phone: phone.trim(),
        workshop: workshop.trim(),
        address: address.trim(),
        creditLimit: Number(creditLimit) || 0,
        notes: notes.trim(),
      };
      if (mode === "edit" && customer) {
        await updateCustomer.mutateAsync({ id: customer.id, ...payload });
        toast.success("تم تحديث العميل");
      } else {
        await addCustomer.mutateAsync(payload);
        toast.success("تم إضافة العميل");
      }
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        className="w-full max-w-lg bg-card rounded-2xl p-5 space-y-3 shadow-xl"
      >
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-bold">{mode === "edit" ? "تعديل عميل" : "إضافة عميل"}</h2>
          <button type="button" onClick={onClose} className="p-1"><X className="size-5" /></button>
        </div>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="اسم العميل *" required
          className="w-full h-11 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-brand" />
        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="رقم الهاتف" dir="ltr"
          className="w-full h-11 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-brand text-left" />
        <input value={workshop} onChange={(e) => setWorkshop(e.target.value)} placeholder="اسم الورشة"
          className="w-full h-11 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-brand" />
        <div className="relative">
          <MapPin className="size-4 absolute top-1/2 -translate-y-1/2 right-3 text-muted-foreground" />
          <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="الموقع / العنوان"
            className="w-full h-11 rounded-xl border border-border bg-background pr-9 pl-3 text-sm outline-none focus:border-brand" />
        </div>
        <input value={creditLimit} onChange={(e) => setCreditLimit(e.target.value)} placeholder="الحد الائتماني" type="number" inputMode="decimal"
          className="w-full h-11 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-brand text-left" />
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="ملاحظات" rows={2}
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand resize-none" />
        <button type="submit" disabled={busy || !name.trim()}
          className="w-full h-12 rounded-xl bg-brand text-brand-foreground font-bold flex items-center justify-center gap-2 disabled:opacity-60">
          {busy ? <Loader2 className="size-5 animate-spin" /> : mode === "edit" ? "حفظ التعديلات" : "حفظ العميل"}
        </button>
      </form>
    </div>
  );
}

function DeleteCustomerModal({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  const del = useDeleteCustomer();
  const hasInvoices = customer.invoicesCount > 0;
  async function handleDelete() {
    try {
      await del.mutateAsync(customer.id);
      toast.success("تم حذف العميل");
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md bg-card rounded-2xl p-5 shadow-xl space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-destructive">حذف عميل</h2>
          <button type="button" onClick={onClose} className="p-1"><X className="size-5" /></button>
        </div>
        <p className="text-sm">هل أنت متأكد من حذف <span className="font-bold">{customer.name}</span>؟</p>
        {hasInvoices && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs p-2">
            ⚠️ يمتلك هذا العميل {customer.invoicesCount} فاتورة. فواتيره ستبقى محفوظة لكن سيُزال ارتباطها بالعميل.
          </div>
        )}
        <div className="flex gap-2 pt-2">
          <button onClick={onClose} className="flex-1 h-11 rounded-xl border border-border bg-background text-sm font-bold">إلغاء</button>
          <button onClick={handleDelete} disabled={del.isPending}
            className="flex-1 h-11 rounded-xl bg-destructive text-destructive-foreground font-bold flex items-center justify-center gap-2 disabled:opacity-60">
            {del.isPending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
            حذف نهائي
          </button>
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value, tone = "brand" }: { label: string; value: string; tone?: "brand" | "ok" | "warn" }) {
  const cls = tone === "warn" ? "text-rose-700" : tone === "ok" ? "text-emerald-700" : "text-brand";
  return (
    <div className="rounded-xl border border-border bg-card p-2 text-center shadow-sm">
      <div className="text-[10px] font-bold text-muted-foreground">{label}</div>
      <div className={`text-sm font-extrabold nums mt-0.5 truncate ${cls}`}>{value}</div>
    </div>
  );
}

function MiniInline({
  label,
  value,
  icon: Icon,
  tone = "muted",
}: {
  label: string;
  value: string;
  icon?: React.ComponentType<{ className?: string }>;
  tone?: "muted" | "ok" | "warn";
}) {
  const cls = tone === "warn" ? "text-rose-700" : tone === "ok" ? "text-emerald-700" : "text-foreground";
  return (
    <div>
      <div className="text-[10px] text-muted-foreground flex items-center justify-center gap-1">
        {Icon && <Icon className="size-3" />}
        {label}
      </div>
      <div className={`text-[11px] font-bold nums mt-0.5 truncate ${cls}`}>{value}</div>
    </div>
  );
}
