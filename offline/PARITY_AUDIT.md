# ممیزی هم‌ارزی آنلاین/آفلاین — نسخه ۱.۳.۰ (جلسه اول)

**تاریخ:** ۱۴۰۵/۰۸/۲۲ · **مرجع وب:** شاخه `v1.3.0-allowance-hierarchy` · **دامنه:** جلسه اول — الونس‌های سلسله‌مراتبی + درخت ساختار + پایه بصری

## نتیجه کلی: هم‌ارز ✅

منطق دامنه در دو نسخه پورت خط‌به‌خط است؛ تست‌های parity با سناریو و اعداد یکسان در هر دو اجرا و پاس شدند.

## نگاشت فایل‌های کلیدی این جلسه

| منطق | وب | آفلاین |
|---|---|---|
| resolve/ST/اعتبارسنجی | `src/calculation/effective-allowances.ts` | `js/formulas.js` (تابع‌های هم‌نام) |
| سرویس scope/definitions/migration | `src/application/effective-allowance-service.ts` | `js/db.js` (تابع‌های هم‌نام) |
| تحلیل با resolver | `src/application/analysis-service.ts` | `db.js getActivityAnalysis` |
| snapshot (§۴.۲) | `calculation-run-service.ts compactActivity` | `db.js compactActivity` (فیلدهای یکسان) |
| serialization/remap | `serialize.ts` + `package-io.ts` (v۲) | `db.js` SINGULAR/DOMAIN_ORDER/FK_MAP (v۲) |
| بخش UI الونس | `AllowanceSection.tsx` | `views-allowances.js _allowanceSection` |
| مدیر تعاریف + ۳ زبانه | `GroupsView.tsx` | `views-allowances.js` |
| درخت ۴ سطحی | `StructureView.tsx` | `views-structure.js` |
| HelpDot §۸.۲ | `HelpDot.tsx` stopPropagation | `ui.js helpDot` (از قبل داشت) |
| card-head §۸.۱ | `globals.css` | `app.css` |
| alignment §۸.۳ | `globals.css table.tbl*` | `app.css table.table*` |

## آیتم‌های ممیزی این جلسه (همه حل‌شده)

1. **تعریف مرکزی/تخصیص** — DTO یکسان: `ScopeAllowancesDto` وب ≡ خروجی `getScopeAllowances` آفلاین (scope/chain/descendants/settings/definitions/resolved/localAssignments/lastModifiedAt).
2. **چندشکلی scopeId در export/import** — هر دو `ASSIGNMENT_SCOPE_TABLE` + remap اختصاصی + حذف ردیف بی‌مقصد.
3. **مهاجرت v۱→v۲** — همان مارکر `migration.allowanceModel=v2`، همان قاعده مقدار مؤثر (override>گروه، دسته غیرفعال نادیده)، حفظ ID دسته، تکرارپذیری.
4. **seedDemo** — هر دو مدل جدید (تعریف + تخصیص ACTIVITY ۵٪+۳٪ → P=0.08).
5. **درخت** — همان ساختار چهار سطحی، chevron/کلیک مستقل، جست‌وجو با باز شدن مسیر والد، شمارش کنار گره، badge نوع فرایند کنار نام فعالیت، عملیات عمودی چپ RTL.
6. **عنوان مرحله** — «مجازها و الونس‌ها» در هر دو (STUDY_STAGES).
7. **گروه‌ها** — فقط طبقه‌بندی؛ برچسب «گروه فعالیت (طبقه‌بندی)»؛ منبع دوم محاسبه حذف در هر دو.
8. **آیکون‌های جدید** — tags/listPlus/circlePlus/archive/folderTree/chevronsUpDown/chevronsDownUp به `utils.js` اضافه شدند (پورت SVG مطابق lucide وب).
9. **percentInput** — آفلاین حالا ariaLabel می‌پذیرد (برابری دسترس‌پذیری).
10. **خلاصه §۶** — تعداد مؤثر/جمع A/per-execution/per-cycle جدا + فرمول badge — یکسان در هر دو.

## تصمیمات فنی ثبت‌شده

- سطح خط = خود Project (جدول تکراری نه).
- پیش‌فرض مبنا: WE → PER_ELEMENT_EXECUTION؛ سایر سطوح → PER_CYCLE.
- حذف تعریف دارای سابقه → آرشیو (`isArchived`) در هر دو.
- per-execution در سطح بالاتر از عنصر → «نیازمند قاعده تجمیع» (اعلان صریح؛ نه حذف بی‌صدا).


---

# ممیزی هم‌ارزی — جلسه دوم (نسخه ۱.۴.۰)

**تاریخ:** ۱۴۰۵/۰۸/۲۶ · **مرجع وب:** شاخه `v1.4.0-session2-parallel-ui` · **دامنه:** ماتریس هم‌پوشانی + زمان‌سنجی/تحلیل/داشبورد/نمودار/گزارش

## نتیجه کلی: هم‌ارز ✅

## نگاشت فایل‌های کلیدی جلسه دوم

| منطق | وب | آفلاین |
|---|---|---|
| موتور هم‌پوشانی | `src/calculation/overlap-matrix.ts` | `js/formulas.js` (پورت خط‌به‌خط — تست parity ۵۲/۵۲) |
| سرویس مرکزی رابطه/ماتریس/مقدار | `src/application/overlap-service.ts` | `db.js` (listOverlapRelations/create/archive/restore/getOverlapMatrix/setCycleOverlaps/getElementRelations) |
| stage ماتریس | `MatrixView.tsx` + `matrix/*` (۷ جزء) | `views-matrix.js` (۱۱۲۱ خط) |
| بخش روابط فرم عنصر | `ParallelRelationsSection.tsx` + `ElementParallelPopover.tsx` | `views-matrix.js _parallelRelationsSection` |
| بوم zoom/anchor/orthogonal/snapshot/PDF | `charts/ChartCanvas.tsx` + `PdfExportDialog.tsx` | `views-charts.js` (بازنویسی) |
| ProcessSymbol مشترک | `components/common/ProcessSymbol.tsx` | `ui.js processSymbol` |
| زیرهدر timing | `timing/TimingSubheader.tsx` | `views-timing.js t2t-subheader` (sticky/56px) |
| پنل SUSPECT | `timing/SuspectDiagnosticDialog.tsx` | `views-timing.js` (دیالوگ تشخیص) |
| مرکز گزارش‌ها | `ReportsView.tsx` + API report-settings | `views-reports.js` + `DB.getReportSettings/putReportSettings` |
| داده v۳ | Prisma (OverlapRelation/ObservationOverlap/outlierSnapshot/anchors) | db.js TABLES/SINGULAR/FK_MAP + مهاجرت load() |

## راستی‌آزمایی واقعی این جلسه

- تست parity موتور: ۸ fixture دستی + ۲۰۰ مجموعه تصادفی seed ثابت روی هر دو موتور — نتایج دقیقاً یکسان (scripts/test-overlap-parity.ts — ۵۲/۵۲).
- رگرسیون هسته: ۱۳۰/۱۳۰ (شامل schema v۳ و سازگاری بسته v۲).
- مرورگر file://: موتور T2F/T2DB بارگذاری، seed با ۳ رابطه موازی، getOverlapMatrix/setCycleOverlaps با union،
  UI مرحله ماتریس (جدول + انتخاب چرخه + chips بررسی‌نشده)، زیرهدر sticky، toolbar بوم، مرکز گزارش‌ها — بدون خطای کنسول.
- اسکرین‌شات‌ها: `parity-shots/session2/` (وب و آفلاین).
