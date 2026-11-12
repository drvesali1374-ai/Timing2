/* ═══════════════════════════════════════════════════════════
   تست تعاملی قابل تکرار Drag & Drop — نسخه آفلاین (بازبینی تکمیلی ج۱ §۶)
   اجرا:  bun scripts/test-dnd-interactive.js

   پیش‌نیاز: Playwright نصب باشد — یکی از مسیرهای زیر جست‌وجو می‌شود:
     • نصب محلی پروژه (npm i -D playwright)
     • نصب سراسری (npm i -g playwright) + مرورگرها (npx playwright install chromium)

   برنامه آفلاین از طریق file:// بارگذاری می‌شود — هیچ وابستگی
   runtime به اینترنت یا CDN ندارد (الزام دستور).

   سناریوها (§۶ دستور بازبینی تکمیلی):
     D1  جابه‌جایی ایستگاه‌ها در دسکتاپ (DragEvent واقعی + DataTransfer)
     D2  جابه‌جایی فعالیت‌ها در دسکتاپ
     D3  جابه‌جایی عناصر کاری در دسکتاپ
     D4  جابه‌جایی لمسی با Pointer Events (فشار طولانی ۳۰۰ms + Ghost)
     D5  جلوگیری از انتقال عنصر به فعالیت دیگر (scope)
     D6  لغو درگ ناموفق و پاک‌سازی Ghost و هایلایت
     D7  حفظ ترتیب پس از Refresh کامل صفحه
     D8  رفتار درست در زمان فعال بودن جست‌وجو (§۴):
         قفل سه سطح + راهنما + بدون sortOrder تکراری + بازگشت ترتیب
     D9  UI آفلاین الونس‌ها (§۳/§۵): برچسب مبنا در ردیف‌های EXCLUDED
         (هر چرخه / مبنا نامشخص) + متن منوی Restore والد-EXCLUDE + اجرای آن

   نکته: بین بخش‌ها «بازچینش آزمایشی» فقط ابزار setup است (مثل ساخت fixture)؛
   خود سناریوها و Assertionها صرفاً با رویدادهای واقعی مرورگر اجرا می‌شوند.
   ═══════════════════════════════════════════════════════════ */
'use strict';

const { fileURLToPath } = await import('node:url');
const path = await import('node:path');
const fs = await import('node:fs');
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/* بارگذاری Playwright — ابتدا محلی، سپس مسیرهای سراسری متداول */
async function loadPlaywright() {
  const candidates = [
    'playwright',
    '/home/z/.npm-global/lib/node_modules/playwright/index.js',
    '/usr/lib/node_modules/playwright/index.js',
    '/usr/local/lib/node_modules/playwright/index.js',
  ];
  for (const c of candidates) {
    try {
      const mod = await import(c);
      if (mod.chromium) return mod;
      if (mod.default && mod.default.chromium) return mod.default;
    } catch (e) { /* مسیر بعدی */ }
  }
  throw new Error('Playwright یافت نشد. نصب: npm i -g playwright && npx playwright install chromium');
}
const { chromium } = await loadPlaywright();

const OFFLINE_HTML = path.resolve(__dirname, '..', 'Timing2-Offline.html');
const SHOT_DIR = path.resolve(__dirname, '..', 'offline', 'parity-shots', 'final-review');

