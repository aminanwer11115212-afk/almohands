import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
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


import { PartialReturnDialog } from "@/components/PartialReturnDialog";
import {
  Printer,
  Share2,
  Eye,
  RotateCcw,
  Loader2,
  FileText,
  Receipt,
  Phone,
  User,
  Calendar,
  Wallet,
  Trash2,
  SplitSquareHorizontal,
} from "lucide-react";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/errors";


type Props = {
  invoiceId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const statusLabels: Record<string, string> = {
  paid: "مدفوعة",
  partial: "جزئية",
  pending: "معلّقة",
};
const statusClasses: Record<string, string> = {
  paid: "bg-emerald-100 text-emerald-700",
  partial: "bg-amber-100 text-amber-700",
  pending: "bg-rose-100 text-rose-700",
};

export function InvoiceActionsModal({ invoiceId, open, onOpenChange }: Props) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [returning, setReturning] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [partialOpen, setPartialOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["invoice-modal", invoiceId],
    enabled: !!invoiceId && open,

    queryFn: async () => {
      const [invRes, itemsRes] = await Promise.all([
        supabase.from("invoices").select("*").eq("id", invoiceId!).maybeSingle(),
        supabase.from("invoice_items").select("*").eq("invoice_id", invoiceId!),
      ]);
      if (invRes.error) throw invRes.error;
      return { inv: invRes.data, items: itemsRes.data ?? [] };
    },
  });

  const inv = data?.inv;
  const items = data?.items ?? [];

  function goFull(opts: { autoprint?: 0 | 1; autopdf?: 0 | 1; autoshare?: 0 | 1 } = {}) {
    if (!inv) return;
    onOpenChange(false);
    navigate({
      to: "/invoices/$invoiceId",
      params: { invoiceId: inv.id },
      search: {
        autoprint: opts.autoprint ?? 0,
        autopdf: opts.autopdf ?? 0,
        autoshare: opts.autoshare ?? 0,
      },
    });
  }

  // shareText left out — WhatsApp with PDF is triggered via goFull({ autoshare: 1 }).

  async function returnAllToStock() {
    if (!inv || returning) return;
    const eligibleItems = items.filter((i: any) => i.product_id);
    if (eligibleItems.length === 0) {
      toast.error("لا توجد أصناف مربوطة بالمخزن لإرجاعها");
      return;
    }
    const ok = window.confirm(
      `هل تريد إرجاع كامل أصناف الفاتورة #${inv.invoice_number} إلى المخزن؟\nسيتم إعادة الكميات تلقائياً.`,
    );
    if (!ok) return;

    setReturning(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("غير مسجّل الدخول");
      const rows = eligibleItems.map((it: any) => ({
        user_id: u.user!.id,
        invoice_id: inv.id,
        product_id: it.product_id,
        product_name: it.product_name,
        quantity: Number(it.quantity),
        reason: `إرجاع فاتورة #${inv.invoice_number}`,
        status: "accepted" as const,
      }));
      const { error } = await supabase.from("returns").insert(rows);
      if (error) throw error;
      invalidateAll();
      toast.success("تم إرجاع الأصناف إلى المخزن");
      onOpenChange(false);
    } catch (err) {
      toast.error(getErrorMessage(err, "تعذّر تنفيذ الإرجاع"));
    } finally {
      setReturning(false);
    }
  }

  async function deleteInvoiceWithRestore() {
    if (!inv || deleting) return;

    // Read any payments linked to this invoice so the confirmation is honest.
    const { data: linkedPays } = await supabase
      .from("payments")
      .select("id, amount, account_id")
      .eq("invoice_id", inv.id);
    const paysCount = linkedPays?.length ?? 0;
    const paysTotal = (linkedPays ?? []).reduce(
      (s: number, p: any) => s + Number(p.amount || 0),
      0,
    );

    const ok = window.confirm(
      `⚠️ حذف الفاتورة #${inv.invoice_number} نهائياً\n\n` +
        `- ستُعاد كل الأصناف إلى المخزن\n` +
        `- ستُخصم من إجمالي المبيعات\n` +
        (paysCount > 0
          ? `- سيتم حذف ${paysCount} دفعة مرتبطة (بقيمة ${paysTotal}) وخصمها من رصيد الحسابات\n`
          : "") +
        `- لا يمكن التراجع عن هذا الإجراء\n\nمتابعة؟`,
    );
    if (!ok) return;

    setDeleting(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("غير مسجّل الدخول");

      // 1) Restore stock via returns (only for still-in-stock-linked items)
      const eligibleItems = items.filter((i: any) => i.product_id);
      if (eligibleItems.length > 0) {
        // Skip items already fully returned to avoid double-restore
        const { data: prev } = await supabase
          .from("returns")
          .select("product_id, quantity")
          .eq("invoice_id", inv.id)
          .eq("status", "accepted");
        const returnedMap: Record<string, number> = {};
        (prev ?? []).forEach((r: any) => {
          if (!r.product_id) return;
          returnedMap[r.product_id] = (returnedMap[r.product_id] ?? 0) + Number(r.quantity || 0);
        });
        const rows = eligibleItems
          .map((it: any) => {
            const already = returnedMap[it.product_id] ?? 0;
            const qty = Math.max(0, Number(it.quantity) - already);
            return qty > 0
              ? {
                  user_id: u.user!.id,
                  invoice_id: inv.id,
                  product_id: it.product_id,
                  product_name: it.product_name,
                  quantity: qty,
                  reason: `حذف فاتورة #${inv.invoice_number}`,
                  status: "accepted" as const,
                }
              : null;
          })
          .filter(Boolean) as any[];
        if (rows.length > 0) {
          const { error: retErr } = await supabase.from("returns").insert(rows);
          if (retErr) throw retErr;
        }
      }

      // 2) Delete linked payments first — payments.invoice_id has no FK,
      //    so without this the account balances view keeps summing them
      //    after the invoice is gone (orphaned money).
      if (paysCount > 0) {
        const { error: payErr } = await supabase
          .from("payments")
          .delete()
          .eq("invoice_id", inv.id);
        if (payErr) throw payErr;
      }

      // 3) Delete invoice (invoice_items cascade; returns.invoice_id set NULL)
      const { error: delErr } = await supabase.from("invoices").delete().eq("id", inv.id);
      if (delErr) throw delErr;

      invalidateAll();
      toast.success(
        paysCount > 0
          ? `تم حذف الفاتورة وإرجاع المخزون وحذف ${paysCount} دفعة من الحسابات`
          : "تم حذف الفاتورة وإرجاع المخزون",
      );
      onOpenChange(false);
    } catch (err) {
      toast.error(getErrorMessage(err, "تعذّر حذف الفاتورة"));
    } finally {
      setDeleting(false);
    }
  }


  function invalidateAll() {
    if (!inv) return;
    qc.invalidateQueries({ queryKey: ["products"] });
    qc.invalidateQueries({ queryKey: ["returns"] });
    qc.invalidateQueries({ queryKey: ["invoices"] });
    qc.invalidateQueries({ queryKey: ["invoice-modal", inv.id] });
    qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    qc.invalidateQueries({ queryKey: ["dashboard-insights"] });
    qc.invalidateQueries({ queryKey: ["accounts"] });
  }


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Receipt className="size-5 text-brand" />
            {inv ? (
              <span>
                فاتورة <span className="nums">#{inv.invoice_number}</span>
              </span>
            ) : (
              "فاتورة"
            )}
            {inv && (
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full ${
                  statusClasses[inv.status] ?? "bg-muted text-muted-foreground"
                }`}
              >
                {statusLabels[inv.status] ?? inv.status}
              </span>
            )}
          </DialogTitle>
          <DialogDescription className="sr-only">
            معاينة الفاتورة والإجراءات المتاحة
          </DialogDescription>
        </DialogHeader>

        {isLoading || !inv ? (
          <div className="p-8 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
            <Loader2 className="size-6 animate-spin" />
            جارٍ التحميل…
          </div>
        ) : (
          <>
            {/* Meta */}
            <div className="grid grid-cols-2 gap-2 text-sm bg-muted/40 rounded-lg p-3">
              <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                <User className="size-3.5" />
                <span className="truncate">{inv.customer_name || "عميل نقدي"}</span>
              </div>
              <div className="flex items-center gap-1.5 text-muted-foreground text-xs justify-end">
                <Calendar className="size-3.5" />
                <span className="nums">
                  {new Date(inv.created_at).toLocaleString("ar-EG", {
                    dateStyle: "short",
                    timeStyle: "short",
                  })}
                </span>
              </div>
              {inv.customer_phone && (
                <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                  <Phone className="size-3.5" />
                  <span className="nums" dir="ltr">
                    {inv.customer_phone}
                  </span>
                </div>
              )}
              <div className="flex items-center gap-1.5 text-muted-foreground text-xs justify-end">
                <Wallet className="size-3.5" />
                <span>
                  {inv.payment_method === "bank"
                    ? "تحويل بنكي"
                    : inv.payment_method === "mixed"
                    ? "مختلط"
                    : "نقدي"}
                </span>
              </div>
            </div>

            {/* Items */}
            <div className="border border-border rounded-lg overflow-hidden">
              <div className="px-3 py-2 bg-muted/60 text-xs font-bold flex items-center justify-between">
                <span>الأصناف ({items.length})</span>
                <span className="text-muted-foreground font-normal">الإجمالي</span>
              </div>
              <ul className="max-h-48 overflow-y-auto divide-y divide-border text-sm">
                {items.length === 0 ? (
                  <li className="p-3 text-center text-xs text-muted-foreground">
                    لا توجد أصناف
                  </li>
                ) : (
                  items.map((it: any) => (
                    <li key={it.id} className="p-2.5 flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="truncate">{it.product_name}</div>
                        <div className="text-[11px] text-muted-foreground nums">
                          {formatSDG(Number(it.unit_price))} × {it.quantity}
                        </div>
                      </div>
                      <div className="text-sm font-semibold nums shrink-0">
                        {formatSDG(Number(it.line_total))}
                      </div>
                    </li>
                  ))
                )}
              </ul>
            </div>

            {/* Totals */}
            <div className="rounded-lg border border-border p-3 space-y-1 text-sm">
              <Row label="المجموع الفرعي" value={formatSDG(Number(inv.subtotal))} />
              {Number(inv.discount) > 0 && (
                <Row label="الخصم" value={`- ${formatSDG(Number(inv.discount))}`} />
              )}
              <Row label="الإجمالي" value={formatSDG(Number(inv.total))} bold />
              <Row label="المدفوع" value={formatSDG(Number(inv.paid))} />
              {Number(inv.remaining) > 0 && (
                <Row
                  label="المتبقي"
                  value={formatSDG(Number(inv.remaining))}
                  className="text-rose-600"
                  bold
                />
              )}
            </div>

            {/* Actions */}
            <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-2 pt-2">
              <div className="grid grid-cols-2 gap-2 w-full">
                <ActionBtn onClick={() => goFull({ autoprint: 1 })} icon={Printer} tone="primary">
                  طباعة
                </ActionBtn>
                <ActionBtn onClick={() => goFull({ autoshare: 1 })} icon={Share2} tone="whatsapp">
                  واتساب (PDF)
                </ActionBtn>
                <ActionBtn onClick={() => goFull()} icon={Eye}>
                  معاينة كاملة
                </ActionBtn>
                <ActionBtn onClick={() => goFull({ autopdf: 1 })} icon={FileText}>
                  PDF
                </ActionBtn>

                <div className="col-span-2 h-px bg-border my-1" />

                <button
                  type="button"
                  onClick={() => setPartialOpen(true)}
                  className="flex items-center justify-center gap-2 text-sm font-bold rounded-lg px-3 py-2.5 bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition"
                >
                  <SplitSquareHorizontal className="size-4" />
                  إرجاع جزئي
                </button>
                <button
                  type="button"
                  onClick={returnAllToStock}
                  disabled={returning}
                  className="flex items-center justify-center gap-2 text-sm font-bold rounded-lg px-3 py-2.5 bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 disabled:opacity-60 transition"
                >
                  {returning ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
                  إرجاع الكل
                </button>

                <button
                  type="button"
                  onClick={deleteInvoiceWithRestore}
                  disabled={deleting}
                  className="col-span-2 flex items-center justify-center gap-2 text-sm font-bold rounded-lg px-3 py-2.5 bg-destructive text-destructive-foreground hover:opacity-90 disabled:opacity-60 transition"
                >
                  {deleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                  حذف الفاتورة + إرجاع كل المخزون
                </button>
              </div>
            </DialogFooter>

            <PartialReturnDialog
              invoiceId={inv.id}
              invoiceNumber={inv.invoice_number}
              items={items as any}
              open={partialOpen}
              onOpenChange={setPartialOpen}
              onDone={() => onOpenChange(false)}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );

}

function Row({
  label,
  value,
  bold,
  className,
}: {
  label: string;
  value: string;
  bold?: boolean;
  className?: string;
}) {
  return (
    <div className={`flex items-center justify-between ${className ?? ""}`}>
      <span className={`text-xs text-muted-foreground ${bold ? "font-bold text-foreground" : ""}`}>
        {label}
      </span>
      <span className={`nums ${bold ? "font-bold" : ""}`}>{value}</span>
    </div>
  );
}

function ActionBtn({
  onClick,
  icon: Icon,
  children,
  tone,
}: {
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  tone?: "primary" | "whatsapp";
}) {
  const cls =
    tone === "primary"
      ? "bg-brand text-brand-foreground hover:opacity-90"
      : tone === "whatsapp"
      ? "bg-emerald-500 text-white hover:bg-emerald-600"
      : "bg-card border border-border text-foreground hover:bg-muted";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-center gap-1.5 text-sm font-bold rounded-lg px-3 py-2.5 transition ${cls}`}
    >
      <Icon className="size-4" />
      {children}
    </button>
  );
}
