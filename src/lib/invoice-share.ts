import { formatSDG } from "@/lib/format";
import {
  A4_CAPTURE_HEIGHT_PX,
  A4_PAGE_CONTENT_PX,
  FIT_TO_PAGE_LIMIT,
  PAGE_SAFETY_PX,
  captureWidthPx,
  computeCaptureScale,
  computePdfPlacement,
  paginateRows,
  type PdfFormat,
} from "@/lib/pdf-page-size";

export {
  A4_MM,
  A4_CAPTURE_WIDTH_PX,
  THERMAL_CAPTURE_WIDTH_PX,
  PDF_MARGIN_MM,
  computeCaptureScale,
  computePdfPlacement,
} from "@/lib/pdf-page-size";

/** Normalize a phone number to international format for wa.me (defaults SD +249). */
export function normalizePhoneForWhatsApp(raw: string | null | undefined, defaultCountry = "249"): string {
  if (!raw) return "";
  let s = String(raw).replace(/[^\d+]/g, "");
  if (!s) return "";
  if (s.startsWith("+")) return s.slice(1);
  if (s.startsWith("00")) return s.slice(2);
  if (s.startsWith("0")) return defaultCountry + s.slice(1);
  return s;
}

type InvoiceForShare = {
  invoice_number: number | string;
  customer_name?: string | null;
  total: number | string;
  paid: number | string;
  remaining: number | string;
  created_at?: string;
};

type ItemForShare = {
  product_name: string;
  quantity: number | string;
  unit_price: number | string;
  line_total: number | string;
};

/** Build a rich WhatsApp message with invoice #, date, totals and remaining. */
export function buildInvoiceText(
  inv: InvoiceForShare,
  items: ItemForShare[],
  storeName: string,
  opts: { includeItems?: boolean; footer?: string; storePhone?: string } = {},
): string {
  const { includeItems = true, footer, storePhone } = opts;
  const date = inv.created_at ? new Date(inv.created_at).toLocaleDateString("ar-EG") : "";
  const remaining = Number(inv.remaining) || 0;
  const greeting = inv.customer_name ? `مرحباً *${inv.customer_name}*،` : "مرحباً،";

  const lines: string[] = [];
  lines.push(`🧾 *${storeName}*`);
  lines.push(greeting);
  lines.push(`نرفق لكم تفاصيل الفاتورة:`);
  lines.push("");
  lines.push(`• رقم الفاتورة: *#${inv.invoice_number}*`);
  if (date) lines.push(`• التاريخ: ${date}`);
  lines.push(`• الإجمالي: *${formatSDG(Number(inv.total))}*`);
  lines.push(`• المدفوع: ${formatSDG(Number(inv.paid))}`);
  if (remaining > 0) {
    lines.push(`• المتبقي: *${formatSDG(remaining)}* ⚠️`);
  } else {
    lines.push(`• الحالة: *مسددة بالكامل* ✅`);
  }

  if (includeItems && items.length > 0) {
    lines.push("");
    lines.push("*تفاصيل الأصناف:*");
    items.forEach((it, i) => {
      lines.push(
        `${i + 1}. ${it.product_name} — ${it.quantity} × ${formatSDG(Number(it.unit_price))} = ${formatSDG(Number(it.line_total))}`,
      );
    });
  }

  lines.push("");
  lines.push("📎 ملف PDF للفاتورة مرفق.");
  if (remaining > 0) lines.push("يرجى تسديد المبلغ المتبقي في أقرب فرصة. شكراً لتعاملكم معنا 🌸");
  else lines.push("شكراً لتعاملكم معنا 🌸");

  if (storePhone) {
    lines.push("");
    lines.push(`للاستفسار: ${storePhone}`);
  }
  if (footer) {
    lines.push("");
    lines.push(footer);
  }
  return lines.join("\n");
}

