import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Download } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useRequirePermission } from "@/hooks/use-require-permission";

export const Route = createFileRoute("/import")({
  head: () => ({ meta: [{ title: "استيراد إكسل — المهندس" }] }),
  component: ImportPage,
});

function ImportPage() {
  const { isChecking: __permChk, allowed: __permOk } = useRequirePermission("import_export");
  if (__permChk || !__permOk) return null;
  const [open, setOpen] = useState(false);

  return (
    <AppShell title="اضافة المنتجات من ملف اكسيل" showBack>
      <section className="rounded-2xl bg-card shadow-card border border-border p-5">
        <h2 className="text-base font-extrabold text-end">خطوة 1: تنزيل الملف الفارغ</h2>
        <p className="mt-2 text-sm text-muted-foreground text-end leading-relaxed">
          قم بالضغط على زر تنزيل ليتم تنزيل ملف اكسيل فارغ كنموذج يمكنك مليء البيانات به
        </p>
        <button
          onClick={() => setOpen((v) => !v)}
          className="mt-3 text-xs font-bold text-brand"
        >
          ملحوظة ▾
        </button>
        {open ? (
          <p className="mt-1 text-xs text-muted-foreground bg-muted rounded-lg p-3 text-end">
            تأكد من عدم تغيير أسماء الأعمدة في الملف وإلا قد تفشل عملية الاستيراد.
          </p>
        ) : null}
        <div className="mt-4 flex justify-center">
          <button className="px-10 py-2.5 rounded-xl border-2 border-brand/30 text-brand font-bold hover:bg-brand/5 transition">
            تنزيل
          </button>
        </div>
      </section>

      <hr className="my-6 border-border" />

      <section className="rounded-2xl bg-card shadow-card border border-border p-5">
        <h2 className="text-base font-extrabold text-end">خطوة 2: حفظ الملف فى ذاكرة الهاتف</h2>
        <p className="mt-2 text-sm text-muted-foreground text-end leading-relaxed">
          بعد ما قمت بمليء البيانات وحفظ الملف قم بنقل ملف الاكسيل فى اى مكان تعرفه فى ذاكرة الهاتف ثم اضغط على زر (اختيار ملف الاكسيل) وبعدها سيتم فتح ذاكرة الهاتف لتختار ملف الاكسيل الذى قمت بحفظه
        </p>
        <div className="mt-5 flex justify-center">
          <button className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-brand text-brand-foreground font-bold shadow-card hover:opacity-95 transition">
            <Download className="size-4" />
            اختيار ملف الاكسيل
          </button>
        </div>
      </section>
    </AppShell>
  );
}
