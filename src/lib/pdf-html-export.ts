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
  const { title, headers, rows, orientation = "landscape", subtitle } = opts;
  const w = window.open("", "_blank", "width=1024,height=768");
  if (!w) return;
  const esc = (s: unknown) =>
    String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  const html = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<title>${esc(title)}</title>
<style>
  @page { size: A4 ${orientation}; margin: 12mm; }
  * { box-sizing: border-box; }
  html, body { font-family: "Cairo","Tajawal","Noto Naskh Arabic","Segoe UI","Tahoma",Arial,sans-serif; color:#0f172a; }
  body { margin: 0; padding: 8px; }
  h1 { font-size: 16px; margin: 0 0 4px; }
  .sub { font-size: 11px; color:#475569; margin-bottom: 10px; }
  table { width:100%; border-collapse: collapse; font-size: 11px; }
  th, td { border: 1px solid #cbd5e1; padding: 4px 6px; text-align: right; vertical-align: middle; }
  thead th { background:#f1f5f9; font-weight: 700; }
  tbody tr:nth-child(even) { background:#fafafa; }
  tfoot { display: table-row-group; }
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
      setTimeout(function(){ window.focus(); window.print(); }, 250);
    });
  </script>
</body></html>`;
  w.document.open();
  w.document.write(html);
  w.document.close();
}
