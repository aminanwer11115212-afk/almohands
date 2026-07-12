/* Unit tests for the product audit-log helper.
 * Uses a hand-rolled Supabase mock to verify:
 *   1. product.created inserts an audit row with the correct record_id + action.
 *   2. product.updated inserts a diff-only details.changes payload.
 *   3. product.deleted inserts the correct record_id + snapshot details.
 *   4. logProductAudit never throws — it returns false on missing auth. */

import { describe, it, expect, vi } from "vitest";
import {
  logProductAudit, diffProduct, PRODUCT_AUDIT_FIELDS,
  type MinimalAuditSupabase,
} from "../src/lib/product-audit";

function makeSupabase(user: { id: string } | null) {
  const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];
  const client: MinimalAuditSupabase = {
    auth: { getUser: async () => ({ data: { user } }) },
    from: (table: string) => ({
      insert: async (row: Record<string, unknown>) => {
        inserts.push({ table, row });
        return { error: null };
      },
    }),
  };
  return { client, inserts };
}

describe("logProductAudit", () => {
  it("records product.created with record_id + details", async () => {
    const { client, inserts } = makeSupabase({ id: "u1" });
    const ok = await logProductAudit(client, "product.created", "p1", {
      name: "فلتر زيت", barcode: "123", quantity: 5, cost_price: 10, sale_price: 15,
    });
    expect(ok).toBe(true);
    expect(inserts).toHaveLength(1);
    expect(inserts[0].table).toBe("audit_logs");
    expect(inserts[0].row).toMatchObject({
      user_id: "u1", action: "product.created", table_name: "products", record_id: "p1",
    });
    expect((inserts[0].row.details as { name: string }).name).toBe("فلتر زيت");
  });

  it("records product.updated with a compact diff via diffProduct", async () => {
    const prev = { name: "A", quantity: 5, sale_price: 10, cost_price: 3 };
    const next = { name: "A", quantity: 8, sale_price: 12, cost_price: 3 };
    const changes = diffProduct(prev, next, PRODUCT_AUDIT_FIELDS);
    expect(changes).toEqual({
      quantity: { from: 5, to: 8 },
      sale_price: { from: 10, to: 12 },
    });

    const { client, inserts } = makeSupabase({ id: "u1" });
    const ok = await logProductAudit(client, "product.updated", "p1", {
      name: "A", changes,
    });
    expect(ok).toBe(true);
    expect((inserts[0].row.details as { changes: object }).changes).toEqual(changes);
  });

  it("records product.deleted with snapshot", async () => {
    const { client, inserts } = makeSupabase({ id: "admin" });
    await logProductAudit(client, "product.deleted", "p9", {
      name: "شمعات", quantity: 12, cost_price: 4, sale_price: 6,
    });
    expect(inserts[0].row.action).toBe("product.deleted");
    expect(inserts[0].row.record_id).toBe("p9");
  });

  it("returns false when no auth user", async () => {
    const { client, inserts } = makeSupabase(null);
    const ok = await logProductAudit(client, "product.created", "p1", { name: "x" });
    expect(ok).toBe(false);
    expect(inserts).toHaveLength(0);
  });

  it("never throws on client failure", async () => {
    const client: MinimalAuditSupabase = {
      auth: { getUser: async () => { throw new Error("network"); } },
      from: () => ({ insert: async () => ({ error: null }) }),
    };
    const ok = await logProductAudit(client, "product.deleted", "p1", {});
    expect(ok).toBe(false);
  });
});

describe("diffProduct", () => {
  it("treats undefined and null as equal", () => {
    const d = diffProduct({ notes: undefined }, { notes: null }, ["notes"]);
    expect(d).toEqual({});
  });
  it("only surfaces requested fields", () => {
    const d = diffProduct({ name: "A", secret: 1 }, { name: "B", secret: 2 }, ["name"]);
    expect(d).toEqual({ name: { from: "A", to: "B" } });
  });
});
