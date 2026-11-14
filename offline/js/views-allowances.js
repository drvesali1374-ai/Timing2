/* ═══════════════════════════════════════════════════════════
   نمای «مجازها و الونس‌ها» — بازطراحی جلسه اول
   • زبانه تعریف‌های مرکزی: فهرست مرکزی الونس‌های پروژه
     (تفکیک تعریف از تخصیص — §۲.۲) با ایجاد/ویرایش/آرشیو
   • زبانه الونس‌های خط تولید: تخصیص سطح PROJECT از طریق
     بخش واحد «الونس‌ها و زمان‌های مجاز» (§۶)
   • زبانه گروه‌های فعالیت: فقط طبقه‌بندی — پس از migration
     گروه‌ها دیگر منبع دوم اعمال الونس نیستند (§۵)
   • _allowanceSection: کامپوننت مشترک برای چهار سطح
     (خط/ایستگاه/فعالیت/عنصر) — mirrors AllowanceSection.tsx
   پورت هم‌ارز از src/views/project/GroupsView.tsx +
   src/views/project/allowances/AllowanceSection.tsx
   ═══════════════════════════════════════════════════════════ */
(function (g) {
  'use strict';
  var U = g.T2U, UI = g.T2UI, DB = g.T2DB;

  var activeTab = 'definitions';

  // ── محتوای راهنمای آیکونی ──
  var DEFINITIONS_HELP = {
    what: 'فهرست مرکزی الونس‌های پروژه؛ تعریف (عنوان/کد/مقدار پیش‌فرض) از تخصیص به سطوح جدا است. هر تعریف با ID پایدار به سطوح خط/ایستگاه/فعالیت/عنصر تخصیص می‌یابد.',
    input: 'عنوان الزامی است؛ کد، توضیحات و مقدار پیش‌فرض اختیاری‌اند. مقدار پیش‌فرض صرفاً پیشنهاد اولیه فرم تخصیص است.',
    example: '«نیازهای شخصی» (کد PP-۱، پیش‌فرض ۵٪) یا «استراحت شیفت» (زمان ثابت ۳۰۰ ثانیه، هر چرخه).',
    note: 'حذف تعریف دارای تخصیص/سابقه، به‌جای نابودی سوابق، آن را بایگانی می‌کند؛ تغییر عنوان ارتباط تخصیص‌ها را از بین نمی‌برد (ارتباط با ID است).',
  };
  var PROJECT_SCOPE_HELP = {
    what: 'الونس‌های این سطح به همه ایستگاه‌ها، فعالیت‌ها و عناصر کاری پروژه ارث می‌رسند؛ مگر آنکه در سطح پایین‌تر جایگزین یا حذف از ارث‌بری شوند.',
    input: 'با «افزودن الونس» از فهرست مرکزی انتخاب کنید؛ درصد یا زمان ثابت با مبنا ثبت می‌شود.',
    example: 'الونس نیازهای شخصی ۵٪ در سطح خط = پیش‌فرض کل خط؛ یک ایستگاه خاص می‌تواند مقدار خودش را جایگزین کند.',
    note: 'الونس زمانی سطح خط را با مبنا «هر چرخه» ثبت کنید تا در زمان تک‌تک عناصر ضرب نشود.',
  };
  var GROUPS_HELP = {
    what: 'گروه‌های فعالیت صرفاً برای طبقه‌بندی و برچسب‌گذاری فعالیت‌های مشابه‌اند. پس از مهاجرت به مدل سلسله‌مراتبی، مقادیر الونس از سطوح خط/ایستگاه/فعالیت/عنصر resolve می‌شوند و گروه منبع دوم محاسبه نیست.',
    input: 'گروه بسازید و در فرم «مشخصات فعالیت» به فعالیت‌ها نسبت دهید.',
    example: 'گروه «کار دستی سبک» یا «کار ماشینی سنگین».',
    note: 'مقادیر قدیمی گروه‌ها در زمان مهاجرت به تخصیص سطح فعالیت تبدیل شده‌اند تا نتیجه پروژه‌های موجود حفظ شود.',
  };
  var DEFAULT_VALUE_HELP = {
    what: 'مقدار پیش‌فرض فقط پیشنهاد اولیه فرم تخصیص است؛ به‌تنهایی به معنی اعمال الونس نیست و تغییر آن تخصیص‌های قبلی را تغییر نمی‌دهد.',
    input: 'نوع (درصدی/زمان ثابت) و مقدار متناظر را وارد کنید یا «بدون مقدار» بگذارید.',
    example: 'پیش‌فرض ۵٪ → فرم تخصیص پیشنهاد ۵٪ را نشان می‌دهد.',
    note: 'زمان پیش‌فرض برحسب ثانیه ذخیره می‌شود؛ واحد دقیقه در فرم تخصیص به ثانیه تبدیل می‌شود.',
  };
  var BASIS_HELP = {
    what: 'مبنای وقوع، مشخص می‌کند زمان ثابت الونس چه زمانی به زمان استاندارد افزوده می‌شود.',
    input: '«به‌ازای هر اجرای عنصر» برای زمان‌هایی مثل ابزاربرداری هر قطعه؛ «یک‌بار در هر چرخه» برای زمان‌های شخصی/شیفتی مثل استراحت.',
    example: 'استراحت ۵ دقیقه‌ای هر چرخه = زمان ثابت با مبنا «هر چرخه»؛ بازرسی قالب هر قطعه = «هر اجرا».',
    note: 'الونس «هر چرخه» فقط یک‌بار در سطح چرخه اعمال می‌شود و در زمان استاندارد تک‌تک عناصر ضرب نمی‌شود.',
  };
  var SECTION_HELP = {
    what: 'الونس‌ها (زمان‌های مجاز) به‌صورت سلسله‌مراتبی از خط تولید به ایستگاه، فعالیت و عنصر کاری ارث می‌رسند. در هر سطح می‌توانید مقدار را جایگزین کنید، آن را از ارث‌بری حذف کنید یا مقدار اختصاصی ثبت کنید.',
    input: 'با «افزودن الونس» از فهرست مرکزی پروژه انتخاب کنید؛ مقدار پیش‌فرض تعریف صرفاً پیشنهاد اولیه است.',
    example: 'استراحت و نیازهای شخصی ۵٪ در سطح خط + ابزاربرداری ۳۰ ثانیه برای یک عنصر خاص.',
    note: 'نزدیک‌ترین تخصیص به عنصر ملاک است؛ حذف از ارث‌بری در یک سطح، همان الونس را در کل زیرشاخه غیرفعال می‌کند.',
  };

  /** تبدیل ردیف آرایه‌ای به <tr> — سازگار با UI.table */
  function tr(cells) {
    return U.h('tr', null, cells.map(function (c) { return U.h('td', null, c === undefined || c === null ? null : c); }));
  }

  /** بلوک چیپ خلاصه — عنوان بالای مقدار (v1.5.2 §۴.۱) */
  function summaryBlock(label, valueEl) {
    return U.h('div', { class: 'flex flex-col justify-center gap-0.5 px-3 py-1.5', style: { background: 'var(--card)', border: '1px solid color-mix(in srgb, var(--border) 60%, transparent)', borderRadius: 'var(--radius)' } },
      U.h('span', { class: 'text-[10px] font-bold text-muted', text: label }),
      valueEl);
  }

  var SCOPE_TITLES = {
    PROJECT: 'سطح خط تولید (همه ایستگاه‌ها و فعالیت‌ها)',
    STATION: 'سطح ایستگاه (فعالیت‌ها و عناصر زیرمجموعه)',
    ACTIVITY: 'سطح فعالیت (عناصر کاری زیرمجموعه)',
    WORK_ELEMENT: 'سطح عنصر کاری',
  };

  function render(container, projectId) {
    U.clear(container);
    var defs = DB.listAllowanceDefinitions(projectId);
    var groups = DB.getState().activityGroups.filter(function (x) { return x.projectId === projectId; });
    var activeCount = defs.filter(function (d) { return d.isActive && !d.isArchived; }).length;
    var archivedCount = defs.filter(function (d) { return d.isArchived; }).length;

    var header = UI.stickyHeading(U.h('header', { class: 'flex flex-wrap items-center justify-between gap-3' },
      U.h('div', { class: 'flex items-center gap-3' },
        // v1.5.2 §۴.۳/§۵.۴: آیکون Percent برای بخش الونس‌ها
        U.h('span', { class: 'chip-icon brand', 'aria-hidden': 'true' }, U.icon('percent')),
        U.h('div', null,
          U.h('h1', { class: 'text-xl font-extrabold', text: 'مجازها و الونس‌ها' }),
          U.h('p', { class: 'num text-xs text-muted' },
            activeCount.toLocaleString('fa-IR') + ' تعریف فعال' +
            (archivedCount > 0 ? ' · ' + archivedCount.toLocaleString('fa-IR') + ' بایگانی‌شده' : '') +
            ' · ' + groups.length.toLocaleString('fa-IR') + ' گروه فعالیت')))));

    var tabs = UI.tabsBar([
      { key: 'definitions', label: 'تعریف‌های مرکزی', icon: 'layers' },
      // v1.5.2 §۵.۴: آیکون‌های یکپارچه — SlidersHorizontal / ListTree
      { key: 'project', label: 'الونس‌های خط تولید', icon: 'sliders' },
      { key: 'groups', label: 'گروه‌های فعالیت', icon: 'listTree' },
    ], activeTab, function (k) { activeTab = k; render(container, projectId); });

    var body = U.h('div', { class: 'space-y-4' });
    if (activeTab === 'definitions') renderDefinitionsTab(body, projectId);
    else if (activeTab === 'project') renderProjectTab(body, projectId);
    else renderGroupsTab(body, projectId);

    container.appendChild(U.h('div', { class: 'space-y-5 animate-view-in' }, header, tabs, body));
  }
  g.T2VIEWS.allowances = render;

  // ═══════════════ زبانه تعریف‌های مرکزی — §۲.۲ ═══════════════

  function renderDefinitionsTab(body, projectId) {
    var state = DB.getState();
    var showArchived = false;
    var wrap = U.h('div', null);
    body.appendChild(wrap);

    function draw() {
      U.clear(wrap);
      var defs = DB.listAllowanceDefinitions(projectId);
      var archivedCount = defs.filter(function (d) { return d.isArchived; }).length;
      var visible = showArchived ? defs : defs.filter(function (d) { return !d.isArchived; });

      var head = U.h('div', { class: 'card-head flex flex-wrap items-center justify-between gap-3 p-4 pb-3' },
        U.h('div', { class: 'flex items-center gap-2.5' },
          U.h('span', { class: 'chip-icon brand', 'aria-hidden': 'true' }, U.icon('layers')),
          U.h('div', null,
            U.h('h2', { class: 'text-sm font-extrabold', text: 'تعریف‌های مرکزی الونس' }),
            U.h('p', { class: 'text-[11px] text-muted', text: 'فهرست مشترک پروژه — تعریف از تخصیص جدا است' })),
          UI.helpDot('تعریف‌های مرکزی', DEFINITIONS_HELP)),
        U.h('div', { class: 'flex items-center gap-2' },
          archivedCount > 0 ? U.h('button', {
            class: 'btn btn-ghost btn-sm gap-1.5 text-xs', type: 'button',
            'aria-pressed': String(showArchived), onclick: function () { showArchived = !showArchived; draw(); },
          }, U.icon('archive'), showArchived ? 'پنهان‌سازی بایگانی' : 'بایگانی (' + archivedCount.toLocaleString('fa-IR') + ')') : null,
          U.h('button', { class: 'btn btn-brand btn-sm gap-1.5', type: 'button', onclick: function () { openDefinitionDialog(projectId, null, draw); } },
            U.icon('plus'), 'تعریف جدید')));

      var content = U.h('div', { class: 'p-4 pt-3' });
      if (visible.length === 0) {
        content.appendChild(U.h('div', { class: 'rounded-xl border border-dashed p-6 text-center', style: { borderColor: 'var(--border)' } },
          U.h('p', { class: 'text-sm font-bold', text: showArchived ? 'هیچ تعریفی ثبت نشده است' : 'هنوز تعریف الونسی ثبت نشده است' }),
          U.h('p', { class: 'mx-auto mt-1 max-w-lg text-xs leading-5 text-muted', text: 'تعریف مرکزی، الونس نام‌دار پروژه است (مثل «نیازهای شخصی» یا «استراحت شیفت»). پس از ساخت، از زبانه «الونس‌های خط تولید» یا فرم ایستگاه/فعالیت/عنصر قابل تخصیص است.' })));
      } else {
        var rows = visible.map(function (d) {
          var defaultLabel = '—';
          if (d.defaultValueType === 'PERCENT' && d.defaultValuePercent !== null) defaultLabel = U.formatPercent(d.defaultValuePercent);
          else if (d.defaultValueType === 'FIXED_TIME' && d.defaultTimeSeconds !== null) defaultLabel = U.formatTimeValue(d.defaultTimeSeconds) + ' ثانیه';
          var statusBadge;
          if (d.isArchived) statusBadge = UI.badge('بایگانی', 'muted');
          else if (d.isActive) statusBadge = UI.badge('فعال', 'green');
          else statusBadge = UI.badge('غیرفعال', 'amber');
          var actions = U.h('div', { class: 'flex items-center justify-center gap-0.5' },
            U.h('button', { class: 'icon-btn sm', 'aria-label': 'ویرایش تعریف ' + d.title, onclick: function () { openDefinitionDialog(projectId, d, draw); } }, U.icon('pencil')),
            !d.isArchived ? U.h('button', { class: 'icon-btn sm danger', 'aria-label': 'حذف یا بایگانی تعریف ' + d.title, onclick: function () { confirmArchiveDefinition(projectId, d, draw); } }, U.icon('trash')) : null);
          return [
            U.h('div', { class: 'max-w-64 text-right' },
              U.h('span', { class: 'text-[13px] font-bold', style: { display: 'block' }, text: d.title }),
              d.code ? U.h('span', { class: 'num text-[10px] text-faint', dir: 'ltr', text: d.code }) : null),
            U.h('div', { class: 'num text-xs' }, defaultLabel,
              d.defaultValueType === 'PERCENT' ? U.h('span', { class: 'block text-[10px] text-faint', text: 'درصدی' }) :
              d.defaultValueType === 'FIXED_TIME' ? U.h('span', { class: 'block text-[10px] text-faint', text: 'زمان ثابت' }) : null),
            statusBadge,
            U.h('span', { class: 'num text-xs', text: d.assignmentCount > 0 ? d.assignmentCount.toLocaleString('fa-IR') : '—' }),
            U.h('span', { class: 'text-[11px] text-muted', text: U.formatDateTime(d.updatedAt) }),
            actions,
          ];
        });
        content.appendChild(UI.table(['عنوان و کد', 'پیش‌فرض', 'وضعیت', 'تخصیص‌ها', 'آخرین تغییر', ''], rows.map(tr)));
      }
      wrap.appendChild(U.h('section', { class: 'card card-premium overflow-hidden', 'aria-label': 'تعریف‌های مرکزی الونس' }, head, content));
    }
    draw();
  }

  function openDefinitionDialog(projectId, def, onSaved) {
    var isEdit = !!def;
    var form = {
      title: def ? def.title : '',
      code: def && def.code ? def.code : '',
      description: def && def.description ? def.description : '',
      defaultValueType: def ? (def.defaultValueType || 'NONE') : 'NONE',
      defaultPercent: def && def.defaultValuePercent !== null ? def.defaultValuePercent : null,
      defaultSeconds: def && def.defaultTimeSeconds !== null ? def.defaultTimeSeconds : null,
      isActive: def ? def.isActive : true,
      sortOrder: def ? def.sortOrder : 0,
    };
    var saveInd = UI.saveIndicator('saved');
    var dlg;

    var titleInput = U.h('input', { class: 'input', id: 'def-title-input', value: form.title, placeholder: 'مثلاً: نیازهای شخصی' });
    var codeInput = U.h('input', { class: 'input num ltr', id: 'def-code-input', dir: 'ltr', value: form.code, placeholder: 'PP-1' });
    var descInput = U.h('textarea', { class: 'textarea', rows: 2, placeholder: 'توضیح اختیاری…' });
    descInput.value = form.description;
    var sortInput = UI.persianNumberInput({ value: form.sortOrder, decimals: false, min: 0, max: 9999, ariaLabel: 'ترتیب نمایش' });
    var activeSwitch = UI.switchEl(form.isActive, function (v) { form.isActive = v; }, 'تعریف فعال باشد');
    var defaultTypeSelect = UI.selectEl([
      { value: 'NONE', label: 'بدون مقدار' },
      { value: 'PERCENT', label: 'درصدی' },
      { value: 'FIXED_TIME', label: 'زمان ثابت' },
    ], form.defaultValueTypeType = form.defaultValueType, function (v) {
      form.defaultValueType = v;
      drawDefaultFields();
    });
    var defaultWrap = U.h('div', { class: 'space-y-2' });

    function drawDefaultFields() {
      U.clear(defaultWrap);
      if (form.defaultValueType === 'PERCENT') {
        defaultWrap.appendChild(UI.field('درصد پیشنهادی', UI.percentInput({
          value: form.defaultPercent,
          onChange: function (v) { form.defaultPercent = v; },
          ariaLabel: 'درصد پیشنهادی',
        })));
      } else if (form.defaultValueType === 'FIXED_TIME') {
        defaultWrap.appendChild(UI.field('زمان پیشنهادی (ثانیه)', UI.persianNumberInput({
          value: form.defaultSeconds, decimals: true, min: 0,
          onChange: function (v) { form.defaultSeconds = v; },
          ariaLabel: 'زمان پیشنهادی ثانیه',
        })));
      }
    }
    drawDefaultFields();

    function submit() {
      if (!form.title.trim()) { UI.toastError(new Error('عنوان الزامی است.')); return; }
      if (form.defaultValueType === 'PERCENT' && form.defaultPercent === null) { UI.toastError(new Error('درصد پیش‌فرض را وارد کنید یا نوع پیش‌فرض را «بدون مقدار» بگذارید.')); return; }
      if (form.defaultValueType === 'FIXED_TIME' && form.defaultSeconds === null) { UI.toastError(new Error('زمان پیش‌فرض را وارد کنید یا نوع پیش‌فرض را «بدون مقدار» بگذارید.')); return; }
      var payload = {
        title: form.title.trim(),
        code: form.code.trim() || null,
        description: descInput.value.trim() || null,
        defaultValueType: form.defaultValueType === 'NONE' ? null : form.defaultValueType,
        defaultValuePercent: form.defaultValueType === 'PERCENT' ? form.defaultPercent : null,
        defaultTimeSeconds: form.defaultValueType === 'FIXED_TIME' ? form.defaultSeconds : null,
        isActive: form.isActive,
        sortOrder: form.sortOrder === null ? 0 : form.sortOrder,
      };
      try {
        if (isEdit) {
          DB.updateAllowanceDefinition(def.id, payload);
          saveInd.setSaved();
          if (onSaved) onSaved();
          dlg.close();
        } else {
          DB.createAllowanceDefinition(projectId, payload);
          g.T2Toast('تعریف ساخته شد و بلافاصله قابل تخصیص است', { type: 'success' });
          if (onSaved) onSaved();
          dlg.close();
        }
      } catch (err) { UI.toastError(err); }
    }

    dlg = UI.dialog({
      title: isEdit ? 'ویرایش تعریف — «' + def.title + '»' : 'تعریف جدید الونس',
      desc: isEdit
        ? 'تغییر عنوان ارتباط تخصیص‌ها را از بین نمی‌برد (ارتباط با ID است).'
        : 'تعریف در فهرست مرکزی پروژه ثبت می‌شود و بلافاصله در فرم‌های تخصیص قابل انتخاب است.',
      bodyBuilder: function (body) {
        body.appendChild(U.h('div', { class: 'space-y-4' },
          UI.field('عنوان (الزامی)', titleInput),
          U.h('div', { class: 'grid grid-cols-2 gap-3' },
            UI.field('کد (اختیاری)', codeInput),
            UI.field('ترتیب نمایش', sortInput)),
          UI.field('توضیحات (اختیاری)', descInput),
          U.h('div', { class: 'rounded-xl p-3 space-y-2', style: { background: 'var(--surface-2)' } },
            UI.field('مقدار پیش‌فرض (اختیاری)', defaultTypeSelect, DEFAULT_VALUE_HELP),
            defaultWrap,
            U.h('p', { class: 'text-[10px] leading-4 text-muted', text: 'مقدار پیش‌فرض با برچسب «پیشنهادی» در فرم تخصیص نمایش داده می‌شود؛ ایجاد یا تغییر آن تخصیص‌های قبلی را تغییر نمی‌دهد.' })),
          UI.field('وضعیت تعریف', U.h('div', { class: 'flex items-center gap-2' }, activeSwitch,
            U.h('span', { class: 'text-[11px] text-muted', text: form.isActive ? 'فعال — قابل تخصیص' : 'غیرفعال — از محاسبات کنار گذاشته می‌شود' })))));
      },
      footerBuilder: function () {
        return U.h('div', { class: 'dialog-footer' },
          isEdit ? saveInd.el : null,
          U.h('button', { class: 'btn btn-outline', type: 'button', onclick: function () { dlg.close(); } }, 'انصراف'),
          U.h('button', { class: 'btn btn-brand gap-1.5', type: 'button', onclick: submit }, U.icon('check'), isEdit ? 'ذخیره' : 'ثبت تعریف'));
      },
    });
  }

  function confirmArchiveDefinition(projectId, def, onSaved) {
    var deps = {};
    if (def.assignmentCount > 0) deps['تخصیص ثبت‌شده (بایگانی می‌شود، سوابق حفظ می‌شود)'] = def.assignmentCount;
    UI.confirmDelete({
      title: def.assignmentCount > 0 ? 'بایگانی تعریف دارای سابقه' : 'حذف تعریف',
      name: def.title,
      deps: deps,
      desc: def.assignmentCount > 0
        ? 'این تعریف تخصیص/سابقه دارد؛ برای حفظ سوابق تاریخی به‌جای حذف، بایگانی و از محاسبات کنار گذاشته می‌شود.'
        : 'تعریف بدون تخصیص است و واقعاً حذف می‌شود.',
    }).then(function (yes) {
      if (!yes) return;
      try {
        var res = DB.deleteAllowanceDefinition(def.id);
        if (res.archived) {
          g.T2Toast('تعریف «' + def.title + '» بایگانی شد', {
            type: 'success',
            description: 'این تعریف ' + res.assignmentCount.toLocaleString('fa-IR') + ' تخصیص داشت؛ برای حفظ سوابق تاریخی بایگانی شد.',
          });
        } else g.T2Toast('تعریف «' + def.title + '» حذف شد', { type: 'success' });
        if (onSaved) onSaved();
      } catch (err) { UI.toastError(err); }
    });
  }

  // ═══════════════ زبانه الونس‌های خط تولید ═══════════════

  function renderProjectTab(body, projectId) {
    // v1.5.2 §۵.۱: کارت توضیحی مستقل حذف شد؛ راهنمای ظریف یک‌خطی با HelpDot
    body.appendChild(U.h('div', { class: 'flex items-start gap-2 px-1 mb-3 text-[11px] leading-5 text-muted' },
      UI.helpDot('الونس‌های سطح خط تولید', PROJECT_SCOPE_HELP),
      U.h('p', { text: 'این الونس‌ها به تمام ایستگاه‌ها، فعالیت‌ها و عناصر کاری ارث می‌رسند؛ در هر سطح پایین‌تر قابل جایگزینی یا حذف از ارث‌بری‌اند.' })));
    var sectionEl = U.h('div');
    body.appendChild(sectionEl);
    g.T2VIEWS._allowanceSection(sectionEl, projectId, 'PROJECT', projectId);
  }

  // ═══════════════ زبانه گروه‌های فعالیت — فقط طبقه‌بندی ═══════════════
  // v1.5.2 §۵.۲: فهرست کامل فعالیت‌ها با «نمایش همه / نمایش کمتر»؛
  // نام فعالیت‌ها بدون بریده‌شدن (wrap) و تایپوگرافی بازطراحی‌شده.

  /** آستانه نمایش فهرست جمع‌وجور قبل از دکمهٔ «نمایش همه» */
  var GROUP_COLLAPSED_COUNT = 5;
  /** وضعیت باز/بستهٔ فهرست فعالیت‌های هر گروه — پایدار بین رندرها */
  var _groupExpanded = {}; // groupId -> bool

  function groupCard(grp, acts, projectId, onDelete, redraw) {
    var expanded = !!_groupExpanded[grp.id];
    var showAll = expanded || acts.length <= GROUP_COLLAPSED_COUNT;
    var visibleActs = showAll ? acts : acts.slice(0, GROUP_COLLAPSED_COUNT);
    var hiddenCount = acts.length - visibleActs.length;

    var actList = U.h('ul', { class: 'mt-3 space-y-1 pt-3', style: { borderTop: '1px solid var(--border)' } });
    visibleActs.forEach(function (a) {
      actList.appendChild(U.h('li', null,
        U.h('button', {
          class: 'flex w-full items-baseline gap-1.5 rounded-md px-1.5 py-1 text-right text-xs leading-5 hover:bg-brand-soft',
          onclick: function () { g.T2APP.navigate('/p/' + projectId + '/activity/' + a.id); },
        },
          // نام فعالیت با wrap کامل — بدون بریده‌شدن (v1.5.2 §۵.۲)
          U.h('span', { class: 'min-w-0 flex-1 break-words', text: a.name }),
          U.h('span', { class: 'shrink-0 text-faint', text: '— ' + a.stationName }))));
    });
    // نمایش همه فعالیت‌ها / نمایش کمتر — دسترسی به فهرست کامل (§۵.۲)
    if (acts.length > GROUP_COLLAPSED_COUNT) {
      actList.appendChild(U.h('li', null,
        U.h('button', {
          class: 'num flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-[11px] font-bold',
          style: { color: 'var(--brand)' },
          'aria-expanded': String(expanded),
          onclick: function () { _groupExpanded[grp.id] = !expanded; redraw(); },
        },
          U.icon(expanded ? 'chevronUp' : 'chevronDown'),
          expanded ? 'نمایش کمتر' : 'نمایش همه فعالیت‌ها (' + hiddenCount.toLocaleString('fa-IR') + ' مورد دیگر)')));
    }

    return U.h('div', { class: 'flex flex-col rounded-xl p-4', style: { border: '1px solid color-mix(in srgb, var(--border) 60%, transparent)', background: 'color-mix(in srgb, var(--surface-2) 50%, transparent)' } },
      U.h('div', { class: 'flex items-start justify-between gap-2' },
        U.h('div', { class: 'min-w-0 flex-1' },
          U.h('p', { class: 'text-[15px] font-bold leading-6', text: grp.name }),
          grp.description ? U.h('p', { class: 'mt-1 text-xs leading-5 text-muted', text: grp.description }) : null,
          U.h('p', { class: 'num mt-1.5 text-[11px] leading-4 text-faint', text: acts.length.toLocaleString('fa-IR') + ' فعالیت · ساخته‌شده ' + U.formatDateTime(grp.createdAt) })),
        U.h('button', {
          class: 'icon-btn sm danger shrink-0', 'aria-label': 'حذف گروه ' + grp.name,
          onclick: function () { onDelete(grp, acts); },
        }, U.icon('trash'))),
      acts.length > 0 ? actList : null);
  }

  function renderGroupsTab(body, projectId) {
    var wrap = U.h('div');
    body.appendChild(wrap);

    function draw() {
      U.clear(wrap);
      var state = DB.getState();
      var groups = state.activityGroups.filter(function (x) { return x.projectId === projectId; });
      var actsByGroup = {};
      state.activities.forEach(function (a) {
        if (!a.groupId) return;
        if (!actsByGroup[a.groupId]) actsByGroup[a.groupId] = [];
        var st = state.stations.find(function (s) { return s.id === a.stationId; });
        actsByGroup[a.groupId].push({ id: a.id, name: a.name, stationName: st ? st.name : '؟' });
      });

      var head = U.h('div', { class: 'card-head flex flex-wrap items-center justify-between gap-3 p-4 pb-3' },
        U.h('div', { class: 'flex items-center gap-2.5' },
          // v1.5.2 §۵.۴: ListTree — آیکون یکپارچهٔ گروه‌های فعالیت
          U.h('span', { class: 'chip-icon cyan', 'aria-hidden': 'true' }, U.icon('listTree')),
          U.h('div', null,
            U.h('h2', { class: 'text-sm font-extrabold', text: 'گروه‌های فعالیت' }),
            U.h('p', { class: 'text-[11px] text-muted', text: 'طبقه‌بندی فعالیت‌های مشابه — منبع محاسبه نیست' })),
          UI.helpDot('گروه‌های فعالیت', GROUPS_HELP)),
        U.h('button', { class: 'btn btn-brand btn-sm gap-1.5', type: 'button', onclick: openCreateGroup },
          U.icon('plus'), 'گروه جدید'));

      var content = U.h('div', { class: 'p-4 pt-3' });
      if (groups.length === 0) {
        content.appendChild(U.h('div', { class: 'rounded-xl border border-dashed p-6 text-center', style: { borderColor: 'var(--border)' } },
          U.h('p', { class: 'text-sm font-bold', text: 'هنوز گروه فعالیتی ثبت نشده است' }),
          U.h('p', { class: 'mx-auto mt-1 max-w-lg text-xs leading-5 text-muted', text: 'گروه‌ها صرفاً برچسب طبقه‌بندی فعالیت‌ها هستند؛ الونس‌ها از مدل سلسله‌مراتبی (خط → ایستگاه → فعالیت → عنصر) اعمال می‌شوند.' }),
          U.h('button', { class: 'btn btn-brand btn-sm mt-3 gap-1.5', type: 'button', onclick: openCreateGroup }, U.icon('plus'), 'اولین گروه')));
      } else {
        var grid = U.h('div', { class: 'grid gap-3 sm:grid-cols-2' });
        groups.forEach(function (grp) {
          var acts = actsByGroup[grp.id] || [];
          grid.appendChild(groupCard(grp, acts, projectId, function (g2, acts2) { confirmDeleteGroup(g2, acts2, draw); }, draw));
        });
        content.appendChild(grid);
      }
      wrap.appendChild(U.h('section', { class: 'card card-premium overflow-hidden', 'aria-label': 'گروه‌های فعالیت' }, head, content));
    }

    function openCreateGroup() {
      var nameInput = U.h('input', { class: 'input', placeholder: 'مثلاً: کار دستی سبک' });
      var descInput = U.h('textarea', { class: 'textarea', rows: 2, placeholder: 'توضیح اختیاری…' });
      var dlg = UI.dialog({
        title: 'گروه فعالیت جدید',
        desc: 'گروه فقط برای طبقه‌بندی فعالیت‌هاست؛ مقادیر الونس در سطوح خط/ایستگاه/فعالیت/عنصر تعیین می‌شوند.',
        bodyBuilder: function (body) {
          body.appendChild(U.h('div', { class: 'space-y-4' },
            UI.field('نام گروه (الزامی)', nameInput),
            UI.field('توضیحات (اختیاری)', descInput)));
        },
        footerBuilder: function () {
          return U.h('div', { class: 'dialog-footer' },
            U.h('button', { class: 'btn btn-outline', type: 'button', onclick: function () { dlg.close(); } }, 'انصراف'),
            U.h('button', {
              class: 'btn btn-brand gap-1.5', type: 'button',
              onclick: function () {
                if (!nameInput.value.trim()) { UI.toastError(new Error('نام گروه الزامی است')); return; }
                try {
                  DB.createGroup(projectId, { name: nameInput.value.trim(), description: descInput.value.trim() || null });
                  g.T2Toast('گروه فعالیت ایجاد شد', { type: 'success' });
                  dlg.close(); draw();
                } catch (err) { UI.toastError(err); }
              },
            }, U.icon('plus'), 'ثبت گروه'));
        },
      });
    }

    function confirmDeleteGroup(grp, acts, onDone) {
      UI.confirmDelete({
        title: 'حذف گروه فعالیت',
        name: grp.name,
        deps: acts.length > 0 ? { 'فعالیت — فقط بدون گروه می‌شوند؛ داده آن‌ها حذف نمی‌شود': acts.length } : {},
      }).then(function (yes) {
        if (!yes) return;
        try {
          DB.deleteGroup(grp.id);
          g.T2Toast('گروه «' + grp.name + '» حذف شد', {
            type: 'success',
            description: acts.length.toLocaleString('fa-IR') + ' فعالیتِ این گروه بدون گروه شد؛ داده آن‌ها حذف نشد.',
          });
          onDone();
        } catch (err) { UI.toastError(err); }
      });
    }

    draw();
  }

  // ═══════════════ بخش «الونس‌ها و زمان‌های مجاز» — کامپوننت مشترک چهار سطح (§۶) ═══════════════
  // mirrors src/views/project/allowances/AllowanceSection.tsx

  var STATUS_BADGES = {
    INHERITED: { label: 'ارث‌رسیده', tone: 'brand' },
    OVERRIDDEN: { label: 'جایگزین‌شده', tone: 'amber' },
    CUSTOM: { label: 'اختصاصی', tone: 'green' },
    EXCLUDED: { label: 'حذف از ارث‌بری', tone: 'red' },
  };

  g.T2VIEWS._allowanceSection = function (container, projectId, scopeType, scopeId, opts) {
    opts = opts || {};
    var sectionEl = U.h('section', { class: opts.compact ? '' : 'card card-premium overflow-hidden', 'aria-label': 'الونس‌ها و زمان‌های مجاز' });
    container.appendChild(sectionEl);

    function fmtSeconds(v) { return v === null || v === undefined ? '—' : U.formatTimeValue(v) + ' ثانیه'; }

    /** برچسب مبنای زمان ثابت — null هرگز به «هر اجرا» تبدیل نمی‌شود (بازبینی تکمیلی ج۱) */
    function basisLabel(basis) {
      if (basis === 'PER_CYCLE') return 'هر چرخه';
      if (basis === 'PER_ELEMENT_EXECUTION') return 'هر اجرا';
      return 'مبنا نامشخص';
    }

    /** برچسب منوی Restore — با وضعیت واقعی تخصیص هماهنگ (الزام ۴) */
    function restoreMenuLabel(row) {
      if (row.status === 'CUSTOM') return 'حذف تخصیص محلی';
      if (row.status === 'EXCLUDED') return row.parentMode === 'ACTIVE' ? 'بازگردانی الونس والد' : 'حذف استثنای محلی';
      // والد مستقیم EXCLUDE است → Restore فقط تخصیص محلی را حذف می‌کند و وضعیت
      // «حذف از ارث‌بری» والد دوباره برقرار می‌شود — «مقدار» والدی برای بازگشت نیست.
      if (row.parentMode === 'EXCLUDE') return 'بازگردانی به وضعیت والد (حذف تخصیص محلی)';
      return 'بازگردانی به مقدار والد';
    }
    function restoreToast(row) {
      if (row.status === 'CUSTOM') return 'تخصیص محلی «' + row.title + '» حذف شد';
      if (row.status === 'EXCLUDED') {
        return row.parentMode === 'ACTIVE'
          ? 'استثنای محلی «' + row.title + '» حذف شد و الونس والد بازگشت'
          : 'استثنای محلی «' + row.title + '» حذف شد';
      }
      if (row.parentMode === 'EXCLUDE') {
        return 'تخصیص محلی «' + row.title + '» حذف شد و وضعیت حذف از ارث‌بری والد دوباره برقرار شد';
      }
      return 'تخصیص محلی «' + row.title + '» حذف شد و مقدار والد بازگشت';
    }
    /** مقدار والد با «نوع و مبنای خودش» قالب‌بندی می‌شود — نه نوع تخصیص محلی (الزام ۳) */
    function formatParentValue(row) {
      if (row.parentValue === null || row.parentValue === undefined) return '—';
      if (row.parentValueType === 'PERCENT') return U.formatPercent(row.parentValue);
      var basis = row.parentApplicationBasis === 'PER_CYCLE' ? ' (هر چرخه)'
        : row.parentApplicationBasis === 'PER_ELEMENT_EXECUTION' ? ' (هر اجرا)' : '';
      return U.formatTimeValue(row.parentValue) + ' ثانیه' + basis;
    }

    function draw() {
      var data;
      try { data = DB.getScopeAllowances(scopeType, scopeId); }
      catch (err) { sectionEl.textContent = ''; sectionEl.appendChild(U.h('div', { class: 'banner error' }, U.icon('alertTriangle'), U.h('span', { text: err.message }))); return; }

      U.clear(sectionEl);
      var rows = data.resolved.rows;
      var summary = data.resolved.summary;
      var needsAgg = rows.filter(function (r) { return r.needsAggregationRule; });

      // هدر
      var head = U.h('div', { class: 'card-head flex flex-wrap items-center justify-between gap-3 p-4 pb-3' },
        U.h('div', { class: 'flex items-center gap-2.5' },
          // v1.5.2 §۴.۳: آیکون Percent — مفهوم الونس/درصد
          U.h('span', { class: 'chip-icon brand', 'aria-hidden': 'true' }, U.icon('percent')),
          U.h('div', null,
            U.h('h3', { class: 'text-sm font-extrabold', text: 'الونس‌ها و زمان‌های مجاز' }),
            U.h('p', { class: 'text-[11px] text-muted', text: SCOPE_TITLES[scopeType] })),
          UI.helpDot('الونس‌ها و زمان‌های مجاز', SECTION_HELP)),
        U.h('div', { class: 'flex items-center gap-2' },
          UI.badge(data.settings.methodLabel, 'outline'),
          U.h('button', { class: 'btn btn-brand btn-sm gap-1.5', type: 'button', onclick: openAddPopover },
            U.icon('plus'), 'افزودن الونس')));

      var content = U.h('div', { class: (opts.compact ? '' : 'p-4 pt-3') + ' space-y-3' });

      if (rows.length === 0) {
        content.appendChild(U.h('div', { class: 'rounded-xl border border-dashed p-4 text-center', style: { borderColor: 'var(--border)', background: 'var(--surface-2)' } },
          U.h('p', { class: 'text-sm font-bold', text: 'هنوز الونسی برای این سطح تعریف نشده است' }),
          U.h('p', { class: 'mx-auto mt-1 max-w-md text-xs leading-5 text-muted', text: 'الونس‌های تعریف‌شده در سطوح بالاتر (خط تولید/ایستگاه/فعالیت) به‌طور خودکار به این سطح ارث می‌رسند. با «افزودن الونس» می‌توانید مقدار اختصاصی همین سطح را ثبت کنید.' })));
      } else {
        var tableRows = rows.map(function (row) {
          var badge = STATUS_BADGES[row.status];
          var excluded = row.status === 'EXCLUDED';
          var menu = UI.dropdownMenu([
            { label: 'جایگزینی مقدار…', icon: 'pencil', onClick: function () { openEditor(row, null); } },
            row.valueType === 'FIXED_TIME' && !excluded ? { label: 'تغییر مبنای زمان ثابت…', icon: 'timer', onClick: function () { openBasisDialog(row); } } : null,
            !excluded ? { label: 'حذف از ارث‌بری', icon: 'ban', onClick: function () { confirmExclude(row); } } : null,
            row.hasLocalDecision ? '-' : null,
            row.hasLocalDecision ? { label: restoreMenuLabel(row), icon: 'rotateCcw', destructive: true, onClick: function () { runOp({ definitionId: row.definitionId, action: 'RESTORE' }, restoreToast(row)); } } : null,
          ].filter(Boolean), { class: 'icon-btn sm', 'aria-label': 'عملیات الونس ' + row.title });
          return [
            U.h('div', { class: 'max-w-56 text-right' },
              U.h('span', { class: 'text-[13px] font-bold', style: { display: 'block' }, text: row.title }),
              row.code ? U.h('span', { class: 'num text-[10px] text-faint', dir: 'ltr', text: row.code }) : null),
            U.h('span', { class: 'text-xs' },
              row.valueType === 'PERCENT' ? 'درصدی'
              : row.valueType === 'FIXED_TIME' ? U.h('span', null, 'زمان ثابت',
                U.h('span', { class: 'block text-[10px] text-muted', text: basisLabel(row.displayApplicationBasis) }))
              : U.h('span', { class: 'text-faint', text: '—' })),
            U.h('span', { class: 'num font-bold' },
              excluded || (row.valueType !== 'PERCENT' && row.valueType !== 'FIXED_TIME') ? '—' :
              row.valueType === 'PERCENT' ? U.h('span', { class: 'text-brand', text: U.formatPercent(row.percentValue) }) :
              fmtSeconds(row.timeValueSeconds)),
            U.h('span', { class: 'text-xs text-muted' }, row.sourceScopeLabel || '—',
              row.sourceScopeType ? U.h('span', { class: 'block text-[10px] text-faint', text: DB.CONST.ALLOWANCE_SCOPE_LABELS[row.sourceScopeType] || '' }) : null),
            U.h('span', null, UI.badge(badge.label, badge.tone),
              // v1.5.2 §۴.۲: فقط Badge کوتاه؛ توضیح کامل از طریق پاپ‌اور «توضیح»
              row.note ? UI.noteDot(row.note, 'توضیح وضعیت ' + row.title) : null),
            menu,
          ];
        });
        content.appendChild(UI.table(['عنوان الونس', 'نوع و مبنا', 'مقدار مؤثر', 'مبدأ', 'وضعیت', 'عملیات'], tableRows.map(tr)));

        // خلاصه — بلوک‌های مستقل و منظم با فاصله کافی (v1.5.2 §۴.۱)
        content.appendChild(U.h('div', { class: 'rounded-xl px-3.5 py-3', style: { background: 'var(--surface-2)' } },
          U.h('p', { class: 'mb-2 text-[11px] font-extrabold text-muted', text: 'خلاصه محاسبات الونس' }),
          U.h('div', { class: 'flex flex-wrap items-stretch gap-2' },
            summaryBlock('الونس مؤثر', U.h('span', { class: 'num text-[13px] font-extrabold', style: { color: 'var(--brand)' }, text: summary.count.toLocaleString('fa-IR') })),
            summaryBlock('جمع درصدها (A)', U.h('span', { dir: 'ltr', class: 'num text-[13px] font-extrabold text-right', style: { color: 'var(--brand)' }, text: U.formatPercent(summary.totalPercent) })),
            summaryBlock('زمان ثابت هر اجرا', U.h('span', { class: 'num text-[13px] font-extrabold', text: fmtSeconds(summary.perExecutionSeconds) })),
            summaryBlock('زمان ثابت هر چرخه (جدا از ST عناصر)', U.h('span', { class: 'num text-[13px] font-extrabold', text: fmtSeconds(summary.perCycleSeconds) })),
            // فرمول — نمایش چپ‌به‌راست صحیح (v1.5.2 §۴.۱)
            U.h('div', { dir: 'ltr', class: 'num flex items-center justify-center self-stretch px-3.5 py-1.5 text-[12px] font-extrabold', style: { color: 'var(--brand)', background: 'color-mix(in srgb, var(--brand-soft) 40%, transparent)', border: '1px dashed color-mix(in srgb, var(--brand) 40%, transparent)', borderRadius: 'var(--radius)' }, text: data.settings.formula }))));

        // نیازمند قاعده تجمیع — §۲.۳
        if (needsAgg.length > 0) {
          var ul = U.h('ul', { class: 'mt-1 list-disc space-y-0.5 text-xs text-muted', style: { listStylePosition: 'inside', paddingRight: '0', background: 'transparent' } });
          needsAgg.forEach(function (r) {
            ul.appendChild(U.h('li', { class: 'num', text: '«' + r.title + '» — ' + fmtSeconds(r.timeValueSeconds) + ' از سطح «' + (r.sourceScopeLabel || '—') + '»؛ تا تعریف قاعده تجمیع مهندسی، بی‌صدا حذف یا چندبار اعمال نمی‌شود.' }));
          });
          content.appendChild(U.h('div', { class: 'rounded-xl p-3 text-xs leading-6', style: { background: 'var(--amber-soft)' } },
            U.h('p', { class: 'flex items-center gap-1.5 font-bold', style: { color: 'var(--amber)' } }, U.icon('alertTriangle'),
              needsAgg.length.toLocaleString('fa-IR') + ' الونس زمان ثابت «هر اجرا» در سطح بالاتر از عنصر — نیازمند قاعده تجمیع'),
            ul));
        }
      }

      sectionEl.appendChild(head);
      sectionEl.appendChild(content);
    }

    function runOp(op, successMsg) {
      try {
        DB.putScopeAllowanceOps(scopeType, scopeId, [op]);
        if (successMsg) g.T2Toast(successMsg, { type: 'success' });
        draw();
        if (opts.onChange) opts.onChange();
      } catch (err) { UI.toastError(err); }
    }

    // افزودن از فهرست مرکزی — popover با جست‌وجو (§۶)
    function openAddPopover() {
      var data = DB.getScopeAllowances(scopeType, scopeId);
      var available = data.definitions.filter(function (d) { return d.isActive && !d.isArchived; });
      var rowDefIds = {};
      data.resolved.rows.forEach(function (r) { rowDefIds[r.definitionId] = true; });
      var searchInput = U.h('input', { class: 'input', placeholder: 'جست‌وجوی عنوان یا کد…' });
      var listEl = U.h('div', { class: 'max-h-64 overflow-y-auto space-y-0.5' });

      function drawList() {
        U.clear(listEl);
        var q = searchInput.value.trim();
        var matches = available.filter(function (d) { return !q || d.title.indexOf(q) >= 0 || (d.code || '').indexOf(q) >= 0; });
        if (matches.length === 0) {
          listEl.appendChild(U.h('p', { class: 'py-4 text-center text-xs text-muted', text: 'تعریف فعالی یافت نشد؛ تعریف جدید بسازید.' }));
        }
        matches.forEach(function (d) {
          var defTip = d.defaultValueType === 'PERCENT' ? 'پیشنهادی: ' + U.formatPercent(d.defaultValuePercent)
            : d.defaultValueType === 'FIXED_TIME' ? 'پیشنهادی: ' + U.formatTimeValue(d.defaultTimeSeconds) + ' ثانیه'
            : 'بدون مقدار پیش‌فرض';
          listEl.appendChild(U.h('button', {
            class: 'flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-right hover:bg-brand-soft',
            type: 'button',
            onclick: function () { dlg.close(); openEditor(null, d); },
          },
            U.h('span', { class: 'min-w-0 flex-1' },
              U.h('span', { class: 'block truncate text-xs font-bold', text: d.title }),
              U.h('span', { class: 'block text-[10px] text-muted', text: defTip })),
            rowDefIds[d.id] ? UI.badge('فعال', 'brand') : null));
        });
      }
      searchInput.addEventListener('input', drawList);
      drawList();

      var dlg = UI.dialog({
        title: 'افزودن الونس از فهرست مرکزی',
        desc: 'تعریف مرکزی پروژه را انتخاب کنید یا تعریف جدید بسازید.',
        bodyBuilder: function (body) {
          body.appendChild(U.h('div', { class: 'space-y-2' },
            searchInput, listEl,
            U.h('button', {
              class: 'flex w-full items-center gap-1.5 rounded-lg border border-dashed px-2.5 py-2 text-xs font-bold hover:bg-brand-soft',
              style: { borderColor: 'var(--border)', color: 'var(--brand)' },
              type: 'button',
              onclick: function () {
                dlg.close();
                openDefinitionDialog(projectId, null, function () { draw(); });
              },
            }, U.icon('circlePlus'), 'ایجاد تعریف جدید در همین فرم…')));
        },
        footerBuilder: function () {
          return U.h('div', { class: 'dialog-footer' },
            U.h('button', { class: 'btn btn-outline', type: 'button', onclick: function () { dlg.close(); } }, 'بستن'));
        },
      });
    }

    // ویرایشگر مقدار — جایگزینی/افزودن (§۶ ورودی‌ها)
    function openEditor(row, def) {
      var definition = def || data_def(row.definitionId);
      function data_def(id) {
        return DB.listAllowanceDefinitions(projectId).find(function (d) { return d.id === id; }) || { id: id, title: row.title, defaultValueType: null, defaultValuePercent: null, defaultTimeSeconds: null };
      }
      var current = row && row.status !== 'EXCLUDED' ? row : null;
      var initialType = current ? current.valueType : (definition.defaultValueType || 'PERCENT');
      var state = {
        valueType: initialType,
        percent: initialType === 'PERCENT' ? (current ? current.percentValue : definition.defaultValuePercent) : null,
        seconds: initialType === 'FIXED_TIME' ? (current ? current.timeValueSeconds : definition.defaultTimeSeconds) : null,
        unit: 'sec',
        basis: current && current.applicationBasis ? current.applicationBasis : (scopeType === 'WORK_ELEMENT' ? 'PER_ELEMENT_EXECUTION' : 'PER_CYCLE'),
      };
      var typeSelect, percentWrap = U.h('div'), timeWrap = U.h('div'), basisWrap = U.h('div');

      function drawTypeFields() {
        U.clear(percentWrap); U.clear(timeWrap); U.clear(basisWrap);
        percentWrap.style.display = state.valueType === 'PERCENT' ? '' : 'none';
        timeWrap.style.display = state.valueType === 'FIXED_TIME' ? '' : 'none';
        basisWrap.style.display = state.valueType === 'FIXED_TIME' ? '' : 'none';
        if (state.valueType === 'PERCENT') {
          percentWrap.appendChild(U.h('div', { class: 'flex items-center gap-1' },
            U.h('label', { class: 'field-label', for: 'alw-pct', text: 'مقدار درصدی' }),
            definition.defaultValueType === 'PERCENT' && definition.defaultValuePercent !== null
              ? UI.badge('پیشنهادی: ' + U.formatPercent(definition.defaultValuePercent), 'muted') : null));
          percentWrap.appendChild(UI.percentInput({
            value: state.percent,
            onChange: function (v) { state.percent = v; },
            ariaLabel: 'درصد الونس ' + definition.title,
          }));
        } else {
          timeWrap.appendChild(U.h('div', { class: 'flex items-center gap-1' },
            U.h('label', { class: 'field-label', text: 'مقدار زمان ثابت' }),
            definition.defaultValueType === 'FIXED_TIME' && definition.defaultTimeSeconds !== null
              ? UI.badge('پیشنهادی: ' + U.formatTimeValue(definition.defaultTimeSeconds) + ' ثانیه', 'muted') : null));
          var amountInput = UI.persianNumberInput({ value: state.seconds, decimals: true, min: 0, onChange: function (v) { state.seconds = v; }, ariaLabel: 'زمان ثابت الونس ' + definition.title });
          var unitSelect = UI.selectEl([{ value: 'sec', label: 'ثانیه' }, { value: 'min', label: 'دقیقه' }], state.unit, function (v) {
            if (state.seconds !== null && state.seconds !== undefined) state.seconds = v === 'min' ? state.seconds / 60 : state.seconds * 60;
            state.unit = v;
            var old = amountInput.parentNode;
            redrawAmount();
          });
          function redrawAmount() {
            U.clear(timeWrap);
            timeWrap.appendChild(U.h('div', { class: 'flex items-center gap-1' },
              U.h('label', { class: 'field-label', text: 'مقدار زمان ثابت' }),
              definition.defaultValueType === 'FIXED_TIME' && definition.defaultTimeSeconds !== null
                ? UI.badge('پیشنهادی: ' + U.formatTimeValue(definition.defaultTimeSeconds) + ' ثانیه', 'muted') : null));
            amountInput = UI.persianNumberInput({ value: state.seconds, decimals: true, min: 0, onChange: function (v) { state.seconds = v; }, ariaLabel: 'زمان ثابت الونس ' + definition.title });
            unitSelect = UI.selectEl([{ value: 'sec', label: 'ثانیه' }, { value: 'min', label: 'دقیقه' }], state.unit, function (v) {
              if (state.seconds !== null && state.seconds !== undefined) state.seconds = v === 'min' ? state.seconds / 60 : state.seconds * 60;
              state.unit = v;
              redrawAmount();
            });
            timeWrap.appendChild(U.h('div', { class: 'flex gap-2' }, U.h('div', { class: 'min-w-0 flex-1' }, amountInput), U.h('div', { class: 'w-24' }, unitSelect)));
            timeWrap.appendChild(basisWrap);
          }
          timeWrap.appendChild(U.h('div', { class: 'flex gap-2' }, U.h('div', { class: 'min-w-0 flex-1' }, amountInput), U.h('div', { class: 'w-24' }, unitSelect)));

          basisWrap.appendChild(U.h('div', { class: 'space-y-1.5 mt-2' },
            U.h('div', { class: 'flex items-center gap-1' }, U.h('label', { class: 'field-label', text: 'مبنای وقوع' }), UI.helpDot('مبنای وقوع زمان ثابت', BASIS_HELP)),
            UI.selectEl([
              { value: 'PER_ELEMENT_EXECUTION', label: 'به‌ازای هر اجرای عنصر' },
              { value: 'PER_CYCLE', label: 'یک‌بار در هر چرخه' },
            ], state.basis, function (v) { state.basis = v; }),
            state.basis === 'PER_ELEMENT_EXECUTION' && scopeType !== 'WORK_ELEMENT'
              ? U.h('p', { class: 'rounded-lg p-2 text-[11px] leading-5', style: { background: 'var(--amber-soft)', color: 'var(--amber)' }, text: 'زمان ثابت «هر اجرا» در سطح بالاتر از عنصر، نیازمند قاعده تجمیع مهندسی است؛ تا تعیین قاعده، در ST عناصر اعمال نمی‌شود (بی‌صدا حذف یا چندبار اعمال نمی‌شود).' })
              : null));
          timeWrap.appendChild(basisWrap);
        }
      }

      typeSelect = UI.selectEl([{ value: 'PERCENT', label: 'درصدی' }, { value: 'FIXED_TIME', label: 'زمان ثابت' }], state.valueType, function (v) {
        state.valueType = v;
        if (v === 'PERCENT') state.percent = current ? current.percentValue : definition.defaultValuePercent;
        else { state.seconds = current ? current.timeValueSeconds : definition.defaultTimeSeconds; state.unit = 'sec'; state.basis = current && current.applicationBasis ? current.applicationBasis : (scopeType === 'WORK_ELEMENT' ? 'PER_ELEMENT_EXECUTION' : 'PER_CYCLE'); }
        drawTypeFields();
      });

      var dlg = UI.dialog({
        title: (row ? 'جایگزینی مقدار' : 'افزودن الونس') + ' — «' + definition.title + '»',
        desc: 'در ' + (DB.getScopeAllowances(scopeType, scopeId).scope.label) + ' ثبت می‌شود؛ مقدار فعلی والد (در صورت وجود) جایگزین می‌شود.',
        bodyBuilder: function (body) {
          body.appendChild(U.h('div', { class: 'space-y-4' },
            UI.field('نوع مقدار', typeSelect),
            percentWrap, timeWrap,
            row && row.parentDecisionExists && row.parentMode === 'ACTIVE' && row.parentValue !== null && row.parentValue !== undefined
              ? U.h('p', { class: 'text-[11px] text-muted' },
                  'مقدار فعلی والد' + (row.parentScopeType && DB.CONST.ALLOWANCE_SCOPE_LABELS[row.parentScopeType] ? ' (' + DB.CONST.ALLOWANCE_SCOPE_LABELS[row.parentScopeType] + ')' : '') + ': ',
                  U.h('b', { class: 'num', text: formatParentValue(row) }))
              : null));
        },
        footerBuilder: function () {
          return U.h('div', { class: 'dialog-footer' },
            U.h('button', { class: 'btn btn-outline', type: 'button', onclick: function () { dlg.close(); } }, 'انصراف'),
            U.h('button', {
              class: 'btn btn-brand gap-1.5', type: 'button',
              onclick: function () {
                var op;
                if (state.valueType === 'PERCENT') {
                  if (state.percent === null || state.percent === undefined) { UI.toastError(new Error('مقدار درصدی الزامی است.')); return; }
                  op = { definitionId: definition.id, action: 'SET', valueType: 'PERCENT', percentValue: state.percent };
                } else {
                  var secs = state.seconds === null || state.seconds === undefined ? null : (state.unit === 'min' ? state.seconds * 60 : state.seconds);
                  if (secs === null) { UI.toastError(new Error('مقدار زمان ثابت الزامی است.')); return; }
                  op = { definitionId: definition.id, action: 'SET', valueType: 'FIXED_TIME', timeValueSeconds: Math.round(secs * 10000) / 10000, applicationBasis: state.basis };
                }
                runOp(op, row ? 'مقدار «' + definition.title + '» جایگزین شد' : 'الونس «' + definition.title + '» اضافه شد');
                dlg.close();
              },
            }, U.icon('check'), 'ذخیره'));
        },
      });
      drawTypeFields();
    }

    // تأیید حذف از ارث‌بری — نام الونس + زیرشاخه متأثر (§۶)
    function confirmExclude(row) {
      var data = DB.getScopeAllowances(scopeType, scopeId);
      var desc = 'این الونس در سطح ' + SCOPE_TITLES[scopeType] + ' از ارث‌بری حذف می‌شود و در تمام زیرشاخه‌های همین سطح غیرفعال خواهد بود. تعریف مرکزی حذف نمی‌شود.';
      var deps = {};
      if (data.descendants.activities > 0) deps['فعالیت'] = data.descendants.activities;
      if (data.descendants.elements > 0) deps['عنصر کاری'] = data.descendants.elements;
      UI.confirmDialog({
        title: 'حذف «' + row.title + '» از ارث‌بری',
        desc: desc,
        body: (data.descendants.activities > 0 || data.descendants.elements > 0)
          ? U.h('div', { class: 'rounded-xl p-3 text-xs', style: { background: 'var(--amber-soft)' } },
              U.h('p', { class: 'mb-1 font-bold', style: { color: 'var(--amber)' }, text: 'زیرشاخه‌های متأثر:' }),
              U.h('ul', { class: 'list-disc space-y-0.5 text-muted', style: { listStylePosition: 'inside' } },
                data.descendants.stations > 0 ? U.h('li', { class: 'num', text: data.descendants.stations.toLocaleString('fa-IR') + ' ایستگاه' }) : null,
                data.descendants.activities > 0 ? U.h('li', { class: 'num', text: data.descendants.activities.toLocaleString('fa-IR') + ' فعالیت' }) : null,
                data.descendants.elements > 0 ? U.h('li', { class: 'num', text: data.descendants.elements.toLocaleString('fa-IR') + ' عنصر کاری' }) : null))
          : null,
        cancelLabel: 'انصراف',
        confirmLabel: 'حذف از ارث‌بری',
        destructive: true,
      }).then(function (yes) {
        if (!yes) return;
        runOp({ definitionId: row.definitionId, action: 'EXCLUDE' }, '«' + row.title + '» از ارث‌بری حذف شد');
      });
    }

    // تغییر مبنای زمان ثابت (§۶)
    function openBasisDialog(row) {
      var current = row.applicationBasis || (scopeType === 'WORK_ELEMENT' ? 'PER_ELEMENT_EXECUTION' : 'PER_CYCLE');
      var sel = UI.selectEl([
        { value: 'PER_ELEMENT_EXECUTION', label: 'به‌ازای هر اجرای عنصر' },
        { value: 'PER_CYCLE', label: 'یک‌بار در هر چرخه' },
      ], current, function (v) {
        runOp({
          definitionId: row.definitionId, action: 'SET', valueType: 'FIXED_TIME',
          timeValueSeconds: row.timeValueSeconds || 0, applicationBasis: v,
        }, 'مبنای وقوع تغییر کرد');
        dlg.close();
      });
      var dlg = UI.dialog({
        title: 'تغییر مبنای «' + row.title + '»',
        desc: 'مبنای وقوع این زمان ثابت را انتخاب کنید.',
        bodyBuilder: function (body) { body.appendChild(UI.field('مبنای وقوع', sel)); },
        footerBuilder: function () {
          return U.h('div', { class: 'dialog-footer' },
            U.h('button', { class: 'btn btn-outline', type: 'button', onclick: function () { dlg.close(); } }, 'بستن'));
        },
      });
    }

    draw();
    return { redraw: draw };
  };
})(typeof window !== 'undefined' ? window : globalThis);
