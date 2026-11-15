// ═══════════════════════════════════════════════════════════
// راستی‌آزمایی خروجی PDF نمودار — وب + آفلاین — v1.5.2 نهایی
// ▸ سند چاپ با سازندهٔ واقعی (buildChartPrintDocument) ساخته می‌شود؛
//   سپس با موتور چاپ کرومیوم (page.pdf + preferCSSPageSize) رندر و
//   برای بازبینی بصری (VLM) به PNG تبدیل می‌شود.
// اجرا:  bun scripts/verify-chart-pdf.ts
// ═══════════════════════════════════════════════════════════
import { chromium } from '/opt/zcode/rt/runtime/node_modules/playwright-core'

const OUT = '/tmp/pdfverify'
const WEB = 'http://localhost:3000'
const OFF = 'http://localhost:3031/Timing2-Offline.html'

async function webFlow(page: any) {
  await page.goto(WEB, { waitUntil: 'load' })
  // باز کردن پروژهٔ تست — دکمهٔ کارت با aria-label «بازکردن …»
  await page.waitForSelector('[role="button"][aria-label^="بازکردن"], button[aria-label^="بازکردن"]', { timeout: 30000 })
  await page.click('[role="button"][aria-label^="بازکردن"], button[aria-label^="بازکردن"]')
  await page.waitForLoadState('networkidle')
  await page.waitForSelector('nav button:has-text("نمودار فرایند")', { timeout: 30000 })
  await page.click('nav button:has-text("نمودار فرایند")')
  await page.waitForSelector('[role="application"]', { timeout: 15000 })
  await page.waitForTimeout(600)

  const built = await page.evaluate(async () => {
    const items = (await (await fetch('/api/projects')).json()).items
    const projectId = items[0].id
    const chart = await (await fetch(`/api/projects/${projectId}/charts/FPC`)).json()
    const src = {
      nodes: chart.nodes.map((n: any) => ({
        id: n.id, label: n.label, nodeType: n.nodeType, x: n.positionX, y: n.positionY,
        sortOrder: n.sortOrder, isManual: n.isManual, stationName: n.stationName ?? null,
      })),
      edges: chart.edges.map((e: any) => ({
        sourceId: e.sourceNodeId, targetId: e.targetNodeId,
        sourceAnchor: e.sourceAnchor ?? null, targetAnchor: e.targetAnchor ?? null,
        lineStyle: e.lineStyle ?? null, lineColor: e.lineColor ?? null, isChain: e.isChain,
      })),
      chartTitle: 'نمودار فرایند جریان (FPC)',
    }
    const T = (window as any).__T2C_PDF_TEST__
    if (!T) throw new Error('test hook missing')
    const layout = T.layoutChartPrint(src)
    const doc = T.buildChartPrintDocument(src, layout, {
      mode: 'fit', paper: 'A4', orientation: 'landscape',
      marginMm: 10, tiledScale: 100, showTitle: true, showPageNumbers: true,
    })
    ;(window as any).__BUILT__ = doc
    return { pages: doc.pagesCount, w: layout.width, h: layout.height, cards: layout.cards.length, paths: layout.paths.length }
  })
  console.log('WEB fit doc:', JSON.stringify(built))
  await page.pdf({ path: `${OUT}/web-fit.pdf`, preferCSSPageSize: true, printBackground: true })
  await page.evaluate(() => (window as any).__BUILT__.cleanup())

  // حالت تایل‌دار
  await page.evaluate(async () => {
    const items = (await (await fetch('/api/projects')).json()).items
    const projectId = items[0].id
    const chart = await (await fetch(`/api/projects/${projectId}/charts/FPC`)).json()
    const src = {
      nodes: chart.nodes.map((n: any) => ({
        id: n.id, label: n.label, nodeType: n.nodeType, x: n.positionX, y: n.positionY,
        sortOrder: n.sortOrder, isManual: n.isManual, stationName: n.stationName ?? null,
      })),
      edges: chart.edges.map((e: any) => ({
        sourceId: e.sourceNodeId, targetId: e.targetNodeId,
        sourceAnchor: e.sourceAnchor ?? null, targetAnchor: e.targetAnchor ?? null,
        lineStyle: e.lineStyle ?? null, lineColor: e.lineColor ?? null, isChain: e.isChain,
      })),
      chartTitle: 'نمودار فرایند جریان (FPC)',
    }
    const T = (window as any).__T2C_PDF_TEST__
    const layout = T.layoutChartPrint(src)
    ;(window as any).__BUILT__ = T.buildChartPrintDocument(src, layout, {
      mode: 'tiled', paper: 'A4', orientation: 'portrait',
      marginMm: 10, tiledScale: 100, showTitle: true, showPageNumbers: true,
    })
  })
  await page.pdf({ path: `${OUT}/web-tiled.pdf`, preferCSSPageSize: true, printBackground: true })
  await page.evaluate(() => (window as any).__BUILT__.cleanup())
}

