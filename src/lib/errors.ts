import { toast } from "sonner";
import { ZodError } from "zod";
import { logger, newRequestId } from "@/lib/logger";


/**
 * Extract a user-friendly Arabic error message from any thrown value.
 * Handles Zod, Supabase (PostgREST), network, and auth errors.
 */
export function getErrorMessage(err: unknown, fallback = "حدث خطأ غير متوقع"): string {
  if (!err) return fallback;

  // Zod validation errors — surface the first issue message.
  if (err instanceof ZodError) {
    const first = err.issues[0];
    if (first?.message) return first.message;
    return "بيانات غير صالحة — راجع الحقول المدخلة";
  }

  // Supabase / PostgREST style: { message, code, details, hint }
  const obj = (typeof err === "object" && err !== null ? err : {}) as Record<string, unknown>;
  const code = typeof obj.code === "string" ? obj.code : "";
  const details = typeof obj.details === "string" ? obj.details : "";
  const hint = typeof obj.hint === "string" ? obj.hint : "";

  const raw =
    typeof err === "string"
      ? err
      : err instanceof Error
        ? err.message
        : typeof obj.message === "string"
          ? obj.message
          : fallback;

  const msg = raw || fallback;
  const lower = (msg + " " + code + " " + details + " " + hint).toLowerCase();

  // Postgres codes (most reliable)
  if (code === "23505") return "هذه القيمة موجودة مسبقاً";
  if (code === "23503") return "لا يمكن تنفيذ العملية — يوجد سجلات مرتبطة";
  if (code === "23502") return "بعض الحقول المطلوبة فارغة";
  if (code === "23514") return "قيمة غير صالحة في أحد الحقول";
  if (code === "42501" || code === "PGRST301") return "لا تملك صلاحية تنفيذ هذه العملية";
  if (code === "PGRST116") return "لم يتم العثور على السجل المطلوب";

  // Network
  if (lower.includes("failed to fetch") || lower.includes("networkerror") || lower.includes("network request failed")) {
    return "تعذّر الاتصال بالخادم — تحقق من الإنترنت وحاول مجدداً";
  }
  if (lower.includes("timeout") || lower.includes("timed out")) return "انتهت مهلة الاتصال — حاول مجدداً";
  if (lower.includes("aborted")) return "تم إلغاء العملية";

  // Auth
  if (lower.includes("invalid login") || lower.includes("invalid credentials")) return "بريد إلكتروني أو كلمة مرور غير صحيحة";
  if (lower.includes("email not confirmed")) return "لم يتم تأكيد البريد الإلكتروني بعد";
  if (lower.includes("already registered") || lower.includes("already exists") || lower.includes("user already")) return "هذا البريد مسجّل مسبقاً";
  if (lower.includes("password") && (lower.includes("6") || lower.includes("short") || lower.includes("weak"))) return "كلمة المرور ضعيفة — استخدم 6 أحرف على الأقل";
  if (lower.includes("rate limit") || lower.includes("too many")) return "محاولات كثيرة — انتظر قليلاً ثم حاول مجدداً";
  if (lower.includes("jwt") || lower.includes("unauthorized") || lower.includes("not authenticated") || lower.includes("no authorization")) return "انتهت الجلسة — سجّل الدخول مجدداً";

  // Postgres text fallbacks
  if (lower.includes("duplicate key") || lower.includes("unique constraint")) return "هذه القيمة موجودة مسبقاً";
  if (lower.includes("foreign key")) return "لا يمكن تنفيذ العملية — يوجد سجلات مرتبطة";
  if (lower.includes("permission denied") || lower.includes("row-level security") || lower.includes("row level security")) return "لا تملك صلاحية تنفيذ هذه العملية";
  if (lower.includes("not null") || lower.includes("null value")) return "بعض الحقول المطلوبة فارغة";
  if (lower.includes("check constraint")) return "قيمة غير صالحة في أحد الحقول";

  return msg;
}

/**
 * Log the raw error, persist it with correlation context, and show a user-friendly toast.
 * Use in catch blocks: `handleError(e, "فشل الحفظ", { context: { invoiceId } })`.
 * Returns the resolved user-facing message string and a request id for support.
 */
export function handleError(
  err: unknown,
  fallback = "حدث خطأ غير متوقع",
  opts: {
    silent?: boolean;
    context?: Record<string, unknown>;
    event?: string;
    action?: { label: string; onClick: () => void };
  } = {},
): { message: string; requestId: string } {
  const message = getErrorMessage(err, fallback);
  const requestId = newRequestId("err");
  const rawMsg = err instanceof Error ? err.message : typeof err === "string" ? err : undefined;
  logger.error(opts.event ?? "app_error", {
    message: rawMsg ?? message,
    context: { ...opts.context, requestId, userMessage: message },
  });
  if (err instanceof Error) console.error(err);
  if (!opts.silent) {
    toast.error(message, {
      description: `رمز الخطأ: ${requestId}`,
      action: opts.action,
    });
  }
  return { message, requestId };
}

/**
 * Wrap an async operation with unified error handling.
 * Returns the resolved value or undefined on error (toast shown).
 */
export async function tryAsync<T>(
  fn: () => Promise<T>,
  fallback = "حدث خطأ غير متوقع",
  opts: { context?: Record<string, unknown>; event?: string } = {},
): Promise<T | undefined> {
  try {
    return await fn();
  } catch (e) {
    handleError(e, fallback, opts);
    return undefined;
  }
}


/**
 * Safely parse a numeric input. Clamps to [min, max]; returns fallback on invalid.
 */
export function parseNumber(value: string | number | null | undefined, opts: { min?: number; max?: number; fallback?: number } = {}): number {
  const { min, max, fallback = 0 } = opts;
  if (value === "" || value === null || value === undefined) return fallback;
  const n = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isFinite(n)) return fallback;
  if (min !== undefined && n < min) return min;
  if (max !== undefined && n > max) return max;
  return n;
}
