// ═══════════════════════════════════════════════════════════
// تست سریع موتور هم‌پوشانی — ۱۳ آزمون اجباری §۹ سند جلسه ۲
// اجرا: bun scripts/test-overlap-quick.ts
// ═══════════════════════════════════════════════════════════
import {
  validatePairLocally,
  tripleConstraintViolations,
  validateIntervalRealizability,
  multiOverlap,
  unionOfIntervals,
  pairwiseOverlap,
  minimumRequiredOverlap,
  runFullValidation,
  type PairOverlapValue,
} from '../src/calculation/overlap-matrix'

let pass = 0
let fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    pass++
    console.log(`  ✓ ${name}`)
  } else {
    fail++
    console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`)
  }
}

const V = (overlapDuration: number | null): PairOverlapValue =>
  overlapDuration == null ? { status: 'UNREVIEWED', overlapDuration: null } : { status: 'OVERLAP', overlapDuration }
const ZERO = (): PairOverlapValue => ({ status: 'NO_OVERLAP', overlapDuration: 0 })

console.log('— آزمون ۱: A=10، B=8، O=9 → INVALID (بیش از مدت)')
{
  const durations = { A: 10, B: 8 }
  const local = validatePairLocally({ elementAId: 'A', elementBId: 'B', ...V(9) }, durations)
  check('خطای محلی EXCEEDS_DURATION', local.some((f) => f.code === 'EXCEEDS_DURATION'))
}

console.log('— آزمون ۲: A=B=C=10، AB=8، AC=8، BC=1 → INVALID (سه‌تایی: BC ≥ 6)')
{
  const durations = { A: 10, B: 10, C: 10 }
  const pairs: Record<string, PairOverlapValue> = { 'A|B': V(8), 'A|C': V(8), 'B|C': V(1) }
  const lookup = (a: string, b: string) => (pairs[a < b ? `${a}|${b}` : `${b}|${a}`])
  const triples = tripleConstraintViolations(['A', 'B', 'C'], durations, lookup)
  check('نقض سه‌تایی تشخیص داده شد', triples.length > 0)
  const full = runFullValidation(['A', 'B', 'C'], durations, {}, lookup)
  check('سراسری INVALID', full.confirmed.verdict === 'INVALID')
}

console.log('— آزمون ۳: A=B=C=10، AB=AC=BC=5 → عدم تحقق سراسری (INVALID)')
{
  const durations = { A: 10, B: 10, C: 10 }
  const pairs: Record<string, PairOverlapValue> = { 'A|B': V(5), 'A|C': V(5), 'B|C': V(5) }
  const lookup = (a: string, b: string) => pairs[a < b ? `${a}|${b}` : `${b}|${a}`]
  const res = validateIntervalRealizability(['A', 'B', 'C'], durations, lookup)
  check('validator سراسری INVALID', res.verdict === 'INVALID', `got ${res.verdict}`)
  check('سه‌تایی نقض ندارد (شرط لازم اما کافی نیست)', tripleConstraintViolations(['A', 'B', 'C'], durations, lookup).length === 0)
}

console.log('— آزمون ۴: A=40، B=40، C=30، AB=30، AC=20، BC بررسی‌نشده → هشدار حداقل 10')
{
  const durations = { A: 40, B: 40, C: 30 }
  const pairs: Record<string, PairOverlapValue> = { 'A|B': V(30), 'A|C': V(20), 'B|C': V(null) }
  const lookup = (a: string, b: string) => pairs[a < b ? `${a}|${b}` : `${b}|${a}`]
  const min = minimumRequiredOverlap('B', 'C', ['A', 'B', 'C'], durations, lookup)
  check('حداقل لازم BC = 10', Math.abs(min - 10) < 1e-9, `got ${min}`)
  const full = runFullValidation(['A', 'B', 'C'], durations, {}, lookup)
  check('هشدار provisional صادر شد', full.provisional.warnings.length > 0)
  check('داده تأییدشده INVALID نیست', full.confirmed.verdict === 'VALID', `got ${full.confirmed.verdict}`)
}

console.log('— آزمون ۵: A=[0,50)، B=[-10,30)، C=[30,50)، AB=30، AC=20، BC=0 → VALID')
{
  const durations = { A: 50, B: 40, C: 20 }
  const pairs: Record<string, PairOverlapValue> = { 'A|B': V(30), 'A|C': V(20), 'B|C': ZERO() }
  const lookup = (a: string, b: string) => pairs[a < b ? `${a}|${b}` : `${b}|${a}`]
  const res = validateIntervalRealizability(['A', 'B', 'C'], durations, lookup)
  check('validator سراسری VALID', res.verdict === 'VALID', `got ${res.verdict} ${JSON.stringify(res.issues)}`)
  // بازه‌های واقعی هم مطابقت دارند
  const pAB = pairwiseOverlap({ startOffset: 0, endOffset: 50 }, { startOffset: -10, endOffset: 30 })
  const pAC = pairwiseOverlap({ startOffset: 0, endOffset: 50 }, { startOffset: 30, endOffset: 50 })
  const pBC = pairwiseOverlap({ startOffset: -10, endOffset: 30 }, { startOffset: 30, endOffset: 50 })
  check('pairwise از بازه واقعی: AB=30', Math.abs(pAB - 30) < 1e-9)
  check('pairwise از بازه واقعی: AC=20', Math.abs(pAC - 20) < 1e-9)
  check('pairwise از بازه واقعی: BC=0 (تماس مرزی هم‌پوشانی نیست)', pBC === 0)
  const u = unionOfIntervals([
    { startOffset: 0, endOffset: 50 },
    { startOffset: -10, endOffset: 30 },
    { startOffset: 30, endOffset: 50 },
  ])
  check('union = 60', Math.abs((u ?? 0) - 60) < 1e-9, `got ${u}`)
}

console.log('— آزمون ۶: سه بازه یکسان مدت 10 → همه زوج‌ها و triple = 10 و VALID')
{
  const durations = { A: 10, B: 10, C: 10 }
  const pairs: Record<string, PairOverlapValue> = { 'A|B': V(10), 'A|C': V(10), 'B|C': V(10) }
  const lookup = (a: string, b: string) => pairs[a < b ? `${a}|${b}` : `${b}|${a}`]
  const res = validateIntervalRealizability(['A', 'B', 'C'], durations, lookup)
  check('VALID', res.verdict === 'VALID', `got ${res.verdict}`)
  const mo = multiOverlap(['A', 'B', 'C'], lookup, durations)
  check('multi-overlap = 10', mo.value === 10 && !mo.provisional)
}

console.log('— آزمون ۸: A از 20 به 10 تغییر کند در حالی که AB=15 → رد داده جدید')
{
  const durations = { A: 10, B: 20 } // مدت جدید A
  const local = validatePairLocally({ elementAId: 'A', elementBId: 'B', ...V(15) }, durations)
  check('EXCEEDS_DURATION پس از تغییر مدت', local.some((f) => f.code === 'EXCEEDS_DURATION'))
}

console.log('— آزمون ۱۰: عضویت پویا — F بدون رابطه در هیچ محاسبه‌ای نیست')
{
  const pairs: Record<string, PairOverlapValue> = { 'A|B': V(3) }
  const lookup = (a: string, b: string) => pairs[a < b ? `${a}|${b}` : `${b}|${a}`]
  const mo = multiOverlap(['A', 'B', 'F'], lookup, { A: 5, B: 5, F: 5 })
  check('زوج بدون رابطه → provisional', mo.provisional && mo.missingPairs.some((p) => p.includes('F')))
}

console.log('— آزمون ۱۳ الف: property-based — بازه‌های واقعی تصادفی → همیشه VALID')
{
  let seed = 42
  const rnd = () => {
    // xorshift32 با seed ثابت — قابل تکرار
    seed ^= seed << 13
    seed ^= seed >>> 17
    seed ^= seed << 5
    return ((seed >>> 0) % 100000) / 100000
  }
  let allValid = true
  let detail = ''
  for (let trial = 0; trial < 300; trial++) {
    const n = 2 + Math.floor(rnd() * 4) // 2..5 عنصر
    const ids = Array.from({ length: n }, (_, i) => `E${i}`)
    const intervals: Record<string, { startOffset: number; endOffset: number }> = {}
    const durations: Record<string, number | null> = {}
    for (const id of ids) {
      const s = Math.round(rnd() * 40)
      const d = 1 + Math.round(rnd() * 20)
      intervals[id] = { startOffset: s, endOffset: s + d }
      durations[id] = d
    }
    const pairs: Record<string, PairOverlapValue> = {}
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const o = pairwiseOverlap(intervals[ids[i]], intervals[ids[j]])
        pairs[`${ids[i]}|${ids[j]}`] = o > 0 ? V(o) : ZERO()
      }
    }
    const lookup = (a: string, b: string) => pairs[a < b ? `${a}|${b}` : `${b}|${a}`]
    const res = validateIntervalRealizability(ids, durations, lookup)
    if (res.verdict !== 'VALID') {
      allValid = false
      detail = `trial ${trial}: ${res.verdict} ${JSON.stringify(intervals)}`
      break
    }
    // multi-overlap هم باید ≤ هر زوج و union سازگار باشد
    const mo = multiOverlap(ids, lookup, durations)
    if (mo.value != null && !mo.provisional) {
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const p = lookup(ids[i], ids[j])!
          const pv = p.status === 'NO_OVERLAP' ? 0 : p.overlapDuration ?? 0
          if (mo.value > pv + 1e-9) {
            allValid = false
            detail = `trial ${trial}: multi ${mo.value} > pair ${pv}`
          }
        }
      }
    }
    const realUnion = unionOfIntervals(ids.map((id) => intervals[id]))
    if (n <= 3 && realUnion != null) {
      const byIE = runFullValidation(ids, durations, intervals, lookup)
      const key = [...ids].sort().join('|')
      const u = byIE.unions[key]
      if (u?.source === 'INCLUSION_EXCLUSION' && Math.abs((u.value ?? 0) - realUnion) > 1e-6) {
        allValid = false
        detail = `trial ${trial}: union IE ${u.value} ≠ sweep ${realUnion}`
      }
    }
  }
  check('۳۰۰ مجموعهٔ تولیدشده از بازه واقعی → VALID', allValid, detail)
}

console.log('— آزمون ۱۳ ب: نمونه‌های نامعتبر تصادفی با seed → INVALID یا خطای محلی')
{
  let seed = 1337
  const rnd = () => {
    seed ^= seed << 13
    seed ^= seed >>> 17
    seed ^= seed << 5
    return ((seed >>> 0) % 100000) / 100000
  }
  let caught = 0
  let total = 0
  for (let trial = 0; trial < 300; trial++) {
    const n = 3
    const ids = Array.from({ length: n }, (_, i) => `E${i}`)
    const durations: Record<string, number | null> = {}
    for (const id of ids) durations[id] = 1 + Math.round(rnd() * 15)
    const pairs: Record<string, PairOverlapValue> = {}
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const o = Math.round(rnd() * 15)
        pairs[`${ids[i]}|${ids[j]}`] = o > 0 ? V(o) : ZERO()
      }
    }
    const lookup = (a: string, b: string) => pairs[a < b ? `${a}|${b}` : `${b}|${a}`]
    const full = runFullValidation(ids, durations, {}, lookup)
    total++
    const invalid =
      full.localFailures.length > 0 || full.tripleIssues.length > 0 || full.confirmed.verdict === 'INVALID'
    if (invalid) caught++
  }
  // اکثر نمونه‌های تصادفی نامعتبرند؛ حداقل باید درصد قابل‌توجهی گرفته شوند
  check(`نمونه‌های نامعتبر شناسایی شدند (${caught}/${total})`, caught >= total * 0.5, `caught=${caught}`)
}

console.log(`\n═══ نتیجه: ${pass} پاس / ${fail} خطا ═══`)
if (fail > 0) process.exit(1)
