import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Send, User } from "lucide-react";
import { useCustomers, type Customer } from "@/hooks/use-customers";
import { normalizePhoneForWhatsApp } from "@/lib/invoice-share";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultCustomerId?: string | null;
  defaultCustomerName?: string | null;
  defaultCustomerPhone?: string | null;
  /** Called with the phone (may be empty → user must pick from wa.me picker). */
  onConfirm: (phone: string | null, customer: Customer | null) => void;
};

export function WhatsAppCustomerPickerDialog({
  open, onOpenChange, defaultCustomerId, defaultCustomerName, defaultCustomerPhone, onConfirm,
}: Props) {
  const [q, setQ] = useState("");
  const { data: list = [], isLoading } = useCustomers(q);
  const [selectedId, setSelectedId] = useState<string | null>(defaultCustomerId ?? null);

  const selected = useMemo(
    () => list.find((c) => c.id === selectedId) ?? null,
    [list, selectedId],
  );
  const effectivePhone = selected?.phone ?? defaultCustomerPhone ?? null;
  const hasUsablePhone = !!normalizePhoneForWhatsApp(effectivePhone);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" dir="rtl">
        <DialogHeader>
          <DialogTitle>اختر العميل لإرسال واتساب</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {defaultCustomerName && (
            <div className="rounded-lg bg-muted p-2 text-xs">
              عميل الفاتورة الحالي: <b>{defaultCustomerName}</b>
              {defaultCustomerPhone ? <> — {defaultCustomerPhone}</> : null}
            </div>
          )}

          <div className="relative">
            <Search className="absolute right-2 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ابحث بالاسم أو الهاتف أو الورشة…"
              className="pr-8"
            />
          </div>

          <div className="max-h-72 overflow-y-auto rounded-lg border">
            {isLoading ? (
              <div className="p-4 text-center text-sm text-muted-foreground">جارٍ التحميل…</div>
            ) : list.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">لا توجد نتائج</div>
            ) : (
              list.map((c) => {
                const isSel = c.id === selectedId;
                const hasPhone = !!normalizePhoneForWhatsApp(c.phone);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedId(c.id)}
                    className={`w-full text-right p-2 border-b last:border-b-0 flex items-center gap-2 hover:bg-muted/60 transition ${isSel ? "bg-brand-soft/70" : ""}`}
                  >
                    <User className="size-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold truncate">{c.name}</div>
                      <div className="text-[11px] text-muted-foreground truncate">
                        {c.phone || "بدون هاتف"}
                        {c.workshop ? ` · ${c.workshop}` : ""}
                      </div>
                    </div>
                    {!hasPhone && <span className="text-[10px] text-amber-600">لا يوجد رقم</span>}
                  </button>
                );
              })
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button
            onClick={() => { onConfirm(null, null); onOpenChange(false); }}
            variant="secondary"
            title="فتح واتساب لاختيار جهة الاتصال يدوياً"
          >
            اختيار من واتساب
          </Button>
          <Button
            onClick={() => { onConfirm(effectivePhone, selected); onOpenChange(false); }}
            disabled={!hasUsablePhone}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <Send className="size-4 ml-1" /> إرسال
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
