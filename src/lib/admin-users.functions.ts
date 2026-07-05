import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type AppRole = "admin" | "seller" | "accountant" | "warehouse";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ensureAdmin(supabase: any, userId: string): Promise<void> {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!data) throw new Error("Forbidden: admin only");
}

export const listEmployees = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: usersRes, error: uErr } = await supabaseAdmin.auth.admin.listUsers({ perPage: 200 });
    if (uErr) throw uErr;
    const { data: roles, error: rErr } = await supabaseAdmin
      .from("user_roles")
      .select("id, user_id, role");
    if (rErr) throw rErr;

    return usersRes.users.map((u) => ({
      id: u.id,
      email: u.email ?? "",
      created_at: u.created_at,
      roles: (roles ?? [])
        .filter((r) => r.user_id === u.id)
        .map((r) => ({ id: r.id, role: r.role as AppRole })),
    }));
  });

export const createEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { email: string; password: string; role: AppRole }) =>
    z
      .object({
        email: z.string().trim().email().max(255),
        password: z.string().min(6).max(72),
        role: z.enum(["admin", "seller", "accountant", "warehouse"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
    });
    if (error) throw error;
    const userId = created.user?.id;
    if (!userId) throw new Error("no user id");

    const { error: rErr } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: userId, role: data.role });
    if (rErr) throw rErr;

    return { id: userId, email: data.email };
  });

export const assignRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string; role: AppRole }) =>
    z
      .object({
        userId: z.string().uuid(),
        role: z.enum(["admin", "seller", "accountant", "warehouse"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: data.userId, role: data.role });
    if (error && !String(error.message).includes("duplicate")) throw error;
    return { ok: true };
  });

export const removeRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { roleId: string }) =>
    z.object({ roleId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("user_roles").delete().eq("id", data.roleId);
    if (error) throw error;
    return { ok: true };
  });

export const deleteEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string }) =>
    z.object({ userId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId);
    if (data.userId === context.userId) throw new Error("Cannot delete self");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw error;
    return { ok: true };
  });
