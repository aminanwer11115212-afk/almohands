import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type DashInvoice = {
  id: string;
  invoice_number: number;
  total: number;
  paid: number;
  remaining: number;
  payment_method: string;
  customer_name: string | null;
  created_at: string;
};

export type LowStockItem = {
  id: string;
  name: string;
  quantity: number;
  min_quantity: number;
};

export type DailyPoint = { date: string; label: string; amount: number };

function toLocalKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function fetchInsights() {
  // Local start-of-day 13 days ago (14-day window including today).
  const from = new Date();
  from.setDate(from.getDate() - 13);
  from.setHours(0, 0, 0, 0);
  // FIX: use local-timestamp ISO (not UTC) so rows near midnight aren't dropped by TZ offset.
  const fromLocalIso = new Date(from.getTime() - from.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, -1);

  const [recent, pendingAll, lowStockAll, series] = await Promise.all([
    supabase
      .from("invoices")
      .select("id, invoice_number, total, paid, remaining, payment_method, customer_name, created_at")
      .order("created_at", { ascending: false })
      .limit(6),
    // FIX: fetch ALL pending invoices so pendingTotal reflects the real remaining balance.
    supabase
      .from("invoices")
      .select("id, invoice_number, total, paid, remaining, payment_method, customer_name, created_at")
      .gt("remaining", 0)
      .order("created_at", { ascending: false })
      .limit(500),
    // FIX: widen the candidate window; filter (quantity <= min_quantity) is applied client-side,
    // otherwise LIMIT 6 by lowest quantity mixes non-low items and hides real low-stock ones.
    supabase
      .from("products")
      .select("id, name, quantity, min_quantity")
      .gt("min_quantity", 0)
      .order("quantity", { ascending: true })
      .limit(200),
    supabase
      .from("invoices")
      .select("total, created_at")
      .gte("created_at", fromLocalIso),
  ]);

  const firstErr = recent.error || pendingAll.error || lowStockAll.error || series.error;
  if (firstErr) throw firstErr;

  // Build 14-day continuous series (fill zeros) using local-date keys.
  const dayMap = new Map<string, number>();
  for (let i = 0; i < 14; i++) {
    const d = new Date(from);
    d.setDate(from.getDate() + i);
    dayMap.set(toLocalKey(d), 0);
  }
  for (const row of series.data ?? []) {
    const key = toLocalKey(new Date(row.created_at));
    if (dayMap.has(key)) dayMap.set(key, (dayMap.get(key) ?? 0) + Number(row.total || 0));
  }
  const daily: DailyPoint[] = [...dayMap.entries()].map(([date, amount]) => ({
    date,
    label: `${date.slice(8, 10)}/${date.slice(5, 7)}`,
    amount,
  }));

  const lowStockFiltered = (lowStockAll.data ?? []).filter(
    (p) => Number(p.quantity ?? 0) <= Number(p.min_quantity ?? 0),
  ) as LowStockItem[];

  const pendingRows = (pendingAll.data ?? []) as DashInvoice[];
  const pendingTotal = pendingRows.reduce((s, r) => s + Number(r.remaining || 0), 0);

  return {
    daily,
    recent: (recent.data ?? []) as DashInvoice[],
    pending: pendingRows,
    pendingTotal,
    pendingCount: pendingRows.length,
    lowStock: lowStockFiltered,
    lowStockCount: lowStockFiltered.length,
  };
}

export function useDashboardInsights() {
  return useQuery({
    queryKey: ["dashboard-insights"],
    queryFn: fetchInsights,
    staleTime: 30_000,
  });
}
