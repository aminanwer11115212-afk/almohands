/**
 * Page geometry for exported invoice PDFs — pure maths, no DOM.
 *
 * Every exported A4 invoice is a real ISO A4 portrait sheet (210 × 297 mm).
 * The same numbers drive the off-screen rasterisation width used by
 * `invoice-share.ts`, so the invoice is always laid out at A4 width and never
 * at the phone's viewport width — the latter is what produced oversized,
 * overlapping Arabic text spread across two pages.
 */

/** Millimetres per CSS pixel at 96 DPI. */
export const MM_PER_PX = 25.4 / 96;

/** ISO A4 portrait, in millimetres. */
export const A4_MM = { width: 210, height: 297 } as const;
/** 80 mm thermal roll width, in millimetres. */
export const THERMAL_WIDTH_MM = 80;
/** Page margins per format, in millimetres (match the @media print CSS). */
export const PDF_MARGIN_MM = { a4: 6, thermal: 2 } as const;

/** Layout width used when rasterising an A4 sheet: exactly 210 mm @ 96 DPI. */
export const A4_CAPTURE_WIDTH_PX = Math.round(A4_MM.width / MM_PER_PX); // 794
/** Layout height of one A4 sheet at 96 DPI. */
export const A4_CAPTURE_HEIGHT_PX = Math.round(A4_MM.height / MM_PER_PX); // 1123
/** Layout width used when rasterising a thermal receipt: 80 mm @ 96 DPI. */
export const THERMAL_CAPTURE_WIDTH_PX = Math.round(THERMAL_WIDTH_MM / MM_PER_PX); // 302

/** Max overflow (as a ratio of one page) still squeezed onto a single sheet. */
export const FIT_TO_PAGE_LIMIT = 1.25;

/**
 * Height, in capture pixels, that maps onto one A4 content box.
 *
 * The sheet is captured 794px wide and drawn 198mm wide, so one captured
 * pixel is 198/794 mm of paper and the 285mm content box holds 1142px.
 */
export const A4_PAGE_CONTENT_PX = Math.floor(
  ((A4_MM.height - PDF_MARGIN_MM.a4 * 2) * A4_CAPTURE_WIDTH_PX) /
    (A4_MM.width - PDF_MARGIN_MM.a4 * 2),
); // 1142

/** Slack kept free on every page so measurement rounding cannot overflow it. */
export const PAGE_SAFETY_PX = 12;

/**
 * Distribute measured table rows over pages.
 *
 * Every page repeats the invoice header and the table head (`chromeHeight`),
 * and the totals + signature block (`tailHeight`) rides on the last page —
 * moving to a page of its own if it no longer fits. Returns one array of row
 * indices per page; the last entry is the page carrying the tail and may be
 * empty when the tail was pushed onto a fresh page.
 */
export function paginateRows(opts: {
  rowHeights: number[];
  chromeHeight: number;
  tailHeight: number;
  pageHeight: number;
}): number[][] {
  const { rowHeights, chromeHeight, tailHeight, pageHeight } = opts;
  const usable = pageHeight - chromeHeight;

  // Degenerate input (a header taller than the page, no rows): one page.
  if (!(usable > 0) || rowHeights.length === 0) return [rowHeights.map((_, i) => i)];

  const pages: number[][] = [[]];
  let used = 0;
  for (let i = 0; i < rowHeights.length; i++) {
    const height = rowHeights[i];
    const current = pages[pages.length - 1];
    if (current.length > 0 && used + height > usable) {
      pages.push([]);
      used = 0;
    }
    pages[pages.length - 1].push(i);
    used += height;
  }

  // The tail is just one more block: if it does not fit under the rows of the
  // final page, it starts a page of its own rather than being cut in half.
  if (tailHeight > 0 && used + tailHeight > usable && pages[pages.length - 1].length > 0) {
    pages.push([]);
  }
  return pages;
}

export type PdfFormat = "a4" | "thermal";

export type PdfPlacement = {
  /** Page size handed to jsPDF, in millimetres. */
  pageWidthMm: number;
  pageHeightMm: number;
  marginMm: number;
  /** Size the rasterised sheet is drawn at, in millimetres. */
  drawWidthMm: number;
  drawHeightMm: number;
  /** Horizontal offset of the drawing (centred when it was shrunk to fit). */
  offsetXMm: number;
  /**
   * Y offset of the image on each page. Page 1 starts at the top margin;
   * later pages shift the same image up by one content height (slicing).
   */
  pageOffsetsMm: number[];
};

/** Width in CSS pixels the sheet must be laid out at before rasterising. */
export function captureWidthPx(format: PdfFormat): number {
  return format === "thermal" ? THERMAL_CAPTURE_WIDTH_PX : A4_CAPTURE_WIDTH_PX;
}

