// ═══════════════════════════════════════════════════════════
// سازندهٔ سند چاپ حرفه‌ای نمودار فرایند — v1.5.2 §۱۵.۷ بازطراحی
// ▸ سند چاپ از «دادهٔ» نمودار ساخته می‌شود، نه کلون DOM بوم:
//   – بدون شبکهٔ نقطه‌ای، بدون قاب خط‌چین، بدون هیچ اسکرول‌باری؛
//   – برچسب گره‌ها کامل و چندخطی چاپ می‌شود (بدون «…» برش)؛
//   – مسیر یال‌ها با ارتفاع واقعی کارت‌های چاپی بازمحاسبه می‌شود؛
//   – خروجی برداری (متن قابل انتخاب) از موتور چاپ مرورگر.
// ▸ هم‌ارزی کامل وب/آفلاین: همان ثابت‌ها، همان CSS، همان صفحه‌بندی.
// ═══════════════════════════════════════════════════════════
import {
  NODE_W,
  NODE_H,
  autoAnchors,
  orthogonalPath,
  type AnchorSide,
} from './chart-geometry'

export type ChartPrintLineStroke = 'SOLID' | 'DASHED' | 'DOTTED'

export interface ChartPrintNode {
  id: string
  label: string
  nodeType: string
  x: number
  y: number
  sortOrder: number
  isManual: boolean
  stationName?: string | null
}

export interface ChartPrintEdge {
  sourceId: string
  targetId: string
  sourceAnchor: AnchorSide | null
  targetAnchor: AnchorSide | null
  lineStyle: ChartPrintLineStroke | null
  lineColor: string | null
  isChain: boolean
}

export interface ChartPrintSource {
  nodes: ChartPrintNode[]
  edges: ChartPrintEdge[]
  chartTitle: string
}

export interface ChartPrintLayout {
  width: number
  height: number
  cards: Array<ChartPrintNode & { printX: number; printY: number; height: number }>
  paths: Array<{ edge: ChartPrintEdge; d: string }>
}

export interface ChartPrintOptions {
  mode: 'fit' | 'tiled'
  paper: 'A4' | 'A3'
  orientation: 'portrait' | 'landscape'
  marginMm: number
  /** درصد مقیاس در حالت تایل‌دار */
  tiledScale: number
  showTitle: boolean
  showPageNumbers: boolean
}

export const PAPER_MM: Record<'A4' | 'A3', { w: number; h: number }> = {
  A4: { w: 210, h: 297 },
  A3: { w: 297, h: 420 },
}

export const MM_TO_PX = 96 / 25.4

/** عرض کارت چاپی — همان عرض کارت بوم (چیدمان نسبی حفظ می‌شود) */
const PRINT_NODE_W = NODE_W
/** فاصلهٔ امن اطراف محتوا در سند چاپ */
const PRINT_PAD = 36
/** هم‌پوشانی چسباندن صفحات تایل‌دار (px صفحه) */
const TILED_OVERLAP = 24
/** ارتفاع رزرو عنوان+تاریخ+شمارهٔ صفحه در قاب (px) — اندازه‌گیری واقعی:
 *  عنوان ۲۰ + فاصله ۲ + تاریخ ۱۵ + فاصله ۶ + شمارهٔ صفحه ۱۵ + فاصله ۴ + حاشیهٔ اطمینان */
const TITLE_BLOCK_PX = 68

const SYMBOL_COLORS: Record<string, string> = {
  OPERATION: '#7257ff',
  INSPECTION: '#b9831b',
  TRANSPORT: '#5f6f88',
  DELAY: '#ef5b6b',
  STORAGE: '#18b77b',
  MATERIAL_INPUT: '#0e93a4',
}

const TYPE_LABELS: Record<string, string> = {
  OPERATION: 'عملیات',
  INSPECTION: 'بازرسی',
  TRANSPORT: 'حمل‌ونقل',
  DELAY: 'تأخیر',
  STORAGE: 'انبارش',
  MATERIAL_INPUT: 'ورودی مواد/قطعات',
}

