# گزارش پیاده‌سازی جلسه اول — سیستم الونس‌های سلسله‌مراتبی و بازطراحی ساختار

**تاریخ:** ۱۴۰۵/۰۸/۲۲ (۲۰۲۶-۱۱-۱۱)
**شاخه مبنا:** `v1.3.0-allowance-hierarchy` (از `main` در کامیت `ddb10c8` — شامل `3b953e3` به‌علاوه پوشه Instructions)
**دامنه:** نسخه آنلاین (Next.js) و نسخه آفلاین (`offline/` + `Timing2-Offline.html`) — هم‌ارزی عملکردی و بصری
**سند مرجع:** `Instructions/Prompt-Session-1-Allowance-and-Structure.txt`

---

## ۱. کامیت‌ها

| # | موضوع |
|---|---|
| ۱ | مدل داده + منطق دامنه + سرویس‌ها + APIها + مهاجرت (آنلاین) |
| ۲ | UI: AllowanceSection + بازطراحی GroupsView + درخت ۴ سطحی StructureView + اصلاحات مشترک |
| ۳ | نسخه آفلاین: موتور + db v۲ + نماها + CSS + تست‌ها |
| ۴ | مستندات + گزارش‌ها |

(تاریخچه کامیت‌های نامعتبر پیشین با squash تمیز شد؛ SHA نهایی در GitHub.)

## ۲. فایل‌های تغییرکرده

### آنلاین (Next.js)
- **جدید:** `src/calculation/effective-allowances.ts` (موتور resolve + ST عنصر)، `src/application/effective-allowance-service.ts` (سرویس کامل)، `src/views/project/allowances/AllowanceSection.tsx` (بخش UI واحد)، ۵ مسیر API جدید (`projects/[id]/allowance-definitions`, `allowance-definitions/[id]`, `projects/[id]/allowances`, `stations/[id]/allowances`, `elements/[id]/allowances`)، `scripts/migrate-allowances.ts`، `scripts/verify-session1.ts`
- **بازنویسی کامل:** `src/views/project/GroupsView.tsx` (سه زبانه)، `src/views/project/StructureView.tsx` (درخت ۴ سطحی)
- **ویرایش:** `prisma/schema.prisma` (+۲ مدل)، `src/domain/types.ts`، `src/domain/validation.ts`، `src/application/allowance-service.ts` (حذف منطق قدیمی، نگه‌داشتن CRUD گروه/دسته legacy)، `src/application/analysis-service.ts`، `src/application/report-service.ts`، `src/application/calculation-run-service.ts` (snapshot §۴.۲)، `src/infrastructure/serialize.ts` (SCHEMA_VERSION=۲)، `src/infrastructure/package-io.ts`، `src/infrastructure/excel-export.ts`، `src/lib/api/endpoints.ts`، `src/lib/api/keys.ts`، `src/views/project/ActivityView.tsx`، `src/views/project/analysis/AnalysisContent.tsx`، `src/views/project/ReportsView.tsx`، `src/components/common/HelpDot.tsx` (stopPropagation §۸.۲)، `src/app/globals.css` (`.card-head` + سیاست alignment §۸.۳)، `scripts/verify-phase1-2.ts` + `verify-phase4.ts` (به‌روز به مدل جدید)
- **حذف:** `src/app/api/groups/[id]/allowances/route.ts` (منبع دوم محاسبه — §۵)

### آفلاین (`offline/`)
- `js/formulas.js` (+resolver، +computeElementStandardTime، +validateAssignmentValue — پورت دقیق)
- `js/db.js` (+۲ جدول، SCHEMA_VERSION=۲، مهاجرت v۱→v۲ در load با مارکر، سرویس کامل scope/definitions/migration، تحلیل با resolver، snapshot جدید، serialization + remap چندشکلی + import/duplicate hooks، seedDemo مدل جدید)
- `js/views-allowances.js` (بازنویسی کامل — سه زبانه + `_allowanceSection` مشترک)
- `js/views-structure.js` (درخت ۴ سطحی + جست‌وجو + دیالوگ عنصر با الونس + پنل ایستگاه با الونس + chevron/کلیک مستقل)
- `js/views-analysis.js`، `js/views-reports.js` (بخش الونس جدید)
- `js/ui.js` (ariaLabel در percentInput)، `js/utils.js` (+۶ آیکون)، `css/app.css` (.card-head + alignment)
- `scripts/test-offline-core.js` (+۴۳ assertions جلسه اول)

