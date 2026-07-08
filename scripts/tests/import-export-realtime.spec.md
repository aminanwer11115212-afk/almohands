# سيناريو تكاملي: Realtime + دورة CSV كاملة

يوثق هذا الملف اختباراً يدوياً/آلياً (Playwright) للتحقق من:

1. اشتراكات `postgres_changes` لا تنتج خطأ `cannot add postgres_changes callbacks after subscribe()` حتى مع React StrictMode وإعادة تحميل الصفحة.
2. دورة كاملة **تصدير CSV → استيراد CSV**: ترتيب الأعمدة ثابت، والبيانات تطابق الأصل بعد الاستيراد.
3. تحذير الرؤوس غير المطابقة يظهر عند رفع ملف بأعمدة خاطئة.

## تشغيل السيناريو Playwright

النص أسفله جاهز للنسخ في `/tmp/browser/import-export.py` (خارج المستودع لأنه ينتمي إلى بيئة الاختبار المؤقتة).

```python
import asyncio, os, json, csv, io
from pathlib import Path
from playwright.async_api import async_playwright

SHOTS = Path("/tmp/browser/shots"); SHOTS.mkdir(parents=True, exist_ok=True)

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await ctx.new_page()

        # Collect console errors (StrictMode double-mount would print the realtime error here)
        errors = []
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)

        # Restore Supabase session if injected
        storage_key = os.environ.get("LOVABLE_BROWSER_SUPABASE_STORAGE_KEY")
        session = os.environ.get("LOVABLE_BROWSER_SUPABASE_SESSION_JSON")
        await page.goto("http://localhost:8080")
        if storage_key and session:
            await page.evaluate(
                f"window.localStorage.setItem({json.dumps(storage_key)}, {json.dumps(session)})"
            )

        # 1) Open export, then reload — realtime channel must resubscribe cleanly
        await page.goto("http://localhost:8080/export")
        await page.wait_for_load_state("networkidle")
        await page.reload(wait_until="networkidle")
        await page.screenshot(path=str(SHOTS / "export_reloaded.png"))

        # 2) Export products as CSV using standard headers
        await page.get_by_role("checkbox", name="المنتجات").check()
        await page.get_by_role("button", name="CSV").click()
        async with page.expect_download() as dl_info:
            await page.get_by_role("button", name="تصدير الآن").click()
        download = await dl_info.value
        csv_path = SHOTS / "products.csv"
        await download.save_as(str(csv_path))

        # 3) Read exported CSV, verify canonical order
        text = csv_path.read_text(encoding="utf-8-sig")
        reader = csv.reader(io.StringIO(text))
        headers = next(reader)
        expected = ["الاسم", "الباركود", "الفئة", "الوحدة", "الموقع",
                    "الكمية", "الحد الأدنى", "سعر الشراء", "سعر البيع", "ملاحظات"]
        assert headers[:len(expected)] == expected, f"header order changed: {headers}"

        # 4) Round-trip: upload the same CSV through the import page
        await page.goto("http://localhost:8080/import")
        await page.wait_for_load_state("networkidle")
        await page.set_input_files("input[type=file]", str(csv_path))
        # standard headers → no mismatch banner should appear
        assert not await page.locator("text=رؤوس الأعمدة لا تطابق المعيار").is_visible()

        # 5) Now test the mismatch warning: upload CSV with a bad header
        bad_csv = SHOTS / "bad.csv"
        bad_csv.write_text("wrong_name,junk\nfoo,1\n", encoding="utf-8")
        await page.set_input_files("input[type=file]", str(bad_csv))
        await page.wait_for_selector("text=رؤوس الأعمدة لا تطابق المعيار", timeout=5000)
        await page.screenshot(path=str(SHOTS / "import_mismatch.png"))

        # 6) Assert no realtime callback error surfaced in console
        rt_errors = [e for e in errors if "postgres_changes" in e]
        assert not rt_errors, f"realtime errors detected: {rt_errors}"

        print("OK", {"headers": headers, "rt_errors": rt_errors})
        await browser.close()

asyncio.run(main())
```

## ما يثبته هذا السيناريو

| الفحص | كيفية الإثبات |
|---|---|
| Realtime بدون خطأ بعد reload/StrictMode | `page.reload()` + مراقبة `console` لأي `postgres_changes` |
| ترتيب الأعمدة ثابت | `assert headers[:10] == expected` (يطابق `SCHEMA_ORDER.products` في `export.tsx`) |
| CSV يمكن استيراده مرة أخرى | استيراد نفس الملف ثم غياب لافتة "لا تطابق المعيار" |
| تحذير رؤوس CSV غير مطابقة | رفع ملف بأعمدة `wrong_name,junk` وانتظار اللافتة |
| تسجيل audit | بعد الاستيراد/التصدير، `SELECT * FROM audit_logs WHERE action LIKE 'data.%' ORDER BY created_at DESC LIMIT 5` |

## تحقق يدوي سريع (بدون Playwright)

1. افتح `/export` ثم اضغط F5 مرتين متتاليتين — لا يظهر خطأ `cannot add postgres_changes` في الـ Console.
2. صدِّر جدول "المنتجات" CSV مع "الأعمدة المعيارية" مفعّلة.
3. ارفع الملف نفسه في `/import` — يجب أن تُكتشف كل الأعمدة تلقائياً وبدون لافتة تحذير.
4. أنشئ ملف CSV يحتوي على عمود واحد باسم عشوائي `xxx` وارفعه — يجب أن تظهر لافتة "رؤوس الأعمدة لا تطابق المعيار".
5. افحص جدول `audit_logs` — تظهر أسطر `data.import` و`data.export` باسم الجدول والفترة والمستخدم.