const SYMBOL_SHAPES: Record<string, string> = {
  OPERATION: '<circle cx="12" cy="12" r="8.5"/>',
  INSPECTION: '<rect x="4.5" y="4.5" width="15" height="15" rx="2"/>',
  TRANSPORT: '<path d="M4 11.1 12.4 4.3v4.3H20v5h-7.6v4.3z"/>',
  DELAY: '<path d="M5 5h7.6a7 7 0 0 1 0 14H5z"/>',
  STORAGE: '<path d="M4.5 5.5h15L12 19.6z"/>',
  MATERIAL_INPUT: '<path d="M12 3.6 19.7 8v8L12 20.4 4.3 16V8z"/>',
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function symbolSvg(nodeType: string): string {
  const color = SYMBOL_COLORS[nodeType] ?? SYMBOL_COLORS.OPERATION
  const shape = SYMBOL_SHAPES[nodeType] ?? SYMBOL_SHAPES.OPERATION
  return (
    `<svg viewBox="0 0 24 24" width="24" height="24" xmlns="http://www.w3.org/2000/svg" fill="${color}" fill-opacity="0.12" ` +
    `stroke="${color}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">${shape}</svg>`
  )
}

/** CSS مشترک کارت‌های چاپی — برای اندازه‌گیری (screen) و چاپ (print) یکی است */
const CHART_PRINT_CSS = `
.chart-print-card {
  position: absolute; width: ${PRINT_NODE_W}px; box-sizing: border-box; direction: rtl;
  background: #ffffff; border: 1px solid #b9c2d0; border-radius: 8px;
  padding: 8px 10px 7px;
  font-family: Vazirmatn, 'Segoe UI', Tahoma, sans-serif;
  break-inside: avoid;
}
.chart-print-card .cp-num {
  position: absolute; top: -9px; inset-inline-start: -9px;
  width: 20px; height: 20px; border-radius: 50%;
  background: #ffffff; border: 1px solid #b9c2d0; color: #33415c;
  font-size: 10.5px; font-weight: 700;
  display: inline-flex; align-items: center; justify-content: center;
}
.chart-print-card .cp-head { display: flex; align-items: flex-start; gap: 7px; }
.chart-print-card .cp-sym { flex-shrink: 0; width: 24px; height: 24px; display: inline-flex; }
.chart-print-card .cp-sym svg { width: 24px; height: 24px; display: block; }
.chart-print-card .cp-label {
  font-size: 12.5px; font-weight: 700; line-height: 1.55; color: #0c1424;
  overflow-wrap: break-word; word-break: break-word; min-width: 0;
}
.chart-print-card .cp-sub { margin-top: 3px; font-size: 10.5px; line-height: 1.5; color: #5a6b85; }
.chart-print-svg { position: absolute; inset: 0; overflow: visible; pointer-events: none; }
`

/** استایل مشترک — یک‌بار تزریق می‌شود؛ پاک‌سازی با شمارندهٔ مرجع */
let sharedStyleEl: HTMLStyleElement | null = null
let sharedStyleRefs = 0

function acquireSharedStyle(): HTMLStyleElement {
  if (!sharedStyleEl || !sharedStyleEl.isConnected) {
    sharedStyleEl = document.createElement('style')
    sharedStyleEl.id = 'chart-print-shared-css'
    sharedStyleEl.textContent = CHART_PRINT_CSS
    document.head.appendChild(sharedStyleEl)
  }
  sharedStyleRefs++
  return sharedStyleEl
}

function releaseSharedStyle() {
  sharedStyleRefs = Math.max(0, sharedStyleRefs - 1)
  if (sharedStyleRefs === 0 && sharedStyleEl && sharedStyleEl.isConnected) {
    sharedStyleEl.remove()
  }
}

function cardHtml(n: ChartPrintNode): string {
  const sub =
    (TYPE_LABELS[n.nodeType] ?? n.nodeType) +
    (n.isManual ? ' · گره دستی' : n.stationName ? ` · ${n.stationName}` : '')
  return (
    `<span class="cp-num">${escapeHtml(String(n.sortOrder + 1))}</span>` +
    `<div class="cp-head"><span class="cp-sym">${symbolSvg(n.nodeType)}</span>` +
    `<div class="cp-label">${escapeHtml(n.label)}</div></div>` +
    `<div class="cp-sub">${escapeHtml(sub)}</div>`
  )
}

/** اندازه‌گیری ارتفاع واقعی کارت چاپی (برچسب چندخطی) — offscreen */
function measureCardHeight(n: ChartPrintNode): number {
  const measurer = document.createElement('div')
  measurer.style.cssText =
    'position:fixed;left:-99999px;top:0;visibility:hidden;pointer-events:none;contain:layout style;'
  const card = document.createElement('div')
  card.className = 'chart-print-card'
  card.style.width = `${PRINT_NODE_W}px`
  card.innerHTML = cardHtml(n)
  measurer.appendChild(card)
  document.body.appendChild(measurer)
  const h = card.offsetHeight
  measurer.remove()
  return h > 0 ? Math.ceil(h) : NODE_H
}

/**
 * چیدمان سند چاپ: نرمال‌سازی مختصات به (۰،۰)، اندازه‌گیری ارتفاع کارت‌ها
 * با برچسب کامل و محاسبهٔ مسیر یال‌ها با همان الگوریتم بوم.
 * نکتهٔ حیاتی: CSS مشترک کارت‌های چاپی «قبل از اندازه‌گیری» تزریق
 * می‌شود — بدون آن svg نماد ۳۰۰×۱۵۰px پیش‌فرض می‌شود و ارتفاع کارت
 * به‌شدت متورم می‌شود (مسیر یال‌ها از کارت‌ها جدا می‌شد).
 */
export function layoutChartPrint(source: ChartPrintSource): ChartPrintLayout {
  acquireSharedStyle()
  try {
    const heights: Record<string, number> = {}
    for (const n of source.nodes) {
      heights[n.id] = typeof document === 'undefined' ? NODE_H : measureCardHeight(n)
    }

    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const n of source.nodes) {
      const h = heights[n.id] ?? NODE_H
      minX = Math.min(minX, n.x - PRINT_PAD)
      minY = Math.min(minY, n.y - PRINT_PAD)
      maxX = Math.max(maxX, n.x + PRINT_NODE_W + PRINT_PAD)
      maxY = Math.max(maxY, n.y + h + PRINT_PAD)
    }
    if (!Number.isFinite(minX)) {
      return { width: 100, height: 100, cards: [], paths: [] }
    }

    const cards = source.nodes.map((n) => {
      const h = heights[n.id] ?? NODE_H
      const printX = n.x - minX
      const printY = n.y - minY
      return { ...n, printX, printY, height: h }
    })

    const nodeMap = new Map(cards.map((c) => [c.id, c]))
    const paths: Array<{ edge: ChartPrintEdge; d: string }> = []
    for (const e of source.edges) {
      const s = nodeMap.get(e.sourceId)
      const t = nodeMap.get(e.targetId)
      if (!s || !t) continue
      const sp = { x: s.printX, y: s.printY }
      const tp = { x: t.printX, y: t.printY }
      const auto = autoAnchors(sp, tp, s.height, t.height)
      const sa = e.sourceAnchor ?? auto[0]
      const ta = e.targetAnchor ?? auto[1]
      paths.push({ edge: e, d: orthogonalPath(sp, sa, tp, ta, s.height, t.height) })
    }

    // گستره نهایی: یال‌ها هم نباید بیرون قاب بمانند — بازبینی با نقاط مسیر
    let w = maxX - minX
    let h = maxY - minY
    for (const p of paths) {
      const nums = p.d.match(/-?\d+(?:\.\d+)?/g)
      if (!nums) continue
      for (let i = 0; i + 1 < nums.length; i += 2) {
        const px = Number(nums[i])
        const py = Number(nums[i + 1])
        w = Math.max(w, px + PRINT_PAD)
        h = Math.max(h, py + PRINT_PAD)
      }
    }

    return { width: Math.ceil(w), height: Math.ceil(h), cards, paths }
  } finally {
    releaseSharedStyle()
  }
}

