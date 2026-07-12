// @vitest-environment jsdom
/**
 * Integration test for the inventory print report.
 *
 * Guarantees:
 *  1. Every input product produces exactly one <tr> — nothing is dropped.
 *  2. Long Arabic names / long barcodes stay on a single line (the very
 *     bug that shrank the print to 5 rows/page). Both the name cell and
 *     the mono cells must carry `white-space: nowrap`.
 *  3. The row-height budget derived from font-size + line-height + cell
 *     padding stays under `PRINT_DENSITY.MAX_ROW_HEIGHT_PX`, so the A4
 *     table area fits at least `MIN_ROWS_PER_A4_PAGE` rows.
 *  4. The static column widths declared in <thead> add up to <= the A4
 *     content width (so the table cannot overflow and force wrapping).
 */

import { describe, it, expect } from "vitest";
import {
  buildInventoryReportHtml,
  PRINT_DENSITY,
  type InventoryPrintRow,
} from "../src/lib/inventory-print";

function makeRows(n: number): InventoryPrintRow[] {
  // Deliberately long Arabic name — this is the shape that used to wrap on
  // 3–4 lines and cause the "5 rows per page" bug.
  const longName =
    "إصبح خلفي يسار - ميتسوبيشي لانسر إيفولوشن الجيل العاشر (2016) نسخة اليابان";
  return Array.from({ length: n }, (_, i) => ({
    name: `${longName} #${i + 1}`,
    barcode: `SPR${1000 + i}-EXTRA-LONG-BARCODE`,
    partNumber: `PN-${i}-ABC-DEF-GHI`,
    location: `Shelf-${i}-A1`,
    quantity: i + 1,
    costPrice: 10_000 + i,
    salePrice: 15_000 + i,
  }));
}

const totals = { qty: 100, cost: 1_000_000, sale: 1_500_000, count: 10, lowCount: 0 };

function render(rows: InventoryPrintRow[]): Document {
  const html = buildInventoryReportHtml({
    rows, totals, storeName: "المهندس", logoUrl: "/logo.png",
  });
  const parser = new DOMParser();
  return parser.parseFromString(html, "text/html");
}

describe("buildInventoryReportHtml — row density guarantees", () => {
  it("emits exactly one <tr> per input row (no truncation, no wrap-splits)", () => {
    const rows = makeRows(50);
    const doc = render(rows);
    const bodyRows = doc.querySelectorAll("tbody tr");
    expect(bodyRows.length).toBe(rows.length);
  });

  it("keeps the product name on a single line (white-space: nowrap + ellipsis)", () => {
    const doc = render(makeRows(3));
    const style = doc.querySelector("style")!.textContent!;
    // Extract the `.name { ... }` block and assert nowrap.
    const nameBlock = /\.name\s*\{[^}]*\}/.exec(style)?.[0] ?? "";
    expect(nameBlock).toMatch(/white-space:\s*nowrap/);
    expect(nameBlock).toMatch(/text-overflow:\s*ellipsis/);
    // Every name cell must carry both `.r` and `.name` classes.
    for (const td of doc.querySelectorAll("tbody tr td:nth-child(2)")) {
      expect(td.className).toContain("name");
    }
  });

  it("keeps barcode / part-number / shelf cells on a single line (.mono nowrap)", () => {
    const doc = render(makeRows(3));
    const style = doc.querySelector("style")!.textContent!;
    const monoBlock = /\.mono\s*\{[^}]*\}/.exec(style)?.[0] ?? "";
    expect(monoBlock).toMatch(/white-space:\s*nowrap/);
    // Barcode (col 3), part number (col 4), shelf (col 5) → all .mono
    for (const sel of ["td:nth-child(3)", "td:nth-child(4)", "td:nth-child(5)"]) {
      const cells = doc.querySelectorAll(`tbody tr ${sel}`);
      expect(cells.length).toBeGreaterThan(0);
      for (const td of cells) expect(td.className).toContain("mono");
    }
  });

  it("row-height budget fits >= MIN_ROWS_PER_A4_PAGE rows in the A4 table area", () => {
    // Parse the numbers straight out of the stylesheet so the test breaks
    // the moment someone bumps font-size or padding beyond the budget.
    const doc = render(makeRows(1));
    const style = doc.querySelector("style")!.textContent!;
    const fontSize = Number(/table\s*\{[^}]*font-size:\s*([\d.]+)px/.exec(style)?.[1]);
    const tbodyBlock = /tbody td\s*\{[^}]*\}/.exec(style)?.[0] ?? "";
    const padding = Number(/padding:\s*([\d.]+)px/.exec(tbodyBlock)?.[1]);
    const lineHeight = Number(/line-height:\s*([\d.]+)/.exec(tbodyBlock)?.[1]);

    expect(fontSize).toBeGreaterThan(0);
    expect(padding).toBeGreaterThan(0);
    expect(lineHeight).toBeGreaterThan(0);

    // One-line row: font-size × line-height + 2 × vertical padding + borders.
    const rowHeight = fontSize * lineHeight + padding * 2 + 2; /* 1px top+bottom border */
    expect(rowHeight).toBeLessThanOrEqual(PRINT_DENSITY.MAX_ROW_HEIGHT_PX);

    const rowsPerPage = Math.floor(PRINT_DENSITY.A4_TABLE_AREA_PX / rowHeight);
    expect(rowsPerPage).toBeGreaterThanOrEqual(PRINT_DENSITY.MIN_ROWS_PER_A4_PAGE);
  });

  it("declared column widths fit inside the A4 printable width (no horizontal overflow)", () => {
    const doc = render(makeRows(1));
    const widths = Array.from(doc.querySelectorAll("thead th[style]"))
      .map((th) => Number(/width:\s*(\d+)px/.exec(th.getAttribute("style") ?? "")?.[1] ?? 0));
    const fixedSum = widths.reduce((a, b) => a + b, 0);
    // A4 = 210mm; @page margin 10mm each side + .sheet padding 8mm each side ≈ 174mm
    // At 96dpi: 174mm ≈ 658px. The name column is fluid, so fixed widths must
    // leave at least ~120px for the name column.
    const A4_CONTENT_PX = 658;
    expect(fixedSum).toBeLessThanOrEqual(A4_CONTENT_PX - 120);
  });

  it("escapes HTML in product names (defence-in-depth)", () => {
    const doc = render([{
      name: '<script>alert("x")</script>', barcode: null, partNumber: null,
      location: null, quantity: 1, costPrice: 1, salePrice: 1,
    }]);
    const nameCell = doc.querySelector("tbody tr td:nth-child(2)")!;
    expect(nameCell.textContent).toBe('<script>alert("x")</script>');
    expect(nameCell.querySelector("script")).toBeNull();
  });
});
