# گزارش تحویل v1.5.2 — بخش اول: اصلاح ساختار صفحات و یکپارچه‌سازی رابط کاربری

- **شاخه:** `v1.5.2-ui-refinement` (مبنا: `v1.5.1-cross-activity-parallel-relations` @ `0cd823d`)
- **دامنه:** §۲–§۹ از دستورالعمل نسخه ۱.۵.۲ — بخش اول از سه بخش
- **قید پایه:** قابلیت‌های v1.5.1 (روابط موازی بین‌فعالیت) دست‌نخورده؛ `src/calculation/` و `src/application/` بدون هیچ تغییر (`git diff v1.5.1 -- src/calculation src/application` خالی است)

---

## ۱. خلاصهٔ اصلاحات

### §۲ — درخت ساختار (StructureView + آفلاین)
| خواسته | پیاده‌سازی |
|---|---|
| حذف اسکرول داخلی درخت | حذف `max-h-[26rem] overflow-y-auto lg:max-h-[calc(100vh-23rem)]`؛ ظرف `p-3` ساده — ارتفاع طبیعی |
| حذف sticky مستقل ستون | حذف `lg:sticky lg:top-20` — ستون همراه اسکرول اصلی صفحه |
| عرض سلسله‌مراتبی | ایستگاه ۱۰۰٪ / فعالیت ۸۵٪ موبایل و ۷۵٪ دسکتاپ (`w-[85%] sm:w-3/4`) / عنصر همان نسبت نسبت به فعالیت |
| تمایز بصری سه سطح | `bg-card` (ایستگاه) → `bg-surface-2/80` (فعالیت، + border) → `bg-surface-3/60` (عنصر) — سازگار با تم روشن/تیره |
| شمارش زیر عنوان | حذف Badge کنار عنوان؛ خط مجزا «N فعالیت · M عنصر کاری» همیشه نمایان (پیش‌تر فقط هنگام انتخاب) |
| کلیک دومانی | کلیک اول = فقط انتخاب (فعالیت: به همراه انتخاب ایستگاه والد)؛ کلیک دوم روی کارت انتخاب‌شده = باز/بسته زیرشاخه؛ chevron کاملاً مستقل |
| ورود به فعالیت | دکمهٔ ثانویهٔ واضح `SquareArrowOutUpRight` با aria-label «ورود به صفحه فعالیت …» در ستون عملیات |
| عدم تداخل رویدادها | stopPropagation روی chevron/ویرایش/حذف/ورود؛ انتخاب فعالیت درخت را جمع نمی‌کند (کلیک دوم باید کار کند) |

### §۳ — ProcessSymbol (کامپوننت مشترک + آفلاین)
- حذف کامل قاب مستطیلی، حاشیه و پس‌زمینهٔ بیرونی (`PROCESS_SYMBOL_BOX` حذف شد)
- رندر **SVG توپر** با `fill="currentColor"` و رنگ نوع روی خود شکل: ○ عملیات (brand) / □ بازرسی (amber) / ⇨ حمل‌ونقل (muted) / D تأخیر (red) / ▽ انبارش (green) / ⬡ ورودی مواد (cyan)
- اندازه‌های بازبینی‌شده: sm=16px / md=24px / lg=36px
- پاک‌سازی wrapper های اضافی: قاب `bg-brand-soft` در StructureView و override اندازه در ChartCanvas حذف شد
- نسخهٔ آفلاین (`UI.processSymbol`) عیناً هم‌ارز: همان مسیرهای SVG، همان رنگ‌ها، همان اندازه‌ها

### §۴ — AllowanceSection (وب + آفلاین)
- **خلاصه:** بلوک‌های چیپ مستقل با عنوان بالای مقدار (الونس مؤثر / جمع درصدها (A) / زمان ثابت هر اجرا / زمان ثابت هر چرخه) + عنوان «خلاصه محاسبات الونس»؛ فاصلهٔ کافی افقی/عمودی
- **فرمول:** `ST = NT × (1 + A)` با `dir="ltr"` در چیپ خط‌چین برند — ترتیب اجزا صحیح
- **ستون وضعیت:** فقط Badge کوتاه (`w-28`)؛ متن توضیح کامل از طریق دکمهٔ «توضیح» + Tooltip (وب: Radix z-50، آفلاین: notePop ثابت z-9999)
- **آیکون:** `Tags` → `Percent` در هدر بخش + هدر صفحهٔ مجازها (تمام استفاده‌کنندگان)
- منطق محاسباتی، `formatSeconds`، مبنا و فرمول‌ها **بدون تغییر**