function markerId(color: string | null, pageIdx: number): string {
  const suffix = color ? `-c-${color.replace(/[^a-zA-Z0-9]/g, '')}` : ''
  return `pdf-arrow${suffix}-p${pageIdx}`
}

function svgForLayout(layout: ChartPrintLayout, pageIdx: number): string {
  const colors = [...new Set(layout.paths.map((p) => p.edge.lineColor).filter((c): c is string => !!c))]
  let defs = ''
  const mk = (id: string, fill: string, size: number) =>
    `<marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="${size}" markerHeight="${size}" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${fill}"/></marker>`
  defs += mk(markerId(null, pageIdx), '#7257ff', 8)
  for (const c of colors) defs += mk(markerId(c, pageIdx), c, 8)

  let paths = ''
  for (const p of layout.paths) {
    const style = p.edge.lineStyle ?? 'SOLID'
    const dash = style === 'DASHED' ? ' stroke-dasharray="6 4"' : style === 'DOTTED' ? ' stroke-dasharray="1.5 3.5" stroke-linecap="round"' : ''
    const stroke = p.edge.lineColor ?? '#7257ff'
    const opacity = p.edge.lineColor ? 1 : p.edge.isChain ? 0.8 : 1
    paths +=
      `<path d="${p.d}" fill="none" stroke="${stroke}" stroke-opacity="${opacity}" stroke-width="2"${dash} ` +
      `marker-end="url(#${markerId(p.edge.lineColor, pageIdx)})"/>`
  }

  return (
    `<svg class="chart-print-svg" width="${layout.width}" height="${layout.height}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">` +
    `<defs>${defs}</defs>${paths}</svg>`
  )
}

