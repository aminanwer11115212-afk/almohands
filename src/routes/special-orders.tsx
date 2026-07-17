import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus, Loader2, Pencil, Trash2, Search, MoreVertical, Check, FileDown, FileSpreadsheet, Receipt, History } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { PermissionGate } from "@/components/PermissionGate";
import { toast } from "sonner";
import { handleError } from "@/lib/errors";
import { formatSDG } from "@/lib/format";
import { useMyRole } from "@/hooks/use-permissions";
import { useCustomers } from "@/hooks/use-customers";
import { useSuppliers } from "@/hooks/use-suppliers";
import { exportPdfFromRows } from "@/lib/pdf-html-export";
import { buildCsvBlob, saveBlob } from "@/lib/csv-export";
import {
  useSpecialOrders,
  useAddSpecialOrder,
  useUpdateSpecialOrder,
  useUpdateSpecialOrderStatus,
  useDeleteSpecialOrder,
  useSpecialOrderHistory,
  type SpecialOrder,
  type SpecialOrderPriority,
  type SpecialOrderStatus,
} from "@/hooks/use-special-orders";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/special-orders")({
  head: () => ({ meta: [{ title: "طلبات النظام — المهندس" }] }),
  component: SpecialOrdersPageGuarded,
});

function SpecialOrdersPageGuarded() {
  return (
    <PermissionGate perm="special_orders.view">
      <SpecialOrdersPage />
    </PermissionGate>
  );
}

const STATUS_LABELS: Record<SpecialOrderStatus, string> = {
  requested: "مطلوب",
  contacted: "تم التواصل",
  ordered: "تم الطلب من المورد",
  arrived: "وصل",
  delivered: "تم التسليم",
  cancelled: "ملغى",
};

const STATUS_BADGE: Record<SpecialOrderStatus, string> = {
  requested: "bg-muted text-foreground",
  contacted: "bg-blue-500/10 text-blue-700",
  ordered: "bg-amber-500/10 text-amber-700",
  arrived: "bg-emerald-500/10 text-emerald-700",
  delivered: "bg-primary/10 text-primary",
  cancelled: "bg-destructive/10 text-destructive",
};

const PRIORITY_LABELS: Record<SpecialOrderPriority, string> = {
  low: "منخفضة",
  normal: "عادية",
  high: "عالية",
  urgent: "عاجلة",
};

const PRIORITY_BADGE: Record<SpecialOrderPriority, string> = {
  low: "bg-muted text-muted-foreground",
  normal: "bg-blue-500/10 text-blue-700",
  high: "bg-amber-500/10 text-amber-700",
  urgent: "bg-destructive/10 text-destructive",
};

const STATUS_ORDER: SpecialOrderStatus[] = ["requested", "contacted", "ordered", "arrived", "delivered", "cancelled"];

function StatusBadge({ status }: { status: SpecialOrderStatus }) {
  return <Badge className={STATUS_BADGE[status] + " border-transparent"}>{STATUS_LABELS[status]}</Badge>;
}
function PriorityBadge({ priority }: { priority: SpecialOrderPriority }) {
  return <Badge className={PRIORITY_BADGE[priority] + " border-transparent"}>{PRIORITY_LABELS[priority]}</Badge>;
}