### §۵ — GroupsView (وب + آفلاین)
- حذف کارت توضیحی مستقل در تب «الونس‌های خط تولید» → راهنمای ظریف یک‌خطی با HelpDot
- کارت گروه‌ها: تایپوگرافی بازطراحی (`text-[15px]` عنوان، `leading-6/5`)، padding `p-4`، نام فعالیت‌ها **بدون truncate** (`break-words`)، «— نام ایستگاه» جدا از نام
- «نمایش همه فعالیت‌ها (n مورد دیگر) / نمایش کمتر» با آستانهٔ ۵ فعالیت — همهٔ فعالیت‌ها قابل مشاهده
- آیکون‌ها: هدر صفحه `Percent` / تب خط تولید `SlidersHorizontal` / تب گروه‌ها `ListTree` / هدر کارت گروه‌ها `ListTree`
- فاصله‌گذاری یکسان هر سه تب (`mt-4` محتوا، `p-4 pt-3` کارت‌ها، `gap-3` گرید)
- رفع باگ آفلاین: scope تابع `draw` در groupCard (بازترسیم پس از «نمایش همه»)

### §۶ — HelpDot و لایهٔ Popover
- **وب:** `z-[60]` بالاتر از Dialog (z-50) — همیشه روی کارت‌ها/دیالوگ‌ها؛ فقط کلیک روی خود آیکون trigger را باز می‌کند (PopoverTrigger فقط دکمهٔ آیکون است)
- **آفلاین (بازنویسی):** پاپ‌اور در **لایهٔ ثابت سطح body** (`position: fixed; z-index: 9999`) خارج از والد‌های دارای `overflow-hidden`/stacking context؛ باز-محاسبهٔ موقعیت هنگام scroll/resize؛ بستن با کلیک بیرون/Escape؛ جابه‌جایی هوشمند بالا/پایین بر اساس فضای موجود
- راستی‌آزمایی: HelpDot داخل هدر چسبان، داخل جدول و داخل دیالوگ ویرایش عنصر — همه بالاتر از محتوا

### §۷ — هدرهای یکدست
- `.card-head` (globals.css وب + app.css آفلاین): حذف گرادیان → `background: color-mix(in srgb, var(--surface-2) 60%, transparent)` — یکدست در تمام عرض، هر دو تم
- حذف گرادیان هدرهای اختصاصی: ریشهٔ درخت ساختار (StructureView + آفلاین)، کارت بستهٔ خروجی (DataView)، بنر خوش‌آمد (HomeView)
- **§۷.۱ وستینگهاوس:** عنوان فعالیت `pt-4 pb-2.5` (وب) / `mt-4` (آفلاین) — فاصلهٔ ۱۶px از خط جداکنندهٔ هدر ایستگاه

### §۸ — سازوکار مشترک عنوان چسبان
- **کامپوننت `SectionHeading`** (وب) + **`UI.stickyHeading`** (آفلاین): `position: sticky; top: calc(3.5rem - 1px)` زیر نوار اصلی h-14؛ تشخیص لحظهٔ چسبیدن با IntersectionObserver (ترفند هم‌پوشانی ۱px با مرز viewport منفی‌شده) → پس‌زمینهٔ یکدست + خط زیرین + سایهٔ ظریف
- **در هر لحظه فقط یک عنوان اصلی چسبان** — هر عنوان فقط در محدودهٔ ظرف خودش می‌چسبد؛ با رسیدن بخش بعدی، عنوان قبلی به‌طور طبیعی جای خود را می‌دهد
- صفحات اعمال‌شده: Structure، Allowances (مجازها)، Westinghouse، Operators، Data، ProjectInfo، Dashboard، Reports + **هدر کارت** Matrix (با حذف `overflow-hidden` کارت برای کارکرد sticky) و Charts
- **عمداً مستثنا (بدون Sticky تو در تو):** Timing (TimingSubheader چسبان z-40 موجود) و Activity (نوار زبانه‌های چسبان موجود) — مطابق قید «راهکار جدید نباید با هدر زمان‌سنجی تداخل داشته باشد»
- عنوان‌های فرعی، متن کارت‌ها و هدر ستون جدول‌ها چسبان **نشدند**

