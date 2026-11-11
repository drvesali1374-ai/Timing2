/* ═══════════════════════════════════════════════════════════
   برنامه اصلی — روتر و شل — نسخه آفلاین
   هم‌ارز AppShell/TopBar/StageSidebar/HelpPanel/AppFooter
   حالت اولیه: helpOpen = false و sidebarCollapsed = false
   (مطابق src/store/app-store.ts)
   ═══════════════════════════════════════════════════════════ */
(function (g) {
  'use strict';
  var U = g.T2U, DB = g.T2DB, UI = g.T2UI;

  var route = { name: 'home', projectId: null, stage: null, activityId: null };

  function parseHash() {
    var h = (g.location.hash || '').replace(/^#/, '');
    var m = /^\/p\/([^/]+)\/activity\/([^/]+)$/.exec(h);
    if (m) return { name: 'activity', projectId: m[1], activityId: m[2] };
    m = /^\/p\/([^/]+)\/([a-z]+)$/.exec(h);
    if (m) return { name: 'project', projectId: m[1], stage: m[2] };
    return { name: 'home' };
  }
  function navigate(hash) { g.location.hash = hash; }

  function initTheme() {
    var saved = null;
    try { saved = g.localStorage.getItem('timing2-theme'); } catch (e) {}
    applyTheme(saved || 'light');
  }
  function applyTheme(theme) {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try { g.localStorage.setItem('timing2-theme', theme); } catch (e) {}
  }
  function toggleTheme() {
    var dark = document.documentElement.classList.contains('dark');
    applyTheme(dark ? 'light' : 'dark');
    renderChrome({ keepView: true });
  }

  /* محتوای راهنمای مراحل — عیناً از HelpPanel.tsx (بدون مدخل data —
     نسخه اصلی برای «داده و پشتیبان» متن جایگزین نشان می‌دهد) */
  var STAGE_GUIDES = {
    info: { steps: ['نام پروژه، خط تولید، محصول و تاریخ مطالعه را کامل کنید.', 'روش اعمال مجاز را انتخاب کنید: درصدی از زمان نرمال یا سهم از زمان استاندارد.', 'روش تجمیع چند اپراتور را در تنظیمات محاسبات مشخص کنید.'], next: 'سپس به «ساختار تولید» بروید و ایستگاه‌ها را ثبت کنید.' },
    structure: { steps: ['ایستگاه‌های خط تولید را اضافه و با Drag & Drop مرتب کنید.', 'برای هر ایستگاه، فعالیت‌ها را با نوع فرایندی (عملیات/بازرسی/حمل‌ونقل/تأخیر/انبارش) ثبت کنید.', 'برای هر فعالیت، عناصر کاری را با نوع (دستی/ماشین/انتظار/هم‌زمان) تعریف کنید.', 'شناسه عناصر پایدار است؛ تغییر نام ارتباط تاریخی را از بین نمی‌برد.'], next: 'سپس اپراتورها را معرفی و گروه‌های مجاز را تعریف کنید.' },
    operators: { steps: ['هر اپراتور را با نام نمایشی و کد داخلی ثبت کنید.', 'اپراتور در سطح پروژه تعریف می‌شود و در چند فعالیت شرکت می‌کند.', 'برگه زمان‌سنجی هر اپراتور برای هر فعالیت مستقل خواهد بود (فاز ۳).'], next: 'سپس «گروه‌ها و مجازها» را تنظیم کنید.' },
    allowances: { steps: ['دسته‌های مجاز پروژه را تعریف کنید (مثلاً استراحت شخصی، نیازهای طبیعی، خستگی).', 'گروه‌های فعالیت بسازید و درصد هر دسته را در سطح گروه تعیین کنید.', 'فعالیت را به گروه تخصیص دهید؛ مقادیر به‌صورت ارث‌بری اعمال می‌شوند.', 'در صورت نیاز، هر دسته را در سطح فعالیت بازنویسی (Override) کنید.'], next: 'سپس ارزیابی وستینگهاوس عناصر را انجام دهید.' },
    westinghouse: { steps: ['جدول مرجع و منبع/نسخه آن را بازبینی کنید؛ جدول Seed صرفاً نقطه شروع است.', 'برای هر عنصر کاری، چهار عامل مهارت/تلاش/شرایط/یکنواختی را ارزیابی کنید.', 'ضریب R = ۱ + مجموع عوامل؛ برای هر عنصر یک‌بار ثبت و به همه مشاهدات همان عنصر اعمال می‌شود.', 'در صورت نیاز، ارزیابی را از عنصر مشابه کپی کنید.'], next: 'سپس در «زمان‌سنجی» جلسه بسازید و چرخه‌ها را ثبت کنید.' },
    timing: { steps: ['جلسه = فعالیت × اپراتور × روش کرنومتر؛ برای هر ترکیب جلسهٔ جدا بسازید.', 'روش را انتخاب کنید: برگشت به صفر (مقدار مستقل) یا پیوسته (قرائت تجمعی؛ تفاضل خودکار محاسبه می‌شود).', 'مقادیر را دستی وارد یا از Excel چندسلولی Paste کنید؛ پیش‌نمایش تطبیق ستون‌ها را ببینید.', 'برای عناصر هم‌زمان، در جزئیات چرخه بازهٔ مستقل (شروع/پایان) ثبت کنید؛ زمان سپری‌شده از گسترهٔ بازه‌ها به دست می‌آید نه جمع مدت‌ها.', 'خطای ورودی و دادهٔ مشکوک نمایش داده می‌شود؛ دادهٔ مشکوک فقط هشدار است و حذف نمی‌شود.'], next: 'سپس «تحلیل نتایج» را بازبینی کنید و مشکوک‌ها را تصمیم‌گیری کنید.' },
    matrix: { steps: ['ابتدا یک «رابطهٔ موازی» بین دو عنصر هم‌زمان تعریف کنید؛ فقط عناصر دارای رابطهٔ فعال وارد ماتریس می‌شوند.', 'یک چرخه انتخاب کنید؛ مقدار هر خانه فقط برای همان چرخه ثبت می‌شود و میانگین یا حدس زده نمی‌شود.', 'هر خانه سه وضعیت دارد: بررسی‌نشده (به معنی صفر نیست)، بدون هم‌پوشانی (تأیید صفر) یا دارای هم‌پوشانی (مقدار مثبت).', 'با «ثبت تغییرات»، هم‌پوشانی چندتایی و اعتبارسنجی مجدداً محاسبه می‌شود؛ دادهٔ غیرممکن رد می‌شود.', 'همهٔ نماها (ماتریس، فرم هر دو عنصر) به یک منبع داده وصل‌اند؛ تغییر از هر جا همه را به‌روز می‌کند.'], next: 'سپس «تحلیل نتایج» را بازبینی کنید و مشکوک‌ها را تصمیم‌گیری کنید.' },
    analysis: { steps: ['کارت‌های خلاصه را ببینید: پیشرفت نمونه، مشاهدات در محاسبات و نیازمند بازبینی.', 'برای هر عنصر، آمار کامل (میانگین، میانه، SD، CV و بازهٔ اطمینان) و OT/NT/ST را بازبینی کنید.', 'مشاهدات مشکوک را بررسی کنید: نگه‌داشتن (هشدار ≠ حذف) یا خروج با ثبت دلیل — دادهٔ خام همیشه حفظ می‌شود.', 'تغییر پارامتر مؤثر (ارزیابی، مجاز، روش) نتیجه را «نیازمند محاسبهٔ مجدد» می‌کند؛ با دکمهٔ اجرای محاسبه نسخهٔ جدید ثبت کنید.'], next: 'سپس «نمودار فرایند» را بازبینی و در پایان از «داشبورد» شاخص‌ها را ببینید.' },
    charts: { steps: ['با بازکردن این مرحله، گره‌ها خودکار از فعالیت‌ها ساخته می‌شوند (OPC: عملیات/بازرسی؛ FPC: هر پنج نوع).', 'توالی را با اتصال گره‌ها یا دکمه‌های ترتیب بالا/پایین کامل کنید.', 'گرهٔ دستی اضافی (مثلاً کنترل کیفیت) را در صورت نیاز اضافه کنید.', 'با درگ، چیدمان را شخصی کنید؛ مختصات ذخیره می‌شود و چیدمان خودکار جای آن را نمی‌گیرد.'], next: 'سپس «داشبورد» را برای شاخص‌های کلان و «گزارش‌ها» را برای خروجی باز کنید.' },
    dashboard: { steps: ['ابتدا کارت‌های خلاصه: زمان استاندارد (در صورت قابل محاسبه بودن)، میانگین چرخه، تعداد نمونه و وضعیت هدف.', 'اگر داده کافی نباشد، کارت علت را نشان می‌دهد — هرگز صفر یا مقدار ساختگی نمی‌بینید.', 'نمودارهای تخصصی را در بخش‌های بازشونده ببینید: مقایسهٔ فعالیت‌ها، توزیع وضعیت، اپراتورها و پراکندگی.', 'از «شخصی‌سازی»، کارت‌ها و نمودارها را مرتب یا مخفی کنید؛ چیدمان ذخیره می‌شود.', 'بخش «نیازهای بازبینی» موارد باقی‌مانده را با میان‌بر اقدام نشان می‌دهد.'], next: 'در پایان، گزارش رسمی را از «گزارش‌ها» تهیه و نهایی‌سازی کنید.' },
    reports: { steps: ['نوع گزارش Excel را انتخاب کنید: نگاه کل، خلاصهٔ محاسبات، مقایسهٔ اپراتورها یا داده‌های خام.', 'با فیلتر فعالیت/اپراتور، خروجی را محدود کنید؛ فیلتر هم روی Excel و هم گزارش رسمی اعمال می‌شود.', 'گزارش رسمی (پیش‌نمایش کاغذ A4) شامل فرمول‌ها، روش کرنومتر، وستینگهاوس، مجازها و داده‌های خارج‌شده است.', 'با «چاپ / ذخیره PDF» از پنجرهٔ چاپ مرورگر، PDF بومی و کاملاً آفلاین بسازید.', 'گزارش، نتیجهٔ نیازمند بازبینی را استاندارد قطعی معرفی نمی‌کند و موارد بازبینی را فهرست می‌کند.'], next: 'با اطمینان از داده‌ها، مطالعه را از «مشخصات پروژه» نهایی کنید (ویرایش باز می‌ماند).' },
  };

  var STAGE_ICONS = { info: 'settings2', structure: 'network', operators: 'users', allowances: 'percent', westinghouse: 'gauge', timing: 'timer', matrix: 'settings2', analysis: 'barChart', charts: 'workflow', dashboard: 'layoutDashboard', reports: 'fileText', data: 'databaseBackup' };

  /* حالت اولیه مطابق app-store.ts */
  var helpOpen = false;
  var sidebarCollapsed = false;

  function toggleSidebar() {
    sidebarCollapsed = !sidebarCollapsed;
    renderChrome({ keepView: true });
  }
  function setHelpOpen(open) {
    helpOpen = open;
    renderChrome({ keepView: true });
  }

  function renderChrome(opts) {
    opts = opts || {};
    var shell = U.$('#app-root');
    var oldContainer = document.getElementById('view-container');
    var hadContent = !!(oldContainer && oldContainer.firstChild);
    U.clear(shell);
    if (route.name === 'home') {
      /* خانه: هدر و فوتر خودش را در views-home می‌سازد؛ شل فقط فوتر استاندارد می‌دهد (معادل HomeView + AppFooter) */
      var homeShell = U.h('div', { class: 'app-shell' },
        U.h('div', { id: 'view-container', class: 'animate-view-in', style: { display: 'flex', flexDirection: 'column', flex: '1', minWidth: 0 } }),
        buildAppFooter());
      shell.appendChild(homeShell);
      if (opts.keepView && hadContent) {
        var freshHome = document.getElementById('view-container');
        if (freshHome && freshHome !== oldContainer) freshHome.parentNode.replaceChild(oldContainer, freshHome);
      }
      return;
    }
    var project = DB.getProject(route.projectId);
    if (!project) {
      shell.appendChild(U.h('div', { class: 'min-h-screen flex items-center justify-center p-6' },
        UI.emptyState({ title: 'پروژه یافت نشد', desc: 'این پروژه حذف شده یا شناسه آن نامعتبر است.', icon: 'package' })));
      return;
    }
    var summary = DB.getProjectSummary(project.id);

    var shellEl = U.h('div', { class: 'app-shell' });

    /* ── نوار بالا — معادل TopBar.tsx ── */
    var isDark = document.documentElement.classList.contains('dark');
    var topbar = U.h('header', { class: 'topbar no-print' },
      U.h('button', { class: 'icon-btn lg md:hidden', 'aria-label': 'بازکردن منوی مراحل', onclick: openMobileMenu }, U.icon('menu', 'i20')),
      U.h('button', { class: 'btn btn-ghost btn-sm', 'aria-label': 'بازگشت به فهرست پروژه‌ها', onclick: function () { navigate('/'); } },
        U.icon('home', 'i16'), U.h('span', { class: 'hidden sm:inline', text: 'پروژه‌ها' })),
      U.h('div', { class: 'divider-v', 'aria-hidden': 'true', style: { height: '24px', alignSelf: 'center', margin: '0 4px' } }),
      U.h('div', { class: 'flex min-w-0 flex-1 items-center gap-2' },
        U.h('p', { class: 'truncate font-extrabold', style: { fontSize: '13px' }, text: project.name }),
        U.h('span', { class: 'truncate hidden sm:inline', style: { fontSize: '12px', color: 'var(--muted-foreground)' }, text: project.lineName + ' · ' + project.productName }),
        UI.projectStatusBadge(project.status)),
      U.h('div', { class: 'flex items-center gap-0.5' },
        !summary.finalized && route.name === 'project'
          ? U.h('button', { class: 'btn btn-sm btn-green-outline hidden sm:inline-flex', onclick: showFinalizeDialog }, U.icon('flag'), 'نهایی‌سازی')
          : null,
        U.h('button', { class: 'icon-btn lg', 'aria-label': isDark ? 'تم روشن' : 'تم تیره', onclick: toggleTheme }, U.icon(isDark ? 'sun' : 'moon')),
        U.h('button', { class: 'icon-btn lg', 'aria-label': 'تنظیمات نمایش', onclick: showDisplaySettings }, U.icon('settings')),
        U.h('button', {
          class: 'icon-btn lg' + (helpOpen ? ' bulb-on' : ''),
          'aria-label': helpOpen ? 'بستن راهنمای مرحله' : 'نمایش راهنمای مرحله',
          'aria-pressed': helpOpen ? 'true' : 'false',
          onclick: function () { setHelpOpen(!helpOpen); },
        }, U.icon('lightbulb'))));

    /* ── سایدبار مراحل — معادل StageSidebar.tsx ── */
    var sidebar = buildSidebar(project, summary);

    /* ── پنل راهنما — معادل HelpPanel.tsx ── */
    var helpPanel = buildHelpPanel(project, summary);

    /* ── فوتر — معادل AppFooter.tsx ── */
    var footer = buildAppFooter();

    var newContainer = U.h('div', { id: 'view-container', class: 'animate-view-in' });
    var body = U.h('div', { class: 'shell-body' },
      sidebar,
      U.h('main', { id: 'main-content', class: 'main-content scroll-slim' }, newContainer));
    shellEl.appendChild(topbar);
    shellEl.appendChild(body);
    /* پنل راهنما — Overlay روی محتوا (بدون اشغال عرض)؛ بسته = حذف کامل */
    if (helpPanel) shellEl.appendChild(helpPanel);
    shellEl.appendChild(footer);
    shell.appendChild(shellEl);

    /* حفظ وضعیت نما (فرم/جدول/تمرکز) هنگام تغییرهای شل —
       جمع/باز سایدبار، پنل راهنما و تم نباید محتوا را پاک کنند */
    if (opts.keepView && hadContent) {
      var fresh = document.getElementById('view-container');
      if (fresh && fresh !== oldContainer) fresh.parentNode.replaceChild(oldContainer, fresh);
    }
  }

  /* ═══════════ فوتر چسبان — معادل AppFooter.tsx ═══════════ */
  function buildAppFooter() {
    return U.h('footer', { class: 'app-footer no-print' },
      U.h('div', { class: 'app-footer-inner' },
        U.h('p', { class: 'flex items-center gap-1.5' },
          U.h('span', { class: 'font-bold', style: { color: 'var(--muted-foreground)' }, text: 'زمان‌سنجی صنعتی' }),
          U.h('span', { 'aria-hidden': 'true', text: '·' }),
          U.h('span', { text: 'نسخه اول — کامل (۷ فاز)' })),
        U.h('p', { class: 'flex items-center gap-3' },
          U.h('span', { class: 'flex items-center gap-1', title: 'بدون هیچ درخواست خارجی در زمان اجرا' }, U.icon('wifiOff'), 'کارکرد کاملاً آفلاین'),
          U.h('span', { class: 'flex items-center gap-1', title: 'داده‌ها روی دیسک محلی همین میزبان' }, U.icon('shieldCheck'), 'داده محلی و امن'))));
  }

  /* ═══════════ سایدبار — باز/جمع‌شونده (۲۶۸ ↔ ۶۴ پیکسل) ═══════════ */
  function buildSidebar(project, summary) {
    var sidebar = U.h('aside', {
      class: 'sidebar no-print' + (sidebarCollapsed ? ' collapsed' : ''),
      'aria-label': 'ناوبری مراحل',
    });
    var inner = U.h('div', { class: 'sidebar-inner' });

    /* سربرگ جمع/باز — معادل بخش بالایی StageSidebar */
    var toggleBtn = U.h('button', {
      class: 'icon-btn md', type: 'button',
      'aria-label': sidebarCollapsed ? 'بازکردن منو' : 'جمع‌کردن منو',
      title: sidebarCollapsed ? 'بازکردن منو' : 'جمع‌کردن منو',
      onclick: toggleSidebar,
    }, U.icon('chevronLeft', sidebarCollapsed ? 'i16 flip-x' : 'i16'));
    var topInner = U.h('div', { class: 'sidebar-top-inner' },
      sidebarCollapsed ? null : U.h('span', { class: 'sidebar-top-label', text: 'منوی پروژه' }),
      toggleBtn);
    inner.appendChild(U.h('div', { class: 'sidebar-top' }, topInner));

    if (sidebarCollapsed) {
      /* حالت جمع‌شده: ستون آیکون‌ها — همه مراحل + ابزار داده قابل دسترس */
      var minCol = U.h('div', { class: 'sidebar-min-col' });
      Object.keys(STAGE_ICONS).forEach(function (key) {
        var active = route.name === 'project' && route.stage === key;
        minCol.appendChild(U.h('button', {
          class: 'sidebar-min-btn' + (active ? ' active' : ''), type: 'button',
          title: key, 'aria-label': key,
          onclick: function () { navigate('/p/' + project.id + '/' + key); },
        }, U.icon(STAGE_ICONS[key])));
      });
      inner.appendChild(minCol);
    } else {
      /* سربرگ محتوا — معادل StageSidebarContent */
      inner.appendChild(U.h('div', { class: 'sidebar-head' },
        U.h('span', { class: 'chip-icon' }, U.icon('timer')),
        U.h('div', { class: 'min-w-0' },
          U.h('p', { class: 'truncate font-extrabold', style: { fontSize: '13px' }, text: 'مراحل مطالعه' }),
          U.h('p', { class: 'truncate', style: { fontSize: '11px', color: 'var(--muted-foreground)' }, text: 'جابه‌جایی آزاد بین مراحل' }))));

      var scroll = U.h('div', { class: 'sidebar-scroll scroll-slim' });
      var stageList = U.h('ul', { class: 'list-none flex flex-col gap-1' });
      DB.CONST.STUDY_STAGES.forEach(function (st) {
        var stageState = summary.stages[st.key] || { status: 'PENDING' };
        var active = route.name === 'project' && route.stage === st.key;
        stageList.appendChild(U.h('li', null,
          U.h('a', {
            class: 'nav-item' + (active ? ' active' : ''),
            href: '#/p/' + project.id + '/' + st.key,
            'aria-current': active ? 'page' : null,
            title: st.desc,
          },
            U.h('span', { class: 'stage-dot ' + stageState.status, title: DB.CONST.STAGE_STATUS_LABELS[stageState.status] }),
            U.icon(STAGE_ICONS[st.key] || 'circleHelp'),
            U.h('span', { class: 'nav-label', text: st.label }),
            stageState.status === 'FUTURE_PHASE' && stageState.phase
              ? U.h('span', { class: 'badge muted num', text: 'فاز ' + U.formatInt(stageState.phase) })
              : null)));
      });
      scroll.appendChild(stageList);

      var tools = U.h('div', null,
        U.h('p', { class: 'nav-group-label', text: 'ابزارها' }),
        U.h('ul', { class: 'list-none flex flex-col gap-1' },
          U.h('li', null,
            U.h('a', {
              class: 'nav-item' + (route.name === 'project' && route.stage === 'data' ? ' active' : ''),
              href: '#/p/' + project.id + '/data',
              title: 'پشتیبان‌گیری، بازیابی، بسته پروژه و تاریخچه',
            },
              U.h('span', { class: 'nav-dot-spacer' }),
              U.icon('databaseBackup'),
              U.h('span', { class: 'nav-label', text: 'داده و پشتیبان' })))));
      scroll.appendChild(tools);
      inner.appendChild(scroll);
    }

    sidebar.appendChild(inner);
    return sidebar;
  }

  /* ═══════════ پنل راهنمای مرحله — Overlay کدر روی محتوا ═══════════ */
  function buildHelpPanel(project, summary) {
    var stageKey = route.name === 'activity' ? 'structure' : (route.stage || 'info');
    var guide = STAGE_GUIDES[stageKey];
    var stageMeta = null;
    DB.CONST.STUDY_STAGES.forEach(function (s) { if (s.key === stageKey) stageMeta = s; });
    var stageState = summary.stages[stageKey] || { status: 'PENDING', hint: '' };

    /* بسته = هیچ اشغال عرضی ندارد (دکمه لامپ هدر تنها راه بازکردن است) */
    if (!helpOpen) return null;

    var aside = U.h('aside', { class: 'help-panel scroll-slim no-print', 'aria-label': 'راهنمای مرحله' });

    /* سربرگ: آیکون + عنوان + دکمه بستن */
    aside.appendChild(U.h('div', { class: 'flex items-center justify-between mb-3' },
      U.h('div', { class: 'flex items-center gap-2' },
        U.h('span', { class: 'hp-head-chip' }, U.icon('listChecks')),
        U.h('div', null,
          U.h('p', { class: 'font-extrabold', style: { fontSize: '13px' }, text: 'راهنمای مرحله' }),
          U.h('p', { style: { fontSize: '11px', color: 'var(--muted-foreground)' }, text: stageMeta ? stageMeta.label : '' }))),
      U.h('button', {
        class: 'icon-btn md', type: 'button', 'aria-label': 'بستن راهنمای مرحله',
        onclick: function () { setHelpOpen(false); },
      }, U.icon('x'))));

    /* وضعیت این مرحله */
    if (stageState && stageState.status !== 'FUTURE_PHASE') {
      aside.appendChild(U.h('div', { class: 'card p-3 mb-3' },
        U.h('p', { class: 'flex items-center gap-1.5 mb-1', style: { fontSize: '11px', fontWeight: 700, color: 'var(--muted-foreground)' } },
          'وضعیت این مرحله:',
          UI.stageStatusBadge(stageState.status, DB.CONST.STAGE_STATUS_LABELS[stageState.status])),
        U.h('p', { style: { fontSize: '12px', lineHeight: 1.8, color: 'var(--muted-foreground)' }, text: stageState.hint || '' })));
    }

    /* مراحل راهنما + اقدام بعدی */
    if (guide) {
      var ol = U.h('ol', { class: 'list-none flex flex-col gap-2' });
      guide.steps.forEach(function (s, i) {
        ol.appendChild(U.h('li', { class: 'hp-step' },
          U.h('span', { class: 'hp-step-num num', text: U.formatInt(i + 1) }),
          U.h('span', { text: s })));
      });
      ol.appendChild(U.h('li', { class: 'hp-next' },
        U.h('b', { style: { color: 'var(--accent-foreground)' }, text: 'اقدام بعدی پیشنهادی: ' }),
        U.h('span', { style: { color: 'var(--muted-foreground)' }, text: guide.next })));
      aside.appendChild(ol);
    } else {
      aside.appendChild(U.h('p', {
        class: 'card p-3', style: { fontSize: '12px', lineHeight: 1.8, color: 'var(--muted-foreground)' },
        text: 'راهنمای اختصاصی این بخش در فاز مربوط به آن تکمیل می‌شود. برای فیلدهای موجود، از آیکون راهنمای کنار هر فیلد استفاده کنید.',
      }));
    }

    /* دکمه بستن */
    aside.appendChild(U.h('button', {
      class: 'hp-collapse-btn', type: 'button',
      onclick: function () { setHelpOpen(false); },
    }, U.icon('lightbulb'), 'بستن پنل راهنما'));

    return aside;
  }

  function openMobileMenu() {
    var project = DB.getProject(route.projectId);
    if (!project) return;
    var summary = DB.getProjectSummary(project.id);
    var panel = U.h('div', { class: 'flex flex-col gap-1' });
    DB.CONST.STUDY_STAGES.forEach(function (st) {
      var stageState = summary.stages[st.key] || { status: 'PENDING' };
      panel.appendChild(U.h('a', {
        class: 'nav-item' + (route.stage === st.key ? ' active' : ''), href: '#/p/' + project.id + '/' + st.key,
        onclick: function () { close(); },
      }, U.h('span', { class: 'stage-dot ' + stageState.status }), U.icon(STAGE_ICONS[st.key] || 'circleHelp'), U.h('span', { class: 'nav-label', text: st.label })));
    });
    panel.appendChild(U.h('div', { class: 'dd-sep' }));
    panel.appendChild(U.h('a', { class: 'nav-item' + (route.stage === 'data' ? ' active' : ''), href: '#/p/' + project.id + '/data', onclick: function () { close(); } },
      U.h('span', { class: 'nav-dot-spacer' }), U.icon('databaseBackup'), U.h('span', { class: 'nav-label', text: 'داده و پشتیبان' })));
    var root;
    function close() { if (root.parentNode) root.parentNode.removeChild(root); }
    root = U.h('div', { class: 'mobile-menu-sheet no-print' },
      U.h('div', { class: 'sheet-backdrop', onclick: close }),
      U.h('div', { class: 'sheet-panel', role: 'dialog', 'aria-label': 'منوی مراحل' },
        U.h('div', { class: 'flex items-center justify-between mb-2' },
          U.h('span', { class: 'font-bold', text: 'مراحل مطالعه' }),
          U.h('button', { class: 'icon-btn', 'aria-label': 'بستن منو', onclick: close }, U.icon('x'))),
        panel));
    document.body.appendChild(root);
  }

  function showFinalizeDialog() {
    var project = DB.getProject(route.projectId);
    var reason = '';
    UI.dialog({
      title: 'نهایی‌سازی مطالعه',
      desc: 'وضعیت مطالعه «نهایی‌شده» می‌شود اما ویرایش قفل نمی‌شود؛ پس از هر تغییر مؤثر، نتایج «نیازمند محاسبه مجدد» خواهند شد.',
      bodyBuilder: function (body) {
        body.appendChild(U.h('div', { class: 'banner warning' }, U.icon('alertTriangle'),
          U.h('div', { text: 'اگر تعداد نمونه به هدف نرسیده، رسیدن به هدف فقط به معنای «تکمیل تعداد ثبت‌شده» است و اثبات کفایت آماری محسوب نمی‌شود. دلیل نهایی‌سازی را ثبت کنید.' })));
        var ta = U.h('textarea', { class: 'textarea', placeholder: 'مثال: به دلیل محدودیت دسترسی به خط، با ۱۲ نمونه از ۱۵ نمونه هدف نهایی شد.' });
        ta.addEventListener('input', function () { reason = ta.value; });
        body.appendChild(UI.field('دلیل نهایی‌سازی', ta));
      },
      footerBuilder: function (close) {
        return U.h('div', { class: 'dialog-footer' },
          U.h('button', { class: 'btn', text: 'انصراف', onclick: close }),
          U.h('div', { class: 'spacer' }),
          U.h('button', {
            class: 'btn btn-brand', text: 'نهایی‌سازی مطالعه',
            onclick: function () {
              try {
                DB.finalizeProject(project.id, reason);
                close();
                UI.toast('مطالعه «' + project.name + '» نهایی شد. ویرایش همچنان باز است.');
                renderChrome({ keepView: true });
                if (route.stage === 'info') renderView();
              } catch (err) { UI.toastError(err); }
            },
          }));
      },
    });
  }

  function showDisplaySettings() {
    var prefs = DB.getDisplayPrefs();
    var calendar = prefs.calendar, digits = prefs.digits, decimals = prefs.decimals;
    UI.dialog({
      title: 'تنظیمات نمایش',
      desc: 'این تنظیمات فقط نحوه نمایش را تغییر می‌دهند؛ داده‌های ذخیره‌شده و محاسبات دست‌نخورده می‌مانند.',
      bodyBuilder: function (body) {
        function radioGroup(label, options, value, onChange) {
          var wrap = U.h('div', null, U.h('div', { class: 'field-label', text: label }));
          options.forEach(function (o) {
            var card = U.h('label', { class: 'radio-card' + (value === o.value ? ' selected' : '') },
              U.h('input', { type: 'radio', name: label, checked: value === o.value, style: { accentColor: 'var(--brand)' } }),
              U.h('span', { text: o.label }));
            card.querySelector('input').addEventListener('change', function () { onChange(o.value); body.querySelectorAll('.radio-card').forEach(function (c) { c.classList.remove('selected'); }); card.classList.add('selected'); });
            wrap.appendChild(card);
          });
          return wrap;
        }
        body.appendChild(radioGroup('تقویم', [{ value: 'jalali', label: 'شمسی (پیش‌فرض)' }, { value: 'gregorian', label: 'میلادی' }], calendar, function (v) { calendar = v; }));
        body.appendChild(radioGroup('ارقام', [{ value: 'persian', label: 'فارسی (۱۲۳)' }, { value: 'latin', label: 'لاتین (123)' }], digits, function (v) { digits = v; }));
        body.appendChild(U.h('div', null,
          U.h('label', { class: 'field-label', text: 'ارقام اعشار نمایش زمان‌ها' }),
          UI.selectEl([1, 2, 3, 4].map(function (d) { return { value: String(d), label: U.formatInt(d) + ' رقم' }; }), String(decimals), function (v) { decimals = parseInt(v, 10); })));
        body.appendChild(U.h('div', { class: 'banner info' }, U.icon('info'), U.h('div', { text: 'گردکردن فقط نمایشی است؛ مقدار خام و محاسبات با دقت کامل ذخیره می‌شوند.' })));
      },
      footerBuilder: function (close) {
        return U.h('div', { class: 'dialog-footer' },
          U.h('button', { class: 'btn', text: 'انصراف', onclick: close }),
          U.h('div', { class: 'spacer' }),
          U.h('button', {
            class: 'btn btn-brand', text: 'ذخیره',
            onclick: function () {
              DB.setDisplayPrefs({ calendar: calendar, digits: digits, decimals: decimals });
              close();
              UI.toast('تنظیمات نمایش ذخیره شد.');
              renderChrome();
              renderView();
            },
          }));
      },
    });
  }

  function renderView() {
    var container = U.$('#view-container');
    if (!container) return;
    U.clear(container);
    var views = g.T2VIEWS || {};
    try {
      if (route.name === 'home') {
        if (views.home) views.home(container);
        else container.appendChild(UI.emptyState({ title: 'ماژول خانه در حال بارگذاری است', icon: 'timer' }));
      } else if (route.name === 'activity') {
        if (views.activity) views.activity(container, route.projectId, route.activityId);
        else container.appendChild(UI.emptyState({ title: 'ماژول صفحه فعالیت در حال بارگذاری است', icon: 'timer' }));
      } else {
        var fn = views[route.stage];
        if (fn) fn(container, route.projectId);
        else container.appendChild(UI.emptyState({ title: 'این بخش در این نسخه در دسترس نیست.', desc: 'ماژول «' + route.stage + '» یافت نشد.', icon: 'circleHelp' }));
      }
    } catch (err) {
      console.error(err);
      container.appendChild(U.h('div', { class: 'banner error mt-4' }, U.icon('alertTriangle'), U.h('div', null, 'خطا در نمایش این بخش: ' + (err && err.message ? err.message : err))));
    }
    var main = U.$('#main-content');
    if (main) main.scrollTop = 0;
  }

  function boot() {
    route = parseHash();
    initTheme();
    renderChrome();
    renderView();
    if (g.location.search.indexOf('demo=1') >= 0 && DB.getState().projects.length === 0) {
      DB.seedDemo();
      UI.toast('داده دمو بارگذاری شد', { description: 'پروژه نمایشی کامل برای تست همه بخش‌ها ایجاد شد.' });
      route = parseHash(); renderChrome(); renderView();
    }
    if (!DB.isStorageOk()) {
      UI.toast('ذخیره‌سازی مرورگر در دسترس نیست', { type: 'error', description: 'داده‌ها فقط تا بستن صفحه باقی می‌مانند؛ از خروجی بسته/پشتیبان استفاده کنید.' });
    }
  }

  g.addEventListener('hashchange', function () {
    var next = parseHash();
    if (JSON.stringify(next) === JSON.stringify(route)) return; // همان مسیر — بدون رندر مجدد
    route = next;
    renderChrome();
    renderView();
  });

  g.setInterval(function () {
    DB.autoBackupTick().catch(function () {});
  }, 60000);

  g.T2APP = {
    navigate: navigate,
    refresh: function () { renderChrome(); renderView(); },
    route: function () { return route; },
    STAGE_GUIDES: STAGE_GUIDES,
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof window !== 'undefined' ? window : globalThis);
