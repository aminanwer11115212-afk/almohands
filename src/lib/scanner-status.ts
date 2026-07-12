/* Barcode scanner status classifier + last-status recorder.
 * Maps raw MediaError names to a stable code + Arabic label so both the
 * scanner UI and the admin diagnostics page show the same wording. */

export type ScannerReason =
  | "idle"
  | "starting"
  | "scanning"
  | "denied"
  | "not_found"
  | "busy"
  | "insecure"
  | "no_api"
  | "aborted"
  | "success"
  | "unknown";

export type ScannerStatus = {
  reason: ScannerReason;
  label: string;   // Short badge label
  detail: string;  // Longer Arabic description
  ts: string;      // ISO
  context?: Record<string, unknown>;
};

const LABELS: Record<ScannerReason, { label: string; detail: string }> = {
  idle:      { label: "غير مفعّلة", detail: "الكاميرا غير مفعّلة حاليًا." },
  starting:  { label: "جارٍ التشغيل", detail: "جاري تشغيل الكاميرا…" },
  scanning:  { label: "تعمل", detail: "الكاميرا تعمل — ضع الباركود داخل الإطار." },
  denied:    { label: "مرفوضة", detail: "تم رفض إذن الكاميرا من المتصفح. فعّل الإذن ثم أعد المحاولة." },
  not_found: { label: "لا توجد كاميرا", detail: "لا توجد كاميرا متاحة على هذا الجهاز." },
  busy:      { label: "مشغولة", detail: "الكاميرا مستخدمة بواسطة تطبيق آخر. أغلقه ثم أعد المحاولة." },
  insecure:  { label: "غير آمنة", detail: "الاتصال غير آمن. يجب استخدام HTTPS لتشغيل الكاميرا." },
  no_api:    { label: "غير متاحة", detail: "الكاميرا غير متاحة في هذا المتصفح." },
  aborted:   { label: "متوقفة", detail: "تم إيقاف تشغيل الكاميرا." },
  success:   { label: "تم القراءة", detail: "تمت قراءة الباركود بنجاح." },
  unknown:   { label: "خطأ", detail: "تعذّر تشغيل الكاميرا." },
};

export function classifyScannerError(err: unknown): ScannerReason {
  const e = err as { name?: string } | undefined;
  switch (e?.name) {
    case "NotAllowedError":
    case "SecurityError":         return "denied";
    case "NotFoundError":
    case "OverconstrainedError":  return "not_found";
    case "NotReadableError":
    case "TrackStartError":       return "busy";
    case "AbortError":             return "aborted";
    case "NotSupportedError":      return "no_api";
    default:                        return "unknown";
  }
}

export function reasonLabel(r: ScannerReason): string { return LABELS[r].label; }
export function reasonDetail(r: ScannerReason): string { return LABELS[r].detail; }

const LAST_KEY = "almohands.scannerStatus.v1";

export function recordScannerStatus(
  reason: ScannerReason,
  context?: Record<string, unknown>,
): ScannerStatus {
  const status: ScannerStatus = {
    reason,
    label: reasonLabel(reason),
    detail: reasonDetail(reason),
    ts: new Date().toISOString(),
    context,
  };
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(LAST_KEY, JSON.stringify(status));
    }
  } catch { /* ignore quota */ }
  return status;
}

export function readLastScannerStatus(): ScannerStatus | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(LAST_KEY);
    return raw ? (JSON.parse(raw) as ScannerStatus) : null;
  } catch { return null; }
}
