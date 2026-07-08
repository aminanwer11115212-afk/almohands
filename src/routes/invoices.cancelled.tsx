import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { PermissionGate } from "@/components/PermissionGate";
import { supabase } from "@/integrations/supabase/client";
import { formatSDG } from "@/lib/format";
import { XCircle, Receipt, Eye } from "lucide-react";
import { useState, useEffect } from "react";

export const Route = createFileRoute("/invoices/cancelled")({
  head: () => ({ meta: [{ title: "الفواتير الملغاة — المهندس" }] }),
  component: () => (
    <PermissionGate perm="invoices.write">
      <CancelledInvoicesPage />
    </PermissionGate>
  ),
});

type Row = {
  id: string;
  invoice_number: number;
  total: number;
  customer_name: string | null;
  cancellation_reason: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  user_id: string;
  created_at: string;
};

function CancelledInvoicesPage() {
  const [users, setUsers] = useState<Map<string, string>>(new Map());

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["invoices-cancelled"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("id, invoice_number, total, customer_name, cancellation_reason, cancelled_at, cancelled_by, user_id, created_at")
        .eq("status", "cancelled")
        .order("cancelled_at", { ascending: false, nullsFirst: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc("admin_list_users");
      const map = new Map<string, string>();
      (data ?? []).forEach((u: { user_id: string; email: string }) => map.set(u.user_id, u.email));
      setUsers(map);
    })();
  }, []);

  return (
    <AppShell title="الفواتير الملغاة" showBack>
      <div className="mx-auto max-w-5xl space-y-3">
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          <div className="flex items-center gap-2 font-bold">
            <XCircle className="size-4" /> فواتير ألغيت — إجمالي {rows.length} فاتورة
          </div>
          <div className="text-xs mt-0.5 opacity-80">تعرض الفواتير التي تم إلغاؤها بواسطة الكاشير أو المدير مع السبب والوقت.</div>
        </div>

        {isLoading ? (
          <div className="text-center py-10 text-muted-foreground">جاري التحميل...</div>
        ) : rows.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            <Receipt className="size-10 mx-auto mb-2 opacity-40" />
            لا توجد فواتير ملغاة
          </div>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => {
              const actor = r.cancelled_by ? users.get(r.cancelled_by) ?? "غير معروف" : "—";
              return (
                <div key={r.id} className="rounded-xl bg-card border border-border p-3 shadow-card">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold">فاتورة #{r.invoice_number}</span>
                        <span className="text-xs rounded-full bg-red-100 text-red-700 px-2 py-0.5">ملغاة</span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {r.customer_name || "بدون عميل"} · {new Date(r.created_at).toLocaleString("ar-EG")}
                      </div>
                    </div>
                    <div className="text-end">
                      <div className="font-bold nums">{formatSDG(Number(r.total))}</div>
                      <Link
                        to="/invoices/$invoiceId"
                        params={{ invoiceId: r.id }}
                        search={{ autoprint: 0 }}
                        className="text-xs text-brand inline-flex items-center gap-1 mt-1"
                      >
                        <Eye className="size-3" /> عرض
                      </Link>
                    </div>
                  </div>
                  <div className="mt-2 grid sm:grid-cols-2 gap-2 text-xs">
                    <div className="rounded-md bg-muted/50 p-2">
                      <div className="font-semibold text-muted-foreground mb-0.5">السبب</div>
                      <div>{r.cancellation_reason || "— (لم يُذكر)"}</div>
                    </div>
                    <div className="rounded-md bg-muted/50 p-2">
                      <div className="font-semibold text-muted-foreground mb-0.5">ألغيت بواسطة</div>
                      <div className="truncate">{actor}</div>
                      {r.cancelled_at && (
                        <div className="text-muted-foreground mt-0.5">
                          {new Date(r.cancelled_at).toLocaleString("ar-EG")}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
