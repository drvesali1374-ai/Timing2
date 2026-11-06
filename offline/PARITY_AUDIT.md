# گزارش ممیزی هم‌ارزی نسخه آفلاین — Timing2

**تاریخ ممیزی:** ۶ نوامبر ۲۰۲۶
**Commit مرجع نسخه اصلی:** `b36b333` (شاخه `main` — بدون هیچ تغییری در `src/**`)
**محدوده اصلاح:** فقط `offline/**`، `Timing2-Offline.html` (ترتیب بارگذاری) و `scripts/test-offline-core.js` (قابلیت حمل)
**روش:** مقایسه سورس (نسخه اصلی مرجع) + اجرای زنده هر دو نسخه در مرورگر + Screenshot + مقایسه VLM

---

## ۱. نقشه فایل‌های بررسی‌شده

| نسخه اصلی (مرجع) | نسخه آفلاین | وضعیت بررسی |
|---|---|---|
| `HomeView.tsx` | `views-home.js` | ✅ بررسی و اصلاح شد |
| `AppShell.tsx` | `app.js` (renderChrome) | ✅ بررسی و اصلاح شد |
| `TopBar.tsx` | `app.js` (topbar) | ✅ بررسی و اصلاح شد |
| `StageSidebar.tsx` | `app.js` (buildSidebar) | ✅ بازنویسی شد |
| `HelpPanel.tsx` | `app.js` (buildHelpPanel) | ✅ بازنویسی شد |
| `AppFooter.tsx` | `app.js` (buildAppFooter) | ✅ هم‌ارز شد |
| `app-store.ts` | وضعیت `helpOpen`/`sidebarCollapsed` در `app.js` | ✅ مقدار اولیه یکسان شد |
| `JalaliDatePicker.tsx` | `datepicker.js` (جدید) | ✅ پورت وفادار کامل |
| `HelpDot.tsx` | `ui.js` (helpDot) | ✅ (workaround تکراری حذف شد) |
| `StatusBadge.tsx` | `ui.js` (badges) | ✅ رنگ/آیکون هم‌تراز شد |
| `Feedback.tsx` (EmptyState) | `ui.js` + `app.css` | ✅ هم‌تراز شد |
| `SaveIndicator.tsx` | `ui.js` | ✅ بدون تغییر (هم‌ارز بود) |
| `ProjectInfoView.tsx` | `views-info.js` | ✅ اصلاحات جزئی |
| `StructureView.tsx` | `views-structure.js` | ✅ ردیف‌های درخت بازنویسی شد |
| `OperatorsView.tsx` | `views-operators.js` | ✅ (حذف CSS تزریقی) |
| `GroupsView.tsx` | `views-allowances.js` | ✅ رندر سالم |
| `WestinghouseView.tsx` | `views-westinghouse.js` | ✅ رندر سالم |
| `TimingView.tsx` + `timing/*` | `views-timing.js` | ✅ رندر سالم (تست هسته پوشش داده) |
| `AnalysisView.tsx` + `analysis/*` | `views-analysis.js` | ✅ رندر سالم |
| `ChartsView.tsx` + `charts/*` | `views-charts.js` | ✅ رندر سالم |
| `DashboardView.tsx` | `views-dashboard.js` | ✅ رندر سالم |
| `ReportsView.tsx` | `views-reports.js` | ✅ overflow موبایل رفع شد |
| `DataView.tsx` | `views-data.js` | ✅ رندر سالم |
| `globals.css` | `offline/css/app.css` | ✅ قرارداد آیکون + اجزای جدید |
| `lib/jalali.ts` | `utils.js` + `datepicker.js` | ✅ (کد تکراری قدیمی حذف شد) |
| `SortableList.tsx` | الگوی درگ `views-structure.js` | ✅ grip محوشونده هم‌ارز شد |

---

## ۲. ماتریس اختلاف‌ها

