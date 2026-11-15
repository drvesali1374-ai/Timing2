# گزارش تحویل — v1.5.2 بازبینی نهایی (ممیزی، اصلاح و تکمیل)

شاخه کاری: ادامهٔ مستقیم `v1.5.2-ui-refinement-complete` (کامیت‌های «v1.5.2-نهایی (۱)» به بعد)
تاریخ: ۱۴۰۵/۰۸/۲۵ — اسنپ‌شات‌ها: `offline/parity-shots/v152-final-review/`

> **مکمل دور دوم (جلسهٔ تأیید نهایی):** پس از گزارش اول، یک دور بازآزمایی کامل با
> فایل‌های PDF واقعی + بازبینی VLM انجام شد که ۳ ریشه‌یابی تازه و رفع باگ قطعی داشت —
> جزئیات در بخش «I» در انتهای همین گزارش.

---

## A. خلاصه تغییرات

| بند | شرح | وضعیت |
|-----|------|-------|
| §۲ | بررسی تاریخچه Git و حفظ اصلاحات معتبر | ✅ انجام شد (گزارش زیر) |
| §۳ | اصلاحات ساختار تولید + فرمول ST | ✅ (P3 + §۳.۲ کامپوننت مشترک این جلسه) |
| §۴ | HelpDot فقط با کلیک آیکون | ✅ (P1-P3 + آزمون E2E این جلسه) |
| §۵ | ProcessSymbol بزرگ/خط‌دار | ✅ (P3 — بدون تغییر این جلسه) |
| §۶ | آیکون مقادیر مشکوک کنار عدد | ✅ (P2/P3 + تأیید ساختاری) |
| §۷.۱ | رفع باگ افزودن رابطهٔ موازی | ✅ (P3 + E2E این جلسه: کاتالوگ، منع تکراری، زیرردیف) |
| §۷.۲ | هماهنگی فرمت زمان عناصر موازی | ✅ **این جلسه** — وب + آفلاین + ماندگاری |
| §۸ | هدر و جدول‌های زمان‌سنجی | ✅ (P2 + E2E «بازگشت به جلسات»/«بستن این جلسه») |
| §۹ | قالب Excel و مسیر ورود داده | ✅ (P2 §۹ کامل — بدون تغییر ساختاری این جلسه) |
| §۱۰.۱ | نظم ابزارهای نمودار + PDF متمایز | ✅ **این جلسه** — هر دو نسخه |
| §۱۰.۲ | ثابت ماندن زبانه‌های OPC/FPC | ✅ **این جلسه** — هر دو نسخه (E2E: stuck@55px) |
| §۱۰.۳ | انتخاب و حذف یال + Delete | ✅ (P3 §۶-۶ + E2E این جلسه) |
| §۱۰.۴ | یکسان‌سازی منطق اتصال یال دستی/خودکار | ✅ **این جلسه** + رفع باگ validation |
| §۱۰.۵ | تنظیم ظاهر یال (نوع خط/رنگ) | ✅ **این جلسه** — ماندگار در DB (هر دو نسخه) |
| §۱۰.۶ | جابه‌جایی ابزارهای Hover به بالای کارت | ✅ **این جلسه** — fallback هوشمند |
| §۱۰.۷ | رفع قطعی خروجی PDF سفید | ✅ (P3 §۶-۵ cropOffset + تأیید dialog این جلسه) |
| §۱۰.۸ | Undo/Redo کامل نمودار | ✅ **این جلسه** — دکمه + Ctrl+Z/Y/Shift+Z (هر دو نسخه) |
| §۱۱ | مقیاس ثابت میله‌های نمودار مقایسه | ✅ **این جلسه** — سقف ۳۲px (E2E: ۵ میله × ۳۲px) |
| §۱۲ | حذف ریشه‌ای گروه‌های فعالیت | ✅ **این جلسه** — وب + آفلاین کامل |
| §۱۳ | حذف زبانهٔ الونس‌های خط تولید | ✅ **این جلسه** — وب + آفلاین |
| §۱۴ | فاصلهٔ زبانهٔ تعریف‌های مرکزی | ✅ **این جلسه** — E2E: ۲۴px |
| §۱۵ | حذف ستون‌های منسوخ گزارش‌ها | ✅ **این جلسه** — ممیزی + اصلاح شیت آفلاین |
| §۱۶ | چاپ/PDF بدون شکست نامناسب | ✅ **این جلسه** — PDF واقعی ۴ صفحه وب / ۲ صفحه آفلاین |
| §۱۷ | ساده‌سازی کارت‌ها/هدرها + ActivityView | ✅ **این جلسه** — حذف دکمهٔ حذف از هدر |
| §۱۸ | هدرهای ثابت صفحات اصلی | ✅ (P1-P3 + تحلیل نتایج **این جلسه**) |
| §۱۹ | حذف کامل ماتریس هم‌پوشانی | ✅ (P3 §۲ + پاک‌سازی فایل‌های مرده این جلسه) |
| §۲۰ | هماهنگی نسخهٔ آفلاین | ✅ همهٔ تغییرات این جلسه آینه‌شده |
| §۲۱-۲۲ | تست‌های اجباری + اسکرین‌شات | ✅ **این جلسه** — جزئیات در D |
| §۲۳ | این گزارش | ✅ |

