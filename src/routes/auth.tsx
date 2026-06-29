import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, LogIn, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import logo from "@/assets/logo.png";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "تسجيل الدخول — المهندس" }] }),
  component: AuthPage,
});

type Mode = "signin" | "signup";

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/" });
    });
  }, [navigate]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/" });
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/`,
            data: { full_name: fullName },
          },
        });
        if (error) throw error;
        setInfo("تم إنشاء الحساب. يمكنك تسجيل الدخول الآن.");
        setMode("signin");
      }
    } catch (err) {
      const msg = (err as Error).message || "حدث خطأ";
      setError(translateError(msg));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background grid place-items-center px-4">
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
          border: 1px solid hsl(var(--border));
          background: hsl(var(--card));
          padding: 0 0.75rem;
          font-size: 0.875rem;
          outline: none;
        }
        .input-base:focus { border-color: hsl(var(--brand, 200 90% 30%)); }
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
