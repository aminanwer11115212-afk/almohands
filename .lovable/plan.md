# خطة إعادة هيكلة وتحسين نظام Albatool

هدف: تنظيف الكود، توحيد معالجة الأخطاء، إصلاح الأعطال المعروفة، وتحسين الأداء — بدون تغيير سلوك المستخدم النهائي أو تخطيط الشاشات.

---

## المرحلة 1 — تدقيق وتشخيص (Audit)

**الناتج:** تقرير مكتوب في `docs/audit-report.md` يحوي:
- قائمة الملفات الأكبر من 800 سطر (InvoiceCreatePage 2707، QuoteCreatePage 2338، ProductsPage 2317…).
- خريطة hooks/مكونات مكررة بين صفحات Create.
- كل نداء `supabase.from(...)` بدون معالجة أخطاء.
- كل `try` بدون `catch` واضح للمستخدم، وكل `.then` بدون `.catch`.
- كل `dangerouslySetInnerHTML`، كل input بدون validation.
- كل جدول عام بدون RLS/GRANT مكتمل.

لا تعديلات كود في هذه المرحلة — فحص فقط.

---

## المرحلة 2 — طبقة معالجة الأخطاء الموحدة

**الملفات الجديدة:**
- `src/lib/errors/AppError.ts` — نوع خطأ موحد (`code`, `messageAr`, `cause`).
- `src/lib/errors/handle.ts` — `handleError(err, ctx)` يحوّل أي خطأ (Supabase/Zod/Network) إلى رسالة عربية عبر `toast.error` ويسجل التفاصيل التقنية.
- `src/lib/errors/withTry.ts` — wrapper للـ mutations/handlers يضمن try/catch + toast.
- `src/components/ErrorBoundary.tsx` — حدود خطأ على مستوى الـ layout وكل route رئيسي.

**التطبيق:**
- ربط `ErrorBoundary` في `__root.tsx` و`_authenticated.tsx`.
- استبدال كل `catch (e) { console.error(e) }` بـ `handleError(e, {scope})`.
- في كل `useMutation`: إضافة `onError: handleError`.

---

## المرحلة 3 — طبقة Validation بـ Zod

- `src/lib/schemas/` — schema لكل كيان (customer, product, supplier, invoice, invoiceItem, purchase, payment).
- تطبيق `schema.safeParse` قبل كل حفظ في:
  - `customers.tsx`, `products.index.tsx`, `suppliers.tsx`
  - صفحات الإنشاء (Invoice/Quote/Purchase/StockReturn)
  - نماذج الاستيراد (import.tsx) — validate كل صف قبل الإدخال.
- حدود طول واضحة (name ≤ 100، phone regex، email، أرقام ≥ 0).

---

## المرحلة 4 — إصلاح العيوب المعروفة (Bug Fixes)

سيُوثَّق كل bug + الحل داخل commit منفصل. القائمة الأولية:

| # | العيب | السبب | الحل |
|---|---|---|---|
| 1 | تصدير PDF: الاتجاه RTL يعمل في نافذة الطباعة فقط لا في العناوين | القالب الحالي لا يطبق `dir="rtl"` على `<html>` والجدول | تحديث `pdf-html-export.ts` ليضع `dir="rtl"` + `text-align:right` على كل `th/td` |
| 2 | CSV/XLSX عربي مشوّه في بعض الأجهزة | نقص BOM في XLSX + عدم فرض `utf-8` في CSV headers | إضافة BOM موحد + تحديد `type: 'text/csv;charset=utf-8'` |
| 3 | Double-submit في صفحات الإنشاء عند النقر السريع | بعض الصفحات بلا `savingRef` guard | فرض النمط: `savingRef` + `disabled={saving}` + try/finally |
| 4 | فقدان `invalidateQueries` بعد حذف/تعديل في بعض الشاشات | مفاتيح queries غير موحدة | إنشاء `src/lib/queryKeys.ts` مركزي + invalidation شامل بعد كل mutation |
| 5 | استيراد المنتجات: صف واحد فاسد يوقف الدفعة كلها | لا يوجد isolation | معالجة على مستوى الصف مع تجميع الأخطاء وعرض تقرير |
| 6 | حذف بلا سجل تدقيق (audit) في بعض الجداول | trigger مفقود | إضافة migration: trigger على `customers/products/suppliers` يكتب في `audit_logs` |
| 7 | حقول numeric تقبل نصاً | لا تحقق نوع | Zod coerce.number().nonnegative() |
| 8 | تسريب بيانات في console.log | logs غير محمية | إزالة/تقييد بـ `if (import.meta.env.DEV)` |
| 9 | RLS: بعض الجداول لا تفلتر بـ `auth.uid()` بشكل صريح | سياسة ضعيفة | مراجعة سياسات كل جدول public |
| 10 | Race condition في `assign_invoice_number` عند حالات نادرة | يعتمد على advisory lock فقط | التأكد من وجود UNIQUE(user_id, invoice_number) |

كل bug يُصلَح مع شرح "المشكلة/الحل" في commit message.

---

## المرحلة 5 — إعادة هيكلة الملفات الكبيرة

وفق منهجية `albatool-safe-refactor` — خطوة واحدة لكل دورة، صفر تغيير سلوكي.

**الترتيب:**
1. `InvoiceCreatePage` (2707) → استخراج hooks: `useDocumentForm`, `useDocumentItems`, `useDocumentCustomer`, `useDocumentCurrency`, `useDocumentPayment`, `useDocumentSave`.
2. `QuoteCreatePage` (2338) → إعادة استخدام نفس hooks.
3. `ProductsPage` (2317) → استخراج `ProductsTable`, `ProductFormDialog`, `ProductFilters`.
4. `CustomersPage` (1824) → `CustomerTable`, `CustomerFormDialog`, `CustomerDetailsPanel`.
5. `StockReturnCreatePage`, `PurchaseCreatePage` → نفس الـ hooks.
6. `RecentItemsSidebar` (1210) → تقسيم لعناصر أصغر.

**قواعد:** لا تغيير أسماء state/handlers، لا تغيير JSX/tokens، خطوة واحدة = ملف واحد.

---

## المرحلة 6 — تحسين الأداء

- Pagination موحد للجداول الكبيرة (`useProducts`, `useCustomers`, `useInvoices`) عبر hook `usePagedQuery`.
- Virtualization (`@tanstack/react-virtual`) لجداول > 500 صف.
- Streaming export (منجز جزئياً) — إكماله لكل الجداول.
- Debounce لحقول البحث (300ms).
- Memoization للحسابات الثقيلة في `useDocumentItems` (calcTotal).
- تقليل re-renders عبر `select` في React Query.

---

## المرحلة 7 — التحقق والتوثيق

- إضافة `docs/architecture.md` يشرح الطبقات الجديدة.
- `docs/error-handling.md` — دليل استخدام `handleError`/`withTry`.
- Playwright smoke tests على المسارات الحرجة (إنشاء فاتورة، حذف عميل، استيراد، تصدير).
- تشغيل `supabase--linter` + `security--run_security_scan` وتصفير التنبيهات.

---

## تنفيذ

سأنفّذ مرحلة واحدة في كل رد، وأنتظر موافقتك قبل الانتقال للتالية. ابدأ بأي مرحلة تريد — أو قل "ابدأ من 1" وأنفّذ التسلسل.