---

## B. تغییرات فنی

### نسخهٔ Next (وب)
| فایل | تغییر |
|------|-------|
| `prisma/schema.prisma` | §۱۲ حذف ActivityGroup/AllowanceCategory/GroupAllowance/ActivityAllowanceOverride + groupId؛ §۱۰.۵ ستون‌های line_style/line_color یال |
| `src/application/allowance-service.ts` | §۱۲ — فقط تنظیمات محاسبات باقی ماند |
| `src/application/effective-allowance-service.ts` | §۱۲ — حذف کل مهاجرت قدیمی (self-heal) |
| `src/application/structure-service.ts` | §۱۲ حذف groupId؛ §۷.۲ defaultEntryMode در updateElement |
| `src/application/stage-status.ts` | §۱۲ — وضعیت الونس‌ها از تعریف+تخصیص |
| `src/application/analysis-service.ts` / `report-service.ts` / `calculation-run-service.ts` / `project-service.ts` | حذف فیلدهای گروه از DTOها |
| `src/application/chart-service.ts` | §۱۰.۴ anchor تهی؛ §۱۰.۵ updateChartEdgeAppearance + اعتبارسنجی هگز |
| `src/domain/validation.ts` | §۱۲ حذف اسکیماهای گروه/دسته؛ §۱۰.۴ anchor nullish؛ §۱۰.۵ chartEdgeAppearanceSchema؛ §۷.۲ defaultEntryMode |
| `src/app/api/chart-edges/[edgeId]/route.ts` | §۱۰.۵ PATCH ظاهر یال |
| `src/lib/api/endpoints.ts` / `keys.ts` | حذف APIهای گروه/دسته/سطح-خط؛ updateEdgeAppearance؛ DTOها |
| `src/views/project/AllowancesView.tsx` | **جدید** (جانشین GroupsView) — فقط تعریف‌های مرکزی، بدون زبانه |
| `src/views/registry.ts` | allowances → AllowancesView |
| `src/views/project/StructureView.tsx` / `ActivityView.tsx` | §۱۲ حذف فیلد گروه؛ §۱۷ حذف دکمهٔ حذف هدر |
| `src/views/project/HomeView.tsx` / `ProjectInfoView.tsx` / `DataView.tsx` / `ReportsView.tsx` / `analysis/*` | برچسب‌ها و شمارش‌ها بدون گروه |
| `src/views/project/ChartsView.tsx` | §۱۰.۲ بلوک چسبان واحد هدر+زبانه‌ها |
| `src/views/project/charts/ChartCanvas.tsx` | §۱۰.۱ گروه‌بندی نوار ابزار؛ §۱۰.۴ anchor تهی؛ §۱۰.۵ رندر ظاهر + EdgeAppearanceBar + marker رنگی؛ §۱۰.۶ toolbar بالا؛ §۱۰.۸ useChartHistory |
| `src/views/project/charts/useChartHistory.ts` | **جدید** — تاریخچهٔ Undo/Redo (سقف ۶۰) |
| `src/views/project/timing/SheetPanel.tsx` / `SheetGrid.tsx` / `MobileSheet.tsx` / `shared.ts` | §۷.۲ فرمت زیرردیف از والد + ماندگاری |
| `src/components/common/StFormula.tsx` | **جدید** §۳.۲ — چیپ مشترک فرمول ST |
| `src/views/project/DashboardView.tsx` | §۱۱ maxBarSize=32 + برچسب مقدار ≤۸ |
| `src/infrastructure/*` | §۱۲ سازگاری deletion/serialize/package-io (بسته‌های قدیمی نادیده، groupId حذف) |
| `src/app/globals.css` | §۱۶ print-keep-with-next + widows/orphans |

