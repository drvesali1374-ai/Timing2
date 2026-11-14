/* ═══════════════════════════════════════════════════════════
   views-info.js — نمای مشخصات پروژه — FR-01 / FR-15 / FR-23 / FR-27
   مشخصات مطالعه (ذخیره خودکار)، تنظیمات محاسبات،
   وضعیت نهایی‌سازی و عملیات پروژه (کپی/خروجی/حذف دائمی)

   دیالوگ کپی/خروجی/حذف و ورودی تاریخ جلالی از سطح اشتراکی
   T2PROJECT (views-home.js — پیش از این فایل بارگذاری می‌شود)
   استفاده می‌کنند؛ آن‌جا دلایل دور زدن باگ‌های هسته مستند شده است.
   ═══════════════════════════════════════════════════════════ */
(function (g) {
  'use strict';
  var U = g.T2U, DB = g.T2DB, UI = g.T2UI;
  // T2APP در app.js و بعد از نماها بارگذاری می‌شود — دسترسی تنبل:
  var APP = {
    navigate: function (hash) { if (g.T2APP) g.T2APP.navigate(hash); },
    refresh: function () { if (g.T2APP) g.T2APP.refresh(); },
  };

  // ── محتوای راهنمای فیلدهای پروژه — FR-28 (همان محتوای صفحه خانه) ──
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
    description: {
      what: 'هدف مطالعه، دامنه و نکات مهم مانند محدودیت‌های دسترسی به خط.',
      example: '«تعیین زمان استاندارد برای سفارش‌های سریع؛ خارج از ساعت اوج شیفت عصر.»',
    },
  };
  var HELP_ALLOWANCE = {
    what: 'تعیین می‌کند درصد مجازها چگونه در زمان استاندارد (ST) لحاظ شود؛ روی تمام محاسبات این مطالعه اثر می‌گذارد.',
    input: 'یکی از دو روش مجاز را انتخاب کنید؛ فرمول هر روش زیر آن نمایش داده می‌شود.',
    note: 'روش انتخابی در گزارش‌های رسمی ثبت می‌شود.',
  };
  var HELP_AGGREGATION = {
    what: 'هنگام محاسبه زمان استاندارد یک عنصر با مشاهدات چند اپراتور، نحوه ترکیب نتایج مشخص می‌شود.',
    example: 'میانگین وزنی: اپراتوری که مشاهدات معتبر بیشتری ثبت کرده، اثر بیشتری دارد.',
    note: 'روش انتخابی در گزارش ثبت می‌شود.',
  };

  g.T2VIEWS = g.T2VIEWS || {};
  g.T2VIEWS.info = function (container, projectId) {
    U.clear(container);
    var SH = g.T2PROJECT;
    if (!SH) {
      container.appendChild(U.h('div', { class: 'banner error mt-4' }, U.icon('alertTriangle'),
        U.h('div', { text: 'ماژول مشترک عملیات پروژه (views-home.js) بارگذاری نشده است.' })));
      return;
    }
    var project = DB.getProject(projectId);
    if (!project) {
      container.appendChild(UI.emptyState({
        title: 'بارگذاری پروژه ناموفق بود',
        desc: 'پروژه یافت نشد یا خطایی رخ داده است.',
      }));
      return;
    }

    var page = U.h('div', { class: 'mx-auto w-full flex flex-col gap-4', style: { maxWidth: '820px' } });

    // ── سربرگ ──
    page.appendChild(UI.stickyHeading(U.h('div', { class: 'flex items-center gap-3' },
      U.h('span', { class: 'chip-icon' }, U.icon('settings2')),
      U.h('div', null,
        U.h('h1', { class: 'text-xl font-extrabold', text: 'مشخصات پروژه' }),
        U.h('p', { class: 'text-sm text-muted', text: 'مشخصات مطالعه، تنظیمات محاسبات و عملیات پروژه' })))))

    // ═══════════ بخش ۱ — مشخصات مطالعه با ذخیره خودکار (FR-23) ═══════════
    var form = {
      name: project.name, lineName: project.lineName, productName: project.productName,
      studyDate: project.studyDate, description: project.description || '',
    };
    var dirtyFields = {};          // فقط فیلدهای تغییرکرده در patch ذخیره می‌شوند
    var saveStatus = null;         // null | 'dirty' | 'saving' | 'saved' | 'error'
    var saveTimer = null;
    var savedClearTimer = null;

    var indicatorEl = U.h('div', { class: 'flex items-center gap-2' });
    var footerEl = U.h('div', { class: 'num mt-4 flex flex-wrap items-center justify-between gap-2 border-t pt-3' });
    footerEl.style.fontSize = '11px';
    footerEl.style.color = 'var(--faint)';

    function setIndicator() {
      U.clear(indicatorEl);
      if (!saveStatus) return;
      var ind = UI.saveIndicator(saveStatus);
      if (ind) indicatorEl.appendChild(ind);
      if (saveStatus === 'error') {
        var retryBtn = U.h('button', { class: 'btn btn-sm btn-outline', type: 'button' }, U.icon('refresh'), 'تلاش مجدد');
        retryBtn.addEventListener('click', function () { doSave(); });
        indicatorEl.appendChild(retryBtn);
      }
    }

    function updateMetaFooter() {
      footerEl.textContent = '';
      footerEl.appendChild(U.h('span', { text: 'ایجاد: ' + U.formatDateTime(project.createdAt) }));
      footerEl.appendChild(U.h('span', { text: 'آخرین تغییر: ' + U.formatDateTime(project.updatedAt) }));
    }

    function doSave() {
      saveTimer = null;
      var keys = Object.keys(dirtyFields);
      if (keys.length === 0) return;
      if (saveStatus === 'saving') { saveTimer = setTimeout(doSave, 300); return; }
      // فیلدهای اصلی هرگز خالی ذخیره نمی‌شوند
      if (!form.name.trim() || !form.lineName.trim() || !form.productName.trim()) return;
      // تاریخِ در حال ویرایشِ نامعتبر ذخیره نمی‌شود (در صف می‌ماند تا اصلاح شود)
      var dateIdx = keys.indexOf('studyDate');
      if (dateInvalid && dateIdx >= 0) keys.splice(dateIdx, 1);
      if (keys.length === 0) return;
      saveStatus = 'saving';
      setIndicator();
      var patch = {};
      keys.forEach(function (k) {
        if (k === 'description') patch.description = form.description.trim() || null;
        else if (k === 'studyDate') patch.studyDate = form.studyDate;
        else patch[k] = form[k].trim();
      });
      try {
        project = DB.updateProject(projectId, patch);
        keys.forEach(function (k) { delete dirtyFields[k]; });
        saveStatus = 'saved';
        setIndicator();
        updateMetaFooter();
        // همگام‌سازی نام/زیرنویس نوار بالای برنامه بدون رندر کامل (حفظ تمرکز ورودی‌ها)
        try {
          var topName = document.querySelector('.topbar .font-extrabold');
          if (topName) topName.textContent = project.name;
          var topSub = document.querySelector('.topbar .text-xs.text-faint');
          if (topSub) topSub.textContent = project.lineName + ' · ' + project.productName;
        } catch (e) { /* فقط نمایش */ }
        if (savedClearTimer) clearTimeout(savedClearTimer);
        savedClearTimer = setTimeout(function () {
          savedClearTimer = null;
          if (saveStatus === 'saved') { saveStatus = null; setIndicator(); }
        }, 2500);
      } catch (err) {
        saveStatus = 'error';
        setIndicator();
      }
    }

    function scheduleSave(field) {
      dirtyFields[field] = true;
      saveStatus = 'dirty';
      setIndicator();
      if (savedClearTimer) { clearTimeout(savedClearTimer); savedClearTimer = null; }
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(doSave, 800);
    }

    var nameIn = U.h('input', { class: 'input', type: 'text', value: form.name, 'aria-label': 'نام پروژه' });
    var lineIn = U.h('input', { class: 'input', type: 'text', value: form.lineName, 'aria-label': 'نام خط تولید' });
    var prodIn = U.h('input', { class: 'input', type: 'text', value: form.productName, 'aria-label': 'نام محصول' });
    var descIn = U.h('textarea', { class: 'textarea', placeholder: 'هدف مطالعه، دامنه یا نکات مهم…', value: form.description, 'aria-label': 'شرح مطالعه' });
    var dateInvalid = false; // فقط برای جلوگیری از ذخیرهٔ تاریخ ناقص/نامعتبر در صف
    var dateIn = SH.jalaliDateInput({
      value: form.studyDate,
      onChange: function (iso, invalid) {
        dateInvalid = invalid;
        if (invalid) return;
        form.studyDate = iso;
        scheduleSave('studyDate');
      },
    });

    function track(el, key) {
      el.addEventListener('input', function () { form[key] = el.value; scheduleSave(key); });
    }
    track(nameIn, 'name'); track(lineIn, 'lineName'); track(prodIn, 'productName');
    descIn.addEventListener('input', function () { form.description = descIn.value; scheduleSave('description'); });

    updateMetaFooter();
    page.appendChild(U.h('section', { class: 'card p-5', 'aria-label': 'مشخصات مطالعه' },
      U.h('div', { class: 'flex flex-wrap items-center justify-between gap-3' },
        U.h('div', { class: 'flex items-center gap-3' },
          U.h('span', { class: 'chip-icon' }, U.icon('fileText')),
          U.h('div', null,
            U.h('h2', { class: 'font-extrabold', text: 'مشخصات مطالعه' }),
            U.h('p', { class: 'text-xs text-muted', text: 'تغییرات به‌صورت خودکار ذخیره می‌شوند.' }))),
        indicatorEl),
      U.h('div', { class: 'grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4' },
        UI.field('نام پروژه', nameIn, HELP.name),
        UI.field('نام خط تولید', lineIn, HELP.lineName),
        UI.field('نام محصول', prodIn, HELP.productName),
        UI.field('تاریخ مطالعه', dateIn.el, HELP.studyDate),
        U.h('div', { style: { gridColumn: '1 / -1' } },
          UI.field('شرح (اختیاری)', descIn, HELP.description))),
      U.h('div', { class: 'text-xs text-muted border-t pt-3 mt-4' }, footerEl)));

    // ═══════════ بخش ۲ — تنظیمات محاسبات (FR-15) ═══════════
    var calc = DB.getCalcSettings(projectId);

    function applyCalc(patch) {
      try {
        DB.putCalcSettings(projectId, patch);
        UI.toast('تنظیمات محاسبات ذخیره شد');
      } catch (err) {
        UI.toastError(err);
      }
      calc = DB.getCalcSettings(projectId); // مقدار واقعی ذخیره‌شده (در خطا بازگردانده شده است)
      renderCalcBody();
    }

    var calcBodyEl = U.h('div', { class: 'flex flex-col gap-4 mt-4' });
    function renderCalcBody() {
      U.clear(calcBodyEl);

      // روش اعمال مجازها — دو کارت رادیویی
      var methods = ['PERCENT_OF_NT', 'SHARE_OF_ST'];
      var methodCards = methods.map(function (m) {
        var selected = calc.allowanceMethod === m;
        var cb = U.h('input', { type: 'radio', name: 'allowanceMethod-' + projectId, checked: selected, style: { accentColor: 'var(--brand)', marginTop: '3px' } });
        var card = U.h('label', { class: 'radio-card' + (selected ? ' selected' : '') },
          cb,
          U.h('span', { class: 'min-w-0 flex flex-col gap-1' },
            U.h('span', { class: 'text-sm font-bold', text: DB.CONST.ALLOWANCE_METHOD_LABELS[m] }),
            U.h('code', { class: 'inline', dir: 'ltr', style: { alignSelf: 'flex-start' }, text: DB.CONST.ALLOWANCE_METHOD_FORMULAS[m] }),
            m === 'SHARE_OF_ST'
              ? U.h('span', { class: 'banner warning' }, U.icon('alertTriangle'),
                  U.h('span', { class: 'text-in leading-relaxed', text: 'مجموع مجازها باید کمتر از ۱۰۰٪ باشد وگرنه خطا می‌گیرد.' }))
              : null));
        cb.addEventListener('change', function () {
          if (cb.checked) applyCalc({ allowanceMethod: m });
        });
        return card;
      });
      calcBodyEl.appendChild(UI.field('روش اعمال مجازها (A)',
        U.h('div', { class: 'flex flex-col gap-2' }, methodCards),
        HELP_ALLOWANCE));

      // روش تجمیع چند اپراتور
      var aggSel = UI.selectEl(
        Object.keys(DB.CONST.AGGREGATION_METHOD_LABELS).map(function (m) {
          return { value: m, label: DB.CONST.AGGREGATION_METHOD_LABELS[m] };
        }),
        calc.aggregationMethod,
        function (v) { applyCalc({ aggregationMethod: v }); },
        'روش تجمیع چند اپراتور');
      calcBodyEl.appendChild(UI.field('روش تجمیع چند اپراتور', aggSel, HELP_AGGREGATION));
    }
    renderCalcBody();

    page.appendChild(U.h('section', { class: 'card p-5', 'aria-label': 'تنظیمات محاسبات' },
      U.h('div', { class: 'flex items-center gap-3' },
        U.h('span', { class: 'chip-icon cyan' }, U.icon('calculator')),
        U.h('div', null,
          U.h('h2', { class: 'font-extrabold', text: 'تنظیمات محاسبات' }),
          U.h('p', { class: 'text-xs text-muted', text: 'روش اعمال مجازها و تجمیع چند اپراتور' }))),
      calcBodyEl));

    // ═══════════ بخش ۳ — وضعیت نهایی‌سازی (FR-27 — فقط هنگام نهایی‌شده) ═══════════
    var finalization = DB.getFinalization(projectId);
    if (finalization) {
      var unfinalizeBtn = U.h('button', { class: 'btn btn-outline shrink-0', type: 'button' }, U.icon('rotateCcw'), 'بازگشت از نهایی‌سازی');
      unfinalizeBtn.addEventListener('click', function () {
        SH.confirmDialogLocal({
          title: 'بازگشت از نهایی‌سازی',
          desc: 'وضعیت مطالعه به «در حال انجام» بازمی‌گردد.',
          confirmLabel: 'بازگشت از نهایی‌سازی',
        }).then(function (ok) {
          if (!ok) return;
          try {
            DB.unfinalizeProject(projectId);
            UI.toast('مطالعه به حالت در حال انجام بازگشت');
            APP.refresh();
          } catch (err) { UI.toastError(err); }
        });
      });

      page.appendChild(U.h('section', {
        class: 'card p-5', 'aria-label': 'وضعیت نهایی‌سازی',
        style: { borderColor: 'var(--green)' },
      },
        U.h('div', { class: 'flex flex-wrap items-start justify-between gap-3' },
          U.h('div', { class: 'flex items-start gap-3 min-w-0' },
            U.h('span', { class: 'chip-icon green shrink-0' }, U.icon('flag')),
            U.h('div', { class: 'min-w-0' },
              U.h('h2', { class: 'font-bold text-green', text: 'این مطالعه نهایی شده است' }),
              U.h('p', { class: 'text-xs text-muted leading-relaxed mt-1', text: 'وضعیت «نهایی‌شده» قفل ویرایش نیست؛ هر تغییر مؤثر، نتایج را «نیازمند محاسبه مجدد» می‌کند (FR-27).' }),
              U.h('div', { class: 'text-xs text-muted mt-2' },
                U.h('div', { text: 'تاریخ نهایی‌سازی: ' + U.formatDateTime(finalization.finalizedAt) }),
                U.h('div', { text: 'دلیل ثبت‌شده: ' + (finalization.reason || '—') })))),
          unfinalizeBtn)));
    }

    // ═══════════ بخش ۴ — عملیات پروژه (FR-26) ═══════════
    function operationRow(title, desc, btn, extraClass) {
      return U.h('div', { class: 'list-row justify-between flex-wrap' + (extraClass ? ' ' + extraClass : '') },
        U.h('div', { class: 'min-w-0' },
          U.h('div', { class: 'text-sm font-bold', text: title }),
          U.h('div', { class: 'text-xs text-muted', text: desc })),
        U.h('div', { class: 'shrink-0' }, btn));
    }

    var dupBtn = U.h('button', { class: 'btn btn-outline', type: 'button' }, U.icon('copy'), 'کپی');
    dupBtn.addEventListener('click', function () {
      SH.openDuplicateDialog(project, function () { APP.refresh(); });
    });

    var exportBtn = U.h('button', { class: 'btn btn-outline', type: 'button' }, U.icon('download'), 'دانلود بسته');
    exportBtn.addEventListener('click', function () { SH.exportProjectPackage(project); });

    var deleteBtn = U.h('button', { class: 'btn btn-destructive', type: 'button' }, U.icon('trash'), 'حذف دائمی');
    deleteBtn.addEventListener('click', function () {
      SH.requestDeleteProject(project, function () { APP.navigate('/'); });
    });

    page.appendChild(U.h('section', {
      class: 'card p-5', 'aria-label': 'عملیات پروژه',
      style: { borderColor: 'color-mix(in srgb, var(--red) 40%, var(--border))' },
    },
      U.h('div', { class: 'flex items-center gap-3' },
        U.h('span', { class: 'chip-icon red' }, U.icon('database')),
        U.h('div', null,
          U.h('h2', { class: 'font-extrabold', text: 'عملیات پروژه' }),
          U.h('p', { class: 'text-xs text-muted', text: 'کپی، خروجی بسته کامل و حذف دائمی' }))),
      U.h('div', { class: 'flex flex-col gap-2 mt-4' },
        operationRow('کپی پروژه', 'ساخت پروژه جدید از بخش‌های انتخابی این مطالعه؛ پیش‌فرض فقط ساختار و تنظیمات.', dupBtn),
        operationRow('خروجی بسته کامل', 'فایل JSON نسخه‌دار شامل کل داده پروژه با manifest و checksum.', exportBtn),
        operationRow('حذف دائمی پروژه', 'حذف کامل پروژه و تمام داده‌های وابسته؛ بدون سطل بازیافت.', deleteBtn))));

    container.appendChild(page);
  };
})(window);
