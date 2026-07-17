import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Store, Receipt, Database, Cloud, Printer, Download, Upload, CheckCircle2, AlertCircle, Loader2, HardDrive, FolderOpen, FolderX } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { PermissionGate } from "@/components/PermissionGate";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/errors";
import { useStoreProfile, useSaveStoreProfile, type StoreProfile } from "@/hooks/use-store-profile";
import { runLocalBackup, readBackupHistory, type BackupEntry } from "@/lib/local-backup";
import {
  isFolderApiSupported,
  pickBackupFolder,
  getStoredBackupFolder,
  forgetBackupFolder,
  ensureFolderPermission,
} from "@/lib/backup-folder";


export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "الإعدادات — المهندس" }] }),
  component: SettingsPageGuarded,
});

type FormState = {
  name: string;
  phone: string;
  address: string;
  tax_number: string;
  currency: string;
  invoice_header: string;
  invoice_footer: string;
  show_logo: boolean;
  show_tax: boolean;
  show_qr: boolean;
  print_size: "A4" | "A5" | "80mm" | "58mm";
  print_copies: number;
  auto_print: boolean;
};

const defaults: FormState = {
  name: "المهندس لقطع غيار السيارات",
  phone: "",
  address: "",
  tax_number: "",
  currency: "جنية سوداني",
  invoice_header: "",
  invoice_footer: "شكراً لتعاملكم معنا",
  show_logo: true,
  show_tax: false,
  show_qr: true,
  print_size: "80mm",
  print_copies: 1,
  auto_print: false,
};

function fromProfile(p: StoreProfile | null | undefined): FormState {
  if (!p) return defaults;
  return {
    name: p.name,
    phone: p.phone,
    address: p.address,
    tax_number: p.tax_number,
    currency: p.currency,
    invoice_header: p.invoice_header,
    invoice_footer: p.invoice_footer,
    show_logo: p.show_logo,
    show_tax: p.show_tax,
    show_qr: p.show_qr,
    print_size: (p.print_size as FormState["print_size"]) ?? "80mm",
    print_copies: p.print_copies,
    auto_print: p.auto_print,
  };
}

function SettingsPageGuarded() {
  return (
    <PermissionGate perm="settings.write">
      <SettingsPage />
    </PermissionGate>
  );
}

