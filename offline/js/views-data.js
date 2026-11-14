/* ═══════════════════════════════════════════════════════════
   views-data.js — ابزار «داده و پشتیبان» (خارج از مراحل مطالعه)
   • پشتیبان‌گیری: تنظیمات خودکار (فعال/فاصله/سیاست نگهداری)،
     پشتیبان دستی، بازیابی از نسخه یا از فایل + فهرست نسخه‌ها
     با دانلود/بازیابی/حذف
   • بستهٔ پروژه: خروجی کامل JSON با manifest و checksum
   • تاریخچهٔ تغییرات: رویدادهای حسابرسی با جزئیات قبل/بعد
   ═══════════════════════════════════════════════════════════ */
(function (g) {
  'use strict';
  var U = g.T2U, DB = g.T2DB, UI = g.T2UI;
  g.T2VIEWS = g.T2VIEWS || {};

  // توجه: T2APP در app.js و بعد از نماها بارگذاری می‌شود — دسترسی تنبل (lazy) الزامی است
  function appNavigate(hash) { if (g.T2APP) g.T2APP.navigate(hash); }
  function appRefresh() { if (g.T2APP) g.T2APP.refresh(); }

  /* زبانهٔ فعال بین رندرها حفظ می‌شود */
  var activeTab = 'backup';

  var HELP_AUTO_BACKUP = {
    what: 'پشتیبان‌گیری خودکار کل پایگاه داده (پروژه‌ها، تنظیمات و تاریخچه) را در فاصله‌های زمانی مشخص ذخیره می‌کند.',
    note: 'پشتیبان‌گیری جایگزین ذخیره لحظه‌ای نیست؛ ذخیره تغییرات هر فرم بلافاصله انجام می‌شود. در نسخهٔ آفلاین، نسخه‌های خودکار در حافظهٔ همین مرورگر نگه داشته می‌شوند؛ برای نگهداری بلندمدت، فایل پشتیبان دانلود کنید.',
  };
  var HELP_INTERVAL = {
    what: 'هر چند وقت یک‌بار پشتیبان خودکار گرفته شود.',
    note: 'اگر از آخرین نسخه کمتر از این فاصله گذشته باشد، تیک بعدی رد می‌شود.',
  };
  var HELP_RETENTION = {
    what: 'تعداد نسخه‌های خودکار که نگه داشته می‌شوند؛ نسخه‌های قدیمی‌تر پس از عبور از این تعداد حذف می‌شوند.',
    note: 'نسخه‌های دستی و حفاظتی مشمول این سیاست نمی‌شوند.',
  };
  var HELP_PACKAGE = {
    what: 'فایل JSON نسخه‌دار شامل کل دادهٔ این پروژه با manifest و checksum؛ برای انتقال به سیستم دیگر یا اشتراک‌گذاری.',
    note: 'ورود بسته همیشه پروژهٔ جدید می‌سازد و هیچ داده‌ای بازنویسی نمی‌شود.',
  };

  /* workaround هسته: STAGE_GUIDES.data در app.js با جای‌نگهدین «x»
     مانده است؛ از طریق T2APP.STAGE_GUIDES (آبجکت افشاشده) با محتوای
     واقعی جایگزین می‌شود — بدون دست بردن به فایل‌های هسته. */
  var DATA_STAGE_GUIDE = {
    steps: [
      'پشتیبان‌گیری خودکار را فعال کنید؛ فاصلهٔ زمانی و سیاست نگهداری نسخه‌ها را تعیین کنید.',
      'پشتیبان دستی بسازید و فایل آن را دانلود کنید؛ در صورت نیاز از فایل یا نسخهٔ قبلی بازیابی کنید.',
      'برای انتقال پروژه به سیستم دیگر، «بستهٔ کامل پروژه» را خروجی بگیرید؛ ورود بسته از صفحهٔ خانه انجام می‌شود و همیشه پروژهٔ جدید می‌سازد.',
      '«تاریخچهٔ تغییرات» رویدادهای ایجاد/ویرایش/حذف و خروجی‌ها را با جزئیات قبل/بعد نشان می‌دهد.',
    ],
    next: 'نسخه‌های پشتیبان در حافظهٔ همین مرورگر می‌مانند؛ برای نگهداری بلندمدت، فایل پشتیبان را دانلود کنید.',
  };
  var dataGuidePatched = false;
  function patchDataStageGuide() {
    try {
      var guides = g.T2APP && g.T2APP.STAGE_GUIDES;
      if (!guides) return false;
      var cur = guides.data;
      if (cur && cur.steps && cur.steps.length === 1 && cur.steps[0] === 'x') {
        guides.data = DATA_STAGE_GUIDE;
        return true;
      }
    } catch (e) { /* بی‌خطر */ }
    return false;
  }

  var KIND_META = {
    AUTO: { label: 'خودکار', variant: 'muted' },
    MANUAL: { label: 'دستی', variant: 'brand' },
    PRE_RESTORE: { label: 'حفاظتی', variant: 'amber' },
  };
  var ACTION_META = {
    CREATE: { label: 'ایجاد', variant: 'green' },
    UPDATE: { label: 'ویرایش', variant: 'brand' },
    DELETE: { label: 'حذف', variant: 'red-solid' },
    RESTORE: { label: 'بازیابی', variant: 'cyan' },
    IMPORT: { label: 'ورود', variant: 'cyan' },
    EXPORT: { label: 'خروجی', variant: 'brand' },
    BACKUP: { label: 'پشتیبان', variant: 'muted' },
    FINALIZE: { label: 'نهایی‌سازی', variant: 'green' },
    DUPLICATE: { label: 'کپی', variant: 'muted' },
  };
  var ENTITY_LABELS = {
    Project: 'پروژه', Station: 'ایستگاه', Activity: 'فعالیت', WorkElement: 'عنصر کاری',
    Operator: 'اپراتور', ActivityGroup: 'گروه فعالیت', AllowanceCategory: 'دسته مجاز',
    RatingTable: 'جدول ارزیابی', RatingAssessment: 'ارزیابی', StudySession: 'جلسهٔ زمان‌سنجی',
    CalculationRun: 'اجرای محاسبه', ChartNode: 'گره نمودار', BackupRecord: 'پشتیبان',
  };

  function trunc400(s) {
    s = String(s);
    return s.length > 400 ? s.slice(0, 400) + '…' : s;
  }

  /* فیلد با برچسب راهنمای مستقل (برخلاف UI.field، متن helpDot دقیقاً از مشخصات) */
  function fieldWithHelp(labelText, helpLabel, helpContent, inputEl, hint) {
    return U.h('div', null,
      U.h('label', { class: 'field-label' }, labelText, helpContent ? UI.helpDot(helpLabel, helpContent) : null),
      inputEl,
      hint ? U.h('div', { class: 'hint', text: hint }) : null);
  }

  /* ═══════════════════════════════════════════════════════════
     ابزار «داده و پشتیبان»
     ═══════════════════════════════════════════════════════════ */
  g.T2VIEWS.data = function (container, projectId) {
    U.clear(container);
    var project = DB.getProject(projectId);
    if (!project) {
      container.appendChild(UI.emptyState({ title: 'پروژه یافت نشد', desc: 'این پروژه حذف شده یا شناسه آن نامعتبر است.', icon: 'package' }));
      return;
    }

    var root = U.h('div', { class: 'flex flex-col gap-4' });
    container.appendChild(root);

    /* جایگزینی راهنمای جای‌نگهدین مرحلهٔ «داده و پشتیبان» — یک‌بار؛
       سپس چرمِ برنامه برای نمایش راهنمای اصلاح‌شده بازرندر می‌شود. */
    if (!dataGuidePatched && patchDataStageGuide()) {
      dataGuidePatched = true;
      if (g.T2APP && g.T2APP.refresh) { g.T2APP.refresh(); return; }
    }

    function render() {
      if (!root.isConnected) return;
      U.clear(root);
      root.appendChild(UI.stickyHeading(U.h('header', { class: 'flex items-center gap-3' },
        U.h('span', { class: 'chip-icon' }, U.icon('databaseBackup')),
        U.h('div', { class: 'min-w-0' },
          U.h('h1', { class: 'text-xl font-extrabold', text: 'داده و پشتیبان' }),
          U.h('p', { class: 'text-sm text-muted', text: 'پشتیبان‌گیری، بازیابی، بستهٔ پروژه و تاریخچهٔ تغییرات' })))));
      root.appendChild(UI.tabsBar([
        { key: 'backup', label: 'پشتیبان‌گیری', icon: 'databaseBackup' },
        { key: 'package', label: 'بستهٔ پروژه', icon: 'package' },
        { key: 'audit', label: 'تاریخچهٔ تغییرات', icon: 'notebook' },
      ], activeTab, function (k) { activeTab = k; render(); }));
      if (activeTab === 'package') root.appendChild(buildPackageTab());
      else if (activeTab === 'audit') root.appendChild(buildAuditTab());
      else root.appendChild(buildBackupTab());
    }

    /* ── زبانهٔ پشتیبان‌گیری ── */
    function buildBackupTab() {
      var settings = DB.getAppSettings();
      var wrap = U.h('div', { class: 'flex flex-col gap-4' });

      /* ۱) پشتیبان‌گیری خودکار */
      var autoCard = U.h('section', { class: 'card p-4' });
      autoCard.appendChild(U.h('div', { class: 'flex items-center gap-2 mb-3' },
        U.h('span', { class: 'chip-icon' }, U.icon('refresh')),
        U.h('span', { class: 'font-bold text-sm flex-1', text: 'پشتیبان‌گیری خودکار' }),
        UI.helpDot('پشتیبان‌گیری خودکار', HELP_AUTO_BACKUP)));
      autoCard.appendChild(U.h('div', { class: 'flex items-center justify-between gap-2 mb-3' },
        U.h('span', { class: 'text-sm', text: 'فعال‌سازی خودکار' }),
        UI.switchEl(settings['backup.autoEnabled'] === 'true', function (on) {
          DB.setAppSettings({ 'backup.autoEnabled': on ? 'true' : 'false' });
          UI.toast(on ? 'پشتیبان‌گیری خودکار فعال شد' : 'پشتیبان‌گیری خودکار غیرفعال شد');
        }, 'فعال‌سازی پشتیبان‌گیری خودکار')));
      var INTERVALS = [
        { v: 5, label: 'هر ۵ دقیقه' }, { v: 10, label: 'هر ۱۰ دقیقه' }, { v: 15, label: 'هر ۱۵ دقیقه' },
        { v: 30, label: 'هر ۳۰ دقیقه' }, { v: 60, label: 'هر ۱ ساعت' }, { v: 120, label: 'هر ۲ ساعت' },
        { v: 240, label: 'هر ۴ ساعت' },
      ];
      var intervalSel = UI.selectEl(
        INTERVALS.map(function (x) { return { value: String(x.v), label: x.label }; }),
        settings['backup.intervalMinutes'],
        function (v) { DB.setAppSettings({ 'backup.intervalMinutes': v }); },
        'فاصلهٔ زمانی پشتیبان‌گیری خودکار');
      autoCard.appendChild(fieldWithHelp('فاصلهٔ زمانی', 'فاصلهٔ پشتیبان‌گیری', HELP_INTERVAL, intervalSel));
      var retentionSel = UI.selectEl(
        [3, 5, 10, 20, 50].map(function (n) { return { value: String(n), label: 'نگهداری ' + U.formatInt(n) + ' نسخهٔ خودکار' }; }),
        settings['backup.retention'],
        function (v) { DB.setAppSettings({ 'backup.retention': v }); },
        'سیاست نگهداری نسخه‌های پشتیبان');
      autoCard.appendChild(fieldWithHelp('سیاست نگهداری', 'سیاست نگهداری نسخه‌ها', HELP_RETENTION, retentionSel,
        'نسخه‌های خودکار قدیمی‌تر پس از عبور از این تعداد حذف می‌شوند؛ نسخه‌های دستی و حفاظتی مشمول این سیاست نمی‌شوند.'));

      /* ۲) پشتیبان دستی و بازیابی */
      var manualCard = U.h('section', { class: 'card p-4' });
      manualCard.appendChild(U.h('div', { class: 'flex items-center gap-2 mb-3' },
        U.h('span', { class: 'chip-icon' }, U.icon('download')),
        U.h('span', { class: 'font-bold text-sm', text: 'پشتیبان دستی و بازیابی' })));
      var fileInput = U.h('input', { type: 'file', accept: '.json', style: { display: 'none' } });
      fileInput.addEventListener('change', function () {
        var file = fileInput.files && fileInput.files[0];
        fileInput.value = '';
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function () {
          var parsed;
          try { parsed = JSON.parse(reader.result); }
          catch (e) { UI.toastError(e); return; }
          try {
            /* restoreBackupFromJson برای قالب نامعتبر به‌صورت هم‌زمان خطا می‌دهد و برای checksum نامعتبر Promise رد می‌شود */
            DB.restoreBackupFromJson(parsed).then(function () {
              UI.toast('بازیابی از فایل انجام شد', { description: 'یک نسخهٔ حفاظتی پیش از بازگردانی گرفته شد.' });
              appRefresh();
            }).catch(function (err) { UI.toastError(err); });
          } catch (err) { UI.toastError(err); }
        };
        reader.onerror = function () { UI.toastError(new Error('خواندن فایل پشتیبان ممکن نشد.')); };
        reader.readAsText(file);
      });
      manualCard.appendChild(U.h('div', { class: 'flex flex-wrap gap-2 mb-3' },
        U.h('button', {
          class: 'btn btn-brand',
          onclick: function () {
            DB.createBackup('MANUAL').then(function () {
              UI.toast('پشتیبان دستی ایجاد شد', { description: 'نسخه در حافظهٔ مرورگر ذخیره شد؛ برای نگهداری بلندمدت آن را دانلود کنید.' });
              render();
            }).catch(function (err) { UI.toastError(err); });
          },
        }, U.icon('plus'), 'ایجاد پشتیبان دستی'),
        U.h('button', { class: 'btn btn-outline', onclick: function () { fileInput.click(); } }, U.icon('upload'), 'بازیابی از فایل'),
        fileInput));
      manualCard.appendChild(U.h('div', { class: 'banner warning' }, U.icon('alertTriangle'),
        U.h('div', { text: 'بازیابی، کل داده‌های فعلی این مرورگر را با محتوای نسخهٔ پشتیبان جایگزین می‌کند. پیش از بازیابی، به‌صورت خودکار یک نسخهٔ حفاظتی (PRE_RESTORE) گرفته می‌شود. موجودیت‌هایی که پس از تهیهٔ نسخهٔ پشتیبان به‌طور دائمی حذف شده‌اند، بازنمی‌گردند (نشانگر حذف).' })));

      wrap.appendChild(U.h('div', { class: 'grid grid-cols-1 lg:grid-cols-2 gap-4' }, autoCard, manualCard));

      /* ۳) نسخه‌های پشتیبان — تمام عرض */
      wrap.appendChild(buildBackupsCard());
      return wrap;
    }

    /* ── کارت فهرست نسخه‌های پشتیبان ── */
    function buildBackupsCard() {
      var backups = DB.listBackups();
      var card = U.h('section', { class: 'card p-4' });
      card.appendChild(U.h('div', { class: 'flex items-center gap-2 mb-3' },
        U.h('span', { class: 'chip-icon' }, U.icon('history')),
        U.h('span', { class: 'font-bold text-sm flex-1', text: 'نسخه‌های پشتیبان' }),
        UI.badge(U.formatInt(backups.length), 'muted')));
      if (!backups.length) {
        card.appendChild(U.h('p', { class: 'text-sm text-muted', text: 'هنوز نسخهٔ پشتیبانی ثبت نشده است.' }));
        return card;
      }
      card.appendChild(UI.table(['نوع', 'تاریخ ایجاد', 'حجم', 'پروژه‌ها', 'Checksum', 'وضعیت', ''], function (tbody) {
        backups.forEach(function (b) {
          var km = KIND_META[b.kind] || { label: b.kind, variant: 'muted' };
          var actions = U.h('div', { class: 'flex items-center gap-1' });
          actions.appendChild(U.h('button', {
            class: 'icon-btn', 'aria-label': 'دانلود نسخهٔ پشتیبان', title: 'دانلود نسخهٔ پشتیبان',
            onclick: function () {
              try {
                U.downloadFile(b.fileName, DB.backupFileContent(b.id), 'application/json');
                UI.toast('فایل پشتیبان دانلود می‌شود.');
              } catch (err) { UI.toastError(err); }
            },
          }, U.icon('download')));
          actions.appendChild(U.h('button', {
            class: 'icon-btn', 'aria-label': 'بازیابی این نسخه', title: 'بازیابی این نسخه',
            onclick: function () {
              UI.confirmDialog({
                title: 'بازیابی نسخهٔ پشتیبان؟',
                desc: 'کل داده‌های فعلی با محتوای این نسخه جایگزین می‌شود. پیش از بازگردانی، نسخهٔ حفاظتی گرفته می‌شود.',
                confirmLabel: 'بازیابی',
                destructive: true,
              }).then(function (ok) {
                if (!ok) return;
                DB.restoreBackup(b.id).then(function () {
                  UI.toast('بازیابی انجام شد');
                  appRefresh();
                }).catch(function (err) { UI.toastError(err); });
              });
            },
          }, U.icon('refresh')));
          actions.appendChild(U.h('button', {
            class: 'icon-btn danger', 'aria-label': 'حذف نسخهٔ پشتیبان', title: 'حذف نسخهٔ پشتیبان',
            onclick: function () {
              UI.confirmDialog({
                title: 'حذف نسخهٔ پشتیبان',
                desc: 'این نسخهٔ پشتیبان حذف می‌شود؛ این عملیات قابل بازگشت نیست.',
                confirmLabel: 'حذف',
                destructive: true,
              }).then(function (ok) {
                if (!ok) return;
                DB.deleteBackup(b.id);
                render();
              });
            },
          }, U.icon('trash')));
          tbody.appendChild(U.h('tr', null,
            U.h('td', null, UI.badge(km.label, km.variant)),
            U.h('td', { class: 'whitespace-nowrap' }, U.formatDateTime(b.createdAt)),
            U.h('td', { class: 'num' }, U.formatInt(b.sizeBytes / 1024) + ' کیلوبایت'),
            U.h('td', { class: 'num text-center' }, U.formatInt(b.projectCount)),
            U.h('td', null, U.h('code', {
              class: 'inline', dir: 'ltr', title: b.checksum || '',
              text: b.checksum ? String(b.checksum).slice(0, 10) + '…' : '—',
            })),
            U.h('td', null, UI.badge('سالم', 'green')),
            U.h('td', null, actions)));
        });
      }));
      return card;
    }

    /* ── زبانهٔ بستهٔ پروژه ── */
    function buildPackageTab() {
      var card = U.h('section', { class: 'card p-4' });
      card.appendChild(U.h('div', { class: 'flex items-center gap-2 mb-3' },
        U.h('span', { class: 'chip-icon' }, U.icon('package')),
        U.h('span', { class: 'font-bold text-sm flex-1', text: 'بستهٔ خروجی کامل پروژه' }),
        UI.helpDot('بستهٔ پروژه', HELP_PACKAGE)));
      card.appendChild(U.h('div', { class: 'flex flex-wrap gap-2 mb-3' },
        U.h('button', {
          class: 'btn btn-brand',
          onclick: function () {
            DB.exportProjectPackage(projectId).then(function (pkg) {
              U.downloadFile(pkg.manifest.projectName + '.timing-package.json', JSON.stringify(pkg), 'application/json');
              UI.toast('خروجی بسته آماده شد', { description: 'فایل بستهٔ کامل «' + project.name + '» دانلود می‌شود.' });
            }).catch(function (err) { UI.toastError(err); });
          },
        }, U.icon('download'), 'خروجی بستهٔ کامل این پروژه'),
        U.h('button', { class: 'btn btn-outline', onclick: function () { appNavigate('/'); } }, U.icon('home'), 'رفتن به صفحهٔ خانه')));
      card.appendChild(U.h('div', { class: 'banner warning' }, U.icon('alertTriangle'),
        U.h('div', { text: 'نکته مهم: ورود بسته همیشه پروژهٔ جدید می‌سازد (با پسوند «(ورودی)») و هیچ دادهٔ موجودی بازنویسی یا حذف نمی‌شود. ورود بسته از صفحهٔ خانه انجام می‌شود.' })));
      return card;
    }

    /* ── زبانهٔ تاریخچهٔ تغییرات ── */
    function jsonCode(json) {
      if (!json) return U.h('span', { text: '—' });
      var pretty = json;
      try { pretty = JSON.stringify(JSON.parse(json), null, 2); } catch (e) { /* متن خام */ }
      return U.h('code', {
        class: 'inline', dir: 'ltr',
        style: { display: 'block', whiteSpace: 'pre-wrap', textAlign: 'left', maxHeight: '180px', overflow: 'auto', fontSize: '11px' },
      }, trunc400(pretty));
    }

    function buildAuditDetail(ev) {
      var box = U.h('div', { class: 'bg-surface-2 rounded p-2 text-xs flex flex-col gap-1' });
      if (ev.action === 'DELETE') {
        box.appendChild(U.h('div', { text: 'رویداد حداقلی حذف (بدون کپی محتوا)' }));
        return box;
      }
      box.appendChild(U.h('div', null, 'قبل: ', jsonCode(ev.beforeJson)));
      box.appendChild(U.h('div', null, 'بعد: ', jsonCode(ev.afterJson)));
      return box;
    }

    function buildAuditTab() {
      var events = DB.listAudit(100);
      var card = U.h('section', { class: 'card p-4' });
      card.appendChild(U.h('div', { class: 'flex items-center gap-2 mb-3' },
        U.h('span', { class: 'chip-icon' }, U.icon('notebook')),
        U.h('span', { class: 'font-bold text-sm flex-1', text: 'تاریخچهٔ تغییرات' }),
        UI.badge(U.formatInt(events.length) + ' رویداد — نمایش حداکثر ۱۰۰ رویداد اخیر', 'muted')));
      if (!events.length) {
        card.appendChild(U.h('p', { class: 'text-sm text-muted', text: 'رویدادی ثبت نشده است.' }));
        return card;
      }
      card.appendChild(UI.table(['زمان', 'عمل', 'موجودیت', 'نام', 'عامل', ''], function (tbody) {
        events.forEach(function (ev) {
          var am = ACTION_META[ev.action] || { label: ev.action, variant: 'muted' };
          var tr = U.h('tr');
          var detailTr = null;
          var btn = U.h('button', {
            class: 'icon-btn sm', 'aria-label': 'جزئیات رویداد', title: 'جزئیات رویداد',
            onclick: function () {
              var svg = btn.querySelector('svg');
              if (detailTr && detailTr.isConnected) {
                if (detailTr.parentNode) detailTr.parentNode.removeChild(detailTr);
                detailTr = null;
                if (svg) svg.style.transform = '';
                return;
              }
              detailTr = U.h('tr', null, U.h('td', { colspan: '6' }, buildAuditDetail(ev)));
              if (tr.parentNode) tr.parentNode.insertBefore(detailTr, tr.nextSibling);
              if (svg) svg.style.transform = 'rotate(180deg)';
            },
          }, U.icon('chevronDown'));
          tr.appendChild(U.h('td', { class: 'whitespace-nowrap' }, U.formatDateTime(ev.occurredAt)));
          tr.appendChild(U.h('td', null, UI.badge(am.label, am.variant)));
          tr.appendChild(U.h('td', null, ENTITY_LABELS[ev.entityType] || ev.entityType));
          tr.appendChild(U.h('td', { class: 'truncate', style: { maxWidth: '220px' }, title: ev.entityName || '' }, ev.entityName || '—'));
          tr.appendChild(U.h('td', { class: 'text-muted' }, 'کاربر محلی'));
          tr.appendChild(U.h('td', null, btn));
          tbody.appendChild(tr);
        });
      }));
      return card;
    }

    render();
  };
})(window);
