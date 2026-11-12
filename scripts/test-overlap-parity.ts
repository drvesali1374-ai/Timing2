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
  // §۳/§۴ ممیزی جلسه ۲ — intervalIssues و دو حکم نیز باید هم‌ارز باشند
  check(`${fx.name}: intervalIssues یکسان`, JSON.stringify(on.intervalIssues) === JSON.stringify(off.intervalIssues),
    `${JSON.stringify(on.intervalIssues).slice(0, 120)} ≠ ${JSON.stringify(off.intervalIssues).slice(0, 120)}`)
  const onV = ONLINE.computeVerdicts(fx.members, lookup, on)
  const offV = OFF.computeVerdicts(fx.members, lookup, off)
  check(`${fx.name}: confirmedVerdict یکسان`, onV.confirmedVerdict === offV.confirmedVerdict, `${onV.confirmedVerdict} ≠ ${offV.confirmedVerdict}`)
  check(`${fx.name}: overallVerdict یکسان`, onV.overallVerdict === offV.overallVerdict, `${onV.overallVerdict} ≠ ${offV.overallVerdict}`)
  check(`${fx.name}: hasUnreviewedRelation یکسان`,
    ONLINE.hasUnreviewedRelation(fx.members, lookup) === OFF.hasUnreviewedRelation(fx.members, lookup))
}

// ── §۱۴ ممیزی جلسه ۲ — fixtureهای مشترک الزامی (۱۱ سناریو) ──
const reviewFixtures: Fixture[] = [
  {
    name: 'R1 — سه حالت UNREVIEWED / NO_OVERLAP / OVERLAP هم‌زمان',
    members: ['A', 'B', 'C', 'D'],
    durations: { A: 10, B: 10, C: 10, D: 10 },
    intervals: {},
    pairs: { 'A|B': V(null), 'A|C': Z(), 'A|D': V(4), 'B|C': V(null), 'B|D': V(null), 'C|D': V(null) },
  },
  {
    name: 'R2 — رابطهٔ فعال بدون رکورد مقدار چرخه (= UNREVIEWED در سرویس) + رابطهٔ تعریف‌نشده',
    members: ['A', 'B', 'C'],
    durations: { A: 10, B: 10, C: 10 },
    intervals: {},
    // A-B و B-C تعریف‌شده ولی بدون مقدار؛ A-C اصلاً رابطه ندارد (undefined)
    pairs: { 'A|B': V(null), 'B|C': V(null) },
  },
  {
    name: 'R3 — بازهٔ واقعی با هم‌پوشانی ۵ ثانیه (A=[0,10) B=[5,15))',
    members: ['A', 'B'],
    durations: { A: 10, B: 10 },
    intervals: { A: { startOffset: 0, endOffset: 10 }, B: { startOffset: 5, endOffset: 15 } },
    pairs: { 'A|B': V(5) },
  },
  {
    name: 'R4 — تعارض مقدار دستی با بازهٔ واقعی (ثبت ۳ به‌جای ۵)',
    members: ['A', 'B'],
    durations: { A: 10, B: 10 },
    intervals: { A: { startOffset: 0, endOffset: 10 }, B: { startOffset: 5, endOffset: 15 } },
    pairs: { 'A|B': V(3) },
  },
  {
    name: 'R5 — تعارض NO_OVERLAP با بازهٔ واقعی مثبت',
    members: ['A', 'B'],
    durations: { A: 10, B: 10 },
    intervals: { A: { startOffset: 0, endOffset: 10 }, B: { startOffset: 5, endOffset: 15 } },
    pairs: { 'A|B': Z() },
  },
  {
    name: 'R6 — بازهٔ یکی از دو عنصر ناقص (ادعای VALID قطعی ممکن نیست)',
    members: ['A', 'B'],
    durations: { A: 10, B: 8 },
    intervals: { A: { startOffset: 0, endOffset: 10 }, B: null },
    pairs: { 'A|B': V(4) },
  },
  {
    name: 'R7 — تماس مرزی → هم‌پوشانی صفر (نه مثبت)',
    members: ['A', 'B'],
    durations: { A: 10, B: 10 },
    intervals: { A: { startOffset: 0, endOffset: 10 }, B: { startOffset: 10, endOffset: 20 } },
    pairs: { 'A|B': Z() },
  },
  {
    name: 'R8 — تناقض سه‌تایی D=10 AB=8 AC=8 BC=1',
    members: ['A', 'B', 'C'],
    durations: { A: 10, B: 10, C: 10 },
    intervals: { A: { startOffset: 0, endOffset: 10 }, B: { startOffset: 2, endOffset: 12 }, C: { startOffset: 2, endOffset: 12 } },
    pairs: { 'A|B': V(8), 'A|C': V(8), 'B|C': V(1) },
  },
  {
    name: 'R9 — multi-overlap با داده کامل',
    members: ['A', 'B', 'C'],
    durations: { A: 10, B: 10, C: 10 },
    intervals: { A: { startOffset: 0, endOffset: 10 }, B: { startOffset: 4, endOffset: 14 }, C: { startOffset: 6, endOffset: 16 } },
    pairs: { 'A|B': V(6), 'A|C': V(4), 'B|C': V(8) },
  },
  {
    name: 'R10 — multi-overlap با داده ناقص (BC بررسی‌نشده → provisional)',
    members: ['A', 'B', 'C'],
    durations: { A: 10, B: 10, C: 10 },
    intervals: { A: { startOffset: 0, endOffset: 10 }, B: { startOffset: 4, endOffset: 14 }, C: { startOffset: 6, endOffset: 16 } },
    pairs: { 'A|B': V(6), 'A|C': V(4), 'B|C': V(null) },
  },
  {
    name: 'R11 — چند مؤلفهٔ مستقل با روابط بررسی‌نشده',
    members: ['A', 'B', 'C', 'D', 'E'],
    durations: { A: 10, B: 10, C: 10, D: 10, E: 10 },
    intervals: {},
    pairs: { 'A|B': V(5), 'C|D': Z(), 'D|E': V(2), 'A|C': V(null) },
  },
]

