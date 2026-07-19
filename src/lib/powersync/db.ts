import { PowerSyncDatabase, WASQLiteOpenFactory, WASQLiteVFS } from "@powersync/web";
import { AppSchema } from "./schema";

/**
 * Singleton PowerSync database instance for the browser.
 * Uses wa-sqlite (WebAssembly SQLite) with OPFS storage (persists across reloads).
 * Must never be imported by SSR code — always gate with <ClientOnly> or dynamic import.
 */

let _db: PowerSyncDatabase | null = null;

export function getPowerSync(): PowerSyncDatabase {
  if (typeof window === "undefined") {
    throw new Error("PowerSync is browser-only — do not import from SSR code.");
  }
  if (_db) return _db;

  _db = new PowerSyncDatabase({
    schema: AppSchema,
    database: new WASQLiteOpenFactory({
      dbFilename: "almohands.db",
      vfs: WASQLiteVFS.OPFSCoopSyncVFS,
    }),
  });

  return _db;
}