### نسخهٔ آفلاین (آینهٔ کامل)
`db.js` (حذف جدول‌های legacy + مهاجرت؛ updateChartEdgeAppearance؛ defaultEntryMode؛ normalizeLegacyData) · `views-allowances.js` (تعریف‌های مرکزی، بدون زبانه، فاصلهٔ §۱۴) · `views-structure.js` (حذف گروه از دیالوگ‌ها/درخت) · `views-timing.js` (§۷.۲ فرمت والد + persist) · `views-charts.js` (§۱۰.۱ گروه‌های نوار ابزار، §۱۰.۲ چسبان، §۱۰.۴ anchor تهی، §۱۰.۵ نوار ظاهر، §۱۰.۶ toolbar بالا، §۱۰.۸ ماژول تاریخچه) · `views-dashboard.js` + `css` (§۱۱ max-width/سقف ۳۲) · `views-reports.js` (§۱۵ شیت الونس‌ها؛ §۱۶ keep-with-next) · `views-analysis.js` (سربرگ چسبان + متن) · `app.js`/`views-home`/`views-data` (متن‌ها) · `ui.js` + `css` (StFormula مشترک؛ tb-group؛ btn-pdf؛ ea-*؛ node-ctrls بالا)

---

## C. وضعیت هر درخواست

