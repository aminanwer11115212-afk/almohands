import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useMemo } from "react";
import { Download, Upload, FileSpreadsheet, Loader2, CheckCircle2, AlertTriangle, Trash2 } from "lucide-react";
import * as XLSX from "xlsx";
import { AppShell } from "@/components/AppShell";
import { PermissionGate } from "@/components/PermissionGate";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { handleError } from "@/lib/errors";
import { logger, newRequestId } from "@/lib/logger";

export const Route = createFileRoute("/import")({
  head: () => ({ meta: [{ title: "استيراد إكسل — المهندس" }] }),
  component: ImportPageGuarded,
});

function ImportPageGuarded() {
  return (
    <PermissionGate perm="import_export">
      <ImportPage />
    </PermissionGate>
  );
}

type ColKey = "name" | "barcode" | "category" | "unit" | "location" | "quantity" | "min_quantity" | "cost_price" | "sale_price" | "notes";

const COL_ALIASES: Record<ColKey, string[]> = {
  name: ["الاسم", "اسم المنتج", "name", "product", "product_name"],
  barcode: ["الباركود", "باركود", "barcode", "sku"],
  category: ["الفئة", "التصنيف", "category"],
  unit: ["الوحدة", "unit"],
  location: ["الموقع", "location"],
  quantity: ["الكمية", "المخزون", "quantity", "stock", "qty"],
  min_quantity: ["الحد الأدنى", "min", "min_quantity"],
  cost_price: ["سعر الشراء", "التكلفة", "cost", "cost_price"],
  sale_price: ["سعر البيع", "السعر", "price", "sale_price"],
  notes: ["ملاحظات", "notes"],
};

type ParsedRow = {
  name: string;
  barcode: string | null;
  category: string | null;
  unit: string;
  location: string | null;
  quantity: number;
  min_quantity: number;
  cost_price: number;
  sale_price: number;
  notes: string | null;
  _rowIndex: number;
  _error?: string;
};

function ImportPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState<string>("");
  const [pricePct, setPricePct] = useState<number>(0);
  const [busy, setBusy] = useState(false);

  const validRows = useMemo(() => rows.filter((r) => !r._error), [rows]);
  const invalidRows = useMemo(() => rows.filter((r) => r._error), [rows]);

  /** Preview sale price after applying the % increase. */
  const bumpedPrice = (base: number) => {
    const pct = Number.isFinite(pricePct) ? pricePct : 0;
    return Math.round(base * (1 + pct / 100) * 100) / 100;
  };

  function downloadTemplate() {
    try {
      const sample = [
        {
          "الاسم": "زيت محرك 5W-30",
          "الباركود": "1234567890",
          "الفئة": "زيوت",
          "الوحدة": "قطعة",
          "الموقع": "رف A1",
          "الكمية": 20,
          "الحد الأدنى": 5,
          "سعر الشراء": 1200,
          "سعر البيع": 1500,
          "ملاحظات": "",
        },
      ];
      const ws = XLSX.utils.json_to_sheet(sample);
      ws["!cols"] = Object.keys(sample[0]).map(() => ({ wch: 18 }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "المنتجات");
      XLSX.writeFile(wb, "نموذج-استيراد-المنتجات.xlsx");
      toast.success("تم تنزيل الملف النموذجي");
    } catch (e) {
      handleError(e, "تعذّر تنزيل الملف", { event: "import_template_download_failed" });
    }
  }

  function pickFile() {
    inputRef.current?.click();
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting same file
    if (!file) return;
    setFileName(file.name);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      if (!sheet) throw new Error("لم يتم العثور على أوراق بيانات في الملف");
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
      if (raw.length === 0) throw new Error("الملف فارغ");
      const parsed = raw.map((r, i) => parseRow(r, i + 2)); // +2: 1 for header, 1 for 1-based
      setRows(parsed);
      const okCount = parsed.filter((p) => !p._error).length;
      toast.success(`تمت قراءة ${parsed.length} صف — ${okCount} صالح`);
    } catch (err) {
      handleError(err, "تعذّر قراءة ملف الإكسل", { event: "import_file_parse_failed" });
      setRows([]);
    }
  }

  function parseRow(raw: Record<string, unknown>, rowIndex: number): ParsedRow {
    const pick = (key: keyof typeof COL_ALIASES): unknown => {
      for (const alias of COL_ALIASES[key]) {
        for (const k of Object.keys(raw)) {
          if (String(k).trim().toLowerCase() === alias.toLowerCase()) return raw[k];
        }
      }
      return "";
    };
    const num = (v: unknown, def = 0) => {
      const n = Number(String(v ?? "").toString().replace(/,/g, "").trim());
      return Number.isFinite(n) ? n : def;
    };
    const str = (v: unknown, def = "") => {
      const s = String(v ?? "").trim();
      return s || def;
    };
    const row: ParsedRow = {
      name: str(pick("name")),
      barcode: str(pick("barcode")) || null,
      category: str(pick("category")) || null,
      unit: str(pick("unit"), "قطعة"),
      location: str(pick("location")) || null,
      quantity: num(pick("quantity")),
      min_quantity: num(pick("min_quantity")),
      cost_price: num(pick("cost_price")),
      sale_price: num(pick("sale_price")),
      notes: str(pick("notes")) || null,
      _rowIndex: rowIndex,
    };
    // Validate: name required, non-negative numerics, price >= 0
    if (!row.name) row._error = "الاسم مطلوب";
    else if (row.quantity < 0) row._error = "الكمية سالبة";
    else if (row.cost_price < 0) row._error = "سعر الشراء سالب";
    else if (row.sale_price < 0) row._error = "سعر البيع سالب";
    return row;
  }

  async function commitImport() {
    if (busy) return;
    if (validRows.length === 0) {
      toast.error("لا توجد صفوف صالحة للاستيراد");
      return;
    }
    setBusy(true);
    const reqId = newRequestId("imp");
    logger.info("import_start", { context: { reqId, rows: validRows.length, pricePct } });
    try {
      const { data: authData, error: authErr } = await supabase.auth.getUser();
      if (authErr || !authData?.user) throw new Error("جلسة المستخدم غير صالحة");
      const uid = authData.user.id;

      const payload = validRows.map((r) => ({
        user_id: uid,
        name: r.name,
        barcode: r.barcode,
        category: r.category,
        unit: r.unit || "قطعة",
        location: r.location,
        quantity: r.quantity,
        min_quantity: r.min_quantity,
        cost_price: r.cost_price,
        sale_price: bumpedPrice(r.sale_price),
        notes: r.notes,
        is_active: true,
      }));

      // Batch in chunks of 200 to avoid payload-too-large.
      const CHUNK = 200;
      let inserted = 0;
      for (let i = 0; i < payload.length; i += CHUNK) {
        const chunk = payload.slice(i, i + CHUNK);
        const { error } = await supabase.from("products").insert(chunk);
        if (error) throw error;
        inserted += chunk.length;
      }

      toast.success(`تم استيراد ${inserted} منتج بنجاح${pricePct !== 0 ? ` (بعد زيادة ${pricePct}%)` : ""}`);
      logger.info("import_success", { context: { reqId, inserted } });
      setRows([]);
      setFileName("");
    } catch (e) {
      handleError(e, "تعذّر إتمام الاستيراد", {
        event: "import_failed",
        context: { reqId, rows: validRows.length },
        action: { label: "إعادة المحاولة", onClick: () => commitImport() },
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell title="استيراد المنتجات من إكسل" subtitle="نموذج جاهز · معاينة · زيادة سعر بالنسبة" showBack>
      {/* Step 1: template */}
      <section className="rounded-2xl bg-card shadow-card border border-border p-5">
        <h2 className="text-base font-extrabold">خطوة 1: تنزيل الملف الفارغ</h2>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
          نزّل ملف إكسل جاهز يحتوي على أسماء الأعمدة المطلوبة (الاسم، الباركود، الفئة، الوحدة، الكمية، الحد الأدنى، سعر الشراء، سعر البيع، ملاحظات).
          املأه ثم ارجع هنا لرفعه.
        </p>
        <div className="mt-4 flex justify-center">
          <button
            onClick={downloadTemplate}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl border-2 border-brand/30 text-brand font-bold hover:bg-brand/5 transition"
          >
            <Download className="size-4" />
            تنزيل النموذج
          </button>
        </div>
      </section>

      <hr className="my-6 border-border" />

      {/* Step 2: upload */}
      <section className="rounded-2xl bg-card shadow-card border border-border p-5">
        <h2 className="text-base font-extrabold">خطوة 2: رفع الملف</h2>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
          اختر ملف الإكسل الذي حفظته. ستظهر معاينة قبل الاستيراد النهائي مع تحديد أي صف به مشكلة.
        </p>
        <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" onChange={onFile} className="hidden" />
        <div className="mt-5 flex justify-center">
          <button
            onClick={pickFile}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-brand text-brand-foreground font-bold shadow-card hover:opacity-95 transition"
          >
            <Upload className="size-4" />
            اختيار ملف الإكسل
          </button>
        </div>
        {fileName && (
          <div className="mt-3 text-xs text-muted-foreground text-center flex items-center justify-center gap-1">
            <FileSpreadsheet className="size-3.5" /> الملف الحالي: <span className="font-semibold text-foreground">{fileName}</span>
          </div>
        )}
      </section>

      {/* Step 3: preview + price bump */}
      {rows.length > 0 && (
        <>
          <hr className="my-6 border-border" />
          <section className="rounded-2xl bg-card shadow-card border border-border p-5">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h2 className="text-base font-extrabold">خطوة 3: معاينة وضبط الأسعار</h2>
              <div className="text-xs flex items-center gap-3">
                <span className="inline-flex items-center gap-1 text-emerald-700">
                  <CheckCircle2 className="size-3.5" /> صالح: <span className="font-bold nums">{validRows.length}</span>
                </span>
                {invalidRows.length > 0 && (
                  <span className="inline-flex items-center gap-1 text-destructive">
                    <AlertTriangle className="size-3.5" /> يحتوي مشاكل: <span className="font-bold nums">{invalidRows.length}</span>
                  </span>
                )}
              </div>
            </div>

            {/* Price bump control */}
            <div className="rounded-xl border border-border bg-muted/40 p-4 mb-4">
              <label className="text-sm font-bold block mb-2">
                زيادة سعر البيع بنسبة مئوية (اختياري)
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={-50}
                  max={200}
                  step={1}
                  value={pricePct}
                  onChange={(e) => setPricePct(Number(e.target.value))}
                  className="flex-1 accent-brand"
                />
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    step="0.1"
                    value={pricePct}
                    onChange={(e) => setPricePct(Number(e.target.value) || 0)}
                    className="w-20 text-center h-9 rounded-md border border-input bg-background nums"
                  />
                  <span className="font-bold">%</span>
                </div>
                <button
                  onClick={() => setPricePct(0)}
                  className="text-xs text-muted-foreground hover:text-foreground underline"
                >
                  صفر
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground mt-2">
                القيم الموجبة ترفع سعر البيع، والسالبة تخفّضه. لن تتغيّر أسعار الشراء.
              </p>
            </div>

            {/* Rows table */}
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm min-w-[720px]">
                <thead className="bg-muted/60 text-muted-foreground">
                  <tr>
                    <th className="p-2 text-right">الاسم</th>
                    <th className="p-2 w-24">الباركود</th>
                    <th className="p-2 w-20">الكمية</th>
                    <th className="p-2 w-24">سعر الشراء</th>
                    <th className="p-2 w-28">سعر البيع الأصلي</th>
                    <th className="p-2 w-28">سعر البيع بعد الزيادة</th>
                    <th className="p-2 w-32">الحالة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((r) => (
                    <tr key={r._rowIndex} className={r._error ? "bg-destructive/5" : ""}>
                      <td className="p-2">{r.name || <span className="text-muted-foreground">—</span>}</td>
                      <td className="p-2 nums text-xs">{r.barcode || "—"}</td>
                      <td className="p-2 nums text-center">{r.quantity}</td>
                      <td className="p-2 nums text-center">{r.cost_price}</td>
                      <td className="p-2 nums text-center">{r.sale_price}</td>
                      <td className="p-2 nums text-center font-semibold text-brand">
                        {bumpedPrice(r.sale_price)}
                      </td>
                      <td className="p-2 text-xs">
                        {r._error ? (
                          <span className="inline-flex items-center gap-1 text-destructive font-semibold">
                            <AlertTriangle className="size-3" /> {r._error}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-emerald-700">
                            <CheckCircle2 className="size-3" /> جاهز
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => { setRows([]); setFileName(""); }}
                className="inline-flex items-center gap-1 px-4 h-9 rounded-md border border-input bg-background text-sm hover:bg-muted"
              >
                <Trash2 className="size-4" /> إلغاء
              </button>
              <button
                onClick={commitImport}
                disabled={busy || validRows.length === 0}
                className="inline-flex items-center gap-1 px-5 h-9 rounded-md bg-brand text-white text-sm font-bold hover:opacity-95 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                استيراد {validRows.length} منتج
              </button>
            </div>
          </section>
        </>
      )}
    </AppShell>
  );
}
