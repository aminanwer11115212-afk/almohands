import { useEffect, useRef, useState } from "react";
import { X, Camera, Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onClose: () => void;
  onDetected: (code: string) => void;
};

/** Translate a browser MediaError / generic error into an Arabic message. */
function friendlyError(e: unknown): string {
  const err = e as { name?: string; message?: string } | undefined;
  const name = err?.name ?? "";
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return "تم رفض الإذن للكاميرا. فعّل الإذن من إعدادات المتصفح ثم أعد المحاولة.";
    case "NotFoundError":
    case "OverconstrainedError":
      return "لا توجد كاميرا متاحة على هذا الجهاز.";
    case "NotReadableError":
    case "TrackStartError":
      return "الكاميرا مستخدمة بواسطة تطبيق آخر. أغلقه ثم أعد المحاولة.";
    case "AbortError":
      return "تم إيقاف تشغيل الكاميرا. أعد المحاولة.";
    default:
      return err?.message || "تعذّر تشغيل الكاميرا. تأكد من الإذن والاتصال الآمن (HTTPS).";
  }
}

/** Camera-based barcode scanner using @zxing/browser. Robust to permission
 *  denials, missing cameras, insecure contexts (non-HTTPS), and rapid
 *  open/close cycles. */
export function BarcodeScannerDialog({ open, onClose, onDetected }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  // Keep latest callbacks in refs so the effect doesn't restart the camera
  // when the parent re-renders with new inline handlers.
  const onDetectedRef = useRef(onDetected);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onDetectedRef.current = onDetected; }, [onDetected]);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  const [status, setStatus] = useState<"idle" | "starting" | "scanning" | "error">("idle");
  const [error, setError] = useState<string>("");
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string | undefined>(undefined);
  const detectedOnceRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    detectedOnceRef.current = false;

    (async () => {
      setStatus("starting");
      setError("");

      // Guard: secure context + API availability
      if (typeof window !== "undefined" && window.isSecureContext === false) {
        const msg = "الكاميرا تحتاج اتصال آمن (HTTPS) للعمل.";
        setError(msg); setStatus("error"); toast.error(msg);
        return;
      }
      if (!navigator?.mediaDevices?.getUserMedia) {
        const msg = "المتصفح لا يدعم الوصول إلى الكاميرا.";
        setError(msg); setStatus("error"); toast.error(msg);
        return;
      }

      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        if (cancelled) return;
        const reader = new BrowserMultiFormatReader();

        // list cameras (prefer back camera). listVideoInputDevices may
        // require an existing permission on some browsers — swallow errors.
        let cams: MediaDeviceInfo[] = [];
        try {
          cams = await BrowserMultiFormatReader.listVideoInputDevices();
          if (!cancelled) setDevices(cams);
        } catch { /* ignore */ }
        const preferred =
          deviceId ??
          cams.find((c) => /back|rear|environment|خلف/i.test(c.label))?.deviceId ??
          cams[0]?.deviceId;

        if (cancelled) return;
        if (!videoRef.current) return;

        const controls = await reader.decodeFromVideoDevice(
          preferred,
          videoRef.current,
          (result, _err, ctl) => {
            if (!result || detectedOnceRef.current) return;
            const text = result.getText();
            if (!text) return;
            detectedOnceRef.current = true;
            try { ctl.stop(); } catch { /* ignore */ }
            onDetectedRef.current(text);
            onCloseRef.current();
          },
        );
        // If we were cancelled during the await, stop immediately.
        if (cancelled) { try { controls.stop(); } catch { /* ignore */ } return; }
        controlsRef.current = controls;
        setStatus("scanning");
      } catch (e) {
        if (cancelled) return;
        const msg = friendlyError(e);
        setError(msg);
        setStatus("error");
        toast.error(msg);
      }
    })();

    return () => {
      cancelled = true;
      try { controlsRef.current?.stop(); } catch { /* ignore */ }
      controlsRef.current = null;
      // Also stop any lingering tracks bound to the video element.
      try {
        const v = videoRef.current;
        const stream = v?.srcObject as MediaStream | null;
        stream?.getTracks?.().forEach((t) => t.stop());
        if (v) v.srcObject = null;
      } catch { /* ignore */ }
    };
  }, [open, deviceId]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[1200] bg-black/70 grid place-items-center p-3"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-md rounded-2xl bg-card shadow-elevated overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2 font-bold text-sm">
            <Camera className="size-4" /> مسح الباركود بالكاميرا
          </div>
          <button
            onClick={onClose}
            className="grid size-8 place-items-center rounded-full hover:bg-muted"
            aria-label="إغلاق"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="relative bg-black aspect-[4/3] grid place-items-center">
          <video ref={videoRef} className="w-full h-full object-cover" muted playsInline autoPlay />
          {status !== "scanning" && (
            <div className="absolute inset-0 grid place-items-center text-white text-xs bg-black/60 p-4 text-center">
              {status === "starting" && (
                <span className="flex items-center gap-2">
                  <Loader2 className="size-4 animate-spin" /> جاري تشغيل الكاميرا…
                </span>
              )}
              {status === "error" && (
                <div className="flex flex-col items-center gap-2 max-w-xs">
                  <AlertCircle className="size-6 text-red-400" />
                  <div className="leading-relaxed">{error || "خطأ في الكاميرا"}</div>
                  <button
                    onClick={() => { setStatus("idle"); setDeviceId((d) => d); setError(""); /* retrigger */ setTimeout(() => setStatus("starting"), 0); }}
                    className="mt-1 h-8 px-3 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs"
                  >
                    إعادة المحاولة
                  </button>
                </div>
              )}
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
              aria-label="اختيار الكاميرا"
            >
              <option value="">— اختر الكاميرا —</option>
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