### §۹ — آزمون بصری مرورگر
تمام موارد با اجرای واقعی برنامه در مرورگر (Chrome) + Screenshot + تحلیل VLM + اندازه‌گیری DOM راستی‌آزمایی شدند؛ اسکرین‌شات‌ها در `offline/parity-shots/v152/` (پیشوند `on-` نسخهٔ Next، `off-` نسخهٔ آفلاین).

---

## ۲. فایل‌های تغییرکرده

### نسخهٔ Next (بخش src/)
| فایل | تغییر |
|---|---|
| `src/components/common/ProcessSymbol.tsx` | بازنویسی کامل — SVG توپر بدون قاب |
| `src/components/common/SectionHeading.tsx` | **جدید** — سازوکار عنوان چسبان مشترک + `useStuck` |
| `src/components/common/HelpDot.tsx` | لایهٔ z-[60] |
| `src/views/project/StructureView.tsx` | §۲ کامل + sticky هدر + حذف گرادیان ریشهٔ درخت |
| `src/views/project/allowances/AllowanceSection.tsx` | §۴ کامل |
| `src/views/project/GroupsView.tsx` | §۵ کامل + sticky هدر |
| `src/views/project/WestinghouseView.tsx` | §۷.۱ + sticky هدر |
| `src/views/project/MatrixView.tsx` | هدر کارت چسبان |
| `src/views/project/ChartsView.tsx` | هدر کارت چسبان |
| `src/views/project/OperatorsView.tsx`, `DataView.tsx`, `ProjectInfoView.tsx`, `DashboardView.tsx`, `ReportsView.tsx`, `HomeView.tsx` | sticky هدر / حذف گرادیان |
| `src/views/project/ActivityView.tsx`, `src/views/project/charts/ChartCanvas.tsx` | پاک‌سازی wrapper نماد فرایندی |
| `src/app/globals.css` | .card-head تخت + .sticky-heading |

### نسخهٔ آفلاین (offline/)
| فایل | تغییر |
|---|---|
| `offline/js/ui.js` | processSymbol (SVG) + helpDot (لایهٔ ثابت) + noteDot + stickyHeading |
| `offline/css/app.css` | .psym / .card-head / .sticky-heading / .helpdot-pop / .note-pop |
| `offline/js/views-structure.js` | §۲ کامل + sticky هدر + حذف گرادیان ریشه |
| `offline/js/views-allowances.js` | §۴ + §۵ کامل + sticky هدر |
| `offline/js/views-westinghouse.js` | §۷.۱ + sticky هدر |
| `offline/js/views-matrix.js` | هدر کارت چسبان (حذف overflow-hidden) |
| `offline/js/views-{operators,data,info,dashboard,reports,charts}.js` | sticky هدر |
| `offline/js/utils.js` | آیکون squareArrowOutUpRight |
| `offline/VERSION`، `offline/CHANGELOG.md` | 1.5.2 |

---

## ۳. راستی‌آزمایی مرورگری (§۹) — همهٔ موارد با مشاهدهٔ واقعی تأیید شدند

