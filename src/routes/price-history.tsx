import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { History, Loader2, Search, TrendingUp, TrendingDown, Calendar, ChevronLeft, ChevronRight, Radio } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { PermissionGate } from "@/components/PermissionGate";
import { supabase } from "@/integrations/supabase/client";
import { formatSDG, formatNumber } from "@/lib/format";

export const Route = createFileRoute("/price-history")({
  head: () => ({ meta: [{ title: "سجل تغيير الأسعار — المهندس" }] }),
  component: () => (
    <PermissionGate perm="products.write">
      <PriceHistoryPage />
    </PermissionGate>
  ),
});

const PAGE_SIZE = 25;

type Row = {
  id: string;
  product_id: string | null;
  old_price: number;
  new_price: number;
  source: string;
  created_at: string;
  products: { name: string } | null;
};

function PriceHistoryPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [source, setSource] = useState<"all" | "purchase" | "manual">("all");
  const [dir, setDir] = useState<"all" | "up" | "down">("all");
  const [page, setPage] = useState(0);

  useEffect(() => { setPage(0); }, [q, from, to, source, dir]);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["price-history", { from, to, source, page }],
    queryFn: async () => {
      let query = supabase
        .from("price_history")
        .select("id, product_id, old_price, new_price, source, created_at, products(name)", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      if (from) query = query.gte("created_at", new Date(from).toISOString());
      if (to) {
        const end = new Date(to); end.setHours(23, 59, 59, 999);
        query = query.lte("created_at", end.toISOString());
      }
      if (source !== "all") query = query.eq("source", source);
      const { data, error, count } = await query;
      if (error) throw error;
      return { rows: (data ?? []) as Row[], count: count ?? 0 };
    },
    placeholderData: (prev) => prev,
  });

  // Realtime updates
  useEffect(() => {
    const ch = supabase
      .channel("price-history-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "price_history" }, () => {
        qc.invalidateQueries({ queryKey: ["price-history"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const rows = data?.rows ?? [];
  const total = data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const filtered = useMemo(() => {
    let list = rows;
    if (q.trim()) list = list.filter((r) => (r.products?.name || "").toLowerCase().includes(q.toLowerCase()));
    if (dir !== "all") list = list.filter((r) => (dir === "up" ? Number(r.new_price) > Number(r.old_price) : Number(r.new_price) < Number(r.old_price)));
    return list;
  }, [rows, q, dir]);

  const stats = useMemo(() => {
    const ups = filtered.filter((r) => Number(r.new_price) > Number(r.old_price)).length;
    const downs = filtered.filter((r) => Number(r.new_price) < Number(r.old_price)).length;
    return { ups, downs };
  }, [filtered]);

  return (
    <AppShell title="سجل تغيير الأسعار" showBack>
      {/* Filters */}
      <div className="bg-card rounded-2xl border border-border p-4 shadow-card mb-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="font-bold text-sm flex items-center gap-2">
            <History className="size-4 text-brand" /> بحث وتصفية
          </h2>
          <span className="text-[11px] flex items-center gap-1 text-emerald-600">
            <Radio className="size-3 animate-pulse" /> تحديث فوري
          </span>
        </div>

        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="بحث باسم المنتج"
            className="w-full h-11 rounded-xl border border-border bg-background pr-9 pl-3 text-sm outline-none focus:border-brand"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-muted-foreground">
            <span className="flex items-center gap-1 mb-1"><Calendar className="size-3" /> من</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-full h-10 rounded-xl border border-border bg-background px-2 text-sm nums" />
          </label>
          <label className="text-xs text-muted-foreground">
            <span className="flex items-center gap-1 mb-1"><Calendar className="size-3" /> إلى</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-full h-10 rounded-xl border border-border bg-background px-2 text-sm nums" />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <select value={source} onChange={(e) => setSource(e.target.value as any)} className="h-10 rounded-xl border border-border bg-background px-2 text-sm">
            <option value="all">كل المصادر</option>
            <option value="purchase">فواتير الشراء</option>
            <option value="manual">تعديل يدوي</option>
          </select>
          <select value={dir} onChange={(e) => setDir(e.target.value as any)} className="h-10 rounded-xl border border-border bg-background px-2 text-sm">
            <option value="all">كل الاتجاهات</option>
            <option value="up">زيادة فقط</option>
            <option value="down">نقص فقط</option>
          </select>
        </div>

        {(from || to || source !== "all" || dir !== "all" || q) && (
          <button
            onClick={() => { setQ(""); setFrom(""); setTo(""); setSource("all"); setDir("all"); }}
            className="text-xs text-brand hover:underline"
          >
            مسح الفلاتر
          </button>
        )}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <StatCard label="النتائج" value={formatNumber(total)} />
        <StatCard label="زيادات" value={formatNumber(stats.ups)} tone="rose" />
        <StatCard label="تخفيضات" value={formatNumber(stats.downs)} tone="emerald" />
      </div>

      {isLoading ? (
        <div className="py-16 grid place-items-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
          <History className="size-8 opacity-50" />
          لا يوجد سجل تغييرات مطابق للفلاتر
        </div>
      ) : (
        <>
          <ul className="space-y-2">
            {filtered.map((r) => {
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
                    <span className={`ms-auto nums ${diff >= 0 ? "text-rose-600" : "text-emerald-600"}`}>
                      {diff >= 0 ? "+" : ""}{formatSDG(diff)}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>

          {/* Pagination */}
          <div className="mt-4 flex items-center justify-between gap-2">
            <button
              disabled={page === 0 || isFetching}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="h-10 px-3 rounded-xl border border-border bg-card text-sm font-bold flex items-center gap-1 disabled:opacity-40"
            >
              <ChevronRight className="size-4" /> السابق
            </button>
            <span className="text-xs text-muted-foreground nums">
              صفحة {page + 1} من {totalPages}
            </span>
            <button
              disabled={page >= totalPages - 1 || isFetching}
              onClick={() => setPage((p) => p + 1)}
              className="h-10 px-3 rounded-xl border border-border bg-card text-sm font-bold flex items-center gap-1 disabled:opacity-40"
            >
              التالي <ChevronLeft className="size-4" />
            </button>
          </div>
        </>
      )}
    </AppShell>
  );
}

function StatCard({ label, value, tone = "brand" }: { label: string; value: string; tone?: "brand" | "emerald" | "rose" }) {
  const c = tone === "emerald" ? "text-emerald-600" : tone === "rose" ? "text-rose-600" : "text-brand";
  return (
    <div className="bg-card rounded-xl border border-border p-3 text-center">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={`text-lg font-bold nums ${c}`}>{value}</div>
    </div>
  );
}
