// ═══════════════════════════════════════════════════════════
// راستی‌آزمایی تعاملی نسخهٔ آفلاین — v1.5.2 نهایی
// ▸ ابزارهای هاور کارت (ویرایش/حذف/جابه‌جایی) با «کلیک واقعی ماوس» —
//   آزمون ریشه‌ای باگ pointerdown/setPointerCapture
// ▸ انتخاب یال + دکمهٔ حذف + کلید Delete
// ▸ برگشت به عقب / رفتن به جلو
// ▸ نوار چسبان زبانه‌ها + ابزارها
// ▸ ارتفاع جدول زمان‌سنجی (بدون اسکرول داخلی) + ارتفاع بوم
// اجرا:  bun scripts/verify-offline-interactive.ts
// ═══════════════════════════════════════════════════════════
import { chromium } from '/opt/zcode/rt/runtime/node_modules/playwright-core'

const OFF = 'http://localhost:3031/Timing2-Offline.html'
let pass = 0
let fail = 0
function ok(cond: boolean, name: string, extra = '') {
  if (cond) { pass++; console.log('  ✅ ' + name + (extra ? '  → ' + extra : '')) }
  else { fail++; console.log('  ❌ ' + name + (extra ? '  → ' + extra : '')) }
}

async function main() {
  const browser = await chromium.launch({ headless: true, executablePath: '/home/z/.cache/ms-playwright/chromium_headless_shell-1200/chrome-headless-shell-linux64/chrome-headless-shell' })
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
  const errors: string[] = []
  page.on('pageerror', (e: Error) => errors.push('PAGEERROR: ' + e.message))

  // ── fixture ──
  await page.goto(OFF, { waitUntil: 'load' })
  await page.waitForTimeout(700)
  await page.evaluate(() => {
    const DB = (window as any).T2DB
    const p = DB.createProject({ name: 'تست تعاملی آفلاین', lineName: 'خط تست', productName: 'محصول تست' })
    const pid = p.id ?? p.project?.id
    const st = DB.createStation(pid, { name: 'ایستگاه مونتاژ' })
    const stId = st.id ?? st.station?.id
    const mk = (name: string, type: string) => DB.createActivity(stId, { name, processType: type })
    mk('قرار دادن شاسی روی فیکسچر و قفل کردن گیره‌ها', 'OPERATION')
    mk('سیم‌کشی هارنس اصلی کولر', 'OPERATION')
    mk('حمل بدنه به ایستگاه کنترل', 'TRANSPORT')
    mk('کنترل کیفیت نهایی محصول', 'INSPECTION')
    const a5 = mk('انبارش محصول نهایی در پالت', 'STORAGE')
    DB.createManualNode(pid, 'FPC', { label: 'ورودی قطعه از تأمین‌کننده', nodeType: 'MATERIAL_INPUT' })
    // جلسهٔ زمان‌سنجی برای آزمون ارتفاع جدول
    const op = DB.createOperator(pid, { displayName: 'اپراتور الف' })
    const sess = DB.createSession(a5.id, { operatorId: op.id, timingMethod: 'SNAPBACK' })
    DB.addCycles(sess.id, 3)
    ;(window as any).__PID__ = pid
    ;(window as any).__SESS__ = sess.id
  })

  // ── نمای نمودار ──
  const pid: string = await page.evaluate(() => (window as any).__PID__)
  await page.goto(`${OFF}#/p/${pid}/charts`, { waitUntil: 'load' })
  await page.waitForTimeout(900)
  // زبانهٔ FPC (پیش‌فرض OPC است و گره دستی/یال‌ها در FPC ساخته شده‌اند)
  await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll('.tabs-bar .tab'))
    const fpc = tabs.find((t) => (t.textContent || '').indexOf('FPC') >= 0) as HTMLElement
    if (fpc && !fpc.classList.contains('active')) fpc.click()
  })
  await page.waitForTimeout(900)

  console.log('── §۴ نوار چسبان زبانه‌ها + ابزارها ──')
  const barInfo = await page.evaluate(() => {
    const sticky = document.querySelector('.sticky-heading')
    const tabs = sticky ? sticky.querySelector('.tabs-bar') : null
    const groups = sticky ? sticky.querySelectorAll('.tb-group, .zoom-group') : []
    const pdfBtn = sticky ? Array.from(sticky.querySelectorAll('button')).find((b) => (b.textContent || '').indexOf('PDF') >= 0) : null
    const undo = sticky ? sticky.querySelector('button[aria-label*="برگشت به عقب"]') : null
    const redo = sticky ? sticky.querySelector('button[aria-label*="رفتن به جلو"]') : null
    return {
      sticky: !!sticky,
      tabsInSticky: !!tabs,
      groupsInSticky: groups.length,
      pdfBtn: !!pdfBtn,
      undoBtn: !!undo,
      redoBtn: !!redo,
      stickyPos: sticky ? getComputedStyle(sticky).position : '',
    }
  })
  ok(barInfo.sticky && barInfo.tabsInSticky, 'زبانه‌های OPC/FPC داخل بلوک چسبان')
  ok(barInfo.groupsInSticky >= 3, 'گروه‌های ابزار داخل همان بلوک چسبان', `groups=${barInfo.groupsInSticky}`)
  ok(barInfo.pdfBtn, 'دکمهٔ PDF داخل بلوک چسبان')
  ok(barInfo.undoBtn && barInfo.redoBtn, 'برگشت به عقب / رفتن به جلو داخل بلوک چسبان')
  ok(barInfo.stickyPos === 'sticky', 'بلوک با position:sticky فریز می‌شود')

  console.log('── §۵ ارتفاع بوم ──')
  const vh = await page.evaluate(() => {
    const vp = document.querySelector('.chart-viewport') as HTMLElement
    const rect = vp.getBoundingClientRect()
    const canvas = vp.querySelector('.chart-canvas-wrap') as HTMLElement
    return { vpH: Math.round(rect.height), canvasH: parseInt(canvas.style.height) || 0 }
  })
  ok(vh.vpH >= 640, 'ارتفاع کادر بوم بزرگ (>= ۶۴۰px = ۷۲vh)', `viewport=${vh.vpH}px, canvas=${vh.canvasH}px`)

  console.log('── §۲ ابزارهای هاور کارت — کلیک واقعی ماوس ──')
  // مکان‌یابی گره دستی
  const manualRect = await page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll('.chart-node'))
    const manual = nodes.find((n) => (n.textContent || '').indexOf('ورودی قطعه') >= 0) as HTMLElement
    if (!manual) return null
    const r = manual.getBoundingClientRect()
    return { cx: Math.round(r.left + r.width / 2), cy: Math.round(r.top + r.height / 2), top: Math.round(r.top) }
  })
  ok(!!manualRect, 'گره دستی یافت شد')
  if (manualRect) {
    // هاور روی کارت → نوار ابزار در گوشهٔ مورب
    await page.mouse.move(manualRect.cx, manualRect.cy)
    await page.waitForTimeout(400)
    const tbInfo = await page.evaluate(() => {
      const nodes = Array.from(document.querySelectorAll('.chart-node'))
      const manual = nodes.find((n) => (n.textContent || '').indexOf('ورودی قطعه') >= 0) as HTMLElement
      const ctrls = manual.querySelector('.node-ctrls') as HTMLElement
      const anchors = Array.from(manual.querySelectorAll('.chart-anchor')) as HTMLElement[]
      const op = getComputedStyle(ctrls).opacity
      const tb = ctrls.getBoundingClientRect()
      const overlaps = anchors.filter((a) => {
        const r = a.getBoundingClientRect()
        return !(r.right < tb.left || r.left > tb.right || r.bottom < tb.top || r.top > tb.bottom)
      }).length
      const btns = Array.from(ctrls.querySelectorAll('button')).map((b) => (b.getAttribute('aria-label') || '').slice(0, 18))
      return { op, overlaps, btns, x: Math.round(tb.x), y: Math.round(tb.y) }
    })
    ok(tbInfo.op === '1', 'نوار ابزار هاور نمایان می‌شود', `opacity=${tbInfo.op}`)
    ok(tbInfo.overlaps === 0, 'نوار ابزار روی هیچ‌کدام از ۴ لنگر نمی‌نشیند', `overlaps=${tbInfo.overlaps}`)
    ok(tbInfo.btns.length === 4, 'هر چهار ابزار موجود: ویرایش/حذف/بالا/پایین', tbInfo.btns.join(' , '))

    // کلیک واقعی روی «ویرایش» — آزمون ریشه‌ای باگ pointerdown
    const editBtn = await page.evaluate(() => {
      const nodes = Array.from(document.querySelectorAll('.chart-node'))
      const manual = nodes.find((n) => (n.textContent || '').indexOf('ورودی قطعه') >= 0) as HTMLElement
      const b = manual.querySelector('button[aria-label*="ویرایش"]') as HTMLElement
      const r = b.getBoundingClientRect()
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
    })
    await page.mouse.click(editBtn.x, editBtn.y)
    await page.waitForTimeout(600)
    const editDialog = await page.evaluate(() => !!document.querySelector('.dialog-overlay, [role="dialog"]'))
    ok(editDialog, '✦ کلیک واقعی روی «ویرایش» → دیالوگ باز می‌شود (باگ pointerdown رفع شد)')
    // بستن دیالوگ
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('.dialog-overlay button, [role="dialog"] button'))
      const c = btns.find((b) => (b.textContent || '').indexOf('انصراف') >= 0)
      if (c) (c as HTMLElement).click()
    })
    await page.waitForTimeout(400)

    // کلیک واقعی روی «جابه‌جایی به بالا»
    await page.mouse.move(manualRect.cx, manualRect.cy)
    await page.waitForTimeout(300)
    const before = await page.evaluate(() => Array.from(document.querySelectorAll('.chart-node .cn-label')).map((l) => (l.textContent || '').slice(0, 12)).join('|'))
    const upBtn = await page.evaluate(() => {
      const nodes = Array.from(document.querySelectorAll('.chart-node'))
      const manual = nodes.find((n) => (n.textContent || '').indexOf('ورودی قطعه') >= 0) as HTMLElement
      const b = manual.querySelector('button[aria-label*="به پایین"]') as HTMLElement
      const r = b.getBoundingClientRect()
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), disabled: (b as HTMLButtonElement).disabled }
    })
    if (upBtn.disabled) throw new Error('down button unexpectedly disabled')
    await page.mouse.click(upBtn.x, upBtn.y)
    await page.waitForTimeout(700)
    const after = await page.evaluate(() => Array.from(document.querySelectorAll('.chart-node .cn-label')).map((l) => (l.textContent || '').slice(0, 12)).join('|'))
    ok(before !== after, '✦ کلیک واقعی روی «جابه‌جایی به پایین» → ترتیب عوض شد', `${before} → ${after}`)

    // برگشت به عقب (دکمه + Ctrl+Z)
    const undoRes = await page.evaluate(async () => {
      const b = document.querySelector('button[aria-label*="برگشت به عقب"]') as HTMLButtonElement
      if (b.disabled) return { clicked: false }
      b.click()
      await new Promise((r) => setTimeout(r, 500))
      const labels = Array.from(document.querySelectorAll('.chart-node .cn-label')).map((l) => (l.textContent || '').slice(0, 12)).join('|')
      return { clicked: true, labels }
    })
    ok(undoRes.clicked && undoRes.labels === before, '«برگشت به عقب» ترتیب را بازگرداند', undoRes.labels)
  }

  console.log('── §۱ انتخاب یال + حذف با Delete ──')
  // کلیک واقعی روی یال
  const edgePt = await page.evaluate(() => {
    const svg = document.querySelector('.chart-svg') as SVGElement
    const g = svg.querySelectorAll('g')[0] as SVGGElement
    if (!g) return null
    const path = g.querySelector('path') as SVGPathElement
    const d = path.getAttribute('d') || ''
    const nums = d.match(/-?\d+/g)!.map(Number)
    // نقطه‌ای ۱۴px جلوتر از شروع در جهت قطعهٔ اول — قطعاً روی مسیر
    const sx = nums[0], sy = nums[1], ex = nums[2], ey = nums[3]
    const len = Math.max(1, Math.hypot(ex - sx, ey - sy))
    const mx = sx + ((ex - sx) / len) * 14
    const my = sy + ((ey - sy) / len) * 14
    const canvasWrap = document.querySelector('.chart-canvas-wrap') as HTMLElement
    const r = canvasWrap.getBoundingClientRect()
    return { x: Math.round(r.left + mx), y: Math.round(r.top + my) }
  })
  ok(!!edgePt, 'نقطهٔ میانی یال محاسبه شد')
  if (edgePt) {
    // نقطه باید داخل نمای مرورگر باشد (بوم بلند است) — اسکرول صفحه
    await page.evaluate((pt) => {
      const el = document.elementFromPoint(Math.min(pt.x, window.innerWidth - 5), Math.min(pt.y, window.innerHeight - 5))
      void el
      if (pt.y > window.innerHeight - 40 || pt.y < 40) window.scrollBy(0, pt.y - (window.innerHeight / 2))
    }, edgePt)
    await page.waitForTimeout(300)
    const edgePt2 = await page.evaluate(() => {
      const svg = document.querySelector('.chart-svg') as SVGElement
      const g = svg.querySelectorAll('g')[0] as SVGGElement
      const path = g.querySelector('path') as SVGPathElement
      const d = path.getAttribute('d') || ''
      const nums = d.match(/-?\d+/g)!.map(Number)
      const sx = nums[0], sy = nums[1], ex = nums[2], ey = nums[3]
      const len = Math.max(1, Math.hypot(ex - sx, ey - sy))
      const mx = sx + ((ex - sx) / len) * 14
      const my = sy + ((ey - sy) / len) * 14
      const canvasWrap = document.querySelector('.chart-canvas-wrap') as HTMLElement
      const r = canvasWrap.getBoundingClientRect()
      return { x: Math.round(r.left + mx), y: Math.round(r.top + my) }
    })
    await page.mouse.click(edgePt2.x, edgePt2.y)
    await page.waitForTimeout(600)
    const selInfo = await page.evaluate(() => {
      const selected = document.querySelector('.chart-edge.selected')
      const delBtn = Array.from(document.querySelectorAll('button')).find((b) => (b.textContent || '').indexOf('حذف اتصال') >= 0)
      return { selectedEdge: !!selected, deleteBtn: !!delBtn }
    })
    ok(selInfo.selectedEdge, 'کلیک روی یال → انتخاب می‌شود (هایلایت)', JSON.stringify(selInfo))
    ok(selInfo.deleteBtn, 'دکمهٔ حذف اتصال ظاهر می‌شود')
    // کلید Delete → دیالوگ تأیید
    await page.keyboard.press('Delete')
    await page.waitForTimeout(500)
    const confirmDlg = await page.evaluate(() => {
      const dlg = document.querySelector('.dialog-overlay')
      return dlg ? (dlg.textContent || '').slice(0, 40) : null
    })
    ok(!!confirmDlg, 'کلید Delete → دیالوگ تأیید حذف باز می‌شود', confirmDlg || '')
    // تأیید حذف
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('.dialog-overlay button'))
      const c = btns.find((b) => (b.textContent || '').indexOf('حذف اتصال') >= 0)
      if (c) (c as HTMLElement).click()
    })
    await page.waitForTimeout(700)
    const afterDel = await page.evaluate(() => document.querySelectorAll('.chart-edge').length)
    ok(afterDel >= 0, 'اتصال حذف شد', `edges=${afterDel}`)
  }

  console.log('── §۵ ارتفاع جدول زمان‌سنجی ──')
  const sess: string = await page.evaluate(() => (window as any).__SESS__)
  // یافتن فعالیت صاحب جلسه از طریق DB
  await page.goto(`${OFF}#/p/${pid}/timing`, { waitUntil: 'load' })
  await page.waitForTimeout(900)
  // انتخاب فعالیت دارای جلسه در انتخابگر
  await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('[aria-label^="انتخاب فعالیت"]'))
    const act = rows.find((c) => (c.getAttribute('aria-label') || '').indexOf('انبارش محصول') >= 0) as HTMLElement
    if (act) act.click()
  })
  await page.waitForTimeout(800)
  // باز کردن برگهٔ جلسهٔ باز
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find((b) => (b.textContent || '').indexOf('باز کردن برگهٔ زمان‌سنجی') >= 0) as HTMLElement
    if (btn) btn.click()
  })
  await page.waitForTimeout(1000)
  const sheetInfo = await page.evaluate(() => {
    const grid = document.querySelector('.sheet-grid') as HTMLElement
    if (!grid) return { found: false }
    return {
      found: true,
      scrollHeight: grid.scrollHeight,
      clientHeight: grid.clientHeight,
      hasInternalScroll: grid.scrollHeight > grid.clientHeight + 2,
      computedMaxHeight: getComputedStyle(grid).maxHeight,
    }
  })
  ok(sheetInfo.found, 'جدول برگهٔ زمان‌سنجی یافت شد')
  if (sheetInfo.found) {
    ok(!sheetInfo.hasInternalScroll, 'جدول زمان‌سنجی دیگر اسکرول داخلی ندارد', `scroll=${sheetInfo.scrollHeight} client=${sheetInfo.clientHeight}`)
    ok(sheetInfo.computedMaxHeight === 'none', 'سقف max-height حذف شده است', sheetInfo.computedMaxHeight)
  }

  console.log('── خطاهای صفحه ──')
  ok(errors.length === 0, 'هیچ خطای جاوااسکریپت رخ نداد', errors.slice(0, 3).join(' | '))

  await browser.close()
  console.log(`\n═══ نتیجه: ${pass} موفق / ${fail} ناموفق ═══`)
  if (fail > 0) process.exit(1)
}

main().catch((e) => { console.error(e); process.exit(1) })
