// Playwright integration test for products page keyboard nav + delete confirm.
// Run manually via: node --loader tsx tests/products-keyboard.playwright.ts
// (Requires an authenticated LOVABLE_BROWSER_SUPABASE_* session; see <browser-use>.)
import { chromium } from "playwright";
import { strict as assert } from "node:assert";

const BASE = process.env.APP_URL ?? "http://localhost:8080";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1800 } });
  const page = await ctx.newPage();

  // Restore Supabase session if injected by harness.
  const storageKey = process.env.LOVABLE_BROWSER_SUPABASE_STORAGE_KEY;
  const sessionJson = process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON;
  const cookiesJson = process.env.LOVABLE_BROWSER_SUPABASE_COOKIES_JSON;
  if (cookiesJson) {
    const cookies = JSON.parse(cookiesJson).map((c: any) => ({ ...c, url: BASE }));
    await ctx.addCookies(cookies);
  }
  await page.goto(BASE);
  if (storageKey && sessionJson) {
    await page.evaluate(([k, v]) => window.localStorage.setItem(k as string, v as string),
      [storageKey, sessionJson]);
  }

  await page.goto(`${BASE}/products`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("table tbody tr", { timeout: 10_000 });

  const wrap = page.locator('div[tabindex="0"]:has(table)').first();
  await wrap.focus();

  // ArrowDown twice + Space to select 3rd row
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press(" ");

  // Shift+ArrowDown range-select
  await page.keyboard.down("Shift");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.up("Shift");

  const badge = page.locator('text=/\\d+\\s+محدد/').first();
  await badge.waitFor({ timeout: 3000 });
  const badgeText = await badge.textContent();
  const count = Number((badgeText ?? "").match(/(\d+)/)?.[1] ?? "0");
  assert.ok(count >= 3, `expected 3+ selected, got ${count}`);

  // Delete opens confirm modal
  await page.keyboard.press("Delete");
  const modal = page.locator('[data-testid="delete-modal"]');
  await modal.waitFor({ timeout: 3000 });
  const title = await modal.locator("h2").textContent();
  assert.ok(title?.includes("تأكيد حذف"), "modal should show confirmation title");
  assert.ok(title?.includes(String(count)), `modal should show selected count (${count})`);

  // Cancel (no destructive action in test)
  await modal.locator('[data-testid="cancel-delete"]').click();
  await modal.waitFor({ state: "detached", timeout: 3000 });

  // Escape clears selection
  await wrap.focus();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  assert.equal(await page.locator('text=/\\d+\\s+محدد/').count(), 0, "selection should clear");

  console.log("✓ products keyboard nav + delete confirmation passed");
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