async function offlineFlow(page: any) {
  await page.goto(OFF, { waitUntil: 'load' })
  await page.waitForTimeout(800)

  // ساخت fixture از طریق DB آفلاین
  const pid = await page.evaluate(() => {
    const DB = (window as any).T2DB
    const p = DB.createProject({ name: 'تست PDF آفلاین', lineName: 'خط تست', productName: 'محصول تست' })
    const pid = p.id ?? p.project?.id
    const st = DB.createStation(pid, { name: 'ایستگاه مونتاژ' })
    const stId = st.id ?? st.station?.id
    const mk = (name: string, type: string) => DB.createActivity(stId, { name, processType: type })
    mk('قرار دادن شاسی روی فیکسچر و قفل کردن گیره‌ها', 'OPERATION')
    mk('سیم‌کشی هارنس اصلی کولر', 'OPERATION')
    mk('حمل بدنه به ایستگاه کنترل', 'TRANSPORT')
    mk('کنترل کیفیت نهایی محصول', 'INSPECTION')
    mk('انبارش محصول نهایی در پالت', 'STORAGE')
    DB.createManualNode(pid, 'FPC', { label: 'ورودی قطعه از تأمین‌کننده', nodeType: 'MATERIAL_INPUT' })
    return pid
  })
  console.log('offline project:', pid)

  // ورود به نمای نمودار FPC
  await page.goto(`${OFF}#/p/${pid}/charts`, { waitUntil: 'load' })
  await page.waitForTimeout(1000)
  await page.evaluate(() => {
    const U = (window as any).T2U
    const tabs = Array.from(document.querySelectorAll('.tabs-bar .tab'))
    const fpc = tabs.find((t) => (t.textContent || '').includes('FPC'))
    if (fpc && !(fpc as HTMLElement).classList.contains('active')) (fpc as HTMLElement).click()
  })
  await page.waitForTimeout(800)

  const stats = await page.evaluate(() => {
    const viewport = document.querySelector('.chart-viewport')
    const cards = document.querySelectorAll('.chart-node').length
    return { viewportHeight: viewport ? getComputedStyle(viewport).height : 'none', cards }
  })
  console.log('offline chart state:', JSON.stringify(stats))

  const built = await page.evaluate(() => {
    const T = (window as any).__T2C_PDF_TEST__
    const DB = (window as any).T2DB
    const pid = (window as any).T2DB.getState().projects[0].id
    const chart = DB.getChart(pid, 'FPC')
    const src = {
      chartTitle: 'نمودار فرایند جریان (FPC)',
      nodes: chart.nodes.map((n: any) => ({
        id: n.id, label: n.label, nodeType: n.nodeType, x: n.positionX, y: n.positionY,
        sortOrder: n.sortOrder, isManual: !!n.isManual, stationName: n.stationName || null,
      })),
      edges: chart.edges
        .filter((e: any) => chart.nodes.some((n: any) => n.id === e.sourceNodeId) && chart.nodes.some((n: any) => n.id === e.targetNodeId))
        .map((e: any) => ({
          sourceId: e.sourceNodeId, targetId: e.targetNodeId,
          sourceAnchor: e.sourceAnchor || null, targetAnchor: e.targetAnchor || null,
          lineStyle: e.lineStyle || null, lineColor: e.lineColor || null, isChain: !!e.isChain,
        })),
    }
    const layout = T.buildPrintLayout(src)
    const doc = T.buildPrintDocument(src, layout, {
      mode: 'fit', paper: 'A4', orientation: 'landscape',
      marginMm: 10, tiledScale: 100, showTitle: true, showPageNumbers: true,
    })
    ;(window as any).__BUILT__ = doc
    return { pages: doc.pagesCount, w: layout.width, h: layout.height, cards: layout.cards.length, paths: layout.paths.length }
  })
  console.log('OFFLINE fit doc:', JSON.stringify(built))
  await page.pdf({ path: `${OUT}/offline-fit.pdf`, preferCSSPageSize: true, printBackground: true })
  await page.evaluate(() => (window as any).__BUILT__.cleanup())
}

async function main() {
  const browser = await chromium.launch({ headless: true, executablePath: '/home/z/.cache/ms-playwright/chromium_headless_shell-1200/chrome-headless-shell-linux64/chrome-headless-shell' })
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  const errors: string[] = []
  page.on('pageerror', (e: Error) => errors.push('PAGEERROR: ' + e.message))
  page.on('console', (m: any) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()) })

  await webFlow(page)
  await offlineFlow(page)

  await browser.close()
  console.log('page errors:', errors.length ? errors.slice(0, 5) : 'none')
}

main().catch((e) => { console.error(e); process.exit(1) })
