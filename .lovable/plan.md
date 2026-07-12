# خطة إعادة الهيكلة والتحسين الشاملة

## نظرة عامة

بناءً على تقرير التدقيق في `docs/audit-report.md`، هذه خطة من **6 مراحل متتابعة** لإصلاح كل العيوب المرصودة (B1→B10)، تقوية معالجة الأخطاء، وتقسيم الملفات الضخمة (>400 سطر) دون كسر السلوك.

**المبادئ:**
- خطوة صغيرة → build → تحقق → التالي.
- صفر تغيير في السلوك أثناء إعادة الهيكلة.
- كل `catch` يمر عبر `handleError`، كل `mutation` لها `onError`، كل نموذج يمر عبر `Zod`.

---

## المرحلة 1 — توحيد معالجة الأخطاء (Error Handling Sweep)

**الهدف:** كل `try/catch` وكل `useMutation` في المشروع يستخدم البنية الموحدة الموجودة في `src/lib/errors.ts`.

- إضافة hook `useSafeMutation` يلفّ `useMutation` ويطبّق `handleError` + `logger` + toast تلقائياً.
- سحب كل `catch (e) { console.error(...) }` واستبدالها بـ `handleError(e, { scope, action })`.
- تقييد كل `console.log` بـ `if (import.meta.env.DEV)` (B8).
- إضافة `ErrorBoundary` فرعي حول كل Route ثقيل (Invoices, Reports, Cashier).

**الملفات المتأثرة:** ~40 ملف — تعديلات صغيرة متكررة.

## المرحلة 2 — Zod Schemas الكاملة (Validation Layer)

توسيع `src/lib/schemas.ts` ليغطي كل الكيانات:

- `customerSchema`, `supplierSchema`, `productSchema` (مع `coerce.number()` لكل حقل رقمي — يحل B7).
- `invoiceSchema`, `invoiceItemSchema`, `purchaseSchema`, `paymentSchema`.
- كل نموذج (form) يستدعي `schema.safeParse(data)` قبل الحفظ، وأخطاء الحقول تظهر inline.

## المرحلة 3 — إصلاح العيوب المرصودة (Bug Fixes B1→B10)

| # | العيب | الإصلاح |
|---|---|---|
| B1 | PDF بدون `dir="rtl"` | تعديل `pdf-html-export.ts` — إضافة `<html dir="rtl" lang="ar">` وتنسيق الجداول RTL |
| B2 | BOM CSV غير موحد | مُصدِّر مركزي `csv-export.ts` يضيف `\uFEFF` ويصرّح `charset=utf-8` |
| B3 | Double-submit | تطبيق `savingRef` + `disabled={saving}` في كل صفحات الإنشاء (Invoice/Purchase/Quote/Customer/Product) |
| B4 | مفاتيح Query متفرقة | `src/lib/queryKeys.ts` مركزي (`qk.customers.list`, `qk.invoices.byId(id)` …) واستبدال كل المفاتيح النصية |
| B5 | فشل الاستيراد على صف واحد | معالجة صف-صف مع تجميع الأخطاء في تقرير نهائي بدل إسقاط الدفعة |
| B6 | لا Audit Trail على الحذف | trigger موحد `log_row_delete()` على `customers/products/suppliers` يكتب في `audit_logs` |
| B7 | حقول رقمية تقبل نصاً | يُحل عبر Zod `coerce.number().nonnegative()` (المرحلة 2) |
| B8 | `console.log` في الإنتاج | تقييد بـ `import.meta.env.DEV` (المرحلة 1) |
| B9 | مراجعة RLS | فحص كل جدول `public.*` والتأكد أن السياسات تستخدم `has_role(auth.uid(), …)` وليس عمود صف |
| B10 | تكرار `invoice_number` | migration يضيف `UNIQUE(user_id, invoice_number)` إن لم يوجد |

كل عيب: شرح المشكلة → الحل المطبّق → التحقق (build/اختبار).

## المرحلة 4 — إعادة هيكلة الملفات الضخمة

وفق منهجية `albatool-safe-refactor` (خطوة واحدة، حفظ الأسماء، صفر تغيير سلوكي):

1. `invoices.$invoiceId.tsx` (1206) → hooks: `useInvoiceHeader`, `useInvoiceItems`, `useInvoiceActions` + components: `InvoiceHeaderBar`, `InvoiceItemsTable`, `InvoiceTotalsPanel`, `InvoiceToolbar`.
2. `reports.tsx` (991) → `ReportsFilters`, `ReportsSummaryCards`, `ReportsCashierBlock`, `ReportsExportBar`.
3. `cashier.tsx` (901) → `useCashierCart`, `useCashierScanner`, `CashierProductGrid`, `CashierCartPanel`, `CashierPaymentDialog`.
4. `import.tsx` (765) → `useImportParser`, `useImportDryRun`, `ImportMappingStep`, `ImportProgressPanel`.
5. `export.tsx` (588) → `useExportJob` + `ExportOptionsForm` + `ExportHistoryTable`.

الهدف: كل صفحة رئيسية <400 سطر.

## المرحلة 5 — الأداء والتخزين المؤقت

- Pagination افتراضي في UI للجداول الكبيرة (Products/Invoices/Customers) مع `keepPreviousData`.
- توحيد `staleTime` لكل قسم في `queryKeys.ts`.
- `React.lazy` للصفحات الثقيلة (Reports, Import, Export).
- فهرسة DB: تأكيد `INDEX (user_id, created_at DESC)` على `invoices`, `purchases`, `notifications`, `audit_logs`.

## المرحلة 6 — الاختبارات والتوثيق

- اختبارات Vitest للـ helpers الحرجة: `errors.ts`, `csv-export.ts`, `pdf-html-export.ts`, `queryKeys.ts`.
- اختبار تكامل Playwright: تدفق كامل (بيع → إلغاء → إشعار مدير).
- تحديث `docs/audit-report.md` بالنتائج النهائية + `docs/error-handling-guide.md` للمطورين.

---

## الجدول التنفيذي

| المرحلة | الحجم التقريبي | المخرج |
|---|---|---|
| 1 — Error Sweep | ~40 ملف | صفر `catch` بدون `handleError` |
| 2 — Zod | ~10 ملفات | كل نموذج مُتحقّق منه |
| 3 — Bug Fixes | 10 إصلاحات | B1→B10 مغلقة |
| 4 — Refactor | 5 صفحات كبيرة | كل صفحة <400 سطر |
| 5 — الأداء | ~15 ملف | تحميل أسرع + فهارس DB |
| 6 — Tests/Docs | مجموعة اختبارات + دليلان | تغطية للمسارات الحرجة |

## تفاصيل تقنية

- **لا مساس بـ:** `src/integrations/supabase/*` (auto-gen)، `.env`، `supabase/config.toml`.
- **الأمان:** كل migration جديد يشمل `GRANT` + `ENABLE RLS` + سياسات `has_role`.
- **التحقق:** بعد كل خطوة → build harness + قراءة الملف المُعدَّل + `wc -l` قبل/بعد.
- **الترتيب:** المراحل متتابعة؛ لا تبدأ المرحلة التالية قبل إغلاق الحالية.

## البداية المقترحة

أبدأ فوراً بالمرحلة 1: إنشاء `useSafeMutation` + كنس أول 10 ملفات (Invoices, Cashier, Products). أوافيك بعد كل مرحلة بملخص قصير قبل الانتقال للتالية.
