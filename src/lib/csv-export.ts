/**
 * Central CSV export helper — always UTF-8 with BOM so Excel on Windows
 * renders Arabic correctly. Handles quoting per RFC 4180.
 */

const BOM = "\uFEFF";
const CSV_MIME = "text/csv;charset=utf-8";

/** Escape a single CSV cell — quotes fields containing commas, quotes, or newlines. */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = typeof value === "string" ? value : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Build a CSV string from headers + row objects/arrays. */
export function buildCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const head = headers.map(csvCell).join(",");
  const body = rows.map((r) => r.map(csvCell).join(",")).join("\n");
  return `${head}\n${body}`;
}

/** Build a Blob ready to be handed to `saveBlob()` — always includes UTF-8 BOM. */
export function csvBlob(content: string): Blob {
  return new Blob([BOM + content], { type: CSV_MIME });
}

/** Convenience: build + wrap in one call. */
export function buildCsvBlob(headers: string[], rows: (string | number | null | undefined)[][]): Blob {
  return csvBlob(buildCsv(headers, rows));
}

/** Trigger a browser download for any Blob or string. */
export function saveBlob(filename: string, content: Blob | string, mime = CSV_MIME): void {
  const blob = content instanceof Blob ? content : new Blob([BOM + content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** JSON export helper — same UX as CSV, UTF-8. */
export function jsonBlob(data: unknown): Blob {
  return new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
}
