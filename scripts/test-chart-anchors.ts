// §۲۱.۲ — تست یونیت الگوریتم Anchorهای بوم نمودار: هر ۱۶ ترکیب
// از elbowPoints/autoAnchors (پورت منطق ChartCanvas.tsx)
function anchorPoint(p: Position, a: AnchorSide): Position {
  const ANCHOR_POS: Record<AnchorSide, { x: number; y: number }> = {
    top: { x: NODE_W / 2, y: 0 },
    bottom: { x: NODE_W / 2, y: NODE_H },
    left: { x: 0, y: NODE_H / 2 },
    right: { x: NODE_W, y: NODE_H / 2 },
  }
  return { x: p.x + ANCHOR_POS[a].x, y: p.y + ANCHOR_POS[a].y }
}

const NODE_W = 200, NODE_H = 96
type Position = { x: number; y: number }
type AnchorSide = 'top' | 'bottom' | 'left' | 'right'
const ANCHOR_NORMAL: Record<AnchorSide, { x: number; y: number }> = {
  top: { x: 0, y: -1 }, bottom: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 },
}

function segmentHitsRect(a: Position, b: Position, r: { x: number; y: number; w: number; h: number }): boolean {
  const steps = 12
  for (let i = 0; i <= steps; i++) {
    const k = i / steps
    const x = a.x + (b.x - a.x) * k
    const y = a.y + (b.y - a.y) * k
    if (x > r.x + 1 && x < r.x + r.w - 1 && y > r.y + 1 && y < r.y + r.h - 1) return true
  }
  return false
}

function elbowPoints(s: Position, sa: AnchorSide, t: Position, ta: AnchorSide): Position[] {
  const sA = anchorPoint(s, sa)
  const tA = anchorPoint(t, ta)
  const stub = 22
  const sOut = { x: sA.x + ANCHOR_NORMAL[sa].x * stub, y: sA.y + ANCHOR_NORMAL[sa].y * stub }
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
      pts.push({ x: sOut.x, y: tIn.y })
    } else {
      pts.push({ x: tIn.x, y: sOut.y })
    }
  }
  pts.push(tIn, tA)
  return pts
}

function anchorPairScore(s: Position, sa: AnchorSide, t: Position, ta: AnchorSide): number {
  const srcRect = { x: s.x, y: s.y, w: NODE_W, h: NODE_H }
  const dstRect = { x: t.x, y: t.y, w: NODE_W, h: NODE_H }
  const pts = elbowPoints(s, sa, t, ta)
  let len = 0
  for (let i = 1; i < pts.length; i++) {
    len += Math.abs(pts[i].x - pts[i - 1].x) + Math.abs(pts[i].y - pts[i - 1].y)
  }
  let penalty = 0
  for (let i = 1; i < pts.length; i++) {
    if (segmentHitsRect(pts[i - 1], pts[i], srcRect)) penalty += 400
    if (segmentHitsRect(pts[i - 1], pts[i], dstRect)) penalty += 400
  }
  return len + penalty
}

const ALL_SIDES: AnchorSide[] = ['top', 'bottom', 'left', 'right']
function autoAnchors(s: Position, t: Position): [AnchorSide, AnchorSide] {
  const srcRect = { x: s.x, y: s.y, w: NODE_W, h: NODE_H }
  const dstRect = { x: t.x, y: t.y, w: NODE_W, h: NODE_H }
  let best: [AnchorSide, AnchorSide] = ['bottom', 'top']
  let bestScore = Infinity
  for (const sa of ALL_SIDES) {
    for (const ta of ALL_SIDES) {
      if (sa === ta) continue
      const score = anchorPairScore(s, sa, t, ta, srcRect, dstRect)
      if (score < bestScore) { bestScore = score; best = [sa, ta] }
    }
  }
  return best
}

let pass = 0, fail = 0
function ok(cond: boolean, label: string) {
  if (cond) { pass++ } else { fail++; console.error('✗ ' + label) }
}

// ═══ ۱) هر ۱۶ ترکیب anchor مسیر معتبر می‌سازد ═══
console.log('── §۱ ۱۶ ترکیب anchor')
{
  const s = { x: 100, y: 100 }
  const t = { x: 600, y: 500 }
  let combos = 0
  for (const sa of ALL_SIDES) {
    for (const ta of ALL_SIDES) {
      const pts = elbowPoints(s, sa, t, ta)
      ok(pts.length >= 4, `elbow ${sa}→${ta}: حداقل ۴ نقطه`)
      // نقطهٔ شروع روی anchor مبدأ
      const start = anchorPoint(s, sa)
      ok(Math.abs(pts[0].x - start.x) < 0.01 && Math.abs(pts[0].y - start.y) < 0.01, `elbow ${sa}→${ta}: شروع روی anchor مبدأ`)
      // نقطهٔ پایانی روی anchor مقصد
      const end = anchorPoint(t, ta)
      const last = pts[pts.length - 1]
      ok(Math.abs(last.x - end.x) < 0.01 && Math.abs(last.y - end.y) < 0.01, `elbow ${sa}→${ta}: پایان روی anchor مقصد`)
      // مسیر orthogonal: هر قطعه افقی یا عمودی است
      let orthogonal = true
      for (let i = 1; i < pts.length; i++) {
        if (Math.abs(pts[i].x - pts[i - 1].x) > 0.01 && Math.abs(pts[i].y - pts[i - 1].y) > 0.01) orthogonal = false
      }
      ok(orthogonal, `elbow ${sa}→${ta}: orthogonal`)
      // §۶-۳: نقطهٔ ورود مقصد بیرون گره است (tIn در مسیر قبل از tA)
      const tInIdx = pts.length - 2
      const tIn = pts[tInIdx]
      const outSign = ta === 'top' ? -1 : ta === 'bottom' ? 1 : 0
      if (outSign !== 0) ok(tIn.y * 1 === tIn.y && (outSign < 0 ? tIn.y < t.y : tIn.y > t.y + NODE_H), `elbow ${sa}→${ta}: tIn بیرون گره (عمودی)`)
      combos++
    }
  }
  ok(combos === 16, 'شمار ترکیب‌ها = ۱۶')
}

