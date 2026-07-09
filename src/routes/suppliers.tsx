import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Search, Plus, Phone, MapPin, Loader2, X, Pencil, Trash2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { PermissionGate } from "@/components/PermissionGate";
import { formatSDG } from "@/lib/format";
import { toast } from "sonner";
import { useSuppliers, useAddSupplier, useUpdateSupplier, useDeleteSupplier, type Supplier } from "@/hooks/use-suppliers";

export const Route = createFileRoute("/suppliers")({
  head: () => ({ meta: [{ title: "الموردين — المهندس" }] }),
  component: SuppliersPageGuarded,
});

function SuppliersPageGuarded() {
  return (
    <PermissionGate perm="suppliers.write">
      <SuppliersPage />
    </PermissionGate>
  );
}

function SuppliersPage() {
  const [q, setQ] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [deleting, setDeleting] = useState<Supplier | null>(null);
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
            <li key={s.id} className="relative rounded-2xl border border-border bg-card p-4 shadow-card hover:border-brand/40 transition">
              <div className="absolute top-2 left-2 flex gap-1">
                <button
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setEditing(s); }}
                  className="grid place-items-center size-7 rounded-lg bg-muted/60 hover:bg-brand hover:text-brand-foreground text-muted-foreground"
                  aria-label="تعديل" title="تعديل"
                >
                  <Pencil className="size-3.5" />
                </button>
                <button
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDeleting(s); }}
                  className="grid place-items-center size-7 rounded-lg bg-muted/60 hover:bg-destructive hover:text-destructive-foreground text-muted-foreground"
                  aria-label="حذف" title="حذف"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
              <Link to="/suppliers/$supplierId" params={{ supplierId: s.id }} className="block">
                <div className="flex items-start justify-between gap-2 pe-16">
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
                    <div className="text-xs text-destructive font-bold nums shrink-0 mt-7">دين: {formatSDG(s.balance)}</div>
                  )}
                </div>
                {s.notes && <p className="mt-2 text-xs text-muted-foreground border-t border-border pt-2">{s.notes}</p>}
              </Link>
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

      {showAdd && <SupplierFormModal mode="add" onClose={() => setShowAdd(false)} />}
      {editing && <SupplierFormModal mode="edit" supplier={editing} onClose={() => setEditing(null)} />}
      {deleting && <DeleteSupplierModal supplier={deleting} onClose={() => setDeleting(null)} />}
    </AppShell>
  );
}

function SupplierFormModal({ mode, supplier, onClose }: { mode: "add" | "edit"; supplier?: Supplier; onClose: () => void }) {
  const addSupplier = useAddSupplier();
  const updateSupplier = useUpdateSupplier();
  const [name, setName] = useState(supplier?.name ?? "");
  const [phone, setPhone] = useState(supplier?.phone ?? "");
  const [address, setAddress] = useState(supplier?.address ?? "");
  const [notes, setNotes] = useState(supplier?.notes ?? "");
  const busy = addSupplier.isPending || updateSupplier.isPending;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      const payload = { name: name.trim(), phone: phone.trim(), address: address.trim(), notes: notes.trim() };
      if (mode === "edit" && supplier) {
        await updateSupplier.mutateAsync({ id: supplier.id, ...payload });
        toast.success("تم تحديث المورد");
      } else {
        await addSupplier.mutateAsync(payload);
        toast.success("تم إضافة المورد");
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
          <h2 className="text-lg font-bold">{mode === "edit" ? "تعديل مورد" : "إضافة مورد"}</h2>
          <button type="button" onClick={onClose} className="p-1"><X className="size-5" /></button>
        </div>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="اسم المورد *" required
          className="w-full h-11 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-brand" />
        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="رقم الهاتف" dir="ltr"
          className="w-full h-11 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-brand text-left" />
        <div className="relative">
          <MapPin className="size-4 absolute top-1/2 -translate-y-1/2 right-3 text-muted-foreground" />
          <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="العنوان"
            className="w-full h-11 rounded-xl border border-border bg-background pr-9 pl-3 text-sm outline-none focus:border-brand" />
        </div>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="ملاحظات" rows={2}
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand resize-none" />
        <button type="submit" disabled={busy || !name.trim()}
          className="w-full h-12 rounded-xl bg-brand text-brand-foreground font-bold flex items-center justify-center gap-2 disabled:opacity-60">
          {busy ? <Loader2 className="size-5 animate-spin" /> : mode === "edit" ? "حفظ التعديلات" : "حفظ المورد"}
        </button>
      </form>
    </div>
  );
}

function DeleteSupplierModal({ supplier, onClose }: { supplier: Supplier; onClose: () => void }) {
  const del = useDeleteSupplier();
  async function handleDelete() {
    try {
      await del.mutateAsync(supplier);
      toast.success("تم حذف المورد");
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md bg-card rounded-2xl p-5 shadow-xl space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-destructive">حذف مورد</h2>
          <button type="button" onClick={onClose} className="p-1"><X className="size-5" /></button>
        </div>
        <p className="text-sm">هل أنت متأكد من حذف <span className="font-bold">{supplier.name}</span>؟</p>
        {supplier.balance > 0 && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs p-2">
            ⚠️ رصيد المورد {formatSDG(supplier.balance)} — يُفضّل تسويته قبل الحذف.
          </div>
        )}
        <div className="rounded-lg bg-sky-50 border border-sky-200 text-sky-900 text-[11px] p-2">
          سيُسجَّل الحذف في سجل التدقيق.
        </div>
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
