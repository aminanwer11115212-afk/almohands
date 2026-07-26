import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/tanstack/vite";

// Service worker: generated post-build by scripts/generate-sw.mjs against
// `.output/public` (the real deploy dir). vite-plugin-pwa was removed because
// it globbed `dist/` and shipped an empty precache — no offline support.
export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    // @powersync/web ships module workers + wasm; keep them out of dep
    // pre-bundling and emit workers as ES modules so they load in production.
    worker: { format: "es" },
    optimizeDeps: { exclude: ["@powersync/web", "@journeyapps/wa-sqlite"] },
    plugins: [mcpPlugin()],
  },
});
