import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ReactNode } from "react";

/* =========================================================================
 * Role-based permissions (client-side UI gating).
 * Server-side enforcement still lives in RLS + admin server fns.
 * =======================================================================*/

export type Permission =
  | "products.view"
  | "products.write"    // create / edit / delete / bulk price update
  | "cashier.use"
  | "invoices.view"
  | "invoices.write"    // edit or delete existing invoices
  | "customers.view"
  | "customers.write"
  | "suppliers.view"
  | "suppliers.write"
  | "expenses.view"
  | "expenses.write"
  | "payment_methods.view"
  | "payment_methods.write"
  | "returns.view"
  | "returns.write"
  | "reports.view"
  | "accounts.view"
  | "settings.write"
  | "permissions.manage"
  | "import_export";

// admin implicitly gets everything.
const ROLE_PERMS: Record<Exclude<AppRole, "admin">, Permission[]> = {
  seller: [
    "cashier.use",
    "products.view",
    "invoices.view",
    "customers.view", "customers.write",
    "payment_methods.view",
    "returns.view",
  ],
  accountant: [
    "products.view",
    "invoices.view",
    "customers.view",
    "suppliers.view",
    "expenses.view", "expenses.write",
    "payment_methods.view",
    "returns.view",
    "reports.view",
    "accounts.view",
  ],
  warehouse: [
    "products.view", "products.write",
    "suppliers.view", "suppliers.write",
    "returns.view", "returns.write",
    "invoices.view",
  ],
};


export type AppRole = "admin" | "seller" | "accountant" | "warehouse";

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: "مدير",
  seller: "بائع",
  accountant: "محاسب",
  warehouse: "أمين مخزن",
};

export interface UserRole {
  id: string;
  user_id: string;
  role: AppRole;
  created_at: string;
}

export interface AuditLog {
  id: string;
  user_id: string;
  action: string;
  table_name: string | null;
  record_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

export function useMyRoles() {
  return useQuery({
    queryKey: ["my-roles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("*");
      if (error) throw error;
      return data as UserRole[];
    },
  });
}

export function useAuditLogs() {
  return useQuery({
    queryKey: ["audit-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as AuditLog[];
    },
  });
}

export function useAddAuditLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { action: string; table_name?: string; record_id?: string; details?: Record<string, unknown> }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase.from("audit_logs").insert({
        user_id: user.id,
        action: input.action,
        table_name: input.table_name || null,
        record_id: input.record_id || null,
        details: input.details ? JSON.parse(JSON.stringify(input.details)) : null,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["audit-logs"] }),
  });
}

/**
 * Effective role for the current signed-in user.
 * Precedence: admin > warehouse > accountant > seller.
 * If the user has NO roles assigned, they are treated as `admin`
 * (backwards-compat for owner accounts that predate the roles system).
 */
export function useMyRole() {
  const roles = useMyRoles();
  const list = roles.data ?? [];
  let effective: AppRole = "admin";
  if (list.length > 0) {
    const set = new Set(list.map((r) => r.role));
    effective = set.has("admin")
      ? "admin"
      : set.has("warehouse")
        ? "warehouse"
        : set.has("accountant")
          ? "accountant"
          : "seller";
  }
  return { role: effective, isLoading: roles.isLoading, isAdmin: effective === "admin" };
}

export function can(role: AppRole, perm: Permission): boolean {
  if (role === "admin") return true;
  return ROLE_PERMS[role].includes(perm);
}

export function useCan(perm: Permission): boolean {
  const { role, isLoading } = useMyRole();
  if (isLoading) return false;
  return can(role, perm);
}

/** Render `children` only when the current user has `perm`. */
export function Can({ perm, children, fallback = null }: { perm: Permission; children: ReactNode; fallback?: ReactNode }) {
  const allowed = useCan(perm);
  return allowed ? <>{children}</> : <>{fallback}</>;
}