## ۳. مدل تعریف مرکزی و تخصیص (§۲)

- `AllowanceDefinition`: id, projectId, title (اجباری), code, description, defaultValueType (PERCENT|FIXED_TIME), defaultValuePercent (اعشاری), defaultTimeSeconds, isActive, sortOrder, isArchived, timestamps. مقدار پیش‌فرض صرفاً پیشنهاد فرم است؛ تغییر آن تخصیص‌ها را تغییر نمی‌دهد (تست ۱۲).
- `AllowanceAssignment`: definitionId, scopeType (PROJECT|STATION|ACTIVITY|WORK_ELEMENT), scopeId (چندشکلی؛ برای PROJECT همان projectId), mode (ACTIVE|EXCLUDE), valueType, percentValue XOR timeValueSeconds, applicationBasis (PER_ELEMENT_EXECUTION|PER_CYCLE فقط برای FIXED_TIME), timestamps. یگانی `(definitionId, scopeType, scopeId)` — بدون duplicate (تست ۱۵).
- سطح «خط تولید» با خود Project نمایش داده شد؛ جدول تکراری ساخته نشد (تصمیم §۰.۳۰).

## ۴. قواعد ارث‌بری (§۲.۴)

resolve از برگ به ریشه؛ نزدیک‌ترین تصمیم ملاک. برچسب‌ها: INHERITED / OVERRIDDEN (محلی با والد) / CUSTOM (محلی بدون والد) / EXCLUDED. EXCLUDE شاخه را غیرفعال؛ تعریف مجدد پایین‌تر بازفعال؛ RESTORE تصمیم محلی را حذف و تصمیم والد را برمی‌گرداند. ارث‌بری افقی ممنوع (تست ۱۰). کپی تکراری در DB ذخیره نمی‌شود — همیشه resolve در لحظه.

## ۵. فرمول‌ها (§۳)

- `P = Σ effectivePercentAllowances` (نزدیک‌ترین تخصیص هر تعریف)
- `T = Σ fixedTimeSeconds for PER_ELEMENT_EXECUTION` (فقط تعریف‌های سطح WORK_ELEMENT در ST عنصر)
- `ST_element = computeStandardTime(NT, P, method) + T` — اول درصد، بعد زمان ثابت
- دو روش حفظ شدند: `PERCENT_OF_NT: NT×(1+P)` و `SHARE_OF_ST: NT/(1−P)` با قید P<۱ — تست مرجع 9.047/0.15 → 10.40405 / ≈10.643529 بدون تغییر پاس.
- PER_CYCLE دقیقاً یک‌بار در activityTotal (dedupe با definitionId بین سطح فعالیت و عناصر)؛ در ST عناصر هرگز ضرب نمی‌شود.
- زمان ثابت PER_ELEMENT_EXECUTION در سطح بالاتر از عنصر → «نیازمند قاعده تجمیع» با اعلان صریح؛ بی‌صدا حذف/چندباره اعمال نمی‌شود.
- پیش‌فرض مبنا: عنصر → PER_ELEMENT_EXECUTION؛ سطح‌های بالاتر → PER_CYCLE (زمان شخصی/شیفتی در تک‌تک عناصر ضرب نشود).

## ۶. مهاجرت (§۴)

`migrateProjectAllowancesIfNeeded` — transactional، تکرارپذیر با مارکر `migration.allowanceModel=v2` در ProjectSetting، قابل گزارش (MigrationReport). دسته‌ها → تعریف با **حفظ ID**؛ مقدار مؤثر قدیم هر فعالیت (override > group) → تخصیص ACTIVITY؛ عنصرها بدون کپی؛ داده قدیمی حفظ (legacy). اجرای خودکار: هنگام هر `loadProjectAllowanceContext` (self-heal)، پس از import بسته قدیمی، پس از duplicate. اسکریپت مستقل: `bun scripts/migrate-allowances.ts`.