/** Open WhatsApp share (with phone if available, else picker). */
export function openWhatsAppShare(phone: string | null | undefined, text: string) {
  const normalized = normalizePhoneForWhatsApp(phone);
  const encoded = encodeURIComponent(text);
  const url = normalized
    ? `https://wa.me/${normalized}?text=${encoded}`
    : `https://wa.me/?text=${encoded}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

/**
 * Force natural letter spacing on `root` and every descendant.
 *
 * html2canvas falls back to drawing text one code point at a time as soon as
 * an element has a non-zero `letter-spacing`. Arabic is cursive, so that
 * renders every letter in its isolated form — "فاتورة مبدئية" comes out as
 * disconnected glyphs. Inline `normal` beats any stylesheet rule (headings
 * carry -0.01em app-wide) and costs nothing visually at these sizes.
 */
export function normalizeLetterSpacing(root: HTMLElement) {
  root.style.letterSpacing = "normal";
  root.querySelectorAll<HTMLElement>("*").forEach((node) => {
    if (node.style) node.style.letterSpacing = "normal";
  });
}

/**
 * Build one standalone A4 page element per page of a long invoice.
 *
 * Slicing a single tall bitmap cut rows in half and left later pages without
 * a header or column titles. Instead each page gets its own copy of the sheet:
 * the invoice header and table head are repeated, the page carries only the
 * rows that fit, and the totals + signatures ride on the last page.
 *
 * Returns `null` when the invoice belongs on a single page — the caller then
 * captures the sheet as it stands.
 */
export function splitSheetIntoPages(
  sheet: HTMLElement,
  opts: {
    pageHeightPx?: number;
    /** Injectable for tests; defaults to real layout measurement. */
    measure?: (el: Element) => number;
  } = {},
): HTMLElement[] | null {
  const {
    pageHeightPx = A4_PAGE_CONTENT_PX,
    measure = (el: Element) => el.getBoundingClientRect().height,
  } = opts;

  const table = sheet.querySelector("table");
  const tbody = table?.querySelector("tbody");
  const rows = tbody ? Array.from(tbody.rows) : [];
  if (!table || !tbody || rows.length === 0) return null;

  const sheetHeight = measure(sheet);
  // Anything that still fits (or only just overflows) stays a single page and
  // keeps the existing shrink-to-fit behaviour.
  if (sheetHeight <= pageHeightPx * FIT_TO_PAGE_LIMIT) return null;

  const rowHeights = rows.map(measure);
  const tfoot = table.querySelector("tfoot");
  const summary = sheet.querySelector(".a4-summary");
  const tailHeight = (tfoot ? measure(tfoot) : 0) + (summary ? measure(summary) : 0);
  // Whatever is left is the per-page chrome: sheet padding, invoice header,
  // meta strip and the table head — all of which repeat on every page.
  const rowsHeight = rowHeights.reduce((sum, h) => sum + h, 0);
  const chromeHeight = Math.max(0, sheetHeight - rowsHeight - tailHeight);

  const pages = paginateRows({
    rowHeights,
    chromeHeight,
    tailHeight,
    pageHeight: pageHeightPx - PAGE_SAFETY_PX,
  });
  if (pages.length <= 1) return null;

  return pages.map((rowIndices, i) =>
    buildInvoicePage(sheet, rowIndices, {
      isLast: i === pages.length - 1,
      pageNumber: i + 1,
      pageCount: pages.length,
    }),
  );
}

/** Copy of `sheet` holding only `rowIndices`, plus a "صفحة x من y" footer. */
function buildInvoicePage(
  sheet: HTMLElement,
  rowIndices: number[],
  meta: { isLast: boolean; pageNumber: number; pageCount: number },
): HTMLElement {
  const page = sheet.cloneNode(true) as HTMLElement;
  const tbody = page.querySelector("tbody");
  if (tbody) {
    const keep = new Set(rowIndices);
    Array.from(tbody.rows).forEach((row, i) => {
      if (!keep.has(i)) row.remove();
    });
  }
  if (!meta.isLast) {
    page.querySelector("tfoot")?.remove();
    page.querySelector(".a4-summary")?.remove();
  }

  const label = page.ownerDocument.createElement("div");
  label.className = "a4-page-label";
  label.textContent = `صفحة ${meta.pageNumber} من ${meta.pageCount}`;
  label.style.cssText = "margin-top:8px;text-align:center;font-size:11px;color:#404040;";
  page.appendChild(label);
  return page;
}

/** Wait for webfonts + <img> assets inside `root` so text metrics are final. */
async function waitForAssets(root: HTMLElement, timeoutMs = 3000) {
  const deadline = new Promise<void>((resolve) => setTimeout(resolve, timeoutMs));
  const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
  const images = Array.from(root.querySelectorAll("img")).map(
    (img) =>
      new Promise<void>((resolve) => {
        if (img.complete) return resolve();
        img.addEventListener("load", () => resolve(), { once: true });
        img.addEventListener("error", () => resolve(), { once: true });
      }),
  );
  const ready = Promise.all([
    fonts ? fonts.ready.catch(() => undefined) : Promise.resolve(),
    ...images,
  ]).then(() => undefined);
  await Promise.race([ready, deadline]);
}

/**
 * Copy `el` into an off-screen host that is exactly one page wide, run `fn`
 * against the copy, then clean up.
 *
 * Rasterising the live node is what broke the export on phones: the sheet was
 * measured inside a ~360 px viewport, so cell text overflowed its column and
 * the too-narrow snapshot was then blown up to 198 mm — giant, overlapping
 * Arabic text across two pages. Staging at a fixed A4 width makes the output
 * identical on every device.
 */
async function withStagedSheet<T>(
  el: HTMLElement,
  format: PdfFormat,
  fn: (staged: HTMLElement, widthPx: number) => Promise<T>,
): Promise<T> {
  const widthPx = captureWidthPx(format);
  const host = document.createElement("div");
  host.setAttribute("data-pdf-stage", "");
  host.setAttribute("dir", "rtl");
  host.style.cssText = [
    // Fixed (not absolute) so the off-screen copy never adds scrollable
    // overflow to the RTL page while it is being rasterised.
    "position:fixed",
    "top:0",
    "left:-10000px",
    `width:${widthPx}px`,
    "background:#ffffff",
    "z-index:-1",
    "pointer-events:none",
    // Mobile Safari/Chrome inflate font sizes ("text autosizing") for blocks
    // wider than the viewport — that is what blew the invoice text past its
    // table cells in the exported PDF. Pin it to 100%.
    "-webkit-text-size-adjust:100%",
    "text-size-adjust:100%",
  ].join(";");

  const clone = el.cloneNode(true) as HTMLElement;
  // Duplicate ids would collide with the live invoice (and with the print CSS).
  clone.removeAttribute("id");
  clone.querySelectorAll("[id]").forEach((n) => n.removeAttribute("id"));
  clone.style.width = `${widthPx}px`;
  clone.style.maxWidth = "none";
  clone.style.margin = "0";
  clone.style.transform = "none";
  // Keep Arabic letters joined when html2canvas rasterises the sheet.
  normalizeLetterSpacing(clone);
  // Screen-only chrome (drop shadow / preview border) must not end up in the PDF.
  clone.querySelectorAll<HTMLElement>(".print-a4, .print-thermal").forEach((sheet) => {
    sheet.style.boxShadow = "none";
    sheet.style.border = "0";
    sheet.style.maxWidth = "none";
    sheet.style.width = "100%";
  });

  host.appendChild(clone);
  document.body.appendChild(host);
  try {
    await waitForAssets(host);
    return await fn(clone, widthPx);
  } finally {
    host.remove();
  }
}

/**
 * Render an element to a PDF using html2canvas-pro (which natively supports
 * modern CSS color functions such as oklch() — the previous html2pdf.js path
 * threw "Attempting to parse an unsupported color function \"oklch\"" on
 * Tailwind v4 themes). Multi-page A4 output; thermal single-page 80mm.
 */
async function renderElementToPdf(
  el: HTMLElement,
  filename: string,
  format: PdfFormat,
): Promise<{ blob: Blob; save: () => void }> {
  const [{ default: html2canvas }, jspdfMod] = await Promise.all([
    import("html2canvas-pro"),
    import("jspdf"),
  ]);
  const { jsPDF } = jspdfMod as typeof import("jspdf");

  const shots = await withStagedSheet(el, format, async (staged, widthPx) => {
    const capture = async (node: HTMLElement) => {
      const heightPx = Math.max(node.scrollHeight, node.getBoundingClientRect().height, 1);
      const canvas = await html2canvas(node, {
        // ~300 DPI instead of the 2× (192 DPI) that made Arabic text look soft,
        // automatically reduced for long invoices so the canvas stays allocatable.
        scale: computeCaptureScale(widthPx, heightPx),
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
        // Lay the clone out in an A4-wide viewport so percentage widths, flex
        // and any width-based media query resolve exactly as they do on paper.
        windowWidth: widthPx,
        windowHeight: Math.max(Math.ceil(heightPx), A4_CAPTURE_HEIGHT_PX),
      });
      // High-quality JPEG: at ~300 DPI its artefacts are far below one glyph
      // stroke, and jsPDF embeds the stream as-is (no JS decode), so big
      // captures stay fast and the shared file stays small on mobile data.
      const shot = {
        data: canvas.toDataURL("image/jpeg", 0.95),
        width: canvas.width,
        height: canvas.height,
      };
      // Release the bitmap (~35 MB per A4 page) before rendering the next one.
      canvas.width = 0;
      canvas.height = 0;
      return shot;
    };

    const sheet = format === "a4" ? staged.querySelector<HTMLElement>(".print-a4") : null;
    const pages = sheet ? splitSheetIntoPages(sheet) : null;
    if (!pages) return [await capture(staged)];

    const captured: Array<{ data: string; width: number; height: number }> = [];
    for (const page of pages) {
      // Plain DOM calls (not replaceChildren) so old Android WebViews cope.
      while (staged.firstChild) staged.removeChild(staged.firstChild);
      staged.appendChild(page);
      // The logo is a fresh <img> on every page copy — let it decode first.
      await waitForAssets(staged);
      captured.push(await capture(staged));
    }
    return captured;
  });

  const places = shots.map((shot) => computePdfPlacement(shot.width, shot.height, format));

  const pdf = new jsPDF({
    unit: "mm",
    // A4 invoices use jsPDF's built-in ISO A4 (210 × 297 mm) so the file
    // reports the standard page size to every viewer and printer.
    format: format === "thermal" ? [places[0].pageWidthMm, places[0].pageHeightMm] : "a4",
    orientation: "portrait",
  });

  let started = false;
  shots.forEach((shot, i) => {
    const place = places[i];
    place.pageOffsetsMm.forEach((offsetY) => {
      if (started) pdf.addPage();
      started = true;
      pdf.addImage(shot.data, "JPEG", place.offsetXMm, offsetY, place.drawWidthMm, place.drawHeightMm);
    });
  });

  const blob = pdf.output("blob");
  return { blob, save: () => pdf.save(filename) };
}

/** Download an HTMLElement as a PDF. */
export async function downloadElementAsPdf(
  el: HTMLElement,
  filename: string,
  format: "a4" | "thermal" = "a4",
) {
  const { save } = await renderElementToPdf(el, filename, format);
  save();
}

/** Generate a PDF Blob from an HTMLElement (for sharing/attaching). */
export async function elementToPdfBlob(
  el: HTMLElement,
  filename: string,
  format: "a4" | "thermal" = "a4",
): Promise<Blob> {
  const { blob } = await renderElementToPdf(el, filename, format);
  return blob;
}


/**
 * Share invoice as PDF via WhatsApp.
 * - On mobile with Web Share Level 2 support: opens native share sheet (WhatsApp appears)
 *   with the PDF file attached AND the message text.
 * - Fallback: downloads the PDF locally then opens wa.me with the message text
 *   so the user can attach the just-downloaded file manually.
 * Returns "shared" | "fallback".
 */
export async function shareInvoicePdfViaWhatsApp(
  el: HTMLElement,
  filename: string,
  format: "a4" | "thermal",
  text: string,
  phone: string | null | undefined,
): Promise<"shared" | "fallback"> {
  const blob = await elementToPdfBlob(el, filename, format);
  const file = new File([blob], filename, { type: "application/pdf" });

  const nav = typeof navigator !== "undefined" ? (navigator as Navigator & { canShare?: (d: ShareData) => boolean }) : null;
  const canShareFiles = !!(nav?.canShare && nav.canShare({ files: [file] }) && nav.share);

  if (canShareFiles) {
    try {
      await nav!.share({ files: [file], text, title: filename });
      return "shared";
    } catch (e: unknown) {
      // User cancelled — treat as done, don't fall through to wa.me
      if ((e as { name?: string })?.name === "AbortError") return "shared";
      // Any other failure: continue to fallback
    }
  }

  // Fallback: download PDF, open WhatsApp with text
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  openWhatsAppShare(phone, text);
  return "fallback";
}

/**
 * Share a PDF file using the OS native share sheet (iOS/Android show WhatsApp,
 * Mail, Files, AirDrop, Telegram, etc.). Requires Web Share Level 2.
 *
 * Fallbacks:
 * - If the browser can't share files (most desktops, older Android), downloads
 *   the PDF locally so the user still gets the file.
 * - Returns "shared" | "downloaded" | "cancelled".
 */
export async function sharePdfFileNative(
  el: HTMLElement,
  filename: string,
  format: "a4" | "thermal" = "a4",
  opts: { title?: string; text?: string } = {},
): Promise<"shared" | "downloaded" | "cancelled"> {
  const blob = await elementToPdfBlob(el, filename, format);
  const file = new File([blob], filename, { type: "application/pdf" });

  const nav = typeof navigator !== "undefined"
    ? (navigator as Navigator & { canShare?: (d: ShareData) => boolean })
    : null;
  const canShareFiles = !!(nav?.canShare && nav.canShare({ files: [file] }) && nav.share);

  if (canShareFiles) {
    try {
      await nav!.share({
        files: [file],
        title: opts.title || filename,
        text: opts.text || filename,
      });
      return "shared";
    } catch (e: unknown) {
      if ((e as { name?: string })?.name === "AbortError") return "cancelled";
      // fall through to download
    }
  }

  // Fallback: download the PDF
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return "downloaded";
}
