import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

function startOf(unit: "day" | "month", offset = 0) {
  const d = new Date();
  if (unit === "day") {
    d.setDate(d.getDate() + offset);
    d.setHours(0, 0, 0, 0);
  } else {
    d.setMonth(d.getMonth() + offset, 1);
    d.setHours(0, 0, 0, 0);
  }
  return d.toISOString();
}

async function fetchStats() {
  const todayStart = startOf("day");
  const monthStart = startOf("month");
  const lastMonthStart = startOf("month", -1);

  const [todayRes, monthRes, lastMonthRes, todayExpensesRes, todayPaidRes, pendingRes, lowStockRes] = await Promise.all([
    supabase.from("invoices").select("total").gte("created_at", todayStart),
    supabase.from("invoices").select("total").gte("created_at", monthStart),
    supabase.from("invoices").select("total").gte("created_at", lastMonthStart).lt("created_at", monthStart),
    supabase.from("expenses").select("amount").gte("created_at", todayStart),
    supabase.from("payments").select("amount").gte("created_at", todayStart),
    supabase.from("invoices").select("id", { count: "exact", head: true }).gt("remaining", 0),
    supabase.from("products").select("id, quantity, min_quantity").gt("min_quantity", 0).limit(500),
  ]);

  const firstError =
    todayRes.error ||
    monthRes.error ||
    lastMonthRes.error ||
    todayExpensesRes.error ||
    todayPaidRes.error ||
    pendingRes.error ||
    lowStockRes.error;
  if (firstError) throw firstError;

  const sum = (rows: { total?: number | string | null; amount?: number | string | null }[] | null, key: "total" | "amount") =>
    (rows ?? []).reduce((s, r) => s + (Number((r as any)[key]) || 0), 0);

  const lowStockCount = (lowStockRes.data ?? []).filter(
    (p) => Number(p.quantity ?? 0) <= Number(p.min_quantity ?? 0),
  ).length;

  return {
    today: sum(todayRes.data, "total"),
    todayCount: todayRes.data?.length ?? 0,
    thisMonth: sum(monthRes.data, "total"),
    lastMonth: sum(lastMonthRes.data, "total"),
    todayExpenses: sum(todayExpensesRes.data, "amount"),
    todayPaid: sum(todayPaidRes.data, "amount"),
    pendingCount: pendingRes.count ?? 0,
    lowStockCount,
  };
}

export function useDashboardStats() {
  return useQuery({ queryKey: ["dashboard-stats"], queryFn: fetchStats, staleTime: 30_000 });
}