for (const fx of reviewFixtures) {
  const lookup = (a: string, b: string) => fx.pairs[`${a < b ? a : b}|${a < b ? b : a}`]
  const nameOf = (id: string) => id
  const on = ONLINE.runFullValidation(fx.members, fx.durations, fx.intervals, lookup, nameOf)
  const off = OFF.runFullValidation(fx.members, fx.durations, fx.intervals, lookup, nameOf)
  const onV = ONLINE.computeVerdicts(fx.members, lookup, on)
  const offV = OFF.computeVerdicts(fx.members, lookup, off)
  check(`§۱۴ ${fx.name}: intervalIssues یکسان`, JSON.stringify(on.intervalIssues) === JSON.stringify(off.intervalIssues),
    `${JSON.stringify(on.intervalIssues).slice(0, 150)} ≠ ${JSON.stringify(off.intervalIssues).slice(0, 150)}`)
  check(`§۱۴ ${fx.name}: confirmedVerdict یکسان`, onV.confirmedVerdict === offV.confirmedVerdict, `${onV.confirmedVerdict} ≠ ${offV.confirmedVerdict}`)
  check(`§۱۴ ${fx.name}: overallVerdict یکسان`, onV.overallVerdict === offV.overallVerdict, `${onV.overallVerdict} ≠ ${offV.overallVerdict}`)
  check(`§۱۴ ${fx.name}: multiOverlaps یکسان`, JSON.stringify(on.multiOverlaps) === JSON.stringify(off.multiOverlaps))
  check(`§۱۴ ${fx.name}: provisional یکسان`, on.provisional.warnings.length === off.provisional.warnings.length)
}

