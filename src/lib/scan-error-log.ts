/* Silent barcode scanner error log.
 * Stores the last 50 scanner errors in localStorage under a ring buffer,
 * so the admin can inspect them later without ever bothering the cashier.
 * Also mirrors to console.warn (grouped) for live debugging. */

const KEY = "almohands.scanErrors.v1";
const MAX = 50;

export type ScanErrorEntry = {
  ts: string;                // ISO timestamp
  name: string;              // e.g. NotAllowedError
  message: string;           // raw error message
  friendly: string;          // translated Arabic message
  userAgent: string;
  context?: Record<string, unknown>;
};

function safeRead(): ScanErrorEntry[] {
  try {
    if (typeof localStorage === "undefined") return [];
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as ScanErrorEntry[]) : [];
  } catch { return []; }
}

function safeWrite(list: ScanErrorEntry[]) {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX)));
  } catch { /* quota / private mode — ignore */ }
}

export function logScanError(
  err: unknown,
  friendly: string,
  context?: Record<string, unknown>,
): void {
  const e = err as { name?: string; message?: string } | undefined;
  const entry: ScanErrorEntry = {
    ts: new Date().toISOString(),
    name: e?.name || "UnknownError",
    message: e?.message || String(err ?? ""),
    friendly,
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
    context,
  };
  const list = safeRead();
  list.push(entry);
  safeWrite(list);
  // Mirror to console for developers watching devtools — never toast.
  try {
    // eslint-disable-next-line no-console
    console.warn("[barcode-scanner]", entry.name, entry.friendly, entry);
  } catch { /* ignore */ }
}

export function readScanErrors(): ScanErrorEntry[] {
  return safeRead().slice().reverse();
}

export function clearScanErrors(): void {
  safeWrite([]);
}
