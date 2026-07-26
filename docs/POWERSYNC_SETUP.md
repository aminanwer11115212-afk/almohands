# إعداد PowerSync للعمل مع Supabase

هذه الوثيقة تشرح خطوات ربط تطبيقك مع خدمة **PowerSync Cloud** لتفعيل وضع العمل بدون إنترنت (Offline-First).

> ✅ **تم بالفعل من طرف Lovable:** إنشاء مستخدم قاعدة البيانات `powersync_role`، وضبط جميع الجداول للنسخ الكامل (REPLICA IDENTITY FULL)، وإنشاء الـ PUBLICATION باسم `powersync`.
>
> يبقى عليك فقط 4 خطوات في لوحة PowerSync ⬇️

---

## 1) إنشاء حساب PowerSync Cloud

1. ادخل إلى [https://www.powersync.com](https://www.powersync.com) واختر **Sign up**.
2. أنشئ **Project** جديد باسم مثلاً `almohands-offline`.
3. اختر أقرب Region لك (Frankfurt أو Bahrain).

---

## 2) ربط قاعدة بيانات Supabase

في لوحة PowerSync، افتح: **Manage instance → Edit instance → Connections → Add connection**.

اختر **PostgreSQL** والصق القيم التالية:

| الحقل | القيمة |
|-------|--------|
| **Type** | Supabase (Postgres) |
| **Host** | `db.fdxnhnxqmaabmsngnyko.supabase.co` |
| **Port** | `5432` |
| **Database** | `postgres` |
| **Username** | `powersync_role` |
| **Password** | *(محفوظة في Lovable باسم `POWERSYNC_DB_PASSWORD` — انسخها من: Cloud → Secrets)* |
| **SSL Mode** | `verify-full` |
| **Publication name** | `powersync` |

اضغط **Test connection** ثم **Save**.

---

## 3) إعداد المصادقة (JWKS)

لكي يتعرف PowerSync على مستخدمي التطبيق:

1. في نفس الشاشة، افتح تبويب **Client Auth**.
2. اختر **Use Supabase JWT auth**.
3. الصق:
   - **JWKS URL**:
     ```
     https://fdxnhnxqmaabmsngnyko.supabase.co/auth/v1/.well-known/jwks.json
     ```
   - **Audience**: `authenticated`

---

## 4) رفع قواعد المزامنة

افتح تبويب **Sync Rules** والصق محتوى الملف `powersync/sync-rules.yaml` الموجود في المشروع، ثم اضغط **Deploy**.

هذه القواعد تُزامن **بيانات المتجر بالكامل** لكل مستخدم مسجّل دخول (مناسب لعدد مستخدمين قليل: مدير + كاشير).

---

## 5) بعد الإطلاق

من صفحة **Dashboard** في PowerSync، انسخ:

- **PowerSync URL** (يبدأ بـ `https://xxxxx.powersync.journeyapps.com`)

واحفظه كسر باسم `POWERSYNC_URL` (Cloud → Secrets في Lovable).

> ✅ **المرحلة 2 مكتملة في الكود:** بمجرد ضبط `POWERSYNC_URL` يتحول التطبيق
> تلقائياً إلى الوضع المحلي-أولاً: كل القراءات والكتابات تتم على قاعدة SQLite
> في المتصفح (تعمل أوف لاين بالكامل)، والمزامنة مع Supabase تجري في الخلفية
> عند توفر الإنترنت. بدون هذا السر يعمل التطبيق بالوضع العادي (اتصال مباشر).

### كيف يعمل الوضع المحلي-أولاً

- أول تشغيل **أونلاين** بعد تسجيل الدخول: تُنزَّل بيانات المتجر كاملة إلى
  المتصفح (OPFS). قبل اكتمال أول مزامنة يقرأ التطبيق من الخادم مباشرة.
- بعد أول مزامنة: القراءة/الكتابة محلية دائماً، والتغييرات تُرفع تلقائياً؛
  راقبها من صفحة «التعديلات المعلّقة أوفلاين» أو شارة المزامنة في الهيدر.
- تسجيل الخروج لا يمسح البيانات المحلية (ليتمكن نفس المستخدم من الدخول
  والعمل أوف لاين). تُمسح فقط عند دخول مستخدم مختلف على نفس الجهاز.
- تسجيل الدخول نفسه يحتاج إنترنت لأول مرة على كل جهاز؛ بعدها تبقى الجلسة
  صالحة أوف لاين.
- تُستثنى من العمل أوف لاين: إدارة المستخدمين (تتطلب واجهة admin على
  الخادم) وقائمة أسماء المستخدمين في التقارير (تتدهور بهدوء لعرض المعرّفات).

---

## استكشاف الأخطاء

- **"Publication not found"** → تأكد من كتابة `powersync` تماماً بحروف صغيرة.
- **"Permission denied for table X"** → أعِد تشغيل خطوة GRANT عبر Lovable (أخبرنا وسنعيد الترحيل).
- **"WAL level is not logical"** → مشاريع Supabase الجديدة تأتي مفعّلة افتراضياً. إن ظهر الخطأ راسل دعم Supabase لتفعيلها.
