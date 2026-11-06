/* ═══════════════════════════════════════════════════════════
   views-home.js — صفحه فهرست پروژه‌ها (بدون شل) — FR-01
   جستجو/مرتب‌سازی، ایجاد، ویرایش، کپی انتخابی بخش‌ها،
   ورود/خروجی بسته (FR-25)، حذف دائمی با شمارش وابستگی‌ها (FR-26)

   ⚠ سه باگ هسته که این فایل دور آن‌ها عبور می‌کند (گزارش شده):
   1) U.jalaliToISO همیشه «۱ مارس» برمی‌گرداند (d2g در utils.js
      div را با یک آرگومان صدا می‌زند) ← تبدیل جلالی→میلادی محلی.
   2) UI.confirmDialog / UI.confirmDelete همیشه false resolve
      می‌کنند (close() پیش از finish(true)، onClose←finish(false)
      زودتر اجرا می‌شود) ← معادل‌های محلی با ترتیب درست.
   3) کاسکید DB.deleteProject ردیف‌های دارای activityId بدون
      projectId (عناصر کاری، جلسات، بازنویسی مجازها) و گره‌های
      متصل نمودار «همه پروژه‌ها» را پاک می‌کند ← پشتیبان‌گیری و
      بازگردانی در safeDeleteProject.
   ═══════════════════════════════════════════════════════════ */
