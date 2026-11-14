/* ═══════════════════════════════════════════════════════════
   ابزارهای مشترک — ارقام فارسی، تقویم جلالی، قالب‌بندی، DOM
   پورت وفادار از src/lib/persian.ts، jalali.ts، format.ts
   ═══════════════════════════════════════════════════════════ */
(function (g) {
  'use strict';

  var PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
  var ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
  var LATIN_DIGITS = '0123456789';

  function normalizeDigits(input) {
    if (!input) return input;
    var out = '';
    var chars = String(input);
    for (var i = 0; i < chars.length; i++) {
      var ch = chars[i];
      var pi = PERSIAN_DIGITS.indexOf(ch);
      if (pi >= 0) { out += LATIN_DIGITS[pi]; continue; }
      var ai = ARABIC_DIGITS.indexOf(ch);
      if (ai >= 0) { out += LATIN_DIGITS[ai]; continue; }
      if (ch === '٫' || ch === '،' || ch === '٬') { out += '.'; continue; }
      if (ch === '\u200c' || ch === '\u200f' || ch === '\u200e' || ch === ' ' || ch === '_') continue;
      out += ch;
    }
    return out;
  }

  function parseNumber(input) {
    if (input === null || input === undefined) return NaN;
    if (typeof input === 'number') return input;
    var s = normalizeDigits(String(input)).trim();
    if (s === '') return NaN;
    return Number(s);
  }

  function toPersianDigits(input) {
    var s = String(input), out = '';
    for (var i = 0; i < s.length; i++) {
      var li = LATIN_DIGITS.indexOf(s[i]);
      out += li >= 0 ? PERSIAN_DIGITS[li] : s[i];
    }
    return out;
  }

  // ── تقویم جلالی (الگوریتم مرجع jalaali-js — MIT) ──
  function div(a, b) { return ~~(a / b); }
  function jalCal(jy) {
    var breaks = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];
    var bl = breaks.length, gy = jy + 621, leapJ = -14, jp = breaks[0], jm, jump = 0, leap, n, i;
    for (i = 1; i < bl; i += 1) {
      jm = breaks[i];
      jump = jm - jp;
      if (jy < jm) break;
      leapJ = leapJ + div(jump, 33) * 8 + div(jump % 33, 4);
      jp = jm;
    }
    n = jy - jp;
    leapJ = leapJ + div(n, 33) * 8 + div(n % 33 + 3, 4);
    if (jump % 33 === 4 && jump - n === 4) leapJ += 1;
    var leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
    var march = 20 + leapJ - leapG;
    if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
    leap = (((n + 1) % 33) - 1) % 4;
    if (leap === -1) leap = 4;
    return { leap: leap, gy: gy, march: march };
  }
  function toJalaali(gy, gm, gd) { return d2j(g2d(gy, gm, gd)); }
  function toGregorian(jy, jm, jd) { return d2g(j2d(jy, jm, jd)); }
  function jalCalMonthLength(jy, jm) {
    if (jm <= 6) return 31;
    if (jm <= 11) return 30;
    return isLeapJalaaliYear(jy) ? 30 : 29;
  }
  function isLeapJalaaliYear(jy) { return jalCal(jy).leap === 0; }
  function g2d(gy, gm, gd) {
    var d = div((gy + div(gm - 8, 6) + 100100) * 1461, 4) + div(153 * ((gm + 9) % 12) + 2, 5) + gd - 34840408;
    d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
    return d;
  }
  function d2g(jdn) {
    var j = 4 * jdn + 139361631;
    j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
    var i = div(j % 1461, 4) * 5 + 308;
    var gd = div(i % 153, 5) + 1;
    var gm = (div(i, 153) % 12) + 1;
    var gy = div(j, 1461) - 100100 + div(8 - gm, 6);
    return { gy: gy, gm: gm, gd: gd };
  }
  function j2d(jy, jm, jd) {
    var r = jalCal(jy);
    return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
  }
  function d2j(jdn) {
    var gy = d2g(jdn).gy, jy = gy - 621, r = jalCal(jy), jdn1f = g2d(gy, 3, r.march), jd, jm, k;
    k = jdn - jdn1f;
    if (k >= 0) {
      if (k <= 185) { jm = 1 + div(k, 31); jd = (k % 31) + 1; return { jy: jy, jm: jm, jd: jd }; }
      else k -= 186;
    } else { jy -= 1; k += 179; if (r.leap === 1) k += 1; }
    jm = 7 + div(k, 30);
    jd = (k % 30) + 1;
    return { jy: jy, jm: jm, jd: jd };
  }
  function isValidJalali(jy, jm, jd) {
    return jy >= -61 && jy <= 3177 && jm >= 1 && jm <= 12 && jd >= 1 && jd <= jalCalMonthLength(jy, jm);
  }

  var JALALI_MONTH_NAMES = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
  var JALALI_WEEKDAY_SHORT = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];

  function isoToJalali(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!m) return null;
    return toJalaali(Number(m[1]), Number(m[2]), Number(m[3]));
  }
  function jalaliToISO(jy, jm, jd) {
    var gg = toGregorian(jy, jm, jd);
    return pad4(gg.gy) + '-' + pad2(gg.gm) + '-' + pad2(gg.gd);
  }
  function todayJalali() {
    var now = new Date();
    return toJalaali(now.getFullYear(), now.getMonth() + 1, now.getDate());
  }
  function pad2(n) { return String(n).padStart(2, '0'); }
  function pad4(n) { return String(n).padStart(4, '0'); }

  function prefs() { return (g.T2DB && g.T2DB.getDisplayPrefs && g.T2DB.getDisplayPrefs()) || { calendar: 'jalali', digits: 'persian', decimals: 2 }; }
  function applyDigits(text, mode) {
    return mode === 'persian' ? toPersianDigits(text).replace(/\./g, '٫') : text;
  }
  function formatDate(iso) {
    var p = prefs();
    if (!iso) return '—';
    if (p.calendar === 'gregorian') return applyDigits(iso, p.digits);
    var j = isoToJalali(iso);
    if (!j) return applyDigits(iso, p.digits);
    return applyDigits(j.jd + ' ' + JALALI_MONTH_NAMES[j.jm - 1] + ' ' + j.jy, p.digits);
  }
  function formatDateTime(isoDateTime) {
    var p = prefs();
    if (!isoDateTime) return '—';
    var d = new Date(isoDateTime);
    if (isNaN(d.getTime())) return applyDigits(isoDateTime, p.digits);
    var datePart = formatDate(d.toISOString().slice(0, 10));
    return datePart + '، ' + applyDigits(pad2(d.getHours()) + ':' + pad2(d.getMinutes()), p.digits);
  }
  function formatTimeValue(value, decimalsOverride) {
    var p = prefs();
    if (value === null || value === undefined || !isFinite(value)) return '—';
    var dec = decimalsOverride !== undefined ? decimalsOverride : p.decimals;
    var factor = Math.pow(10, dec);
    var fixed = Math.round((value + Number.EPSILON) * factor) / factor;
    return applyDigits(fixed.toFixed(dec), p.digits);
  }
  function formatPercent(decimalValue, decimals) {
    var p = prefs();
    if (decimalValue === null || decimalValue === undefined || !isFinite(decimalValue)) return '—';
    var dec = decimals === undefined ? 1 : decimals;
    var pct = decimalValue * 100;
    var factor = Math.pow(10, dec);
    var fixed = Math.round(pct * factor) / factor;
    return applyDigits(String(fixed) + '٪', p.digits);
  }
  function formatInt(value) {
    var p = prefs();
    if (value === null || value === undefined || !isFinite(value)) return '—';
    return applyDigits(String(Math.round(value)), p.digits);
  }
  function displayServerText(text) { return applyDigits(text, prefs().digits); }
  function formatNumber(value, dec) {
    var p = prefs();
    if (value === null || value === undefined || !isFinite(value)) return '—';
    return applyDigits(Number(value).toFixed(dec === undefined ? 2 : dec), p.digits);
  }

  function uid() {
    if (g.crypto && g.crypto.randomUUID) return g.crypto.randomUUID();
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }
  function nowISO() { return new Date().toISOString(); }

  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        if (!Object.prototype.hasOwnProperty.call(attrs, k)) continue;
        var v = attrs[k];
        if (v === null || v === undefined || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'html') el.innerHTML = v;
        else if (k === 'text') el.textContent = v;
        else if (k === 'dataset') { for (var d in v) el.dataset[d] = v[d]; }
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else if (k === 'value') el.value = v;
        else if (k === 'checked') el.checked = !!v;
        else if (k === 'disabled') el.disabled = !!v;
        else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
        else el.setAttribute(k, v === true ? '' : String(v));
      }
    }
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c === null || c === undefined || c === false) continue;
      if (Array.isArray(c)) { for (var j = 0; j < c.length; j++) append(el, c[j]); }
      else append(el, c);
    }
    return el;
  }
  function append(el, c) {
    if (c === null || c === undefined || c === false) return;
    if (typeof c === 'string' || typeof c === 'number') el.appendChild(document.createTextNode(String(c)));
    else el.appendChild(c);
  }
  function clear(el) { while (el && el.firstChild) el.removeChild(el.firstChild); }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function debounce(fn, wait) {
    var t = null;
    var d = function () {
      var args = arguments;
      if (t) clearTimeout(t);
      t = setTimeout(function () { t = null; fn.apply(null, args); }, wait);
    };
    d.cancel = function () { if (t) clearTimeout(t); t = null; };
    return d;
  }
  function escapeHtml(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  var ICON_PATHS = {
    home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
    menu: '<line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="18" y2="18"/>',
    calendarDays: '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>',
    rocket: '<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>',
    listChecks: '<path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/>',
    calculator: '<rect width="16" height="20" x="4" y="2" rx="2"/><line x1="8" x2="16" y1="6" y2="6"/><line x1="16" x2="16" y1="14" y2="18"/><path d="M16 10h.01"/><path d="M12 10h.01"/><path d="M8 10h.01"/><path d="M12 14h.01"/><path d="M8 14h.01"/><path d="M12 18h.01"/><path d="M8 18h.01"/>',
    database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/>',
    timer: '<line x1="10" x2="14" y1="2" y2="2"/><line x1="12" x2="15" y1="14" y2="11"/><circle cx="12" cy="14" r="8"/>',
    settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
    settings2: '<path d="M20 7h-9"/><path d="M14 17H5"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/>',
    network: '<rect x="16" y="16" width="6" height="6" rx="1"/><rect x="2" y="16" width="6" height="6" rx="1"/><rect x="9" y="2" width="6" height="6" rx="1"/><path d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3"/><path d="M12 12V8"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    percent: '<line x1="19" x2="5" y1="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>',
    gauge: '<path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>',
    barChart: '<line x1="12" x2="12" y1="20" y2="10"/><line x1="18" x2="18" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="16"/>',
    workflow: '<rect width="8" height="8" x="3" y="3" rx="2"/><path d="M7 11v4a2 2 0 0 0 2 2h4"/><rect width="8" height="8" x="13" y="13" rx="2"/>',
    layoutDashboard: '<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>',
    fileText: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
    databaseBackup: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 12V9c0 1.66 4 3 9 3s9-1.34 9-3v3"/><path d="M3 18v-3c0 1.66 4 3 9 3s9-1.34 9-3v3"/><path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3"/>',
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    pencil: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
    trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    checkCircle: '<path d="M21.801 10A10 10 0 1 1 17 3.335"/><path d="m9 11 3 3L22 4"/>',
    alertTriangle: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    alertCircle: '<circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>',
    xCircle: '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>',
    circleHelp: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
    circle: '<circle cx="12" cy="12" r="10"/>',
    circleDashed: '<circle cx="12" cy="12" r="10"/><path d="M8 5.5v-2"/><path d="M16 5.5v-2"/><path d="M8 18.5v2"/><path d="M16 18.5v2"/><path d="M5.5 8h-2"/><path d="M5.5 16h-2"/><path d="M18.5 8h2"/><path d="M18.5 16h2"/>',
    hourglass: '<path d="M5 22h14"/><path d="M5 2h14"/><path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22"/><path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
    refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
    history: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
    rotateCcw: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
    undo2: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11"/>',
    redo2: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5A5.5 5.5 0 0 0 9.5 20H13"/>',
    copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
    copyPlus: '<path d="m13 5 7-3v12l-7 3z"/><path d="m8 8-7 3v12l7-3z"/><path d="M11 9v6"/><path d="M8 12h6"/>',
    package: '<path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
    fileUp: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M12 12v6"/><path d="m15 15-3-3-3 3"/>',
    fileSpreadsheet: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M8 13h2"/><path d="M14 13h2"/><path d="M8 17h2"/><path d="M14 17h2"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/>',
    printer: '<path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6"/><rect x="6" y="14" width="12" height="8" rx="1"/>',
    moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
    lightbulb: '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    chevronDown: '<path d="m6 9 6 6 6-6"/>',
    chevronLeft: '<path d="m15 18-6-6 6-6"/>',
    chevronRight: '<path d="m9 18 6-6-6-6"/>',
    chevronUp: '<path d="m18 15-6-6-6 6"/>',
    arrowLeft: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
    squareArrowOutUpRight: '<path d="M21 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h6"/><path d="m21 3-9 9"/><path d="M15 3h6v6"/>',
    arrowRight: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
    arrowUp: '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>',
    arrowDown: '<path d="M12 5v14"/><path d="m19 12-7 7-7 7"/>',
    moreVertical: '<circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/>',
    gripVertical: '<circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/>',
    factory: '<path d="M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8l-7 5V8l-7 5V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M17 18h1"/><path d="M12 18h1"/><path d="M7 18h1"/>',
    warehouse: '<path d="M22 8.35V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8.35A2 2 0 0 1 3.26 6.5l8-3.2a2 2 0 0 1 1.48 0l8 3.2A2 2 0 0 1 22 8.35Z"/><path d="M6 18h12"/><path d="M6 14h12"/><rect width="12" height="12" x="6" y="8"/>',
    flask: '<path d="M10 2v7.31"/><path d="M14 9.3V2"/><path d="M8.5 2h7"/><path d="M14 9.3a6.5 6.5 0 1 1-4 0"/><path d="M5.52 16h12.96"/>',
    sigma: '<path d="M18 7V4H6l6 8-6 8h12v-3"/>',
    clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    layers: '<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>',
    listTree: '<path d="M21 12h-8"/><path d="M21 6h-8"/><path d="M21 18h-8"/><path d="M3 6v4a2 2 0 0 0 2 2h3"/><path d="M3 10v6"/>',
    ban: '<circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/>',
    lock: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    lockOpen: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>',
    flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" x2="4" y1="22" y2="15"/>',
    target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
    calendarClock: '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/><path d="M15 17a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/><path d="M15 14.5V17l1.5-1"/>',
    clipboardPaste: '<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4v4h-4V11Z"/>',
    stickyNote: '<path d="M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11l5-5V5a2 2 0 0 0-2-2Z"/><path d="M15 3v4a2 2 0 0 0 2 2h4"/>',
    eraser: '<path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/>',
    sliders: '<line x1="21" x2="14" y1="4" y2="4"/><line x1="10" x2="3" y1="4" y2="4"/><line x1="21" x2="12" y1="12" y2="12"/><line x1="8" x2="3" y1="12" y2="12"/><line x1="21" x2="16" y1="20" y2="20"/><line x1="12" x2="3" y1="20" y2="20"/><line x1="14" x2="14" y1="2" y2="6"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="16" x2="16" y1="18" y2="22"/>',
    wifiOff: '<line x1="2" x2="22" y1="2" y2="22"/><path d="M8.5 16.5a5 5 0 0 1 7 0"/><path d="M2 8.82a15 15 0 0 1 4.17-2.65"/><path d="M10.66 5c4.01-.36 8.14.9 11.34 3.76"/><path d="M16.85 11.25a10 10 0 0 1 2.22 1.68"/><path d="M5 26a2 2 0 1 0 4 0 2 2 0 1 0-4 0"/>',
    shieldCheck: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
    notebook: '<path d="M2 6h4"/><path d="M2 10h4"/><path d="M2 14h4"/><path d="M2 18h4"/><path d="M6 2v20"/>',
    tags: '<path d="m15 5 6.3 6.3a2.4 2.4 0 0 1 0 3.4L17.5 19"/><path d="M9.6 5.6A2 2 0 0 0 8.2 5H4a1 1 0 0 0-1 1v4.2a2 2 0 0 0 .6 1.4l7.7 7.7a2.4 2.4 0 0 0 3.4 0l4.6-4.6a2.4 2.4 0 0 0 0-3.4z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/>',
    listPlus: '<path d="M3 6h.01"/><path d="M3 12h15"/><path d="M3 18h15"/><path d="M18 12v6"/><path d="M21 15h-6"/>',
    circlePlus: '<circle cx="12" cy="12" r="10"/><path d="M8 12h8"/><path d="M12 8v8"/>',
    archive: '<rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/>',
    folderTree: '<path d="M13 10h7a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-2.5a1 1 0 0 1-.8-.4l-.9-1.2A1 1 0 0 0 15 3h-2a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1Z"/><path d="M13 21h7a1 1 0 0 0 1-1v-4a1 1 0 0 0-1-1h-2.5"/><path d="M3 7v12a1 1 0 0 0 1 1h6"/>',
    chevronsUpDown: '<path d="m7 15 5 5 5-5"/><path d="m7 9 5-5 5 5"/>',
    chevronsDownUp: '<path d="m7 20 5-5 5 5"/><path d="m7 4 5 5 5-5"/>',
  };
  function icon(name, cls) {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('class', 'icon ' + (cls || ''));
    svg.setAttribute('aria-hidden', 'true');
    var body = ICON_PATHS[name] || ICON_PATHS.circleHelp;
    svg.innerHTML = body;
    return svg;
  }
  function iconRaw(name, cls) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon ' + (cls || '') + '" aria-hidden="true">' + (ICON_PATHS[name] || '') + '</svg>';
  }

  function downloadFile(filename, content, mime) {
    var blob = content instanceof Blob ? content : new Blob([content], { type: mime || 'application/octet-stream' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 120);
  }

  g.T2U = {
    normalizeDigits: normalizeDigits, parseNumber: parseNumber, toPersianDigits: toPersianDigits,
    toJalaali: toJalaali, toGregorian: toGregorian, jalCalMonthLength: jalCalMonthLength,
    isLeapJalaliYear: isLeapJalaaliYear, isValidJalali: isValidJalali,
    JALALI_MONTH_NAMES: JALALI_MONTH_NAMES, JALALI_WEEKDAY_SHORT: JALALI_WEEKDAY_SHORT,
    isoToJalali: isoToJalali, jalaliToISO: jalaliToISO, todayJalali: todayJalali,
    formatDate: formatDate, formatDateTime: formatDateTime, formatTimeValue: formatTimeValue,
    formatPercent: formatPercent, formatInt: formatInt, formatNumber: formatNumber,
    displayServerText: displayServerText, uid: uid, nowISO: nowISO,
    h: h, clear: clear, $: $, $$: $$, debounce: debounce, escapeHtml: escapeHtml,
    icon: icon, iconRaw: iconRaw, downloadFile: downloadFile,
  };
})(typeof window !== 'undefined' ? window : globalThis);
