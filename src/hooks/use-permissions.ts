import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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
        details: input.details || null,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["audit-logs"] }),
  });
}
