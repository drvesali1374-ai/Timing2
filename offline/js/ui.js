/* ═══════════════════════════════════════════════════════════
   کیت UI — نسخه آفلاین
   معادل shadcn/ui + کامپوننت‌های مشترک نسخه وب
   ═══════════════════════════════════════════════════════════ */
(function (g) {
  'use strict';
  var U = g.T2U;

  // ── Toast ──
  var toastRoot = null;
  function ensureToastRoot() {
    if (!toastRoot) {
      toastRoot = U.h('div', { class: 'toast-root', role: 'status', 'aria-live': 'polite' });
      document.body.appendChild(toastRoot);
    }
    return toastRoot;
  }
  function toast(message, opts) {
    opts = opts || {};
    var type = opts.type || (opts.description ? 'info' : 'success');
    var icons = { success: 'checkCircle', error: 'xCircle', warning: 'alertTriangle', info: 'info' };
    var el = U.h('div', { class: 'toast ' + type },
      U.icon(icons[type] || 'info'),
      U.h('div', { class: 'min-w-0' },
        U.h('div', { class: 'toast-title', text: message }),
        opts.description ? U.h('div', { class: 'toast-desc', text: opts.description }) : null),
      opts.actionLabel ? U.h('button', {
        class: 'btn btn-sm btn-brand-soft toast-close', text: opts.actionLabel,
        onclick: function () { remove(); if (opts.onAction) opts.onAction(); },
      }) : null,
      U.h('button', { class: 'icon-btn sm toast-close', 'aria-label': 'بستن اعلان', onclick: function () { remove(); } }, U.icon('x'))
    );
    function remove() { if (el.parentNode) el.parentNode.removeChild(el); }
    ensureToastRoot().appendChild(el);
    setTimeout(remove, opts.duration || 5000);
  }
  g.T2Toast = toast;

  // ── Dialog ──
  var openDialogs = [];
  function dialog(opts) {
    opts = opts || {};
    var dlg = { closed: false };
    var bodyEl = U.h('div', { class: 'dialog-body' });
    var footerEl = opts.footerBuilder ? opts.footerBuilder(close) : U.h('div', { class: 'dialog-footer' });
    var titleRow = U.h('div', { class: 'dialog-header' },
      U.h('div', null,
        U.h('h2', { class: 'dialog-title', text: opts.title || '' }),
        opts.desc ? U.h('p', { class: 'dialog-desc', text: opts.desc }) : null),
      U.h('button', { class: 'icon-btn', 'aria-label': 'بستن', onclick: close }, U.icon('x'))
    );
    var dialogEl = U.h('div', { class: 'dialog ' + (opts.size || ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': opts.title || 'پنجره' },
      opts.red ? U.h('div', { class: 'dialog-red-header' }, U.icon('alertTriangle'), U.h('span', { text: opts.title || '' })) : null,
      opts.red ? null : titleRow,
      bodyEl,
      footerEl
    );
    if (opts.red && opts.desc) bodyEl.insertBefore(U.h('p', { class: 'text-sm text-muted', text: opts.desc }), bodyEl.firstChild);
    var overlay = U.h('div', { class: 'dialog-overlay', onclick: function (e) { if (e.target === overlay && opts.dismissable !== false) close(); } }, dialogEl);
    function close() {
      if (dlg.closed) return;
      dlg.closed = true;
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      openDialogs = openDialogs.filter(function (d) { return d !== dlg; });
      if (opts.onClose) opts.onClose();
    }
    dlg.close = close;
    dlg.body = bodyEl;
    dlg.footer = footerEl;
    if (opts.bodyBuilder) opts.bodyBuilder(bodyEl, close, dlg);
    document.body.appendChild(overlay);
    openDialogs.push(dlg);
    overlay.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && openDialogs[openDialogs.length - 1] === dlg) { e.stopPropagation(); close(); }
    });
    setTimeout(function () {
      var first = dialogEl.querySelector('input, textarea, select, button.btn');
      if (first && document.activeElement !== first) first.focus();
    }, 40);
    return dlg;
  }

  function alertDialog(opts) {
    return dialog({
      title: opts.title, desc: opts.message, dismissable: false,
      bodyBuilder: function (body) {
        body.appendChild(U.h('div', { class: 'banner ' + (opts.tone || 'warning') }, U.icon(opts.tone === 'error' ? 'xCircle' : 'alertTriangle'), U.h('div', { text: opts.detail || '' })));
      },
      footerBuilder: function (close) {
        return U.h('div', { class: 'dialog-footer' },
          U.h('button', { class: 'btn btn-brand', text: 'متوجه شدم', onclick: close }));
      },
    });
  }

  function confirmDialog(opts) {
    return new Promise(function (resolve) {
      var done = false;
      function finish(v) { if (!done) { done = true; resolve(v); } }
      dialog({
        title: opts.title, desc: opts.desc, dismissable: false,
        bodyBuilder: function (body) {
          if (opts.body) opts.body(body);
        },
        footerBuilder: function (close) {
          return U.h('div', { class: 'dialog-footer' },
            U.h('button', { class: 'btn', text: opts.cancelLabel || 'انصراف', onclick: function () { finish(false); close(); } }),
            U.h('div', { class: 'spacer' }),
            U.h('button', {
              class: 'btn ' + (opts.destructive ? 'btn-destructive' : 'btn-brand'),
              text: opts.confirmLabel || 'تأیید',
              onclick: function () { finish(true); close(); },
            }));
        },
        onClose: function () { finish(false); },
      });
    });
  }

  /** دیالوگ حذف دائمی با شمارش وابستگی‌ها */
  function confirmDelete(opts) {
    var deps = opts.deps || {};
    var depKeys = Object.keys(deps).filter(function (k) { return deps[k] > 0; });
    return new Promise(function (resolve) {
      var done = false;
      function finish(v) { if (!done) { done = true; resolve(v); } }
      dialog({
        title: opts.title, red: true, dismissable: false, desc: opts.desc,
        bodyBuilder: function (body) {
          body.appendChild(U.h('p', { class: 'text-sm leading-relaxed' },
            U.h('span', { text: '«' + opts.name + '» به‌صورت ' }),
            U.h('b', { text: 'دائمی' }),
            U.h('span', { text: ' حذف خواهد شد. این عملیات قابل بازگشت نیست و سطل بازیافت وجود ندارد.' })));
          body.appendChild(U.h('div', { class: 'rounded-lg bg-red-soft p-3' },
            U.h('div', { class: 'text-xs font-bold text-red mb-2', text: 'داده‌های وابسته که همزمان حذف می‌شوند:' }),
            depKeys.length > 0
              ? U.h('ul', { class: 'list-none text-xs', style: { color: 'var(--foreground)' } },
                  depKeys.map(function (k) { return U.h('li', null, '• ' + k + ': ' + U.formatInt(deps[k])); }))
              : U.h('div', { class: 'text-xs text-muted', text: 'موردی وابسته به این رکورد وجود ندارد.' })));
          body.appendChild(U.h('p', { class: 'text-xs text-muted leading-relaxed', text: 'برای حفظ قابلیت پیگیری، رویداد حداقلی حذف در تاریخچه ثبت می‌شود. نسخه‌های پشتیبان قدیمی ممکن است تا زمان چرخش حاوی این داده باشند؛ بازیابی آن‌ها با نشانگر حذف کنترل می‌شود.' }));
        },
        footerBuilder: function (close) {
          return U.h('div', { class: 'dialog-footer' },
            U.h('button', { class: 'btn', text: 'انصراف', onclick: function () { finish(false); close(); } }),
            U.h('div', { class: 'spacer' }),
            U.h('button', {
              class: 'btn btn-destructive', text: 'حذف دائمی',
              onclick: function () { finish(true); close(); },
            }));
        },
        onClose: function () { finish(false); },
      });
    });
  }

  // ── HelpDot ──
  // v1.5.2 §۶.۱: پاپ‌اور در لایهٔ ثابت سطح body رندر می‌شود (خارج از
  // والد‌های دارای overflow-hidden/stacking context) و با z-index 9999
  // همیشه روی کارت‌ها و دیالوگ‌هاست. §۶.۲: فقط کلیک روی خود آیکون باز می‌کند.
  var openHelp = null;
  function positionFixedPop(anchor, pop, offset) {
    var r = anchor.getBoundingClientRect();
    pop.style.visibility = 'hidden';
    var w = pop.offsetWidth, h = pop.offsetHeight;
    var x = r.left + r.width / 2 - w / 2;
    x = Math.max(8, Math.min(x, window.innerWidth - w - 8));
    var y = r.top - h - (offset || 6);
    if (y < 8) y = r.bottom + (offset || 6);
    pop.style.left = x + 'px';
    pop.style.top = y + 'px';
    pop.style.visibility = '';
  }
  function trackOpenPop(anchor, pop) {
    var reposition = function () { if (document.body.contains(pop)) positionFixedPop(anchor, pop); };
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return function untrack() {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }
  function helpDot(label, content) {
    if (!content) return null;
    var btn = U.h('button', { class: 'helpdot', type: 'button', 'aria-label': 'راهنمای ' + (label || ''), title: 'راهنما' }, U.icon('circleHelp'));
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (openHelp && openHelp.btn === btn) { closeHelp(); return; }
      closeHelp();
      var pop = U.h('div', { class: 'helpdot-pop is-open', dir: 'rtl', onclick: function (e) { e.stopPropagation(); } },
        U.h('div', { class: 'hd-head', text: 'راهنمای ' + (label || 'این مورد') }),
        U.h('div', { class: 'hd-sec' }, U.h('b', { text: 'این مورد چیست؟' }), U.h('div', { text: content.what || '' })),
        content.input ? U.h('div', { class: 'hd-sec' }, U.h('b', { text: 'چه چیزی وارد کنم؟' }), U.h('div', { text: content.input })) : null,
        content.example ? U.h('div', { class: 'hd-example' }, U.h('b', { class: 'block', text: 'مثال' }), U.h('div', { text: content.example })) : null,
        content.note ? U.h('div', { class: 'hd-note' }, U.h('b', { text: 'نکته مهم' }), U.h('div', { style: { color: 'var(--foreground)' }, text: content.note })) : null
      );
      document.body.appendChild(pop);
      positionFixedPop(btn, pop);
      var untrack = trackOpenPop(btn, pop);
      openHelp = { btn: btn, pop: pop, untrack: untrack };
    });
    return btn;
  }
  function closeHelp() {
    if (openHelp) {
      if (openHelp.untrack) openHelp.untrack();
      if (openHelp.pop.parentNode) openHelp.pop.parentNode.removeChild(openHelp.pop);
      openHelp = null;
    }
  }
  document.addEventListener('click', function () { closeHelp(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeHelp(); });

  // ── پاپ‌اور کوچک «توضیح» — معادل Tooltip وب (v1.5.2 §۴.۲) ──
  var openNote = null;
  function noteDot(text, ariaLabel) {
    var btn = U.h('button', {
      class: 'note-dot', type: 'button',
      'aria-label': ariaLabel || 'توضیح وضعیت',
    }, U.icon('circleHelp'), 'توضیح');
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (openNote && openNote.btn === btn) { closeNote(); return; }
      closeNote();
      var pop = U.h('div', { class: 'note-pop is-open', dir: 'rtl', onclick: function (ev) { ev.stopPropagation(); } },
        U.h('p', { style: { margin: 0, lineHeight: '1.75' }, text: text }));
      document.body.appendChild(pop);
      positionFixedPop(btn, pop);
      var untrack = trackOpenPop(btn, pop);
      openNote = { btn: btn, pop: pop, untrack: untrack };
    });
    return btn;
  }
  function closeNote() {
    if (openNote) {
      if (openNote.untrack) openNote.untrack();
      if (openNote.pop.parentNode) openNote.pop.parentNode.removeChild(openNote.pop);
      openNote = null;
    }
  }
  document.addEventListener('click', function () { closeNote(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeNote(); });

  // ── عنوان چسبان بخش‌های اصلی — معادل SectionHeading وب (v1.5.2 §۸) ──
  // عنصر باید top: calc(3.5rem - 1px) داشته باشد (کلاس sticky-heading در app.css).
  function stickyHeading(el) {
    if (!el || typeof IntersectionObserver === 'undefined') return el;
    el.classList.add('sticky-heading');
    el.setAttribute('data-stuck', 'false');
    var io = new IntersectionObserver(function (entries) {
      var e = entries[0];
      el.setAttribute('data-stuck', (e.intersectionRatio < 1 && e.boundingClientRect.top < 56) ? 'true' : 'false');
    }, { threshold: [1], rootMargin: '-56px 0px 0px 0px' });
    io.observe(el);
    return el;
  }

  // ── Badge / EmptyState ──
  function badge(text, variant, iconName) {
    return U.h('span', { class: 'badge ' + (variant || 'muted') }, iconName ? U.icon(iconName) : null, text);
  }
  function emptyState(opts) {
    return U.h('div', { class: 'empty-state' },
      U.h('div', { class: 'icon-wrap' }, U.icon(opts.icon || 'package')),
      U.h('h3', { class: 'font-bold', text: opts.title }),
      opts.desc ? U.h('p', { class: 'text-sm text-muted leading-relaxed', style: { maxWidth: '384px' }, text: opts.desc }) : null,
      opts.actionLabel ? U.h('button', { class: 'btn btn-brand', onclick: opts.onAction }, U.icon('plus'), opts.actionLabel) : null);
  }

  // ── Tabs ──
  function tabsBar(items, activeKey, onChange) {
    var bar = U.h('div', { class: 'tabs-bar', role: 'tablist' });
    items.forEach(function (it) {
      bar.appendChild(U.h('button', {
        class: 'tab' + (it.key === activeKey ? ' active' : ''), role: 'tab',
        'aria-selected': it.key === activeKey ? 'true' : 'false',
        onclick: function () { onChange(it.key); },
      }, it.icon ? U.icon(it.icon) : null, it.label, it.count !== undefined ? badge(U.formatInt(it.count), it.key === activeKey ? 'brand' : 'muted') : null));
    });
    return bar;
  }

  // ── Inputs ──
  function persianNumberInput(opts) {
    opts = opts || {};
    var input = U.h('input', {
      class: 'input num' + (opts.ltr === false ? '' : ' ltr'), type: 'text', inputmode: 'decimal',
      value: opts.value !== null && opts.value !== undefined ? String(opts.value) : '',
      placeholder: opts.placeholder || '',
      'aria-label': opts.ariaLabel || opts.label || '',
    });
    input.addEventListener('input', function () {
      var n = U.parseNumber(input.value);
      if (input.value.trim() === '') { opts.onChange(null); return; }
      if (isNaN(n)) { opts.onChange(NaN); return; }
      if (opts.min !== undefined && n < opts.min) n = opts.min;
      if (opts.max !== undefined && n > opts.max) n = opts.max;
      opts.onChange(n);
    });
    input.addEventListener('blur', function () {
      var n = U.parseNumber(input.value);
      if (!isNaN(n) && input.value.trim() !== '') {
        if (opts.min !== undefined && n < opts.min) n = opts.min;
        if (opts.max !== undefined && n > opts.max) n = opts.max;
        input.value = opts.decimals === false ? String(Math.round(n)) : String(n);
      }
    });
    if (opts.disabled) input.disabled = true;
    var wrap = input;
    if (opts.suffix) {
      wrap = U.h('div', { class: 'flex items-center gap-1' }, input, U.h('span', { class: 'text-xs text-muted shrink-0', text: opts.suffix }));
    }
    return wrap;
  }
  function percentInput(opts) {
    var input = U.h('input', {
      class: 'input num ltr', type: 'text', inputmode: 'decimal',
      value: opts.value !== null && opts.value !== undefined ? String(Math.round(opts.value * 10000) / 100) : '',
      placeholder: opts.placeholder || '—',
      'aria-label': opts.ariaLabel || 'درصد',
    });
    input.addEventListener('input', function () {
      if (input.value.trim() === '') { opts.onChange(null); return; }
      var n = U.parseNumber(input.value);
      if (isNaN(n)) { opts.onChange(NaN); return; }
      var dec = Math.max(0, Math.min(99.99, n)) / 100;
      opts.onChange(Math.min(0.9999, dec));
    });
    return input;
  }
  function switchEl(checked, onChange, ariaLabel) {
    var sw = U.h('button', { class: 'switch', type: 'button', 'aria-label': ariaLabel || 'کلید تغییر وضعیت', 'data-on': checked ? 'true' : 'false' });
    sw.addEventListener('click', function () {
      var on = sw.getAttribute('data-on') === 'true';
      sw.setAttribute('data-on', on ? 'false' : 'true');
      onChange(!on);
    });
    return sw;
  }
  function selectEl(options, value, onChange, ariaLabel) {
    var sel = U.h('select', { class: 'select', 'aria-label': ariaLabel || '' });
    options.forEach(function (o) {
      var opt = U.h('option', { value: o.value }, o.label);
      if (o.value === value) opt.selected = true;
      sel.appendChild(opt);
    });
    sel.addEventListener('change', function () { onChange(sel.value); });
    return sel;
  }
  function field(labelText, inputEl, helpContent, hint) {
    return U.h('div', null,
      U.h('label', { class: 'field-label' }, labelText, helpContent ? helpDot(labelText, helpContent) : null),
      inputEl,
      hint ? U.h('div', { class: 'hint', text: hint }) : null);
  }
  function metric(label, value) {
    return U.h('div', { class: 'metric' },
      U.h('div', { class: 'm-label', text: label }),
      U.h('div', { class: 'm-value num', text: value }));
  }

  // ── SaveIndicator ──
  function saveIndicator(state) {
    var texts = { dirty: 'تغییرات در صف ذخیره…', saving: 'در حال ذخیره…', saved: 'ذخیره شد', error: 'خطا در ذخیره‌سازی' };
    if (!state) return null;
    return U.h('span', { class: 'save-indicator ' + state }, U.h('span', { class: 'dot' }), texts[state] || '');
  }

  // ── Dropdown ──
  function dropdownMenu(items, triggerOpts) {
    var root = U.h('div', { class: 'dd-root' });
    var tOpts = triggerOpts || {};
    var btn = U.h('button', { class: tOpts.class || 'icon-btn', type: 'button', 'aria-label': tOpts['aria-label'] || 'منوی عملیات' }, U.icon(tOpts.iconName || 'moreVertical'));
    var menu = null;
    function closeMenu() { if (menu && menu.parentNode) menu.parentNode.removeChild(menu); menu = null; }
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (menu) { closeMenu(); return; }
      menu = U.h('div', { class: 'dd-menu', role: 'menu' });
      items.forEach(function (it) {
        if (it === '-') { menu.appendChild(U.h('div', { class: 'dd-sep' })); return; }
        menu.appendChild(U.h('button', {
          class: 'dd-item' + (it.destructive ? ' danger' : ''), role: 'menuitem',
          onclick: function (e2) { e2.stopPropagation(); closeMenu(); it.onClick(); },
        }, it.icon ? U.icon(it.icon) : null, it.label));
      });
      root.appendChild(menu);
    });
    document.addEventListener('click', closeMenu);
    root.appendChild(btn);
    return root;
  }

  // ── Collapsible card ──
  function collapsibleCard(title, iconName, contentBuilder, defaultOpen, extra) {
    var open = defaultOpen !== false;
    var bodyWrap = U.h('div', { class: 'collapsible-body' });
    var card = U.h('div', { class: 'card collapsible-card' },
      U.h('div', { class: 'collapsible-head' },
        U.h('span', { class: 'chip-icon' + ((extra && extra.chipTone) || '') }, U.icon(iconName)),
        U.h('div', { class: 'flex-1 min-w-0' },
          U.h('div', { class: 'font-bold text-sm', text: title }),
          extra && extra.subtitle ? U.h('div', { class: 'text-xs text-muted', text: extra.subtitle }) : null),
        extra && extra.headerExtra ? extra.headerExtra : null,
        U.h('span', { class: 'text-faint coll-chevron' }, U.icon('chevronDown'))),
      bodyWrap);
    function render() {
      U.clear(bodyWrap);
      var chev = card.querySelector('.collapsible-head .coll-chevron svg');
      if (open) {
        bodyWrap.style.display = '';
        if (chev) chev.style.transform = 'rotate(180deg)';
        contentBuilder(bodyWrap);
      } else {
        bodyWrap.style.display = 'none';
        if (chev) chev.style.transform = '';
      }
    }
    card.querySelector('.collapsible-head').addEventListener('click', function (e) {
      if (e.target.closest('button') && !e.target.closest('.collapsible-head').isSameNode(e.target.closest('button').parentNode.parentNode)) { /* allow inner buttons */ }
      open = !open;
      render();
    });
    render();
    card.rerender = render;
    return card;
  }

  // ── ProjectStatusBadge — رنگ/آیکون عیناً از StatusBadge.tsx ──
  function projectStatusBadge(status) {
    var map = {
      DRAFT: { label: 'پیش‌نویس', variant: 'muted', icon: 'circleDashed' },
      IN_PROGRESS: { label: 'در حال انجام', variant: 'cyan', icon: 'hourglass' },
      FINALIZED: { label: 'نهایی‌شده', variant: 'green', icon: 'checkCircle' },
    };
    var m = map[status] || map.IN_PROGRESS;
    return badge(m.label, m.variant, m.icon);
  }
  // ── StageStatusBadge — رنگ/آیکون عیناً از StatusBadge.tsx ──
  function stageStatusBadge(status, label) {
    var map = {
      PENDING: { variant: 'muted', icon: 'circle' },
      IN_PROGRESS: { variant: 'cyan', icon: 'hourglass' },
      DONE: { variant: 'green', icon: 'checkCircle' },
      NEEDS_REVIEW: { variant: 'amber', icon: 'alertTriangle' },
      FUTURE_PHASE: { variant: 'muted', icon: 'lock' },
    };
    var m = map[status] || map.PENDING;
    var text = status === 'FUTURE_PHASE' ? 'فاز بعدی' : (label || '');
    return badge(text, m.variant, m.icon);
  }

  // ═══════════ چارت‌های SVG ═══════════
  var NS = 'http://www.w3.org/2000/svg';
  function svgEl(tag, attrs) {
    var el = document.createElementNS(NS, tag);
    for (var k in attrs) el.setAttribute(k, attrs[k]);
    return el;
  }
  function faNum(v) { return U.toPersianDigits(String(v)); }

  function barChart(opts) {
    var data = opts.data || [];
    var W = opts.width || 560, H = opts.height || 240;
    var padB = 44, padT = 16, padL = 10, padR = 10;
    var svg = svgEl('svg', { class: 'stat-chart', viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': opts.ariaLabel || 'نمودار ستونی' });
    if (data.length === 0) { svg.appendChild(svgEl('text', { x: W / 2, y: H / 2, 'text-anchor': 'middle', fill: 'var(--faint)', 'font-size': 12 })).textContent = 'داده‌ای برای نمایش وجود ندارد.'; return svg; }
    var maxV = Math.max.apply(null, data.map(function (d) { return d.value; })) * 1.12 || 1;
    var innerW = W - padL - padR, innerH = H - padT - padB;
    var slot = innerW / data.length;
    var barW = Math.min(opts.maxBarSize || 48, slot * 0.6);
    data.forEach(function (d, i) {
      var bh = Math.max(2, (d.value / maxV) * innerH);
      var x = padL + slot * i + (slot - barW) / 2;
      var y = padT + innerH - bh;
      var bar = svgEl('rect', { x: x, y: y, width: barW, height: bh, rx: 6, fill: d.color || 'var(--brand)', opacity: d.muted ? 0.45 : 1 });
      var title = svgEl('title');
      title.textContent = d.tooltip || (d.label + ': ' + U.formatTimeValue(d.value));
      bar.appendChild(title);
      svg.appendChild(bar);
      var lbl = svgEl('text', { x: padL + slot * i + slot / 2, y: padT + innerH + 16, 'text-anchor': 'middle', 'font-size': 9.5, fill: 'var(--muted-foreground)' });
      lbl.textContent = d.label.length > 11 ? d.label.slice(0, 10) + '…' : d.label;
      if (data.length > 4) lbl.setAttribute('transform', 'rotate(24 ' + (padL + slot * i + slot / 2) + ' ' + (padT + innerH + 16) + ')');
      svg.appendChild(lbl);
      var val = svgEl('text', { x: padL + slot * i + slot / 2, y: y - 5, 'text-anchor': 'middle', 'font-size': 9.5, fill: 'var(--foreground)', 'font-weight': 600 });
      val.textContent = faNum(opts.formatValue ? opts.formatValue(d.value) : U.formatTimeValue(d.value));
      if (data.length <= 8) svg.appendChild(val);
    });
    svg.appendChild(svgEl('line', { x1: padL, y1: padT + innerH, x2: W - padR, y2: padT + innerH, stroke: 'var(--border)', 'stroke-width': 1 }));
    return svg;
  }

  function lineChart(opts) {
    var pts = opts.points || [];
    var W = opts.width || 560, H = opts.height || 240;
    var padB = 34, padT = 14, padL = 38, padR = 14;
    var svg = svgEl('svg', { class: 'stat-chart', viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': opts.ariaLabel || 'نمودار روند' });
    if (pts.length === 0) { svg.appendChild(svgEl('text', { x: W / 2, y: H / 2, 'text-anchor': 'middle', fill: 'var(--faint)', 'font-size': 12 })).textContent = 'داده‌ای برای نمایش روند وجود ندارد.'; return svg; }
    var values = pts.map(function (p) { return p.value; });
    var minV = Math.min.apply(null, values), maxV = Math.max.apply(null, values);
    if (minV === maxV) { minV -= 1; maxV += 1; }
    var span = maxV - minV;
    minV -= span * 0.08; maxV += span * 0.08;
    var innerW = W - padL - padR, innerH = H - padT - padB;
    function X(i) { return pts.length === 1 ? padL + innerW / 2 : padL + (innerW * i) / (pts.length - 1); }
    function Y(v) { return padT + innerH - ((v - minV) / (maxV - minV)) * innerH; }
    var colors = { SUSPECT: 'var(--amber)', EXCLUDED: 'var(--red)', VALID: 'var(--brand)' };
    if (opts.meanLine !== null && opts.meanLine !== undefined && isFinite(opts.meanLine)) {
      svg.appendChild(svgEl('line', { x1: padL, y1: Y(opts.meanLine), x2: W - padR, y2: Y(opts.meanLine), stroke: 'var(--amber)', 'stroke-width': 1.4, 'stroke-dasharray': '5 4' }));
    }
    if (pts.length > 1) {
      var d = '';
      pts.forEach(function (p, i) { d += (i === 0 ? 'M' : 'L') + X(i).toFixed(1) + ' ' + Y(p.value).toFixed(1) + ' '; });
      svg.appendChild(svgEl('path', { d: d, fill: 'none', stroke: 'var(--brand)', 'stroke-width': 2 }));
    }
    pts.forEach(function (p, i) {
      var c = svgEl('circle', { cx: X(i), cy: Y(p.value), r: 3.5, fill: colors[p.status] || colors.VALID, stroke: 'var(--card)', 'stroke-width': 1.4 });
      var title = svgEl('title');
      title.textContent = p.tooltip || ('چرخهٔ ' + faNum(p.label) + ': ' + U.formatTimeValue(p.value) + (p.status === 'SUSPECT' ? ' — مشکوک' : p.status === 'EXCLUDED' ? ' — خارج‌شده' : ''));
      c.appendChild(title);
      svg.appendChild(c);
    });
    for (var gr = 0; gr <= 2; gr++) {
      var v = minV + ((maxV - minV) * gr) / 2;
      var ty = Y(v);
      svg.appendChild(svgEl('line', { x1: padL, y1: ty, x2: W - padR, y2: ty, stroke: 'var(--border)', 'stroke-width': 0.6, 'stroke-dasharray': '2 3' }));
      var t = svgEl('text', { x: padL - 5, y: ty + 3, 'text-anchor': 'end', 'font-size': 9, fill: 'var(--muted-foreground)' });
      t.textContent = faNum(U.formatTimeValue(v, 1));
      svg.appendChild(t);
    }
    var step = Math.max(1, Math.ceil(pts.length / 12));
    pts.forEach(function (p, i) {
      if (i % step !== 0 && i !== pts.length - 1) return;
      var t = svgEl('text', { x: X(i), y: H - 12, 'text-anchor': 'middle', 'font-size': 9, fill: 'var(--muted-foreground)' });
      t.textContent = faNum(p.label);
      svg.appendChild(t);
    });
    return svg;
  }

  function donutChart(opts) {
    var segments = opts.segments || [];
    var total = segments.reduce(function (s, x) { return s + x.value; }, 0);
    var size = opts.size || 170, r = 62, cx = size / 2, cy = size / 2, sw = 22;
    var svg = svgEl('svg', { class: 'stat-chart', viewBox: '0 0 ' + size + ' ' + size, role: 'img', 'aria-label': opts.ariaLabel || 'نمودار دونات' });
    svg.appendChild(svgEl('circle', { cx: cx, cy: cy, r: r, fill: 'none', stroke: 'var(--surface-3)', 'stroke-width': sw }));
    if (total > 0) {
      var acc = 0;
      var C = 2 * Math.PI * r;
      segments.forEach(function (s) {
        if (s.value <= 0) return;
        var frac = s.value / total;
        var dash = frac * C;
        var offset = -acc * C;
        var arc = svgEl('circle', {
          cx: cx, cy: cy, r: r, fill: 'none', stroke: s.color, 'stroke-width': sw,
          'stroke-dasharray': dash + ' ' + (C - dash), 'stroke-dashoffset': offset,
          transform: 'rotate(-90 ' + cx + ' ' + cy + ')',
        });
        var title = svgEl('title');
        title.textContent = s.label + ': ' + faNum(String(s.value));
        arc.appendChild(title);
        svg.appendChild(arc);
        acc += frac;
      });
    }
    var center = svgEl('text', { x: cx, y: cy - 6, class: 'donut-center', 'font-size': 20, 'font-weight': 800, fill: 'var(--foreground)' });
    center.textContent = faNum(String(total));
    svg.appendChild(center);
    var sub = svgEl('text', { x: cx, y: cy + 14, class: 'donut-center', 'font-size': 10, fill: 'var(--muted-foreground)' });
    sub.textContent = opts.centerLabel || 'مجموع';
    svg.appendChild(sub);
    return svg;
  }

  function histogramChart(bins, ariaLabel) {
    var data = bins.map(function (b) {
      return { label: faNum(U.formatTimeValue(b.binStart, 1)), value: b.count, tooltip: 'بازهٔ ' + U.formatTimeValue(b.binStart, 1) + ' تا ' + U.formatTimeValue(b.binEnd, 1) + ': ' + faNum(String(b.count)) + ' مشاهده' };
    });
    return barChart({ data: data, ariaLabel: ariaLabel || 'هیستوگرام توزیع', formatValue: function (v) { return String(Math.round(v)); }, maxBarSize: 64 });
  }

  // ── نماد فرایندی (ProcessSymbol) — بازطراحی v1.5.2 §۳ ──
  // renderer واحد در همهٔ نماها (ساختار، فعالیت، ماتریس، نمودار)؛ CSS patch پراکنده ممنوع.
  // شکل SVG توپر بدون قاب/حاشیه/پس‌زمینهٔ بیرونی؛ رنگ مستقیماً روی خود شکل.
  // رشتهٔ HTML برمی‌گرداند — با U.h('span', { html: UI.processSymbol(...) }) استفاده کنید.
  var PROCESS_SYMBOL_META = {
    OPERATION: { label: 'عملیات' },
    INSPECTION: { label: 'بازرسی' },
    TRANSPORT: { label: 'حمل‌ونقل' },
    DELAY: { label: 'تأخیر' },
    STORAGE: { label: 'انبارش' },
    MATERIAL_INPUT: { label: 'ورودی مواد/قطعات' },
  };
  /** مسیر SVG توپر هر شکل (viewBox 24×24) — عیناً هم‌ارز نسخهٔ وب */
  var PROCESS_SYMBOL_SHAPES = {
    OPERATION: '<circle cx="12" cy="12" r="8.5"/>',
    INSPECTION: '<rect x="4.5" y="4.5" width="15" height="15" rx="2"/>',
    TRANSPORT: '<path d="M4 11.1 12.4 4.3v4.3H20v5h-7.6v4.3z"/>',
    DELAY: '<path d="M5 5h7.6a7 7 0 0 1 0 14H5z"/>',
    STORAGE: '<path d="M4.5 5.5h15L12 19.6z"/>',
    MATERIAL_INPUT: '<path d="M12 3.6 19.7 8v8L12 20.4 4.3 16V8z"/>',
  };
  /** رنگ خود شکل بر اساس نوع — قرارداد رنگی واحد (v1.5.2 §۳: روی خود شکل) */
  var PROCESS_SYMBOL_COLOR = {
    OPERATION: 'var(--brand)',
    INSPECTION: 'var(--amber)',
    TRANSPORT: 'var(--muted-foreground)',
    DELAY: 'var(--red)',
    STORAGE: 'var(--green)',
    MATERIAL_INPUT: 'var(--cyan)',
  };
  function processSymbol(nodeType, size, titleOverride) {
    var s = size === 'sm' || size === 'md' || size === 'lg' ? size : 'md';
    var key = PROCESS_SYMBOL_META[nodeType] ? nodeType : 'OPERATION';
    var label = titleOverride || PROCESS_SYMBOL_META[key].label;
    return '<svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" class="psym psym-' + s +
      '" style="color:' + PROCESS_SYMBOL_COLOR[key] + '" role="img" aria-label="' + U.escapeHtml(label) + '">' +
      '<title>' + U.escapeHtml(label) + '</title>' + PROCESS_SYMBOL_SHAPES[key] + '</svg>';
  }

  // ── جدول کمکی ──
  function table(headers, rowsHtml) {
    var thead = U.h('thead', null, U.h('tr', null, headers.map(function (hd) {
      return U.h('th', { style: (hd && hd.style) || null, text: hd && hd.text !== undefined ? hd.text : hd });
    })));
    var tbody = U.h('tbody');
    if (typeof rowsHtml === 'function') rowsHtml(tbody);
    else rowsHtml.forEach(function (r) { tbody.appendChild(r); });
    return U.h('div', { class: 'table-wrap' }, U.h('table', { class: 'table' }, thead, tbody));
  }

  function toastError(err) {
    toast(err && err.message ? err.message : 'خطای نامشخص رخ داد.', { type: 'error' });
  }

  g.T2UI = {
    toast: toast, toastError: toastError,
    dialog: dialog, alertDialog: alertDialog, confirmDialog: confirmDialog, confirmDelete: confirmDelete,
    helpDot: helpDot, badge: badge, emptyState: emptyState, tabsBar: tabsBar,
    persianNumberInput: persianNumberInput, percentInput: percentInput, switchEl: switchEl, selectEl: selectEl,
    field: field, metric: metric, saveIndicator: saveIndicator, dropdownMenu: dropdownMenu,
    collapsibleCard: collapsibleCard, projectStatusBadge: projectStatusBadge, stageStatusBadge: stageStatusBadge,
    barChart: barChart, lineChart: lineChart, donutChart: donutChart, histogramChart: histogramChart,
    table: table, processSymbol: processSymbol,
    noteDot: noteDot, stickyHeading: stickyHeading,
  };
})(typeof window !== 'undefined' ? window : globalThis);
