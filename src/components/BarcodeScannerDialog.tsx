import { useEffect, useRef, useState } from "react";
import { X, Camera, Loader2, AlertCircle, Keyboard, Check, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { logScanError } from "@/lib/scan-error-log";
import {
  classifyScannerError, recordScannerStatus, reasonDetail, reasonLabel,
  type ScannerReason,
} from "@/lib/scanner-status";

type Props = {
  open: boolean;
  onClose: () => void;
  onDetected: (code: string) => void;
  /** Cashier mode: never surface toasts, never show scary error UI —
   *  quietly fall back to the manual-entry pane. All errors still land
   *  in the silent scan-error log for the admin to review. */
  cashierMode?: boolean;
  /** Optional context tag stored with the last-status record so the
   *  diagnostics page can show which screen triggered the last scan. */
  contextTag?: string;
};

/** Camera-based barcode scanner using @zxing/browser. Robust to permission
 *  denials, missing cameras, insecure contexts (non-HTTPS), and rapid
 *  open/close cycles. In cashierMode all errors are silent (logged only).
 *  Emits a stable ScannerReason to localStorage on every state change so
 *  admins can review "last camera status" from the diagnostics page. */
export function BarcodeScannerDialog({ open, onClose, onDetected, cashierMode = false, contextTag }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const onDetectedRef = useRef(onDetected);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onDetectedRef.current = onDetected; }, [onDetected]);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  const [reason, setReason] = useState<ScannerReason>("idle");
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string | undefined>(undefined);
  const [retryTick, setRetryTick] = useState(0);
  const [manualCode, setManualCode] = useState("");
  const [showManual, setShowManual] = useState(false);
  const detectedOnceRef = useRef(false);

  const updateReason = (r: ScannerReason, ctx?: Record<string, unknown>) => {
    setReason(r);
    recordScannerStatus(r, { ...ctx, tag: contextTag, cashierMode });
  };

  const fail = (e: unknown, contextTagInner: string) => {
    const r = classifyScannerError(e);
    const friendly = reasonDetail(r);
    logScanError(e, friendly, { tag: contextTagInner, cashierMode, reason: r });
    updateReason(r, { tag: contextTagInner });
    if (!cashierMode) toast.error(friendly);
    if (cashierMode) setShowManual(true);
  };

  useEffect(() => {
    if (!open) { updateReason("idle"); return; }
    let cancelled = false;
    detectedOnceRef.current = false;
    setShowManual(false);

    (async () => {
      updateReason("starting");

      if (typeof window !== "undefined" && window.isSecureContext === false) {
        fail(new DOMException("insecure context", "SecurityError"), "secure-context");
        // Override — SecurityError -> denied by default, but this is really insecure ctx
        updateReason("insecure");
        return;
      }
      if (!navigator?.mediaDevices?.getUserMedia) {
        fail(new DOMException("mediaDevices unavailable", "NotSupportedError"), "no-mediaDevices");
        updateReason("no_api");
        return;
      }

      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        if (cancelled) return;
        const reader = new BrowserMultiFormatReader();

        let cams: MediaDeviceInfo[] = [];
        try {
          cams = await BrowserMultiFormatReader.listVideoInputDevices();
          if (!cancelled) setDevices(cams);
        } catch (listErr) { logScanError(listErr, "list-devices", { tag: "list-devices" }); }
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
            updateReason("success", { code: text });
            onDetectedRef.current(text);
            onCloseRef.current();
          },
        );
        if (cancelled) { try { controls.stop(); } catch { /* ignore */ } return; }
        controlsRef.current = controls;
        updateReason("scanning", { deviceId: preferred });
      } catch (e) {
        if (cancelled) return;
        fail(e, "decodeFromVideoDevice");
      }
    })();

    return () => {
      cancelled = true;
      try { controlsRef.current?.stop(); } catch { /* ignore */ }
      controlsRef.current = null;
      try {
        const v = videoRef.current;
        const stream = v?.srcObject as MediaStream | null;
        stream?.getTracks?.().forEach((t) => t.stop());
        if (v) v.srcObject = null;
      } catch { /* ignore */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, deviceId, retryTick]);

  if (!open) return null;

  const submitManual = () => {
    const code = manualCode.trim();
    if (!code) return;
    detectedOnceRef.current = true;
    updateReason("success", { code, manual: true });
    onDetectedRef.current(code);
    setManualCode("");
    onCloseRef.current();
  };

  const isError = reason !== "idle" && reason !== "starting" && reason !== "scanning" && reason !== "success";
  const badgeColor =
    reason === "scanning" ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/30" :
    reason === "starting" ? "bg-blue-500/15 text-blue-600 border-blue-500/30" :
    reason === "success"  ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/30" :
    isError ? "bg-red-500/15 text-red-600 border-red-500/30" :
    "bg-muted text-muted-foreground border-border";

  return (
    <div
      className="fixed inset-0 z-[1200] bg-black/70 grid place-items-center p-3"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="مسح الباركود"
    >
      <div
        className="w-full max-w-md rounded-2xl bg-card shadow-elevated overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2 font-bold text-sm">
            <Camera className="size-4" /> مسح الباركود
          </div>
          <button
            onClick={onClose}
            className="grid size-8 place-items-center rounded-full hover:bg-muted"
            aria-label="إغلاق"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Explicit status badge — always visible so the user knows exactly why the camera isn't showing */}
        <div className="px-4 py-2 border-b border-border flex items-center justify-between gap-2 text-[11px]">
          <span className="text-muted-foreground">حالة الكاميرا</span>
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border font-bold ${badgeColor}`}
            data-testid="scanner-status"
            data-reason={reason}
          >
            {reason === "starting" && <Loader2 className="size-3 animate-spin" />}
            {reason === "scanning" && <CheckCircle2 className="size-3" />}
            {isError && <AlertCircle className="size-3" />}
            {reasonLabel(reason)}
          </span>
        </div>

        <div className="relative bg-black aspect-[4/3] grid place-items-center">
          <video ref={videoRef} className="w-full h-full object-cover" muted playsInline autoPlay />
          {reason !== "scanning" && (
            <div className="absolute inset-0 grid place-items-center text-white text-xs bg-black/60 p-4 text-center">
              {reason === "starting" && (
                <span className="flex items-center gap-2">
                  <Loader2 className="size-4 animate-spin" /> جاري تشغيل الكاميرا…
                </span>
              )}
              {isError && !cashierMode && (
                <div className="flex flex-col items-center gap-2 max-w-xs">
                  <AlertCircle className="size-6 text-red-400" />
                  <div className="leading-relaxed">{reasonDetail(reason)}</div>
                  <div className="flex gap-2 mt-1">
                    <button
                      onClick={() => setRetryTick((n) => n + 1)}
                      className="h-8 px-3 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs"
                    >
                      إعادة المحاولة
                    </button>
                    <button
                      onClick={() => setShowManual(true)}
                      className="h-8 px-3 rounded-lg bg-brand text-white text-xs font-bold flex items-center gap-1"
                    >
                      <Keyboard className="size-3.5" /> إدخال يدوي
                    </button>
                  </div>
                </div>
              )}
              {isError && cashierMode && (
                <div className="flex flex-col items-center gap-2 max-w-xs">
                  <Keyboard className="size-6 text-white/80" />
                  <div className="leading-relaxed">أدخل رمز الباركود يدويًا</div>
                </div>
              )}
            </div>
          )}
          {reason === "scanning" && (
            <div className="absolute inset-x-8 top-1/2 -translate-y-1/2 h-24 border-2 border-brand rounded-lg pointer-events-none" />
          )}
        </div>

        {devices.length > 1 && !showManual && (
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

        <div className="px-4 py-3 border-t border-border space-y-2">
          {!showManual ? (
            <button
              type="button"
              onClick={() => setShowManual(true)}
              className="w-full h-9 rounded-lg border border-border hover:bg-muted text-xs font-bold flex items-center justify-center gap-1.5"
            >
              <Keyboard className="size-3.5" /> إدخال الباركود يدويًا
            </button>
          ) : (
            <form
              onSubmit={(e) => { e.preventDefault(); submitManual(); }}
              className="flex gap-2"
            >
              <input
                autoFocus
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                placeholder="أدخل رمز الباركود أو رقم القطعة"
                inputMode="text"
                className="flex-1 h-10 rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-brand"
                aria-label="رمز الباركود يدويًا"
              />
              <button
                type="submit"
                disabled={!manualCode.trim()}
                className="h-10 px-4 rounded-lg bg-brand text-white text-xs font-bold flex items-center gap-1 disabled:opacity-50"
              >
                <Check className="size-4" /> تأكيد
              </button>
            </form>
          )}
        </div>

        <div className="px-4 py-2 text-[11px] text-muted-foreground text-center border-t border-border">
          ضع الباركود داخل الإطار — يتم قراءته تلقائياً. أو استخدم الإدخال اليدوي.
        </div>
      </div>
    </div>
  );
}
