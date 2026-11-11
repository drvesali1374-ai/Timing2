// ═══════════════════════════════════════════════════════════
// تست parity موتور هم‌پوشانی — آنلاین (TS) در برابر آفلاین (JS)
// همان fixture روی هر دو موتور → نتایج باید دقیقاً یکسان باشد.
// اجرا: bun scripts/test-overlap-parity.ts
// ═══════════════════════════════════════════════════════════
import * as ONLINE from '../src/calculation/overlap-matrix'
// بارگذاری formulas.js آفلاین در globalThis (الگوی IIFE)
import '../offline/js/formulas.js'

const OFF = (globalThis as unknown as { T2F: typeof ONLINE }).T2F

let pass = 0
let fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    pass++
  } else {
    fail++
    console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`)
  }
}

type Pair = { status: 'UNREVIEWED' | 'NO_OVERLAP' | 'OVERLAP'; overlapDuration: number | null }
const V = (d: number | null): Pair => (d == null ? { status: 'UNREVIEWED', overlapDuration: null } : { status: 'OVERLAP', overlapDuration: d })
const Z = (): Pair => ({ status: 'NO_OVERLAP', overlapDuration: 0 })

interface Fixture {
  name: string
  members: string[]
  durations: Record<string, number | null>
  intervals: Record<string, { startOffset: number; endOffset: number } | null>
  pairs: Record<string, Pair>
}

const fixtures: Fixture[] = [
  {
    name: 'آزمون ۲ — سه‌تایی INVALID',
    members: ['A', 'B', 'C'],
    durations: { A: 10, B: 10, C: 10 },
    intervals: {},
    pairs: { 'A|B': V(8), 'A|C': V(8), 'B|C': V(1) },
  },
  {
    name: 'آزمون ۳ — سراسری INVALID (AB=AC=BC=5)',
    members: ['A', 'B', 'C'],
    durations: { A: 10, B: 10, C: 10 },
    intervals: {},
    pairs: { 'A|B': V(5), 'A|C': V(5), 'B|C': V(5) },
  },
  {
    name: 'آزمون ۴ — provisional با BC بررسی‌نشده',
    members: ['A', 'B', 'C'],
    durations: { A: 40, B: 40, C: 30 },
    intervals: {},
    pairs: { 'A|B': V(30), 'A|C': V(20), 'B|C': V(null) },
  },
  {
    name: 'آزمون ۵ — VALID با بازه‌های واقعی',
    members: ['A', 'B', 'C'],
    durations: { A: 50, B: 40, C: 20 },
    intervals: { A: { startOffset: 10, endOffset: 60 }, B: { startOffset: 0, endOffset: 40 }, C: { startOffset: 40, endOffset: 60 } },
    pairs: { 'A|B': V(30), 'A|C': V(20), 'B|C': Z() },
  },
  {
    name: 'آزمون ۶ — سه بازه یکسان',
    members: ['A', 'B', 'C'],
    durations: { A: 10, B: 10, C: 10 },
    intervals: {},
    pairs: { 'A|B': V(10), 'A|C': V(10), 'B|C': V(10) },
  },
  {
    name: 'عضویت پویا — F بدون رابطه',
    members: ['A', 'B', 'F'],
    durations: { A: 5, B: 5, F: 5 },
    intervals: {},
    pairs: { 'A|B': V(3) },
  },
  {
    name: 'مدت گم‌شده — INDETERMINATE',
    members: ['A', 'B', 'C'],
    durations: { A: 10, B: null, C: 10 },
    intervals: {},
    pairs: { 'A|B': V(4), 'B|C': Z() },
  },
  {
    name: 'خطای محلی — بیش از مدت',
    members: ['A', 'B'],
    durations: { A: 10, B: 8 },
    intervals: {},
    pairs: { 'A|B': V(9) },
  },
]

for (const fx of fixtures) {
  const lookup = (a: string, b: string) => fx.pairs[`${a < b ? a : b}|${a < b ? b : a}`]
  const nameOf = (id: string) => id
  const on = ONLINE.runFullValidation(fx.members, fx.durations, fx.intervals, lookup, nameOf)
  const off = OFF.runFullValidation(fx.members, fx.durations, fx.intervals, lookup, nameOf)
  check(`${fx.name}: verdict یکسان`, on.confirmed.verdict === off.confirmed.verdict, `${on.confirmed.verdict} ≠ ${off.confirmed.verdict}`)
  check(`${fx.name}: شمار خطای محلی یکسان`, on.localFailures.length === off.localFailures.length)
  check(`${fx.name}: شمار سه‌تایی یکسان`, on.tripleIssues.length === off.tripleIssues.length)
  check(`${fx.name}: شمار هشدار provisional یکسان`, on.provisional.warnings.length === off.provisional.warnings.length)
  check(`${fx.name}: multiOverlaps یکسان`, JSON.stringify(on.multiOverlaps) === JSON.stringify(off.multiOverlaps))
  check(`${fx.name}: unions یکسان`, JSON.stringify(on.unions) === JSON.stringify(off.unions))
}

// توابع پایه
{
  const a = { startOffset: 0, endOffset: 50 }
  const b = { startOffset: -10, endOffset: 30 }
  check('pairwiseOverlap یکسان', ONLINE.pairwiseOverlap(a, b) === OFF.pairwiseOverlap(a, b))
  check('unionOfIntervals یکسان', ONLINE.unionOfIntervals([a, b]) === OFF.unionOfIntervals([a, b]))
  check('pairwiseOverlapFromDelta یکسان', ONLINE.pairwiseOverlapFromDelta(10, 8, 5) === OFF.pairwiseOverlapFromDelta(10, 8, 5))
}

// property-based مشترک با seed یکسان — هر دو موتور باید روی ۲۰۰ مجموعه یکسان پاسخ دهند
{
  let seed = 2026
  const rnd = () => {
    seed ^= seed << 13
    seed ^= seed >>> 17
    seed ^= seed << 5
    return ((seed >>> 0) % 100000) / 100000
  }
  let allMatch = true
  let detail = ''
  for (let trial = 0; trial < 200; trial++) {
    const n = 2 + Math.floor(rnd() * 4)
    const members = Array.from({ length: n }, (_, i) => `E${i}`)
    const durations: Record<string, number | null> = {}
    const intervals: Record<string, { startOffset: number; endOffset: number } | null> = {}
    for (const id of members) {
      const s = Math.round(rnd() * 40)
      const d = 1 + Math.round(rnd() * 20)
      intervals[id] = { startOffset: s, endOffset: s + d }
      durations[id] = d
    }
    const pairs: Record<string, Pair> = {}
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const o = ONLINE.pairwiseOverlap(intervals[members[i]]!, intervals[members[j]]!)
        pairs[`${members[i]}|${members[j]}`] = o > 0 ? V(o) : Z()
      }
    }
    const lookup = (a: string, b: string) => pairs[`${a < b ? a : b}|${a < b ? b : a}`]
    const on = ONLINE.runFullValidation(members, durations, intervals, lookup)
    const off = OFF.runFullValidation(members, durations, intervals, lookup)
    if (on.confirmed.verdict !== off.confirmed.verdict || JSON.stringify(on.multiOverlaps) !== JSON.stringify(off.multiOverlaps)) {
      allMatch = false
      detail = `trial ${trial}: ${on.confirmed.verdict}/${off.confirmed.verdict}`
      break
    }
    // بازه‌های واقعی → VALID روی هر دو
    if (on.confirmed.verdict !== 'VALID' || off.confirmed.verdict !== 'VALID') {
      allMatch = false
      detail = `trial ${trial}: بازه واقعی باید VALID باشد`
      break
    }
  }
  check('۲۰۰ مجموعهٔ تصادفی — نتایج دو موتور یکسان و VALID', allMatch, detail)
}

console.log(`═══ parity موتور هم‌پوشانی: ${pass} پاس / ${fail} خطا ═══`)
if (fail > 0) process.exit(1)
