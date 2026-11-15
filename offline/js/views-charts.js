/* ═══════════════════════════════════════════════════════════
   views-charts.js — مرحلهٔ «نمودار فرایند — OPC / FPC»
   پورت وفادار از ChartsView / ChartCanvas نسخهٔ وب (جلسه ۲ §۱۵ + v1.5.2 Part-3 §۶):
   • زوم/پن (§۱۵.۳ + §۶-۴): چرخ ماوس همیشه زوم حول نشانگر است؛
     درگ زمینه = جابه‌جایی؛ مختصات گره‌ها واقعی می‌ماند (دلتای درگ تقسیم بر زوم).
   • چهار لنگر در هر گره (§۱۵.۴): اتصال با کشیدن از لنگر گردِ گره تا
     لنگر گرهٔ دیگر؛ مسیر یال‌ها orthogonal/elbow با stub ۲۲px
     (پورت دقیق anchorPoint / autoAnchors / orthogonalPath از ChartCanvas.tsx).
   • §۶-۱/۶-۲: بهترین جفت anchor از میان همهٔ ۱۶ ترکیب با جریمهٔ سنگین
     برای عبور از داخل گره‌ها — نه فقط زوج‌های هم‌جهت.
   • §۶-۳: پیکان جهت جریان درشت‌تر (۸px؛ انتخاب‌شده ۹px) هم‌رنگ خط.
   • §۶-۶: کلیک روی یال = انتخاب (toggle)؛ حذف با دکمهٔ نوار ابزار یا
     کلید Delete/Backspace با تأییدیه — عیناً هم‌ارز نسخهٔ وب.
   • snapshot چیدمان دستی (§۱۵.۵): پیش از «چیدمان خودکار» ذخیره و با
     «بازگردانی چیدمان دستی» قابل بازیابی است.
   • ابعاد بوم دلخواه با preset (§۱۵.۶) — مستقل از زوم و کاغذ PDF.
   • خروجی PDF تک‌صفحه‌ای/تایل‌دار (§۱۵.۷ + §۶-۵ برش به محدودهٔ واقعی
     محتوا) با نشانه‌های برش و شمارهٔ صفحه.
   • MATERIAL_INPUT + «OPC توسعه‌یافته» (§۱۵.۱/۱۵.۲).
   قابلیت‌های قبلی همه حفظ شده‌اند: زبانهٔ OPC/FPC، درگ گره + ذخیرهٔ خودکار،
   ترتیب بالا/پایین، دیالوگ CRUD گره دستی، تأیید حذف یال، چیدمان خودکار،
   بازخوانی، چیپ‌های راهنما، حالت‌های خالی و هشدار گره‌های بی‌اتصال.
   ═══════════════════════════════════════════════════════════ */
