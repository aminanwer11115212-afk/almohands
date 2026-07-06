import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Receipt, Calendar } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { formatSDG } from "@/lib/format";
import { InvoiceActionsModal } from "@/components/InvoiceActionsModal";

const statusEnum = z.enum(["all", "paid", "partial", "pending"]);

const searchSchema = z.object({
  q: fallback(z.string(), "").default(""),
  status: fallback(statusEnum, "all").default("all"),
  from: fallback(z.string(), "").default(""),
  to: fallback(z.string(), "").default(""),
});

type InvoicesSearch = z.infer<typeof searchSchema>;


type InvoiceRow = {
  id: string;
  invoice_number: number;
  customer_name: string | null;
  customer_phone: string | null;
  total: number;
  paid: number;
  remaining: number;
  status: string;
  created_at: string;
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

/**
 * Sanitize a search term for use inside PostgREST `.or()` filter values.
 * Commas, parentheses, and colons have special meaning and could break the
 * filter or be abused; strip them and cap length.
 */
function sanitizeOrTerm(raw: string): string {
  return raw.replace(/[,()*:%\\]/g, " ").trim().slice(0, 80);
}

export const Route = createFileRoute("/invoices")({
  head: () => ({ meta: [{ title: "الفواتير — المهندس" }] }),
  validateSearch: zodValidator(searchSchema),
  component: InvoicesPage,
});

function InvoicesPage() {
  const { q, status, from, to } = Route.useSearch();
  const navigate = useNavigate({ from: "/invoices" });

  const query = useQuery({
    queryKey: ["invoices", { q, status, from, to }],
    queryFn: async () => {
      let req = supabase
        .from("invoices")
        .select("id, invoice_number, customer_name, customer_phone, total, paid, remaining, status, created_at")
        .order("created_at", { ascending: false })
        .limit(200);

      if (status !== "all") req = req.eq("status", status);
      if (from) req = req.gte("created_at", new Date(from).toISOString());
      if (to) {
        const end = new Date(to);
        end.setHours(23, 59, 59, 999);
        req = req.lte("created_at", end.toISOString());
      }
      if (q.trim()) {
        const term = sanitizeOrTerm(q);
        if (term) {
          const asNum = Number(term);
          if (Number.isInteger(asNum) && asNum > 0) {
            req = req.or(
              `invoice_number.eq.${asNum},customer_name.ilike.%${term}%,customer_phone.ilike.%${term}%`,
            );
          } else {
            req = req.or(`customer_name.ilike.%${term}%,customer_phone.ilike.%${term}%`);
          }
        }
      }

      const { data, error } = await req;
      if (error) throw error;
      return (data ?? []) as InvoiceRow[];
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel("invoices-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "invoices" }, () => {
        query.refetch();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
     
  }, []);

  const totals = useMemo(() => {
    const rows = query.data ?? [];
    return rows.reduce(
      (acc, r) => {
        acc.count += 1;
        acc.total += Number(r.total) || 0;
        acc.paid += Number(r.paid) || 0;
        acc.remaining += Number(r.remaining) || 0;
        return acc;
      },
      { count: 0, total: 0, paid: 0, remaining: 0 },
    );
  }, [query.data]);

  return (
    <AppShell title="الفواتير" showBack>
      <div className="space-y-3">
        <div className="bg-card rounded-xl border border-border p-3 space-y-3 shadow-sm">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <input
              type="search"
              defaultValue={q}
              onChange={(e) => {
                const value = e.target.value;
                navigate({ search: (prev: InvoicesSearch) => ({ ...prev, q: value }) });
              }}
              placeholder="بحث برقم الفاتورة أو اسم/هاتف العميل"
              className="w-full h-10 rounded-md border border-input bg-background pr-9 pl-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {(["all", "paid", "partial", "pending"] as const).map((s) => (
              <button
                key={s}
                onClick={() => navigate({ search: (prev: InvoicesSearch) => ({ ...prev, status: s }) })}
                className={`px-3 h-8 rounded-full text-xs font-medium border transition ${
                  status === s
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-foreground border-input hover:bg-muted"
                }`}
              >
                {s === "all" ? "الكل" : statusLabels[s]}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-muted-foreground flex flex-col gap-1">
              <span className="flex items-center gap-1"><Calendar className="size-3" /> من</span>
              <input
                type="date"
                value={from}
                onChange={(e) => {
                  const value = e.target.value;
                  navigate({ search: (prev: InvoicesSearch) => ({ ...prev, from: value }) });
                }}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              />
            </label>
            <label className="text-xs text-muted-foreground flex flex-col gap-1">
              <span className="flex items-center gap-1"><Calendar className="size-3" /> إلى</span>
              <input
                type="date"
                value={to}
                onChange={(e) => {
                  const value = e.target.value;
                  navigate({ search: (prev: InvoicesSearch) => ({ ...prev, to: value }) });
                }}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              />
            </label>
          </div>

          {(q || status !== "all" || from || to) && (
            <button
              onClick={() => navigate({ search: { q: "", status: "all", from: "", to: "" } })}
              className="text-xs text-primary hover:underline"
            >
              مسح الفلاتر
            </button>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2 text-center">
          <SummaryCard label="فواتير" value={String(totals.count)} />
          <SummaryCard label="الإجمالي" value={formatSDG(totals.total)} />
          <SummaryCard label="المتبقي" value={formatSDG(totals.remaining)} />
        </div>

        <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
          {query.isLoading ? (
            <div className="p-6 text-center text-sm text-muted-foreground">جارٍ التحميل…</div>
          ) : query.isError ? (
            <div className="p-6 text-center text-sm text-destructive">تعذر تحميل الفواتير</div>
          ) : (query.data ?? []).length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
              <Receipt className="size-8 opacity-50" />
              لا توجد فواتير مطابقة
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {(query.data ?? []).map((inv) => (
                <li key={inv.id}>
                  <Link
                    to="/invoices/$invoiceId"
                    params={{ invoiceId: inv.id }}
                    className="p-3 flex items-center gap-3 hover:bg-muted/50 transition"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-primary">#{inv.invoice_number}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full ${statusClasses[inv.status] ?? "bg-muted text-muted-foreground"}`}>
                          {statusLabels[inv.status] ?? inv.status}
                        </span>
                      </div>
                      <div className="text-sm text-foreground truncate">
                        {inv.customer_name || "عميل نقدي"}
                        {inv.customer_phone ? ` · ${inv.customer_phone}` : ""}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {new Date(inv.created_at).toLocaleString("ar-EG", { dateStyle: "short", timeStyle: "short" })}
                      </div>
                    </div>
                    <div className="text-left">
                      <div className="text-sm font-semibold">{formatSDG(Number(inv.total))}</div>
                      {Number(inv.remaining) > 0 && (
                        <div className="text-[11px] text-rose-600">متبقي {formatSDG(Number(inv.remaining))}</div>
                      )}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card rounded-xl border border-border p-2 shadow-sm">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="text-sm font-bold text-foreground mt-1 truncate">{value}</div>
    </div>
  );
}
