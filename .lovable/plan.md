
# المرحلة 1: تهيئة قاعدة البيانات لـ PowerSync

هذه المرحلة تُجهّز Supabase فقط لاستقبال محرك PowerSync. لا تغييرات على واجهة التطبيق في هذه المرحلة — التطبيق سيستمر بالعمل كما هو، والمزامنة المحلية (SQLite في المتصفح) ستُبنى في مرحلة لاحقة.

## ما سيتم تنفيذه

### 1) تفعيل Logical Replication
تعديل مستوى الـ WAL إلى `logical` حتى يستطيع PowerSync قراءة سجل التعديلات الحية.

### 2) إنشاء دور Postgres مخصص لـ PowerSync
- اسم الدور: `powersync_role`
- صلاحيات: قراءة فقط (`SELECT`) على كل جداول `public` + صلاحية `REPLICATION`.
- كلمة مرور قوية تُولَّد وتُحفظ كسر (`POWERSYNC_DB_PASSWORD`) عبر `generate_secret`.

### 3) إنشاء PUBLICATION لكل الجداول العشرين
```
CREATE PUBLICATION powersync FOR TABLE
  products, customers, invoices, invoice_items, payments,
  purchases, purchase_items, suppliers, price_history,
  expenses, payment_methods, returns,
  special_orders, special_order_history,
  notifications, audit_logs, import_logs, export_logs,
  user_roles, store_profile;
```

### 4) التأكد من `REPLICA IDENTITY FULL`
مطلوب لكل جدول ليستطيع PowerSync معرفة الصف كاملاً عند UPDATE/DELETE (وإلا يفشل مع الجداول التي بها كولومنات nullable في المفتاح).

### 5) وثيقة إعداد لوحة PowerSync
ملف `docs/POWERSYNC_SETUP.md` يشرح للمستخدم:
- كيف يفتح حساب PowerSync Cloud.
- أين يلصق `Connection URI` (سنعطيه القالب مع اسم الدور).
- كيف يلصق `JWKS URL` من Supabase (نُخرج له الرابط الجاهز).
- قاعدة مزامنة `sync-rules.yaml` جاهزة تُزامن كل بيانات المتجر بالكامل لكل مستخدم مسجل دخول:

```yaml
bucket_definitions:
  store_data:
    data:
      - SELECT * FROM products
      - SELECT * FROM customers
      - SELECT * FROM invoices
      # ... باقي الجداول العشرين
```

> ملاحظة: اخترت "بيانات المتجر كاملاً" — يعني كل مستخدم مسجل يحمّل كل الصفوف. هذا مناسب لعدد مستخدمين قليل (مدير + كاشير)، لكن حجم الفواتير سينمو مع الوقت وقد يصل حجم قاعدة البيانات المحلية إلى مئات الميجابايت خلال سنة. سنراقب هذا في المرحلة 2 وقد نضطر لتقييد نطاق الفواتير القديمة.

## ما سيُطلب منك يدوياً بعد الترحيل
1. الدخول على [powersync.com](https://powersync.com) وإنشاء مشروع.
2. لصق بيانات الاتصال (سنعطيك القيم الصحيحة بعد نجاح الترحيل).
3. رفع ملف `sync-rules.yaml` الذي سنولّده.
4. إعطاؤنا `POWERSYNC_URL` الناتج، لنحفظه كسرّ ونستخدمه في المرحلة 2.

## المراحل القادمة (للعلم فقط، لن تُنفّذ الآن)
- **المرحلة 2:** تركيب مكتبات `@powersync/web` + `wa-sqlite`، إعداد `PowerSyncProvider`، وكتابة `BackendConnector` لرفع التعديلات الأوفلاين إلى Supabase.
- **المرحلة 3:** تحويل صفحات القراءة تدريجياً من `supabase.from()` إلى `usePowerSyncQuery()` (نبدأ بصفحة الكاشير `/pos` لأنها الأكثر استخداماً).
- **المرحلة 4:** مؤشر حالة الاتصال + طابور التعديلات المعلّقة في الواجهة.

## القسم التقني
- الترحيلات (migrations) هي فقط: `ALTER SYSTEM SET wal_level = logical` عبر `ALTER ROLE` (لأن `ALTER DATABASE postgres` محظور)، `CREATE ROLE powersync_role`، منح `SELECT` و`REPLICATION`، `CREATE PUBLICATION`، و`ALTER TABLE ... REPLICA IDENTITY FULL`.
- لا تغييرات على RLS الحالي — PowerSync يقرأ عبر دور replication منفصل يتجاوز RLS، والصلاحيات تُطبَّق في `sync-rules.yaml`.
- لا تعديلات على أي جدول أو تريجر موجود.