| بند | وضعیت |
|-----|-------|
| §۱ اهداف سه‌گانه | ✅ انجام شد |
| §۲ تاریخچه Git | ✅ انجام شد — ۱۳ کامیت اختصاصی `v1.5.2-ui-refinement` همگی با محتوای هم‌ارز در شاخهٔ فعلی موجودند (تأیید `git diff` تهی بین جفت‌کامیت‌های معادل: 5052d21↔fdb9d9c، a678d97↔fd791e1، f02cfcf↔6d2f0e9 و بقیه). اصلاحات ماتریس §۱۹ (بخش ۳) نیز حفظ شدند. |
| §۳.۱ نظم کارت‌ها | ✅ (P3 §۳-۱..۳-۴) + E2E دومانی |
| §۳.۲ پنجرهٔ ویرایش + فرمول | ✅ E2E: ۱۲۰۰px در ۱۴۴۰vw؛ StFormula با padding ۱۴/۸px |
| §۴ HelpDot | ✅ E2E: کلیک Label پاپ‌اور باز نکرد؛ فقط آیکون |
| §۵ ProcessSymbol | ✅ (P3) |
| §۶ مشکوک | ✅ |
| §۷.۱ | ✅ E2E کامل |
| §۷.۲ | ✅ E2E دوسویه + ماندگاری (وب و آفلاین) |
| §۸ | ✅ |
| §۹ | ✅ (P2؛ §۱۵ این جلسه شیت الونس‌های آفلاین را هم اصلاح کرد) |
| §۱۰.۱ | ✅ |
| §۱۰.۲ | ✅ E2E: stuck@55px + زبانه‌ها در بلوک |
| §۱۰.۳ | ✅ E2E: Delete→تأیید→حذف→Undo با بازگشت ظاهر |
| §۱۰.۴ | ✅ + **رفع باگ validation (422)** |
| §۱۰.۵ | ✅ E2E: DASHED ماندگار؛ ۶ رنگ؛ پیش‌فرض |
| §۱۰.۶ | ✅ E2E: بالا ۹px فاصله؛ fallback پایین نزدیک لبه |
| §۱۰.۷ | ✅ (P3 کامل) + dialog bbox این جلسه |
| §۱۰.۸ | ✅ E2E: دکمه/Ctrl+Z/Y/Shift+Z + برچسب عملیات (وب و آفلاین) |
| §۱۱ | ✅ E2E: ۵×۳۲px یکنواخت |
| §۱۲ | ✅ کامل (اسکیما+API+UI+آفلاین) |
| §۱۳ | ✅ |
| §۱۴ | ✅ E2E: gap=24px |
| §۱۵ | ✅ ممیزی — «نوع» الونس معتبر ماند؛ «نوع» elementType قبلاً حذف شده بود |
| §۱۶ | ✅ PDF واقعی: وب ۴ صفحه / آفلاین ۲ صفحه |
| §۱۷ | ✅ |
| §۱۸ | ✅ |
| §۱۹ | ✅ (ratingApi.matrix و overlap.ts و parallel-relation-service و جدول فیزیکی overlap_relations حفظ شدند) |
| §۲۰ | ✅ |
| §۲۱ | ✅ (D را ببینید) |
| §۲۲ | ✅ ۳۴ اسکرین‌شات + ۲ PDF + VLM |
| §۲۴ قواعد نهایی | ✅ همه |

---

## D. نتایج تست

### خودکار
| مجموعه | نتیجه |
|--------|-------|
| `scripts/test-offline-core.js` | **۱۳۱ پاس / ۰ خطا** |
| `scripts/test-transposed-sheet.ts` (وب) | **۹۷ پاس / ۰ خطا** |
| `scripts/test-offline-fixes.js` | **۶۶ پاس / ۰ خطا** |
| `scripts/test-migration-persist.js` | **۵ پاس / ۰ خطا** |
| `scripts/test-offline-transposed.js` | **۷۲ پاس / ۰ خطا** |
| `scripts/test-chart-anchors.ts` §۲۱.۲ (۱۶ ترکیب) | **۸۳ پاس / ۰ خطا** |
| `bunx tsc --noEmit` | ۰ خطا |
| `bun run lint` | ۰ خطا (۲ هشدار موجودیت پیشین: datepicker.js و test-migration-persist.js — عبارت بی‌تخصیص عمدی) |

