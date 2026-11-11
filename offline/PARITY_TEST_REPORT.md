# گزارش آزمون — نسخه ۱.۳.۰ (جلسه اول)

**تاریخ:** ۱۴۰۵/۰۸/۲۲ · روش اجرای آفلاین: `file://` (دابل‌کلیک `Timing2-Offline.html`)

## ۱) آزمون‌های هسته (headless)

```
bun scripts/test-offline-core.js   →  128 passed / 0 failed
bun scripts/verify-session1.ts     →  59/59  (وب — §۱۰.۱/۱۰.۲/۱۰.۳)
bun scripts/verify-phase1-2.ts     →  102/0  (به‌روز به مدل جدید)
bun scripts/verify-phase3.ts       →  83/0
bun scripts/verify-phase4.ts       →  68/0   (به‌روز؛ B2 با تخصیص خط)
bun scripts/verify-phase5.ts       →  60/0
node --check offline/js/*.js       →  همه معتبر
npx tsc --noEmit                   →  بدون خطا
bun run lint                       →  ۰ خطا (۱ هشدار پیش‌ین datepicker)
```

سناریوهای جدید جلسه اول در هسته آفلاین (۴۳ assertion): ۱۵ قاعده ارث‌بری، رد مقادیر نامعتبر، محاسبات کامل (P=0.08، ST=108، +2.5→110.5، PER_CYCLE یک‌بار=140.5، روش۲=100/0.92+2.5، قاعده تجمیع)، مهاجرت fixture قدیمی (0.15 override → CUSTOM؛ تکرارپذیر؛ بدون دوبرابر؛ داده قدیمی حفظ؛ عنصر ارث می‌برد)، بسته v۲ + import.

## ۲) آزمون UI مرورگر — نسخه وب (localhost:3000)

| # | سناریو | نتیجه |
|---|---|---|
| ۱ | بارگذاری ساختار؛ درخت ۴ سطحی رندر | ✅ |
| ۲ | جست‌وجوی «چهار پیچ» → مسیر والد باز | ✅ |
| ۳ | chevron ایستگاه/فعالیت مستقل از کلیک | ✅ |
| ۴ | انتخاب ایستگاه → پنل + «الونس‌ها و زمان‌های مجاز» با جدول | ✅ |
| ۵ | سه زبانه «مجازها و الونس‌ها» | ✅ |
| ۶ | جایگزینی مقدار ۳۰۰→۴۲۰ از منوی عملیات | ✅ (۴۲۰٫۰۰ ثانیه) |
| ۷ | دیالوگ عنصر (درخت) با الونس‌های resolve | ✅ |
| ۸ | صفحه فعالیت؛ افزودن override ۷٪ از popover | ✅ (OVERRIDDEN + نوت) |
| ۹ | تم تیره + viewport 390 | ✅ بدون خطا |
| ۱۰ | console/page errors | ✅ صفر |

## ۳) آزمون UI — نسخه آفلاین (`file://`)

| # | سناریو | نتیجه |
|---|---|---|
| ۱ | بوت file:// + seed دمو (?demo=1) | ✅ |
| ۲ | درخت ۴ سطحی + جست‌وجو + باز/بستن همه | ✅ |
| ۳ | chevron/کلیک مستقل؛ شمارش کنار گره | ✅ |
| ۴ | پنل ایستگاه + بخش الونس (empty-state درست) | ✅ |
| ۵ | صفحه فعالیت؛ جدول الونس (استراحت شخصی/نیازهای طبیعی + خلاصه) | ✅ |
| ۶ | صفحه مجازها؛ سه زبانه؛ تعریف‌های مرکزی با شمارش تخصیص | ✅ |
| ۷ | افزودن تخصیص خط ۴٪ از UI → `totalPercent=0.04` | ✅ |
| 8 | دیالوگ عنصر با الونس | ✅ |
| ۹ | console/page errors | ✅ صفر |

نمونه‌های تصویری: `parity-shots/session1-*.png` (ساختار وب/آفلاین، تم تیره، موبایل، جست‌وجو، دیالوگ عنصر، افزودن الونس، صفحه فعالیت).

## ۴) محدودیت‌های آزمون

- لمس فیزیکی DnD (touch) شبیه‌سازی نشد؛ DnD ماوس/کیبورد از طریق dnd-kit (وب) و HTML5 (آفلاین) با سناریوهای reorder سرویس تست شد.
- مقایسه پیکسلی PDF چاپ در این جلسه خارج از دامنه بود.


---

# گزارش تست پارتی — جلسه دوم (۱۴۰۵/۰۸/۲۶)

| تست | ابزار | نتیجه |
|---|---|---|
| ۱۳ آزمون اجباری §۹ + property-based (۳۰۰ بازه واقعی + ۳۰۰ نامعتبر، seed ثابت) | bun scripts/test-overlap-quick.ts | ۱۹/۱۹ ✅ |
| یکپارچگی API ماتریس (CRUD/عضویت/استقلال چرخه/sync/رد قطعی/هشدار) | bun scripts/test-overlap-api.ts (سرور dev) | ۴۰/۴۰ ✅ |
| parity موتور هم‌پوشانی (fixture یکسان روی وب TS و آفلاین JS) | bun scripts/test-overlap-parity.ts | ۵۲/۵۲ ✅ |
| رگرسیون هسته آفلاین (schema v۳ + بسته v۲) | bun scripts/test-offline-core.js | ۱۳۰/۱۳۰ ✅ |
| TypeScript وب | npx tsc --noEmit | پاک ✅ |
| lint وب | bun run lint | ۰ خطا ✅ |
| سینتکس آفلاین | node --check ×۱۷ فایل | همه معتبر ✅ |
| مرورگر وب (ماتریس کامل + زیرهدر + بوم + گزارش‌ها) | agent-browser | بدون خطا ✅ |
| مرورگر آفلاین file:// (ماتریس + موتور + زیرهدر + بوم + گزارش‌ها) | agent-browser | بدون خطا ✅ |
| تولید PDF واقعی گزارش | page.pdf | PDF معتبر ۲ صفحه ✅ |

اسکرین‌شات‌ها: parity-shots/session2/ — on-matrix-empty, on-matrix-relation-added, on-matrix-value-committed,
on-timing-subheader, on-charts, on-reports-center, off-matrix-desktop, off-matrix-cycle-selected,
off-timing-subheader, off-charts, off-reports-center + k25c2-* (زیرهدر موبایل/فیلتر/برگه).
