// Print-to-PDF via a hidden window with proper Arabic (RTL) rendering.
// jsPDF's default fonts don't cover Arabic glyphs; using the browser's
// print stack with system Arabic fonts guarantees correct output in all
// languages.
export function exportPdfFromRows(opts: {
  title: string;
  headers: string[];
  rows: (string | number)[][];
  orientation?: "portrait" | "landscape";
  subtitle?: string;
}) {
  const { title, headers, rows, subtitle } = opts;
  // Default to A4 landscape with 6mm margins to match the invoice print CSS
  // (so exports look identical to what the browser prints on paper).
  const orientation = opts.orientation ?? "landscape";
  const w = window.open("", "_blank", "noopener,noreferrer,width=1024,height=768");
  if (!w) {
    console.warn("[exportPdfFromRows] popup blocked");
    return;
  }
  const esc = (s: unknown) =>
    String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  const html = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<title>${esc(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&family=Tajawal:wght@400;700&display=swap" rel="stylesheet">
<style>
  @page { size: ${orientation === "landscape" ? "297mm 210mm" : "210mm 297mm"}; margin: 6mm; }
  * { box-sizing: border-box; }
  html, body { font-family: "Cairo","Tajawal","Noto Naskh Arabic","Segoe UI","Tahoma",Arial,sans-serif; color:#0f172a; }
  body { margin: 0; padding: 4px; font-size: 10.5pt; line-height: 1.35; }
  h1 { font-size: 15pt; margin: 0 0 3px; }
  .sub { font-size: 10pt; color:#475569; margin-bottom: 6px; }
  table { width:100%; border-collapse: collapse; font-size: 9.5pt; }
  th, td { border: 1px solid #cbd5e1; padding: 3px 5px; text-align: right; vertical-align: middle; word-break: break-word; }
  thead { display: table-header-group; }
  thead th { background:#f1f5f9; font-weight: 700; }
  tbody tr, .keep-together { page-break-inside: avoid; break-inside: avoid; }
  tbody tr:nth-child(even) { background:#fafafa; }
  tfoot { display: table-footer-group; }
  @media print { .noprint { display:none } }
</style>
</head>
<body>
  <h1>${esc(title)}</h1>
  ${subtitle ? `<div class="sub">${esc(subtitle)}</div>` : ""}
  <table>
    <thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>
    <tbody>
      ${rows
        .map(
          (r) =>
            `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`,
        )
        .join("")}
    </tbody>
  </table>
  <script>
    window.addEventListener('load', function(){
      // Give Google Fonts a moment to load so print uses Cairo, not fallback.
      setTimeout(function(){ window.focus(); window.print(); }, 600);
    });
  </script>
</body></html>`;
  w.document.open();
  w.document.write(html);
  w.document.close();
}
