# خطة التنفيذ — 5 مهام موزعة على Sub-Agents

## المهام المطلوبة

1. **زر رجوع موحد** في كل الصفحات → للصفحة السابقة (وليس دائماً للرئيسية).
2. **رقم القطعة / موقع الرف** (`part_number` / `shelf_location`) للمنتجات — يظهر في الطباعة/PDF/التصدير والبحث.
3. **Scan باركود بالكاميرا** في صفحة الكاشير → يفتح الكاميرا، يقرأ الباركود، يضيف المنتج تلقائياً لسلة البيع.
4. **أزرار +/- للكمية** في الكاشير بدل كتابة الرقم.
5. **إصلاح أزرار المعاينة (WhatsApp / PDF)** في نافذة معاينة الفاتورة.

---

## التقسيم على Sub-Agents (متوازي حيث لا تعارض)

### Agent A — Back Button (UI فقط)
- تعديل `src/components/AppShell.tsx`: تغيير سلوك `showBack` من `<Link to="/">` إلى `router.history.back()` مع fallback للرئيسية.
- تدقيق كل صفحات `src/routes/*.tsx` لتفعيل `showBack` حيث لا تكون الصفحة رئيسية.

### Agent B — Part Number / Shelf Location (Schema + UI)
- **Migration**: إضافة عمودَي `part_number TEXT` و`shelf_location TEXT` على `products` (+ index على `part_number`).
- **UI**: 
  - نموذج إضافة/تعديل المنتج (`products.new.tsx`, `products.$productId.tsx`) — حقلا إدخال.
  - قائمة المنتجات — إظهار `رقم القطعة` و`الرف` كأعمدة/شارات.
  - البحث في `use-products.ts` — تضمين `part_number` و`shelf_location` في `.or(...)`.
  - التصدير (`export.tsx`) والاستيراد (`import.tsx`) — إضافتهما إلى `SCHEMA_ORDER.products` و`COL_LABEL`.
  - قوالب طباعة الفاتورة (`invoices.$invoiceId.tsx` قسم PDF/print) وطباعة قوائم المنتجات.

### Agent C — Camera Barcode Scanner (كاشير فقط)
- تثبيت `@zxing/browser` (أو `html5-qrcode`).
- مكوّن جديد `src/components/BarcodeScannerDialog.tsx`: يفتح كاميرا خلفية، يبث نتيجة الباركود.
- في `src/routes/cashier.tsx`: زر 📷 بجانب حقل الباركود؛ عند القراءة الناجحة يبحث المنتج بـ`barcode` ويضيفه للسلة كما لو كتبه المستخدم.

### Agent D — Quantity +/- Stepper (كاشير فقط)
- في `src/routes/cashier.tsx`: استبدال حقل الكمية النصي بمكوّن `QtyStepper` (زر −، عرض الرقم، زر +) مع اختصار طويل للضغط المستمر. الاحتفاظ بإمكانية الكتابة اليدوية اختيارياً.

### Agent E — إصلاح PDF/WhatsApp في معاينة الفاتورة
- فحص `src/components/InvoiceActionsModal.tsx` + `src/routes/invoices.$invoiceId.tsx` + `src/lib/invoice-share.ts`.
- التأكد من:
  - `elementToPdfBlob` يحصل على `HTMLElement` صالح (ref مهيأ قبل الضغط).
  - `openWhatsAppShare` يعمل على desktop (يفتح wa.me في تبويب جديد) وعلى mobile (Web Share).
  - إظهار toast خطأ واضح عند الفشل بدل الصمت.
- إضافة `part_number`/`shelf_location` إلى قالب PDF (تنسيق مع Agent B).

---

## الترتيب الزمني

```text
Wave 1 (بالتوازي):  A + B(migration+schema) + C(install+dialog) + D + E(fix)
Wave 2:              B(UI + export/import + print)  ← يعتمد على أن الـ migration تمّت
Wave 3:              مراجعة سريعة + build check
```

## ملاحظات تقنية

- Migration `products` سيتطلب تحديث `SCHEMA_ORDER` و`COL_LABEL` في كل من import/export لضمان ثبات ترتيب الأعمدة.
- مكتبة الباركود (`@zxing/browser`) صغيرة وتعمل بـ`getUserMedia`؛ تحتاج HTTPS (المعاينة والنشر على HTTPS بالفعل).
- زر الرجوع سيستخدم `window.history.length > 1` كشرط قبل `back()`، وإلا يوجّه للرئيسية.
- لن أعدّل ملفات auto-gen ولا الـ triggers.

## المخرجات المتوقعة للمستخدم

- زر رجوع يعمل في كل صفحة داخلية.
- كل منتج له رقم قطعة + موقع رف، يظهر في القوائم والطباعة والـ PDF.
- زر كاميرا في الكاشير يقرأ الباركود ويضيف المنتج مباشرة.
- أزرار +/- سريعة لضبط الكمية.
- زرا PDF وWhatsApp في نافذة الفاتورة يعملان بشكل صحيح.

هل أبدأ التنفيذ بهذا الترتيب؟