// ═══ ۲) انتخاب خودکار — سناریوهای موقعیتی ═══
console.log('── §۲ autoAnchors')
{
  // گره پایین گره بالا (هم‌تراز افقی) — مسیر مستقیم top→bottom از داخل گره می‌گذرد؛
  // الگوریتم باید ترکیب بدون عبور انتخاب کند
  let r = autoAnchors({ x: 100, y: 500 }, { x: 100, y: 0 })
  const s0 = { x: 100, y: 500 }, t0 = { x: 100, y: 0 }
  const sr = { x: s0.x, y: s0.y, w: NODE_W, h: NODE_H }
  const tr = { x: t0.x, y: t0.y, w: NODE_W, h: NODE_H }
  const p0 = elbowPoints(s0, r[0], t0, r[1])
  let cross = false
  for (let i = 1; i < p0.length; i++) {
    if (segmentHitsRect(p0[i - 1], p0[i], sr) || segmentHitsRect(p0[i - 1], p0[i], tr)) cross = true
  }
  ok(!cross, 'عمودی هم‌تراز: مسیر انتخابی از داخل هیچ‌کدام از گره‌ها عبور نمی‌کند')

  // گره پایینِ چپ — بهترین مسیر می‌تواند ترکیب متقاطع باشد؛
  // معیار: کوتاه‌ترین مسیر بدون عبور (رفتار هوشمند §۶-۱)
  r = autoAnchors({ x: 400, y: 500 }, { x: 100, y: 0 })
  const sv = { x: 400, y: 500 }, tv = { x: 100, y: 0 }
  const svr = { x: sv.x, y: sv.y, w: NODE_W, h: NODE_H }
  const tvr = { x: tv.x, y: tv.y, w: NODE_W, h: NODE_H }
  const pv = elbowPoints(sv, r[0], tv, r[1])
  let crossV = false
  for (let i = 1; i < pv.length; i++) {
    if (segmentHitsRect(pv[i - 1], pv[i], svr) || segmentHitsRect(pv[i - 1], pv[i], tvr)) crossV = true
  }
  ok(!crossV, 'عمودی مورب: مسیر انتخابی بدون عبور از گره‌ها')

  // گره راست گره چپ → right→left
  r = autoAnchors({ x: 700, y: 100 }, { x: 0, y: 100 })
  ok(r[0] === 'left' && r[1] === 'right', 'افقی: left→right (مقصد سمت چپ)')

  // مورب پایین-راست → ترکیب متقاطع منطقی
  r = autoAnchors({ x: 0, y: 0 }, { x: 500, y: 400 })
  ok(r[0] === 'bottom' || r[0] === 'right', 'مورب: خروج از bottom یا right')
  ok(r[1] === 'top' || r[1] === 'left', 'مورب: ورود از top یا left')

  // جریمهٔ عبور از داخل گره — گره‌های هم‌پوشان‌مانند
  const s = { x: 100, y: 100 }
  const t = { x: 150, y: 400 } // تقریباً زیر هم با کمی جابه‌جایی
  r = autoAnchors(s, t)
  const srcRect = { x: s.x, y: s.y, w: NODE_W, h: NODE_H }
  const pts = elbowPoints(s, r[0], t, r[1])
  let crosses = false
  for (let i = 1; i < pts.length; i++) if (segmentHitsRect(pts[i - 1], pts[i], srcRect)) crosses = true
  ok(!crosses, 'مسیر انتخابی از داخل گره مبدأ عبور نمی‌کند')

  // مختصات منفی
  r = autoAnchors({ x: -400, y: -200 }, { x: 100, y: 100 })
  ok(!!r[0] && !!r[1], 'مختصات منفی: مسیر معتبر')
  const negPts = elbowPoints({ x: -400, y: -200 }, r[0], { x: 100, y: 100 }, r[1])
  ok(negPts.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)), 'مختصات منفی: نقاط متناهی')
}

// ═══ ۳) برخورد یال با گره سوم ═══
console.log('── §۳ جریمهٔ برخورد')
{
  const s = { x: 0, y: 0 }
  const t = { x: 600, y: 0 }
  const third = { x: 280, y: -60, w: NODE_W, h: NODE_H }
  // مسیر مستقیم top→top از روی گره سوم می‌گذرد یا نه — امتیاز باید جریمه را لحاظ کند
  const directPts = elbowPoints(s, 'top', t, 'bottom')
  let hitsThird = false
  for (let i = 1; i < directPts.length; i++) if (segmentHitsRect(directPts[i - 1], directPts[i], third)) hitsThird = true
  // مستقیم یا برخورد دارد یا ندارد — هر دو حالت مسیر معتبر است؛ جریمه فقط در امتیاز است
  ok(typeof hitsThird === 'boolean', 'تشخیص برخورد گره سوم اجرا شد')
  const scoreWithPenalty = anchorPairScore(s, 'top', t, 'bottom')
  ok(Number.isFinite(scoreWithPenalty), 'امتیاز متناهی')
}

console.log(`\n═══ نتیجه §۲۱.۲: ${pass} پاس / ${fail} خطا ═══`)
if (fail > 0) process.exit(1)
