/**
 * Persistent backup-folder handle (File System Access API).
 * Lets the user pick a directory once; the handle is stored in IndexedDB
 * and reused for every future auto-backup, so files are written silently
 * without any "Save As" prompt. Falls back to a normal download when the
 * API is unavailable (Safari / iOS) or the permission is revoked.
 */

const DB_NAME = "almohands-backup";
const STORE = "handles";
const KEY = "backup-dir";

type DirHandle = FileSystemDirectoryHandle;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  if (typeof indexedDB === "undefined") return undefined;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key: string, value: unknown): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbDel(key: string): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function isFolderApiSupported(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

export async function pickBackupFolder(): Promise<DirHandle | null> {
  if (!isFolderApiSupported()) return null;
  const handle = await (window as any).showDirectoryPicker({
    id: "almohands-backup",
    mode: "readwrite",
    startIn: "documents",
  });
  await idbSet(KEY, handle);
  return handle as DirHandle;
}

export async function getStoredBackupFolder(): Promise<DirHandle | null> {
  try {
    const h = await idbGet<DirHandle>(KEY);
    return h ?? null;
  } catch {
    return null;
  }
}

/** Verify (and if needed re-request) read/write permission on the stored handle. */
export async function ensureFolderPermission(
  handle: DirHandle,
  requestIfPrompt = true,
): Promise<boolean> {
  const anyH = handle as any;
  try {
    const opts = { mode: "readwrite" as const };
    const state: PermissionState = await anyH.queryPermission?.(opts);
    if (state === "granted") return true;
    if (state === "prompt" && requestIfPrompt) {
      const req: PermissionState = await anyH.requestPermission?.(opts);
      return req === "granted";
    }
    return false;
  } catch {
    return false;
  }
}

export async function forgetBackupFolder(): Promise<void> {
  await idbDel(KEY);
}

/** Write a Blob into the stored folder. Throws if no folder / no permission. */
export async function writeBlobToFolder(
  handle: DirHandle,
  filename: string,
  blob: Blob,
): Promise<void> {
  const fileHandle = await handle.getFileHandle(filename, { create: true });
  const writable = await (fileHandle as any).createWritable();
  await writable.write(blob);
  await writable.close();
}

export async function getFolderName(): Promise<string | null> {
  const h = await getStoredBackupFolder();
  return h ? h.name : null;
}
