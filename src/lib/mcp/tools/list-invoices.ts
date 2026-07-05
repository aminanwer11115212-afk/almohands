import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_invoices",
  title: "List sales invoices",
  description: "List recent sales invoices with totals, optionally filtered by status or date range (ISO dates).",
  inputSchema: {
    status: z.enum(["paid", "partial", "pending"]).optional().describe("Filter by invoice status."),
    from: z.string().optional().describe("Include invoices created on/after this ISO date."),
    to: z.string().optional().describe("Include invoices created on/before this ISO date."),
    limit: z.number().int().min(1).max(200).optional().describe("Max rows (default 50)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status, from, to, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const sb = supabaseForUser(ctx);
    let q = sb.from("invoices").select("*").order("created_at", { ascending: false }).limit(limit ?? 50);
    if (status) q = q.eq("status", status);
    if (from) q = q.gte("created_at", from);
    if (to) q = q.lte("created_at", to);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: { invoices: data ?? [] },
    };
  },
});
