# تقرير التدقيق — Albatool

تاريخ: 2026-07-09

## 1. البنية التحتية الموجودة (منجز مسبقاً)

| المكوّن | الملف | الحالة |
|---|---|---|
| معالجة أخطاء موحدة | `src/lib/errors.ts` | ✅ `handleError`, `tryAsync`, `getErrorMessage` مع تغطية Zod/PostgREST/Network/Auth |
| Logger + Request ID | `src/lib/logger.ts` | ✅ |
| Error Boundary | `src/components/ErrorBoundary.tsx` + `__root.tsx` | ✅ مربوط في الجذر |
| SSR Error Capture | `src/lib/error-capture.ts` + `error-page.ts` | ✅ |
| Zod Schemas مشتركة | `src/lib/schemas.ts` | ✅ (email/phone/password/nonEmpty) |
| تقارير Lovable | `src/lib/lovable-error-reporting.ts` | ✅ |

**النتيجة:** المرحلتان 2 و3 من الخطة **منجزتان جزئياً**؛ المتبقي هو تطبيق منهجي لكل mutation/handler + توسيع schemas لكل كيان.

## 2. الملفات الأكبر من 400 سطر (مرشحة لإعادة الهيكلة)

| الملف | الأسطر | الأولوية |
|---|---:|---|
| `invoices.$invoiceId.tsx` | 1197 | عالية |
| `reports.tsx` | 991 | متوسطة |
| `cashier.tsx` | 854 | عالية |
| `import.tsx` | 761 | متوسطة |
| `export.tsx` | 588 | متوسطة |
| `customers.$customerId.tsx` | 496 | منخفضة |
| `prices.tsx` | 495 | منخفضة |
| `products.index.tsx` | 491 | عالية |
| `purchases.tsx` | 478 | متوسطة |

## 3. العيوب المرصودة (Bug Backlog)

| # | العيب | الأثر | الحل المقترح |
|---|---|---|---|
| B1 | تصدير PDF لا يطبّق `dir="rtl"` على `<html>`/`<table>` | عناوين الأعمدة معكوسة | تعديل `pdf-html-export.ts` |
| B2 | CSV/XLSX: BOM غير موحد | نص عربي مشوّه على Windows Excel | فرض BOM + `charset=utf-8` |
| B3 | Double-submit ممكن في صفحات الإنشاء بلا `savingRef` | فواتير مكررة | تطبيق نمط `savingRef` |
| B4 | مفاتيح React Query غير مركزية | invalidation ناقص | `src/lib/queryKeys.ts` |
| B5 | الاستيراد يفشل كلياً على صف فاسد | فقدان بيانات | معالجة صف-صف + تقرير |
| B6 | حذف بدون audit trail على `customers/products/suppliers` | صعوبة التتبع | trigger على DB |
| B7 | حقول numeric تقبل نصاً | حسابات خاطئة | Zod `coerce.number()` |
| B8 | `console.log` غير محمي في الإنتاج | تسرّب بيانات | تقييد بـ `import.meta.env.DEV` |
| B9 | مراجعة سياسات RLS بصريحة `auth.uid()` | صلاحيات واسعة | مراجعة لكل جدول public |
| B10 | UNIQUE(user_id, invoice_number) — تأكيد وجوده | تكرار أرقام | migration تحقق |

## 4. الفجوات التطبيقية

- بعض `catch` لا تستدعي `handleError` (تحتاج grep وتوحيد).
- بعض `useMutation` بلا `onError`.
- بعض النماذج تحفظ بدون `safeParse` قبل الإرسال.
- بعض الجداول الكبيرة (Products/Invoices) بدون pagination افتراضي في UI.

## 5. الخطوات التالية الفورية

1. تطبيق `handleError` على كل `catch` متبقي (Phase 2 finish).
2. توسيع `schemas.ts` لتشمل: `customer`, `product`, `supplier`, `invoice`, `invoiceItem`, `purchase`, `payment` (Phase 3).
3. البدء بإصلاحات Bug B1 → B10 بالترتيب (Phase 4).
4. إعادة هيكلة `invoices.$invoiceId.tsx` (1197 سطر) أولاً وفق `albatool-safe-refactor` (Phase 5).
