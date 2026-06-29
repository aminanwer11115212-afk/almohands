import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/prices")({
  head: () => ({ meta: [{ title: "تعديل الأسعار — المهندس" }] }),
  component: PricesPage,
});

function PricesPage() {
  const [target, setTarget] = useState<"sell" | "buy">("sell");
  const [dir, setDir] = useState<"inc" | "dec">("inc");
  const [category, setCategory] = useState("جميع المنتجات");
  const [percent, setPercent] = useState("");

  return (
    <AppShell title="تعديل الاسعار" showBack>
      <form
        onSubmit={(e) => {
          e.preventDefault();
        }}
        className="space-y-6 pt-2"
      >
        <fieldset>
          <legend className="text-sm font-bold text-end w-full">تعديل سعر البيع/الشراء</legend>
          <div className="mt-2 space-y-2">
            <Radio
              label="سعر البيع"
              checked={target === "sell"}
              onChange={() => setTarget("sell")}
              name="target"
            />
            <Radio
              label="سعر الشراء"
              checked={target === "buy"}
              onChange={() => setTarget("buy")}
              name="target"
              muted
            />
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-sm font-bold text-end w-full">تعديل السعر بالزيادة/بالنقصان</legend>
          <div className="mt-2 space-y-2">
            <Radio
              label="بالزيادة (+)"
              checked={dir === "inc"}
              onChange={() => setDir("inc")}
              name="dir"
            />
            <Radio
              label="بالنقصان (-)"
              checked={dir === "dec"}
              onChange={() => setDir("dec")}
              name="dir"
              muted
            />
          </div>
        </fieldset>

        <div>
          <label className="block text-sm font-bold text-end mb-1">التصنيف</label>
          <div className="relative">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full h-12 appearance-none rounded-xl border-2 border-brand/30 bg-card px-4 text-sm text-end outline-none focus:border-brand"
            >
              <option>جميع المنتجات</option>
              <option>محرك</option>
              <option>فرامل</option>
              <option>تعليق</option>
              <option>زيوت</option>
              <option>فلاتر</option>
              <option>كهرباء</option>
            </select>
            <ChevronDown className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-brand" />
          </div>
        </div>

        <div>
          <label className="block text-sm font-bold text-end mb-1">قيمة التغيير</label>
          <div className="flex items-stretch gap-2">
            <span className="shrink-0 grid place-items-center w-14 rounded-xl border-2 border-brand/30 bg-muted text-brand font-bold">
              %
            </span>
            <input
              type="number"
              value={percent}
              onChange={(e) => setPercent(e.target.value)}
              placeholder="ادخل النسبة"
              className="flex-1 h-12 rounded-xl border-2 border-brand/30 bg-card px-4 text-sm text-end outline-none focus:border-brand"
            />
          </div>
        </div>

        <button
          type="submit"
          className="w-full h-12 rounded-xl bg-brand text-brand-foreground font-bold shadow-card hover:opacity-95 transition"
        >
          تعديل الاسعار
        </button>
      </form>
    </AppShell>
  );
}

function Radio({
  label,
  checked,
  onChange,
  name,
  muted = false,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
  name: string;
  muted?: boolean;
}) {
  return (
    <label className="flex items-center justify-end gap-2 cursor-pointer">
      <span className={`text-sm ${muted && !checked ? "text-muted-foreground" : "text-foreground"}`}>
        {label}
      </span>
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onChange}
        className="size-5 accent-[var(--brand)]"
      />
    </label>
  );
}
