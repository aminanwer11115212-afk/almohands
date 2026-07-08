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

async function loadHtml2pdf() {
  const mod = await import("html2pdf.js");
  return (mod as any).default ?? (mod as any);
}

function pdfOptions(filename: string, format: "a4" | "thermal") {
  return format === "thermal"
    ? {
        margin: 2,
        filename,
        image: { type: "jpeg", quality: 0.95 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" },
        jsPDF: { unit: "mm", format: [80, 297], orientation: "portrait" as const },
      }
    : {
        margin: 8,
        filename,
        image: { type: "jpeg", quality: 0.95 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" as const },
      };
}

/** Download an HTMLElement as a PDF using html2pdf.js. */
export async function downloadElementAsPdf(
  el: HTMLElement,
  filename: string,
  format: "a4" | "thermal" = "a4",
) {
  const html2pdf = await loadHtml2pdf();
  await html2pdf().set(pdfOptions(filename, format)).from(el).save();
}

/** Generate a PDF Blob from an HTMLElement (for sharing/attaching). */
export async function elementToPdfBlob(
  el: HTMLElement,
  filename: string,
  format: "a4" | "thermal" = "a4",
): Promise<Blob> {
  const html2pdf = await loadHtml2pdf();
  const blob: Blob = await html2pdf().set(pdfOptions(filename, format)).from(el).output("blob");
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
