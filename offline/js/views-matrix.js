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
  // چرخهٔ انتخاب‌شده در طول جلسه (بدون localStorage) per پروژه حفظ می‌شود.
  // v1.5.0 §۱۱ — ماتریس فقط‌خواندنی است: پیش‌نویس/ویرایشگر حذف شد؛
  // ثبت مقدار فقط در برگهٔ زمان‌سنجی (زیرردیف رابطه) انجام می‌شود.
  var _cycleByProject = {};
  var rootContainer = null;
  var rootProjectId = null;

  function resetInteractionState() { }

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

    // زوج‌های دارای خطا (برای نشانگذاری سلول) — localFailures + tripleIssues + intervalIssues قطعی
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
      (matrix.validation.intervalIssues || []).forEach(function (ii) {
        if (ii.kind === 'DEFINITE') failedPairs[pairKey(ii.pair[0], ii.pair[1])] = true;
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
        // §۵ ممیزی جلسه ۲ — زوج غیرقابل‌مقایسه در چرخهٔ انتخاب‌شده
        var comparable = !cycleId || !matrix.comparability || !matrix.comparability[relationId] || matrix.comparability[relationId].isComparable !== false;
        var notComparableReason = (matrix.comparability && matrix.comparability[relationId] && matrix.comparability[relationId].notComparableReason) || null;
        // v1.5.0 §۱۱ — فقط‌خواندنی: هیچ دکمهٔ ویرایش/ورودی عددی وجود ندارد
        tr.appendChild(U.h('td', { class: failed ? 'mx-cell-failed' : null },
          U.h('span', {
            class: 'mx-cell-static',
            title: !cycleId
              ? 'برای مشاهدهٔ مقدار، یک چرخه انتخاب کنید — ثبت مقدار در برگهٔ زمان‌سنجی انجام می‌شود'
              : !comparable
                ? notComparableReason || 'در این چرخه قابل‌مقایسه نیست'
                : 'ثبت و ویرایش مقدار در برگهٔ زمان‌سنجی (زیرردیف رابطه) انجام می‌شود',
            'aria-disabled': 'true',
          }, !cycleId
            ? U.h('span', { class: 'text-faint', text: '—' })
            : comparable
              ? statusChipEl(eff)
              : U.h('span', { class: 'mx-chip not-comparable', text: 'غیرقابل‌مقایسه' }))));
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);

    return U.h('div', { class: 'matrix-table-wrap scroll-slim', dir: 'rtl' }, table);
  }

  function buildPairList(matrix, cycleId) {
    var nameOf = function (id) { return matrix.members.find(function (m) { return m.elementId === id; }); };
    var activeRelations = matrix.relations.filter(function (r) { return r.isActive; });
    var openPairId = null;
    var ul = U.h('ul', { class: 'list-none flex flex-col gap-2' });
    activeRelations.forEach(function (r) {
      var a = nameOf(r.elementLowId);
      var b = nameOf(r.elementHighId);
      var eff = effectiveCell(matrix, r.id);
      var card = U.h('li', { class: 'mx-pair-card' },
        U.h('button', {
          class: 'mx-pair-head', type: 'button',
          'aria-expanded': 'false',
          onclick: function () {
            var expand = card.querySelector('.mx-pair-detail');
            if (expand) { expand.parentNode.removeChild(expand); return; }
            buildDetail();
          },
        },
          U.h('span', { class: 'min-w-0 flex-1' },
            U.h('span', { class: 'block truncate text-sm font-bold' },
              (a ? a.name : '؟') + ' ↔ ' + (b ? b.name : '؟')),
            U.h('span', { class: 'block truncate text-xs text-muted' },
              (a ? a.activityName : '؟') + ' / ' + (a ? a.stationName : '؟') + ' — ' +
              (b ? b.activityName : '؟') + ' / ' + (b ? b.stationName : '؟'))),
          U.h('span', { class: 'shrink-0' }, !cycleId
            ? U.h('span', { class: 'text-faint text-xs', text: '—' })
            : statusChipEl(eff, true))));
      function buildDetail() {
        var comparable = !cycleId || !matrix.comparability || !matrix.comparability[r.id] || matrix.comparability[r.id].isComparable !== false;
        var notComparableReason = (matrix.comparability && matrix.comparability[r.id] && matrix.comparability[r.id].notComparableReason) || null;
        var detail = U.h('div', { class: 'mx-pair-detail text-xs text-muted', style: { marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--border)' } });
        if (!cycleId) {
          detail.appendChild(U.h('p', { text: 'برای مشاهدهٔ مقدار، ابتدا یک چرخه انتخاب کنید.' }));
        } else if (!comparable) {
          detail.appendChild(U.h('p', { text: notComparableReason || 'این زوج در این چرخه قابل‌مقایسه نیست.' }));
        } else {
          detail.appendChild(U.h('p', null,
            'مقدار این چرخه: ',
            eff.status === 'OVERLAP'
              ? U.h('b', { class: 'num' }, U.formatTimeValue(eff.overlapDuration) + ' ثانیه')
              : eff.status === 'NO_OVERLAP' ? 'بدون هم‌پوشانی' : 'بررسی‌نشده'));
        }
        detail.appendChild(U.h('p', { style: { marginTop: '4px' }, text: 'ثبت و ویرایش مقدار در برگهٔ زمان‌سنجی (زیرردیف رابطه) انجام می‌شود.' }));
        card.appendChild(detail);
      }
      ul.appendChild(card);
    });
    return ul;
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
    // §۳ ممیزی جلسه ۲ — دو حکم مستقل: سازگاری دادهٔ تأییدشده vs نتیجهٔ نهایی
    var confirmedVerdict = v.confirmedVerdict || v.verdict;
    var overallVerdict = v.overallVerdict || v.verdict;
    if (overallVerdict === 'VALID') {
      verdictBadge = UI.badge('داده‌های تأییدشدهٔ این چرخه سازگارند', 'green', 'checkCircle');
    } else if (overallVerdict === 'INVALID') {
      verdictBadge = UI.badge('داده‌های ناسازگار — تأیید نهایی مسدود است', 'red', 'alertTriangle');
    } else if (confirmedVerdict === 'VALID') {
      verdictBadge = UI.badge('داده‌های تأییدشده سازگارند؛ اعتبارسنجی کامل نیست', 'amber', 'circleHelp');
    } else {
      verdictBadge = UI.badge('نامعین — داده کامل نیست', 'amber', 'circleHelp');
    }

    var intervalIssues = v.intervalIssues || [];
    var hasAny =
      v.localFailures.length > 0 || v.tripleIssues.length > 0 || v.globalIssues.length > 0 ||
      intervalIssues.length > 0 ||
      v.provisionalWarnings.length > 0 || v.multiOverlaps.length > 0 || v.unions.length > 0;
    if (!hasAny) return U.h('div', { class: 'flex justify-center' }, verdictBadge);

    var panel = U.h('div', { class: 'mx-validation flex flex-col gap-3' },
      U.h('div', { class: 'flex flex-wrap items-center justify-between gap-2' },
        U.h('p', { class: 'text-sm font-bold', text: 'اعتبارسنجی و محاسبات وابسته (چرخهٔ انتخاب‌شده)' }),
        verdictBadge));

    // خطاهای قطعی — مسدودکننده (§۸.۱) + تعارض با بازهٔ واقعی (§۴ ممیزی جلسه ۲)
    if (v.localFailures.length > 0 || v.tripleIssues.length > 0 || v.globalIssues.length > 0 ||
        intervalIssues.some(function (i) { return i.kind === 'DEFINITE'; })) {
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
      intervalIssues.forEach(function (i) {
        if (i.kind !== 'DEFINITE') return;
        definite.appendChild(U.h('li', { class: 'mx-issue-red' },
          U.h('b', { text: nameOf(i.pair[0]) + ' ↔ ' + nameOf(i.pair[1]) + ': ' }), i.message));
      });
      panel.appendChild(definite);
    }

    // بازهٔ ناقص — ادعای VALID قطعی ممکن نیست (§۴ ممیزی جلسه ۲)
    if (intervalIssues.some(function (i) { return i.kind === 'INDETERMINATE'; })) {
      var incomplete = U.h('ul', { class: 'list-none flex flex-col gap-1.5' });
      intervalIssues.forEach(function (i) {
        if (i.kind !== 'INDETERMINATE') return;
        incomplete.appendChild(U.h('li', { class: 'mx-issue-amber' }, U.icon('circleHelp'),
          U.h('span', { text: i.message })));
      });
      panel.appendChild(incomplete);
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
      // v1.5.1 §۶ — دلیل آرشیو CROSS_ACTIVITY فقط برچسب اطلاعاتی است؛
      // بازگردانی رابطهٔ بین‌فعالیت مجاز است و دیگر مسدود نمی‌شود.
      var crossActivity = r.archiveReason === 'CROSS_ACTIVITY_NOT_SUPPORTED_BY_SESSION_SHEET';
      ul.appendChild(U.h('li', { class: 'mx-archived-row' },
        U.h('span', { class: 'text-muted truncate', text: nameOf(r.elementLowId) + ' ↔ ' + nameOf(r.elementHighId) + (crossActivity ? ' — بین‌فعالیت' : '') }),
        U.h('span', { class: 'flex items-center gap-1.5 shrink-0' },
          crossActivity
            ? U.h('span', {
                class: 'mx-chip-cross',
                title: 'رابطهٔ بین‌فعالیت — عناصر در دو فعالیتِ متفاوت همین پروژه هستند.',
                text: 'بین‌فعالیت',
              })
            : null,
          U.h('button', {
            class: 'btn btn-outline btn-sm', type: 'button', text: 'بازگردانی',
            onclick: function () {
              try {
                DB.restoreOverlapRelation(r.id);
                UI.toast('رابطه بازگردانی شد', { description: 'مقادیر تاریخی چرخه‌های قبلی همین رابطه حفظ شده و دوباره فعال شد.' });
                rerender();
              } catch (err) { UI.toastError(err); }
            },
          }))));
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
  // (views-structure.js) و پاپ‌اور سربرگ ستون برگهٔ زمان‌سنجی — منبع داده:
  // سرویس مرکزی (§۴.۲).
  // امضا: (container, projectId, elementId, elementName, opts?)
  // opts.sessionId — §۶ ممیزی جلسه ۲: در زمینهٔ زمان‌سنجی، داده به جلسهٔ جاری محدود می‌شود
  // opts.cycles — چرخه‌های زمینهٔ جاری (در زمان‌سنجی: چرخه‌های همین جلسه)
  // ═══════════════════════════════════════════════════════════

  g.T2VIEWS._parallelRelationsSection = function (container, projectId, elementId, elementName, opts) {
    opts = opts || {};
    var sessionScoped = !!opts.sessionId;
    var sectionEl = U.h('section', {
      class: 'mx-parallel-section flex flex-col gap-3',
      'aria-label': 'عناصر موازی «' + elementName + '»',
    });
    container.appendChild(sectionEl);

    var addOpen = false;

    function draw() {
      var data;
      try {
        data = DB.getElementRelations(elementId, { sessionId: opts.sessionId || null });
      } catch (err) {
        U.clear(sectionEl);
        sectionEl.appendChild(U.h('div', { class: 'banner error' }, U.icon('alertTriangle'),
          U.h('div', null, (err && err.message) ? err.message : 'خطا در واکشی روابط')));
        return;
      }
      U.clear(sectionEl);
      var rows = data.rows.filter(function (r) { return r.isActive; });
      var archivedRows = data.rows.filter(function (r) { return !r.isActive; });

      // سربرگ — مشاهده در ماتریس + افزودن عنصر موازی (فقط هم‌فعالیت §۴.۳)
      sectionEl.appendChild(U.h('div', { class: 'flex flex-wrap items-center justify-between gap-2' },
        U.h('p', { class: 'flex items-center gap-1.5 text-sm font-bold' },
          U.h('span', { style: { color: 'var(--brand)', display: 'inline-flex' } }, U.icon('network')),
          'عناصر موازی'),
        U.h('div', { class: 'flex items-center gap-1.5' },
          U.h('button', {
            class: 'btn btn-outline btn-sm', type: 'button', text: 'مشاهده در ماتریس',
            onclick: function () { appNavigate('/p/' + projectId + '/matrix'); },
          }),
          U.h('button', {
            class: 'btn btn-brand btn-sm', type: 'button',
            onclick: function () { addOpen = !addOpen; draw(); },
          }, U.icon('plus'), 'عنصر موازی'))));

      // v1.5.0 §۴.۱ — این فرم فقط تعریف‌کنندهٔ رابطه است؛ نه محل اندازه‌گیری
      sectionEl.appendChild(U.h('p', {
        class: 'text-xs text-muted leading-relaxed',
        text: 'اینجا فقط رابطه‌های موازی تعریف یا حذف می‌شوند؛ ثبت مقدار هم‌پوشانی هر چرخه در برگهٔ زمان‌سنجی و در زیرردیف همین رابطه انجام می‌شود.',
      }));

      if (rows.length === 0) {
        sectionEl.appendChild(U.h('p', {
          class: 'text-xs text-muted leading-relaxed',
          text: 'برای «' + elementName + '» رابطهٔ موازی ثبت نشده است. اگر عنصر دیگری هم‌زمان با آن اجرا می‌شود، آن را اضافه کنید تا زیرردیف آن در برگهٔ زمان‌سنجی نمایش داده شود.',
        }));
      } else {
        var ul = U.h('ul', { class: 'list-none flex flex-col gap-1.5' });
        rows.forEach(function (r) { ul.appendChild(buildRow(r)); });
        sectionEl.appendChild(ul);
      }

      /* روابط آرشیوشده — بازگردانی در صورت معتبر بودن (§۴.۱/§۴.۳) */
      if (archivedRows.length > 0) {
        var archBox = U.h('details', { class: 'rounded-lg', style: { border: '1px solid var(--border)', padding: '8px', background: 'var(--surface-2)' } });
        archBox.appendChild(U.h('summary', {
          class: 'text-xs font-bold', style: { cursor: 'pointer', color: 'var(--muted-foreground)' },
          text: 'روابط آرشیوشده (' + U.formatInt(archivedRows.length) + ')',
        }));
        var archUl = U.h('ul', { class: 'list-none flex flex-col gap-1.5', style: { marginTop: '8px' } });
        archivedRows.forEach(function (r) {
          archUl.appendChild(U.h('li', {
            class: 'flex flex-wrap items-center justify-between gap-2 rounded-lg',
            style: { background: 'var(--muted)', padding: '8px' },
          },
            U.h('div', { class: 'min-w-0' },
              U.h('p', {
                class: 'truncate text-xs font-bold',
                style: { color: 'var(--muted-foreground)', textDecoration: 'line-through' },
                text: r.otherElementName,
              }),
              U.h('p', {
                class: 'truncate',
                style: { fontSize: '10px', color: 'var(--muted-foreground)' },
                text: r.otherActivityName + ' / ' + r.otherStationName + (r.crossActivity ? ' — بین‌فعالیت' : ''),
              })),
            U.h('span', { class: 'flex shrink-0 items-center gap-1.5' },
              r.crossActivity
                ? U.h('span', {
                    class: 'mx-chip-cross',
                    title: 'رابطهٔ بین‌فعالیت — عنصر مقابل در فعالیت دیگری از همین پروژه است.',
                    text: 'بین‌فعالیت',
                  })
                : null,
              U.h('button', {
                class: 'btn btn-ghost btn-sm', type: 'button',
                style: { color: 'var(--green)' },
                onclick: function () {
                  try {
                    DB.restoreOverlapRelation(r.relationId);
                    UI.toast('رابطه بازگردانی شد', { description: 'زیرردیف‌ها و مقادیر تاریخی آن دوباره نمایش داده می‌شوند.' });
                    draw();
                  } catch (err) { UI.toastError(err); }
                },
              }, U.icon('rotateCcw'), 'بازگردانی'))));
        });
        archBox.appendChild(archUl);
        sectionEl.appendChild(archBox);
      }

      if (addOpen) sectionEl.appendChild(buildInlineAdd());
    }

    /** ردیف یک رابطهٔ فعال — آخرین مقدار (فقط‌خواندنی) + حذف رابطه — §۴.۱ v1.5.0 */
    function buildRow(r) {
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
          // §۶ ممیزی جلسه ۲ — برچسب صریح دامنهٔ «آخرین ثبت»؛ در زمینهٔ زمان‌سنجی
          // دادهٔ جلسه/اپراتور دیگر نمایش داده نمی‌شود
          latestBlock = U.h('span', { class: 'flex flex-col items-end gap-1 shrink-0' },
            chip,
            U.h('span', { class: 'text-muted', style: { fontSize: '10px' } },
              (sessionScoped ? 'آخرین ثبت در این جلسه: چرخهٔ ' : 'آخرین ثبت در کل پروژه: چرخهٔ ') +
              U.formatInt(r.latest.cycleNo) +
              (sessionScoped ? '' : ' — ' + r.latest.operatorName + ' — ' + r.latest.activityName)));
        } else {
          latestBlock = U.h('span', { class: 'text-muted shrink-0', style: { fontSize: '10px' },
            text: sessionScoped ? 'در این جلسه هنوز مقداری ثبت نشده است' : 'هنوز مقداری ثبت نشده است' });
        }

        li.appendChild(U.h('div', { class: 'flex flex-wrap items-center justify-between gap-2' },
          U.h('div', { class: 'min-w-0 flex-1' },
            U.h('p', { class: 'truncate text-sm font-bold', text: r.otherElementName }),
            U.h('p', { class: 'truncate text-xs text-muted', text: r.otherActivityName + ' / ' + r.otherStationName })),
          latestBlock));

        li.appendChild(U.h('div', { class: 'flex flex-wrap gap-1.5', style: { marginTop: '8px' } },
          U.h('button', {
            class: 'btn btn-outline btn-sm', type: 'button',
            title: 'ثبت مقدار هم‌پوشانی فقط در برگهٔ زمان‌سنجی انجام می‌شود',
            onclick: function () { appNavigate('/p/' + projectId + '/timing'); },
          }, U.icon('timer'), 'ورود به برگهٔ زمان‌سنجی'),
          U.h('button', {
            class: 'btn btn-ghost btn-sm', type: 'button', style: { color: 'var(--red)' },
            onclick: function () { confirmDel = !confirmDel; drawRow(); },
          }, U.icon('trash'), 'حذف رابطه')));

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

    /** افزودن رابطهٔ موازی از فرم — تمام عناصر همان پروژه (هر Activity/Station)،
     *  بدون خود و بدون رابطهٔ فعال تکراری — v1.5.1 §۲ */
    function buildInlineAdd() {
      var box = U.h('div', { class: 'mx-quick-editor flex flex-col gap-2' });
      var selected = null;
      var confirming = false;
      var catalogAll = [];
      try {
        catalogAll = DB.getOverlapMatrix(projectId, null).elementsCatalog;
      } catch (e) { catalogAll = []; }
      /* v1.5.1 §۲ — روابط فعال تکراری پیشنهاد نمی‌شوند؛ محدودیت هم‌فعالیت حذف شد */
      var relatedIds = {};
      try {
        DB.getElementRelations(elementId, { sessionId: opts.sessionId || null }).rows
          .filter(function (r) { return r.isActive; })
          .forEach(function (r) { relatedIds[r.otherElementId] = true; });
      } catch (e) { /* بی‌اهمیت */ }
      var catalog = catalogAll.filter(function (c) {
        return c.elementId !== elementId && !relatedIds[c.elementId];
      });
      var ownEntry = catalogAll.find(function (c) { return c.elementId === elementId; });
      var ownActivityId = ownEntry ? ownEntry.activityId : null;

      function nameOf(id) {
        var e = catalog.find(function (c) { return c.elementId === id; });
        return e ? e.name : '؟';
      }
      function activityLabel(id) {
        var e = catalog.find(function (c) { return c.elementId === id; });
        return e ? e.activityName + ' / ' + e.stationName : '؟';
      }

      function drawAdd() {
        U.clear(box);
        if (catalog.length === 0) {
          box.appendChild(U.h('p', {
            class: 'text-xs text-muted leading-relaxed',
            text: 'عنصر دیگری در این پروژه برای رابطهٔ موازی وجود ندارد (یا همهٔ روابط ممکن تعریف شده‌اند).',
          }));
          return box;
        }
        box.appendChild(U.h('p', { class: 'text-xs', text: 'عنصر موازی «' + elementName + '» را انتخاب کنید (عناصر همهٔ فعالیت‌های پروژه):' }));
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
          var crossNow = selected != null && ownActivityId != null && catalog.find(function (c) { return c.elementId === selected; }) && catalog.find(function (c) { return c.elementId === selected; }).activityId !== ownActivityId;
          box.appendChild(U.h('div', { class: 'mx-confirm-brand flex flex-col gap-2' },
            U.h('p', null,
              'با افزودن رابطهٔ موازی «' + elementName + '» و «' + nameOf(selected) + '»'
              + (crossNow ? ' (رابطهٔ بین‌فعالیت — ' + activityLabel(selected) + ')' : '')
              + '، زیرردیف آن در برگهٔ زمان‌سنجی (برای همهٔ اپراتورهای هر دو فعالیتِ درگیر)، فرم هر دو عنصر و ماتریس مرکزی نمایش داده می‌شود. ادامه می‌دهید؟'),
            U.h('div', { class: 'flex justify-end gap-2' },
              U.h('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: 'بازگشت', onclick: function () { confirming = false; drawAdd(); } }),
              U.h('button', {
                class: 'btn btn-brand btn-sm', type: 'button', text: 'افزودن',
                onclick: function () {
                  try {
                    DB.createOverlapRelation(projectId, elementId, selected);
                    UI.toast('رابطهٔ موازی افزوده شد', {
                      description: 'زیرردیف این رابطه در برگهٔ زمان‌سنجی (برای همهٔ اپراتورهای هر دو فعالیت درگیر) و فرم هر دو عنصر نمایش داده می‌شود.',
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
