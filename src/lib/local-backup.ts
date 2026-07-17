/**
 * Local automatic backup.
 * Fetches all business tables via the browser supabase client (RLS applies),
 * packages them as JSON + XLSX and writes them either silently into the
 * user-selected backup folder (File System Access API) or, as a fallback,
 * triggers a normal browser download. Tracks completion in localStorage so
 * we only back up once per session boundary (open / close) per day, and
 * keeps a 30-day rolling history.
 */
import { supabase } from "@/integrations/supabase/client";
import {
  getStoredBackupFolder,
  ensureFolderPermission,
  writeBlobToFolder,
} from "@/lib/backup-folder";


// Lazy-loaded XLSX to keep the initial bundle light.
type XlsxMod = typeof import("xlsx");
let _xlsx: Promise<XlsxMod> | null = null;
const loadXlsx = () => (_xlsx ??= import("xlsx"));

export type BackupKind = "open" | "close" | "manual";

export type BackupEntry = {
  kind: BackupKind;
  ts: string;      // ISO
  day: string;     // YYYY-MM-DD
  filename: string;
  bytes: number;
  ok: boolean;
  error?: string;
};

const HISTORY_KEY = "almohands.backupHistory.v1";
const KEEP_DAYS = 30;

const TABLES = [
  "products",
  "customers",
  "suppliers",
  "invoices",
  "invoice_items",
  "payments",
  "payment_methods",
  "expenses",
  "purchases",
  "purchase_items",
  "returns",
  "price_history",
  "store_profile",
  "notifications",
] as const;

function todayStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export function readBackupHistory(): BackupEntry[] {
  try {
    if (typeof localStorage === "undefined") return [];
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as BackupEntry[]) : [];
  } catch { return []; }
}

function writeHistory(list: BackupEntry[]) {
  try {
    if (typeof localStorage === "undefined") return;
    const cutoff = Date.now() - KEEP_DAYS * 24 * 3600 * 1000;
    const pruned = list.filter((e) => new Date(e.ts).getTime() >= cutoff);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(pruned.slice(-200)));
  } catch { /* ignore quota */ }
}

export function hasBackupForToday(kind: Exclude<BackupKind, "manual">): boolean {
  const day = todayStr();
  return readBackupHistory().some((e) => e.ok && e.kind === kind && e.day === day);
}

async function fetchAllPages(table: string): Promise<unknown[]> {
  const PAGE = 1000;
  const rows: unknown[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await (supabase as any)
      .from(table)
      .select("*")
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return rows;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
}

export async function runLocalBackup(kind: BackupKind): Promise<BackupEntry> {
  const now = new Date();
  const day = todayStr(now);
  const stamp = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const base = `almohands-backup-${day}-${kind}-${stamp}`;

  try {
    // 1) Ensure the user is authenticated (RLS would empty results otherwise).
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      throw new Error("لا توجد جلسة نشطة — تخطي النسخ الاحتياطي.");
    }

    // 2) Pull every table (RLS applies — cashier gets what they can read).
    const data: Record<string, unknown[]> = {};
    for (const t of TABLES) {
      try { data[t] = await fetchAllPages(t); }
      catch (e) { data[t] = []; console.warn(`[backup] table ${t} skipped`, e); }
    }

    // 3) JSON file.
    const jsonPayload = {
      app: "almohands",
      version: 3,
      kind,
      exportedAt: now.toISOString(),
      counts: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v.length])),
      data,
    };
    const jsonBlob = new Blob([JSON.stringify(jsonPayload, null, 2)], {
      type: "application/json",
    });
    const jsonName = `${base}.json`;
    triggerDownload(jsonBlob, jsonName);

    // 4) XLSX file (one sheet per table).
    const XLSX = await loadXlsx();
    const wb = XLSX.utils.book_new();
    for (const [name, rows] of Object.entries(data)) {
      const ws = XLSX.utils.json_to_sheet((rows as any[]).length ? (rows as any[]) : [{}]);
      // Sheet names are limited to 31 chars.
      XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
    }
    const xlsxAb = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
    const xlsxBlob = new Blob([xlsxAb], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const xlsxName = `${base}.xlsx`;
    triggerDownload(xlsxBlob, xlsxName);

    const entry: BackupEntry = {
      kind, ts: now.toISOString(), day,
      filename: `${jsonName} + ${xlsxName}`,
      bytes: jsonBlob.size + xlsxBlob.size,
      ok: true,
    };
    writeHistory([...readBackupHistory(), entry]);
    return entry;
  } catch (err) {
    const entry: BackupEntry = {
      kind, ts: now.toISOString(), day,
      filename: base, bytes: 0, ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
    writeHistory([...readBackupHistory(), entry]);
    throw err;
  }
}
