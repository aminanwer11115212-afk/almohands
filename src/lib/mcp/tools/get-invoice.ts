import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_invoice",
  title: "Get invoice details",
  description: "Get one sales invoice by ID including its line items.",
  inputSchema: {
    invoice_id: z.string().uuid().describe("The invoice UUID."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ invoice_id }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const sb = supabaseForUser(ctx);
    const [{ data: invoice, error: e1 }, { data: items, error: e2 }] = await Promise.all([
      sb.from("invoices").select("*").eq("id", invoice_id).maybeSingle(),
      sb.from("invoice_items").select("*").eq("invoice_id", invoice_id),
    ]);
    if (e1 || e2) return { content: [{ type: "text", text: (e1 ?? e2)!.message }], isError: true };
    if (!invoice) return { content: [{ type: "text", text: "Invoice not found" }], isError: true };
    const payload = { invoice, items: items ?? [] };
    return {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      structuredContent: payload,
    };
  },
});