let pass = 0, fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
  else { fail++; console.error('  ❌ ' + name + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  if (!fs.existsSync(OFFLINE_HTML)) throw new Error('فایل آفلاین یافت نشد: ' + OFFLINE_HTML);
  fs.mkdirSync(SHOT_DIR, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(String(err)));
  page.on('console', (msg) => { if (msg.type() === 'error') pageErrors.push(msg.text()); });

  console.log('════════════════════════════════════════════════');
  console.log('  تست تعاملی DnD — نسخه آفلاین (رویدادهای واقعی مرورگر)');
  console.log('════════════════════════════════════════════════');

  await page.goto('file://' + OFFLINE_HTML);
  await page.waitForFunction(() => window.T2APP && window.T2DB && window.T2VIEWS, null, { timeout: 15000 });

  // ── fixture: ۴ ایستگاه / ۴ فعالیت در ایستگاه ۱ + فعالیت مقصد در ایستگاه ۲ / ۴ عنصر ──
  const fx = await page.evaluate(() => {
    const p = T2DB.createProject({ name: 'تست تعاملی DnD', lineName: 'خط تست', productName: 'محصول تست' });
    const projectId = p.id ?? p.project?.id;
    const stations = [];
    for (let i = 1; i <= 4; i++) {
      const s = T2DB.createStation(projectId, { name: 'ایستگاه ' + i });
      stations.push(s.id ?? s.station?.id);
    }
    const activities = [];
    for (let i = 1; i <= 4; i++) {
      const a = T2DB.createActivity(stations[0], { name: 'فعالیت ' + i });
      activities.push(a.id ?? a.activity?.id);
    }
    const destAct = T2DB.createActivity(stations[1], { name: 'فعالیت مقصد دیگر' });
    const destActId = destAct.id ?? destAct.activity?.id;
    const elements = [];
    for (let i = 1; i <= 4; i++) {
      const e = T2DB.createElement(activities[0], { name: 'عنصر ' + i });
      elements.push(e.id ?? e.element?.id);
    }
    return { projectId, stations, activities, destActId, elements };
  });
  ok(Boolean(fx.projectId && fx.stations.length === 4 && fx.activities.length === 4 && fx.elements.length === 4), 'F0. fixture: ۴ ایستگاه + ۴ فعالیت + فعالیت مقصد دیگر + ۴ عنصر ساخته شد');

  const rowSel = (type, id) => `[data-sort-type="${type}"][data-sort-id="${id}"]`;
  const TABLE = { station: 'stations', activity: 'activities', element: 'workElements' };
  const orderOf = (type) => page.evaluate((t) => T2DB.getState()[t].slice().sort((a, b) => a.sortOrder - b.sortOrder).map((x) => x.id), TABLE[type]);
  const actOrderOfStation1 = () => orderOf('activity').then((l) => l.filter((id) => fx.activities.includes(id)));
  /** sortOrder تکراری نیست — «به تفکیک والد» (فعالیت‌ها per ایستگاه، عناصر per فعالیت) */
  const noDuplicateSortOrder = (type) => page.evaluate((t) => {
    const arr = T2DB.getState()[t];
    const parentKey = t === 'activities' ? 'stationId' : t === 'workElements' ? 'activityId' : 'projectId';
    const seen = new Set();
    for (const r of arr) {
      const k = r[parentKey] + '|' + r.sortOrder;
      if (seen.has(k)) return false;
      seen.add(k);
    }
    return true;
  }, TABLE[type]);
  /** بازچینش آزمایشی — فقط setup بین بخش‌ها (مثل ساخت fixture) + رندر مجدد */
  const resetFixtureOrders = () => page.evaluate((f) => {
    T2DB.reorderStations(f.projectId, f.stations);
    T2DB.reorderActivities(f.stations[0], f.activities);
    T2DB.reorderActivities(f.stations[1], [f.destActId]);
    T2DB.reorderElements(f.activities[0], f.elements);
    T2APP.refresh();
  }, fx);

  /** درگ HTML5 دسکتاپ — DragEvent واقعی با DataTransfer مشترک (مسیر شنونده‌های برنامه) */
  async function desktopDrag(fromSelector, toSelector) {
    return page.evaluate(([fromSel, toSel]) => {
      const from = document.querySelector(fromSel);
      const to = document.querySelector(toSel);
      if (!from || !to) return { error: 'selector-miss', hasFrom: Boolean(from), hasTo: Boolean(to) };
      from.scrollIntoView({ block: 'center' });
      to.scrollIntoView({ block: 'center' });
      const dt = new DataTransfer();
      const base = { bubbles: true, cancelable: true, dataTransfer: dt };
      const fr = from.getBoundingClientRect();
      const tr = to.getBoundingClientRect();
      from.dispatchEvent(new DragEvent('dragstart', Object.assign({}, base, { clientX: fr.x + 10, clientY: fr.y + 10 })));
      // dispatchEvent=false یعنی preventDefault شد (درگِ معتبر روی این مقصد)
      const overDefaultPrevented = !to.dispatchEvent(new DragEvent('dragover', Object.assign({}, base, { clientX: tr.x + 10, clientY: tr.y + 10 })));
      const highlighted = to.classList.contains('drop-target');
      to.dispatchEvent(new DragEvent('drop', base));
      from.dispatchEvent(new DragEvent('dragend', base));
      return { overDefaultPrevented, highlighted, cleanupOk: !to.classList.contains('drop-target') };
    }, [fromSelector, toSelector]);
  }

  /** درگ لمسی — PointerEvent واقعی روی دستگیره + فشار طولانی ۳۰۰ms + حرکت + رها */
  async function touchDrag(fromSelector, toSelector, opts = {}) {
    const mode = opts.smallMoveFirst ? 'small' : opts.releaseOverTarget === false ? 'miss' : 'full';
    return page.evaluate(async ([fromSel, toSel, m]) => {
      const from = document.querySelector(fromSel);
      const to = document.querySelector(toSel);
      if (!from || !to) return { error: 'selector-miss' };
      from.scrollIntoView({ block: 'center' });
      to.scrollIntoView({ block: 'center' });
      const handle = from.querySelector('.drag-handle') || from;
      const fr = handle.getBoundingClientRect();
      const tr = to.getBoundingClientRect();
      const x0 = fr.x + 10, y0 = fr.y + 10;
      const x1 = tr.x + 12, y1 = tr.y + 8;
      const pid = 7;
      const pe = (type, x, y) => new PointerEvent(type, {
        pointerId: pid, pointerType: 'touch', isPrimary: true, bubbles: true, cancelable: true, clientX: x, clientY: y,
      });
      handle.dispatchEvent(pe('pointerdown', x0, y0));
      if (m === 'small') {
        // حرکت محسوس (>۱۲px) پیش از فشار طولانی → انتظار درگ لغو می‌شود (اسکرول آزاد)
        window.dispatchEvent(pe('pointermove', x0 + 20, y0 + 8));
        await new Promise((r) => setTimeout(r, 340));
        const ghostAfterSmall = Boolean(document.querySelector('.t2-touch-ghost'));
        window.dispatchEvent(pe('pointerup', x0 + 20, y0 + 8));
        return { ghostAfterSmall, noGhost: !document.querySelector('.t2-touch-ghost'), rowUntouched: !from.classList.contains('touch-dragging') };
      }
      await new Promise((r) => setTimeout(r, 340)); // فشار طولانی ۳۰۰ms
      const ghostShown = Boolean(document.querySelector('.t2-touch-ghost'));
      const rowDimmed = from.classList.contains('touch-dragging');
      if (m === 'miss') {
        // رها روی نقطه بدون مقصد معتبر (گوشه بالای صفحه)
        window.dispatchEvent(pe('pointermove', 30, 30));
        await new Promise((r) => setTimeout(r, 60));
      } else {
        window.dispatchEvent(pe('pointermove', x1, y1));
        await new Promise((r) => setTimeout(r, 60));
      }
      const targetHighlighted = to.classList.contains('drop-target');
      window.dispatchEvent(pe('pointerup', x1, y1));
      await new Promise((r) => setTimeout(r, 80));
      return {
        ghostShown, rowDimmed, targetHighlighted,
        ghostGone: !document.querySelector('.t2-touch-ghost'),
        highlightGone: !to.classList.contains('drop-target'),
        rowRestored: !from.classList.contains('touch-dragging'),
      };
    }, [fromSelector, toSelector, mode]);
  }

  const gotoStructure = async () => {
    await page.evaluate((hash) => { location.hash = hash; }, '#/p/' + fx.projectId + '/structure');
    await page.waitForSelector('[data-sort-type="station"]', { timeout: 10000 });
  };
  await gotoStructure();
  await page.waitForSelector('[data-sort-type="activity"]', { timeout: 10000 });

  // ═══ D1 — جابه‌جایی ایستگاه‌ها در دسکتاپ ═══
  console.log('\n── D1 ایستگاه‌ها — دسکتاپ ──');
  {
    ok(JSON.stringify(await orderOf('station')) === JSON.stringify(fx.stations), 'D1a. پیش‌شرط: ترتیب اولیه ۱,۲,۳,۴');
    const r = await desktopDrag(rowSel('station', fx.stations[3]), rowSel('station', fx.stations[0]));
    ok(!r.error && r.overDefaultPrevented === true, 'D1b. درگ ایستگاه ۴ → قبل از ایستگاه ۱ (dragstart/over/drop/end)', r);
    ok(r.highlighted === true && r.cleanupOk === true, 'D1c. هایلایت مقصد هنگام dragover + پاک‌سازی پس از drop', { h: r.highlighted, c: r.cleanupOk });
    const after = await orderOf('station');
    ok(JSON.stringify(after) === JSON.stringify([fx.stations[3], fx.stations[0], fx.stations[1], fx.stations[2]]), 'D1d. ترتیب جدید: ۴,۱,۲,۳', after.map((id) => fx.stations.indexOf(id) + 1));
    ok(await noDuplicateSortOrder('station'), 'D1e. هیچ sortOrder تکراری در ایستگاه‌ها نیست');
    const r2 = await desktopDrag(rowSel('station', fx.stations[3]), rowSel('station', fx.stations[2]));
    const back = await orderOf('station');
    ok(!r2.error && JSON.stringify(back) === JSON.stringify([fx.stations[0], fx.stations[1], fx.stations[3], fx.stations[2]]), 'D1f. درگ معکوس: ۴ → قبل از ۳ ⇒ ترتیب ۱,۲,۴,۳', back.map((id) => fx.stations.indexOf(id) + 1));
  }
  await resetFixtureOrders();

  // ═══ D2 — جابه‌جایی فعالیت‌ها در دسکتاپ ═══
  console.log('\n── D2 فعالیت‌ها — دسکتاپ ──');
  {
    ok(JSON.stringify(await actOrderOfStation1()) === JSON.stringify(fx.activities), 'D2a. پیش‌شرط: ترتیب اولیه فعالیت‌های ایستگاه ۱');
    const r = await desktopDrag(rowSel('activity', fx.activities[2]), rowSel('activity', fx.activities[0]));
    ok(!r.error && r.overDefaultPrevented === true && r.highlighted === true, 'D2b. درگ فعالیت ۳ → قبل از فعالیت ۱ + هایلایت', r);
    const after = await actOrderOfStation1();
    ok(JSON.stringify(after) === JSON.stringify([fx.activities[2], fx.activities[0], fx.activities[1], fx.activities[3]]), 'D2c. ترتیب جدید: ۳,۱,۲,۴', after.map((id) => fx.activities.indexOf(id) + 1));
    ok(await noDuplicateSortOrder('activity'), 'D2d. هیچ sortOrder تکراری در فعالیت‌ها نیست');
    const r2 = await desktopDrag(rowSel('activity', fx.activities[2]), rowSel('activity', fx.activities[3]));
    const back = await actOrderOfStation1();
    ok(!r2.error && JSON.stringify(back) === JSON.stringify(fx.activities), 'D2e. درگ معکوس: ۳ → قبل از ۴ ⇒ ترتیب اولیه بازگشت', back.map((id) => fx.activities.indexOf(id) + 1));
  }

  // ═══ D3 — جابه‌جایی عناصر کاری در دسکتاپ ═══
  console.log('\n── D3 عناصر کاری — دسکتاپ ──');
  {
    await page.click(rowSel('activity', fx.activities[0]) + ' .t2-chevron'); // باز کردن فهرست عناصر (پیش‌فرض بسته)
    await page.waitForSelector(rowSel('element', fx.elements[0]), { timeout: 5000 });
    ok(JSON.stringify(await orderOf('element')) === JSON.stringify(fx.elements), 'D3a. پیش‌شرط: ترتیب اولیه عناصر ۱..۴');
    const r = await desktopDrag(rowSel('element', fx.elements[3]), rowSel('element', fx.elements[0]));
    ok(!r.error && r.overDefaultPrevented === true && r.highlighted === true, 'D3b. درگ عنصر ۴ → قبل از عنصر ۱ + هایلایت', r);
    const after = await orderOf('element');
    ok(JSON.stringify(after) === JSON.stringify([fx.elements[3], fx.elements[0], fx.elements[1], fx.elements[2]]), 'D3c. ترتیب جدید: ۴,۱,۲,۳', after.map((id) => fx.elements.indexOf(id) + 1));
    ok(await noDuplicateSortOrder('element'), 'D3d. هیچ sortOrder تکراری در عناصر نیست');
    const r2 = await desktopDrag(rowSel('element', fx.elements[3]), rowSel('element', fx.elements[2]));
    const back = await orderOf('element');
    ok(!r2.error && JSON.stringify(back) === JSON.stringify([fx.elements[0], fx.elements[1], fx.elements[3], fx.elements[2]]), 'D3e. درگ معکوس: ۴ → قبل از ۳ ⇒ ترتیب ۱,۲,۴,۳', back.map((id) => fx.elements.indexOf(id) + 1));
  }

  // ═══ D4 — جابه‌جایی لمسی با Pointer Events ═══
  console.log('\n── D4 درگ لمسی — Pointer Events ──');
  {
    // D4a: حرکت محسوس پیش از فشار طولانی → بدون فعال‌شدن درگ (اسکرول آزاد)
    const small = await touchDrag(rowSel('element', fx.elements[1]), rowSel('element', fx.elements[0]), { smallMoveFirst: true });
    ok(small.ghostAfterSmall === false && small.noGhost === true && small.rowUntouched === true, 'D4a. حرکت محسوس (>۱۲px) قبل از فشار طولانی: درگ فعال نشد', small);
    ok(JSON.stringify(await orderOf('element')) === JSON.stringify([fx.elements[0], fx.elements[1], fx.elements[3], fx.elements[2]]), 'D4a2. ترتیب عناصر بدون تغییر ماند');

    // D4b: ایستگاه (سطح ۱) — فشار طولانی → Ghost + هایلایت + جابه‌جایی + پاک‌سازی
    const t1 = await touchDrag(rowSel('station', fx.stations[2]), rowSel('station', fx.stations[0]));
    ok(!t1.error && t1.ghostShown === true && t1.rowDimmed === true, 'D4b. فشار طولانی ۳۰۰ms: Ghost ظاهر + ردیف مبدأ touch-dragging', t1);
    ok(t1.targetHighlighted === true, 'D4b2. هایلایت مقصد هنگام عبیر انگشت (elementsFromPoint)');
    ok(t1.ghostGone === true && t1.highlightGone === true && t1.rowRestored === true, 'D4b3. پاک‌سازی کامل پس از رها (ghost/هایلایت/وضعیت)', t1);
    let st = await orderOf('station');
    ok(JSON.stringify(st) === JSON.stringify([fx.stations[2], fx.stations[0], fx.stations[1], fx.stations[3]]), 'D4b4. جابه‌جایی لمسی ایستگاه: ۳,۱,۲,۴', st.map((id) => fx.stations.indexOf(id) + 1));

    // D4c: فعالیت (سطح ۲)
    const t2 = await touchDrag(rowSel('activity', fx.activities[3]), rowSel('activity', fx.activities[1]));
    ok(!t2.error && t2.ghostShown === true && t2.ghostGone === true && t2.highlightGone === true, 'D4c. جابه‌جایی لمسی فعالیت + پاک‌سازی کامل', t2);
    const act = await actOrderOfStation1();
    ok(JSON.stringify(act) === JSON.stringify([fx.activities[0], fx.activities[3], fx.activities[1], fx.activities[2]]), 'D4c2. ترتیب فعالیت‌ها: ۱,۴,۲,۳', act.map((id) => fx.activities.indexOf(id) + 1));

    // D4d: عنصر (سطح ۳)
    const t3 = await touchDrag(rowSel('element', fx.elements[2]), rowSel('element', fx.elements[0]));
    ok(!t3.error && t3.ghostShown === true && t3.ghostGone === true && t3.highlightGone === true && t3.rowRestored === true, 'D4d. جابه‌جایی لمسی عنصر + پاک‌سازی کامل', t3);
    const el = await orderOf('element');
    ok(JSON.stringify(el) === JSON.stringify([fx.elements[2], fx.elements[0], fx.elements[1], fx.elements[3]]), 'D4d2. ترتیب عناصر: ۳,۱,۲,۴', el.map((id) => fx.elements.indexOf(id) + 1));
    await page.screenshot({ path: path.join(SHOT_DIR, 'dnd-tree-after-touch.png'), fullPage: false });
  }

  // ═══ D5 — جلوگیری از انتقال عنصر به فعالیت دیگر (scope) ═══
  console.log('\n── D5 جلوگیری از انتقال عنصر بین فعالیت‌ها ──');
  {
    await page.click(rowSel('activity', fx.destActId) + ' .t2-chevron'); // باز کردن فعالیت مقصد (ایستگاه ۲)
    await page.waitForSelector(rowSel('element', fx.elements[0]), { timeout: 5000 });
    const r = await desktopDrag(rowSel('element', fx.elements[0]), rowSel('activity', fx.destActId));
    ok(!r.error, 'D5a. رویدادهای درگ عنصر → فعالیتِ دیگر ارسال شد', r);
    ok(r.overDefaultPrevented === false && r.highlighted === false, 'D5b. مقصدِ فعالیتِ دیگر درگ را نپذیرفت (scope ناهمخوان — نه preventDefault، نه هایلایت)', r);
    const elOrder = await orderOf('element');
    const destElements = await page.evaluate((actId) => T2DB.sortElements(actId).map((e) => e.id), fx.destActId);
    ok(elOrder.filter((id) => fx.elements.includes(id)).length === 4 && destElements.length === 0, 'D5c. عنصر به فعالیت دیگر منتقل نشد (فعالیت مقصد بدون عنصر ماند)', { dest: destElements.length });
    ok(await noDuplicateSortOrder('element'), 'D5d. هیچ sortOrder تکراری ساخته نشد');
  }

  // ═══ D6 — لغو درگ ناموفق و پاک‌سازی Ghost و هایلایت ═══
  console.log('\n── D6 لغو درگ ناموفق ──');
  {
    const before = await orderOf('element');
    // D6a: لمسی — رها روی نقطه بدون مقصد معتبر
    const t = await touchDrag(rowSel('element', fx.elements[1]), rowSel('element', fx.elements[3]), { releaseOverTarget: false });
    ok(!t.error && t.ghostShown === true, 'D6a. درگ لمسی آغاز شد (Ghost ظاهر)', t);
    ok(t.targetHighlighted === false && t.ghostGone === true && t.highlightGone === true && t.rowRestored === true, 'D6b. رها بدون مقصد معتبر: Ghost/هایلایت/وضعیت کاملاً پاک شد', t);
    ok(JSON.stringify(await orderOf('element')) === JSON.stringify(before), 'D6c. ترتیب عناصر بدون تغییر ماند');

    // D6b: دسکتاپ — dragend بدون drop (لغو درگ)
    const r = await page.evaluate(([fromSel, toSel]) => {
      const from = document.querySelector(fromSel);
      const to = document.querySelector(toSel);
      const dt = new DataTransfer();
      const base = { bubbles: true, cancelable: true, dataTransfer: dt };
      from.dispatchEvent(new DragEvent('dragstart', base));
      to.dispatchEvent(new DragEvent('dragover', base));
      const hl = to.classList.contains('drop-target');
      from.dispatchEvent(new DragEvent('dragend', base)); // لغو — بدون drop
      return { hl, cleaned: !to.classList.contains('drop-target') };
    }, [rowSel('element', fx.elements[1]), rowSel('element', fx.elements[3])]);
    ok(r.hl === true && r.cleaned === true, 'D6d. دسکتاپ: هایلایت هنگام dragover و پاک‌سازی پس از dragend (بدون drop)', r);
    ok(JSON.stringify(await orderOf('element')) === JSON.stringify(before), 'D6e. بدون drop، ترتیب تغییر نکرد');
  }

  // ═══ D7 — حفظ ترتیب پس از Refresh کامل ═══
  console.log('\n── D7 Refresh کامل صفحه ──');
  {
    const before = {
      stations: await orderOf('station'),
      activities: await actOrderOfStation1(),
      elements: await orderOf('element'),
    };
    await page.reload();
    await page.waitForFunction(() => window.T2APP && window.T2DB, null, { timeout: 15000 });
    await gotoStructure();
    const after = {
      stations: await orderOf('station'),
      activities: await actOrderOfStation1(),
      elements: await orderOf('element'),
    };
    ok(JSON.stringify(before.stations) === JSON.stringify(after.stations), 'D7a. ترتیب ایستگاه‌ها پس از Refresh حفظ شد', after.stations.map((id) => fx.stations.indexOf(id) + 1));
    ok(JSON.stringify(before.activities) === JSON.stringify(after.activities), 'D7b. ترتیب فعالیت‌ها پس از Refresh حفظ شد', after.activities.map((id) => fx.activities.indexOf(id) + 1));
    ok(JSON.stringify(before.elements) === JSON.stringify(after.elements), 'D7c. ترتیب عناصر پس از Refresh حفظ شد (localStorage)', after.elements.map((id) => fx.elements.indexOf(id) + 1));
  }

  // ═══ D8 — رفتار در زمان فعال بودن جست‌وجو (§۴) ═══
  console.log('\n── D8 جست‌وجوی فعال — قفل مرتب‌سازی ──');
  {
    await page.click(rowSel('activity', fx.activities[0]) + ' .t2-chevron'); // عناصر فعالیت ۱ دیده شوند
    await page.waitForSelector(rowSel('element', fx.elements[0]), { timeout: 5000 });

    const SEARCH_INPUT = 'input[aria-label="جست‌وجو در درخت ساختار"]';
    const treeCounts = () => page.evaluate(() => {
      const q = (t) => Array.from(document.querySelectorAll('[data-sort-type="' + t + '"]'));
      return {
        stationRows: q('station').length,
        activityRows: q('activity').length,
        elementRows: q('element').length,
        stationDraggable: q('station').filter((r) => r.getAttribute('draggable') === 'true').length,
        activityDraggable: q('activity').filter((r) => r.getAttribute('draggable') === 'true').length,
        elementDraggable: q('element').filter((r) => r.getAttribute('draggable') === 'true').length,
        lockedClass: document.querySelectorAll('.t2-sort-locked').length,
        handlesDisabled: Array.from(document.querySelectorAll('.drag-handle')).filter((h) => (h.title || '').indexOf('پاک کنید') >= 0).length,
      };
    });

    const ordersBefore = {
      stations: await orderOf('station'),
      activities: await actOrderOfStation1(),
      elements: await orderOf('element'),
    };

    // ── دور ۱: «فعالیت» → ۲ ایستگاه از ۴ + ۵ ردیف فعالیت، بدون عنصر ──
    await page.fill(SEARCH_INPUT, 'فعالیت');
    await page.waitForSelector('.t2-sort-hint', { timeout: 5000 });
    const c1 = await treeCounts();
    ok(c1.stationRows === 2, 'D8a. فیلتر «فعالیت»: فقط ۲ ایستگاه از ۴ نمایش داده شد', { s: c1.stationRows, a: c1.activityRows });
    const hint = await page.evaluate(() => (document.querySelector('.t2-sort-hint') || {}).textContent || null);
    ok(hint && hint.trim() === 'برای مرتب‌سازی، ابتدا فیلتر جست‌وجو را پاک کنید.', 'D8b. راهنمای قفل با متن دقیق نمایش داده شد', hint && hint.trim());
    ok(c1.stationDraggable === 0 && c1.activityDraggable === 0 && c1.elementDraggable === 0, 'D8c. هیچ ردیف فعالیتی draggable نیست — قفل ایستگاه و فعالیت', c1);
    ok(c1.lockedClass > 0 && c1.handlesDisabled > 0, 'D8d. کلاس قفل روی ردیف‌ها + دستگیره‌های دارای راهنمای غیرفعال', { l: c1.lockedClass, h: c1.handlesDisabled });
    const att1 = await page.evaluate((t) => {
      const rows = Array.from(document.querySelectorAll('[data-sort-type="' + t + '"]'));
      if (rows.length < 2) return { error: 'need-2-rows', n: rows.length };
      const from = rows[0], to = rows[1];
      const dt = new DataTransfer();
      const base = { bubbles: true, cancelable: true, dataTransfer: dt };
      from.dispatchEvent(new DragEvent('dragstart', base));
      const prevented = !to.dispatchEvent(new DragEvent('dragover', base));
      const hl = to.classList.contains('drop-target');
      to.dispatchEvent(new DragEvent('drop', base));
      from.dispatchEvent(new DragEvent('dragend', base));
      return { prevented, hl };
    }, 'activity');
    ok(!att1.error && att1.hl === false && att1.prevented === false, 'D8e. ارسال رویداد درگ بین دو ردیف فعالیتِ قفل‌شده: هیچ واکنشی نبود', att1);

    // ── دور ۲: «عنصر» → ۱ ایستگاه از ۴ + ۴ ردیف عنصر ──
    await page.fill(SEARCH_INPUT, 'عنصر');
    await page.waitForSelector('.t2-sort-hint', { timeout: 5000 });
    const c2 = await treeCounts();
    ok(c2.stationRows === 1 && c2.elementRows === 4, 'D8f. فیلتر «عنصر»: ۱ ایستگاه از ۴ + ۴ ردیف عنصر', { s: c2.stationRows, e: c2.elementRows });
    ok(c2.elementDraggable === 0, 'D8g. قفل سطح عنصر: هیچ ردیف عنصری draggable نیست', { ed: c2.elementDraggable });
    const att2 = await page.evaluate((t) => {
      const rows = Array.from(document.querySelectorAll('[data-sort-type="' + t + '"]'));
      if (rows.length < 2) return { error: 'need-2-rows', n: rows.length };
      const from = rows[0], to = rows[1];
      const dt = new DataTransfer();
      const base = { bubbles: true, cancelable: true, dataTransfer: dt };
      from.dispatchEvent(new DragEvent('dragstart', base));
      const prevented = !to.dispatchEvent(new DragEvent('dragover', base));
      const hl = to.classList.contains('drop-target');
      to.dispatchEvent(new DragEvent('drop', base));
      from.dispatchEvent(new DragEvent('dragend', base));
      return { prevented, hl };
    }, 'element');
    ok(!att2.error && att2.hl === false && att2.prevented === false, 'D8h. ارسال رویداد درگ بین دو ردیف عنصرِ قفل‌شده: هیچ واکنشی نبود', att2);
    await page.screenshot({ path: path.join(SHOT_DIR, 'dnd-search-locked-hint.png'), fullPage: false });

    const ordersLocked = {
      stations: await orderOf('station'),
      activities: await actOrderOfStation1(),
      elements: await orderOf('element'),
    };
    ok(JSON.stringify(ordersLocked.stations) === JSON.stringify(ordersBefore.stations) &&
       JSON.stringify(ordersLocked.activities) === JSON.stringify(ordersBefore.activities) &&
       JSON.stringify(ordersLocked.elements) === JSON.stringify(ordersBefore.elements), 'D8i. هیچ جابه‌جایی ناخواسته‌ای در هیچ سطحی رخ نداد');
    ok(await noDuplicateSortOrder('station') && await noDuplicateSortOrder('activity') && await noDuplicateSortOrder('element'), 'D8j. هیچ sortOrder تکراری در هیچ سطحی ساخته نشود');

    // ── پاک کردن فیلتر: ترتیب کامل برمی‌گردد و مرتب‌سازی دوباره فعال است ──
    await page.fill(SEARCH_INPUT, '');
    await page.waitForFunction(() => !document.querySelector('.t2-sort-hint'), null, { timeout: 5000 });
    const c3 = await treeCounts();
    ok(c3.stationRows === 4 && c3.stationDraggable === 4, 'D8k. پاک کردن فیلتر: هر ۴ ایستگاه برگشت + مرتب‌سازی دسکتاپ دوباره فعال', c3);
    const ordersAfter = {
      stations: await orderOf('station'),
      activities: await actOrderOfStation1(),
      elements: await orderOf('element'),
    };
    ok(JSON.stringify(ordersAfter.stations) === JSON.stringify(ordersBefore.stations) &&
       JSON.stringify(ordersAfter.activities) === JSON.stringify(ordersBefore.activities) &&
       JSON.stringify(ordersAfter.elements) === JSON.stringify(ordersBefore.elements), 'D8l. ترتیب کامل هر سه سطح دست‌نخورده ماند');

    // مرتب‌سازی عادی پس از پاک کردن فیلتر همچنان کار می‌کند
    const r = await desktopDrag(rowSel('station', fx.stations[0]), rowSel('station', fx.stations[2]));
    const final = await orderOf('station');
    ok(!r.error && r.highlighted === true && JSON.stringify(final) === JSON.stringify([fx.stations[0], fx.stations[2], fx.stations[1], fx.stations[3]]), 'D8m. درگ عادی پس از پاک کردن فیلتر کار می‌کند: ۱,۳,۲,۴', final.map((id) => fx.stations.indexOf(id) + 1));

    // Refresh مجدد — ترتیب نهایی پایدار
    await page.reload();
    await page.waitForFunction(() => window.T2APP && window.T2DB, null, { timeout: 15000 });
    await gotoStructure();
    const afterReload = await orderOf('station');
    ok(JSON.stringify(afterReload) === JSON.stringify(final), 'D8n. ترتیب پس از Refresh مجدد نیز پایدار است', afterReload.map((id) => fx.stations.indexOf(id) + 1));
  }

  // ═══ D9 — UI آفلاین: برچسب مبنا EXCLUDED + متن Restore (§۳/§۵) ═══
  console.log('\n── D9 UI آفلاین الونس‌ها — مبنا و متن Restore ──');
  {
    // fixture: والد PER_CYCLE → EXCLUDE؛ بدون والد (پیش‌فرض مرکزی) → EXCLUDE؛ والد EXCLUDE + فرزند SET
    const alw = await page.evaluate(() => {
      const p = T2DB.createProject({ name: 'تست UI الونس آفلاین', lineName: 'خط تست', productName: 'محصول تست' });
      const pid = p.id ?? p.project?.id;
      const s = T2DB.createStation(pid, { name: 'ایستگاه الف' });
      const sid = s.id ?? s.station?.id;
      const a = T2DB.createActivity(sid, { name: 'فعالیت الف' });
      const aid = a.id ?? a.activity?.id;
      const mk = (r) => r.id ?? r.definition?.id;
      const d1 = mk(T2DB.createAllowanceDefinition(pid, { title: 'استراحت چرخه‌ای', defaultValueType: 'FIXED_TIME', defaultTimeSeconds: 300, isActive: true, sortOrder: 0 }));
      const d2 = mk(T2DB.createAllowanceDefinition(pid, { title: 'بدون والد فعال', defaultValueType: 'FIXED_TIME', defaultTimeSeconds: 20, isActive: true, sortOrder: 1 }));
      const d3 = mk(T2DB.createAllowanceDefinition(pid, { title: 'بازفعال‌شده', defaultValueType: 'PERCENT', defaultValuePercent: 0.05, isActive: true, sortOrder: 2 }));
      return { pid, sid, aid, d1, d2, d3 };
    });
    await page.evaluate((f) => {
      T2DB.putScopeAllowanceOps('PROJECT', f.pid, [
        { definitionId: f.d1, action: 'SET', valueType: 'FIXED_TIME', timeValueSeconds: 300, applicationBasis: 'PER_CYCLE' },
        { definitionId: f.d3, action: 'SET', valueType: 'PERCENT', percentValue: 0.05 },
      ]);
      T2DB.putScopeAllowanceOps('STATION', f.sid, [
        { definitionId: f.d1, action: 'EXCLUDE' },
        { definitionId: f.d2, action: 'EXCLUDE' },
        { definitionId: f.d3, action: 'EXCLUDE' },
      ]);
      T2DB.putScopeAllowanceOps('ACTIVITY', f.aid, [
        { definitionId: f.d3, action: 'SET', valueType: 'PERCENT', percentValue: 0.07 },
      ]);
    }, alw);

    await page.evaluate((h) => { location.hash = h; }, '#/p/' + alw.pid + '/activity/' + alw.aid);
    await page.waitForSelector('section[aria-label="الونس‌ها و زمان‌های مجاز"] table', { timeout: 10000 });

    const cellsOf = (title) => page.evaluate((t) => {
      const rows = Array.from(document.querySelectorAll('section[aria-label="الونس‌ها و زمان‌های مجاز"] table tr'));
      for (const tr of rows) {
        const tds = Array.from(tr.querySelectorAll('td'));
        if (tds.length && tds[0].textContent.indexOf(t) >= 0) return tds.map((td) => td.textContent.trim().replace(/\s+/g, ' '));
      }
      return null;
    }, title);

    const r1 = await cellsOf('استراحت چرخه‌ای');
    ok(Boolean(r1) && r1[1].indexOf('هر چرخه') >= 0 && r1[1].indexOf('هر اجرا') === -1, 'D9a. EXCLUDED با والد PER_CYCLE: «زمان ثابت — هر چرخه» (نه «هر اجرا»)', r1 && r1[1]);
    const r2 = await cellsOf('بدون والد فعال');
    ok(Boolean(r2) && r2[1].indexOf('مبنا نامشخص') >= 0 && r2[1].indexOf('هر اجرا') === -1, 'D9b. EXCLUDED با پیش‌فرض مرکزی و بدون والد: «مبنا نامشخص» (نه «هر اجرا»)', r2 && r2[1]);
    const r3 = await cellsOf('بازفعال‌شده');
    ok(Boolean(r3) && r3[1] === 'درصدی' && r3[2].indexOf('۷٪') >= 0, 'D9c. بازفعال‌سازی فرزند روی والد EXCLUDE: درصدی ۷٪ فعال', r3 && r3.slice(0, 3));

    // منوی عملیات ردیف بازفعال‌شده → متن Restore جدید
    await page.click('button[aria-label="عملیات الونس بازفعال‌شده"]');
    await page.waitForSelector('.dd-menu [role="menuitem"]', { timeout: 5000 });
    const restoreLabel = await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll('.dd-menu [role="menuitem"]'));
      return items.map((b) => b.textContent.trim()).find((t) => t.indexOf('بازگردانی') >= 0) || null;
    });
    ok(restoreLabel === 'بازگردانی به وضعیت والد (حذف تخصیص محلی)', 'D9d. متن منوی Restore والد-EXCLUDE: عبارت جدید', restoreLabel);

    // اجرای Restore → حذف تخصیص محلی + وضعیت EXCLUDED والد + toast
    await page.click('.dd-menu [role="menuitem"]:last-child');
    await page.waitForFunction(() => {
      const toasts = Array.from(document.querySelectorAll('.toast, [class*="toast"]'));
      return toasts.some((t) => t.textContent.indexOf('وضعیت حذف از ارث‌بری والد دوباره برقرار شد') >= 0);
    }, null, { timeout: 5000 }).catch(() => null);
    const r3b = await cellsOf('بازفعال‌شده');
    ok(Boolean(r3b) && r3b[2] === '—', 'D9e. پس از Restore: مقدار حذف و EXCLUDED والد دوباره برقرار', r3b && r3b[2]);
    const stAssign = await page.evaluate((f) => T2DB.getState().allowanceAssignments.find((a) => a.definitionId === f.d3 && a.scopeType === 'STATION' && a.scopeId === f.sid), alw);
    const actAssign = await page.evaluate((f) => T2DB.getState().allowanceAssignments.find((a) => a.definitionId === f.d3 && a.scopeType === 'ACTIVITY' && a.scopeId === f.aid), alw);
    ok(Boolean(stAssign) && stAssign.mode === 'EXCLUDE' && !actAssign, 'D9f. تخصیص EXCLUDE والد دست‌نخورده + تخصیص محلی حذف شد', { st: stAssign && stAssign.mode, act: Boolean(actAssign) });
    await page.screenshot({ path: path.join(SHOT_DIR, 'off-allowances-basis-restore.png'), fullPage: false });
  }

  // ═══ خطای صفر جاوااسکریپت ═══
  ok(pageErrors.length === 0, 'Z. هیچ خطای Console/Page در تمام سناریوها رخ نداد', pageErrors.slice(0, 3));

  await page.screenshot({ path: path.join(SHOT_DIR, 'dnd-final-state.png'), fullPage: false });
  await browser.close();

  console.log('\n════════════════════════════════════════════════');
  console.log('  نتیجه: ' + pass + ' پاس / ' + fail + ' خطا');
  console.log('════════════════════════════════════════════════');
  if (fail > 0) process.exit(1);
})().catch((err) => {
  console.error('خطای اجرای تست تعاملی:', err);
  process.exit(1);
});
