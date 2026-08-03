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
