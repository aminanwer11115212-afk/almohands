import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { PermissionGate } from "@/components/PermissionGate";
import { supabase } from "@/integrations/supabase/client";
import { Activity, Upload, Download, TrendingUp, TrendingDown, CheckCircle2, XCircle, Filter, Radio, Loader2 } from "lucide-react";
import { formatNumber } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/activity-log")({
  head: () => ({ meta: [{ title: "سجل النشاط الموحّد — المهندس" }] }),
  component: () => (
    <PermissionGate perm="reports.view">
      <ActivityLogPage />
    </PermissionGate>
  ),
});

type Tab = "all" | "import" | "export" | "price";
type StatusFilter = "all" | "success" | "failed";

interface UnifiedEntry {
  id: string;
  kind: "import" | "export" | "price";
  status: "success" | "failed" | "info";
  title: string;
  detail: string;
  created_at: string;
  meta?: string;
}

const PAGE_SIZE = 25;

/**
 * Range-based paginated fetcher. Returns a page + a nextOffset when the page
 * was full so `useInfiniteQuery` can request more on demand.
 */
function buildInfiniteQuery<T>(
  key: readonly unknown[],
  loader: (from: number, to: number) => Promise<T[]>,
) {
  return {
    queryKey: key,
    initialPageParam: 0,
    queryFn: async ({ pageParam }: { pageParam: number }) => {
      const from = pageParam;
      const to = pageParam + PAGE_SIZE - 1;
      const rows = await loader(from, to);
      return { rows, nextOffset: rows.length === PAGE_SIZE ? from + PAGE_SIZE : null };
    },
    getNextPageParam: (last: { nextOffset: number | null }) => last.nextOffset,
  };
}

function ActivityLogPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("all");
  const [status, setStatus] = useState<StatusFilter>("all");

  const imports = useInfiniteQuery(buildInfiniteQuery(["activity", "import"], async (from, to) => {
    const { data, error } = await supabase.from("import_logs")
      .select("id, file_name, status, imported_rows, total_rows, invalid_rows, error_message, created_at, notes")
      .order("created_at", { ascending: false }).range(from, to);
    if (error) throw error;
    return data ?? [];
  }));

  const exports = useInfiniteQuery(buildInfiniteQuery(["activity", "export"], async (from, to) => {
    const { data, error } = await supabase.from("export_logs")
      .select("id, export_type, format, tables, row_count, status, error_message, created_at, notes")
      .order("created_at", { ascending: false }).range(from, to);
    if (error) throw error;
    return data ?? [];
  }));

  const prices = useInfiniteQuery(buildInfiniteQuery(["activity", "price"], async (from, to) => {
    const { data, error } = await supabase.from("price_history")
      .select("id, old_price, new_price, source, created_at, products(name)")
      .order("created_at", { ascending: false }).range(from, to);
    if (error) throw error;
    return data ?? [];
  }));

  // Realtime for all three streams
  useEffect(() => {
    let cancelled = false;
    const channels: ReturnType<typeof supabase.channel>[] = [];
    (async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id ?? null;
      if (!uid || cancelled) return;
      const configs: Array<{ table: "import_logs" | "export_logs" | "price_history"; key: string; label: string }> = [
        { table: "import_logs", key: "import", label: "استيراد" },
        { table: "export_logs", key: "export", label: "تصدير" },
        { table: "price_history", key: "price", label: "تغيير سعر" },
      ];
      for (const c of configs) {
        if (cancelled) return;
        const ch = supabase
          .channel(`activity:${c.table}:${uid}:${crypto.randomUUID()}`)
          .on("postgres_changes", { event: "INSERT", schema: "public", table: c.table, filter: `user_id=eq.${uid}` }, (p) => {
            const row: any = p.new;
            const ok = row.status ? row.status === "success" : true;
            if (c.table === "price_history") toast.info(`تحديث سعر جديد`);
            else if (ok) toast.success(`${c.label}: عملية ناجحة`);
            else toast.error(`${c.label}: عملية فاشلة`);
            qc.invalidateQueries({ queryKey: ["activity", c.key] });
          })
          .subscribe();
        if (cancelled) { supabase.removeChannel(ch); return; }
        channels.push(ch);
      }
    })();
    return () => { cancelled = true; channels.forEach((c) => supabase.removeChannel(c)); };
  }, [qc]);

  const importRows = useMemo(() => (imports.data?.pages ?? []).flatMap((p) => p.rows), [imports.data]);
  const exportRows = useMemo(() => (exports.data?.pages ?? []).flatMap((p) => p.rows), [exports.data]);
  const priceRows = useMemo(() => (prices.data?.pages ?? []).flatMap((p) => p.rows), [prices.data]);

  const entries = useMemo<UnifiedEntry[]>(() => {
    const out: UnifiedEntry[] = [];
    for (const l of importRows) {
      out.push({
        id: `imp-${l.id}`, kind: "import",
        status: (l.status === "success" ? "success" : "failed"),
        title: `استيراد: ${l.file_name || "منتجات"}`,
        detail: `${formatNumber(l.imported_rows)} / ${formatNumber(l.total_rows)} صف` + (l.invalid_rows > 0 ? ` · تخطي ${formatNumber(l.invalid_rows)}` : ""),
        meta: l.error_message || l.notes || undefined,
        created_at: l.created_at,
      });
    }
    for (const l of exportRows) {
      out.push({
        id: `exp-${l.id}`, kind: "export",
        status: (l.status === "success" ? "success" : "failed"),
        title: `${l.export_type === "full_backup" ? "نسخة احتياطية" : "تصدير"} — ${String(l.format).toUpperCase()}`,
        detail: `${(l.tables ?? []).join(", ")} · ${formatNumber(l.row_count)} سجل`,
        meta: l.error_message || l.notes || undefined,
        created_at: l.created_at,
      });
    }
    for (const p of priceRows) {
      const up = Number(p.new_price) >= Number(p.old_price);
      out.push({
        id: `pr-${p.id}`, kind: "price",
        status: "info",
        title: `تغيير سعر: ${(p as any).products?.name || "منتج محذوف"}`,
        detail: `من ${formatNumber(Number(p.old_price))} إلى ${formatNumber(Number(p.new_price))} (${up ? "↑" : "↓"})`,
        meta: p.source === "purchase" ? "من فاتورة شراء" : "تعديل يدوي",
        created_at: p.created_at,
      });
    }
    return out
      .filter((e) => tab === "all" || e.kind === tab)
      .filter((e) => status === "all" || e.status === status || (status === "success" && e.status === "info"))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [importRows, exportRows, priceRows, tab, status]);

  const counts = { import: importRows.length, export: exportRows.length, price: priceRows.length };

  // Which streams should the "load more" affect? Load only the ones visible.
  const activeStreams = useMemo(() => {
    if (tab === "all") return [imports, exports, prices];
    if (tab === "import") return [imports];
    if (tab === "export") return [exports];
    return [prices];
  }, [tab, imports, exports, prices]);

  const canLoadMore = activeStreams.some((s) => s.hasNextPage);
  const isFetchingMore = activeStreams.some((s) => s.isFetchingNextPage);
  const loadMore = () => activeStreams.forEach((s) => { if (s.hasNextPage && !s.isFetchingNextPage) s.fetchNextPage(); });

  const anyLoading = imports.isLoading || exports.isLoading || prices.isLoading;

  return (
    <AppShell title="سجل النشاط الموحّد" subtitle="استيراد · تصدير · تغييرات الأسعار — تحديث لحظي" showBack>
      <section className="rounded-2xl bg-card border p-4 shadow-card">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h2 className="text-sm font-bold flex items-center gap-2">
            <Activity className="size-4 text-brand" /> جميع العمليات
            <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 font-normal">
              <Radio className="size-3 animate-pulse" /> لحظي
            </span>
          </h2>
          <div className="flex items-center gap-2 text-xs">
            <Filter className="size-3 text-muted-foreground" />
            <select value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)}
              className="h-8 rounded-md border border-border bg-background px-2 text-xs">
              <option value="all">كل الحالات</option>
              <option value="success">ناجحة / معلومة</option>
              <option value="failed">فاشلة</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2 mb-4 text-xs">
          {([
            { k: "all", label: "الكل", n: counts.import + counts.export + counts.price },
            { k: "import", label: "استيراد", n: counts.import },
            { k: "export", label: "تصدير", n: counts.export },
            { k: "price", label: "أسعار", n: counts.price },
          ] as { k: Tab; label: string; n: number }[]).map((t) => (
            <button key={t.k} onClick={() => setTab(t.k)}
              className={`h-10 rounded-lg border font-bold ${tab === t.k ? "bg-brand text-brand-foreground border-brand" : "bg-background border-border"}`}>
              {t.label} <span className="opacity-70 nums">({formatNumber(t.n)})</span>
            </button>
          ))}
        </div>

        {anyLoading ? (
          <p className="text-center text-muted-foreground py-8 text-sm">جاري التحميل...</p>
        ) : entries.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">
            لا توجد سجلات بعد.
            <div className="mt-3 flex justify-center gap-2 text-xs">
              <Link to="/import" className="text-brand hover:underline">صفحة الاستيراد</Link>
              <span>·</span>
              <Link to="/export" className="text-brand hover:underline">صفحة التصدير</Link>
              <span>·</span>
              <Link to="/price-history" className="text-brand hover:underline">سجل الأسعار</Link>
            </div>
          </div>
        ) : (
          <>
            <ul className="space-y-2">
              {entries.map((e) => {
                const Icon = e.kind === "import" ? Upload : e.kind === "export" ? Download : (e.detail.includes("↑") ? TrendingUp : TrendingDown);
                const statusIcon = e.status === "success" ? <CheckCircle2 className="size-3.5 text-emerald-600" />
                  : e.status === "failed" ? <XCircle className="size-3.5 text-rose-600" />
                  : <Activity className="size-3.5 text-brand" />;
                return (
                  <li key={e.id} className="rounded-lg border p-2.5 text-xs">
                    <div className="flex items-center gap-2 font-bold">
                      <Icon className="size-4 text-brand shrink-0" />
                      {statusIcon}
                      <span className="truncate flex-1">{e.title}</span>
                      <span className="text-[10px] text-muted-foreground font-normal nums shrink-0">
                        {new Date(e.created_at).toLocaleString("ar")}
                      </span>
                    </div>
                    <div className="text-muted-foreground mt-1 nums">{e.detail}</div>
                    {e.meta && <div className={`mt-0.5 text-[10px] ${e.status === "failed" ? "text-rose-600" : "text-muted-foreground"}`}>{e.meta}</div>}
                  </li>
                );
              })}
            </ul>
            <div className="mt-4 flex flex-col items-center gap-2">
              <div className="text-[11px] text-muted-foreground nums">
                عرض {formatNumber(entries.length)} سجل
              </div>
              {canLoadMore && (
                <button onClick={loadMore} disabled={isFetchingMore}
                  className="inline-flex items-center gap-2 px-4 h-9 rounded-md border border-brand/30 text-brand text-xs font-bold hover:bg-brand/5 disabled:opacity-60">
                  {isFetchingMore ? <Loader2 className="size-3.5 animate-spin" /> : null}
                  تحميل المزيد ({PAGE_SIZE})
                </button>
              )}
            </div>
          </>
        )}
      </section>
    </AppShell>
  );
}
