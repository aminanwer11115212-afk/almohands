import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { useEffect } from "react";
import { Search, Filter, Plus, ArrowUpDown, Loader2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { formatNumber } from "@/lib/format";
import { useProducts, type SortKey } from "@/hooks/use-products";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

const searchSchema = z.object({
  q: fallback(z.string(), "").default(""),
  sort: fallback(z.enum(["name", "quantity", "sale_price"]), "name").default("name"),
  asc: fallback(z.boolean(), true).default(true),
});

type ProductsSearch = z.infer<typeof searchSchema>;

export const Route = createFileRoute("/products")({
  validateSearch: zodValidator(searchSchema),
  head: () => ({ meta: [{ title: "مخزن المنتجات — المهندس" }] }),
  component: ProductsPage,
});

function ProductsPage() {
  const { q, sort, asc } = Route.useSearch();
  const navigate = useNavigate({ from: "/products" });
  const queryClient = useQueryClient();
  const { data: rows = [], isLoading, isError, error } = useProducts({ q, sort, asc });

  // Realtime sync
  useEffect(() => {
    const channel = supabase
      .channel("products-feed")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "products" },
        () => queryClient.invalidateQueries({ queryKey: ["products"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  function setQ(value: string) {
    navigate({ search: (prev) => ({ ...prev, q: value }), replace: true });
  }

  function toggleSort(key: SortKey) {
    navigate({
      search: (prev) => ({
        ...prev,
        sort: key,
        asc: prev.sort === key ? !prev.asc : true,
      }),
      replace: true,
    });
  }

  return (
    <AppShell title="مخزن المنتجات" showBack>
      <div className="relative">
        <label htmlFor="search" className="block text-xs text-muted-foreground mb-1 text-end">
          ابحث عن منتج
        </label>
        <div className="flex items-stretch gap-2">
          <button
            type="button"
            className="shrink-0 grid place-items-center w-12 rounded-xl border border-border bg-card text-muted-foreground"
            aria-label="فلتر"
          >
            <Filter className="size-5" />
          </button>
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <input
              id="search"
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ادخل اسم المنتج أو الباركود"
              className="w-full h-12 rounded-xl border border-border bg-card pr-9 pl-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
            />
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-2xl overflow-hidden border border-border bg-card shadow-card">
        <div className="grid grid-cols-[1fr_auto_auto] bg-muted text-muted-foreground text-xs font-bold">
          <SortHeader label="المنتج" active={sort === "name"} asc={asc} onClick={() => toggleSort("name")} className="text-end" />
          <SortHeader label="الكمية" active={sort === "quantity"} asc={asc} onClick={() => toggleSort("quantity")} className="w-24 text-center" />
          <SortHeader label="السعر" active={sort === "sale_price"} asc={asc} onClick={() => toggleSort("sale_price")} className="w-28 text-center" />
        </div>
        <ul className="divide-y divide-border">
          {isLoading ? (
            <li className="py-10 grid place-items-center text-sm text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
            </li>
          ) : isError ? (
            <li className="py-10 text-center text-sm text-destructive">
              {(error as Error)?.message || "تعذّر تحميل المنتجات"}
            </li>
          ) : rows.length === 0 ? (
            <li className="py-10 text-center text-sm text-muted-foreground">
              {q ? "لا توجد منتجات مطابقة" : "لا توجد منتجات بعد — اضغط + لإضافة منتج"}
            </li>
          ) : (
            rows.map((p) => (
              <li key={p.id} className="grid grid-cols-[1fr_auto_auto] items-center px-4 py-3.5 text-sm">
                <span className="text-foreground font-semibold text-end leading-tight">{p.name}</span>
                <span className="w-24 text-center text-foreground nums">{formatNumber(p.quantity)}</span>
                <span className="w-28 text-center text-foreground font-bold nums">{formatNumber(p.salePrice)}</span>
              </li>
            ))
          )}
        </ul>
      </div>

      <button
        type="button"
        className="fixed bottom-6 left-6 grid place-items-center size-14 rounded-full bg-brand text-brand-foreground shadow-fab hover:scale-105 transition"
        aria-label="إضافة منتج"
      >
        <Plus className="size-7" />
      </button>
    </AppShell>
  );
}

function SortHeader({
  label,
  active,
  asc,
  onClick,
  className = "",
}: {
  label: string;
  active: boolean;
  asc: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-center gap-1 px-3 py-3 ${className}`}
    >
      <span>{label}</span>
      <ArrowUpDown className={`size-3 ${active ? "text-brand" : "opacity-50"} ${active && !asc ? "rotate-180" : ""}`} />
    </button>
  );
}