/**
 * Print resolution we aim for. The sheet is laid out at 96 DPI, so a capture
 * scale of 300/96 ≈ 3.125 turns it into a 300 DPI bitmap — the point where
 * small Arabic glyphs stop looking soft on paper and in PDF viewers.
 */
export const TARGET_DPI = 300;
/** CSS DPI: the resolution the sheet is laid out at before scaling. */
export const CSS_DPI = 96;
/**
 * Ceilings that keep the bitmap inside what phone browsers can actually
 * allocate: mobile Safari/Chrome refuse canvases past ~4096px on a side, and
 * a 12 MP canvas already costs ~48 MB of RGBA memory.
 */
export const MAX_CANVAS_DIM = 4096;
export const MAX_CANVAS_PIXELS = 12_000_000;

/**
 * Largest capture scale that reaches `targetDpi` without exceeding the canvas
 * limits. Long invoices quietly get a lower DPI instead of failing to render.
 */
export function computeCaptureScale(
  widthPx: number,
  heightPx: number,
  opts: { targetDpi?: number; maxDim?: number; maxPixels?: number } = {},
): number {
  const { targetDpi = TARGET_DPI, maxDim = MAX_CANVAS_DIM, maxPixels = MAX_CANVAS_PIXELS } = opts;
  const w = Number.isFinite(widthPx) && widthPx > 0 ? widthPx : 1;
  const h = Number.isFinite(heightPx) && heightPx > 0 ? heightPx : 1;

  const ideal = targetDpi / CSS_DPI;
  const byDim = Math.min(maxDim / w, maxDim / h);
  const byArea = Math.sqrt(maxPixels / (w * h));
  const scale = Math.min(ideal, byDim, byArea);

  // Never drop below 1× (a downscaled capture would be unreadable); round to
  // 2 decimals so the same sheet always rasterises identically.
  return Math.max(1, Math.floor(scale * 100) / 100);
}

/**
 * Map a rasterised sheet (canvas pixels) onto A4 / thermal pages.
 *
 * A4 is always emitted at exactly 210 × 297 mm — content that overflows by up
 * to 25% is scaled down onto one sheet, anything longer is sliced across pages.
 */
export function computePdfPlacement(
  canvasWidth: number,
  canvasHeight: number,
  format: PdfFormat = "a4",
): PdfPlacement {
  const isThermal = format === "thermal";
  const marginMm = isThermal ? PDF_MARGIN_MM.thermal : PDF_MARGIN_MM.a4;
  const pageWidthMm = isThermal ? THERMAL_WIDTH_MM : A4_MM.width;
  const contentWidthMm = pageWidthMm - marginMm * 2;

  // Guard against a zero/NaN canvas (html2canvas returning an empty snapshot)
  // so we never hand jsPDF an Infinity page height.
  const safeWidth = Number.isFinite(canvasWidth) && canvasWidth > 0 ? canvasWidth : 1;
  const safeHeight = Number.isFinite(canvasHeight) && canvasHeight > 0 ? canvasHeight : 1;
  const naturalHeightMm = (safeHeight * contentWidthMm) / safeWidth;

  if (isThermal) {
    // Thermal rolls are continuous: one page as tall as the receipt needs.
    return {
      pageWidthMm,
      pageHeightMm: Math.max(A4_MM.height, naturalHeightMm + marginMm * 2),
      marginMm,
      drawWidthMm: contentWidthMm,
      drawHeightMm: naturalHeightMm,
      offsetXMm: marginMm,
      pageOffsetsMm: [marginMm],
    };
  }

  const pageHeightMm = A4_MM.height;
  const contentHeightMm = pageHeightMm - marginMm * 2;
  const base = { pageWidthMm, pageHeightMm, marginMm };

  if (naturalHeightMm <= contentHeightMm) {
    return {
      ...base,
      drawWidthMm: contentWidthMm,
      drawHeightMm: naturalHeightMm,
      offsetXMm: marginMm,
      pageOffsetsMm: [marginMm],
    };
  }

  if (naturalHeightMm <= contentHeightMm * FIT_TO_PAGE_LIMIT) {
    // Slightly too tall: shrink onto a single sheet instead of spilling a few
    // millimetres of the footer onto a nearly empty second page.
    const scale = contentHeightMm / naturalHeightMm;
    const drawWidthMm = contentWidthMm * scale;
    return {
      ...base,
      drawWidthMm,
      drawHeightMm: contentHeightMm,
      offsetXMm: marginMm + (contentWidthMm - drawWidthMm) / 2,
      pageOffsetsMm: [marginMm],
    };
  }

  // Genuinely long invoice: slice the same image across N A4 pages.
  const pages = Math.ceil(naturalHeightMm / contentHeightMm);
  return {
    ...base,
    drawWidthMm: contentWidthMm,
    drawHeightMm: naturalHeightMm,
    offsetXMm: marginMm,
    pageOffsetsMm: Array.from({ length: pages }, (_, i) => marginMm - i * contentHeightMm),
  };
}
