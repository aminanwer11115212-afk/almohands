/**
 * Central logger — persists recent errors/events to memory + localStorage
 * for support/debug. Each entry carries a correlation id (request/invoice/etc.)
 * so a user report can be matched to a specific action in the system.
 */

export type LogLevel = "info" | "warn" | "error";

export interface LogEntry {
  id: string;
  ts: string;
  level: LogLevel;
  event: string;
  message?: string;
  context?: Record<string, unknown>;
}

const STORE_KEY = "almohands:logs:v1";
const MAX_ENTRIES = 100;

function safeStorage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

let memoryBuffer: LogEntry[] = [];

function loadFromStorage(): LogEntry[] {
  const s = safeStorage();
  if (!s) return memoryBuffer;
  try {
    const raw = s.getItem(STORE_KEY);
    if (!raw) return memoryBuffer;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as LogEntry[];
    return memoryBuffer;
  } catch {
    return memoryBuffer;
  }
}

function persist(entries: LogEntry[]) {
  memoryBuffer = entries.slice(-MAX_ENTRIES);
  const s = safeStorage();
  if (!s) return;
  try {
    s.setItem(STORE_KEY, JSON.stringify(memoryBuffer));
  } catch {
    /* quota exceeded — ignore */
  }
}

/** Generate a short correlation id (e.g. req_a1b2c3d4). */
export function newRequestId(prefix = "req"): string {
  const rand = Math.random().toString(36).slice(2, 10);
  const time = Date.now().toString(36).slice(-4);
  return `${prefix}_${time}${rand}`;
}

/** Log an event. Errors are also written to console.error for the devtools trail. */
export function logEvent(
  level: LogLevel,
  event: string,
  ctx: { message?: string; context?: Record<string, unknown> } = {},
): LogEntry {
  const entry: LogEntry = {
    id: newRequestId("log"),
    ts: new Date().toISOString(),
    level,
    event,
    message: ctx.message,
    context: ctx.context,
  };
  const current = loadFromStorage();
  persist([...current, entry]);
  const line = `[${entry.level.toUpperCase()}] ${entry.event}${entry.message ? " — " + entry.message : ""}`;
  if (level === "error") console.error(line, entry.context ?? "");
  else if (level === "warn") console.warn(line, entry.context ?? "");
  else console.info(line, entry.context ?? "");
  return entry;
}

export const logger = {
  info: (event: string, ctx?: { message?: string; context?: Record<string, unknown> }) =>
    logEvent("info", event, ctx),
  warn: (event: string, ctx?: { message?: string; context?: Record<string, unknown> }) =>
    logEvent("warn", event, ctx),
  error: (event: string, ctx?: { message?: string; context?: Record<string, unknown> }) =>
    logEvent("error", event, ctx),
};

/** Fetch recent log entries (most recent first). */
export function getRecentLogs(limit = 50): LogEntry[] {
  const all = loadFromStorage();
  return all.slice(-limit).reverse();
}

/** Clear the stored log buffer. */
export function clearLogs(): void {
  memoryBuffer = [];
  const s = safeStorage();
  if (s) {
    try {
      s.removeItem(STORE_KEY);
    } catch {
      /* noop */
    }
  }
}
