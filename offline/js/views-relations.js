/* ═══════════════════════════════════════════════════════════
   views-relations.js — «عناصر موازی» (v1.5.2 §۲)
   پس از حذف کامل ماتریس هم‌پوشانی، این فایل فقط بخش مشترک
   «عناصر موازی» برای دیالوگ عنصر (views-structure.js) و
   انتخاب‌گر عنصر کاری را نگه می‌دارد — مستقل از ماتریس.
   ═══════════════════════════════════════════════════════════ */
(function (g) {
  'use strict';
  var U = g.T2U, DB = g.T2DB, UI = g.T2UI;
  g.T2VIEWS = g.T2VIEWS || {};

  function appNavigate(hash) { if (g.T2APP) g.T2APP.navigate(hash); }

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

  // ═══════════ بخش مشترک «عناصر موازی» — v1.5.2 §۲-۶ (ساده‌شده) ═══════════
  // این فرم فقط تعریف‌کنندهٔ رابطه است؛ نه محل اندازه‌گیری.
  // ثبت زمان عادی عنصر موازی در برگهٔ زمان‌سنجی (زیرردیف، بازهٔ از/تا) انجام می‌شود.
  // امضا: (container, projectId, elementId, elementName, opts?)

  g.T2VIEWS._parallelRelationsSection = function (container, projectId, elementId, elementName, opts) {
    opts = opts || {};
    var sectionEl = U.h('section', {
      class: 'mx-parallel-section flex flex-col gap-3',
      'aria-label': 'عناصر موازی «' + elementName + '»',
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
      var archivedRows = data.rows.filter(function (r) { return !r.isActive; });

      // سربرگ — افزودن عنصر موازی (عناصر همهٔ فعالیت‌های پروژه)
      sectionEl.appendChild(U.h('div', { class: 'flex flex-wrap items-center justify-between gap-2' },
        U.h('p', { class: 'flex items-center gap-1.5 text-sm font-bold' },
          U.h('span', { style: { color: 'var(--brand)', display: 'inline-flex' } }, U.icon('network')),
          'عناصر موازی'),
        U.h('div', { class: 'flex items-center gap-1.5' },
          U.h('button', {
            class: 'btn btn-brand btn-sm', type: 'button',
            onclick: function () { addOpen = !addOpen; draw(); },
          }, U.icon('plus'), 'عنصر موازی'))));

      // v1.5.0 §۴.۱ — این فرم فقط تعریف‌کنندهٔ رابطه است؛ نه محل اندازه‌گیری
      sectionEl.appendChild(U.h('p', {
        class: 'text-xs text-muted leading-relaxed',
        text: 'اینجا فقط رابطه‌های موازی تعریف یا حذف می‌شوند؛ ثبت زمان عادی عنصر موازی (به‌صورت بازهٔ از/تا) در زیرردیف همین رابطه در برگهٔ زمان‌سنجی انجام می‌شود.',
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

      /* روابط آرشیوشده — بازگردانی در صورت معتبر بودن */
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
                    UI.toast('رابطه بازگردانی شد', { description: 'زیرردیف آن دوباره در برگهٔ زمان‌سنجی نمایش داده می‌شود.' });
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

    /** ردیف یک رابطهٔ فعال — v1.5.2 §۲-۶: بدون وضعیت/مقدار هم‌پوشانی */
    function buildRow(r) {
      var confirmDel = false;
      var li = U.h('li', { class: 'mx-parallel-row' });

      function drawRow() {
        U.clear(li);
        li.appendChild(U.h('div', { class: 'flex flex-wrap items-center justify-between gap-2' },
          U.h('div', { class: 'min-w-0 flex-1' },
            U.h('p', { class: 'flex items-center gap-1.5 truncate text-sm font-bold' },
              r.otherElementName,
              r.crossActivity
                ? U.h('span', {
                    class: 'mx-chip-cross',
                    title: 'رابطهٔ بین‌فعالیت — عنصر مقابل در فعالیت دیگری از همین پروژه است',
                    text: 'بین‌فعالیت',
                  })
                : null),
            U.h('p', { class: 'truncate text-xs text-muted', text: r.otherActivityName + ' / ' + r.otherStationName }))));

        li.appendChild(U.h('div', { class: 'flex flex-wrap gap-1.5', style: { marginTop: '8px' } },
          U.h('button', {
            class: 'btn btn-outline btn-sm', type: 'button',
            title: 'ثبت زمان عنصر موازی در برگهٔ زمان‌سنجی انجام می‌شود',
            onclick: function () { appNavigate('/p/' + projectId + '/timing'); },
          }, U.icon('timer'), 'ورود به زمان‌سنجی'),
          U.h('button', {
            class: 'btn btn-ghost btn-sm', type: 'button', style: { color: 'var(--red)' },
            onclick: function () { confirmDel = !confirmDel; drawRow(); },
          }, U.icon('trash'), 'حذف رابطه')));

        if (confirmDel) {
          var pairLabel = elementName + ' ↔ ' + r.otherElementName;
          li.appendChild(U.h('div', { class: 'mx-confirm-red flex flex-col gap-2', style: { marginTop: '8px' } },
            U.h('p', { text: 'رابطهٔ ' + pairLabel + ' آرشیو می‌شود و زیرردیف آن از برگهٔ زمان‌سنجی حذف می‌شود؛ زمان‌های ثبت‌شدهٔ عناصر دست‌نخورده می‌مانند و با بازگردانی رابطه، زیرردیف دوباره نمایش داده می‌شود. ادامه می‌دهید؟' }),
            U.h('div', { class: 'flex justify-end gap-2' },
              U.h('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: 'انصراف', onclick: function () { confirmDel = false; drawRow(); } }),
              U.h('button', {
                class: 'btn btn-destructive btn-sm', type: 'button', text: 'بله، حذف کن',
                onclick: function () {
                  try {
                    DB.archiveOverlapRelation(r.relationId);
                    UI.toast('رابطه آرشیو شد', {
                      description: 'زیرردیف آن از برگهٔ زمان‌سنجی حذف می‌شود؛ از بخش «روابط آرشیوشده» قابل بازگردانی است.',
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
     *  بدون خود و بدون رابطهٔ فعال تکراری — v1.5.1 §۲ / v1.5.2 §۲-۵ (کاتالوگ مستقل) */
    function buildInlineAdd() {
      var box = U.h('div', { class: 'mx-quick-editor flex flex-col gap-2' });
      var selected = null;
      var confirming = false;
      var catalogAll = [];
      try {
        catalogAll = DB.getElementsCatalog(projectId).elementsCatalog;
      } catch (e) { catalogAll = []; }
      /* v1.5.1 §۲ — روابط فعال تکراری پیشنهاد نمی‌شوند؛ محدودیت هم‌فعالیت حذف شد */
      var relatedIds = {};
      try {
        DB.getElementRelations(elementId).rows
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
              + '، زیرردیف زمان‌سنجی این عنصر در برگهٔ هر دو فعالیتِ درگیر و برای همهٔ اپراتورها نمایش داده می‌شود و زمان آن به‌صورت بازهٔ «از/تا» در همین چرخه‌ها قابل ثبت خواهد بود. ادامه می‌دهید؟'),
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
