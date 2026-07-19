
# المرحلة 2: SQLite في المتصفح + مؤشر المزامنة + إصلاح تمرير الفواتير

## 1) مؤشر حالة الاتصال والمزامنة (Sync Status Indicator)

مكوّن جديد `src/components/SyncStatusBadge.tsx` يظهر في الشريط العلوي (AppShell) بجانب اسم المستخدم، ويعرض إحدى 4 حالات:

| الحالة | اللون | الأيقونة | النص |
|--------|-------|----------|------|
| متصل ومتزامن | أخضر | `Wifi` + `Check` | "متصل" |
| يزامن الآن | أزرق (نبض) | `RefreshCw` دوّار | "جارٍ المزامنة… (N)" حيث N = عدد العمليات في الطابور |
| أوفلاين، طابور معلّق | برتقالي | `WifiOff` | "بدون إنترنت — N عملية في الانتظار" |
| أوفلاين، لا شيء معلّق | رمادي | `WifiOff` | "بدون إنترنت" |

بالضغط عليه تظهر نافذة (Popover) تعرض:
- آخر مزامنة ناجحة (وقت نسبي: "منذ 5 دقائق").
- عدد التعديلات المعلّقة مفصّلة (3 فواتير، 2 مدفوعات…).
- زر "مزامنة الآن" يجبر PowerSync على flush.

قبل تفعيل PowerSync (يعمل الآن fallback): يستخدم `navigator.onLine` + حدثَي `online`/`offline`. بعد المرحلة 2 يقرأ `usePowerSyncStatus()` مباشرة.

## 2) إصلاح تمرير شاشة الفواتير على الهاتف

المشكلة: صفحة `/invoices` وصفحة تفاصيل الفاتورة `/invoices/$invoiceId` بها جداول عريضة تتجاوز عرض الشاشة على الهاتف بدون scroll أفقي واضح، والجدول يقصّ محتواه.

الإصلاح:
- لفّ الجداول في `<div className="overflow-x-auto -mx-2 px-2">` حتى يعمل التمرير الأفقي على الهاتف.
- ضبط ارتفاع الحاوية بحيث لا يتجاوز `100dvh` مع تمرير عمودي داخلي (يمنع تكسّر الشاشة على iOS Safari).
- تصغير padding خلايا الجدول على الشاشات `< sm` (استخدام `p-1.5 sm:p-3`).
- شريط الأدوات (أزرار الطباعة/التصدير) يصير sticky أعلى الشاشة `sticky top-0 z-10 bg-background` حتى يبقى ظاهراً أثناء التمرير.
- **لا تغييرات على منطق الفاتورة أو الطباعة** — فقط CSS/layout.

## 3) تهيئة PowerSync في الفرونت إند

### 3.1 السرّ المطلوب
أطلب منك عبر نموذج آمن قيمة `POWERSYNC_URL` (الرابط الذي يبدأ بـ `https://xxxxx.powersync.journeyapps.com` من لوحة PowerSync).

### 3.2 المكتبات
```
bun add @powersync/web @powersync/react @journeyapps/wa-sqlite
```

### 3.3 ملفات جديدة
- `src/lib/powersync/schema.ts` — يعرّف مخطط SQLite المحلي (20 جدول) مطابق لـ Supabase.
- `src/lib/powersync/connector.ts` — `BackendConnector` بدالتَي:
  - `fetchCredentials()`: يقرأ Supabase session ويرجع `endpoint` + `token`.
  - `uploadData(database)`: يأخذ عمليات الطابور ويرسلها لـ Supabase عبر `supabase.from(table).insert/update/delete()`.
- `src/lib/powersync/db.ts` — ينشئ instance واحد من `PowerSyncDatabase` مع `wa-sqlite`.
- `src/components/PowerSyncProvider.tsx` — يلف التطبيق بـ `<PowerSyncContext.Provider>` ويربط `connect(connector)` عند تسجيل الدخول و`disconnect()` عند تسجيل الخروج.

### 3.4 التكامل
- إضافة `<PowerSyncProvider>` داخل `src/routes/__root.tsx` (بعد `QueryClientProvider`، قبل `<Outlet />`).
- في هذه المرحلة **لا نحوّل أي صفحة** لاستخدام `usePowerSyncQuery` — تبقى كل الصفحات تقرأ من Supabase مباشرة كما هي، وPowerSync يعمل بصمت في الخلفية يبني الكاش المحلي. هذا يضمن عدم كسر أي ميزة.
- المؤشر من القسم 1 يبدأ يعرض بيانات حقيقية من PowerSync بمجرد الاتصال.

### 3.5 اعتبارات SSR
`@powersync/web` و`wa-sqlite` مكتبات متصفح فقط. سيتم تحميلهما ديناميكياً عبر `React.lazy` + `<ClientOnly>` لتفادي كسر SSR في TanStack Start.

## المراحل القادمة (لن تُنفّذ الآن)
- **المرحلة 3:** تحويل صفحة `/pos` من `supabase.from('products')` إلى `usePowerSyncQuery('SELECT * FROM products')` — لاختبار الأداء أوفلاين قبل التعميم.
- **المرحلة 4:** تعميم على باقي الصفحات + معالجة تعارضات (conflict resolution) عند تعديل نفس الفاتورة من جهازين.

## القسم التقني
- بعد تركيب المكتبات: التحقق من عدم كسر البناء عبر SSR (احتمال: `wa-sqlite.wasm` يحتاج نسخه إلى `public/`).
- `BackendConnector.uploadData` يجب أن يعالج فشل الشبكة بـ `throw` حتى يعيد PowerSync المحاولة تلقائياً (لا يمسح العمليات من الطابور).
- عند `SIGNED_OUT` نستدعي `powersync.disconnectAndClear()` لمسح البيانات المحلية.
- المؤشر يستخدم `useStatus()` من `@powersync/react` بدلاً من polling.