## ۷. درخت ساختار (§۷)

چهار سطح: پروژه (ریشه: نام + خط + محصول) ← ایستگاه ← فعالیت ← عنصر. کلیک نام/بدنه = فقط انتخاب (فعالیت → صفحه اختصاصی؛ عنصر → دیالوگ ویرایش با الونس)؛ chevron مستقل = فقط باز/بسته. جست‌وجو در نام هر سه سطح؛ نتایج مسیر والد را باز می‌کنند. شمارش فرزندان کنار هر گره. DnD سه سطح با محدوده مجاز (عنصر فقط درون فعالیت خودش). باز/بستن همه. دکمه ویرایش مشخصات پروژه در ریشه. ظاهر: کارت ایستگاه (bg-card، border واضح) متمایز از ردیف فعالیت (bg-surface-2، border ظریف مستقل)؛ ردیف عنصر فشرده؛ badge نوع فرایند کنار نام فعالیت؛ عملیات ویرایش/حذف عمودی در چپ RTL.

## ۸. پایه بصری مشترک (§۸)

- `.card-head` (globals.css + app.css): گرادیان ملایم + divider نازک برای هدر کارت‌های اصلی؛ KPI/nested بدون header تکراری.
- HelpDot: stopPropagation روی trigger (click+keydown) و محتوای popover (click+keydown+wheel) — §۸.۲.
- سیاست alignment (§۸.۳): هدر همه ستون‌ها center؛ داده کوتاه/عدد/status center؛ متن بلند right؛ عددها `tabular-nums`+`ltr` — به‌صورت CSS مشترک (وب: `table.tbl*`، آفلاین: `table.table*`).

## ۹. تست‌های اجراشده (واقعی)

| مجموعه | نتیجه |
|---|---|
| `bun scripts/verify-session1.ts` (§۱۰.۱ ۱۵ ارث + §۱۰.۲ محاسبات/رد مقادیر + §۱۰.۳ مهاجرت + مرجع فرمول‌ها) | **۵۹/۵۹ پاس** |
| `bun scripts/verify-phase1-2.ts` (به‌روز به مدل جدید) | **۱۰۲/۰** |
| `bun scripts/verify-phase3.ts` | **۸۳/۰** |
| `bun scripts/verify-phase4.ts` (به‌روز؛ B2 با تخصیص خط) | **۶۸/۰** |
| `bun scripts/verify-phase5.ts` | **۶۰/۰** |
| `bun scripts/test-offline-core.js` (+۴۳ assertion جلسه ۱) | **۱۲۸/۰** |
| `node --check offline/js/*.js` | همه معتبر |
| `npx tsc --noEmit` | بدون خطا |
| `bun run lint` | ۰ خطا (۱ هشدار پیش‌ existing در datepicker) |

مقادیر اجباری تأیید: P=0.08 (۵٪+۳٪)؛ ST=108 (روش۱)؛ ST≈108.695652173913 (روش۲)؛ +2.5s → 110.5؛ PER_CYCLE یک‌بار: activityTotal=140.5؛ سه چرخه بدون ضرب تعداد؛ قاعده تجمیع ایستگاه → ST عنصر دست‌نخورده.

