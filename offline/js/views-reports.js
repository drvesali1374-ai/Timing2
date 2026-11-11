/* ═══════════════════════════════════════════════════════════
   views-reports.js — مرحلهٔ «مرکز گزارش‌ها و خروجی‌ها»
   • خروجی Excel با قالب SpreadsheetML 2003 (.xls) — کاملاً
     آفلاین، برگهٔ RTL، سلول‌های عددی واقعی — در چهار نوع:
     نگاه کل پروژه، خلاصهٔ محاسبات، مقایسهٔ اپراتورها، دادهٔ خام
   • گزارش رسمی A4 (پیش‌نمایش چاپ/PDF): پارامترها و فرض‌های
     محاسبات، جعبهٔ هشدارهای بازبینی، دسته‌های مجاز، جدول
     عناصر (OT/NT/ST)، زمان استاندارد کل، مشاهدات مشکوک و
     امضاها — همگام با فیلترهای فعالیت/اپراتور
   • §۱۶: کارت «مرکز گزارش‌ها» — سه حالت نمایش عوامل وستینگهاوس
     (رتبهٔ حروفی / مقدار عددی / هر دو) + اندازهٔ کاغذ و جهت چاپ؛
     تنظیمات پروژه‌محور است و بلافاصله ذخیره می‌شود.
   • §۱۶.۱: حالت نمایش فقط ظاهر ستون وستینگهاوس را عوض می‌کند؛
     محاسبات، R و ترتیب/نام چهار عامل ثابت می‌مانند.
   • §۱۶.۲: چاپ با تزریق پویای @page (کاغذ/جهت) + پاورقی
     تکرارشوندهٔ هر صفحه؛ شماره‌گذاری صفحات بر عهدهٔ مرورگر است.
   ═══════════════════════════════════════════════════════════ */
