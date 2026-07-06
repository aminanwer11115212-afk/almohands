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

/** Build a plain-text invoice summary for WhatsApp / SMS. */
export function buildInvoiceText(
  inv: InvoiceForShare,
  items: ItemForShare[],
  storeName: string,
  opts: { includeItems?: boolean; footer?: string } = {},
): string {
  const { includeItems = true, footer } = opts;
  const date = inv.created_at ? new Date(inv.created_at).toLocaleDateString("ar-EG") : "";
  const lines: string[] = [];
  lines.push(`🧾 *${storeName}*`);
  lines.push(`فاتورة رقم: ${inv.invoice_number}`);
  if (date) lines.push(`التاريخ: ${date}`);
  if (inv.customer_name) lines.push(`العميل: ${inv.customer_name}`);
  lines.push("");

  if (includeItems && items.length > 0) {
    lines.push("*الأصناف:*");
    items.forEach((it, i) => {
      lines.push(
        `${i + 1}. ${it.product_name} — ${it.quantity} × ${formatSDG(Number(it.unit_price))} = ${formatSDG(Number(it.line_total))}`,
      );
    });
    lines.push("");
  }

  lines.push(`الإجمالي: ${formatSDG(Number(inv.total))}`);
  lines.push(`المدفوع: ${formatSDG(Number(inv.paid))}`);
  if (Number(inv.remaining) > 0) lines.push(`المتبقي: ${formatSDG(Number(inv.remaining))}`);

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

/** Download an HTMLElement as a PDF using html2pdf.js. */
export async function downloadElementAsPdf(
  el: HTMLElement,
  filename: string,
  format: "a4" | "thermal" = "a4",
) {
  const mod = await import("html2pdf.js");
  const html2pdf = (mod as any).default ?? (mod as any);
  const opt =
    format === "thermal"
      ? {
          margin: 2,
          filename,
          image: { type: "jpeg", quality: 0.95 },
          html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" },
          jsPDF: { unit: "mm", format: [80, 297], orientation: "portrait" },
        }
      : {
          margin: 8,
          filename,
          image: { type: "jpeg", quality: 0.95 },
          html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        };
  await html2pdf().set(opt).from(el).save();
}
