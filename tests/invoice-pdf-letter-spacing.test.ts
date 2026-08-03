// @vitest-environment jsdom
/**
 * Arabic shaping guard for the exported invoice PDF.
 *
 * html2canvas draws text one code point at a time whenever an element has a
 * non-zero `letter-spacing`, which renders cursive Arabic in isolated glyph
 * forms — the reason "فاتورة مبدئية" came out broken in the shared PDF. The
 * app stylesheet puts -0.01em on every heading, so the invoice title is hit
 * unless the capture path neutralises it.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { normalizeLetterSpacing } from "../src/lib/invoice-share";

/** The invoice header, as rendered by <A4Invoice />. */
function buildSheet(): HTMLElement {
  const sheet = document.createElement("div");
  sheet.className = "print-a4";
  sheet.innerHTML = `
    <div class="a4-head">
      <h1 style="letter-spacing: -0.01em">فاتورة مبدئية</h1>
      <p class="sub" style="letter-spacing: 0.5px">المهندس لقطع غيار السيارات</p>
    </div>
    <table>
      <thead><tr><th style="letter-spacing: 1px">الصنف</th></tr></thead>
      <tbody><tr><td>شمر STD</td></tr></tbody>
    </table>`;
  document.body.appendChild(sheet);
  return sheet;
}

const spacings = (root: HTMLElement) =>
  [root, ...Array.from(root.querySelectorAll<HTMLElement>("*"))].map(
    (n) => n.style.letterSpacing,
  );

describe("normalizeLetterSpacing", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("clears tracking on the sheet and every descendant", () => {
    const sheet = buildSheet();
    expect(spacings(sheet).some((s) => s && s !== "normal")).toBe(true);

    normalizeLetterSpacing(sheet);

    for (const s of spacings(sheet)) expect(s).toBe("normal");
  });

  it("pins the invoice title specifically — the glyph-breaking case", () => {
    const sheet = buildSheet();
    normalizeLetterSpacing(sheet);

    const title = sheet.querySelector("h1")!;
    expect(title.style.letterSpacing).toBe("normal");
    expect(title.textContent).toBe("فاتورة مبدئية");
  });

  it("leaves the rest of the document alone", () => {
    const outside = document.createElement("h1");
    outside.style.letterSpacing = "-0.01em";
    document.body.appendChild(outside);
    const sheet = buildSheet();

    normalizeLetterSpacing(sheet);

    expect(outside.style.letterSpacing).toBe("-0.01em");
  });

  it("is safe to run twice", () => {
    const sheet = buildSheet();
    normalizeLetterSpacing(sheet);
    normalizeLetterSpacing(sheet);
    for (const s of spacings(sheet)) expect(s).toBe("normal");
  });
});
