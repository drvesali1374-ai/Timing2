/* ═══════════════════════════════════════════════════════════
   views-structure.js — نسخه آفلاین (V2)
   ۱) T2VIEWS.structure — ساختار تولید:
      درخت خط ← ایستگاه ← فعالیت با Drag & Drop + دکمه‌های بالا/پایین؛
      پنل جزئیات ایستگاه با ذخیره خودکار (debounce 800ms)؛
      ایجاد/ویرایش/حذف با شمارش وابستگی‌های واقعی.
   ۲) T2VIEWS.activity — صفحه اختصاصی فعالیت (چهارزبانه):
      مشخصات (+ مجازهای مؤثر با بازنویسی debounce 600ms)،
      عناصر کاری، زمان‌سنجی و تحلیل نتایج (واگذار به ماژول‌های دیگر).
   ═══════════════════════════════════════════════════════════ */
(function (g) {
  'use strict';
  // توجه: T2APP بعد از نماها بارگذاری می‌شود — دسترسی تنبل (lazy) الزامی است
  var U = g.T2U, DB = g.T2DB, UI = g.T2UI;
  g.T2VIEWS = g.T2VIEWS || {};

  function appNavigate(hash) { if (g.T2APP) g.T2APP.navigate(hash); }
  function appRefresh() { if (g.T2APP) g.T2APP.refresh(); }

  // ── وضعیت پایدار بین رندرها ──
  var _selectedStation = {}; // projectId -> stationId | null
  var _stationOpen = {};     // stationId -> bool (پیش‌فرض: باز)
  var _activityTab = {};     // activityId -> 'info' | 'elements' | 'timing' | 'analysis'
  var _drag = null;          // درگ جاری: { type, id, scope }

  // ═══════════ محتوای راهنمای آیکونی (عیناً از مشخصات V2) ═══════════
  var LINE_HELP = {
    what: 'هر پروژه مطالعه زمان‌سنجی دقیقاً یک خط تولید و یک محصول را پوشش می‌دهد؛ ساختار داده از خط آغاز می‌شود: خط ← ایستگاه ← فعالیت ← عنصر کاری ← مشاهده.',
    input: 'نام خط و محصول در مرحله «مشخصات پروژه» وارد و ویرایش می‌شود.',
    example: 'خط مونتاژ ماشین لباسشویی — مدل X-۲۰۰',
    note: 'ترکیب چند خط یا چند محصول در یک پروژه، مقایسه‌پذیری زمان‌های استاندارد را از بین می‌برد؛ برای هر خط/محصول پروژه‌ای جدا بسازید.',
  };
  var STATION_NAME_HELP = {
    what: 'ایستگاه بخشی مشخص از خط تولید است که کار در آن انجام می‌شود؛ فعالیت‌های زمان‌سنجی زیر ایستگاه تعریف می‌شوند.',
    input: 'نام ایستگاه را مطابق نقشه خط یا استقرار فیزیکی وارد کنید.',
    example: '«ایستگاه برش ورق» یا «میز مونتاژ شماره ۳»',
    note: 'حذف ایستگاه همه فعالیت‌ها، عناصر کاری، جلسات و مشاهدات زیرمجموعه را دائمی حذف می‌کند. ترتیب ایستگاه‌ها با کشیدن‌ورها کردن (Drag & Drop) تغییر می‌کند.',
  };
  var ACTIVITY_NAME_HELP = {
    what: 'فعالیت کار قابل‌تعریف و مستقلی در ایستگاه است که از عناصر کاری تشکیل می‌شود و صفحه اختصاصی چهارزبانه دارد: مشخصات، عناصر کاری، زمان‌سنجی و تحلیل نتایج.',
    input: 'نامی کوتاه و گویا؛ ترجیحاً فعل + مفعول.',
    example: '«بستن درب پنل» یا «کنترل کیفیت نهایی»',
    note: 'نوع رویداد فرایندی فعالیت در نمودارهای فرایند (فاز ۵) با نماد ASCME نمایش داده می‌شود.',
  };
  var GROUP_ASSIGN_HELP = {
    what: 'گروه مجازها مجموعه‌ای از درصدهای مجاز (مانند نیازهای شخصی و خستگی) است که فعالیت‌های مشابه مقادیر آن را به ارث می‌برند.',
    input: 'گروه مناسب ماهیت فعالیت را انتخاب کنید یا «بدون گروه» بگذارید.',
    example: '«کار دستی سبک»، «کار ماشینی سنگین»',
    note: 'بدون گروه، هیچ مجازی برای فعالیت اعمال نمی‌شود؛ در صفحه فعالیت می‌توانید مقدار هر دسته را بازنویسی کنید.',
  };
  var TARGET_SAMPLE_HELP = {
    what: 'تعداد نمونه هدف (تعداد چرخه‌هایی که باید از این فعالیت زمان‌گیری شود) در سطح کل فعالیت تعیین می‌شود، نه جداگانه برای هر اپراتور.',
    input: 'عدد صحیح بزرگ‌تر یا مساوی ۱؛ خالی بگذارید تا هدفی تعیین نشده باشد.',
    example: 'مثلاً ۱۵ چرخه برای کل فعالیت — هر اپراتور سهم خود را از همین هدف ثبت می‌کند.',
    note: 'رسیدن به هدف صرفاً به معنای ثبت تعداد هدف است و معادل اثبات کفایت آماری نیست؛ شاخص‌های پراکندگی و عدم‌قطعیت در مرحله «تحلیل نتایج» نمایش داده می‌شوند.',
  };
  var ALLOWANCES_HELP = {
    what: 'مقدار نهایی هر دسته مجاز برای این فعالیت: مقدار گروه به ارث می‌رسد مگر آنکه در ستون «بازنویسی اختصاصی» مقدار دیگری ثبت شود. منبع هر مقدار مشخص است.',
    input: 'ستون بازنویسی را فقط برای دسته‌هایی که باید با گروه تفاوت داشته باشند پر کنید؛ خالی بگذارید تا مقدار گروه اعمال شود.',
    example: 'استراحت شخصی ۵٪ + نیازهای طبیعی ۳٪ ⇒ A=۸٪؛ صرفاً مثال است و نرخ مصوب شرکت نیست.',
    note: 'مجموع A فقط از دسته‌های فعال ساخته می‌شود؛ روش اعمال (درصد از زمان نرمال یا سهم از زمان استاندارد) در سطح پروژه انتخاب می‌شود.',
  };
  var ELEMENT_NAME_HELP = {
    what: 'عنصر کاری کوچک‌ترین واحد قابل‌اندازه‌گیری فعالیت است؛ شناسه آن پایدار است و تغییر نام، ارتباط تاریخی و گره‌های نموداری را از بین نمی‌برد.',
    input: 'نامی کوتاه برای بخشی از کار که در یک حرکت اجرا می‌شود.',
    example: '«برداشتن قطعه از گراناق» یا «بستن چهار پیچ»',
    note: 'عناصر با کشیدن‌ورها کردن مرتب می‌شوند؛ ترتیب همان ترتیب اجرای کار در چرخه است.',
  };
  var ELEMENT_TYPE_HELP = {
    what: 'نوع عنصر تعیین می‌کند زمان آن چگونه در محاسبات رفتار می‌کند: دستی، خودکار ماشین، انتظار، یا هم‌زمان/دارای هم‌پوشانی.',
    input: 'ماهیت غالب عنصر را انتخاب کنید؛ پیش‌فرض «دستی» است.',
    example: '«پرس اتوماتیک» → خودکار ماشین؛ «انتظار برای خشک‌شدن رنگ» → انتظار.',
    note: 'عنصر هم‌زمان/دارای هم‌پوشانی برای کار هم‌زمان اپراتور و ماشین است؛ با بازه شروع/پایان ثبت می‌شود (فاز ۳) و زمان سپری‌شده چرخه از گستره بازه‌ها محاسبه می‌شود نه جمع مدت‌ها.',
  };

  // ═══════════ استایل‌های اختصاصی این نما (تزریق یک‌باره) ═══════════
  // اندازه پایه آیکون‌ها اکنون در app.css (قرارداد سراسری svg.icon) است.
  function ensureStyle() {
    if (document.getElementById('t2-structure-v2-style')) return;
    var style = document.createElement('style');
    style.id = 't2-structure-v2-style';
    style.textContent = [
      // چیدمان دوستونه دسکتاپ (مکمل کلاس lg:flex-row که در app.css تعریف نشده)
      '@media (min-width: 1024px) {',
      '  .t2-two-col { flex-direction: row; }',
      '  .t2-tree-col { width: 20rem; }',
      '}',
      // تورفتگی فهرست فعالیت‌ها زیر ایستگاه (در RTL از لبه آغازین)
      '.t2-indent { margin-inline-start: 16px; }',
      // ایستگاه انتخاب‌شده در درخت
      '.t2-row-selected { border-color: var(--brand); background: color-mix(in srgb, var(--brand-soft) 30%, transparent); }',
      // ردیف جمع A در انتهای جدول مجازها
      'table.table tfoot td { border-top: 2px solid var(--border); border-bottom: none; background: color-mix(in srgb, var(--surface-2) 70%, transparent); }',
      // دکمه پیوندی مسیر (breadcrumb)
      '.t2-link-btn { border: none; background: none; padding: 0; cursor: pointer; color: var(--brand); font-family: inherit; font-size: inherit; text-decoration: underline; text-underline-offset: 3px; }',
    ].join('\n');
    document.head.appendChild(style);
  }

  // ═══════════ کمکی‌های عمومی ═══════════
  function spacer() { return U.h('div', { class: 'flex-1' }); }

  function numBadge(text, variant) {
    return U.h('span', { class: 'badge ' + (variant || 'muted') + ' num shrink-0', text: text });
  }

  /** کاشی نماد نوع رویداد فرایندی (ASCME) */
  function symbolTile(processType, title) {
    return U.h('span', {
      class: 'shrink-0 num',
      style: {
        width: '26px', height: '26px', background: 'var(--surface-3)',
        borderRadius: 'calc(var(--radius) - 4px)', fontWeight: '800', fontSize: '13px',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      },
      title: title,
      text: DB.CONST.PROCESS_TYPE_SYMBOLS[processType] || '○',
    });
  }

  function dragHandleEl() {
    return U.h('span', {
      class: 'drag-handle shrink-0', title: 'جابه‌جایی',
      onclick: function (e) { e.stopPropagation(); },
    }, U.icon('gripVertical'));
  }

  /** دکمه‌های جابه‌جایی بالا/پایین — فقط دسکتاپ (در موبایل درگ فعال است؛ هم‌ارز نسخه اصلی که فقط DnD دارد) */
  function upDownButtons(canUp, canDown, onUp, onDown) {
    return [
      U.h('button', {
        class: 'icon-btn sm shrink-0 hidden sm:inline-flex', type: 'button',
        disabled: canUp ? null : true,
        'aria-label': 'جابه‌جایی بالا', title: 'جابه‌جایی بالا',
        onclick: function (e) { e.stopPropagation(); onUp(); },
      }, U.icon('chevronUp')),
      U.h('button', {
        class: 'icon-btn sm shrink-0 hidden sm:inline-flex', type: 'button',
        disabled: canDown ? null : true,
        'aria-label': 'جابه‌جایی پایین', title: 'جابه‌جایی پایین',
        onclick: function (e) { e.stopPropagation(); onDown(); },
      }, U.icon('chevronDown')),
    ];
  }

  /** جابه‌جایی یک شناسه با همسایه بالا/پایین (برای دکمه‌های بالا/پایین) */
  function swapIds(ids, id, delta) {
    var i = ids.indexOf(id), j = i + delta;
    if (i < 0 || j < 0 || j >= ids.length) return null;
    var t = ids[i]; ids[i] = ids[j]; ids[j] = t;
    return ids;
  }

  /** انتقال آیتم درگ‌شده به «قبل از» آیتم هدف (برای Drop) */
  function moveBefore(ids, fromId, toId) {
    var from = ids.indexOf(fromId), to = ids.indexOf(toId);
    if (from < 0 || to < 0 || from === to) return null;
    var item = ids.splice(from, 1)[0];
    ids.splice(from < to ? to - 1 : to, 0, item);
    return ids;
  }

  /** فعال‌سازی Drag & Drop روی یک ردیف با هایلایت drop-target */
  function makeSortable(row, type, id, scope, onReorder) {
    row.setAttribute('draggable', 'true');
    row.addEventListener('dragstart', function (e) {
      _drag = { type: type, id: id, scope: scope };
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        try { e.dataTransfer.setData('text/plain', id); } catch (err) {}
      }
    });
    row.addEventListener('dragend', function () {
      _drag = null;
      row.classList.remove('drop-target');
    });
    row.addEventListener('dragover', function (e) {
      if (!_drag || _drag.type !== type || _drag.scope !== scope || _drag.id === id) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      row.classList.add('drop-target');
    });
    row.addEventListener('dragleave', function (e) {
      if (!e.relatedTarget || !row.contains(e.relatedTarget)) row.classList.remove('drop-target');
    });
    row.addEventListener('drop', function (e) {
      e.preventDefault();
      row.classList.remove('drop-target');
      if (!_drag || _drag.type !== type || _drag.scope !== scope || _drag.id === id) return;
      var fromId = _drag.id;
      _drag = null;
      onReorder(fromId, id);
    });
  }

  // ═══════════ شمارش وابستگی‌ها پیش از حذف (هم‌کلید با پیش‌نمایش DB) ═══════════
  function stationDeps(stationId) {
    var st = DB.getState();
    var acts = DB.sortActivities(stationId);
    var els = 0, sessions = 0;
    acts.forEach(function (a) {
      els += DB.sortElements(a.id).length;
      sessions += st.studySessions.filter(function (s) { return s.activityId === a.id; }).length;
    });
    return { 'فعالیت': acts.length, 'عنصر کاری': els, 'جلسه زمان‌سنجی': sessions };
  }
  function activityDeps(activityId) {
    var st = DB.getState();
    return {
      'عنصر کاری': DB.sortElements(activityId).length,
      'جلسه زمان‌سنجی': st.studySessions.filter(function (s) { return s.activityId === activityId; }).length,
    };
  }
  function elementDeps(elementId) {
    var st = DB.getState();
    return {
      'مشاهده': st.elementObservations.filter(function (o) { return o.workElementId === elementId; }).length,
      'ارزیابی وستینگهاوس این عنصر': st.ratingAssessments.filter(function (r) { return r.workElementId === elementId; }).length,
    };
  }

  /** توضیح شمارش داده‌های حذف‌شده برای toast */
  function depsText(deps) {
    return Object.keys(deps || {}).map(function (k) {
      return k + ': ' + U.formatInt(deps[k]);
    }).join('، ');
  }

  // ═══════════ دورزین خطای هسته (db.js — cascadeDelete) ═══════════
  // در cascadeDelete، فهرست workElements با کلید «activityId» و فهرست activities
  // با کلید «stationId» فیلتر می‌شوند (نه با id خود رکورد). در نتیجه:
  //   • DB.deleteElement(id) مشاهدات/ارزیابی‌های عنصر را حذف می‌کند اما خودِ عنصر باقی می‌ماند؛
  //   • DB.deleteActivity(id) عناصر/جلسات فعالیت را حذف می‌کند اما خودِ فعالیت باقی می‌ماند.
  // هسته قابل ویرایش نیست؛ پس پس از فراخوانی هسته، رکورد یتیم‌مانده را محلی
  // حذف و با یک «بازچینش بدون تغییر» روی خواهران، وضعیت را commit می‌کنیم
  // (reorderActivities/reorderElements همان commit + علامت‌گذاری محاسبه را انجام می‌دهند).
  function purgeOrphanRow(table, id) {
    var arr = DB.getState()[table];
    for (var i = 0; i < arr.length; i++) {
      if (arr[i].id === id) { arr.splice(i, 1); return true; }
    }
    return false;
  }
  function purgeDeletedElement(e) {
    if (purgeOrphanRow('workElements', e.id)) {
      DB.reorderElements(e.activityId, DB.sortElements(e.activityId).map(function (x) { return x.id; }));
    }
  }
  function purgeDeletedActivity(a) {
    if (purgeOrphanRow('activities', a.id)) {
      DB.reorderActivities(a.stationId, DB.sortActivities(a.stationId).map(function (x) { return x.id; }));
    }
  }

  function processLabelOf(pt) { return DB.CONST.PROCESS_TYPE_LABELS[pt] || pt; }
  function processSymbolOf(pt) { return DB.CONST.PROCESS_TYPE_SYMBOLS[pt] || '○'; }

  function processTypeOptions() {
    return DB.CONST.PROCESS_TYPES.map(function (pt) {
      return { value: pt, label: processSymbolOf(pt) + ' ' + processLabelOf(pt) };
    });
  }
  function groupOptions(projectId) {
    return [{ value: '', label: 'بدون گروه' }].concat(DB.listGroups(projectId).map(function (g) {
      return { value: g.group.id, label: g.group.name };
    }));
  }

  function selectStation(projectId, stationId) {
    _selectedStation[projectId] = stationId;
    appRefresh();
  }

  // ═══════════════════════════════════════════════════════════
  // ۱) نمای ساختار تولید — T2VIEWS.structure
  // ═══════════════════════════════════════════════════════════
  g.T2VIEWS.structure = function (container, projectId) {
    ensureStyle();
    U.clear(container);
    var project = DB.getProject(projectId);
    if (!project) {
      container.appendChild(UI.emptyState({ title: 'پروژه یافت نشد', desc: 'این پروژه حذف شده یا شناسه آن نامعتبر است.', icon: 'package' }));
      return;
    }
    var stations = DB.sortStations(projectId);

    // پاک‌سازی انتخاب نامعتبر
    var sel = _selectedStation[projectId] || null;
    if (sel && !stations.some(function (s) { return s.id === sel; })) {
      sel = null;
      _selectedStation[projectId] = null;
    }

    var groupMap = {};
    DB.listGroups(projectId).forEach(function (g) { groupMap[g.group.id] = g.group; });

    var totalActs = 0, totalEls = 0;
    stations.forEach(function (s) {
      var acts = DB.sortActivities(s.id);
      totalActs += acts.length;
      acts.forEach(function (a) { totalEls += DB.sortElements(a.id).length; });
    });

    var ctx = { projectId: projectId, project: project, selectedId: sel, groupMap: groupMap };

    // ── سربرگ ──
    container.appendChild(U.h('div', { class: 'flex flex-wrap items-center gap-3' },
      U.h('span', { class: 'chip-icon' }, U.icon('listTree')),
      U.h('div', null,
        U.h('h1', { class: 'text-xl font-extrabold', text: 'ساختار تولید' }),
        U.h('p', { class: 'text-sm text-muted num', text: U.formatInt(stations.length) + ' ایستگاه · ' + U.formatInt(totalActs) + ' فعالیت · ' + U.formatInt(totalEls) + ' عنصر کاری' }))));

    // ── بدنه: درخت + جزئیات ──
    var treeCol = U.h('div', { class: 'w-full lg:w-80 shrink-0 t2-tree-col' }, buildTreeCard(ctx, stations));
    var detailsCol = U.h('div', { class: 'flex-1 min-w-0 w-full' });

    if (!sel) {
      detailsCol.appendChild(UI.emptyState({
        title: 'ایستگاهی را از درخت انتخاب کنید',
        icon: 'factory',
        actionLabel: stations.length ? 'انتخاب اولین ایستگاه' : 'ایستگاه جدید',
        onAction: function () {
          if (stations.length) selectStation(projectId, stations[0].id);
          else openStationCreate(ctx);
        },
      }));
    } else {
      var st = stations.find(function (s) { return s.id === sel; });
      detailsCol.appendChild(stationDetailsCard(st, ctx));
    }

    container.appendChild(U.h('div', { class: 'flex flex-col lg:flex-row gap-4 items-start t2-two-col' }, treeCol, detailsCol));
  };

  // ── کارت درخت ساختار ──
  function buildTreeCard(ctx, stations) {
    var project = ctx.project;
    var card = U.h('div', { class: 'card p-3' });

    // ریشه درخت: خط تولید — یک خط، یک محصول
    card.appendChild(U.h('div', { class: 'flex flex-wrap items-center gap-2' },
      U.h('span', { class: 'chip-icon' }, U.icon('factory')),
      U.h('div', { class: 'flex-1 min-w-0' },
        U.h('p', { class: 'font-bold text-sm truncate', title: project.lineName || undefined, text: project.lineName || 'خط تولید' }),
        U.h('p', { class: 'text-xs text-muted truncate', title: project.productName || undefined, text: 'محصول: ' + (project.productName || '—') })),
      UI.helpDot('خط تولید و محصول', LINE_HELP),
      UI.badge('یک خط — یک محصول', 'brand')));

    // فهرست ایستگاه‌ها — قابل مرتب‌سازی با Drag & Drop
    var listWrap = U.h('div', { class: 'flex flex-col gap-2 mt-3' });
    if (!stations.length) {
      listWrap.appendChild(U.h('p', { class: 'text-sm text-muted', text: 'هنوز ایستگاهی ثبت نشده است.' }));
    } else {
      stations.forEach(function (st, i) { listWrap.appendChild(stationNode(st, i, stations, ctx)); });
    }
    card.appendChild(listWrap);

    // پانوشت درخت: افزودن ایستگاه جدید
    card.appendChild(U.h('div', { class: 'mt-3' },
      U.h('button', {
        class: 'btn btn-outline w-full', type: 'button',
        onclick: function () { openStationCreate(ctx); },
      }, U.icon('plus'), 'ایستگاه جدید')));
    return card;
  }

  // ── گره ایستگاه در درخت (قابل درگ + کلیک = انتخاب و باز/بسته) ──
  function stationNode(st, index, stations, ctx) {
    var isOpen = _stationOpen[st.id] !== false;
    var acts = DB.sortActivities(st.id);
    var isSelected = ctx.selectedId === st.id;

    function move(delta) {
      var ids = stations.map(function (s) { return s.id; });
      ids = swapIds(ids, st.id, delta);
      if (!ids) return;
      DB.reorderStations(ctx.projectId, ids);
      appRefresh();
    }

    var row = U.h('div', { class: 'list-row' + (isSelected ? ' t2-row-selected' : ''), style: { position: 'relative' } },
      dragHandleEl(),
      U.h('button', {
        class: 'icon-btn sm shrink-0', type: 'button',
        'aria-label': (isOpen ? 'بستن فعالیت‌های ' : 'باز کردن فعالیت‌های ') + st.name, title: isOpen ? 'بستن فعالیت‌ها' : 'باز کردن فعالیت‌ها',
        onclick: function (e) { e.stopPropagation(); _stationOpen[st.id] = !isOpen; appRefresh(); },
      }, U.icon('chevronDown', isOpen ? '' : 'rot-n90')),
      U.h('button', {
        type: 'button',
        class: 'flex min-w-0 flex-1 items-center gap-2 text-right',
        style: { padding: '8px 6px', border: 'none', background: 'transparent', cursor: 'pointer', color: 'inherit', fontFamily: 'inherit' },
        'aria-current': isSelected ? 'true' : null,
        onclick: function (e) { e.stopPropagation(); _selectedStation[ctx.projectId] = st.id; appRefresh(); },
      },
        U.h('span', { class: 'num text-xs text-faint shrink-0', style: { width: '16px', textAlign: 'center' }, text: U.formatInt(index + 1) }),
        U.h('span', { class: 'shrink-0 text-brand' }, U.icon('warehouse')),
        U.h('span', { class: 'font-bold text-sm truncate', 'data-station-name': st.id, text: st.name })),
      numBadge(U.formatInt(acts.length) + ' فعالیت', 'muted'),
      U.h('button', {
        class: 'icon-btn sm shrink-0', type: 'button',
        'aria-label': 'ویرایش ایستگاه ' + st.name, title: 'ویرایش ایستگاه',
        onclick: function (e) { e.stopPropagation(); openStationEditDialog(st); },
      }, U.icon('pencil')),
      U.h('button', {
        class: 'icon-btn sm danger shrink-0', type: 'button',
        'aria-label': 'حذف ایستگاه ' + st.name, title: 'حذف ایستگاه',
        onclick: function (e) { e.stopPropagation(); confirmDeleteStation(st, ctx); },
      }, U.icon('trash')));

    // کلیک روی ردیف (نه دکمه‌ها) → انتخاب ایستگاه + باز/بسته شدن فهرست فعالیت‌ها
    row.addEventListener('click', function (e) {
      if (e.target.closest('button')) return;
      _selectedStation[ctx.projectId] = st.id;
      _stationOpen[st.id] = !isOpen;
      appRefresh();
    });

    var node = U.h('div', null, row);
    if (isOpen) {
      node.appendChild(U.h('div', { class: 'me-4 t2-indent flex flex-col gap-1 mt-1' }, activitiesSubList(st, acts, ctx)));
    }
    makeSortable(row, 'station', st.id, ctx.projectId, function (fromId, toId) {
      var ids = stations.map(function (s) { return s.id; });
      ids = moveBefore(ids, fromId, toId);
      if (!ids) return;
      DB.reorderStations(ctx.projectId, ids);
      appRefresh();
    });
    return node;
  }

  // ── فهرست فعالیت‌های یک ایستگاه (زیر گره باز شده) ──
  function activitiesSubList(station, acts, ctx) {
    var wrap = [];
    if (!acts.length) {
      wrap.push(U.h('p', { class: 'text-xs text-faint text-center', text: 'فعالیتی ثبت نشده است' }));
    } else {
      acts.forEach(function (a, ai) { wrap.push(activityTreeRow(a, ai, acts, station, ctx)); });
    }
    wrap.push(U.h('button', {
      class: 'btn btn-ghost btn-sm w-full', type: 'button',
      onclick: function (e) { e.stopPropagation(); openActivityDialog(ctx, station, null); },
    }, U.icon('plus'), 'فعالیت جدید'));
    return wrap;
  }

  // ── ردیف فعالیت در درخت (قابل درگ) ──
  function activityTreeRow(a, index, acts, station, ctx) {
    var group = ctx.groupMap[a.groupId];
    var elsCount = DB.sortElements(a.id).length;
    var label = processLabelOf(a.processType);

    function move(delta) {
      var ids = acts.map(function (x) { return x.id; });
      ids = swapIds(ids, a.id, delta);
      if (!ids) return;
      DB.reorderActivities(station.id, ids);
      appRefresh();
    }

    var row = U.h('div', { class: 'list-row', style: { position: 'relative', padding: '6px 8px' } },
      dragHandleEl(),
      U.h('button', {
        type: 'button',
        class: 'flex min-w-0 flex-1 items-center gap-2 text-right',
        style: { padding: '6px 8px', border: 'none', background: 'transparent', cursor: 'pointer', color: 'inherit', fontFamily: 'inherit' },
        'aria-label': 'باز کردن صفحه فعالیت ' + a.name,
        onclick: function (e) { e.stopPropagation(); appNavigate('/p/' + ctx.projectId + '/activity/' + a.id); },
      },
        U.h('span', { class: 'num text-xs text-faint shrink-0', style: { width: '14px', textAlign: 'center' }, text: U.formatInt(index + 1) }),
        symbolTile(a.processType, 'نوع رویداد فرایندی: ' + label),
        U.h('span', { class: 'text-sm font-medium flex-1 truncate', text: a.name }),
        group ? U.h('span', { class: 'badge cyan shrink-0 truncate', title: 'گروه مجازها: ' + group.name, style: { maxWidth: '96px' }, text: group.name }) : null,
        U.h('span', { class: 'text-xs text-faint num shrink-0', text: U.formatInt(elsCount) + ' عنصر' })),
      U.h('button', {
        class: 'icon-btn sm shrink-0', type: 'button',
        'aria-label': 'ویرایش فعالیت ' + a.name, title: 'ویرایش فعالیت',
        onclick: function (e) { e.stopPropagation(); openActivityDialog(ctx, station, a); },
      }, U.icon('pencil')),
      U.h('button', {
        class: 'icon-btn sm danger shrink-0', type: 'button',
        'aria-label': 'حذف فعالیت ' + a.name, title: 'حذف فعالیت',
        onclick: function (e) { e.stopPropagation(); confirmDeleteActivity(a, ctx, false); },
      }, U.icon('trash')));

    makeSortable(row, 'activity', a.id, station.id, function (fromId, toId) {
      var ids = acts.map(function (x) { return x.id; });
      ids = moveBefore(ids, fromId, toId);
      if (!ids) return;
      DB.reorderActivities(station.id, ids);
      appRefresh();
    });
    return row;
  }

  // ── پنل جزئیات ایستگاه — فرم با ذخیره خودکار (debounce 800ms) ──
  function stationDetailsCard(st, ctx) {
    var acts = DB.sortActivities(st.id);

    var indWrap = U.h('span', { class: 'shrink-0' });
    var footerEl = U.h('p', { class: 'text-xs text-muted num mt-3' });

    var nameInput = U.h('input', { class: 'input', value: st.name, placeholder: 'مثلاً: ایستگاه برش ورق', 'aria-label': 'نام ایستگاه' });
    var descInput = U.h('textarea', { class: 'textarea', value: st.description || '', placeholder: 'مثلاً: برش ورق گالوانیزه با گیوتین ۳ متری', 'aria-label': 'شرح ایستگاه' });

    var timer = null;
    function setInd(state) { U.clear(indWrap); if (state) indWrap.appendChild(UI.saveIndicator(state)); }
    function renderFooter() {
      var fresh = DB.getStation(st.id) || st;
      footerEl.textContent = 'ایجاد: ' + U.formatDateTime(fresh.createdAt) + ' · آخرین تغییر: ' + U.formatDateTime(fresh.updatedAt);
    }
    function syncNameInPlace(name) {
      U.$$('[data-station-name="' + st.id + '"]').forEach(function (n) { n.textContent = name; });
      var h2 = U.$('[data-details-title="' + st.id + '"]');
      if (h2) h2.textContent = name;
    }
    function queueSave() {
      setInd('dirty');
      if (timer) clearTimeout(timer);
      timer = setTimeout(function () {
        var name = nameInput.value.trim();
        if (!name) { setInd('error'); return; }
        setInd('saving');
        try {
          DB.updateStation(st.id, { name: name, description: descInput.value.trim() || null });
          setInd('saved');
          renderFooter();
          syncNameInPlace(name);
          setTimeout(function () { setInd(null); }, 1800);
        } catch (err) {
          setInd('error');
          UI.toastError(err);
        }
      }, 800);
    }
    nameInput.addEventListener('input', queueSave);
    descInput.addEventListener('input', queueSave);
    renderFooter();

    var card = U.h('section', { class: 'card p-4', 'aria-label': 'جزئیات ایستگاه ' + st.name },
      U.h('div', { class: 'flex flex-wrap items-center gap-2' },
        U.h('span', { class: 'chip-icon' }, U.icon('warehouse')),
        U.h('h2', { class: 'font-bold text-lg truncate', 'data-details-title': st.id, text: st.name }),
        spacer(),
        indWrap,
        U.h('button', {
          class: 'icon-btn shrink-0', type: 'button',
          'aria-label': 'ویرایش ایستگاه ' + st.name, title: 'ویرایش ایستگاه',
          onclick: function () { openStationEditDialog(st); },
        }, U.icon('pencil')),
        U.h('button', {
          class: 'icon-btn danger shrink-0', type: 'button',
          'aria-label': 'حذف ایستگاه ' + st.name, title: 'حذف ایستگاه',
          onclick: function () { confirmDeleteStation(st, ctx); },
        }, U.icon('trash'))),
      U.h('div', { class: 'flex flex-col gap-3 mt-4' },
        UI.field('نام ایستگاه', nameInput, STATION_NAME_HELP),
        UI.field('شرح ایستگاه (اختیاری)', descInput)),
      footerEl);

    // ── فعالیت‌های ایستگاه — کارت‌های کلیک‌شو به صفحه اختصاصی ──
    var actsCard = U.h('section', { class: 'card p-4 mt-4', 'aria-label': 'فعالیت‌های این ایستگاه' },
      U.h('div', { class: 'flex flex-wrap items-center gap-2' },
        U.h('span', { class: 'chip-icon' }, U.icon('listTree')),
        U.h('h2', { class: 'font-bold', text: 'فعالیت‌های این ایستگاه' }),
        numBadge(U.formatInt(acts.length), 'muted'),
        spacer(),
        U.h('button', {
          class: 'btn btn-brand btn-sm', type: 'button',
          onclick: function () { openActivityDialog(ctx, st, null); },
        }, U.icon('plus'), 'فعالیت جدید')));

    if (!acts.length) {
      actsCard.appendChild(U.h('div', { class: 'mt-3 flex flex-col items-start gap-2' },
        U.h('p', { class: 'text-sm text-muted', text: 'فعالیتی برای این ایستگاه ثبت نشده است' }),
        U.h('button', {
          class: 'btn btn-ghost btn-sm', type: 'button',
          onclick: function () { openActivityDialog(ctx, st, null); },
        }, U.icon('plus'), 'ثبت اولین فعالیت')));
    } else {
      var grid = U.h('div', { class: 'grid sm:grid-cols-2 gap-3 mt-3' });
      acts.forEach(function (a) {
        var group = ctx.groupMap[a.groupId];
        grid.appendChild(U.h('button', {
          class: 'card card-premium card-hover p-3', type: 'button',
          style: { textAlign: 'start', width: '100%' },
          'aria-label': 'باز کردن صفحه فعالیت ' + a.name,
          onclick: function () { appNavigate('/p/' + ctx.projectId + '/activity/' + a.id); },
        },
          symbolTile(a.processType, 'نوع رویداد فرایندی: ' + processLabelOf(a.processType)),
          U.h('span', { class: 'min-w-0 flex-1' },
            U.h('span', { class: 'block truncate font-semibold text-sm', text: a.name }),
            U.h('span', { class: 'block truncate text-xs text-muted num mt-1', text: U.formatInt(DB.sortElements(a.id).length) + ' عنصر کاری · ' + (group ? 'گروه ' + group.name : 'بدون گروه') })),
          U.h('span', { class: 'text-faint shrink-0' }, U.icon('arrowLeft'))));
      });
      actsCard.appendChild(grid);
    }

    return U.h('div', { class: 'flex flex-col gap-4' }, card, actsCard);
  }

  // ═══════════ دیالوگ‌ها و جریان حذف — ساختار ═══════════
  function openStationCreate(ctx) {
    var nameInput = U.h('input', { class: 'input', placeholder: 'مثلاً: ایستگاه برش ورق' });
    var descInput = U.h('textarea', { class: 'textarea', placeholder: 'مثلاً: برش ورق گالوانیزه با گیوتین ۳ متری' });
    UI.dialog({
      title: 'ایستگاه جدید',
      desc: 'ایستگاه در انتهای فهرست افزوده می‌شود و با کشیدن‌ورها کردن قابل جابه‌جایی است.',
      bodyBuilder: function (body) {
        body.appendChild(UI.field('نام ایستگاه', nameInput));
        body.appendChild(UI.field('شرح ایستگاه (اختیاری)', descInput));
      },
      footerBuilder: function (close) {
        return U.h('div', { class: 'dialog-footer' },
          U.h('button', { class: 'btn', type: 'button', text: 'انصراف', onclick: close }),
          U.h('div', { class: 'spacer' }),
          U.h('button', {
            class: 'btn btn-brand', type: 'button',
            onclick: function () {
              var name = nameInput.value.trim();
              if (!name) { UI.toast('نام ایستگاه الزامی است', { type: 'error' }); return; }
              try {
                var st = DB.createStation(ctx.projectId, { name: name, description: descInput.value.trim() || null });
                _selectedStation[ctx.projectId] = st.id;
                close();
                UI.toast('ایستگاه ثبت شد');
                appRefresh();
              } catch (err) { UI.toastError(err); }
            },
          }, U.icon('plus'), 'ثبت ایستگاه'));
      },
    });
  }

  function openStationEditDialog(st) {
    var nameInput = U.h('input', { class: 'input', value: st.name, placeholder: 'مثلاً: ایستگاه برش ورق' });
    var descInput = U.h('textarea', { class: 'textarea', value: st.description || '', placeholder: 'مثلاً: برش ورق گالوانیزه با گیوتین ۳ متری' });
    UI.dialog({
      title: 'ویرایش ایستگاه',
      bodyBuilder: function (body) {
        body.appendChild(UI.field('نام ایستگاه', nameInput));
        body.appendChild(UI.field('شرح ایستگاه (اختیاری)', descInput));
      },
      footerBuilder: function (close) {
        return U.h('div', { class: 'dialog-footer' },
          U.h('button', { class: 'btn', type: 'button', text: 'انصراف', onclick: close }),
          U.h('div', { class: 'spacer' }),
          U.h('button', {
            class: 'btn btn-brand', type: 'button',
            onclick: function () {
              var name = nameInput.value.trim();
              if (!name) { UI.toast('نام ایستگاه الزامی است', { type: 'error' }); return; }
              try {
                DB.updateStation(st.id, { name: name, description: descInput.value.trim() || null });
                close();
                UI.toast('ایستگاه به‌روزرسانی شد');
                appRefresh();
              } catch (err) { UI.toastError(err); }
            },
          }, 'ذخیره'));
      },
    });
  }

  function openActivityDialog(ctx, station, activity) {
    var isEdit = !!activity;
    var nameInput = U.h('input', { class: 'input', value: isEdit ? activity.name : '', placeholder: 'مثلاً: بستن درب پنل' });
    var descInput = U.h('textarea', { class: 'textarea', value: isEdit ? (activity.description || '') : '', placeholder: 'مثلاً: بستن ۴ پیچ با پیچ‌گوشتی برقی' });
    var processType = isEdit ? activity.processType : 'OPERATION';
    var groupId = isEdit ? (activity.groupId || '') : '';
    var typeSelect = UI.selectEl(processTypeOptions(), processType, function (v) { processType = v; }, 'نوع رویداد فرایندی');
    var groupSelect = UI.selectEl(groupOptions(ctx.projectId), groupId, function (v) { groupId = v; }, 'گروه مجازها');

    UI.dialog({
      title: isEdit ? 'ویرایش فعالیت' : 'فعالیت جدید',
      desc: isEdit ? null : 'در ایستگاه «' + station.name + '» — فعالیت جدید ثبت می‌شود.',
      bodyBuilder: function (body) {
        body.appendChild(UI.field('نام فعالیت', nameInput, ACTIVITY_NAME_HELP));
        body.appendChild(UI.field('شرح فعالیت (اختیاری)', descInput));
        body.appendChild(UI.field('نوع رویداد فرایندی', typeSelect));
        body.appendChild(UI.field('گروه مجازها', groupSelect, GROUP_ASSIGN_HELP));
      },
      footerBuilder: function (close) {
        return U.h('div', { class: 'dialog-footer' },
          U.h('button', { class: 'btn', type: 'button', text: 'انصراف', onclick: close }),
          U.h('div', { class: 'spacer' }),
          U.h('button', {
            class: 'btn btn-brand', type: 'button',
            onclick: function () {
              var name = nameInput.value.trim();
              if (!name) { UI.toast('نام فعالیت الزامی است', { type: 'error' }); return; }
              var payload = {
                name: name,
                description: descInput.value.trim() || null,
                processType: processType,
                groupId: groupId || null,
              };
              try {
                if (isEdit) {
                  DB.updateActivity(activity.id, payload);
                  UI.toast('فعالیت به‌روزرسانی شد');
                } else {
                  DB.createActivity(station.id, payload);
                  UI.toast('فعالیت ثبت شد');
                }
                close();
                appRefresh();
              } catch (err) { UI.toastError(err); }
            },
          }, isEdit ? 'ذخیره' : 'ثبت فعالیت'));
      },
    });
  }

  function confirmDeleteStation(st, ctx) {
    var deps = stationDeps(st.id); // پیش‌نمایش پیش از حذف
    UI.confirmDelete({ title: 'حذف دائمی ایستگاه', name: st.name, deps: deps }).then(function (ok) {
      if (!ok) return;
      try {
        var removed = DB.deleteStation(st.id);
        if (_selectedStation[ctx.projectId] === st.id) _selectedStation[ctx.projectId] = null;
        UI.toast('ایستگاه «' + st.name + '» به‌طور دائمی حذف شد', { description: depsText(removed) });
        appRefresh();
      } catch (err) { UI.toastError(err); }
    });
  }

  function confirmDeleteActivity(activity, ctx, navigateBack) {
    var deps = activityDeps(activity.id); // پیش‌نمایش پیش از حذف
    UI.confirmDelete({ title: 'حذف دائمی فعالیت', name: activity.name, deps: deps }).then(function (ok) {
      if (!ok) return;
      try {
        var removed = DB.deleteActivity(activity.id);
        purgeDeletedActivity(activity); // دورزین خطای هسته — حذف خودِ فعالیت
        UI.toast('فعالیت «' + activity.name + '» به‌طور دائمی حذف شد', { description: depsText(removed) });
        if (navigateBack) appNavigate('/p/' + ctx.projectId + '/structure');
        else appRefresh();
      } catch (err) { UI.toastError(err); }
    });
  }

  // ═══════════════════════════════════════════════════════════
  // ۲) صفحه اختصاصی فعالیت — T2VIEWS.activity (چهارزبانه)
  // ═══════════════════════════════════════════════════════════
  g.T2VIEWS.activity = function (container, projectId, activityId) {
    ensureStyle();
    U.clear(container);
    var activity = DB.getActivity(activityId);
    if (!activity) {
      container.appendChild(UI.emptyState({
        title: 'فعالیت یافت نشد',
        desc: 'این فعالیت حذف شده یا شناسه آن نامعتبر است.',
        icon: 'package',
        actionLabel: 'بازگشت به ساختار تولید',
        onAction: function () { appNavigate('/p/' + projectId + '/structure'); },
      }));
      return;
    }
    var station = DB.getStation(activity.stationId);
    var elements = DB.sortElements(activityId);
    var ratedCount = 0;
    elements.forEach(function (e) { if (DB.getElementRating(e.id)) ratedCount++; });

    var ctx = { projectId: projectId, activity: activity, station: station };
    var tab = _activityTab[activityId] || 'info';
    var processLabel = processLabelOf(activity.processType);

    // ── مسیر (breadcrumb) ──
    container.appendChild(U.h('nav', { class: 'text-xs text-muted flex items-center gap-1 flex-wrap mb-2', 'aria-label': 'مسیر فعالیت' },
      U.h('button', {
        class: 't2-link-btn', type: 'button',
        onclick: function () { appNavigate('/p/' + projectId + '/structure'); },
      }, 'ساختار'),
      U.icon('chevronLeft'),
      U.h('span', { class: 'truncate', text: station ? station.name : '—' }),
      U.icon('chevronLeft'),
      U.h('span', { class: 'font-semibold truncate', style: { color: 'var(--foreground)' }, text: activity.name })));

    // ── ردیف بالا: بازگشت + عنوان + نوع فرایندی + وضعیت ──
    container.appendChild(U.h('div', { class: 'flex flex-wrap items-center gap-2' },
      U.h('button', {
        class: 'icon-btn shrink-0', type: 'button',
        'aria-label': 'بازگشت به ساختار تولید', title: 'بازگشت به ساختار تولید',
        onclick: function () { appNavigate('/p/' + projectId + '/structure'); },
      }, U.icon('arrowRight')),
      U.h('h1', { class: 'text-xl font-extrabold truncate', text: activity.name }),
      U.h('span', {
        class: 'badge brand shrink-0 num', title: 'نوع رویداد فرایندی: ' + processLabel,
        text: processSymbolOf(activity.processType) + ' ' + processLabel,
      }),
      spacer(),
      U.h('span', { class: 'text-xs text-muted num shrink-0', text: 'وضعیت: ' + U.formatInt(ratedCount) + ' از ' + U.formatInt(elements.length) + ' عنصر ارزیابی‌شده' })));

    // ── بنر اقدام ──
    container.appendChild(actionBanner(activity, elements, ratedCount));

    // ── زبانه‌های چهارگانه (چسبان زیر نوار بالایی) ──
    container.appendChild(U.h('div', {
      class: 'mt-3',
      style: { position: 'sticky', top: '56px', zIndex: 5, background: 'var(--background)', paddingBlock: '4px' },
    },
      UI.tabsBar([
        { key: 'info', label: 'مشخصات', icon: 'settings2' },
        { key: 'elements', label: 'عناصر کاری', icon: 'listTree' },
        { key: 'timing', label: 'زمان‌سنجی', icon: 'timer' },
        { key: 'analysis', label: 'تحلیل نتایج', icon: 'barChart' },
      ], tab, function (k) {
        _activityTab[activityId] = k;
        appRefresh();
      })));

    // ── محتوای زبانه انتخاب‌شده ──
    if (tab === 'info') {
      container.appendChild(U.h('div', { class: 'flex flex-col gap-4 mt-4' },
        activityInfoCard(activity, ctx),
        allowancesCard(activity, ctx),
        dangerCard(activity, ctx)));
    } else if (tab === 'elements') {
      container.appendChild(elementsTab(activity, ctx));
    } else if (tab === 'timing') {
      var el = U.h('div'); container.appendChild(el);
      if (g.T2VIEWS._timingForActivity) g.T2VIEWS._timingForActivity(el, projectId, activityId);
      else el.appendChild(U.h('div', { class: 'banner info' }, U.icon('info'), U.h('div', { text: 'ماژول زمان‌سنجی در حال بارگذاری است…' })));
    } else if (tab === 'analysis') {
      var el2 = U.h('div'); container.appendChild(el2);
      if (g.T2VIEWS._analysisForActivity) g.T2VIEWS._analysisForActivity(el2, projectId, activityId);
      else el2.appendChild(U.h('div', { class: 'banner info' }, U.icon('info'), U.h('div', { text: 'ماژول تحلیل در حال بارگذاری است…' })));
    }
  };

  function actionBanner(activity, elements, ratedCount) {
    if (elements.length === 0) {
      return U.h('div', { class: 'banner info mt-3' }, U.icon('info'),
        U.h('div', { text: 'اولین عنصر کاری را در زبانه «عناصر کاری» اضافه کنید' }));
    }
    if (ratedCount < elements.length) {
      return U.h('div', { class: 'banner warning mt-3' }, U.icon('alertTriangle'),
        U.h('div', null,
          U.h('b', { text: 'تکمیل ارزیابی وستینگهاوس' }),
          U.h('span', { class: 'num', text: ' (' + U.formatInt(elements.length - ratedCount) + ' عنصر بدون ارزیابی)' })));
    }
    return U.h('div', { class: 'banner success mt-3' }, U.icon('checkCircle'),
      U.h('div', null,
        U.h('b', { text: 'همه عناصر این فعالیت ارزیابی شده‌اند.' }),
        U.h('span', { text: 'ثبت مشاهدات در مرحله «زمان‌سنجی» (فاز ۳) انجام می‌شود.' })));
  }

  // ── زبانه ۱: مشخصات فعالیت ──
  function activityInfoCard(activity, ctx) {
    var form = {
      name: activity.name,
      description: activity.description || '',
      processType: activity.processType,
      groupId: activity.groupId || '',
      targetSampleCount: activity.targetSampleCount,
    };
    var nameInput = U.h('input', { class: 'input', value: form.name, placeholder: 'مثلاً: بستن درب پنل' });
    nameInput.addEventListener('input', function () { form.name = nameInput.value; });
    var descInput = U.h('textarea', { class: 'textarea', value: form.description, placeholder: 'مثلاً: بستن ۴ پیچ با پیچ‌گوشتی برقی' });
    descInput.addEventListener('input', function () { form.description = descInput.value; });
    var typeSelect = UI.selectEl(processTypeOptions(), form.processType, function (v) { form.processType = v; }, 'نوع رویداد فرایندی');
    var groupSelect = UI.selectEl(groupOptions(ctx.projectId), form.groupId, function (v) { form.groupId = v; }, 'گروه مجازها');

    // «تعداد نمونه هدف» — ذخیره خودکار با تأخیر ۶۰۰ms
    var sampleTimer = null;
    var sampleInput = UI.persianNumberInput({
      value: form.targetSampleCount,
      onChange: function (n) {
        if (n !== null && (typeof n !== 'number' || !isFinite(n))) return;
        form.targetSampleCount = n;
        if (sampleTimer) clearTimeout(sampleTimer);
        sampleTimer = setTimeout(function () {
          try { DB.updateActivity(activity.id, { targetSampleCount: form.targetSampleCount }); }
          catch (err) { UI.toastError(err); }
        }, 600);
      },
      min: 1, max: 10000, decimals: false, suffix: 'چرخه', ariaLabel: 'تعداد نمونه هدف',
    });

    function save() {
      var name = form.name.trim();
      if (!name) { UI.toast('نام فعالیت الزامی است', { type: 'error' }); return; }
      try {
        DB.updateActivity(activity.id, {
          name: name,
          description: form.description.trim() || null,
          processType: form.processType,
          groupId: form.groupId || null,
          targetSampleCount: form.targetSampleCount,
        });
        UI.toast('مشخصات فعالیت ذخیره شد');
        appRefresh();
      } catch (err) { UI.toastError(err); }
    }

    return U.h('section', { class: 'card p-4', 'aria-label': 'مشخصات فعالیت' },
      U.h('div', { class: 'flex flex-wrap items-center gap-2' },
        U.h('span', { class: 'chip-icon' }, U.icon('settings2')),
        U.h('h3', { class: 'font-bold', text: 'مشخصات فعالیت' })),
      U.h('div', { class: 'flex flex-col gap-3 mt-4' },
        UI.field('نام فعالیت', nameInput),
        UI.field('شرح فعالیت (اختیاری)', descInput),
        U.h('div', { class: 'grid grid-cols-1 md:grid-cols-2 gap-3' },
          UI.field('نوع رویداد فرایندی', typeSelect),
          UI.field('گروه مجازها', groupSelect)),
        UI.field('تعداد نمونه هدف', sampleInput, TARGET_SAMPLE_HELP)),
      U.h('div', { class: 'flex flex-wrap items-center justify-between gap-2 mt-4' },
        U.h('p', { class: 'text-xs text-muted num', text: 'ایجاد: ' + U.formatDateTime(activity.createdAt) + ' · آخرین تغییر: ' + U.formatDateTime(activity.updatedAt) }),
        U.h('button', { class: 'btn btn-brand', type: 'button', onclick: save }, U.icon('check'), 'ذخیره مشخصات')));
  }

  // ── مجازهای مؤثر — ارث گروه + بازنویسی اختصاصی (debounce 600ms) ──
  function allowancesCard(activity, ctx) {
    var eff = DB.getEffectiveAllowances(activity.id);
    var card = U.h('section', { class: 'card p-4', 'aria-label': 'مجازهای مؤثر فعالیت' },
      U.h('div', { class: 'flex flex-wrap items-center gap-2' },
        U.h('span', { class: 'chip-icon cyan' }, U.icon('percent')),
        U.h('h3', { class: 'font-bold', text: 'مجازهای مؤثر' }),
        UI.helpDot('مجازهای مؤثر', ALLOWANCES_HELP)));

    if (!eff.categories.length) {
      card.appendChild(U.h('div', { class: 'mt-3 flex flex-col items-start gap-2' },
        U.h('div', { class: 'banner info w-full' }, U.icon('info'),
          U.h('div', { text: 'دسته مجازی تعریف نشده است؛ در «گروه‌ها و مجازها» دسته بسازید.' })),
        U.h('button', {
          class: 'btn btn-ghost btn-sm', type: 'button',
          onclick: function () { appNavigate('/p/' + ctx.projectId + '/allowances'); },
        }, 'رفتن به گروه‌ها و مجازها')));
      return card;
    }

    var tbodyBuilder = function (tbody) {
      eff.categories.forEach(function (cat) {
        var sourceBadge;
        if (cat.source === 'OVERRIDE') sourceBadge = UI.badge('اختصاصی فعالیت', 'amber');
        else if (cat.source === 'GROUP') sourceBadge = UI.badge(cat.sourceLabel, 'brand');
        else sourceBadge = UI.badge('بدون مقدار', 'outline');

        // بازنویسی اختصاصی — ذخیره خودکار با تأخیر ۶۰۰ms
        var ovTimer = null;
        var input = UI.percentInput({
          value: cat.overrideValue,
          onChange: function (v) {
            if (v !== null && (typeof v !== 'number' || !isFinite(v))) return;
            if (ovTimer) clearTimeout(ovTimer);
            ovTimer = setTimeout(function () {
              try {
                DB.putActivityAllowances(activity.id, [{ categoryId: cat.categoryId, percentValue: v }]);
              } catch (err) {
                UI.toastError(err);
              }
              appRefresh();
            }, 600);
          },
        });
        input.setAttribute('aria-label', 'بازنویسی اختصاصی ' + cat.name);

        tbody.appendChild(U.h('tr', null,
          U.h('td', null,
            U.h('span', { class: 'font-medium', text: cat.name }),
            cat.code ? U.h('span', { class: 'badge muted num', dir: 'ltr', style: { marginInlineStart: '6px' }, text: cat.code }) : null),
          U.h('td', null, sourceBadge),
          U.h('td', { class: 'num' }, U.formatPercent(cat.groupValue)),
          U.h('td', null, input),
          U.h('td', { class: 'num font-semibold' }, U.formatPercent(cat.effectiveValue))));
      });
    };

    var tableWrap = UI.table(['دسته مجاز', 'منبع', 'مقدار ارثی', 'بازنویسی اختصاصی', 'مقدار مؤثر'], tbodyBuilder);
    var tableEl = tableWrap.querySelector('table');
    tableEl.appendChild(U.h('tfoot', null,
      U.h('tr', null,
        U.h('td', { colspan: '5' },
          U.h('div', { class: 'flex flex-wrap items-center gap-2' },
            U.h('span', { class: 'font-bold', text: 'جمع A (دسته‌های فعال)' }),
            spacer(),
            U.h('span', { class: 'text-xs text-muted', text: eff.methodLabel }),
            U.h('code', { class: 'inline num', dir: 'ltr', text: eff.formula }),
            U.h('span', { class: 'num font-extrabold', text: U.formatPercent(eff.totalA) }))))));

    card.appendChild(U.h('div', { class: 'mt-3' }, tableWrap));

    if (eff.method === 'SHARE_OF_ST' && eff.totalA >= 1) {
      card.appendChild(U.h('div', { class: 'banner error mt-3', role: 'alert' }, U.icon('alertTriangle'),
        U.h('div', { class: 'font-bold', text: 'مجموع مجازها باید کمتر از ۱۰۰٪ باشد (قید روش دوم) — جمع فعلی: ' + U.formatPercent(eff.totalA) })));
    }
    return card;
  }

  // ── کارت عملیات خطرناک ──
  function dangerCard(activity, ctx) {
    return U.h('section', { class: 'card p-4 border-red', 'aria-label': 'عملیات' },
      U.h('div', { class: 'flex flex-wrap items-center gap-2' },
        U.h('span', { class: 'chip-icon red' }, U.icon('trash')),
        U.h('h3', { class: 'font-bold', text: 'عملیات' })),
      U.h('div', { class: 'mt-3 flex flex-wrap items-center justify-between gap-3' },
        U.h('div', { class: 'min-w-0' },
          U.h('p', { class: 'font-semibold', text: 'حذف این فعالیت' }),
          U.h('p', { class: 'text-xs text-muted mt-1', text: 'حذف فعالیت و همه داده‌های وابسته به آن.' })),
        U.h('button', {
          class: 'btn btn-destructive shrink-0', type: 'button',
          onclick: function () { confirmDeleteActivity(activity, ctx, true); },
        }, U.icon('trash'), 'حذف دائمی')));
  }

  // ── زبانه ۲: عناصر کاری ──
  var ELEMENT_TYPE_BADGE = { MANUAL: 'brand', MACHINE: 'cyan', WAITING: 'amber', OVERLAP: 'green' };

  function elementsTab(activity, ctx) {
    var elements = DB.sortElements(activity.id);
    var section = U.h('section', { class: 'mt-4 flex flex-col gap-3', 'aria-label': 'عناصر کاری فعالیت' },
      U.h('div', { class: 'flex flex-wrap items-center gap-2' },
        U.h('h3', { class: 'font-bold', text: 'عناصر کاری' }),
        numBadge(U.formatInt(elements.length), 'muted'),
        UI.helpDot('نام عنصر کاری', ELEMENT_NAME_HELP),
        spacer(),
        U.h('button', {
          class: 'btn btn-brand btn-sm', type: 'button',
          onclick: function () { openElementDialog(activity.id, null); },
        }, U.icon('plus'), 'عنصر جدید')));

    if (!elements.length) {
      section.appendChild(UI.emptyState({
        icon: 'listTree',
        title: 'هنوز عنصر کاری ثبت نشده است',
        desc: 'هر چرخه فعالیت از عناصر کاری تشکیل می‌شود؛ برای زمان‌سنجی (فاز ۳) حداقل به یک عنصر نیاز دارید. نوع عنصر (دستی، خودکار ماشین، انتظار، هم‌زمان) را می‌توانید بعداً نیز تغییر دهید.',
        actionLabel: 'ثبت اولین عنصر کاری',
        onAction: function () { openElementDialog(activity.id, null); },
      }));
      return section;
    }

    var list = U.h('div', { class: 'flex flex-col gap-2' });
    elements.forEach(function (e, i) { list.appendChild(elementRow(e, i, elements, activity.id)); });
    section.appendChild(list);
    return section;
  }

  function elementRow(e, index, elements, activityId) {
    var typeLabel = DB.CONST.ELEMENT_TYPE_LABELS[e.elementType] || e.elementType;
    var typeVariant = ELEMENT_TYPE_BADGE[e.elementType] || 'muted';
    var rating = DB.getElementRating(e.id);

    function move(delta) {
      var ids = elements.map(function (x) { return x.id; });
      ids = swapIds(ids, e.id, delta);
      if (!ids) return;
      DB.reorderElements(activityId, ids);
      appRefresh();
    }

    var row = U.h('div', { class: 'list-row', style: { position: 'relative' } },
      numBadge(U.formatInt(index + 1), 'muted'),
      U.h('div', { class: 'flex-1 min-w-0' },
        U.h('p', { class: 'font-semibold text-sm truncate', text: e.name }),
        e.description ? U.h('p', { class: 'text-xs text-muted truncate', title: e.description, text: e.description }) : null),
      U.h('span', { class: 'badge ' + typeVariant + ' shrink-0', text: typeLabel }),
      rating
        ? U.h('span', {
            class: 'badge green num shrink-0', dir: 'ltr',
            title: rating.table ? (rating.table.name + ' — نسخه ' + U.formatInt(rating.table.version)) : 'ارزیابی وستینگهاوس',
            text: 'R = ' + U.formatTimeValue(rating.assessment.totalFactor, 2),
          })
        : UI.badge('ارزیابی نشده', 'outline'),
      upDownButtons(index > 0, index < elements.length - 1, function () { move(-1); }, function () { move(1); }),
      U.h('button', {
        class: 'icon-btn sm shrink-0', type: 'button',
        'aria-label': 'ویرایش عنصر ' + e.name, title: 'ویرایش عنصر کاری',
        onclick: function (e2) { e2.stopPropagation(); openElementDialog(activityId, e); },
      }, U.icon('pencil')),
      U.h('button', {
        class: 'icon-btn sm danger shrink-0', type: 'button',
        'aria-label': 'حذف عنصر ' + e.name, title: 'حذف عنصر کاری',
        onclick: function (e2) { e2.stopPropagation(); confirmDeleteElement(e); },
      }, U.icon('trash')),
      dragHandleEl());

    makeSortable(row, 'element', e.id, activityId, function (fromId, toId) {
      var ids = elements.map(function (x) { return x.id; });
      ids = moveBefore(ids, fromId, toId);
      if (!ids) return;
      DB.reorderElements(activityId, ids);
      appRefresh();
    });
    return row;
  }

  function openElementDialog(activityId, element) {
    var isEdit = !!element;
    var nameInput = U.h('input', { class: 'input', value: isEdit ? element.name : '', placeholder: 'مثلاً: برداشتن قطعه از گراناق' });
    var elementType = isEdit ? element.elementType : 'MANUAL';
    var typeSelect = UI.selectEl(DB.CONST.ELEMENT_TYPES.map(function (et) {
      return { value: et, label: DB.CONST.ELEMENT_TYPE_LABELS[et] };
    }), elementType, function (v) { elementType = v; }, 'نوع عنصر کاری');

    UI.dialog({
      title: isEdit ? 'ویرایش عنصر کاری' : 'عنصر کاری جدید',
      bodyBuilder: function (body) {
        body.appendChild(UI.field('نام عنصر کاری', nameInput, ELEMENT_NAME_HELP));
        body.appendChild(UI.field('نوع عنصر کاری', typeSelect, ELEMENT_TYPE_HELP,
          isEdit ? 'تغییر نوع عنصر بر مدل محاسباتی اثر دارد و وضعیت محاسبات را «نیازمند محاسبه مجدد» می‌کند.' : null));
      },
      footerBuilder: function (close) {
        return U.h('div', { class: 'dialog-footer' },
          U.h('button', { class: 'btn', type: 'button', text: 'انصراف', onclick: close }),
          U.h('div', { class: 'spacer' }),
          U.h('button', {
            class: 'btn btn-brand', type: 'button',
            onclick: function () {
              var name = nameInput.value.trim();
              if (!name) { UI.toast('نام عنصر کاری الزامی است', { type: 'error' }); return; }
              try {
                if (isEdit) {
                  DB.updateElement(element.id, { name: name, elementType: elementType });
                  UI.toast('عنصر کاری به‌روزرسانی شد');
                } else {
                  DB.createElement(activityId, { name: name, elementType: elementType });
                  UI.toast('عنصر کاری ثبت شد');
                }
                close();
                appRefresh();
              } catch (err) { UI.toastError(err); }
            },
          }, isEdit ? 'ذخیره' : 'ثبت عنصر'));
      },
    });
  }

  function confirmDeleteElement(e) {
    var deps = elementDeps(e.id); // پیش‌نمایش پیش از حذف
    UI.confirmDelete({ title: 'حذف دائمی عنصر کاری', name: e.name, deps: deps }).then(function (ok) {
      if (!ok) return;
      try {
        DB.deleteElement(e.id);
        purgeDeletedElement(e); // دورزین خطای هسته — حذف خودِ عنصر
        UI.toast('عنصر «' + e.name + '» به‌طور دائمی حذف شد');
        appRefresh();
      } catch (err) { UI.toastError(err); }
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
