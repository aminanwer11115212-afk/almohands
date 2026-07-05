// Guarded PWA registration — only in production and not inside Lovable preview/iframe.
export function registerPwa() {
  if (typeof window === "undefined") return;
  if (!import.meta.env.PROD) return;

  const host = window.location.hostname;
  const inIframe = window.self !== window.top;
  const bad =
    inIframe ||
    host.startsWith("id-preview--") ||
    host.startsWith("preview--") ||
    host === "lovableproject.com" ||
    host.endsWith(".lovableproject.com") ||
    host === "lovableproject-dev.com" ||
    host.endsWith(".lovableproject-dev.com") ||
    host === "beta.lovable.dev" ||
    host.endsWith(".beta.lovable.dev") ||
    new URL(window.location.href).searchParams.get("sw") === "off";

  if (bad) {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistrations().then((regs) => {
        regs.forEach((r) => {
          if (r.active?.scriptURL.endsWith("/sw.js")) r.unregister();
        });
      });
    }
    return;
  }

  if (!("serviceWorker" in navigator)) return;
  import("workbox-window").then(({ Workbox }) => {
    const wb = new Workbox("/sw.js");
    wb.register().catch(() => {});
  });
}
