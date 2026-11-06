/* ═══════════════════════════════════════════════════════════
   انتخاب‌گر تاریخ جلالی — نسخه آفلاین — FR-29
   پورت وفادار از src/components/common/JalaliDatePicker.tsx
   تقویم شمسی Popover + پذیرش ورود دستی؛ مقدار ISO میلادی
   تقویم/ارقام از DB.getDisplayPrefs() خوانده می‌شود.
   کاملاً محلی — بدون CDN، بدون React، سازگار با file://
   ═══════════════════════════════════════════════════════════ */
(function (g) {
  'use strict';
  var U = g.T2U;

  /** شماره روز هفته از تاریخ جلالی (۰=شنبه) — معادل jalaliWeekDay در src/lib/jalali.ts */
  function weekDay(jy, jm, jd) {
    var gg = U.toGregorian(jy, jm, jd);
    var d = new Date(Date.UTC(gg.gy, gg.gm - 1, gg.gd));
    return (d.getUTCDay() + 1) % 7;
  }

  function prefs() {
    return (g.T2DB && g.T2DB.getDisplayPrefs && g.T2DB.getDisplayPrefs()) || { calendar: 'jalali', digits: 'persian', decimals: 2 };
  }
  function applyDigits(text, mode) {
    return mode === 'persian' ? U.toPersianDigits(text).replace(/\./g, '٫') : text;
  }

  /**
   * انتخاب‌گر تاریخ — هم‌ارز JalaliDatePicker.tsx
   * @param {object} opts { value: ISO|null, onChange: (iso|null), ariaLabel?, disabled? }
   * @returns {{el: HTMLElement, getISO: Function, setISO: Function}}
   */
  function datePicker(opts) {
    opts = opts || {};
    var iso = opts.value || null;

    // ── حالت میلادی: input[type=date] مثل نسخه اصلی ──
    function renderGregorian() {
      var input = U.h('input', {
        class: 'input ltr', type: 'date', value: iso || '',
        'aria-label': opts.ariaLabel || 'تاریخ مطالعه',
      });
      if (opts.disabled) input.disabled = true;
      input.addEventListener('change', function () {
        iso = input.value || null;
        emit();
      });
      el = U.h('div', { class: 'flex flex-col gap-1' }, input);
    }

    // ── حالت شمسی: دکمه + Popover تقویم ──
    var view = iso ? U.isoToJalali(iso) : null;
    if (!view) view = U.todayJalali();
    var manual = '';
    var open = false;

    function emit() { if (opts.onChange) opts.onChange(iso); }

    function displayText() {
      if (!iso) return '';
      var j = U.isoToJalali(iso);
      if (!j) return iso;
      var p = prefs();
      return applyDigits(j.jd + ' ' + U.JALALI_MONTH_NAMES[j.jm - 1] + ' ' + j.jy, p.digits);
    }

    var labelEl, pop, gridEl, manualIn, errorEl;

    function moveMonth(delta) {
      var jm = view.jm + delta, jy = view.jy;
      if (jm > 12) { jm = 1; jy += 1; }
      if (jm < 1) { jm = 12; jy -= 1; }
      view = { jy: jy, jm: jm, jd: 1 };
      renderCal();
    }
    function moveYear(delta) {
      view = { jy: view.jy + delta, jm: view.jm, jd: 1 };
      renderCal();
    }
    function pick(jd) {
      iso = U.jalaliToISO(view.jy, view.jm, jd);
      manual = '';
      closePop();
      refreshLabel();
      emit();
    }

    /** ورود دستی: ۱۴۰۴/۰۸/۱۳ یا 1404-08-13 — معادل applyManual نسخه اصلی */
    function applyManual() {
      var s = U.normalizeDigits(manualIn.value).trim();
      var m = /^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/.exec(s);
      if (m) {
        var jy = Number(m[1]), jm = Number(m[2]), jd = Number(m[3]);
        if (U.isValidJalali(jy, jm, jd)) {
          iso = U.jalaliToISO(jy, jm, jd);
          manual = '';
          manualIn.value = '';
          errorEl.style.display = 'none';
          view = { jy: jy, jm: jm, jd: 1 };
          closePop();
          refreshLabel();
          emit();
          return;
        }
      }
      errorEl.style.display = 'block';
    }

    function refreshLabel() {
      var p = prefs();
      var t = displayText();
      labelEl.textContent = t || 'انتخاب تاریخ…';
      labelEl.className = 'dp-label' + (t ? '' : ' empty');
    }

    function renderCal() {
      if (!gridEl) return;
      var p = prefs();
      // سربرگ: سال + ماه
      U.clear(titleEl);
      titleEl.appendChild(U.h('button', { class: 'dp-year-btn', type: 'button', 'aria-label': 'سال قبل', onclick: function () { moveYear(-1); } }, '‹'));
      titleEl.appendChild(U.h('span', { class: 'num', text: applyDigits(String(view.jy), p.digits) }));
      titleEl.appendChild(U.h('button', { class: 'dp-year-btn', type: 'button', 'aria-label': 'سال بعد', onclick: function () { moveYear(1); } }, '›'));
      titleEl.appendChild(U.h('span', { class: 'dp-sep', text: '|', style: { color: 'var(--muted-foreground)', margin: '0 4px' } }));
      titleEl.appendChild(U.h('span', { text: U.JALALI_MONTH_NAMES[view.jm - 1] }));
      // شبکه روزها
      U.clear(gridEl);
      var len = U.jalCalMonthLength(view.jy, view.jm);
      var firstWeekday = weekDay(view.jy, view.jm, 1);
      var selected = iso ? U.isoToJalali(iso) : null;
      var today = U.todayJalali();
      for (var e = 0; e < firstWeekday; e++) gridEl.appendChild(U.h('span'));
      for (var jd = 1; jd <= len; jd++) {
        (function (day) {
          var isSel = selected && selected.jy === view.jy && selected.jm === view.jm && selected.jd === day;
          var isToday = today.jy === view.jy && today.jm === view.jm && today.jd === day;
          gridEl.appendChild(U.h('button', {
            class: 'dp-day num' + (isSel ? ' selected' : '') + (isToday ? ' today' : ''),
            type: 'button', text: applyDigits(String(day), p.digits),
            'aria-label': 'انتخاب ' + applyDigits(view.jy + '/' + view.jm + '/' + day, p.digits),
            'aria-pressed': isSel ? 'true' : 'false',
            onclick: function () { pick(day); },
          }));
        })(jd);
      }
    }

    var titleEl;

    function openPop() {
      open = true;
      view = iso ? U.isoToJalali(iso) : U.todayJalali();
      pop.classList.add('open');
      renderCal();
      clampPosition();
      setTimeout(function () { try { pop.querySelector('.dp-day.selected') || pop.querySelector('.dp-day:not(.empty)') || pop.querySelector('button').focus(); } catch (e) {} }, 30);
    }
    function closePop() {
      open = false;
      pop.classList.remove('open');
      errorEl.style.display = 'none';
    }
    function togglePop() { if (open) closePop(); else openPop(); }

    /** جلوگیری از خروج پاپ‌اور از لبه صفحه — معادل collision-avoidance نسخه اصلی:
        اگر پایین جا نبود، به بالای دکمه باز می‌شود؛ سپس clamp افقی */
    function clampPosition() {
      pop.style.top = '';
      pop.style.bottom = 'auto';
      pop.style.left = '';
      pop.style.right = 'auto';
      pop.style.insetInlineStart = '';
      var vw = g.innerWidth || document.documentElement.clientWidth;
      var vh = g.innerHeight || document.documentElement.clientHeight;
      var rect = pop.getBoundingClientRect();
      /* flip عمودی: ترجیح پایین (مطابق پیش‌فرض Popover)، در نبود جا → بالا */
      if (rect.bottom > vh - 8) {
        pop.style.top = 'auto';
        pop.style.bottom = 'calc(100% + 6px)';
        rect = pop.getBoundingClientRect();
        /* اگر بالا هم بیرون زد (صفحهٔ خیلی کوتاه) → برگرد به پایین */
        if (rect.top < 8) {
          pop.style.top = '';
          pop.style.bottom = 'auto';
          rect = pop.getBoundingClientRect();
        }
      }
      /* clamp افقی */
      if (rect.left < 8) {
        pop.style.insetInlineStart = 'auto';
        pop.style.left = '8px';
      } else if (rect.right > vw - 8) {
        pop.style.insetInlineStart = 'auto';
        pop.style.right = '8px';
      }
    }

    function renderJalali() {
      labelEl = U.h('span', { class: 'dp-label' });
      refreshLabel();
      var trigger = U.h('button', {
        class: 'btn btn-outline dp-trigger', type: 'button',
        'aria-label': opts.ariaLabel || 'انتخاب تاریخ مطالعه',
        'aria-haspopup': 'dialog', 'aria-expanded': 'false',
      }, labelEl, U.icon('calendarDays'));
      if (opts.disabled) trigger.disabled = true;

      titleEl = U.h('div', { class: 'dp-title' });
      gridEl = U.h('div', { class: 'dp-grid', role: 'grid', 'aria-label': 'روزهای ماه' });
      manualIn = U.h('input', { class: 'input ltr', type: 'text', placeholder: 'ورود دستی: ۱۴۰۴/۰۸/۱۳', 'aria-label': 'ورود دستی تاریخ' });
      errorEl = U.h('p', { class: 'dp-error', style: { display: 'none' }, text: 'قالب تاریخ نامعتبر است. مثال: ۱۴۰۴/۰۸/۱۳' });

      manualIn.addEventListener('input', function () { manual = manualIn.value; });
      manualIn.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); applyManual(); }
      });

      var weekRow = U.h('div', { class: 'dp-week', 'aria-hidden': 'true' },
        U.JALALI_WEEKDAY_SHORT.map(function (d) { return U.h('span', { text: d }); }));

      pop = U.h('div', { class: 'dp-pop', role: 'dialog', 'aria-label': 'تقویم شمسی', onclick: function (e) { e.stopPropagation(); } },
        U.h('div', { class: 'dp-head' },
          U.h('button', { class: 'icon-btn sm', type: 'button', 'aria-label': 'ماه قبل', onclick: function () { moveMonth(-1); } }, U.icon('chevronRight')),
          titleEl,
          U.h('button', { class: 'icon-btn sm', type: 'button', 'aria-label': 'ماه بعد', onclick: function () { moveMonth(1); } }, U.icon('chevronLeft'))),
        U.h('div', { class: 'p-2' }, weekRow, gridEl),
        U.h('div', { class: 'dp-foot' },
          manualIn,
          U.h('button', { class: 'btn btn-sm', type: 'button', text: 'ثبت', onclick: applyManual }),
          U.h('button', {
            class: 'btn btn-sm btn-ghost', type: 'button', text: 'پاک‌کردن',
            onclick: function () { iso = null; manual = ''; manualIn.value = ''; closePop(); refreshLabel(); emit(); },
          })),
        errorEl);

      trigger.addEventListener('click', function (e) {
        e.stopPropagation();
        trigger.setAttribute('aria-expanded', open ? 'false' : 'true');
        togglePop();
      });
      // Esc — مطابق رفتار Popover نسخه اصلی
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && open) { closePop(); trigger.focus(); }
      });
      // کلیک بیرون
      document.addEventListener('click', function (e) {
        if (open && !pop.contains(e.target) && e.target !== trigger && !trigger.contains(e.target)) closePop();
      });

      el = U.h('div', { class: 'dp-root' }, trigger, pop);
    }

    var el;
    if (prefs().calendar === 'gregorian') renderGregorian();
    else renderJalali();

    return {
      el: el,
      getISO: function () { return iso; },
      setISO: function (v) {
        iso = v || null;
        if (pop) {
          view = iso ? U.isoToJalali(iso) : U.todayJalali();
          refreshLabel();
          if (open) renderCal();
        } else {
          // حالت میلادی: به‌روزرسانی مقدار input
          var input = el.querySelector('input[type="date"]');
          if (input) input.value = iso || '';
        }
        emit();
      },
      /** تغییر تنظیمات تقویم پس از ساخت — بدون جابه‌جایی مقدار ISO */
      rebuild: function () {
        var parent = el.parentNode;
        var oldEl = el;
        var wasGregorian = !pop;
        var wantGregorian = prefs().calendar === 'gregorian';
        if (wasGregorian === wantGregorian) {
          // فقط ارقام عوض شده — برچسب/شبکه بازرندی می‌شوند
          if (pop) { refreshLabel(); if (open) renderCal(); }
          return;
        }
        if (wantGregorian) renderGregorian();
        else renderJalali();
        if (parent) parent.replaceChild(el, oldEl);
      },
    };
  }

  g.T2DATE = { datePicker: datePicker, weekDay: weekDay };
})(typeof window !== 'undefined' ? window : globalThis);
