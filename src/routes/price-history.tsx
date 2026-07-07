import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { History, Loader2, Search, TrendingUp, TrendingDown } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { PermissionGate } from "@/components/PermissionGate";
import { supabase } from "@/integrations/supabase/client";
import { formatSDG } from "@/lib/format";

export const Route = createFileRoute("/price-history")({
  head: () => ({ meta: [{ title: "سجل تغيير الأسعار — المهندس" }] }),
  component: () => (
    <PermissionGate perm="products.write">
      <PriceHistoryPage />
    </PermissionGate>
  ),
});

function PriceHistoryPage() {
  const [q, setQ] = useState("");

  const { data = [], isLoading } = useQuery({
    queryKey: ["price-history", q],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("price_history")
        .select("id, product_id, old_price, new_price, source, created_at, products(name)")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = q.trim()
    ? data.filter((r: any) => (r.products?.name || "").toLowerCase().includes(q.toLowerCase()))
    : data;

  return (
    <AppShell title="سجل تغيير الأسعار" showBack>
      <div className="relative mb-3">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="بحث باسم المنتج"
          className="w-full h-11 rounded-xl border border-border bg-card pr-9 pl-3 text-sm outline-none focus:border-brand"
        />
      </div>

      {isLoading ? (
        <div className="py-16 grid place-items-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
          <History className="size-8 opacity-50" />
          لا يوجد سجل تغييرات بعد
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map((r: any) => {
            const up = Number(r.new_price) > Number(r.old_price);
            const Icon = up ? TrendingUp : TrendingDown;
            const diff = Number(r.new_price) - Number(r.old_price);
            const pct = Number(r.old_price) > 0 ? (diff / Number(r.old_price)) * 100 : 0;
            return (
              <li key={r.id} className="bg-card rounded-xl border border-border p-3 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-bold text-sm truncate">{r.products?.name || "منتج محذوف"}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {new Date(r.created_at).toLocaleString("ar-EG")} · {r.source === "purchase" ? "من فاتورة شراء" : "تعديل يدوي"}
                    </div>
                  </div>
                  <div className={`flex items-center gap-1 text-xs font-bold ${up ? "text-rose-600" : "text-emerald-600"}`}>
                    <Icon className="size-4" />
                    <span className="nums">{pct.toFixed(1)}%</span>
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground line-through nums">{formatSDG(Number(r.old_price))}</span>
                  <span className="text-muted-foreground">→</span>
                  <span className="font-bold nums">{formatSDG(Number(r.new_price))}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </AppShell>
  );
}
