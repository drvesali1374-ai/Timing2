// Offline-only PDF verification — round 2
import { chromium } from '/opt/zcode/rt/runtime/node_modules/playwright-core'

const OUT = '/tmp/pdfverify-r2'
const OFF = 'http://localhost:3031/Timing2-Offline.html'

async function main() {
  const browser = await chromium.launch({ headless: true, executablePath: '/home/z/.cache/ms-playwright/chromium_headless_shell-1200/chrome-headless-shell-linux64/chrome-headless-shell' })
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  const errors: string[] = []
  page.on('pageerror', (e: Error) => errors.push('PAGEERROR: ' + e.message))
  page.on('console', (m: any) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()) })

  await page.goto(OFF, { waitUntil: 'load' })
  await page.waitForTimeout(800)

  const pid = await page.evaluate(() => {
    const DB = (window as any).T2DB
    const p = DB.createProject({ name: 'تست PDF راند ۲', lineName: 'خط تست', productName: 'محصول تست' })
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
  console.log('project:', pid)

  await page.goto(`${OFF}#/p/${pid}/charts`, { waitUntil: 'load' })
  await page.waitForTimeout(1000)
  await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll('.tabs-bar .tab'))
    const fpc = tabs.find((t) => (t.textContent || '').includes('FPC'))
    if (fpc && !(fpc as HTMLElement).classList.contains('active')) (fpc as HTMLElement).click()
  })
  await page.waitForTimeout(800)

  await page.evaluate((p) => { (window as any).__PID_R2__ = p }, pid)

  // ── FIT mode ──
  const builtFit = await page.evaluate(() => {
    function makeSrcInner() {
      const DB = (window as any).T2DB
      const pid = (window as any).__PID_R2__
      const chart = DB.getChart(pid, 'FPC')
      return {
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
    }
    const T = (window as any).__T2C_PDF_TEST__
    const src = makeSrcInner()
    const layout = T.buildPrintLayout(src)
    const doc = T.buildPrintDocument(src, layout, {
      mode: 'fit', paper: 'A4', orientation: 'landscape',
      marginMm: 10, tiledScale: 100, showTitle: true, showPageNumbers: true,
    })
    ;(window as any).__BUILT__ = doc
    return { pages: doc.pagesCount, w: Math.round(layout.width), h: Math.round(layout.height), cards: layout.cards.length, paths: layout.paths.length }
  })
  console.log('OFFLINE fit doc:', JSON.stringify(builtFit))
  await page.pdf({ path: `${OUT}/offline-fit.pdf`, preferCSSPageSize: true, printBackground: true })
  await page.evaluate(() => (window as any).__BUILT__.cleanup())

  // ── TILED mode ──
  await page.evaluate(() => {
    const DB = (window as any).T2DB
    const pid = (window as any).__PID_R2__
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
    const T = (window as any).__T2C_PDF_TEST__
    const layout = T.buildPrintLayout(src)
    ;(window as any).__BUILT__ = T.buildPrintDocument(src, layout, {
      mode: 'tiled', paper: 'A4', orientation: 'portrait',
      marginMm: 10, tiledScale: 100, showTitle: true, showPageNumbers: true,
    })
  })
  await page.pdf({ path: `${OUT}/offline-tiled.pdf`, preferCSSPageSize: true, printBackground: true })
  await page.evaluate(() => (window as any).__BUILT__.cleanup())

  await browser.close()
  console.log('page errors:', errors.length ? errors.slice(0, 5) : 'none')
}

main().catch((e) => { console.error(e); process.exit(1) })
