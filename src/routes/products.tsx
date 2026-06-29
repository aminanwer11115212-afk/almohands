import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Search, Filter, Plus, ArrowUpDown } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { products } from "@/data/mock";
import { formatNumber } from "@/lib/format";

export const Route = createFileRoute("/products")({
  head: () => ({
    meta: [{ title: "مخزن المنتجات — المهندس" }],
  }),
  component: ProductsPage,
});

type SortKey = "name" | "qty" | "price";

function ProductsPage() {
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [asc, setAsc] = useState(true);

  const rows = useMemo(() => {
    const filtered = products.filter((p) => p.name.includes(q.trim()));
    const sorted = [...filtered].sort((a, b) => {
      const va = a[sortKey];
      const vb = b[sortKey];
      if (typeof va === "number" && typeof vb === "number") return asc ? va - vb : vb - va;
      return asc
        ? String(va).localeCompare(String(vb), "ar")
        : String(vb).localeCompare(String(va), "ar");
    });
    return sorted;
  }, [q, sortKey, asc]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setAsc((v) => !v);
    else {
      setSortKey(key);
      setAsc(true);
    }
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
              placeholder="ادخل اسم المنتج"
              className="w-full h-12 rounded-xl border border-border bg-card pr-9 pl-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
            />
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-2xl overflow-hidden border border-border bg-card shadow-card">
        <div className="grid grid-cols-[1fr_auto_auto] bg-muted text-muted-foreground text-xs font-bold">
          <SortHeader label="المنتج" active={sortKey === "name"} asc={asc} onClick={() => toggleSort("name")} className="text-end" />
          <SortHeader label="الكمية" active={sortKey === "qty"} asc={asc} onClick={() => toggleSort("qty")} className="w-24 text-center" />
          <SortHeader label="السعر" active={sortKey === "price"} asc={asc} onClick={() => toggleSort("price")} className="w-28 text-center" />
        </div>
        <ul className="divide-y divide-border">
          {rows.map((p) => (
            <li key={p.id} className="grid grid-cols-[1fr_auto_auto] items-center px-4 py-3.5 text-sm">
              <span className="text-foreground font-semibold text-end leading-tight">{p.name}</span>
              <span className="w-24 text-center text-foreground nums">{formatNumber(p.qty)}</span>
              <span className="w-28 text-center text-foreground font-bold nums">{formatNumber(p.price)}</span>
            </li>
          ))}
          {rows.length === 0 ? (
            <li className="py-10 text-center text-sm text-muted-foreground">لا توجد منتجات مطابقة</li>
          ) : null}
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
