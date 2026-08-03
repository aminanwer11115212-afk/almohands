/**
 * Guarantees for the exported invoice PDF.
 *
 * The bug this pins down: on phones the invoice was rasterised at the viewport
 * width (~360 px) instead of A4 width, then stretched to 198 mm — producing
 * oversized, overlapping Arabic text spilling onto a second page. The export
 * now always lays the sheet out at `A4_CAPTURE_WIDTH_PX`, and the placement
 * maths below must always land on a real 210 × 297 mm page.
 */

import { describe, it, expect } from "vitest";
import {
  A4_MM,
  A4_CAPTURE_WIDTH_PX,
  A4_CAPTURE_HEIGHT_PX,
  THERMAL_CAPTURE_WIDTH_PX,
  PDF_MARGIN_MM,
  captureWidthPx,
  computePdfPlacement,
} from "../src/lib/pdf-page-size";

/** Canvas produced by html2canvas at `scale` for a sheet `heightPx` tall. */
const canvasFor = (widthPx: number, heightPx: number, scale = 2) => ({
  width: widthPx * scale,
  height: heightPx * scale,
});

/** A4 content box in millimetres. */
const CONTENT_W = A4_MM.width - PDF_MARGIN_MM.a4 * 2; // 198
const CONTENT_H = A4_MM.height - PDF_MARGIN_MM.a4 * 2; // 285
/** A4 portrait height at 96 DPI — the on-screen sheet height. */
const A4_HEIGHT_PX = A4_CAPTURE_HEIGHT_PX; // 1123

describe("A4 capture geometry", () => {
  it("rasterises at exactly 210mm / 80mm wide at 96 DPI", () => {
    expect(A4_CAPTURE_WIDTH_PX).toBe(794);
    expect(A4_CAPTURE_HEIGHT_PX).toBe(1123);
    expect(THERMAL_CAPTURE_WIDTH_PX).toBe(302);
    expect(captureWidthPx("a4")).toBe(A4_CAPTURE_WIDTH_PX);
    expect(captureWidthPx("thermal")).toBe(THERMAL_CAPTURE_WIDTH_PX);
  });

  it("keeps an A4-shaped capture on one page at 1:1 scale", () => {
    const canvas = canvasFor(A4_CAPTURE_WIDTH_PX, A4_HEIGHT_PX);
    const p = computePdfPlacement(canvas.width, canvas.height, "a4");

    expect(p.pageOffsetsMm).toHaveLength(1);
    expect(p.drawWidthMm).toBe(CONTENT_W);
    // 794px of capture become 198mm of paper, so a full A4-tall sheet lands at
    // 1123px × 198/794 ≈ 280mm — inside the 285mm content box, one page, no
    // fit-to-page squeeze. This is the shape a normal invoice must produce.
    expect(p.drawHeightMm).toBeCloseTo((A4_HEIGHT_PX * CONTENT_W) / A4_CAPTURE_WIDTH_PX, 5);
    expect(p.drawHeightMm).toBeLessThanOrEqual(CONTENT_H);
  });
});

