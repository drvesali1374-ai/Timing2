/* ═══════════════════════════════════════════════════════════
   views-operators.js — نسخه آفلاین (V2) — نمای اپراتورها
   جدول دسکتاپ / کارت موبایل، افزودن/ویرایش، حذف با شمارش
   وابستگی‌های واقعی، راهنمای آیکونی، حالت خالی.
   ═══════════════════════════════════════════════════════════ */
(function (g) {
  'use strict';
  // توجه: T2APP بعد از نماها بارگذاری می‌شود — دسترسی تنبل (lazy) الزامی است
  var U = g.T2U, DB = g.T2DB, UI = g.T2UI;
  g.T2VIEWS = g.T2VIEWS || {};

  function appRefresh() { if (g.T2APP) g.T2APP.refresh(); }

  // ── محتوای راهنمای آیکونی (عیناً از مشخصات V2) ──
  var OP_NAME_HELP = {
    what: 'نام یا کدی که این اپراتور در تمام گزارش‌ها و برگه‌های زمان‌سنجی با آن شناخته می‌شود.',
    input: 'نام کامل یا کد داخلی پرسنل؛ یکتا نبودن الزامی نیست اما نام‌های گمراه‌کننده توصیه نمی‌شود.',
    example: '«اپراتور ۱ — آقای رضایی» یا فقط «OP-07»',
    note: 'هویت اپراتور با شناسه پایدار داخلی نگه داشته می‌شود؛ تغییر نام، تاریخچه را خراب نمی‌کند.',
  };
  var OP_CODE_HELP = {
    what: 'کد پرسنلی یا شناسه داخلی شرکت برای این اپراتور.',
    input: 'هر کد کوتاه؛ مثلاً شماره پرسنلی.',
    example: 'P-1042',
  };

  // ── کمکی‌ها ──
  function sessionsCount(operatorId) {
    return DB.getState().studySessions.filter(function (s) { return s.operatorId === operatorId; }).length;
  }

  /** حرف اول نام و نام خانوادگی — «رضا محمدی» ← «رم» */
  function initialsOf(name) {
    var parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '—';
    var s = parts[0].charAt(0);
    if (parts.length > 1) s += parts[1].charAt(0);
    return s;
  }

  function sessionsBadge(n) {
    return n > 0
      ? U.h('span', { class: 'badge muted num shrink-0', text: U.formatInt(n) + ' جلسه' })
      : UI.badge('بدون جلسه', 'outline');
  }

  // ═══════════ نمای اصلی ═══════════
  g.T2VIEWS.operators = function (container, projectId) {
    U.clear(container);
    var project = DB.getProject(projectId);
    if (!project) {
      container.appendChild(UI.emptyState({ title: 'پروژه یافت نشد', desc: 'این پروژه حذف شده یا شناسه آن نامعتبر است.', icon: 'package' }));
      return;
    }
    var operators = DB.listOperators(projectId);

    // ── سربرگ بخش ──
    container.appendChild(U.h('div', { class: 'flex flex-wrap items-center justify-between gap-3' },
      U.h('div', { class: 'flex items-center gap-3' },
        U.h('span', { class: 'chip-icon' }, U.icon('users')),
        U.h('div', null,
          U.h('h1', { class: 'text-xl font-extrabold', text: 'اپراتورها' }),
          U.h('p', { class: 'text-sm text-muted num', text: U.formatInt(operators.length) + ' اپراتور در این مطالعه' }))),
      U.h('button', {
        class: 'btn btn-brand', type: 'button',
        onclick: function () { openOperatorDialog(projectId, null); },
      }, U.icon('plus'), 'اپراتور جدید')));

    // ── یادآوری ──
    container.appendChild(U.h('div', { class: 'banner info mt-4' }, U.icon('info'),
      U.h('div', { class: 'leading-relaxed' },
        U.h('b', { text: 'یادآوری: ' }),
        'برگه زمان‌سنجی هر اپراتور برای هر فعالیت مستقل است و در فاز ۳ فعال می‌شود. حذف اپراتور به‌طور دائمی است و جلسات او را نیز حذف می‌کند.')));

    if (!operators.length) {
      container.appendChild(UI.emptyState({
        icon: 'users',
        title: 'هنوز اپراتوری ثبت نشده است',
        desc: 'برای زمان‌سنجی (فاز ۳) حداقل به یک اپراتور نیاز دارید. اپراتور در سطح پروژه تعریف می‌شود و می‌تواند در چند فعالیت شرکت کند؛ برگه هر اپراتور مستقل خواهد بود.',
        actionLabel: 'ثبت اولین اپراتور',
        onAction: function () { openOperatorDialog(projectId, null); },
      }));
      return;
    }

    // جدول دسکتاپ + کارت موبایل
    container.appendChild(U.h('div', { class: 'hidden md:block' }, desktopTable(projectId, operators)));
    var mobileList = U.h('div', { class: 'md:hidden flex flex-col gap-2' });
    operators.forEach(function (op) { mobileList.appendChild(mobileCard(projectId, op)); });
    container.appendChild(mobileList);
  };

  // ── جدول دسکتاپ ──
  function desktopTable(projectId, operators) {
    return UI.table(['نام نمایشی', 'کد', 'توضیحات', 'جلسات', 'آخرین تغییر', ''], function (tbody) {
      operators.forEach(function (op) {
        var n = sessionsCount(op.id);
        tbody.appendChild(U.h('tr', null,
          U.h('td', null,
            U.h('div', { class: 'flex items-center gap-2' },
              U.h('span', { class: 'avatar', text: initialsOf(op.displayName) }),
              U.h('span', { class: 'font-semibold', text: op.displayName }))),
          U.h('td', null,
            op.code
              ? U.h('span', { class: 'num text-xs', dir: 'ltr', text: op.code })
              : '—'),
          U.h('td', null,
            op.notes
              ? U.h('span', { class: 'truncate block text-xs text-muted', style: { maxWidth: '220px' }, title: op.notes, text: op.notes })
              : '—'),
          U.h('td', null, sessionsBadge(n)),
          U.h('td', { class: 'text-xs text-muted num' }, U.formatDateTime(op.updatedAt)),
          U.h('td', null,
            U.h('div', { class: 'flex justify-end gap-1' },
              U.h('button', {
                class: 'icon-btn sm', type: 'button',
                'aria-label': 'ویرایش اپراتور ' + op.displayName, title: 'ویرایش اپراتور',
                onclick: function () { openOperatorDialog(projectId, op); },
              }, U.icon('pencil')),
              U.h('button', {
                class: 'icon-btn sm danger', type: 'button',
                'aria-label': 'حذف اپراتور ' + op.displayName, title: 'حذف اپراتور',
                onclick: function () { confirmDeleteOperator(op); },
              }, U.icon('trash'))))));
      });
    });
  }

  // ── کارت موبایل ──
  function mobileCard(projectId, op) {
    var n = sessionsCount(op.id);
    return U.h('div', { class: 'list-row items-start' },
      U.h('span', { class: 'avatar', text: initialsOf(op.displayName) }),
      U.h('div', { class: 'flex-1 min-w-0' },
        U.h('p', { class: 'font-semibold truncate', text: op.displayName }),
        op.code
          ? U.h('p', { class: 'text-xs text-muted num', dir: 'ltr', text: op.code })
          : U.h('p', { class: 'text-xs text-muted', text: 'بدون کد' }),
        op.notes ? U.h('p', { class: 'text-xs text-muted mt-1 leading-relaxed', text: op.notes }) : null),
      U.h('div', { class: 'flex flex-col items-end gap-2 shrink-0' },
        sessionsBadge(n),
        U.h('div', { class: 'flex gap-1' },
          U.h('button', {
            class: 'icon-btn sm', type: 'button',
            'aria-label': 'ویرایش اپراتور ' + op.displayName, title: 'ویرایش اپراتور',
            onclick: function () { openOperatorDialog(projectId, op); },
          }, U.icon('pencil')),
          U.h('button', {
            class: 'icon-btn sm danger', type: 'button',
            'aria-label': 'حذف اپراتور ' + op.displayName, title: 'حذف اپراتور',
            onclick: function () { confirmDeleteOperator(op); },
          }, U.icon('trash')))));
  }

  // ── دیالوگ ایجاد/ویرایش ──
  function openOperatorDialog(projectId, op) {
    var isEdit = !!op;
    var nameInput = U.h('input', { class: 'input', value: isEdit ? op.displayName : '', placeholder: 'مثلاً: اپراتور ۱' });
    var codeInput = U.h('input', { class: 'input ltr', value: isEdit ? (op.code || '') : '', placeholder: 'مثلاً: P-1042' });
    var notesInput = U.h('textarea', { class: 'textarea', value: isEdit ? (op.notes || '') : '', placeholder: 'مثلاً: سابقه ۳ سال کار روی این ایستگاه' });

    UI.dialog({
      title: isEdit ? 'ویرایش اپراتور' : 'اپراتور جدید',
      desc: isEdit ? null : 'نام نمایشی الزامی است؛ کد داخلی اختیاری است.',
      bodyBuilder: function (body) {
        body.appendChild(UI.field('نام نمایشی', nameInput, OP_NAME_HELP));
        body.appendChild(UI.field('کد اپراتور', codeInput, OP_CODE_HELP));
        body.appendChild(UI.field('توضیحات (اختیاری)', notesInput));
      },
      footerBuilder: function (close) {
        return U.h('div', { class: 'dialog-footer' },
          U.h('button', { class: 'btn', type: 'button', text: 'انصراف', onclick: close }),
          U.h('div', { class: 'spacer' }),
          U.h('button', {
            class: 'btn btn-brand', type: 'button',
            onclick: function () {
              var name = nameInput.value.trim();
              if (!name) { UI.toast('نام نمایشی اپراتور الزامی است', { type: 'error' }); return; }
              var payload = {
                displayName: name,
                code: codeInput.value.trim() || null,
                notes: notesInput.value.trim() || null,
              };
              try {
                if (isEdit) {
                  DB.updateOperator(op.id, payload);
                  UI.toast('اپراتور به‌روزرسانی شد');
                } else {
                  DB.createOperator(projectId, payload);
                  UI.toast('اپراتور ثبت شد');
                }
                close();
                appRefresh();
              } catch (err) { UI.toastError(err); }
            },
          }, isEdit ? 'ذخیره' : 'ثبت اپراتور'));
      },
    });
  }

  // ── حذف دائمی با شمارش وابستگی‌ها ──
  function confirmDeleteOperator(op) {
    var deps = { 'جلسات زمان‌سنجی': sessionsCount(op.id) }; // پیش‌نمایش پیش از حذف
    UI.confirmDelete({ title: 'حذف دائمی اپراتور', name: op.displayName, deps: deps }).then(function (ok) {
      if (!ok) return;
      try {
        DB.deleteOperator(op.id);
        UI.toast('اپراتور «' + op.displayName + '» به‌طور دائمی حذف شد');
        appRefresh();
      } catch (err) { UI.toastError(err); }
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
