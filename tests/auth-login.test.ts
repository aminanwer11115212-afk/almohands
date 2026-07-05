/**
 * Regression tests for the Supabase login flow.
 *
 * Guards three scenarios that broke in production before:
 *   1. A confirmed user can sign in with email + password.
 *   2. An unconfirmed user is rejected with `email_not_confirmed`.
 *   3. A user whose auth token columns are NULL can still sign in
 *      (previously produced `Scan error on column "confirmation_token"`,
 *      fixed by migration 20260705191104_* that backfills '' for NULLs).
 *
 * Setup and teardown are done via psql (PG* env vars already point at the
 * project DB in the sandbox). Sign-in attempts go through the real Supabase
 * Auth REST endpoint with the publishable/anon key — same code path the app
 * uses in the browser.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Read Vite env from .env so the test doesn't depend on shell exports.
function loadEnv(): Record<string, string> {
  const raw = readFileSync(resolve(__dirname, "..", ".env"), "utf8");
  const out: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

const env = loadEnv();
const SUPABASE_URL = env.VITE_SUPABASE_URL;
const ANON_KEY = env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!SUPABASE_URL || !ANON_KEY) {
  throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY in .env");
}

const RUN_ID = randomUUID().slice(0, 8);
const emailFor = (tag: string) => `test-login-${RUN_ID}-${tag}@regression.test`;
const PASSWORD = "Regression!Passw0rd";

function psql(sql: string): string {
  return execFileSync("psql", ["-tAX", "-v", "ON_ERROR_STOP=1", "-c", sql], {
    encoding: "utf8",
  });
}

/**
 * Insert a user directly into auth.users using the same bcrypt hashing
 * Supabase uses (pgcrypto's crypt + bf). Lets us control confirmation
 * state and token columns deterministically without going through signUp.
 */
function createUser(opts: {
  email: string;
  confirmed: boolean;
  nullTokens?: boolean;
}): string {
  const id = randomUUID();
  const confirmedExpr = opts.confirmed ? "now()" : "NULL";
  // Insert with the safe empty-string defaults for token columns.
  psql(`
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data,
      confirmation_token, email_change, email_change_token_new,
      recovery_token, phone_change, phone_change_token,
      reauthentication_token
    ) VALUES (
      '${id}',
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      '${opts.email}',
      crypt('${PASSWORD}', gen_salt('bf')),
      ${confirmedExpr},
      now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{}'::jsonb,
      '', '', '', '', '', '', ''
    );
  `);
  if (opts.nullTokens) {
    // Reproduce the pre-fix production state that broke sign-in.
    psql(`
      UPDATE auth.users
         SET confirmation_token = NULL,
             email_change = NULL,
             email_change_token_new = NULL,
             recovery_token = NULL,
             phone_change = NULL,
             phone_change_token = NULL,
             reauthentication_token = NULL
       WHERE id = '${id}';
    `);
  }
  return id;
}

function deleteUser(email: string): void {
  psql(`DELETE FROM auth.users WHERE email = '${email}';`);
}

async function signIn(email: string): Promise<{
  status: number;
  body: { access_token?: string; error_code?: string; msg?: string; error?: string };
}> {
  const res = await fetch(
    `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: ANON_KEY,
        Authorization: `Bearer ${ANON_KEY}`,
      },
      body: JSON.stringify({ email, password: PASSWORD }),
    },
  );
  return { status: res.status, body: await res.json() };
}

const confirmedEmail = emailFor("confirmed");
const unconfirmedEmail = emailFor("unconfirmed");
const nullTokensEmail = emailFor("null-tokens");

describe("login flow regression", () => {
  beforeAll(() => {
    createUser({ email: confirmedEmail, confirmed: true });
    createUser({ email: unconfirmedEmail, confirmed: false });
    createUser({ email: nullTokensEmail, confirmed: true, nullTokens: true });
  });

  afterAll(() => {
    for (const email of [confirmedEmail, unconfirmedEmail, nullTokensEmail]) {
      try {
        deleteUser(email);
      } catch {
        /* best-effort cleanup */
      }
    }
  });

  it("confirmed user signs in successfully", async () => {
    const { status, body } = await signIn(confirmedEmail);
    expect(status, `expected 200, got ${status}: ${JSON.stringify(body)}`).toBe(200);
    expect(body.access_token).toBeTypeOf("string");
  });

  it("unconfirmed user is rejected with email_not_confirmed", async () => {
    const { status, body } = await signIn(unconfirmedEmail);
    expect(status).toBe(400);
    // Supabase returns `error_code: "email_not_confirmed"` (new) or
    // legacy `error: "invalid_grant"` + msg. Accept either shape.
    const isNotConfirmed =
      body.error_code === "email_not_confirmed" ||
      /not.*confirm/i.test(body.msg ?? "") ||
      /not.*confirm/i.test(body.error ?? "");
    expect(isNotConfirmed, `unexpected error body: ${JSON.stringify(body)}`).toBe(true);
    expect(body.access_token).toBeUndefined();
  });

  it("user with NULL token columns can still sign in (Scan error regression)", async () => {
    const { status, body } = await signIn(nullTokensEmail);
    expect(
      status,
      `NULL token columns broke sign-in (500 Scan error) — expected 200, got ${status}: ${JSON.stringify(body)}`,
    ).toBe(200);
    expect(body.access_token).toBeTypeOf("string");
  });
});
