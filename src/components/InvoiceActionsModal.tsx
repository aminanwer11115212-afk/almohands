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
import {
  canUseLocalData,
  fromLocalRow,
  genId,
  localQuery,
  localQueryOne,
  localTransaction,
  nowIso,
  requireUserId,
} from "@/lib/data/local";

/** Extract plain row objects from a PowerSync tx.execute() query result. */
function txRows(res: unknown): Record<string, unknown>[] {
  const rows = (res as {
    rows?: { _array?: unknown[]; length?: number; item?: (i: number) => unknown };
  } | null)?.rows;
  if (!rows) return [];
  if (Array.isArray(rows._array)) return rows._array as Record<string, unknown>[];
  if (typeof rows.item === "function" && typeof rows.length === "number") {
    return Array.from({ length: rows.length }, (_, i) => rows.item!(i)) as Record<
      string,
      unknown
    >[];
  }
  return [];
}

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
      if (canUseLocalData()) {
        const [invRow, itemRows] = await Promise.all([
          localQueryOne<Record<string, unknown>>(
            `SELECT * FROM invoices WHERE id = ?`,
            [invoiceId!],
          ),
          localQuery<Record<string, unknown>>(
            `SELECT * FROM invoice_items WHERE invoice_id = ?`,
            [invoiceId!],
          ),
        ]);
        return {
          inv: invRow ? fromLocalRow<any>("invoices", invRow) : null,
          items: itemRows.map((r) => fromLocalRow<any>("invoice_items", r)),
        };
      }

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
      if (canUseLocalData()) {
        const userId = await requireUserId();
        // Return rows + stock restore in one local transaction
        // (mirrors the restore_stock_on_return_accepted trigger).
        await localTransaction(async (tx) => {
          for (const it of eligibleItems as any[]) {
            const ts = nowIso();
            await tx.execute(
              `INSERT INTO returns (id, user_id, invoice_id, product_id, product_name, quantity, status, reason, notes, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, 'accepted', ?, NULL, ?, ?)`,
              [
                genId(),
                userId,
                inv.id,
                it.product_id,
                it.product_name,
                Number(it.quantity),
                `إرجاع فاتورة #${inv.invoice_number}`,
                ts,
                ts,
              ],
            );
            await tx.execute(
              `UPDATE products SET quantity = quantity + ?, updated_at = ? WHERE id = ?`,
              [Number(it.quantity), nowIso(), it.product_id],
            );
          }
        });
        invalidateAll();
        toast.success("تم إرجاع الأصناف إلى المخزن");
        onOpenChange(false);
        return;
      }

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
    let linkedPays: Array<{ id: string; amount: number; account_id: string | null }> | null =
      null;
    if (canUseLocalData()) {
      linkedPays = await localQuery<{ id: string; amount: number; account_id: string | null }>(
        `SELECT id, amount, account_id FROM payments WHERE invoice_id = ?`,
        [inv.id],
      );
    } else {
      const { data } = await supabase
        .from("payments")
        .select("id, amount, account_id")
        .eq("invoice_id", inv.id);
      linkedPays = data;
    }
    const paysCount = linkedPays?.length ?? 0;
    const paysTotal = (linkedPays ?? []).reduce(
      (s: number, p: any) => s + Number(p.amount || 0),
      0,
    );

    const reason =
      window.prompt(
        `⚠️ حذف الفاتورة #${inv.invoice_number} نهائياً (عملية ذرية موحّدة)\n\n` +
          `- سيتم إرجاع ${items.length} صنف/أصناف إلى المخزون\n` +
          `- خصم الفاتورة من إجمالي المبيعات\n` +
          (paysCount > 0
            ? `- حذف ${paysCount} دفعة (بقيمة ${formatSDG(paysTotal)}) من الحسابات\n`
            : "") +
          `- تسجيل عملية الحذف كاملة في سجل التدقيق\n` +
          `- لا يمكن التراجع\n\nاكتب سبب الحذف (اختياري) واضغط موافق للمتابعة، أو إلغاء:`,
        "",
      );
    if (reason === null) return; // user pressed cancel

    setDeleting(true);
    try {
      let v: {
        payments_deleted?: number;
        payments_total?: number;
        stock_restored?: Array<{ product_name?: string; restored_qty?: number }>;
      };

      if (canUseLocalData()) {
        // Local replica of the delete_invoice_atomic RPC: one transaction that
        // restores stock (net of accepted returns), deletes payments, detaches
        // returns, deletes items + invoice, and writes the rich audit row.
        const actor = await requireUserId();
        v = await localTransaction(async (tx) => {
          const invRow = txRows(
            await tx.execute(`SELECT * FROM invoices WHERE id = ?`, [inv.id]),
          )[0] as Record<string, unknown> | undefined;
          if (!invRow) throw new Error("الفاتورة غير موجودة");

          const adminRow = txRows(
            await tx.execute(
              `SELECT 1 AS ok FROM user_roles WHERE user_id = ? AND role = 'admin' LIMIT 1`,
              [actor],
            ),
          )[0];
          const isAdminActor = !!adminRow;
          if (!isAdminActor && invRow.user_id !== actor) {
            throw new Error("ممنوع — لا تملك صلاحية حذف هذه الفاتورة");
          }

          const itemRows = txRows(
            await tx.execute(
              `SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY created_at`,
              [inv.id],
            ),
          );
          const payRows = txRows(
            await tx.execute(
              `SELECT * FROM payments WHERE invoice_id = ? ORDER BY created_at`,
              [inv.id],
            ),
          );
          const paymentsTotal = payRows.reduce(
            (s, p) => s + (Number((p as any).amount) || 0),
            0,
          );

          const accountsImpactMap = new Map<string, number>();
          for (const p of payRows as any[]) {
            if (!p.account_id) continue;
            accountsImpactMap.set(
              p.account_id,
              (accountsImpactMap.get(p.account_id) ?? 0) + (Number(p.amount) || 0),
            );
          }
          const accountsImpact = Array.from(accountsImpactMap, ([account_id, deducted]) => ({
            account_id,
            deducted,
          }));

          // Restore stock net of already-accepted returns.
          const sold = new Map<string, { name: string; qty: number }>();
          for (const it of itemRows as any[]) {
            if (!it.product_id) continue;
            const cur = sold.get(it.product_id) ?? { name: it.product_name, qty: 0 };
            cur.qty += Number(it.quantity) || 0;
            sold.set(it.product_id, cur);
          }
          const stockRestored: Array<{
            product_id: string;
            product_name: string;
            restored_qty: number;
          }> = [];
          for (const [productId, s] of sold) {
            const retRow = txRows(
              await tx.execute(
                `SELECT COALESCE(SUM(quantity), 0) AS q FROM returns WHERE invoice_id = ? AND product_id = ? AND status = 'accepted'`,
                [inv.id, productId],
              ),
            )[0] as { q: number } | undefined;
            const netQty = s.qty - (Number(retRow?.q) || 0);
            if (netQty > 0) {
              await tx.execute(
                `UPDATE products SET quantity = quantity + ?, updated_at = ? WHERE id = ?`,
                [netQty, nowIso(), productId],
              );
              stockRestored.push({
                product_id: productId,
                product_name: s.name,
                restored_qty: netQty,
              });
            }
          }

          await tx.execute(`DELETE FROM payments WHERE invoice_id = ?`, [inv.id]);
          // Detach returns rows (invoice_id becomes NULL — history preserved).
          await tx.execute(
            `UPDATE returns SET invoice_id = NULL, updated_at = ? WHERE invoice_id = ?`,
            [nowIso(), inv.id],
          );
          await tx.execute(`DELETE FROM invoice_items WHERE invoice_id = ?`, [inv.id]);
          await tx.execute(`DELETE FROM invoices WHERE id = ?`, [inv.id]);

          const invSnapshot = fromLocalRow<Record<string, any>>("invoices", invRow);
          await tx.execute(
            `INSERT INTO audit_logs (id, user_id, action, table_name, record_id, details, created_at)
             VALUES (?, ?, 'invoice_delete_atomic', 'invoices', ?, ?, ?)`,
            [
              genId(),
              actor,
              inv.id,
              JSON.stringify({
                deleted_by: actor,
                is_admin_actor: isAdminActor,
                reason: reason.trim() || null,
                invoice_owner: invSnapshot.user_id,
                invoice_number: invSnapshot.invoice_number,
                invoice_total: invSnapshot.total,
                invoice_paid: invSnapshot.paid,
                invoice_remaining: invSnapshot.remaining,
                customer_id: invSnapshot.customer_id,
                customer_name: invSnapshot.customer_name,
                created_at: invSnapshot.created_at,
                deleted_at: nowIso(),
                items_count: itemRows.length,
                items: itemRows.map((r) =>
                  fromLocalRow("invoice_items", r as Record<string, unknown>),
                ),
                payments_count: payRows.length,
                payments_total: paymentsTotal,
                payments: payRows.map((r) =>
                  fromLocalRow("payments", r as Record<string, unknown>),
                ),
                accounts_impact: accountsImpact,
                stock_restored: stockRestored,
              }),
              nowIso(),
            ],
          );

          return {
            payments_deleted: payRows.length,
            payments_total: paymentsTotal,
            stock_restored: stockRestored,
          };
        });
      } else {
        // One atomic DB call: locks the invoice, restores stock, deletes payments,
        // deletes the invoice, writes a rich audit_logs row, then verifies.
        // Any failure rolls the whole transaction back — no partial states.
        const { data: verify, error } = await supabase.rpc("delete_invoice_atomic", {
          _invoice_id: inv.id,
          _reason: reason.trim() || undefined,
        });
        if (error) throw error;

        v = (verify ?? {}) as {
          payments_deleted?: number;
          payments_total?: number;
          stock_restored?: Array<{ product_name?: string; restored_qty?: number }>;
        };
      }

      invalidateAll();
      toast.success(
        `تم حذف الفاتورة #${inv.invoice_number}` +
          (v.payments_deleted
            ? ` — حُذفت ${v.payments_deleted} دفعة (${formatSDG(Number(v.payments_total || 0))})`
            : "") +
          (v.stock_restored?.length
            ? ` وأُرجع ${v.stock_restored.length} صنف/أصناف للمخزون`
            : ""),
        { duration: 6000 },
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
    qc.invalidateQueries({ queryKey: ["account-balances"] });
    qc.invalidateQueries({ queryKey: ["payments"] });
    qc.invalidateQueries({ queryKey: ["customers"] });
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
