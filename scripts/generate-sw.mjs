/**
 * Generates the production service worker AFTER the full TanStack Start build.
 *
 * Why not vite-plugin-pwa? The client assets of this app end up in
 * `.output/public` (nitro), but the plugin runs against `dist/` and produced an
 * EMPTY precache manifest — so the deployed app had no offline support at all.
 * Running workbox-build here, against the real deploy directory, precaches the
 * complete app shell (JS/CSS/wasm/icons) plus the SSR "/" document, which makes
 * a cold offline launch work from any URL via navigateFallback.
 */
import { generateSW } from "workbox-build";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, ".output", "public");

const { count, size, warnings } = await generateSW({
  globDirectory: outDir,
  globPatterns: ["**/*.{js,css,html,png,svg,woff2,wasm,webmanifest}"],
  globIgnores: ["sw.js", "workbox-*.js", "_headers"],
  swDest: path.join(outDir, "sw.js"),
  // The SSR-rendered shell: fetched from the live server at SW install time.
  // A fresh revision per build forces re-fetch after each deploy.
  additionalManifestEntries: [{ url: "/", revision: String(Date.now()) }],
  maximumFileSizeToCacheInBytes: 20 * 1024 * 1024,
  skipWaiting: true,
  clientsClaim: true,
  cleanupOutdatedCaches: true,
  navigateFallback: "/",
  navigateFallbackDenylist: [/^\/~oauth/, /^\/api\//, /^\/_serverFn/, /^\/\.well-known/, /^\/\.mcp/, /^\/\.lovable/],
  runtimeCaching: [
    {
      urlPattern: ({ request }) => request.mode === "navigate",
      handler: "NetworkFirst",
      options: {
        cacheName: "pages",
        networkTimeoutSeconds: 4,
      },
    },
    {
      urlPattern: ({ url, sameOrigin }) => sameOrigin && /\/assets\//.test(url.pathname),
      handler: "CacheFirst",
      options: {
        cacheName: "assets",
        expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 30 },
      },
    },
    {
      urlPattern: ({ url }) =>
        url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com",
      handler: "CacheFirst",
      options: {
        cacheName: "google-fonts",
        expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 365 },
      },
    },
  ],
});

for (const w of warnings) console.warn("[sw]", w);
console.log(`[sw] generated .output/public/sw.js — precached ${count} files (${(size / 1024 / 1024).toFixed(1)} MB)`);
