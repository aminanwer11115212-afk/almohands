import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "sales_summary",
  title: "Sales summary",
  description: "Aggregate totals (invoice count, gross total, paid, remaining) over an optional date range.",
  inputSchema: {
    from: z.string().optional().describe("ISO date; only include invoices created on/after this."),
    to: z.string().optional().describe("ISO date; only include invoices created on/before this."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ from, to }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const sb = supabaseForUser(ctx);
    let q = sb.from("invoices").select("total,paid,remaining,status,created_at").limit(10000);
    if (from) q = q.gte("created_at", from);
    if (to) q = q.lte("created_at", to);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const rows = data ?? [];
    const sum = (k: "total" | "paid" | "remaining") => rows.reduce((a, r) => a + Number(r[k] ?? 0), 0);
    const summary = {
      count: rows.length,
      total: sum("total"),
      paid: sum("paid"),
      remaining: sum("remaining"),
      by_status: {
        paid: rows.filter((r) => r.status === "paid").length,
        partial: rows.filter((r) => r.status === "partial").length,
        pending: rows.filter((r) => r.status === "pending").length,
      },
      range: { from: from ?? null, to: to ?? null },
    };
    return {
      content: [{ type: "text", text: JSON.stringify(summary, null, 2) }],
      structuredContent: summary,
    };
  },
});