### مرورگر (E2E — وب و آفلاین)
| سناریو | وب | آفلاین |
|--------|-----|--------|
| کلیک دومانی کارت ایستگاه (انتخاب ← باز/بسته) | ✅ | (هم‌ارز P3) |
| عرض دیالوگ ویرایش عنصر = ۱۲۰۰px سقف | ✅ ۸۳٪vw | (هم‌ارز P2) |
| فرمول ST با فاصلهٔ یکنواخت (۱۴/۸px) | ✅ | ✅ |
| HelpDot فقط با کلیک آیکون | ✅ | (هم‌ارز P2) |
| فرمت ردیف والد ← زیرردیف موازی (INT/SEQ دوسویه) | ✅ | ✅ |
| ماندگاری فرمت پس از Refresh کامل | ✅ | ✅ |
| افزودن رابطهٔ موازی از کاتالوگ کل پروژه + منع تکراری | ✅ | (هم‌ارز v1.5.1) |
| یال دستی با anchor تهی (مسیر هوشمند) | ✅ (+ رفع باگ 422) | ✅ (via DB path) |
| انتخاب یال زنجیره = فقط حذف؛ یال دستی = نوار ظاهر | ✅ | ✅ |
| تغییر ظاهر یال به خط‌چین + ماندگاری | ✅ | ✅ |
| Undo ظاهر + Redo (دکمه و Ctrl+Z/Y) | ✅ | ✅ |
| Delete روی یال انتخاب‌شده → تأیید → حذف → Undo کامل | ✅ | (هم‌ارز P3) |
| نوار ابزار هاور بالای کارت (۹px) + fallback پایین | ✅ | ✅ (CSS) |
| بلوک چسبان هدر+زبانه‌های نمودار (stuck@55px) | ✅ | ✅ |
| میله‌های داشبورد ۳۲px یکنواخت | ✅ ۵ میله | ✅ ۱ میله |
| PDF واقعی گزارش‌ها | ✅ ۴ صفحه | ✅ ۲ صفحه |
| Responsive 1440/1280/1024/768/390/360 — بدون overflow | ✅ | ✅ |
| Dark Mode (پیکسل: 7,11,20) | ✅ | ✅ |

### PDF واقعی (§۲۱.۳)
- `on-reports-print.pdf` (وب): ۴ صفحه — سربرگ، جدول عناصر با سرستون تکرارشونده، الونس‌ها، آمار چرخه
- `off-reports-print.pdf` (آفلاین): ۲ صفحه — همان ساختار
- `on-chart-pdf-dialog.png`: bbox محتوای واقعی ۲۹۶×۱۳۴۰ (برش §۱۰.۷)
- سناریوهای ۱۰گانهٔ §۱۰.۷ در بخش ۳ (v152p3) با فایل‌های واقعی اجرا شده‌اند.

---

## E. شواهد تصویری
مسیر: `offline/parity-shots/v152-final-review/` — ۳۴ فایل شامل:
۱-۱۹ زوج/تک وب و آفلاین: home, structure, allowances (بدون زبانه), element-dialog-wide,
helpdot, timing (sessions/sheet/parallel-sync/INT/SEQ/persist), add-relation,
charts (FPC, edges, selected, dashed, undo-redo, sticky, pdf-dialog, 390px),
dashboard (bars), reports (+print), dark, responsive.
+ `on-reports-print.pdf` و `off-reports-print.pdf`.
بازبینی VLM: «ساختار کلی هم‌ارز ✅» (زوج allowances)؛ نکات جزئی زبانه-chipها ثبت شد.

---

## F. تغییرات Schema و Migration
- **§۱۲**: حذف ۴ مدل legacy (ActivityGroup/AllowanceCategory/GroupAllowance/ActivityAllowanceOverride) و ستون activities.group_id از Prisma schema؛ `db:push` بدون از دست رفتن دادهٔ سایر جداول (پروژهٔ تستی سالم).
- **§۱۰.۵**: افزودن chart_edges.line_style / line_color (nullable = پیش‌فرض).
- **سازگاری دادهٔ قدیمی (هر دو نسخه)**: Import/Restore بسته‌های قدیمی — جداول legacy با `normalizeLegacyData/normalizeLegacyPackageData` حذف و groupId فعالیت نادیده گرفته می‌شود (تست خودکار: «بستهٔ قدیمی دارای گروه بدون خطا وارد می‌شود» ✅). دادهٔ گروه‌های قدیمی نابود نمی‌شود بلکه صرفاً دیگر منبع محاسبه نیست؛ تعاریف مرکزی/تخصیص‌های سلسله‌مراتتی (خروجی مهاجرت‌های قبلی) دست‌نخورده می‌مانند.
- ماتریس: جدول فیزیکی overlap_relations برای ParallelElementRelation عمداً حفظ شد (§۱۹).