| شناسه | حوزه | شرح تفاوت | فایل مرجع اصلی | فایل آفلاین | شدت | وضعیت | شاهد آزمون |
|---|---|---|---|---|---|---|---|
| UI-001 | آیکون‌ها | نبود قرارداد سراسری اندازه `svg.icon`؛ تزریق دیرهنگام توسط structure/operators؛ قانون مرده `.nav-item .nav-icon`؛ آیکون‌های غول‌پیکر در اولین بارگذاری | `StageSidebar.tsx` (size-4.5) | `app.css`, `utils.js`, `views-structure.js`, `views-operators.js` | بحرانی | ✅ رفع و آزموده شد | تست مرورگری: همه آیکون‌ها ۱۸px از فریم اول؛ پس از عبور از ۱۱ مرحله صفر آیکون >۲۶px (جز Empty State ۲۸px طبق مرجع) |
| UI-002 | تقویم | ورودی تاریخ = متن ساده + دکمه «امروز»؛ نبود Popover، ناوبری ماه/سال، امروز، پاک‌کردن، ورود دستی؛ نادیده‌گرفتن تنظیم میلادی/ارقام | `JalaliDatePicker.tsx` | `datepicker.js` (جدید) + `views-home.js` + `views-info.js` | بحرانی | ✅ رفع و آزموده شد | تست مرورگری کامل (باز/بسته، ماه/سال، انتخاب روز، ورود دستی فارسی/لاتین، خطای نامعتبر، Esc، میلادی، پایداری ISO) |
| UI-003 | پنل راهنما | `helpOpen=true` اولیه؛ حالت بسته بدون آیکون لامپ/استایل لبه‌ای؛ چیدمان پنل باز متفاوت؛ متن راهنمای data اضافه | `HelpPanel.tsx`, `app-store.ts` | `app.js` | زیاد | ✅ رفع و آزموده شد | بسته در شروع ✓ کنترل لامپ ✓ باز از لبه/TopBar ✓ بستن با X/دکمه ✓ عرض 288px ✓ |
| UI-004 | سایدبار | CSS حالت collapsed بدون دکمه/منطق؛ آیتم‌های دوخطی به‌جای تک‌خطی؛ نبود سربرگ «منوی پروژه»؛ نبود بج «فاز N»؛ stage-dot ۷px | `StageSidebar.tsx` | `app.js`, `app.css` | زیاد | ✅ رفع و آزموده شد | 268↔۶۴px ✓ ۱۱ دکمه حالت جمع‌شده ✓ حفظ نما ✓ |
| UI-005 | تست هسته | مسیر مطلق `/home/z/my-project/...` غیرقابل حمل | — | `scripts/test-offline-core.js` | زیاد | ✅ رفع و آزموده شد | اجرای موفق از `/home/z/my-project` و از کلون `/tmp/t2clone` (85/85) |
| UI-006 | HelpDot | تزریق workaround تکراری `t2-helpdot-fix` در home/info در حالی که app.css از قبل `display:none` دارد | `HelpDot.tsx` | `views-home.js`, `views-info.js` | کم | ✅ رفع شد | حذف کد؛ پاپ‌اور همچنان مخفی تا کلیک |
| UI-007 | TopBar | آیکون منوی موبایل `moreVertical` به‌جای `Menu`؛ عنوان دوخطی به‌جای تک‌خطی؛ نهایی‌سازی در موبایل مخفی نمی‌شد؛ دکمه‌ها ۳۲px به‌جای ۳۶px؛ divider همیشه‌نمای ۲۲px | `TopBar.tsx` | `app.js`, `app.css`, `utils.js` | متوسط | ✅ رفع و آزموده شد | موبایل: منو ✓ نهایی‌سازی مخفی ✓ دسکتاپ: برعکس ✓ |
| UI-008 | فوتر | متن/اندازه متفاوت؛ متن «نسخه آفلاین ۱٫۰» اضافه؛ نبود فوتر استاندارد در خانه | `AppFooter.tsx`, `HomeView.tsx` | `app.js`, `app.css` | متوسط | ✅ رفع و آزموده شد | متن یکسان «زمان‌سنجی صنعتی · نسخه اول — کامل (۷ فاز)» در خانه و پروژه |
| UI-009 | بج‌های وضعیت | IN_PROGRESS=brand به‌جای cyan+hourglass؛ NEEDS_REVIEW=red به‌جای amber؛ نبود آیکون؛ DRAFT بدون circleDashed؛ stage-dot رنگ‌های غلط | `StatusBadge.tsx` | `ui.js`, `app.css` | متوسط | ✅ رفع و آزموده شد | بج TopBar با آیکون hourglass ۱۲px ✓ |
| UI-010 | خانه | بج «نسخه آفلاین» کنار تم؛ دراپ‌داون جهت مرتب‌سازی اضافه؛ نبود آیکون جستجو داخل فیلد؛ سربرگ غیرچسبان با عنوان ۲۱px؛ EmptyState پکاژ به‌جای کارخانه؛ بنر با لامپ به‌جای موشک؛ حذف فوتر استاندارد | `HomeView.tsx` | `views-home.js`, `ui.js`, `app.css` | زیاد | ✅ رفع و آزموده شد | سربرگ چسبان ۶۴px ✓ جستجو با آیکون ✓ مرتب‌سازی ۳گزینه‌ای ✓ فوتر ✓ |
| UI-011 | viewport موبایل | overflow افقی در ساختار (دکمه‌های بالا/پایین + grip همیشه‌نما) و گزارش (جدول‌های بدون wrapper) | `StructureView.tsx`, `ReportsView.tsx` | `views-structure.js`, `views-reports.js`, `app.css` | زیاد | ✅ رفع و آزموده شد | ۱۱/۱۱ نما بدون overflow در 390px |
| UI-012 | ردیف درخت ساختار | ترتیب/اجزای متفاوت؛ نبود chevron باز/بسته؛ گره با آیکون arrowLeft اضافه | `StructureView.tsx` (ردیف ۸۸۰–۱۰۱۰) | `views-structure.js` | متوسط | ✅ رفع و آزموده شد | chevron چرخان ✓ grip محوشونده ✓ ساختار هم‌تراز |
| UI-013 | حفظ وضعیت نما | تغییر تم/راهنما/سایدبار کل نما را پاک می‌کرد (از دست رفتن فرم) | (رفتار ضمنی React) | `app.js` (keepView) | زیاد | ✅ رفع و آزموده شد | تغییر تم: مقدار فیلد فرم حفظ شد ✓ |
| UI-014 | hashchange تکراری | کلیک روی مرحله فعال → رندر مجدد کامل و از دست رفتن وضعیت | (رفتار ضمنی React) | `app.js` | متوسط | ✅ رفع شد | مسیر یکسان → بدون رندر |
| UI-015 | EmptyState | padding/شکل/اندازه آیکون متفاوت (۴۴px/گرد/۲۴px به‌جای ۴۰px/گرد۲xl/۲۸px)؛ حاشیه ۱.۵px به‌جای ۱px | `Feedback.tsx` | `ui.js`, `app.css` | کم | ✅ رفع شد | — |
| UI-016 | مشخصات پروژه | آیکون تنظیمات=percent به‌جای calculator؛ عملیات=databaseBackup به‌جای database؛ h2 ضخامت متفاوت؛ متادیتای ایجاد/تغییر یک‌خطی به‌جای دوطرفه | `ProjectInfoView.tsx` | `views-info.js`, `utils.js` | کم | ✅ رفع شد | — |
| UI-017 | لایه CSS | `.hidden` بدون اولویت درست → `sm:inline-flex`/`xl:block` کار نمی‌کردند (نهایی‌سازی در موبایل می‌ماند، پنل راهنما در xl مخفی) | (ترتیب لایه‌های Tailwind) | `app.css` | متوسط | ✅ رفع و آزموده شد | رفتار breakpoint با نسخه اصلی یکی شد |
| ADD-01 | خانه (عمدی) | دکمه «بارگذاری داده دمو» و خط راهنمای محل ذخیره‌سازی — افزودنی آفلاین برای آزمون‌پذیری/آگاهی از محل داده مرورگر. **مستند و عمدی**؛ حذف آن مانع تست می‌شود | ندارد | `views-home.js` | — | 📌 عمدی — ثبت شد | — |
| ADD-02 | راهنمای مرحله data (عمدی) | حذف شد تا مانند نسخه اصلی متن جایگزین نمایش یابد | `HelpPanel.tsx` (بدون مدخل data) | `app.js` | کم | ✅ هم‌تراز شد | — |