export interface BuiltChartPrintDocument {
  root: HTMLElement
  cleanup: () => void
  pagesCount: number
}

/**
 * ساخت سند کامل چاپ — عنصر #chart-pdf-root به body افزوده می‌شود
 * همراه با استایل‌های لازم؛ خروجی، تابع پاک‌سازی است.
 * فراخواننده فقط window.print() را صدا می‌زند.
 */
export function buildChartPrintDocument(
  source: ChartPrintSource,
  layout: ChartPrintLayout,
  opts: ChartPrintOptions,
): BuiltChartPrintDocument {
  const base = PAPER_MM[opts.paper]
  const pm = opts.orientation === 'landscape' ? { w: base.h, h: base.w } : { w: base.w, h: base.h }
  const frame = {
    w: Math.max((pm.w - opts.marginMm * 2) * MM_TO_PX, 100),
    h: Math.max((pm.h - opts.marginMm * 2) * MM_TO_PX - (opts.showTitle ? TITLE_BLOCK_PX : 22), 100),
  }

  const fitScale = Math.min(frame.w / layout.width, frame.h / layout.height)
  const s = opts.mode === 'fit' ? fitScale : opts.tiledScale / 100
  const overlap = TILED_OVERLAP
  let cols = 1
  let rows = 1
  if (opts.mode === 'tiled') {
    cols = Math.max(1, Math.ceil((layout.width * s) / (frame.w - overlap)))
    rows = Math.max(1, Math.ceil((layout.height * s) / (frame.h - overlap)))
  }
  const pagesCount = cols * rows

  const pageStyle = document.createElement('style')
  pageStyle.id = 'chart-pdf-page-style'
  pageStyle.textContent = `@page { size: ${pm.w}mm ${pm.h}mm; margin: 0 }`

  const chartAreaHtml = (pageIdx: number) => {
    const cardsHtml = layout.cards
      .map(
        (c) =>
          `<div class="chart-print-card" style="left:${Math.round(c.printX)}px;top:${Math.round(c.printY)}px">${cardHtml(c)}</div>`
      )
      .join('')
    return `<div class="chart-print-area" style="position:relative;width:${layout.width}px;height:${layout.height}px">${svgForLayout(layout, pageIdx)}${cardsHtml}</div>`
  }

  const mkPage = (col: number, row: number, idx: number, inner: string): string => {
    const dateStr = new Date().toLocaleDateString('fa-IR')
    return (
      `<div class="chart-pdf-page" style="width:${pm.w}mm;height:${pm.h}mm">` +
      `<div class="chart-pdf-crop chart-pdf-crop-tl"></div><div class="chart-pdf-crop chart-pdf-crop-tr"></div>` +
      `<div class="chart-pdf-crop chart-pdf-crop-bl"></div><div class="chart-pdf-crop chart-pdf-crop-br"></div>` +
      `<div class="chart-pdf-frame" style="position:absolute;inset:${opts.marginMm}mm;overflow:hidden">` +
      (opts.showTitle
        ? `<div class="chart-pdf-title">${escapeHtml(source.chartTitle)}${opts.mode === 'tiled' ? ` — بخش (ردیف ${row + 1}، ستون ${col + 1})` : ''}</div>` +
          `<div class="chart-pdf-sub">تاریخ چاپ: ${dateStr}</div>`
        : '') +
      `<div class="chart-pdf-viewport" style="width:${Math.floor(frame.w)}px;height:${Math.floor(frame.h)}px;overflow:hidden;position:relative">${inner}</div>` +
      (opts.showPageNumbers
        ? `<div class="chart-pdf-num">صفحهٔ ${idx} از ${pagesCount}${opts.mode === 'tiled' ? ' — ردیف ' + (row + 1) + '، ستون ' + (col + 1) : ''}</div>`
        : '') +
      `</div></div>`
    )
  }

  const pages: string[] = []
  if (opts.mode === 'fit') {
    const offX = Math.max(0, (frame.w - layout.width * s) / 2)
    const offY = Math.max(0, (frame.h - layout.height * s) / 2)
    pages.push(
      mkPage(
        0,
        0,
        1,
        `<div style="position:absolute;left:${offX}px;top:${offY}px;transform:scale(${s});transform-origin:0 0">${chartAreaHtml(0)}</div>`
      )
    )
  } else {
    const vw = frame.w - overlap
    const vh = frame.h - overlap
    let idx = 1
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        // صفحهٔ (col,row) باید از نقطهٔ chart‌مبنای col*vw/s نمایش دهد:
        // جای‌گذاری = -s*(col*vw/s) = -col*vw (تصحیح مقیاس تایل‌دار)
        const tx = -(col * vw)
        const ty = -(row * vh)
        pages.push(
          mkPage(
            col,
            row,
            idx,
            `<div style="position:absolute;left:0;top:0;transform:translate(${tx}px,${ty}px) scale(${s});transform-origin:0 0">${chartAreaHtml(idx - 1)}</div>`
          )
        )
        idx++
      }
    }
  }

  const root = document.createElement('div')
  root.id = 'chart-pdf-root'
  root.innerHTML = pages.join('')

  const css = document.createElement('style')
  css.id = 'chart-pdf-print-css'
  css.textContent = `
    #chart-pdf-root { color-scheme: light; color: #0c1424; font-family: Vazirmatn, 'Segoe UI', Tahoma, sans-serif; }
    #chart-pdf-root, #chart-pdf-root * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    #chart-pdf-root .chart-pdf-page { position: relative; background: #fff; overflow: hidden; box-sizing: border-box; }
    #chart-pdf-root .chart-pdf-page + .chart-pdf-page { page-break-before: always; }
    #chart-pdf-root .chart-pdf-title { font: bold 13px Vazirmatn, sans-serif; color: #111; text-align: center; margin-bottom: 2px; direction: rtl; }
    #chart-pdf-root .chart-pdf-sub { font: 10px Vazirmatn, sans-serif; color: #555; text-align: center; margin-bottom: 6px; direction: rtl; }
    #chart-pdf-root .chart-pdf-num { font: 10px Vazirmatn, sans-serif; color: #444; text-align: center; margin-top: 4px; direction: rtl; }
    #chart-pdf-root .chart-pdf-crop { position: absolute; width: 10mm; height: 10mm; border-color: #555; }
    #chart-pdf-root .chart-pdf-crop-tl { top: 3mm; left: 3mm; border-top: 1px solid #555; border-left: 1px solid #555; }
    #chart-pdf-root .chart-pdf-crop-tr { top: 3mm; right: 3mm; border-top: 1px solid #555; border-right: 1px solid #555; }
    #chart-pdf-root .chart-pdf-crop-bl { bottom: 3mm; left: 3mm; border-bottom: 1px solid #555; border-left: 1px solid #555; }
    #chart-pdf-root .chart-pdf-crop-br { bottom: 3mm; right: 3mm; border-bottom: 1px solid #555; border-right: 1px solid #555; }
    @media print {
      body > *:not(#chart-pdf-root) { display: none !important; }
      #chart-pdf-root { display: block !important; }
      /* CSS چاپ گزارش‌ها (globals.css) «body *» را visibility:hidden می‌کند؛
         بدون بازگرداندن آن برای سند نمودار، خروجی PDF سفید می‌شد. */
      #chart-pdf-root, #chart-pdf-root * { visibility: visible !important; }
      #chart-pdf-root .chart-pdf-page { break-inside: avoid; }
    }
    @media screen { #chart-pdf-root { display: none; } }
  `

  const shared = acquireSharedStyle()
  document.head.appendChild(pageStyle)
  document.head.appendChild(css)
  document.body.appendChild(root)

  let cleaned = false
  const cleanup = () => {
    if (cleaned) return
    cleaned = true
    root.remove()
    css.remove()
    pageStyle.remove()
    releaseSharedStyle()
  }

  return { root, cleanup, pagesCount }
}

// قلاب تست مرورگر — برای راستی‌آزمایی خروجی PDF با ابزار پردازش تصویر
if (typeof window !== 'undefined') {
  ;(window as unknown as Record<string, unknown>).__T2C_PDF_TEST__ = {
    layoutChartPrint,
    buildChartPrintDocument,
  }
}
