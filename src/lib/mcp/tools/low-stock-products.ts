import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "low_stock_products",
  title: "Low-stock products",
  description: "Return products whose current quantity is at or below their configured minimum quantity.",
  inputSchema: {
    limit: z.number().int().min(1).max(200).optional().describe("Max rows to return (default 50)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const sb = supabaseForUser(ctx);
    const { data, error } = await sb
      .from("products")
      .select("id,name,sku,quantity,min_quantity,unit,sale_price")
      .order("quantity", { ascending: true })
      .limit(limit ?? 50);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const low = (data ?? []).filter((p) => (p.quantity ?? 0) <= (p.min_quantity ?? 0));
    return {
      content: [{ type: "text", text: JSON.stringify(low, null, 2) }],
      structuredContent: { products: low, count: low.length },
    };
  },
});
