import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Store, Receipt, Database, Cloud, Printer, Download, Upload, CheckCircle2, AlertCircle } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/errors";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "الإعدادات — المهندس" }] }),
  component: SettingsPage,
});


type StoreInfo = {
  name: string;
  phone: string;
  address: string;
  taxNumber: string;
  currency: string;
};

type InvoiceTemplate = {
  header: string;
  footer: string;
  showLogo: boolean;
  showTax: boolean;
  showQr: boolean;
};

type PrintSettings = {
  size: "A4" | "A5" | "80mm" | "58mm";
  copies: number;
  autoPrint: boolean;
};

const STORE_KEY = "engineer:store-info";
const INVOICE_KEY = "engineer:invoice-template";
const PRINT_KEY = "engineer:print-settings";

const defaultStore: StoreInfo = { name: "المهندس لقطع غيار السيارات", phone: "", address: "", taxNumber: "", currency: "جنية سوداني" };
const defaultInvoice: InvoiceTemplate = { header: "", footer: "شكراً لتعاملكم معنا", showLogo: true, showTax: false, showQr: true };
const defaultPrint: PrintSettings = { size: "80mm", copies: 1, autoPrint: false };

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

function SettingsPage() {
  const [store, setStore] = useState<StoreInfo>(defaultStore);
  const [invoice, setInvoice] = useState<InvoiceTemplate>(defaultInvoice);
  const [print, setPrint] = useState<PrintSettings>(defaultPrint);
  const [email, setEmail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setStore(load(STORE_KEY, defaultStore));
    setInvoice(load(INVOICE_KEY, defaultInvoice));
    setPrint(load(PRINT_KEY, defaultPrint));
    let alive = true;
    supabase.auth.getUser()
      .then(({ data }) => { if (alive) setEmail(data.user?.email ?? null); })
      .catch(() => { if (alive) setEmail(null); });
    return () => { alive = false; };
  }, []);

  function safeSetLocalStorage(key: string, value: unknown, successMsg: string, errorMsg: string) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      toast.success(successMsg);
    } catch (err) {
      // localStorage can throw QuotaExceededError or SecurityError (private mode)
      console.error(err);
      toast.error(getErrorMessage(err, errorMsg));
    }
  }

  function saveStore() {
    safeSetLocalStorage(STORE_KEY, store, "تم حفظ بيانات المحل", "تعذّر الحفظ");
  }
  function saveInvoice() {
    safeSetLocalStorage(INVOICE_KEY, invoice, "تم حفظ شكل الفاتورة", "تعذّر الحفظ");
  }
  function savePrint() {
    safeSetLocalStorage(PRINT_KEY, print, "تم حفظ إعدادات الطباعة", "تعذّر الحفظ");
  }

  async function backupNow() {
    setBusy(true);
    try {
      const [products, invoices, items] = await Promise.all([
        supabase.from("products").select("*"),
        supabase.from("invoices").select("*"),
        supabase.from("invoice_items").select("*"),
      ]);
      if (products.error) throw products.error;
      if (invoices.error) throw invoices.error;
      if (items.error) throw items.error;

      const payload = {
        exportedAt: new Date().toISOString(),
        version: 1,
        store,
        invoice,
        print,
        data: {
          products: products.data ?? [],
          invoices: invoices.data ?? [],
          invoice_items: items.data ?? [],
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
    store: z.object({
      name: z.string(), phone: z.string(), address: z.string(),
      taxNumber: z.string(), currency: z.string(),
    }).partial().optional(),
    invoice: z.object({
      header: z.string(), footer: z.string(),
      showLogo: z.boolean(), showTax: z.boolean(), showQr: z.boolean(),
    }).partial().optional(),
    print: z.object({
      size: z.enum(["A4", "A5", "80mm", "58mm"]),
      copies: z.number(), autoPrint: z.boolean(),
    }).partial().optional(),
  }).passthrough();

  function importBackup(file: File) {
    const MAX_SIZE = 50 * 1024 * 1024; // 50 MB
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
    reader.onload = () => {
      try {
        const raw = String(reader.result ?? "");
        if (!raw.trim()) throw new Error("empty");
        const parsed = JSON.parse(raw);
        const validated = backupSchema.safeParse(parsed);
        if (!validated.success) {
          toast.error("بنية النسخة الاحتياطية غير صحيحة");
          return;
        }
        const d = validated.data;
        if (d.store) { localStorage.setItem(STORE_KEY, JSON.stringify(d.store)); setStore({ ...defaultStore, ...d.store }); }
        if (d.invoice) { localStorage.setItem(INVOICE_KEY, JSON.stringify(d.invoice)); setInvoice({ ...defaultInvoice, ...d.invoice }); }
        if (d.print) { localStorage.setItem(PRINT_KEY, JSON.stringify(d.print)); setPrint({ ...defaultPrint, ...d.print }); }
        toast.success("تم استيراد الإعدادات من النسخة الاحتياطية");
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


  return (
    <AppShell title="الإعدادات" showBack>
      <div className="space-y-4">
        <Section icon={Store} title="بيانات المحل">
          <Field label="اسم المحل">
            <input className="input" value={store.name} onChange={(e) => setStore({ ...store, name: e.target.value })} />
          </Field>
          <Field label="رقم الهاتف">
            <input className="input" value={store.phone} onChange={(e) => setStore({ ...store, phone: e.target.value })} />
          </Field>
          <Field label="العنوان">
            <input className="input" value={store.address} onChange={(e) => setStore({ ...store, address: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="الرقم الضريبي">
              <input className="input" value={store.taxNumber} onChange={(e) => setStore({ ...store, taxNumber: e.target.value })} />
            </Field>
            <Field label="العملة">
              <input className="input" value={store.currency} onChange={(e) => setStore({ ...store, currency: e.target.value })} />
            </Field>
          </div>
          <button onClick={saveStore} className="btn-primary">حفظ بيانات المحل</button>
        </Section>

        <Section icon={Receipt} title="شكل الفاتورة">
          <Field label="ترويسة الفاتورة">
            <textarea className="input min-h-16" value={invoice.header} onChange={(e) => setInvoice({ ...invoice, header: e.target.value })} placeholder="نص يظهر أعلى الفاتورة" />
          </Field>
          <Field label="تذييل الفاتورة">
            <textarea className="input min-h-16" value={invoice.footer} onChange={(e) => setInvoice({ ...invoice, footer: e.target.value })} />
          </Field>
          <Toggle label="عرض الشعار" checked={invoice.showLogo} onChange={(v) => setInvoice({ ...invoice, showLogo: v })} />
          <Toggle label="عرض الضريبة" checked={invoice.showTax} onChange={(v) => setInvoice({ ...invoice, showTax: v })} />
          <Toggle label="عرض QR Code" checked={invoice.showQr} onChange={(v) => setInvoice({ ...invoice, showQr: v })} />
          <button onClick={saveInvoice} className="btn-primary">حفظ شكل الفاتورة</button>
        </Section>

        <Section icon={Printer} title="الطباعة">
          <Field label="حجم الورق">
            <select className="input" value={print.size} onChange={(e) => setPrint({ ...print, size: e.target.value as PrintSettings["size"] })}>
              <option value="A4">A4</option>
              <option value="A5">A5</option>
              <option value="80mm">حرارية 80mm</option>
              <option value="58mm">حرارية 58mm</option>
            </select>
          </Field>
          <Field label="عدد النسخ">
            <input type="number" min={1} max={5} className="input" value={print.copies} onChange={(e) => setPrint({ ...print, copies: Math.max(1, Number(e.target.value)) })} />
          </Field>
          <Toggle label="طباعة تلقائية بعد البيع" checked={print.autoPrint} onChange={(v) => setPrint({ ...print, autoPrint: v })} />
          <button onClick={savePrint} className="btn-primary">حفظ إعدادات الطباعة</button>
        </Section>

        <Section icon={Cloud} title="المزامنة السحابية">
          <div className="flex items-center gap-2 text-sm">
            {email ? (
              <>
                <CheckCircle2 className="size-4 text-emerald-600" />
                <span>متصل كـ <strong>{email}</strong> — المزامنة فعّالة لحظياً</span>
              </>
            ) : (
              <>
                <AlertCircle className="size-4 text-amber-600" />
                <span>غير متصل — سجّل دخول لتفعيل المزامنة</span>
              </>
            )}
          </div>
          <p className="text-xs text-muted-foreground">يتم حفظ المنتجات والفواتير في قاعدة بيانات سحابية آمنة مع تحديث فوري عبر جميع أجهزتك.</p>
        </Section>

        <Section icon={Database} title="النسخ الاحتياطي">
          <p className="text-xs text-muted-foreground">صدّر نسخة كاملة من بياناتك (منتجات، فواتير، إعدادات) كملف JSON يمكن استيراده لاحقاً.</p>
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

        <p className="text-center text-[11px] text-muted-foreground py-2">المهندس — إصدار 1.0</p>
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