### تصمیم‌های فنی

1. **DatePicker:** به‌جای wrapper متن، کامپوننت مستقل `offline/js/datepicker.js` با API هم‌ارز `JalaliDatePicker.tsx` ساخته شد (Popover، ناوبری ماه/سال، ورود دستی، پاک‌کردن، حالت میلادی `input[type=date]`، ارقام از تنظیمات، flip برخورد با لبه صفحه). رابط `{el, getISO, setISO}` برای سازگاری با فرم‌های موجود حفظ شد.
2. **keepView:** `renderChrome({keepView:true})` عنصر `#view-container` موجود را به شل جدید منتقل می‌کند تا تغییر تم/سایدبار/راهنما وضعیت فرم‌ها را پاک نکند.
3. **قرارداد آیکون:** `svg.icon {16px}` سراسری + اندازه‌های context-specific (nav-item ۱۸px، badge ۱۲px، icon-btn.lg ۱۸px و…) — مطابق کلاس‌های lucide مرجع. CSS تزریقی viewها حذف شد.
4. **درخت ساختار:** دکمه‌های بالا/پایین از درخت حذف شدند (نسخه اصلی فقط DnD دارد)؛ در لیست‌های پنل جزئیات فقط دسکتاپ (`hidden sm:inline-flex`) باقی ماندند.
5. **کد تکراری جلالی:** پیاده‌سازی موازی قدیمی `jalaliToISOLocal` حذف شد؛ هسته تست‌شده `U.jalaliToISO` استفاده می‌شود.

### موارد نیازمند دسترسی runtime که آزموده نشدند

- مقایسه پیکسلی دقیق خروجی چاپ/PDF دو نسخه (پنجره چاپ در اتوماسیون مرورگر قابل دسترسی نیست) — هر دو از همان CSS چاپ و ساختار A4 استفاده می‌کنند.
- Drag & Drop با اشاره‌گر لمسی واقعی (فقط شبیه‌سازی برنامه‌ای/منطقی آزموده شد).
- رفتات مرورگرهای غیر از Chromium.
