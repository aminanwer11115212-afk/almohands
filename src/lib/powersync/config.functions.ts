import { createServerFn } from "@tanstack/react-start";

/**
 * Returns the PowerSync endpoint URL to the browser.
 * Kept in a server fn so the URL is not baked into the client bundle
 * (allows rotation without a rebuild).
 */
export const getPowerSyncUrl = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ url: string | null }> => {
    const url = process.env.POWERSYNC_URL ?? null;
    return { url };
  },
);
