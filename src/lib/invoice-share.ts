import { formatSDG } from "@/lib/format";

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
 * Render an element to a PDF using html2canvas-pro (which natively supports
 * modern CSS color functions such as oklch() — the previous html2pdf.js path
 * threw "Attempting to parse an unsupported color function \"oklch\"" on
 * Tailwind v4 themes). Multi-page A4 output; thermal single-page 80mm.
 */
async function renderElementToPdf(
  el: HTMLElement,
  filename: string,
  format: "a4" | "thermal",
): Promise<{ blob: Blob; save: () => void }> {
  const [{ default: html2canvas }, jspdfMod] = await Promise.all([
    import("html2canvas-pro"),
    import("jspdf"),
  ]);
  const { jsPDF } = jspdfMod as typeof import("jspdf");

  const canvas = await html2canvas(el, {
    scale: 2,
    useCORS: true,
    backgroundColor: "#ffffff",
    logging: false,
  });

  const imgData = canvas.toDataURL("image/jpeg", 0.95);
  const isThermal = format === "thermal";
  // A4 invoices print in landscape (297mm × 210mm) on both mobile and desktop
  // so wide item tables aren't squashed and match what the browser prints.
  const pageWidth = isThermal ? 80 : 297;
  const pageHeight = isThermal ? Math.max(297, 0) : 210;
  const marginX = isThermal ? 2 : 8;
  const marginY = isThermal ? 2 : 8;
  const contentWidth = pageWidth - marginX * 2;
  const imgHeight = (canvas.height * contentWidth) / canvas.width;

  const pdf = new jsPDF({
    unit: "mm",
    format: isThermal ? [pageWidth, Math.max(297, imgHeight + marginY * 2)] : "a4",
    orientation: isThermal ? "portrait" : "landscape",
  });

  if (isThermal) {
    pdf.addImage(imgData, "JPEG", marginX, marginY, contentWidth, imgHeight);
  } else {
    // Multi-page slicing for long A4-landscape documents.
    const contentHeight = pageHeight - marginY * 2;
    let heightLeft = imgHeight;
    let position = marginY;
    pdf.addImage(imgData, "JPEG", marginX, position, contentWidth, imgHeight);
    heightLeft -= contentHeight;
    while (heightLeft > 0) {
      pdf.addPage();
      position = marginY - (imgHeight - heightLeft);
      pdf.addImage(imgData, "JPEG", marginX, position, contentWidth, imgHeight);
      heightLeft -= contentHeight;
    }
  }


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
