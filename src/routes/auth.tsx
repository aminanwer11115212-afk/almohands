import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Loader2, LogIn, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getErrorMessage } from "@/lib/errors";
import { toast } from "sonner";
import logo from "@/assets/logo.png";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "تسجيل الدخول — المهندس" }] }),
  validateSearch: z.object({ next: z.string().optional() }),
  component: AuthPage,
});

function safeNext(next: string | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/";
  return next;
}

const emailSchema = z.string().trim().min(1, "البريد الإلكتروني مطلوب").email("صيغة البريد الإلكتروني غير صحيحة").max(255, "البريد طويل جداً");
const passwordSchema = z.string().min(6, "كلمة المرور 6 أحرف على الأقل").max(72, "كلمة المرور طويلة جداً");
const nameSchema = z.string().trim().min(1, "الاسم مطلوب").max(100, "الاسم طويل جداً");

const signInSchema = z.object({ email: emailSchema, password: passwordSchema });
const signUpSchema = z.object({ email: emailSchema, password: passwordSchema, fullName: nameSchema });

function AuthPage() {
  const search = Route.useSearch();
  const nextPath = safeNext(search.next);

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession()
      .then(({ data }) => {
        if (alive && data.session) window.location.assign(nextPath);
      })
      .catch((err) => console.error("Session check failed:", err));
    return () => { alive = false; };
  }, [nextPath]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);

    // Client-side validation
    const parsed =
      mode === "signin"
        ? signInSchema.safeParse({ email, password })
        : signUpSchema.safeParse({ email, password, fullName });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "بيانات غير صحيحة");
      return;
    }

    setLoading(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({
          email: parsed.data.email,
          password: parsed.data.password,
        });
        if (error) throw error;
        window.location.assign(nextPath);
      } else {
        const data = parsed.data as z.infer<typeof signUpSchema>;
        const { error } = await supabase.auth.signUp({
          email: data.email,
          password: data.password,
          options: {
            emailRedirectTo: `${window.location.origin}${nextPath}`,
            data: { full_name: data.fullName },
          },
        });
        if (error) throw error;
        toast.success("تم إنشاء الحساب بنجاح");
        setInfo("تم إنشاء الحساب. يمكنك تسجيل الدخول الآن.");
        setMode("signin");
      }
    } catch (err) {
      const msg = getErrorMessage(err, "تعذّر إتمام العملية");
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }




  return (
    <div className="min-h-dvh bg-background grid place-items-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center text-center mb-6">
          <img src={logo} alt="شعار المهندس" width={80} height={80} className="size-20 object-contain" />
          <h1 className="mt-2 text-2xl font-extrabold text-brand">المهندس</h1>
          <p className="text-xs text-muted-foreground">نظام إدارة قطع غيار السيارات</p>
        </div>

        <div className="rounded-2xl bg-card border border-border shadow-card p-5">
          <div className="grid grid-cols-2 gap-2 mb-5 rounded-xl bg-muted p-1">
            <button
              type="button"
              onClick={() => setMode("signin")}
              className={`h-9 rounded-lg text-sm font-bold transition ${mode === "signin" ? "bg-card text-brand shadow-sm" : "text-muted-foreground"}`}
            >
              دخول
            </button>
            <button
              type="button"
              onClick={() => setMode("signup")}
              className={`h-9 rounded-lg text-sm font-bold transition ${mode === "signup" ? "bg-card text-brand shadow-sm" : "text-muted-foreground"}`}
            >
              حساب جديد
            </button>
          </div>

          <form onSubmit={onSubmit} className="space-y-3">
            {mode === "signup" && (
              <Field label="الاسم">
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  className="input-base"
                  placeholder="اسمك الكامل"
                />
              </Field>
            )}
            <Field label="البريد الإلكتروني">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                dir="ltr"
                className="input-base text-left"
                placeholder="name@example.com"
              />
            </Field>
            <Field label="كلمة المرور">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                dir="ltr"
                className="input-base text-left"
                placeholder="••••••••"
              />
            </Field>

            {error && <p className="text-xs text-destructive text-center">{error}</p>}
            {info && <p className="text-xs text-brand text-center">{info}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full h-12 rounded-xl bg-brand text-brand-foreground font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {loading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : mode === "signin" ? (
                <>
                  <LogIn className="size-4" /> تسجيل الدخول
                </>
              ) : (
                <>
                  <UserPlus className="size-4" /> إنشاء الحساب
                </>
              )}
            </button>
          </form>
        </div>
      </div>

      <style>{`
        .input-base {
          width: 100%;
          height: 2.75rem;
          border-radius: 0.75rem;
          border: 1px solid var(--border);
          background: var(--card);
          color: var(--foreground);
          padding: 0 0.75rem;
          font-size: 0.875rem;
          outline: none;
        }
        .input-base:focus-visible { border-color: var(--brand); box-shadow: 0 0 0 2px color-mix(in oklab, var(--brand) 30%, transparent); }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs text-muted-foreground mb-1 text-end">{label}</span>
      {children}
    </label>
  );
}

function translateError(msg: string): string {
  if (/invalid login/i.test(msg)) return "بريد إلكتروني أو كلمة مرور غير صحيحة";
  if (/already registered|already exists/i.test(msg)) return "هذا البريد مسجّل مسبقاً";
  if (/password/i.test(msg)) return "كلمة المرور قصيرة جداً (6 أحرف على الأقل)";
  return msg;
}
