/* ═══════════════════════════════════════════════════════════
   views-dashboard.js — مرحلهٔ «داشبورد تحلیل»
   پورت وفادار از DashboardView نسخهٔ وب (فاز ۶ / FR-21):
   • کارت‌های خلاصه: ST کل، میانگین چرخه، نمونهٔ معتبر، وضعیت هدف —
     مقدار ساختگی هرگز نمایش داده نمی‌شود؛ علت نشان داده می‌شود
   • نمودارها و شاخص‌ها در بخش‌های بازشونده: مقایسهٔ فعالیت‌ها،
     توزیع وضعیت مشاهدات، مقایسهٔ اپراتورها، پراکندگی عناصر (CV٪)
     و نیازهای بازبینی با میان‌بر اقدام
   • شخصی‌سازی: ترتیب/مرئی‌بودن کارت‌ها و نمودارها — ذخیره در
     تنظیمات پروژه ('dash.layout') و ماندگار بین بارگذاری‌ها
   ═══════════════════════════════════════════════════════════ */
(function (g) {
  'use strict';
  var U = g.T2U, DB = g.T2DB, UI = g.T2UI;
  g.T2VIEWS = g.T2VIEWS || {};

  /* کلیدهای معتبر چیدمان — هماهنگ با قرارداد 'dash.layout' */
  var DEFAULT_CARDS = ['st', 'meanCycle', 'samples', 'target'];
  var DEFAULT_WIDGETS = ['activities', 'statusDonut', 'operators', 'elementCv', 'reviewNeeds'];

  var HELP_DASHBOARD = {
    what: 'نمای کلی مطالعه با کارت‌های خلاصه و شاخص‌های تخصصی؛ همهٔ اعداد از دادهٔ واقعی محاسبه می‌شوند.',
    input: 'شخصی‌سازی کنید: کارت‌ها و نمودارها را مرتب، مخفی یا نمایان کنید — چیدمان ذخیره می‌شود.',
    example: 'اگر فقط «پراکندگی عناصر» برایتان مهم است، بقیهٔ نمودارها را مخفی کنید تا داشبورد ساده بماند.',
    note: 'کارت‌ها هرگز مقدار ساختگی نشان نمی‌دهند؛ اگر داده کافی نباشد، علت را می‌بینید.',
  };

  var CARD_META = {
    st: {
      title: 'زمان استاندارد کل پروژه', icon: 'sigma',
      help: {
        what: 'جمع زمان استاندارد (ST) همهٔ فعالیت‌های پروژه؛ فقط وقتی قابل ارائه است که همهٔ فعالیت‌ها قابل محاسبه و ترتیبی باشند.',
        input: 'به‌صورت خودکار از داده‌های ثبت‌شده محاسبه می‌شود؛ ورودی مستقیم ندارد.',
        example: 'اگر دو فعالیت با ST برابر ۱۰٫۴ و ۸٫۲ ثانیه داشته باشید، کل پروژه ۱۸٫۶ ثانیه است.',
        note: 'فعالیت دارای کار هم‌زمان نیازمند «قاعدهٔ تجمیع» است و در جمع ساده وارد نمی‌شود؛ کارت علت را نشان می‌دهد.',
      },
    },
    meanCycle: {
      title: 'میانگین زمان چرخه', icon: 'timer',
      help: {
        what: 'میانگین وزنی زمان سپری‌شدهٔ چرخه‌های قابل استفاده در کل پروژه.',
        input: 'از چرخه‌های کامل بدون دادهٔ خارج‌شده/نامعتبر محاسبه می‌شود.',
        example: 'اگر ۱۰ چرخه با میانگین ۲۵ ثانیه و ۵ چرخه با میانگین ۲۸ ثانیه دارید، میانگین وزنی ۲۶ ثانیه است.',
        note: 'برای چرخه‌های دارای بازهٔ هم‌زمان، «گسترهٔ بازه‌ها» ملاک است نه جمع مدت‌ها.',
      },
    },
    samples: {
      title: 'تعداد نمونهٔ معتبر', icon: 'layers',
      help: {
        what: 'مجموع چرخه‌های کامل معتبر همهٔ فعالیت‌ها؛ مبنای شمارش، چرخهٔ بدون مشاهدهٔ خارج‌شده/نامعتبر است.',
        input: 'با ثبت داده در مرحلهٔ زمان‌سنجی به‌روز می‌شود.',
        example: '۸ چرخهٔ معتبر در یک فعالیت و ۴ چرخه در فعالیت دیگر = ۱۲ نمونهٔ معتبر.',
        note: 'مجموع «چرخهٔ ثبت‌شده» ممکن است بیشتر باشد؛ تفاوت یعنی دادهٔ ناقص/خارج‌شده.',
      },
    },
    target: {
      title: 'وضعیت هدف نمونه', icon: 'gauge',
      help: {
        what: 'تعداد فعالیت‌هایی که به هدف تعداد نمونهٔ ثبت‌شده رسیده‌اند.',
        input: 'هدف هر فعالیت در مشخصات همان فعالیت تعیین می‌شود.',
        example: 'اگر ۳ فعالیت هدف‌دار دارید و ۲ تای آن‌ها به هدف رسیده‌اند، کارت «۲ از ۳» را نشان می‌دهد.',
        note: 'هدف نمونه کاربرمحور است؛ رسیدن به آن، کفایت آماری را تضمین نمی‌کند — شاخص‌های پراکندی را بازبینی کنید.',
      },
    },
  };

  var WIDGET_META = {
    activities: {
      title: 'مقایسهٔ فعالیت‌ها', icon: 'barChart',
      help: {
        what: 'نمودار زمان استاندارد هر فعالیت (در صورت قابل محاسبه بودن) به‌همراه جدول وضعیت کامل.',
        input: 'از موتور محاسبات پروژه خوانده می‌شود.',
        example: 'نمودار می‌تواند نشان دهد کدام ایستگاه گلوگاه خط است.',
        note: 'فعالیت‌های «نیازمند قاعدهٔ تجمیع» یا «ناقص» در نمودار نمی‌آیند و در جدول با برچسب علتشان مشخص می‌شوند.',
      },
    },
    statusDonut: {
      title: 'توزیع وضعیت مشاهدات', icon: 'flask',
      help: {
        what: 'سهم مشاهدات معتبر، مشکوک، خارج‌شده و نامعتبر در کل پروژه.',
        input: 'به‌صورت خودکار از وضعیت مشاهدات محاسبه می‌شود.',
        example: 'اگر از ۵۰ مشاهده، ۳ مورد مشکوک باشد، سهم مشکوک ۶٪ است.',
        note: 'مشاهدهٔ مشکوک فقط هشدار است و همچنان در محاسبات می‌ماند؛ خروج فقط با تصمیم شما.',
      },
    },
    operators: {
      title: 'مقایسهٔ اپراتورها', icon: 'users',
      help: {
        what: 'شاخص نسبی هر اپراتور: میانگین نسبت عملکرد او به زمان تجمیعی همان عناصر.',
        input: 'از مشاهدات مبنای محاسبه (معتبر + مشکوک) محاسبه می‌شود.',
        example: 'شاخص ۱٫۰۴ یعنی این اپراتور به‌طور متوسط ۴٪ کندتر از تجمیع عناصر مربوط عمل کرده است.',
        note: 'تفاوت شاخص لزوماً به معنی ضعف نیست؛ مهارت، روش کار و شرایط باید مهندسی قضاوت شود.',
      },
    },
    elementCv: {
      title: 'پراکندگی عناصر (CV٪)', icon: 'sliders',
      help: {
        what: 'ضرایب تغییرات (انحراف معیار نسبی) عناصر کاری؛ پراکندگی زیاد یعنی روش کار ناپایدار یا دادهٔ نیازمند بازبینی.',
        input: 'به‌صورت خودکار از مشاهدات مبنای محاسبات محاسبه می‌شود.',
        example: 'CV٪ زیر ۱۰٪ معمولاً پایدار تلقی می‌شود؛ بالای ۲۵٪ نیازمند بررسی دلیل است.',
        note: 'این آستانه‌ها قاعدهٔ قطعی نیستند؛ قضاوت نهایی مهندسی است.',
      },
    },
    reviewNeeds: {
      title: 'نیازهای بازبینی', icon: 'alertTriangle',
      help: {
        what: 'فهرست مواردی که پیش از اتکا به نتایج باید بازبینی شوند: دادهٔ مشکوک، ارزیابی ناقص، قاعدهٔ تجمیع، کمبود نمونه و تازگی محاسبات.',
        input: 'از وضعیت واقعی داده‌های پروژه استخراج می‌شود.',
        example: 'اگر ۲ مشاهدهٔ مشکوک بازبینی‌نشده داشته باشید، اینجا دکمهٔ رفتن به تحلیل آن فعالیت را می‌بینید.',
        note: 'این بخش عمداً صادقانه خالی می‌ماند وقتی موردی نیست — نمایش همیشگی هشدار، خستگی ایجاد می‌کند.',
      },
    },
  };

  /* استایل‌های اختصاصی ماژول */
  function ensureStyles() {
    if (document.getElementById('t2d-styles')) return;
    var st = document.createElement('style');
    st.id = 't2d-styles';
    st.textContent = '.t2d-dot{width:9px;height:9px;border-radius:99px;display:inline-block;flex-shrink:0;}';
    document.head.appendChild(st);
  }

  /* نرمال‌سازی چیدمان ذخیره‌شده — کلیدهای ناشناخته حذف و جاافتاده‌ها تکمیل می‌شوند */
  function normalizeLayout(raw) {
    var out = { cards: DEFAULT_CARDS.slice(), hiddenCards: [], widgets: DEFAULT_WIDGETS.slice(), hiddenWidgets: [] };
    if (!raw) return out;
    var cards = (raw.cards || []).filter(function (k) { return DEFAULT_CARDS.indexOf(k) >= 0; });
    DEFAULT_CARDS.forEach(function (k) { if (cards.indexOf(k) < 0) cards.push(k); });
    out.cards = cards;
    out.hiddenCards = (raw.hiddenCards || []).filter(function (k) { return DEFAULT_CARDS.indexOf(k) >= 0; });
    var widgets = (raw.widgets || []).filter(function (k) { return DEFAULT_WIDGETS.indexOf(k) >= 0; });
    DEFAULT_WIDGETS.forEach(function (k) { if (widgets.indexOf(k) < 0) widgets.push(k); });
    out.widgets = widgets;
    out.hiddenWidgets = (raw.hiddenWidgets || []).filter(function (k) { return DEFAULT_WIDGETS.indexOf(k) >= 0; });
    return out;
  }

  function readLayout(projectId) {
    var raw = null;
    try {
      var s = DB.getProjectSettings(projectId)['dash.layout'];
      if (s) raw = JSON.parse(s);
    } catch (e) { raw = null; }
    return normalizeLayout(raw);
  }

  /* متن سرور (ارقام) → نمایش با ترجیحات کاربر */
  function dstext(s) { return s ? U.displayServerText(s) : ''; }

  /* ── شکستن نام بلند فعالیت به حداکثر ۳ خط کوتاه — برچسب محور «مقایسهٔ فعالیت‌ها» §۱۴ ── */
  function wrapActivityName(name, maxChars, maxLines) {
    maxChars = maxChars || 12;
    maxLines = maxLines || 3;
    var words = String(name || '').split(/\s+/).filter(Boolean);
    if (words.length === 0) return [''];
    var lines = [];
    for (var i = 0; i < words.length; i++) {
      if (lines.length >= maxLines) break;
      var word = words[i];
      var last = lines.length - 1;
      if (last >= 0 && (lines[last] + ' ' + word).length <= maxChars) lines[last] = lines[last] + ' ' + word;
      else lines.push(word);
    }
    if (lines.join(' ') !== words.join(' ')) lines[lines.length - 1] = lines[lines.length - 1] + '…';
    return lines;
  }

  /* ── نمودار ستونی سفارشی «مقایسهٔ فعالیت‌ها» — §۱۴ ──
     ارتفاع کاهش‌یافته (۲۴۰ ← ۱۵۰)، بدون هیچ چرخش برچسب، نام کامل
     فعالیت در حداکثر ۳ خط ~۱۲ نویسه‌ای با ellipsis + tooltip بومی SVG،
     واحد «(ثانیه)» بالای محور عمودی، میله‌های --brand با سر گرد. */
  function activitiesChartSvg(acts) {
    var NS = 'http://www.w3.org/2000/svg';
    function sv(tag, attrs) {
      var el = document.createElementNS(NS, tag);
      for (var k in attrs) el.setAttribute(k, attrs[k]);
      return el;
    }
    var W = 560, H = 150;
    var padT = 16, padB = 52, padL = 44, padR = 10;
    var svg = sv('svg', { class: 'stat-chart', viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': 'مقایسهٔ زمان استاندارد فعالیت‌ها' });
    svg.setAttribute('style', 'direction:ltr');
    if (acts.length === 0) return svg;
    var maxRaw = Math.max.apply(null, acts.map(function (a) { return a.st; }));
    var maxV = maxRaw * 1.12 || 1;
    var innerW = W - padL - padR, innerH = H - padT - padB;
    var slot = innerW / acts.length;
    var barW = Math.min(48, slot * 0.6);

    /* خطوط راهنما + تیک‌های محور عمودی */
    for (var g = 0; g <= 2; g++) {
      var v = (maxV / 2) * g;
      var gy = padT + innerH - (v / maxV) * innerH;
      svg.appendChild(sv('line', { x1: padL, y1: gy, x2: W - padR, y2: gy, stroke: 'var(--border)', 'stroke-width': g === 0 ? 1 : 0.6, 'stroke-dasharray': g === 0 ? 'none' : '2 3' }));
      var yt = sv('text', { x: padL - 5, y: gy + 3, 'text-anchor': 'end', 'font-size': 9, fill: 'var(--muted-foreground)', direction: 'ltr' });
      yt.textContent = U.toPersianDigits(U.formatTimeValue(v, 1));
      svg.appendChild(yt);
    }
    /* واحد محور عمودی — بالای محور (RLM برای جهت درست پرانتز) */
    var unit = sv('text', { x: padL - 2, y: padT - 5, 'text-anchor': 'end', 'font-size': 9, fill: 'var(--muted-foreground)' });
    unit.textContent = '\u200F(ثانیه)\u200F';
    svg.appendChild(unit);

    acts.forEach(function (a, i) {
      var bh = Math.max(2, (a.st / maxV) * innerH);
      var x = padL + slot * i + (slot - barW) / 2;
      var y = padT + innerH - bh;
      var bar = sv('rect', { x: x, y: y, width: barW, height: bh, rx: 6, fill: 'var(--brand)' });
      var ttl = sv('title');
      ttl.textContent = a.activityName + ': ' + U.formatTimeValue(a.st) + ' ثانیه';
      bar.appendChild(ttl);
      svg.appendChild(bar);

      /* مقدار روی میله — فقط با تعداد کم برای پرهیز از هم‌پوشانی */
      if (acts.length <= 8) {
        var val = sv('text', { x: x + barW / 2, y: y - 4, 'text-anchor': 'middle', 'font-size': 9.5, 'font-weight': 600, fill: 'var(--foreground)', direction: 'ltr' });
        val.textContent = U.toPersianDigits(U.formatTimeValue(a.st, 1));
        svg.appendChild(val);
      }

      /* نام فعالیت — چند خط افقی، بدون چرخش؛ نام کامل در tooltip بومی SVG */
      var lines = wrapActivityName(a.activityName);
      var lbl = sv('text', { x: padL + slot * i + slot / 2, y: padT + innerH + 14, 'text-anchor': 'middle', 'font-size': 10, fill: 'var(--muted-foreground)' });
      var lt = sv('title');
      lt.textContent = a.activityName;
      lbl.appendChild(lt);
      lines.forEach(function (line, li) {
        var ts = sv('tspan', { x: padL + slot * i + slot / 2, dy: li === 0 ? 0 : 11 });
        ts.textContent = line;
        lbl.appendChild(ts);
      });
      svg.appendChild(lbl);
    });
    return svg;
  }

  g.T2VIEWS.dashboard = function (container, projectId) {
    ensureStyles();
    U.clear(container);
    var root = U.h('div', { class: 'flex flex-col gap-4' });
    container.appendChild(root);

    var dash = DB.getProjectDashboard(projectId);
    var layout = readLayout(projectId);

    function rerender() { if (root.isConnected) render(); }

    /* ── کارت خلاصه ── */
    function summaryCard(card) {
      var meta = CARD_META[card.key] || { title: card.title, icon: 'sigma', help: null };
      var borderStyle = card.tone === 'OK'
        ? { borderColor: 'var(--green)' }
        : card.tone === 'WARNING' ? { borderColor: 'var(--amber)' } : null;
      var valueBlock;
      if (card.value === null || card.value === undefined) {
        valueBlock = U.h('div', {
          class: 'bg-amber-soft rounded p-2 text-xs leading-relaxed mt-2',
          style: { color: 'var(--amber)' },
          text: dstext(card.reason),
        });
      } else {
        var isCount = card.key === 'samples' || card.key === 'target';
        var big = isCount ? U.formatInt(card.value) : U.formatTimeValue(card.value);
        if (isCount && card.denominator !== null && card.denominator !== undefined) {
          big = big + ' از ' + U.formatInt(card.denominator);
        }
        valueBlock = U.h('p', { class: 'text-2xl font-extrabold num mt-2' },
          big,
          card.unit ? U.h('span', { class: 'text-xs text-muted font-medium', text: ' ' + card.unit }) : null);
      }
      return U.h('section', { class: 'card p-4', style: borderStyle, 'aria-label': card.title },
        U.h('div', { class: 'flex items-center gap-2' },
          U.h('span', { class: 'chip-icon' }, U.icon(meta.icon)),
          U.h('span', { class: 'text-xs text-muted font-semibold truncate', text: card.title }),
          UI.helpDot(meta.title, meta.help)),
        valueBlock,
        U.h('p', { class: 'text-xs text-muted mt-2 leading-relaxed', text: dstext(card.note) }));
    }

    /* ── نمودار ۱: مقایسهٔ فعالیت‌ها ── */
    function buildActivities(body) {
      var withSt = dash.activities.filter(function (a) { return a.st !== null && a.st !== undefined; });
      if (withSt.length > 0) {
        body.appendChild(activitiesChartSvg(withSt));
      } else {
        body.appendChild(U.h('p', {
          class: 'text-sm text-muted rounded-lg border border-dashed p-3',
          text: 'هنوز فعالیتی زمان استاندارد قابل نمایش ندارد.',
        }));
      }
      var noSt = dash.activities.filter(function (a) { return a.st === null || a.st === undefined; });
      if (noSt.length > 0) {
        body.appendChild(U.h('p', { class: 'text-xs text-muted mt-3' },
          U.formatInt(noSt.length) + ' فعالیت در نمودار نیست: ' +
          noSt.slice(0, 3).map(function (a) { return '«' + a.activityName + '»'; }).join('، ') +
          (noSt.length > 3 ? ' و …' : '')));
      }
      body.appendChild(U.h('div', { class: 'mt-3' }, UI.table(
        ['ایستگاه / فعالیت', 'چرخهٔ معتبر', 'هدف', 'ST (ثانیه)', 'وضعیت'],
        function (tbody) {
          dash.activities.forEach(function (a) {
            var hasTarget = a.target !== null && a.target !== undefined;
            var targetCell;
            if (!hasTarget) {
              targetCell = U.h('span', { class: 'text-xs text-muted', text: 'ثبت نشده' });
            } else if (a.targetReached === true) {
              targetCell = UI.badge('رسیده', 'green');
            } else {
              targetCell = UI.badge(U.formatInt(a.validCycles) + ' از ' + U.formatInt(a.target), 'amber');
            }
            var statusCell;
            if (a.stStatus === 'OK') {
              statusCell = UI.badge('قابل ارائه', 'green');
            } else if (a.stStatus === 'NEEDS_AGGREGATION_RULE') {
              statusCell = UI.badge('قاعدهٔ تجمیع', 'amber');
              statusCell.title = a.stReason || '';
            } else if (a.stStatus === 'INCOMPLETE') {
              statusCell = UI.badge('ناقص', 'muted');
              statusCell.title = a.stReason || '';
            } else if (!hasTarget && (a.st === null || a.st === undefined)) {
              statusCell = UI.badge('ثبت نشده', 'muted');
            } else {
              statusCell = U.h('span', { class: 'text-xs text-muted', text: '—' });
            }
            tbody.appendChild(U.h('tr', null,
              U.h('td', { class: 'font-medium' }, a.stationName + ' / ' + a.activityName),
              U.h('td', { class: 'num text-center' },
                U.formatInt(a.validCycles) + (hasTarget ? ' / ' + U.formatInt(a.target) : '')),
              U.h('td', { class: 'text-center' }, targetCell),
              U.h('td', { class: 'num text-center' }, a.st !== null && a.st !== undefined ? U.formatTimeValue(a.st) : '—'),
              U.h('td', { class: 'text-center' }, statusCell)));
          });
        })));
    }

    /* ── نمودار ۲: توزیع وضعیت مشاهدات ── */
    function buildStatusDonut(body) {
      var s = dash.observationStatus;
      var total = s.valid + s.suspect + s.excluded + s.invalid;
      var segs = [
        { label: 'معتبر', value: s.valid, color: 'var(--brand)' },
        { label: 'مشکوک', value: s.suspect, color: 'var(--amber)' },
        { label: 'خارج‌شده', value: s.excluded, color: 'var(--red)' },
        { label: 'نامعتبر', value: s.invalid, color: 'var(--muted-foreground)' },
      ];
      /* راهنمای عمودی — فرزند اول (راست در RTL)؛ دونات دوم (چپ) — §۱۴ */
      var legend = U.h('ul', { class: 'flex flex-col gap-2 t2d-donut-legend' },
        segs.map(function (seg) {
          return U.h('li', { class: 'flex items-center justify-between gap-2 rounded-lg border px-3 py-1.5' },
            U.h('span', { class: 'flex items-center gap-2 text-sm min-w-0' },
              U.h('span', { class: 't2d-dot', style: { background: seg.color } }),
              U.h('span', { text: seg.label })),
            U.h('span', { class: 'num font-bold shrink-0' },
              U.formatInt(seg.value),
              U.h('span', {
                class: 'text-xs font-normal',
                style: { color: 'var(--muted-foreground)' },
                text: ' (' + U.formatPercent(total ? seg.value / total : 0) + ')',
              })));
        }),
        s.suspect > 0 ? U.h('li', { class: 'banner plain' }, U.icon('info'),
          U.h('div', {
            text: 'مشاهدهٔ مشکوک فقط هشدار است و در محاسبات می‌ماند؛ خروج از محاسبات فقط با تصمیم شما در مرحلهٔ تحلیل.',
          })) : null);
      /* دونات کمی کوچک‌تر — §۱۴؛ موبایل: دونات بالا/راهنما پایین (CSS) */
      body.appendChild(U.h('div', { class: 't2d-donut-row' },
        legend,
        U.h('div', { class: 't2d-donut-wrap' }, UI.donutChart({ segments: segs, centerLabel: 'مشاهده', size: 150 }))));
    }

    /* ── نمودار ۳: مقایسهٔ اپراتورها ── */
    function buildOperators(body) {
      if (!dash.operators.length) {
        body.appendChild(U.h('p', {
          class: 'text-sm text-muted rounded-lg border border-dashed p-3',
          text: 'هنوز اپراتوری دادهٔ زمان‌سنجی ثبت نکرده است.',
        }));
        return;
      }
      body.appendChild(UI.table(
        ['اپراتور', 'مشاهدات', 'فعالیت‌ها', 'شاخص نسبی', 'مشکوک', 'خارج‌شده'],
        function (tbody) {
          dash.operators.forEach(function (op) {
            var relCell;
            if (op.relativeIndex === null || op.relativeIndex === undefined) {
              relCell = U.h('span', { class: 'text-xs text-muted', text: 'دادهٔ کافی نیست' });
            } else {
              var cls = op.relativeIndex > 1.05 ? 'text-amber' : op.relativeIndex < 0.95 ? 'text-green' : '';
              relCell = U.h('span', { class: 'num font-bold ' + cls, text: U.formatTimeValue(op.relativeIndex, 2) });
            }
            tbody.appendChild(U.h('tr', null,
              U.h('td', { class: 'font-medium' }, op.operatorName),
              U.h('td', { class: 'num text-center' }, U.formatInt(op.observations)),
              U.h('td', { class: 'num text-center' }, U.formatInt(op.activitiesCount)),
              U.h('td', { class: 'text-center' }, relCell),
              U.h('td', { class: 'num text-center' }, U.formatInt(op.suspectCount)),
              U.h('td', { class: 'num text-center' }, U.formatInt(op.excludedCount))));
          });
        }));
      body.appendChild(U.h('p', {
        class: 'text-xs text-muted mt-3 leading-relaxed',
        text: 'شاخص نسبی = میانگین نسبت عملکرد اپراتور به زمان تجمیعی همان عناصر (۱۰۰٪ = مطابق تجمیع). تفاوت شاخص لزوماً به معنی ضعف نیست؛ مهارت، روش کار و شرایط باید مهندسی قضاوت شود.',
      }));
    }

    /* ── نمودار ۴: پراکندگی عناصر (CV٪) ── */
    function buildElementCv(body) {
      var rows = dash.elementCv.filter(function (e) {
        return e.cvPercent !== null && e.cvPercent !== undefined && isFinite(e.cvPercent);
      }).slice(0, 8);
      if (rows.length === 0) {
        body.appendChild(U.h('p', {
          class: 'text-sm text-muted rounded-lg border border-dashed p-3',
          text: 'هنوز عنصری با دادهٔ کافی برای محاسبهٔ پراکندگی وجود ندارد (حداقل ۲ مشاهدهٔ مبنای محاسبه لازم است).',
        }));
        return;
      }
      var list = U.h('ul', { class: 'flex flex-col gap-3' });
      rows.forEach(function (e) {
        var cv = e.cvPercent;
        var tone = cv > 25 ? 'var(--red)' : cv > 10 ? 'var(--amber)' : 'var(--green)';
        var pct = Math.min(cv, 60) / 60 * 100;
        list.appendChild(U.h('li', { class: 'flex flex-col gap-1' },
          U.h('div', { class: 'flex items-baseline justify-between gap-2' },
            U.h('span', { class: 'min-w-0 truncate text-sm' },
              U.h('span', { class: 'font-semibold', text: e.elementName }),
              U.h('span', { class: 'text-xs text-muted', text: ' — ' + e.activityName })),
            U.h('span', {
              class: 'num font-bold shrink-0', style: { color: tone },
              text: U.formatTimeValue(cv, 1) + '٪',
            })),
          U.h('div', { class: 'progress' },
            U.h('div', { style: { width: pct + '%', background: tone } }))));
      });
      list.appendChild(U.h('p', {
        class: 'text-xs text-muted leading-relaxed pt-1',
        text: 'CV٪ = انحراف معیار نسبی مشاهدات مبنای محاسبه. آستانه‌های رنگی (۱۰٪ و ۲۵٪) صرفاً راهنمای بصری‌اند و قضاوت نهایی مهندسی است.',
      }));
      body.appendChild(list);
    }

    /* ── نمودار ۵: نیازهای بازبینی ── */
    function buildReviewNeeds(body) {
      var rn = dash.reviewNeeds;
      var hasAny = rn.suspectsPending > 0 ||
        (rn.elementsWithoutRating && rn.elementsWithoutRating.length > 0) ||
        (rn.activitiesNeedingAggregationRule && rn.activitiesNeedingAggregationRule.length > 0) ||
        (rn.activitiesIncomplete && rn.activitiesIncomplete.length > 0) ||
        (rn.sampleShortfall && rn.sampleShortfall.length > 0) ||
        rn.needsRecalc;
      if (!hasAny) {
        body.appendChild(U.h('div', { class: 'banner success' }, U.icon('checkCircle'),
          U.h('div', null,
            U.h('div', { class: 'font-bold', text: 'موردی برای بازبینی نیست' }),
            U.h('div', {
              text: 'داده‌ها بازبینی شده‌اند و آخرین محاسبه به‌روز است. آخرین اجرا: ' +
                U.formatDateTime(rn.lastCalculationAt) + '.',
            }))));
        return;
      }
      /* کارت‌های هم‌ارتفاع — گرید دو ستونه در ≥۶۴۰px؛ دکمهٔ اقدام با
         mt-auto به کف کارت سنجاق می‌شود — §۱۴ */
      function row(textNode, actionLabel, onAction) {
        return U.h('li', { class: 't2d-review-card' },
          U.h('div', { class: 'flex items-start gap-2 min-w-0' },
            U.h('span', { class: 't2d-dot', style: { background: 'var(--amber)', marginTop: '6px' } }),
            textNode),
          actionLabel ? U.h('button', {
            class: 'btn btn-sm btn-outline t2d-review-btn', type: 'button',
            text: actionLabel, onclick: onAction,
          }) : null);
      }
      var list = U.h('ul', { class: 't2d-review-grid' });
      (rn.suspectsByActivity || []).forEach(function (x) {
        list.appendChild(row(
          U.h('span', { class: 'text-sm' },
            U.h('b', { class: 'num' }, U.formatInt(x.count)),
            U.h('span', { text: ' مشاهدهٔ مشکوک در «' + x.activityName + '»' })),
          'بازبینی در تحلیل',
          function () { g.T2APP.navigate('/p/' + projectId + '/analysis'); }));
      });
      if (rn.elementsWithoutRating && rn.elementsWithoutRating.length > 0) {
        var n = rn.elementsWithoutRating.length;
        list.appendChild(row(
          U.h('span', { class: 'text-sm' },
            U.h('b', { class: 'num' }, U.formatInt(n)),
            U.h('span', {
              text: ' عنصر بدون ارزیابی وستینگهاوس: ' +
                rn.elementsWithoutRating.slice(0, 5).join('، ') + (n > 5 ? ' و …' : ''),
            })),
          'ارزیابی وستینگهاوس',
          function () { g.T2APP.navigate('/p/' + projectId + '/westinghouse'); }));
      }
      (rn.activitiesNeedingAggregationRule || []).forEach(function (name) {
        var r = row(U.h('span', {
          class: 'text-sm',
          text: 'فعالیت «' + name + '» نیازمند قاعدهٔ تجمیع (کار هم‌زمان)',
        }), null, null);
        r.title = 'برای کار هم‌زمان، قاعدهٔ تجمیع در تنظیمات فعالیت تعیین می‌شود.';
        list.appendChild(r);
      });
      (rn.activitiesIncomplete || []).forEach(function (name) {
        list.appendChild(row(U.h('span', {
          class: 'text-sm', text: 'فعالیت «' + name + '» ناقص است',
        }), null, null));
      });
      (rn.sampleShortfall || []).forEach(function (x) {
        list.appendChild(row(U.h('span', { class: 'text-sm' },
          U.h('span', { text: '«' + x.activityName + '»: ' }),
          U.h('b', { class: 'num' }, U.formatInt(x.valid)),
          U.h('span', { text: ' از ' }),
          U.h('b', { class: 'num' }, U.formatInt(x.target)),
          U.h('span', { text: ' چرخهٔ معتبر' })), null, null));
      });
      if (rn.needsRecalc) {
        list.appendChild(row(U.h('span', {
          class: 'text-sm',
          text: 'محاسبات نسخه‌دار به‌روز نیست (نیازمند محاسبهٔ مجدد)',
        }), 'رفتن به تحلیل',
        function () { g.T2APP.navigate('/p/' + projectId + '/analysis'); }));
      }
      body.appendChild(list);
    }

    var WIDGET_BUILDERS = {
      activities: buildActivities,
      statusDonut: buildStatusDonut,
      operators: buildOperators,
      elementCv: buildElementCv,
      reviewNeeds: buildReviewNeeds,
    };

    /* ── دیالوگ شخصی‌سازی ── */
    function openPersonalize() {
      var draft = {
        cards: layout.cards.slice(), hiddenCards: layout.hiddenCards.slice(),
        widgets: layout.widgets.slice(), hiddenWidgets: layout.hiddenWidgets.slice(),
      };
      var cardsList, widgetsList;
      function swap(arr, i, dir) {
        var j = i + dir;
        if (j < 0 || j >= arr.length) return;
        var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
      }
      function fillList(list, keys, hiddenKey, meta) {
        U.clear(list);
        keys.forEach(function (key, idx) {
          var m = meta[key];
          var hidden = draft[hiddenKey].indexOf(key) >= 0;
          list.appendChild(U.h('li', {
            class: 'flex items-center justify-between gap-2 rounded-lg border p-2.5' +
              (hidden ? ' border-dashed opacity-70' : ''),
          },
            U.h('div', { class: 'flex items-center gap-2 min-w-0' },
              U.h('div', { class: 'flex flex-col gap-0.5' },
                U.h('button', {
                  class: 'icon-btn sm', type: 'button', disabled: idx === 0,
                  'aria-label': 'انتقال ' + m.title + ' به بالا',
                  onclick: function () { swap(keys, idx, -1); renderRows(); },
                }, U.icon('arrowUp')),
                U.h('button', {
                  class: 'icon-btn sm', type: 'button', disabled: idx === keys.length - 1,
                  'aria-label': 'انتقال ' + m.title + ' به پایین',
                  onclick: function () { swap(keys, idx, 1); renderRows(); },
                }, U.icon('arrowDown'))),
              U.h('span', { class: 'text-sm font-bold truncate', text: m.title })),
            U.h('div', { class: 'flex items-center gap-2 shrink-0' },
              U.h('span', { class: 'text-xs text-faint num', text: 'جایگاه ' + U.formatInt(idx + 1) }),
              UI.switchEl(!hidden, function (visible) {
                var arr = draft[hiddenKey];
                var i = arr.indexOf(key);
                if (visible) { if (i >= 0) arr.splice(i, 1); }
                else if (i < 0) arr.push(key);
                renderRows();
              }, 'نمایش ' + m.title))));
        });
      }
      function renderRows() {
        fillList(cardsList, draft.cards, 'hiddenCards', CARD_META);
        fillList(widgetsList, draft.widgets, 'hiddenWidgets', WIDGET_META);
      }
      UI.dialog({
        title: 'شخصی‌سازی داشبورد',
        desc: 'ترتیب و مرئی‌بودن کارت‌ها و نمودارها را تعیین کنید؛ چیدمان برای این پروژه ذخیره می‌شود و روی محاسبات اثری ندارد.',
        bodyBuilder: function (body) {
          body.appendChild(U.h('div', { class: 'field-label', text: 'کارت‌های خلاصه' }));
          cardsList = U.h('ul', { class: 'flex flex-col gap-1.5 mb-4' });
          body.appendChild(cardsList);
          body.appendChild(U.h('div', { class: 'field-label', text: 'نمودارها و شاخص‌ها' }));
          widgetsList = U.h('ul', { class: 'flex flex-col gap-1.5' });
          body.appendChild(widgetsList);
          renderRows();
        },
        footerBuilder: function (close) {
          return U.h('div', { class: 'dialog-footer' },
            U.h('button', {
              class: 'btn btn-ghost', type: 'button',
              onclick: function () {
                draft = {
                  cards: DEFAULT_CARDS.slice(), hiddenCards: [],
                  widgets: DEFAULT_WIDGETS.slice(), hiddenWidgets: [],
                };
                renderRows();
              },
            }, U.icon('rotateCcw'), 'بازگشت به پیش‌فرض'),
            U.h('div', { class: 'spacer' }),
            U.h('button', {
              class: 'btn btn-brand', type: 'button',
              onclick: function () {
                try {
                  DB.putProjectSettingRaw(projectId, { 'dash.layout': JSON.stringify(draft) });
                  UI.toast('چیدمان داشبورد ذخیره شد.');
                  close();
                  rerender();
                } catch (err) { UI.toastError(err); }
              },
            }, U.icon('check'), 'ذخیرهٔ چیدمان'));
        },
      });
    }

    /* ── رندر اصلی ── */
    function render() {
      layout = readLayout(projectId);
      U.clear(root);

      /* حالت خالی صادقانه */
      if (dash.counts.activities === 0 && dash.counts.sessions === 0) {
        root.appendChild(U.h('section', { class: 'card p-6' }, UI.emptyState({
          title: 'داشبورد هنوز داده‌ای برای نمایش ندارد',
          desc: 'برای شروع، در «ساختار تولید» ایستگاه و فعالیت تعریف کنید و دادهٔ زمان‌سنجی ثبت نمایید. کارت‌ها به‌محض وجود داده فعال می‌شوند.',
          icon: 'layoutDashboard',
          actionLabel: 'رفتن به ساختار تولید',
          onAction: function () { g.T2APP.navigate('/p/' + projectId + '/structure'); },
        })));
        return;
      }

      /* سربرگ */
      root.appendChild(U.h('header', { class: 'flex flex-wrap items-center gap-3' },
        U.h('span', { class: 'chip-icon' }, U.icon('layoutDashboard')),
        U.h('div', { class: 'min-w-0' },
          U.h('div', { class: 'flex items-center gap-2' },
            U.h('h1', { class: 'text-xl font-extrabold', text: 'داشبورد تحلیل' }),
            UI.helpDot('داشبورد تحلیل', HELP_DASHBOARD)),
          U.h('p', {
            class: 'text-sm text-muted mt-1',
            text: dash.project.name + ' · ' + U.formatInt(dash.counts.activities) + ' فعالیت · ' +
              U.formatInt(dash.counts.elements) + ' عنصر · ' + U.formatInt(dash.counts.operators) +
              ' اپراتور · ' + U.formatInt(dash.counts.sessions) + ' جلسه — به‌روزرسانی: ' +
              U.formatDateTime(dash.generatedAt),
          })),
        U.h('div', { class: 'spacer' }),
        U.h('div', { class: 'flex items-center gap-2 shrink-0' },
          U.h('button', {
            class: 'btn btn-sm btn-outline', type: 'button',
            onclick: function () { g.T2APP.navigate('/p/' + projectId + '/reports'); },
          }, U.icon('fileText'), 'گزارش‌ها و خروجی'),
          U.h('button', {
            class: 'btn btn-sm btn-outline', type: 'button',
            onclick: openPersonalize,
          }, U.icon('settings'), 'شخصی‌سازی'))));

      /* کارت‌های خلاصه — به ترتیب شخصی‌سازی‌شده */
      var cardsByKey = {};
      dash.cards.forEach(function (c) { cardsByKey[c.key] = c; });
      var visibleCards = layout.cards.filter(function (k) {
        return layout.hiddenCards.indexOf(k) < 0 && cardsByKey[k];
      });
      if (visibleCards.length > 0) {
        var grid = U.h('div', { class: 'grid sm:grid-cols-2 xl:grid-cols-4 gap-3' });
        visibleCards.forEach(function (k) { grid.appendChild(summaryCard(cardsByKey[k])); });
        root.appendChild(grid);
      } else {
        root.appendChild(U.h('div', { class: 'banner info' }, U.icon('info'),
          U.h('div', { text: 'همهٔ کارت‌های خلاصه مخفی شده‌اند؛ از «شخصی‌سازی» می‌توانید آن‌ها را نمایان کنید.' })));
      }

      /* نمودارها و شاخص‌ها — بخش‌های بازشونده */
      var visibleWidgets = layout.widgets.filter(function (k) {
        return layout.hiddenWidgets.indexOf(k) < 0 && WIDGET_META[k];
      });
      if (visibleWidgets.length > 0) {
        var wrap = U.h('div', { class: 'flex flex-col gap-4' });
        visibleWidgets.forEach(function (key) {
          var meta = WIDGET_META[key];
          var extra = { headerExtra: UI.helpDot(meta.title, meta.help) };
          if (key === 'reviewNeeds') extra.chipTone = ' amber';
          var card = UI.collapsibleCard(meta.title, meta.icon, function (bodyEl) {
            WIDGET_BUILDERS[key](bodyEl);
          }, true, extra);
          wrap.appendChild(card);
        });
        root.appendChild(wrap);
      } else {
        root.appendChild(U.h('div', { class: 'banner info' }, U.icon('info'),
          U.h('div', { text: 'همهٔ نمودارها مخفی شده‌اند؛ از «شخصی‌سازی» می‌توانید آن‌ها را نمایان کنید.' })));
      }
    }

    render();
  };
})(typeof window !== 'undefined' ? window : globalThis);
