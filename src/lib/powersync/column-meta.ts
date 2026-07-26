/**
 * Column type metadata shared by the sync connector (upload direction) and the
 * local data layer (read direction). Kept import-free of @powersync/web so it
 * is safe to load from SSR code.
 */

/** Postgres boolean columns — stored locally as 0/1 integers. */
export const BOOLEAN_COLUMNS: Record<string, readonly string[]> = {
  products: ["is_active"],
  payment_methods: ["is_active", "is_default"],
  notifications: ["read"],
  store_profile: ["show_logo", "show_qr", "show_tax", "auto_print"],
};

/** Postgres json/jsonb/array columns — stored locally as JSON text. */
export const JSON_COLUMNS: Record<string, readonly string[]> = {
  audit_logs: ["details"],
  import_logs: ["payload"],
  export_logs: ["payload", "tables"],
};
