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
import { buildInvoiceText, openWhatsAppShare } from "@/lib/invoice-share";
import { useStoreProfile } from "@/hooks/use-store-profile";
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
  const { data: store } = useStoreProfile();
  const [returning, setReturning] = useState(false);

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

  function goFull(autoprint: 0 | 1) {
    if (!inv) return;
    onOpenChange(false);
    navigate({
      to: "/invoices/$invoiceId",
      params: { invoiceId: inv.id },
      search: { autoprint },
    });
  }

  function share() {
    if (!inv) return;
    const text = buildInvoiceText(
      inv,
      items,
      store?.name || "المهندس",
      { includeItems: true, footer: store?.invoice_footer || undefined },
    );
    openWhatsAppShare(inv.customer_phone, text);
  }

  async function returnToStock() {
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
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["returns"] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["invoice-modal", inv.id] });
      toast.success("تم إرجاع الأصناف إلى المخزن");
      onOpenChange(false);
    } catch (err) {
      toast.error(getErrorMessage(err, "تعذّر تنفيذ الإرجاع"));
    } finally {
      setReturning(false);
    }
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
                <ActionBtn onClick={() => goFull(1)} icon={Printer} tone="primary">
                  طباعة
                </ActionBtn>
                <ActionBtn onClick={share} icon={Share2} tone="whatsapp">
                  واتساب
                </ActionBtn>
                <ActionBtn onClick={() => goFull(0)} icon={Eye}>
                  معاينة كاملة
                </ActionBtn>
                <ActionBtn onClick={() => goFull(0)} icon={FileText}>
                  PDF
                </ActionBtn>
                <button
                  type="button"
                  onClick={returnToStock}
                  disabled={returning}
                  className="col-span-2 flex items-center justify-center gap-2 text-sm font-bold rounded-lg px-3 py-2.5 bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 disabled:opacity-60 transition"
                >
                  {returning ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <RotateCcw className="size-4" />
                  )}
                  إرجاع كل الأصناف إلى المخزن
                </button>
              </div>
            </DialogFooter>
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
