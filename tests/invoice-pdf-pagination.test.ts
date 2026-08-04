// @vitest-environment jsdom
/**
 * Multi-page invoices must be paginated, not sliced.
 *
 * The old export rasterised the whole sheet into one tall bitmap and cut it
 * every 285mm, so a row was chopped in half (and reappeared at the top of the
 * next page) and pages 2..n had no invoice header and no column titles. Each
 * page is now built as a standalone sheet before it is captured.
 */

import { describe, it, expect } from "vitest";
import { splitSheetIntoPages } from "../src/lib/invoice-share";
import { paginateRows, A4_PAGE_CONTENT_PX } from "../src/lib/pdf-page-size";

const CHROME = 260; // sheet padding + header + meta strip + table head
const TAIL = 220; // total row + summary boxes + signatures
const ROW = 32;

/** An invoice sheet shaped like <A4Invoice />, measured via data-h. */
function buildSheet(rowCount: number): HTMLElement {
  const rows = Array.from(
    { length: rowCount },
    (_, i) =>
      `<tr data-h="${ROW}"><td>${i + 1}</td><td>صنف ${i + 1}</td><td>1</td><td>1</td><td>1</td></tr>`,
  ).join("");

  const sheet = document.createElement("div");
  sheet.className = "print-a4";
  sheet.dataset.h = String(CHROME + rowCount * ROW + TAIL);
  sheet.innerHTML = `
    <div class="a4-head"><h1>فاتورة مبدئية</h1></div>
    <table>
      <thead><tr><th>م</th><th>الصنف</th><th>السعر (وحدة)</th><th>الكمية</th><th>الإجمالي</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot data-h="60"><tr><td>المجموع الكلي</td></tr></tfoot>
    </table>
    <div class="a4-summary" data-h="160">الإجمالي / المدفوع / الحالة</div>`;
  return sheet;
}

const measure = (el: Element) => Number((el as HTMLElement).dataset?.h ?? 0);
const split = (rowCount: number) => splitSheetIntoPages(buildSheet(rowCount), { measure });
const rowNumbers = (page: HTMLElement) =>
  Array.from(page.querySelectorAll("tbody tr")).map((tr) => Number(tr.firstElementChild!.textContent));

describe("splitSheetIntoPages", () => {
  it("leaves a short invoice as a single capture", () => {
    expect(split(10)).toBeNull();
    // Still one page when it only just overflows — that case shrinks to fit.
    expect(split(25)).toBeNull();
  });

  it("splits a 60-row invoice into standalone pages", () => {
    const pages = split(60)!;
    expect(pages).not.toBeNull();
    expect(pages.length).toBeGreaterThan(1);

    for (const page of pages) {
      // Every page is a whole invoice: header, meta and column titles.
      expect(page.querySelector(".a4-head")).not.toBeNull();
      expect(page.querySelector("thead")).not.toBeNull();
      expect(page.querySelectorAll("thead th")).toHaveLength(5);
    }
  });

  it("keeps every row exactly once, in order, and never splits one", () => {
    const pages = split(60)!;
    const seen = pages.flatMap(rowNumbers);
    expect(seen).toEqual(Array.from({ length: 60 }, (_, i) => i + 1));
  });

  it("puts the totals and signatures on the last page only", () => {
    const pages = split(60)!;
    const last = pages[pages.length - 1];
    expect(last.querySelector("tfoot")).not.toBeNull();
    expect(last.querySelector(".a4-summary")).not.toBeNull();

    for (const page of pages.slice(0, -1)) {
      expect(page.querySelector("tfoot")).toBeNull();
      expect(page.querySelector(".a4-summary")).toBeNull();
    }
  });

  it("numbers the pages", () => {
    const pages = split(60)!;
    pages.forEach((page, i) => {
      expect(page.querySelector(".a4-page-label")?.textContent).toBe(
        `صفحة ${i + 1} من ${pages.length}`,
      );
    });
  });

  it("never lets a page's content exceed one A4 content box", () => {
    const pages = split(60)!;
    pages.forEach((page, i) => {
      const isLast = i === pages.length - 1;
      const height = CHROME + rowNumbers(page).length * ROW + (isLast ? TAIL : 0);
      expect(height).toBeLessThanOrEqual(A4_PAGE_CONTENT_PX);
    });
  });

  it("returns null when there are no rows to split", () => {
    const sheet = buildSheet(0);
    sheet.dataset.h = String(A4_PAGE_CONTENT_PX * 4);
    expect(splitSheetIntoPages(sheet, { measure })).toBeNull();
  });
});

describe("paginateRows", () => {
  const rows = (n: number, h = ROW) => Array.from({ length: n }, () => h);

  it("fills each page up to the usable height", () => {
    const pageHeight = 1000;
    const pages = paginateRows({
      rowHeights: rows(40),
      chromeHeight: 200,
      tailHeight: 0,
      pageHeight,
    });
    // (1000 - 200) / 32 = 25 rows per page.
    expect(pages[0]).toHaveLength(25);
    expect(pages.flat()).toHaveLength(40);
  });

  it("moves the tail to its own page when it no longer fits", () => {
    // 25 rows exactly fill the usable height, leaving no room for the tail.
    const pages = paginateRows({
      rowHeights: rows(25),
      chromeHeight: 200,
      tailHeight: 300,
      pageHeight: 1000,
    });
    expect(pages).toHaveLength(2);
    expect(pages[0]).toHaveLength(25);
    expect(pages[1]).toEqual([]); // tail-only final page
  });

  it("keeps the tail on the last page when it fits", () => {
    const pages = paginateRows({
      rowHeights: rows(10),
      chromeHeight: 200,
      tailHeight: 300,
      pageHeight: 1000,
    });
    expect(pages).toHaveLength(1);
    expect(pages[0]).toHaveLength(10);
  });

  it("handles rows of differing heights", () => {
    const heights = [100, 200, 300, 400, 500];
    const pages = paginateRows({
      rowHeights: heights,
      chromeHeight: 0,
      tailHeight: 0,
      pageHeight: 600,
    });
    for (const page of pages) {
      const used = page.reduce((sum, i) => sum + heights[i], 0);
      expect(used).toBeLessThanOrEqual(600);
    }
    expect(pages.flat()).toEqual([0, 1, 2, 3, 4]);
  });

  it("degrades to a single page when the chrome alone fills the sheet", () => {
    const pages = paginateRows({
      rowHeights: rows(5),
      chromeHeight: 1200,
      tailHeight: 100,
      pageHeight: 1000,
    });
    expect(pages).toEqual([[0, 1, 2, 3, 4]]);
  });
});
