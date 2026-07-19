import { useEffect, useState } from "react";
import { Wifi, WifiOff, RefreshCw, Check, AlertCircle } from "lucide-react";
import { usePowerSync, useStatus } from "@powersync/react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    setOnline(typeof navigator === "undefined" ? true : navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

function timeAgo(iso: string | Date | null | undefined): string {
  if (!iso) return "لم تتم بعد";
  const t = typeof iso === "string" ? new Date(iso).getTime() : iso.getTime();
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 30) return "الآن";
  if (s < 60) return `منذ ${s} ث`;
  const m = Math.floor(s / 60);
  if (m < 60) return `منذ ${m} د`;
  const h = Math.floor(m / 60);
  if (h < 24) return `منذ ${h} س`;
  return `منذ ${Math.floor(h / 24)} يوم`;
}

/**
 * Compact sync/connection badge for the app header.
 * Falls back to online/offline heuristic when PowerSync isn't wired yet.
 */
function ConnectedBadge() {
  const online = useOnline();
  const powersync = usePowerSync();
  const status = useStatus();
  const [pending, setPending] = useState<number>(0);

  // Poll the local upload queue count every 2s (cheap SQLite read).
  useEffect(() => {
    if (!powersync) return;
    let mounted = true;
    const tick = async () => {
      try {
        const rows = await powersync.getAll<{ n: number }>(
          "SELECT COUNT(*) AS n FROM ps_crud",
        );
        if (mounted) setPending(rows[0]?.n ?? 0);
      } catch {
        /* schema not yet ready */
      }
    };
    tick();
    const id = setInterval(tick, 2000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, [powersync]);

  const connected = status?.connected ?? false;
  const uploading = (status?.dataFlowStatus?.uploading ?? false) || pending > 0;
  const downloading = status?.dataFlowStatus?.downloading ?? false;
  const lastSynced = status?.lastSyncedAt ?? null;

  let variant: "ok" | "syncing" | "offline-queue" | "offline" = "ok";
  if (!online || !connected) variant = pending > 0 ? "offline-queue" : "offline";
  else if (uploading || downloading) variant = "syncing";

  const styles: Record<typeof variant, string> = {
    ok: "bg-emerald-100 text-emerald-700 border-emerald-200",
    syncing: "bg-sky-100 text-sky-700 border-sky-200 animate-pulse",
    "offline-queue": "bg-amber-100 text-amber-800 border-amber-200",
    offline: "bg-muted text-muted-foreground border-border",
  };

  const label: Record<typeof variant, string> = {
    ok: "متصل",
    syncing: `يزامن${pending > 0 ? ` (${pending})` : ""}`,
    "offline-queue": `أوفلاين — ${pending} معلّق`,
    offline: "بدون إنترنت",
  };

  const Icon =
    variant === "ok"
      ? Check
      : variant === "syncing"
        ? RefreshCw
        : variant === "offline-queue"
          ? AlertCircle
          : WifiOff;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium leading-none transition ${styles[variant]}`}
          aria-label="حالة المزامنة"
        >
          <Icon className={`size-3.5 ${variant === "syncing" ? "animate-spin" : ""}`} />
          <span className="hidden sm:inline">{label[variant]}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 text-sm" dir="rtl">
        <div className="space-y-2">
          <div className="flex items-center gap-2 font-semibold">
            {online ? <Wifi className="size-4 text-emerald-600" /> : <WifiOff className="size-4 text-muted-foreground" />}
            {online ? "متصل بالإنترنت" : "بدون إنترنت"}
          </div>
          <div className="text-xs text-muted-foreground space-y-1">
            <div>حالة المزامنة: {connected ? "نشطة" : "متوقفة"}</div>
            <div>آخر مزامنة: {timeAgo(lastSynced)}</div>
            <div>عمليات في الانتظار: <span className="font-semibold nums text-foreground">{pending}</span></div>
          </div>
          {powersync ? (
            <Button
              size="sm"
              variant="secondary"
              className="w-full"
              onClick={() => {
                powersync.triggerCrudUpload();
              }}
              disabled={pending === 0}
            >
              <RefreshCw className="size-3.5 ml-1" />
              مزامنة الآن
            </Button>
          ) : (
            <div className="text-[11px] text-muted-foreground text-center border-t pt-2">
              PowerSync غير مفعّل بعد — يستخدم كاش شبكة عادي.
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Fallback when PowerSyncContext is not available (before setup or during SSR). */
function BasicBadge() {
  const online = useOnline();
  if (online) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium leading-none bg-emerald-100 text-emerald-700 border-emerald-200">
        <Check className="size-3.5" />
        <span className="hidden sm:inline">متصل</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium leading-none bg-amber-100 text-amber-800 border-amber-200">
      <WifiOff className="size-3.5" />
      <span className="hidden sm:inline">بدون إنترنت</span>
    </span>
  );
}

export function SyncStatusBadge() {
  // usePowerSync throws when there's no context. Try/catch is fine here
  // because the presence of the provider is a boot-time decision.
  try {
    return <ConnectedBadge />;
  } catch {
    return <BasicBadge />;
  }
}