| مورد | روش | نتیجه |
|---|---|---|
| درخت بدون اسکرول داخلی + ارتفاع طبیعی | DOM (`maxHeight` حذف) + VLM | ✓ |
| عرض ۱۰۰/۷۵/۷۵٪ | DOM: ایستگاه ۵۲۶px / فعالیت ۳۸۳px (۷۳٪) — وب و آفلاین | ✓ |
| شمارش زیر عنوان (وب/آفلاین، روشن/تیره) | VLM | ✓ |
| کلیک دومانی ایستگاه: ۱) انتخاب ۲) باز/بسته | تعاملی وب (۴ کلیک متوالی) + آفلاین (کلیک فیزیکی تک/دو مرحله‌ای) | ✓ |
| کلیک دومانی فعالیت + chevron مستقل + ورود به فعالیت | تعاملی — URL می‌ماند / زیرشاخه باز/بسته / ناوبری با دکمه | ✓ |
| ProcessSymbol توپر بدون قاب | VLM (روشن + تیره) + DOM (`svg fill=currentColor`) | ✓ |
| خلاصهٔ بلوکی + فرمول LTR | VLM + DOM (`ST = NT × (1 + A)` در چیپ خط‌چین) | ✓ |
| ستون وضعیت: Badge + Tooltip توضیح | تعاملی — Tooltip ۲۸۸px z-50 با متن کامل note | ✓ |
| حذف کارت توضیحی + راهنمای ظریف | VLM | ✓ |
| گروه‌ها: نمایش همه/کمتر + wrap نام‌ها | تعاملی (۶ فعالیت، باز/بسته) + VLM — وب و آفلاین | ✓ |
| آیکون‌های Percent/Sliders/ListTree | DOM (تعداد path ها: ۳/۹/۵) + VLM | ✓ |
| HelpDot روی کارت‌ها/هدر چسبان/داخل دیالوگ | تعاملی — z-60 (وب) / fixed z-9999 در body (آفلاین) | ✓ |
| کلیک label → راهنما باز نشود | تعاملی (کلیک label در دیالوگ) | ✓ |
| هدر یکدست بدون گرادیان | VLM (روشن + تیره) | ✓ |
| فاصلهٔ عنوان فعالیت وستینگهاوس | DOM: padTop 16px (وب) / margin-top 16px (آفلاین) + VLM | ✓ |
| عنوان چسبان top-14 | DOM در ۱۰ صفحه: `top=55, stuck=true` (وب و آفلاین) + VLM | ✓ |
| یک عنوان چسبان در هر لحظه / بدون تداخل Timing | DOM (0 sticky-heading در Timing؛ subheader در 56px تنها) | ✓ |
| موبایل ۳90px | VLM + DOM (sticky w=358، بدون سرریز افقی) | ✓ |
| تم تیره | VLM (سلسله‌مراتب قابل تشخیص، کنتراست سالم) | ✓ |

## ۴. آزمون‌های اجراشده

| مجموعه | نتیجه |
|---|---|
| `test-offline-core.js` | ۱۳۰ پاس / ۰ خطا |
| `test-offline-review.js` | ۴۴ پاس / ۰ خطا |
| `test-offline-transposed.js` | ۸۸ پاس / ۰ خطا |
| `test-offline-fixes.js` (bun) | ۶۷ پاس / ۰ خطا |
| `test-overlap-api.ts` (وب) | ۵۱ پاس / ۰ خطا |
| `test-overlap-parity.ts` | ۱۵۳ پاس / ۰ خطا |
| `test-overlap-quick.ts` | ۱۹ پاس / ۰ خطا |
| `verify-session1.ts` | ۵۹ پاس / ۰ خطا |
| `tsc --noEmit` | بدون خطا |
| `bun run lint` | ۰ خطا (۱ هشدار پیش‌موجود در offline/datepicker.js بدون تغییر) |

## ۵. هم‌ارزی نسخهٔ Next و آفلاین

هر اصلاح §۲–§۸ در **هر دو نسخه** با همان جزئیات (نسبت عرض، رنگ سطح‌ها، متن‌ها، آیکون‌ها، رفتار کلیک، لایهٔ پاپ‌اور، موقعیت sticky و آستانه‌های عددی) پیاده و به‌صورت جداگانه در مرورگر راستی‌آزمایی شد. منطق محاسباتی، داده و API بدون تغییر ماند (`git diff v1.5.1 -- src/calculation src/application` خالی).