// رفتارهای قطعی fixtureهای ممیزی (روی موتور آنلاین — آفلاین بالا هم‌ارزی تأیید شد)
{
  const f = reviewFixtures
  const run = (fx: Fixture) => {
    const lookup = (a: string, b: string) => fx.pairs[`${a < b ? a : b}|${a < b ? b : a}`]
    return { out: ONLINE.runFullValidation(fx.members, fx.durations, fx.intervals, lookup), lookup }
  }
  // R3: بازهٔ واقعی ۵ ثانیه — مقدار صحیح پذیرفته می‌شود (بدون خطای بازه)
  {
    const { out } = run(f[2])
    check('R3: مقدار ۵ با بازهٔ واقعی سازگار — بدون خطا', out.intervalIssues.length === 0 && out.confirmed.verdict === 'VALID',
      JSON.stringify(out.intervalIssues))
    check('R3: overallVerdict = VALID', ONLINE.computeVerdicts(f[2].members, run(f[2]).lookup, out).overallVerdict === 'VALID')
  }
  // R4/R5: تعارض مقدار دستی → DEFINITE
  {
    const r4 = run(f[3])
    check('R4: ثبت ۳ به‌جای ۵ → خطای قطعی بازه', r4.out.intervalIssues.some((i) => i.kind === 'DEFINITE' && i.computed === 5 && i.recorded === 3))
    const r5 = run(f[4])
    check('R5: NO_OVERLAP با بازهٔ مثبت → خطای قطعی بازه', r5.out.intervalIssues.some((i) => i.kind === 'DEFINITE' && i.computed === 5))
  }
  // R6: بازهٔ ناقص → INDETERMINATE (نه VALID قطعی، نه INVALID)
  {
    const r6 = run(f[5])
    check('R6: بازهٔ ناقص → issue ناقص (نه DEFINITE)', r6.out.intervalIssues.some((i) => i.kind === 'INDETERMINATE' && i.computed === null))
    check('R6: overallVerdict ≠ VALID', ONLINE.computeVerdicts(f[5].members, r6.lookup, r6.out).overallVerdict === 'INDETERMINATE')
  }
  // R7: تماس مرزی → NO_OVERLAP معتبر
  {
    const r7 = run(f[6])
    check('R7: تماس مرزی با NO_OVERLAP سازگار — بدون خطا', r7.out.intervalIssues.length === 0 && r7.out.confirmed.verdict === 'VALID')
  }
  // R1/R2: تفکیک سه حالت
  {
    const r1 = run(f[0])
    check('R1: زوج UNREVIEWED صفر قطعی تلقی نشد (بدون خطای مقدار)', !r1.out.localFailures.some((lf) => lf.pair.includes('A') && lf.pair.includes('B')))
    check('R1: overallVerdict = INDETERMINATE به دلیل بررسی‌نشده', ONLINE.computeVerdicts(f[0].members, r1.lookup, r1.out).overallVerdict === 'INDETERMINATE')
    const r2 = run(f[1])
    // مؤلفهٔ {A,B,C} با روابط A-B و B-C شکل می‌گیرد (رابطهٔ فعال بدون رکورد در
    // مؤلفهٔ خودش شناخته می‌شود)؛ برای قطعی‌شدن multi-overlap این مجموعه، هر سه
    // زوج لازم است → همه در missingPairs (از جمله زوج بدون رابطه A-C)
    const compMo = r2.out.multiOverlaps[['A', 'B', 'C'].sort().join('|')]
    check(
      'R2: مؤلفهٔ سه‌عضوی شکل گرفت و هر سه زوج لازم در missingPairs است',
      !!compMo && compMo.missingPairs.length === 3,
      JSON.stringify(compMo?.missingPairs),
    )
    // تمایز کلیدی §۳: رابطهٔ «تعریف‌نشده» ≠ «بررسی‌نشده» — فقط دومی نتیجهٔ نهایی
    // را INDETERMINATE می‌کند؛ زوج بدون رابطه مانع VALID شدن نیست
    const undefinedOnly: Fixture = {
      name: 'R2b — فقط زوج بدون رابطه (بدون هیچ UNREVIEWED)',
      members: ['A', 'B', 'C'],
      durations: { A: 10, B: 10, C: 10 },
      intervals: { A: { startOffset: 0, endOffset: 10 }, B: { startOffset: 5, endOffset: 15 } },
      pairs: { 'A|B': V(5) }, // B-C و A-C اصلاً رابطه ندارند
    }
    const r2bLookup = (a: string, b: string) => undefinedOnly.pairs[`${a < b ? a : b}|${a < b ? b : a}`]
    const r2bOut = ONLINE.runFullValidation(undefinedOnly.members, undefinedOnly.durations, undefinedOnly.intervals, r2bLookup)
    check(
      'R2b: زوج بدون رابطه نتیجهٔ نهایی را INDETERMINATE نمی‌کند',
      ONLINE.computeVerdicts(undefinedOnly.members, r2bLookup, r2bOut).overallVerdict === 'VALID',
      JSON.stringify(ONLINE.computeVerdicts(undefinedOnly.members, r2bLookup, r2bOut)),
    )
    const offR2b = OFF.runFullValidation(undefinedOnly.members, undefinedOnly.durations, undefinedOnly.intervals, r2bLookup)
    check(
      'R2b: آفلاین هم‌ارز — VALID',
      OFF.computeVerdicts(undefinedOnly.members, r2bLookup, offR2b).overallVerdict === 'VALID',
    )
  }
  // R8: تناقض سه‌تایی
  {
    const r8 = run(f[7])
    check('R8: نقض سه‌تایی + تعارض بازهٔ BC تشخیص داده شد',
      r8.out.tripleIssues.length > 0 && r8.out.intervalIssues.some((i) => i.kind === 'DEFINITE'))
  }
  // R10: multi-overlap ناقص → provisional
  {
    const r10 = run(f[9])
    const mo = Object.values(r10.out.multiOverlaps)[0]
    check('R10: multi-overlap با زوج بررسی‌نشده provisional است', mo && mo.provisional === true && mo.missingPairs.length > 0)
  }
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
