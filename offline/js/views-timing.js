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
  var sheetCache = {};       /* sessionId -> DTO برگه (پرهیز از محاسبهٔ مجدد) */

  /* وضعیت کانون/ناوبری برگه — هم‌زمان فقط یک برگه باز است */
  var activeGrid = null;         /* عنصر .sheet-grid جاری */
  var pendingFocus = null;       /* {r, c, part} — پس از حرکت کیبورد */
  var lastFocusedCell = null;    /* {sid, r, c, part} — بازگردانی کانون پس از رندر */
  var sheetKeyHandler = null;    /* شنوندهٔ Ctrl+Z/Y سند */

  /* v1.5.0 §۳ — بج نوع عنصر حذف شد؛ رنگ میلهٔ خط زمانی بر اساس laneType واقعی */
  var LANE_COLORS = { OPERATOR: 'var(--brand)', MACHINE: 'var(--cyan)' };

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
    }
    /* v1.5.2 §۴ — حالت sheet حذف شد؛ هدر واحد برگه در renderSheet ساخته می‌شود */

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
    var first = grid.querySelector('input.sheet-cell[data-row="' + r + '"][data-col="' + c + '"]');
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

    /* ۱) هدر واحد برگه — v1.5.2 §۴: ادغام زیرهدر فعالیت و سربرگ برگه
          در یک نوار چسبان — ردیف ۱: هویت/بازگشت/اپراتور/روش/وضعیت/
          ذخیره/جلسهٔ جدید/بستن؛ ردیف ۲: عنوان برگه + شمار چرخه + ابزار */
    var sheetHelp = {
      what: 'جدول زمان‌سنجی: هر ردیف یک عنصر کاری و هر ستون یک چرخه؛ زیر هر عنصر، رابطه‌های موازی آن به‌صورت زیرردیف نمایش داده می‌شود.',
      input: method === 'CONTINUOUS'
        ? 'در روش پیوسته، قرائت تجمعی کرنومتر را در پایان هر عنصر وارد کنید؛ مدت هر عنصر به‌صورت خودکار از تفاضل قرائت‌ها محاسبه و زیر سلول نمایش داده می‌شود. قرائت‌ها باید نزولی نباشند.'
        : 'در روش برگشت به صفر، مدت سپری‌شدهٔ هر عنصر را مستقیم وارد کنید. برای عناصر هم‌زمان، مقدار را به‌صورت «شروع-پایان» (مثل ۳-۹) نسبت به مبدأ چرخه وارد کنید.',
      example: 'ورودی «۱۲٫۵» یا «12.5» — بازهٔ «۳ تا ۹» یا «3-9» — زیرردیف هم‌پوشانی: خالی (بررسی‌نشده)، ۰ (بدون هم‌پوشانی) یا مقدار مثبت — حرکت با Tab/Enter و جهت‌نما؛ کپی محدوده با Shift+جهت‌نما و Ctrl+C.',
      note: 'زمان سپری‌شدهٔ چرخه در کارهای هم‌زمان، گستره (دیرترین پایان − زودترین شروع) است نه جمع مدت‌ها. زیرردیف‌های هم‌پوشانی در هر دو سمت از یک رکورد واحد خوانده می‌شوند؛ دادهٔ خام هرگز حذف نمی‌شود؛ خروج از محاسبه فقط وضعیت را عوض می‌کند.',
    };

    var canCreate = elements.length > 0 && DB.listOperators(ctx.projectId).length > 0;
    var closedBadgeTitle = 'این جلسه بسته است؛ برگه فقط‌خواندنی است. برای ثبت داده، جلسهٔ جدیدی ایجاد کنید یا این جلسه را بازگشایی کنید.';

    var row1 = U.h('div', { class: 't2t-sheet-row' });
    /* هویت فعالیت — تنها محل نمایش آن */
    row1.appendChild(U.h('div', { class: 'flex items-center gap-2 min-w-0' },
      U.h('span', { class: 'chip-icon shrink-0', style: { width: '32px', height: '32px' } }, U.icon('timer')),
      U.h('div', { class: 'min-w-0' },
        U.h('p', { class: 'font-bold truncate', style: { fontSize: '13px', lineHeight: '1.45' }, text: sheet.activity.name }),
        U.h('p', { class: 'truncate', style: { fontSize: '11px', lineHeight: '1.45', color: 'var(--muted-foreground)' }, text: 'ایستگاه ' + (sheet.activity.stationName || '—') }))));

    /* §۴-۲ — بازگشت به فهرست جلساتِ همان فعالیت (انتخاب فعالیت حفظ می‌شود) */
    row1.appendChild(U.h('button', {
      class: 'btn btn-sm btn-outline shrink-0', type: 'button',
      onclick: function () { selectedSession[ctx.activityId] = null; ctx.render(); },
    }, U.icon('listTree'), 'بازگشت به جلسات'));

    /* نشان برجستهٔ یکتای اپراتور جلسهٔ فعال */
    row1.appendChild(U.h('span', { class: 't2t-sub-op-chip', title: 'اپراتور جلسهٔ فعال' },
      U.icon('users'),
      U.h('span', { class: 'truncate', text: sheet.operator.displayName })));

    row1.appendChild(UI.badge(methodLabel, method === 'SNAPBACK' ? 'cyan' : 'brand'));
    if (!editable) {
      var closedBadge = UI.badge('بسته', 'muted', 'lock');
      closedBadge.title = closedBadgeTitle;
      row1.appendChild(closedBadge);
    }

    var actions1 = U.h('div', { class: 'flex flex-wrap items-center gap-2 shrink-0', style: { marginInlineStart: 'auto' } });
    /* آفلاین: ذخیرهٔ لحظه‌ای محلی — نشان پایدار «ذخیره شد» */
    actions1.appendChild(UI.saveIndicator('saved'));
    if (canCreate) {
      actions1.appendChild(U.h('button', {
        class: 'btn btn-sm btn-brand shrink-0', type: 'button',
        onclick: function () { openCreateSessionDialog(ctx); },
      }, U.icon('plus'), 'جلسهٔ جدید'));
    }
    /* §۴-۳ — بستن این جلسه؛ مستقل از «بازگشت به جلسات» */
    if (editable) {
      actions1.appendChild(U.h('button', {
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
      }, U.icon('lock'), 'بستن این جلسه'));
    } else {
      actions1.appendChild(U.h('button', { class: 'btn btn-sm btn-outline shrink-0', type: 'button', onclick: reopen }, U.icon('lockOpen'), 'بازگشایی'));
    }
    row1.appendChild(actions1);

    /* ردیف ۲ — عنوان برگه + شمار چرخه + نوار ابزار */
    var row2 = U.h('div', { class: 't2t-sheet-row' });
    row2.appendChild(U.h('h2', { class: 'font-bold shrink-0', style: { fontSize: '14px' } },
      'برگهٔ زمان‌سنجی',
      UI.helpDot('برگهٔ زمان‌سنجی', sheetHelp)));
    row2.appendChild(U.h('span', { class: 'num text-xs text-muted shrink-0' }, U.formatInt(stats.sessionCycles) + ' چرخه در این جلسه'));

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

    var tools = U.h('div', { class: 'flex flex-wrap items-center gap-2', style: { marginInlineStart: 'auto' } },
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
      /* v1.5.2 §۹ — دانلود قالب Excel مخصوص همین جلسه */
      U.h('button', {
        class: 'btn btn-sm btn-outline', type: 'button',
        title: 'دانلود قالب Excel متناسب با این جلسه — تکمیل و بارگذاری یا کپی/Paste',
        onclick: function () { g.T2EXCEL.downloadTemplate(sessionId); },
      }, U.icon('fileSpreadsheet'), 'قالب Excel'),
      U.h('span', { class: 'text-xs text-faint hidden-sm' }, 'Tab/Enter حرکت • F2 یا کلیک ویرایش • Ctrl+Z واگردانی'));
    row2.appendChild(tools);

    var unifiedHeader = U.h('div', { class: 't2t-sheet-header', role: 'region', 'aria-label': 'هدر واحد برگهٔ زمان‌سنجی' },
      row1, row2);
    wrap.appendChild(unifiedHeader);

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

    /* ۶) جدول برگه — v1.5.0 §۵: ردیف = عنصر + زیرردیف روابط، ستون = چرخه */
    var table = U.h('table');
    var gridRows = buildGridRowsLocal();

    /* مدل ردیف‌های شبکه — §۵.۲ (هم‌ارز buildGridRows سرور) + v1.5.1 §۷:
       زیرردیف روابط بین‌فعالیت زیر endpoint حاضر؛ پس از روابط داخلی */
    function buildGridRowsLocal() {
      var out = [];
      var indexOf = {};
      elements.forEach(function (e, i) { indexOf[e.id] = i; });
      elements.forEach(function (el) {
        out.push({ kind: 'ELEMENT', element: el, elementIndex: indexOf[el.id] });
        var rels = (sheet.parallelRelations || [])
          .filter(function (r) { return r.elementLowId === el.id || r.elementHighId === el.id; })
          .map(function (r) {
            var isLow = r.elementLowId === el.id;
            var otherId = isLow ? r.elementHighId : r.elementLowId;
            var otherName = isLow ? r.elementHighName : r.elementLowName;
            var otherActivityId = isLow ? r.elementHighActivityId : r.elementLowActivityId;
            var otherActivityName = isLow ? r.elementHighActivityName : r.elementLowActivityName;
            var otherStationName = isLow ? r.elementHighStationName : r.elementLowStationName;
            return {
              r: r, otherId: otherId, otherName: otherName,
              otherActivityName: otherActivityName, otherStationName: otherStationName,
              crossActivity: otherActivityId !== null && otherActivityId !== sheet.activity.id,
              otherSort: indexOf[otherId] !== undefined ? indexOf[otherId] : 10000,
            };
          })
          .sort(function (a, b) { return a.otherSort - b.otherSort; });
        rels.forEach(function (x) {
          out.push({ kind: 'PARALLEL', parent: el, relation: x.r, otherId: x.otherId, otherName: x.otherName, otherActivityName: x.otherActivityName, otherStationName: x.otherStationName, crossActivity: x.crossActivity });
        });
      });
      return out;
    }

    /* رابطه بر اساس شناسه */
    var relByIdMap = {};
    (sheet.parallelRelations || []).forEach(function (r) { relByIdMap[r.relationId] = r; });

    /* مقایسه‌پذیری یک رابطه در یک چرخه — هم‌ارز منطق سرور (§۵.۵) */
    function comparabilityOf(cycle, rel) {
      var reasons = [];
      [rel.elementLowId, rel.elementHighId].forEach(function (eid) {
        var o = findObs(cycle, eid);
        if (!o) {
          var nm = nameOfElementLocal(eid);
          reasons.push('«' + nm + '» در این چرخه مشاهده‌ای ندارد');
        } else if (!((o.startOffset !== null && o.endOffset !== null) || (o.derivedDuration !== null || o.rawDuration !== null))) {
          reasons.push('«' + nameOfElementLocal(eid) + '» در این چرخه مدت یا بازهٔ قابل‌مقایسه ندارد');
        }
      });
      return reasons.length === 0
        ? { isComparable: true, notComparableReason: null }
        : { isComparable: false, notComparableReason: 'در این چرخه قابل‌مقایسه نیست: ' + reasons.join('؛ ') };
    }
    function nameOfElementLocal(id) {
      for (var i = 0; i < elements.length; i++) if (elements[i].id === id) return elements[i].name;
      /* v1.5.1 §۷ — نام عنصر خارج از Activity جاری از روابط برگه */
      var rels = sheet.parallelRelations || [];
      for (var j = 0; j < rels.length; j++) {
        if (rels[j].elementLowId === id) return rels[j].elementLowName;
        if (rels[j].elementHighId === id) return rels[j].elementHighName;
      }
      return '؟';
    }
    /* هم‌پوشانی محاسبه‌شده از بازهٔ واقعی — §۵.۵ */
    function computedOverlapOf(cycle, rel) {
      var a = findObs(cycle, rel.elementLowId);
      var b = findObs(cycle, rel.elementHighId);
      if (!a || !b || a.startOffset === null || a.endOffset === null || b.startOffset === null || b.endOffset === null) return null;
      return Math.max(0, Math.min(a.endOffset, b.endOffset) - Math.max(a.startOffset, b.startOffset));
    }
    function overlapCellOfLocal(cycle, relationId) {
      var v = (cycle.overlaps || {})[relationId];
      if (!v) return { status: 'UNREVIEWED', overlapDuration: null, version: 0 };
      return { status: v.status, overlapDuration: v.overlapDuration, version: v.version };
    }

    /* — سربرگ چرخه‌ها (چسبان بالا) — */
    var theadRow = U.h('tr', null, U.h('th', { class: 'sticky-col t2t-corner', text: 'عنصر کاری / رابطه' }));
    cycles.forEach(function (cycle) {
      theadRow.appendChild(U.h('th', null,
        U.h('button', {
          type: 'button',
          class: 't2t-cycle-head',
          'aria-label': 'جزئیات چرخهٔ ' + U.formatInt(cycle.cycleNo),
          title: 'جزئیات چرخه: خط زمانی، وضعیت مشاهدات، یادداشت و حذف',
          onclick: function () { openCycleDetailDialog(cycle); },
        },
          U.h('span', { class: 'num font-extrabold', text: U.formatInt(cycle.cycleNo) }),
          U.h('span', { class: 'flex items-center justify-center gap-0.5', style: { marginTop: '1px' } },
            U.h('span', {
              title: cycle.isComplete ? 'چرخهٔ کامل' : 'چرخهٔ ناقص',
              style: { display: 'inline-flex', color: cycle.isComplete ? 'var(--green)' : 'var(--amber)' },
            }, U.icon(cycle.isComplete ? 'check' : 'alertTriangle')),
            cycle.notes
              ? U.h('span', { title: 'دارای یادداشت', style: { display: 'inline-flex', color: 'var(--faint)' } }, U.icon('stickyNote'))
              : null))));
    });
    table.appendChild(U.h('thead', null, theadRow));

    /* — بدنه: ردیف عنصر + زیرردیف روابط — */
    var tbody = U.h('tbody');
    table.appendChild(tbody);
    if (cycles.length === 0 && elements.length === 0) {
      tbody.appendChild(U.h('tr', null,
        U.h('td', { colspan: '2', class: 'text-center', style: { padding: '36px 16px', color: 'var(--muted-foreground)', fontSize: '13px' } },
          'این فعالیت عنصر کاری ندارد؛ ابتدا عناصر را در ساختار تولید تعریف کنید.')));
    } else if (cycles.length === 0) {
      tbody.appendChild(U.h('tr', null,
        U.h('td', { colspan: '2', class: 'text-center', style: { padding: '36px 16px', color: 'var(--muted-foreground)', fontSize: '13px' } },
          'هنوز چرخه‌ای ثبت نشده است. با دکمهٔ «افزودن چرخه» شروع کنید یا داده را از Excel بچسبانید.')));
    }
    gridRows.forEach(function (grow, rowIdx) {
      if (grow.kind === 'ELEMENT') {
        var tr = U.h('tr', { class: 't2t-el-row' });
        tr.appendChild(elementRowHeader(grow.element));
        cycles.forEach(function (cycle, colIdx) {
          tr.appendChild(buildCellTd(cycle, colIdx, grow.element, rowIdx));
        });
        tbody.appendChild(tr);
      } else {
        var sub = U.h('tr', { class: 't2-subrow' });
        sub.appendChild(parallelRowHeader(grow));
        cycles.forEach(function (cycle, colIdx) {
          sub.appendChild(buildOverlapTd(cycle, colIdx, grow, rowIdx));
        });
        tbody.appendChild(sub);
      }
    });

    /* — پانوشت: سپری‌شدهٔ هر چرخه — §۸.۱/FR-10 — */
    if (cycles.length > 0 && gridRows.length > 0) {
      var tfootRow = U.h('tr', null,
        U.h('td', { class: 'sticky-col', style: { height: '28px', fontWeight: 700, fontSize: '10px', color: 'var(--muted-foreground)' }, text: 'سپری‌شده' }));
      cycles.forEach(function (cycle) { tfootRow.appendChild(elapsedCell(cycle)); });
      table.appendChild(U.h('tfoot', { class: 'tfoot-bar' }, tfootRow));
    }

    var grid = U.h('div', { class: 'sheet-grid', tabindex: '0', role: 'grid', 'aria-label': 'برگه زمان‌سنجی — عناصر در ردیف‌ها و چرخه‌ها در ستون‌ها' }, table);
    wrap.appendChild(grid);
    if (scrollPos) { grid.scrollTop = scrollPos.top; grid.scrollLeft = scrollPos.scrollLeft || scrollPos.left; }
    activeGrid = grid;

    /* ناوبری کیبورد — §۸.۴: بالا/پایین=عناصر و زیرردیف‌ها، چپ/راست=چرخه‌ها (RTL) */
    var lastRow = gridRows.length - 1;
    grid.addEventListener('keydown', function (e) {
      var inp = e.target;
      if (!inp || !inp.classList || !inp.classList.contains('sheet-cell')) return;
      var r = parseInt(inp.dataset.row, 10);
      var c = parseInt(inp.dataset.col, 10);
      var part = inp.dataset.part || 'seq';
      var lastCol = cycles.length - 1;
      var next = null;
      if (e.key === 'Enter' || e.key === 'ArrowDown') {
        e.preventDefault();
        next = { r: Math.min(r + 1, lastRow), c: c, part: part };
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        next = { r: Math.max(r - 1, 0), c: c, part: part };
      } else if (e.key === 'ArrowLeft') {
        /* RTL: چرخهٔ بعدی در سمت چپ است */
        e.preventDefault();
        next = { r: r, c: Math.min(c + 1, lastCol), part: part };
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        next = { r: r, c: Math.max(c - 1, 0), part: part };
      }
      if (next) moveFocus(next);
    });

    /* ثبت لنگر Paste (شناسه‌محور §۸.۳) + آخرین سلول متمرکز */
    grid.addEventListener('focusin', function (e) {
      var t = e.target;
      if (!t || !t.classList || !t.classList.contains('sheet-cell')) return;
      var r = parseInt(t.dataset.row, 10) || 0;
      var c = parseInt(t.dataset.col, 10) || 0;
      lastFocusedCell = { sid: sessionId, r: r, c: c, part: t.dataset.part || 'seq' };
      var cyc = cycles[c];
      var grow = gridRows[r];
      if (cyc && grow) {
        anchorMap[sessionId] = {
          cycleNo: cyc.cycleNo,
          elementId: grow.kind === 'ELEMENT' ? grow.element.id : grow.parent.id,
          relationId: grow.kind === 'PARALLEL' ? grow.relation.relationId : null,
        };
      }
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

    /* ── سربرگ ردیف عنصر (چسبان راست) — نام + حالت ورود + آمار + «+ موازی» §۶ ── */
    function elementRowHeader(el) {
      var mode = entryModeOf(sessionId, el);
      var st = stats.perElement[el.id] || { calcCount: 0, totalCount: 0 };
      var th = U.h('th', { class: 'sticky-col t2t-row-head', scope: 'row' });
      var inner = U.h('div', { class: 'flex items-start justify-between gap-1' });
      var info = U.h('div', { class: 'min-w-0 flex-1' },
        U.h('div', { class: 'font-bold text-xs truncate', title: el.name, text: el.name }));
      var metaRow = U.h('div', { class: 'flex flex-wrap items-center gap-1', style: { marginTop: '2px' } });
      if (editable) {
        metaRow.appendChild(U.h('button', {
          class: 't2t-entry-chip', type: 'button',
          title: mode === 'SEQ' ? 'ورودی ترتیبی — برای بازه‌ای تغییر دهید' : 'ورودی بازه‌ای — برای ترتیبی تغییر دهید',
          onclick: function () {
            var m = entryModeMap[sessionId] || (entryModeMap[sessionId] = {});
            m[el.id] = mode === 'SEQ' ? 'INT' : 'SEQ';
            ctx.render();
          },
        }, mode === 'SEQ' ? (method === 'CONTINUOUS' ? 'قرائت' : 'مدت') : 'شروع/پایان'));
      }
      if (st.calcCount > 0) {
        metaRow.appendChild(U.h('span', {
          class: 'num', title: 'مشاهدات وارد محاسبه',
          style: { fontSize: '10px', color: 'var(--muted-foreground)' },
        }, U.formatInt(st.calcCount) + '/' + U.formatInt(st.totalCount)));
      }
      info.appendChild(metaRow);
      inner.appendChild(info);
      /* §۶ + v1.5.1 §۳ — میانبر افزودن رابطهٔ موازی از خود جدول
         (عناصر همهٔ فعالیت‌های پروژه) */
      if (editable) {
        inner.appendChild(U.h('button', {
          class: 'icon-btn sm', type: 'button',
          'aria-label': 'افزودن عنصر موازی برای ' + el.name,
          title: 'افزودن رابطهٔ موازی — عناصر همهٔ فعالیت‌های پروژه',
          style: { width: '22px', height: '22px', flexShrink: '0' },
          onclick: function () { openAddRelationDialog(el); },
        }, U.icon('network')));
      }
      th.appendChild(inner);
      return th;
    }

    /* ── سربرگ زیرردیف رابطه (چسبان راست) — «↲ هم‌پوشانی با X» + حذف §۶.۱ ──
       v1.5.1 §۷ — روابط بین‌فعالیت با برچسب فعالیت/ایستگاه عنصر مقابل */
    function parallelRowHeader(grow) {
      var th = U.h('th', { class: 'sticky-col t2t-row-head t2t-subrow-head', scope: 'row' });
      var inner = U.h('div', { class: 'flex items-center justify-between gap-1' });
      inner.appendChild(U.h('div', { class: 'flex min-w-0 items-center gap-1' },
        U.h('span', { class: 't2t-subrow-tie', 'aria-hidden': 'true' }),
        U.h('span', {
          class: 'font-bold truncate', style: { fontSize: '11px', color: 'var(--muted-foreground)' },
          title: 'هم‌پوشانی با ' + grow.otherName + (grow.crossActivity ? ' (فعالیت ' + (grow.otherActivityName || '؟') + ' / ایستگاه ' + (grow.otherStationName || '؟') + ')' : ''),
          text: '↲ هم‌پوشانی با ' + grow.otherName,
        }),
        grow.crossActivity
          ? U.h('span', {
              class: 'mx-chip-cross shrink-0',
              title: 'رابطهٔ بین‌فعالیت — «' + (grow.otherActivityName || '؟') + '» / «' + (grow.otherStationName || '؟') + '»؛ در برگهٔ آن فعالیت نیز زیر همین عنصر دیده می‌شود',
              text: 'بین‌فعالیت',
            })
          : null));
      if (editable) {
        inner.appendChild(U.h('button', {
          class: 'icon-btn sm danger', type: 'button',
          'aria-label': 'حذف رابطهٔ ' + grow.parent.name + ' با ' + grow.otherName,
          title: 'حذف رابطهٔ موازی (آرشیو — مقادیر تاریخی حفظ می‌شود)',
          style: { width: '20px', height: '20px', flexShrink: '0' },
          onclick: function () { confirmArchiveRelation(grow); },
        }, U.icon('x')));
      }
      th.appendChild(inner);
      return th;
    }

    /* ── دیالوگ افزودن رابطهٔ موازی — عناصر همهٔ فعالیت‌های پروژه
       (v1.5.1 §۳/§۴ — دسکتاپ و موبایل یکسان؛ گروه‌بندی ایستگاه ← فعالیت) ── */
    function openAddRelationDialog(el) {
      var related = {};
      (sheet.parallelRelations || []).forEach(function (r) {
        if (r.elementLowId === el.id) related[r.elementHighId] = true;
        if (r.elementHighId === el.id) related[r.elementLowId] = true;
      });
      /* کاتالوگ کامل عناصر پروژه — batch از ماتریس (بدون چرخه) */
      var catalogAll = [];
      try {
        catalogAll = DB.getOverlapMatrix(sheet.activity.projectId, null).elementsCatalog;
      } catch (e) { catalogAll = []; }
      var candidates = catalogAll.filter(function (c) { return c.elementId !== el.id && !related[c.elementId]; });
      var ownEntry = catalogAll.find(function (c) { return c.elementId === el.id; });
      var ownActivityId = ownEntry ? ownEntry.activityId : null;
      var selectedId = null;

      function nameOfCand(id) {
        var e = candidates.find(function (c) { return c.elementId === id; });
        return e ? e.name : '؟';
      }
      function activityLabelOf(id) {
        var e = candidates.find(function (c) { return c.elementId === id; });
        return e ? e.activityName + ' / ' + e.stationName : '؟';
      }

      UI.dialog({
        title: 'افزودن عنصر موازی',
        desc: 'عنصر «' + el.name + '» — عناصر همهٔ فعالیت‌ها و ایستگاه‌های همین پروژه قابل انتخاب‌اند.',
        bodyBuilder: function (body) {
          if (candidates.length === 0) {
            body.appendChild(U.h('p', {
              class: 'text-sm text-muted leading-relaxed',
              text: 'عنصر دیگری در این پروژه برای رابطهٔ موازی وجود ندارد (یا همهٔ روابط ممکن تعریف شده‌اند).',
            }));
            return;
          }
          /* گروه‌بندی ایستگاه ← فعالیت — همان الگوی ماتریس */
          var groups = {};
          var stationOrder = [];
          candidates.forEach(function (c) {
            var key = c.stationId + '|' + c.activityId;
            if (!groups[key]) { groups[key] = { stationName: c.stationName, activityName: c.activityName, list: [] }; stationOrder.push(key); }
            groups[key].list.push(c);
          });
          var list = U.h('div', { class: 'flex flex-col gap-1.5', style: { maxHeight: '46vh', overflowY: 'auto' } });
          stationOrder.forEach(function (key) {
            var g = groups[key];
            list.appendChild(U.h('div', { class: 'mx-picker-group', style: { fontSize: '11px', fontWeight: 700 } },
              U.icon('factory'), g.stationName,
              U.h('span', { class: 'text-faint', style: { fontWeight: 400 } }, ' — ' + g.activityName)));
            g.list.forEach(function (cand) {
              var cross = ownActivityId != null && cand.activityId !== ownActivityId;
              var card = U.h('label', { class: 'radio-card' + (selectedId === cand.id ? ' selected' : '') },
                U.h('input', { type: 'radio', name: 't2t-add-rel', checked: selectedId === cand.id, style: { accentColor: 'var(--brand)', marginTop: '3px' } }),
                U.h('span', { class: 'flex min-w-0 flex-1 items-center gap-1.5' },
                  U.h('span', { class: 'text-sm font-medium truncate', text: cand.name }),
                  cross
                    ? U.h('span', {
                        class: 'mx-chip-cross shrink-0',
                        title: 'این عنصر در فعالیت دیگری از همین پروژه است — رابطهٔ بین‌فعالیت',
                        text: 'بین‌فعالیت',
                      })
                    : null));
              card.addEventListener('change', function () {
                selectedId = cand.id;
                list.querySelectorAll('.radio-card').forEach(function (rc) { rc.classList.remove('selected'); });
                card.classList.add('selected');
              });
              list.appendChild(card);
            });
          });
          body.appendChild(list);
        },
        footerBuilder: function (close) {
          return U.h('div', { class: 'dialog-footer' },
            U.h('button', { class: 'btn', type: 'button', text: 'انصراف', onclick: close }),
            U.h('div', { class: 'spacer' }),
            U.h('button', {
              class: 'btn btn-brand', type: 'button', disabled: !candidates.length,
              onclick: function () {
                if (!selectedId) return;
                var crossNow = selectedId != null && ownActivityId != null && (catalogAll.find(function (c) { return c.elementId === selectedId; }) || {}).activityId !== ownActivityId;
                UI.confirmDialog({
                  title: 'تأیید افزودن رابطهٔ موازی',
                  body: function (body2) {
                    body2.appendChild(U.h('p', { class: 'text-sm leading-relaxed' },
                      'با افزودن رابطهٔ «' + el.name + '» و «' + nameOfCand(selectedId) + '»'
                      + (crossNow ? ' (رابطهٔ بین‌فعالیت — ' + activityLabelOf(selectedId) + ')' : '')
                      + '، زیرردیف آن در برگهٔ زمان‌سنجی (برای همهٔ اپراتورهای هر دو فعالیتِ درگیر)، فرم هر دو عنصر و ماتریس مرکزی نمایش داده می‌شود. ادامه می‌دهید؟'));
                  },
                  confirmLabel: 'افزودن',
                }).then(function (ok) {
                  if (!ok) return;
                  try {
                    DB.createOverlapRelation(sheet.activity.projectId, el.id, selectedId);
                    invalidateSheetCache(); /* همهٔ جلسات — ساختار ردیف‌ها تغییر کرد (§۷) */
                    UI.toast('رابطهٔ موازی افزوده شد', {
                      desc: 'زیرردیف آن در برگهٔ همهٔ اپراتورهای هر دو فعالیت درگیر و فرم هر دو عنصر نمایش داده می‌شود.',
                    });
                    close();
                    ctx.render();
                  } catch (err) { UI.toastError(err); }
                });
              },
            }, U.icon('plus'), 'افزودن'));
        },
      });
    }

    /* ── تأیید آرشیو رابطه از زیرردیف — §۶.۱ ── */
    function confirmArchiveRelation(grow) {
      UI.confirmDialog({
        title: 'حذف رابطهٔ موازی',
        body: function (body) {
          body.appendChild(U.h('p', { class: 'text-sm leading-relaxed' },
            'رابطهٔ ', U.h('b', null, grow.parent.name + ' ↔ ' + grow.otherName),
            ' آرشیو می‌شود؛ زیرردیف آن در برگهٔ زمان‌سنجی (هر دو سمت و همهٔ اپراتورهای فعالیت) و ماتریس فعال خارج می‌شود. مقادیر تاریخی چرخه‌ها حذف نمی‌شوند و با بازگردانی رابطه برمی‌گردند. ادامه می‌دهید؟'));
        },
        confirmLabel: 'بله، حذف کن',
        destructive: true,
      }).then(function (ok) {
        if (!ok) return;
        try {
          DB.archiveOverlapRelation(grow.relation.relationId);
          invalidateSheetCache();
          UI.toast('رابطه آرشیو شد', { desc: 'مقادیر تاریخی حفظ می‌شود و از بخش «روابط آرشیوشده» قابل بازگردانی است.' });
          ctx.render();
        } catch (err) { UI.toastError(err); }
      });
    }

    /* ── سلول «سپری‌شده» (پانوشت ستون چرخه) ── */
    function elapsedCell(cycle) {
      var td = U.h('td', { style: { textAlign: 'center' } });
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

    /* ── سازندهٔ سلول عنصر — data-row=ردیف شبکه، data-col=ستون چرخه ── */
    function buildCellTd(cycle, colIdx, el, rowIdx) {
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
          dataset: { row: String(rowIdx), col: String(colIdx), part: part },
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
        /* v1.5.0 هم‌ارزی آنلاین: فیلدهای غایب صریحاً null می‌شوند (جایگزینی کامل سلول) */
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
            cell = { cycleNo: cycle.cycleNo, workElementId: el.id, rawDuration: null, cumulativeReading: null, startOffset: sv, endOffset: ev };
          }
        } else {
          var q = readNum(seqIn.value);
          if (q.empty) {
            if (!obs || (obs.rawDuration === null && obs.cumulativeReading === null)) { scheduleRender(); return; }
            cell = { cycleNo: cycle.cycleNo, workElementId: el.id, rawDuration: null, cumulativeReading: null, startOffset: null, endOffset: null };
          } else {
            var cur = method === 'SNAPBACK' ? (obs ? obs.rawDuration : null) : (obs ? obs.cumulativeReading : null);
            if (cur === q.n && obs && obs.startOffset === null && obs.endOffset === null) { scheduleRender(); return; }
            cell = method === 'SNAPBACK'
              ? { cycleNo: cycle.cycleNo, workElementId: el.id, rawDuration: q.n, cumulativeReading: null, startOffset: null, endOffset: null }
              : { cycleNo: cycle.cycleNo, workElementId: el.id, rawDuration: null, cumulativeReading: q.n, startOffset: null, endOffset: null };
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
           برچسب کوچک هر ورودی + قاب واحد گردگوشه؛ ورودی‌ها LTR می‌مانند.
           v1.5.2 §۵ — جهت گروه RTL: «از» در راست، «تا» در چپ */
        row.appendChild(U.h('div', { class: 't2t-int-group', dir: 'rtl', role: 'group', 'aria-label': 'بازهٔ ' + el.name },
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

      /* پرچم‌های وضعیت — v1.5.2 §۷: پرچم مشکوک در مجاورت مقدار (داخل ردیف
         افقی سلول) قرار می‌گیرد، نه گوشهٔ سلول؛ کلیک مستقل دیالوگ تشخیص را
         باز می‌کند — §۱۲.۳. پرچم خارج‌شده همچنان گوشه‌ای است */
      if (suspect && obs) {
        var suspectFlag = U.h('button', {
          class: 't2t-suspect-flag', type: 'button',
          title: 'تشخیص مشاهدهٔ مشکوک', 'aria-label': 'تشخیص مشاهدهٔ مشکوک',
          onclick: function (e) { e.stopPropagation(); openSuspectDialog(cycle, obs, el.name); },
        }, U.icon('alertTriangle'));
        row.appendChild(suspectFlag);
      }
      if (excluded) td.appendChild(U.h('span', { class: 'cell-flag', title: 'خارج‌شده از محاسبات', style: { color: 'var(--faint)' } }, U.icon('eraser')));

      return td;
    }

    /* ── سازندهٔ سلول زیرردیف هم‌پوشانی — §۵.۳/§۵.۴ (خالی=UNREVIEWED، ۰=NO_OVERLAP، مثبت=OVERLAP) ── */
    function buildOverlapTd(cycle, colIdx, grow, rowIdx) {
      var rel = grow.relation;
      var cell = overlapCellOfLocal(cycle, rel.relationId);
      var cmp = comparabilityOf(cycle, rel);
      var computed = computedOverlapOf(cycle, rel);
      var canEdit = editable && cmp.isComparable;
      var td = U.h('td', { style: { textAlign: 'center', padding: '0 2px' } });
      if (cell.status === 'NO_OVERLAP') td.style.background = 'color-mix(in srgb, var(--green) 8%, transparent)';
      else if (cell.status === 'OVERLAP') td.style.background = 'color-mix(in srgb, var(--green) 12%, transparent)';
      if (!cmp.isComparable) {
        td.title = cmp.notComparableReason;
        td.style.opacity = '.6';
      }

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

      function commitOverlap() {
        clearError();
        var t = String(inp.value).trim();
        if (t === '' || t === '-' || t === '—' || t === '–') {
          if (cell.status === 'UNREVIEWED') { scheduleRender(); return; }
          if (withUndo(sessionId, 'پاک‌کردن هم‌پوشانی', function () {
            DB.setCycleOverlaps(cycle.id, [{ relationId: rel.relationId, status: 'UNREVIEWED', overlapDuration: null }]);
          })) invalidateSheetCache(sessionId);
          scheduleRender();
          return;
        }
        var n = U.parseNumber(t);
        if (isNaN(n)) { showError('مقدار عددی معتبر نیست'); scheduleRender(); return; }
        if (n < 0) { showError('مقدار هم‌پوشانی منفی مجاز نیست'); scheduleRender(); return; }
        if (n === 0 && computed !== null && computed > 1e-9) {
          showError('بازهٔ واقعی این چرخه هم‌پوشانی ' + U.formatTimeValue(computed) + ' دارد؛ ثبت «بدون هم‌پوشانی» ممکن نیست');
          scheduleRender();
          return;
        }
        if (n > 0 && computed !== null && Math.abs(n - computed) > 1e-6) {
          showError('مقدار واردشده (' + n + ') با هم‌پوشانی بازهٔ واقعی (' + U.formatTimeValue(computed) + ') نمی‌خواند');
          scheduleRender();
          return;
        }
        var target = n === 0
          ? { status: 'NO_OVERLAP', overlapDuration: 0 }
          : { status: 'OVERLAP', overlapDuration: n };
        if (cell.status === target.status && cell.overlapDuration === target.overlapDuration) { scheduleRender(); return; }
        if (withUndo(sessionId, 'ثبت هم‌پوشانی', function () {
          DB.setCycleOverlaps(cycle.id, [{ relationId: rel.relationId, status: target.status, overlapDuration: target.overlapDuration }]);
        })) invalidateSheetCache(sessionId);
        scheduleRender();
      }

      var inp = null;
      if (!editable || !canEdit) {
        /* نمایش فقط‌خواندنی */
        if (cell.status === 'UNREVIEWED') {
          td.appendChild(U.h('span', {
            class: 't2t-ov-unreviewed', title: 'بررسی‌نشده — خالی به معنی صفر نیست',
            text: '؟',
          }));
        } else if (cell.status === 'NO_OVERLAP') {
          td.appendChild(U.h('span', { class: 'num text-xs font-bold', style: { color: 'var(--green)' }, title: 'بدون هم‌پوشانی — تأییدشده', text: '۰' }));
        } else {
          td.appendChild(U.h('span', { class: 'num text-xs font-bold' },
            U.formatTimeValue(cell.overlapDuration),
            U.h('span', { style: { fontSize: '9px', color: 'var(--muted-foreground)', fontWeight: '400' }, text: ' s' })));
        }
      } else {
        inp = U.h('input', {
          class: 'sheet-cell', type: 'text', dir: 'ltr', inputmode: 'decimal',
          value: cell.status === 'UNREVIEWED' ? '' : roundEdit(cell.overlapDuration),
          'aria-label': 'هم‌پوشانی ' + grow.parent.name + ' با ' + grow.otherName + ' چرخهٔ ' + U.formatInt(cycle.cycleNo),
          placeholder: '—',
          dataset: { row: String(rowIdx), col: String(colIdx), part: 'ov' },
          style: { width: '64px' },
        });
        inp.addEventListener('change', commitOverlap);
        td.appendChild(inp);
      }
      /* پیشنهاد مقدار محاسبه‌شده از بازهٔ واقعی — §۵.۵ */
      if (computed !== null && cell.status !== 'OVERLAP' && canEdit) {
        td.appendChild(U.h('button', {
          type: 'button',
          class: 't2t-ov-suggest num',
          title: 'هم‌پوشانی محاسبه‌شده از بازهٔ واقعی: ' + U.formatTimeValue(computed) + ' — برای اعمال کلیک کنید',
          onclick: function (e) {
            e.stopPropagation();
            if (withUndo(sessionId, 'اعمال هم‌پوشانی محاسبه‌شده', function () {
              DB.setCycleOverlaps(cycle.id, [{ relationId: rel.relationId, status: 'OVERLAP', overlapDuration: computed }]);
            })) invalidateSheetCache(sessionId);
            scheduleRender();
          },
        }, '≈ ' + U.formatTimeValue(computed)));
      }
      return td;
    }

    /* ── دیالوگ جزئیات چرخه — §۸.۱ v1.5.0 (از سربرگ ستون چرخه باز می‌شود) ── */
    function openCycleDetailDialog(cycle) {
      var box = U.h('div', { class: 'flex flex-col gap-3' });

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

      UI.dialog({
        title: 'جزئیات چرخهٔ ' + U.formatInt(cycle.cycleNo),
        desc: 'اپراتور ' + sheet.operator.displayName + ' — ' + methodLabel,
        size: 'lg',
        bodyBuilder: function (body) { body.appendChild(box); },
        footerBuilder: function (close) {
          return U.h('div', { class: 'dialog-footer' },
            U.h('button', { class: 'btn', type: 'button', text: 'بستن', onclick: close }));
        },
      });
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
          if ((x.obs.laneType || x.el.defaultLaneType || 'OPERATOR') !== laneType) return;
          var left = (x.obs.startOffset / elapsed) * 100;
          var width = Math.max(((x.obs.endOffset - x.obs.startOffset) / elapsed) * 100, 2.5);
          lane.appendChild(U.h('div', {
            class: 't2t-bar',
            style: { insetInlineStart: left + '%', width: width + '%', background: LANE_COLORS[(x.obs.laneType || (x.el.defaultLaneType || 'OPERATOR'))] || 'var(--brand)' },
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
          U.h('span', { style: { width: '8px', height: '8px', borderRadius: '99px', background: LANE_COLORS[(x.obs.laneType || (x.el.defaultLaneType || 'OPERATOR'))] || 'var(--brand)', display: 'inline-block', flexShrink: '0' } }),
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
      /* §۸.۳ — لنگر بر اساس شناسهٔ ردیف (عنصر/رابطه) و شمارهٔ چرخه */
      var anchor = anchorMap[sessionId];
      var hasEl = anchor && elements.some(function (e) { return e.id === anchor.elementId; });
      var hasRel = anchor && anchor.relationId && (sheet.parallelRelations || []).some(function (r) { return r.relationId === anchor.relationId; });
      if (!anchor || !hasEl || (anchor.relationId && !hasRel)) {
        anchor = {
          cycleNo: cycles.length ? cycles[0].cycleNo : 1,
          elementId: elements.length ? elements[0].id : null,
          relationId: null,
        };
      }
      var anchorName = '—';
      elements.forEach(function (e) { if (e.id === anchor.elementId) anchorName = e.name; });
      if (anchor.relationId) {
        (sheet.parallelRelations || []).forEach(function (r) {
          if (r.relationId === anchor.relationId) {
            anchorName = 'هم‌پوشانی (' + anchorName + ' ↔ ' + (r.elementLowId === anchor.elementId ? r.elementHighName : r.elementLowName) + ')';
          }
        });
      }
      var mode = 'ALL_OR_NOTHING';
      var preview = null;
      var commitBtn = null;
      var previewWrap = null;
      var textArea = null;
      /* v1.5.2 §۹ — منبع فایل قالب + لنگر پیش‌فرض دیالوگ */
      var fileTsv = null;
      var defaultAnchor = anchor;

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

        /* جدول پیش‌نمایش — ردیف=شبکه (عنصر/زیرردیف)، ستون=چرخه (§۸.۳) */
        var maxCols = 0;
        var rowIdxSet = {};
        preview.cells.forEach(function (cell) {
          if (cell.colIndex + 1 > maxCols) maxCols = cell.colIndex + 1;
          rowIdxSet[cell.row] = true;
        });
        var rowIdxs = Object.keys(rowIdxSet).map(Number).sort(function (a, b) { return a - b; });
        var gridRowsAll = preview.gridRows || [];
        var derivedMap = previewDerivedMap();
        var rowByNo = {};
        cycles.forEach(function (cc) { rowByNo[cc.cycleNo] = cc; });

        previewWrap.appendChild(UI.table(
          ['عنصر / رابطه'].concat(
            Array.apply(null, Array(Math.max(maxCols, 1))).map(function (_, i) {
              return 'چرخهٔ ' + U.formatInt(preview.anchorCycleNo + i);
            })),
          function (tbodyEl) {
            rowIdxs.forEach(function (ri) {
              var grow = gridRowsAll[ri];
              if (!grow) return;
              var rowCells = {};
              preview.cells.forEach(function (cell) { if (cell.row === ri) rowCells[cell.colIndex] = cell; });
              var tr = U.h('tr', null,
                U.h('td', { class: 'font-bold text-xs' },
                  grow.kind === 'RELATION'
                    ? U.h('span', { class: 'text-muted', style: { fontSize: '11px' }, text: '↲ هم‌پوشانی با ' + grow.otherElementName })
                    : grow.elementName));
              for (var ci = 0; ci < Math.max(maxCols, 1); ci++) {
                var cell = rowCells[ci];
                if (!cell) { tr.appendChild(U.h('td')); continue; }
                var td = U.h('td');
                if (cell.status === 'ERROR') {
                  td.style.background = 'var(--red-soft)';
                  td.appendChild(U.h('div', { class: 'num text-xs', text: cell.raw || '—', title: cell.message }));
                  td.appendChild(U.h('div', { class: 'text-xs', style: { color: 'var(--red)' }, text: cell.message }));
                } else if (cell.status === 'NO_CHANGE') {
                  td.appendChild(U.h('span', { class: 'text-faint', text: '—' }));
                } else if (cell.relationId && cell.overlapStatus) {
                  td.appendChild(U.h('div', { class: 'num text-xs' },
                    cell.overlapStatus === 'NO_OVERLAP' ? '۰ (بدون هم‌پوشانی)' : U.formatTimeValue(cell.overlapDuration)));
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
        title: 'ورود اطلاعات از Excel',
        desc: 'مبدأ: چرخهٔ ' + U.formatInt(anchor.cycleNo) + '، ردیف «' + anchorName + '» — هر سطر داده یک ردیف شبکه و هر ستون یک چرخه.',
        size: 'xl4',
        bodyBuilder: function (body) {
          body.appendChild(U.h('div', { class: 't2t-help-row' },
            U.h('span', { class: 'text-xs text-muted' }, 'راهنما:'),
            UI.helpDot('ورود اطلاعات از Excel', {
              what: 'ثبت هم‌زمان چند سطر و ستون از Excel در برگهٔ زمان‌سنجی — با چیدمان جدید: هر سطر داده یک ردیف شبکه (عنصر یا زیرردیف هم‌پوشانی) و هر ستون داده یک چرخه.',
              input: 'دو مسیر مستقل: (۱) محدودهٔ موردنظر را در Excel کپی کنید (Ctrl+C) و همین‌جا بچسبانید (Ctrl+V)؛ (۲) «قالب Excel» این جلسه را دانلود کنید، تکمیل کنید و فایل را بارگذاری کنید.',
              example: 'اگر ۳ عنصر دارید و ۵ چرخه Paste می‌کنید، یک محدودهٔ ۳ سطر × ۵ ستون کپی کنید. برای عنصر هم‌زمان «۳-۹» و برای زیرردیف هم‌پوشانی خالی/۰/مقدار مثبت بنویسید.',
              note: 'هیچ داده‌ای بدون پیش‌نمایش و تأیید شما ثبت نمی‌شود؛ خطای هر سلول با محل و علت دقیق نمایش داده می‌شود. بارگذاری فایل هم فقط ورودی همین مسیر را می‌سازد و به‌صورت مستقیم ذخیره نمی‌کند.',
            }),
            UI.helpDot('حالت ثبت Paste', {
              what: 'رفتار سیستم هنگامی که برخی سلول‌های Paste نامعتبر باشند.',
              input: '«همه یا هیچ»: تا وقتی حتی یک سلول خطا دارد، هیچ چیزی ثبت نمی‌شود. «رد سلول‌های مشکل‌دار»: فقط سلول‌های سالم ثبت و سلول‌های خطادار رد می‌شوند.',
              example: 'در یک Paste با یک سلول منفی، حالت اول هیچ چیزی ثبت نمی‌کند؛ حالت دوم بقیهٔ سلول‌ها را ثبت و همان سلول را رد می‌کند.',
              note: 'این انتخاب مطابق الزام PRD است که Paste نامعتبر نباید باعث ثبت ناقص و پنهانی کل محدوده شود.',
            })));

          /* ── مسیر ۱: Paste مستقیم — v1.5.2 §۹-۱ (دست‌نخورده) ── */
          var pasteSection = U.h('div', { class: 'flex flex-col gap-2' });
          textArea = U.h('textarea', {
            class: 'textarea t2t-mono', dir: 'ltr', rows: '7',
            placeholder: '12.5\t8.3\t9.1\n…',
          });
          pasteSection.appendChild(U.h('div', { class: 'field-label' }, 'محتوای Excel را اینجا بچسبانید'));
          pasteSection.appendChild(textArea);
          pasteSection.appendChild(U.h('p', {
            class: 'hint',
            text: 'هر سطر = یک ردیف شبکه (عنصر یا زیرردیف هم‌پوشانی) — هر ستون = یک چرخه — جداکنندهٔ ستون: Tab — اعشار: نقطه یا «٫» — بازهٔ عنصر: «۳-۹» — زیرردیف هم‌پوشانی: خالی/۰/مقدار مثبت — خالی = بدون تغییر',
          }));

          function runPreviewFrom(text, anc) {
            try {
              preview = DB.pastePreview(sessionId, { cycleNo: anc.cycleNo, elementId: anc.elementId, relationId: anc.relationId || null }, text);
            } catch (err) { UI.toastError(err); return; }
            renderPreview();
          }

          pasteSection.appendChild(U.h('button', {
            class: 'btn btn-outline w-fit', type: 'button',
            onclick: function () {
              if (!textArea.value.trim()) return;
              runPreviewFrom(textArea.value, anchor);
            },
          }, U.icon('clipboardPaste'), 'پیش‌نمایش و اعتبارسنجی'));
          body.appendChild(pasteSection);

          /* ── مسیر ۲: فایل قالب — v1.5.2 §۹ ── */
          var filePanel = U.h('div', { class: 't2t-file-source', style: { display: 'none' } });
          body.appendChild(filePanel);

          function renderFilePanel(name, rows, cols) {
            U.clear(filePanel);
            filePanel.style.display = '';
            filePanel.appendChild(U.h('div', { class: 't2t-file-title' },
              U.h('span', { class: 't2t-file-name' },
                U.icon('fileSpreadsheet'),
                U.h('span', { class: 'truncate', text: 'فایل بارگذاری‌شده: ' + name })),
              U.h('button', {
                class: 'btn btn-sm btn-outline shrink-0', type: 'button', text: 'بازگشت به Paste متنی',
                onclick: function () {
                  fileTsv = null;
                  anchor = defaultAnchor;
                  filePanel.style.display = 'none';
                  pasteSection.style.display = '';
                  if (fileInput) fileInput.value = '';
                  preview = null;
                  updateCommitBtn();
                },
              })));
            filePanel.appendChild(U.h('p', { class: 'text-xs num', style: { color: 'var(--muted-foreground)' },
              text: U.formatInt(rows) + ' ردیف × ' + U.formatInt(cols) + ' چرخه خوانده شد — مبدأ نگاشت: چرخهٔ ' + U.formatInt(anchor.cycleNo) + ' از ابتدای برگه. پیش‌نمایش زیر را بررسی و پس از رفع خطاها ثبت نهایی کنید.' }));
          }

          var orSection = U.h('div', { class: 't2t-excel-or' },
            U.h('div', { class: 't2t-or-label' },
              U.h('span', { class: 't2t-or-badge', text: 'یا' }),
              'ورود از طریق قالب Excel این جلسه'),
            U.h('div', { class: 'flex flex-wrap items-center gap-2' },
              U.h('button', {
                class: 'btn btn-sm btn-outline', type: 'button',
                title: 'دانلود قالب Excel متناسب با این جلسه — شامل نام واقعی عناصر، روابط موازی و چرخه‌ها',
                onclick: function () { g.T2EXCEL.downloadTemplate(sessionId); },
              }, U.icon('fileSpreadsheet'), 'دانلود قالب Excel'),
              U.h('button', {
                class: 'btn btn-sm btn-outline', type: 'button',
                title: 'بارگذاری فایل xlsx تکمیل‌شدهٔ همان قالب — داده‌ها وارد پیش‌نمایش می‌شوند',
                onclick: function () { fileInput.click(); },
              }, U.icon('fileUp'), 'بارگذاری فایل Excel')));
          var fileInput = U.h('input', { type: 'file', accept: '.xlsx', style: { display: 'none' } });
          fileInput.addEventListener('change', function () {
            var f = fileInput.files && fileInput.files[0];
            if (!f) return;
            var errBox = orSection.querySelector('.t2t-file-error');
            if (errBox) { U.clear(errBox); errBox.style.display = 'none'; }
            var loadBtn = orSection.querySelectorAll('button')[1];
            if (loadBtn) loadBtn.disabled = true;
            g.T2EXCEL.parseTemplate(sessionId, f)
              .then(function (r) {
                fileTsv = r.data.map(function (row) { return row.join('\t'); }).join('\n');
                anchor = r.anchor;
                textArea.value = '';
                renderFilePanel(r.sourceName || f.name, r.data.length, Math.max.apply(null, r.data.map(function (row) { return row.length; })));
                pasteSection.style.display = 'none';
                (r.warnings || []).forEach(function (w) { UI.toast(w, { type: 'warning' }); });
                /* پیش‌نمایش خودکار — داده‌ها پیش از Commit قابل بررسی‌اند (§۹-۶) */
                runPreviewFrom(fileTsv, anchor);
              })
              .catch(function (err) {
                fileTsv = null;
                anchor = defaultAnchor;
                UI.toastError(err);
                if (errBox) {
                  errBox.style.display = '';
                  errBox.appendChild(U.h('div', { style: { whiteSpace: 'pre-line' }, text: String(err && err.message || err) }));
                }
              })
              .finally(function () { if (loadBtn) loadBtn.disabled = false; });
          });
          orSection.appendChild(fileInput);
          var fileErrorBox = U.h('div', { class: 't2t-file-error', style: { display: 'none' } });
          orSection.appendChild(U.h('p', {
            class: 'text-xs text-muted leading-relaxed',
            style: { fontSize: '11px' },
            text: 'قالب شامل نام واقعی عناصر و روابط موازی همین جلسه و ستون‌های چرخه است (شناسه‌های پایدار در شیت مخفی Metadata). پس از تکمیل، فایل را بارگذاری کنید یا محدودهٔ داده‌ها را کپی و در همان مسیر Paste بالا بچسبانید.',
          }));
          orSection.appendChild(fileErrorBox);
          body.appendChild(orSection);

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