(function (g) {
  'use strict';
  var U = g.T2U, DB = g.T2DB, UI = g.T2UI;
  g.T2VIEWS = g.T2VIEWS || {};

  /* ابعاد مرجع گره — هماهنگ با ثابت‌های db.js */
  var NW = DB.NODE_W || 200;
  var NH = DB.NODE_H_EST || 96;
  var MARGIN = 48;
  var SVG_NS = 'http://www.w3.org/2000/svg';

  /* جلسه ۲ §۱۵.۱/۱۵.۲ — انواع مجاز گره دستی (هماهنگ با db.createManualNode) */
  var OPC_ALLOWED = ['OPERATION', 'INSPECTION', 'MATERIAL_INPUT', 'STORAGE'];
  var FPC_ALLOWED = ['OPERATION', 'INSPECTION', 'TRANSPORT', 'DELAY', 'STORAGE', 'MATERIAL_INPUT'];
  var ANCHOR_SIDES = ['top', 'bottom', 'left', 'right'];
  var ANCHOR_LABEL = { top: 'بالا', bottom: 'پایین', left: 'چپ', right: 'راست' };

  var CANVAS_PRESETS = [
    { label: 'کوچک ۱۲۰۰×۸۰۰', w: 1200, h: 800 },
    { label: 'متوسط ۲۰۰۰×۱۲۰۰', w: 2000, h: 1200 },
    { label: 'بزرگ ۳۰۰۰×۱۸۰۰', w: 3000, h: 1800 },
    { label: 'خیلی بزرگ ۴۰۰۰×۲۴۰۰', w: 4000, h: 2400 },
  ];

  var ZOOM_MIN = 0.15, ZOOM_MAX = 3;

  /* نماد و رنگ هر نوع رویداد (قرارداد رایج نمودارهای فرایند) */
  var TYPE_STYLE = {
    OPERATION: { bg: 'var(--brand-soft)', fg: 'var(--brand)' },
    INSPECTION: { bg: 'var(--cyan-soft)', fg: 'var(--cyan)' },
    TRANSPORT: { bg: 'var(--amber-soft)', fg: 'var(--amber)' },
    DELAY: { bg: 'var(--red-soft)', fg: 'var(--red)' },
    STORAGE: { bg: 'var(--green-soft)', fg: 'var(--green)' },
    MATERIAL_INPUT: { bg: 'var(--cyan-soft)', fg: 'var(--cyan)' },
  };
  var TYPE_LABEL = (function () {
    var m = {};
    var base = (DB.CONST && DB.CONST.PROCESS_TYPE_LABELS) || {};
    Object.keys(base).forEach(function (k) { m[k] = base[k]; });
    m.MATERIAL_INPUT = 'ورودی مواد/قطعات';
    return m;
  })();
  function glyphOf(t) {
    if (t === 'MATERIAL_INPUT') return '⬡';
    return (DB.CONST && DB.CONST.PROCESS_TYPE_SYMBOLS && DB.CONST.PROCESS_TYPE_SYMBOLS[t]) || '?';
  }
  /* نماد مشترک — UI.processSymbol اگر موجود باشد؛ وگرنه رندر glyph فعلی */
  function symbolEl(nodeType, size) {
    size = size || 'md';
    if (UI && typeof UI.processSymbol === 'function') {
      try { return U.h('span', { html: UI.processSymbol(nodeType, size), style: { display: 'inline-flex' } }); }
      catch (err) { /* افت به رندر جایگزین */ }
    }
    var st = TYPE_STYLE[nodeType] || TYPE_STYLE.OPERATION;
    var extra = size === 'sm'
      ? { width: '24px', height: '24px', fontSize: '12px' }
      : size === 'lg' ? { width: '40px', height: '40px', fontSize: '20px' } : null;
    return U.h('span', {
      class: 'cn-symbol', 'aria-hidden': 'true',
      style: Object.assign({ background: st.bg, color: st.fg }, extra || null),
      text: glyphOf(nodeType),
    });
  }

  var HELP_CHART = {
    what: 'نمودار فرایند، توالی رویدادهای تولید را نشان می‌دهد. OPC (نمودار فرایند عملیات) در تعریف کلاسیک فقط عملیات ○ و بازرسی □ را نمایش می‌دهد؛ FPC (نمودار فرایند جریان) هر پنج نوع رویداد استاندارد: عملیات ○، بازرسی □، حمل‌ونقل ⇨، تأخیر D و انبارش ▽.',
    input: 'گره‌های اصلی به‌صورت خودکار از فعالیت‌های تعریف‌شده در «ساختار تولید» ساخته می‌شوند و با تغییر آن‌ها به‌روز می‌مانند. برای رویدادهای فاقد فعالیت زمان‌سنجی، «گره دستی» بسازید. ورودی مواد اولیه، قطعات و نیم‌ساخته‌ها به‌صورت گره مستقل «ورودی مواد ⬡» تعریف می‌شوند و با خط تغذیه به مرحلهٔ موردنظر وصل می‌شوند. در OPC می‌توانید «انبار ▽» را نیز به‌صورت اختیاری بیفزایید — در این صورت حالت نمودار به «OPC توسعه‌یافته» تغییر می‌کند تا با تعریف کلاسیک اشتباه نشود.',
    example: 'مسیر یک قطعه: ورودی مواد ⬡ ← حمل به ایستگاه مونتاژ ⇨ ← عملیات مونتاژ ○ ← بازرسی کیفیت □ ← تأخیر در انتظار تأیید D.',
    note: 'زوم و جابه‌جایی بوم، مختصات ذخیره‌شدهٔ گره‌ها را تغییر نمی‌دهد. چیدمان دستی قبل از «چیدمان خودکار» ذخیره می‌شود و با «بازگردانی چیدمان دستی» قابل بازیابی است. حذف یا تغییر نمودار هیچ دادهٔ زمان‌سنجی را حذف نمی‌کند.',
  };

  /* ── آیکون‌های SVG داخلی (در مجموعهٔ utils.js نیستند) ── */
  function lucideIcon(body, cls) {
    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('class', 'icon ' + (cls || ''));
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = body;
    return svg;
  }
  var SVG_ZOOM_OUT = '<circle cx="11" cy="11" r="8"/><line x1="21" x2="16.65" y1="21" y2="16.65"/><line x1="8" x2="14" y1="11" y2="11"/>';
  var SVG_ZOOM_IN = '<circle cx="11" cy="11" r="8"/><line x1="21" x2="16.65" y1="21" y2="16.65"/><line x1="11" x2="11" y1="8" y2="14"/><line x1="8" x2="14" y1="11" y2="11"/>';
  var SVG_MAXIMIZE = '<polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" x2="14" y1="3" y2="10"/><line x1="3" x2="10" y1="21" y2="14"/>';
  var SVG_RULER = '<path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.3 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0Z"/><path d="m14.5 12.5 2-2"/><path d="m11.5 9.5 2-2"/><path d="m8.5 6.5 2-2"/><path d="m17.5 15.5 2-2"/>';

  /* ═══ مسیریابی orthogonal یال‌ها — پورت دقیق ChartCanvas.tsx (§۱۵.۴) ═══ */
  var ANCHOR_NORMAL = {
    top: { x: 0, y: -1 }, bottom: { x: 0, y: 1 },
    left: { x: -1, y: 0 }, right: { x: 1, y: 0 },
  };
  function anchorPoint(p, a, h) {
    var hh = h || NH;
    if (a === 'top') return { x: p.x + NW / 2, y: p.y };
    if (a === 'bottom') return { x: p.x + NW / 2, y: p.y + hh };
    if (a === 'left') return { x: p.x, y: p.y + hh / 2 };
    return { x: p.x + NW, y: p.y + hh / 2 };
  }
  /* ═══ v1.5.2 Part-3 §۶-۱/§۶-۲ — مسیریابی elbow پیشرفته (پورت ChartCanvas.tsx) ═══
     بهترین جفت anchor از میان «همهٔ ۱۶ ترکیب» انتخاب می‌شود — حتی
     ترکیب‌های متقاطع مثل left-top یا right-bottom. معیار: طول مسیر +
     جریمهٔ سنگین برای عبور از داخل گره‌های مبدأ/مقصد. */
  var ALL_SIDES = ['top', 'bottom', 'left', 'right'];

  /* تقاطع پاره‌خط با مستطیل (برای جریمهٔ عبور از داخل گره) — نمونه‌گیری چندنقطه‌ای ارزان */
  function segmentHitsRect(a, b, r) {
    var steps = 12;
    for (var i = 0; i <= steps; i++) {
      var k = i / steps;
      var x = a.x + (b.x - a.x) * k, y = a.y + (b.y - a.y) * k;
      if (x > r.x + 1 && x < r.x + r.w - 1 && y > r.y + 1 && y < r.y + r.h - 1) return true;
    }
    return false;
  }

  /* نقاط مسیر elbow از anchor مبدأ به anchor مقصد — stub ۲۲px (§۶-۲) */
  function elbowPoints(s, sa, t, ta, hs, ht) {
    var sA = anchorPoint(s, sa, hs), tA = anchorPoint(t, ta, ht);
    var stub = 22;
    var sOut = { x: sA.x + ANCHOR_NORMAL[sa].x * stub, y: sA.y + ANCHOR_NORMAL[sa].y * stub };
    /* §۶-۳ — نقطهٔ ورود به مقصد باید «بیرون» گره باشد (tA + نرمال×stub)
       تا آخرین قطعه (tIn→tA) به سمت داخل گره و پیکان marker-end رو به
       مقصد باشد. فرمول قبلی (tA − نرمال×stub) نقطه را داخل گره می‌گذاشت؛
       قطعهٔ آخر معکوس می‌شد و پیکان رو به مبدأ/زیر خط پنهان می‌ماند. */
    var tIn = { x: tA.x + ANCHOR_NORMAL[ta].x * stub, y: tA.y + ANCHOR_NORMAL[ta].y * stub };
    var pts = [sA, sOut];
    var vSrc = sa === 'bottom' || sa === 'top', vDst = ta === 'bottom' || ta === 'top';
    if (Math.abs(sOut.x - tIn.x) > 1 && Math.abs(sOut.y - tIn.y) > 1) {
      if (vSrc && vDst) {
        var midY = (sOut.y + tIn.y) / 2;
        pts.push({ x: sOut.x, y: midY }, { x: tIn.x, y: midY });
      } else if (!vSrc && !vDst) {
        var midX = (sOut.x + tIn.x) / 2;
        pts.push({ x: midX, y: sOut.y }, { x: midX, y: tIn.y });
      } else if (vSrc && !vDst) {
        /* مبدأ عمودی → مقصد افقی: خم در سطح ورودی افقی مقصد */
        pts.push({ x: sOut.x, y: tIn.y });
      } else {
        /* مبدأ افقی → مقصد عمودی: خم در سطح خروجی افقی مبدأ */
        pts.push({ x: tIn.x, y: sOut.y });
      }
    }
    pts.push(tIn, tA);
    return pts;
  }

  /* امتیاز یک زوج anchor: طول مسیر + جریمهٔ عبور از داخل گره‌ها (§۶-۱) */
  function anchorPairScore(s, sa, t, ta, hs, ht) {
    var pts = elbowPoints(s, sa, t, ta, hs, ht);
    var len = 0, i;
    for (i = 1; i < pts.length; i++) len += Math.abs(pts[i].x - pts[i - 1].x) + Math.abs(pts[i].y - pts[i - 1].y);
    var srcRect = { x: s.x, y: s.y, w: NW, h: hs || NH };
    var dstRect = { x: t.x, y: t.y, w: NW, h: ht || NH };
    var penalty = 0;
    for (i = 1; i < pts.length; i++) {
      if (segmentHitsRect(pts[i - 1], pts[i], srcRect)) penalty += 400;
      if (segmentHitsRect(pts[i - 1], pts[i], dstRect)) penalty += 400;
    }
    return len + penalty;
  }

  /* بهترین جفت anchor از میان همهٔ ۱۶ ترکیب (§۶-۱) */
  function autoAnchors(s, t, hs, ht) {
    var best = ['bottom', 'top'], bestScore = Infinity;
    for (var i = 0; i < ALL_SIDES.length; i++) {
      for (var j = 0; j < ALL_SIDES.length; j++) {
        if (ALL_SIDES[i] === ALL_SIDES[j]) continue;
        var score = anchorPairScore(s, ALL_SIDES[i], t, ALL_SIDES[j], hs, ht);
        if (score < bestScore) { bestScore = score; best = [ALL_SIDES[i], ALL_SIDES[j]]; }
      }
    }
    return best;
  }

  /* مسیر orthogonal/elbow — بدون عبور از داخل گره */
  function orthogonalPath(s, sa, t, ta, hs, ht) {
    return elbowPoints(s, sa, t, ta, hs, ht)
      .map(function (p, i) { return (i === 0 ? 'M ' : 'L ') + Math.round(p.x) + ' ' + Math.round(p.y); })
      .join(' ');
  }

  /* ── وضعیت ماژول — بین رندرها و ناوبری حفظ می‌شود ── */
  var chartTypeByProject = {};   /* projectId -> 'OPC' | 'FPC' */
  var viewStateByChart = {};     /* projectId|chartType -> { zoom, pan } */
  var escListener = null;
  var cancelConnectFn = null;    /* لغو اتصال در جریان با Escape */
  /* v1.5.2 §۶-۶ — یال انتخاب‌شده (مثل state ری‌اکت: با ورود به نما و
     تعویض زبانه ریست می‌شود؛ تا حذف/نامعتبرشدن یال معتبر می‌ماند) */
  var selectedEdgeByProject = {};

  /* ═══ v1.5.2 §۱۰.۸ — تاریخچهٔ Undo/Redo بوم (هم‌ارز useChartHistory وب) ═══
     هر عمل ساختاری با عمل معکوس خود ثبت می‌شود؛ Undo/Redo خودشان وارد
     History نمی‌شوند؛ تغییر جدید شاخهٔ Redo را پاک می‌کند؛ سقف ۶۰ مرحله. */
  var chartHistories = {};
  function histOf(pid) {
    var k = pid + '|' + (chartTypeByProject[pid] || 'FPC');
    if (!chartHistories[k]) chartHistories[k] = { entries: [], index: -1 };
    return chartHistories[k];
  }
  function histPush(pid, label, undoFn, redoFn) {
    var h = histOf(pid);
    h.entries = h.entries.slice(0, h.index + 1);
    h.entries.push({ label: label, undo: undoFn, redo: redoFn });
    if (h.entries.length > 60) h.entries = h.entries.slice(h.entries.length - 60);
    h.index = h.entries.length - 1;
  }
  var histBusy = false;
  var histRender = null; /* render فعلی نما — توسط render() خودش تازه می‌شود */
  function histUndo(pid) {
    var h = histOf(pid);
    if (h.index < 0 || histBusy) return;
    var e = h.entries[h.index];
    histBusy = true;
    try { e.undo(); h.index--; UI.toast('واگردانی شد: ' + e.label); }
    catch (err) { UI.toastError(err); }
    histBusy = false;
    if (histRender) histRender();
  }
  function histRedo(pid) {
    var h = histOf(pid);
    if (h.index >= h.entries.length - 1 || histBusy) return;
    var e = h.entries[h.index + 1];
    histBusy = true;
    try { e.redo(); h.index++; UI.toast('ازنو اعمال شد: ' + e.label); }
    catch (err) { UI.toastError(err); }
    histBusy = false;
    if (histRender) histRender();
  }
  /* میانبرهای کیبورد — نصب یک‌باره؛ فقط وقتی نمای نمودار فعال است */
  var histKeysInstalled = false;
  function installHistKeys() {
    if (histKeysInstalled) return;
    histKeysInstalled = true;
    document.addEventListener('keydown', function (ev) {
      if (!(ev.ctrlKey || ev.metaKey)) return;
      var k = (ev.key || '').toLowerCase();
      var isUndo = k === 'z' && !ev.shiftKey;
      var isRedo = k === 'y' || (k === 'z' && ev.shiftKey);
      if (!isUndo && !isRedo) return;
      var t = ev.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (document.querySelector('.dialog-backdrop, [data-state="open"]')) return;
      if (!chartsViewActivePid) return;
      ev.preventDefault();
      if (isUndo) histUndo(chartsViewActivePid);
      else histRedo(chartsViewActivePid);
    });
  }
  var chartsViewActivePid = null;
  var delEdgeListener = null;    /* حذف یال انتخاب‌شده با Delete/Backspace */

  function getViewState(key) {
    if (!viewStateByChart[key]) viewStateByChart[key] = { zoom: 1, pan: { x: 0, y: 0 } };
    return viewStateByChart[key];
  }

  function svgTag(tag, attrs) {
    var el = document.createElementNS(SVG_NS, tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { el.setAttribute(k, attrs[k]); });
    return el;
  }

  g.T2VIEWS.charts = function (container, projectId) {
    U.clear(container);
    var root = U.h('div', { class: 'flex flex-col gap-4' });
    container.appendChild(root);

    if (chartTypeByProject[projectId] !== 'OPC' && chartTypeByProject[projectId] !== 'FPC') chartTypeByProject[projectId] = 'OPC';
    /* §۶-۶ — ورود تازه به نما = ریست انتخاب یال (معادل remount در وب) */
    delete selectedEdgeByProject[projectId];

    var suppressClickUntil = 0; /* سرکوب click پس از درگ واقعی گره/زمینه */
    /* منبع خروجی PDF — در هر رندر تازه می‌شود؛ cropX/Y = برش محتوای §۶-۵ */
    var pdfCtx = { el: null, w: 0, h: 0, title: '', cropX: 0, cropY: 0 };

    function render() {
      cancelConnectFn = null;
      histRender = render; /* §۱۰.۸ — تاریخچه پس از هر رندر خودش را ثبت می‌کند */
      U.clear(root);
      var chartType = chartTypeByProject[projectId];
      var view = getViewState(projectId + '|' + chartType);
      var chart;
      try { chart = DB.getChart(projectId, chartType); }
      catch (err) {
        pdfCtx.el = null;
        root.appendChild(U.h('div', { class: 'banner error' }, U.icon('alertTriangle'),
          U.h('div', null, 'خطا در بارگذاری نمودار: ' + (err && err.message ? err.message : err))));
        return;
      }
      var nodes = chart.nodes;
      var nodeById = {};
      nodes.forEach(function (n) { nodeById[n.id] = n; });
      var byType = (chart.counts && chart.counts.byType) || {};

      /* §۱۵.۲ — OPC توسعه‌یافته: ورودی مواد یا انبار در نمودار OPC */
      var isExt = chart.isExtendedOpc != null
        ? !!chart.isExtendedOpc
        : (chartType === 'OPC' && (((byType.MATERIAL_INPUT || 0) > 0) || ((byType.STORAGE || 0) > 0)));
      var allowedTypes = chartType === 'OPC' ? OPC_ALLOWED : FPC_ALLOWED;

      /* anchorهای ذخیره‌شدهٔ یال‌ها — از DTO اگر موجود باشد، وگرنه از state خام (defensive) */
      var anchorMap = {};
      try {
        var rawEdges = (DB.getState && DB.getState().chartEdges) || [];
        rawEdges.forEach(function (re) {
          if (re && re.projectId === projectId && re.chartType === chartType) {
            anchorMap[re.id] = { sourceAnchor: re.sourceAnchor || null, targetAnchor: re.targetAnchor || null };
          }
        });
      } catch (err) { /* فقط برای خواندن anchorها است؛ مسیر جایگزین autoAnchors هست */ }
      function anchorOf(e, key) {
        var v = e[key];
        if (v === 'top' || v === 'bottom' || v === 'left' || v === 'right') return v;
        var fr2 = anchorMap[e.id];
        if (fr2) {
          var rv = fr2[key];
          if (rv === 'top' || rv === 'bottom' || rv === 'left' || rv === 'right') return rv;
        }
        return null;
      }

      /* v1.5.2 §۱۰.۲ — بلوک چسبان واحد: هدر صفحه + نوار زبانه‌های OPC/FPC
         هنگام اسکرول هم‌اهنگ زیر TopBar ثابت می‌مانند (استثنای آگاهانهٔ این صفحه). */
      var tabsEl = UI.tabsBar([
        { key: 'OPC', label: 'OPC — عملیات و بازرسی' },
        { key: 'FPC', label: 'FPC — جریان کامل' },
      ], chartType, function (k) {
        if (chartTypeByProject[projectId] === k) return;
        chartTypeByProject[projectId] = k;
        delete selectedEdgeByProject[projectId]; /* §۶-۶ — ریست با تعویض زبانه (معادل key={chartType} وب) */
        render();
      });
      tabsEl.style.marginTop = '12px';
      root.appendChild(UI.stickyHeading(U.h('div', { style: { paddingBottom: '12px' } },
        U.h('header', { class: 'flex items-center gap-3' },
          U.h('span', { class: 'chip-icon' }, U.icon('workflow')),
          U.h('div', { class: 'flex items-center gap-2 min-w-0' },
            U.h('h1', { class: 'text-xl font-extrabold', text: 'نمودار فرایند — OPC / FPC' }),
            UI.helpDot('نمودار فرایند', HELP_CHART))),
        tabsEl)));
      installHistKeys();
      chartsViewActivePid = projectId;

      /* حالت‌های خالی — عیناً هم‌ارز ChartCanvas.tsx */
      if (!(chart.counts.activitiesTotal > 0)) {
        pdfCtx.el = null;
        root.appendChild(U.h('section', { class: 'card p-6' }, UI.emptyState({
          title: 'هنوز فعالیتی تعریف نشده است',
          desc: 'گره‌های نمودار فرایند به‌صورت خودکار از فعالیت‌های تعریف‌شده در «ساختار تولید» ساخته می‌شوند. ابتدا ایستگاه و فعالیت بسازید.',
          icon: 'workflow',
        })));
        return;
      }
      if (nodes.length === 0) {
        pdfCtx.el = null;
        root.appendChild(U.h('section', { class: 'card p-6' }, UI.emptyState({
          title: chartType === 'OPC' ? 'فعالیتی برای OPC مشمول نیست' : 'گره‌ای برای نمایش نیست',
          desc: chartType === 'OPC'
            ? 'در نمودار OPC فقط فعالیت‌های از نوع «عملیات» و «بازرسی» نمایش داده می‌شوند. فعالیت‌های حمل‌ونقل، تأخیر و انبارش را در نمای FPC ببینید.'
            : 'گره‌ای برای نمایش وجود ندارد.',
          icon: 'workflow',
        })));
        return;
      }

      /* ── ابعاد مؤثر بوم (§۱۵.۶): تنظیم صریح کاربر، حداقل گسترهٔ گره‌ها ── */
      var explicitCanvas = null;
      try {
        if (typeof DB.getChartCanvasSetting === 'function') explicitCanvas = DB.getChartCanvasSetting(projectId, chartType);
      } catch (err) { explicitCanvas = null; }
      var CW = explicitCanvas && explicitCanvas.width ? explicitCanvas.width : chart.canvas.width;
      var CH = explicitCanvas && explicitCanvas.height ? explicitCanvas.height : chart.canvas.height;
      nodes.forEach(function (n) {
        CW = Math.max(CW, n.positionX + NW + MARGIN);
        CH = Math.max(CH, n.positionY + NH + MARGIN);
      });

      /* ── snapshot موجود؟ (برای فعال/غیرفعال کردن «بازگردانی») ── */
      var snapshot = null;
      try {
        if (typeof DB.getChartLayoutSnapshot === 'function') snapshot = DB.getChartLayoutSnapshot(projectId, chartType);
      } catch (err) { snapshot = null; }
      var hasSnapshot = !!(snapshot && snapshot.nodes && snapshot.nodes.length);

      var zoomPctEl = U.h('span', { class: 'zoom-pct num', dir: 'ltr', 'aria-live': 'polite' });

      /* §۶-۶ — یال انتخاب‌شدهٔ معتبر (اگر هنوز موجود باشد) */
      var selectedEdgeId = selectedEdgeByProject[projectId] || null;
      var selectedEdge = null;
      chart.edges.forEach(function (e) { if (e.id === selectedEdgeId) selectedEdge = e; });
      if (!selectedEdge) { selectedEdgeId = null; delete selectedEdgeByProject[projectId]; }

      /* ── نوار ابزار — v1.5.2 §۱۰.۱: دسته‌بندی کاربردی
          [ایجاد/ویرایش] │ [بوم] │ [Undo/Redo §۱۰.۸] │ [زوم] │ [ظاهر/حذف یال §۱۰.۵]
          │ [خروجی PDF تم متمایز] → چیپ‌ها در ms-auto ── */
      var hist = histOf(projectId);
      root.appendChild(U.h('div', { class: 'flex flex-wrap items-center gap-2 mb-1' },
        /* ── ایجاد و ویرایش نمودار ── */
        U.h('div', { class: 'tb-group', role: 'group', 'aria-label': 'ایجاد و ویرایش نمودار' },
          U.h('button', {
            class: 'btn btn-sm btn-brand', type: 'button',
            onclick: function () { openManualNodeDialog(null); },
          }, U.icon('plus'), 'گره دستی'),
          U.h('button', {
            class: 'btn btn-sm btn-ghost', type: 'button',
            onclick: function () {
              try {
                /* §۱۵.۵ — ابتدا چیدمان دستی فعلی به‌عنوان snapshot ذخیره شود */
                var oldNodes = nodes.map(function (n) { return { id: n.id, positionX: n.positionX, positionY: n.positionY }; });
                var oldCanvas = { width: CW, height: CH };
                var positions = DB.autoLayout(nodes, chart.edges);
                DB.saveChartLayout(projectId, chartType, positions);
                if (typeof DB.saveChartLayoutSnapshot === 'function') {
                  DB.saveChartLayoutSnapshot(projectId, chartType, oldNodes, oldCanvas);
                }
                /* §۱۰.۸ — Undo چیدمان خودکار = بازگشت همهٔ مختصات قبلی */
                histPush(projectId, 'چیدمان خودکار', function () {
                  var restore = {};
                  oldNodes.forEach(function (on) { restore[on.id] = { x: on.positionX, y: on.positionY }; });
                  DB.saveChartLayout(projectId, chartType, restore);
                }, function () {
                  DB.saveChartLayout(projectId, chartType, positions);
                });
                UI.toast('چیدمان خودکار اعمال شد؛ چیدمان دستی قبلی ذخیره شد و با «بازگردانی چیدمان دستی» قابل بازیابی است.', { duration: 8000 });
                render();
              } catch (err) { UI.toastError(err); }
            },
          }, U.icon('layers'), 'چیدمان خودکار'),
          U.h('button', {
            class: 'btn btn-sm btn-ghost', type: 'button', disabled: !hasSnapshot,
            title: snapshot && snapshot.savedAt
              ? 'آخرین چیدمان دستی ذخیره‌شده: ' + U.formatDateTime(snapshot.savedAt)
              : 'هنوز چیدمان دستی ذخیره نشده است',
            onclick: function () {
              try {
                var snap = DB.getChartLayoutSnapshot(projectId, chartType);
                if (!snap || !snap.nodes || !snap.nodes.length) {
                  UI.toast('چیدمان دستی ذخیره‌شده‌ای وجود ندارد.', { type: 'error' });
                  return;
                }
                var positions = {};
                snap.nodes.forEach(function (sn) { positions[sn.id] = { x: sn.positionX, y: sn.positionY }; });
                DB.saveChartLayout(projectId, chartType, positions);
                UI.toast('آخرین چیدمان دستی بازگردانی شد.', {
                  description: snap.savedAt ? 'ذخیره‌شده در ' + U.formatDateTime(snap.savedAt) : undefined,
                });
                render();
              } catch (err) { UI.toastError(err); }
            },
          }, U.icon('history'), 'بازگردانی چیدمان دستی')),
        /* ── بوم ── */
        U.h('div', { class: 'tb-group', role: 'group', 'aria-label': 'ابزار بوم' },
          U.h('button', {
            class: 'btn btn-sm btn-ghost', type: 'button',
            onclick: function () { openCanvasSizeDialog(); },
          }, lucideIcon(SVG_RULER), 'ابعاد بوم'),
          U.h('button', {
            class: 'btn btn-sm btn-ghost', type: 'button', 'aria-label': 'بازخوانی نمودار از فعالیت‌ها',
            onclick: function () { render(); },
          }, U.icon('refresh'), 'بازخوانی')),
        /* ── §۱۰.۸ — Undo/Redo ── */
        U.h('div', { class: 'tb-group', role: 'group', 'aria-label': 'واگردانی و ازنو' },
          U.h('button', {
            class: 'icon-btn sm', type: 'button', disabled: hist.index < 0,
            'aria-label': 'واگردانی (Ctrl+Z)', title: hist.index >= 0 ? 'واگردانی: ' + hist.entries[hist.index].label : 'واگردانی',
            onclick: function () { histUndo(projectId); },
          }, lucideIcon(SVG_UNDO)),
          U.h('button', {
            class: 'icon-btn sm', type: 'button', disabled: hist.index >= hist.entries.length - 1,
            'aria-label': 'ازنو (Ctrl+Y)', title: hist.index < hist.entries.length - 1 ? 'ازنو: ' + hist.entries[hist.index + 1].label : 'ازنو',
            onclick: function () { histRedo(projectId); },
          }, lucideIcon(SVG_REDO))),
        U.h('div', { class: 'zoom-group', role: 'group', 'aria-label': 'کنترل زوم' },
          U.h('button', {
            class: 'icon-btn sm', type: 'button', 'aria-label': 'کوچک‌نمایی', title: 'کوچک‌نمایی',
            onclick: function () { zoomFromButton(1 / 1.25); },
          }, lucideIcon(SVG_ZOOM_OUT)),
          zoomPctEl,
          U.h('button', {
            class: 'icon-btn sm', type: 'button', 'aria-label': 'بزرگ‌نمایی', title: 'بزرگ‌نمایی',
            onclick: function () { zoomFromButton(1.25); },
          }, lucideIcon(SVG_ZOOM_IN)),
          U.h('button', {
            class: 'icon-btn sm', type: 'button', 'aria-label': 'جا دادن در نما', title: 'جا دادن در نما',
            onclick: function () { fitToView(); },
          }, lucideIcon(SVG_MAXIMIZE)),
          U.h('button', {
            class: 'btn zoom-reset', type: 'button', 'aria-label': 'بازنشانی زوم به ۱۰۰٪', text: '۱۰۰٪',
            onclick: function () { view.zoom = 1; view.pan.x = 0; view.pan.y = 0; applyTransform(); },
          })),
        /* §۶-۶ + §۱۰.۵ — یال انتخاب‌شده: نوار ظاهر (فقط دستی) یا حذف (زنجیره) */
        selectedEdge && !selectedEdge.isChain
          ? edgeAppearanceBar(selectedEdge)
          : null,
        selectedEdge && selectedEdge.isChain
          ? U.h('button', {
              class: 'btn btn-sm btn-destructive', type: 'button',
              title: 'حذف اتصال انتخاب‌شده (یا کلید Delete)',
              onclick: function () { confirmDeleteEdge(selectedEdge); },
            }, U.icon('trash'), 'حذف اتصال انتخاب‌شده')
          : null,
        /* §۱۰.۱ — خروجی PDF: تم متمایز قرمز، همیشه در دسترس بالای صفحه */
        U.h('button', {
          class: 'btn btn-sm btn-pdf', type: 'button',
          title: 'خروجی PDF نمودار — تک‌صفحه‌ای یا تایل‌دار',
          onclick: function () { openPdfDialog(); },
        }, U.icon('printer'), 'خروجی PDF'),
        /* چیپ‌های شمارش/راهنما — انتهای نوار (ms-auto)، هم‌ارز وب */
        U.h('div', { class: 'flex flex-wrap items-center gap-1.5 text-xs text-muted', style: { marginInlineStart: 'auto' } },
          isExt ? U.h('span', { class: 'chip-ext-opc', role: 'status', text: 'OPC توسعه‌یافته — دارای ورودی مواد/انبار' }) : null,
          allowedTypes.map(function (t) {
            var count = byType[t] || 0;
            return U.h('span', { class: 'legend-chip' + (count ? '' : ' zero') },
              symbolEl(t, 'sm'),
              U.h('span', { text: (TYPE_LABEL[t] || t) + ': ' + U.formatInt(count) }));
          }),
          chart.counts.manual > 0
            ? U.h('span', { class: 'legend-chip', style: { borderStyle: 'dashed' }, text: 'دستی: ' + U.formatInt(chart.counts.manual) })
            : null)));

      /* ── هشدار گره‌های بی‌اتصال ── */
      var connected = {};
      chart.edges.forEach(function (e) { connected[e.sourceNodeId] = true; connected[e.targetNodeId] = true; });
      var unconnected = nodes.filter(function (n) { return !connected[n.id]; }).length;
      if (unconnected > 0) {
        root.appendChild(U.h('div', { class: 'banner warning', role: 'status' }, U.icon('alertTriangle'),
          U.h('div', { text: U.formatInt(unconnected) + ' گره به هیچ گره دیگری متصل نیست؛ برای اتصال، از یکی از چهار لنگر گردِ گره بکشید و روی لنگر گره مقصد رها کنید.' })));
      }

      /* ═══ بوم: viewport (زوم/پن) ← content (transform) ← canvas (مختصات واقعی) ═══ */
      var viewport = U.h('div', {
        class: 'chart-viewport', dir: 'ltr', role: 'application',
        'aria-label': 'بوم نمودار ' + chartType,
      });
      var contentWrap = U.h('div', { class: 'chart-content' });
      var canvasWrap = U.h('div', {
        class: 'chart-canvas-wrap',
        style: { width: CW + 'px', height: CH + 'px' },
      });
      contentWrap.appendChild(canvasWrap);
      viewport.appendChild(contentWrap);
      viewport.appendChild(U.h('div', {
        class: 'chart-hint', dir: 'rtl',
        text: 'چرخ ماوس = زوم · درگ زمینه = جابه‌جایی · کشیدن از لنگر گردِ گره = اتصال',
      }));

      /* یال‌های SVG — §۶-۳: پیکان جهت جریان درشت‌تر (۸px؛ انتخاب‌شده ۹px)
         هم‌رنگ خط — عیناً هم‌ارز ChartCanvas.tsx */
      var svg = svgTag('svg', { class: 'chart-svg', width: CW, height: CH, 'aria-hidden': 'true' });
      var defs = svgTag('defs');
      [['t2c-arrow', 'var(--brand)', 8], ['t2c-arrow-selected', 'var(--brand)', 9]].forEach(function (m) {
        var marker = svgTag('marker', {
          id: m[0], viewBox: '0 0 10 10', refX: 9, refY: 5,
          markerWidth: m[2], markerHeight: m[2], orient: 'auto-start-reverse',
        });
        marker.appendChild(svgTag('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: m[1] }));
        defs.appendChild(marker);
      });
      /* v1.5.2 §۱۰.۵ — پیکان هم‌رنگ یال‌های رنگ‌آمیزی‌شدهٔ دلخواه */
      var customColors = {};
      chart.edges.forEach(function (e) { if (e.lineColor) customColors[e.lineColor] = true; });
      Object.keys(customColors).forEach(function (c) {
        var marker = svgTag('marker', {
          id: 't2c-arrow-c-' + String(c).replace(/[^a-zA-Z0-9]/g, ''), viewBox: '0 0 10 10', refX: 9, refY: 5,
          markerWidth: 8, markerHeight: 8, orient: 'auto-start-reverse',
        });
        marker.appendChild(svgTag('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: c }));
        defs.appendChild(marker);
      });
      svg.appendChild(defs);
      canvasWrap.appendChild(svg);

      /* ارتفاع واقعی هر گره پس از درج در DOM — برای هم‌ترازی لنگرها و مسیر یال‌ها */
      var nodeH = {};
      var nodeEls = {};

      function edgeD(e) {
        var s = nodeById[e.sourceNodeId], t = nodeById[e.targetNodeId];
        var sp = { x: s.positionX, y: s.positionY };
        var tp = { x: t.positionX, y: t.positionY };
        var auto = autoAnchors(sp, tp, nodeH[s.id], nodeH[t.id]);
        var sa = anchorOf(e, 'sourceAnchor') || auto[0];
        var ta = anchorOf(e, 'targetAnchor') || auto[1];
        return orthogonalPath(sp, sa, tp, ta, nodeH[s.id], nodeH[t.id]);
      }
      /* بازترسیم یال‌ها پس از جابه‌جایی گره (درگ/چیدمان) */
      var edgeEls = [];
      function redrawEdges() {
        edgeEls.forEach(function (p) {
          var d = edgeD(p.edge);
          p.visible.setAttribute('d', d);
          p.overlay.setAttribute('d', d);
        });
      }

      chart.edges.forEach(function (e) {
        var s = nodeById[e.sourceNodeId], t = nodeById[e.targetNodeId];
        if (!s || !t) return;
        var isSelected = e.id === selectedEdgeId;
        /* v1.5.2 §۱۰.۵ — ظاهر یال: پیش‌فرض = پیوسته با رنگ استاندارد
           (همانند زنجیره)؛ کاربر می‌تواند خط‌چین/نقطه‌چین/رنگ دلخواه
           تنظیم کند (ماندگار در DB). رنگ‌ها هم‌ارز وب. */
        var lineStyle = e.lineStyle || 'SOLID';
        var customColor = e.lineColor || null;
        var visible = svgTag('path', {
          d: edgeD(e), fill: 'none',
          stroke: customColor || (e.isChain || isSelected ? 'var(--brand)' : 'var(--brand-2)'),
          'stroke-width': isSelected ? 3.5 : (lineStyle === 'SOLID' ? 2 : 2.25),
          'stroke-linecap': lineStyle === 'DOTTED' ? 'round' : 'butt',
          'marker-end': 'url(#' + (isSelected ? 't2c-arrow-selected' : (customColor ? 't2c-arrow-c-' + String(customColor).replace(/[^a-zA-Z0-9]/g, '') : 't2c-arrow')) + ')',
          class: 'chart-edge-line',
        });
        if (!isSelected && !customColor) visible.setAttribute('stroke-opacity', e.isChain ? '0.55' : '0.7');
        if (!isSelected) {
          if (lineStyle === 'DASHED') visible.setAttribute('stroke-dasharray', '6 4');
          else if (lineStyle === 'DOTTED') visible.setAttribute('stroke-dasharray', '1.5 3.5');
        }
        /* مسیر نامرئی پهن برای کلیک راحت — §۶-۶: کلیک = انتخاب (toggle) */
        var overlay = svgTag('path', {
          d: edgeD(e), fill: 'none', stroke: 'transparent', 'stroke-width': 16, 'pointer-events': 'stroke',
        });
        var grp = svgTag('g', { class: 'chart-edge' + (isSelected ? ' selected' : '') });
        grp.style.cursor = 'pointer';
        edgeEls.push({ edge: e, visible: visible, overlay: overlay });
        var title = svgTag('title');
        title.textContent = isSelected
          ? 'اتصال انتخاب‌شده — حذف با دکمهٔ نوار ابزار یا کلید Delete'
          : 'کلیک: انتخاب اتصال';
        overlay.appendChild(title);
        /* کلیک روی گروه (مثل onClick روی <g> در وب) — هم روی خود گروه
           کار می‌کند و هم وقتی هدفِ واقعی کلیک، مسیر شفاف پهن است */
        grp.addEventListener('click', function () {
          if (Date.now() < suppressClickUntil) return;
          /* toggle انتخاب — عیناً مثل وب */
          if (selectedEdgeByProject[projectId] === e.id) delete selectedEdgeByProject[projectId];
          else selectedEdgeByProject[projectId] = e.id;
          render();
        });
        grp.appendChild(visible);
        grp.appendChild(overlay);
        svg.appendChild(grp);
      });

      /* ── گره‌ها ── */
      nodes.forEach(function (n) {
        var el = buildNodeEl(n);
        nodeEls[n.id] = el;
        canvasWrap.appendChild(el);
      });

      /* ── زوم/پن (§۱۵.۳) ── */
      function applyTransform() {
        contentWrap.style.transform = 'translate(' + view.pan.x + 'px, ' + view.pan.y + 'px) scale(' + view.zoom + ')';
        updateZoomLabel();
      }
      function updateZoomLabel() {
        var pct = U.formatInt(Math.round(view.zoom * 100)) + '٪';
        zoomPctEl.textContent = pct;
        viewport.setAttribute('aria-label', 'بوم نمودار ' + chartType + ' — زوم ' + pct);
      }
      function zoomAt(clientX, clientY, factor) {
        var rect = viewport.getBoundingClientRect();
        if (!rect) return;
        var z = view.zoom;
        var nz = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z * factor));
        var cx = clientX - rect.left, cy = clientY - rect.top;
        var chartX = (cx - view.pan.x) / z, chartY = (cy - view.pan.y) / z;
        view.zoom = nz;
        view.pan.x = cx - chartX * nz;
        view.pan.y = cy - chartY * nz;
        applyTransform();
      }
      function zoomFromButton(factor) {
        var rect = viewport.getBoundingClientRect();
        zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, factor);
      }
      function fitToView() {
        var rect = viewport.getBoundingClientRect();
        if (!rect || CW === 0) return;
        var z = Math.min((rect.width - 32) / CW, (rect.height - 32) / CH, 1.5);
        var nz = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));
        view.zoom = nz;
        view.pan.x = Math.max(16, (rect.width - CW * nz) / 2);
        view.pan.y = Math.max(16, (rect.height - CH * nz) / 2);
        applyTransform();
      }
      function toChartCoords(clientX, clientY) {
        var rect = canvasWrap.getBoundingClientRect();
        return { x: (clientX - rect.left) / view.zoom, y: (clientY - rect.top) / view.zoom };
      }

      /* §۶-۴ — چرخ ماوس روی بوم همیشه زوم حول نشانگر است؛ صفحه اسکرول
         نمی‌شود و بوم با چرخ جابه‌جا (Pan) نمی‌شود. جابه‌جایی فقط با درگ
         زمینه. Ctrl/Meta+چرخ نیز زوم می‌ماند (رفتار اشاره‌ای pinch ترک‌پد). */
      viewport.addEventListener('wheel', function (ev) {
        if (ev.cancelable) ev.preventDefault();
        zoomAt(ev.clientX, ev.clientY, ev.deltaY < 0 ? 1.1 : 1 / 1.1);
      }, { passive: false });

      /* درگ زمینه = پن؛ کلیک زمینه = لغو انتخاب */
      viewport.addEventListener('pointerdown', function (ev) {
        if (ev.button > 0) return;
        var t = ev.target;
        if (t && t.closest && (t.closest('.chart-node') || t.closest('.chart-anchor'))) return;
        var startX = ev.clientX, startY = ev.clientY;
        var origX = view.pan.x, origY = view.pan.y, moved = false;
        try { viewport.setPointerCapture(ev.pointerId); } catch (err) { /* رویداد ترکیبی بدون پوینتر فعال */ }
        viewport.classList.add('panning');
        function onMove(mv) {
          var dx = mv.clientX - startX, dy = mv.clientY - startY;
          if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
          view.pan.x = origX + dx;
          view.pan.y = origY + dy;
          applyTransform();
        }
        function finish() {
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', finish);
          window.removeEventListener('pointercancel', finish);
          viewport.classList.remove('panning');
          if (moved) suppressClickUntil = Date.now() + 400;
        }
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', finish);
        window.addEventListener('pointercancel', finish);
      });
      root.appendChild(viewport);
      applyTransform();

      /* اندازه‌گیری ارتفاع واقعی گره‌ها → هم‌ترازی لنگر/یال */
      nodes.forEach(function (n) {
        var el = nodeEls[n.id];
        var h = el ? el.offsetHeight : 0;
        nodeH[n.id] = h > 0 ? h : NH;
      });
      redrawEdges();

      /* §۶-۵ — محدودهٔ واقعی محتوای نمودار (گره‌ها + یال‌ها + پیکان‌ها):
         خروجی PDF فقط همین محدوده را شامل می‌شود، نه کل فضای خالی بوم.
         مختصات ذخیره‌شدهٔ گره‌ها هرگز تغییر نمی‌کند — فقط برش نمایشی.
         (پورت دقیق contentBBox از ChartCanvas.tsx؛ PAD = فاصلهٔ امن)
         مختصات منفی/چیدمان نامتعارف نیز درست پشتیبانی می‌شود. */
      var contentBBox = null;
      (function () {
        var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        function expand(x, y) {
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
        var PAD = 48;
        nodes.forEach(function (n) {
          var h = nodeH[n.id] || NH;
          expand(n.positionX - PAD, n.positionY - PAD);
          expand(n.positionX + NW + PAD, n.positionY + h + PAD);
        });
        chart.edges.forEach(function (e) {
          var sn = nodeById[e.sourceNodeId], tn = nodeById[e.targetNodeId];
          if (!sn || !tn) return;
          var sp = { x: sn.positionX, y: sn.positionY }, tp = { x: tn.positionX, y: tn.positionY };
          var auto = autoAnchors(sp, tp, nodeH[sn.id], nodeH[tn.id]);
          var sa = anchorOf(e, 'sourceAnchor') || auto[0];
          var ta = anchorOf(e, 'targetAnchor') || auto[1];
          elbowPoints(sp, sa, tp, ta, nodeH[sn.id], nodeH[tn.id]).forEach(function (pt) {
            expand(pt.x - PAD, pt.y - PAD);
            expand(pt.x + PAD, pt.y + PAD);
          });
        });
        if (isFinite(minX) && isFinite(maxX)) {
          contentBBox = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
        }
      })();

      /* منبع خروجی PDF — بوم رندرشدهٔ فعلی، برش‌خورده به محدودهٔ محتوا (§۶-۵) */
      pdfCtx.el = canvasWrap;
      if (contentBBox) {
        pdfCtx.w = Math.ceil(contentBBox.w);
        pdfCtx.h = Math.ceil(contentBBox.h);
        /* محتوا با آفست منفی درون قاب برش‌خورده قرار می‌گیرد */
        pdfCtx.cropX = -Math.floor(contentBBox.x);
        pdfCtx.cropY = -Math.floor(contentBBox.y);
      } else {
        pdfCtx.w = CW;
        pdfCtx.h = CH;
        pdfCtx.cropX = 0;
        pdfCtx.cropY = 0;
      }
      pdfCtx.title = (chartType === 'OPC' ? 'نمودار فرایند عملیات (OPC)' : 'نمودار فرایند جریان (FPC)') + (isExt ? ' — توسعه‌یافته' : '');

      /* ═══ اتصال از لنگر به لنگر (§۱۵.۴) ═══ */
      var connectState = null; /* { sourceId, sourceAnchor, x, y } */
      var liveLine = null, liveDot = null, hotAnchor = null;

      function setHotAnchor(el) {
        if (hotAnchor === el) return;
        if (hotAnchor) {
          hotAnchor.classList.remove('anchor-hot');
          var oh = hotAnchor.closest('.chart-node');
          if (oh) oh.classList.remove('node-hot');
        }
        hotAnchor = el || null;
        if (hotAnchor) {
          hotAnchor.classList.add('anchor-hot');
          var nh = hotAnchor.closest('.chart-node');
          if (nh) nh.classList.add('node-hot');
        }
      }
      function updateLiveLine() {
        if (!connectState || !liveLine) return;
        var src = nodeById[connectState.sourceId];
        if (!src) return;
        var sA = anchorPoint({ x: src.positionX, y: src.positionY }, connectState.sourceAnchor, nodeH[src.id]);
        liveLine.setAttribute('d', 'M ' + Math.round(sA.x) + ' ' + Math.round(sA.y) + ' L ' + Math.round(connectState.x) + ' ' + Math.round(connectState.y));
        liveDot.setAttribute('cx', Math.round(connectState.x));
        liveDot.setAttribute('cy', Math.round(connectState.y));
      }
      function onConnectMove(ev) {
        if (!connectState) return;
        var pt = toChartCoords(ev.clientX, ev.clientY);
        connectState.x = pt.x;
        connectState.y = pt.y;
        updateLiveLine();
        var el = document.elementFromPoint(ev.clientX, ev.clientY);
        var anchorEl = el && el.closest ? el.closest('.chart-anchor') : null;
        if (anchorEl && anchorEl.getAttribute('data-node-id') !== connectState.sourceId && anchorEl.getAttribute('data-anchor')) {
          setHotAnchor(anchorEl);
        } else {
          setHotAnchor(null);
        }
      }
      function endConnection() {
        connectState = null;
        window.removeEventListener('pointermove', onConnectMove);
        window.removeEventListener('pointerup', onConnectUp);
        window.removeEventListener('pointercancel', endConnection);
        setHotAnchor(null);
        if (liveLine && liveLine.parentNode) liveLine.parentNode.removeChild(liveLine);
        if (liveDot && liveDot.parentNode) liveDot.parentNode.removeChild(liveDot);
        liveLine = null;
        liveDot = null;
        viewport.classList.remove('connecting');
        cancelConnectFn = null;
      }
      function onConnectUp() {
        if (connectState && hotAnchor) {
          var targetId = hotAnchor.getAttribute('data-node-id');
          var sourceId = connectState.sourceId;
          endConnection();
          try {
            /* v1.5.2 §۱۰.۴ — یال دستی از همان منطق مسیریابی هوشمند یال‌های
               خودکار استفاده می‌کند: anchor تهی = بهترین نقاط اتصال از میان
               هر ۴ ضلع هر دو کارت؛ مسیر با جابه‌جایی کارت‌ها بازمحاسبه می‌شود. */
            var created = DB.createChartEdge(projectId, chartType, sourceId, targetId, { sourceAnchor: null, targetAnchor: null });
            UI.toast('اتصال ایجاد شد.');
            /* §۱۰.۸ — Undo ایجاد یال = حذف؛ Redo = ایجاد مجدد */
            histPush(projectId, 'ایجاد اتصال', function () {
              DB.deleteChartEdge(created.id);
            }, function () {
              DB.createChartEdge(projectId, chartType, sourceId, targetId, { sourceAnchor: null, targetAnchor: null });
            });
          } catch (err) { UI.toastError(err); }
          render();
          return;
        }
        endConnection();
      }
      function startConnection(n, anchorSide, ev) {
        if (ev.button > 0) return;
        if (ev.cancelable) ev.preventDefault();
        ev.stopPropagation();
        if (connectState) return;
        var pt = toChartCoords(ev.clientX, ev.clientY);
        connectState = { sourceId: n.id, sourceAnchor: anchorSide, x: pt.x, y: pt.y };
        viewport.classList.add('connecting');
        liveLine = svgTag('path', { fill: 'none', stroke: 'var(--cyan)', 'stroke-width': 2, 'stroke-dasharray': '5 4' });
        liveDot = svgTag('circle', { r: 4, fill: 'var(--cyan)' });
        svg.appendChild(liveLine);
        svg.appendChild(liveDot);
        updateLiveLine();
        cancelConnectFn = endConnection;
        window.addEventListener('pointermove', onConnectMove);
        window.addEventListener('pointerup', onConnectUp);
        window.addEventListener('pointercancel', endConnection);
      }

      /* ── ساخت یک گره — ساختار/کنترل‌ها عیناً هم‌ارز ChartCanvas.tsx ── */
      function nodeCtrlBtn(iconName, label, disabled, onclick, danger) {
        var b = U.h('button', {
          class: 'node-ctrl-btn' + (danger ? ' danger' : ''), type: 'button',
          'aria-label': label, title: label,
        }, U.icon(iconName));
        if (disabled) b.disabled = true;
        b.addEventListener('click', function (ev) { ev.stopPropagation(); if (!b.disabled) onclick(); });
        return b;
      }
      function moveNodeOrder(n, dir) {
        try {
          DB.moveChartNodeOrder(projectId, chartType, n.id, dir);
          /* §۱۰.۸ — معکوس جابه‌جایی ترتیب، حرکت مخالف همان گره است */
          histPush(projectId, 'تغییر ترتیب گره', function () {
            DB.moveChartNodeOrder(projectId, chartType, n.id, dir === 'up' ? 'down' : 'up');
          }, function () {
            DB.moveChartNodeOrder(projectId, chartType, n.id, dir);
          });
          render();
        }
        catch (err) { UI.toastError(err); }
      }
      function confirmDeleteManualNode(n) {
        /* معادل ConfirmDeleteDialog وب — شمارش وابستگی‌ها (اتصال‌های گره) */
        var edgeCount = chart.edges.filter(function (e) { return e.sourceNodeId === n.id || e.targetNodeId === n.id; }).length;
        UI.confirmDelete({
          title: 'حذف گره دستی',
          name: n.label,
          deps: { 'اتصال‌های این گره': edgeCount },
        }).then(function (ok) {
          if (!ok) return;
          try {
            var snapNode = { label: n.label, nodeType: n.nodeType, positionX: n.positionX, positionY: n.positionY };
            var snapEdges = chart.edges
              .filter(function (e) { return e.sourceNodeId === n.id || e.targetNodeId === n.id; })
              .map(function (e) { return { sourceNodeId: e.sourceNodeId, targetNodeId: e.targetNodeId, lineStyle: e.lineStyle || null, lineColor: e.lineColor || null }; });
            DB.deleteChartNode(n.id);
            UI.toast('گره دستی حذف شد؛ گره‌های خودکار فعالیت‌ها دست‌نخورده‌اند.');
            /* §۱۰.۸ — Undo حذف گره = بازسازی با همان مشخصات/موقعیت + یال‌ها */
            var entry = { label: 'حذف گره «' + n.label + '»', recreatedId: null };
            entry.undo = function () {
              var rn = DB.createManualNode(projectId, chartTypeByProject[projectId], snapNode);
              entry.recreatedId = rn.id;
              DB.updateChartNode(rn.id, { positionX: snapNode.positionX, positionY: snapNode.positionY });
              snapEdges.forEach(function (se) {
                try {
                  var src = se.sourceNodeId === n.id ? rn.id : se.sourceNodeId;
                  var tgt = se.targetNodeId === n.id ? rn.id : se.targetNodeId;
                  var re = DB.createChartEdge(projectId, chartTypeByProject[projectId], src, tgt, { sourceAnchor: null, targetAnchor: null });
                  if (se.lineStyle || se.lineColor) {
                    try { DB.updateChartEdgeAppearance(re.id, { lineStyle: se.lineStyle, lineColor: se.lineColor }); } catch (err2) { /* ظاهر اختیاری */ }
                  }
                } catch (err2) { /* یال تکراری یا نامعتبر — نادیده */ }
              });
            };
            entry.redo = function () {
              if (entry.recreatedId) DB.deleteChartNode(entry.recreatedId);
              else DB.deleteChartNode(n.id);
            };
            histPush(projectId, entry.label, entry.undo, entry.redo);
            render();
          } catch (err) { UI.toastError(err); }
        });
      }
      function showAutoNodeInfo(n) {
        /* معادل دیالوگ «اطلاعات گره خودکار» وب */
        UI.dialog({
          title: n.label,
          bodyBuilder: function (body) {
            body.appendChild(U.h('p', { class: 'text-sm leading-relaxed', text: 'نوع رویداد: ' + (TYPE_LABEL[n.nodeType] || n.nodeType) + (n.stationName ? ' — ' + n.stationName : '') }));
            body.appendChild(U.h('p', {
              class: 'text-sm leading-relaxed', style: { marginTop: '8px' },
              text: 'این گره به‌صورت خودکار از فعالیت «' + n.label + '» ساخته شده است؛ برای تغییر نام یا نوع، فعالیت را در «ساختار تولید» ویرایش کنید.',
            }));
          },
        });
      }

      function buildNodeEl(n) {
        /* §۱۰.۶ — اگر بالای کارت در نمای فعلی جا نیست (نزدیک لبهٔ بالای
           بوم)، نوار ابزار با فاصلهٔ امن زیر کارت قرار می‌گیرد. */
        var toolbarBelow = n.positionY * view.zoom + view.pan.y < 64;
        var el = U.h('div', {
          class: 'chart-node' + (toolbarBelow ? ' ctrl-below' : ''),
          dir: 'rtl', role: 'button', tabindex: '0',
          'aria-label': 'گره ' + U.formatInt(n.sortOrder + 1) + ': ' + n.label,
          style: { left: n.positionX + 'px', top: n.positionY + 'px', touchAction: 'none' },
        },
          /* شماره توالی — گوشهٔ بالا-راست (start در RTL) */
          U.h('span', { class: 'cn-num num', text: U.formatInt(n.sortOrder + 1) }),
          U.h('div', { class: 'flex items-start gap-2.5' },
            symbolEl(n.nodeType, 'md'),
            U.h('div', { class: 'flex-1 min-w-0' },
              U.h('p', { class: 'cn-label', title: n.label, text: n.label }),
              U.h('p', { class: 'cn-sub', text: (TYPE_LABEL[n.nodeType] || n.nodeType) + (n.isManual ? ' · گره دستی' : (n.stationName ? ' · ' + n.stationName : '')) }))),
          /* کنترل‌ها — با هاور یا فوکوس نمایان (هم‌ارز وب) */
          U.h('div', { class: 'node-ctrls' },
            nodeCtrlBtn('arrowUp', 'جابه‌جایی «' + n.label + '» به بالا در توالی', n.sortOrder === 0, function () { moveNodeOrder(n, 'up'); }),
            nodeCtrlBtn('arrowDown', 'جابه‌جایی «' + n.label + '» به پایین در توالی', n.sortOrder === nodes.length - 1, function () { moveNodeOrder(n, 'down'); }),
            n.isManual
              ? nodeCtrlBtn('pencil', 'ویرایش گره «' + n.label + '»', false, function () { openManualNodeDialog(n); })
              : null,
            n.isManual
              ? nodeCtrlBtn('trash', 'حذف گره «' + n.label + '»', false, function () { confirmDeleteManualNode(n); }, true)
              : nodeCtrlBtn('workflow', 'اطلاعات فعالیت «' + n.label + '»', false, function () { showAutoNodeInfo(n); })),
          ANCHOR_SIDES.map(function (a) {
            var sp = U.h('span', {
              class: 'chart-anchor', 'data-node-id': n.id, 'data-anchor': a,
              role: 'button', tabindex: '-1',
              'aria-label': 'لنگر ' + ANCHOR_LABEL[a] + ' گره ' + n.label,
            });
            sp.addEventListener('pointerdown', function (ev) { startConnection(n, a, ev); });
            sp.addEventListener('click', function (ev) { ev.stopPropagation(); });
            return sp;
          }));

        /* درگ با Pointer Events — دلتا تقسیم بر زوم (§۱۵.۳)؛
           ذخیرهٔ خودکار مختصات در pointerup؛ یال‌ها زنده دنبال گره می‌آیند */
        el.addEventListener('pointerdown', function (ev) {
          if (ev.button > 0) return;
          if (ev.target && ev.target.closest && ev.target.closest('.chart-anchor')) return;
          var startX = ev.clientX, startY = ev.clientY;
          var origX = n.positionX, origY = n.positionY;
          var curX = origX, curY = origY, moved = false;
          try { el.setPointerCapture(ev.pointerId); } catch (err) { /* رویداد ترکیبی بدون پوینتر فعال */ }
          el.classList.add('dragging');
          function restore() {
            n.positionX = origX;
            n.positionY = origY;
            el.style.left = origX + 'px';
            el.style.top = origY + 'px';
            redrawEdges();
          }
          function onMove(mv) {
            var dx = (mv.clientX - startX) / view.zoom;
            var dy = (mv.clientY - startY) / view.zoom;
            if (Math.abs(mv.clientX - startX) + Math.abs(mv.clientY - startY) > 3) moved = true;
            curX = Math.round(origX + dx);
            curY = Math.round(origY + dy);
            n.positionX = curX;
            n.positionY = curY;
            el.style.left = curX + 'px';
            el.style.top = curY + 'px';
            redrawEdges();
          }
          function finish() {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', finish);
            window.removeEventListener('pointercancel', finish);
            el.classList.remove('dragging');
            if (!moved) { restore(); return; }
            var x = Math.max(8, curX), y = Math.max(8, curY);
            var pos = {};
            pos[n.id] = { x: x, y: y };
            try {
              DB.saveChartLayout(projectId, chartType, pos);
              n.positionX = x;
              n.positionY = y;
              el.style.left = x + 'px';
              el.style.top = y + 'px';
              redrawEdges();
              /* §۱۰.۸ — Undo جابه‌جایی گره = بازگشت به مختصات قبلی */
              if (origX !== x || origY !== y) {
                var back = {}; back[n.id] = { x: origX, y: origY };
                histPush(projectId, 'جابه‌جایی گره', function () {
                  DB.saveChartLayout(projectId, chartType, back);
                }, function () {
                  DB.saveChartLayout(projectId, chartType, pos);
                });
              }
            } catch (err) {
              UI.toastError(err);
              restore();
            }
            suppressClickUntil = Date.now() + 400;
          }
          window.addEventListener('pointermove', onMove);
          window.addEventListener('pointerup', finish);
          window.addEventListener('pointercancel', finish);
          if (ev.cancelable) ev.preventDefault();
        });

        /* کلیدهای جهت‌نما — جابه‌جایی در توالی (هم‌ارز وب) */
        el.addEventListener('keydown', function (ev) {
          if (ev.key === 'ArrowUp') {
            if (ev.cancelable) ev.preventDefault();
            moveNodeOrder(n, 'up');
          }
          if (ev.key === 'ArrowDown') {
            if (ev.cancelable) ev.preventDefault();
            moveNodeOrder(n, 'down');
          }
        });
        return el;
      }
    }

    /* §۱۰.۸ — آیکون‌های Undo/Redo (lucide undo-2/redo-2) */
    var SVG_UNDO = '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11"/>';
    var SVG_REDO = '<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5A5.5 5.5 0 0 0 9.5 20H13"/>';

    /* §۱۰.۵ — نوار ظاهر یال انتخاب‌شده: نوع خط + رنگ + پیش‌فرض + حذف (هم‌ارز وب) */
    var EDGE_COLORS = [
      { value: null, label: 'رنگ استاندارد' },
      { value: '#7257ff', label: 'بنفش برند' },
      { value: '#0f9d8f', label: 'سبزآبی' },
      { value: '#d97706', label: 'کهربایی' },
      { value: '#dc2626', label: 'قرمز' },
      { value: '#475569', label: 'خاکستری' },
    ];
    function edgeAppearanceBar(edge) {
      var style = edge.lineStyle || 'SOLID';
      function apply(patch) {
        try {
          var before = { lineStyle: edge.lineStyle || null, lineColor: edge.lineColor || null };
          DB.updateChartEdgeAppearance(edge.id, patch);
          histPush(projectId, 'ظاهر اتصال', function () {
            DB.updateChartEdgeAppearance(edge.id, before);
          }, function () {
            DB.updateChartEdgeAppearance(edge.id, patch);
          });
          render();
        } catch (err) { UI.toastError(err); }
      }
      var bar = U.h('div', { class: 'edge-appearance-bar', role: 'group', 'aria-label': 'ظاهر اتصال انتخاب‌شده' },
        U.h('span', { class: 'text-[11px] font-bold', style: { color: 'var(--brand)', paddingInline: '6px' }, text: 'ظاهر اتصال:' }));
      [['SOLID', 'پیوسته'], ['DASHED', 'خط‌چین'], ['DOTTED', 'نقطه‌چین']].forEach(function (st) {
        var dash = st[0] === 'DASHED' ? '5 3' : (st[0] === 'DOTTED' ? '1.5 3.5' : '');
        bar.appendChild(U.h('button', {
          class: 'btn btn-sm btn-ghost ea-style-btn' + (style === st[0] ? ' active' : ''), type: 'button',
          'aria-pressed': String(style === st[0]), title: st[1],
          onclick: function () { apply({ lineStyle: st[0] }); },
        }, (function () {
          var sv = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          sv.setAttribute('width', '26'); sv.setAttribute('height', '8'); sv.setAttribute('aria-hidden', 'true');
          var ln = document.createElementNS('http://www.w3.org/2000/svg', 'line');
          ln.setAttribute('x1', '1'); ln.setAttribute('y1', '4'); ln.setAttribute('x2', '25'); ln.setAttribute('y2', '4');
          ln.setAttribute('stroke', 'currentColor'); ln.setAttribute('stroke-width', '2');
          if (st[0] === 'DOTTED') ln.setAttribute('stroke-linecap', 'round');
          if (dash) ln.setAttribute('stroke-dasharray', dash);
          sv.appendChild(ln);
          return sv;
        })(), st[1]));
      });
      bar.appendChild(U.h('span', { class: 'ea-sep', 'aria-hidden': 'true' }));
      EDGE_COLORS.forEach(function (c) {
        var active = (edge.lineColor || null) === c.value;
        var b = U.h('button', {
          type: 'button', title: 'رنگ یال: ' + c.label, 'aria-label': 'رنگ یال: ' + c.label,
          'aria-pressed': String(active),
          class: 'ea-color-btn' + (active ? ' active' : ''),
        });
        b.style.background = c.value
          ? c.value
          : 'linear-gradient(135deg, var(--brand) 50%, var(--brand-2) 50%)';
        b.addEventListener('click', function () { apply({ lineColor: c.value }); });
        bar.appendChild(b);
      });
      bar.appendChild(U.h('button', {
        class: 'btn btn-sm btn-ghost text-[11px]', type: 'button',
        title: 'بازگشت به ظاهر پیش‌فرض نمودار (پیوسته + رنگ استاندارد)',
        onclick: function () { apply({ lineStyle: null, lineColor: null }); },
      }, 'پیش‌فرض'));
      bar.appendChild(U.h('span', { class: 'ea-sep', 'aria-hidden': 'true' }));
      bar.appendChild(U.h('button', {
        class: 'btn btn-sm btn-destructive', type: 'button',
        title: 'حذف اتصال انتخاب‌شده (یا کلید Delete)',
        onclick: function () { confirmDeleteEdge(selectedEdge || edge); },
      }, U.icon('trash'), 'حذف اتصال'));
      return bar;
    }

    /* §۶-۶ — تأیید حذف یال (دکمهٔ نوار ابزار یا کلید Delete) — متن‌ها هم‌ارز وب */
    function confirmDeleteEdge(edge) {
      UI.confirmDialog({
        title: 'حذف اتصال گره‌ها؟',
        desc: 'این اتصال حذف می‌شود؛ گره‌ها و دادهٔ زمان‌سنجی فعالیت‌ها دست‌نخورده می‌مانند.',
        destructive: true,
        confirmLabel: 'حذف اتصال',
        cancelLabel: 'انصراف',
      }).then(function (ok) {
        if (!ok) return;
        try {
          var snap = { sourceNodeId: edge.sourceNodeId, targetNodeId: edge.targetNodeId, lineStyle: edge.lineStyle || null, lineColor: edge.lineColor || null };
          DB.deleteChartEdge(edge.id);
          delete selectedEdgeByProject[projectId];
          UI.toast('اتصال حذف شد؛ مشاهدات زمان‌سنجی تغییری نکرده‌اند.');
          /* §۱۰.۸ — Undo حذف یال = ایجاد مجدد همان اتصال (مسیر هوشمند + ظاهر) */
          var entry = { label: 'حذف اتصال', recreatedId: null };
          entry.undo = function () {
            var re = DB.createChartEdge(projectId, chartTypeByProject[projectId], snap.sourceNodeId, snap.targetNodeId, { sourceAnchor: null, targetAnchor: null });
            entry.recreatedId = re.id;
            if (snap.lineStyle || snap.lineColor) {
              try { DB.updateChartEdgeAppearance(re.id, { lineStyle: snap.lineStyle, lineColor: snap.lineColor }); } catch (err) { /* ظاهر اختیاری */ }
            }
          };
          entry.redo = function () {
            if (entry.recreatedId) DB.deleteChartEdge(entry.recreatedId);
            else DB.deleteChartEdge(edge.id);
          };
          histPush(projectId, entry.label, entry.undo, entry.redo);
          render();
        } catch (err) { UI.toastError(err); }
      });
    }

    /* ── دیالوگ ساخت/ویرایش گره دستی (§۱۵.۱/۱۵.۲) ── */
    function openManualNodeDialog(existing) {
      var chartType = chartTypeByProject[projectId];
      var allowed = chartType === 'OPC' ? OPC_ALLOWED : FPC_ALLOWED;
      var label = existing ? existing.label : '';
      var nodeType = existing && allowed.indexOf(existing.nodeType) >= 0 ? existing.nodeType : allowed[0];
      var rows = {};
      UI.dialog({
        title: existing ? 'ویرایش گره دستی' : 'گره دستی جدید',
        desc: 'گره‌های دستی برای رویدادهای فاقد فعالیت زمان‌سنجی هستند (مثل ورودی مواد، تأخیر یا انبارش کمکی).',
        bodyBuilder: function (body) {
          var input = U.h('input', {
            class: 'input', type: 'text', value: label,
            placeholder: 'مثلاً: ورودی قطعه از تأمین‌کننده', maxlength: '200',
            'aria-label': 'برچسب گره',
          });
          input.addEventListener('input', function () { label = input.value; });
          body.appendChild(UI.field('برچسب گره *', input));

          var extNote = U.h('p', {
            class: 'text-xs leading-relaxed mt-2', style: { color: 'var(--cyan)', display: 'none' },
            text: 'با افزودن این نوع گره، حالت نمودار به «OPC توسعه‌یافته» تغییر می‌کند تا با تعریف کلاسیک OPC اشتباه نشود.',
          });
          var classicNote = U.h('p', {
            class: 'text-xs text-faint leading-relaxed mt-2', style: { display: 'none' },
            text: 'در OPC کلاسیک، رویدادهای اصلی فقط «عملیات» و «بازرسی» هستند.',
          });
          function refreshNotes() {
            var isExt = chartType === 'OPC' && (nodeType === 'MATERIAL_INPUT' || nodeType === 'STORAGE');
            extNote.style.display = isExt ? 'block' : 'none';
            classicNote.style.display = (chartType === 'OPC' && !isExt) ? 'block' : 'none';
            Object.keys(rows).forEach(function (t) { rows[t].classList.toggle('selected', t === nodeType); });
          }
          var list = U.h('div', { class: 'flex flex-col gap-1.5' },
            allowed.map(function (t) {
              var radio = U.h('input', { type: 'radio', name: 't2c-node-type', value: t, checked: t === nodeType });
              radio.addEventListener('change', function () { if (radio.checked) { nodeType = t; refreshNotes(); } });
              var row = U.h('label', { class: 'node-type-row' },
                radio,
                symbolEl(t, 'sm'),
                U.h('span', { text: TYPE_LABEL[t] || t }),
                (chartType === 'OPC' && (t === 'MATERIAL_INPUT' || t === 'STORAGE'))
                  ? U.h('span', { class: 'text-xs', style: { color: 'var(--cyan)' }, text: '(توسعهٔ اختیاری)' })
                  : null);
              rows[t] = row;
              return row;
            }));
          body.appendChild(U.h('div', { class: 'mt-3' },
            UI.field('نوع رویداد', list), extNote, classicNote));
          refreshNotes();
        },
        footerBuilder: function (close) {
          return U.h('div', { class: 'dialog-footer' },
            U.h('button', { class: 'btn', type: 'button', text: 'انصراف', onclick: close }),
            U.h('div', { class: 'spacer' }),
            U.h('button', {
              class: 'btn btn-brand', type: 'button',
              text: existing ? 'ذخیرهٔ تغییرات' : 'افزودن گره',
              onclick: function () {
                var trimmed = (label || '').trim();
                if (!trimmed) {
                  UI.toast('برچسب گره الزامی است', { type: 'error' });
                  return;
                }
                try {
                  if (existing) {
                    var before = { label: existing.label, nodeType: existing.nodeType };
                    DB.updateChartNode(existing.id, { label: trimmed, nodeType: nodeType });
                    UI.toast('گره به‌روزرسانی شد.');
                    /* §۱۰.۸ — Undo ویرایش گره = بازگشت مقادیر قبلی */
                    histPush(projectId, 'ویرایش گره', function () {
                      DB.updateChartNode(existing.id, before);
                    }, function () {
                      DB.updateChartNode(existing.id, { label: trimmed, nodeType: nodeType });
                    });
                  } else {
                    var created = DB.createManualNode(projectId, chartType, { label: trimmed, nodeType: nodeType });
                    UI.toast('گره دستی به انتهای توالی اضافه شد.');
                    /* §۱۰.۸ — Undo افزودن گره = حذف آن */
                    histPush(projectId, 'افزودن گره «' + trimmed + '»', function () {
                      DB.deleteChartNode(created.id);
                    }, function () {
                      DB.createManualNode(projectId, chartTypeByProject[projectId], { label: trimmed, nodeType: nodeType });
                    });
                  }
                  close();
                  render();
                } catch (err) { UI.toastError(err); }
              },
            }));
        },
      });
    }

    /* ── دیالوگ ابعاد بوم (§۱۵.۶) — مستقل از زوم و PDF ── */
    function openCanvasSizeDialog() {
      var chartType = chartTypeByProject[projectId];
      var current = null;
      try {
        if (typeof DB.getChartCanvasSetting === 'function') current = DB.getChartCanvasSetting(projectId, chartType);
      } catch (err) { current = null; }
      var wStr = String(current && current.width ? current.width : 2000);
      var hStr = String(current && current.height ? current.height : 1200);
      var validate = null, saveBtn = null;
      UI.dialog({
        title: 'ابعاد بوم طراحی',
        desc: 'ابعاد بوم مستقل از زوم نمایش و اندازهٔ کاغذ PDF است و در خود نمودار ذخیره می‌شود. تغییر ابعاد، مختصات گره‌ها را جابه‌جا نمی‌کند.'
          + (current ? '' : ' در حالت خودکار، بوم به اندازهٔ گسترهٔ گره‌ها است.'),
        bodyBuilder: function (body) {
          var wInput = U.h('input', {
            class: 'input num ltr', type: 'text', inputmode: 'numeric', dir: 'ltr',
            value: wStr, 'aria-label': 'عرض بوم (پیکسل)',
          });
          var hInput = U.h('input', {
            class: 'input num ltr', type: 'text', inputmode: 'numeric', dir: 'ltr',
            value: hStr, 'aria-label': 'ارتفاع بوم (پیکسل)',
          });
          var err = U.h('div', { class: 'text-xs', style: { color: 'var(--red)', display: 'none', marginTop: '6px' } });
          validate = function () {
            var w = U.parseNumber(wInput.value), h = U.parseNumber(hInput.value);
            var ok = isFinite(w) && isFinite(h) && w >= 600 && w <= 20000 && h >= 600 && h <= 20000;
            if (ok) {
              wStr = String(Math.round(w));
              hStr = String(Math.round(h));
              err.style.display = 'none';
            } else {
              err.textContent = 'محدودهٔ مجاز: عرض و ارتفاع بین ۶۰۰ تا ۲۰۰۰۰ پیکسل.';
              err.style.display = 'block';
            }
            if (saveBtn) saveBtn.disabled = !ok;
            return ok;
          };
          wInput.addEventListener('input', validate);
          hInput.addEventListener('input', validate);
          body.appendChild(U.h('div', { class: 'grid grid-cols-2 gap-3' },
            UI.field('عرض (پیکسل)', wInput),
            UI.field('ارتفاع (پیکسل)', hInput)));
          body.appendChild(err);
          body.appendChild(U.h('div', { class: 'mt-3' },
            U.h('div', { class: 'field-label' }, 'اندازه‌های آماده'),
            U.h('div', { class: 'flex flex-wrap gap-2' },
              CANVAS_PRESETS.map(function (p) {
                return U.h('button', {
                  class: 'btn btn-sm btn-outline', type: 'button',
                  onclick: function () { wInput.value = String(p.w); hInput.value = String(p.h); validate(); },
                }, p.label);
              }))));
        },
        footerBuilder: function (close) {
          saveBtn = U.h('button', {
            class: 'btn btn-brand', type: 'button', text: 'ذخیرهٔ ابعاد',
            onclick: function () {
              if (!validate || !validate()) return;
              try {
                DB.putChartCanvasSetting(projectId, chartType, Number(wStr), Number(hStr));
                close();
                UI.toast('ابعاد بوم ذخیره شد؛ مختصات گره‌ها تغییر نکرد.');
                render();
              } catch (err2) { UI.toastError(err2); }
            },
          });
          return U.h('div', { class: 'dialog-footer' },
            U.h('button', {
              class: 'btn btn-ghost btn-sm', type: 'button', text: 'بازگشت به خودکار',
              onclick: function () {
                try {
                  DB.resetChartCanvasSetting(projectId, chartType);
                  close();
                  UI.toast('ابعاد بوم به حالت خودکار (گسترهٔ گره‌ها) بازگشت.');
                  render();
                } catch (err2) { UI.toastError(err2); }
              },
            }),
            U.h('div', { class: 'spacer' }),
            U.h('button', { class: 'btn', type: 'button', text: 'انصراف', onclick: close }),
            saveBtn);
        },
      });
    }

    /* ── دیالوگ خروجی PDF (§۱۵.۷) — پورت PdfExportDialog.tsx ── */
    function openPdfDialog() {
      var PAPER_MM = { A4: { w: 210, h: 297 }, A3: { w: 297, h: 420 } };
      var MM_TO_PX = 96 / 25.4;
      var mode = 'fit', paper = 'A4', orientation = 'landscape', marginMm = 10, tiledScale = 100;
      var showTitle = true, showPageNumbers = true;

      function pageMmOf() {
        var b = PAPER_MM[paper];
        return orientation === 'landscape' ? { w: b.h, h: b.w } : { w: b.w, h: b.h };
      }
      function frameOf() {
        var p = pageMmOf();
        return {
          w: Math.max((p.w - marginMm * 2) * MM_TO_PX, 100),
          h: Math.max((p.h - marginMm * 2) * MM_TO_PX - (showTitle ? 34 : 6), 100),
        };
      }

      UI.dialog({
        title: 'خروجی PDF نمودار',
        desc: 'ابعاد بوم طراحی مستقل از اندازهٔ کاغذ است؛ این تنظیمات فقط چاپ را تغییر می‌دهند.',
        bodyBuilder: function (body) {
          /* حالت چاپ */
          var fitScaleEl = U.h('span');
          var tiledDimsEl = U.h('span');
          var fitOpt = U.h('label', { class: 'pdf-mode-opt' },
            U.h('input', { type: 'radio', name: 't2c-pdf-mode', value: 'fit', checked: true }),
            U.h('div', null,
              U.h('div', { class: 'font-bold', style: { fontSize: '13px' }, text: 'جا دادن در یک صفحه (Fit to One Page)' }),
              U.h('div', { class: 'text-xs text-muted', style: { marginTop: '3px', lineHeight: 1.7 } },
                'کل نمودار با حفظ تناسب در یک صفحه کوچک می‌شود؛ بدون برش یا سرریز. ', fitScaleEl)));
          var tiledOpt = U.h('label', { class: 'pdf-mode-opt' },
            U.h('input', { type: 'radio', name: 't2c-pdf-mode', value: 'tiled' }),
            U.h('div', null,
              U.h('div', { class: 'font-bold', style: { fontSize: '13px' }, text: 'چندصفحه‌ای تایل‌دار (Tiled)' }),
              U.h('div', { class: 'text-xs text-muted', style: { marginTop: '3px', lineHeight: 1.7 } },
                'نمودار بزرگ به چند صفحه با ترتیب ردیف/ستون تقسیم می‌شود؛ هر صفحه نشانهٔ برش و هم‌پوشانی چسباندن دارد', tiledDimsEl, '.')));
          fitOpt.querySelector('input').addEventListener('change', function () { if (this.checked) setMode('fit'); });
          tiledOpt.querySelector('input').addEventListener('change', function () { if (this.checked) setMode('tiled'); });

          var warnEl = U.h('div', {
            class: 'banner warning', style: { display: 'none', fontSize: '11.5px' },
            text: 'نمودار تا حد ناخوانا کوچک می‌شود. پیشنهاد: حالت تایل‌دار یا کاغذ A3 افقی را امتحان کنید.',
          });

          /* کاغذ / جهت / حاشیه / مقیاس */
          var paperSel = UI.selectEl(
            [{ value: 'A4', label: 'A4' }, { value: 'A3', label: 'A3' }],
            paper, function (v) { paper = v; refresh(); }, 'اندازهٔ کاغذ');
          var orientSel = UI.selectEl(
            [{ value: 'landscape', label: 'افقی' }, { value: 'portrait', label: 'عمودی' }],
            orientation, function (v) { orientation = v; refresh(); }, 'جهت کاغذ');
          var marginInput = U.h('input', {
            class: 'input num ltr', type: 'text', inputmode: 'numeric', dir: 'ltr',
            value: '10', 'aria-label': 'حاشیه (میلی‌متر)',
          });
          marginInput.addEventListener('input', function () {
            var n = U.parseNumber(marginInput.value);
            if (isFinite(n)) marginMm = Math.min(25, Math.max(5, n));
            refresh();
          });
          marginInput.addEventListener('blur', function () { marginInput.value = String(marginMm); });
          var scaleInput = U.h('input', {
            class: 'input num ltr', type: 'text', inputmode: 'numeric', dir: 'ltr',
            value: '100', 'aria-label': 'مقیاس محتوا (درصد)',
          });
          scaleInput.addEventListener('input', function () {
            var n = U.parseNumber(scaleInput.value);
            if (isFinite(n)) tiledScale = Math.min(200, Math.max(25, Math.round(n)));
            refresh();
          });
          scaleInput.addEventListener('blur', function () { scaleInput.value = String(tiledScale); });
          var scaleField = U.h('div', null, UI.field('مقیاس محتوا (٪)', scaleInput));

          /* کلیدها */
          var titleSwitch = UI.switchEl(true, function (v) { showTitle = v; refresh(); }, 'عنوان روی هر صفحه');
          var numSwitch = UI.switchEl(true, function (v) { showPageNumbers = v; refresh(); }, 'شمارهٔ صفحه');

          /* پیش‌نمایش شماتیک */
          var dimsEl = U.h('p', { class: 'text-xs font-bold mb-2' });
          var gridEl = U.h('div', { class: 'chart-pdf-preview-grid', dir: 'ltr', 'aria-hidden': 'true' });

          function setMode(m) {
            mode = m;
            fitOpt.classList.toggle('selected', m === 'fit');
            tiledOpt.classList.toggle('selected', m === 'tiled');
            scaleField.style.display = m === 'tiled' ? '' : 'none';
            refresh();
          }
          function refresh() {
            var src = pdfCtx.el ? { w: pdfCtx.w, h: pdfCtx.h } : null;
            var pm = pageMmOf();
            var fr = frameOf();
            var fitScale = src ? Math.min(fr.w / src.w, fr.h / src.h) : 1;
            var unreadable = fitScale < 0.4;
            fitScaleEl.textContent = src
              ? 'مقیاس نهایی ≈ ' + U.formatInt(Math.round(fitScale * 100)) + '٪' + (unreadable ? ' — هشدار: کوچک‌تر از حد خوانا!' : '')
              : '';
            fitScaleEl.style.color = unreadable ? 'var(--red)' : '';
            fitScaleEl.style.fontWeight = unreadable ? '700' : '';
            var cols = 1, rows = 1, pages = 1;
            if (src) {
              var s = tiledScale / 100;
              cols = Math.max(1, Math.ceil((src.w * s) / (fr.w - 24)));
              rows = Math.max(1, Math.ceil((src.h * s) / (fr.h - 24)));
              pages = cols * rows;
            }
            tiledDimsEl.textContent = src ? ' — ' + U.formatInt(rows) + '×' + U.formatInt(cols) + ' = ' + U.formatInt(pages) + ' صفحه' : '';
            warnEl.style.display = (mode === 'fit' && unreadable && src) ? 'flex' : 'none';
            U.clear(gridEl);
            gridEl.style.gridTemplateColumns = 'repeat(' + (mode === 'tiled' ? cols : 1) + ', minmax(0, 1fr))';
            gridEl.style.width = mode === 'tiled' ? '100%' : '40%';
            gridEl.style.marginInline = 'auto';
            var count = mode === 'tiled' ? pages : 1;
            for (var i = 0; i < count; i++) {
              gridEl.appendChild(U.h('div', {
                class: 'chart-pdf-page-box',
                style: { aspectRatio: pm.w + ' / ' + pm.h },
                text: String(i + 1),
              }));
            }
            U.clear(dimsEl);
            dimsEl.appendChild(document.createTextNode('پیش‌نمایش صفحه‌بندی — ابعاد بوم: '));
            dimsEl.appendChild(U.h('span', { class: 'num', dir: 'ltr', text: Math.round(pdfCtx.w) + '×' + Math.round(pdfCtx.h) }));
            dimsEl.appendChild(document.createTextNode(' پیکسل'));
          }

          body.appendChild(U.h('div', { class: 'flex flex-col gap-2' }, fitOpt, tiledOpt));
          body.appendChild(U.h('div', { class: 'mt-3' }, warnEl));
          body.appendChild(U.h('div', { class: 'grid grid-cols-2 gap-3 mt-3' },
            UI.field('اندازهٔ کاغذ', paperSel),
            UI.field('جهت', orientSel)));
          body.appendChild(U.h('div', { class: 'grid grid-cols-2 gap-3 mt-3' },
            UI.field('حاشیه (میلی‌متر)', marginInput),
            scaleField));
          body.appendChild(U.h('div', { class: 'flex flex-wrap items-center gap-4 mt-3' },
            U.h('label', { class: 'flex items-center gap-2 text-xs' }, titleSwitch, 'عنوان روی هر صفحه'),
            U.h('label', { class: 'flex items-center gap-2 text-xs' }, numSwitch, 'شمارهٔ صفحه')));
          body.appendChild(U.h('div', {
            class: 'mt-3', style: {
              border: '1px solid var(--border)', borderRadius: 'var(--radius)',
              background: 'var(--surface-2)', padding: '12px',
            },
          }, dimsEl, gridEl, U.h('p', {
            class: 'text-xs text-muted mt-2', style: { fontSize: '11px', lineHeight: 1.7 },
            text: 'پیش‌نمایش دقیق در پنجرهٔ چاپ مرورگر نمایش داده می‌شود. در صورت قطع شدن یال در مرز صفحه، ادامهٔ مسیر در صفحهٔ مجاور (با هم‌پوشانی چسباندن) مشخص است.',
          })));
          setMode('fit');
        },
        footerBuilder: function (close) {
          return U.h('div', { class: 'dialog-footer' },
            U.h('button', { class: 'btn', type: 'button', text: 'انصراف', onclick: close }),
            U.h('div', { class: 'spacer' }),
            U.h('button', {
              class: 'btn btn-brand', type: 'button', text: 'چاپ / ذخیرهٔ PDF',
              onclick: function () { doPrint(); },
            }));
        },
      });

      /* پیاده‌سازی چاپ — پورت print() از PdfExportDialog.tsx */
      function doPrint() {
        var srcEl = pdfCtx.el;
        if (!srcEl || !srcEl.isConnected) return;
        var src = { contentEl: srcEl, chartWidth: pdfCtx.w, chartHeight: pdfCtx.h, chartTitle: pdfCtx.title };
        var pm = pageMmOf();
        var fr = frameOf();
        var s = mode === 'fit' ? Math.min(fr.w / src.chartWidth, fr.h / src.chartHeight) : tiledScale / 100;
        var overlap = 24; /* هم‌پوشانی برای چسباندن صفحات */
        var tiled = { cols: 1, rows: 1, pages: 1 };
        if (mode === 'tiled') {
          tiled.cols = Math.max(1, Math.ceil((src.chartWidth * s) / (fr.w - overlap)));
          tiled.rows = Math.max(1, Math.ceil((src.chartHeight * s) / (fr.h - overlap)));
          tiled.pages = tiled.cols * tiled.rows;
        }

        var style = document.createElement('style');
        style.id = 'chart-pdf-page-style';
        style.textContent = '@page { size: ' + pm.w + 'mm ' + pm.h + 'mm; margin: 0 }';
        document.head.appendChild(style);

        var rootEl = document.createElement('div');
        rootEl.id = 'chart-pdf-root';
        var pages = [];
        function mkPage(col, row, idx, total, inner) {
          return '<div class="chart-pdf-page" style="width:' + pm.w + 'mm;height:' + pm.h + 'mm">'
            + '<div class="chart-pdf-crop chart-pdf-crop-tl"></div><div class="chart-pdf-crop chart-pdf-crop-tr"></div>'
            + '<div class="chart-pdf-crop chart-pdf-crop-bl"></div><div class="chart-pdf-crop chart-pdf-crop-br"></div>'
            + '<div class="chart-pdf-frame" style="position:absolute;inset:' + marginMm + 'mm;overflow:hidden">'
            + (showTitle
              ? '<div class="chart-pdf-title">' + U.escapeHtml(src.chartTitle) + (mode === 'tiled' ? ' — بخش (ردیف ' + (row + 1) + '، ستون ' + (col + 1) + ')' : '') + '</div>'
              : '')
            + '<div class="chart-pdf-viewport" style="width:' + fr.w + 'px;height:' + fr.h + 'px;overflow:hidden;position:relative">' + inner + '</div>'
            + (showPageNumbers
              ? '<div class="chart-pdf-num">صفحهٔ ' + idx + ' از ' + total + (mode === 'tiled' ? ' — ردیف ' + (row + 1) + '، ستون ' + (col + 1) : '') + '</div>'
              : '')
            + '</div></div>';
        }

        var content = src.contentEl.outerHTML;
        /* §۶-۵ — برش به محدودهٔ واقعی محتوا: محتوا با آفست برش داخل قاب می‌نشیند */
        var crop = { x: pdfCtx.cropX || 0, y: pdfCtx.cropY || 0 };
        var cropped = '<div style="position:absolute;left:' + crop.x + 'px;top:' + crop.y + 'px">' + content + '</div>';
        if (mode === 'fit') {
          var offX = Math.max(0, (fr.w - src.chartWidth * s) / 2);
          var offY = Math.max(0, (fr.h - src.chartHeight * s) / 2);
          pages.push(mkPage(0, 0, 1, 1,
            '<div style="position:absolute;left:' + offX + 'px;top:' + offY + 'px;width:' + src.chartWidth + 'px;height:' + src.chartHeight + 'px;transform:scale(' + s + ');transform-origin:0 0">' + cropped + '</div>'));
        } else {
          var vw = fr.w - overlap, vh = fr.h - overlap;
          var idx = 1;
          for (var row = 0; row < tiled.rows; row++) {
            for (var col = 0; col < tiled.cols; col++) {
              var tx = -(col * vw) / s, ty = -(row * vh) / s;
              pages.push(mkPage(col, row, idx, tiled.pages,
                '<div style="position:absolute;left:0;top:0;width:' + src.chartWidth + 'px;height:' + src.chartHeight + 'px;transform:translate(' + tx + 'px,' + ty + 'px) scale(' + s + ');transform-origin:0 0">' + cropped + '</div>'));
              idx++;
            }
          }
        }
        rootEl.innerHTML = pages.join('');
        fixCloneMarkerIds(rootEl);

        /* استایل چاپ اختصاصی — مستقل از UI برنامه + رنگ‌های روشن چاپ */
        var css = document.createElement('style');
        css.id = 'chart-pdf-print-css';
        css.textContent = ''
          + '#chart-pdf-root { --card:#ffffff; --foreground:#0c1424; --border:#c9cedb; --line-strong:#b9c1d0; --muted-foreground:#5a6b85; --surface-2:#f4f6fa; --surface-3:#eef2f7; --brand:#7257ff; --brand-2:#9a7cff; --brand-soft:#efeaff; --cyan:#0e93a4; --cyan-soft:#e5fbfd; --green:#18b77b; --green-soft:#dcf8ec; --red:#ef5b6b; --red-soft:#fde5e8; --amber:#b9831b; --amber-soft:#fff4d7; --radius:12px; color-scheme: light; }'
          + '#chart-pdf-root .chart-pdf-page { position: relative; background: #fff; overflow: hidden; box-sizing: border-box; }'
          + '#chart-pdf-root .chart-pdf-page + .chart-pdf-page { page-break-before: always; }'
          + '#chart-pdf-root .chart-pdf-title { font: bold 12px Vazirmatn, sans-serif; color: #111; text-align: center; margin-bottom: 6px; direction: rtl; }'
          + '#chart-pdf-root .chart-pdf-num { font: 10px Vazirmatn, sans-serif; color: #444; text-align: center; margin-top: 4px; direction: rtl; }'
          + '#chart-pdf-root .chart-pdf-crop { position: absolute; width: 10mm; height: 10mm; border-color: #555; }'
          + '#chart-pdf-root .chart-pdf-crop-tl { top: 3mm; left: 3mm; border-top: 1px solid #555; border-left: 1px solid #555; }'
          + '#chart-pdf-root .chart-pdf-crop-tr { top: 3mm; right: 3mm; border-top: 1px solid #555; border-right: 1px solid #555; }'
          + '#chart-pdf-root .chart-pdf-crop-bl { bottom: 3mm; left: 3mm; border-bottom: 1px solid #555; border-left: 1px solid #555; }'
          + '#chart-pdf-root .chart-pdf-crop-br { bottom: 3mm; right: 3mm; border-bottom: 1px solid #555; border-right: 1px solid #555; }'
          + '#chart-pdf-root .chart-anchor { display: none !important; }'
          + '#chart-pdf-root .chart-node { box-shadow: none; }'
          + '@media print {'
          + ' body > *:not(#chart-pdf-root) { display: none !important; }'
          + ' #chart-pdf-root { display: block !important; }'
          + ' #chart-pdf-root .chart-pdf-page { break-inside: avoid; }'
          + ' #chart-pdf-root * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }'
          + '}'
          + '@media screen { #chart-pdf-root { display: none; } }';
        document.head.appendChild(css);
        document.body.appendChild(rootEl);

        var cleaned = false;
        function cleanup() {
          if (cleaned) return;
          cleaned = true;
          if (rootEl.parentNode) rootEl.parentNode.removeChild(rootEl);
          if (css.parentNode) css.parentNode.removeChild(css);
          if (style.parentNode) style.parentNode.removeChild(style);
          window.removeEventListener('afterprint', cleanup);
        }
        window.addEventListener('afterprint', cleanup);
        window.print();
        /* پاک‌سازی پشتیبان برای مرورگرهایی که afterprint نمی‌دهند */
        setTimeout(cleanup, 60000);

        UI.toast(mode === 'fit'
          ? 'خروجی تک‌صفحه‌ای آماده شد — در پنجرهٔ چاپ، «Save as PDF» را انتخاب کنید.'
          : 'خروجی تایل‌دار (' + U.formatInt(tiled.pages) + ' صفحه) آماده شد — صفحات را با نشانه‌های برش به هم بچسبانید.',
          { duration: 8000 });
      }
    }

    /* ESC → لغو اتصال در جریان (اگر دیالوگی باز نباشد) */
    if (escListener) document.removeEventListener('keydown', escListener);
    escListener = function (e) {
      if (e.key !== 'Escape') return;
      if (!root.isConnected) return;
      if (document.querySelector('.dialog-overlay')) return;
      if (cancelConnectFn) cancelConnectFn();
    };
    document.addEventListener('keydown', escListener);

    /* §۶-۶ — حذف یال انتخاب‌شده با Delete/Backspace (فقط وقتی یال انتخاب
       شده، کاربر داخل فیلد متنی تایپ نمی‌کند و دیالوگی باز نیست) */
    if (delEdgeListener) document.removeEventListener('keydown', delEdgeListener);
    delEdgeListener = function (e) {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      if (!root.isConnected) return;
      var eid = selectedEdgeByProject[projectId];
      if (!eid) return;
      var t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (document.querySelector('.dialog-overlay')) return; /* دیالوگ باز است */
      var ch;
      try { ch = DB.getChart(projectId, chartTypeByProject[projectId]); } catch (err) { return; }
      var edge = null;
      (ch.edges || []).forEach(function (e2) { if (e2.id === eid) edge = e2; });
      if (!edge) return;
      if (e.cancelable) e.preventDefault();
      confirmDeleteEdge(edge); /* تأییدیهٔ حذف باز می‌شود */
    };
    document.addEventListener('keydown', delEdgeListener);

    render();
  };

  /* یکتا کردن id نشانگرهای SVG کلون‌شده (چند صفحه = چند کلون) */
  function fixCloneMarkerIds(rootEl) {
    try {
      var svgs = rootEl.querySelectorAll('svg');
      Array.prototype.forEach.call(svgs, function (sv) {
        var markers = sv.querySelectorAll('marker');
        Array.prototype.forEach.call(markers, function (mk) {
          var oldId = mk.getAttribute('id');
          if (!oldId) return;
          var newId = oldId + '-pdf-' + Math.random().toString(36).slice(2, 8);
          mk.setAttribute('id', newId);
          var refs = sv.querySelectorAll('[marker-end]');
          Array.prototype.forEach.call(refs, function (p) {
            if (p.getAttribute('marker-end') === 'url(#' + oldId + ')') {
              p.setAttribute('marker-end', 'url(#' + newId + ')');
            }
          });
        });
      });
    } catch (err) { /* در صورت خطا، نشانگرها معمولاً با id تکراری هم رندر می‌شوند */ }
  }
})(typeof window !== 'undefined' ? window : globalThis);
