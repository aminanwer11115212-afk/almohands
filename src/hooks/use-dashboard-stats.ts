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

  const [todayRes, monthRes, lastMonthRes] = await Promise.all([
    supabase.from("invoices").select("total").gte("created_at", todayStart),
    supabase.from("invoices").select("total").gte("created_at", monthStart),
    supabase.from("invoices").select("total").gte("created_at", lastMonthStart).lt("created_at", monthStart),
  ]);

  const firstError = todayRes.error || monthRes.error || lastMonthRes.error;
  if (firstError) throw firstError;

  const sum = (rows: { total: number | string | null }[] | null) =>
    (rows ?? []).reduce((s, r) => s + (Number(r.total) || 0), 0);

  return {
    today: sum(todayRes.data),
    thisMonth: sum(monthRes.data),
    lastMonth: sum(lastMonthRes.data),
  };
}

export function useDashboardStats() {
  return useQuery({ queryKey: ["dashboard-stats"], queryFn: fetchStats, staleTime: 30_000 });
}
