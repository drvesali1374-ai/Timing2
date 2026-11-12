/* ═══════════════════════════════════════════════════════════
   views-timing.js — مرحلهٔ «زمان‌سنجی» — پیچیده‌ترین ماژول
   پورت وفادار از TimingView / SheetPanel / SheetGrid /
   PasteDialog / CycleTimeline نسخهٔ وب:
   • انتخابگر فعالیت (نسخهٔ مرحله) + نسخهٔ تعبیه‌شده در صفحه فعالیت
   • فهرست جلسات (فعالیت × اپراتور × روش) + فیلتر اپراتور
   • برگهٔ چرخه‌محور اکسل‌مانند: ورودی مستقیم، حالت ترتیبی/بازه‌ای
     (برگشت به صفر / قرائت پیوسته)، مدت مشتق زیر سلول، پرچم
     مشکوک/خارج‌شده، ناوبری کیبورد RTL، Undo/Redo (Ctrl+Z/Y)،
     خط زمانی چرخه و «سپری‌شده»
   • Paste چندسلولی از Excel با پیش‌نمایش و دو حالت ثبت
   • خروج/بازگشت مشاهده از محاسبات با ثبت دلیل (دادهٔ خام محفوظ)
   ═══════════════════════════════════════════════════════════ */
(function (g) {
  'use strict';
  var U = g.T2U, DB = g.T2DB, UI = g.T2UI;
  g.T2VIEWS = g.T2VIEWS || {};

  /* ═══════════ وضعیت ماژول (بین رندرها حفظ می‌شود) ═══════════ */
  var pickedActivity = {};   /* projectId -> activityId (انتخابگر مرحله) */
  var selectedSession = {};  /* activityId -> sessionId */
  var operatorFilter = {};   /* activityId -> operatorId | 'ALL' */
  var entryModeMap = {};     /* sessionId -> { elementId: 'SEQ'|'INT' } */
  var anchorMap = {};        /* sessionId -> { cycleNo, elementId } (مبدأ Paste) */
  var historyMap = {};       /* sessionId -> { undo: [], redo: [] } */
  var expandedMap = {};      /* sessionId -> cycleId ردیف باز شده */
  var sheetCache = {};       /* sessionId -> DTO برگه (پرهیز از محاسبهٔ مجدد) */

  /* وضعیت کانون/ناوبری برگه — هم‌زمان فقط یک برگه باز است */
  var activeGrid = null;         /* عنصر .sheet-grid جاری */
  var pendingFocus = null;       /* {r, c, part} — پس از حرکت کیبورد */
  var lastFocusedCell = null;    /* {sid, r, c, part} — بازگردانی کانون پس از رندر */
  var sheetKeyHandler = null;    /* شنوندهٔ Ctrl+Z/Y سند */

  /* بج نوع عنصر — MANUAL بنفش، MACHINE فیروزه‌ای، WAITING کهربایی، OVERLAP سبز */
  var TYPE_BADGE = {
    MANUAL: { label: 'دستی', variant: 'brand' },
    MACHINE: { label: 'ماشین', variant: 'cyan' },
    WAITING: { label: 'انتظار', variant: 'amber' },
    OVERLAP: { label: 'هم‌پوشان', variant: 'green' },
  };
  /* رنگ میلهٔ خط زمانی بر اساس نوع عنصر */
  var LANE_COLORS = { MANUAL: 'var(--brand)', MACHINE: 'var(--cyan)', WAITING: 'var(--amber)', OVERLAP: 'var(--green)' };

  /* ═══════════ استایل‌های اختصاصی ماژول ═══════════ */
  function ensureStyles() {
    if (document.getElementById('t2t-styles')) return;
    var st = document.createElement('style');
    st.id = 't2t-styles';
    st.textContent =
      '.t2t-entry-chip{border:none;background:transparent;cursor:pointer;font-family:inherit;font-size:10px;font-weight:700;color:var(--muted-foreground);padding:1px 5px;border-radius:99px;text-decoration:underline dotted;}' +
      '.t2t-entry-chip:hover{background:var(--brand-soft);color:var(--brand);}' +
      '.t2t-lane{position:relative;height:26px;background:var(--muted);border-radius:8px;overflow:hidden;flex:1;min-width:0;border:1px solid var(--border);}' +
      '.t2t-bar{position:absolute;top:3px;bottom:3px;border-radius:5px;opacity:.9;}' +
      '.t2t-mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;}' +
      '.t2t-link{background:none;border:none;cursor:pointer;font-family:inherit;font-size:inherit;padding:0;text-decoration:underline;color:var(--red);}' +
      '.t2t-count-badge{font-size:10px;padding:1px 6px;border-radius:99px;}' +
      '.t2t-help-row{display:flex;flex-wrap:wrap;align-items:center;gap:6px;}';
    document.head.appendChild(st);
  }

  /* ═══════════ ابزارهای کوچک ═══════════ */
  function initials(name) {
    var parts = String(name || '').trim().split(/\s+/);
    var out = '';
    for (var i = 0; i < parts.length && i < 2; i++) out += parts[i].charAt(0);
    return out || '؟';
  }
  function roundEdit(v) { return v === null || v === undefined || !isFinite(v) ? '' : String(Math.round(v * 1e6) / 1e6); }
  function findObs(cycle, workElementId) {
    for (var i = 0; i < cycle.observations.length; i++) {
      if (cycle.observations[i].workElementId === workElementId) return cycle.observations[i];
    }
    return null;
  }

  /* ═══════════ زیرهدر چسبان فعالیت — §۱۲.۱ ═══════════
     تنها نوار چسبان صفحهٔ زمان‌سنجی (زیر TopBar با ارتفاع ۵۶ پیکسل):
     عنوان فعالیت + ایستگاه (تنها یک‌بار)، بازگشت به فهرست فعالیت‌ها،
     فیلتر اپراتور (حالت فهرست جلسات) یا نشان اپراتور جلسهٔ فعال
     (حالت برگه) و دکمهٔ کوچک «جلسهٔ جدید».
     کارت‌های جلسه و جدول برگه هرگز چسبان نیستند. */
  function buildSubheader(ctx, opts) {
    var bar = U.h('div', { class: 't2t-subheader', role: 'region', 'aria-label': 'نوار فعالیت زمان‌سنجی' });

    /* هویت فعالیت — تنها محل نمایش آن در طول کار */
    bar.appendChild(U.h('div', { class: 'flex items-center gap-2 min-w-0' },
      U.h('span', { class: 'chip-icon shrink-0', style: { width: '32px', height: '32px' } }, U.icon('timer')),
      U.h('div', { class: 'min-w-0' },
        U.h('p', { class: 'font-bold truncate', style: { fontSize: '13px', lineHeight: '1.45' }, text: opts.activityName }),
        U.h('p', { class: 'truncate', style: { fontSize: '11px', lineHeight: '1.45', color: 'var(--muted-foreground)' }, text: 'ایستگاه ' + (opts.stationName || '—') }))));

    /* بازگشت به حالت انتخاب فعالیت — فقط در نمای مرحله‌ای با انتخابگر */
    if (ctx.withChangeActivity && ctx.backToPicker) {
      bar.appendChild(U.h('button', {
        class: 'btn btn-sm btn-outline shrink-0', type: 'button',
        onclick: function () { selectedSession[ctx.activityId] = null; ctx.backToPicker(); },
      }, U.icon('listTree'), 'فهرست فعالیت‌ها'));
    }

    if (opts.variant === 'list' && opts.sessions.length > 0) {
      /* فیلتر اپراتور — منتقل‌شده به زیرهدر چسبان §۱۲.۱ */
      var chips = U.h('div', { class: 'flex flex-wrap items-center gap-1.5 min-w-0' },
        U.h('span', { class: 'text-xs font-bold shrink-0', style: { color: 'var(--muted-foreground)' }, text: 'اپراتور:' }),
        UI.badge(U.formatInt(opts.sessions.length) + ' جلسه', 'muted'));
      function chip(label, value, count) {
        var active = opts.operatorFilter === value;
        return U.h('button', {
          class: 't2t-op-chip' + (active ? ' active' : ''), type: 'button',
          onclick: function () { operatorFilter[ctx.activityId] = value; ctx.render(); },
        }, label,
          U.h('span', { class: 't2t-op-count num' }, U.formatInt(count)));
      }
      chips.appendChild(chip('همه', 'ALL', opts.sessions.length));
      opts.operators.forEach(function (op) {
        var n = opts.sessions.filter(function (s) { return s.operatorId === op.id; }).length;
        if (n > 0) chips.appendChild(chip(op.displayName, op.id, n));
      });
      bar.appendChild(chips);
    } else if (opts.variant === 'sheet' && opts.activeOperatorName) {
      /* نشان برجستهٔ یکتای اپراتور جلسهٔ فعال */
      bar.appendChild(U.h('span', { class: 't2t-sub-op-chip', title: 'اپراتور جلسهٔ فعال' },
        U.icon('users'),
        U.h('span', { class: 'truncate', text: opts.activeOperatorName })));
    }

    /* دکمهٔ کوچک «جلسهٔ جدید» — انتهای نوار */
    if (opts.canCreate) {
      bar.appendChild(U.h('button', {
        class: 'btn btn-sm btn-brand shrink-0 t2t-sub-new', type: 'button',
        onclick: function () { openCreateSessionDialog(ctx); },
      }, U.icon('plus'), 'جلسهٔ جدید'));
    }
    return bar;
  }

  /* ═══════════ دیالوگ ایجاد جلسه — مشترک فهرست جلسات و زیرهدر برگه ═══════════ */
  function openCreateSessionDialog(ctx) {
    var operators = DB.listOperators(ctx.projectId);
    var operatorId = '';
    var method = 'SNAPBACK';
    var notes = '';
    UI.dialog({
      title: 'جلسهٔ زمان‌سنجی جدید',
      desc: 'جلسه = فعالیت × اپراتور × روش اندازه‌گیری. روش پس از ایجاد قابل تغییر نیست؛ برای روش دیگر جلسهٔ جدید بسازید.',
      bodyBuilder: function (body) {
        /* اپراتور */
        var sel = U.h('select', { class: 'select', 'aria-label': 'اپراتور' });
        sel.appendChild(U.h('option', { value: '' }, 'انتخاب اپراتور…'));
        operators.forEach(function (op) {
          sel.appendChild(U.h('option', { value: op.id }, op.displayName + ' (' + (op.code || '—') + ')'));
        });
        sel.addEventListener('change', function () { operatorId = sel.value; });
        body.appendChild(U.h('div', null,
          U.h('label', { class: 'field-label' }, 'اپراتور', UI.helpDot('اپراتور جلسه', {
            what: 'اپراتوری که برگهٔ زمان‌سنجی این جلسه به او تعلق دارد.',
            input: 'یکی از اپراتورهای ثبت‌شدهٔ پروژه را انتخاب کنید.',
            example: '«اپراتور ۱ — آقای رضایی»',
            note: 'برگهٔ هر اپراتور مستقل است و می‌توانید برای هر اپراتور چند جلسه ثبت کنید.',
          })),
          sel));

        /* روش اندازه‌گیری */
        var methodWrap = U.h('div', null,
          U.h('div', { class: 'field-label' }, 'روش اندازه‌گیری', UI.helpDot('روش اندازه‌گیری', {
            what: 'نحوهٔ ثبت زمان‌ها در این جلسه؛ پس از ایجاد قابل تغییر نیست.',
            input: '«برگشت به صفر»: مدت هر عنصر مستقیم ثبت می‌شود. «پیوسته»: قرائت تجمعی کرنومتر در پایان هر عنصر ثبت می‌شود و مدت‌ها از تفاضل قرائت‌ها محاسبه می‌شوند.',
            example: 'در روش پیوسته، قرائت‌های ۸، ۲۰ و ۴۵ مدت‌های ۸، ۱۲ و ۲۵ ثانیه را می‌دهند.',
            note: 'مبنای قرائت پیوسته با شروع هر جلسهٔ جدید از صفر آغاز می‌شود؛ کرنومتر داخلی در نسخهٔ اول وجود ندارد و ثبت دستی/از Excel است.',
          })));
        var cards = [];
        var radios = [];
        [
          ['SNAPBACK', 'برگشت به صفر (Snapback)', 'زمان سپری‌شدهٔ هر عنصر به‌صورت مستقیم ثبت می‌شود؛ مناسب عناصر کوتاه با توقف کرنومتر.'],
          ['CONTINUOUS', 'پیوسته (Continuous)', 'قرائت تجمعی در پایان هر عنصر ثبت می‌شود؛ مدت‌ها از تفاضل قرائت‌ها محاسبه می‌شوند و زنجیره در طول جلسه ادامه دارد.'],
        ].forEach(function (m) {
          var card = U.h('label', { class: 'radio-card' + (method === m[0] ? ' selected' : '') },
            U.h('input', { type: 'radio', name: 't2t-method', checked: method === m[0], style: { accentColor: 'var(--brand)', marginTop: '3px' } }),
            U.h('div', { class: 'min-w-0' },
              U.h('div', { class: 'text-sm font-semibold', text: m[1] }),
              U.h('div', { class: 'text-xs text-muted leading-relaxed', text: m[2] })));
          var radio = card.querySelector('input');
          radio.addEventListener('change', function () {
            method = m[0];
            cards.forEach(function (c2) { c2.classList.remove('selected'); });
            card.classList.add('selected');
          });
          cards.push(card);
          radios.push(radio);
          methodWrap.appendChild(card);
        });
        body.appendChild(methodWrap);

        /* توضیحات */
        var ta = U.h('textarea', { class: 'textarea', placeholder: 'مثلاً: نوبت عصر — شرایط دمای کارگاه بالاتر از حد معمول' });
        ta.addEventListener('input', function () { notes = ta.value; });
        body.appendChild(UI.field('توضیحات (اختیاری)', ta));
      },
      footerBuilder: function (close) {
        return U.h('div', { class: 'dialog-footer' },
          U.h('button', { class: 'btn', text: 'انصراف', onclick: close }),
          U.h('div', { class: 'spacer' }),
          U.h('button', {
            class: 'btn btn-brand',
            onclick: function () {
              if (!operatorId) { UI.toast('ابتدا اپراتور را انتخاب کنید', { type: 'error' }); return; }
              var s;
              try { s = DB.createSession(ctx.activityId, { operatorId: operatorId, timingMethod: method, notes: notes }); }
              catch (err) { UI.toastError(err); return; }
              close();
              invalidateSheetCache(s.id);
              selectedSession[ctx.activityId] = s.id;
              UI.toast('جلسه ایجاد شد؛ برگهٔ خالی آمادهٔ ثبت است');
              ctx.render();
            },
          }, U.icon('plus'), 'ایجاد جلسه و باز کردن برگه'));
      },
    });
  }

  /* ═══════════ ابزارهای دیالوگ «تشخیص مشاهدهٔ مشکوک» — §۱۲.۳ ═══════════ */
  /* برچسب فارسی قواعد تشخیص — هم‌نام با موتور محاسبات */
  var OUTLIER_RULE_LABELS = {
    MODIFIED_Z_MAD: 'امتیاز Z تعدیل‌شده (میانه و MAD)',
    IQR_FENCE: 'حصار IQR',
    INSUFFICIENT_DATA: 'دادهٔ ناکافی',
  };
  /** snapshot ثبت‌شده در لحظهٔ پرچم‌گذاری — DTO برگه (getSheet) آن را
      ندارد؛ دفاعی و مستقیم از وضعیت زندهٔ DB بر اساس id خوانده می‌شود. */
  function readOutlierSnapshot(obs) {
    var raw = null;
    try {
      var recs = DB.getState().elementObservations || [];
      for (var i = 0; i < recs.length; i++) {
        if (recs[i].id === obs.id) { raw = recs[i].outlierSnapshot; break; }
      }
    } catch (e) { raw = null; }
    if (raw === null || raw === undefined) return null;
    if (typeof raw === 'string') {
      if (raw.trim() === '') return null;
      try {
        var parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : null;
      } catch (e2) { return null; }
    }
    return typeof raw === 'object' ? raw : null;
  }
  /** مقدار مشاهده به‌صورت متنی — بازه‌ها «X تا Y» */
  function observationValueText(obs) {
    if (obs.startOffset !== null || obs.endOffset !== null) {
      var s = obs.startOffset !== null ? U.formatTimeValue(obs.startOffset) : '؟';
      var e = obs.endOffset !== null ? U.formatTimeValue(obs.endOffset) : '؟';
      return s + ' تا ' + e;
    }
    var v = obs.rawDuration !== null ? obs.rawDuration
      : (obs.cumulativeReading !== null ? obs.cumulativeReading : obs.derivedDuration);
    return U.formatTimeValue(v);
  }
  /** عدد با حداکثر دو اعشار بدون صفرهای انتهایی — برای آستانه/ضریب */
  function fmtCompact(v) {
    if (v === null || v === undefined || !isFinite(v)) return '—';
    return U.displayServerText(String(Math.round(v * 100) / 100));
  }
  /** مقدار عددی با واحد ثانیه — عدد LTR و واحد فارسی */
  function valueWithUnit(text) {
    return U.h('span', { class: 'inline-flex items-baseline justify-end gap-1 min-w-0' },
      U.h('span', { class: 'num', dir: 'ltr', text: text }),
      U.h('span', { style: { fontSize: '10px', color: 'var(--muted-foreground)' }, text: 'ثانیه' }));
  }
  /** بج وضعیت فعلی مشاهده — معتبر/مشکوک/خارج‌شده/نامعتبر */
  function suspectValidityBadge(status) {
    if (status === 'EXCLUDED') return UI.badge('خارج‌شده', 'outline', 'eraser');
    if (status === 'SUSPECT') return UI.badge('مشکوک', 'amber', 'alertTriangle');
    if (status === 'INVALID') return UI.badge('نامعتبر', 'red', 'xCircle');
    return UI.badge('معتبر', 'green', 'checkCircle');
  }
  /** ردیف برچسب-مقدار دیالوگ تشخیص */
  function diagRow(label, valueNode) {
    return U.h('div', { class: 't2t-diag-row' },
      U.h('span', { class: 't2t-diag-label', text: label }),
      U.h('span', { class: 't2t-diag-value' }, valueNode));
  }

  /* ═══════════ کش برگه (فهرست جلسات) ═══════════ */
  function getSheetCached(sessionId) {
    if (!sheetCache[sessionId]) sheetCache[sessionId] = DB.getSheet(sessionId);
    return sheetCache[sessionId];
  }
  function invalidateSheetCache(sessionId) {
    if (sessionId) delete sheetCache[sessionId];
    else sheetCache = {};
  }

  /* ═══════════ Undo / Redo — بر پایه snapshotSessionRows ═══════════ */
  function hist(sessionId) {
    if (!historyMap[sessionId]) historyMap[sessionId] = { undo: [], redo: [] };
    return historyMap[sessionId];
  }
  /** snapshot → اجرا → در صورت موفقیت ورود به پشتهٔ Undo؛ در صورت خطا بازگردانی وضعیت (تراکنش‌مانند) */
  function withUndo(sessionId, label, fn) {
    var snap = DB.snapshotSessionRows(sessionId);
    try {
      fn();
      var st = hist(sessionId);
      st.undo.push({ label: label, snap: snap });
      if (st.undo.length > 200) st.undo.shift();
      st.redo.length = 0;
      return true;
    } catch (err) {
      try { DB.replaceSessionRows(sessionId, snap); } catch (e2) { /* وضعیت از قبل سالم بود */ }
      UI.toastError(err);
      return false;
    }
  }
  /** حذف واقعی یک چرخه — دور زدن باگ هسته:
      DB.deleteCycle فقط مشاهدات/خطوط را پاک می‌کند و خود ردیف چرخه را
      (به دلیل فیلتر cascadeDelete بر sessionId به‌جای id) باقی می‌گذارد.
      اینجا حذف از مسیر عمومی snapshot + replaceSessionRows انجام می‌شود.
      §۸ ممیزی جلسه ۲ — مقادیر هم‌پوشانی چرخه نیز حذف و با Undo بازگردانده می‌شوند. */
  function deleteCycleSafe(sessionId, cycleId) {
    var snap = DB.snapshotSessionRows(sessionId);
    var before = snap.cycles.length;
    snap.cycles = snap.cycles.filter(function (c) { return c.id !== cycleId; });
    if (snap.cycles.length === before) throw new Error('چرخه یافت نشد.');
    snap.lanes = snap.lanes.filter(function (l) { return l.cycleId !== cycleId; });
    snap.observations = snap.observations.filter(function (o) { return o.cycleId !== cycleId; });
    snap.overlaps = (snap.overlaps || []).filter(function (o) { return o.cycleId !== cycleId; });
    DB.replaceSessionRows(sessionId, snap);
  }
  /** حذف واقعی جلسه — دور زدن باگ هسته:
      cascadeDelete ردیف خودِ جلسه را حذف نمی‌کند (فیلتر studySessions روی
      activityId/operatorId است، نه id)؛ DB.deleteSession فقط چرخه‌ها/مشاهدات،
      نشانگر حذف و رویداد تاریخچه را درست انجام می‌دهد. پس از آن، خود ردیف
      از وضعیت زنده حذف و با یک commit بدون تغییر ماندگار می‌شود. */
  function deleteSessionSafe(sessionId) {
    DB.deleteSession(sessionId);
    var st = DB.getState();
    st.studySessions = st.studySessions.filter(function (s) { return s.id !== sessionId; });
    DB.setAppSettings(DB.getAppSettings()); /* فقط برای commit/persist */
  }
  function doUndo(sessionId, render) {
    var st = hist(sessionId);
    if (!st.undo.length) return;
    var entry = st.undo.pop();
    st.redo.push({ label: entry.label, snap: DB.snapshotSessionRows(sessionId) });
    DB.replaceSessionRows(sessionId, entry.snap);
    invalidateSheetCache(sessionId);
    UI.toast('واگردانی شد');
    render();
  }
  function doRedo(sessionId, render) {
    var st = hist(sessionId);
    if (!st.redo.length) return;
    var entry = st.redo.pop();
    st.undo.push({ label: entry.label, snap: DB.snapshotSessionRows(sessionId) });
    DB.replaceSessionRows(sessionId, entry.snap);
    invalidateSheetCache(sessionId);
    UI.toast('ازنو انجام شد');
    render();
  }

  /* ═══════════ حالت ورودی عنصر (ترتیبی/بازه‌ای) ═══════════ */
  function entryModeOf(sessionId, element) {
    var m = entryModeMap[sessionId];
    return (m && m[element.id]) || element.defaultEntry || 'SEQ';
  }

  /* ═══════════ ناوبری کیبورد برگه ═══════════ */
  function findGridInput(grid, r, c, part) {
    if (!grid) return null;
    var first = grid.querySelector('input.sheet-cell[data-cycle="' + r + '"][data-el="' + c + '"]');
    if (!first) return null;
    var inputs = first.parentNode.querySelectorAll('input.sheet-cell');
    var fallback = null;
    for (var i = 0; i < inputs.length; i++) {
      if (inputs[i].disabled) continue;
      if (part && inputs[i].dataset.part === part) return inputs[i];
      if (!fallback) fallback = inputs[i];
    }
    return fallback;
  }
  function applyFocusCell(grid, target) {
    var el = findGridInput(grid, target.r, target.c, target.part);
    if (el) { el.focus(); if (el.select) el.select(); return true; }
    return false;
  }
  /** حرکت کیبورد: blur فعلی (ثبت تغییرات) و سپس کانون روی سلول هدف — پس از رندر هم برقرار می‌ماند */
  function moveFocus(target) {
    pendingFocus = target;
    var ae = document.activeElement;
    if (ae && ae !== document.body && ae.blur) { try { ae.blur(); } catch (e) { /* بی‌اهمیت */ } }
    setTimeout(function () {
      if (!pendingFocus) return;
      var t = pendingFocus;
      pendingFocus = null;
      applyFocusCell(activeGrid, t);
    }, 0);
  }

  /* ═══════════ ۱) مرحلهٔ زمان‌سنجی با انتخابگر فعالیت ═══════════ */
  g.T2VIEWS.timing = function (container, projectId) {
    ensureStyles();

    function renderAll() {
      U.clear(container);
      container.appendChild(U.h('header', { class: 'flex items-center gap-3' },
        U.h('span', { class: 'chip-icon' }, U.icon('timer')),
        U.h('div', { class: 'min-w-0' },
          U.h('h1', { class: 'text-xl font-extrabold', text: 'زمان‌سنجی' }),
          U.h('p', { class: 'text-sm text-muted', text: 'انتخاب فعالیت برای ثبت برگهٔ چرخه‌محور' }))));

      var actId = pickedActivity[projectId];
      var act = actId ? DB.getActivity(actId) : null;
      if (act) {
        timingFlow(container, projectId, act.id, {
          withChangeActivity: true,
          backToPicker: function () { pickedActivity[projectId] = null; renderAll(); },
        });
      } else {
        renderPicker(container, projectId, function (id) {
          pickedActivity[projectId] = id;
          renderAll();
        });
      }
    }
    renderAll();
  };

  /* ── انتخابگر فعالیت: کارت به ازای ایستگاه ── */
  function renderPicker(container, projectId, onPick) {
    var stations = DB.sortStations(projectId);
    var totalActivities = 0;
    stations.forEach(function (st) { totalActivities += DB.sortActivities(st.id).length; });

    if (totalActivities === 0) {
      container.appendChild(UI.emptyState({
        title: 'فعالیتی تعریف نشده است',
        desc: 'برای زمان‌سنجی، ابتدا در «ساختار تولید» ایستگاه و فعالیت تعریف کنید.',
        icon: 'factory',
        actionLabel: 'رفتن به ساختار تولید',
        onAction: function () { g.T2APP.navigate('/p/' + projectId + '/structure'); },
      }));
      return;
    }

    stations.forEach(function (st) {
      var acts = DB.sortActivities(st.id);
      if (acts.length === 0) return;
      var card = U.h('div', { class: 'card' },
        U.h('div', { class: 'flex flex-wrap items-center gap-2 p-4 pb-2' },
          U.h('span', { class: 'chip-icon' }, U.icon('warehouse')),
          U.h('span', { class: 'font-bold', text: st.name }),
          U.h('span', { class: 'badge muted' }, U.formatInt(acts.length) + ' فعالیت')));
      var rows = U.h('div', { class: 'flex flex-col gap-2 p-4 pt-2' });
      acts.forEach(function (a) {
        var els = DB.sortElements(a.id);
        var sub = a.targetSampleCount
          ? U.formatInt(els.length) + ' عنصر • هدف ' + U.formatInt(a.targetSampleCount) + ' چرخه'
          : U.formatInt(els.length) + ' عنصر';
        function pick() { onPick(a.id); }
        rows.appendChild(U.h('div', {
          class: 'list-row cursor-pointer', role: 'button', tabindex: '0',
          'aria-label': 'انتخاب فعالیت ' + a.name,
          onclick: pick,
          onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } },
        },
          U.icon('timer'),
          U.h('div', { class: 'flex-1 min-w-0' },
            U.h('div', { class: 'font-medium truncate', text: a.name }),
            U.h('div', { class: 'text-xs text-muted', text: sub })),
          els.length === 0 ? UI.badge('بدون عنصر', 'amber') : null,
          U.h('span', { class: 'text-faint' }, U.icon('arrowLeft'))));
      });
      card.appendChild(rows);
      container.appendChild(card);
    });
  }

  /* ═══════════ ۲) نسخهٔ تعبیه‌شده در صفحه فعالیت ═══════════ */
  g.T2VIEWS._timingForActivity = function (container, projectId, activityId) {
    ensureStyles();
    var activity = DB.getActivity(activityId);
    if (!activity) {
      container.appendChild(UI.emptyState({ title: 'فعالیت یافت نشد', icon: 'package' }));
      return;
    }
    var station = DB.getStation(activity.stationId);
    container.appendChild(U.h('header', { class: 'flex items-center gap-3' },
      U.h('span', { class: 'chip-icon' }, U.icon('timer')),
      U.h('div', { class: 'min-w-0' },
        U.h('h2', { class: 'text-lg font-extrabold', text: 'زمان‌سنجی' }),
        U.h('p', { class: 'text-xs text-muted truncate', text: activity.name + ' — ' + (station ? station.name : '—') }))));
    timingFlow(container, projectId, activityId, { withChangeActivity: false });
  };

  /* ═══════════ جریان مشترک: فهرست جلسات ⇄ برگه ═══════════ */
  function timingFlow(container, projectId, activityId, opts) {
    var flowEl = U.h('div');
    container.appendChild(flowEl);
    var ctx = {
      projectId: projectId,
      activityId: activityId,
      flowEl: flowEl,
      withChangeActivity: !!opts.withChangeActivity,
      backToPicker: opts.backToPicker || null,
      render: function () {
        if (!flowEl.isConnected) return;
        var sid = selectedSession[activityId];
        var sess = sid ? DB.listSessions(activityId).find(function (x) { return x.id === sid; }) : null;
        if (sess) renderSheet(flowEl, ctx, sid);
        else renderSessionsPanel(flowEl, ctx);
      },
    };
    ctx.render();
  }

  /* ═══════════ فهرست جلسات فعالیت ═══════════ */
  function renderSessionsPanel(flowEl, ctx) {
    var activity = DB.getActivity(ctx.activityId);
    if (!activity) {
      U.clear(flowEl);
      flowEl.appendChild(UI.emptyState({ title: 'فعالیت یافت نشد', icon: 'package' }));
      return;
    }
    var station = DB.getStation(activity.stationId);
    var elements = DB.sortElements(ctx.activityId);
    var operators = DB.listOperators(ctx.projectId);
    var sessions = DB.listSessions(ctx.activityId);

    var filter = operatorFilter[ctx.activityId] || 'ALL';
    if (filter !== 'ALL' && !operators.some(function (o) { return o.id === filter; })) filter = 'ALL';
    var visible = sessions.filter(function (s) { return filter === 'ALL' || s.operatorId === filter; });

    U.clear(flowEl);
    var wrap = U.h('div', { class: 'flex flex-col gap-3' });
    flowEl.appendChild(wrap);

    /* نگهبان‌ها — عنصر نداشتن فعالیت / نبودن اپراتور */
    if (elements.length === 0) {
      wrap.appendChild(U.h('div', { class: 'banner warning' }, U.icon('alertTriangle'),
        U.h('div', null,
          U.h('b', { text: 'این فعالیت عنصر کاری ندارد' }),
          U.h('div', { style: { color: 'var(--foreground)' }, text: 'برگهٔ زمان‌سنجی ستون‌هایش را از عناصر کاری فعالیت می‌سازد؛ ابتدا عناصر را در ساختار تولید تعریف کنید.' }))));
    }
    if (operators.length === 0) {
      wrap.appendChild(U.h('div', { class: 'banner warning' }, U.icon('alertTriangle'),
        U.h('div', null,
          U.h('b', { text: 'اپراتوری ثبت نشده است' }),
          U.h('div', { style: { color: 'var(--foreground)' }, text: 'هر جلسه ترکیبی از فعالیت × اپراتور × روش اندازه‌گیری است؛ ابتدا اپراتورها را ثبت کنید.' }))));
    }

    /* زیرهدر چسبان — §۱۲.۱: عنوان فعالیت/ایستگاه، فهرست فعالیت‌ها،
        چیپ‌های فیلتر اپراتور و جلسهٔ جدید؛ کارت‌های جلسه چسبان نیستند */
    wrap.appendChild(buildSubheader(ctx, {
      variant: 'list',
      activityName: activity.name,
      stationName: station ? station.name : '—',
      operatorFilter: filter,
      operators: operators,
      sessions: sessions,
      canCreate: elements.length > 0 && operators.length > 0,
    }));

    /* سربرگ لاغر مرحله — اطلاعات فعالیت/ایستگاه و دکمه‌ها در زیرهدر چسبان است — §۱۲.۱ */
    wrap.appendChild(U.h('div', { class: 'card', style: { padding: '10px 16px' } },
      U.h('div', { class: 'flex flex-wrap items-center gap-2' },
        U.h('h2', { class: 'text-sm font-bold shrink-0', text: 'جلسات این فعالیت' }),
        activity.targetSampleCount
          ? UI.badge('هدف ' + U.formatInt(activity.targetSampleCount) + ' چرخه', 'brand', 'target')
          : UI.badge('بدون هدف نمونه', 'muted'),
        U.h('span', { class: 'text-xs text-muted' }, U.formatInt(sessions.length) + ' جلسه ثبت‌شده'))));

    /* فهرست جلسات */
    var listWrap = U.h('div', { class: 'flex flex-col gap-3' });
    wrap.appendChild(listWrap);
    if (visible.length === 0) {
      listWrap.appendChild(UI.emptyState({
        title: 'هنوز جلسه‌ای برای این فعالیت ثبت نشده است',
        desc: 'برای شروع زمان‌سنجی، جلسه‌ای با انتخاب اپراتور و روش اندازه‌گیری (برگشت به صفر یا پیوسته) ایجاد کنید. هر جلسه برگهٔ مستقلی دارد و جلسهٔ جدید مستقل از جلسهٔ قبلی است.',
        icon: 'timer',
        actionLabel: 'ایجاد اولین جلسه',
        onAction: function () { openCreateSessionDialog(ctx); },
      }));
      return;
    }
    visible.forEach(function (s) { listWrap.appendChild(sessionCard(s)); });

    /* ── کارت یک جلسه ── */
    function sessionCard(s) {
      var sh = getSheetCached(s.id);
      var opName = sh.operator.displayName;
      var methodLabel = DB.CONST.TIMING_METHOD_LABELS[s.timingMethod] || s.timingMethod;
      var isOpen = s.status === 'OPEN';

      var card = U.h('div', { class: 'card p-4' },
        U.h('div', { class: 'flex flex-wrap items-center gap-2' },
          U.h('span', { class: 'avatar shrink-0', 'aria-hidden': 'true' }, initials(opName)),
          U.h('span', { class: 'font-semibold truncate', text: opName }),
          UI.badge(methodLabel, s.timingMethod === 'SNAPBACK' ? 'cyan' : 'brand'),
          isOpen ? UI.badge('باز', 'green', 'checkCircle') : UI.badge('بسته', 'muted', 'lock'),
          U.h('div', { class: 'spacer' }),
          UI.dropdownMenu([
            { label: 'یادداشت جلسه', icon: 'stickyNote', onClick: function () { openNotesDialog(s); } },
            { label: 'حذف جلسه', icon: 'trash', destructive: true, onClick: function () { deleteSessionFlow(s); } },
          ], { ariaLabel: 'منوی عملیات جلسه' })),
        U.h('div', { class: 'flex flex-wrap items-center gap-3 mt-2 text-xs text-muted' },
          U.h('span', { class: 'num' }, U.formatInt(sh.stats.sessionCycles) + ' چرخه • ' + U.formatInt(sh.stats.sessionValidCycles) + ' معتبر'),
          U.h('span', { class: 'flex items-center gap-1' }, U.icon('calendarClock'), U.formatDateTime(s.startedAt)),
          s.notes ? U.h('span', { class: 'truncate', style: { maxWidth: '280px' }, title: s.notes }, s.notes) : null),
        U.h('div', { class: 'mt-3' },
          U.h('button', {
            class: 'btn btn-outline w-fit', type: 'button',
            onclick: function () { selectedSession[ctx.activityId] = s.id; ctx.render(); },
          }, U.icon('arrowLeft'), 'باز کردن برگهٔ زمان‌سنجی')));
      return card;
    }

    /* ── یادداشت جلسه ── */
    function openNotesDialog(s) {
      var notes = s.notes || '';
      UI.dialog({
        title: 'یادداشت جلسه',
        bodyBuilder: function (body) {
          var ta = U.h('textarea', { class: 'textarea', placeholder: 'مثلاً: نوبت عصر — شرایط دمای کارگاه بالاتر از حد معمول' }, notes);
          ta.addEventListener('input', function () { notes = ta.value; });
          body.appendChild(U.h('div', { class: 'field-label' }, 'یادداشت جلسه'));
          body.appendChild(ta);
        },
        footerBuilder: function (close) {
          return U.h('div', { class: 'dialog-footer' },
            U.h('button', { class: 'btn', text: 'انصراف', onclick: close }),
            U.h('div', { class: 'spacer' }),
            U.h('button', {
              class: 'btn btn-brand', text: 'ذخیره',
              onclick: function () {
                try { DB.updateSession(s.id, { notes: notes }); } catch (err) { UI.toastError(err); return; }
                invalidateSheetCache(s.id);
                close();
                UI.toast('یادداشت جلسه ذخیره شد');
                ctx.render();
              },
            }));
        },
      });
    }

    /* ── حذف جلسه (با شمارش وابستگی‌ها پیش از حذف) ── */
    function deleteSessionFlow(s) {
      var sh = getSheetCached(s.id);
      var cyclesCount = DB.getState().cycleObservations.filter(function (c) { return c.sessionId === s.id; }).length;
      var name = sh.operator.displayName + ' — ' + (DB.CONST.TIMING_METHOD_LABELS[s.timingMethod] || s.timingMethod);
      UI.confirmDelete({ title: 'حذف جلسهٔ زمان‌سنجی', name: name, deps: { 'چرخه‌های ثبت‌شده': cyclesCount } })
        .then(function (ok) {
          if (!ok) return;
          try { deleteSessionSafe(s.id); } catch (err) { UI.toastError(err); return; }
          invalidateSheetCache(s.id);
          delete historyMap[s.id];
          delete entryModeMap[s.id];
          delete anchorMap[s.id];
          delete expandedMap[s.id];
          if (selectedSession[ctx.activityId] === s.id) selectedSession[ctx.activityId] = null;
          UI.toast('جلسه حذف شد');
          ctx.render();
        });
    }
  }

  /* ═══════════ برگهٔ زمان‌سنجی ═══════════ */
  function renderSheet(flowEl, ctx, sessionId) {
    var sheet = DB.getSheet(sessionId);
    sheetCache[sessionId] = sheet;
    var session = sheet.session;
    var method = session.timingMethod;
    var editable = session.status === 'OPEN';
    var elements = sheet.elements;
    var cycles = sheet.cycles;
    var stats = sheet.stats;
    var expandedId = expandedMap[sessionId] || null;
    var histState = hist(sessionId);
    var methodLabel = DB.CONST.TIMING_METHOD_LABELS[method] || method;

    /* حفظ اسکرول برگه بین رندرها + کانون سلول (فقط اگر کانون روی ورودی برگه بود) */
    var prevGrid = flowEl.querySelector('.sheet-grid');
    var scrollPos = prevGrid ? { top: prevGrid.scrollTop, left: prevGrid.scrollLeft } : null;
    var prevActive = document.activeElement;
    var restoreFocus = !!(prevGrid && prevActive && prevActive !== document.body &&
      prevGrid.contains(prevActive) && prevActive.classList && prevActive.classList.contains('sheet-cell') &&
      lastFocusedCell && lastFocusedCell.sid === sessionId);

    U.clear(flowEl);
    var wrap = U.h('div');
    flowEl.appendChild(wrap);

    /* رندر به‌تعویق‌افتاده پس از ثبت سلول — تا کلیک‌های در حال انجام ناقص نشوند */
    function scheduleRender() {
      setTimeout(function () { ctx.render(); }, 0);
    }
    function reopen() {
      DB.reopenSession(sessionId);
      invalidateSheetCache(sessionId);
      UI.toast('جلسه بازگشایی شد');
      ctx.render();
    }

    /* ۱) زیرهدر چسبان — §۱۲.۱: عنوان فعالیت/ایستگاه، فهرست فعالیت‌ها،
          نشان اپراتور جلسهٔ فعال (نشان برجستهٔ یکتا) و جلسهٔ جدید */
    wrap.appendChild(buildSubheader(ctx, {
      variant: 'sheet',
      activityName: sheet.activity.name,
      stationName: sheet.activity.stationName || '—',
      activeOperatorName: sheet.operator.displayName,
      canCreate: elements.length > 0 && DB.listOperators(ctx.projectId).length > 0,
    }));

    /* ۲) بنر جلسهٔ بسته */
    if (!editable) {
      wrap.appendChild(U.h('div', { class: 'banner info mb-3' }, U.icon('lock'),
        U.h('div', { class: 'flex flex-wrap items-center gap-2' },
          U.h('span', { text: 'این جلسه بسته است؛ برگه فقط‌خواندنی است. برای ثبت داده، جلسهٔ جدید ایجاد کنید.' }),
          U.h('button', { class: 'btn btn-sm btn-outline shrink-0', type: 'button', onclick: reopen }, U.icon('lockOpen'), 'بازگشایی'))));
    }

    /* راهنمای برگه — نزدیک عنوان برگه (منتقل‌شده از نوار ابزار) */
    var sheetHelp = {
      what: 'جدول چرخه‌محور زمان‌سنجی: هر ردیف یک چرخهٔ کامل فعالیت و هر ستون یک عنصر کاری.',
      input: method === 'CONTINUOUS'
        ? 'در روش پیوسته، قرائت تجمعی کرنومتر را در پایان هر عنصر وارد کنید؛ مدت هر عنصر به‌صورت خودکار از تفاضل قرائت‌ها محاسبه و زیر سلول نمایش داده می‌شود. قرائت‌ها باید نزولی نباشند.'
        : 'در روش برگشت به صفر، مدت سپری‌شدهٔ هر عنصر را مستقیم وارد کنید. برای عناصر هم‌زمان، مقدار را به‌صورت «شروع-پایان» (مثل ۳-۹) نسبت به مبدأ چرخه وارد کنید.',
      example: 'ورودی «۱۲٫۵» یا «12.5» — بازهٔ «۳ تا ۹» یا «3-9» — حرکت با Tab/Enter و جهت‌نما؛ کپی محدوده با Shift+جهت‌نما و Ctrl+C.',
      note: 'زمان سپری‌شدهٔ چرخه در کارهای هم‌زمان، گستره (دیرترین پایان − زودترین شروع) است نه جمع مدت‌ها. دادهٔ خام هرگز حذف نمی‌شود؛ خروج از محاسبه فقط وضعیت را عوض می‌کند.',
    };

    /* ۳) سربرگ لاغر برگه — §۱۲.۱: عنوان فعالیت/ایستگاه و اپراتور
          فقط در زیرهدر چسبان بالای صفحه نمایش داده می‌شوند */
    wrap.appendChild(U.h('div', { class: 'card mb-3', style: { padding: '10px 14px' } },
      U.h('div', { class: 'flex flex-wrap items-center gap-2' },
        U.h('button', {
          class: 'btn btn-sm btn-outline shrink-0', type: 'button',
          onclick: function () { selectedSession[ctx.activityId] = null; ctx.render(); },
        }, U.icon('arrowRight'), 'بازگشت به جلسات'),
        U.h('h2', { class: 'font-bold shrink-0', style: { fontSize: '14px' } },
          'برگهٔ زمان‌سنجی',
          UI.helpDot('برگهٔ زمان‌سنجی', sheetHelp)),
        UI.badge(methodLabel, method === 'SNAPBACK' ? 'cyan' : 'brand'),
        !editable ? UI.badge('بسته', 'muted', 'lock') : null,
        U.h('span', { class: 'num text-xs text-muted shrink-0' }, U.formatInt(stats.sessionCycles) + ' چرخه در این جلسه'),
        U.h('div', { class: 'spacer' }),
        editable
          ? U.h('button', {
              class: 'btn btn-sm btn-outline shrink-0', type: 'button',
              onclick: function () {
                UI.confirmDialog({
                  title: 'بستن جلسهٔ زمان‌سنجی؟',
                  desc: 'پس از بستن، برگهٔ این جلسه فقط‌خواندنی می‌شود. برای ادامهٔ ثبت داده (یا تغییر روش اندازه‌گیری) باید جلسهٔ جدیدی ایجاد کنید؛ جلسهٔ جدید مستقل است و مبنای قرائت پیوسته از نو آغاز می‌شود. می‌توانید جلسه را بعداً بازگشایی کنید؛ روش اندازه‌گیری هرگز تغییر نمی‌کند.',
                  confirmLabel: 'بستن جلسه',
                  destructive: false,
                }).then(function (ok) {
                  if (!ok) return;
                  DB.closeSession(sessionId);
                  invalidateSheetCache(sessionId);
                  UI.toast('جلسه بسته شد؛ برگه فقط‌خواندنی است');
                  ctx.render();
                });
              },
            }, U.icon('lock'), 'بستن جلسه')
          : U.h('button', { class: 'btn btn-sm btn-outline shrink-0', type: 'button', onclick: reopen }, U.icon('lockOpen'), 'بازگشایی'))));

    /* ۴) نوار ابزار */
    var closedHint = 'جلسه بسته است؛ برای ثبت داده، جلسهٔ جدید ایجاد کنید.';
    var addDd = UI.dropdownMenu(
      [[1, '۱ چرخه'], [5, '۵ چرخه'], [10, '۱۰ چرخه'], [20, '۲۰ چرخه']].map(function (it) {
        return {
          label: it[1], icon: 'plus',
          onClick: function () {
            if (withUndo(sessionId, 'افزودن چرخه', function () { DB.addCycles(sessionId, it[0]); })) {
              invalidateSheetCache(sessionId);
              UI.toast(U.formatInt(it[0]) + ' چرخه اضافه شد');
              ctx.render();
            }
          },
        };
      }),
      { class: 'btn btn-sm btn-outline', iconName: 'plus', ariaLabel: 'افزودن چرخه', 'aria-label': 'افزودن چرخه', disabled: !editable, title: editable ? 'افزودن چرخه' : closedHint });
    var addBtn = addDd.querySelector('button');
    if (addBtn) addBtn.appendChild(U.h('span', { text: 'افزودن چرخه' }));

    var toolbar = U.h('div', { class: 'flex flex-wrap items-center gap-2 mb-3' },
      U.h('button', {
        class: 'icon-btn', type: 'button', 'aria-label': 'واگردانی (Ctrl+Z)',
        title: histState.undo.length ? histState.undo[histState.undo.length - 1].label : 'واگردانی',
        disabled: !histState.undo.length || !editable,
        style: (!histState.undo.length || !editable) ? { opacity: '.45' } : null,
        onclick: function () { doUndo(sessionId, ctx.render); },
      }, U.icon('undo2')),
      U.h('button', {
        class: 'icon-btn', type: 'button', 'aria-label': 'انجام دوباره (Ctrl+Y)',
        title: histState.redo.length ? histState.redo[histState.redo.length - 1].label : 'انجام دوباره',
        disabled: !histState.redo.length || !editable,
        style: (!histState.redo.length || !editable) ? { opacity: '.45' } : null,
        onclick: function () { doRedo(sessionId, ctx.render); },
      }, U.icon('redo2')),
      addDd,
      U.h('button', {
        class: 'btn btn-sm btn-outline', type: 'button', disabled: !editable, title: editable ? null : closedHint,
        onclick: function () { openPasteDialog(); },
      }, U.icon('clipboardPaste'), 'Paste از Excel'),
      U.h('span', { class: 'text-xs text-faint' }, 'Tab/Enter حرکت • F2 یا کلیک ویرایش • Ctrl+Z واگردانی'));
    wrap.appendChild(toolbar);

    /* ۵) کارت پیشرفت نمونه */
    var valid = stats.activityValidCycles;
    var target = stats.targetSampleCount;
    var thisSessionValid = stats.sessionValidCycles;
    var pct = target ? Math.min(100, Math.round((valid / target) * 100)) : 100;
    /* نوار پیشرفت — کهربایی تا زمان رسیدن به هدف */
    var notReached = !!(target && valid < target);
    var progressCard = U.h('div', { class: 'card p-4 mb-3' },
      U.h('div', { class: 'flex flex-wrap items-center gap-2' },
        U.icon('target'),
        U.h('span', { class: 'font-bold text-sm', text: 'پیشرفت تعداد نمونهٔ فعالیت' }),
        UI.helpDot('تعداد نمونه', {
          what: 'تعداد چرخه‌های معتبر ثبت‌شده در برابر هدف تعیین‌شده برای کل فعالیت (نه هر اپراتور).',
          input: 'هدف را در مشخصات فعالیت (ساختار تولید) تعیین کنید. شمارش بر اساس چرخه‌های کامل بدون مشاهدهٔ خارج‌شده است.',
          example: 'هدف ۱۰ چرخه؛ اگر ۷ چرخهٔ معتبر ثبت شده باشد، هشدار کمبود نمونه نمایش داده می‌شود.',
          note: 'رسیدن به تعداد هدف فقط به معنای «رسیدن به تعداد ثبت‌شده» است و کفایت آماری تضمین‌شده تلقی نمی‌شود؛ شاخص‌های پراکندگی در فاز تحلیل نمایش داده می‌شوند.',
        }),
        U.h('div', { class: 'spacer' }),
        U.h('span', { class: 'font-extrabold num' },
          target ? U.formatInt(valid) + ' / ' + U.formatInt(target) : U.formatInt(valid) + ' (بدون هدف)'),
        U.h('span', { class: 'text-xs text-muted' }, '— این جلسه: ' + U.formatInt(thisSessionValid) + ' معتبر')),
      U.h('div', {
        class: 'progress mt-2' + (notReached ? ' amber' : ''), role: 'progressbar', 'aria-label': 'پیشرفت تعداد نمونه',
        'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct),
      }, U.h('div', { style: { width: pct + '%' } })));
    if (notReached) {
      progressCard.appendChild(U.h('div', { class: 'banner warning mt-2' }, U.icon('alertTriangle'),
        U.h('div', { style: { color: 'var(--foreground)' } },
          'هنوز به تعداد نمونهٔ هدف نرسیده‌اید (' + U.formatInt(target - valid) + ' چرخه باقی مانده). رسیدن به هدف، کفایت آماری را به‌تنهایی تضمین نمی‌کند.')));
    }
    wrap.appendChild(progressCard);

    /* ۶) جدول برگه */
    var table = U.h('table');

    /* — سربرگ — */
    var theadRow = U.h('tr', null, U.h('th', { class: 'sticky-col', text: 'چرخه' }));
    elements.forEach(function (el) {
      var mode = entryModeOf(sessionId, el);
      var tb = TYPE_BADGE[el.elementType] || { label: el.elementType, variant: 'muted' };
      var chipBtn = null;
      if (editable) {
        chipBtn = U.h('button', {
          class: 't2t-entry-chip', type: 'button',
          title: mode === 'SEQ' ? 'ورودی ترتیبی — برای بازه‌ای تغییر دهید' : 'ورودی بازه‌ای — برای ترتیبی تغییر دهید',
          onclick: function () {
            var m = entryModeMap[sessionId] || (entryModeMap[sessionId] = {});
            m[el.id] = mode === 'SEQ' ? 'INT' : 'SEQ';
            ctx.render();
          },
        }, mode === 'SEQ' ? (method === 'CONTINUOUS' ? 'قرائت' : 'مدت') : 'شروع/پایان');
      }
      /* §۶ ممیزی جلسه ۲ — دکمهٔ روابط موازی عنصر در سربرگ ستون برگهٔ زمان‌سنجی؛
         مقادیر به چرخه‌های همین جلسه محدود می‌شود (هم‌ارز نسخهٔ آنلاین) */
      var parallelBtn = U.h('button', {
        class: 't2t-entry-chip', type: 'button',
        title: 'عناصر موازی و اطلاعات هم‌پوشانی «' + el.name + '»',
        'aria-label': 'عناصر موازی و اطلاعات هم‌پوشانی «' + el.name + '»',
        onclick: function (e) {
          e.stopPropagation();
          UI.dialog({
            title: 'عناصر موازی و اطلاعات هم‌پوشانی',
            desc: 'عنصر «' + el.name + '» — مقادیر چرخه‌های همین جلسه',
            bodyBuilder: function (body) {
              if (g.T2VIEWS && g.T2VIEWS._parallelRelationsSection) {
                g.T2VIEWS._parallelRelationsSection(body, sheet.activity.projectId, el.id, el.name, {
                  sessionId: sessionId,
                  cycles: sheet.cycles.map(function (c) {
                    return { cycleId: c.id, cycleNo: c.cycleNo };
                  }),
                });
              }
            },
            footerBuilder: function (close) {
              return U.h('div', { class: 'dialog-footer' },
                U.h('button', { class: 'btn btn-outline', type: 'button', text: 'بستن', onclick: close }));
            },
          });
        },
      }, U.icon('network'));
      theadRow.appendChild(U.h('th', null,
        U.h('div', { class: 'font-bold text-xs truncate', title: el.name, text: el.name }),
        U.h('div', { class: 'flex flex-wrap items-center justify-center gap-1 mt-0.5' },
          UI.badge(tb.label, tb.variant),
          chipBtn,
          parallelBtn)));
    });
    theadRow.appendChild(U.h('th', { text: 'سپری‌شده' }));
    table.appendChild(U.h('thead', null, theadRow));

    /* — بدنه — */
    var tbody = U.h('tbody');
    table.appendChild(tbody);
    if (cycles.length === 0) {
      tbody.appendChild(U.h('tr', null,
        U.h('td', { colspan: String(elements.length + 2), class: 'text-center', style: { padding: '36px 16px', color: 'var(--muted-foreground)', fontSize: '13px' } },
          'هنوز چرخه‌ای ثبت نشده است. با دکمهٔ «افزودن چرخه» شروع کنید یا داده را از Excel بچسبانید.')));
    }
    cycles.forEach(function (cycle, rowIdx) {
      var isExpanded = expandedId === cycle.id;
      var tr = U.h('tr', { class: (cycle.hasExcluded ? 'row-excluded' : '') + (cycle.hasSuspect ? ' row-suspect' : '') });
      tr.appendChild(stickyCycleCell(cycle, isExpanded));
      elements.forEach(function (el, colIdx) { tr.appendChild(buildCellTd(cycle, rowIdx, el, colIdx)); });
      tr.appendChild(elapsedCell(cycle));
      tbody.appendChild(tr);
      if (isExpanded) {
        tbody.appendChild(U.h('tr', null,
          U.h('td', { colspan: String(elements.length + 2) }, buildExpanded(cycle))));
      }
    });

    /* — پانوشت: مشاهدات معتبر — */
    if (cycles.length > 0) {
      var tfootRow = U.h('tr', null,
        U.h('td', { class: 'sticky-col num', style: { height: '28px', fontWeight: 700, fontSize: '10px', color: 'var(--muted-foreground)' }, text: 'معتبر' }));
      elements.forEach(function (el) {
        var st = stats.perElement[el.id] || { calcCount: 0, totalCount: 0 };
        tfootRow.appendChild(U.h('td', {
          class: 'num', title: 'مشاهدات وارد محاسبه',
          style: { height: '28px', fontSize: '11px', fontWeight: 600 },
        }, U.formatInt(st.calcCount) + '/' + U.formatInt(st.totalCount)));
      });
      tfootRow.appendChild(U.h('td', { class: 'num', style: { height: '28px', fontSize: '11px', fontWeight: 700 } }, U.formatInt(stats.sessionValidCycles) + ' چرخهٔ معتبر'));
      table.appendChild(U.h('tfoot', { class: 'tfoot-bar' }, tfootRow));
    }

    var grid = U.h('div', { class: 'sheet-grid', tabindex: '0', role: 'grid', 'aria-label': 'برگه زمان‌سنجی' }, table);
    wrap.appendChild(grid);
    if (scrollPos) { grid.scrollTop = scrollPos.top; grid.scrollLeft = scrollPos.scrollLeft || scrollPos.left; }
    activeGrid = grid;

    /* ناوبری کیبورد — یک شنوندهٔ نمایندگی‌شده روی ظرف جدول
       (Tab طبیعی است؛ Enter/جهت‌نما مدیریت می‌شوند) */
    var lastRow = cycles.length - 1;
    grid.addEventListener('keydown', function (e) {
      var inp = e.target;
      if (!inp || !inp.classList || !inp.classList.contains('sheet-cell')) return;
      var r = parseInt(inp.dataset.cycle, 10);
      var c = parseInt(inp.dataset.el, 10);
      var part = inp.dataset.part || 'seq';
      var lastCol = elements.length - 1;
      var next = null;
      if (e.key === 'Enter' || e.key === 'ArrowDown') {
        e.preventDefault();
        next = { r: Math.min(r + 1, lastRow), c: c, part: part };
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        next = { r: Math.max(r - 1, 0), c: c, part: part };
      } else if (e.key === 'ArrowLeft') {
        /* RTL: عنصر بعدی در سمت چپ است */
        e.preventDefault();
        next = part === 'start' ? { r: r, c: c, part: 'end' } : { r: r, c: Math.min(c + 1, lastCol), part: 'start' };
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        next = part === 'end' ? { r: r, c: c, part: 'start' } : { r: r, c: Math.max(c - 1, 0), part: 'end' };
      }
      if (next) moveFocus(next);
    });

    /* ثبت لنگر Paste + آخرین سلول متمرکز */
    grid.addEventListener('focusin', function (e) {
      var t = e.target;
      if (!t || !t.classList || !t.classList.contains('sheet-cell')) return;
      var r = parseInt(t.dataset.cycle, 10) || 0;
      var c = parseInt(t.dataset.el, 10) || 0;
      lastFocusedCell = { sid: sessionId, r: r, c: c, part: t.dataset.part || 'seq' };
      var cyc = cycles[r];
      var elc = elements[c];
      if (cyc && elc) anchorMap[sessionId] = { cycleNo: cyc.cycleNo, elementId: elc.id };
    });

    /* Ctrl+Z / Ctrl+Y سند — فقط تا وقتی همین برگه در DOM است */
    attachDocKeys();

    /* بازگردانی کانون پس از رندر */
    if (pendingFocus) {
      var pf = pendingFocus;
      pendingFocus = null;
      applyFocusCell(grid, pf);
    } else if (restoreFocus) {
      var el2 = findGridInput(grid, lastFocusedCell.r, lastFocusedCell.c, lastFocusedCell.part);
      if (el2) el2.focus();
    }

    function attachDocKeys() {
      if (sheetKeyHandler) document.removeEventListener('keydown', sheetKeyHandler);
      sheetKeyHandler = function (e) {
        if (!flowEl.isConnected) {
          document.removeEventListener('keydown', sheetKeyHandler);
          sheetKeyHandler = null;
          return;
        }
        /* فقط وقتی خود برگه نمایش داده می‌شود (نه فهرست جلسات) */
        if (!flowEl.querySelector('.sheet-grid')) return;
        if (!editable) return;
        if (document.querySelector('.dialog-overlay')) return;
        var ctrl = e.ctrlKey || e.metaKey;
        if (!ctrl) return;
        var k = (e.key || '').toLowerCase();
        if (k === 'z' && !e.shiftKey) { e.preventDefault(); doUndo(sessionId, ctx.render); }
        else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); doRedo(sessionId, ctx.render); }
      };
      document.addEventListener('keydown', sheetKeyHandler);
    }

    /* ── ستون چرخه (چسبان راست) ── */
    function stickyCycleCell(cycle, isExpanded) {
      return U.h('td', { class: 'sticky-col' },
        U.h('div', { class: 'flex items-center justify-center gap-0.5' },
          U.h('button', {
            class: 'icon-btn sm', type: 'button',
            'aria-label': 'جزئیات چرخهٔ ' + U.formatInt(cycle.cycleNo),
            'aria-expanded': isExpanded ? 'true' : 'false',
            title: isExpanded ? 'بستن جزئیات چرخه' : 'نمایش جزئیات چرخه',
            onclick: function () {
              expandedMap[sessionId] = isExpanded ? null : cycle.id;
              ctx.render();
            },
          }, U.icon('chevronDown')),
          U.h('span', { class: 'num font-extrabold', style: { minWidth: '16px' }, text: U.formatInt(cycle.cycleNo) }),
          U.h('span', {
            title: cycle.isComplete ? 'چرخهٔ کامل' : 'چرخهٔ ناقص',
            style: { display: 'inline-flex', color: cycle.isComplete ? 'var(--green)' : 'var(--amber)' },
          }, U.icon(cycle.isComplete ? 'check' : 'alertTriangle')),
          cycle.notes
            ? U.h('span', { title: 'دارای یادداشت', style: { display: 'inline-flex', color: 'var(--faint)' } }, U.icon('stickyNote'))
            : null));
    }

    /* ── سلول «سپری‌شده» ── */
    function elapsedCell(cycle) {
      var td = U.h('td');
      if (cycle.elapsed === null || cycle.elapsed === undefined) {
        td.appendChild(U.h('span', {
          class: 'text-xs', style: { color: 'var(--amber)', display: 'inline-flex', alignItems: 'center', gap: '3px' },
          title: cycle.elapsedExcludesSequential
            ? 'این چرخه علاوه بر بازه‌ها، عناصر ترتیبی بدون موقعیت هم دارد؛ «سپری‌شده» فقط از بازه‌های دارای شروع/پایان محاسبه شده است.'
            : 'چرخه ناقص است',
        }, U.icon('alertTriangle'), 'نیازمند تکمیل'));
      } else {
        var sp = U.h('span', { class: 'num text-xs font-bold' }, U.formatTimeValue(cycle.elapsed));
        if (cycle.elapsedExcludesSequential) {
          sp.appendChild(U.h('span', {
            title: 'این چرخه علاوه بر بازه‌ها، عناصر ترتیبی بدون موقعیت هم دارد؛ «سپری‌شده» فقط از بازه‌های دارای شروع/پایان محاسبه شده است.',
            style: { display: 'inline-flex', color: 'var(--amber)', marginInlineStart: '3px' },
          }, U.icon('alertTriangle')));
        }
        td.appendChild(sp);
      }
      return td;
    }

    /* ── متن نمایشی سلول (جلسهٔ بسته) ── */
    function displayText(obs) {
      if (!obs) return '';
      if (obs.startOffset !== null || obs.endOffset !== null) {
        if (obs.startOffset !== null && obs.endOffset !== null) {
          return U.formatTimeValue(obs.startOffset) + ' – ' + U.formatTimeValue(obs.endOffset);
        }
        return obs.startOffset !== null ? U.formatTimeValue(obs.startOffset) + ' – ؟' : '؟ – ' + U.formatTimeValue(obs.endOffset);
      }
      if (method === 'CONTINUOUS' && obs.cumulativeReading !== null) return U.formatTimeValue(obs.cumulativeReading);
      if (obs.rawDuration !== null) return U.formatTimeValue(obs.rawDuration);
      return '';
    }

    /* ── سازندهٔ سلول عنصر ── */
    function buildCellTd(cycle, rowIdx, el, colIdx) {
      var obs = findObs(cycle, el.id);
      var mode = entryModeOf(sessionId, el);
      var excluded = !!obs && obs.validityStatus === 'EXCLUDED';
      var suspect = !!obs && obs.validityStatus === 'SUSPECT';
      var partial = !!obs && (obs.startOffset !== null) !== (obs.endOffset !== null);
      var td = U.h('td');
      if (partial || (!!obs && obs.validityStatus === 'INVALID')) {
        td.style.boxShadow = 'inset 0 0 0 2px color-mix(in srgb, var(--amber) 60%, transparent)';
      }

      /* خط مدت مشتق زیر مقدار */
      var derivedText = null;
      if (mode === 'SEQ' && method === 'CONTINUOUS' && obs && obs.cumulativeReading !== null && obs.derivedDuration !== null) {
        derivedText = U.formatTimeValue(obs.derivedDuration);
      } else if (mode === 'INT' && obs && obs.startOffset !== null && obs.endOffset !== null && obs.derivedDuration !== null) {
        derivedText = U.formatTimeValue(obs.derivedDuration);
      }

      var stack = U.h('div', { class: 'flex flex-col', style: { height: '100%' } });
      var row = U.h('div', { class: 'flex items-center justify-center gap-0.5 flex-1 min-w-0' });
      stack.appendChild(row);
      if (derivedText !== null) {
        stack.appendChild(U.h('div', { class: 'cell-derived', text: '(' + derivedText + ')', style: { paddingBottom: '1px' } }));
      }
      td.appendChild(stack);

      var errEl = null;
      function clearError() {
        if (errEl && errEl.parentNode) errEl.parentNode.removeChild(errEl);
        errEl = null;
      }
      function showError(msg) {
        clearError();
        errEl = U.h('div', { class: 'cell-error', text: msg });
        td.appendChild(errEl);
      }
      function readNum(v) {
        var t = String(v).trim();
        if (t === '' || t === '-' || t === '—' || t === '–') return { empty: true };
        var n = U.parseNumber(t);
        if (isNaN(n)) return { bad: true };
        return { n: n };
      }

      function makeInput(part, value) {
        return U.h('input', {
          class: 'sheet-cell' + (excluded ? ' excluded' : ''),
          type: 'text', dir: 'ltr', inputmode: 'decimal',
          value: value,
          'aria-label': part === 'start'
            ? 'شروع بازهٔ ' + el.name
            : part === 'end'
              ? 'پایان بازهٔ ' + el.name
              : 'مقدار ' + el.name + ' چرخهٔ ' + U.formatInt(cycle.cycleNo),
          disabled: excluded,
          dataset: { cycle: String(rowIdx), el: String(colIdx), part: part },
          style: part === 'seq' ? { width: '100%' } : { width: '44px' },
        });
      }

      var seqIn = null, startIn = null, endIn = null;

      function liveValidate() {
        clearError();
        if (mode === 'INT') {
          var a = readNum(startIn.value);
          var b = readNum(endIn.value);
          if (a.bad || b.bad) showError('مقدار عددی معتبر نیست (ارقام فارسی یا لاتین)');
          else if ((!a.empty && a.n < 0) || (!b.empty && b.n < 0)) showError('زمان منفی مجاز نیست');
          else if (!a.empty && !b.empty && b.n <= a.n) showError('پایان بازه باید بزرگ‌تر از شروع آن باشد');
        } else {
          var q = readNum(seqIn.value);
          if (q.bad) showError('مقدار عددی معتبر نیست (ارقام فارسی یا لاتین)');
          else if (!q.empty && q.n < 0) showError('زمان منفی مجاز نیست');
        }
      }

      function commitCell() {
        liveValidate();
        if (errEl) { scheduleRender(); return; } /* ورودی نامعتبر → بازگردانی */
        var cell;
        if (mode === 'INT') {
          var a = readNum(startIn.value);
          var b = readNum(endIn.value);
          if (a.empty && b.empty) {
            if (!obs || (obs.rawDuration === null && obs.cumulativeReading === null && obs.startOffset === null && obs.endOffset === null)) { scheduleRender(); return; }
            cell = { cycleNo: cycle.cycleNo, workElementId: el.id, rawDuration: null, cumulativeReading: null, startOffset: null, endOffset: null };
          } else {
            var sv = a.empty ? null : a.n;
            var ev = b.empty ? null : b.n;
            if (obs && obs.startOffset === sv && obs.endOffset === ev) { scheduleRender(); return; }
            cell = { cycleNo: cycle.cycleNo, workElementId: el.id, startOffset: sv, endOffset: ev };
          }
        } else {
          var q = readNum(seqIn.value);
          if (q.empty) {
            if (!obs || (obs.rawDuration === null && obs.cumulativeReading === null)) { scheduleRender(); return; }
            cell = { cycleNo: cycle.cycleNo, workElementId: el.id, rawDuration: null, cumulativeReading: null };
          } else {
            var cur = method === 'SNAPBACK' ? (obs ? obs.rawDuration : null) : (obs ? obs.cumulativeReading : null);
            if (cur === q.n) { scheduleRender(); return; }
            cell = method === 'SNAPBACK'
              ? { cycleNo: cycle.cycleNo, workElementId: el.id, rawDuration: q.n }
              : { cycleNo: cycle.cycleNo, workElementId: el.id, cumulativeReading: q.n };
          }
        }
        if (withUndo(sessionId, 'ثبت سلول', function () { DB.putCells(sessionId, [cell]); })) {
          invalidateSheetCache(sessionId);
        }
        scheduleRender();
      }

      if (!editable) {
        row.appendChild(U.h('span', { class: 'num text-xs font-medium', text: displayText(obs) || '—' }));
        /* سلول مشکوک در حالت فقط‌خواندنی → دیالوگ تشخیص — §۱۲.۳ */
        if (suspect && obs) {
          td.style.cursor = 'pointer';
          td.addEventListener('click', function () { openSuspectDialog(cycle, obs, el.name); });
        }
      } else if (mode === 'INT') {
        startIn = makeInput('start', roundEdit(obs ? obs.startOffset : null));
        endIn = makeInput('end', roundEdit(obs ? obs.endOffset : null));
        [startIn, endIn].forEach(function (inp) {
          inp.addEventListener('input', liveValidate);
          inp.addEventListener('change', commitCell);
        });
        /* گروه بصری «از/تا» برای دو ورودی ۴۴px بازه‌ای — §۱۲.۲:
           برچسب کوچک هر ورودی + قاب واحد گردگوشه؛ ورودی‌ها LTR می‌مانند */
        row.appendChild(U.h('div', { class: 't2t-int-group', dir: 'ltr', role: 'group', 'aria-label': 'بازهٔ ' + el.name },
          U.h('label', { class: 't2t-int-part' },
            U.h('span', { class: 't2t-int-label', 'aria-hidden': 'true', text: 'از' }),
            startIn),
          U.h('span', { class: 't2t-int-sep', 'aria-hidden': 'true', text: '–' }),
          U.h('label', { class: 't2t-int-part' },
            U.h('span', { class: 't2t-int-label', 'aria-hidden': 'true', text: 'تا' }),
            endIn)));
      } else {
        var val = obs ? (obs.rawDuration !== null ? obs.rawDuration : obs.cumulativeReading) : null;
        seqIn = makeInput('seq', roundEdit(val));
        seqIn.addEventListener('input', liveValidate);
        seqIn.addEventListener('change', commitCell);
        row.appendChild(seqIn);
      }

      /* پرچم‌های وضعیت — پرچم مشکوک با کلیک دیالوگ تشخیص را باز می‌کند — §۱۲.۳ */
      var flags = [];
      if (excluded) flags.push(U.h('span', { class: 'cell-flag', title: 'خارج‌شده از محاسبات', style: { color: 'var(--faint)' } }, U.icon('eraser')));
      if (suspect && obs) flags.push(U.h('span', {
        class: 'cell-flag', role: 'button', tabindex: '0',
        title: 'تشخیص مشاهدهٔ مشکوک', 'aria-label': 'تشخیص مشاهدهٔ مشکوک',
        style: { color: 'var(--amber)', cursor: 'pointer' },
        onclick: function (e) { e.stopPropagation(); openSuspectDialog(cycle, obs, el.name); },
        onkeydown: function (e) {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openSuspectDialog(cycle, obs, el.name);
          }
        },
      }, U.icon('alertTriangle')));
      flags.forEach(function (f) { td.appendChild(f); });

      return td;
    }

    /* ── ردیف جزئیات چرخه (باز شده) ── */
    function buildExpanded(cycle) {
      var box = U.h('div', { class: 'bg-surface-2 rounded-lg p-3 flex flex-col gap-3', style: { background: 'var(--surface-2)', margin: '6px' } });

      /* شناسه + حذف */
      box.appendChild(U.h('div', { class: 'flex flex-wrap items-center gap-2 text-xs' },
        U.h('span', { class: 'text-muted', text: 'شناسهٔ چرخه' }),
        U.h('code', { class: 'inline' }, cycle.id.slice(0, 8)),
        U.h('span', { class: 'text-muted' }, 'ثبت: ' + U.formatDateTime(cycle.createdAt)),
        U.h('div', { class: 'spacer' }),
        editable ? U.h('button', {
          class: 't2t-link', type: 'button', title: 'قابل بازگردانی با Undo',
          onclick: function () { confirmDeleteCycle(cycle); },
        }, 'حذف چرخه') : null));

      /* جدول مشاهدات */
      box.appendChild(UI.table(['عنصر', 'مقدار خام', 'مدت', 'وضعیت', 'اقدام'], function (tbodyEl) {
        elements.forEach(function (el) {
          var obs = findObs(cycle, el.id);
          var rawTd = U.h('td', { class: 'num text-xs' });
          var durTd = U.h('td', { class: 'num text-xs' });
          var statusTd = U.h('td');
          var actionTd = U.h('td');
          if (!obs) {
            rawTd.textContent = '—';
            durTd.textContent = '—';
            statusTd.appendChild(UI.badge('ثبت نشده', 'muted'));
            actionTd.textContent = '—';
          } else {
            if (obs.startOffset !== null || obs.endOffset !== null) {
              rawTd.textContent = (obs.startOffset !== null ? U.formatTimeValue(obs.startOffset) : '؟') + ' تا ' + (obs.endOffset !== null ? U.formatTimeValue(obs.endOffset) : '؟');
            } else if (method === 'CONTINUOUS' && obs.cumulativeReading !== null) {
              rawTd.textContent = 'قرائت ' + U.formatTimeValue(obs.cumulativeReading);
            } else if (obs.rawDuration !== null) {
              rawTd.textContent = U.formatTimeValue(obs.rawDuration);
            } else {
              rawTd.textContent = '—';
            }
            durTd.textContent = obs.derivedDuration !== null ? U.formatTimeValue(obs.derivedDuration) : '—';

            if (obs.validityStatus === 'EXCLUDED') {
              statusTd.appendChild(UI.badge('خارج‌شده', 'red'));
              if (obs.exclusionReason) statusTd.appendChild(U.h('div', { class: 'text-xs text-muted mt-1', text: obs.exclusionReason }));
            } else if (obs.validityStatus === 'SUSPECT') {
              /* دکمهٔ تشخیص مشاهدهٔ مشکوک — §۱۲.۳ */
              statusTd.appendChild(U.h('button', {
                class: 'btn btn-sm btn-outline', type: 'button',
                title: 'نمایش جزئیات تشخیص مشاهدهٔ مشکوک',
                style: { color: 'var(--amber)', borderColor: 'color-mix(in srgb, var(--amber) 45%, var(--border))' },
                onclick: function () { openSuspectDialog(cycle, obs, el.name); },
              }, U.icon('alertTriangle'), 'مشکوک — تشخیص'));
              if (obs.outlierScore !== null && obs.outlierScore !== undefined) {
                statusTd.appendChild(U.h('div', { class: 'text-xs text-muted mt-1' }, 'امتیاز Z: ' + U.formatTimeValue(obs.outlierScore, 2)));
              }
            } else if (obs.validityStatus === 'INVALID') {
              statusTd.appendChild(UI.badge('نامعتبر', 'muted'));
            } else {
              statusTd.appendChild(UI.badge('معتبر', 'green'));
            }

            if (editable && obs.validityStatus === 'EXCLUDED') {
              actionTd.appendChild(U.h('button', {
                class: 'btn btn-sm', type: 'button',
                onclick: function () {
                  if (withUndo(sessionId, 'بازگشت به محاسبات', function () { DB.setObservationValidity(obs.id, 'RESTORE'); })) {
                    invalidateSheetCache(sessionId);
                    UI.toast('مشاهده به محاسبات بازگشت');
                    ctx.render();
                  }
                },
              }, U.icon('rotateCcw'), 'بازگشت به محاسبات'));
            } else if (editable && obs.derivedDuration !== null) {
              actionTd.appendChild(U.h('button', {
                class: 'btn btn-sm btn-destructive-outline', type: 'button',
                onclick: function () { openValidityDialog(cycle, obs); },
              }, U.icon('ban'), 'خروج از محاسبه'));
            } else {
              actionTd.textContent = '—';
            }
          }
          tbodyEl.appendChild(U.h('tr', null,
            U.h('td', { class: 'font-medium text-xs' }, el.name),
            rawTd, durTd, statusTd, actionTd));
        });
      }));

      /* یادداشت چرخه — ذخیرهٔ خودکار با تأخیر */
      var lastSavedNotes = cycle.notes || '';
      var ta = U.h('textarea', {
        class: 'textarea', placeholder: 'مثلاً: اپراتور در ثانیهٔ ۱۲ برای دریافت قطعه متوقف شد',
        disabled: !editable,
      }, lastSavedNotes);
      var debouncedSave = U.debounce(function () {
        var v = ta.value;
        if (v === lastSavedNotes) return;
        if (withUndo(sessionId, 'یادداشت چرخه', function () { DB.updateCycleNotes(cycle.id, v); })) {
          lastSavedNotes = v;
          invalidateSheetCache(sessionId);
        }
      }, 600);
      ta.addEventListener('input', debouncedSave);
      box.appendChild(U.h('div', null,
        U.h('label', { class: 'field-label' }, 'یادداشت چرخه (رویدادهای ویژه، وقفه‌ها و …)'),
        ta));

      /* خط زمانی ساده */
      box.appendChild(buildTimeline(cycle));
      return box;
    }

    function buildTimeline(cycle) {
      var intObs = [];
      elements.forEach(function (el) {
        var obs = findObs(cycle, el.id);
        if (obs && obs.startOffset !== null && obs.endOffset !== null) intObs.push({ el: el, obs: obs });
      });
      var head = U.h('div', { class: 'flex flex-wrap items-center gap-2' },
        U.h('span', { class: 'font-bold text-sm' }, 'خط زمانی چرخهٔ ' + U.formatInt(cycle.cycleNo)));
      var box = U.h('div', null, head);

      if (!intObs.length || cycle.elapsed === null || !isFinite(cycle.elapsed) || cycle.elapsed <= 0) {
        box.appendChild(U.h('p', {
          class: 'text-xs text-muted leading-relaxed',
          text: 'در این چرخه بازهٔ زمانی (شروع/پایان) ثبت نشده است. برای عناصر هم‌زمان، مقدار را به‌صورت «شروع-پایان» وارد کنید تا خط زمانی ترسیم شود.',
        }));
        return box;
      }
      var elapsed = cycle.elapsed;
      head.appendChild(U.h('span', { class: 'text-xs text-muted' }, 'سپری‌شده: ' + U.formatTimeValue(elapsed) + ' ثانیه'));
      head.appendChild(U.h('span', { class: 'text-xs text-muted' }, 'مقیاس: ۰ تا ' + U.formatTimeValue(elapsed) + ' ثانیه'));

      var lanesBox = U.h('div', { class: 'flex flex-col gap-2 mt-2' });
      ['OPERATOR', 'MACHINE'].forEach(function (laneType) {
        var lane = U.h('div', { class: 't2t-lane', role: 'img', 'aria-label': laneType === 'OPERATOR' ? 'خط زمانی اپراتور' : 'خط زمانی ماشین' });
        intObs.forEach(function (x) {
          if ((x.obs.laneType || 'OPERATOR') !== laneType) return;
          var left = (x.obs.startOffset / elapsed) * 100;
          var width = Math.max(((x.obs.endOffset - x.obs.startOffset) / elapsed) * 100, 2.5);
          lane.appendChild(U.h('div', {
            class: 't2t-bar',
            style: { insetInlineStart: left + '%', width: width + '%', background: LANE_COLORS[x.el.elementType] || 'var(--brand)' },
            title: x.el.name + ': ' + U.formatTimeValue(x.obs.startOffset) + '–' + U.formatTimeValue(x.obs.endOffset),
          }));
        });
        lanesBox.appendChild(U.h('div', { class: 'flex items-center gap-2' },
          U.h('span', { class: 'text-xs text-muted shrink-0', style: { width: '52px' }, text: laneType === 'OPERATOR' ? 'اپراتور' : 'ماشین' }),
          lane));
      });
      box.appendChild(lanesBox);

      /* راهنمای میله‌ها */
      var legend = U.h('div', { class: 'flex flex-wrap gap-2 mt-2' });
      intObs.forEach(function (x) {
        legend.appendChild(U.h('span', { class: 'badge outline text-xs' },
          U.h('span', { style: { width: '8px', height: '8px', borderRadius: '99px', background: LANE_COLORS[x.el.elementType] || 'var(--brand)', display: 'inline-block', flexShrink: '0' } }),
          x.el.name + ': ' + U.formatTimeValue(x.obs.startOffset) + '–' + U.formatTimeValue(x.obs.endOffset)));
      });
      box.appendChild(legend);
      return box;
    }

    /* ── دیالوگ خروج مشاهده از محاسبات ── */
    function openValidityDialog(cycle, obs) {
      var reason = null;
      var custom = '';
      var isINT = obs.startOffset !== null || obs.endOffset !== null;
      var v;
      if (isINT && obs.derivedDuration !== null) v = U.formatTimeValue(obs.derivedDuration);
      else if (method === 'CONTINUOUS' && obs.cumulativeReading !== null) v = U.formatTimeValue(obs.cumulativeReading);
      else if (obs.rawDuration !== null) v = U.formatTimeValue(obs.rawDuration);
      else v = '—';
      var suffix = (obs.startOffset !== null && obs.endOffset !== null)
        ? ' (' + U.formatTimeValue(obs.startOffset) + '–' + U.formatTimeValue(obs.endOffset) + ')'
        : '';

      UI.dialog({
        title: 'خروج مشاهده از محاسبات',
        desc: 'چرخهٔ ' + U.formatInt(cycle.cycleNo) + ' — مقدار ثبت‌شده: ' + v + suffix + ' دادهٔ خام هرگز حذف نمی‌شود؛ فقط از محاسبات خارج می‌شود و در گزارش‌ها با برچسب «خارج‌شده» می‌آید.',
        bodyBuilder: function (body) {
          var groupWrap = U.h('div', null,
            U.h('div', { class: 'field-label' }, 'دلیل خروج (توصیه می‌شود)',
              UI.helpDot('دلیل خروج', {
                what: 'مستندسازی چرایی خارج‌کردن مشاهده از محاسبات.',
                input: 'یک دلیل استاندارد را انتخاب کنید یا دلیل دلخواه بنویسید.',
                example: '«اپراتور کار را در میانهٔ چرخه متوقف کرد»',
                note: 'هشدار آماری مساوی حذف نیست؛ تصمیم نهایی همیشه با شماست و مشاهده را می‌توانید برگردانید.',
              })));
          var cards = [];
          var radios = [];
          DB.CONST.EXCLUSION_REASONS.forEach(function (r) {
            var card = U.h('label', { class: 'radio-card' },
              U.h('input', { type: 'radio', name: 't2t-excl', style: { accentColor: 'var(--brand)', marginTop: '3px' } }),
              U.h('span', { class: 'text-sm', text: r }));
            var radio = card.querySelector('input');
            radio.addEventListener('change', function () {
              reason = r;
              custom = '';
              customInput.value = '';
              cards.forEach(function (c2) { c2.classList.remove('selected'); });
              card.classList.add('selected');
            });
            cards.push(card);
            radios.push(radio);
            groupWrap.appendChild(card);
          });
          body.appendChild(groupWrap);

          var customInput = U.h('input', { class: 'input', placeholder: 'یا دلیل دلخواه…', value: '' });
          customInput.addEventListener('input', function () {
            custom = customInput.value;
            if (custom.trim() !== '') {
              reason = null;
              cards.forEach(function (c2) { c2.classList.remove('selected'); });
              radios.forEach(function (r2) { r2.checked = false; });
            }
          });
          body.appendChild(customInput);
        },
        footerBuilder: function (close) {
          return U.h('div', { class: 'dialog-footer' },
            U.h('button', { class: 'btn', text: 'انصراف', onclick: close }),
            U.h('div', { class: 'spacer' }),
            U.h('button', {
              class: 'btn btn-destructive',
              onclick: function () {
                if (withUndo(sessionId, 'خروج از محاسبه', function () {
                  DB.setObservationValidity(obs.id, 'EXCLUDE', reason || custom || null);
                })) {
                  invalidateSheetCache(sessionId);
                  UI.toast('مشاهده از محاسبات خارج شد (دادهٔ خام محفوظ است)');
                  close();
                  ctx.render();
                }
              },
            }, U.icon('ban'), 'خروج از محاسبه'));
        },
      });
    }

    /* ── دیالوگ «تشخیص مشاهدهٔ مشکوک» — §۱۲.۳ ═══════════
       پنل فقط‌خواندنی برای یک مشاهدهٔ SUSPECT: مقدار، روش تشخیص،
       N/Median/MAD، امتیاز و آستانهٔ واقعی استفاده‌شده، جزئیات IQR در
       حالت fallback، دلیل پرچم، تاریخ ثبت و وضعیت فعلی.
       مبنای نمایش snapshot ثبت‌شده در لحظهٔ پرچم‌گذاری است؛ برای
       داده‌های قدیمی از امتیاز/روش زندهٔ فعلی استفاده و فقدان snapshot
       اعلام می‌شود. این دیالوگ هیچ داده‌ای را تغییر نمی‌دهد؛ دکمهٔ
       «خروج از محاسبات» فقط جریان دیالوگ وضعیت موجود را زنجیر می‌کند. */
    function openSuspectDialog(cycle, obs, elementName) {
      var snap = readOutlierSnapshot(obs);
      var st = (snap && snap.statistics) || null;
      var isIqrFallback = !!(snap && snap.appliedRule === 'IQR_FENCE') || (!snap && obs.outlierRule === 'IQR_FENCE');
      var isExcluded = obs.validityStatus === 'EXCLUDED';
      var diagMethodLabel = (snap && snap.methodLabel) ||
        (obs.outlierRule ? (OUTLIER_RULE_LABELS[obs.outlierRule] || obs.outlierRule) : '—');
      var thresholdLabel = isIqrFallback ? 'ضریب حصار' : 'آستانهٔ امتیاز Z';
      var shownScore = snap && snap.score !== null && snap.score !== undefined ? snap.score
        : (obs.outlierScore !== null && obs.outlierScore !== undefined ? obs.outlierScore : null);
      var shownThreshold = snap ? snap.threshold : null;
      var basisValue = snap && snap.value !== null && snap.value !== undefined ? snap.value : obs.derivedDuration;

      function iqrNum(label, v) {
        return U.h('span', { class: 'num', dir: 'ltr', text: label + fmtCompact(v) });
      }

      UI.dialog({
        title: 'تشخیص مشاهدهٔ مشکوک',
        desc: 'عنصر «' + elementName + '» — چرخهٔ ' + U.formatInt(cycle.cycleNo),
        bodyBuilder: function (body) {
          var rows = U.h('div', { class: 'flex flex-col gap-1.5' });
          rows.appendChild(diagRow('مقدار مشاهده', valueWithUnit(observationValueText(obs))));
          if (obs.cumulativeReading !== null && obs.startOffset === null) {
            rows.appendChild(diagRow('قرائت تجمعی ثبت‌شده', valueWithUnit(U.formatTimeValue(obs.cumulativeReading))));
          }
          rows.appendChild(diagRow('مدت مبنای تشخیص', valueWithUnit(U.formatTimeValue(basisValue))));
          rows.appendChild(diagRow('روش تشخیص', U.h('span', { text: diagMethodLabel })));
          if (snap && snap.n !== null && snap.n !== undefined) {
            rows.appendChild(diagRow('تعداد مشاهدات مبنای تشخیص (N)', U.h('span', { class: 'num', text: U.formatInt(snap.n) })));
          }
          if (st) {
            rows.appendChild(diagRow('میانه و MAD', U.h('span', {
              class: 'num', dir: 'ltr',
              text: U.formatTimeValue(st.median) + ' / ' + U.formatTimeValue(st.mad),
            })));
          }
          rows.appendChild(diagRow(isIqrFallback ? 'فاصلهٔ نرمال‌شده و ضریب حصار' : 'امتیاز Z و آستانه',
            shownScore !== null
              ? U.h('span', null,
                  U.h('b', { class: 'num', dir: 'ltr', text: U.formatTimeValue(shownScore, 2) }),
                  ' • ' + thresholdLabel + ' = ',
                  U.h('b', { class: 'num', dir: 'ltr', text: fmtCompact(shownThreshold) }))
              : U.h('span', { text: '—' })));
          if (isIqrFallback) {
            rows.appendChild(U.h('div', { class: 't2t-diag-iqr' },
              U.h('p', { class: 't2t-diag-iqr-title', text: 'جزئیات حصار IQR — روش تشخیص واقعی در زمان پرچم‌گذاری (fallback از میانه/MAD)' }),
              U.h('div', { class: 't2t-diag-iqr-grid' },
                iqrNum('Q1 = ', st ? st.q1 : null),
                iqrNum('Q3 = ', st ? st.q3 : null),
                iqrNum('IQR = ', st ? st.iqr : null),
                iqrNum('حصار پایین = ', st ? st.lowerFence : null),
                iqrNum('حصار بالا = ', st ? st.upperFence : null))));
          }
          if (snap && snap.reason) {
            rows.appendChild(diagRow('دلیل پرچم', U.h('span', { text: U.displayServerText(String(snap.reason)) })));
          }
          rows.appendChild(diagRow('تاریخ/زمان مشاهده', U.h('span', { text: U.formatDateTime(cycle.createdAt) })));
          rows.appendChild(diagRow('وضعیت فعلی', suspectValidityBadge(obs.validityStatus)));
          body.appendChild(rows);

          if (!snap) {
            body.appendChild(U.h('p', {
              class: 't2t-diag-note',
              text: 'snapshot تشخیصی در زمان پرچم‌گذاری ثبت نشده (دادهٔ قدیمی)؛ امتیاز و روش نمایش‌داده‌شده از آخرین بازمحاسبهٔ زنده است.',
            }));
          }
          body.appendChild(U.h('p', {
            class: 't2t-diag-warn',
            text: 'مشکوک به معنی حذف خودکار نیست؛ داده خام حفظ می‌شود و تصمیم خروج از محاسبات با شماست.',
          }));
        },
        footerBuilder: function (close) {
          return U.h('div', { class: 'dialog-footer' },
            U.h('button', { class: 'btn', type: 'button', text: 'بستن', onclick: close }),
            U.h('div', { class: 'spacer' }),
            U.h('button', {
              class: 'btn ' + (isExcluded ? 'btn-brand' : 'btn-destructive'), type: 'button',
              onclick: function () { close(); openValidityDialog(cycle, obs); },
            }, U.icon(isExcluded ? 'rotateCcw' : 'ban'), isExcluded ? 'بازگشت به محاسبات' : 'خروج از محاسبات'));
        },
      });
    }

    /* ── تأیید حذف چرخه — §۱۲.۴ ═══════════
       حذف چرخه با یک کلیک ممکن نیست؛ پیش از فراخوانی جریان حذف
       موجود (با Undo/Redo)، این تأیید جزئیات و پیامد حذف را نشان
       می‌دهد: شمارهٔ چرخه، اپراتور/جلسه، تعداد مشاهدات و
       قابل‌بازگشت‌بودن با Ctrl+Z تا زمانی که پنجره باز است. */
    function confirmDeleteCycle(cycle) {
      var obsCount = cycle.observations.length;
      var opName = sheet.operator.displayName;
      UI.confirmDialog({
        title: 'حذف چرخه',
        body: function (body) {
          body.appendChild(U.h('p', { class: 'text-sm leading-relaxed' },
            'چرخهٔ ', U.h('b', { class: 'num' }, U.formatInt(cycle.cycleNo)),
            ' — اپراتور ', U.h('b', null, '«' + opName + '»'),
            ' (' + methodLabel + ')'));
          body.appendChild(U.h('p', { class: 'text-sm leading-relaxed' },
            'تعداد مشاهدات: ', U.h('b', { class: 'num' }, U.formatInt(obsCount))));
          body.appendChild(U.h('p', { class: 'text-xs text-muted leading-relaxed' },
            'حذف چرخه، مشاهدات و خطوط زمانی وابستهٔ آن را نیز حذف می‌کند. با Ctrl+Z قابل بازگردانی است تا پنجرهٔ فعلی باز باشد.'));
        },
        confirmLabel: 'حذف چرخه',
        destructive: true,
      }).then(function (ok) {
        if (!ok) return;
        if (withUndo(sessionId, 'حذف چرخه', function () { deleteCycleSafe(sessionId, cycle.id); })) {
          invalidateSheetCache(sessionId);
          UI.toast('چرخهٔ ' + U.formatInt(cycle.cycleNo) + ' حذف شد — برای بازگردانی Ctrl+Z');
          ctx.render();
        }
      });
    }

    /* ── دیالوگ Paste چندسلولی از Excel ── */
    function openPasteDialog() {
      var anchor = anchorMap[sessionId];
      if (!anchor || !elements.some(function (e) { return e.id === anchor.elementId; })) {
        anchor = {
          cycleNo: cycles.length ? cycles[0].cycleNo : 1,
          elementId: elements.length ? elements[0].id : null,
        };
      }
      var anchorIndex = -1;
      elements.forEach(function (e, i) { if (e.id === anchor.elementId) anchorIndex = i; });
      var anchorName = anchorIndex >= 0 ? elements[anchorIndex].name : '—';
      var mode = 'ALL_OR_NOTHING';
      var preview = null;
      var commitBtn = null;
      var previewWrap = null;
      var textArea = null;

      function updateCommitBtn() {
        if (!commitBtn) return;
        if (!preview) { commitBtn.disabled = true; commitBtn.textContent = 'ثبت'; return; }
        var c = preview.counts;
        if (mode === 'ALL_OR_NOTHING' && c.errors > 0) {
          commitBtn.disabled = true;
          commitBtn.textContent = 'خطاها را اصلاح کنید';
        } else {
          commitBtn.disabled = c.healthy === 0;
          commitBtn.textContent = 'ثبت ' + U.formatInt(c.healthy) + ' سلول';
        }
      }

      /* تخمین مدت مشتق برای پیش‌نمایش روش پیوسته (قرائت − قرائت قبلی زنجیره) */
      function previewDerivedMap() {
        var map = {};
        if (method !== 'CONTINUOUS') return map;
        var replaced = {};
        preview.cells.forEach(function (cell) {
          if (cell.value !== null && cell.status !== 'ERROR' && cell.status !== 'NO_CHANGE') {
            replaced[cell.cycleNo + ':' + cell.elementId] = true;
          }
        });
        var elSort = {};
        elements.forEach(function (e) { elSort[e.id] = e.sortOrder; });
        var entries = [];
        cycles.forEach(function (c) {
          c.observations.forEach(function (o) {
            if (o.cumulativeReading !== null && !replaced[c.cycleNo + ':' + o.workElementId]) {
              entries.push({ cycleNo: c.cycleNo, sort: elSort[o.workElementId] || 0, reading: o.cumulativeReading, key: null });
            }
          });
        });
        preview.cells.forEach(function (cell) {
          if (cell.value !== null && cell.status !== 'ERROR' && cell.status !== 'NO_CHANGE') {
            entries.push({ cycleNo: cell.cycleNo, sort: elSort[cell.elementId] || 0, reading: cell.value, key: cell.cycleNo + ':' + cell.elementId });
          }
        });
        entries.sort(function (a, b) { return a.cycleNo !== b.cycleNo ? a.cycleNo - b.cycleNo : a.sort - b.sort; });
        var prev = 0;
        entries.forEach(function (en) {
          if (en.key) map[en.key] = en.reading - prev;
          prev = en.reading;
        });
        return map;
      }

      function renderPreview() {
        U.clear(previewWrap);
        var c = preview.counts;
        /* شمار چرخه‌های جدید (متمایز) — نه تعداد سلول‌های داخل آن‌ها */
        var maxExisting = cycles.length ? Math.max.apply(null, cycles.map(function (cc) { return cc.cycleNo; })) : 0;
        var newCycleSet = {};
        preview.cells.forEach(function (cell) { if (cell.cycleNo > maxExisting) newCycleSet[cell.cycleNo] = true; });
        var newCycleCount = Object.keys(newCycleSet).length;
        previewWrap.appendChild(U.h('div', { class: 'flex flex-wrap items-center gap-2' },
          UI.badge(U.formatInt(c.healthy) + ' سالم', 'green'),
          UI.badge(U.formatInt(c.warnings) + ' هشدار', 'amber'),
          UI.badge(U.formatInt(c.errors) + ' خطا', 'red'),
          UI.badge(U.formatInt(c.noChange) + ' بدون تغییر', 'muted'),
          UI.badge(U.formatInt(newCycleCount) + ' چرخهٔ جدید', 'brand')));

        /* جدول پیش‌نمایش */
        var byCycle = {};
        var maxCols = 0;
        preview.cells.forEach(function (cell) {
          if (!byCycle[cell.cycleNo]) byCycle[cell.cycleNo] = {};
          byCycle[cell.cycleNo][cell.elementIndex] = cell;
          if (cell.elementIndex - anchorIndex + 1 > maxCols) maxCols = cell.elementIndex - anchorIndex + 1;
        });
        var cycleNos = Object.keys(byCycle).map(Number).sort(function (a, b) { return a - b; });
        var derivedMap = previewDerivedMap();

        previewWrap.appendChild(UI.table(
          ['چرخه'].concat(
            Array.apply(null, Array(Math.max(maxCols, 1))).map(function (_, i) {
              var el = elements[anchorIndex + i];
              return el ? el.name : 'ستون ' + U.formatInt(anchorIndex + i + 1);
            })),
          function (tbodyEl) {
            cycleNos.forEach(function (cycNo) {
              var rowCells = byCycle[cycNo];
              var tr = U.h('tr', null,
                U.h('td', { class: 'num font-bold' },
                  U.formatInt(cycNo),
                  !cycles.some(function (cc) { return cc.cycleNo === cycNo; })
                    ? U.h('span', { class: 'text-xs', style: { color: 'var(--brand)', marginInlineStart: '3px' } }, '(جدید)')
                    : null));
              for (var ci = 0; ci < Math.max(maxCols, 1); ci++) {
                var cell = rowCells[anchorIndex + ci];
                if (!cell) { tr.appendChild(U.h('td')); continue; }
                var td = U.h('td');
                if (cell.status === 'ERROR') {
                  td.style.background = 'var(--red-soft)';
                  td.appendChild(U.h('div', { class: 'num text-xs', text: cell.raw || '—', title: cell.message }));
                  td.appendChild(U.h('div', { class: 'text-xs', style: { color: 'var(--red)' }, text: cell.message }));
                } else if (cell.status === 'NO_CHANGE') {
                  td.appendChild(U.h('span', { class: 'text-faint', text: '—' }));
                } else if (cell.interval) {
                  td.appendChild(U.h('div', { class: 'num text-xs' },
                    U.formatTimeValue(cell.interval.start) + '–' + U.formatTimeValue(cell.interval.end)));
                  td.appendChild(U.h('div', { class: 'num text-xs', style: { color: 'var(--green)' } },
                    '→ مدت: ' + U.formatTimeValue(cell.interval.end - cell.interval.start)));
                } else if (cell.value !== null) {
                  td.appendChild(U.h('div', { class: 'num text-xs' }, U.formatTimeValue(cell.value)));
                  if (method === 'CONTINUOUS') {
                    var d = derivedMap[cell.cycleNo + ':' + cell.elementId];
                    if (d !== undefined) {
                      td.appendChild(U.h('div', { class: 'num text-xs', style: { color: 'var(--green)' } }, '→ مدت: ' + U.formatTimeValue(d)));
                    }
                  }
                }
                tr.appendChild(td);
              }
              tbodyEl.appendChild(tr);
            });
          }));

        /* حالت ثبت در صورت وجود خطا */
        var modeWrap = U.h('div', { class: 'rounded-lg p-3', style: { border: '1px solid var(--border)' } },
          U.h('div', { class: 'field-label' }, 'در صورت وجود خطا:'));
        var modeCards = [];
        [
          ['ALL_OR_NOTHING', 'همه یا هیچ (پیش‌فرض)', 'با وجود خطا، هیچ داده‌ای ثبت نمی‌شود تا کلیشهٔ ناقص پنهان نماند.'],
          ['SKIP_INVALID', 'رد سلول‌های مشکل‌دار', 'سلول‌های سالم ثبت و سلول‌های خطادار رد می‌شوند؛ فهرست ردشده‌ها اطلاع‌داده می‌شود.'],
        ].forEach(function (m) {
          var card = U.h('label', { class: 'radio-card' + (mode === m[0] ? ' selected' : '') },
            U.h('input', { type: 'radio', name: 't2t-paste-mode', checked: mode === m[0], style: { accentColor: 'var(--brand)', marginTop: '3px' } }),
            U.h('div', { class: 'min-w-0' },
              U.h('div', { class: 'text-xs font-bold', text: m[1] }),
              U.h('div', { class: 'text-xs text-muted leading-relaxed', text: m[2] })));
          card.querySelector('input').addEventListener('change', function () {
            mode = m[0];
            modeCards.forEach(function (c2) { c2.classList.remove('selected'); });
            card.classList.add('selected');
            updateCommitBtn();
          });
          modeCards.push(card);
          modeWrap.appendChild(card);
        });
        previewWrap.appendChild(modeWrap);
        updateCommitBtn();
      }

      UI.dialog({
        title: 'Paste چندسلولی از Excel',
        desc: 'مبدأ: چرخهٔ ' + U.formatInt(anchor.cycleNo) + '، عنصر «' + anchorName + '»',
        size: 'lg',
        bodyBuilder: function (body) {
          body.appendChild(U.h('div', { class: 't2t-help-row' },
            U.h('span', { class: 'text-xs text-muted' }, 'راهنما:'),
            UI.helpDot('Paste چندسلولی', {
              what: 'کپی چند سطر و ستون از Excel و ثبت هم‌زمان آن‌ها در برگهٔ زمان‌سنجی.',
              input: 'محدودهٔ موردنظر را در Excel کپی کنید (Ctrl+C) و همین‌جا بچسبانید (Ctrl+V). ستون‌ها از عنصری که سلول فعال روی آن است شروع می‌شوند و سطرها از چرخهٔ همان ردیف.',
              example: 'اگر ۳ ستون عنصر دارید و ۵ چرخه Paste می‌کنید، یک محدودهٔ ۵×۳ کپی کنید. برای عنصر هم‌زمان می‌توانید به‌جای یک عدد، «۳-۹» (شروع تا پایان) بنویسید.',
              note: 'هیچ داده‌ای بدون پیش‌نمایش و تأیید شما ثبت نمی‌شود؛ خطای هر سلول با محل و علت دقیق نمایش داده می‌شود.',
            }),
            UI.helpDot('حالت ثبت Paste', {
              what: 'رفتار سیستم هنگامی که برخی سلول‌های Paste نامعتبر باشند.',
              input: '«همه یا هیچ»: تا وقتی حتی یک سلول خطا دارد، هیچ چیزی ثبت نمی‌شود. «رد سلول‌های مشکل‌دار»: فقط سلول‌های سالم ثبت و سلول‌های خطادار رد می‌شوند.',
              example: 'در یک Paste با یک سلول منفی، حالت اول هیچ چیزی ثبت نمی‌کند؛ حالت دوم بقیهٔ سلول‌ها را ثبت و همان سلول را رد می‌کند.',
              note: 'این انتخاب مطابق الزام PRD است که Paste نامعتبر نباید باعث ثبت ناقص و پنهانی کل محدوده شود.',
            })));

          textArea = U.h('textarea', {
            class: 'textarea t2t-mono', dir: 'ltr', rows: '7',
            placeholder: '12.5\t8.3\t9.1\n…',
          });
          body.appendChild(U.h('div', { class: 'field-label' }, 'محتوای Excel را اینجا بچسبانید'));
          body.appendChild(textArea);
          body.appendChild(U.h('p', {
            class: 'hint',
            text: 'جداکنندهٔ ستون: Tab — جداکنندهٔ اعشار: نقطه یا «٫» — بازه: «۳-۹» یا «۳ تا ۹» — خالی/«-» = بدون تغییر',
          }));

          body.appendChild(U.h('button', {
            class: 'btn btn-outline w-fit', type: 'button',
            onclick: function () {
              if (!textArea.value.trim()) return;
              try {
                preview = DB.pastePreview(sessionId, anchor.cycleNo, anchor.elementId, textArea.value);
              } catch (err) { UI.toastError(err); return; }
              renderPreview();
            },
          }, U.icon('clipboardPaste'), 'پیش‌نمایش و اعتبارسنجی'));

          previewWrap = U.h('div', { class: 'flex flex-col gap-3' });
          body.appendChild(previewWrap);
        },
        footerBuilder: function (close) {
          return U.h('div', { class: 'dialog-footer' },
            U.h('button', { class: 'btn', text: 'انصراف', onclick: close }),
            U.h('div', { class: 'spacer' }),
            commitBtn = U.h('button', {
              class: 'btn btn-brand', text: 'ثبت', disabled: true,
              onclick: function () {
                if (!preview) return;
                var res = null;
                if (withUndo(sessionId, 'Paste', function () {
                  res = DB.pasteCommit(sessionId, preview, mode);
                })) {
                  invalidateSheetCache(sessionId);
                  UI.toast(U.formatInt(res.applied) + ' سلول ثبت شد؛ ' + U.formatInt(res.skipped) + ' سلول رد شد؛ ' + U.formatInt(res.newCycles) + ' چرخهٔ جدید');
                  close();
                  ctx.render();
                }
              },
            }));
        },
      });
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
