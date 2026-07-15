/**
 * Inventory print report HTML builder.
 * Extracted from `src/routes/products.index.tsx` so integration tests
 * can render the exact print HTML in a headless browser and assert
 * row density / no-wrap guarantees.
 */

export type InventoryPrintRow = {
  name: string;
  barcode?: string | null;
  partNumber?: string | null;
  location?: string | null;
  quantity: number;
  costPrice: number;
  salePrice: number;
};

export type InventoryPrintTotals = {
  qty: number;
  cost: number;
  sale: number;
  count: number;
  lowCount: number;
};

export type InventoryPrintOptions = {
  rows: InventoryPrintRow[];
  totals: InventoryPrintTotals;
  storeName: string;
  logoUrl: string;
};

function fmt(n: number) {
  return new Intl.NumberFormat("en-US").format(Math.round(n * 100) / 100);
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!
  ));
}

export function buildInventoryReportHtml(opts: InventoryPrintOptions): string {
  const { rows, totals, storeName, logoUrl } = opts;
  const today = new Intl.DateTimeFormat("ar-EG-u-nu-latn", {
    year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(new Date());

  const rowsHtml = rows.map((p, i) => `
    <tr>
      <td class="c">${i + 1}</td>
      <td class="r name" title="${escapeHtml(p.name)}">${escapeHtml(p.name)}</td>
      <td class="c mono">${escapeHtml(p.barcode || "—")}</td>
      <td class="c mono">${escapeHtml(p.partNumber || "—")}</td>
      <td class="c mono">${escapeHtml(p.location || "—")}</td>
      <td class="c">${fmt(p.quantity)}</td>
      <td class="c">${fmt(p.costPrice)}</td>
      <td class="c">${fmt(p.salePrice)}</td>
      <td class="c strong">${fmt(p.quantity * p.costPrice)}</td>
    </tr>`).join("");

  return `<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"/>
<title>جرد المخزون — ${escapeHtml(storeName)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; font-family: 'Cairo', sans-serif; color: #0c2340; background: #fff; font-weight: 600; }
  @page { size: A4; margin: 10mm; }
  .sheet { padding: 6mm 8mm; }
  .header { display: flex; align-items: center; justify-content: space-between; gap: 12px; border-bottom: 3px double #0c2340; padding-bottom: 8px; margin-bottom: 10px; }
  .header img { height: 64px; width: 64px; object-fit: contain; }
  .header .title { text-align: center; flex: 1; }
  .header h1 { margin: 0; font-size: 22px; font-weight: 800; letter-spacing: .5px; }
  .header .sub { font-size: 12px; color: #465569; margin-top: 2px; }
  .meta { display: flex; justify-content: space-between; font-size: 11px; color: #465569; margin-bottom: 8px; }
  table { width: 100%; border-collapse: collapse; font-size: 10.5px; table-layout: fixed; }
  thead th { background: #0c2340; color: #fff; padding: 4px 3px; font-weight: 700; border: 1px solid #0c2340; }
  tbody td { padding: 2px 3px; border: 1px solid #d5dbe4; line-height: 1.25; vertical-align: middle; }
  tbody tr { page-break-inside: avoid; }
  tbody tr:nth-child(even) td { background: #f6f8fb; }
  .c { text-align: center; } .r { text-align: right; } .strong { font-weight: 800; }
  .mono { font-family: 'Courier New', monospace; font-size: 10px; white-space: nowrap; }
  .name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  tfoot td { background: #eef2f7; font-weight: 800; padding: 5px 4px; border: 1px solid #0c2340; text-align: center; }
  .summary { margin-top: 10px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
  .summary .card { border: 1px solid #d5dbe4; border-radius: 6px; padding: 6px 8px; }
  .summary .lbl { font-size: 10px; color: #465569; }
  .summary .val { font-size: 13px; font-weight: 800; margin-top: 2px; }
  .footer { margin-top: 12px; text-align: center; font-size: 10px; color: #465569; border-top: 1px solid #d5dbe4; padding-top: 6px; }
  @media print { .noprint { display: none !important; } }
  .noprint { position: fixed; top: 8px; left: 8px; z-index: 10; display: flex; gap: 6px; }
  .noprint button { padding: 8px 14px; border: 0; background: #0c2340; color: #fff; border-radius: 6px; font-family: inherit; font-weight: 700; cursor: pointer; }
  .noprint button.back { background: #6b7280; }
</style></head>
<body>
  <div class="noprint">
    <button class="back" onclick="window.close()">← رجوع</button>
    <button onclick="window.print()">طباعة</button>
  </div>
  <div class="sheet">
    <div class="header">
      <img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(storeName)}"/>
      <div class="title">
        <h1>${escapeHtml(storeName)}</h1>
        <div class="sub">تقرير جرد المخزون الشامل</div>
      </div>
      <img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(storeName)}"/>
    </div>
    <div class="meta"><span>تاريخ الطباعة: ${today}</span><span>عدد الأصناف: ${fmt(rows.length)}</span></div>
    <table>
      <thead><tr>
        <th style="width:30px">#</th><th>المنتج</th>
        <th style="width:100px">الباركود</th>
        <th style="width:90px">رقم القطعة</th>
        <th style="width:70px">الرف</th>
        <th style="width:55px">الكمية</th><th style="width:75px">سعر الشراء</th>
        <th style="width:75px">سعر البيع</th><th style="width:90px">قيمة التكلفة</th>
      </tr></thead>
      <tbody>${rowsHtml}</tbody>
      <tfoot><tr>
        <td colspan="5">الإجماليات</td>
        <td>${fmt(totals.qty)}</td><td>—</td><td>—</td>
        <td>${fmt(totals.cost)}</td>
      </tr></tfoot>
    </table>
    <div class="summary">
      <div class="card"><div class="lbl">عدد الأصناف</div><div class="val">${fmt(totals.count)}</div></div>
      <div class="card"><div class="lbl">إجمالي الكمية</div><div class="val">${fmt(totals.qty)}</div></div>
      <div class="card"><div class="lbl">قيمة المخزون (تكلفة)</div><div class="val">${fmt(totals.cost)}</div></div>
      <div class="card"><div class="lbl">قيمة المخزون (بيع)</div><div class="val">${fmt(totals.sale)}</div></div>
    </div>
    <div class="footer">© ${new Date().getFullYear()} ${escapeHtml(storeName)} — نظام المهندس لإدارة قطع غيار السيارات</div>
  </div>
  <script>window.addEventListener('load',()=>setTimeout(()=>window.print(),400));</script>
</body></html>`;
}

/**
 * Density expectations validated by the integration test.
 * Kept beside the builder so tests + implementation move together.
 */
export const PRINT_DENSITY = {
  /** Max height (px) of a single body row rendered at ~96dpi. */
  MAX_ROW_HEIGHT_PX: 24,
  /** Minimum rows expected to fit inside a single A4 printable area. */
  MIN_ROWS_PER_A4_PAGE: 25,
  /** A4 usable content height in px at 96dpi minus header/summary/footer. */
  A4_TABLE_AREA_PX: 780,
} as const;
