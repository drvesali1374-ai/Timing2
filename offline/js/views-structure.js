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
  var _activityOpenTree = {}; // فعالیت‌های باز در درخت (پیش‌فرض: بسته) — جلسه اول §۷.۲
  var _treeSearch = {}; // جست‌وجوی درخت per پروژه — §۷.۴
  var _drag = null; // درگ جاری: { type, id, scope } — اصلاح الزام ۱: تعریف مستقل (پیشتر دراثر کامنت داشت و ReferenceError می‌داد)

  // بازبینی تکمیلی ج۱ (§۴): هنگام جست‌وجوی فعال، مرتب‌سازی درخت قفل می‌شود.
  // آرایه reorder باید همیشه «کل» فرزندان را پوشش دهد؛ با فیلتر، گره‌های پنهان از
  // محاسبه حذف می‌شوند و sortOrder تکراری/ترتیب نامطمئن پس از بارگذاری می‌سازد.
  var SORT_LOCK_HINT = 'برای مرتب‌سازی، ابتدا فیلتر جست‌وجو را پاک کنید.';

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
    what: 'گروه فعالیت فقط برای طبقه‌بندی فعالیت‌های مشابه است؛ دیگر منبع اعمال الونس نیست. الونس‌ها به‌صورت سلسله‌مراتبی از خط ← ایستگاه ← فعالیت ← عنصر resolve می‌شوند.',
    input: 'گروه دلخواه را انتخاب کنید یا «بدون گروه» بگذارید.',
    example: '«کار دستی سبک»، «کار ماشینی سنگین»',
    note: 'مقادیر قدیمی گروه‌ها هنگام مهاجرت به تخصیص سطح فعالیت تبدیل شده‌اند تا نتیجه پروژه‌های موجود حفظ شود.',
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

  var TREE_HELP = {
    what: 'درخت ساختار تولید با چهار سطح: خط تولید (ریشه پروژه) ← ایستگاه ← فعالیت ← عنصر کاری.',
    input: 'کلیک روی نام هر گره آن را انتخاب می‌کند (فعالیت → صفحه اختصاصی؛ عنصر → دیالوگ ویرایش). باز/بسته کردن زیرشاخه فقط با فلش کنار گره انجام می‌شود.',
    example: 'با جست‌وجو، ایستگاه/فعالیت/عنصرِ منطبق و مسیر والدش باز می‌شوند.',
    note: 'جابه‌جایی با کشیدن دستگیره لبه راست هر ردیف؛ عنصر فقط درون فعالیت خودش جابه‌جا می‌شود.',
  };

  var TARGET_SAMPLE_HELP = {
    what: 'هدف تعداد چرخه‌های معتبری است که برای این فعالیت برنامه‌ریزی کرده‌اید؛ صرفاً شمارش آموزشی است.',
    input: 'عددی بزرگ‌تر یا مساوی ۱ وارد کنید یا خالی بگذارید (بدون هدف).',
    example: 'برای مطالعه کلاسیک معمولاً ۱۰ تا ۱۵ چرخه هدف‌گذاری می‌شود.',
    note: 'رسیدن به هدف تعداد، تضمین کفایت آماری نیست؛ شاخص‌های پراکندگی را در تحلیل نتایج بازبینی کنید.',
  };

  // ═══════════ استایل‌های اختصاصی این نما (تزریق یک‌باره) ═══════════
  // اندازه پایه آیکون‌ها اکنون در app.css (قرارداد سراسری svg.icon) است.
  function ensureStyle() {
    if (document.getElementById('t2-structure-v2-style')) return;
    var style = document.createElement('style');
    style.id = 't2-structure-v2-style';
    style.textContent = [
      // چیدمان دوستونه دسکتاپ — ستون‌های هم‌عرض (۵۰-۵۰) با عرض کامل صفحه
      '@media (min-width: 1024px) {',
      '  .t2-two-col { flex-direction: row; gap: 20px; }',
      '  .t2-tree-col { width: calc(50% - 10px); }',
      '}',
      // ── کارت ایستگاه در درخت ──
      '.t2-station-card { border: 1px solid var(--border); border-radius: calc(var(--radius) + 5px); background: var(--card); overflow: hidden; transition: border-color .15s, background .15s, box-shadow .2s; }',
      '.t2-station-card:hover { border-color: color-mix(in srgb, var(--brand) 40%, var(--border)); }',
      '.t2-station-card.selected { border-color: var(--brand); background: color-mix(in srgb, var(--brand-soft) 40%, var(--card)); box-shadow: 0 0 0 2px color-mix(in srgb, var(--brand) 25%, transparent), 0 6px 18px -8px rgba(114,87,255,.5); }',
      '.t2-station-head { display: flex; align-items: stretch; gap: 6px; padding: 4px 6px 4px 0; padding-inline-start: 32px; cursor: pointer; }',
      '.t2-station-head:focus-visible { outline: 2px solid var(--brand); outline-offset: -2px; }',
      '.t2-station-title { font-weight: 700; font-size: 13px; line-height: 1.45; margin: 0; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }',
      '.t2-station-meta { font-size: 11px; line-height: 1.5; color: var(--muted-foreground); margin: 2px 0 0; }',
      // ── ردیف فعالیت — ظاهر زیرمنو (بدون قاب، پس‌زمینه رنگی) ──
      '.t2-activity-row { display: flex; align-items: stretch; gap: 6px; padding: 2px 4px 2px 0; padding-inline-start: 32px; border-radius: var(--radius); background: color-mix(in srgb, var(--surface-2) 75%, transparent); transition: background .15s; }',
      '.t2-activity-row:hover { background: color-mix(in srgb, var(--brand-soft) 30%, transparent); }',
      '.t2-activity-title { font-size: 12.5px; font-weight: 500; line-height: 1.45; display: block; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; text-align: start; }',
      '.t2-activity-meta { font-size: 10.5px; line-height: 1.5; color: var(--muted-foreground); display: block; margin-top: 2px; }',
      // ستون عملیات عمودی (ویرایش بالا، حذف پایین) چسبیده به راست
      '.t2-actions-col { display: flex; flex-direction: column; justify-content: center; gap: 2px; flex-shrink: 0; }',
      // زیرمنوی فعالیت‌ها — تورفتگی + خط راهنمای درختی در راست
      '.t2-acts { margin: 4px 8px 8px 0; margin-inline-start: 8px; padding-inline-start: 10px; border-inline-start: 2px dashed color-mix(in srgb, var(--brand) 25%, transparent); display: flex; flex-direction: column; gap: 4px; }',
      // ردیف جمع A در انتهای جدول مجازها
      'table.table tfoot td { border-top: 2px solid var(--border); border-bottom: none; background: color-mix(in srgb, var(--surface-2) 70%, transparent); }',
      // دکمه پیوندی مسیر (breadcrumb)
      '.t2-link-btn { border: none; background: none; padding: 0; cursor: pointer; color: var(--brand); font-family: inherit; font-size: inherit; text-decoration: underline; text-underline-offset: 3px; }',
      // ── جلسه اول: درخت چهار سطح + جست‌وجو (§۷) ──
      '.t2-chevron { border: none; background: none; cursor: pointer; color: var(--muted-foreground); padding: 2px; border-radius: 6px; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; transition: transform .15s, background .15s; }',
      '.t2-chevron:hover { background: var(--surface-3); color: var(--foreground); }',
      '.t2-chevron:focus-visible { outline: 2px solid var(--brand); outline-offset: 1px; }',
      '.t2-chevron[data-open="false"] svg { transform: rotate(90deg); }',
      '.t2-element-row { display: flex; align-items: center; gap: 5px; padding: 2px 4px 2px 0; padding-inline-start: 28px; border-radius: calc(var(--radius) - 4px); transition: background .15s; }',
      '.t2-element-row:hover { background: color-mix(in srgb, var(--brand-soft) 25%, transparent); }',
      '.t2-element-title { font-size: 11.5px; line-height: 1.5; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: start; }',
      '.t2-elements-list { margin: 2px 8px 4px 0; margin-inline-start: 8px; padding-inline-start: 10px; border-inline-start: 2px dashed color-mix(in srgb, var(--border) 80%, transparent); display: flex; flex-direction: column; gap: 1px; }',
      '.t2-tree-toolbar { display: flex; align-items: center; gap: 6px; padding: 10px; border-bottom: 1px solid var(--border); background: color-mix(in srgb, var(--surface-2) 40%, transparent); }',
      '.t2-activity-head-btn { border: none; background: transparent; cursor: pointer; color: inherit; font-family: inherit; display: flex; align-items: center; gap: 6px; min-width: 0; flex: 1; padding: 4px 2px; border-radius: calc(var(--radius) - 4px); text-align: start; }',
      '.t2-activity-head-btn:focus-visible { outline: 2px solid var(--brand); outline-offset: -2px; }',
      '.drag-handle { touch-action: manipulation; }',
      '.t2-touch-ghost { position: fixed; z-index: 9999; pointer-events: none; opacity: .95; background: var(--card); border: 2px solid var(--brand); border-radius: calc(var(--radius) + 4px); box-shadow: 0 12px 32px -10px color-mix(in srgb, var(--brand) 55%, transparent); display: flex; align-items: center; gap: 6px; padding: 6px 10px; font-size: 12px; font-weight: 700; color: var(--foreground); }',
      '.t2-touch-ghost svg.icon { flex-shrink: 0; color: var(--brand); }',
      '.t2-sort.touch-dragging { opacity: .3; }',
      // ── بازبینی تکمیلی ج۱ (§۴): قفل مرتب‌سازی هنگام جست‌وجو + راهنما ──
      '.t2-sort-locked .drag-handle { opacity: .3; cursor: not-allowed; }',
      '.t2-sort-locked .drag-handle:hover { background: transparent; cursor: not-allowed; }',
      '.t2-sort-locked .drag-handle:active { cursor: not-allowed; }',
      '.t2-sort-hint { display: flex; align-items: center; gap: 6px; padding: 6px 10px; border-radius: var(--radius); background: color-mix(in srgb, var(--amber-soft) 65%, transparent); color: var(--amber); font-size: 11px; font-weight: 600; line-height: 1.7; }',
      '.t2-sort-hint .icon { flex-shrink: 0; }',
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

  function dragHandleEl(locked) {
    return U.h('span', {
      class: 'drag-handle shrink-0' + (locked ? ' t2-sort-locked-handle' : ''),
      title: locked ? SORT_LOCK_HINT : 'جابه‌جایی',
      'aria-hidden': 'true',
      onclick: function (e) { e.stopPropagation(); },
    }, U.icon('gripVertical'));
  }

  /** راهنمای قفل مرتب‌سازی هنگام جست‌وجوی فعال — بازبینی تکمیلی ج۱ (§۴) */
  function sortLockHint() {
    return U.h('div', { class: 't2-sort-hint', role: 'note', 'aria-label': 'راهنمای مرتب‌سازی' },
      U.icon('lock'),
      U.h('span', { text: SORT_LOCK_HINT }));
  }

  /** ستون عملیات عمودی — ویرایش بالا، حذف پایین؛ چسبیده به راست کارت */
  function actionButtons(edit, del) {
    return U.h('div', { class: 't2-actions-col' },
      U.h('button', {
        class: 'icon-btn sm shrink-0', type: 'button',
        'aria-label': edit.label, title: edit.title,
        onclick: function (e) { e.stopPropagation(); edit.fn(); },
      }, U.icon('pencil')),
      U.h('button', {
        class: 'icon-btn sm danger shrink-0', type: 'button',
        'aria-label': del.label, title: del.title,
        onclick: function (e) { e.stopPropagation(); del.fn(); },
      }, U.icon('trash')));
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
    row.setAttribute('data-sort-type', type);
    row.setAttribute('data-sort-id', id);
    row.setAttribute('data-sort-scope', scope);
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
    makeTouchSortable(row, type, id, scope, onReorder);
  }

  /** درگ لمسی سازگار با Pointer Events — HTML5 DnD در دستگاه لمسی رخ نمی‌دهد.
   * فشار طولانی (۳۰۰ms) روی دستگیره → آغاز درگ + Ghost شناور + هایلایت هدف با elementsFromPoint.
   * حرکت پیش از فشار طولانی بیش از آستانه → لغو (اجازه اسکرول). عملیات دسکتاپ و کیبورد دست‌نخورده می‌ماند. */
  function makeTouchSortable(row, type, id, scope, onReorder) {
    if (typeof g.PointerEvent !== 'function') return;
    var LONG_PRESS_MS = 300;
    var MOVE_SLOP = 12;
    var handle = row.querySelector('.drag-handle') || row;

    var timer = null;
    var dragging = false;
    var startX = 0, startY = 0;
    var ghost = null;
    var targetEl = null;
    var suppressClick = false;

    function rowTitle() {
      var t = row.querySelector('.t2-station-title, .t2-activity-title, .t2-element-title, .font-semibold');
      return (t ? t.textContent : '').trim() || (row.textContent || '').trim().slice(0, 40);
    }
    function clearTarget() {
      if (targetEl) { targetEl.classList.remove('drop-target'); targetEl = null; }
    }
    function findTargetEl(x, y) {
      var stack = document.elementsFromPoint(x, y);
      for (var i = 0; i < stack.length; i++) {
        var el = stack[i];
        if (!el || !el.getAttribute) continue;
        if (el.getAttribute('data-sort-type') !== type) continue;
        if (el.getAttribute('data-sort-scope') !== String(scope)) continue;
        if (el.getAttribute('data-sort-id') === id) return null;
        return el;
      }
      return null;
    }
    function moveGhost(x, y) {
      if (!ghost) return;
      ghost.style.left = (x - 28) + 'px';
      ghost.style.top = (y - 22) + 'px';
    }
    function onWindowMove(e) {
      if (!dragging) {
        if (Math.abs(e.clientX - startX) > MOVE_SLOP || Math.abs(e.clientY - startY) > MOVE_SLOP) cancelWait();
        return;
      }
      e.preventDefault();
      moveGhost(e.clientX, e.clientY);
      var t = findTargetEl(e.clientX, e.clientY);
      if (t !== targetEl) { clearTarget(); targetEl = t; if (targetEl) targetEl.classList.add('drop-target'); }
    }
    function onWindowTouchMove(e) {
      if (dragging && e.cancelable) e.preventDefault();
    }
    function onWindowUp(e) {
      if (!dragging) { cancelWait(); return; }
      var toEl = targetEl;
      cleanup();
      if (e && e.type === 'pointercancel') return;
      if (!toEl) return;
      var toId = toEl.getAttribute('data-sort-id');
      if (toId && toId !== id) onReorder(id, toId);
    }
    function cancelWait() {
      if (timer) { clearTimeout(timer); timer = null; }
      detachWait();
    }
    function detachWait() {
      window.removeEventListener('pointermove', onWindowMove);
      window.removeEventListener('pointerup', onWindowUp);
      window.removeEventListener('pointercancel', onWindowUp);
    }
    function cleanup() {
      cancelWait();
      document.removeEventListener('touchmove', onWindowTouchMove, { passive: false });
      if (ghost && ghost.parentNode) ghost.parentNode.removeChild(ghost);
      ghost = null;
      clearTarget();
      row.classList.remove('touch-dragging');
      _drag = null;
      dragging = false;
      if (suppressClick) {
        suppressClick = false;
        var swallow = function (ev) {
          ev.preventDefault();
          ev.stopPropagation();
          row.removeEventListener('click', swallow, true);
        };
        row.addEventListener('click', swallow, true);
        setTimeout(function () { row.removeEventListener('click', swallow, true); }, 400);
      }
    }
    handle.addEventListener('pointerdown', function (e) {
      if (dragging) return;
      if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
      startX = e.clientX;
      startY = e.clientY;
      window.addEventListener('pointermove', onWindowMove, { passive: false });
      window.addEventListener('pointerup', onWindowUp);
      window.addEventListener('pointercancel', onWindowUp);
      timer = setTimeout(function () {
        timer = null;
        // شنونده‌های pointermove/up متصل می‌مانند — فاز انتظار با پرچم dragging
        // از فاز درگ جدا می‌شود (در پایان درگ در cleanup حذف می‌شوند).
        dragging = true;
        suppressClick = true;
        _drag = { type: type, id: id, scope: scope };
        row.classList.add('touch-dragging');
        document.addEventListener('touchmove', onWindowTouchMove, { passive: false });
        ghost = U.h('div', { class: 't2-touch-ghost', 'aria-hidden': 'true' },
          U.icon('gripVertical'), U.h('span', { class: 'truncate', text: rowTitle() }));
        ghost.style.width = Math.min(row.offsetWidth, 320) + 'px';
        document.body.appendChild(ghost);
        moveGhost(startX, startY);
        if (navigator.vibrate) { try { navigator.vibrate(15); } catch (err) {} }
      }, LONG_PRESS_MS);
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

    // ── بدنه: درخت + جزئیات — دو ستون هم‌عرض (۵۰-۵۰) ──
    var treeCol = U.h('div', { class: 'w-full shrink-0 t2-tree-col' }, buildTreeCard(ctx, stations));
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

  // ── کارت درخت ساختار — چهار سطح + جست‌وجو (§۷) ──
  function buildTreeCard(ctx, stations) {
    var project = ctx.project;
    var card = U.h('div', { class: 'card overflow-hidden' });

    // ریشه درخت: نام پروژه + خط تولید + محصول — §۷.۱
    card.appendChild(U.h('div', { class: 'flex items-center gap-2 p-3', style: { background: 'linear-gradient(to left, color-mix(in srgb, var(--brand-soft) 70%, transparent), transparent 65%)', borderBottom: '1px solid var(--border)' } },
      U.h('span', { class: 'chip-icon' }, U.icon('factory')),
      U.h('div', { class: 'flex-1 min-w-0' },
        U.h('p', { class: 'font-extrabold text-sm truncate', title: project.name || undefined, text: project.name || 'پروژه' }),
        U.h('p', { class: 'text-[11px] text-muted num truncate', title: (project.lineName || '') + ' / ' + (project.productName || ''), text: 'خط: ' + (project.lineName || '—') + ' · محصول: ' + (project.productName || '—') })),
      U.h('button', {
        class: 'icon-btn sm shrink-0', type: 'button',
        'aria-label': 'ویرایش مشخصات پروژه', title: 'ویرایش مشخصات پروژه',
        onclick: function () { appNavigate('/p/' + ctx.projectId + '/info'); },
      }, U.icon('pencil')),
      UI.helpDot('درخت ساختار تولید', TREE_HELP)));

    // نوار ابزار: جست‌وجو + باز/بستن همه — §۷.۳/۷.۴
    var searchInput = U.h('input', {
      class: 'input', placeholder: 'جست‌وجوی ایستگاه، فعالیت یا عنصر…',
      'aria-label': 'جست‌وجو در درخت ساختار',
      style: { height: '32px', fontSize: '12px', flex: '1', minWidth: '0', background: 'var(--card)' },
      value: _treeSearch[ctx.projectId] || '',
    });
    searchInput.addEventListener('input', function () {
      _treeSearch[ctx.projectId] = searchInput.value;
      redrawTree();
    });
    card.appendChild(U.h('div', { class: 't2-tree-toolbar' },
      searchInput,
      U.h('button', {
        class: 'icon-btn sm shrink-0', type: 'button',
        'aria-label': 'باز کردن همه شاخه‌ها', title: 'باز کردن همه',
        onclick: function () {
          _stationOpen = {};
          _activityOpenTree = {};
          stations.forEach(function (s) {
            _stationOpen[s.id] = true;
            DB.sortActivities(s.id).forEach(function (a) { _activityOpenTree[a.id] = true; });
          });
          redrawTree();
        },
      }, U.icon('chevronsUpDown')),
      U.h('button', {
        class: 'icon-btn sm shrink-0', type: 'button',
        'aria-label': 'بستن همه شاخه‌ها', title: 'بستن همه',
        onclick: function () {
          _stationOpen = {};
          _activityOpenTree = {};
          redrawTree();
        },
      }, U.icon('chevronsDownUp'))));

    // فهرست ایستگاه‌ها — قابل مرتب‌سازی با Drag & Drop + فیلتر جست‌وجو
    // ⚠ بازبینی تکمیلی ج۱ (§۴): رندر اولیه و بازنویسی از یک تابع مشترک؛
    // هنگام جست‌وجو مرتب‌سازی قفل و راهنما نمایش داده می‌شود.
    function renderStationList() {
      var wrap = U.h('div', { class: 'flex flex-col gap-2 p-3 scroll-slim', style: { maxHeight: 'min(26rem, calc(100vh - 23rem))', overflowY: 'auto' } });
      var q = (_treeSearch[ctx.projectId] || '').trim();
      var has = q.length > 0;
      var vis = has ? stations.filter(function (s) { return stationMatches(s, q); }) : stations;
      if (has) wrap.appendChild(sortLockHint());
      if (!vis.length) {
        wrap.appendChild(U.h('div', { class: 'rounded-xl border border-dashed p-5 text-center', style: { borderColor: 'var(--border)' } },
          U.h('p', { class: 'text-sm font-bold', text: has ? 'موردی منطبق با جست‌وجو یافت نشد' : 'هنوز ایستگاهی ثبت نشده است.' })));
      } else {
        // ⚠ همیشه آرایه «کامل» ایستگاه‌ها به گره داده می‌شود — نه فهرست فیلترشده؛
        // callback مرتب‌سازی باید بر کل فرزندان اعمال شود (تضمین §۴).
        vis.forEach(function (st) { wrap.appendChild(stationNode(st, stations, ctx, has)); });
      }
      return wrap;
    }
    var listWrap = renderStationList();
    card.appendChild(listWrap);

    // پانوشت درخت: افزودن ایستگاه جدید — §۷.۶ variant متمایز
    card.appendChild(U.h('div', { class: 'p-3', style: { borderTop: '1px solid var(--border)' } },
      U.h('button', {
        class: 'btn btn-brand w-full', type: 'button',
        onclick: function () { openStationCreate(ctx); },
      }, U.icon('plus'), 'ایستگاه جدید')));

    function redrawTree() {
      var fresh = renderStationList();
      card.replaceChild(fresh, listWrap);
      listWrap = fresh;
    }
    return card;
  }

  /** تطبیق جست‌وجو: ایستگاه/فعالیت/عنصر — نتایج مسیر والد را باز می‌کنند (§۷.۴) */
  function stationMatches(st, q) {
    if (st.name.indexOf(q) >= 0) return true;
    return DB.sortActivities(st.id).some(function (a) {
      if (a.name.indexOf(q) >= 0) return true;
      return DB.sortElements(a.id).some(function (e) { return e.name.indexOf(q) >= 0; });
    });
  }
  function activityMatches(a, q) {
    if (a.name.indexOf(q) >= 0) return true;
    return DB.sortElements(a.id).some(function (e) { return e.name.indexOf(q) >= 0; });
  }

  // ── گره ایستگاه در درخت — کلیک نام = فقط انتخاب؛ ──
  // chevron = فقط باز/بسته — دو رفتار مستقل (§۷.۲)
  // دستگیره درگ داخل کارت چسبیده به لبه راست؛ عملیات ویرایش/حذف
  // عمودی در راست؛ عنوان تا دو خط؛ شمارش فرزندان کنار گره (§۷.۴)
  function stationNode(st, stations, ctx, hasSearch) {
    var q = (_treeSearch[ctx.projectId] || '').trim();
    var isOpen = hasSearch || _stationOpen[st.id] !== false;
    var acts = hasSearch ? DB.sortActivities(st.id).filter(function (a) { return activityMatches(a, q); }) : DB.sortActivities(st.id);
    var allActs = DB.sortActivities(st.id);
    var isSelected = ctx.selectedId === st.id;
    var elsCount = allActs.reduce(function (n, a) { return n + DB.sortElements(a.id).length; }, 0);

    function selectOnly() {
      _selectedStation[ctx.projectId] = st.id;
      appRefresh();
    }
    function toggleOpen() {
      _stationOpen[st.id] = !isOpen;
      appRefresh();
    }

    // chevron — فقط باز/بسته (§۷.۲)
    var chevron = U.h('button', {
      class: 't2-chevron', type: 'button',
      'data-open': isOpen ? 'true' : 'false',
      'aria-expanded': isOpen ? 'true' : 'false',
      'aria-label': (isOpen ? 'بستن' : 'باز کردن') + ' زیرشاخه ایستگاه ' + st.name,
      onclick: function (e) { e.stopPropagation(); toggleOpen(); },
    }, U.icon('chevronDown'));

    // سربرگ کارت — کلیک = فقط انتخاب (§۷.۲)
    var head = U.h('div', {
      class: 't2-station-head',
      role: 'button', tabindex: '0',
      'aria-current': isSelected ? 'true' : null,
    },
      chevron,
      U.h('div', { class: 'min-w-0 flex-1', role: 'button', tabindex: '0' },
        U.h('div', { class: 'flex items-center gap-1.5' },
          U.h('p', { class: 't2-station-title min-w-0 flex-1', 'data-station-name': st.id, title: st.name, text: st.name }),
          numBadge(U.formatInt(allActs.length), 'muted')),
        isSelected
          ? U.h('p', { class: 't2-station-meta num', text: U.formatInt(allActs.length) + ' فعالیت · ' + U.formatInt(elsCount) + ' عنصر کاری' })
          : null),
      actionButtons(
        { label: 'ویرایش ایستگاه ' + st.name, title: 'ویرایش ایستگاه', fn: function () { openStationEditDialog(st); } },
        { label: 'حذف ایستگاه ' + st.name, title: 'حذف ایستگاه', fn: function () { confirmDeleteStation(st, ctx); } }
      ));

    head.addEventListener('click', function (e) {
      if (e.target.closest('button')) return;
      selectOnly();
    });
    head.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (e.target === head) selectOnly();
      }
    });

    // کارت ایستگاه — دستگیره درگ داخل کارت، چسبیده به لبه راست
    // ⚠ جست‌وجوی فعال → قفل مرتب‌سازی (بازبینی تکمیلی ج۱ §۴)
    var card = U.h('div', { class: 't2-station-card t2-sort' + (isSelected ? ' selected' : '') + (hasSearch ? ' t2-sort-locked' : '') },
      dragHandleEl(hasSearch),
      head);

    var node = U.h('div', null, card);
    if (isOpen) {
      node.appendChild(U.h('div', { class: 't2-acts' }, activitiesSubList(st, allActs, ctx, hasSearch)));
    }
    // مرتب‌سازی فقط بدون فیلتر فعال می‌شود؛ callback همیشه آرایه کامل را می‌گیرد.
    if (!hasSearch) {
      makeSortable(card, 'station', st.id, ctx.projectId, function (fromId, toId) {
        var ids = stations.map(function (s) { return s.id; });
        ids = moveBefore(ids, fromId, toId);
        if (!ids) return;
        DB.reorderStations(ctx.projectId, ids);
        appRefresh();
      });
    }
    return node;
  }

  // ── فهرست فعالیت‌های یک ایستگاه (زیر گره باز شده) ──
  function activitiesSubList(station, allActs, ctx, hasSearch) {
    var q = (_treeSearch[ctx.projectId] || '').trim();
    var acts = hasSearch ? allActs.filter(function (a) { return activityMatches(a, q); }) : allActs;
    var wrap = [];
    if (!acts.length) {
      wrap.push(U.h('p', { class: 'text-xs text-faint text-center', text: hasSearch ? 'فعالیت منطبقی نیست' : 'فعالیتی ثبت نشده است' }));
    } else {
      // ⚠ آرایه «کامل» فعالیت‌ها به ردیف داده می‌شود — نه فیلترشده (تضمین §۴)
      acts.forEach(function (a) { wrap.push(activityTreeRow(a, allActs, station, ctx, hasSearch)); });
    }
    wrap.push(U.h('button', {
      class: 'btn btn-ghost btn-sm w-full', type: 'button',
      onclick: function (e) { e.stopPropagation(); openActivityDialog(ctx, station, null); },
    }, U.icon('plus'), 'فعالیت جدید'));
    return wrap;
  }

  // ── ردیف فعالیت در درخت — chevron باز/بسته عناصر؛ کلیک نام = صفحه فعالیت ──
  // badge نوع فرایند کنار نام (§۷.۶)؛ شمارش فرزندان کنار گره (§۷.۴)
  function activityTreeRow(a, acts, station, ctx, hasSearch) {
    var group = ctx.groupMap[a.groupId];
    var els = DB.sortElements(a.id);
    var elsCount = els.length;
    var parentSelected = ctx.selectedId === station.id;
    var q = (_treeSearch[ctx.projectId] || '').trim();
    var isOpen = hasSearch || _activityOpenTree[a.id] === true;
    var visibleEls = hasSearch ? els.filter(function (e) { return e.name.indexOf(q) >= 0; }) : els;

    function toggleOpen(e) {
      e.stopPropagation();
      _activityOpenTree[a.id] = !isOpen;
      appRefresh();
    }

    var chevron = U.h('button', {
      class: 't2-chevron', type: 'button',
      'data-open': isOpen ? 'true' : 'false',
      'aria-expanded': isOpen ? 'true' : 'false',
      'aria-label': (isOpen ? 'بستن' : 'باز کردن') + ' عناصر کاری فعالیت ' + a.name,
      title: 'عناصر کاری',
      onclick: toggleOpen,
    }, U.icon('chevronDown'));

    var row = U.h('div', { class: 't2-activity-row t2-sort' + (hasSearch ? ' t2-sort-locked' : ''), title: 'نوع رویداد فرایندی: ' + processLabelOf(a.processType) + (group ? ' · گروه: ' + group.name : '') + ' · ' + U.formatInt(elsCount) + ' عنصر' },
      dragHandleEl(hasSearch),
      chevron,
      U.h('button', {
        type: 'button',
        class: 't2-activity-head-btn',
        'aria-label': 'باز کردن صفحه فعالیت ' + a.name,
        onclick: function (e) { e.stopPropagation(); appNavigate('/p/' + ctx.projectId + '/activity/' + a.id); },
      },
        U.h('span', { class: 'min-w-0 flex-1' },
          U.h('span', { class: 't2-activity-title', text: a.name }),
          parentSelected
            ? U.h('span', { class: 't2-activity-meta num', text: U.formatInt(elsCount) + ' عنصر' + (group ? ' · ' + group.name : '') })
            : null),
        U.h('span', {
          class: 'shrink-0 num', title: 'نوع رویداد فرایندی: ' + processLabelOf(a.processType),
          'aria-label': 'نوع فرایند: ' + processLabelOf(a.processType),
          style: { width: '20px', height: '20px', background: 'var(--brand-soft)', borderRadius: '6px', fontSize: '11px', fontWeight: '800', color: 'var(--brand)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' },
          text: processSymbolOf(a.processType),
        }),
        numBadge(U.formatInt(elsCount), 'muted')),
      actionButtons(
        { label: 'ویرایش فعالیت ' + a.name, title: 'ویرایش فعالیت', fn: function () { openActivityDialog(ctx, station, a); } },
        { label: 'حذف فعالیت ' + a.name, title: 'حذف فعالیت', fn: function () { confirmDeleteActivity(a, ctx, false); } }
      ));

    var node = U.h('div', null, row);
    if (isOpen) {
      var elsList = U.h('div', { class: 't2-elements-list' });
      if (!visibleEls.length) {
        elsList.appendChild(U.h('p', { class: 'px-1 py-1 text-[10.5px] text-faint', text: hasSearch ? 'عنصر منطبقی نیست' : 'عنصری ثبت نشده است' }));
      } else {
        // ⚠ آرایه «کامل» عناصر به ردیف داده می‌شود — نه فیلترشده (تضمین §۴)
        visibleEls.forEach(function (e) { elsList.appendChild(elementTreeRow(e, els, a, ctx, hasSearch)); });
      }
      elsList.appendChild(U.h('button', {
        class: 'btn btn-ghost btn-sm w-full', type: 'button',
        style: { marginTop: '2px', fontSize: '11px', justifyContent: 'start', paddingInlineStart: '8px' },
        onclick: function (ev) { ev.stopPropagation(); openTreeElementDialog(ctx, a, null); },
      }, U.icon('plus'), 'عنصر جدید'));
      node.appendChild(elsList);
    }

    // مرتب‌سازی فقط بدون فیلتر فعال می‌شود؛ callback همیشه آرایه کامل را می‌گیرد.
    if (!hasSearch) {
      makeSortable(row, 'activity', a.id, station.id, function (fromId, toId) {
        var ids = acts.map(function (x) { return x.id; });
        ids = moveBefore(ids, fromId, toId);
        if (!ids) return;
        DB.reorderActivities(station.id, ids);
        appRefresh();
      });
    }
    return node;
  }

  // ── ردیف عنصر کاری در درخت — سطح چهارم (§۷.۱) ──
  // کلیک نام = دیالوگ ویرایش عنصر با الونس‌ها؛ DnD فقط درون فعالیت خود
  // hasSearch → قفل مرتب‌سازی (بازبینی تکمیلی ج۱ §۴)
  function elementTreeRow(e, els, activity, ctx, hasSearch) {
    var rating = DB.getElementRating(e.id);
    var typeVariant = ELEMENT_TYPE_BADGE[e.elementType] || 'muted';
    var row = U.h('div', { class: 't2-element-row t2-sort group' + (hasSearch ? ' t2-sort-locked' : '') },
      dragHandleEl(hasSearch),
      U.h('button', {
        type: 'button',
        class: 'flex min-w-0 flex-1 items-center gap-1.5 px-1 py-0.5',
        style: { border: 'none', background: 'transparent', cursor: 'pointer', color: 'inherit', fontFamily: 'inherit', textAlign: 'start', borderRadius: '6px' },
        'aria-label': 'ویرایش عنصر کاری ' + e.name,
        title: e.name + ' — ' + (DB.CONST.ELEMENT_TYPE_LABELS[e.elementType] || '') + (rating ? ' · R = ' + rating.assessment.totalFactor : ' · ارزیابی نشده'),
        onclick: function (ev) { ev.stopPropagation(); openTreeElementDialog(ctx, activity, e); },
      },
        U.h('span', { class: 'shrink-0', style: { color: 'var(--brand)', display: 'inline-flex' } }, U.icon('circle')),
        U.h('span', { class: 't2-element-title min-w-0 flex-1', text: e.name }),
        rating
          ? U.h('span', { class: 'badge green num shrink-0', dir: 'ltr', style: { fontSize: '9px', padding: '1px 4px' }, text: 'R = ' + U.formatTimeValue(rating.assessment.totalFactor, 2) })
          : null),
      U.h('div', { class: 'flex shrink-0 items-center gap-0.5', style: { opacity: '0', transition: 'opacity .15s' }, onload: null },
        U.h('button', {
          class: 'icon-btn sm', type: 'button',
          'aria-label': 'ویرایش عنصر ' + e.name, style: { width: '20px', height: '20px' },
          onclick: function (ev) { ev.stopPropagation(); openTreeElementDialog(ctx, activity, e); },
        }, U.icon('pencil')),
        U.h('button', {
          class: 'icon-btn sm danger', type: 'button',
          'aria-label': 'حذف عنصر ' + e.name, style: { width: '20px', height: '20px' },
          onclick: function (ev) { ev.stopPropagation(); confirmDeleteElement(e); },
        }, U.icon('trash'))));
    // نمایش عملیات با hover
    row.addEventListener('mouseenter', function () { row.lastChild.style.opacity = '1'; });
    row.addEventListener('mouseleave', function () { row.lastChild.style.opacity = '0'; });

    // مرتب‌سازی فقط بدون فیلتر فعال می‌شود؛ callback همیشه آرایه کامل را می‌گیرد.
    if (!hasSearch) {
      makeSortable(row, 'element', e.id, activity.id, function (fromId, toId) {
        var ids = els.map(function (x) { return x.id; });
        ids = moveBefore(ids, fromId, toId);
        if (!ids) return;
        DB.reorderElements(activity.id, ids);
        appRefresh();
      });
    }
    return row;
  }

  // ── دیالوگ ایجاد/ویرایش عنصر از درخت — با الونس‌های عنصر (§۶) ──
  function openTreeElementDialog(ctx, activity, element) {
    var isEdit = !!element;
    var nameInput = U.h('input', { class: 'input', value: isEdit ? element.name : '', placeholder: 'مثلاً: برداشتن قطعه از گراناق' });
    var descInput = U.h('textarea', { class: 'textarea', value: isEdit ? (element.description || '') : '', placeholder: 'مثلاً: برداشت با دو دست و قراردادن روی میز کار' });
    var elementType = isEdit ? element.elementType : 'MANUAL';
    var typeSelect = UI.selectEl(DB.CONST.ELEMENT_TYPES.map(function (et) {
      return { value: et, label: DB.CONST.ELEMENT_TYPE_LABELS[et] };
    }), elementType, function (v) { elementType = v; }, 'نوع عنصر کاری');

    var dlg = UI.dialog({
      title: isEdit ? 'ویرایش عنصر کاری' : 'عنصر کاری جدید',
      desc: isEdit
        ? 'مشخصات ذخیره می‌شوند؛ الونس‌های اختصاصی این عنصر در بخش پایین.'
        : 'در فعالیت «' + activity.name + '» — عنصر در انتهای فهرست افزوده می‌شود.',
      size: 'lg',
      bodyBuilder: function (body) {
        body.appendChild(U.h('div', { class: 'space-y-4' },
          UI.field('نام عنصر کاری', nameInput, ELEMENT_NAME_HELP),
          UI.field('شرح عنصر (اختیاری)', descInput),
          UI.field('نوع عنصر کاری', typeSelect, ELEMENT_TYPE_HELP,
            isEdit ? 'تغییر نوع عنصر بر مدل محاسباتی اثر دارد و وضعیت محاسبات را «نیازمند محاسبه مجدد» می‌کند.' : null),
          isEdit ? U.h('div', { id: 'tree-element-allowances' }) : null));
        if (isEdit && g.T2VIEWS._allowanceSection) {
          var host = body.querySelector('#tree-element-allowances');
          g.T2VIEWS._allowanceSection(host, ctx.projectId, 'WORK_ELEMENT', element.id, { compact: true });
        }
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
                  DB.updateElement(element.id, { name: name, description: descInput.value.trim() || null, elementType: elementType });
                  UI.toast('عنصر کاری به‌روزرسانی شد');
                } else {
                  DB.createElement(activity.id, { name: name, description: descInput.value.trim() || null, elementType: elementType });
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

    // ── الونس‌های سطح ایستگاه — §۶ ──
    var alwWrap = U.h('div');
    if (g.T2VIEWS._allowanceSection) g.T2VIEWS._allowanceSection(alwWrap, ctx.projectId, 'STATION', st.id);

    return U.h('div', { class: 'flex flex-col gap-4' }, card, alwWrap, actsCard);
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
    var groupSelect = UI.selectEl(groupOptions(ctx.projectId), groupId, function (v) { groupId = v; }, 'گروه فعالیت (طبقه‌بندی)');

    UI.dialog({
      title: isEdit ? 'ویرایش فعالیت' : 'فعالیت جدید',
      desc: isEdit ? null : 'در ایستگاه «' + station.name + '» — فعالیت جدید ثبت می‌شود.',
      bodyBuilder: function (body) {
        body.appendChild(UI.field('نام فعالیت', nameInput, ACTIVITY_NAME_HELP));
        body.appendChild(UI.field('شرح فعالیت (اختیاری)', descInput));
        body.appendChild(UI.field('نوع رویداد فرایندی', typeSelect));
        body.appendChild(UI.field('گروه فعالیت (طبقه‌بندی)', groupSelect, GROUP_ASSIGN_HELP));
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
    var groupSelect = UI.selectEl(groupOptions(ctx.projectId), form.groupId, function (v) { form.groupId = v; }, 'گروه فعالیت (طبقه‌بندی)');

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
          UI.field('گروه فعالیت (طبقه‌بندی)', groupSelect)),
        UI.field('تعداد نمونه هدف', sampleInput, TARGET_SAMPLE_HELP)),
      U.h('div', { class: 'flex flex-wrap items-center justify-between gap-2 mt-4' },
        U.h('p', { class: 'text-xs text-muted num', text: 'ایجاد: ' + U.formatDateTime(activity.createdAt) + ' · آخرین تغییر: ' + U.formatDateTime(activity.updatedAt) }),
        U.h('button', { class: 'btn btn-brand', type: 'button', onclick: save }, U.icon('check'), 'ذخیره مشخصات')));
  }

  // ── الونس‌ها و زمان‌های مجاز — سطح فعالیت (§۶)؛ کامپوننت مشترک _allowanceSection ──
  function allowancesCard(activity, ctx) {
    var wrap = U.h('div');
    if (g.T2VIEWS._allowanceSection) g.T2VIEWS._allowanceSection(wrap, ctx.projectId, 'ACTIVITY', activity.id);
    return wrap;
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
    elements.forEach(function (e, i) { list.appendChild(elementRow(e, i, elements, activity.id, ctx)); });
    section.appendChild(list);
    return section;
  }

  function elementRow(e, index, elements, activityId, ctx) {
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

    var row = U.h('div', { class: 'list-row t2-sort' },
      dragHandleEl(),
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
        onclick: function (e2) { e2.stopPropagation(); openElementDialog(activityId, e, ctx); },
      }, U.icon('pencil')),
      U.h('button', {
        class: 'icon-btn sm danger shrink-0', type: 'button',
        'aria-label': 'حذف عنصر ' + e.name, title: 'حذف عنصر کاری',
        onclick: function (e2) { e2.stopPropagation(); confirmDeleteElement(e); },
      }, U.icon('trash')));

    makeSortable(row, 'element', e.id, activityId, function (fromId, toId) {
      var ids = elements.map(function (x) { return x.id; });
      ids = moveBefore(ids, fromId, toId);
      if (!ids) return;
      DB.reorderElements(activityId, ids);
      appRefresh();
    });
    return row;
  }

  function openElementDialog(activityId, element, ctx) {
    var isEdit = !!element;
    var nameInput = U.h('input', { class: 'input', value: isEdit ? element.name : '', placeholder: 'مثلاً: برداشتن قطعه از گراناق' });
    var descInput = U.h('textarea', { class: 'textarea', value: isEdit ? (element.description || '') : '', placeholder: 'مثلاً: برداشت با دو دست و قراردادن روی میز کار' });
    var elementType = isEdit ? element.elementType : 'MANUAL';
    var typeSelect = UI.selectEl(DB.CONST.ELEMENT_TYPES.map(function (et) {
      return { value: et, label: DB.CONST.ELEMENT_TYPE_LABELS[et] };
    }), elementType, function (v) { elementType = v; }, 'نوع عنصر کاری');

    UI.dialog({
      title: isEdit ? 'ویرایش عنصر کاری' : 'عنصر کاری جدید',
      desc: isEdit ? 'مشخصات ذخیره می‌شوند؛ الونس‌های اختصاصی این عنصر در بخش پایین.' : null,
      size: isEdit ? 'lg' : '',
      bodyBuilder: function (body) {
        body.appendChild(U.h('div', { class: 'space-y-4' },
          UI.field('نام عنصر کاری', nameInput, ELEMENT_NAME_HELP),
          UI.field('شرح عنصر (اختیاری)', descInput),
          UI.field('نوع عنصر کاری', typeSelect, ELEMENT_TYPE_HELP,
            isEdit ? 'تغییر نوع عنصر بر مدل محاسباتی اثر دارد و وضعیت محاسبات را «نیازمند محاسبه مجدد» می‌کند.' : null),
          isEdit && ctx && g.T2VIEWS._allowanceSection ? U.h('div', { id: 'tab-element-allowances' }) : null));
        if (isEdit && ctx && g.T2VIEWS._allowanceSection) {
          var host = body.querySelector('#tab-element-allowances');
          g.T2VIEWS._allowanceSection(host, ctx.projectId, 'WORK_ELEMENT', element.id, { compact: true });
        }
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
                  DB.updateElement(element.id, { name: name, description: descInput.value.trim() || null, elementType: elementType });
                  UI.toast('عنصر کاری به‌روزرسانی شد');
                } else {
                  DB.createElement(activityId, { name: name, description: descInput.value.trim() || null, elementType: elementType });
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