function SpecialOrdersPage() {
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<SpecialOrderStatus | "all">("all");
  const [priorityFilter, setPriorityFilter] = useState<SpecialOrderPriority | "all">("all");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<SpecialOrder | null>(null);
  const [cancelling, setCancelling] = useState<SpecialOrder | null>(null);
  const [deleting, setDeleting] = useState<SpecialOrder | null>(null);

  const { data: orders = [], isLoading, isError } = useSpecialOrders();
  const { isAdmin } = useMyRole();
  const updateStatus = useUpdateSpecialOrderStatus();
  const navigate = useNavigate();

  const filtered = useMemo(() => {
    return orders.filter((o) => {
      if (statusFilter !== "all" && o.status !== statusFilter) return false;
      if (priorityFilter !== "all" && o.priority !== priorityFilter) return false;
      if (q.trim()) {
        const needle = q.trim().toLowerCase();
        const hay = `${o.item_name} ${o.customer_name ?? ""} ${o.description ?? ""}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [orders, q, statusFilter, priorityFilter]);

  const stats = useMemo(() => {
    const open = orders.filter((o) => ["requested", "contacted"].includes(o.status)).length;
    const ordering = orders.filter((o) => o.status === "ordered").length;
    const arrived = orders.filter((o) => o.status === "arrived").length;
    const delivered = orders.filter((o) => o.status === "delivered").length;
    const cancelled = orders.filter((o) => o.status === "cancelled").length;
    return { open, ordering, arrived, delivered, cancelled };
  }, [orders]);

  function handleStatusChange(order: SpecialOrder, status: SpecialOrderStatus) {
    if (status === "cancelled") {
      setCancelling(order);
      return;
    }
    updateStatus.mutate(
      { id: order.id, status },
      {
        onSuccess: () => {
          toast.success("تم تحديث الحالة");
          if (status === "delivered") {
            toast("هل تريد إنشاء فاتورة لهذا الطلب؟", {
              action: {
                label: "إنشاء فاتورة",
                onClick: () => {
                  localStorage.setItem(
                    "pending_special_order",
                    JSON.stringify({
                      item_name: order.item_name,
                      customer_name: order.customer_name,
                      customer_phone: order.customer_phone,
                      quantity: order.quantity,
                      target_price: order.target_price,
                    })
                  );
                  navigate({ to: "/cashier" });
                },
              },
            });
          }
        },
        onError: (err) => handleError(err, "تعذّر تحديث الحالة"),
      }
    );
  }

  return (
    <AppShell
      title="طلبات النظام"
      showBack
      rightAction={
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 h-9 px-3 rounded-xl bg-brand text-brand-foreground text-sm font-bold hover:opacity-95 transition"
        >
          <Plus className="size-4" /> طلب جديد
        </button>
      }
    >
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-5">
        <StatCard label="مفتوحة" value={stats.open} />
        <StatCard label="قيد التوريد" value={stats.ordering} />
        <StatCard label="وصلت" value={stats.arrived} />
        <StatCard label="تم التسليم" value={stats.delivered} />
        <StatCard label="ملغاة" value={stats.cancelled} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ابحث بالصنف أو العميل أو الوصف"
            className="w-full h-10 rounded-xl border border-border bg-card pr-9 pl-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as SpecialOrderStatus | "all")}
          className="h-10 rounded-xl border border-border bg-card px-3 text-sm outline-none focus:border-brand"
        >
          <option value="all">كل الحالات</option>
          {STATUS_ORDER.map((s) => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </select>
        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value as SpecialOrderPriority | "all")}
          className="h-10 rounded-xl border border-border bg-card px-3 text-sm outline-none focus:border-brand"
        >
          <option value="all">كل الأولويات</option>
          {(Object.keys(PRIORITY_LABELS) as SpecialOrderPriority[]).map((p) => (
            <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <div className="py-16 grid place-items-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
      ) : isError ? (
        <p className="py-10 text-center text-sm text-destructive">تعذّر تحميل الطلبات</p>
      ) : filtered.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          {orders.length === 0 ? "لا توجد طلبات بعد — اضغط «طلب جديد» لإضافة طلب" : "لا توجد نتائج مطابقة"}
        </p>
      ) : (
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-end">التاريخ</TableHead>
                <TableHead className="text-end">العميل</TableHead>
                <TableHead className="text-end">الصنف</TableHead>
                <TableHead className="text-end">الوصف</TableHead>
                <TableHead className="text-end">الكمية</TableHead>
                <TableHead className="text-end">السعر المستهدف</TableHead>
                <TableHead className="text-end">المورد المقترح</TableHead>
                <TableHead className="text-end">الأولوية</TableHead>
                <TableHead className="text-end">الحالة</TableHead>
                <TableHead className="text-end">التاريخ المتوقع</TableHead>
                <TableHead className="text-end">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="text-end nums text-xs">{new Date(o.created_at).toLocaleDateString("en-GB")}</TableCell>
                  <TableCell className="text-end">
                    <div className="font-semibold">{o.customer_name || "—"}</div>
                    {o.customer_phone && <div className="text-xs text-muted-foreground nums" dir="ltr">{o.customer_phone}</div>}
                  </TableCell>
                  <TableCell className="text-end font-semibold">{o.item_name}</TableCell>
                  <TableCell className="text-end text-xs text-muted-foreground max-w-[180px] truncate">{o.description || "—"}</TableCell>
                  <TableCell className="text-end nums">{o.quantity}</TableCell>
                  <TableCell className="text-end nums">{o.target_price != null ? formatSDG(o.target_price) : "—"}</TableCell>
                  <TableCell className="text-end">{o.supplier_name || "—"}</TableCell>
                  <TableCell className="text-end"><PriorityBadge priority={o.priority} /></TableCell>
                  <TableCell className="text-end">
                    <StatusBadge status={o.status} />
                    {o.status === "cancelled" && o.cancellation_reason && (
                      <div className="text-[10px] text-muted-foreground mt-1">{o.cancellation_reason}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-end nums text-xs">{o.expected_at || "—"}</TableCell>
                  <TableCell className="text-end">
                    <div className="flex items-center justify-end gap-1">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="grid place-items-center size-8 rounded-lg bg-muted/60 hover:bg-brand hover:text-brand-foreground text-muted-foreground" title="تغيير الحالة">
                            <MoreVertical className="size-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {STATUS_ORDER.map((s) => (
                            <DropdownMenuItem key={s} onClick={() => handleStatusChange(o, s)} disabled={o.status === s}>
                              {o.status === s && <Check className="size-3.5" />}
                              {STATUS_LABELS[s]}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <button
                        onClick={() => setEditing(o)}
                        className="grid place-items-center size-8 rounded-lg bg-muted/60 hover:bg-brand hover:text-brand-foreground text-muted-foreground"
                        title="تعديل"
                      >
                        <Pencil className="size-4" />
                      </button>
                      {isAdmin && (
                        <button
                          onClick={() => setDeleting(o)}
                          className="grid place-items-center size-8 rounded-lg bg-muted/60 hover:bg-destructive hover:text-destructive-foreground text-muted-foreground"
                          title="حذف"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {(showForm || editing) && (
        <OrderFormDialog
          order={editing}
          onClose={() => { setShowForm(false); setEditing(null); }}
        />
      )}
      {cancelling && (
        <CancelDialog order={cancelling} onClose={() => setCancelling(null)} />
      )}
      {deleting && (
        <DeleteDialog order={deleting} onClose={() => setDeleting(null)} />
      )}
    </AppShell>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3 text-center shadow-card">
      <div className="text-xl font-bold nums text-brand">{value}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}

function OrderFormDialog({ order, onClose }: { order: SpecialOrder | null; onClose: () => void }) {
  const isEdit = !!order;
  const addOrder = useAddSpecialOrder();
  const updateOrder = useUpdateSpecialOrder();

  const [customerQuery, setCustomerQuery] = useState(order?.customer_name ?? "");
  const [customerId, setCustomerId] = useState<string | null>(order?.customer_id ?? null);
  const [customerPhone, setCustomerPhone] = useState(order?.customer_phone ?? "");
  const [showCustomerList, setShowCustomerList] = useState(false);
  const { data: customers = [] } = useCustomers(customerQuery);

  const [supplierQuery, setSupplierQuery] = useState(order?.supplier_name ?? "");
  const [supplierId, setSupplierId] = useState<string | null>(order?.supplier_id ?? null);
  const [showSupplierList, setShowSupplierList] = useState(false);
  const { data: suppliers = [] } = useSuppliers(supplierQuery);

  const [itemName, setItemName] = useState(order?.item_name ?? "");
  const [description, setDescription] = useState(order?.description ?? "");
  const [quantity, setQuantity] = useState(String(order?.quantity ?? 1));
  const [targetPrice, setTargetPrice] = useState(order?.target_price != null ? String(order.target_price) : "");
  const [priority, setPriority] = useState<SpecialOrderPriority>(order?.priority ?? "normal");
  const [expectedAt, setExpectedAt] = useState(order?.expected_at ?? "");
  const [notes, setNotes] = useState(order?.notes ?? "");

  const busy = addOrder.isPending || updateOrder.isPending;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!itemName.trim()) {
      toast.error("اسم الصنف مطلوب");
      return;
    }
    const qty = parseInt(quantity, 10);
    if (!Number.isFinite(qty) || qty <= 0) {
      toast.error("الكمية يجب أن تكون رقمًا أكبر من صفر");
      return;
    }
    const price = targetPrice.trim() ? parseFloat(targetPrice) : null;
    if (targetPrice.trim() && (!Number.isFinite(price as number) || (price as number) < 0)) {
      toast.error("السعر المستهدف غير صالح");
      return;
    }
    const payload = {
      customer_id: customerId,
      customer_name: customerQuery.trim() || null,
      customer_phone: customerPhone.trim() || null,
      item_name: itemName.trim(),
      description: description.trim() || null,
      quantity: qty,
      target_price: price,
      supplier_id: supplierId,
      supplier_name: supplierQuery.trim() || null,
      notes: notes.trim() || null,
      priority,
      expected_at: expectedAt || null,
    };
    try {
      if (isEdit && order) {
        await updateOrder.mutateAsync({ id: order.id, ...payload });
        toast.success("تم تحديث الطلب");
      } else {
        await addOrder.mutateAsync(payload);
        toast.success("تم إضافة الطلب");
      }
      onClose();
    } catch (err) {
      handleError(err, isEdit ? "تعذّر تحديث الطلب" : "تعذّر إضافة الطلب", { context: { scope: "special_orders" } });
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg text-end" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-end">{isEdit ? "تعديل طلب" : "طلب جديد"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3 max-h-[70vh] overflow-y-auto pe-1">
          <Field label="اسم الصنف *">
            <input value={itemName} onChange={(e) => setItemName(e.target.value)} required
              className="w-full h-11 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-brand text-end" />
          </Field>
          <Field label="الوصف">
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand resize-none text-end" />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="الكمية *">
              <input type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)}
                className="w-full h-11 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-brand nums" />
            </Field>
            <Field label="السعر المستهدف">
              <input inputMode="decimal" value={targetPrice} onChange={(e) => setTargetPrice(e.target.value)}
                className="w-full h-11 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-brand nums" />
            </Field>
          </div>

          {/* Customer combobox-like */}
          <Field label="العميل">
            <div className="relative">
              <input
                value={customerQuery}
                onChange={(e) => { setCustomerQuery(e.target.value); setCustomerId(null); setShowCustomerList(true); }}
                onFocus={() => setShowCustomerList(true)}
                onBlur={() => setTimeout(() => setShowCustomerList(false), 150)}
                placeholder="اكتب اسم العميل أو اختر من القائمة"
                className="w-full h-11 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-brand text-end"
              />
              {showCustomerList && customerQuery.trim() && customers.length > 0 && (
                <div className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto rounded-xl border border-border bg-popover shadow-md">
                  {customers.map((c) => (
                    <button
                      type="button"
                      key={c.id}
                      onMouseDown={() => {
                        setCustomerId(c.id);
                        setCustomerQuery(c.name);
                        setCustomerPhone(c.phone ?? "");
                        setShowCustomerList(false);
                      }}
                      className="block w-full text-end px-3 py-2 text-sm hover:bg-accent"
                    >
                      {c.name} {c.phone ? `— ${c.phone}` : ""}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </Field>
          <Field label="هاتف العميل">
            <input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} dir="ltr"
              className="w-full h-11 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-brand text-left" />
          </Field>

          {/* Supplier combobox-like */}
          <Field label="المورد المقترح">
            <div className="relative">
              <input
                value={supplierQuery}
                onChange={(e) => { setSupplierQuery(e.target.value); setSupplierId(null); setShowSupplierList(true); }}
                onFocus={() => setShowSupplierList(true)}
                onBlur={() => setTimeout(() => setShowSupplierList(false), 150)}
                placeholder="اكتب اسم المورد أو اختر من القائمة"
                className="w-full h-11 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-brand text-end"
              />
              {showSupplierList && supplierQuery.trim() && suppliers.length > 0 && (
                <div className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto rounded-xl border border-border bg-popover shadow-md">
                  {suppliers.map((s) => (
                    <button
                      type="button"
                      key={s.id}
                      onMouseDown={() => {
                        setSupplierId(s.id);
                        setSupplierQuery(s.name);
                        setShowSupplierList(false);
                      }}
                      className="block w-full text-end px-3 py-2 text-sm hover:bg-accent"
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-2">
            <Field label="الأولوية">
              <select value={priority} onChange={(e) => setPriority(e.target.value as SpecialOrderPriority)}
                className="w-full h-11 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-brand text-end">
                {(Object.keys(PRIORITY_LABELS) as SpecialOrderPriority[]).map((p) => (
                  <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
                ))}
              </select>
            </Field>
            <Field label="التاريخ المتوقع">
              <input type="date" value={expectedAt ?? ""} onChange={(e) => setExpectedAt(e.target.value)}
                className="w-full h-11 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-brand nums" />
            </Field>
          </div>

          <Field label="ملاحظات">
            <textarea value={notes ?? ""} onChange={(e) => setNotes(e.target.value)} rows={2}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand resize-none text-end" />
          </Field>

          <DialogFooter className="pt-2">
            <button type="submit" disabled={busy}
              className="w-full h-12 rounded-xl bg-brand text-brand-foreground font-bold flex items-center justify-center gap-2 disabled:opacity-60">
              {busy ? <Loader2 className="size-5 animate-spin" /> : isEdit ? "حفظ التعديلات" : "حفظ الطلب"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CancelDialog({ order, onClose }: { order: SpecialOrder; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const updateStatus = useUpdateSpecialOrderStatus();
  async function handleConfirm() {
    try {
      await updateStatus.mutateAsync({ id: order.id, status: "cancelled", cancellation_reason: reason.trim() || null });
      toast.success("تم إلغاء الطلب");
      onClose();
    } catch (err) {
      handleError(err, "تعذّر إلغاء الطلب");
    }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md text-end" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-end text-destructive">إلغاء الطلب</DialogTitle>
        </DialogHeader>
        <p className="text-sm">سبب الإلغاء لطلب <span className="font-bold">{order.item_name}</span>:</p>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          placeholder="اكتب سبب الإلغاء (اختياري)"
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand resize-none text-end"
        />
        <DialogFooter>
          <button onClick={onClose} className="flex-1 h-11 rounded-xl border border-border bg-background text-sm font-bold">تراجع</button>
          <button onClick={handleConfirm} disabled={updateStatus.isPending}
            className="flex-1 h-11 rounded-xl bg-destructive text-destructive-foreground font-bold flex items-center justify-center gap-2 disabled:opacity-60">
            {updateStatus.isPending ? <Loader2 className="size-4 animate-spin" /> : "تأكيد الإلغاء"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDialog({ order, onClose }: { order: SpecialOrder; onClose: () => void }) {
  const del = useDeleteSpecialOrder();
  async function handleDelete() {
    try {
      await del.mutateAsync(order.id);
      toast.success("تم حذف الطلب");
      onClose();
    } catch (err) {
      handleError(err, "تعذّر حذف الطلب");
    }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md text-end" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-end text-destructive">حذف طلب</DialogTitle>
        </DialogHeader>
        <p className="text-sm">هل أنت متأكد من حذف طلب <span className="font-bold">{order.item_name}</span>؟</p>
        <DialogFooter>
          <button onClick={onClose} className="flex-1 h-11 rounded-xl border border-border bg-background text-sm font-bold">إلغاء</button>
          <button onClick={handleDelete} disabled={del.isPending}
            className="flex-1 h-11 rounded-xl bg-destructive text-destructive-foreground font-bold flex items-center justify-center gap-2 disabled:opacity-60">
            {del.isPending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
            حذف نهائي
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
