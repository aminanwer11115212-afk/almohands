import { useEffect, useRef, useState } from "react";
import { X, Camera, Loader2 } from "lucide-react";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onClose: () => void;
  onDetected: (code: string) => void;
};

/** Camera-based barcode scanner using @zxing/browser. */
export function BarcodeScannerDialog({ open, onClose, onDetected }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const [status, setStatus] = useState<"idle" | "starting" | "scanning" | "error">("idle");
  const [error, setError] = useState<string>("");
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    (async () => {
      setStatus("starting");
      setError("");
      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const reader = new BrowserMultiFormatReader();

        // list cameras (prefer back camera)
        let cams: MediaDeviceInfo[] = [];
        try {
          cams = await BrowserMultiFormatReader.listVideoInputDevices();
          setDevices(cams);
        } catch {/* ignore */}
        const preferred =
          deviceId ??
          cams.find((c) => /back|rear|environment/i.test(c.label))?.deviceId ??
          cams[0]?.deviceId;

        if (cancelled) return;

        const controls = await reader.decodeFromVideoDevice(
          preferred,
          videoRef.current!,
          (result, _err, ctl) => {
            if (result) {
              const text = result.getText();
              if (text) {
                ctl.stop();
                onDetected(text);
                onClose();
              }
            }
          },
        );
        controlsRef.current = controls;
        if (!cancelled) setStatus("scanning");
      } catch (e) {
        if (cancelled) return;
        const msg =
          (e as { message?: string })?.message ??
          "تعذّر تشغيل الكاميرا. تأكد من منح الإذن.";
        setError(msg);
        setStatus("error");
        toast.error(msg);
      }
    })();

    return () => {
      cancelled = true;
      try { controlsRef.current?.stop(); } catch {/* ignore */}
      controlsRef.current = null;
    };
  }, [open, deviceId, onDetected, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[1200] bg-black/70 grid place-items-center p-3" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl bg-card shadow-elevated overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2 font-bold text-sm">
            <Camera className="size-4" /> مسح الباركود بالكاميرا
          </div>
          <button onClick={onClose} className="grid size-8 place-items-center rounded-full hover:bg-muted" aria-label="إغلاق">
            <X className="size-4" />
          </button>
        </div>

        <div className="relative bg-black aspect-[4/3] grid place-items-center">
          <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
          {status !== "scanning" && (
            <div className="absolute inset-0 grid place-items-center text-white text-xs bg-black/50">
              {status === "starting" ? (
                <span className="flex items-center gap-2"><Loader2 className="size-4 animate-spin" /> جاري تشغيل الكاميرا…</span>
              ) : status === "error" ? (
                <span className="px-4 text-center">{error || "خطأ في الكاميرا"}</span>
              ) : null}
            </div>
          )}
          {status === "scanning" && (
            <div className="absolute inset-x-8 top-1/2 -translate-y-1/2 h-24 border-2 border-brand rounded-lg pointer-events-none" />
          )}
        </div>

        {devices.length > 1 && (
          <div className="px-4 py-2 border-t border-border">
            <select
              value={deviceId ?? ""}
              onChange={(e) => setDeviceId(e.target.value || undefined)}
              className="w-full h-9 rounded-lg border border-border bg-card text-xs px-2"
            >
              {devices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `كاميرا ${d.deviceId.slice(0, 6)}`}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="px-4 py-2 text-[11px] text-muted-foreground text-center border-t border-border">
          ضع الباركود داخل الإطار — يتم قراءته تلقائياً.
        </div>
      </div>
    </div>
  );
}
