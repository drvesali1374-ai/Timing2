/* ═══════════════════════════════════════════════════════════
   views-analysis.js — مرحلهٔ «تحلیل نتایج»
   پورت وفادار از AnalysisView / AnalysisContent نسخهٔ وب:
   • وضعیت محاسبات نسخه‌دار (Snapshot — FR-27) + اجرای محاسبهٔ پروژه
   • تنظیمات پیشرفتهٔ تشخیص دادهٔ غیرعادی (امتیاز Z تعدیل‌شده / حصار IQR + آستانه)
   • انتخابگر فعالیت مرحله + محتوای تحلیل مشترک با زبانهٔ تحلیل
     صفحهٔ فعالیت: کارت‌های خلاصه، روش محاسبه و مجازهای مؤثر،
     جدول OT → NT → ST، شاخص‌های نوع زمان، آمار چرخه، بررسی
     عمیق عنصر (آمار، هیستوگرام، روند و مقایسهٔ اپراتورها — FR-19)
     و بازبینی مشاهدات مشکوک/خارج‌شده با ثبت دلیل (دادهٔ خام محفوظ)
   ═══════════════════════════════════════════════════════════ */
(function (g) {
  'use strict';
  var U = g.T2U, DB = g.T2DB, UI = g.T2UI;
  g.T2VIEWS = g.T2VIEWS || {};

  var NOT_COMPUTABLE = 'قابل محاسبه نیست';

  /* وضعیت ماژول — بین رندرها حفظ می‌شود */
  var pickedActivity = {};    /* projectId -> activityId (انتخابگر مرحله) */
  var deepDiveElement = {};   /* activityId -> elementId (بررسی عمیق) */
  var outlierCardOpen = false; /* باز بودن کارت تنظیمات تشخیص غیرعادی */

  /* بج نوع عنصر — MANUAL بنفش، MACHINE فیروزه‌ای، WAITING کهربایی، OVERLAP سبز */
  var TYPE_BADGE_VARIANT = { MANUAL: 'brand', MACHINE: 'cyan', WAITING: 'amber', OVERLAP: 'green' };

  /* ═══════════ محتوای راهنمای کمک‌نقطه‌ها (عیناً از نسخهٔ وب) ═══════════ */
  var HELP_SNAPSHOT = {
    what: 'نتیجهٔ محاسبات به‌صورت نسخه‌های تاریخ‌دار ذخیره می‌شود؛ هر اجرا یک نسخهٔ جدید می‌سازد و نسخه‌های قبلی حذف نمی‌شوند.',
    input: 'پس از هر تغییر مؤثر (دادهٔ خام، ارزیابی وستینگهاوس، مجازها یا روش محاسبه)، نتیجهٔ ثبت‌شده «نیازمند محاسبهٔ مجدد» می‌شود تا دوباره اجرا کنید.',
    example: 'اگر ضریب یک عنصر را تغییر دهید، نسخهٔ قبلی با برچسب «نیازمند محاسبهٔ مجدد» باقی می‌ماند تا نسخهٔ جدید بسازید.',
    note: 'تحلیل زیر همیشه زنده و بر اساس دادهٔ فعلی است؛ Snapshot برای تاریخچه و مقایسه است.',
  };
  var HELP_OUTLIER = {
    what: 'قاعده‌ای آماری که مشاهدات پرت را برای بازبینی علامت‌گذاری می‌کند؛ هرگز خودکار حذف نمی‌کند.',
    input: 'روش پیش‌فرض «امتیاز Z تعدیل‌شده» بر پایهٔ میانه و MAD با آستانهٔ ۳٫۵ است. اگر MAD صفر یا نمونه بسیار کم باشد، روش با کنترل به حصار IQR می‌رود یا هشدار نمی‌دهد.',
    example: 'مجموعهٔ ۸، ۱۲، ۲۵ ثانیه: مقدار ۲۵ با آستانهٔ معمول علامت‌گذاری می‌شود تا شرایط واقعی مشاهده بررسی شود.',
    note: 'تغییر آستانه فقط برچسب‌گذاری را علامت‌گذاری می‌کند؛ دادهٔ خام و تصمیم‌های خروج شما تغییری نمی‌کنند.',
  };
  var HELP_METHOD = {
    what: 'پارامترهایی که زمان استاندارد هر عنصر را از زمان مشاهده‌شده می‌سازند.',
    input: 'روش اعمال مجاز و روش تجمیع اپراتورها در «مشخصات پروژه ← تنظیمات محاسبات» انتخاب می‌شود؛ مجازها در گروه فعالیت تعریف و در فعالیت قابل بازنویسی‌اند.',
    example: 'با NT=۹٫۰۴۷ ثانیه و A=۱۵٪: روش درصدی ST=۱۰٫۴۰ و روش سهمی ST=۱۰٫۶۴ ثانیه.',
    note: 'در روش «سهم از زمان استاندارد» مجموع مجازها باید کمتر از ۱۰۰٪ باشد وگرنه محاسبه انجام نمی‌شود.',
  };
  var HELP_ELEMENTS = {
    what: 'زمان مشاهده‌شده (OT)، زمان نرمال (NT) و زمان استاندارد (ST) هر عنصر از مشاهدات معتبر محاسبه می‌شود.',
    input: 'مشاهدات معتبر و مشکوک در محاسبات‌اند؛ خارج‌شده و ناقص نیستند. OT با روش تجمیع انتخابی، NT = OT × R و ST طبق فرمول مجاز پروژه.',
    example: 'اگر میانگین مشاهده‌شده ۸٫۳۰ ثانیه و ضریب R=۱٫۰۹ باشد، NT=۹٫۰۴۷ ثانیه.',
    note: '«قابل محاسبه نیست» یعنی داده یا ارزیابی کافی وجود ندارد؛ هرگز صفر گزارش نمی‌شود.',
  };
  var HELP_OPERATORS = {
    what: 'آمار جداگانهٔ هر اپراتور برای همین عنصر، همراه ضریب وستینگهاوس مشترک.',
    input: 'تفاوت زمان نرمال اپراتورها از میانگین مشاهده‌شدهٔ خودشان ناشی می‌شود؛ R عنصر برای همه مشترک است.',
    example: 'اپراتور الف میانگین ۸٫۲ و اپراتور ب ۸٫۶ ثانیه با R=۱٫۰۹ → NT: ۸٫۹۴ و ۹٫۳۷ ثانیه.',
    note: 'سیستم ارزیابی جداگانهٔ هر اپراتور نمی‌سازد؛ ضریب در سطح عنصر مشترک است.',
  };
  var HELP_SUSPECTS = {
    what: 'فهرست مشاهداتی که قاعدهٔ آماری آن‌ها را برای بازبینی علامت‌گذاری کرده یا شما از محاسبات خارج کرده‌اید.',
    input: 'برای هر مورد تصمیم بگیرید: «خروج از محاسبات» (با ثبت دلیل) یا «بازگشت به محاسبات». دادهٔ خام در هر دو حالت حفظ می‌شود.',
    example: 'اگر یک چرخه به‌دلیل قطع نوار نقاله عدد بزرگ‌تری دارد، با دلیل «اختلال در حین مشاهده» خارجش کنید.',
    note: 'هشدار آماری به‌تنهایی دلیل حذف نیست؛ شرایط واقعی مشاهده را بررسی کنید.',
  };
  /* راهنمای «زمان سپری‌شدهٔ چرخه» — عیناً از نسخهٔ وب (§۱۳) */
  var HELP_CYCLE_STATS = {
    what: '«سپری‌شده» یعنی زمان واقعی گذر یک چرخه؛ برای دادهٔ بازه‌ای برابر است با دیرترین پایان منهای زودترین شروع همان چرخه و در غیر این صورت با جمع مدت عناصر ترتیبی همان چرخه.',
    input: 'به‌صورت خودکار از داده‌های زمان‌سنجی محاسبه می‌شود؛ فقط چرخه‌های کامل و قابل استفاده وارد آمار می‌شوند.',
    example: 'اگر زودترین شروع عناصر چرخه ثانیهٔ ۱۰۰ و دیرترین پایان آن‌ها ثانیهٔ ۱۴۵ باشد، زمان سپری‌شدهٔ چرخه ۴۵ ثانیه است.',
    note: 'کاربرد: ارزیابی زمان واقعی چرخه در شرایط میدانی؛ برای زمان استاندارد، ملاک ST عناصر است.',
  };
  /* راهنمای «بررسی عمیق عنصر» — عیناً از نسخهٔ وب (§۱۳) */
  var HELP_DEEP_DIVE = {
    what: 'ابزار بررسی تک‌به‌تک عناصر: یک عنصر را انتخاب کنید تا آمار کامل، توزیع (هیستوگرام) و روند مشاهدات آن را در کنار مقایسهٔ اپراتورها ببینید.',
    input: 'از فهرست کنار عنوان، یک عنصر کاری انتخاب کنید؛ همهٔ آمارها و نمودارهای همین بخش برای همان عنصر به‌روز می‌شوند.',
    example: 'اگر پراکندگی یک عنصر بالا باشد، در هیستوگرام می‌بینید مشاهدات در دو خوشهٔ جدا افتاده‌اند — مثلاً دو روش کار متفاوت.',
    note: 'این بخش تغییری در داده ایجاد نمی‌کند؛ تصمیم‌های نگه‌داشتن/خروج مشاهده در «بازبینی مشاهدات مشکوک» گرفته می‌شود.',
  };

  /* ═══════════ استایل‌های اختصاصی ماژول ═══════════ */
  function ensureStyles() {
    if (document.getElementById('t2a-styles')) return;
    var st = document.createElement('style');
    st.id = 't2a-styles';
    st.textContent =
      '.t2a-dot{width:9px;height:9px;border-radius:99px;display:inline-block;flex-shrink:0;}' +
      '.t2a-dash{width:16px;height:0;border-top:2px dashed var(--amber);display:inline-block;flex-shrink:0;}';
    document.head.appendChild(st);
  }

  /* ═══════════ ابزارهای کوچک ═══════════ */
  function typeBadge(elementType) {
    return UI.badge(DB.CONST.ELEMENT_TYPE_LABELS[elementType] || elementType, TYPE_BADGE_VARIANT[elementType] || 'muted');
  }
  function legendItem(colorVar, label) {
    return U.h('span', { class: 'flex items-center gap-1' },
      U.h('span', { class: 't2a-dot', style: { background: colorVar } }),
      U.h('span', { text: label }));
  }
  /** مقدار آماری — null/نامتناهی → «قابل محاسبه نیست» (هرگز صفر گزارش نمی‌شود) */
  function statText(v, decimals, percentSuffix) {
    if (v === null || v === undefined || !isFinite(v)) return NOT_COMPUTABLE;
    return U.formatTimeValue(v, decimals) + (percentSuffix ? '٪' : '');
  }
  /** متن تولیدی هسته — ارقام لاتینِ درون جمله مطابق تنظیمات نمایش کاربر تبدیل می‌شوند
      (برخلاف displayServerText که نقطه‌گذاری عددی را هم عوض می‌کند، نقطه‌گذاری جمله دست‌نخورده می‌ماند) */
  function coreText(s) {
    if (s === null || s === undefined) return '';
    var p = (DB.getDisplayPrefs && DB.getDisplayPrefs()) || { digits: 'persian' };
    return p.digits === 'persian' ? U.toPersianDigits(String(s)) : String(s);
  }

  /* ═══════════════════════════════════════════════════════════
     ۱) مرحلهٔ «تحلیل نتایج» — کارت وضعیت محاسبات + تنظیمات
        تشخیص غیرعادی + انتخابگر فعالیت + محتوای تحلیل
     ═══════════════════════════════════════════════════════════ */
  g.T2VIEWS.analysis = function (container, projectId) {
    ensureStyles();
    U.clear(container);
    var root = U.h('div', { class: 'flex flex-col gap-4' });
    container.appendChild(root);

    function renderAll() {
      if (!root.isConnected) return;
      U.clear(root);
      root.appendChild(U.h('header', { class: 'flex items-center gap-3' },
        U.h('span', { class: 'chip-icon' }, U.icon('barChart')),
        U.h('div', { class: 'min-w-0' },
          U.h('h1', { class: 'text-xl font-extrabold', text: 'تحلیل نتایج' }),
          U.h('p', { class: 'text-sm text-muted', text: 'آمار، داده غیرعادی و مقایسه اپراتورها' }))));

      root.appendChild(calcStatusCard(projectId, renderAll));
      root.appendChild(outlierSettingsCard(renderAll));
      root.appendChild(activityPickerCard(projectId, renderAll));

      var actId = pickedActivity[projectId];
      if (actId && DB.getActivity(actId)) renderAnalysisContent(root, projectId, actId, renderAll);
    }
    renderAll();
  };

  /* ── کارت «وضعیت محاسبات پروژه» — Snapshot نسخه‌دار (FR-27) ── */
  function calcStatusCard(projectId, rerender) {
    var info = DB.getLatestCalculation(projectId);
    var run = info.run;

    var statusBadge;
    if (!info.hasAnyData) statusBadge = UI.badge('داده‌ای برای محاسبه ثبت نشده است', 'muted');
    else if (!run) statusBadge = UI.badge('هنوز محاسبه نسخه‌دار اجرا نشده است', 'amber');
    else if (run.status === 'STALE') statusBadge = UI.badge('نیازمند محاسبهٔ مجدد', 'amber', 'refresh');
    else statusBadge = UI.badge('به‌روز', 'green', 'checkCircle');

    var runBtn = U.h('button', {
      class: 'btn btn-brand', type: 'button',
      disabled: !info.hasAnyData,
      'aria-label': 'اجرای محاسبه و ثبت نسخه',
      onclick: function () {
        try {
          var result = DB.runProjectCalculation(projectId);
          UI.toast('محاسبهٔ پروژه اجرا و به‌صورت نسخه ثبت شد (' + U.formatInt(result.result.summary.activitiesCount) + ' فعالیت). نسخه‌های قبلی حفظ شده‌اند.');
          rerender();
        } catch (err) { UI.toastError(err); }
      },
    }, U.icon('sigma'), 'اجرای محاسبه و ثبت نسخه');

    return U.h('section', { class: 'card p-4', 'aria-label': 'وضعیت محاسبات پروژه' },
      U.h('div', { class: 'flex flex-wrap items-center gap-2' },
        U.h('span', { class: 'chip-icon' }, U.icon('history')),
        U.h('h2', { class: 'font-bold', text: 'وضعیت محاسبات پروژه' }),
        UI.helpDot('Snapshot محاسبات', HELP_SNAPSHOT)),
      U.h('div', { class: 'flex flex-wrap items-center gap-2 mt-3' },
        statusBadge,
        run ? U.h('span', { class: 'text-xs text-muted' },
          'آخرین اجرا: ' + U.formatDateTime(run.createdAt) +
          ' — نسخهٔ فرمول ' + run.formulaVersion +
          ' (' + U.formatInt(info.runsCount) + ' نسخهٔ تاریخ‌دار)') : null),
      U.h('div', { class: 'mt-3' }, runBtn));
  }

  /* ── کارت «تنظیمات پیشرفتهٔ تشخیص دادهٔ غیرعادی» (بازشو، پیش‌فرض بسته) ──
     نکته: چیدمان با کلاس‌های kit (collapsible-*) ساخته می‌شود اما چرخش
     شِورون با مرجع مستقیم مدیریت می‌شود — دورزنی برای باگ ui.js
     (کوئری «svg:last-child» در collapsibleCard به‌جای شِورون، آیکون
     chip-icon سربرگ را می‌چرخاند)؛ مستند در گزارش نهایی. */
  function outlierSettingsCard(rerender) {
    var open = outlierCardOpen;
    var bodyWrap = U.h('div', { class: 'collapsible-body' });
    var chevron = U.icon('chevronDown');
    var toggleBtn = U.h('button', {
      class: 'btn btn-outline btn-sm shrink-0', type: 'button',
      'aria-label': 'بازکردن تنظیمات تشخیص دادهٔ غیرعادی',
    }, 'بازکردن');

    function toggle() {
      open = !open;
      outlierCardOpen = open;
      render();
    }
    toggleBtn.addEventListener('click', function (e) { e.stopPropagation(); toggle(); });

    var head = U.h('div', { class: 'collapsible-head', onclick: toggle },
      U.h('span', { class: 'chip-icon' }, U.icon('sliders')),
      U.h('div', { class: 'flex-1 min-w-0' },
        U.h('div', { class: 'font-bold text-sm', text: 'تنظیمات پیشرفتهٔ تشخیص دادهٔ غیرعادی' })),
      UI.helpDot('تشخیص دادهٔ غیرعادی', HELP_OUTLIER),
      toggleBtn,
      U.h('span', { class: 'text-faint' }, chevron));

    var card = U.h('section', { class: 'card collapsible-card', 'aria-label': 'تنظیمات پیشرفتهٔ تشخیص دادهٔ غیرعادی' },
      head, bodyWrap);

    function render() {
      bodyWrap.style.display = open ? '' : 'none';
      chevron.style.transform = open ? 'rotate(180deg)' : '';
      U.clear(toggleBtn);
      toggleBtn.appendChild(document.createTextNode(open ? 'بستن' : 'بازکردن'));
      toggleBtn.setAttribute('aria-label', (open ? 'بستن' : 'بازکردن') + ' تنظیمات تشخیص دادهٔ غیرعادی');
      if (open) {
        U.clear(bodyWrap);
        buildOutlierBody(bodyWrap, rerender);
      }
    }
    render();
    return card;
  }

  function buildOutlierBody(body, rerender) {
    var cfg = DB.getOutlierConfig();
    var method = cfg.method;
    var threshold = cfg.threshold;

    /* گروه رادیو «روش تشخیص» */
    var cards = [];
    var methodGroup = U.h('div', { class: 'flex flex-col gap-2' });
    [{ value: 'mad', label: 'امتیاز Z تعدیل‌شده (میانه و MAD)' }, { value: 'iqr', label: 'حصار IQR' }].forEach(function (o) {
      var rb = U.h('input', {
        type: 'radio', name: 't2a-outlier-method', checked: method === o.value,
        style: { accentColor: 'var(--brand)', marginTop: '3px' },
      });
      var rc = U.h('label', { class: 'radio-card' + (method === o.value ? ' selected' : '') },
        rb, U.h('span', { class: 'text-sm', text: o.label }));
      rb.addEventListener('change', function () {
        method = o.value;
        cards.forEach(function (c) { c.classList.remove('selected'); });
        rc.classList.add('selected');
      });
      cards.push(rc);
      methodGroup.appendChild(rc);
    });
    body.appendChild(UI.field('روش تشخیص', methodGroup));

    /* آستانه — فقط برای روش Z تعدیل‌شده معنا دارد */
    var thrInput = UI.persianNumberInput({
      value: threshold, decimals: 1, min: 0.5, max: 10,
      onChange: function (n) { threshold = n; },
      ariaLabel: 'آستانه تشخیص دادهٔ غیرعادی',
    });
    body.appendChild(U.h('div', { class: 'mt-4' },
      UI.field('آستانه (فقط برای روش Z تعدیل‌شده)', thrInput, null,
        'مقدار پیش‌فرض ۳٫۵ است؛ مقادیر کوچکتر حساسیت را بالا می‌برند. مقدار فعلی: ' + U.formatTimeValue(cfg.threshold, 1))));

    var saveBtn = U.h('button', { class: 'btn btn-brand', type: 'button' }, U.icon('check'), 'ذخیره و بازمحاسبهٔ پرچم‌ها');
    saveBtn.addEventListener('click', function () {
      var patch = { method: method };
      if (threshold !== null && threshold !== undefined && isFinite(threshold)) patch.threshold = threshold;
      try {
        DB.setOutlierConfig(patch);
        UI.toast('تنظیمات تشخیص غیرعادی ذخیره و پرچم‌ها بازمحاسبه شد.');
        rerender();
      } catch (err) { UI.toastError(err); }
    });
    body.appendChild(U.h('div', { class: 'mt-4' }, saveBtn));
  }

  /* ── کارت انتخابگر فعالیت ── */
  function activityPickerCard(projectId, onChange) {
    var stations = DB.listActivitiesForAnalysis(projectId);
    var totalActivities = stations.reduce(function (s, st) { return s + st.activities.length; }, 0);

    var card = U.h('section', { class: 'card p-4', 'aria-label': 'انتخاب فعالیت برای تحلیل' },
      U.h('div', { class: 'flex items-center gap-2' },
        U.h('span', { class: 'chip-icon' }, U.icon('barChart')),
        U.h('h2', { class: 'font-bold', text: 'فعالیت موردنظر را انتخاب کنید' })));

    if (totalActivities === 0) {
      card.appendChild(UI.emptyState({
        title: 'فعالیتی تعریف نشده است',
        desc: 'برای تحلیل نتایج، ابتدا در «ساختار تولید» ایستگاه و فعالیت تعریف کنید و داده ثبت نمایید.',
        icon: 'factory',
      }));
      return card;
    }

    var grid = U.h('div', { class: 'grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-3' });
    stations.forEach(function (st) {
      st.activities.forEach(function (a) {
        var selected = pickedActivity[projectId] === a.id;
        grid.appendChild(U.h('button', {
          class: 'card card-hover p-3 text-right flex flex-col gap-1',
          type: 'button',
          'aria-label': 'انتخاب فعالیت ' + a.name,
          style: selected
            ? { borderColor: 'var(--brand)', boxShadow: '0 0 0 3px color-mix(in srgb, var(--brand) 22%, transparent)' }
            : null,
          onclick: function () { pickedActivity[projectId] = a.id; onChange(); },
        },
          U.h('span', { class: 'font-semibold', text: a.name }),
          U.h('span', { class: 'text-xs text-muted', text: st.name + ' — ' + (DB.CONST.PROCESS_TYPE_LABELS[a.processType] || a.processType) }),
          U.h('span', { class: 'text-xs text-muted num', text: U.formatInt(a.elementsCount) + ' عنصر، ' + U.formatInt(a.cyclesCount) + ' چرخه' })));
      });
    });
    card.appendChild(grid);

    if (!pickedActivity[projectId] || !DB.getActivity(pickedActivity[projectId])) {
      card.appendChild(U.h('div', { class: 'banner info mt-3' }, U.icon('info'),
        U.h('div', null,
          U.h('div', { class: 'font-bold', text: 'فعالیتی انتخاب نشده است' }),
          U.h('div', { text: 'از فهرست بالا یک فعالیت را برای نمایش تحلیل انتخاب کنید.' }))));
    }
    return card;
  }

  /* ═══════════════════════════════════════════════════════════
     ۲) زبانهٔ «تحلیل نتایج» صفحهٔ فعالیت — سربرگ کوچک + محتوای مشترک
     ═══════════════════════════════════════════════════════════ */
  g.T2VIEWS._analysisForActivity = function (container, projectId, activityId) {
    ensureStyles();
    U.clear(container);
    var activity = DB.getActivity(activityId);
    if (!activity) {
      container.appendChild(UI.emptyState({ title: 'فعالیت یافت نشد', desc: 'این فعالیت حذف شده یا شناسه آن نامعتبر است.', icon: 'package' }));
      return;
    }
    var station = DB.getStation(activity.stationId);
    container.appendChild(U.h('header', { class: 'flex items-center gap-3' },
      U.h('span', { class: 'chip-icon' }, U.icon('barChart')),
      U.h('div', { class: 'min-w-0' },
        U.h('h2', { class: 'text-lg font-extrabold', text: 'تحلیل نتایج' }),
        U.h('p', { class: 'text-xs text-muted truncate', text: activity.name + ' — ' + (station ? station.name : '—') }))));
    renderAnalysisContent(container, projectId, activityId);
  };

  /* ═══════════════════════════════════════════════════════════
     محتوای تحلیل مشترک — پورت AnalysisContent
     ═══════════════════════════════════════════════════════════ */
  function renderAnalysisContent(container, projectId, activityId, outerRender) {
    var host = U.h('div', { class: 'flex flex-col gap-4' });
    container.appendChild(host);
    var ctx = {
      activityId: activityId,
      render: function () {
        if (!host.isConnected) return;
        U.clear(host);
        build();
      },
      /* پس از جهش‌های مؤثر (خروج/بازگشت/بازمحاسبهٔ پرچم‌ها) کل نما تازه می‌شود
         تا کارت «وضعیت محاسبات پروژه» هم نشانگر «نیازمند محاسبهٔ مجدد» را بگیرد */
      rerender: function () {
        if (outerRender) { outerRender(); return; }
        if (host.isConnected) { U.clear(host); build(); }
      },
    };

    function build() {
      var an;
      try { an = DB.getActivityAnalysis(activityId); }
      catch (err) {
        host.appendChild(U.h('div', { class: 'banner error' }, U.icon('alertTriangle'),
          U.h('div', { text: 'خطا در تحلیل فعالیت: ' + (err && err.message ? err.message : err) })));
        return;
      }
      if (an.elements.length === 0) {
        host.appendChild(UI.emptyState({
          title: 'عنصری تعریف نشده است',
          desc: 'ابتدا در زبانهٔ «عناصر کاری» عناصر فعالیت را تعریف کنید.',
          icon: 'listTree',
        }));
        return;
      }
      host.appendChild(summaryCards(an));
      host.appendChild(methodCard(an));
      host.appendChild(elementsCard(an));
      host.appendChild(typeTotalsCard(an));
      host.appendChild(cycleStatsCard(an));
      host.appendChild(deepDiveCard(an, ctx));
      host.appendChild(suspectsCard(an, ctx));
      host.appendChild(U.h('p', { class: 'text-xs text-faint', text: 'تحلیل زنده بر اساس دادهٔ فعلی — ' + U.formatDateTime(an.generatedAt) }));
    }
    build();
  }

  /* ── چهار کارت خلاصه ── */
  function summaryCards(an) {
    var sp = an.sampleProgress;
    var calcBasisSum = an.elements.reduce(function (s, e) { return s + e.counts.calcBasis; }, 0);
    var totalObs = an.elements.reduce(function (s, e) { return s + e.counts.total; }, 0);
    var suspectSum = an.elements.reduce(function (s, e) { return s + e.counts.suspect; }, 0);
    var cs = an.cycleStats;

    function summaryCard(opts) {
      return U.h('div', { class: 'card p-4 flex flex-col gap-2' },
        U.h('div', { class: 'flex items-center justify-between gap-2' },
          U.h('span', { class: 'text-xs text-muted', text: opts.title }),
          U.h('span', { class: 'chip-icon' + (opts.tone ? ' ' + opts.tone : '') }, U.icon(opts.icon))),
        U.h('div', { class: 'text-2xl font-extrabold num', text: opts.value }),
        U.h('div', { class: 'text-xs text-muted', text: opts.hint }));
    }

    var validValue = sp.targetSampleCount !== null && sp.targetSampleCount !== undefined
      ? U.formatInt(sp.validCycles) + ' از ' + U.formatInt(sp.targetSampleCount)
      : U.formatInt(sp.validCycles);
    var validHint = sp.targetSampleCount === null || sp.targetSampleCount === undefined
      ? 'هدفی ثبت نشده است'
      : (sp.reached ? 'هدف تعداد نمونه تکمیل شد' : 'به هدف نرسیده — شاخص‌های پراکندگی را ببینید');

    var wrap = U.h('div', { class: 'grid sm:grid-cols-2 xl:grid-cols-4 gap-3' },
      summaryCard({
        title: 'چرخه‌های معتبر', icon: 'flask', tone: '',
        value: validValue, hint: validHint,
      }),
      summaryCard({
        title: 'مشاهدات در محاسبات', icon: 'sigma', tone: '',
        value: U.formatInt(calcBasisSum),
        hint: 'معتبر + مشکوک (هشدار ≠ حذف) — مجموع ' + U.formatInt(totalObs) + ' مشاهده',
      }),
      summaryCard({
        title: 'نیازمند بازبینی', icon: 'alertTriangle', tone: 'amber',
        value: U.formatInt(suspectSum),
        hint: suspectSum > 0 ? 'مشاهدهٔ مشکوک — تصمیم نگه‌داشتن یا خروج با شماست' : 'مشاهدهٔ مشکوکی علامت‌گذاری نشده است',
      }),
      summaryCard({
        title: 'میانگین زمان سپری‌شدهٔ چرخه', icon: 'clock', tone: 'green',
        value: cs.stats && cs.stats.mean !== null ? U.formatTimeValue(cs.stats.mean) + ' ثانیه' : NOT_COMPUTABLE,
        hint: cs.count > 0 ? 'از ' + U.formatInt(cs.count) + ' چرخهٔ قابل استفاده (ثانیه)' : 'چرخهٔ قابل استفاده‌ای وجود ندارد',
      }));

    /* پیام پیشرفت نمونه — رنگ بر اساس وضعیت رسیدن به هدف
       (پیام از هسته می‌آید؛ ارقام آن مطابق تنظیمات نمایش کاربر تبدیل می‌شود) */
    var bannerVariant = sp.reached === false ? 'warning' : (sp.reached === true ? 'success' : 'info');
    var out = U.h('div', null, wrap);
    out.appendChild(U.h('div', { class: 'banner ' + bannerVariant + ' mt-3' }, U.icon('info'),
      U.h('div', { text: coreText(sp.message) })));
    return out;
  }

  /* ── کارت «روش محاسبه و مجازهای مؤثر» ── */
  function methodCard(an) {
    var alw = an.allowances;
    var card = U.h('section', { class: 'card p-4', 'aria-label': 'روش محاسبه و مجازهای مؤثر' },
      U.h('div', { class: 'flex flex-wrap items-center gap-2' },
        U.h('span', { class: 'chip-icon' }, U.icon('gauge')),
        U.h('h2', { class: 'font-bold', text: 'روش محاسبه و مجازهای مؤثر' }),
        UI.helpDot('روش محاسبه چیست؟', HELP_METHOD)));

    card.appendChild(U.h('div', { class: 'grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-4' },
      UI.metric('روش اعمال مجاز', alw.methodLabel || '—'),
      U.h('div', { class: 'metric' },
        U.h('div', { class: 'm-label', text: 'فرمول زمان استاندارد' }),
        U.h('div', { class: 'm-value' }, U.h('code', { class: 'inline', dir: 'ltr', text: alw.formula || '—' }))),
      UI.metric('تجمیع چند اپراتور', an.settings.aggregationMethodLabel || '—'),
      U.h('div', { class: 'metric' },
        U.h('div', { class: 'm-label', text: 'مجموع مجاز (A)' }),
        U.h('div', { class: 'm-value num flex items-center flex-wrap gap-1' },
          U.h('span', { text: U.formatPercent(alw.summary.totalPercent) }),
          alw.method === 'SHARE_OF_ST' && alw.summary.totalPercent >= 1
            ? UI.badge('≥ ۱۰۰٪ — محاسبه ممنوع', 'red')
            : null))));

    /* الونس‌های مؤثر — ردیف‌های resolve سلسله‌مراتبی (جلسه اول §۳) */
    var activeRows = (alw.rows || []).filter(function (r) { return r.status !== 'EXCLUDED'; });
    if (activeRows.length > 0) {
      var badges = activeRows.map(function (r) {
        var suffix = r.status === 'CUSTOM'
          ? ' (اختصاصی)'
          : r.status === 'OVERRIDDEN'
            ? ' (جایگزین‌شده)'
            : ' (' + (r.sourceScopeLabel || '') + ')';
        var value = r.valueType === 'PERCENT'
          ? U.formatPercent(r.percentValue)
          : U.formatTimeValue(r.timeValueSeconds, 1) + 's';
        return UI.badge(r.title + ': ' + value + suffix, 'brand');
      });
      if (alw.perCycleTotal > 0) {
        badges.push(UI.badge('الونس‌های هر چرخه: ' + U.formatTimeValue(alw.perCycleTotal, 1) + 's (یک‌بار در سطح چرخه)', 'outline'));
      }
      card.appendChild(U.h('div', { class: 'flex flex-wrap gap-1 mt-3' }, badges));
    } else {
      card.appendChild(U.h('div', { class: 'text-xs text-muted mt-3', text: (alw.rows || []).length === 0
        ? 'الونسی تعریف نشده است؛ مجموع A صفر است.'
        : 'هیچ الونس مؤثری ندارد؛ در «مجازها و الونس‌ها» مقدار تعریف کنید.' }));
    }

    card.appendChild(U.h('div', { class: 'text-xs text-faint mt-3 pt-3 border-t', text: 'نسخهٔ فرمول ' + an.settings.formulaVersion + ' — تشخیص غیرعادی: ' + (an.settings.outlierMethod === 'mad'
      ? 'امتیاز Z تعدیل‌شده (آستانه ' + U.formatTimeValue(an.settings.outlierThreshold, 1) + ')'
      : 'حصار IQR') }));
    return card;
  }

  /* ── کارت «نتایج عناصر کاری (OT → NT → ST)» + جمع کل فعالیت ── */
  function elementsCard(an) {
    var card = U.h('section', { class: 'card p-4', 'aria-label': 'نتایج عناصر کاری' },
      U.h('div', { class: 'flex flex-wrap items-center gap-2' },
        U.h('span', { class: 'chip-icon' }, U.icon('layers')),
        U.h('h2', { class: 'font-bold', text: 'نتایج عناصر کاری (OT → NT → ST)' }),
        UI.helpDot('جدول نتایج عناصر', HELP_ELEMENTS)));

    card.appendChild(UI.table(
      ['عنصر', 'نوع', 'در محاسبات', 'مشکوک / خارج', 'OT (ثانیه)', 'R', 'NT (ثانیه)', 'ST (ثانیه)'],
      function (tbody) {
        an.elements.forEach(function (e) {
          var stCell;
          if (e.st !== null && e.st !== undefined) {
            stCell = U.h('span', { class: 'num font-semibold', text: U.formatTimeValue(e.st) });
          } else if (e.stError) {
            var errBadge = UI.badge('خطا', 'red');
            errBadge.title = e.stError;
            stCell = errBadge;
          } else {
            stCell = U.h('span', { class: 'text-xs text-muted', text: NOT_COMPUTABLE });
          }
          tbody.appendChild(U.h('tr', null,
            U.h('td', { class: 'font-medium' }, e.name),
            U.h('td', null, typeBadge(e.elementType)),
            U.h('td', { class: 'num', title: 'مشاهدات وارد محاسبه از کل' },
              U.h('span', { class: 'font-semibold' }, U.formatInt(e.counts.calcBasis)),
              U.h('span', { class: 'text-xs text-faint' }, ' / ' + U.formatInt(e.counts.total))),
            U.h('td', { class: 'num' },
              U.h('span', { class: e.counts.suspect > 0 ? 'text-amber font-semibold' : '' }, U.formatInt(e.counts.suspect)),
              ' / ',
              U.h('span', { class: e.counts.excluded > 0 ? 'text-red font-semibold' : '' }, U.formatInt(e.counts.excluded))),
            U.h('td', { class: 'num' }, U.formatTimeValue(e.ot)),
            U.h('td', { class: 'num' }, e.rating
              ? U.h('span', { dir: 'ltr', style: { display: 'inline-block' }, title: (e.rating.tableName || '—') }, U.formatTimeValue(e.rating.totalFactor, 2))
              : UI.badge('ارزیابی نشده', 'outline')),
            U.h('td', { class: 'num' }, U.formatTimeValue(e.nt)),
            U.h('td', null, stCell)));
        });
      }));

    /* جمع زمان استاندارد کل فعالیت — رنگ‌بندی بر اساس وضعیت
       (دلیل از هسته می‌آید؛ ارقام آن مطابق تنظیمات نمایش کاربر تبدیل می‌شود) */
    var at = an.activityTotal;
    var box;
    if (at.status === 'OK') {
      box = U.h('div', { class: 'rounded-lg bg-green-soft p-3 mt-3' },
        U.h('div', { class: 'font-bold text-green' }, 'زمان استاندارد کل فعالیت: ' + U.formatTimeValue(at.st) + ' ثانیه'),
        U.h('div', { class: 'text-xs text-muted mt-1', text: coreText(at.reason) }));
    } else if (at.status === 'NEEDS_AGGREGATION_RULE') {
      box = U.h('div', { class: 'rounded-lg bg-amber-soft p-3 mt-3' },
        U.h('div', { class: 'font-bold text-amber', text: 'نیازمند قاعده تجمیع' }),
        U.h('div', { class: 'text-xs text-muted mt-1', text: coreText(at.reason) }));
    } else {
      box = U.h('div', { class: 'rounded-lg bg-surface-3 p-3 mt-3' },
        U.h('div', { class: 'font-bold', text: 'نیازمند تکمیل داده' }),
        U.h('div', { class: 'text-xs text-muted mt-1', text: coreText(at.reason) }));
    }
    card.appendChild(box);
    return card;
  }

  /* ── کارت «شاخص‌های نوع زمان (از OT)» ── */
  function typeTotalsCard(an) {
    var t = an.elementTypeTotals || {};
    return U.h('section', { class: 'card p-4', 'aria-label': 'شاخص‌های نوع زمان' },
      U.h('div', { class: 'flex items-center gap-2' },
        U.h('span', { class: 'chip-icon' }, U.icon('timer')),
        U.h('h2', { class: 'font-bold', text: 'شاخص‌های نوع زمان (از OT)' })),
      U.h('div', { class: 'grid sm:grid-cols-2 lg:grid-cols-4 gap-2 mt-3' },
        UI.metric('کار دستی', U.formatTimeValue(t.manual)),
        UI.metric('خودکار ماشین', U.formatTimeValue(t.machine)),
        UI.metric('انتظار', U.formatTimeValue(t.waiting)),
        UI.metric('جمع هم‌زمان (شاخص)', U.formatTimeValue(t.overlapSum))),
      U.h('p', { class: 'text-xs text-muted mt-2', text: 'جمع مدت عناصر هم‌پوشان فقط شاخص است و زمان سپری‌شدهٔ چرخه محسوب نمی‌شود.' }));
  }

  /* ── کارت «آمار زمان سپری‌شدهٔ چرخه» ── */
  function cycleStatsCard(an) {
    var cs = an.cycleStats;
    var st = cs.stats || {};
    var card = U.h('section', { class: 'card p-4', 'aria-label': 'آمار زمان سپری‌شدهٔ چرخه' },
      U.h('div', { class: 'flex items-center gap-2' },
        U.h('span', { class: 'chip-icon' }, U.icon('clock')),
        U.h('h2', { class: 'font-bold', text: 'آمار زمان سپری‌شدهٔ چرخه' }),
        UI.helpDot('زمان سپری‌شدهٔ چرخه', HELP_CYCLE_STATS)));

    if (!cs.count || cs.count === 0) {
      card.appendChild(U.h('p', { class: 'text-sm text-muted mt-3', text: 'چرخهٔ قابل استفاده‌ای برای آمار وجود ندارد.' }));
    } else {
      card.appendChild(U.h('div', { class: 'grid sm:grid-cols-3 lg:grid-cols-6 gap-2 mt-3' },
        UI.metric('تعداد', U.formatInt(cs.count)),
        UI.metric('میانگین (ثانیه)', statText(st.mean)),
        UI.metric('میانه', statText(st.median)),
        UI.metric('کمینه', statText(st.min)),
        UI.metric('بیشینه', statText(st.max)),
        UI.metric('انحراف معیار نمونه', statText(st.sampleSD))));
    }
    card.appendChild(U.h('p', { class: 'text-xs text-muted mt-2', text: cs.methodNote }));
    return card;
  }

  /* ── کارت «بررسی عمیق عنصر» — آمار + هیستوگرام + روند + مقایسهٔ اپراتورها ── */
  function deepDiveCard(an, ctx) {
    var card = U.h('section', { class: 'card p-4', 'aria-label': 'بررسی عمیق عنصر' },
      U.h('div', { class: 'flex flex-wrap items-center gap-2' },
        U.h('span', { class: 'chip-icon' }, U.icon('barChart')),
        U.h('h2', { class: 'font-bold', text: 'بررسی عمیق عنصر' }),
        UI.helpDot('بررسی عمیق عنصر', HELP_DEEP_DIVE)));

    var bodyEl = U.h('div');
    card.appendChild(bodyEl);

    var options = [{ value: '', label: 'عنصر را انتخاب کنید' }].concat(an.elements.map(function (e) {
      return { value: e.id, label: e.name };
    }));
    var current = deepDiveElement[ctx.activityId] || '';
    var select = UI.selectEl(options, current, function (v) {
      deepDiveElement[ctx.activityId] = v || null;
      renderBody();
    }, 'انتخاب عنصر برای بررسی عمیق');

    bodyEl.appendChild(U.h('div', { class: 'mt-3', style: { maxWidth: '420px' } }, select));
    var detailEl = U.h('div');
    bodyEl.appendChild(detailEl);

    function renderBody() {
      U.clear(detailEl);
      var el = null;
      var sel = deepDiveElement[ctx.activityId];
      if (sel) el = an.elements.find(function (x) { return x.id === sel; }) || null;
      if (!el) {
        detailEl.appendChild(U.h('p', { class: 'text-sm text-muted mt-4', text: 'یک عنصر را برای مشاهدهٔ آمار تفصیلی، نمودارها و مقایسهٔ اپراتورها انتخاب کنید.' }));
        return;
      }
      var st = el.stats || {};

      /* شبکهٔ آمار */
      detailEl.appendChild(U.h('div', { class: 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 mt-4' },
        UI.metric('در محاسبات', U.formatInt(el.counts.calcBasis)),
        UI.metric('میانگین', statText(st.mean)),
        UI.metric('میانه', statText(st.median)),
        UI.metric('دامنه', statText(st.range)),
        UI.metric('واریانس نمونه', statText(st.sampleVariance, 4)),
        UI.metric('انحراف معیار نمونه', statText(st.sampleSD)),
        UI.metric('CV', statText(st.cvPercent, 1, true)),
        UI.metric('چارک ۱', statText(st.q1)),
        UI.metric('چارک ۳', statText(st.q3)),
        UI.metric('IQR', statText(st.iqr)),
        U.h('div', { class: 'metric', style: { gridColumn: 'span 2' } },
          U.h('div', { class: 'm-label', text: 'بازهٔ اطمینان ۹۵٪ میانگین' }),
          U.h('div', { class: 'm-value num', text: st.ci95 ? U.formatTimeValue(st.ci95.lower) + ' تا ' + U.formatTimeValue(st.ci95.upper) : NOT_COMPUTABLE }))));

      detailEl.appendChild(U.h('p', {
        class: 'text-xs text-muted mt-2',
        text: 'آمار بر اساس ' + U.formatInt(el.counts.calcBasis) + ' مشاهدهٔ درون محاسبات (معتبر + مشکوک). برای n<۲ انحراف معیار و واریانس «قابل محاسبه نیست» است. بازهٔ اطمینان: توزیع t سطح ۹۵٪.',
      }));

      /* نمودارها */
      detailEl.appendChild(U.h('div', { class: 'grid lg:grid-cols-2 gap-4 mt-4' },
        histogramBlock(el),
        trendBlock(el)));

      /* مقایسهٔ اپراتورها — FR-19 */
      detailEl.appendChild(operatorsBlock(el));
    }
    renderBody();
    return card;
  }

  /* ── هیستوگرام با برچسب بازه‌ای «شروع–پایان» — §۱۳ ──
     نمودار دست‌ساز SVG در همین فایل (دستیار UI.histogramChart برچسب
     بازه‌ای و زیرنویس محور ندارد): تیک‌های افقی بدون چرخش با گام
     محدود (حداکثر ~۸ برچسب)، tooltip «بازه … — تعداد …» و عنوان
     محورها به‌صورت زیرنویس متنی زیر نمودار. */
  function histogramSvg(el) {
    var bins = el.histogram;
    var total = el.counts ? el.counts.calcBasis : null;
    var NS = 'http://www.w3.org/2000/svg';
    function sv(tag, attrs) {
      var e = document.createElementNS(NS, tag);
      for (var k in attrs) e.setAttribute(k, attrs[k]);
      return e;
    }
    var W = 560, H = 240;
    var padT = 14, padB = 40, padL = 34, padR = 10;
    var svg = sv('svg', { class: 'stat-chart', viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': 'هیستوگرام توزیع مدت عنصر' });
    svg.setAttribute('style', 'direction:ltr');
    var maxCount = Math.max.apply(null, bins.map(function (b) { return b.count; })) || 1;
    var yMax = Math.max(1, Math.ceil(maxCount * 1.12));
    var innerW = W - padL - padR, innerH = H - padT - padB;
    var slot = innerW / bins.length;
    var barW = Math.min(64, slot * 0.62);
    /* اعشار برچسب‌ها: ۰ برای بازه‌های صحیح، ۱ در غیر این صورت */
    var hasFrac = bins.some(function (b) { return !Number.isInteger(b.binStart) || !Number.isInteger(b.binEnd); });
    var dec = hasFrac ? 1 : 0;
    /* گام تیک افقی — حداکثر ~۸ برچسب بازه‌ای */
    var step = Math.max(1, Math.ceil(bins.length / 8));

    /* خطوط راهنما + تیک‌های محور عمودی (تعداد) */
    for (var g = 0; g <= 3; g++) {
      var v = (yMax / 3) * g;
      var gy = padT + innerH - (v / yMax) * innerH;
      svg.appendChild(sv('line', { x1: padL, y1: gy, x2: W - padR, y2: gy, stroke: 'var(--border)', 'stroke-width': g === 0 ? 1 : 0.6, 'stroke-dasharray': g === 0 ? 'none' : '2 3' }));
      var yt = sv('text', { x: padL - 5, y: gy + 3, 'text-anchor': 'end', 'font-size': 9, fill: 'var(--muted-foreground)', direction: 'ltr' });
      yt.textContent = U.toPersianDigits(String(Math.round(v)));
      svg.appendChild(yt);
    }

    bins.forEach(function (b, i) {
      var bh = Math.max(2, (b.count / yMax) * innerH);
      var x = padL + slot * i + (slot - barW) / 2;
      var y = padT + innerH - bh;
      var bar = sv('rect', { x: x, y: y, width: barW, height: bh, rx: 6, fill: 'var(--brand)' });
      var ttl = sv('title');
      ttl.textContent = 'بازه: ' + U.formatTimeValue(b.binStart, dec) + ' تا ' + U.formatTimeValue(b.binEnd, dec) +
        ' ثانیه — تعداد: ' + U.formatInt(b.count) + ' از ' + U.formatInt(total || b.count) + ' مشاهده';
      bar.appendChild(ttl);
      svg.appendChild(bar);

      /* فراوانی روی ستون */
      if (b.count > 0) {
        var val = sv('text', { x: x + barW / 2, y: y - 4, 'text-anchor': 'middle', 'font-size': 9.5, 'font-weight': 600, fill: 'var(--foreground)', direction: 'ltr' });
        val.textContent = U.toPersianDigits(String(b.count));
        svg.appendChild(val);
      }

      /* برچسب بازه‌ای «شروع–پایان» — افقی، هر گام-اُمین بازه + آخری */
      if (i % step === 0 || i === bins.length - 1) {
        var lbl = sv('text', { x: padL + slot * i + slot / 2, y: padT + innerH + 14, 'text-anchor': 'middle', 'font-size': 9, fill: 'var(--muted-foreground)', direction: 'ltr' });
        lbl.textContent = U.formatTimeValue(b.binStart, dec) + '–' + U.formatTimeValue(b.binEnd, dec);
        svg.appendChild(lbl);
      }
    });
    return svg;
  }

  function histogramBlock(el) {
    var block = U.h('div', null, U.h('h3', { class: 'text-sm font-bold mb-1', text: 'توزیع (هیستوگرام)' }));
    /* توضیح کوتاه برای کاربر تازه‌کار — §۱۳ */
    block.appendChild(U.h('p', { class: 't2a-chart-desc', text: 'هر ستون نشان می‌دهد چند مشاهده در آن بازهٔ زمانی قرار گرفته است.' }));
    if (!el.histogram || el.histogram.length === 0) {
      block.appendChild(U.h('p', { class: 'text-xs text-muted', text: 'دادهٔ کافی برای هیستوگرام وجود ندارد.' }));
    } else {
      block.appendChild(histogramSvg(el));
      /* عنوان محورها — زیرنویس متنی (دستیار مشترک عنوان محور نمی‌کشد) */
      block.appendChild(U.h('p', { class: 't2a-axis-caption', text: 'محور افقی: مدت (ثانیه) — محور عمودی: تعداد مشاهدات' }));
    }
    return block;
  }

  function trendBlock(el) {
    var block = U.h('div', null, U.h('h3', { class: 'text-sm font-bold mb-1', text: 'روند مشاهدات به ترتیب چرخه' }));
    /* توضیح کوتاه برای کاربر تازه‌کار — §۱۳ */
    block.appendChild(U.h('p', { class: 't2a-chart-desc', text: 'روند مقدار ثبت‌شده در چرخه‌های متوالی؛ رنگ‌ها وضعیت هر مشاهده را نشان می‌دهد.' }));
    if (!el.trend || el.trend.length === 0) {
      block.appendChild(U.h('p', { class: 'text-xs text-muted', text: 'داده‌ای برای نمایش روند وجود ندارد.' }));
      return block;
    }
    block.appendChild(U.h('div', { class: 'flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted mb-2' },
      legendItem('var(--brand)', 'معتبر'),
      legendItem('var(--amber)', 'مشکوک'),
      legendItem('var(--red)', 'خارج‌شده'),
      U.h('span', { class: 'flex items-center gap-1' },
        U.h('span', { class: 't2a-dash' }),
        U.h('span', { text: 'میانگین' }))));

    var opNames = {};
    (el.operators || []).forEach(function (o) { opNames[o.operatorId] = o.operatorName; });
    var statusLabel = { VALID: 'معتبر', SUSPECT: 'مشکوک', EXCLUDED: 'خارج‌شده' };
    var points = el.trend.map(function (t) {
      var opName = opNames[t.operatorId];
      return {
        label: t.cycleNo,
        value: t.value,
        status: t.status,
        tooltip: 'چرخهٔ ' + U.formatInt(t.cycleNo) + (opName ? ' (' + opName + ')' : '') +
          ' — مقدار: ' + U.formatTimeValue(t.value) + ' ثانیه — ' + (statusLabel[t.status] || t.status),
      };
    });
    block.appendChild(UI.lineChart({ points: points, meanLine: el.stats ? el.stats.mean : null }));
    /* عنوان محورها — زیرنویس متنی (دستیار مشترک عنوان محور نمی‌کشد) */
    block.appendChild(U.h('p', { class: 't2a-axis-caption', text: 'محور افقی: شمارهٔ چرخه — محور عمودی: مدت (ثانیه)' }));
    return block;
  }

  function operatorsBlock(el) {
    var block = U.h('div', { class: 'mt-4' },
      U.h('div', { class: 'flex flex-wrap items-center gap-2 mb-2' },
        U.h('h3', { class: 'font-bold text-sm', text: 'مقایسهٔ اپراتورها برای «' + el.name + '»' }),
        UI.helpDot('مقایسهٔ اپراتورها', HELP_OPERATORS)));

    if (!el.operators || el.operators.length === 0) {
      block.appendChild(U.h('p', { class: 'text-xs text-muted', text: 'هیچ اپراتوری دادهٔ درون محاسبات برای این عنصر ندارد.' }));
      return block;
    }

    block.appendChild(UI.table(
      ['اپراتور', 'تعداد', 'میانگین (ثانیه)', 'انحراف معیار', 'CV', 'R (مشترک)', 'NT', 'ST', 'مشکوک / خارج'],
      function (tbody) {
        el.operators.forEach(function (op) {
          tbody.appendChild(U.h('tr', null,
            U.h('td', { class: 'font-medium' }, op.operatorName),
            U.h('td', { class: 'num' }, U.formatInt(op.count)),
            U.h('td', { class: 'num' }, U.formatTimeValue(op.mean)),
            U.h('td', { class: 'num' }, U.formatTimeValue(op.sampleSD)),
            U.h('td', { class: 'num' }, op.cvPercent !== null && op.cvPercent !== undefined && isFinite(op.cvPercent)
              ? U.formatTimeValue(op.cvPercent, 1) + '٪'
              : '—'),
            U.h('td', { class: 'num' }, el.rating
              ? U.h('span', { dir: 'ltr', style: { display: 'inline-block' } }, U.formatTimeValue(el.rating.totalFactor, 2))
              : '—'),
            U.h('td', { class: 'num' }, U.formatTimeValue(op.nt)),
            U.h('td', { class: 'num' }, U.formatTimeValue(op.st)),
            U.h('td', { class: 'num' }, U.formatInt(op.suspectCount) + ' / ' + U.formatInt(op.excludedCount))));
        });
      }));
    return block;
  }

  /* ── کارت «بازبینی مشاهدات مشکوک و خارج‌شده» ── */
  function suspectsCard(an, ctx) {
    var card = U.h('section', { class: 'card p-4', 'aria-label': 'بازبینی مشاهدات مشکوک و خارج‌شده' },
      U.h('div', { class: 'flex flex-wrap items-center gap-2' },
        U.h('span', { class: 'chip-icon amber' }, U.icon('alertTriangle')),
        U.h('h2', { class: 'font-bold', text: 'بازبینی مشاهدات مشکوک و خارج‌شده' }),
        UI.badge(U.formatInt(an.suspects.length), an.suspects.length > 0 ? 'amber' : 'muted'),
        UI.helpDot('بازبینی مشکوک‌ها', HELP_SUSPECTS),
        U.h('div', { class: 'spacer' }),
        U.h('button', {
          class: 'btn btn-outline btn-sm', type: 'button',
          onclick: function () {
            try {
              DB.refreshOutliersForActivity(ctx.activityId);
              UI.toast('پرچم‌های غیرعادی بازمحاسبه شد.');
              ctx.rerender();
            } catch (err) { UI.toastError(err); }
          },
        }, U.icon('refresh'), 'بازمحاسبهٔ پرچم‌ها')));

    if (an.suspects.length === 0) {
      card.appendChild(U.h('div', { class: 'banner success mt-3' }, U.icon('checkCircle'),
        U.h('div', null,
          U.h('div', { class: 'font-bold', text: 'موردی برای بازبینی نیست' }),
          U.h('div', { text: 'هیچ مشاهده‌ای مشکوک یا خارج‌شده در این فعالیت وجود ندارد.' }))));
      return card;
    }

    var list = U.h('div', { class: 'max-h-96 overflow-auto flex flex-col gap-2 mt-3' });
    an.suspects.forEach(function (s) {
      var isExcluded = s.validityStatus === 'EXCLUDED';
      var actionBtn = isExcluded
        ? U.h('button', {
            class: 'btn btn-sm btn-outline', type: 'button',
            'aria-label': 'بازگشت مشاهده به محاسبات',
            onclick: function () {
              try {
                DB.setObservationValidity(s.observationId, 'RESTORE');
                UI.toast('مشاهده به محاسبات بازگشت');
                ctx.rerender();
              } catch (err) { UI.toastError(err); }
            },
          }, U.icon('rotateCcw'), 'بازگشت به محاسبات')
        : U.h('button', {
            class: 'btn btn-sm btn-destructive-outline', type: 'button',
            'aria-label': 'خروج مشاهده از محاسبات',
            onclick: function () { openExcludeDialog(s, ctx); },
          }, U.icon('ban'), 'خروج از محاسبات');

      var ruleText = isExcluded
        ? 'دلیل خروج: ' + (s.exclusionReason || 'ثبت نشده است')
        : 'قاعده: ' + (s.rule === 'MODIFIED_Z_MAD' ? 'امتیاز Z تعدیل‌شده (میانه و MAD)' : 'حصار IQR') +
          ' — این مشاهده همچنان در محاسبات است تا تصمیم شما.';

      list.appendChild(U.h('div', { class: 'list-row' },
        U.h('div', { class: 'flex-1 min-w-0' },
          U.h('div', { class: 'flex flex-wrap items-center gap-1' },
            U.h('span', { class: 'font-semibold text-sm', text: s.elementName }),
            UI.badge('چرخهٔ ' + U.formatInt(s.cycleNo), 'muted'),
            UI.badge(s.operatorName, 'outline'),
            isExcluded ? UI.badge('خارج‌شده', 'red', 'ban') : UI.badge('مشکوک', 'amber')),
          U.h('div', { class: 'text-xs mt-1 num' },
            'مقدار: ' + U.formatTimeValue(s.value) + ' ثانیه' +
            (s.score ? ' · امتیاز Z تعدیل‌شده: ' + U.formatTimeValue(s.score, 2) : '')),
          U.h('div', { class: 'text-xs text-muted mt-1', text: ruleText })),
        U.h('div', { class: 'shrink-0 self-center' }, actionBtn)));
    });
    card.appendChild(list);
    return card;
  }

  /* ── دیالوگ خروج مشاهده از محاسبات (دادهٔ خام حذف نمی‌شود) ── */
  function openExcludeDialog(s, ctx) {
    var reason = '';
    UI.dialog({
      title: 'خروج‌کردن مشاهده از محاسبات',
      desc: 'مشاهدهٔ «' + s.elementName + '» در چرخهٔ ' + U.formatInt(s.cycleNo) + ' با مقدار ' + U.formatTimeValue(s.value) +
        ' ثانیه از محاسبات خارج می‌شود. دادهٔ خام حذف نمی‌شود و هر زمان می‌توانید آن را برگردانید. ثبت دلیل برای پیگیری توصیه می‌شود.',
      bodyBuilder: function (body) {
        var ta = U.h('textarea', {
          class: 'textarea',
          placeholder: 'مثلاً: اختلال نوار نقاله در حین ثبت این چرخه',
          'aria-label': 'دلیل خروج (اختیاری اما توصیه‌شده)',
        });
        ta.addEventListener('input', function () { reason = ta.value; });
        body.appendChild(UI.field('دلیل خروج (اختیاری اما توصیه‌شده)', ta));
      },
      footerBuilder: function (close) {
        return U.h('div', { class: 'dialog-footer' },
          U.h('button', { class: 'btn', type: 'button', text: 'انصراف', onclick: close }),
          U.h('div', { class: 'spacer' }),
          U.h('button', {
            class: 'btn btn-destructive', type: 'button',
            onclick: function () {
              try {
                DB.setObservationValidity(s.observationId, 'EXCLUDE', reason || null);
                close();
                UI.toast('وضعیت مشاهده به‌روزرسانی شد؛ دادهٔ خام دست‌نخورده باقی مانده است.');
                ctx.rerender();
              } catch (err) { UI.toastError(err); }
            },
          }, U.icon('ban'), 'خارج کن'));
      },
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
