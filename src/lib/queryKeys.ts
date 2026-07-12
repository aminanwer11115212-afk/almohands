/**
 * Centralized React Query keys — single source of truth so any mutation
 * can invalidate every affected list/detail with `qk.entity.all`.
 *
 * Rule: no string-literal query keys anywhere else in the codebase.
 * If a key is missing here, add it — do not inline it in a component.
 */
export const qk = {
  auth: {
    session: ["auth", "session"] as const,
    roles: (uid: string | null) => ["auth", "roles", uid] as const,
  },
  products: {
    all: ["products"] as const,
    list: (filters?: Record<string, unknown>) => ["products", "list", filters ?? {}] as const,
    byId: (id: string) => ["products", "detail", id] as const,
    lowStock: ["products", "lowStock"] as const,
  },
  customers: {
    all: ["customers"] as const,
    list: (filters?: Record<string, unknown>) => ["customers", "list", filters ?? {}] as const,
    byId: (id: string) => ["customers", "detail", id] as const,
    invoices: (id: string) => ["customers", id, "invoices"] as const,
  },
  suppliers: {
    all: ["suppliers"] as const,
    list: (filters?: Record<string, unknown>) => ["suppliers", "list", filters ?? {}] as const,
    byId: (id: string) => ["suppliers", "detail", id] as const,
  },
  invoices: {
    all: ["invoices"] as const,
    list: (filters?: Record<string, unknown>) => ["invoices", "list", filters ?? {}] as const,
    byId: (id: string) => ["invoices", "detail", id] as const,
    cancelled: ["invoices", "cancelled"] as const,
    items: (id: string) => ["invoices", id, "items"] as const,
  },
  purchases: {
    all: ["purchases"] as const,
    list: (filters?: Record<string, unknown>) => ["purchases", "list", filters ?? {}] as const,
    byId: (id: string) => ["purchases", "detail", id] as const,
  },
  payments: {
    all: ["payments"] as const,
    methods: ["payment-methods"] as const,
  },
  expenses: {
    all: ["expenses"] as const,
    list: (filters?: Record<string, unknown>) => ["expenses", "list", filters ?? {}] as const,
  },
  notifications: {
    all: ["notifications"] as const,
    unread: ["notifications", "unread"] as const,
  },
  auditLogs: {
    all: ["audit-logs"] as const,
    list: (filters?: Record<string, unknown>) => ["audit-logs", "list", filters ?? {}] as const,
  },
  importLogs: {
    all: ["import-logs"] as const,
  },
  exportLogs: {
    all: ["export-logs"] as const,
  },
  priceHistory: {
    all: ["price-history"] as const,
    forProduct: (id: string) => ["price-history", id] as const,
  },
  reports: {
    summary: (filters?: Record<string, unknown>) => ["reports", "summary", filters ?? {}] as const,
    cashier: (filters?: Record<string, unknown>) => ["reports", "cashier", filters ?? {}] as const,
  },
  store: {
    profile: ["store", "profile"] as const,
  },
} as const;

/** Standard staleTime buckets in ms — use with `staleTime: qkStale.short` etc. */
export const qkStale = {
  instant: 0,
  short: 10_000,
  medium: 60_000,
  long: 5 * 60_000,
} as const;
