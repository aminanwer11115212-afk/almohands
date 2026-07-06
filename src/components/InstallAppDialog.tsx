import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Download, Share, Plus, MoreVertical, Smartphone, Monitor, CheckCircle2 } from "lucide-react";
import logo from "@/assets/logo.png";
import { toast } from "sonner";

type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

// Module-level cache so the event survives even if the dialog wasn't mounted yet
let cachedPrompt: BIPEvent | null = null;
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    cachedPrompt = e as BIPEvent;
  });
  window.addEventListener("appinstalled", () => {
    cachedPrompt = null;
  });
}

type Platform = "ios-safari" | "android" | "desktop" | "other";

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && (navigator as any).maxTouchPoints > 1);
  if (isIOS) return "ios-safari";
  if (/Android/i.test(ua)) return "android";
  if (/Windows|Macintosh|Linux/i.test(ua)) return "desktop";
  return "other";
}

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (window.navigator as any).standalone === true
  );
}

export function InstallAppDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [prompt, setPrompt] = useState<BIPEvent | null>(cachedPrompt);
  const [platform, setPlatform] = useState<Platform>("other");
  const [installed, setInstalled] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setPlatform(detectPlatform());
    setInstalled(isStandalone());
    const onBIP = (e: Event) => {
      e.preventDefault();
      cachedPrompt = e as BIPEvent;
      setPrompt(cachedPrompt);
    };
    const onInstalled = () => {
      cachedPrompt = null;
      setPrompt(null);
      setInstalled(true);
      toast.success("تم تثبيت التطبيق بنجاح");
    };
    window.addEventListener("beforeinstallprompt", onBIP);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBIP);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    setPrompt(cachedPrompt);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    closeRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  const handleInstall = async () => {
    if (!prompt) return;
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome === "accepted") {
        toast.success("جارٍ تثبيت التطبيق…");
      }
      cachedPrompt = null;
      setPrompt(null);
      onClose();
    } catch {
      toast.error("تعذّر بدء التثبيت");
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="install-title"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md bg-card text-foreground rounded-t-3xl sm:rounded-3xl shadow-elevated border border-border overflow-hidden max-h-[92dvh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative bg-brand-gradient text-brand-foreground p-5 pb-6">
          <button
            ref={closeRef}
            onClick={onClose}
            className="absolute top-3 left-3 grid size-9 place-items-center rounded-full bg-white/15 hover:bg-white/25 transition"
            aria-label="إغلاق"
          >
            <X className="size-5" />
          </button>
          <div className="flex items-center gap-3">
            <div className="grid size-14 place-items-center rounded-2xl bg-white/15 backdrop-blur">
              <img src={logo} alt="" className="size-10 object-contain" />
            </div>
            <div className="min-w-0">
              <h2 id="install-title" className="text-lg font-extrabold font-display">تثبيت المهندس</h2>
              <p className="text-xs opacity-85 mt-0.5">استخدم التطبيق كأنه أصلي على جهازك</p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto">
          {installed ? (
            <div className="text-center py-6">
              <CheckCircle2 className="size-12 text-emerald-500 mx-auto" />
              <p className="mt-3 text-sm font-bold">التطبيق مثبَّت بالفعل على جهازك</p>
              <p className="mt-1 text-xs text-muted-foreground">افتحه من أيقونة الشاشة الرئيسية.</p>
            </div>
          ) : (
            <>
              {/* Platform tabs */}
              <div className="grid grid-cols-3 gap-1.5 mb-4 p-1 rounded-xl bg-muted">
                <TabBtn active={platform === "ios-safari"} onClick={() => setPlatform("ios-safari")} icon={Smartphone} label="iPhone" />
                <TabBtn active={platform === "android"} onClick={() => setPlatform("android")} icon={Smartphone} label="Android" />
                <TabBtn active={platform === "desktop"} onClick={() => setPlatform("desktop")} icon={Monitor} label="كمبيوتر" />
              </div>

              {(platform === "android" || platform === "desktop") && prompt && (
                <button
                  onClick={handleInstall}
                  className="w-full bg-brand text-brand-foreground rounded-2xl py-3.5 font-bold text-sm flex items-center justify-center gap-2 hover:opacity-95 active:scale-[0.99] transition shadow-elevated"
                >
                  <Download className="size-4" />
                  تثبيت الآن
                </button>
              )}

              <div className="mt-4 space-y-3">
                {platform === "ios-safari" && (
                  <Steps
                    steps={[
                      { icon: Share, text: "افتح الموقع في Safari ثم اضغط زر «مشاركة»" },
                      { icon: Plus, text: "مرّر لأسفل واختر «إضافة إلى الشاشة الرئيسية»" },
                      { icon: CheckCircle2, text: "اضغط «إضافة» — سيظهر التطبيق مع أيقونته" },
                    ]}
                  />
                )}
                {platform === "android" && !prompt && (
                  <Steps
                    steps={[
                      { icon: MoreVertical, text: "افتح قائمة المتصفح (⋮) أعلى اليمين" },
                      { icon: Plus, text: "اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية»" },
                      { icon: CheckCircle2, text: "أكّد التثبيت — ستجد أيقونة التطبيق على جهازك" },
                    ]}
                  />
                )}
                {platform === "desktop" && !prompt && (
                  <Steps
                    steps={[
                      { icon: Download, text: "ابحث عن أيقونة التثبيت في شريط عنوان المتصفح" },
                      { icon: MoreVertical, text: "أو افتح قائمة المتصفح واختر «تثبيت المهندس…»" },
                      { icon: CheckCircle2, text: "سيفتح التطبيق في نافذة مستقلة" },
                    ]}
                  />
                )}
                {platform === "other" && (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    استخدم متصفحاً حديثاً (Chrome أو Edge أو Safari) لتثبيت التطبيق.
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function TabBtn({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold transition ${
        active ? "bg-card text-brand shadow-card" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      <Icon className="size-3.5" />
      {label}
    </button>
  );
}

function Steps({ steps }: { steps: { icon: React.ComponentType<{ className?: string }>; text: string }[] }) {
  return (
    <ol className="space-y-2.5">
      {steps.map((s, i) => (
        <li key={i} className="flex items-start gap-3 p-3 rounded-xl bg-muted/60 border border-border">
          <div className="grid size-8 place-items-center rounded-lg bg-brand/10 text-brand shrink-0">
            <s.icon className="size-4" />
          </div>
          <div className="flex-1 min-w-0 pt-1">
            <div className="text-xs font-bold text-muted-foreground mb-0.5">الخطوة {i + 1}</div>
            <p className="text-sm leading-relaxed">{s.text}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