(function (g) {
  'use strict';
  var U = g.T2U, DB = g.T2DB, UI = g.T2UI;
  // T2APP در app.js و بعد از نماها بارگذاری می‌شود — دسترسی تنبل:
  var APP = {
    navigate: function (hash) { if (g.T2APP) g.T2APP.navigate(hash); },
    refresh: function () { if (g.T2APP) g.T2APP.refresh(); },
  };

  var BANNER_KEY = 'timing2-home-banner-dismissed';

  // ── محتوای راهنمای فیلدهای پروژه — FR-28 ──
  var HELP = {
    name: {
      what: 'عنوان این مطالعه زمان‌سنجی؛ در فهرست پروژه‌ها، سایدبار و گزارش‌های رسمی نمایش داده می‌شود.',
      input: 'نام کوتاه و قابل تشخیص؛ می‌تواند شامل مدل یا کد محصول باشد.',
      example: '«مطالعه خط مونتاژ پمپ آب مدل A»',
      note: 'شناسه داخلی پروژه پایدار است؛ تغییر نام، تاریخچه و بسته‌های خروجی قبلی را بی‌اعتبار نمی‌کند.',
    },
    lineName: {
      what: 'نام خط تولیدی که مطالعه روی آن انجام می‌شود؛ هر پروژه دقیقاً یک خط تولید دارد.',
      input: 'نام رسمی خط در کارخانه.',
      example: '«خط مونتاژ ۱» یا «خط پرداخت کاری»',
    },
    productName: {
      what: 'محصولی که روی این خط تولید می‌شود؛ مبنای مقایسه مطالعات مختلفِ همان محصول است.',
      input: 'نام تجاری یا مدل محصول.',
      example: '«پمپ آب مدل A»',
    },
    studyDate: {
      what: 'تاریخ رسمی انجام مطالعه؛ در سربرگ گزارش‌های رسمی درج می‌شود.',
      input: 'از تقویم شمسی انتخاب کنید یا قالب ۱۴۰۴/۰۸/۱۳ را دستی وارد کنید.',
      note: 'در پایگاه داده ISO میلادی ذخیره می‌شود؛ نمایش شمسی فقط لایه نمایش است.',
    },
  };

  // ── وضعیت نوار ابزار — بین رندرهای مجدد حفظ می‌شود ──
  var toolbarState = { searchText: '', q: '', sort: 'createdAt', dir: 'desc' };

  // ── کش بستن بنر اولین استفاده ──
  var bannerDismissed = null;
  function isBannerDismissed() {
    if (bannerDismissed === null) {
      try { bannerDismissed = g.localStorage.getItem(BANNER_KEY) === '1'; }
      catch (e) { bannerDismissed = false; }
    }
    return bannerDismissed;
  }
  function dismissBanner() {
    bannerDismissed = true;
    try { g.localStorage.setItem(BANNER_KEY, '1'); } catch (e) { /* ادامه کار */ }
  }

  // ═══════════ ورودی تاریخ — پورت وفادار JalaliDatePicker.tsx ═══════════
  // تقویم Popover شمسی/میلادی + ورود دستی؛ مقدار داخلی ISO میلادی.
  // رابط {el, getISO, setISO} برای سازگاری با فرم‌های موجود حفظ شده است.
  function jalaliDateInput(opts) {
    opts = opts || {};
    return g.T2DATE.datePicker({
      value: opts.value || null,
      ariaLabel: opts.ariaLabel || 'تاریخ مطالعه',
      onChange: function (iso) {
        if (opts.onChange) opts.onChange(iso, false);
      },
    });
  }

  // ═══════════ دیالوگ‌های تأیید محلی ═══════════
  // (نسخه ui.js همیشه false برمی‌گرداند — finish پیش از close)
  function confirmDialogLocal(opts) {
    return new Promise(function (resolve) {
      var done = false;
      function finish(v) { if (!done) { done = true; resolve(v); } }
      UI.dialog({
        title: opts.title, desc: opts.desc, dismissable: false,
        bodyBuilder: function (body) { if (opts.body) opts.body(body); },
        footerBuilder: function (close) {
          return U.h('div', { class: 'dialog-footer' },
            U.h('button', { class: 'btn', text: opts.cancelLabel || 'انصراف', onclick: function () { finish(false); close(); } }),
            U.h('div', { class: 'spacer' }),
            U.h('button', {
              class: 'btn ' + (opts.destructive ? 'btn-destructive' : 'btn-brand'),
              text: opts.confirmLabel || 'تأیید',
              onclick: function () { finish(true); close(); },
            }));
        },
        onClose: function () { finish(false); },
      });
    });
  }

  function confirmDeleteLocal(opts) {
    var deps = opts.deps || {};
    var depKeys = Object.keys(deps).filter(function (k) { return deps[k] > 0; });
    return new Promise(function (resolve) {
      var done = false;
      function finish(v) { if (!done) { done = true; resolve(v); } }
      UI.dialog({
        title: opts.title, red: true, dismissable: false, desc: opts.desc,
        bodyBuilder: function (body) {
          body.appendChild(U.h('p', { class: 'text-sm leading-relaxed' },
            U.h('span', { text: '«' + opts.name + '» به‌صورت ' }),
            U.h('b', { text: 'دائمی' }),
            U.h('span', { text: ' حذف خواهد شد. این عملیات قابل بازگشت نیست و سطل بازیافت وجود ندارد.' })));
          body.appendChild(U.h('div', { class: 'rounded-lg bg-red-soft p-3' },
            U.h('div', { class: 'text-xs font-bold text-red mb-2', text: 'داده‌های وابسته که همزمان حذف می‌شوند:' }),
            depKeys.length > 0
              ? U.h('ul', { class: 'list-none text-xs', style: { color: 'var(--foreground)' } },
                  depKeys.map(function (k) { return U.h('li', null, '• ' + k + ': ' + U.formatInt(deps[k])); }))
              : U.h('div', { class: 'text-xs text-muted', text: 'موردی وابسته به این رکورد وجود ندارد.' })));
          body.appendChild(U.h('p', { class: 'text-xs text-muted leading-relaxed', text: 'برای حفظ قابلیت پیگیری، رویداد حداقلی حذف در تاریخچه ثبت می‌شود. نسخه‌های پشتیبان قدیمی ممکن است تا زمان چرخش حاوی این داده باشند؛ بازیابی آن‌ها با نشانگر حذف کنترل می‌شود.' }));
        },
        footerBuilder: function (close) {
          return U.h('div', { class: 'dialog-footer' },
            U.h('button', { class: 'btn', text: 'انصراف', onclick: function () { finish(false); close(); } }),
            U.h('div', { class: 'spacer' }),
            U.h('button', {
              class: 'btn btn-destructive', text: 'حذف دائمی',
              onclick: function () { finish(true); close(); },
            }));
        },
        onClose: function () { finish(false); },
      });
    });
  }

  // ═══════════ شمارش وابستگی‌ها برای پیش‌نمایش حذف (FR-26) ═══════════
  function computeDeleteDeps(projectId) {
    var summary = DB.getProjectSummary(projectId);
    var st = DB.getState();
    var stationIds = {}, actIds = {}, elIds = {};
    st.stations.forEach(function (s) { if (s.projectId === projectId) stationIds[s.id] = true; });
    st.activities.forEach(function (a) { if (!!stationIds[a.stationId]) actIds[a.id] = true; });
    st.workElements.forEach(function (e) { if (!!actIds[e.activityId]) elIds[e.id] = true; });
    var sessions = st.studySessions.filter(function (s) { return !!actIds[s.activityId]; }).length;
    var observations = st.elementObservations.filter(function (o) { return !!elIds[o.workElementId]; }).length;
    var c = summary && summary.counts ? summary.counts : { stations: 0, activities: 0, elements: 0, operators: 0, groups: 0 };
    return {
      'ایستگاه': c.stations,
      'فعالیت': c.activities,
      'عنصر کاری': c.elements,
      'اپراتور': c.operators,
      'گروه مجاز': c.groups,
      'جلسه زمان‌سنجی': sessions,
      'مشاهده خام': observations,
    };
  }

  // ═══════════ حذف امن پروژه — دور زدن باگ کاسکید db.js ═══════════
  function safeDeleteProject(projectId) {
    var st = DB.getState();
    var stationPid = {}, delActIds = {}, actPid = {};
    st.stations.forEach(function (s) { stationPid[s.id] = s.projectId; });
    st.activities.forEach(function (a) {
      actPid[a.id] = stationPid[a.stationId];
      if (actPid[a.id] === projectId) delActIds[a.id] = true;
    });
    function cloneRow(r) { return JSON.parse(JSON.stringify(r)); }
    // ردیف‌هایی که کاسکید هسته به‌اشتباه از سایر پروژه‌ها پاک می‌کند:
    function ofOtherProject(row) { return !!row.activityId && !delActIds[row.activityId]; }
    var TABLES = ['workElements', 'studySessions', 'activityAllowanceOverrides'];
    var backup = {};
    TABLES.forEach(function (t) { backup[t] = st[t].filter(ofOtherProject).map(cloneRow); });
    // گره‌های متصل نمودارِ سایر پروژه‌ها (projectId دارند اما activityId غیرتهی)
    backup.chartNodes = st.chartNodes.filter(function (n) { return n.projectId !== projectId; }).map(cloneRow);
    var affectedPids = {};
    TABLES.forEach(function (t) {
      backup[t].forEach(function (row) {
        var pid = actPid[row.activityId];
        if (pid && pid !== projectId) affectedPids[pid] = true;
      });
    });
    backup.chartNodes.forEach(function (n) { if (n.projectId) affectedPids[n.projectId] = true; });

    DB.deleteProject(projectId);

    // بازگردانی ردیف‌های سایر پروژه‌ها
    var st2 = DB.getState();
    var restored = 0;
    var ALL = TABLES.concat(['chartNodes']);
    ALL.forEach(function (t) {
      var present = {};
      st2[t].forEach(function (r) { present[r.id] = true; });
      backup[t].forEach(function (row) {
        if (!present[row.id]) { st2[t].push(row); restored += 1; }
      });
    });
    if (restored > 0) {
      // ثبت پایدار بازگردانی — commit اجباری از مسیر عمومی (بدون افزودن ردیف جدید)
      var pids = Object.keys(affectedPids).filter(function (pid) { return !!DB.getProject(pid); });
      if (pids.length === 0 && st2.projects.length > 0) pids = [st2.projects[0].id];
      pids.forEach(function (pid) {
        var raw = {};
        st2.projectSettings.forEach(function (s) { if (s.projectId === pid) raw[s.key] = s.value; });
        try { DB.putProjectSettingRaw(pid, raw); } catch (e) { /* ادامه کار */ }
      });
    }
  }

  function requestDeleteProject(project, onDone) {
    var deps = computeDeleteDeps(project.id);
    confirmDeleteLocal({ title: 'حذف دائمی پروژه', name: project.name, deps: deps })
      .then(function (ok) {
        if (!ok) return;
        try {
          safeDeleteProject(project.id);
          UI.toast('پروژه به‌طور دائمی حذف شد');
          if (onDone) onDone();
        } catch (err) { UI.toastError(err); }
      });
  }

  // ═══════════ خروجی بسته کامل (FR-25) ═══════════
  function exportProjectPackage(project) {
    var p;
    try { p = DB.exportProjectPackage(project.id); }
    catch (err) { UI.toastError(err); return; }
    p.then(function (pkg) {
      U.downloadFile(pkg.manifest.projectName + '.timing-package.json', JSON.stringify(pkg), 'application/json');
      UI.toast('خروجی بسته آماده شد', { description: 'فایل بسته کامل «' + project.name + '» دانلود می‌شود.' });
    }).catch(function (err) { UI.toastError(err); });
  }

  // ═══════════ دیالوگ ایجاد پروژه ═══════════
  function openCreateDialog(onCreated) {
    var form = { name: '', lineName: '', productName: '', studyDate: null, description: '' };
    var dateErr = false;

    var nameIn = U.h('input', { class: 'input', type: 'text', placeholder: 'مثلاً: مطالعه خط مونتاژ پمپ آب', 'aria-label': 'نام پروژه' });
    var lineIn = U.h('input', { class: 'input', type: 'text', placeholder: 'مثلاً: خط مونتاژ ۱', 'aria-label': 'نام خط تولید' });
    var prodIn = U.h('input', { class: 'input', type: 'text', placeholder: 'مثلاً: پمپ آب مدل A', 'aria-label': 'نام محصول' });
    var descIn = U.h('textarea', { class: 'textarea', placeholder: 'هدف مطالعه، دامنه یا نکات مهم…', 'aria-label': 'شرح پروژه' });
    var dateIn = jalaliDateInput({
      onChange: function (iso, invalid) { form.studyDate = iso; dateErr = invalid; refreshFooter(); },
    });

    function valid() {
      return !dateErr && !!form.studyDate && form.name.trim() !== '' && form.lineName.trim() !== '' && form.productName.trim() !== '';
    }
    var submitBtn = U.h('button', { class: 'btn btn-brand', disabled: true }, U.icon('plus'), 'ایجاد پروژه');
    function refreshFooter() { submitBtn.disabled = !valid(); }
    function track(el, key) {
      el.addEventListener('input', function () { form[key] = el.value; refreshFooter(); });
    }
    track(nameIn, 'name'); track(lineIn, 'lineName'); track(prodIn, 'productName');
    descIn.addEventListener('input', function () { form.description = descIn.value; });
    submitBtn.addEventListener('click', function () {
      if (!valid()) return;
      try {
        var p = DB.createProject({
          name: form.name.trim(), lineName: form.lineName.trim(), productName: form.productName.trim(),
          studyDate: form.studyDate, description: form.description.trim() || null,
        });
        UI.toast('پروژه ایجاد شد');
        if (!dlgRef.closed) dlgRef.close();
        if (onCreated) onCreated(p);
      } catch (err) { UI.toastError(err); }
    });

    var dlgRef = UI.dialog({
      title: 'پروژه جدید',
      desc: 'هر پروژه فقط یک خط تولید و یک محصول دارد. موارد ستاره‌دار الزامی‌اند.',
      bodyBuilder: function (body) {
        body.appendChild(U.h('div', { class: 'grid grid-cols-1 sm:grid-cols-2 gap-4' },
          UI.field('نام پروژه *', nameIn, HELP.name),
          UI.field('نام خط تولید *', lineIn, HELP.lineName),
          UI.field('نام محصول *', prodIn, HELP.productName),
          UI.field('تاریخ مطالعه *', dateIn.el, HELP.studyDate),
          U.h('div', { style: { gridColumn: '1 / -1' } },
            UI.field('شرح (اختیاری)', descIn))));
      },
      footerBuilder: function (close) {
        return U.h('div', { class: 'dialog-footer' },
          U.h('button', { class: 'btn', text: 'انصراف', onclick: close }),
          U.h('div', { class: 'spacer' }),
          submitBtn);
      },
    });
    return dlgRef;
  }

  // ═══════════ دیالوگ ویرایش پروژه ═══════════
  function openEditDialog(project, onSaved) {
    var form = {
      name: project.name, lineName: project.lineName, productName: project.productName,
      studyDate: project.studyDate, description: project.description || '',
    };
    var dateErr = false;

    var nameIn = U.h('input', { class: 'input', type: 'text', value: form.name, 'aria-label': 'نام پروژه' });
    var lineIn = U.h('input', { class: 'input', type: 'text', value: form.lineName, 'aria-label': 'نام خط تولید' });
    var prodIn = U.h('input', { class: 'input', type: 'text', value: form.productName, 'aria-label': 'نام محصول' });
    var descIn = U.h('textarea', { class: 'textarea', placeholder: 'هدف مطالعه، دامنه یا نکات مهم…', value: form.description, 'aria-label': 'شرح پروژه' });
    var dateIn = jalaliDateInput({
      value: form.studyDate,
      onChange: function (iso, invalid) { form.studyDate = iso; dateErr = invalid; refreshFooter(); },
    });

    function valid() {
      return !dateErr && !!form.studyDate && form.name.trim() !== '' && form.lineName.trim() !== '' && form.productName.trim() !== '';
    }
    var submitBtn = U.h('button', { class: 'btn btn-brand', disabled: !valid(), text: 'ذخیره تغییرات' });
    function refreshFooter() { submitBtn.disabled = !valid(); }
    function track(el, key) {
      el.addEventListener('input', function () { form[key] = el.value; refreshFooter(); });
    }
    track(nameIn, 'name'); track(lineIn, 'lineName'); track(prodIn, 'productName');
    descIn.addEventListener('input', function () { form.description = descIn.value; });
    submitBtn.addEventListener('click', function () {
      if (!valid()) return;
      try {
        DB.updateProject(project.id, {
          name: form.name.trim(), lineName: form.lineName.trim(), productName: form.productName.trim(),
          studyDate: form.studyDate, description: form.description.trim() || null,
        });
        UI.toast('پروژه به‌روزرسانی شد');
        dlgRef.close();
        if (onSaved) onSaved();
      } catch (err) { UI.toastError(err); }
    });

    var dlgRef = UI.dialog({
      title: 'ویرایش پروژه',
      bodyBuilder: function (body) {
        body.appendChild(U.h('div', { class: 'grid grid-cols-1 sm:grid-cols-2 gap-4' },
          UI.field('نام پروژه *', nameIn, HELP.name),
          UI.field('نام خط تولید *', lineIn, HELP.lineName),
          UI.field('نام محصول *', prodIn, HELP.productName),
          UI.field('تاریخ مطالعه *', dateIn.el, HELP.studyDate),
          U.h('div', { style: { gridColumn: '1 / -1' } },
            UI.field('شرح (اختیاری)', descIn))));
      },
      footerBuilder: function (close) {
        return U.h('div', { class: 'dialog-footer' },
          U.h('button', { class: 'btn', text: 'انصراف', onclick: close }),
          U.h('div', { class: 'spacer' }),
          submitBtn);
      },
    });
    return dlgRef;
  }

  // ═══════════ دیالوگ کپی پروژه با انتخاب بخش‌ها — FR-01 ═══════════
  function openDuplicateDialog(project, onDone) {
    var newName = project.name + ' (کپی)';
    var sections = { structure: true, operators: false, groupsAndAllowances: false, ratingTables: false, rawObservations: false };

    var nameIn = U.h('input', { class: 'input', type: 'text', value: newName, 'aria-label': 'نام پروژه جدید' });
    nameIn.addEventListener('input', function () { newName = nameIn.value; });

    var ROWS = [
      { key: 'structure', label: 'ساختار و تنظیمات', desc: 'ایستگاه‌ها، فعالیت‌ها، عناصر کاری و تنظیمات محاسبات' },
      { key: 'operators', label: 'اپراتورها', desc: 'فهرست اپراتورهای این مطالعه' },
      { key: 'groupsAndAllowances', label: 'گروه‌ها و دسته‌های مجاز', desc: 'گروه‌های فعالیت، دسته‌های مجاز و مقادیر گروهی' },
      { key: 'ratingTables', label: 'جدول‌های وستینگهاوس', desc: 'جدول‌های مرجع ارزیابی و نمرات آنها' },
      { key: 'rawObservations', label: 'مشاهدات خام', desc: 'داده‌های خام زمان‌سنجی ثبت‌شده' },
    ];

    function submit(close) {
      if (!newName.trim()) {
        UI.toast('نام پروژه جدید الزامی است', { type: 'error' });
        return;
      }
      try {
        var res = DB.duplicateProject(project.id, newName.trim(), {
          structure: sections.structure, settings: sections.structure,
          operators: sections.operators, groupsAndAllowances: sections.groupsAndAllowances,
          ratingTables: sections.ratingTables, rawObservations: sections.rawObservations,
        });
        close();
        UI.toast('کپی پروژه ساخته شد');
        if (onDone) onDone(res.projectId);
      } catch (err) { UI.toastError(err); }
    }

    return UI.dialog({
      title: 'کپی پروژه',
      desc: 'از «' + project.name + '» یک پروژه جدید با بخش‌های انتخابی شما ساخته می‌شود.',
      bodyBuilder: function (body) {
        body.appendChild(UI.field('نام پروژه جدید', nameIn));
        body.appendChild(U.h('div', { class: 'flex flex-col gap-2' },
          U.h('div', { class: 'field-label', text: 'بخش‌های قابل کپی' }),
          ROWS.map(function (row) {
            var cb = U.h('input', { type: 'checkbox', checked: sections[row.key], style: { accentColor: 'var(--brand)', marginTop: '3px' }, 'aria-label': row.label });
            var card = U.h('label', { class: 'radio-card' + (sections[row.key] ? ' selected' : '') },
              cb,
              U.h('span', { class: 'min-w-0' },
                U.h('span', { class: 'block text-sm font-bold', text: row.label }),
                U.h('span', { class: 'block text-xs text-muted', text: row.desc })));
            cb.addEventListener('change', function () {
              sections[row.key] = cb.checked;
              card.classList.toggle('selected', cb.checked);
            });
            return card;
          })));
        body.appendChild(U.h('div', { class: 'banner warning' }, U.icon('alertTriangle'),
          U.h('div', { class: 'text-in leading-relaxed', text: 'توجه: کپی عادی مشاهدات، نتایج محاسبه‌شده و تاریخچه مبدأ را منتقل نمی‌کند مگر صریحاً انتخاب شوند.' })));
      },
      footerBuilder: function (close) {
        var btn = U.h('button', { class: 'btn btn-brand' }, U.icon('copy'), 'ساخت کپی');
        btn.addEventListener('click', function () { submit(close); });
        return U.h('div', { class: 'dialog-footer' },
          U.h('button', { class: 'btn', text: 'انصراف', onclick: close }),
          U.h('div', { class: 'spacer' }),
          btn);
      },
    });
  }

  // ═══════════ سطح اشتراکی برای views-info.js (پس از این فایل بارگذاری می‌شود) ═══════════
  g.T2PROJECT = {
    jalaliDateInput: jalaliDateInput,
    confirmDialogLocal: confirmDialogLocal,
    confirmDeleteLocal: confirmDeleteLocal,
    requestDeleteProject: requestDeleteProject,
    exportProjectPackage: exportProjectPackage,
    openDuplicateDialog: openDuplicateDialog,
  };

  // ═══════════ نمای خانه ═══════════
  g.T2VIEWS = g.T2VIEWS || {};
  g.T2VIEWS.home = function (container) {
    U.clear(container);
    var resultsEl = null;

    function listProjects() {
      return DB.listProjects({
        q: toolbarState.q || undefined,
        sort: toolbarState.sort,
        dir: toolbarState.dir,
      });
    }

    // ── هدر ──
    function buildHeader() {
      var dark = document.documentElement.classList.contains('dark');
      var themeBtn = U.h('button', {
        class: 'icon-btn lg', type: 'button',
        'aria-label': dark ? 'تم روشن' : 'تم تیره',
        onclick: function () {
          var nowDark = document.documentElement.classList.toggle('dark');
          try { g.localStorage.setItem('timing2-theme', nowDark ? 'dark' : 'light'); } catch (e) { /* ادامه کار */ }
          // به‌روزرسانی درجا — بدون رندر مجدد (حفظ وضعیت فرم‌ها)
          themeBtn.replaceChild(U.icon(nowDark ? 'sun' : 'moon'), themeBtn.querySelector('svg'));
        },
      }, U.icon(dark ? 'sun' : 'moon'));
      return U.h('header', { class: 'glass-bar sticky border-b no-print', style: { top: 0, zIndex: 40 } },
        U.h('div', { class: 'mx-auto flex items-center gap-3', style: { height: '64px', maxWidth: '1280px', padding: '0 16px' } },
          U.h('span', { class: 'logo-tile' }, U.icon('timer')),
          U.h('div', { class: 'min-w-0 flex-1' },
            U.h('h1', { class: 'font-extrabold', style: { fontSize: '18px', lineHeight: 1.3 }, text: 'زمان‌سنجی صنعتی' }),
            U.h('p', { class: 'truncate', style: { fontSize: '11px', color: 'var(--muted-foreground)' }, text: 'مطالعات زمان استاندارد خطوط تولید — کاملاً آفلاین' })),
          themeBtn));
    }

    // ── نوار ابزار — هم‌ارز HomeView.tsx (جهت مرتب‌سازی داخل گزینه‌ها تعبیه شده) ──
    var SORT_OPTIONS = {
      createdAt: { dir: 'desc', label: 'اخیراً ایجادشده' },
      name: { dir: 'asc', label: 'نام (الفبایی)' },
      progress: { dir: 'desc', label: 'بیشترین پیشرفت' },
    };
    function buildToolbar() {
      var searchIn = U.h('input', {
        class: 'input flex-1', type: 'text',
        placeholder: 'جستجو در نام پروژه، خط تولید یا محصول…',
        'aria-label': 'جستجوی پروژه‌ها',
        value: toolbarState.searchText,
        style: { minWidth: '200px', paddingInlineEnd: '36px', paddingInlineStart: '12px' },
      });
      var debounceTimer = null;
      function applyQuery() {
        if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
        toolbarState.q = toolbarState.searchText.trim();
        renderResults();
      }
      searchIn.addEventListener('input', function () {
        toolbarState.searchText = searchIn.value;
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(applyQuery, 300);
      });
      searchIn.addEventListener('keydown', function (e) { if (e.key === 'Enter') applyQuery(); });

      var sortSel = UI.selectEl([
        { value: 'createdAt', label: SORT_OPTIONS.createdAt.label },
        { value: 'name', label: SORT_OPTIONS.name.label },
        { value: 'progress', label: SORT_OPTIONS.progress.label },
      ], toolbarState.sort, function (v) {
        toolbarState.sort = v;
        toolbarState.dir = SORT_OPTIONS[v].dir;
        renderResults();
      }, 'مرتب‌سازی پروژه‌ها');

      // ورود بسته — FR-25
      var fileIn = U.h('input', { type: 'file', accept: '.json,application/json', class: 'sr-only', 'aria-label': 'انتخاب فایل بسته پروژه برای ورود' });
      fileIn.addEventListener('change', function () {
        var file = fileIn.files && fileIn.files[0];
        fileIn.value = '';
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function () {
          var parsed;
          try { parsed = JSON.parse(String(reader.result)); }
          catch (e) {
            UI.toast('ورود بسته ناموفق بود', { type: 'error', description: e && e.message ? e.message : 'فایل JSON معتبر نیست.' });
            return;
          }
          // validateProjectPackage خطاهای قالب را هم‌زمان throw می‌کند — داخل then گرفته می‌شود
          Promise.resolve().then(function () { return DB.validateProjectPackage(parsed); })
            .then(function () { return DB.importProjectPackage(parsed); })
            .then(function (res) {
              UI.toast('بسته «' + res.name + '» وارد شد', {
                description: 'ورود بسته همیشه پروژه جدید می‌سازد؛ این پروژه با پسوند (ورودی) ساخته شد.',
              });
              APP.refresh();
            })
            .catch(function (err) {
              UI.toast('ورود بسته ناموفق بود', { type: 'error', description: err && err.message ? err.message : '' });
            });
        };
        reader.onerror = function () { UI.toast('ورود بسته ناموفق بود', { type: 'error' }); };
        reader.readAsText(file);
      });
      var importBtn = U.h('button', { class: 'btn btn-outline shrink-0', type: 'button' }, U.icon('fileUp'), U.h('span', { class: 'hidden sm:inline', text: 'ورود بسته' }));
      importBtn.addEventListener('click', function () { fileIn.click(); });

      var createBtn = U.h('button', { class: 'btn btn-brand shrink-0', type: 'button' }, U.icon('plus'), 'پروژه جدید');
      createBtn.addEventListener('click', function () {
        openCreateDialog(function (p) { APP.navigate('/p/' + p.id + '/info'); });
      });

      var demoBtn = U.h('button', { class: 'btn btn-outline shrink-0', type: 'button' }, U.icon('flask'), 'بارگذاری داده دمو');
      demoBtn.addEventListener('click', function () {
        function seed() {
          try {
            DB.seedDemo();
            UI.toast('داده دمو بارگذاری شد', { description: 'پروژه نمایشی کامل برای تست همه بخش‌ها ایجاد شد.' });
            APP.refresh();
          } catch (err) { UI.toastError(err); }
        }
        if (DB.getState().projects.length > 0) {
          confirmDialogLocal({
            title: 'بارگذاری داده دمو',
            desc: 'داده دمو به‌عنوان پروژه جدید اضافه می‌شود؛ داده‌های فعلی شما تغییر نمی‌کنند.',
            confirmLabel: 'بارگذاری دمو',
          }).then(function (ok) { if (ok) seed(); });
        } else {
          seed();
        }
      });

      return U.h('section', {
        class: 'card p-3 mb-4 flex flex-col gap-2 sm:flex-row sm:items-center',
        'aria-label': 'ابزار فهرست پروژه‌ها',
      },
        U.h('div', { class: 'relative min-w-0 flex-1' },
          U.h('span', { class: 'search-icon', 'aria-hidden': 'true' }, U.icon('search')),
          searchIn),
        U.h('div', { class: 'flex items-center gap-2 flex-wrap' },
          U.h('div', { class: 'shrink-0 w-full sm:w-44' }, sortSel),
          importBtn,
          createBtn,
          demoBtn),
        fileIn);
    }

    // ── بنر اولین استفاده ──
    function buildFirstUseBanner() {
      var STEPS = [
        'پروژه مطالعه بسازید — نام خط تولید، محصول و تاریخ مطالعه را ثبت کنید.',
        'ساختار خط (ایستگاه، فعالیت، عنصر کاری) و اپراتورها را تعریف کنید.',
        'گروه‌های مجاز و ارزیابی وستینگهاوس را تنظیم کنید؛ زمان‌سنجی و گزارش‌ها در فازهای بعدی فعال می‌شوند.',
      ];
      var startBtn = U.h('button', { class: 'btn btn-brand', type: 'button' }, U.icon('plus'), 'شروع: ایجاد اولین پروژه');
      startBtn.addEventListener('click', function () {
        openCreateDialog(function (p) { APP.navigate('/p/' + p.id + '/info'); });
      });
      return U.h('section', { class: 'card p-5 mb-4', 'aria-label': 'راهنمای اولین استفاده' },
        U.h('div', { class: 'flex items-center justify-between gap-3 mb-3' },
          U.h('div', { class: 'flex items-center gap-3 min-w-0' },
            U.h('span', { class: 'chip-icon' }, U.icon('rocket')),
            U.h('div', { class: 'min-w-0' },
              U.h('h2', { class: 'font-extrabold', text: 'خوش آمدید! شروع کار در سه مرحله' }),
              U.h('p', { class: 'text-sm text-muted', text: 'این برنامه کاملاً آفلاین کار می‌کند؛ داده‌ها روی همین دستگاه می‌مانند.' }))),
          U.h('button', {
            class: 'icon-btn sm', type: 'button', 'aria-label': 'بستن راهنمای اولین استفاده',
            onclick: function () { dismissBanner(); renderResults(); },
          }, U.icon('x'))),
        U.h('ol', { class: 'list-none grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mb-4' },
          STEPS.map(function (s, i) {
            return U.h('li', { class: 'flex items-start gap-2 bg-surface-2 rounded-lg p-3 text-xs leading-relaxed' },
              UI.badge(U.formatInt(i + 1), 'brand'),
              U.h('span', { text: s }));
          })),
        startBtn);
    }

    // ── کارت پروژه ──
    function buildProjectCard(p) {
      var summary = DB.getProjectSummary(p.id);
      var counts = summary && summary.counts ? summary.counts : { stations: 0, activities: 0, elements: 0, operators: 0 };
      var progress = summary ? summary.progress : 0;

      function open() { APP.navigate('/p/' + p.id + '/info'); }

      var menu = UI.dropdownMenu([
        { label: 'بازکردن', icon: 'chevronLeft', onClick: open },
        { label: 'ویرایش', icon: 'pencil', onClick: function () { openEditDialog(p, renderResults); } },
        { label: 'کپی پروژه', icon: 'copy', onClick: function () { openDuplicateDialog(p, function () { APP.refresh(); }); } },
        { label: 'خروجی بسته', icon: 'download', onClick: function () { exportProjectPackage(p); } },
        '-',
        { label: 'حذف دائمی', icon: 'trash', destructive: true, onClick: function () { requestDeleteProject(p, function () { APP.refresh(); }); } },
      ], { iconName: 'moreVertical', ariaLabel: 'عملیات پروژه ' + p.name });

      var pct = Math.round(progress * 100);
      return U.h('div', {
        class: 'card card-premium card-hover p-4', role: 'button', tabindex: '0',
        'aria-label': 'بازکردن پروژه ' + p.name,
        onclick: open,
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } },
      },
        U.h('div', { class: 'flex items-start gap-3' },
          U.h('span', { class: 'chip-icon shrink-0' }, U.icon('package')),
          U.h('div', { class: 'flex-1 min-w-0' },
            U.h('div', { class: 'font-bold truncate', text: p.name }),
            U.h('div', { class: 'text-xs text-muted truncate', text: 'خط «' + p.lineName + '» · محصول «' + p.productName + '»' })),
          menu),
        U.h('div', { class: 'flex items-center gap-2 mt-3 flex-wrap' },
          UI.projectStatusBadge(p.status),
          U.h('span', { class: 'text-xs text-muted', text: 'تاریخ مطالعه: ' + U.formatDate(p.studyDate) })),
        U.h('div', { class: 'mt-3' },
          U.h('div', { class: 'flex items-center justify-between text-xs mb-1' },
            U.h('span', { class: 'text-muted', text: 'پیشرفت مطالعه' }),
            U.h('span', { class: 'font-semibold num', text: U.formatInt(pct) + '٪' })),
          U.h('div', { class: 'progress', role: 'progressbar', 'aria-label': 'درصد پیشرفت مطالعه' },
            U.h('div', { style: { width: pct + '%' } })),
          U.h('div', { class: 'text-xs text-faint mt-2 num' },
            U.formatInt(counts.stations) + ' ایستگاه · ' + U.formatInt(counts.activities) + ' فعالیت · ' +
            U.formatInt(counts.elements) + ' عنصر · ' + U.formatInt(counts.operators) + ' اپراتور')));
    }

    // ── ناحیه نتایج ──
    function renderResults() {
      if (!resultsEl) return;
      U.clear(resultsEl);
      var projects = listProjects();
      var total = DB.getState().projects.length;

      if (total === 0 && !isBannerDismissed()) {
        resultsEl.appendChild(buildFirstUseBanner());
      }

      if (projects.length === 0) {
        if (toolbarState.q) {
          resultsEl.appendChild(UI.emptyState({
            icon: 'search',
            title: 'پروژه‌ای مطابق جستجو یافت نشد',
            desc: 'عبارت «' + toolbarState.q + '» در نام پروژه‌ها، خطوط تولید یا محصولات یافت نشد. عبارت کوتاه‌تری را امتحان کنید.',
            actionLabel: 'پاک‌کردن جستجو',
            onAction: function () {
              toolbarState.searchText = '';
              toolbarState.q = '';
              render();
            },
          }));
        } else {
          resultsEl.appendChild(UI.emptyState({
            icon: 'factory',
            title: 'هنوز پروژه‌ای ثبت نشده است',
            desc: 'هر پروژه یک مطالعه روی یک خط تولید و یک محصول مشخص است. با ایجاد اولین پروژه شروع کنید: مشخصات، ساختار خط، اپراتورها و تنظیمات مهندسی.',
            actionLabel: 'ایجاد اولین پروژه',
            onAction: function () { openCreateDialog(function (p) { APP.navigate('/p/' + p.id + '/info'); }); },
          }));
        }
        return;
      }

      resultsEl.appendChild(U.h('p', { class: 'text-xs text-muted mb-2 num', text: U.formatInt(projects.length) + ' پروژه' }));
      resultsEl.appendChild(U.h('div', { class: 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4' },
        projects.map(function (p) { return buildProjectCard(p); })));
    }

    // ── فوتر ──
    function buildFooter() {
      var info = DB.storageInfo();
      var kb = info && isFinite(info.bytes) ? Math.round(info.bytes / 1024) : 0;
      var first = DB.getState().projects[0];
      return U.h('footer', { class: 'text-xs text-faint mt-6 text-center' },
        U.h('p', {
          class: 'num',
          text: 'داده‌ها در حافظهٔ این مرورگر (localStorage) ذخیره می‌شوند — حجم فعلی: ' + U.formatInt(kb) + ' کیلوبایت',
        }),
        first ? U.h('button', {
          class: 'btn btn-ghost btn-sm mt-2', type: 'button',
          onclick: function () { APP.navigate('/p/' + first.id + '/data'); },
        }, U.icon('databaseBackup'), 'مدیریت داده و پشتیبان') : null);
    }

    // ── رندر کامل ──
    function render() {
      U.clear(container);
      var page = U.h('div', { class: 'flex flex-col flex-1 min-w-0' },
        buildHeader(),
        U.h('div', { class: 'mx-auto w-full flex flex-col gap-4', style: { maxWidth: '1280px', flex: '1', padding: '16px' } },
          buildToolbar(),
          resultsEl = U.h('div', null),
          buildFooter()));
      container.appendChild(page);
      renderResults();
    }

    render();
  };
})(window);
