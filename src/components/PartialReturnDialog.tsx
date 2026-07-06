import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { formatSDG } from "@/lib/format";
import { RotateCcw, Loader2, Package, Minus, Plus } from "lucide-react";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/errors";

type InvoiceItem = {
  id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
};

type Props = {
  invoiceId: string | null;
  invoiceNumber: number | string | null;
  items: InvoiceItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone?: () => void;
};

/**
 * PartialReturnDialog — return specific quantities per item to stock.
 * Inserts one row per non-zero item into `returns` with status='accepted';
 * the DB trigger restores stock automatically.
 */
export function PartialReturnDialog({
  invoiceId,
  invoiceNumber,
  items,
  open,
  onOpenChange,
  onDone,
}: Props) {
  const qc = useQueryClient();
  const [qtyMap, setQtyMap] = useState<Record<string, number>>({});
  const [reason, setReason] = useState("");
  const [alreadyReturned, setAlreadyReturned] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);

  // Reset + fetch previously-returned quantities per item when opened
  useEffect(() => {
    if (!open || !invoiceId) return;
    setQtyMap({});
    setReason("");
    (async () => {
      const { data } = await supabase
        .from("returns")
        .select("product_id, quantity")
        .eq("invoice_id", invoiceId)
        .eq("status", "accepted");
      const map: Record<string, number> = {};
      (data ?? []).forEach((r: any) => {
        if (!r.product_id) return;
        map[r.product_id] = (map[r.product_id] ?? 0) + Number(r.quantity || 0);
      });
      setAlreadyReturned(map);
    })();
  }, [open, invoiceId]);

  const eligibleItems = useMemo(
    () => items.filter((it) => it.product_id),
    [items],
  );

  const totalRefund = useMemo(() => {
    return eligibleItems.reduce((sum, it) => {
      const q = qtyMap[it.id] || 0;
      return sum + q * Number(it.unit_price || 0);
    }, 0);
  }, [qtyMap, eligibleItems]);

  const totalUnits = Object.values(qtyMap).reduce((s, v) => s + (v || 0), 0);

  function setQty(item: InvoiceItem, next: number) {
    const remaining = maxReturnable(item);
    const clamped = Math.max(0, Math.min(remaining, next));
    setQtyMap((m) => ({ ...m, [item.id]: clamped }));
  }

  function maxReturnable(item: InvoiceItem) {
    const already = item.product_id ? alreadyReturned[item.product_id] ?? 0 : 0;
    return Math.max(0, Number(item.quantity || 0) - already);
  }

  async function submit() {
    if (!invoiceId || submitting) return;
    if (totalUnits <= 0) {
      toast.error("اختر كمية للإرجاع");
      return;
    }
    setSubmitting(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("غير مسجّل الدخول");
      const rows = eligibleItems
        .filter((it) => (qtyMap[it.id] || 0) > 0)
        .map((it) => ({
          user_id: u.user!.id,
          invoice_id: invoiceId,
          product_id: it.product_id!,
          product_name: it.product_name,
          quantity: qtyMap[it.id],
          reason: reason.trim() || `إرجاع جزئي من فاتورة #${invoiceNumber}`,
          status: "accepted" as const,
        }));
      const { error } = await supabase.from("returns").insert(rows);
      if (error) throw error;

      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["returns"] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["invoice-modal", invoiceId] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      qc.invalidateQueries({ queryKey: ["dashboard-insights"] });

      toast.success(`تم إرجاع ${totalUnits} وحدة (${formatSDG(totalRefund)}) للمخزن`);
      onOpenChange(false);
      onDone?.();
    } catch (err) {
      toast.error(getErrorMessage(err, "تعذّر تنفيذ الإرجاع"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <RotateCcw className="size-5 text-amber-600" />
            إرجاع جزئي — فاتورة #{invoiceNumber}
          </DialogTitle>
          <DialogDescription>
            حدّد الكمية المرجعة لكل صنف. سيتم إعادتها فوراً إلى المخزن.
          </DialogDescription>
        </DialogHeader>

        {eligibleItems.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            لا توجد أصناف مربوطة بالمخزن قابلة للإرجاع.
          </div>
        ) : (
          <>
            <ul className="divide-y divide-border rounded-xl border border-border overflow-hidden">
              {eligibleItems.map((it) => {
                const max = maxReturnable(it);
                const already = it.product_id ? alreadyReturned[it.product_id] ?? 0 : 0;
                const val = qtyMap[it.id] || 0;
                const disabled = max === 0;
                return (
                  <li key={it.id} className="p-3 flex items-center gap-3 bg-card">
                    <div className="grid size-9 place-items-center rounded-lg bg-brand/10 text-brand shrink-0">
                      <Package className="size-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold truncate">{it.product_name}</div>
                      <div className="text-[11px] text-muted-foreground nums">
                        {formatSDG(Number(it.unit_price))} × كمية أصلية {it.quantity}
                        {already > 0 && ` — أُرجع سابقاً: ${already}`}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => setQty(it, val - 1)}
                        disabled={disabled || val <= 0}
                        className="grid size-8 place-items-center rounded-md border border-input bg-background hover:bg-muted disabled:opacity-40"
                        aria-label="إنقاص"
                      >
                        <Minus className="size-3.5" />
                      </button>
                      <input
                        type="number"
                        inputMode="numeric"
                        value={val}
                        min={0}
                        max={max}
                        disabled={disabled}
                        onChange={(e) => setQty(it, Number(e.target.value) || 0)}
                        className="w-14 h-8 rounded-md border border-input bg-background text-center text-sm nums disabled:opacity-40"
                      />
                      <button
                        type="button"
                        onClick={() => setQty(it, val + 1)}
                        disabled={disabled || val >= max}
                        className="grid size-8 place-items-center rounded-md border border-input bg-background hover:bg-muted disabled:opacity-40"
                        aria-label="زيادة"
                      >
                        <Plus className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setQty(it, max)}
                        disabled={disabled}
                        className="text-[10px] text-brand hover:underline px-1 disabled:opacity-40"
                      >
                        الكل
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>

            <div>
              <label className="text-xs font-semibold text-muted-foreground">
                السبب (اختياري)
              </label>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="مثال: منتج معيب، خطأ في الطلب…"
                className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div className="flex items-center justify-between rounded-lg bg-muted/50 p-3 border border-border">
              <div>
                <div className="text-[11px] text-muted-foreground">إجمالي المرجع</div>
                <div className="text-lg font-black text-foreground nums">
                  {formatSDG(totalRefund)}
                </div>
              </div>
              <div className="text-end">
                <div className="text-[11px] text-muted-foreground">عدد الوحدات</div>
                <div className="text-lg font-black text-amber-600 nums">{totalUnits}</div>
              </div>
            </div>

            <DialogFooter className="gap-2">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                disabled={submitting}
                className="px-4 py-2 rounded-lg border border-border text-sm font-semibold hover:bg-muted"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={submitting || totalUnits === 0}
                className="flex-1 sm:flex-none px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-bold hover:bg-amber-700 disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {submitting ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
                تأكيد الإرجاع
              </button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