---

## G. موارد باقی‌مانده
1. **تست درگ واقعی ماوس برای یال آفلاین**: اتصال لنگر-به-لنگر در آفلاین فقط از مسیر همان تابع `onConnectUp` (DB.createChartEdge با anchor تهی) آزمود شد؛ رویدادهای مصنوعی PointerEvent روی صفحه‌آرایی آفلاین ثبت نشد (رویدادهای ترکیبی DOM در آن بستر پایدار نبودند). مسیر وب با درگ واقعی agent-browser کامل تأیید شد و منطق هر دو یکسان (anchor تهی → autoAnchors) است.
2. یال‌های زنجیره (سیستمی) عمداً ظاهر قابل‌تنظیم ندارند (§۱۰.۵ «تنها یال دستی» مطابق متن: «یال‌هایی که برای گره‌های دستی ایجاد می‌شوند») — طراحی آگاهانه، نه نقص.
3. پیکان‌های بسیار ریز در fit خیلی کوچک — طبیعت مقیاس (گزارش P3).

---

## H. بررسی سازگاری
- پروژهٔ تستی موجود پس از `db:push` سالم؛ ایجاد/ویرایش ایستگاه/فعالیت/عنصر، جلسه، داده، تحلیل، گزارش، نمودار همه E2E شدند.
- Backup/Restore: تست خودکار هستهٔ آفلاین (Export/Import بسته) پاس؛ سازگاری بسته‌های v3 قدیمی با جداول legacy ✅.
- پروژه‌های قدیمی بدون مهاجرت جدید: مهاجرت‌های قدیمی حذف شدند چون همهٔ داده‌های معتبر از قبل به مدل سلسله‌مراتتی منتقل شده بودند (مارکر migration.allowanceModel=v2 در داده‌های موجود)؛ دادهٔ گروه قدیمی نادیده گرفته می‌شود.

---

## زنجیرهٔ کامیت‌های این جلسه
1. `v1.5.2-نهایی (۱)` + (۱ب) + (۱ج) — §۱۲/§۱۳/§۱۴ وب
2. `v1.5.2-نهایی (۲)` — §۱۲/§۱۳/§۱۴ آفلاین
3. `v1.5.2-نهایی (۳)` — §۷.۲ وب+آفلاین
4. `v1.5.2-نهایی (۴)` — §۳.۲ فرمول ST مشترک
5. `v1.5.2-نهایی (۵)` — §۱۰.۱/۲/۴/۵/۶/۸ نمودار وب+آفلاین
6. `v1.5.2-نهایی (۶)` — §۱۱ داشبورد
7. `v1.5.2-نهایی (۷)` — §۱۵/§۱۶ گزارش‌ها
8. `v1.5.2-نهایی (۸)` — تکمیل §۱۵–۱۸ + آزمون‌ها + رفع ۳ باگ
9. `v1.5.2-نهایی (۹)` — §۲۳ گزارش تحویل
10. `v1.5.2-نهایی (۱۰)` — دور دوم تأیید: ریشه‌یابی PDF سفید + رفع باگ موازی آفلاین + نام‌گذاری Undo/Redo + داشبورد §۷ (بخش I)

---

## I. دور دوم تأیید نهایی — ریشه‌یابی‌ها و رفع‌های تازه

### I-۱. ریشه‌یابی قطعی «PDF سفید» نمودار (درخواست ۳ کاربر)
**علت واقعی:** در `globals.css` (وب) و `app.css` (آفلاین) قاعدهٔ چاپ گزارش‌ها
`@media print { body * { visibility: hidden } }` است که فقط `.print-report` را
 visible می‌کند. ریشهٔ چاپ نمودار (`#chart-pdf-root` که به body الصاق می‌شود)