function SettingsPage() {
  const { data: profile, isLoading } = useStoreProfile();
  const saveMut = useSaveStoreProfile();
  const [form, setForm] = useState<FormState>(defaults);
  const [email, setEmail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setForm(fromProfile(profile));
  }, [profile]);

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (alive) setEmail(data.session?.user?.email ?? null);
    });
    return () => { alive = false; };
  }, []);

  async function save() {
    try {
      await saveMut.mutateAsync(form);
      toast.success("تم حفظ الإعدادات");
    } catch (err) {
      toast.error(getErrorMessage(err, "تعذّر الحفظ"));
    }
  }

  async function backupNow() {
    setBusy(true);
    try {
      const [products, invoices, items, methods, storeRes] = await Promise.all([
        supabase.from("products").select("*"),
        supabase.from("invoices").select("*"),
        supabase.from("invoice_items").select("*"),
        supabase.from("payment_methods").select("*"),
        supabase.from("store_profile").select("*").maybeSingle(),
      ]);
      if (products.error) throw products.error;
      if (invoices.error) throw invoices.error;
      if (items.error) throw items.error;
      if (methods.error) throw methods.error;

      const payload = {
        exportedAt: new Date().toISOString(),
        version: 2,
        store_profile: storeRes.data ?? null,
        data: {
          products: products.data ?? [],
          invoices: invoices.data ?? [],
          invoice_items: items.data ?? [],
          payment_methods: methods.data ?? [],
        },
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      try {
        const a = document.createElement("a");
        a.href = url;
        a.download = `engineer-backup-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
      } finally {
        URL.revokeObjectURL(url);
      }
      toast.success("تم إنشاء النسخة الاحتياطية");
    } catch (err) {
      console.error(err);
      toast.error(getErrorMessage(err, "تعذر إنشاء النسخة الاحتياطية"));
    } finally {
      setBusy(false);
    }
  }

  const backupSchema = z.object({
    store_profile: z.record(z.string(), z.unknown()).nullable().optional(),
  }).passthrough();

  function importBackup(file: File) {
    const MAX_SIZE = 50 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      toast.error("حجم الملف كبير جداً (الحد الأقصى 50 ميغابايت)");
      return;
    }
    if (!/\.json$/i.test(file.name) && file.type !== "application/json") {
      toast.error("يُقبل فقط ملف JSON");
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => toast.error("تعذّر قراءة الملف");
    reader.onload = async () => {
      try {
        const raw = String(reader.result ?? "");
        if (!raw.trim()) throw new Error("empty");
        const parsed = JSON.parse(raw);
        const validated = backupSchema.safeParse(parsed);
        if (!validated.success) {
          toast.error("بنية النسخة الاحتياطية غير صحيحة");
          return;
        }
        const sp = validated.data.store_profile as Partial<StoreProfile> | null | undefined;
        if (sp && typeof sp === "object") {
          const merged = fromProfile({ ...defaults, ...sp } as StoreProfile);
          setForm(merged);
          await saveMut.mutateAsync(merged);
          toast.success("تم استيراد إعدادات المحل");
        } else {
          toast.info("لا توجد إعدادات محل في النسخة الاحتياطية");
        }
      } catch (err) {
        console.error(err);
        toast.error(getErrorMessage(err, "ملف نسخة احتياطية غير صالح"));
      }
    };
    try {
      reader.readAsText(file);
    } catch (err) {
      toast.error(getErrorMessage(err, "تعذّر قراءة الملف"));
    }
  }

  if (isLoading) {
    return (
      <AppShell title="الإعدادات" showBack>
        <div className="py-12 text-center text-sm text-muted-foreground">جارٍ التحميل…</div>
      </AppShell>
    );
  }

  return (
    <AppShell title="الإعدادات" showBack>
      <div className="space-y-4">
        <Section icon={Store} title="بيانات المحل">
          <Field label="اسم المحل">
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={120} />
          </Field>
          <Field label="رقم الهاتف">
            <input className="input" dir="ltr" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} maxLength={30} />
          </Field>
          <Field label="العنوان">
            <input className="input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} maxLength={200} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="الرقم الضريبي">
              <input className="input" value={form.tax_number} onChange={(e) => setForm({ ...form, tax_number: e.target.value })} maxLength={40} />
            </Field>
            <Field label="العملة">
              <input className="input" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} maxLength={30} />
            </Field>
          </div>
        </Section>

        <Section icon={Receipt} title="شكل الفاتورة">
          <Field label="ترويسة الفاتورة">
            <textarea className="input min-h-16" value={form.invoice_header} onChange={(e) => setForm({ ...form, invoice_header: e.target.value })} maxLength={300} placeholder="نص يظهر أعلى الفاتورة" />
          </Field>
          <Field label="تذييل الفاتورة">
            <textarea className="input min-h-16" value={form.invoice_footer} onChange={(e) => setForm({ ...form, invoice_footer: e.target.value })} maxLength={300} />
          </Field>
          <Toggle label="عرض الشعار" checked={form.show_logo} onChange={(v) => setForm({ ...form, show_logo: v })} />
          <Toggle label="عرض الضريبة" checked={form.show_tax} onChange={(v) => setForm({ ...form, show_tax: v })} />
          <Toggle label="عرض QR Code" checked={form.show_qr} onChange={(v) => setForm({ ...form, show_qr: v })} />
        </Section>

        <Section icon={Printer} title="الطباعة">
          <Field label="حجم الورق">
            <select className="input" value={form.print_size} onChange={(e) => setForm({ ...form, print_size: e.target.value as FormState["print_size"] })}>
              <option value="A4">A4</option>
              <option value="A5">A5</option>
              <option value="80mm">حرارية 80mm</option>
              <option value="58mm">حرارية 58mm</option>
            </select>
          </Field>
          <Field label="عدد النسخ">
            <input type="number" min={1} max={5} className="input" value={form.print_copies} onChange={(e) => setForm({ ...form, print_copies: Math.max(1, Math.min(5, Number(e.target.value) || 1)) })} />
          </Field>
          <Toggle label="طباعة تلقائية بعد البيع" checked={form.auto_print} onChange={(v) => setForm({ ...form, auto_print: v })} />
        </Section>

        <button onClick={save} disabled={saveMut.isPending} className="btn-primary inline-flex items-center justify-center gap-2 w-full">
          {saveMut.isPending && <Loader2 className="size-4 animate-spin" />}
          حفظ جميع الإعدادات
        </button>

        <Section icon={Cloud} title="المزامنة السحابية">
          <div className="flex items-center gap-2 text-sm">
            {email ? (
              <>
                <CheckCircle2 className="size-4 text-emerald-600" />
                <span>متصل كـ <strong>{email}</strong> — الإعدادات محفوظة سحابياً</span>
              </>
            ) : (
              <>
                <AlertCircle className="size-4 text-amber-600" />
                <span>غير متصل — سجّل دخول لتفعيل المزامنة</span>
              </>
            )}
          </div>
          <p className="text-xs text-muted-foreground">تُحفظ بيانات المحل والإعدادات في قاعدة بيانات سحابية آمنة وتتزامن عبر جميع أجهزتك.</p>
        </Section>

        <Section icon={Database} title="النسخ الاحتياطي">
          <p className="text-xs text-muted-foreground">صدّر نسخة كاملة من بياناتك (منتجات، فواتير، طرق دفع، إعدادات المحل) كملف JSON.</p>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={backupNow} disabled={busy} className="btn-primary inline-flex items-center justify-center gap-2">
              <Download className="size-4" /> تنزيل نسخة
            </button>
            <label className="btn-secondary inline-flex items-center justify-center gap-2 cursor-pointer">
              <Upload className="size-4" /> استيراد نسخة
              <input type="file" accept="application/json" className="hidden" onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importBackup(f);
                e.currentTarget.value = "";
              }} />
            </label>
          </div>
        </Section>

        <LocalBackupSection />


        <p className="text-center text-[11px] text-muted-foreground py-2">المهندس — إصدار 1.1</p>
      </div>

      <style>{`
        .input { width: 100%; height: 2.5rem; border-radius: 0.5rem; border: 1px solid var(--input); background: var(--background); color: var(--foreground); padding: 0 0.75rem; font-size: 0.875rem; outline: none; }
        .input:focus-visible { box-shadow: 0 0 0 2px var(--ring); border-color: var(--ring); }
        textarea.input { padding: 0.5rem 0.75rem; height: auto; }
        .btn-primary { width: 100%; height: 2.5rem; border-radius: 0.5rem; background: var(--primary); color: var(--primary-foreground); font-weight: 600; font-size: 0.875rem; }
        .btn-primary:hover { opacity: 0.9; }
        .btn-primary:disabled { opacity: 0.5; }
        .btn-secondary { height: 2.5rem; border-radius: 0.5rem; background: var(--secondary); color: var(--foreground); font-weight: 600; font-size: 0.875rem; border: 1px solid var(--border); }
      `}</style>
    </AppShell>
  );
}

function Section({ icon: Icon, title, children }: { icon: React.ComponentType<{ className?: string }>; title: string; children: React.ReactNode }) {
  return (
    <section className="bg-card rounded-xl border border-border shadow-sm p-4 space-y-3">
      <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
        <Icon className="size-4 text-primary" />
        {title}
      </h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between text-sm py-1 cursor-pointer">
      <span>{label}</span>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative w-11 h-6 rounded-full transition ${checked ? "bg-primary" : "bg-muted"}`}
        aria-pressed={checked}
      >
        <span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${checked ? "right-0.5" : "right-[1.375rem]"}`} />
      </button>
    </label>
  );
}

function LocalBackupSection() {
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<BackupEntry[]>(() => readBackupHistory());

  function refresh() { setHistory(readBackupHistory()); }

  async function runNow() {
    setBusy(true);
    try {
      await runLocalBackup("manual");
      toast.success("تم حفظ النسخة المحلية في مجلد التنزيلات");
    } catch (err) {
      toast.error(getErrorMessage(err, "تعذّر إنشاء النسخة المحلية"));
    } finally {
      setBusy(false);
      refresh();
    }
  }

  const recent = history.slice().reverse().slice(0, 10);
  return (
    <section className="bg-card rounded-xl border border-border shadow-sm p-4 space-y-3">
      <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
        <HardDrive className="size-4 text-primary" />
        النسخ الاحتياطي المحلي التلقائي
      </h2>
      <p className="text-xs text-muted-foreground">
        يحفظ النظام نسخة محلية (JSON + Excel) في مجلد التنزيلات تلقائياً عند فتح التطبيق أول مرة يومياً وعند إغلاقه، ويحتفظ بسجل آخر 30 يوم.
      </p>
      <button onClick={runNow} disabled={busy} className="btn-primary inline-flex items-center justify-center gap-2">
        {busy ? <Loader2 className="size-4 animate-spin" /> : <HardDrive className="size-4" />}
        إنشاء نسخة الآن
      </button>
      {recent.length > 0 && (
        <div className="border border-border rounded-lg divide-y divide-border text-xs">
          {recent.map((e, i) => (
            <div key={i} className="flex items-center justify-between gap-2 p-2">
              <div className="flex items-center gap-2 min-w-0">
                {e.ok
                  ? <CheckCircle2 className="size-3.5 text-emerald-600 shrink-0" />
                  : <AlertCircle className="size-3.5 text-red-600 shrink-0" />}
                <span className="truncate">
                  {e.kind === "open" ? "بداية اليوم" : e.kind === "close" ? "نهاية الجلسة" : "يدوي"}
                  {" — "}
                  {new Date(e.ts).toLocaleString("ar")}
                </span>
              </div>
              <span className="text-muted-foreground shrink-0">
                {e.ok ? `${Math.round(e.bytes / 1024)} ك.ب` : "فشل"}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

