// ═══════════════════════════════════════════════════════════
// هندسهٔ مشترک نمودار فرایند OPC/FPC — v1.5.2
// ▸ استخراج‌شده از ChartCanvas.tsx تا سازندهٔ سند چاپ (chart-print)
//   و خود بوم از «یک» منطق مسیریابی استفاده کنند.
// ▸ امضای توابع ارتفاع هر گره را هم می‌پذیرد (پیش‌فرض NODE_H) تا
//   چاپ — که برچسب گره‌ها را کامل و چندخطی می‌چیند — مسیر یال‌ها را
//   با ارتفاع واقعی کارت‌های چاپی بازمحاسبه کند.
// ▸ هم‌ارز آفلاین: views-charts.js (همان الگوریتم، همان ثابت‌ها)
// ═══════════════════════════════════════════════════════════

/** عرض مرجع کارت گره — هماهنگ با ثابت‌های چیدمان بک‌اند */
export const NODE_W = 200
/** ارتفاع مرجع کارت گره در بوم (برچسب تک‌خطی بریده می‌شود) */
export const NODE_H = 96
export const MARGIN = 48

export type AnchorSide = 'top' | 'bottom' | 'left' | 'right'

export interface Position {
  x: number
  y: number
}

const ANCHOR_NORMAL: Record<AnchorSide, Position> = {
  top: { x: 0, y: -1 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
}

export const ALL_SIDES: AnchorSide[] = ['top', 'bottom', 'left', 'right']

export function anchorPoint(p: Position, a: AnchorSide, h?: number): Position {
  const hh = h ?? NODE_H
  switch (a) {
    case 'top':
      return { x: p.x + NODE_W / 2, y: p.y }
    case 'bottom':
      return { x: p.x + NODE_W / 2, y: p.y + hh }
    case 'left':
      return { x: p.x, y: p.y + hh / 2 }
    default:
      return { x: p.x + NODE_W, y: p.y + hh / 2 }
  }
}

/** تقاطع پاره‌خط با مستطیل (برای جریمهٔ عبور از داخل گره) — نمونه‌گیری چندنقطه‌ای ارزان */
export function segmentHitsRect(
  a: Position,
  b: Position,
  r: { x: number; y: number; w: number; h: number },
): boolean {
  const steps = 12
  for (let i = 0; i <= steps; i++) {
    const k = i / steps
    const x = a.x + (b.x - a.x) * k
    const y = a.y + (b.y - a.y) * k
    if (x > r.x + 1 && x < r.x + r.w - 1 && y > r.y + 1 && y < r.y + r.h - 1) return true
  }
  return false
}

/** نقاط مسیر elbow از anchor مبدأ به anchor مقصد — stub ۲۲px (§۶-۲) */
export function elbowPoints(
  s: Position,
  sa: AnchorSide,
  t: Position,
  ta: AnchorSide,
  hs?: number,
  ht?: number,
): Position[] {
  const sA = anchorPoint(s, sa, hs)
  const tA = anchorPoint(t, ta, ht)
  const stub = 22
  const sOut = { x: sA.x + ANCHOR_NORMAL[sa].x * stub, y: sA.y + ANCHOR_NORMAL[sa].y * stub }
  /* §۶-۳ — نقطهٔ ورود به مقصد باید «بیرون» گره باشد (tA + نرمال×stub)
   *  تا آخرین قطعه (tIn→tA) به سمت داخل گره و پیکانِ marker-end رو به
   *  مقصد باشد. */
  const tIn = { x: tA.x + ANCHOR_NORMAL[ta].x * stub, y: tA.y + ANCHOR_NORMAL[ta].y * stub }
  const pts: Position[] = [sA, sOut]
  const vSrc = sa === 'bottom' || sa === 'top'
  const vDst = ta === 'bottom' || ta === 'top'
  if (Math.abs(sOut.x - tIn.x) > 1 && Math.abs(sOut.y - tIn.y) > 1) {
    if (vSrc && vDst) {
      const midY = (sOut.y + tIn.y) / 2
      pts.push({ x: sOut.x, y: midY }, { x: tIn.x, y: midY })
    } else if (!vSrc && !vDst) {
      const midX = (sOut.x + tIn.x) / 2
      pts.push({ x: midX, y: sOut.y }, { x: midX, y: tIn.y })
    } else if (vSrc && !vDst) {
      // مبدأ عمودی → مقصد افقی: خم در سطح ورودی افقی مقصد
      pts.push({ x: sOut.x, y: tIn.y })
    } else {
      // مبدأ افقی → مقصد عمودی: خم در سطح خروجی افقی مبدأ
      pts.push({ x: tIn.x, y: sOut.y })
    }
  }
  pts.push(tIn, tA)
  return pts
}

/** امتیاز یک زوج anchor: طول مسیر + جریمهٔ عبور از داخل گره‌ها (§۶-۱) */
export function anchorPairScore(
  s: Position,
  sa: AnchorSide,
  t: Position,
  ta: AnchorSide,
  hs?: number,
  ht?: number,
): number {
  const pts = elbowPoints(s, sa, t, ta, hs, ht)
  let len = 0
  for (let i = 1; i < pts.length; i++) {
    len += Math.abs(pts[i].x - pts[i - 1].x) + Math.abs(pts[i].y - pts[i - 1].y)
  }
  const srcRect = { x: s.x, y: s.y, w: NODE_W, h: hs ?? NODE_H }
  const dstRect = { x: t.x, y: t.y, w: NODE_W, h: ht ?? NODE_H }
  let penalty = 0
  for (let i = 1; i < pts.length; i++) {
    if (segmentHitsRect(pts[i - 1], pts[i], srcRect)) penalty += 400
    if (segmentHitsRect(pts[i - 1], pts[i], dstRect)) penalty += 400
  }
  return len + penalty
}

/** بهترین جفت anchor از میان همهٔ ۱۶ ترکیب (§۶-۱) */
export function autoAnchors(s: Position, t: Position, hs?: number, ht?: number): [AnchorSide, AnchorSide] {
  let best: [AnchorSide, AnchorSide] = ['bottom', 'top']
  let bestScore = Infinity
  for (const sa of ALL_SIDES) {
    for (const ta of ALL_SIDES) {
      if (sa === ta) continue
      const score = anchorPairScore(s, sa, t, ta, hs, ht)
      if (score < bestScore) {
        bestScore = score
        best = [sa, ta]
      }
    }
  }
  return best
}

/** مسیر orthogonal/elbow از anchor مبدأ به anchor مقصد — بدون عبور از داخل گره */
export function orthogonalPath(
  s: Position,
  sa: AnchorSide,
  t: Position,
  ta: AnchorSide,
  hs?: number,
  ht?: number,
): string {
  return elbowPoints(s, sa, t, ta, hs, ht)
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${Math.round(p.x)} ${Math.round(p.y)}`)
    .join(' ')
}