هرگز visible پس داده نمی‌شد ⇒ **خروجی کاملاً سفید**.
**رفع (وب `PdfExportDialog.tsx` + آفلاین `views-charts.js`):**
```css
@media print { #chart-pdf-root, #chart-pdf-root * { visibility: visible !important; } }
```
**تشدیدهای همزمان:**
- قفل متغیرهای تم روی `#chart-pdf-root` به مقادیر **تم روشن** (در حالت تیره، متن
  روشن + حذف پس‌زمینه در چاپ = «سفید روی سفید» می‌شد) + `color:#0c1424` صریح روی
  root و `.chart-node` (رنگ به‌ارثی از body در تیره محاسبه شده و قفل متغیرها آن را
  بازنمی‌گرداند — عنوان کارت‌ها رنگ ارثی دارند).
- `print-color-adjust: exact` روی کل زیردرخت چاپ.
- یکتاسازی شناسهٔ پیکان‌های SVG در کلون (وب: بازنویسی رشته‌ای `id="arrow-*"` →
  `pdfx-arrow-*`؛ آفلاین: `fixCloneMarkerIds` موجود) تا تعارض id با نمونهٔ پنهان،
  پیکان‌ها را ناپدید نکند.

**شواهد PDF واقعی (Chromium print-to-PDF از DOM چاپ):**
| فایل | محتوا | تأیید VLM |
|------|-------|-----------|
| `on-chart-pdf-FIT.pdf` | ۱ صفحه — ۶ کارت + عنوان + پیکان‌ها | «Not blank — full flowchart, 6 cards, arrows, RTL page label» ✅ |
| `on-chart-pdf-TILED.pdf` | ۲ صفحه — بخش (ردیف۱/۲) + نشانه‌های برش | هر دو صفحه محتوا، ادامهٔ یال در صفحهٔ مجاور ✅ |
| `on-chart-pdf-DARK2.pdf` | تیره → چاپ روشن؛ عنوان‌های تیره روی کارت سفید | «Fixed. dark readable titles, visible borders, good» ✅ |
| `off-chart-pdf-FIT.pdf` | آفلاین — ۳ کارت + پیکان بنفش + عنوان | «flowchart content, not blank» ✅ |
| `off-chart-pdf-DARK.pdf` | آفلاین تیره → چاپ روشن | «dark titles on white, readable» ✅ |

### I-۲. رفع باگ قطعی «افزودن رابطهٔ موازی» در نسخهٔ آفلاین (درخواست ۶)
**علت:** در `views-timing.js` دیالوگ افزودن، مقدار `selectedId = cand.id` بود در حالی که
کاتالوگ `DB.getElementsCatalog()` کلید **`elementId`** دارد (نه `id`) ⇒ selectedId همیشه
undefined ⇒ دکمهٔ «افزودن» با `if (!selectedId) return;` **بی‌صدا هیچ کاری نمی‌کرد** —
دقیقاً همان رفتار گزارش‌شدهٔ کاربر.
**رفع:** `cand.id` → `cand.elementId` در هر سه نقطه (کلاس selected، checked رادیو، مقداردهی).
**تأیید E2E آفلاین (مرورگر واقعی):** انتخاب «پرس کوبی روتور» (بین‌فعالیت) → افزودن →
تأیید → **relCount: 1→2**، toast «رابطهٔ موازی افزوده شد»، زیرردیف «↲ موازی: پرس کوبی روتور بین‌فعالیت»
دقیقاً زیر عنصر والد. مسیر وب همین جلسه از ابتدا E2E شد (کاتالوگ کل پروژه + منع تکراری + زیرردیف).
*(نکته: مسیر مشابه در نمای ماتریس `views-relations.js` با `buildElementPicker` از ابتدا درست بود.)*