### تایید مرورگر (agent-browser)
- **وب (localhost:3000):** درخت ۴ سطحی + جست‌وجو («چهار پیچ» → مسیر والد باز) + chevron/کلیک مستقل + پنل ایستگاه با AllowanceSection + سه زبانه مجازها + جایگزینی ۳۰۰→۴۲۰ از UI + دیالوگ عنصر با الونس + صفحه فعالیت + افزودن override ۷٪ از popover (ردیف OVERRIDDEN با نوت) + تم تیره + viewport 390 — **بدون هیچ خطای صفحه/کنسول**.
- **آفلاین (file://):** seed دمو → درخت + پنل ایستگاه + صفحه فعالیت با جدول الونس (ارث‌رسیده) + سه زبانه + افزودن تخصیص خط ۴٪ از UI (`totalPercent=0.04` تأیید از API داخلی) — **بدون خطا**.

## ۱۰. پارتی آنلاین/آفلاین

هر دو نسخه از یک منطق دامنه یکسان (پورت خط‌به‌خط) استفاده می‌کنند: `resolveEffectiveAllowances`، `computeElementStandardTime`، `validateAssignmentValue`، ساختار scope/chain/خلاصه، مهاجرت با همان مارکر و همان قواعد، snapshot با همان فیلدها. تست‌های parity با سناریوهای یکسان در هر دو اجرا شدند (§۱۰.۱/۱۰.۲/۱۰.۳ در `verify-session1.ts` و `test-offline-core.js` با اعداد یکسان). اختلاف باقی‌مانده: ندارد در دامنه این جلسه.

## ۱۱. محدودیت‌ها و تصمیم‌های فنی

1. **تعداد اجرای عنصر در چرخه:** داده فعلی فرکانس اجرا ندارد (هر عنصر حداکثر یک مشاهده در هر چرخه)؛ «per execution متناسب با تعداد واقعی اجرا» (§۳.۲) به‌صورت عناصر تکرارشونده یا زیرسیستم فرکانس در **جلسه دوم** قابل افزودن است — به‌عنوان integration point مستند شد.
2. **دسته/گروه‌های قدیمی:** CRUD باقی است (طبقه‌بندی + سازگاری داده قدیمی)؛ `GroupAllowance` دیگر در هیچ مسیر محاسبه خوانده نمی‌شود.
3. **حذف مستقیم پروژه با Prisma خام** (فقط در اسکریپت تست): اگر ratingAssessment با Restrict مانده باشد FK می‌گیرد؛ مسیر رسمی حذف از UI سالم است (deletion.ts همه جداول را مدیریت می‌کند).
4. زبان همه رابط‌ها فارسی؛ برچسب‌گذاری «الونس» به‌علاوه «مجاز» برای وفاداری به سند جلسه اول.
5. SCHEMA_VERSION بسته/پشتیبان ۱→۲؛ بسته‌های v۱ هنوز قابل ورودند (اعتبارسنجی `> 2` رد؛ مهاجرت پس از درج اجرا می‌شود).

## ۱۲. چک‌لیست معیارهای پذیرش (§۱۱)

- [x] تعریف مرکزی از تخصیص تفکیک شده
- [x] Project/Line → Station → Activity → WorkElement درست resolve (۱۵ تست)
- [x] Override/Exclude/Restore واقعی و قابل تست
- [x] ارث‌بری بدون کپی تکراری در DB
- [x] درصد و زمان ثابت با type/basis صحیح
- [x] دو روش درصدی قبلی حفظ (تست مرجع بدون تغییر)
- [x] per execution / per cycle دوباره‌شماری نمی‌شوند
- [x] migration نتیجه قدیم را حفظ (0.15 override → CUSTOM 0.15)
- [x] snapshot تاریخی با فیلدهای §۴.۲
- [x] فرم‌های ایستگاه/فعالیت/عنصر به منطق مرکزی متصل
- [x] فهرست مرکزی قابل مدیریت (CRUD + آرشیو)
- [x] درخت کامل تا سطح عنصر
- [x] انتخاب و باز/بسته‌کردن مستقل
- [x] ظاهر کارت‌ها/فاصله‌ها/HelpDot/alignment یکپارچه
- [x] آنلاین و آفلاین هر دو پیاده‌سازی و تست شده
- [x] regression مهم ایجاد نشد (۱۰۲+۸۳+۶۸+۶۰ سبز)

## ۱۳. قرارداد داده و integration pointهای جلسه دوم

- `ResolvedAllowanceRow.needsAggregationRule` + `summary.needsAggregationCount`: زیرسیستم هم‌پوشانی جلسه ۲ می‌تواند قاعده تجمیع را تعریف و این ردیف‌ها را فعال کند.
- `ActivityAllowancesDto.perCycleTotal` در سطح فعالیت — پایه‌ی تجمیع چرخه‌محور جلسه ۲.
- `computeElementStandardTime(nt, factors, method)` تنها نقطه محاسبه ST عنصر است؛ جلسه ۲ فقط همین را گسترش دهد.
- بسته v۲ شامل `allowanceDefinition`/`allowanceAssignment` با remap چندشکلی `scopeId` — سازگار رو به عقب با v۱.
