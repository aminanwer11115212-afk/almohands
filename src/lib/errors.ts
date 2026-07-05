/**
 * Extract a user-friendly error message from any thrown value.
 * Translates common Supabase/network errors into Arabic messages.
 */
export function getErrorMessage(err: unknown, fallback = "حدث خطأ غير متوقع"): string {
  if (!err) return fallback;
  const raw =
    typeof err === "string"
      ? err
      : err instanceof Error
        ? err.message
        : typeof err === "object" && err !== null && "message" in err
          ? String((err as { message: unknown }).message)
          : fallback;

  const msg = raw || fallback;
  const lower = msg.toLowerCase();

  // Network
  if (lower.includes("failed to fetch") || lower.includes("networkerror") || lower.includes("network request failed")) {
    return "تعذّر الاتصال بالخادم — تحقق من الإنترنت وحاول مجدداً";
  }
  if (lower.includes("timeout")) return "انتهت مهلة الاتصال — حاول مجدداً";

  // Auth
  if (lower.includes("invalid login") || lower.includes("invalid credentials")) return "بريد إلكتروني أو كلمة مرور غير صحيحة";
  if (lower.includes("email not confirmed")) return "لم يتم تأكيد البريد الإلكتروني بعد";
  if (lower.includes("already registered") || lower.includes("already exists") || lower.includes("user already")) return "هذا البريد مسجّل مسبقاً";
  if (lower.includes("password") && lower.includes("6")) return "كلمة المرور قصيرة جداً (6 أحرف على الأقل)";
  if (lower.includes("rate limit") || lower.includes("too many")) return "محاولات كثيرة — انتظر قليلاً ثم حاول مجدداً";
  if (lower.includes("jwt") || lower.includes("unauthorized") || lower.includes("not authenticated")) return "انتهت الجلسة — سجّل الدخول مجدداً";

  // Postgres / Supabase
  if (lower.includes("duplicate key") || lower.includes("unique constraint")) return "هذه القيمة موجودة مسبقاً";
  if (lower.includes("foreign key") || lower.includes("violates foreign key")) return "لا يمكن تنفيذ العملية — يوجد سجلات مرتبطة";
  if (lower.includes("permission denied") || lower.includes("row-level security") || lower.includes("rls")) return "لا تملك صلاحية تنفيذ هذه العملية";
  if (lower.includes("not null") || lower.includes("null value")) return "بعض الحقول المطلوبة فارغة";
  if (lower.includes("check constraint")) return "قيمة غير صالحة في أحد الحقول";

  return msg;
}

/**
 * Safely parse a numeric input from a string.
 * Returns fallback (default 0) if the value is empty, non-finite, or negative when not allowed.
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