(function (g) {
  'use strict';
  var U = g.T2U, DB = g.T2DB, UI = g.T2UI;
  g.T2VIEWS = g.T2VIEWS || {};

  var NOT_COMPUTABLE = 'قابل محاسبه نیست';
  var ALLOWANCE_STATUS_LABELS = { INHERITED: 'ارث‌رسیده', OVERRIDDEN: 'جایگزین‌شده', CUSTOM: 'اختصاصی', EXCLUDED: 'حذف از ارث‌بری' };

  var REPORT_TYPES = [
    { value: 'overview', label: 'نگاه کل پروژه' },
    { value: 'summary', label: 'خلاصهٔ محاسبات (عناصر)' },
    { value: 'operators', label: 'مقایسهٔ اپراتورها' },
    { value: 'raw', label: 'داده‌های خام مشاهدات' },
  ];

  var HELP_REPORTS = {
    what: 'محل تهیهٔ خروجی Excel برای تحلیل داده و گزارش رسمی PDF/چاپ با تمام پارامترها و فرض‌های محاسبات.',
    input: 'نوع گزارش، فعالیت و اپراتور را انتخاب کنید؛ فیلترها هم روی Excel و هم روی گزارش رسمی اعمال می‌شوند.',
    example: 'برای گزارش یک اپراتور خاص، او را از فیلتر انتخاب کنید؛ زمان‌ها میانگین همان اپراتور خواهد بود و در متن گزارش شفاف می‌شود.',
    note: 'گزارش رسمی، نتیجهٔ نیازمند بازبینی را استاندارد قطعی معرفی نمی‌کند و موارد بازبینی را در ابتدا فهرست می‌کند.',
  };

  var ST_STATUS_XLS = { OK: 'قابل ارائه', NEEDS_AGGREGATION_RULE: 'قاعدهٔ تجمیع', INCOMPLETE: 'ناقص' };
  var ST_STATUS_A4 = { NEEDS_AGGREGATION_RULE: 'نیازمند قاعدهٔ تجمیع', INCOMPLETE: 'نیازمند تکمیل داده' };
  var VALIDITY_SHORT = { VALID: 'معتبر', SUSPECT: 'مشکوک', EXCLUDED: 'خارج‌شده', INVALID: 'نامعتبر' };
  var ALLOWANCE_SOURCE_LABELS = { OVERRIDE: 'اختصاصی فعالیت', GROUP: 'گروه', NONE: '—' };
  var OUTLIER_RULE_LABELS = { MODIFIED_Z_MAD: 'Z تعدیل‌شده', IQR_FENCE: 'IQR' };
  var METHOD_SHORT = { SNAPBACK: 'برگشت به صفر', CONTINUOUS: 'پیوسته' };

  /* راهنمای کارت «مرکز گزارش‌ها و خروجی‌ها» — §۱۶ */
  var HELP_REPORT_CENTER = {
    what: 'تنظیمات نمایش و چاپ گزارش‌ها در یکجا جمع شده‌اند تا در چند صفحه پراکنده نباشند.',
    input: 'حالت نمایش عوامل وستینگهاوس و تنظیمات کاغذ را انتخاب کنید؛ همان تنظیم در پیش‌نمایش و چاپ اعمال می‌شود.',
    example: 'برای گزارش رسمی چاپی معمولاً BOTH مناسب است؛ برای تحلیل سریع NUMERIC.',
    note: 'این تنظیم فقط نحوهٔ نمایش عوامل را عوض می‌کند؛ محاسبات و R تغییر نمی‌کنند. تنظیم در سطح پروژه ذخیره می‌شود.',
  };

  /* راهنمای گروه رادیوی حالت نمایش — §۱۶.۱ */
  var HELP_WESTINGHOUSE_MODE = {
    what: 'چهار عامل مهارت، تلاش، شرایط و ثبات در ستون «وستینگهاوس» جدول عناصر به سه شکل نمایش داده می‌شوند؛ ستون R جدا و دست‌نخورده می‌ماند.',
    input: 'حالت دلخواه را انتخاب کنید؛ انتخاب برای این پروژه ذخیره می‌شود و هم در پیش‌نمایش و هم در چاپ یکسان اعمال می‌شود.',
    example: 'حالت عددی هر عامل را با علامت نشان می‌دهد؛ مثل \u200E+0.02\u200E یا \u200E−0.13\u200E.',
    note: 'این تنظیم فقط نحوهٔ نمایش عوامل را عوض می‌کند؛ محاسبات و R تغییر نمی‌کنند.',
  };

  /* سه گزینهٔ رادیو — اعداد/رتبه‌ها با span جهت‌دار LTR ساخته می‌شوند */
  var WH_MODES = [
    {
      value: 'GRADE',
      label: function () {
        return ['فقط رتبهٔ حروفی (مثل ', ltr('A1'), '، ', ltr('B2'), '، ', ltr('C'), ')'];
      },
    },
    {
      value: 'NUMERIC',
      label: function () {
        return ['فقط مقدار عددی اثر (مثل ', ltr('+0.02'), ' یا ', ltr('−0.13'), ')'];
      },
    },
    {
      value: 'BOTH',
      label: function () { return ['رتبه و مقدار عددی با هم (پیش‌فرض)']; },
    },
  ];

  /* وضعیت فیلترها بین رندرها حفظ می‌شود (به ازای هر پروژه) */
  var uiState = {};
  /* کارت «مرکز گزارش‌ها» پیش‌فرض باز است — §۱۶ (مانند نسخهٔ وب) */
  var centerCardOpen = true;

  /* ═══════════ SpreadsheetML 2003 — سازندهٔ سند .xls ═══════════
     آفلاین‌پسند؛ اکسل به‌صورت بومی باز می‌کند؛ برگه‌های RTL؛
     مقادیر عددی به‌صورت سلول Number واقعی (نه متن) */
  function xlsDoc(sheets) {
    var esc = function (s) { return U.escapeHtml(String(s)); };
    var body = sheets.map(function (sh) {
      var rows = ['<Row>' + sh.headers.map(function (h) { return '<Cell ss:StyleID="hdr"><Data ss:Type="String">' + esc(h) + '</Data></Cell>'; }).join('') + '</Row>'];
      sh.rows.forEach(function (r) {
        rows.push('<Row>' + r.map(function (c) {
          if (c === null || c === undefined || c === '') return '<Cell/>';
          if (typeof c === 'number' && isFinite(c)) return '<Cell><Data ss:Type="Number">' + c + '</Data></Cell>';
          return '<Cell><Data ss:Type="String">' + esc(c) + '</Data></Cell>';
        }).join('') + '</Row>');
      });
      return '<Worksheet ss:Name="' + esc(sh.name) + '" ss:RightToLeft="1"><Table>' + rows.join('') + '</Table></Worksheet>';
    }).join('');
    return '<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?>' +
      '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">' +
      '<Styles><Style ss:ID="hdr"><Font ss:Bold="1"/><Interior ss:Color="#EFEAFF" ss:Pattern="Solid"/></Style></Styles>' + body + '</Workbook>';
  }

  /** عدد|null|نامتناهی → سلول خالی اکسل */
  function num(v) { return v === null || v === undefined || !isFinite(v) ? '' : v; }

  function isNull(v) { return v === null || v === undefined || (typeof v === 'number' && !isFinite(v)); }

  /* عدد/کد LTR داخل متن فارسی — جهت رندر تضمینی */
  function ltr(text) { return U.h('span', { dir: 'ltr' }, text); }

  /* ═══════════ عوامل وستینگهاوس در سه حالت نمایش — §۱۶.۱ ═══════════
     ترتیب و نام چهار عامل (مهارت/تلاش/شرایط/ثبات) همیشه ثابت است و
     ستون پنجمی وجود ندارد؛ حالت فقط «نحوهٔ نمایش» را عوض می‌کند و روی
     محاسبات/R اثری ندارد. پیش‌نمایش و چاپ از همین DOM می‌آیند. */

  /** مقدار عددی عامل با علامت — +0.02 / −0.13 / 0.06
   *  علامت فقط برای مقادیر ناصفر (منهای U+2212)؛ ارقام فارسی یا لاتین
   *  مطابق تنظیم نمایش برنامه، اما جهت رندر همیشه LTR می‌ماند
   *  (فراخواننده span dir="ltr" می‌گذارد). */
  function formatSignedFactor(value) {
    var v = typeof value === 'number' && isFinite(value) ? value : 0;
    var mag = Math.round((Math.abs(v) + Number.EPSILON) * 100) / 100;
    var sign = mag === 0 ? '' : v > 0 ? '+' : v < 0 ? '−' : '';
    return sign + U.formatTimeValue(mag, 2);
  }

  /** سلول ستون «وستینگهاوس (S/E/C/Cons)» بر اساس حالت نمایش:
   *  GRADE فقط رتبهٔ حروفی فشرده («A1/B2/C/D»)، NUMERIC فقط مقدار
   *  عددی علامت‌دار LTR («+0.02 · −0.13 · …»)، BOTH رتبه + مقدار در
   *  پرانتز («A1 (+0.02) · …»). عنصر بدون ارزیابی «ارزیابی نشده» است؛
   *  زیرخط «جدول: …» می‌ماند و ستون R جدا و دست‌نخورده است. */
  function westinghouseCell(rating, mode) {
    if (!rating || !rating.assessment) {
      return U.h('span', { class: 'pr-wh-unrated', text: 'ارزیابی نشده' });
    }
    var a = rating.assessment;
    var grades = [a.skillGrade, a.effortGrade, a.conditionsGrade, a.consistencyGrade];
    var values = [a.skillValue, a.effortValue, a.conditionsValue, a.consistencyValue];
    var wrap = U.h('div', { class: 'pr-wh' });
    if (mode === 'GRADE') {
      wrap.appendChild(document.createTextNode(grades.map(function (x) { return x || '—'; }).join('/')));
    } else {
      for (var i = 0; i < 4; i++) {
        if (i > 0) wrap.appendChild(document.createTextNode(' · '));
        var txt = mode === 'NUMERIC'
          ? formatSignedFactor(values[i])
          : (grades[i] || '—') + ' (' + formatSignedFactor(values[i]) + ')';
        wrap.appendChild(U.h('span', { class: 'pr-wh-val', dir: 'ltr', text: txt }));
      }
    }
    wrap.appendChild(U.h('div', { class: 'pr-wh-table', text: 'جدول: ' + (rating.table ? rating.table.name : '—') }));
    return wrap;
  }

  /* ═══════════════════════════════════════════════════════════
     مرحلهٔ «گزارش‌ها»
     ═══════════════════════════════════════════════════════════ */
  g.T2VIEWS.reports = function (container, projectId) {
    U.clear(container);
    var project = DB.getProject(projectId);
    if (!project) {
      container.appendChild(UI.emptyState({ title: 'پروژه یافت نشد', desc: 'این پروژه حذف شده یا شناسه آن نامعتبر است.', icon: 'package' }));
      return;
    }

    var flt = uiState[projectId];
    if (!flt) flt = uiState[projectId] = { type: 'overview', activity: '', operator: '' };

    /* تنظیمات مرکز گزارش‌ها — §۱۶ (پروژه‌محور؛ پیش‌فرض BOTH/A4/عمودی).
       در آغاز هر رندر تازه خوانده می‌شود تا تغییرها از همین‌جا اعمال شوند. */
    var settings = DB.getReportSettings(projectId);
    /* تحلیل فعالیت‌های منتخب — یک‌بار در هر رندر محاسبه می‌شود */
    var analyses = [];

    var root = U.h('div', null);
    container.appendChild(root);

    var stations = DB.listActivitiesForAnalysis(projectId);
    var operators = DB.listOperators(projectId);
    var allActivities = [];
    stations.forEach(function (s) { s.activities.forEach(function (a) { allActivities.push(a); }); });

    /* اعتبارسنجی فیلترهای ذخیره‌شده در برابر دادهٔ فعلی */
    if (flt.activity && !allActivities.some(function (a) { return a.id === flt.activity; })) flt.activity = '';
    if (flt.operator && !operators.some(function (o) { return o.id === flt.operator; })) flt.operator = '';

    function currentOperatorName() {
      if (!flt.operator) return null;
      var op = operators.filter(function (o) { return o.id === flt.operator; })[0];
      return op ? op.displayName : null;
    }

    function chosenActivities() {
      return allActivities.filter(function (a) { return !flt.activity || a.id === flt.activity; });
    }

    function render() {
      if (!root.isConnected) return;
      settings = DB.getReportSettings(projectId);
      analyses = chosenActivities().map(function (a) { return DB.getActivityAnalysis(a.id); });
      U.clear(root);
      buildHeader();
      buildTopBar();
      root.appendChild(buildCenterCard());
      buildFilters();
      buildPreview();
    }

    /* ── سربرگ (خارج از چاپ — در چاپ فقط div.print-report دیده می‌شود) ── */
    function buildHeader() {
      root.appendChild(U.h('header', { class: 'flex items-center gap-3 mb-4 no-print' },
        U.h('span', { class: 'chip-icon' }, U.icon('fileText')),
        U.h('div', { class: 'min-w-0' },
          U.h('div', { class: 'flex items-center gap-1' },
            U.h('h1', { class: 'text-xl font-extrabold', text: 'مرکز گزارش‌ها و خروجی‌ها' }),
            UI.helpDot('مرکز گزارش‌ها', HELP_REPORTS)),
          U.h('p', { class: 'text-sm text-muted', text: 'خروجی Excel برای تحلیل و گزارش رسمی برای چاپ/PDF' }))));
    }

    /* ── نوار چاپ (فقط وقتی داده‌ای برای گزارش هست) ── */
    function buildTopBar() {
      var hasData = analyses.some(function (an) { return an.sampleProgress.totalCycles > 0; });
      if (!hasData) return;
      root.appendChild(U.h('div', { class: 'flex flex-wrap gap-2 mb-4 no-print' },
        U.h('button', { class: 'btn btn-brand', onclick: handlePrint }, U.icon('printer'), 'چاپ / ذخیره PDF')));
    }

    /* ── چاپ با تزریق پویای @page — §۱۶.۲ ──
       اندازهٔ کاغذ/جهت در CSS پارامتری‌شدنی نیست (نه در کلاس، نه با
       CSS var)؛ بنابراین درست پیش از window.print یک <style> موقت
       (A4: ۲۱۰×۲۹۷mm، A3: ۲۹۷×۴۲۰mm — افقی جابه‌جا) به head اضافه و
       پس از چاپ حذف می‌شود. پیش‌فرض (A4 عمودی) در app.css می‌ماند؛
       پشتیبان مرورگرهای بدون afterprint: حذف پس از ۶۰ ثانیه. */
    function handlePrint() {
      var styleId = 'print-page-style';
      var old = document.getElementById(styleId);
      if (old && old.parentNode) old.parentNode.removeChild(old);
      var dims = settings.paperSize === 'A3' ? ['297mm', '420mm'] : ['210mm', '297mm'];
      var sizeCss = settings.orientation === 'landscape' ? dims[1] + ' ' + dims[0] : dims[0] + ' ' + dims[1];
      var el = document.createElement('style');
      el.id = styleId;
      el.textContent = '@page { size: ' + sizeCss + '; margin: 14mm 12mm; }';
      document.head.appendChild(el);
      var done = false;
      var cleanup = function () {
        if (done) return;
        done = true;
        if (el.parentNode) el.parentNode.removeChild(el);
        g.removeEventListener('afterprint', cleanup);
      };
      g.addEventListener('afterprint', cleanup);
      g.print();
      g.setTimeout(cleanup, 60000);
    }

    /* ── کارت «مرکز گزارش‌ها و خروجی‌ها» — §۱۶ ──
       نکته: چیدمان با کلاس‌های kit (collapsible-*) ساخته می‌شود اما
       چرخش شِورون با مرجع مستقیم مدیریت می‌شود — همان دورزنی کارت
       تنظیمات تشخیص غیرعادی در views-analysis برای باگ ui.js
       (کوئری «svg:last-child» در collapsibleCard). */
    function buildCenterCard() {
      var open = centerCardOpen;
      var bodyWrap = U.h('div', { class: 'collapsible-body' });
      var chevron = U.icon('chevronDown');

      function toggle() {
        open = !open;
        centerCardOpen = open;
        paint();
      }

      var head = U.h('div', { class: 'collapsible-head', onclick: toggle },
        U.h('span', { class: 'chip-icon' }, U.icon('settings2')),
        U.h('div', { class: 'flex-1 min-w-0' },
          U.h('div', { class: 'font-bold text-sm', text: 'مرکز گزارش‌ها و خروجی‌ها' })),
        UI.helpDot('مرکز گزارش‌ها', HELP_REPORT_CENTER),
        U.h('span', { class: 'text-faint', 'aria-hidden': 'true' }, chevron));

      var card = U.h('section', { class: 'card collapsible-card mb-4 no-print', 'aria-label': 'مرکز گزارش‌ها و خروجی‌ها' },
        head, bodyWrap);

      function paint() {
        bodyWrap.style.display = open ? '' : 'none';
        chevron.style.transform = open ? 'rotate(180deg)' : '';
        U.clear(bodyWrap);
        if (open) buildCenterBody(bodyWrap);
      }
      paint();
      return card;
    }

    /* بدنهٔ کارت مرکز گزارش‌ها — حالت نمایش وستینگهاوس (§۱۶.۱) +
       اندازه/جهت کاغذ چاپ (§۱۶.۲) + یادآوری شماره‌گذاری صفحات */
    function buildCenterBody(body) {
      var mode = settings.westinghouseMode;

      /* گروه رادیو «حالت نمایش چهار عامل وستینگهاوس» — الگوی radio-card.
         برچسب با markup دستی ساخته می‌شود (نه UI.field) تا label دور
         چند کنترل، کلیک متن را به رادیوی اول نچسباند. */
      var group = U.h('div', {
        class: 'grid grid-cols-1 md:grid-cols-3 gap-2',
        role: 'radiogroup', 'aria-label': 'حالت نمایش چهار عامل وستینگهاوس',
      });
      WH_MODES.forEach(function (o) {
        var rb = U.h('input', {
          type: 'radio', name: 't2r-wh-mode', checked: mode === o.value,
          style: { accentColor: 'var(--brand)', marginTop: '3px' },
        });
        var rc = U.h('label', { class: 'radio-card' + (mode === o.value ? ' selected' : '') },
          rb, U.h('span', { class: 'text-sm leading-relaxed' }, o.label()));
        rb.addEventListener('change', function () {
          try {
            DB.putReportSettings(projectId, { westinghouseMode: o.value });
            UI.toast('تنظیم نمایش وستینگهاوس ذخیره شد.');
            render();
          } catch (err) {
            UI.toastError(err);
          }
        });
        group.appendChild(rc);
      });
      body.appendChild(U.h('div', null,
        U.h('div', { class: 'field-label' },
          'حالت نمایش چهار عامل وستینگهاوس',
          UI.helpDot('حالت نمایش وستینگهاوس', HELP_WESTINGHOUSE_MODE)),
        group,
        U.h('p', {
          class: 'hint',
          text: 'این تنظیم فقط نحوهٔ نمایش عوامل را عوض می‌کند؛ محاسبات و R تغییر نمی‌کنند.',
        })));

      /* اندازه و جهت کاغذ چاپ — §۱۶.۲ */
      var paperSel = UI.selectEl(
        [{ value: 'A4', label: 'A4 (پیش‌فرض)' }, { value: 'A3', label: 'A3' }],
        settings.paperSize,
        function (v) {
          try { DB.putReportSettings(projectId, { paperSize: v }); } catch (err) { UI.toastError(err); }
          render();
        },
        'اندازهٔ کاغذ چاپ');
      var orientSel = UI.selectEl(
        [{ value: 'portrait', label: 'عمودی (پیش‌فرض)' }, { value: 'landscape', label: 'افقی' }],
        settings.orientation,
        function (v) {
          try { DB.putReportSettings(projectId, { orientation: v }); } catch (err) { UI.toastError(err); }
          render();
        },
        'جهت کاغذ');
      body.appendChild(U.h('div', { class: 'grid grid-cols-1 md:grid-cols-2 gap-3 mt-4' },
        UI.field('اندازهٔ کاغذ چاپ', paperSel),
        UI.field('جهت کاغذ', orientSel)));

      body.appendChild(U.h('p', { class: 'hint' },
        'شماره‌گذاری صفحات بر عهدهٔ تنظیمات چاپ مرورگر است (در پنجرهٔ چاپ، ',
        ltr('Headers and footers'),
        ' را فعال کنید).'));
    }

    /* ── کارت فیلترها و خروجی Excel ── */
    function buildFilters() {
      var card = U.h('section', { class: 'card p-4 mb-4 no-print' });
      card.appendChild(U.h('div', { class: 'flex items-center gap-2 mb-3' },
        U.icon('sliders'),
        U.h('span', { class: 'font-bold', text: 'فیلترها و خروجی Excel' })));

      var typeSel = UI.selectEl(REPORT_TYPES, flt.type, function (v) { flt.type = v; render(); }, 'نوع گزارش Excel');

      var actOptions = [{ value: '', label: 'همهٔ فعالیت‌ها' }];
      stations.forEach(function (s) {
        s.activities.forEach(function (a) {
          actOptions.push({ value: a.id, label: s.name + ' — ' + a.name + (a.cyclesCount === 0 ? ' (بدون داده)' : '') });
        });
      });
      var actSel = UI.selectEl(actOptions, flt.activity, function (v) { flt.activity = v; render(); }, 'فعالیت');

      var opOptions = [{ value: '', label: 'همهٔ اپراتورها' }].concat(operators.map(function (o) {
        return { value: o.id, label: o.displayName };
      }));
      var opSel = UI.selectEl(opOptions, flt.operator, function (v) { flt.operator = v; render(); }, 'اپراتور');

      card.appendChild(U.h('div', { class: 'grid grid-cols-1 md:grid-cols-3 gap-3' },
        UI.field('نوع گزارش Excel', typeSel),
        UI.field('فعالیت', actSel),
        UI.field('اپراتور', opSel)));

      card.appendChild(U.h('div', { class: 'mt-3' },
        U.h('button', { class: 'btn btn-brand', onclick: downloadExcel }, U.icon('download'), 'دانلود Excel')));
      root.appendChild(card);
    }

    function downloadExcel() {
      try {
        var typeLabel = (REPORT_TYPES.filter(function (t) { return t.value === flt.type; })[0] || REPORT_TYPES[0]).label;
        var xml = buildXls();
        U.downloadFile(project.name + ' — ' + typeLabel + '.xls', xml, 'application/vnd.ms-excel');
        UI.toast('فایل Excel در حال دانلود است؛ برای تحلیل، مقادیر عددی واقعی هستند.');
      } catch (err) {
        UI.toastError(err);
      }
    }

    /* ═══════════ خروجی Excel — دادهٔ هر نوع، با احترام به فیلترها ═══════════ */
    function buildXls() {
      var sheets = [];
      var analyses = chosenActivities().map(function (a) { return DB.getActivityAnalysis(a.id); });

      if (flt.type === 'overview') {
        var dash = DB.getProjectDashboard(projectId);
        sheets.push({
          name: 'نگاه کل',
          headers: ['ایستگاه', 'فعالیت', 'نوع', 'عناصر', 'چرخهٔ معتبر', 'هدف', 'OT جمع (ثانیه)', 'ST (ثانیه)', 'وضعیت ST', 'مشکوک در انتظار'],
          rows: dash.activities
            .filter(function (r) { return !flt.activity || r.activityId === flt.activity; })
            .map(function (r) {
              return [r.stationName, r.activityName,
                DB.CONST.PROCESS_TYPE_LABELS[r.processType] || r.processType,
                r.elementsCount, r.validCycles, num(r.target), num(r.otSum), num(r.st),
                ST_STATUS_XLS[r.stStatus] || r.stStatus, r.suspectsPending];
            }),
        });
      } else if (flt.type === 'summary') {
        var eRows = [], wRows = [], aRows = [];
        analyses.forEach(function (an) {
          an.elements.forEach(function (el) {
            eRows.push([an.activity.stationName, an.activity.name, el.name,
              DB.CONST.ELEMENT_TYPE_LABELS[el.elementType] || el.elementType,
              el.counts.calcBasis, el.counts.suspect, el.counts.excluded,
              num(el.ot), num(el.rating ? el.rating.totalFactor : null), num(el.nt), num(el.st), num(el.stats.cvPercent)]);
            var r = DB.getElementRating(el.id);
            wRows.push([el.name, an.activity.name,
              r && r.table ? r.table.name : '—',
              r && r.table ? r.table.version : '—',
              r && r.assessment ? (r.assessment.skillGrade || '—') : '—',
              r && r.assessment ? (r.assessment.effortGrade || '—') : '—',
              r && r.assessment ? (r.assessment.conditionsGrade || '—') : '—',
              r && r.assessment ? (r.assessment.consistencyGrade || '—') : '—',
              r && r.assessment ? r.assessment.totalFactor : '—']);
          });
          an.allowances.categories.forEach(function (c) {
            if (isNull(c.effectiveValue)) return;
            aRows.push([an.activity.name, c.name, ALLOWANCE_SOURCE_LABELS[c.source] || c.source, c.effectiveValue, c.isActive ? 'بله' : 'خیر']);
          });
        });
        sheets.push({
          name: 'خلاصهٔ عناصر',
          headers: ['ایستگاه', 'فعالیت', 'عنصر', 'نوع', 'در محاسبات', 'مشکوک', 'خارج‌شده', 'OT', 'R', 'NT', 'ST', 'CV٪'],
          rows: eRows,
        });
        sheets.push({
          name: 'وستینگهاوس',
          headers: ['عنصر', 'فعالیت', 'جدول', 'نسخه', 'مهارت', 'تلاش', 'شرایط', 'یکنواختی', 'R'],
          rows: wRows,
        });
        sheets.push({
          name: 'دسته‌های مجاز',
          headers: ['فعالیت', 'دسته', 'منبع', 'مقدار', 'فعال'],
          rows: aRows,
        });
      } else if (flt.type === 'operators') {
        var oRows = [];
        analyses.forEach(function (an) {
          an.elements.forEach(function (el) {
            el.operators.forEach(function (op) {
              if (flt.operator && op.operatorId !== flt.operator) return;
              oRows.push([an.activity.name, el.name, op.operatorName, op.count,
                num(op.mean), num(op.sampleSD), num(op.cvPercent), num(op.nt), num(op.st),
                op.suspectCount, op.excludedCount]);
            });
          });
        });
        sheets.push({
          name: 'مقایسهٔ اپراتورها',
          headers: ['فعالیت', 'عنصر', 'اپراتور', 'تعداد', 'میانگین', 'انحراف معیار', 'CV٪', 'NT', 'ST', 'مشکوک', 'خارج‌شده'],
          rows: oRows,
        });
      } else {
        var rRows = [];
        analyses.forEach(function (an) {
          var sessions = DB.listSessions(an.activity.id).filter(function (se) {
            return !flt.operator || se.operatorId === flt.operator;
          });
          sessions.forEach(function (se) {
            var sheet = DB.getSheet(se.id);
            var nameById = {};
            sheet.elements.forEach(function (e) { nameById[e.id] = e.name; });
            sheet.cycles.forEach(function (c) {
              c.observations.forEach(function (o) {
                rRows.push([an.activity.name, U.formatDateTime(se.startedAt), sheet.operator.displayName,
                  DB.CONST.TIMING_METHOD_LABELS[se.timingMethod] || se.timingMethod,
                  c.cycleNo, nameById[o.workElementId] || 'عنصر حذف‌شده',
                  num(o.rawDuration), num(o.cumulativeReading), num(o.startOffset), num(o.endOffset), num(o.derivedDuration),
                  VALIDITY_SHORT[o.validityStatus] || o.validityStatus, o.exclusionReason || '']);
              });
            });
          });
        });
        sheets.push({
          name: 'داده‌های خام',
          headers: ['فعالیت', 'جلسه', 'اپراتور', 'روش', 'چرخه', 'عنصر', 'مقدار خام', 'قرائت تجمعی', 'شروع', 'پایان', 'مدت (ثانیه)', 'وضعیت', 'دلیل خروج'],
          rows: rRows,
        });
      }
      return xlsDoc(sheets);
    }

    /* ═══════════════════════════════════════════════════════════
       گزارش رسمی A4 — پیش‌نمایش چاپ (div.print-report)
       ═══════════════════════════════════════════════════════════ */

    /* جدول سادهٔ داخل گزارش چاپی — سلول می‌تواند رشته/گره یا شیء
       { cls: 'pr-note', text } / { node } باشد؛ pr-note سلول‌های
       متن‌بلند را در چاپ راست‌چین RTL نگه می‌دارد (§۱۶.۲) */
    function prTable(headers, rows) {
      var thead = U.h('thead', null, U.h('tr', null, headers.map(function (hd) { return U.h('th', { text: hd }); })));
      var tbody = U.h('tbody');
      rows.forEach(function (r) {
        tbody.appendChild(U.h('tr', null, r.map(function (c) {
          if (c && (c.cls || c.node !== undefined)) {
            return U.h('td', { class: c.cls || null }, c.node !== undefined ? c.node : c.text);
          }
          return U.h('td', null, c);
        })));
      });
      return U.h('table', null, thead, tbody);
    }

    /* جدول کلید→مقدار (ستون اول سرصفحهٔ سطر) */
    function prKV(pairs) {
      var tbody = U.h('tbody');
      pairs.forEach(function (p) {
        tbody.appendChild(U.h('tr', null,
          U.h('th', { class: 'pr-note', style: { width: '34%' }, text: p[0] }),
          U.h('td', { class: 'pr-note' }, p[1])));
      });
      return U.h('table', null, tbody);
    }

    function infoBox(text) {
      return U.h('div', { class: 'border rounded p-2 text-xs' }, text);
    }

    function buildPreview() {
      root.appendChild(U.h('div', { class: 'flex flex-wrap items-center justify-between gap-2 mb-2 no-print' },
        U.h('span', {
          class: 'text-sm font-bold',
          text: 'پیش‌نمایش گزارش رسمی (چاپ روی ' + settings.paperSize + ' ' +
            (settings.orientation === 'landscape' ? 'افقی' : 'عمودی') + ')',
        }),
        UI.badge('همگام با فیلترها', 'green')));

      var hasData = analyses.some(function (an) { return an.sampleProgress.totalCycles > 0; });
      if (!hasData) {
        root.appendChild(UI.emptyState({ title: 'هنوز داده‌ای برای گزارش‌گیری ثبت نشده است', icon: 'fileText' }));
        return;
      }

      var dash = DB.getProjectDashboard(projectId);
      var rep = U.h('div', { class: 'print-report' });

      /* سرصفحهٔ گزارش */
      rep.appendChild(U.h('h2', { class: 'pr-title text-center', text: 'گزارش مطالعهٔ زمان' }));
      var meta = U.h('div', { class: 'pr-meta text-center mt-1' });
      meta.appendChild(U.h('div', { text: 'پروژه: ' + project.name }));
      meta.appendChild(U.h('div', { text: 'خط تولید: ' + project.lineName + ' · محصول: ' + project.productName }));
      meta.appendChild(U.h('div', { text: 'تاریخ مطالعه: ' + U.formatDate(project.studyDate) }));
      meta.appendChild(U.h('div', { text: 'تاریخ تهیهٔ گزارش: ' + U.formatDateTime(U.nowISO()) }));
      if (dash.project.finalized) meta.appendChild(U.h('div', { text: 'وضعیت: نهایی‌شده' }));
      rep.appendChild(meta);

      rep.appendChild(buildFlagsBox(dash.reviewNeeds));
      rep.appendChild(buildParamsSection(analyses[0].settings));
      analyses.forEach(function (an, idx) { rep.appendChild(buildActivitySection(an, idx + 2)); });
      rep.appendChild(buildReportFooter());
      /* پاورقی تکرارشوندهٔ چاپ — §۱۶.۲: در Chrome عناصر position:fixed
         روی همهٔ صفحات چاپ تکرار می‌شوند؛ شماره‌گذاری صفحات عمداً جعل
         نمی‌شود و بر عهدهٔ تنظیمات «Headers and footers» مرورگر است. */
      rep.appendChild(U.h('div', {
        class: 'print-running-footer',
        text: project.name + ' — گزارش مطالعهٔ زمان — صفحه‌بندی خودکار',
      }));
      root.appendChild(rep);
    }

    /* جعبهٔ هشدارهای کهربایی — موارد نیازمند توجه پیش از اتکا */
    function buildFlagsBox(rn) {
      var flags = [];
      if (rn.suspectsPending > 0) flags.push(U.formatInt(rn.suspectsPending) + ' مشاهدهٔ مشکوک بازبینی‌نشده');
      if (rn.elementsWithoutRating.length > 0) flags.push(U.formatInt(rn.elementsWithoutRating.length) + ' عنصر بدون ارزیابی وستینگهاوس');
      rn.activitiesNeedingAggregationRule.forEach(function (name) {
        flags.push('فعالیت «' + name + '» نیازمند قاعدهٔ تجمیع');
      });
      rn.activitiesIncomplete.forEach(function (name) {
        flags.push('فعالیت «' + name + '» ناقص');
      });
      if (rn.sampleShortfall.length > 0) flags.push(U.formatInt(rn.sampleShortfall.length) + ' فعالیت به هدف نمونه نرسیده');
      if (rn.needsRecalc) flags.push('محاسبات نسخه‌دار به‌روز نیست');
      return U.h('div', { class: 'border p-2 mt-3 print-break-avoid', style: { borderColor: 'var(--amber)', background: 'var(--amber-soft)' } },
        U.h('div', { class: 'text-xs font-bold mb-1', style: { color: 'var(--amber)' }, text: 'موارد نیازمند توجه پیش از اتکا به نتایج:' }),
        flags.length
          ? U.h('ul', { class: 'list-none text-xs leading-relaxed' }, flags.map(function (f) { return U.h('li', null, '• ' + f); }))
          : U.h('div', { class: 'text-xs', text: 'مورد خاصی گزارش نشده است.' }));
    }

    /* ۱) پارامترها و فرض‌های محاسبات */
    function buildParamsSection(settings) {
      var outlierText = settings.outlierMethod === 'mad'
        ? 'امتیاز Z تعدیل‌شده (آستانه ' + U.formatTimeValue(settings.outlierThreshold, 1) + ')'
        : 'حصار IQR';
      var sec = U.h('section', { class: 'mt-4 print-break-avoid' },
        U.h('h3', { class: 'font-bold mb-2', text: '۱) پارامترها و فرض‌های محاسبات' }));
      sec.appendChild(prKV([
        ['فرمول زمان استاندارد', U.h('code', { class: 'inline', dir: 'ltr', text: settings.formula })],
        ['روش اعمال مجاز', settings.allowanceMethodLabel],
        ['روش تجمیع چند اپراتور', settings.aggregationMethodLabel],
        ['روش تشخیص دادهٔ غیرعادی', outlierText],
        ['نسخهٔ فرمول', DB.CONST.FORMULA_VERSION],
        ['قاعدهٔ وستینگهاوس', U.h('code', { class: 'inline', dir: 'ltr', text: 'R = 1 + Skill + Effort + Conditions + Consistency' })],
      ]));
      sec.appendChild(U.h('p', {
        class: 'pr-meta mt-1',
        text: 'R = 1 + Skill + Effort + Conditions + Consistency · NT = OT × R · زمان پایه ثانیه است؛ گردکردن فقط نمایشی است و مقادیر خام با دقت کامل نگهداری می‌شوند.',
      }));
      return sec;
    }

    /* بخش هر فعالیت ({i} از ۲ به بعد) */
    function buildActivitySection(an, no) {
      var sec = U.h('section', { class: 'mt-4' },
        U.h('h3', { class: 'font-bold mb-2', text: U.formatInt(no) + ') فعالیت: ' + an.activity.name }),
        U.h('p', {
          class: 'pr-meta mb-2',
          text: an.activity.stationName + ' — ' + (DB.CONST.PROCESS_TYPE_LABELS[an.activity.processType] || an.activity.processType),
        }));

      /* جلسات این فعالیت — با فیلتر اپراتور */
      var sessions = DB.listSessions(an.activity.id).filter(function (se) {
        return !flt.operator || se.operatorId === flt.operator;
      });
      var methods = [];
      sessions.forEach(function (se) {
        var lbl = METHOD_SHORT[se.timingMethod] || se.timingMethod;
        if (methods.indexOf(lbl) < 0) methods.push(lbl);
      });

      var boxes = U.h('div', { class: 'flex flex-wrap gap-2 mb-2' });
      var operatorName = currentOperatorName();
      boxes.appendChild(infoBox('روش کرنومتر جلسات: ' + (methods.length ? methods.join('، ') : '—')));
      boxes.appendChild(infoBox('تعداد نمونه: ' + U.formatInt(an.sampleProgress.validCycles) + ' چرخهٔ معتبر از ' + U.formatInt(an.sampleProgress.totalCycles) + ' چرخهٔ ثبت‌شده'));
      if (!isNull(an.sampleProgress.targetSampleCount)) {
        boxes.appendChild(infoBox('هدف: ' + U.formatInt(an.sampleProgress.targetSampleCount) + ' چرخه'));
      }
      var meanTxt = isNull(an.cycleStats.stats.mean) ? NOT_COMPUTABLE : U.formatTimeValue(an.cycleStats.stats.mean);
      boxes.appendChild(infoBox('میانگین زمان سپری‌شدهٔ چرخه: ' + meanTxt + ' ثانیه (از ' + U.formatInt(an.cycleStats.count) + ' چرخه)'));
      if (operatorName) boxes.appendChild(infoBox('اپراتور منتخب: ' + operatorName));
      sec.appendChild(boxes);

      /* الونس‌های مؤثر — جلسه اول (§۳) */
      var alwRows = (an.allowances.rows || []).filter(function (r) { return r.status !== 'EXCLUDED'; });
      if (alwRows.length > 0) {
        sec.appendChild(U.h('p', {
          class: 'pr-meta font-bold mt-2 mb-1',
          text: 'الونس‌های مؤثر (جمع A = ' + U.formatPercent(an.allowances.summary.totalPercent) + ')' +
            (an.allowances.perCycleTotal > 0 ? ' — زمان ثابت هر چرخه: ' + U.formatTimeValue(an.allowances.perCycleTotal, 1) + ' ثانیه' : ''),
        }));
        sec.appendChild(U.h('div', { class: 'overflow-x-auto' }, prTable(
          ['عنوان الونس', 'نوع / مبنا', 'مقدار مؤثر', 'مبدأ', 'وضعیت'],
          alwRows.map(function (r) {
            return [
              { cls: 'pr-note', text: r.title + (r.code ? ' (' + r.code + ')' : '') },
              r.valueType === 'PERCENT' ? 'درصدی' : (r.applicationBasis === 'PER_CYCLE' ? 'زمان ثابت — هر چرخه' : 'زمان ثابت — هر اجرا'),
              r.valueType === 'PERCENT' ? U.formatPercent(r.percentValue) : U.formatTimeValue(r.timeValueSeconds, 1) + 's',
              r.sourceScopeLabel || '—',
              ALLOWANCE_STATUS_LABELS[r.status] || r.status,
            ];
          }))));
      }

      /* جدول عناصر — با فیلتر اپراتور، زمان‌ها میانگین همان اپراتور است */
      sec.appendChild(U.h('p', { class: 'pr-meta font-bold mt-2 mb-1', text: 'عناصر کاری:' }));
      sec.appendChild(U.h('div', { class: 'overflow-x-auto' }, prTable(
        ['عنصر', 'نوع', 'n', 'میانگین', 'SD', 'CV٪', 'OT', 'وستینگهاوس (S/E/C/Cons)', 'R', 'NT', 'ST'],
        an.elements.map(function (el) {
          var rating = DB.getElementRating(el.id);
          var rVal = rating && rating.assessment ? rating.assessment.totalFactor : null;
          var n, mean, sd, cv, ot, nt, stv;
          if (flt.operator) {
            var opRow = el.operators.filter(function (o) { return o.operatorId === flt.operator; })[0];
            if (opRow) {
              n = opRow.count; mean = opRow.mean; sd = opRow.sampleSD; cv = opRow.cvPercent;
              ot = opRow.mean; nt = opRow.nt; stv = opRow.st;
            } else { n = 0; mean = sd = cv = ot = nt = stv = null; }
          } else {
            n = el.counts.calcBasis; mean = el.stats.mean; sd = el.stats.sampleSD; cv = el.stats.cvPercent;
            ot = el.ot; nt = el.nt; stv = el.st;
          }
          return [
            { cls: 'pr-note', text: el.name },
            DB.CONST.ELEMENT_TYPE_LABELS[el.elementType] || el.elementType,
            U.formatInt(n),
            isNull(mean) ? '—' : U.formatTimeValue(mean),
            isNull(sd) ? '—' : U.formatTimeValue(sd),
            isNull(cv) ? '—' : U.formatTimeValue(cv, 1) + '٪',
            isNull(ot) ? '—' : U.formatTimeValue(ot),
            { node: westinghouseCell(rating, settings.westinghouseMode) },
            isNull(rVal) ? '—' : U.formatTimeValue(rVal, 3),
            isNull(nt) ? '—' : U.formatTimeValue(nt),
            isNull(stv) ? NOT_COMPUTABLE : U.formatTimeValue(stv),
          ];
        }))));

      /* زمان استاندارد کل فعالیت */
      var total = an.activityTotal;
      if (total.status === 'OK' && !isNull(total.st)) {
        sec.appendChild(U.h('div', { class: 'border rounded p-2 mt-2 font-bold' },
          'زمان استاندارد کل فعالیت: ' + U.formatTimeValue(total.st) + ' ثانیه'));
      } else {
        sec.appendChild(U.h('div', { class: 'border rounded p-2 mt-2', style: { borderColor: 'var(--amber)' } },
          U.h('div', { class: 'font-bold', text: ST_STATUS_A4[total.status] || total.status }),
          total.reason ? U.h('div', { class: 'pr-meta', text: total.reason }) : null));
      }

      /* مشاهدات مشکوک و خارج‌شده */
      var suspects = an.suspects.filter(function (s) { return !flt.operator || s.operatorId === flt.operator; });
      if (suspects.length) {
        sec.appendChild(U.h('p', { class: 'pr-meta font-bold mt-2 mb-1', text: 'مشاهدات مشکوک و خارج‌شده:' }));
        sec.appendChild(U.h('div', { class: 'overflow-x-auto' }, prTable(
          ['عنصر', 'چرخه', 'اپراتور', 'مقدار (ثانیه)', 'وضعیت', 'امتیاز Z / قاعده', 'دلیل خروج'],
          suspects.map(function (s) {
            var scoreTxt = isNull(s.score)
              ? '—'
              : U.formatTimeValue(s.score, 2) + ' / ' + (OUTLIER_RULE_LABELS[s.rule] || s.rule || '—');
            return [{ cls: 'pr-note', text: s.elementName }, U.formatInt(s.cycleNo), s.operatorName, U.formatTimeValue(s.value),
              s.validityStatus === 'SUSPECT' ? 'مشکوک' : 'خارج‌شده',
              scoreTxt, { cls: 'pr-note', text: s.exclusionReason || '—' }];
          }))));
      }
      return sec;
    }

    /* پانوشت و امضاها */
    function buildReportFooter() {
      return U.h('footer', { class: 'mt-4' },
        U.h('p', {
          class: 'pr-meta',
          text: 'این گزارش توسط نرم‌افزار زمان‌سنجی صنعتی تولید شده است. مقادیر با دقت کامل محاسبه و فقط برای نمایش گرد شده‌اند. نتیجهٔ نیازمند بازبینی، استاندارد قطعی تلقی نمی‌شود.',
        }),
        U.h('div', { class: 'flex justify-between mt-8 gap-2' },
          U.h('span', { class: 'pr-meta', text: 'نام کارشناس زمان‌سنجی: ....................' }),
          U.h('span', { class: 'pr-meta', text: 'تأیید سرپرست تولید: ....................' }),
          U.h('span', { class: 'pr-meta', text: 'تاریخ تأیید: ....................' })),
        U.h('p', { class: 'pr-meta text-center mt-2', text: 'تولیدشده توسط نرم‌افزار زمان‌سنجی صنعتی — نسخهٔ آفلاین' }));
    }

    render();
  };
})(window);
