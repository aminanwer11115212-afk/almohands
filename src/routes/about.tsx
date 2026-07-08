import { createFileRoute } from "@tanstack/react-router";
import { Phone, MessageCircle, Code2, Package as PackageIcon, Video, Sparkles, Copy, Check } from "lucide-react";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import developerPhoto from "@/assets/developer.jpg";
import { toast } from "sonner";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "حول المطوّر — المهندس" },
      { name: "description", content: "تعرّف على أمين أنور أحمد، مهندس برمجيات ومنتج فيديوهات وصانع محتوى." },
    ],
  }),
  component: AboutDeveloperPage,
});

const PHONE_DISPLAY = "0910 374 333";
const PHONE_TEL = "+249910374333";
const PHONE_WA = "249910374333";

function AboutDeveloperPage() {
  const [copied, setCopied] = useState(false);

  const copyPhone = async () => {
    try {
      await navigator.clipboard.writeText(PHONE_DISPLAY);
      setCopied(true);
      toast.success("تم نسخ رقم التواصل");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("تعذّر نسخ الرقم");
    }
  };

  return (
    <AppShell title="حول المطوّر" subtitle="الشخص خلف تطوير نظام المهندس">
      <div className="max-w-3xl mx-auto">
        {/* Hero card */}
        <article className="relative overflow-hidden rounded-3xl bg-card border border-border shadow-elevated">
          {/* Photo — cinematic aspect */}
          <div className="relative aspect-[16/10] sm:aspect-[16/8] overflow-hidden bg-muted">
            <img
              src={developerPhoto}
              alt="أمين أنور أحمد"
              className="absolute inset-0 w-full h-full object-cover object-top"
              loading="eager"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-card via-card/40 to-transparent" />
            <div className="absolute bottom-0 inset-x-0 p-5 sm:p-7">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-brand/90 text-brand-foreground text-[10px] font-bold px-2.5 py-1 backdrop-blur">
                <Sparkles className="size-3" />
                مطوِّر النظام
              </div>
              <h1 className="mt-2 text-3xl sm:text-4xl font-black text-white font-display drop-shadow-lg">
                أمين أنور أحمد
              </h1>
              <p className="mt-1 text-sm sm:text-base text-white/90 font-semibold drop-shadow">
                مهندس برمجيات
              </p>
            </div>
          </div>

          {/* Body */}
          <div className="p-5 sm:p-7 space-y-6">
            {/* Roles */}
            <section aria-label="الأدوار المهنية" className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <RoleCard icon={Code2} title="مهندس برمجيات" hint="تطوير أنظمة ويب متكاملة" tone="brand" />
              <RoleCard icon={Video} title="منتج فيديوهات" hint="إنتاج ومونتاج محتوى مرئي" tone="amber" />
              <RoleCard icon={PackageIcon} title="صانع محتوى" hint="محتوى رقمي مميز" tone="rose" />
            </section>

            {/* About text */}
            <section aria-label="نبذة">
              <h2 className="text-sm font-bold text-muted-foreground mb-2">نبذة</h2>
              <p className="text-sm leading-relaxed text-foreground">
                أمين أنور أحمد — مهندس برمجيات شغوف بتصميم وبناء الأنظمة التي تسهّل أعمال الناس. يجمع
                بين الخبرة التقنية والإحساس البصري لصنع حلول عملية وجميلة، ويعمل أيضاً منتج فيديوهات
                وصانع محتوى رقمي.
              </p>
            </section>

            {/* Contact */}
            <section aria-label="التواصل" className="rounded-2xl border border-border bg-muted/40 p-4">
              <h2 className="text-sm font-bold mb-3 flex items-center gap-2">
                <Phone className="size-4 text-brand" />
                للتواصل
              </h2>
              <div className="flex items-center justify-between gap-3 rounded-xl bg-card border border-border px-4 py-3">
                <div className="min-w-0">
                  <div className="text-[11px] text-muted-foreground font-semibold">رقم الهاتف</div>
                  <div dir="ltr" className="text-lg font-black nums text-foreground mt-0.5">
                    {PHONE_DISPLAY}
                  </div>
                </div>
                <button
                  onClick={copyPhone}
                  className="grid size-10 place-items-center rounded-xl bg-brand/10 text-brand hover:bg-brand/20 transition"
                  aria-label="نسخ الرقم"
                >
                  {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2.5 mt-3">
                <a
                  href={`https://wa.me/${PHONE_WA}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 text-white py-3 font-bold text-sm hover:bg-emerald-700 active:scale-[0.98] transition shadow-elevated"
                >
                  <MessageCircle className="size-4" />
                  واتساب
                </a>
                <a
                  href={`tel:${PHONE_TEL}`}
                  className="flex items-center justify-center gap-2 rounded-xl bg-brand text-brand-foreground py-3 font-bold text-sm hover:opacity-95 active:scale-[0.98] transition shadow-elevated"
                >
                  <Phone className="size-4" />
                  اتصال
                </a>
              </div>
            </section>
          </div>
        </article>

        <p className="mt-6 text-center text-[11px] text-muted-foreground">
          © {new Date().getFullYear()} نظام المهندس — جميع الحقوق محفوظة
        </p>
      </div>
    </AppShell>
  );
}

function RoleCard({
  icon: Icon,
  title,
  hint,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  hint: string;
  tone: "brand" | "amber" | "rose";
}) {
  const toneCls =
    tone === "brand"
      ? "bg-brand/10 text-brand"
      : tone === "amber"
        ? "bg-amber-500/10 text-amber-600"
        : "bg-rose-500/10 text-rose-600";
  return (
    <div className="rounded-2xl border border-border bg-card p-4 text-center hover:shadow-card transition">
      <div className={`mx-auto grid size-11 place-items-center rounded-xl ${toneCls}`}>
        <Icon className="size-5" />
      </div>
      <div className="mt-2 text-sm font-bold text-foreground">{title}</div>
      <div className="text-[11px] text-muted-foreground mt-0.5">{hint}</div>
    </div>
  );
}