### I-۳. داشبورد — ارتفاع و فاصلهٔ واحد محور (درخواست ۷)
- **وب:** ظرف نمودار `h-44`→`h-64 sm:h-72` (۱۷۶→۲۵۶/۲۸۸px)؛ واحد «(ثانیه)» از داخل SVG
  (که با تیک بالای محور تداخل داشت) به **خط مستقل HTML** بالای نمودار منتقل شد.
  اندازه‌گیری DOM: فاصلهٔ عمودی caption تا بالاترین تیک = **۶px** (قبلاً هم‌پوشانی)؛ میله‌ها ۲×۳۲px.
- **آفلاین:** `H: 150→240` و `padT: 16→26`؛ واحد در y=13 (خط خودش) با ۱۶px فاصله از اولین تیک.
- تأیید VLM: «label on its own separate line, clearly separated, no overlap; reasonable height» ✅

### I-۴. نام‌گذاری Undo/Redo مطابق درخواست صریح کاربر (درخواست ۴)
دکمه‌ها از «واگردانی/ازنو» به **«برگشت به عقب»** و **«رفتن به جلو»** تغییر نام یافتند —
این بار با **برچسب متنی کنار آیکون** (نه فقط aria-label):
- وب `ChartCanvas.tsx`: دکمه‌های sm با متن «برگشت به عقب» / «رفتن به جلو» + aria-label همراه Ctrl+Z/Y.
- آفلاین `views-charts.js`: `.t2c-undo-btn` + `.t2c-undo-label` (در عرض <۶۴۰px فقط آیکون) + پیام‌های
  toast «برگشت به عقب: …» / «رفتن به جلو: …».
- میانبرهای Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z و رفتار دکمه‌ها E2E شد (جابه‌جایی → undo → redo).

### I-۵. تأیید عملکرد ابزارهای هاور کارت‌ها (درخواست ۲)
در هر دو نسخه E2E شد که دکمه‌های هاور **واقعاً کار می‌کنند** (نه فقط جابه‌جایی محل §۱۰.۶):
- «جابه‌جایی به بالا/پایین» ← جابه‌جایی sortOrder تأیید شد (وب و آفلاین).
- «ویرایش گره» (دستی) ← دیالوگ ویرایش باز و برچسب ذخیره شد («بازرسی میان‌مرحله‌ای (ویرایش‌شده)»).
- «حذف گره» ← تأیید حذف دائمی ← گره حذف (۶→۵) ← Ctrl+Z بازگشت (۵→۶).
- عناصر زنجیره‌ای به‌جای ویرایش/حذف، «اطلاعات فعالیت» دارند (طراحی درست).

### I-۶. اصلاحات جنبی
- `scripts/setup-browser-v152-final.ts`: مسیر قدیمی `/api/sessions/:id/cells/:no` →
  مسیر صحیح `/api/cycles/:id/cells` (fixture مرورگر اکنون دادهٔ چرخه‌ها را واقعاً می‌نویسد؛
  seed خودکار element_observations از ۰ به ۴۲ رسید و ST/داشبورد محاسبه شد).
- tsc: رفع تضاد اسکریپت‌های fixture (module scope) + امضای تست anchor.

### I-۷. نتایج تست دور دوم
| مجموعه | نتیجه |
|--------|-------|
| `test-offline-core.js` | ۱۳۱/۰ |
| `test-offline-fixes.js` (bun) | ۶۶/۰ |
| `test-offline-transposed.js` | ۷۲/۰ |
| `test-migration-persist.js` | ۵/۰ |
| `test-transposed-sheet.ts` (وب) | ۹۷/۰ |
| `test-chart-anchors.ts` §۲۱.۲ | ۸۳/۰ |
| `bunx tsc --noEmit` | ۰ خطا |
| `bun run lint` | ۰ خطا (۲ هشدار پیشین) |

اسنپ‌شات‌های جدید این دور: `on-chart-pdf-*` (FIT/TILED/DARK + PNGها)، `off-chart-pdf-*`،
`on/off-dashboard-*-fixed`، `on/off-parallel-added`، `on/off-undo-labels`،
`on-charts-opc-verify`، `on-dark-charts-verify`.
