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
  /* v1.5.3 §۵-هـ — آیکون تمام‌صفحه (چهار گوشه) */
  var SVG_EXPAND = '<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>';
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

  /* ═══════════════════════════════════════════════════════════
     سند چاپ حرفه‌ای نمودار — پورت کامل و هم‌ارز chart-print.ts (وب)
     ▸ سند چاپ از «دادهٔ» نمودار ساخته می‌شود، نه کلون DOM بوم:
       – بدون شبکهٔ نقطه‌ای، بدون قاب خط‌چین، بدون هیچ اسکرول‌باری؛
       – برچسب گره‌ها کامل و چندخطی چاپ می‌شود (بدون «…» برش)؛
       – مسیر یال‌ها با ارتفاع واقعی کارت‌های چاپی بازمحاسبه می‌شود؛
       – خروجی برداری (متن قابل انتخاب) از موتور چاپ مرورگر.
     ▸ همان ثابت‌ها/CSS/صفحه‌بندی نسخهٔ وب — هم‌ارزی کامل.
     ═══════════════════════════════════════════════════════════ */
  var PRINT_NODE_W = NW;      /* عرض کارت چاپی = عرض کارت بوم */
  var PRINT_PAD = 36;         /* فاصلهٔ امن اطراف محتوا */
  var TILED_OVERLAP = 24;     /* هم‌پوشانی چسباندن صفحات تایل‌دار */
  var TITLE_BLOCK_PX = 68;    /* ارتفاع رزرو عنوان + تاریخ + شمارهٔ صفحه (اندازه‌گیری واقعی + حاشیهٔ اطمینان) */
  var PRINT_PAPER_MM = { A4: { w: 210, h: 297 }, A3: { w: 297, h: 420 } };
  var PRINT_MM_TO_PX = 96 / 25.4;

  var PRINT_SYMBOL_COLORS = {
    OPERATION: '#7257ff',
    INSPECTION: '#b9831b',
    TRANSPORT: '#5f6f88',
    DELAY: '#ef5b6b',
    STORAGE: '#18b77b',
    MATERIAL_INPUT: '#0e93a4',
  };
  var PRINT_TYPE_LABELS = {
    OPERATION: 'عملیات', INSPECTION: 'بازرسی', TRANSPORT: 'حمل‌ونقل',
    DELAY: 'تأخیر', STORAGE: 'انبارش', MATERIAL_INPUT: 'ورودی مواد/قطعات',
  };
  var PRINT_SYMBOL_SHAPES = {
    OPERATION: '<circle cx="12" cy="12" r="8.5"/>',
    INSPECTION: '<rect x="4.5" y="4.5" width="15" height="15" rx="2"/>',
    TRANSPORT: '<path d="M4 11.1 12.4 4.3v4.3H20v5h-7.6v4.3z"/>',
    DELAY: '<path d="M5 5h7.6a7 7 0 0 1 0 14H5z"/>',
    STORAGE: '<path d="M4.5 5.5h15L12 19.6z"/>',
    MATERIAL_INPUT: '<path d="M12 3.6 19.7 8v8L12 20.4 4.3 16V8z"/>',
  };

  function printEscapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function printSymbolSvg(t) {
    var color = PRINT_SYMBOL_COLORS[t] || PRINT_SYMBOL_COLORS.OPERATION;
    var shape = PRINT_SYMBOL_SHAPES[t] || PRINT_SYMBOL_SHAPES.OPERATION;
    return '<svg viewBox="0 0 24 24" width="24" height="24" xmlns="http://www.w3.org/2000/svg" fill="' + color + '" fill-opacity="0.12" ' +
      'stroke="' + color + '" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">' + shape + '</svg>';
  }

  /* CSS مشترک کارت‌های چاپی — برای اندازه‌گیری (screen) و چاپ (print) یکی است */
  var CHART_PRINT_CSS = ''
    + '.chart-print-card { position: absolute; width: ' + PRINT_NODE_W + 'px; box-sizing: border-box; direction: rtl; '
    + 'background: #ffffff; border: 1px solid #b9c2d0; border-radius: 8px; padding: 8px 10px 7px; '
    + "font-family: Vazirmatn, 'Segoe UI', Tahoma, sans-serif; break-inside: avoid; }"
    + '.chart-print-card .cp-num { position: absolute; top: -9px; inset-inline-start: -9px; width: 20px; height: 20px; '
    + 'border-radius: 50%; background: #ffffff; border: 1px solid #b9c2d0; color: #33415c; font-size: 10.5px; '
    + 'font-weight: 700; display: inline-flex; align-items: center; justify-content: center; }'
    + '.chart-print-card .cp-head { display: flex; align-items: flex-start; gap: 7px; }'
    + '.chart-print-card .cp-sym { flex-shrink: 0; width: 24px; height: 24px; display: inline-flex; }'
    + '.chart-print-card .cp-sym svg { width: 24px; height: 24px; display: block; }'
    + '.chart-print-card .cp-label { font-size: 12.5px; font-weight: 700; line-height: 1.55; color: #0c1424; '
    + 'overflow-wrap: break-word; word-break: break-word; min-width: 0; }'
    + '.chart-print-card .cp-sub { margin-top: 3px; font-size: 10.5px; line-height: 1.5; color: #5a6b85; }'
    + '.chart-print-svg { position: absolute; inset: 0; overflow: visible; pointer-events: none; }';

  var printSharedStyleEl = null;
  var printSharedStyleRefs = 0;
  function acquirePrintSharedStyle() {
    if (!printSharedStyleEl || !printSharedStyleEl.isConnected) {
      printSharedStyleEl = document.createElement('style');
      printSharedStyleEl.id = 'chart-print-shared-css';
      printSharedStyleEl.textContent = CHART_PRINT_CSS;
      document.head.appendChild(printSharedStyleEl);
    }
    printSharedStyleRefs++;
    return printSharedStyleEl;
  }
  function releasePrintSharedStyle() {
    printSharedStyleRefs = Math.max(0, printSharedStyleRefs - 1);
    if (printSharedStyleRefs === 0 && printSharedStyleEl && printSharedStyleEl.isConnected) {
      printSharedStyleEl.parentNode.removeChild(printSharedStyleEl);
    }
  }

  function printCardHtml(n) {
    var sub = (PRINT_TYPE_LABELS[n.nodeType] || n.nodeType) +
      (n.isManual ? ' · گره دستی' : (n.stationName ? ' · ' + n.stationName : ''));
    return '<span class="cp-num">' + printEscapeHtml(String(n.sortOrder + 1)) + '</span>' +
      '<div class="cp-head"><span class="cp-sym">' + printSymbolSvg(n.nodeType) + '</span>' +
      '<div class="cp-label">' + printEscapeHtml(n.label) + '</div></div>' +
      '<div class="cp-sub">' + printEscapeHtml(sub) + '</div>';
  }

  /* اندازه‌گیری ارتفاع واقعی کارت چاپی (برچسب چندخطی) — offscreen */
  function measurePrintCardHeight(n) {
    var measurer = document.createElement('div');
    measurer.style.cssText = 'position:fixed;left:-99999px;top:0;visibility:hidden;pointer-events:none;';
    var card = document.createElement('div');
    card.className = 'chart-print-card';
    card.style.width = PRINT_NODE_W + 'px';
    card.innerHTML = printCardHtml(n);
    measurer.appendChild(card);
    document.body.appendChild(measurer);
    var h = card.offsetHeight;
    measurer.parentNode.removeChild(measurer);
    return h > 0 ? Math.ceil(h) : NH;
  }

  /* چیدمان سند چاپ: نرمال‌سازی مختصات به (۰،۰) + مسیر یال‌ها با ارتفاع چاپی.
     نکتهٔ حیاتی: CSS مشترک کارت‌های چاپی «قبل از اندازه‌گیری» تزریق
     می‌شود — بدون آن svg نماد ۳۰۰×۱۵۰px پیش‌فرض می‌شود و ارتفاع کارت
     به‌شدت متورم می‌شود (مسیر یال‌ها از کارت‌ها جدا می‌شد). */
  function buildPrintLayout(src) {
    if (!src || !src.nodes || !src.nodes.length) return { width: 100, height: 100, cards: [], paths: [] };
    acquirePrintSharedStyle();
    try {
      var heights = {};
      src.nodes.forEach(function (n) { heights[n.id] = measurePrintCardHeight(n); });

      var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      src.nodes.forEach(function (n) {
        var h = heights[n.id] || NH;
        minX = Math.min(minX, n.x - PRINT_PAD);
        minY = Math.min(minY, n.y - PRINT_PAD);
        maxX = Math.max(maxX, n.x + PRINT_NODE_W + PRINT_PAD);
        maxY = Math.max(maxY, n.y + h + PRINT_PAD);
      });
      if (!isFinite(minX)) return { width: 100, height: 100, cards: [], paths: [] };

      var cards = src.nodes.map(function (n) {
        var h = heights[n.id] || NH;
        var c = {}; for (var k in n) c[k] = n[k];
        c.printX = n.x - minX;
        c.printY = n.y - minY;
        c.height = h;
        return c;
      });
      var nodeMap = {};
      cards.forEach(function (c) { nodeMap[c.id] = c; });

      var paths = [];
      (src.edges || []).forEach(function (e) {
        var s = nodeMap[e.sourceId], t = nodeMap[e.targetId];
        if (!s || !t) return;
        var sp = { x: s.printX, y: s.printY }, tp = { x: t.printX, y: t.printY };
        var auto = autoAnchors(sp, tp, s.height, t.height);
        var sa = e.sourceAnchor || auto[0];
        var ta = e.targetAnchor || auto[1];
        paths.push({ edge: e, d: orthogonalPath(sp, sa, tp, ta, s.height, t.height) });
      });

      /* گستره نهایی: یال‌ها هم نباید بیرون قاب بمانند */
      var w = maxX - minX, h2 = maxY - minY;
      paths.forEach(function (p) {
        var nums = p.d.match(/-?\d+(?:\.\d+)?/g);
        if (!nums) return;
        for (var i = 0; i + 1 < nums.length; i += 2) {
          w = Math.max(w, Number(nums[i]) + PRINT_PAD);
          h2 = Math.max(h2, Number(nums[i + 1]) + PRINT_PAD);
        }
      });
      return { width: Math.ceil(w), height: Math.ceil(h2), cards: cards, paths: paths };
    } finally {
      releasePrintSharedStyle();
    }
  }

  function printMarkerId(color, pageIdx) {
    var suffix = color ? '-c-' + String(color).replace(/[^a-zA-Z0-9]/g, '') : '';
    return 'pdf-arrow' + suffix + '-p' + pageIdx;
  }
  function printSvgForLayout(layout, pageIdx) {
    var seen = {}, colors = [];
    layout.paths.forEach(function (p) { if (p.edge.lineColor && !seen[p.edge.lineColor]) { seen[p.edge.lineColor] = 1; colors.push(p.edge.lineColor); } });
    function mk(id, fill, size) {
      return '<marker id="' + id + '" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="' + size + '" markerHeight="' + size + '" orient="auto-start-reverse">' +
        '<path d="M 0 0 L 10 5 L 0 10 z" fill="' + fill + '"/></marker>';
    }
    var defs = mk(printMarkerId(null, pageIdx), '#7257ff', 8);
    colors.forEach(function (c) { defs += mk(printMarkerId(c, pageIdx), c, 8); });

    var paths = '';
    layout.paths.forEach(function (p) {
      var style = p.edge.lineStyle || 'SOLID';
      var dash = style === 'DASHED' ? ' stroke-dasharray="6 4"' : (style === 'DOTTED' ? ' stroke-dasharray="1.5 3.5" stroke-linecap="round"' : '');
      var stroke = p.edge.lineColor || '#7257ff';
      var opacity = p.edge.lineColor ? 1 : (p.edge.isChain ? 0.8 : 1);
      paths += '<path d="' + p.d + '" fill="none" stroke="' + stroke + '" stroke-opacity="' + opacity + '" stroke-width="2"' + dash +
        ' marker-end="url(#' + printMarkerId(p.edge.lineColor, pageIdx) + ')"/>';
    });
    return '<svg class="chart-print-svg" width="' + layout.width + '" height="' + layout.height + '" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<defs>' + defs + '</defs>' + paths + '</svg>';
  }

  /* ساخت سند کامل چاپ — #chart-pdf-root به body افزوده می‌شود؛ خروجی cleanup */
  function buildPrintDocument(src, layout, opts) {
    var base = PRINT_PAPER_MM[opts.paper];
    var pm = opts.orientation === 'landscape' ? { w: base.h, h: base.w } : { w: base.w, h: base.h };
    var frame = {
      w: Math.max((pm.w - opts.marginMm * 2) * PRINT_MM_TO_PX, 100),
      h: Math.max((pm.h - opts.marginMm * 2) * PRINT_MM_TO_PX - (opts.showTitle ? TITLE_BLOCK_PX : 6), 100),
    };
    var fitScale = Math.min(frame.w / layout.width, frame.h / layout.height);
    var s = opts.mode === 'fit' ? fitScale : opts.tiledScale / 100;
    var overlap = TILED_OVERLAP;
    var cols = 1, rows = 1;
    if (opts.mode === 'tiled') {
      cols = Math.max(1, Math.ceil((layout.width * s) / (frame.w - overlap)));
      rows = Math.max(1, Math.ceil((layout.height * s) / (frame.h - overlap)));
    }
    var pagesCount = cols * rows;

    var pageStyle = document.createElement('style');
    pageStyle.id = 'chart-pdf-page-style';
    pageStyle.textContent = '@page { size: ' + pm.w + 'mm ' + pm.h + 'mm; margin: 0 }';

    function chartAreaHtml(pageIdx) {
      var cardsHtml = '';
      layout.cards.forEach(function (c) {
        cardsHtml += '<div class="chart-print-card" style="left:' + Math.round(c.printX) + 'px;top:' + Math.round(c.printY) + 'px">' + printCardHtml(c) + '</div>';
      });
      return '<div class="chart-print-area" style="position:relative;width:' + layout.width + 'px;height:' + layout.height + 'px">' +
        printSvgForLayout(layout, pageIdx) + cardsHtml + '</div>';
    }
    function mkPage(col, row, idx, inner) {
      var dateStr = new Date().toLocaleDateString('fa-IR');
      return '<div class="chart-pdf-page" style="width:' + pm.w + 'mm;height:' + pm.h + 'mm">' +
        '<div class="chart-pdf-crop chart-pdf-crop-tl"></div><div class="chart-pdf-crop chart-pdf-crop-tr"></div>' +
        '<div class="chart-pdf-crop chart-pdf-crop-bl"></div><div class="chart-pdf-crop chart-pdf-crop-br"></div>' +
        '<div class="chart-pdf-frame" style="position:absolute;inset:' + opts.marginMm + 'mm;overflow:hidden">' +
        (opts.showTitle
          ? '<div class="chart-pdf-title">' + printEscapeHtml(src.chartTitle) + (opts.mode === 'tiled' ? ' — بخش (ردیف ' + (row + 1) + '، ستون ' + (col + 1) + ')' : '') + '</div>' +
            '<div class="chart-pdf-sub">تاریخ چاپ: ' + dateStr + '</div>'
          : '') +
        '<div class="chart-pdf-viewport" style="width:' + Math.floor(frame.w) + 'px;height:' + Math.floor(frame.h) + 'px;overflow:hidden;position:relative">' + inner + '</div>' +
        (opts.showPageNumbers
          ? '<div class="chart-pdf-num">صفحهٔ ' + idx + ' از ' + pagesCount + (opts.mode === 'tiled' ? ' — ردیف ' + (row + 1) + '، ستون ' + (col + 1) : '') + '</div>'
          : '') +
        '</div></div>';
    }

    var pages = [];
    if (opts.mode === 'fit') {
      var offX = Math.max(0, (frame.w - layout.width * s) / 2);
      var offY = Math.max(0, (frame.h - layout.height * s) / 2);
      pages.push(mkPage(0, 0, 1,
        '<div style="position:absolute;left:' + offX + 'px;top:' + offY + 'px;transform:scale(' + s + ');transform-origin:0 0">' + chartAreaHtml(0) + '</div>'));
    } else {
      var vw = frame.w - overlap, vh = frame.h - overlap;
      var idx = 1;
      for (var row = 0; row < rows; row++) {
        for (var col = 0; col < cols; col++) {
          /* صفحهٔ (col,row) از نقطهٔ chart مبنای col*vw/s نمایش می‌دهد:
             جای‌گذاری = -s*(col*vw/s) = -col*vw (تصحیح مقیاس تایل‌دار) */
          var tx = -(col * vw), ty = -(row * vh);
          pages.push(mkPage(col, row, idx,
            '<div style="position:absolute;left:0;top:0;transform:translate(' + tx + 'px,' + ty + 'px) scale(' + s + ');transform-origin:0 0">' + chartAreaHtml(idx - 1) + '</div>'));
          idx++;
        }
      }
    }

    var rootEl = document.createElement('div');
    rootEl.id = 'chart-pdf-root';
    rootEl.innerHTML = pages.join('');

    var css = document.createElement('style');
    css.id = 'chart-pdf-print-css';
    css.textContent = ''
      + '#chart-pdf-root { color-scheme: light; color: #0c1424; font-family: Vazirmatn, "Segoe UI", Tahoma, sans-serif; }'
      + '#chart-pdf-root, #chart-pdf-root * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }'
      + '#chart-pdf-root .chart-pdf-page { position: relative; background: #fff; overflow: hidden; box-sizing: border-box; }'
      + '#chart-pdf-root .chart-pdf-page + .chart-pdf-page { page-break-before: always; }'
      + '#chart-pdf-root .chart-pdf-title { font: bold 13px Vazirmatn, sans-serif; color: #111; text-align: center; margin-bottom: 2px; direction: rtl; }'
      + '#chart-pdf-root .chart-pdf-sub { font: 10px Vazirmatn, sans-serif; color: #555; text-align: center; margin-bottom: 6px; direction: rtl; }'
      + '#chart-pdf-root .chart-pdf-num { font: 10px Vazirmatn, sans-serif; color: #444; text-align: center; margin-top: 4px; direction: rtl; }'
      + '#chart-pdf-root .chart-pdf-crop { position: absolute; width: 10mm; height: 10mm; border-color: #555; }'
      + '#chart-pdf-root .chart-pdf-crop-tl { top: 3mm; left: 3mm; border-top: 1px solid #555; border-left: 1px solid #555; }'
      + '#chart-pdf-root .chart-pdf-crop-tr { top: 3mm; right: 3mm; border-top: 1px solid #555; border-right: 1px solid #555; }'
      + '#chart-pdf-root .chart-pdf-crop-bl { bottom: 3mm; left: 3mm; border-bottom: 1px solid #555; border-left: 1px solid #555; }'
      + '#chart-pdf-root .chart-pdf-crop-br { bottom: 3mm; right: 3mm; border-bottom: 1px solid #555; border-right: 1px solid #555; }'
      + '@media print {'
      + ' body > *:not(#chart-pdf-root) { display: none !important; }'
      + ' #chart-pdf-root { display: block !important; }'
      /* CSS چاپ گزارش‌ها (app.css) «body *» را visibility:hidden می‌کند؛
         بدون بازگرداندن آن برای سند نمودار، خروجی PDF سفید می‌شد. */
      + ' #chart-pdf-root, #chart-pdf-root * { visibility: visible !important; }'
      + ' #chart-pdf-root .chart-pdf-page { break-inside: avoid; }'
      + '}'
      + '@media screen { #chart-pdf-root { display: none; } }';

    acquirePrintSharedStyle();
    document.head.appendChild(pageStyle);
    document.head.appendChild(css);
    document.body.appendChild(rootEl);

    var cleaned = false;
    function cleanup() {
      if (cleaned) return;
      cleaned = true;
      if (rootEl.parentNode) rootEl.parentNode.removeChild(rootEl);
      if (css.parentNode) css.parentNode.removeChild(css);
      if (pageStyle.parentNode) pageStyle.parentNode.removeChild(pageStyle);
      releasePrintSharedStyle();
    }
    return { root: rootEl, cleanup: cleanup, pagesCount: pagesCount };
  }

  /* قلاب تست مرورگر — برای راستی‌آزمایی خروجی PDF با ابزار پردازش تصویر */
  g.__T2C_PDF_TEST__ = { buildPrintLayout: buildPrintLayout, buildPrintDocument: buildPrintDocument };

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
    try { e.undo(); h.index--; UI.toast('برگشت به عقب: ' + e.label); }
    catch (err) { UI.toastError(err); }
    histBusy = false;
    if (histRender) histRender();
  }
  function histRedo(pid) {
    var h = histOf(pid);
    if (h.index >= h.entries.length - 1 || histBusy) return;
    var e = h.entries[h.index + 1];
    histBusy = true;
    try { e.redo(); h.index++; UI.toast('رفتن به جلو: ' + e.label); }
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
  var clickEdgeListener = null;  /* v1.5.3 §۵-ب — کلیک خارج یال = لغو انتخاب */
  var fsBtnRef = null;           /* v1.5.3 §۵-هـ — مرجع دکمهٔ تمام‌صفحه برای Esc */
  function exitFullscreen() {
    var rootEl = document.querySelector('.charts-fs');
    if (rootEl) rootEl.classList.remove('charts-fs');
    if (fsBtnRef) {
      fsBtnRef.setAttribute('aria-label', 'تمام‌صفحه');
      fsBtnRef.title = 'نمایش نمودار در تمام صفحه — محیط طراحی بازتر با همهٔ ابزارها';
      fsBtnRef.classList.remove('icon-btn-brand');
    }
  }

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
    /* دادهٔ خروجی PDF — snapshot دادهٔ نمودار (نه DOM)؛ در هر رندر تازه
       می‌شود و پس از درگ گره نیز به‌روز می‌گردد (سند چاپ از داده ساخته می‌شود) */
    var pdfData = null;

    function render() {
      cancelConnectFn = null;
      histRender = render; /* §۱۰.۸ — تاریخچه پس از هر رندر خودش را ثبت می‌کند */
      U.clear(root);
      var chartType = chartTypeByProject[projectId];
      var view = getViewState(projectId + '|' + chartType);
      var chart;
      try { chart = DB.getChart(projectId, chartType); }
      catch (err) {
        pdfData = null;
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

      /* v1.5.2 نهایی §۴ — بلوک چسبان واحد: هدر صفحه + زبانه‌های OPC/FPC +
         «همهٔ» ابزارها (آیکونی با نام کامل در title) — هنگام اسکرول هم‌اهنگ
         زیر TopBar فریز می‌شوند. در حالت خالی فقط هدر + زبانه‌ها. */
      var tabsEl = UI.tabsBar([
        { key: 'OPC', label: 'OPC — عملیات و بازرسی' },
        { key: 'FPC', label: 'FPC — جریان کامل' },
      ], chartType, function (k) {
        if (chartTypeByProject[projectId] === k) return;
        chartTypeByProject[projectId] = k;
        delete selectedEdgeByProject[projectId]; /* §۶-۶ — ریست با تعویض زبانه (معادل key={chartType} وب) */
        render();
      });
      tabsEl.classList.add('tabs-inline'); /* ظاهر فشردهٔ درون‌ردیفی در نوار چسبان */
      var headerEl = U.h('header', { class: 'flex items-center gap-3' },
        U.h('span', { class: 'chip-icon' }, U.icon('workflow')),
        U.h('div', { class: 'flex items-center gap-2 min-w-0' },
          U.h('h1', { class: 'text-xl font-extrabold', text: 'نمودار فرایند — OPC / FPC' }),
          UI.helpDot('نمودار فرایند', HELP_CHART)));
      function mountSticky(toolbarRow) {
        root.appendChild(UI.stickyHeading(U.h('div', { style: { paddingBottom: '12px' } },
          headerEl,
          U.h('div', { class: 'flex flex-wrap items-center gap-2', style: { marginTop: '12px' } },
            tabsEl,
            toolbarRow || null))));
      }
      installHistKeys();
      chartsViewActivePid = projectId;

      /* حالت‌های خالی — عیناً هم‌ارز ChartCanvas.tsx */
      if (!(chart.counts.activitiesTotal > 0)) {
        pdfData = null;
        mountSticky(null);
        root.appendChild(U.h('section', { class: 'card p-6' }, UI.emptyState({
          title: 'هنوز فعالیتی تعریف نشده است',
          desc: 'گره‌های نمودار فرایند به‌صورت خودکار از فعالیت‌های تعریف‌شده در «ساختار تولید» ساخته می‌شوند. ابتدا ایستگاه و فعالیت بسازید.',
          icon: 'workflow',
        })));
        return;
      }
      if (nodes.length === 0) {
        pdfData = null;
        mountSticky(null);
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

      /* ── نوار ابزار — v1.5.2 نهایی §۴: در همان بلوک چسبانِ زبانه‌ها،
          [ایجاد/ویرایش] │ [بوم] │ [برگشت به عقب/رفتن به جلو §۱۰.۸] │ [زوم]
          │ [ظاهر/حذف یال §۱۰.۵] │ [خروجی PDF تم متمایز] — دکمه‌ها آیکونی؛
          نام کامل فقط در title (هاور) نمایش داده می‌شود ── */
      var hist = histOf(projectId);
      /* v1.5.3 §۵-هـ — دکمهٔ تمام‌صفحه: ریشهٔ نما روی کل صفحه می‌نشیند و بوم
         فضای باقی‌مانده را می‌گیرد؛ همهٔ ابزارها در نوار چسبان در دسترس می‌مانند.
         ورود = جا دادن نمودار در فضای جدید؛ خروج = Esc یا همین دکمه */
      var fsBtnEl = null;
      function fsIsOn() { return root.classList.contains('charts-fs'); }
      function syncFsBtn() {
        if (!fsBtnEl) return;
        var on = fsIsOn();
        fsBtnRef = fsBtnEl;
        fsBtnEl.setAttribute('aria-label', on ? 'خروج از تمام‌صفحه' : 'تمام‌صفحه');
        fsBtnEl.title = on
          ? 'خروج از حالت تمام‌صفحه (Esc)'
          : 'نمایش نمودار در تمام صفحه — محیط طراحی بازتر با همهٔ ابزارها';
        fsBtnEl.classList.toggle('icon-btn-brand', on);
      }
      function toggleFullscreen() {
        var on = root.classList.toggle('charts-fs');
        syncFsBtn();
        if (on) setTimeout(function () { try { fitToView(); } catch (e) { /* فقط راحتی */ } }, 60);
      }
      function buildFullscreenBtn() {
        fsBtnEl = U.h('button', {
          class: 'icon-btn sm', type: 'button',
          'aria-label': 'تمام‌صفحه',
          title: 'نمایش نمودار در تمام صفحه — محیط طراحی بازتر با همهٔ ابزارها',
          onclick: function () { toggleFullscreen(); },
        }, lucideIcon(SVG_EXPAND));
        syncFsBtn();
        return fsBtnEl;
      }

      var toolbarRow = U.h('div', { class: 'flex flex-wrap items-center gap-2' },
        /* ── ایجاد و ویرایش نمودار ── */
        U.h('div', { class: 'tb-group', role: 'group', 'aria-label': 'ایجاد و ویرایش نمودار' },
          U.h('button', {
            class: 'icon-btn sm icon-btn-brand', type: 'button',
            'aria-label': 'گره دستی', title: 'گره دستی جدید',
            onclick: function () { openManualNodeDialog(null); },
          }, U.icon('plus')),
          U.h('button', {
            class: 'icon-btn sm', type: 'button',
            'aria-label': 'چیدمان خودکار', title: 'چیدمان خودکار',
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
          }, U.icon('layers')),
          U.h('button', {
            class: 'icon-btn sm', type: 'button', disabled: !hasSnapshot,
            'aria-label': 'بازگردانی چیدمان دستی',
            title: 'بازگردانی چیدمان دستی' + (snapshot && snapshot.savedAt
              ? '\nآخرین چیدمان ذخیره‌شده: ' + U.formatDateTime(snapshot.savedAt)
              : '\nهنوز چیدمان دستی ذخیره نشده است'),
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
          }, U.icon('history'))),
        /* ── بوم ── */
        U.h('div', { class: 'tb-group', role: 'group', 'aria-label': 'ابزار بوم' },
          U.h('button', {
            class: 'icon-btn sm', type: 'button',
            'aria-label': 'ابعاد بوم', title: 'ابعاد بوم',
            onclick: function () { openCanvasSizeDialog(); },
          }, lucideIcon(SVG_RULER)),
          U.h('button', {
            class: 'icon-btn sm', type: 'button', 'aria-label': 'بازخوانی نمودار از فعالیت‌ها',
            title: 'بازخوانی نمودار از فعالیت‌ها',
            onclick: function () { render(); },
          }, U.icon('refresh'))),
        /* ── §۱۰.۸ — برگشت به عقب / رفتن به جلو (نام کامل در title) ── */
        U.h('div', { class: 'tb-group', role: 'group', 'aria-label': 'برگشت به عقب و رفتن به جلو' },
          U.h('button', {
            class: 'icon-btn sm', type: 'button', disabled: hist.index < 0,
            'aria-label': 'برگشت به عقب (Ctrl+Z)',
            title: 'برگشت به عقب — Ctrl+Z' + (hist.index >= 0 ? '\n' + hist.entries[hist.index].label : '\nعملی برای واگردانی نیست'),
            onclick: function () { histUndo(projectId); },
          }, lucideIcon(SVG_UNDO)),
          U.h('button', {
            class: 'icon-btn sm', type: 'button', disabled: hist.index >= hist.entries.length - 1,
            'aria-label': 'رفتن به جلو (Ctrl+Y)',
            title: 'رفتن به جلو — Ctrl+Y' + (hist.index < hist.entries.length - 1 ? '\n' + hist.entries[hist.index + 1].label : '\nعملی برای اجرای مجدد نیست'),
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
          title: 'خروجی PDF نمودار — تک‌صفحه‌ای یا تایل‌دار (برداری از دادهٔ نمودار)',
          onclick: function () { openPdfDialog(); },
        }, U.icon('printer'), 'PDF'),
        /* v1.5.3 §۵-هـ — تمام‌صفحه: محیط طراحی بازتر با همهٔ ابزارها (OPC و FPC) */
        buildFullscreenBtn());
      mountSticky(toolbarRow);

      /* چیپ‌های شمارش/راهنما — ردیف مستقل زیر بلوک چسبان (نوار فشرده بماند) */
      root.appendChild(U.h('div', { class: 'flex flex-wrap items-center gap-1.5 text-xs text-muted' },
        isExt ? U.h('span', { class: 'chip-ext-opc', role: 'status', text: 'OPC توسعه‌یافته — دارای ورودی مواد/انبار' }) : null,
        allowedTypes.map(function (t) {
          var count = byType[t] || 0;
          return U.h('span', { class: 'legend-chip' + (count ? '' : ' zero') },
            symbolEl(t, 'sm'),
            U.h('span', { text: (TYPE_LABEL[t] || t) + ': ' + U.formatInt(count) }));
        }),
        chart.counts.manual > 0
          ? U.h('span', { class: 'legend-chip', style: { borderStyle: 'dashed' }, text: 'دستی: ' + U.formatInt(chart.counts.manual) })
          : null));

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
        /* §۵ — ارتفاع کادر بوم = کل ارتفاع محتوای بوم در زوم فعلی (حداقل ۷۲vh):
           دیگر نیازی به اسکرول/پن عمودی داخل کادر نیست؛ صفحه خودش اسکرول می‌شود. */
        viewport.style.height = 'max(72vh, ' + Math.ceil(CH * view.zoom + 48) + 'px)';
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

      /* درگ زمینه = پن؛ کلیک زمینه = لغو انتخاب.
         §۱ — نکتهٔ حیاتی: pointerdown روی «یال» هرگز پن را آغاز نمی‌کند؛
         setPointerCapture روی viewport رویداد click را می‌ربود و انتخاب یال
         هرگز اجرا نمی‌شد (علت واقعی «انتخاب‌نشدن یال‌ها» در هر دو نسخه). */
      viewport.addEventListener('pointerdown', function (ev) {
        if (ev.button > 0) return;
        var t = ev.target;
        if (t && t.closest && (t.closest('.chart-node') || t.closest('.chart-anchor') || t.closest('.chart-edge'))) return;
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
      /* v1.5.3 §۵-الف — نام/زیرنویس چندخطی: اگر کارت بلندتر از برآورد NH
         شد، بوم تا انتهای واقعی بلندترین کارت گسترش می‌یابد تا کارت
         پایینی هرگز بریده نشود */
      var neededH = CH;
      nodes.forEach(function (n) {
        neededH = Math.max(neededH, n.positionY + (nodeH[n.id] || NH) + MARGIN);
      });
      if (neededH > CH) {
        CH = Math.ceil(neededH);
        canvasWrap.style.height = CH + 'px';
        svg.setAttribute('height', String(CH));
      }
      redrawEdges();

      /* دادهٔ خروجی PDF — snapshot دادهٔ نمودار (نه DOM). سند چاپ در
         buildPrintLayout/buildPrintDocument از همین داده ساخته می‌شود:
         بدون شبکهٔ نقطه‌ای/قاب خط‌چین/اسکرول‌بار، برچسب کامل چندخطی. */
      pdfData = {
        chartTitle: (chartType === 'OPC' ? 'نمودار فرایند عملیات (OPC)' : 'نمودار فرایند جریان (FPC)') + (isExt ? ' — توسعه‌یافته' : ''),
        nodes: nodes.map(function (n) {
          return {
            id: n.id, label: n.label, nodeType: n.nodeType,
            x: n.positionX, y: n.positionY, sortOrder: n.sortOrder,
            isManual: !!n.isManual, stationName: n.stationName || null,
          };
        }),
        edges: chart.edges
          .filter(function (e) { return nodeById[e.sourceNodeId] && nodeById[e.targetNodeId]; })
          .map(function (e) {
            return {
              sourceId: e.sourceNodeId, targetId: e.targetNodeId,
              sourceAnchor: anchorOf(e, 'sourceAnchor'), targetAnchor: anchorOf(e, 'targetAnchor'),
              lineStyle: e.lineStyle || null, lineColor: e.lineColor || null,
              isChain: !!e.isChain,
            };
          }),
      };

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
        /* §۲ — نوار ابزار هاور در «گوشهٔ موربِ بیرون کارت» قرار می‌گیرد تا
           هرگز روی هیچ‌کدام از چهار لنگر اصلی کارت ننشیند؛ اگر کارت نزدیک
           لبهٔ بالا/راست نمای فعلی است، به گوشهٔ مقابل چرخش می‌کند. */
        var toolbarBelow = n.positionY * view.zoom + view.pan.y < 72;
        var toolbarLeft = (n.positionX + NW) * view.zoom + view.pan.x > (viewport.clientWidth || 1280) - 220;
        var el = U.h('div', {
          class: 'chart-node' + (toolbarBelow ? ' ctrl-below' : '') + (toolbarLeft ? ' ctrl-left' : ''),
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
          /* کنترل‌ها — با هاور یا فوکوس نمایان (هم‌ارز وب)
             v1.5.3 §۵-د — دکمه‌های جابه‌جایی بالا/پایین حذف شدند (بی‌کاربرد؛
             ترتیب با کشیدن اتصال یا کلیدهای جهت‌نما روی گرهٔ فعال تغییر می‌کند) */
          U.h('div', { class: 'node-ctrls' },
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
           ذخیرهٔ خودکار مختصات در pointerup؛ یال‌ها زنده دنبال گره می‌آیند.
           §۲ — کلیک روی دکمه‌های نوار ابزار هرگز درگ را آغاز نمی‌کند
           (setPointerCapture دکمه را می‌رباید و click هرگز نمی‌رسید —
           علت بی‌اثر بودن ابزارهای ویرایش/حذف/جابه‌جایی در آفلاین). */
        el.addEventListener('pointerdown', function (ev) {
          if (ev.button > 0) return;
          if (ev.target && ev.target.closest && (ev.target.closest('.chart-anchor') || ev.target.closest('button'))) return;
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
              /* دادهٔ PDF نیز با مختصات جدید به‌روز شود (رندری در کار نیست) */
              if (pdfData) {
                pdfData.nodes.forEach(function (pn) {
                  if (pn.id === n.id) { pn.x = x; pn.y = y; }
                });
              }
              /* §۱۰.۸ — Undo جابه‌جایی گره = بازگشت به مختصات قبلی */
              if (origX !== x || origY !== y) {
                var back = {}; back[n.id] = { x: origX, y: origY };
                histPush(projectId, 'جابه‌جایی گره', function () {
                  DB.saveChartLayout(projectId, chartType, back);
                  if (pdfData) {
                    pdfData.nodes.forEach(function (pn) {
                      if (pn.id === n.id) { pn.x = origX; pn.y = origY; }
                    });
                  }
                }, function () {
                  DB.saveChartLayout(projectId, chartType, pos);
                  if (pdfData) {
                    pdfData.nodes.forEach(function (pn) {
                      if (pn.id === n.id) { pn.x = x; pn.y = y; }
                    });
                  }
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
        /* v1.5.3 §۵-ج — رفع باگ: ارجاع به selectedEditor که خارج از render
           تعریف نشده بود باعث ReferenceError و بی‌اثر شدن دکمه برای یال‌های
           دستی می‌شد؛ خود پارامتر edge همان یال انتخاب‌شده است */
        onclick: function () { confirmDeleteEdge(edge); },
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

    /* ── دیالوگ خروجی PDF (§۱۵.۷) — پورت PdfExportDialog.tsx؛
       سند چاپ از «دادهٔ» نمودار ساخته می‌شود (buildPrintDocument) ── */
    function openPdfDialog() {
      var mode = 'fit', paper = 'A4', orientation = 'landscape', marginMm = 10, tiledScale = 100;
      var showTitle = true, showPageNumbers = true;

      /* چیدمان چاپ یک‌بار در لحظهٔ باز شدن دیالوگ محاسبه می‌شود —
         برچسب‌ها کامل اندازه‌گیری و مسیر یال‌ها بازمحاسبه می‌شوند */
      var printLayout = pdfData && pdfData.nodes.length ? buildPrintLayout(pdfData) : null;

      function pageMmOf() {
        var b = PRINT_PAPER_MM[paper];
        return orientation === 'landscape' ? { w: b.h, h: b.w } : { w: b.w, h: b.h };
      }
      function frameOf() {
        var p = pageMmOf();
        return {
          w: Math.max((p.w - marginMm * 2) * PRINT_MM_TO_PX, 100),
          h: Math.max((p.h - marginMm * 2) * PRINT_MM_TO_PX - (showTitle ? TITLE_BLOCK_PX : 22), 100),
        };
      }

      UI.dialog({
        title: 'خروجی PDF نمودار',
        desc: 'سند چاپ به‌صورت برداری از دادهٔ نمودار ساخته می‌شود — بدون اسکرول‌بار و با برچسب‌های کامل. ابعاد بوم طراحی مستقل از اندازهٔ کاغذ است.',
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
          var titleSwitch = UI.switchEl(true, function (v) { showTitle = v; refresh(); }, 'عنوان و تاریخ چاپ');
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
            var src = printLayout ? { w: printLayout.width, h: printLayout.height } : null;
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
            dimsEl.appendChild(document.createTextNode('پیش‌نمایش صفحه‌بندی — ابعاد محتوای نمودار: '));
            dimsEl.appendChild(U.h('span', { class: 'num', dir: 'ltr', text: Math.round(src ? src.w : 0) + '×' + Math.round(src ? src.h : 0) }));
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
            U.h('label', { class: 'flex items-center gap-2 text-xs' }, titleSwitch, 'عنوان و تاریخ چاپ'),
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

      /* پیاده‌سازی چاپ — سند حرفه‌ای برداری از «دادهٔ» نمودار (پورت print()
         از PdfExportDialog.tsx وب؛ سازندهٔ مشترک buildPrintDocument) */
      function doPrint() {
        if (!pdfData || !pdfData.nodes.length) return;
        var layout = printLayout && printLayout.cards && printLayout.cards.length
          ? printLayout
          : buildPrintLayout(pdfData);
        var built = buildPrintDocument(pdfData, layout, {
          mode: mode, paper: paper, orientation: orientation,
          marginMm: marginMm, tiledScale: tiledScale,
          showTitle: showTitle, showPageNumbers: showPageNumbers,
        });

        var cleaned = false;
        function cleanup() {
          if (cleaned) return;
          cleaned = true;
          built.cleanup();
          window.removeEventListener('afterprint', cleanup);
        }
        window.addEventListener('afterprint', cleanup);
        window.print();
        /* پاک‌سازی پشتیبان برای مرورگرهایی که afterprint نمی‌دهند */
        setTimeout(cleanup, 60000);

        UI.toast(mode === 'fit'
          ? 'خروجی تک‌صفحه‌ای آماده شد — در پنجرهٔ چاپ، «Save as PDF» را انتخاب کنید.'
          : 'خروجی تایل‌دار (' + U.formatInt(built.pagesCount) + ' صفحه) آماده شد — صفحات را با نشانه‌های برش به هم بچسبانید.',
          { duration: 8000 });
      }
    }

    /* ESC → لغو اتصال در جریان (اگر دیالوگی باز نباشد)؛ خروج از تمام‌صفحه */
    if (escListener) document.removeEventListener('keydown', escListener);
    escListener = function (e) {
      if (e.key !== 'Escape') return;
      if (!root.isConnected) return;
      if (document.querySelector('.dialog-overlay')) return;
      if (root.classList.contains('charts-fs')) { exitFullscreen(); return; }
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

    /* v1.5.3 §۵-ب — کلیک روی هر جای دیگر صفحه = خروج یال از حالت انتخاب.
       کلیک روی خود یال، نوار چسبان ابزارها و دیالوگ‌ها محافظت می‌شود؛
       درگ گره/زمینه با suppressClickUntil کنترل می‌شود. */
    if (clickEdgeListener) document.removeEventListener('click', clickEdgeListener);
    clickEdgeListener = function (ev) {
      if (!root.isConnected) return;
      if (Date.now() < suppressClickUntil) return;
      if (document.querySelector('.dialog-overlay')) return;
      var t = ev.target;
      if (t && t.closest && (t.closest('.chart-edge') || t.closest('.sticky-heading') || t.closest('.helpdot-pop') || t.closest('.dd-menu'))) return;
      if (selectedEdgeByProject[projectId]) {
        delete selectedEdgeByProject[projectId];
        render();
      }
    };
    document.addEventListener('click', clickEdgeListener);

    render();
  };
})(typeof window !== 'undefined' ? window : globalThis);
