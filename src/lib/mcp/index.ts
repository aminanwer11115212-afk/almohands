import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listProducts from "./tools/list-products";
import lowStockProducts from "./tools/low-stock-products";
import listInvoices from "./tools/list-invoices";
import getInvoice from "./tools/get-invoice";
import salesSummary from "./tools/sales-summary";

// Direct Supabase issuer required (see app-mcp-server-authoring knowledge).
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "al-mohandes-mcp",
  title: "المهندس — Auto Parts MCP",
  version: "0.1.0",
  instructions:
    "Tools for the Al-Mohandes auto parts store management system. Use these to read the signed-in user's products, low-stock items, sales invoices, invoice details, and sales summaries.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listProducts, lowStockProducts, listInvoices, getInvoice, salesSummary],
});
