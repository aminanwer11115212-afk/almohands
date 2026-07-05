import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Search, Plus, Phone, MapPin, Loader2, X } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { formatSDG } from "@/lib/format";
import { useSuppliers, useAddSupplier } from "@/hooks/use-suppliers";
import { useRequirePermission } from "@/hooks/use-require-permission";

export const Route = createFileRoute("/suppliers")({
  head: () => ({ meta: [{ title: "الموردين — المهندس" }] }),
  component: SuppliersPage,
});

function SuppliersPage() {
  const { isChecking: __permChk, allowed: __permOk } = useRequirePermission("suppliers.write");
  if (__permChk || !__permOk) return null;
  const [q, setQ] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const { data: suppliers = [], isLoading, isError } = useSuppliers(q);

  return (
    <AppShell title="الموردين" showBack>
      <div className="relative mb-4">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="ابحث بالاسم أو الهاتف أو العنوان"
          className="w-full h-12 rounded-xl border border-border bg-card pr-9 pl-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
        />
      </div>

      {isLoading ? (
        <div className="py-16 grid place-items-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
      ) : isError ? (
        <p className="py-10 text-center text-sm text-destructive">تعذّر تحميل الموردين</p>
      ) : suppliers.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          {q ? "لا توجد نتائج" : "لا يوجد موردين بعد — اضغط + لإضافة مورد"}
        </p>
      ) : (
        <ul className="space-y-3">
          {suppliers.map((s) => (
            <li key={s.id} className="rounded-2xl border border-border bg-card p-4 shadow-card">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="font-bold text-foreground truncate">{s.name}</h3>
                  {s.phone && (
                    <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
                      <Phone className="size-3" /> <span dir="ltr">{s.phone}</span>
                    </div>
                  )}
                  {s.address && (
                    <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
                      <MapPin className="size-3" /> {s.address}
                    </div>
                  )}
                </div>
                {s.balance > 0 && (
                  <div className="text-xs text-destructive font-bold nums shrink-0">دين: {formatSDG(s.balance)}</div>
                )}
              </div>
              {s.notes && <p className="mt-2 text-xs text-muted-foreground border-t border-border pt-2">{s.notes}</p>}
            </li>
          ))}
        </ul>
      )}

      <button
        onClick={() => setShowAdd(true)}
        className="fixed bottom-6 left-6 grid place-items-center size-14 rounded-full bg-brand text-brand-foreground shadow-fab hover:scale-105 transition"
        aria-label="إضافة مورد"
      >
        <Plus className="size-7" />
      </button>

      {showAdd && <AddSupplierModal onClose={() => setShowAdd(false)} />}
    </AppShell>
  );
}

function AddSupplierModal({ onClose }: { onClose: () => void }) {
  const addSupplier = useAddSupplier();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await addSupplier.mutateAsync({
      name: name.trim(),
      phone: phone.trim(),
      address: address.trim(),
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
          <h2 className="text-lg font-bold">إضافة مورد</h2>
          <button type="button" onClick={onClose} className="p-1"><X className="size-5" /></button>
        </div>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="اسم المورد *" required
          className="w-full h-11 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-brand" />
        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="رقم الهاتف" dir="ltr"
          className="w-full h-11 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-brand text-left" />
        <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="العنوان"
          className="w-full h-11 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-brand" />
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="ملاحظات" rows={2}
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand resize-none" />
        <button type="submit" disabled={addSupplier.isPending || !name.trim()}
          className="w-full h-12 rounded-xl bg-brand text-brand-foreground font-bold flex items-center justify-center gap-2 disabled:opacity-60">
          {addSupplier.isPending ? <Loader2 className="size-5 animate-spin" /> : "حفظ المورد"}
        </button>
        {addSupplier.isError && <p className="text-xs text-destructive text-center">{(addSupplier.error as Error).message}</p>}
      </form>
    </div>
  );
}
