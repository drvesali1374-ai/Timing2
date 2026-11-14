/* ═══════════════════════════════════════════════════════════
   views-westinghouse.js — «ارزیابی وستینگهاوس» (مرحله ۵ مطالعه)
   FR-13 — پورت وفادار از WestinghouseView.tsx نسخه وب:
   • زبانه «ارزیابی عناصر»: ماتریس ایستگاه→فعالیت→عناصر با
     دیالوگ ارزیابی (چهار عامل + پیش‌نمایش زنده R + کپی از
     عنصر مشابه) — ارزیابی برای عنصر یک‌بار ثبت و به تمام
     مشاهدات همان عنصر از همه اپراتورها اعمال می‌شود
   • زبانه «جدول‌های مرجع»: جدول‌های نسخه‌دار + ویرایش درجه‌ها
     در پیش‌نویس محلی + «ذخیره به‌عنوان نسخه جدید» برای حفظ
     سابقه محاسباتی — جدول جاری هرگز بی‌صدا تغییر نمی‌کند
   • جدول Seed صرفاً نقطه شروع است و باید توسط کارشناس/رویه
     شرکت تأیید شود — استاندارد جهان‌شمول نیست
   ═══════════════════════════════════════════════════════════ */
(function (g) {
  'use strict';
  var U = g.T2U, DB = g.T2DB, UI = g.T2UI, F = g.T2F;
  g.T2VIEWS = g.T2VIEWS || {};

  function appNavigate(hash) { if (g.T2APP) g.T2APP.navigate(hash); }
  function appRefresh() { if (g.T2APP) g.T2APP.refresh(); }

  // انتخاب زبانه/جدول بین رندرها حفظ می‌شود (closure سطح ماژول)
  var activeTab = 'assess';
  var selectedTableId = null;

  // ── محتوای راهنمای آیکونی (عیناً از مشخصات) ──
  var MAIN_HELP = {
    what: 'ضریب عملکرد R = 1 + مهارت + تلاش + شرایط + یکنواختی؛ برای هر عنصر یک‌بار ثبت و به تمام مشاهدات همان عنصر از همه اپراتورها اعمال می‌شود (تصمیم مالک محصول).',
    input: 'برای هر عنصر، جدول مرجع و درجه هر عامل را انتخاب کنید؛ امکان کپی از عنصر مشابه نیز وجود دارد.',
    example: 'مهارت +۰٫۰۶، تلاش +۰٫۰۲، شرایط ۰ و یکنواختی +۰٫۰۱ ⇒ R = ۱٫۰۹',
    note: 'جدول Seed صرفاً نقطه شروع نرم‌افزار است و باید توسط کارشناس/رویه شرکت تأیید شود.',
  };
  var COPY_HELP = {
    what: 'درجه‌های چهار عامل یک عنصر دیگرِ همین پروژه را عیناً به این عنصر کپی می‌کند؛ برای عناصر تکراری مشابه.',
    input: 'یک عنصر دارای ارزیابی انتخاب کنید، یا حالت «انتخاب دستی درجه‌ها» را نگه دارید.',
    note: 'مقدار درجه‌ها از جدول انتخابی بالا خوانده می‌شود؛ اگر جدول کدی را نداشته باشد، ثبت با خطا مواجه می‌شود.',
  };
  var TABLES_HELP = {
    what: 'جدول درجه‌های چهار عامل وستینگهاوس؛ هر جدول نام، نسخه، منبع و توضیح دارد و هر ارزیابی به نسخه جدول مورد استفاده ارجاع می‌دهد.',
    input: 'جدولی را از فهرست انتخاب کنید؛ فراداده قابل ویرایش است و تغییر درجه‌ها فقط با «نسخه جدید» ذخیره می‌شود.',
    example: 'جدول Seed اولیه از نسخه رایج نظام Westinghouse بارگذاری شده است.',
    note: 'جدول Seed صرفاً نقطه شروع است و استاندارد جهان‌شمول یا رویه مصوب شرکت نیست؛ تغییر جدول نباید محاسبات تاریخی را بی‌صدا تغییر دهد.',
  };
  var SOURCE_HELP = {
    what: 'مرجع یا رویه‌ای که مقادیر درجه‌ها از آن گرفته شده است.',
    input: 'نام کتاب، استاندارد یا رویه داخلی شرکت.',
    example: '«نسخه رایج نظام Westinghouse — بارگذاری‌شده به‌عنوان Seed نرم‌افزار».',
    note: 'ذکر دقیق منبع برای پاسخ‌گویی در بررسی‌های کیفی ضروری است؛ جدول Seed صرفاً نقطه شروع است.',
  };
  // راهنمای هر عامل — FR-13
  var FACTOR_HELP = {
    SKILL: {
      what: 'تسلط و روانی حرکات — میزان مهارت اپراتور در اجرای روان و دقیق عنصر کاری.',
      input: 'درجه‌ای از جدول انتخاب‌شده برگزینید؛ «انتخاب نشده» یعنی سهم صفر.',
      example: 'در جدول Seed: A1 (+۰٫۱۵) تا F2 (−۰٫۲۲)؛ D مرجع با سهم صفر.',
      note: 'جدول Seed صرفاً نقطه شروع است و باید توسط کارشناس تأیید شود.',
    },
    EFFORT: {
      what: 'سرعت و تمرکز نسبت به ریتم معمول — تلاش بیش‌ازحد یا کمتر از تمپوی متعارف همان کار.',
      example: 'در جدول Seed: C1 (+۰٫۰۵) تلاش خوب یا E1 (−۰٫۰۴) تلاش کم.',
    },
    CONDITIONS: {
      what: 'وضعیت محیط کار — نور، صدا، دما، تهویه، نظم و دسترسی به ابزار در ایستگاه.',
      example: 'در جدول Seed: B (+۰٫۰۴) اندکی بهتر از متوسط یا E (−۰٫۰۳) نامطلوب.',
    },
    CONSISTENCY: {
      what: 'ثبات زمان‌ها بین چرخه‌ها — هرچه پراکندگی زمان‌های ثبت‌شده کمتر باشد، یکنواختی بالاتر است.',
      example: 'در جدول Seed: C (+۰٫۰۱) عملکرد پیوسته یا E (−۰٫۰۲) نوسان محسوس.',
    },
  };

  // رنگ Badge نوع عنصر — MANUAL برند، MACHINE فیروزه‌ای، WAITING کهربایی، OVERLAP سبز

  /** نمایش مقدار درجه با علامت ± و دو رقم اعشار */
  function signed2(v) {
    if (v === null || v === undefined || !isFinite(v)) return '—';
    if (Math.abs(v) < 1e-9) return U.formatTimeValue(0, 2);
    return (v > 0 ? '+' : '−') + U.formatTimeValue(Math.abs(v), 2);
  }

  function computeR(vals) {
    if (F && F.computeRatingFactor) return F.computeRatingFactor(vals);
    return 1 + vals.skill + vals.effort + vals.conditions + vals.consistency;
  }

  g.T2VIEWS.westinghouse = function (container, projectId) {

    // ═══════════ رندر کل نما ═══════════
    function renderAll() {
      U.clear(container);
      var matrix = DB.getRatingMatrix(projectId);
      var total = matrix.length;
      var rated = 0;
      matrix.forEach(function (r) { if (r.rated) rated++; });

      // سربرگ بخش — چسبان زیر نوار اصلی (v1.5.2 §۸)
      container.appendChild(UI.stickyHeading(U.h('div', { class: 'flex flex-wrap items-center justify-between gap-3' },
        U.h('div', { class: 'flex items-center gap-3' },
          U.h('span', { class: 'chip-icon' }, U.icon('gauge')),
          U.h('div', null,
            U.h('h1', { class: 'text-xl font-extrabold', text: 'ارزیابی وستینگهاوس' }),
            U.h('p', { class: 'text-sm text-muted flex flex-wrap items-center gap-1' },
              U.h('span', { dir: 'ltr' }, U.h('code', { class: 'inline' }, 'R = 1 + Skill + Effort + Conditions + Consistency')),
              ' — ' + U.formatInt(rated) + ' از ' + U.formatInt(total) + ' عنصر ارزیابی شده',
              UI.helpDot('ارزیابی وستینگهاوس', MAIN_HELP)))))));

      container.appendChild(U.h('div', { class: 'mt-4' }, UI.tabsBar([
        { key: 'assess', label: 'ارزیابی عناصر' },
        { key: 'tables', label: 'جدول‌های مرجع' },
      ], activeTab, function (k) { activeTab = k; renderAll(); })));

      var wrap = U.h('div', { class: 'mt-4' });
      container.appendChild(wrap);
      if (activeTab === 'assess') renderAssessTab(wrap, matrix);
      else renderTablesTab(wrap);
    }

    // ═══════════ زبانه ارزیابی عناصر — FR-13 ═══════════
    function renderAssessTab(wrap, matrix) {
      var total = matrix.length;
      var rated = 0;
      matrix.forEach(function (r) { if (r.rated) rated++; });

      if (total === 0) {
        wrap.appendChild(UI.emptyState({
          icon: 'factory',
          title: 'هنوز عنصر کاری برای ارزیابی وجود ندارد',
          desc: 'ابتدا در «ساختار تولید» عناصر کاری فعالیت‌ها را تعریف کنید.',
          actionLabel: 'رفتن به ساختار تولید',
          onAction: function () { appNavigate('/p/' + projectId + '/structure'); },
        }));
        return;
      }

      var pct = Math.round((rated / total) * 100);
      wrap.appendChild(U.h('div', { class: 'card p-4 mb-4' },
        U.h('div', { class: 'flex flex-wrap items-center justify-between gap-2' },
          U.h('p', { class: 'text-sm font-bold' },
            U.formatInt(rated) + ' از ' + U.formatInt(total) + ' عنصر ارزیابی شده'),
          U.h('span', { class: 'text-xs text-muted' }, U.formatInt(pct) + '٪')),
        U.h('div', {
          class: 'progress mt-2', role: 'progressbar',
          'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct),
          'aria-label': 'درصد عناصر ارزیابی‌شده',
        }, U.h('div', { style: { width: pct + '%' } }))));

      // ماتریس ایستگاه → فعالیت → عناصر
      var stationsHost = U.h('div', { class: 'flex flex-col gap-4' });
      wrap.appendChild(stationsHost);
      DB.sortStations(projectId).forEach(function (st) {
        var actGroups = [];
        DB.sortActivities(st.id).forEach(function (a) {
          var rows = matrix.filter(function (r) { return r.activity.id === a.id; });
          if (rows.length > 0) actGroups.push({ a: a, rows: rows });
        });
        if (actGroups.length === 0) return;
        var stRated = 0, stTotal = 0;
        actGroups.forEach(function (x) {
          x.rows.forEach(function (r) { stTotal++; if (r.rated) stRated++; });
        });
        stationsHost.appendChild(UI.collapsibleCard(st.name, 'warehouse', function (bodyWrap) {
          actGroups.forEach(function (x) { bodyWrap.appendChild(activitySection(x)); });
        }, true, { subtitle: U.formatInt(stRated) + '/' + U.formatInt(stTotal) + ' ارزیابی‌شده' }));
      });
    }

    // بخش فعالیت در ماتریس — جدول عناصر با دکمه ارزیابی
    // v1.5.2 §۷.۱: فاصله عمودی عنوان فعالیت از خط جداکننده هدر ایستگاه افزایش یافت
    function activitySection(x) {
      var a = x.a;
      var sym = DB.CONST.PROCESS_TYPE_SYMBOLS[a.processType] || '';
      var sec = U.h('div', { class: 'mb-3 mt-4' },
        U.h('div', { class: 'flex flex-wrap items-center gap-2 mb-2' },
          U.h('h4', { class: 'text-sm font-bold' }, (sym ? sym + ' ' : '') + a.name)));
      sec.appendChild(UI.table(['عنصر کاری', 'وضعیت ارزیابی', ''], function (tbody) {
        x.rows.forEach(function (r) {
          var el = r.element;
          var ratingCell;
          if (r.rated) {
            ratingCell = UI.badge('R = ' + U.formatTimeValue(r.totalFactor, 2), 'green');
            ratingCell.setAttribute('dir', 'ltr');
            ratingCell.title = (r.tableName || '—') + ' — نسخه ' + U.formatInt(r.tableVersion);
          } else {
            ratingCell = UI.badge('ارزیابی نشده', 'outline');
          }
          tbody.appendChild(U.h('tr', null,
            U.h('td', { class: 'font-medium' }, el.name),
            U.h('td', null, ratingCell),
            U.h('td', null, U.h('div', { class: 'flex', style: { justifyContent: 'flex-end' } },
              r.rated
                ? U.h('button', {
                    class: 'btn btn-outline btn-sm', type: 'button',
                    'aria-label': 'ویرایش ارزیابی عنصر ' + el.name,
                    onclick: function () { openRatingDialog(r); },
                  }, U.icon('pencil'), 'ویرایش ارزیابی')
                : U.h('button', {
                    class: 'btn btn-brand btn-sm', type: 'button',
                    'aria-label': 'ارزیابی عنصر ' + el.name,
                    onclick: function () { openRatingDialog(r); },
                  }, U.icon('gauge'), 'ارزیابی')))));
        });
      }));
      return sec;
    }

    // ═══════════ دیالوگ ارزیابی عنصر — هسته FR-13 ═══════════
    function openRatingDialog(row) {
      var el = row.element;
      var activity = row.activity;
      var station = DB.getStation(activity.stationId);
      var stationName = station ? station.name : '';
      var factors = DB.CONST.RATING_FACTORS;
      var current = DB.getElementRating(el.id);

      var form = {
        tableId: '',
        grades: { SKILL: null, EFFORT: null, CONDITIONS: null, CONSISTENCY: null },
        copyFrom: null,
        notes: current && current.assessment.notes ? current.assessment.notes : '',
      };
      // جدول پیش‌فرض: جدول ارزیابی فعلی، یا جدول پیش‌فرض پروژه، یا نخستین جدول
      if (current && current.table) form.tableId = current.table.id;
      if (!form.tableId) DB.listRatingTables(projectId).forEach(function (t) {
        if (t.table.isDefault && !form.tableId) form.tableId = t.table.id;
      });
      if (!form.tableId) {
        var ts0 = DB.listRatingTables(projectId);
        if (ts0.length) form.tableId = ts0[0].table.id;
      }
      if (current) {
        form.grades.SKILL = current.assessment.skillGrade;
        form.grades.EFFORT = current.assessment.effortGrade;
        form.grades.CONDITIONS = current.assessment.conditionsGrade;
        form.grades.CONSISTENCY = current.assessment.consistencyGrade;
      }

      var saveBtn = null;
      var tableHost = null, copyHost = null, copyBannerHost = null, factorsHost = null, warnHost = null, previewHost = null;

      function currentTableData() {
        var found = null;
        DB.listRatingTables(projectId).forEach(function (t) { if (t.table.id === form.tableId) found = t; });
        return found;
      }
      // درجه‌های مؤثر: در حالت کپی، درجه‌های عنصر مبدأ
      function effectiveGrades() {
        if (!form.copyFrom) return form.grades;
        var src = DB.getElementRating(form.copyFrom);
        if (!src) return { SKILL: null, EFFORT: null, CONDITIONS: null, CONSISTENCY: null };
        return {
          SKILL: src.assessment.skillGrade,
          EFFORT: src.assessment.effortGrade,
          CONDITIONS: src.assessment.conditionsGrade,
          CONSISTENCY: src.assessment.consistencyGrade,
        };
      }
      function findGrade(td, factor, code) {
        if (!td) return null;
        var out = null;
        td.grades.forEach(function (gr) { if (gr.factor === factor && gr.gradeCode === code) out = gr; });
        return out;
      }
      // عامل‌هایی که درجه انتخاب‌شده‌شان در جدول فعلی وجود ندارد — ثبت قطعاً خطا می‌خورد
      function missingFactors() {
        var td = currentTableData();
        if (!td) return [];
        var eg = effectiveGrades();
        return factors.filter(function (f) {
          var code = eg[f];
          return !!code && !findGrade(td, f, code);
        });
      }
      // مقدار هر عامل از جدول انتخابی؛ null = نامعلوم/ناموجود
      function factorValues() {
        var td = currentTableData();
        var eg = effectiveGrades();
        var out = { SKILL: null, EFFORT: null, CONDITIONS: null, CONSISTENCY: null };
        factors.forEach(function (f) {
          var code = eg[f];
          if (!code) { out[f] = 0; return; }
          var gr = findGrade(td, f, code);
          out[f] = gr ? gr.value : null;
        });
        return out;
      }
      function ratedSources() {
        return DB.getRatingMatrix(projectId)
          .filter(function (r) { return r.rated && r.element.id !== el.id; })
          .map(function (r) { return { id: r.element.id, label: r.activity.name + ' ← ' + r.element.name }; });
      }

      function renderTableSelect() {
        U.clear(tableHost);
        var tables = DB.listRatingTables(projectId);
        if (tables.length === 0) {
          tableHost.appendChild(U.h('div', { class: 'banner error' }, U.icon('xCircle'),
            U.h('div', { class: 'flex flex-col items-start gap-2' },
              U.h('span', { text: 'جدول ارزیابی‌ای وجود ندارد؛ ابتدا وضعیت زبانه «جدول‌های مرجع» را بررسی کنید.' }),
              U.h('button', {
                class: 'btn btn-outline btn-sm', type: 'button',
                onclick: function () {
                  var t = DB.getOrCreateSeedTable(projectId);
                  if (t && t.id) {
                    // نکته: getOrCreateSeedTable رکورد تازه را commit نمی‌کند؛
                    // با یک به‌روزرسانی خنثیِ فراداده، ماندگاری تضمین می‌شود.
                    try { DB.updateRatingTableMeta(t.id, { name: t.name }); } catch (e) { UI.toastError(e); }
                    form.tableId = t.id;
                  }
                  renderTableSelect(); renderFactors(); renderWarning(); renderPreview(); renderSaveState();
                },
              }, 'ساخت جدول Seed'))));
          return;
        }
        var options = tables.map(function (t) {
          return {
            value: t.table.id,
            label: t.table.name + ' (نسخه ' + U.formatInt(t.table.version) + ')' + (t.table.isDefault ? ' — پیش‌فرض' : ''),
          };
        });
        tableHost.appendChild(UI.field('جدول ارزیابی', UI.selectEl(options, form.tableId, function (v) {
          form.tableId = v;
          renderFactors(); renderWarning(); renderPreview(); renderSaveState();
        }, 'جدول ارزیابی')));
      }

      function renderCopy() {
        U.clear(copyHost);
        copyHost.appendChild(U.h('label', { class: 'field-label' }, 'کپی از عنصر مشابه',
          UI.helpDot('کپی از عنصر مشابه', COPY_HELP)));
        var sources = ratedSources();
        if (sources.length === 0) {
          copyHost.appendChild(U.h('p', {
            class: 'text-xs text-faint',
            text: 'هنوز عنصر ارزیابی‌شده‌ای در این پروژه وجود ندارد؛ اولین ارزیابی را دستی ثبت کنید.',
          }));
          return;
        }
        var options = [{ value: '', label: '— انتخاب دستی درجه‌ها —' }];
        sources.forEach(function (s) { options.push({ value: s.id, label: s.label }); });
        copyHost.appendChild(UI.selectEl(options, form.copyFrom || '', function (v) {
          form.copyFrom = v === '' ? null : v;
          renderCopyBanner(); renderFactors(); renderWarning(); renderPreview(); renderSaveState();
        }, 'کپی ارزیابی از عنصر مشابه'));
      }

      function renderCopyBanner() {
        U.clear(copyBannerHost);
        if (!form.copyFrom) return;
        copyBannerHost.appendChild(U.h('div', { class: 'banner info' }, U.icon('info'),
          U.h('div', { text: 'هنگام ذخیره، درجه‌ها از عنصر انتخاب‌شده کپی می‌شوند و انتخاب‌های دستی بالا نادیده گرفته می‌شوند؛ برای ویرایش دستی، گزینه «انتخاب دستی درجه‌ها» را برگزینید.' })));
      }

      function renderFactors() {
        U.clear(factorsHost);
        var td = currentTableData();
        var eg = effectiveGrades();
        factors.forEach(function (factor) {
          var label = DB.CONST.RATING_FACTOR_LABELS[factor] || factor;
          var options = [{ value: '', label: '— انتخاب نشده (صفر)' }];
          if (td) {
            td.grades.forEach(function (gr) {
              if (gr.factor !== factor) return;
              options.push({
                value: gr.gradeCode,
                label: gr.gradeCode + ' — ' + gr.label + ' (' +
                  (gr.value >= 0 ? '+' : '') + U.formatTimeValue(gr.value, 2) + ')',
              });
            });
          }
          var sel = UI.selectEl(options, eg[factor] || '', function (v) {
            form.grades[factor] = v === '' ? null : v;
            renderWarning(); renderPreview(); renderSaveState();
          }, 'درجه ' + label);
          if (form.copyFrom) sel.disabled = true; // در حالت کپی، انتخاب‌های دستی نادیده گرفته می‌شوند
          factorsHost.appendChild(UI.field(label, sel, FACTOR_HELP[factor]));
        });
      }

      function renderWarning() {
        U.clear(warnHost);
        var missing = missingFactors();
        if (missing.length === 0) return;
        warnHost.appendChild(U.h('div', { class: 'banner warning', role: 'alert' }, U.icon('alertTriangle'),
          U.h('div', {
            text: 'درجه انتخاب‌شده برای ' +
              missing.map(function (f) { return DB.CONST.RATING_FACTOR_LABELS[f] || f; }).join('، ') +
              ' در جدول فعلی وجود ندارد؛ درجه را مجدداً انتخاب کنید یا جدول را عوض کنید.',
          })));
      }

      function renderPreview() {
        U.clear(previewHost);
        var vals = factorValues();
        var hasMissing = factors.some(function (f) { return vals[f] === null; });
        var R = null;
        if (!hasMissing) {
          R = computeR({
            skill: vals.SKILL, effort: vals.EFFORT,
            conditions: vals.CONDITIONS, consistency: vals.CONSISTENCY,
          });
        }
        function fs(v) { return v === null || v === undefined || !isFinite(v) ? '—' : signed2(v); }
        previewHost.appendChild(U.h('div', { class: 'bg-brand-soft rounded-lg p-3' },
          U.h('p', { class: 'text-sm leading-relaxed' },
            U.h('b', { class: 'text-brand', text: 'پیش‌نمایش زنده: ' }),
            U.h('span', { dir: 'ltr' },
              'R = ۱ + (مهارت ' + fs(vals.SKILL) + ') + (تلاش ' + fs(vals.EFFORT) + ') + (شرایط ' +
              fs(vals.CONDITIONS) + ') + (یکنواختی ' + fs(vals.CONSISTENCY) + ') = ',
              U.h('b', { class: 'text-brand', text: R === null ? '—' : U.formatTimeValue(R, 2) }))),
          U.h('p', {
            class: 'text-xs text-muted mt-1',
            text: 'مقادیر از درجه‌های انتخابی جدول خوانده می‌شوند؛ «انتخاب نشده» یعنی سهم صفر. مقدار نهایی پس از ذخیره توسط موتور محاسبات ثبت و ملاک است.',
          })));
      }

      function renderSaveState() {
        if (!saveBtn) return;
        saveBtn.disabled = !form.tableId || missingFactors().length > 0;
      }

      function doSave(close) {
        if (!form.tableId) return;
        var grades;
        if (form.copyFrom) {
          var src = DB.getElementRating(form.copyFrom);
          if (!src) { UI.toast('عنصر مبدأ یافت نشد؛ دوباره تلاش کنید.', { type: 'error' }); return; }
          grades = {
            skillGrade: src.assessment.skillGrade,
            effortGrade: src.assessment.effortGrade,
            conditionsGrade: src.assessment.conditionsGrade,
            consistencyGrade: src.assessment.consistencyGrade,
          };
        } else {
          grades = {
            skillGrade: form.grades.SKILL,
            effortGrade: form.grades.EFFORT,
            conditionsGrade: form.grades.CONDITIONS,
            consistencyGrade: form.grades.CONSISTENCY,
          };
        }
        try {
          var R = DB.saveElementRating(el.id, {
            ratingTableId: form.tableId,
            skillGrade: grades.skillGrade,
            effortGrade: grades.effortGrade,
            conditionsGrade: grades.conditionsGrade,
            consistencyGrade: grades.consistencyGrade,
            notes: form.notes.trim() || null,
          });
          close();
          UI.toast('ارزیابی ثبت شد — R = ' + U.formatTimeValue(R, 2));
          appRefresh();
        } catch (err) { UI.toastError(err); }
      }

      UI.dialog({
        title: 'ارزیابی عنصر «' + el.name + '»',
        desc: stationName + ' › ' + activity.name +
          ' — درجه هر عامل را از جدول مرجع انتخاب کنید؛ ضریب R به‌صورت زنده پیش‌نمایش می‌شود.',
        size: 'lg',
        bodyBuilder: function (body) {
          tableHost = U.h('div');
          copyHost = U.h('div');
          copyBannerHost = U.h('div');
          factorsHost = U.h('div', { class: 'grid gap-3 sm:grid-cols-2' });
          warnHost = U.h('div');
          previewHost = U.h('div');
          var notesTa = U.h('textarea', {
            class: 'textarea',
            placeholder: 'مثلاً: مبنا مشاهده سه چرخه در شیفت صبح',
            'aria-label': 'یادداشت ارزیابی',
          });
          notesTa.value = form.notes;
          notesTa.addEventListener('input', function () { form.notes = notesTa.value; });

          body.appendChild(tableHost);
          body.appendChild(copyHost);
          body.appendChild(copyBannerHost);
          body.appendChild(factorsHost);
          body.appendChild(warnHost);
          body.appendChild(previewHost);
          body.appendChild(UI.field('یادداشت (اختیاری)', notesTa));

          renderTableSelect();
          renderCopy();
          renderCopyBanner();
          renderFactors();
          renderWarning();
          renderPreview();
          renderSaveState();
        },
        footerBuilder: function (close) {
          saveBtn = U.h('button', {
            class: 'btn btn-brand', type: 'button',
            onclick: function () { doSave(close); },
          }, U.icon('gauge'), 'ثبت ارزیابی');
          return U.h('div', { class: 'dialog-footer' },
            U.h('button', { class: 'btn', type: 'button', text: 'انصراف', onclick: close }),
            U.h('div', { class: 'spacer' }),
            saveBtn);
        },
      });
    }

    // ═══════════ زبانه جدول‌های مرجع — FR-13 ═══════════
    function renderTablesTab(wrap) {
      var tables = DB.listRatingTables(projectId);

      // انتخاب مؤثر: انتخاب قبلی، یا جدول پیش‌فرض، یا نخستین جدول
      var selId = null;
      if (selectedTableId) tables.forEach(function (t) { if (t.table.id === selectedTableId) selId = selectedTableId; });
      if (!selId) tables.forEach(function (t) { if (t.table.isDefault && !selId) selId = t.table.id; });
      if (!selId && tables.length) selId = tables[0].table.id;
      selectedTableId = selId;

      wrap.appendChild(U.h('div', { class: 'flex flex-wrap items-center gap-2' },
        U.h('h3', { class: 'font-bold', text: 'جدول‌های مرجع' }),
        U.h('div', { class: 'spacer' }),
        U.h('button', {
          class: 'btn btn-brand btn-sm', type: 'button',
          disabled: !selId ? true : null,
          onclick: function () { if (selId) quickNewVersion(selId); },
        }, U.icon('copyPlus'), 'ساخت نسخه جدید از انتخاب‌شده')));

      if (tables.length === 0) {
        wrap.appendChild(UI.emptyState({
          icon: 'sigma',
          title: 'جدول ارزیابی‌ای وجود ندارد',
          desc: 'جدول Seed در زمان ایجاد پروژه بارگذاری می‌شود؛ اگر حذف شده است، از نسخه پشتیبان بازیابی کنید.',
        }));
        return;
      }

      var list = U.h('div', { class: 'flex flex-col gap-2', 'aria-label': 'فهرست جدول‌های ارزیابی' });
      tables.forEach(function (t) { list.appendChild(tableCard(t, selId)); });
      wrap.appendChild(list);

      var sel = null;
      tables.forEach(function (t) { if (t.table.id === selId) sel = t; });
      if (sel) wrap.appendChild(buildTableDetail(sel));
    }

    // کارت جدول در فهرست — قابل انتخاب با حلقه برند
    function tableCard(t, selId) {
      var isSel = t.table.id === selId;
      return U.h('div', {
        class: 'list-row cursor-pointer', role: 'button', tabindex: '0',
        'aria-pressed': isSel ? 'true' : 'false',
        'aria-label': 'انتخاب جدول ' + t.table.name,
        style: isSel ? { outline: '2px solid var(--brand)' } : null,
        onclick: function () { selectedTableId = t.table.id; renderAll(); },
        onkeydown: function (e) {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectedTableId = t.table.id; renderAll(); }
        },
      },
        U.h('div', { class: 'flex-1 min-w-0' },
          U.h('div', { class: 'font-semibold truncate' }, t.table.name),
          U.h('div', { class: 'text-xs text-muted truncate', title: t.table.source || '' },
            t.table.source || 'بدون منبع')),
        U.h('div', { class: 'flex flex-col items-end gap-1 shrink-0' },
          U.h('div', { class: 'flex items-center gap-1.5' },
            t.table.isDefault ? UI.badge('پیش‌فرض', 'brand') : null,
            UI.badge('نسخه ' + U.formatInt(t.table.version), 'muted')),
          U.h('span', { class: 'text-xs text-faint' },
            U.formatInt(t.grades.length) + ' درجه / ' + U.formatInt(t.assessmentsCount) + ' ارزیابی'),
          U.h('span', { class: 'text-xs text-faint' }, U.formatDateTime(t.table.updatedAt))));
    }

    // ═══════════ پنل جزئیات جدول انتخاب‌شده ═══════════
    function buildTableDetail(t) {
      var table = t.table;
      var panel = U.h('div', { class: 'flex flex-col gap-4 mt-4' });

      // نسخه بعدی = بیشترین نسخه پروژه + ۱ (رفتار createRatingTableVersion)
      var nextVersion = 0;
      DB.listRatingTables(projectId).forEach(function (x) { if (x.table.version > nextVersion) nextVersion = x.table.version; });
      nextVersion += 1;

      // پیش‌نویس محلی ویرایش درجه‌ها — فقط با «نسخه جدید» اعمال می‌شود
      var edits = {}; // gradeId → {label, value, hint}
      function gradeById(gid) {
        var out = null;
        t.grades.forEach(function (gr) { if (gr.id === gid) out = gr; });
        return out;
      }
      function dirtyCount() {
        var n = 0;
        Object.keys(edits).forEach(function (gid) {
          var e = edits[gid];
          var orig = gradeById(gid);
          if (!orig) return;
          if (orig.label !== e.label || orig.value !== e.value || (orig.hint || '') !== (e.hint || '')) n++;
        });
        return n;
      }

      // ── فراداده — ذخیره فوری (debounce ۶۰۰ms) ──
      var nameVal = table.name, sourceVal = table.source || '', notesVal = table.notes || '';
      var metaIndHost = U.h('span');
      function setMetaInd(state) {
        U.clear(metaIndHost);
        var el = UI.saveIndicator(state);
        if (el) metaIndHost.appendChild(el);
      }
      function currentMetaPatch() {
        return {
          name: String(nameVal).trim() || table.name,
          source: String(sourceVal).trim() || null,
          notes: String(notesVal).trim() || null,
        };
      }
      var saveMeta = U.debounce(function () {
        setMetaInd('saving');
        try {
          DB.updateRatingTableMeta(table.id, currentMetaPatch());
          setMetaInd('saved');
          setTimeout(function () { setMetaInd(null); }, 2400);
        } catch (err) { setMetaInd('error'); UI.toastError(err); }
      }, 600);

      var nameInput = U.h('input', { class: 'input', value: nameVal, 'aria-label': 'نام جدول' });
      var barNameSpan = U.h('span', { text: String(nameVal).trim() || table.name });
      nameInput.addEventListener('input', function () {
        nameVal = nameInput.value;
        barNameSpan.textContent = String(nameVal).trim() || table.name;
        setMetaInd('dirty');
        saveMeta();
      });
      var sourceTa = U.h('textarea', { class: 'textarea', 'aria-label': 'منبع جدول' });
      sourceTa.value = sourceVal;
      sourceTa.addEventListener('input', function () { sourceVal = sourceTa.value; setMetaInd('dirty'); saveMeta(); });
      var notesTa = U.h('textarea', { class: 'textarea', 'aria-label': 'یادداشت جدول' });
      notesTa.value = notesVal;
      notesTa.addEventListener('input', function () { notesVal = notesTa.value; setMetaInd('dirty'); saveMeta(); });

      panel.appendChild(U.h('div', { class: 'card p-4' },
        U.h('div', { class: 'flex flex-wrap items-start justify-between gap-2' },
          U.h('div', { class: 'flex items-center gap-1' },
            U.h('h3', { class: 'font-bold', text: 'مشخصات جدول' }),
            UI.helpDot('جدول‌های مرجع', TABLES_HELP)),
          U.h('div', { class: 'flex items-center gap-2' },
            metaIndHost,
            U.h('button', {
              class: 'btn btn-destructive-outline btn-sm shrink-0', type: 'button',
              'aria-label': 'حذف جدول ' + table.name,
              onclick: function () { deleteTableFlow(t); },
            }, U.icon('trash'), 'حذف جدول ارزیابی'))),
        U.h('div', { class: 'mt-4 flex flex-col gap-3' },
          UI.field('نام جدول', nameInput),
          UI.field('منبع', sourceTa, SOURCE_HELP),
          UI.field('یادداشت', notesTa),
          U.h('div', { class: 'flex items-center justify-between rounded p-3 bg-surface-2' },
            U.h('div', null,
              U.h('span', { class: 'field-label', text: 'پیش‌فرض پروژه' }),
              U.h('p', { class: 'hint', text: 'جدول پیش‌فرض هنگام ارزیابی جدید پیشنهاد می‌شود.' })),
            UI.switchEl(table.isDefault, function (v) { onDefaultSwitch(v); }, 'جدول پیش‌فرض پروژه')))));

      function onDefaultSwitch(v) {
        if (v) {
          try {
            DB.updateRatingTableMeta(table.id, { isDefault: true });
            UI.toast('«' + (String(nameVal).trim() || table.name) + '» جدول پیش‌فرض پروژه شد');
          } catch (err) { UI.toastError(err); }
        } else {
          // در لایه داده، پیش‌فرض فقط با انتخاب جدول دیگر جابه‌جا می‌شود
          UI.toast('پیش‌فرض بودن این جدول برداشته نشد؛ برای تغییر، جدول دیگری را پیش‌فرض کنید.', { type: 'info' });
        }
        renderAll();
      }

      // ── تأکید Seed — جدول نسخه ۱ با منبع Westinghouse ──
      if (String(table.source || '').indexOf('Westinghouse') >= 0 && table.version === 1) {
        panel.appendChild(U.h('div', { class: 'banner warning', role: 'note' },
          U.h('div', {
            text: '⚠️ این جدول Seed صرفاً نقطه شروع نرم‌افزار است؛ پیش از استفاده عملی توسط کارشناس/رویه شرکت تأیید شود (منبع ثبت‌شده: ' +
              (table.source || 'ثبت نشده') + ').',
          })));
      }

      // ── درجه‌ها بر اساس عامل — پیش‌نویس محلی ──
      var dirtyHost = U.h('div');
      panel.appendChild(dirtyHost);

      function renderDirty() {
        U.clear(dirtyHost);
        var n = dirtyCount();
        if (n === 0) return;
        dirtyHost.appendChild(U.h('div', { class: 'banner warning' }, U.icon('alertTriangle'),
          U.h('div', { class: 'flex flex-wrap items-center justify-between gap-2' },
            U.h('span', null,
              U.formatInt(n) + ' درجه ویرایش شده و هنوز ذخیره نشده است؛ تغییرات فقط با ساخت «نسخه جدید» اعمال می‌شوند.'),
            U.h('button', {
              class: 'btn btn-ghost btn-sm', type: 'button',
              onclick: function () { edits = {}; renderAll(); },
            }, 'بازگردانی تغییرات'))));
      }

      function setEdit(gr, key, value) {
        if (!edits[gr.id]) edits[gr.id] = { label: gr.label, value: gr.value, hint: gr.hint || '' };
        edits[gr.id][key] = value;
        renderDirty();
      }

      var factorsWrap = U.h('div', { class: 'flex flex-col gap-3' });
      panel.appendChild(factorsWrap);
      DB.CONST.RATING_FACTORS.forEach(function (factor) {
        var rows = t.grades.filter(function (gr) { return gr.factor === factor; });
        if (rows.length === 0) return;
        factorsWrap.appendChild(UI.collapsibleCard(
          DB.CONST.RATING_FACTOR_LABELS[factor] || factor, 'gauge',
          function (bodyWrap) {
            bodyWrap.appendChild(UI.table(['کد', 'برچسب', 'مقدار (±)', 'راهنما'], function (tbody) {
              rows.forEach(function (gr) {
                var labelInput = U.h('input', { class: 'input', value: gr.label, 'aria-label': 'برچسب درجه ' + gr.gradeCode });
                labelInput.addEventListener('input', function () { setEdit(gr, 'label', labelInput.value); });
                var valInput = UI.persianNumberInput({
                  value: gr.value, min: -0.5, max: 0.5, decimals: 2,
                  onChange: function (v) {
                    setEdit(gr, 'value', (v === null || (typeof v === 'number' && isNaN(v))) ? 0 : v);
                  },
                  ariaLabel: 'مقدار درجه ' + gr.gradeCode,
                });
                var hintInput = U.h('input', { class: 'input text-xs', value: gr.hint || '', 'aria-label': 'راهنمای درجه ' + gr.gradeCode });
                hintInput.addEventListener('input', function () { setEdit(gr, 'hint', hintInput.value); });
                var codeBadge = UI.badge(gr.gradeCode, 'muted');
                codeBadge.setAttribute('dir', 'ltr');
                tbody.appendChild(U.h('tr', null,
                  U.h('td', null, codeBadge),
                  U.h('td', null, labelInput),
                  U.h('td', null, valInput),
                  U.h('td', null, hintInput)));
              });
            }));
          },
          false,
          { subtitle: U.formatInt(rows.length) + ' درجه' }));
      });

      // ── نوار عملیات چسبان پایین — نسخه جدید ──
      panel.appendChild(U.h('div', { class: 'card p-3 sticky', style: { bottom: '0', zIndex: '10' } },
        U.h('div', { class: 'flex flex-wrap items-center gap-3' },
          U.h('div', { class: 'text-xs text-muted flex-1 min-w-0' },
            U.h('p', {
              class: 'leading-relaxed',
              text: 'به‌جای تغییر جدول جاری، نسخه جدید بسازید تا محاسبات تاریخی بی‌صدا تغییر نکند.',
            }),
            U.h('p', { class: 'text-faint' },
              'نام نسخه جدید: «', barNameSpan, ' — نسخه ' + U.formatInt(nextVersion) +
              '» · نسخه جدید به‌صورت خودکار پیش‌فرض پروژه می‌شود.')),
          U.h('button', {
            class: 'btn btn-brand btn-sm shrink-0', type: 'button',
            onclick: function () { saveNewVersion(); },
          }, U.icon('copyPlus'), 'ذخیره به‌عنوان نسخه جدید'))));

      // نسخه جدید = کپی جدول جاری + اعمال ویرایش‌های محلی روی درجه‌های جدولِ تازه
      function saveNewVersion() {
        try {
          // ابتدا فراداده جاری را ذخیره کن تا نسخه جدید از آخرین نام/منبع ساخته شود
          DB.updateRatingTableMeta(table.id, currentMetaPatch());
          var newT = DB.createRatingTableVersion(table.id);
          var newData = null;
          DB.listRatingTables(projectId).forEach(function (x) { if (x.table.id === newT.id) newData = x; });
          if (newData) {
            Object.keys(edits).forEach(function (gid) {
              var e = edits[gid];
              var orig = gradeById(gid);
              if (!orig) return;
              var patch = {};
              if (orig.label !== e.label) patch.label = e.label;
              if (orig.value !== e.value) patch.value = e.value;
              if ((orig.hint || '') !== (e.hint || '')) patch.hint = e.hint;
              if (Object.keys(patch).length === 0) return;
              var target = null;
              newData.grades.forEach(function (ng) {
                if (ng.factor === orig.factor && ng.gradeCode === orig.gradeCode) target = ng;
              });
              if (target) DB.updateRatingTableGrade(target.id, patch);
            });
          }
          selectedTableId = newT.id;
          UI.toast('نسخه جدید «' + newT.name + ' — نسخه ' + U.formatInt(newT.version) + '» ذخیره شد و پیش‌فرض پروژه شد.');
          appRefresh();
        } catch (err) { UI.toastError(err); }
      }

      return panel;
    }

    // ساخت سریع نسخه جدید از جدول انتخاب‌شده (بدون ویرایش درجه)
    function quickNewVersion(tid) {
      try {
        var newT = DB.createRatingTableVersion(tid);
        selectedTableId = newT.id;
        UI.toast('نسخه جدید ساخته شد؛ ارزیابی‌های قبلی به نسخه پیشین ارجاع دارند');
        appRefresh();
      } catch (err) { UI.toastError(err); }
    }

    // ═══════════ حذف جدول — FR-26 (در حال استفاده ⇒ ممنوع) ═══════════
    function deleteTableFlow(t) {
      if (t.assessmentsCount > 0) {
        UI.alertDialog({
          title: 'حذف جدول ارزیابی',
          message: 'این جدول توسط ' + U.formatInt(t.assessmentsCount) +
            ' ارزیابی در حال استفاده است؛ حذف آن ممنوع می‌شود تا سابقه محاسباتی حفظ شود.',
          tone: 'error',
        });
        return;
      }
      UI.confirmDelete({
        title: 'حذف جدول ارزیابی',
        name: t.table.name,
        deps: {},
      }).then(function (ok) {
        if (!ok) return;
        try {
          DB.deleteRatingTable(t.table.id);
          UI.toast('جدول حذف شد');
          if (selectedTableId === t.table.id) selectedTableId = null;
          appRefresh();
        } catch (err) {
          // پیام فارسی هسته (جدول در حال استفاده) عیناً نمایش داده می‌شود
          UI.alertDialog({
            title: 'حذف جدول ارزیابی',
            message: err && err.message ? err.message : 'حذف جدول ناموفق بود.',
            tone: 'error',
          });
        }
      });
    }

    renderAll();
  };
})(typeof window !== 'undefined' ? window : globalThis);
