import type { AbstractPowerSyncDatabase } from "@powersync/web";
import { BOOLEAN_COLUMNS, JSON_COLUMNS } from "@/lib/powersync/column-meta";

/**
 * Offline-first data access layer.
 *
 * The app runs in one of two data modes, decided at runtime per call:
 *  - LOCAL  : PowerSync is configured, the local SQLite mirror is ready and has
 *             synced at least once (or we are offline with a previous mirror).
 *             All reads/writes go to the local DB; PowerSync uploads in the
 *             background and streams remote changes back in.
 *  - REMOTE : PowerSync not configured (POWERSYNC_URL missing) or the mirror
 *             hasn't completed its first sync yet. Calls fall through to the
 *             existing direct-Supabase implementations.
 *
 * This module deliberately avoids static imports of @powersync/web so it stays
 * SSR-safe; the provider registers the live database instance at runtime.
 */

let _db: AbstractPowerSyncDatabase | null = null;
let _syncConfigured = false;

const HAS_SYNCED_KEY = "powersync.hasSyncedOnce";

export function registerLocalDb(db: AbstractPowerSyncDatabase | null): void {
  _db = db;
}

export function setSyncConfigured(enabled: boolean): void {
  _syncConfigured = enabled;
}

export function isSyncConfigured(): boolean {
  return _syncConfigured;
}

export function markHasSyncedOnce(): void {
  try {
    localStorage.setItem(HAS_SYNCED_KEY, "1");
  } catch {
    /* storage unavailable */
  }
}

export function clearHasSyncedOnce(): void {
  try {
    localStorage.removeItem(HAS_SYNCED_KEY);
  } catch {
    /* storage unavailable */
  }
}

function hasSyncedOnce(): boolean {
  try {
    return localStorage.getItem(HAS_SYNCED_KEY) === "1";
  } catch {
    return false;
  }
}

export function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

/**
 * True when reads/writes should use the local PowerSync mirror.
 * Falls back to remote before the first full sync completes so a brand-new
 * device doesn't show an empty store while data is still downloading.
 */
export function canUseLocalData(): boolean {
  if (!_db || !_syncConfigured) return false;
  if (_db.currentStatus?.hasSynced) return true;
  // This device has synced before (or is offline with an existing mirror) —
  // the mirror is the only usable source.
  return hasSyncedOnce() || isOffline();
}

export function getLocalDb(): AbstractPowerSyncDatabase {
  if (!_db) throw new Error("Local database is not ready");
  return _db;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

export function genId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  // RFC4122-ish fallback for very old WebViews
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function nowIso(): string {
  return new Date().toISOString();
}

const CACHED_USER_KEY = "app.userId";

export function cacheUserId(id: string | null): void {
  try {
    if (id) localStorage.setItem(CACHED_USER_KEY, id);
    else localStorage.removeItem(CACHED_USER_KEY);
  } catch {
    /* storage unavailable */
  }
}

export function getCachedUserId(): string | null {
  try {
    return localStorage.getItem(CACHED_USER_KEY);
  } catch {
    return null;
  }
}

/**
 * Current user id that works offline: prefers the live Supabase session,
 * falls back to the id cached at last sign-in.
 */
export async function requireUserId(): Promise<string> {
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data } = await supabase.auth.getSession();
    const id = data.session?.user?.id;
    if (id) {
      cacheUserId(id);
      return id;
    }
  } catch {
    /* offline or auth unavailable — fall through to cache */
  }
  const cached = getCachedUserId();
  if (cached) return cached;
  throw new Error("لا توجد جلسة مستخدم — سجّل الدخول أولاً");
}

/* ------------------------------------------------------------------ */
/* SQL convenience wrappers                                            */
/* ------------------------------------------------------------------ */

export async function localQuery<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  return getLocalDb().getAll<T>(sql, params);
}

export async function localQueryOne<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T | null> {
  return (await getLocalDb().getOptional<T>(sql, params)) ?? null;
}

export async function localExecute(sql: string, params: unknown[] = []): Promise<void> {
  await getLocalDb().execute(sql, params);
}

function normalizeValue(v: unknown): unknown {
  if (v === undefined) return null;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (v instanceof Date) return v.toISOString();
  if (v !== null && typeof v === "object") return JSON.stringify(v);
  return v;
}

/**
 * INSERT a row into the local mirror. Returns the row id (generated when
 * absent). Timestamps default to now when the table carries them and the
 * caller didn't set them.
 */
export async function localInsert(
  table: string,
  row: Record<string, unknown>,
  opts: { withUpdatedAt?: boolean } = {},
): Promise<string> {
  const id = (row.id as string | undefined) ?? genId();
  const data: Record<string, unknown> = { ...row, id };
  if (data.created_at == null) data.created_at = nowIso();
  if (opts.withUpdatedAt && data.updated_at == null) data.updated_at = nowIso();

  const cols = Object.keys(data);
  const placeholders = cols.map(() => "?").join(", ");
  const values = cols.map((c) => normalizeValue(data[c]));
  await localExecute(`INSERT INTO ${table} (${cols.join(", ")}) VALUES (${placeholders})`, values);
  return id;
}

/** UPDATE columns of one local row by id. */
export async function localUpdate(
  table: string,
  id: string,
  patch: Record<string, unknown>,
  opts: { touchUpdatedAt?: boolean } = {},
): Promise<void> {
  const data: Record<string, unknown> = { ...patch };
  delete data.id;
  if (opts.touchUpdatedAt && data.updated_at == null) data.updated_at = nowIso();
  const cols = Object.keys(data);
  if (cols.length === 0) return;
  const sets = cols.map((c) => `${c} = ?`).join(", ");
  const values = cols.map((c) => normalizeValue(data[c]));
  await localExecute(`UPDATE ${table} SET ${sets} WHERE id = ?`, [...values, id]);
}

/** DELETE one local row by id. */
export async function localDelete(table: string, id: string): Promise<void> {
  await localExecute(`DELETE FROM ${table} WHERE id = ?`, [id]);
}

/**
 * Run several writes atomically against the local mirror.
 * PowerSync uploads the whole batch as one transaction.
 */
export async function localTransaction<T>(
  fn: (tx: { execute: (sql: string, params?: unknown[]) => Promise<unknown> }) => Promise<T>,
): Promise<T> {
  return getLocalDb().writeTransaction(async (tx) => fn(tx));
}

/** normalizeValue exposed for callers building their own statements. */
export function toSqlValue(v: unknown): unknown {
  return normalizeValue(v);
}

/**
 * Convert a local SQLite row back to the Postgres row shape the rest of the
 * app expects: 0/1 → boolean and JSON text → parsed value, per table.
 * Pass rows through this before feeding them to mappers like `toProduct`.
 */
export function fromLocalRow<T = Record<string, unknown>>(
  table: string,
  row: Record<string, unknown>,
): T {
  const out: Record<string, unknown> = { ...row };
  for (const col of BOOLEAN_COLUMNS[table] ?? []) {
    if (col in out && out[col] != null)
      out[col] = out[col] === 1 || out[col] === "1" || out[col] === true;
  }
  for (const col of JSON_COLUMNS[table] ?? []) {
    const v = out[col];
    if (typeof v === "string" && v.length > 0) {
      try {
        out[col] = JSON.parse(v);
      } catch {
        /* keep raw text */
      }
    }
  }
  return out as T;
}
