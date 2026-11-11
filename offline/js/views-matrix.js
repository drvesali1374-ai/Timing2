/* ═══════════════════════════════════════════════════════════
   views-matrix.js — «ماتریس هم‌پوشانی عناصر کاری» (جلسه ۲)
   پورت وفادار از MatrixView.tsx + matrix/*.tsx نسخه وب:
   • یک ماتریس مرکزی یکتا در هر پروژه — عضویت پویا از روابط فعال
   • انتخاب چرخه نزدیک عنوان؛ فقط مقادیر همان چرخه (§۵)
   • سه وضعیت متمایز: بررسی‌نشده / بدون هم‌پوشانی / دارای هم‌پوشانی (§۱۱)
   • ویرایش سلول با draft + «ثبت تغییرات» + تأیید اثرات (§۴.۴)
   • اعتبارسنجی و محاسبات وابسته (§۶/§۷/§۸) + روابط آرشیوشده
   • موبایل (<768px): لیست زوج‌ها به‌جای جدول فشرده (§۱۱)
   • T2VIEWS._parallelRelationsSection — بخش مشترک «عناصر موازی»
     برای دیالوگ عنصر در views-structure.js (§۴.۲)
   ═══════════════════════════════════════════════════════════ */
(function (g) {
  'use strict';
  var U = g.T2U, DB = g.T2DB, UI = g.T2UI;
  g.T2VIEWS = g.T2VIEWS || {};

  function appNavigate(hash) { if (g.T2APP) g.T2APP.navigate(hash); }

  // ── برچسب‌های مشترک ──
  var STATUS_LABEL = { UNREVIEWED: 'بررسی‌نشده', NO_OVERLAP: 'بدون هم‌پوشانی', OVERLAP: 'دارای هم‌پوشانی' };
  var METHOD_LABEL = { SNAPBACK: 'برگشت به صفر', CONTINUOUS: 'پیوسته' };

  // ── محتوای راهنمای آیکونی — عیناً از MatrixView.tsx ──
  var MATRIX_HELP = {
    what: 'این ماتریس، روابط موازی عناصر کاری پروژه را در یک نما نشان می‌دهد. هر خانه، میزان هم‌پوشانی دو عنصر در چرخهٔ انتخاب‌شده را نمایش می‌دهد.',
    input: 'ابتدا یک «رابطهٔ موازی» بین دو عنصر تعریف کنید؛ سپس یک چرخه انتخاب کنید و مقدار هر خانه را با کلیک روی آن ثبت کنید. مقدار ثبت‌شده فقط برای همان چرخه است.',
    example: 'اگر عنصر «بارگذاری» و «پرس کوبی» هم‌زمان اجرا می‌شوند، رابطهٔ موازی آن‌ها را تعریف کنید و در هر چرخه مقدار هم‌پوشانی (مثلاً ۳٫۵ ثانیه) را ثبت کنید.',
    note: 'تغییر مقدار از فرم هر عنصر، ماتریس و فرم عنصر مقابل را هم‌زمان به‌روز می‌کند — همهٔ نماها به یک منبع داده وصل هستند. «بررسی‌نشده» به معنی صفر نیست.',
  };

  // ═══════════ وضعیت ماژول ═══════════
  // چرخهٔ انتخاب‌شده در طول جلسه (بدون localStorage) per پروژه حفظ می‌شود؛
  // پیش‌نویس‌ها فقط تا خروج از این نما زنده‌اند (هم‌ارز unmount در نسخه وب).
  var _cycleByProject = {};
  var drafts = {};      // relationId -> { status, overlapDuration }
  var openCell = null;  // { relationId, rowId } — ویرایشگر بازشدهٔ جدول دسکتاپ
  var openPair = null;  // relationId — کارت بازشدهٔ لیست موبایل
  var rootContainer = null;
  var rootProjectId = null;

  function resetInteractionState() {
    drafts = {};
    openCell = null;
    openPair = null;
  }

  function rerender() {
    if (!rootContainer) return;
    // حفظ فوکس ورودی مقدار پس از رندر مجدد (تایپ در «مدت هم‌پوشانی» نباید قطع شود)
    var active = document.activeElement;
    var focusKey = active && active.getAttribute ? active.getAttribute('data-mx-focus') : null;
    renderMatrix(rootContainer, rootProjectId);
    if (focusKey) {
      var next = rootContainer.querySelector('[data-mx-focus="' + focusKey + '"]');
      if (next && typeof next.focus === 'function') {
        next.focus();
        try {
          if (typeof next.setSelectionRange === 'function' && typeof next.value === 'string') {
            next.setSelectionRange(next.value.length, next.value.length);
          }
        } catch (e) { /* بی‌خطر */ }
      }
    }
  }

  // ═══════════ کمکی‌ها ═══════════

  function pairKey(a, b) { return a < b ? a + '|' + b : b + '|' + a; }

  function amberNote(text) {
    return U.h('p', {
      class: 'rounded-xl p-3 text-sm',
      style: { background: 'color-mix(in srgb, var(--amber-soft) 60%, transparent)' },
      text: text,
    });
  }

  /** مقدار مؤثر یک زوج = پیش‌نویس؟ نبود؟ مقدار ثبت‌شده چرخه؛ نبود؟ بررسی‌نشده */
  function effectiveCell(matrix, relationId) {
    var d = drafts[relationId];
    if (d) return { status: d.status, overlapDuration: d.overlapDuration, isDraft: true };
    var c = matrix.cells[relationId];
    if (c) return { status: c.status, overlapDuration: c.overlapDuration, isDraft: false };
    return { status: 'UNREVIEWED', overlapDuration: null, isDraft: false };
  }

  /** چیپ وضعیت — UNREVIEWED هرگز به شکل عدد صفر نمایش داده نمی‌شود (§۱۱) */
  function statusChipEl(eff, boxed) {
    if (eff.status === 'UNREVIEWED') {
      return U.h('span', { class: 'mx-chip unreviewed', text: STATUS_LABEL.UNREVIEWED });
    }
    if (eff.status === 'NO_OVERLAP') {
      return U.h('span', { class: 'mx-chip no-overlap', text: STATUS_LABEL.NO_OVERLAP });
    }
    var val = U.h('span', { class: 'mx-val' + (boxed ? ' mx-chip' : ''), dir: 'ltr' },
      U.formatTimeValue(eff.overlapDuration),
      U.h('span', { class: 'mx-unit', text: ' s' }));
    if (boxed) val.style.background = 'var(--brand-soft)';
    return val;
  }

  function setDraft(relationId, draft) {
    if (draft === null) delete drafts[relationId];
    else drafts[relationId] = draft;
    rerender();
  }

  // ═══════════ نمای اصلی — T2VIEWS.matrix ═══════════

  g.T2VIEWS.matrix = function (container, projectId) {
    rootContainer = container;
    rootProjectId = projectId;
    resetInteractionState();
    renderMatrix(container, projectId);
  };

  function renderMatrix(container, projectId) {
    U.clear(container);
    var project = DB.getProject(projectId);
    if (!project) {
      container.appendChild(UI.emptyState({ title: 'پروژه یافت نشد', desc: 'این پروژه حذف شده یا شناسه آن نامعتبر است.', icon: 'package' }));
      return;
    }

    // واکشی ماتریس — منبع واحد داده (§۴)؛ چرخهٔ ذخیره‌شدهٔ نامعتبر → بازگشت به بدون چرخه
    var cycleId = _cycleByProject[projectId] || null;
    var matrix;
    try {
      matrix = DB.getOverlapMatrix(projectId, cycleId);
    } catch (err) {
      if (cycleId) {
        _cycleByProject[projectId] = null;
        cycleId = null;
        try { matrix = DB.getOverlapMatrix(projectId, null); }
        catch (err2) {
          container.appendChild(U.h('div', { class: 'banner error mt-4' }, U.icon('alertTriangle'), U.h('div', null, 'خطا در نمایش ماتریس: ' + (err2 && err2.message ? err2.message : err2))));
          return;
        }
      } else {
        container.appendChild(U.h('div', { class: 'banner error mt-4' }, U.icon('alertTriangle'), U.h('div', null, 'خطا در نمایش ماتریس: ' + (err && err.message ? err.message : err))));
        return;
      }
    }
    _cycleByProject[projectId] = cycleId;

    var activeRelations = matrix.relations.filter(function (r) { return r.isActive; });

    /* ── کارت اصلی ── */
    var card = U.h('section', { class: 'card overflow-hidden', 'aria-label': 'ماتریس هم‌پوشانی عناصر کاری' });
    card.appendChild(U.h('div', { class: 'card-head' },
      U.h('div', { class: 'flex flex-wrap items-center justify-between gap-2 p-4 pb-3' },
        U.h('div', { class: 'flex items-center gap-2' },
          U.h('span', { class: 'chip-icon' }, U.icon('network')),
          U.h('h1', { class: 'text-lg font-extrabold', text: 'ماتریس هم‌پوشانی عناصر کاری' }),
          UI.helpDot('ماتریس هم‌پوشانی', MATRIX_HELP)),
        U.h('button', {
          class: 'btn btn-brand btn-sm', type: 'button',
          onclick: function () { openAddRelationDialog(projectId, matrix); },
        }, U.icon('plus'), 'افزودن رابطهٔ موازی'))));

    var content = U.h('div', { class: 'p-4 flex flex-col gap-4' });
    card.appendChild(content);
    container.appendChild(card);

    /* ── انتخاب چرخه — نزدیک عنوان ماتریس (§۵) ── */
    if (matrix.cycles.length === 0) {
      content.appendChild(amberNote('هنوز چرخه‌ای در این پروژه ثبت نشده است. برای ثبت مقادیر هم‌پوشانی، ابتدا در «زمان‌سنجی» داده ثبت کنید.'));
    } else {
      content.appendChild(buildCycleSelector(matrix, cycleId, function (next) {
        _cycleByProject[projectId] = next;
        resetInteractionState(); // مقدار پیش‌نویس به چرخهٔ دیگر تعلق ندارد
        rerender();
      }));
    }

    /* ── نوار ثبت‌نشده (draft) — §۴.۴ ── */
    var draftKeys = Object.keys(drafts);
    if (draftKeys.length > 0) {
      content.appendChild(U.h('div', { class: 'matrix-draft-bar' },
        U.h('p', { class: 'text-sm' },
          U.formatInt(draftKeys.length) + ' تغییر ثبت‌نشده دارید. پس از «ثبت تغییرات»، هم‌پوشانی چندتایی و اعتبارسنجی مجدداً محاسبه می‌شود.'),
        U.h('div', { class: 'flex items-center gap-2' },
          U.h('button', {
            class: 'btn btn-ghost btn-sm', type: 'button', text: 'انصراف',
            onclick: function () { resetInteractionState(); rerender(); },
          }),
          U.h('button', {
            class: 'btn btn-brand btn-sm', type: 'button', text: 'ثبت تغییرات',
            disabled: !cycleId ? true : null,
            onclick: function () { commitDrafts(matrix, cycleId); },
          }))));
    }

    if (activeRelations.length === 0) {
      /* ── حالت خالی — هنوز رابطه‌ای تعریف نشده ── */
      content.appendChild(U.h('div', { class: 'empty-state' },
        U.h('div', { class: 'icon-wrap' }, U.icon('network')),
        U.h('h3', { class: 'font-bold', text: 'هنوز رابطهٔ موازی تعریف نشده است' }),
        U.h('p', {
          class: 'text-sm text-muted leading-relaxed', style: { maxWidth: '384px' },
          text: 'برای نمایش عناصر در ماتریس، ابتدا یک رابطهٔ موازی تعریف کنید. فقط عناصری وارد ماتریس می‌شوند که دست‌کم یک رابطهٔ فعال داشته باشند.',
        }),
        U.h('div', { class: 'flex flex-wrap justify-center gap-2' },
          U.h('button', {
            class: 'btn btn-brand', type: 'button',
            onclick: function () { openAddRelationDialog(projectId, matrix); },
          }, U.icon('plus'), 'افزودن رابطهٔ موازی'),
          U.h('button', {
            class: 'btn btn-outline', type: 'button',
            onclick: function () { appNavigate('/p/' + projectId + '/timing'); },
          }, 'رفتن به زمان‌سنجی'))));
      return;
    }

    /* ── خط زمینهٔ چرخه / راهنمای کهربایی ── */
    if (cycleId && matrix.selectedCycle) {
      content.appendChild(U.h('p', { class: 'text-xs text-muted' },
        'مقادیر متعلق به: اپراتور «' + matrix.selectedCycle.operatorName + '» — فعالیت «' +
        matrix.selectedCycle.activityName + '» — چرخهٔ ' + U.formatInt(matrix.selectedCycle.cycleNo)));
    } else {
      content.appendChild(amberNote('برای مشاهده و ویرایش مقادیر، یک چرخه انتخاب کنید. تا پیش از انتخاب چرخه، مقداری نمایش داده نمی‌شود (میانگین یا حدس زده نمی‌شود).'));
    }

    /* ── جدول دسکتاپ / لیست زوج‌های موبایل ── */
    content.appendChild(U.h('div', { class: 'matrix-desktop' }, buildMatrixTable(matrix, cycleId)));
    content.appendChild(U.h('div', { class: 'matrix-mobile' }, buildPairList(matrix, cycleId)));

    /* ── پنل اعتبارسنجی و محاسبات وابسته ── */
    var validation = buildValidationPanel(matrix);
    if (validation) content.appendChild(validation);

    /* ── روابط آرشیوشده — بازگردانی ── */
    var archived = buildArchivedRelations(matrix);
    if (archived) content.appendChild(archived);
  }

  // ═══════════ انتخاب‌گر چرخه — گروه‌بندی جلسات (ادغام نمی‌شوند) — §۵ ═══════════

  function buildCycleSelector(matrix, cycleId, onChange) {
    var sel = U.h('select', { class: 'select', 'aria-label': 'انتخاب چرخه', style: { maxWidth: '28rem', width: '100%' } });
    var noneOpt = U.h('option', { value: '' }, '— بدون انتخاب چرخه —');
    if (!cycleId) noneOpt.selected = true;
    sel.appendChild(noneOpt);

    var sessionIds = [];
    var bySession = {};
    matrix.cycles.forEach(function (c) {
      if (!bySession[c.sessionId]) {
        bySession[c.sessionId] = {
          label: c.activityName + ' — ' + c.operatorName + ' (' + (METHOD_LABEL[c.timingMethod] || c.timingMethod) + ')',
          cycles: [],
        };
        sessionIds.push(c.sessionId);
      }
      bySession[c.sessionId].cycles.push(c);
    });
    sessionIds.forEach(function (sid) {
      var s = bySession[sid];
      var og = U.h('optgroup', { label: s.label });
      s.cycles.forEach(function (c) {
        var opt = U.h('option', { value: c.cycleId }, 'چرخهٔ ' + U.formatInt(c.cycleNo) + ' — ' + U.formatDate((c.createdAt || '').slice(0, 10)));
        if (cycleId === c.cycleId) opt.selected = true;
        og.appendChild(opt);
      });
      sel.appendChild(og);
    });
    sel.addEventListener('change', function () { onChange(sel.value || null); });

    return U.h('div', { class: 'flex flex-wrap items-center gap-2' },
      U.h('span', { class: 'flex items-center gap-1.5 text-sm font-bold' }, U.icon('calendarClock'), 'چرخه:'),
      sel);
  }

  // ═══════════ جدول دسکتاپ — هدر sticky + ستون اول sticky — §۱۱ ═══════════

  function buildMatrixTable(matrix, cycleId) {
    var members = matrix.members;
    if (members.length === 0) return U.h('div');

    var relByPair = {};
    var relById = {};
    matrix.relations.forEach(function (r) {
      relById[r.id] = r;
      if (r.isActive) relByPair[r.elementLowId + '|' + r.elementHighId] = r.id;
    });

    // زوج‌های دارای خطا (برای نشانگذاری سلول) — localFailures + tripleIssues
    var failedPairs = {};
    if (matrix.validation) {
      matrix.validation.localFailures.forEach(function (lf) {
        failedPairs[pairKey(lf.pair[0], lf.pair[1])] = true;
      });
      matrix.validation.tripleIssues.forEach(function (ti) {
        var ids = ti.responsibleElementIds || [];
        for (var i = 0; i < ids.length; i++) {
          for (var j = i + 1; j < ids.length; j++) failedPairs[pairKey(ids[i], ids[j])] = true;
        }
      });
    }

    var table = U.h('table', {
      class: 'matrix-table',
      style: { minWidth: Math.max(members.length * 108 + 190, 420) + 'px' },
    });

    var hrow = U.h('tr', null,
      U.h('th', { class: 'mx-corner' }, U.h('span', { class: 'mx-th-name', text: 'عنصر کاری' })));
    members.forEach(function (m) {
      hrow.appendChild(U.h('th', { title: m.name + ' — ' + m.activityName + ' / ' + m.stationName },
        U.h('span', { class: 'mx-th-name', text: m.name })));
    });
    table.appendChild(U.h('thead', null, hrow));

    var tbody = U.h('tbody');
    members.forEach(function (row) {
      var tr = U.h('tr');
      tr.appendChild(U.h('th', { title: row.name + ' — ' + row.activityName + ' / ' + row.stationName },
        U.h('span', { class: 'mx-th-name', text: row.name })));
      members.forEach(function (col) {
        if (row.elementId === col.elementId) {
          // قطر اصلی — خط‌دار و غیرقابل ویرایش (§۱۱)
          tr.appendChild(U.h('td', { class: 'matrix-diagonal', 'aria-label': 'قطر ماتریس' }));
          return;
        }
        var low = row.elementId < col.elementId ? row.elementId : col.elementId;
        var high = row.elementId < col.elementId ? col.elementId : row.elementId;
        var relationId = relByPair[low + '|' + high];
        if (!relationId) {
          tr.appendChild(U.h('td', { class: 'mx-undefined', title: 'رابطه‌ای تعریف نشده است', text: '·' }));
          return;
        }
        var eff = effectiveCell(matrix, relationId);
        var failed = failedPairs[low + '|' + high];
        tr.appendChild(U.h('td', { class: failed ? 'mx-cell-failed' : null },
          U.h('button', {
            class: 'mx-cell-btn' + (eff.isDraft ? ' is-draft' : ''),
            type: 'button',
            'aria-label': 'ویرایش هم‌پوشانی ' + row.name + ' و ' + col.name,
            title: cycleId ? 'ویرایش مقدار' : 'برای ویرایش، ابتدا یک چرخه انتخاب کنید',
            disabled: cycleId ? null : true,
            onclick: function () {
              var cur = openCell;
              openCell = (cur && cur.relationId === relationId && cur.rowId === row.elementId) ? null : { relationId: relationId, rowId: row.elementId };
              rerender();
            },
          }, statusChipEl(eff))));
      });
      tbody.appendChild(tr);
      // ردیف ویرایشگر بازشده — درست زیر ردیفی که سلول آن باز شده است
      if (openCell && openCell.rowId === row.elementId && relById[openCell.relationId] &&
          (relById[openCell.relationId].elementLowId === row.elementId || relById[openCell.relationId].elementHighId === row.elementId)) {
        tbody.appendChild(buildEditorRow(matrix, relById, members.length, openCell.relationId));
      }
    });
    table.appendChild(tbody);

    return U.h('div', { class: 'matrix-table-wrap scroll-slim', dir: 'rtl' }, table);
  }

  function buildEditorRow(matrix, relById, colCount, relationId) {
    var rel = relById[relationId];
    var nameOf = function (id) {
      var m = matrix.members.find(function (x) { return x.elementId === id; });
      return m ? m.name : '؟';
    };
    return U.h('tr', null,
      U.h('td', { class: 'mx-editor-cell', colspan: colCount + 1 },
        buildCellEditor(relationId, nameOf(rel.elementLowId), nameOf(rel.elementHighId), effectiveCell(matrix, relationId))));
  }

  /** ویرایشگر سلول — سه گزینه + مقدار + نگه‌داری/بازگردانی (§۴.۴) — مشترک دسکتاپ/موبایل */
  function buildCellEditor(relationId, aName, bName, eff) {
    var RADIO_OPTIONS = [
      { value: 'UNREVIEWED', label: 'بررسی‌نشده', icon: 'circleHelp', color: 'var(--muted-foreground)' },
      { value: 'NO_OVERLAP', label: 'بدون هم‌پوشانی', icon: 'ban', color: 'var(--green)' },
      { value: 'OVERLAP', label: 'دارای هم‌پوشانی', icon: 'layers', color: 'var(--brand)' },
    ];
    var radios = U.h('div', { class: 'mx-editor-radios' },
      U.h('p', { class: 'text-xs text-muted' }, aName + ' ↔ ' + bName));
    RADIO_OPTIONS.forEach(function (o) {
      var selected = eff.status === o.value;
      var radio = U.h('label', { class: 'mx-radio' + (selected ? ' selected' : '') },
        U.h('input', { type: 'radio', name: 'mx-radio-' + relationId, checked: selected, style: { accentColor: 'var(--brand)' } }),
        U.h('span', { class: 'flex items-center gap-1.5' },
          U.h('span', { style: { color: o.color, display: 'inline-flex' } }, U.icon(o.icon)),
          o.label));
      radio.querySelector('input').addEventListener('change', function () {
        setDraft(relationId, {
          status: o.value,
          overlapDuration: o.value === 'OVERLAP' ? eff.overlapDuration : null,
        });
      });
      radios.appendChild(radio);
    });

    var side = U.h('div', { class: 'mx-editor-side' });
    if (eff.status === 'OVERLAP') {
      var numInput = UI.persianNumberInput({
        value: eff.overlapDuration,
        min: 0.001,
        ariaLabel: 'مدت هم‌پوشانی ' + aName + ' و ' + bName + ' (ثانیه)',
        onChange: function (n) { setDraft(relationId, { status: 'OVERLAP', overlapDuration: n }); },
      });
      var realInput = numInput.tagName === 'INPUT' ? numInput : numInput.querySelector('input');
      if (realInput) realInput.setAttribute('data-mx-focus', 'ov-' + relationId);
      side.appendChild(UI.field('مدت هم‌پوشانی (ثانیه)', numInput));
    }
    side.appendChild(U.h('p', {
      class: 'text-xs text-muted leading-relaxed',
      text: 'مقدار فقط برای چرخهٔ انتخاب‌شده ثبت می‌شود. پس از «ثبت تغییرات» نوار بالا، اعتبارسنجی و هم‌پوشانی چندتایی مجدداً محاسبه می‌شود.',
    }));
    side.appendChild(U.h('div', { class: 'flex items-center justify-between gap-2' },
      U.h('button', {
        class: 'btn btn-ghost btn-sm', type: 'button', text: 'بازگردانی سلول',
        disabled: !eff.isDraft ? true : null,
        onclick: function () { setDraft(relationId, null); },
      }),
      U.h('button', {
        class: 'btn btn-brand btn-sm', type: 'button',
        disabled: !eff.isDraft ? true : null,
        onclick: function () { openCell = null; openPair = null; rerender(); },
      }, U.icon('pencil'), 'نگه‌داری تغییر')));

    return U.h('div', { class: 'mx-editor' }, radios, side);
  }

  // ═══════════ لیست زوج‌ها (موبایل) — §۱۱ ═══════════

  function buildPairList(matrix, cycleId) {
    var nameOf = function (id) { return matrix.members.find(function (m) { return m.elementId === id; }); };
    var activeRelations = matrix.relations.filter(function (r) { return r.isActive; });
    var ul = U.h('ul', { class: 'list-none flex flex-col gap-2' });
    activeRelations.forEach(function (r) {
      var a = nameOf(r.elementLowId);
      var b = nameOf(r.elementHighId);
      var eff = effectiveCell(matrix, r.id);
      var isOpen = openPair === r.id;
      var card = U.h('li', { class: 'mx-pair-card' },
        U.h('button', {
          class: 'mx-pair-head', type: 'button',
          'aria-expanded': isOpen ? 'true' : 'false',
          onclick: function () { openPair = isOpen ? null : r.id; rerender(); },
        },
          U.h('span', { class: 'min-w-0 flex-1' },
            U.h('span', { class: 'block truncate text-sm font-bold' },
              (a ? a.name : '؟') + ' ↔ ' + (b ? b.name : '؟')),
            U.h('span', { class: 'block truncate text-xs text-muted' },
              (a ? a.activityName : '؟') + ' / ' + (a ? a.stationName : '؟') + ' — ' +
              (b ? b.activityName : '؟') + ' / ' + (b ? b.stationName : '؟'))),
          U.h('span', { class: 'shrink-0' }, statusChipEl(eff, true))));
      if (isOpen) {
        if (cycleId) {
          card.appendChild(U.h('div', { class: 'mx-pair-expand' },
            buildCellEditor(r.id, a ? a.name : '؟', b ? b.name : '؟', eff)));
        } else {
          card.appendChild(U.h('p', {
            class: 'text-xs text-muted',
            style: { marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--border)' },
            text: 'برای ویرایش مقدار، ابتدا یک چرخه انتخاب کنید.',
          }));
        }
      }
      ul.appendChild(card);
    });
    return ul;
  }

  // ═══════════ ثبت پیش‌نویس‌ها — خط کامل اعتبارسنجی + پیام‌ها (§۱۰) ═══════════

  function commitDrafts(matrix, cycleId) {
    if (!cycleId) return;
    var keys = Object.keys(drafts);
    if (keys.length === 0) return;
    var updates = keys.map(function (rid) {
      var d = drafts[rid];
      var cell = matrix.cells[rid];
      return {
        relationId: rid,
        status: d.status,
        overlapDuration: d.status === 'NO_OVERLAP' ? 0 : (d.status === 'UNREVIEWED' ? null : d.overlapDuration),
        expectedVersion: cell ? cell.version : undefined,
      };
    });
    try {
      var res = DB.setCycleOverlaps(cycleId, updates);
      resetInteractionState();
      UI.toast('تغییرات هم‌پوشانی ثبت شد',
        res.warnings.length > 0 ? {} : { description: 'فرم هر دو عنصر و ماتریس از همان منبع به‌روز شد.' });
      res.warnings.forEach(function (w) {
        UI.toast('هشدار — نتیجه موقتی است', { type: 'warning', description: w });
      });
      rerender();
    } catch (err) {
      // همهٔ دلایل قطعی نمایش داده می‌شود؛ پیش‌نویس‌ها حفظ می‌شوند (§۴.۴)
      UI.toast('ثبت تغییرات ممکن نیست', {
        type: 'error',
        description: (err && err.message) ? err.message : 'ثبت تغییرات ناموفق بود',
      });
    }
  }

  // ═══════════ پنل اعتبارسنجی و محاسبات وابسته — §۶/§۷/§۸ ═══════════

  function buildValidationPanel(matrix) {
    if (!matrix.validation || !matrix.selectedCycle) return null;
    var v = matrix.validation;
    var nameOf = function (id) {
      var m = matrix.members.find(function (x) { return x.elementId === id; });
      return m ? m.name : id;
    };

    var verdictBadge;
    if (v.verdict === 'VALID') {
      verdictBadge = UI.badge('داده‌های تأییدشدهٔ این چرخه سازگارند', 'green', 'checkCircle');
    } else if (v.verdict === 'INVALID') {
      verdictBadge = UI.badge('داده‌های ناسازگار — تأیید نهایی مسدود است', 'red', 'alertTriangle');
    } else {
      verdictBadge = UI.badge('نامعین — داده کامل نیست', 'amber', 'circleHelp');
    }

    var hasAny =
      v.localFailures.length > 0 || v.tripleIssues.length > 0 || v.globalIssues.length > 0 ||
      v.provisionalWarnings.length > 0 || v.multiOverlaps.length > 0 || v.unions.length > 0;
    if (!hasAny) return U.h('div', { class: 'flex justify-center' }, verdictBadge);

    var panel = U.h('div', { class: 'mx-validation flex flex-col gap-3' },
      U.h('div', { class: 'flex flex-wrap items-center justify-between gap-2' },
        U.h('p', { class: 'text-sm font-bold', text: 'اعتبارسنجی و محاسبات وابسته (چرخهٔ انتخاب‌شده)' }),
        verdictBadge));

    // خطاهای قطعی — مسدودکننده (§۸.۱)
    if (v.localFailures.length > 0 || v.tripleIssues.length > 0 || v.globalIssues.length > 0) {
      var definite = U.h('ul', { class: 'list-none flex flex-col gap-1.5' });
      v.localFailures.forEach(function (lf) {
        lf.failures.forEach(function (f) {
          definite.appendChild(U.h('li', { class: 'mx-issue-red' },
            U.h('b', { text: lf.pairLabel + ': ' }), f.message));
        });
      });
      v.tripleIssues.forEach(function (t) {
        definite.appendChild(U.h('li', { class: 'mx-issue-red', text: t.message }));
      });
      v.globalIssues.forEach(function (gi) {
        definite.appendChild(U.h('li', { class: 'mx-issue-red', text: gi.message }));
      });
      panel.appendChild(definite);
    }

    // هشدارهای موقتی (§۸.۲)
    if (v.provisionalWarnings.length > 0) {
      var warnings = U.h('ul', { class: 'list-none flex flex-col gap-1.5' });
      v.provisionalWarnings.forEach(function (w) {
        warnings.appendChild(U.h('li', { class: 'mx-issue-amber' }, U.icon('alertTriangle'),
          U.h('span', { text: w.message })));
      });
      panel.appendChild(warnings);
    }

    // هم‌پوشانی چندتایی هر مجموعه (§۶.۳)
    if (v.multiOverlaps.length > 0) {
      var moList = U.h('ul', { class: 'list-none grid grid-cols-1 sm:grid-cols-2 gap-1.5' });
      v.multiOverlaps.forEach(function (m) {
        var body = U.h('span', { class: 'mx-mo-members', title: m.memberNames.join(' + ') },
          m.memberNames.map(function (id) { return nameOf(id); }).join(' + '));
        moList.appendChild(U.h('li', { class: 'mx-mo-item' },
          body,
          m.value == null
            ? U.h('span', { class: 'text-muted', text: 'دادهٔ کافی نیست' })
            : U.h('span', { class: 'mx-val', dir: 'ltr' }, U.formatTimeValue(m.value), U.h('span', { class: 'mx-unit', text: ' s' })),
          m.provisional ? U.h('span', { class: 'mx-chip-provisional', text: 'موقتی — روابط بررسی‌نشده دارد' }) : null));
      });
      panel.appendChild(U.h('div', { class: 'flex flex-col gap-1.5' },
        U.h('p', { class: 'flex items-center gap-1 text-xs font-bold' },
          U.h('span', { style: { color: 'var(--brand)', display: 'inline-flex' } }, U.icon('layers')),
          'هم‌پوشانی چندتایی (کمینهٔ زوج‌های هر مجموعه)'),
        moList));
    }

    // زمان سپری‌شدهٔ مجموعه‌ها (§۶.۴)
    if (v.unions.length > 0) {
      var unList = U.h('ul', { class: 'list-none grid grid-cols-1 sm:grid-cols-2 gap-1.5' });
      v.unions.forEach(function (u) {
        var body = U.h('span', { class: 'mx-mo-members', title: u.memberNames.join(' + ') },
          u.memberNames.map(function (id) { return nameOf(id); }).join(' + '));
        unList.appendChild(U.h('li', { class: 'mx-mo-item' },
          body,
          u.value == null
            ? U.h('span', { class: 'text-muted', text: 'قابل محاسبه نیست — بازهٔ شروع/پایان کافی ثبت نشده است' })
            : U.h('span', { class: 'mx-val', dir: 'ltr' }, U.formatTimeValue(u.value), U.h('span', { class: 'mx-unit', text: ' s' }))));
      });
      panel.appendChild(U.h('div', { class: 'flex flex-col gap-1.5' },
        U.h('p', { class: 'flex items-center gap-1 text-xs font-bold' },
          U.h('span', { style: { color: 'var(--brand)', display: 'inline-flex' } }, U.icon('timer')),
          'زمان سپری‌شدهٔ مجموعه‌ها (اجتماع بازه‌ها)'),
        unList));
    }

    return panel;
  }

  // ═══════════ روابط آرشیوشده — بازگردانی ═══════════

  function buildArchivedRelations(matrix) {
    var archived = matrix.relations.filter(function (r) { return !r.isActive; });
    if (archived.length === 0) return null;
    // عناصر آرشیوشده ممکن است عضو فعال ماتریس نباشند → از کاتالوگ کامل
    var nameOf = function (id) {
      var e = matrix.elementsCatalog.find(function (x) { return x.elementId === id; });
      return e ? e.name : '؟';
    };
    var details = U.h('details', { class: 'mx-archived' },
      U.h('summary', null, 'روابط آرشیوشده (' + U.formatInt(archived.length) + ')'));
    var ul = U.h('ul', { class: 'list-none flex flex-col gap-1.5', style: { marginTop: '8px' } });
    archived.forEach(function (r) {
      ul.appendChild(U.h('li', { class: 'mx-archived-row' },
        U.h('span', { class: 'text-muted truncate', text: nameOf(r.elementLowId) + ' ↔ ' + nameOf(r.elementHighId) }),
        U.h('button', {
          class: 'btn btn-outline btn-sm', type: 'button', text: 'بازگردانی',
          onclick: function () {
            try {
              DB.restoreOverlapRelation(r.id);
              UI.toast('رابطه بازگردانی شد', { description: 'مقادیر تاریخی چرخه‌های قبلی همین رابطه حفظ شده و دوباره فعال شد.' });
              rerender();
            } catch (err) { UI.toastError(err); }
          },
        })));
    });
    details.appendChild(ul);
    return details;
  }

  // ═══════════ انتخاب‌گر عنصر کاری — جست‌وجو + گروه‌بندی ایستگاه/فعالیت (§۴.۳/§۱۱) ═══════════

  function buildElementPicker(opts) {
    var catalog = opts.catalog;
    var open = false;
    var search = '';
    var scrollEl = null; // ظرف فهرست عناصر — توسط buildList ساخته می‌شود
    var wrap = U.h('div', { class: 'mx-picker' });

    function draw() {
      U.clear(wrap);
      var selId = opts.selectedId();
      var sel = null;
      for (var i = 0; i < catalog.length; i++) {
        if (catalog[i].elementId === selId) { sel = catalog[i]; break; }
      }
      var btn = U.h('button', {
        class: 'btn mx-picker-btn', type: 'button',
        'aria-expanded': open ? 'true' : 'false',
        onclick: function () { open = !open; draw(); },
      },
        sel
          ? U.h('span', { class: 'mx-picker-label' },
              U.h('span', { class: 'truncate', style: { fontWeight: 600 }, text: sel.name }),
              U.h('span', { class: 'truncate text-xs text-muted', text: sel.activityName + ' / ' + sel.stationName }))
          : U.h('span', { class: 'truncate text-muted', text: 'جست‌وجوی عنصر کاری…' }),
        U.icon('chevronsUpDown'));
      wrap.appendChild(btn);
      if (open) wrap.appendChild(buildList());
    }

    function buildList() {
      var listCard = U.h('div', { class: 'mx-picker-list' });
      var input = U.h('input', {
        class: 'input', placeholder: 'نام عنصر، فعالیت یا ایستگاه…',
        'aria-label': 'جست‌وجوی عنصر کاری',
        style: { borderRadius: '0', border: 'none', borderBottom: '1px solid var(--border)', background: 'var(--card)' },
      });
      scrollEl = U.h('div', { class: 'mx-picker-scroll scroll-slim' });
      input.addEventListener('input', function () { search = input.value; drawItems(); });
      listCard.appendChild(input);
      listCard.appendChild(scrollEl);
      drawItems();
      setTimeout(function () { input.focus(); }, 30);
      return listCard;
    }

    function drawItems() {
      if (!scrollEl) return;
      U.clear(scrollEl);
      var q = U.normalizeDigits(search || '').trim().toLowerCase();
      // گروه‌بندی بر اساس ایستگاه → فعالیت برای تشخیص نام‌های مشابه (§۱۱)
      var stations = [];
      var byStation = {};
      catalog.forEach(function (e) {
        if (opts.excludeId && e.elementId === opts.excludeId()) return;
        if (!byStation[e.stationName]) { byStation[e.stationName] = {}; stations.push(e.stationName); }
        if (!byStation[e.stationName][e.activityName]) byStation[e.stationName][e.activityName] = [];
        byStation[e.stationName][e.activityName].push(e);
      });
      var count = 0;
      stations.forEach(function (stationName) {
        var activityNames = Object.keys(byStation[stationName]);
        activityNames.forEach(function (activityName) {
          var elements = byStation[stationName][activityName];
          var matched = elements.filter(function (e) {
            if (!q) return true;
            return (e.name + ' ' + activityName + ' ' + stationName).toLowerCase().indexOf(q) >= 0;
          });
          if (matched.length === 0) return;
          scrollEl.appendChild(U.h('div', { class: 'mx-picker-group' },
            U.icon('factory'), stationName,
            U.h('span', { class: 'text-faint' }, ' — ' + activityName)));
          matched.forEach(function (e) {
            count++;
            var isSel = opts.selectedId() === e.elementId;
            scrollEl.appendChild(U.h('button', {
              class: 'mx-picker-item' + (isSel ? ' selected' : ''), type: 'button',
              onclick: function () {
                open = false;
                opts.onPick(isSel ? null : e.elementId);
              },
            }, U.icon('check'), e.name));
          });
        });
      });
      if (count === 0) scrollEl.appendChild(U.h('p', { class: 'mx-picker-empty', text: 'عنصری یافت نشد.' }));
    }

    draw();
    return wrap;
  }

  // ═══════════ دیالوگ افزودن رابطهٔ موازی + تأیید دو مرحله‌ای (§۴.۳/§۴.۴) ═══════════

  function openAddRelationDialog(projectId, matrix) {
    var catalog = matrix ? matrix.elementsCatalog : [];
    var aId = null;
    var bId = null;
    var continueBtn = null;
    var bodyEl = null;

    function nameOf(id) {
      var e = catalog.find(function (c) { return c.elementId === id; });
      return e ? e.name : '؟';
    }
    function sync() {
      if (continueBtn) continueBtn.disabled = !(aId && bId && aId !== bId);
    }
    function draw() {
      if (!bodyEl) return;
      U.clear(bodyEl);
      bodyEl.appendChild(U.h('div', { class: 'flex flex-col gap-3' },
        U.h('div', { class: 'flex flex-col gap-1.5' },
          U.h('p', { class: 'text-sm font-bold', text: 'عنصر اول' }),
          buildElementPicker({
            catalog: catalog,
            selectedId: function () { return aId; },
            excludeId: function () { return bId; },
            onPick: function (id) { aId = id; sync(); draw(); },
          })),
        U.h('div', { class: 'flex flex-col gap-1.5' },
          U.h('p', { class: 'text-sm font-bold', text: 'عنصر دوم' }),
          buildElementPicker({
            catalog: catalog,
            selectedId: function () { return bId; },
            excludeId: function () { return aId; },
            onPick: function (id) { bId = id; sync(); draw(); },
          }))));
    }

    var dlg = UI.dialog({
      title: 'افزودن رابطهٔ موازی',
      desc: 'دو عنصر کاری که هم‌زمان اجرا می‌شوند را انتخاب کنید. رابطه در ساختار پروژه پایدار است و با تغییر نام عنصر از بین نمی‌رود.',
      bodyBuilder: function (body) { bodyEl = body; draw(); },
      footerBuilder: function (close) {
        continueBtn = U.h('button', {
          class: 'btn btn-brand', type: 'button', text: 'ادامه',
          disabled: !(aId && bId && aId !== bId) ? true : null,
          onclick: function () { confirmStep(close); },
        });
        return U.h('div', { class: 'dialog-footer' },
          U.h('button', { class: 'btn', type: 'button', text: 'انصراف', onclick: close }),
          U.h('div', { class: 'spacer' }),
          continueBtn);
      },
    });

    /* تأییدیه با نام دو عنصر و اثر عملیات — §۴.۴ */
    function confirmStep(closeMain) {
      var aName = nameOf(aId);
      var bName = nameOf(bId);
      UI.dialog({
        title: 'تأیید افزودن رابطهٔ موازی',
        desc: 'با افزودن رابطهٔ موازی «' + aName + '» و «' + bName + '»، این رابطه در ماتریس مرکزی و فرم زمان‌سنجی هر دو عنصر نمایش داده می‌شود. ادامه می‌دهید؟',
        dismissable: false,
        footerBuilder: function (close) {
          return U.h('div', { class: 'dialog-footer' },
            U.h('button', { class: 'btn', type: 'button', text: 'انصراف', onclick: close }),
            U.h('div', { class: 'spacer' }),
            U.h('button', {
              class: 'btn btn-brand', type: 'button', text: 'افزودن رابطه',
              onclick: function () {
                try {
                  DB.createOverlapRelation(projectId, aId, bId);
                  close();
                  closeMain();
                  UI.toast('رابطهٔ موازی «' + aName + ' ↔ ' + bName + '» افزوده شد', {
                    description: 'این رابطه در ماتریس مرکزی و فرم زمان‌سنجی هر دو عنصر نمایش داده می‌شود.',
                  });
                  rerender();
                } catch (err) { UI.toastError(err); }
              },
            }));
        },
      });
    }
    return dlg;
  }

  // ═══════════════════════════════════════════════════════════
  // بخش «عناصر موازی و اطلاعات هم‌پوشانی» — مشترک بین دیالوگ عنصر
  // (views-structure.js) و استفاده‌های بعدی — منبع داده: سرویس مرکزی (§۴.۲)
  // امضا: (container, projectId, elementId, elementName)
  // ═══════════════════════════════════════════════════════════

  g.T2VIEWS._parallelRelationsSection = function (container, projectId, elementId, elementName) {
    var sectionEl = U.h('section', {
      class: 'mx-parallel-section flex flex-col gap-3',
      'aria-label': 'عناصر موازی و اطلاعات هم‌پوشانی «' + elementName + '»',
    });
    container.appendChild(sectionEl);

    var addOpen = false;

    function draw() {
      var data;
      try {
        data = DB.getElementRelations(elementId);
      } catch (err) {
        U.clear(sectionEl);
        sectionEl.appendChild(U.h('div', { class: 'banner error' }, U.icon('alertTriangle'),
          U.h('div', null, (err && err.message) ? err.message : 'خطا در واکشی روابط')));
        return;
      }
      U.clear(sectionEl);
      var rows = data.rows.filter(function (r) { return r.isActive; });

      // سربرگ — مشاهده در ماتریس + افزودن عنصر موازی
      sectionEl.appendChild(U.h('div', { class: 'flex flex-wrap items-center justify-between gap-2' },
        U.h('p', { class: 'flex items-center gap-1.5 text-sm font-bold' },
          U.h('span', { style: { color: 'var(--brand)', display: 'inline-flex' } }, U.icon('network')),
          'عناصر موازی و اطلاعات هم‌پوشانی'),
        U.h('div', { class: 'flex items-center gap-1.5' },
          U.h('button', {
            class: 'btn btn-outline btn-sm', type: 'button', text: 'مشاهده در ماتریس',
            onclick: function () { appNavigate('/p/' + projectId + '/matrix'); },
          }),
          U.h('button', {
            class: 'btn btn-brand btn-sm', type: 'button',
            onclick: function () { addOpen = !addOpen; draw(); },
          }, U.icon('plus'), 'عنصر موازی'))));

      if (rows.length === 0) {
        sectionEl.appendChild(U.h('p', {
          class: 'text-xs text-muted leading-relaxed',
          text: 'برای «' + elementName + '» رابطهٔ موازی ثبت نشده است. اگر عنصر دیگری هم‌زمان با آن اجرا می‌شود، آن را اضافه کنید تا در ماتریس هم‌پوشانی و مقدار هر چرخه قابل ثبت شود.',
        }));
      } else {
        var ul = U.h('ul', { class: 'list-none flex flex-col gap-1.5' });
        rows.forEach(function (r) { ul.appendChild(buildRow(r)); });
        sectionEl.appendChild(ul);
      }

      if (addOpen) sectionEl.appendChild(buildInlineAdd());
    }

    /** ردیف یک رابطهٔ فعال — آخرین مقدار + ثبت مقدار + حذف رابطه */
    function buildRow(r) {
      var editing = false;
      var confirmDel = false;
      var li = U.h('li', { class: 'mx-parallel-row' });

      function drawRow() {
        U.clear(li);
        var latestBlock;
        if (r.latest) {
          var chip;
          if (r.latest.status === 'UNREVIEWED') {
            chip = U.h('span', { class: 'mx-chip unreviewed', text: STATUS_LABEL.UNREVIEWED });
          } else if (r.latest.status === 'NO_OVERLAP') {
            chip = U.h('span', { class: 'mx-chip no-overlap', text: STATUS_LABEL.NO_OVERLAP });
          } else {
            chip = U.h('span', { class: 'mx-val text-xs', dir: 'ltr' },
              U.formatTimeValue(r.latest.overlapDuration), U.h('span', { class: 'mx-unit', text: ' s' }));
          }
          latestBlock = U.h('span', { class: 'flex flex-col items-end gap-1 shrink-0' },
            chip,
            U.h('span', { class: 'text-muted', style: { fontSize: '10px' } },
              'آخرین ثبت: چرخهٔ ' + U.formatInt(r.latest.cycleNo) + ' — ' + r.latest.operatorName + ' — ' + r.latest.activityName));
        } else {
          latestBlock = U.h('span', { class: 'text-muted shrink-0', style: { fontSize: '10px' }, text: 'هنوز مقداری ثبت نشده است' });
        }

        li.appendChild(U.h('div', { class: 'flex flex-wrap items-center justify-between gap-2' },
          U.h('div', { class: 'min-w-0 flex-1' },
            U.h('p', { class: 'truncate text-sm font-bold', text: r.otherElementName }),
            U.h('p', { class: 'truncate text-xs text-muted', text: r.otherActivityName + ' / ' + r.otherStationName })),
          latestBlock));

        li.appendChild(U.h('div', { class: 'flex flex-wrap gap-1.5', style: { marginTop: '8px' } },
          U.h('button', {
            class: 'btn btn-outline btn-sm', type: 'button',
            onclick: function () { editing = !editing; confirmDel = false; drawRow(); },
          }, U.icon('pencil'), 'ثبت مقدار'),
          U.h('button', {
            class: 'btn btn-ghost btn-sm', type: 'button', style: { color: 'var(--red)' },
            onclick: function () { confirmDel = !confirmDel; editing = false; drawRow(); },
          }, U.icon('trash'), 'حذف رابطه')));

        if (editing) li.appendChild(buildQuickEditor(r));
        if (confirmDel) {
          var pairLabel = elementName + ' ↔ ' + r.otherElementName;
          li.appendChild(U.h('div', { class: 'mx-confirm-red flex flex-col gap-2', style: { marginTop: '8px' } },
            U.h('p', { text: 'رابطهٔ ' + pairLabel + ' از فرم هر دو عنصر و ماتریس فعال خارج می‌شود؛ اطلاعات تاریخی آن حفظ خواهد شد. ادامه می‌دهید؟' }),
            U.h('div', { class: 'flex justify-end gap-2' },
              U.h('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: 'انصراف', onclick: function () { confirmDel = false; drawRow(); } }),
              U.h('button', {
                class: 'btn btn-destructive btn-sm', type: 'button', text: 'بله، حذف کن',
                onclick: function () {
                  try {
                    DB.archiveOverlapRelation(r.relationId);
                    UI.toast('رابطه آرشیو شد', {
                      description: 'اطلاعات تاریخی آن حفظ خواهد شد و از بخش «روابط آرشیوشده» ماتریس قابل بازگردانی است.',
                    });
                    draw();
                  } catch (err) { UI.toastError(err); }
                },
              }))));
        }
      }

      drawRow();
      return li;
    }

    /** ویرایش سریع مقدار یک رابطه برای یک چرخه — با تأیید اثرات (§۴.۴) */
    function buildQuickEditor(r) {
      var box = U.h('div', { class: 'mx-quick-editor flex flex-col gap-2.5', style: { marginTop: '8px' } });
      var cycles = [];
      try {
        cycles = DB.getOverlapMatrix(projectId, null).cycles;
      } catch (e) { cycles = []; }
      if (cycles.length === 0) {
        box.appendChild(U.h('p', { class: 'text-xs text-muted', text: 'چرخه‌ای برای ثبت وجود ندارد؛ ابتدا در زمان‌سنجی داده ثبت کنید.' }));
        return box;
      }

      // پیش‌فرض: آخرین چرخهٔ دارای مقدار، وگرنه آخرین چرخهٔ پروژه
      var cycleId = null;
      if (r.latest && cycles.some(function (c) { return c.cycleId === r.latest.cycleId; })) cycleId = r.latest.cycleId;
      else cycleId = cycles[cycles.length - 1].cycleId;
      var status = 'UNREVIEWED';
      var duration = null;
      var confirming = false;

      var sel = U.h('select', { class: 'select', 'aria-label': 'انتخاب چرخه' });
      var sessionIds = [];
      var bySession = {};
      cycles.forEach(function (c) {
        if (!bySession[c.sessionId]) {
          bySession[c.sessionId] = { label: c.activityName + ' — ' + c.operatorName, cycles: [] };
          sessionIds.push(c.sessionId);
        }
        bySession[c.sessionId].cycles.push(c);
      });
      sessionIds.forEach(function (sid) {
        var s = bySession[sid];
        var og = U.h('optgroup', { label: s.label });
        s.cycles.forEach(function (c) {
          var opt = U.h('option', { value: c.cycleId },
            'چرخهٔ ' + U.formatInt(c.cycleNo) + ' — ' + c.operatorName + ' — ' + c.activityName);
          if (cycleId === c.cycleId) opt.selected = true;
          og.appendChild(opt);
        });
        sel.appendChild(og);
      });
      sel.addEventListener('change', function () { cycleId = sel.value || null; sync(); });

      var saveBtn = U.h('button', { class: 'btn btn-brand btn-sm', type: 'button', text: 'ثبت تغییر', onclick: function () { confirming = true; drawEditor(); } });
      var confirmWrap = U.h('div');

      var RADIO_OPTIONS = [
        { value: 'UNREVIEWED', label: 'بررسی‌نشده' },
        { value: 'NO_OVERLAP', label: 'بدون هم‌پوشانی (تأیید صفر)' },
        { value: 'OVERLAP', label: 'دارای هم‌پوشانی' },
      ];
      var radiosWrap = U.h('div', { class: 'flex flex-col gap-1.5' });
      RADIO_OPTIONS.forEach(function (o) {
        var radio = U.h('label', { class: 'mx-radio' },
          U.h('input', { type: 'radio', name: 'mxq-' + r.relationId, checked: status === o.value, style: { accentColor: 'var(--brand)' } }),
          U.h('span', { text: o.label }));
        radio.querySelector('input').addEventListener('change', function () {
          status = o.value;
          radiosWrap.querySelectorAll('.mx-radio').forEach(function (x) { x.classList.remove('selected'); });
          radio.classList.add('selected');
          sync();
        });
        radiosWrap.appendChild(radio);
      });

      var valueWrap = U.h('div');

      function sync() {
        drawValue();
        saveBtn.disabled = !cycleId || (status === 'OVERLAP' && (duration === null || isNaN(duration) || duration <= 0));
      }
      function drawValue() {
        U.clear(valueWrap);
        if (status === 'OVERLAP') {
          valueWrap.appendChild(UI.field('مدت (ثانیه)', UI.persianNumberInput({
            value: duration,
            min: 0.001,
            ariaLabel: 'مدت هم‌پوشانی ' + elementName + ' و ' + r.otherElementName + ' (ثانیه)',
            onChange: function (n) { duration = n; saveBtn.disabled = !cycleId || (status === 'OVERLAP' && (duration === null || isNaN(duration) || duration <= 0)); },
          })));
        }
      }

      function drawEditor() {
        U.clear(box);
        box.appendChild(U.h('div', { class: 'flex flex-col gap-1' },
          U.h('label', { class: 'field-label', style: { marginBottom: 0 }, text: 'چرخه' }),
          sel));
        box.appendChild(radiosWrap);
        box.appendChild(valueWrap);
        box.appendChild(U.h('div', { class: 'flex justify-end gap-2' }, saveBtn));
        if (confirming) {
          U.clear(confirmWrap);
          confirmWrap.appendChild(U.h('div', { class: 'mx-confirm-brand flex flex-col gap-2' },
            U.h('p', { text: 'تغییر مدت هم‌پوشانی ' + elementName + ' ↔ ' + r.otherElementName + ' بر هم‌پوشانی چندتایی، اعتبارسنجی و نتایج محاسباتی اثر می‌گذارد. ثبت شود؟' }),
            U.h('div', { class: 'flex justify-end gap-2' },
              U.h('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: 'بازگشت', onclick: function () { confirming = false; drawEditor(); } }),
              U.h('button', {
                class: 'btn btn-brand btn-sm', type: 'button', text: 'بله، ثبت کن',
                onclick: function () {
                  try {
                    var res = DB.setCycleOverlaps(cycleId, [{
                      relationId: r.relationId,
                      status: status,
                      overlapDuration: status === 'OVERLAP' ? duration : (status === 'NO_OVERLAP' ? 0 : null),
                    }]);
                    UI.toast('مقدار هم‌پوشانی ثبت شد', { description: 'فرم عنصر مقابل و ماتریس مرکزی هم‌زمان به‌روز شدند.' });
                    res.warnings.forEach(function (w) {
                      UI.toast('هشدار — نتیجه موقتی است', { type: 'warning', description: w });
                    });
                    draw();
                  } catch (err) { UI.toastError(err); }
                },
              }))));
          box.appendChild(confirmWrap);
        }
        sync();
      }

      drawEditor();
      return box;
    }

    /** افزودن رابطهٔ موازی از فرم — خود عنصر جاری در فهرست نیست (§۴.۱) */
    function buildInlineAdd() {
      var box = U.h('div', { class: 'mx-quick-editor flex flex-col gap-2' });
      var selected = null;
      var confirming = false;
      var catalog = [];
      try {
        catalog = DB.getOverlapMatrix(projectId, null).elementsCatalog;
      } catch (e) { catalog = []; }

      function nameOf(id) {
        var e = catalog.find(function (c) { return c.elementId === id; });
        return e ? e.name : '؟';
      }

      function drawAdd() {
        U.clear(box);
        box.appendChild(U.h('p', { class: 'text-xs', text: 'عنصر موازی «' + elementName + '» را انتخاب کنید:' }));
        box.appendChild(buildElementPicker({
          catalog: catalog,
          selectedId: function () { return selected; },
          excludeId: function () { return elementId; },
          onPick: function (id) { selected = id; drawAdd(); },
        }));
        box.appendChild(U.h('div', { class: 'flex justify-end gap-2' },
          U.h('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: 'انصراف', onclick: function () { addOpen = false; draw(); } }),
          U.h('button', {
            class: 'btn btn-brand btn-sm', type: 'button', text: 'ادامه',
            disabled: !selected ? true : null,
            onclick: function () { confirming = true; drawAdd(); },
          })));
        if (confirming) {
          box.appendChild(U.h('div', { class: 'mx-confirm-brand flex flex-col gap-2' },
            U.h('p', { text: 'با افزودن رابطهٔ موازی «' + elementName + '» و «' + nameOf(selected) + '»، این رابطه در ماتریس مرکزی و فرم زمان‌سنجی هر دو عنصر نمایش داده می‌شود. ادامه می‌دهید؟' }),
            U.h('div', { class: 'flex justify-end gap-2' },
              U.h('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: 'بازگشت', onclick: function () { confirming = false; drawAdd(); } }),
              U.h('button', {
                class: 'btn btn-brand btn-sm', type: 'button', text: 'افزودن',
                onclick: function () {
                  try {
                    DB.createOverlapRelation(projectId, elementId, selected);
                    UI.toast('رابطهٔ موازی افزوده شد', {
                      description: 'این رابطه در فرم هر دو عنصر و ماتریس مرکزی نمایش داده می‌شود.',
                    });
                    addOpen = false;
                    draw();
                  } catch (err) { UI.toastError(err); }
                },
              }))));
        }
      }

      drawAdd();
      return box;
    }

    draw();
    return sectionEl;
  };
})(typeof window !== 'undefined' ? window : globalThis);