describe("computePdfPlacement — A4", () => {
  it("always reports a 210 × 297 mm page, whatever the capture size", () => {
    const captures = [
      canvasFor(A4_CAPTURE_WIDTH_PX, 400),
      canvasFor(A4_CAPTURE_WIDTH_PX, A4_HEIGHT_PX),
      canvasFor(A4_CAPTURE_WIDTH_PX, A4_HEIGHT_PX * 3),
      // Even a degenerate narrow capture must not change the paper size.
      canvasFor(360, 2400),
    ];
    for (const c of captures) {
      const p = computePdfPlacement(c.width, c.height, "a4");
      expect(p.pageWidthMm).toBe(210);
      expect(p.pageHeightMm).toBe(297);
      expect(p.marginMm).toBe(6);
    }
  });

  it("never draws outside the printable area on page 1", () => {
    for (const h of [200, 800, 1123, 1400, 4000]) {
      const c = canvasFor(A4_CAPTURE_WIDTH_PX, h);
      const p = computePdfPlacement(c.width, c.height, "a4");
      expect(p.offsetXMm).toBeGreaterThanOrEqual(PDF_MARGIN_MM.a4);
      expect(p.offsetXMm + p.drawWidthMm).toBeLessThanOrEqual(A4_MM.width - PDF_MARGIN_MM.a4 + 1e-9);
      expect(p.pageOffsetsMm[0]).toBe(PDF_MARGIN_MM.a4);
    }
  });

  it("draws a short invoice once, unscaled, at the top margin", () => {
    const c = canvasFor(A4_CAPTURE_WIDTH_PX, 600);
    const p = computePdfPlacement(c.width, c.height, "a4");
    expect(p.pageOffsetsMm).toEqual([PDF_MARGIN_MM.a4]);
    expect(p.drawWidthMm).toBe(CONTENT_W);
    // 600px of a 794px-wide capture → 600 × 198/794 ≈ 149.6mm.
    expect(p.drawHeightMm).toBeCloseTo((600 * CONTENT_W) / A4_CAPTURE_WIDTH_PX, 5);
    expect(p.drawHeightMm).toBeLessThan(CONTENT_H);
  });

  it("shrinks a slight overflow (≤25%) onto a single sheet, centred", () => {
    // 20% taller than the content box.
    const heightPx = Math.round(((CONTENT_H * 1.2) / CONTENT_W) * A4_CAPTURE_WIDTH_PX);
    const c = canvasFor(A4_CAPTURE_WIDTH_PX, heightPx);
    const p = computePdfPlacement(c.width, c.height, "a4");

    expect(p.pageOffsetsMm).toHaveLength(1);
    expect(p.drawHeightMm).toBeCloseTo(CONTENT_H, 5);
    expect(p.drawWidthMm).toBeLessThan(CONTENT_W);
    // Centred horizontally inside the content box.
    expect(p.offsetXMm - PDF_MARGIN_MM.a4).toBeCloseTo(
      A4_MM.width - PDF_MARGIN_MM.a4 - (p.offsetXMm + p.drawWidthMm),
      5,
    );
  });

  it("slices a genuinely long invoice across pages, one content height apart", () => {
    // ~2.6 pages tall.
    const heightPx = Math.round(((CONTENT_H * 2.6) / CONTENT_W) * A4_CAPTURE_WIDTH_PX);
    const c = canvasFor(A4_CAPTURE_WIDTH_PX, heightPx);
    const p = computePdfPlacement(c.width, c.height, "a4");

    expect(p.pageOffsetsMm).toHaveLength(3);
    expect(p.drawWidthMm).toBe(CONTENT_W);
    expect(p.pageOffsetsMm[0]).toBe(PDF_MARGIN_MM.a4);
    for (let i = 1; i < p.pageOffsetsMm.length; i++) {
      expect(p.pageOffsetsMm[i - 1] - p.pageOffsetsMm[i]).toBeCloseTo(CONTENT_H, 5);
    }
    // The last page must reach the end of the artwork.
    const lastBottom = p.pageOffsetsMm.at(-1)! + p.drawHeightMm;
    expect(lastBottom).toBeGreaterThanOrEqual(A4_MM.height - PDF_MARGIN_MM.a4 - CONTENT_H);
  });

  it("survives an empty capture instead of emitting an infinite page", () => {
    const p = computePdfPlacement(0, 0, "a4");
    expect(p.pageWidthMm).toBe(210);
    expect(p.pageHeightMm).toBe(297);
    expect(Number.isFinite(p.drawHeightMm)).toBe(true);
  });
});

describe("computePdfPlacement — thermal", () => {
  it("uses an 80mm continuous roll, never A4", () => {
    const c = canvasFor(THERMAL_CAPTURE_WIDTH_PX, 1800);
    const p = computePdfPlacement(c.width, c.height, "thermal");
    expect(p.pageWidthMm).toBe(80);
    expect(p.marginMm).toBe(2);
    expect(p.pageOffsetsMm).toHaveLength(1);
    expect(p.drawWidthMm).toBe(80 - 2 * 2);
    // The roll grows to fit the receipt.
    expect(p.pageHeightMm).toBeGreaterThanOrEqual(p.drawHeightMm + p.marginMm * 2 - 1e-9);
  });
});
