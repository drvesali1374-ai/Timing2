// ═══════════════════════════════════════════════════════════
// موتور مرکزی هم‌پوشانی عناصر کاری — جلسه دوم
// مبانی ریاضی (سند جلسه ۲ §۶ و §۷):
//   • بازه پیوسته نیمه‌باز I_i = [S_i, E_i) با D_i = E_i − S_i
//   • overlap دوتایی: O(A,B) = max(0, min(E_A,E_B) − max(S_A,S_B))
//   • قید: 0 ≤ O(A,B) ≤ min(D_A,D_B)
//   • overlap چندتایی: O(S) = min { O(i,j) | i,j ∈ S, i ≠ j }
//   • union: sweep-line روی endpointها (یا شمول‌عدم برای n≤3 با داده کامل)
//   • اعتبارسنجی: محلی (۱۰ خطای قطعی) + سه‌تایی + سراسری solver
// این ماژول کاملاً خالص (pure) است؛ پورت خط‌به‌خط آن در
// offline/js/formulas.js (T2F.overlapMatrix) باید هم‌ارز بماند.
// ═══════════════════════════════════════════════════════════
import { round12 } from './westinghouse'
import type { TimeInterval } from './overlap'

// ─────────────────── انواع مشترک ───────────────────

export type OverlapStatus = 'UNREVIEWED' | 'NO_OVERLAP' | 'OVERLAP'

/** مقدار یک زوج در یک چرخه — منبع واحد سرویس مرکزی */
export interface PairOverlapValue {
  status: OverlapStatus
  /** فقط برای OVERLAP مثبت است؛ NO_OVERLAP صفر؛ UNREVIEWED تهی */
  overlapDuration: number | null
}

/** داده لازم برای اعتبارسنجی یک زوج */
export interface PairOverlapInput extends PairOverlapValue {
  elementAId: string
  elementBId: string
}

/** خروجی اعتبارسنجی (§۷.۳) */
export type RealizabilityVerdict = 'VALID' | 'INVALID' | 'INDETERMINATE'

export interface ValidationIssue {
  /** پیام فارسی قابل نمایش به کاربر */
  message: string
  /** عناصر مسئول تعارض (در صورت امکان) */
  responsibleElementIds?: string[]
  /** زوج‌های مسئول تعارض */
  responsiblePairs?: Array<[string, string]>
  /** نوع خطا */
  kind: 'DEFINITE' | 'PROVISIONAL' | 'INDETERMINATE'
}

export interface RealizabilityResult {
  verdict: RealizabilityVerdict
  issues: ValidationIssue[]
  /** شناسه چرخه/محور بررسی‌شده — توسط سرویس پر می‌شود */
  cycleKey?: string
}

// ─────────────────── ۱) overlap دوتایی ───────────────────

/** O(A,B) = max(0, min(E_A,E_B) − max(S_A,S_B)) — برحسب ثانیه */
export function pairwiseOverlap(a: TimeInterval, b: TimeInterval): number {
  const intersection = Math.min(a.endOffset, b.endOffset) - Math.max(a.startOffset, b.startOffset)
  return round12(Math.max(0, intersection))
}

/** همان فرمول، مستقیم از مدت‌ها و اختلاف شروع‌ها (δ = S_B − S_A) */
export function pairwiseOverlapFromDelta(dA: number, dB: number, delta: number): number {
  const intersection =
    delta >= 0 ? Math.min(dA - delta, dB) : Math.min(dA, dB + delta)
  return round12(Math.max(0, intersection))
}

// ─────────────────── ۲) overlap چندتایی ───────────────────

/**
 * O(S) = کمینهٔ هم‌پوشانی دوتایی میان تمام زوج‌های متمایز مجموعه.
 * برای مجموعه تک‌عضوی، مدت خود عنصر برمی‌گردد.
 * ورودی: نقشه مقادیر زوج‌ها (کلید مرتب «idA|idB» با min/max) —
 * زوج گم‌شده یا UNREVIEWED نتیجه را provisional می‌کند.
 */
export interface MultiOverlapResult {
  /** مقدار محاسبه‌شده؛ null یعنی داده کافی نیست */
  value: number | null
  /** provisional: حداقل یک زوج لازم UNREVIEWED یا بدون رابطه است */
  provisional: boolean
  /** زوج‌های缺口 پرونده: UNREVIEWED یا فاقد رابطه */
  missingPairs: Array<[string, string]>
}

export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

export function multiOverlap(
  memberIds: string[],
  pairLookup: (a: string, b: string) => PairOverlapValue | undefined,
  durations: Record<string, number | null>,
): MultiOverlapResult {
  if (memberIds.length === 0) return { value: null, provisional: false, missingPairs: [] }
  if (memberIds.length === 1) {
    const d = durations[memberIds[0]] ?? null
    return { value: d, provisional: false, missingPairs: [] }
  }
  let min: number | null = null
  const missingPairs: Array<[string, string]> = []
  for (let i = 0; i < memberIds.length; i++) {
    for (let j = i + 1; j < memberIds.length; j++) {
      const a = memberIds[i]
      const b = memberIds[j]
      const pair = pairLookup(a, b)
      if (!pair || pair.status === 'UNREVIEWED') {
        missingPairs.push([a, b])
        continue
      }
      const v = pair.status === 'NO_OVERLAP' ? 0 : pair.overlapDuration ?? 0
      if (min === null || v < min) min = v
    }
  }
  // اگر حتی یک زوج تأییدشده نباشد، مقدار قطعی وجود ندارد
  if (min === null) return { value: null, provisional: missingPairs.length > 0, missingPairs }
  return { value: min, provisional: missingPairs.length > 0, missingPairs }
}

// ─────────────────── ۳) union بازه‌ها (§۶.۴) ───────────────────

/**
 * زمان سپری‌شده کل (اندازه اجتماع بازه‌ها) با sweep-line روی endpointها.
 * فقط با بازه‌های واقعی [S,E) معنا دارد؛ اگر بازه‌ای ناقص باشد null.
 */
export function unionOfIntervals(intervals: TimeInterval[]): number | null {
  if (intervals.length === 0) return null
  const events: Array<{ t: number; delta: number }> = []
  for (const iv of intervals) {
    if (iv.startOffset == null || iv.endOffset == null || iv.endOffset <= iv.startOffset) return null
    events.push({ t: iv.startOffset, delta: 1 })
    events.push({ t: iv.endOffset, delta: -1 })
  }
  events.sort((x, y) => x.t - y.t || y.delta - x.delta) // پایان قبل از شروع در نقطه مشترک (نیمه‌باز)
  let active = 0
  let total = 0
  let lastT = 0
  let started = false
  for (const ev of events) {
    if (active > 0 && started) total += ev.t - lastT
    active += ev.delta
    lastT = ev.t
    started = true
  }
  return round12(total)
}

/**
 * union برای دو یا سه عنصر بدون بازه واقعی، با اصل شمول-عدم شمول
 * (فقط وقتی همه زوج‌ها و مدت‌ها معلوم باشد؛ وگرنه NOT_COMPUTABLE → null).
 */
export function unionByInclusionExclusion(
  durations: Record<string, number | null>,
  pairValues: Record<string, PairOverlapValue | undefined>,
  memberIds: string[],
): number | null {
  const ds = memberIds.map((id) => durations[id] ?? null)
  if (ds.some((d) => d == null)) return null
  if (memberIds.length < 2 || memberIds.length > 3) return null
  let sum = 0
  for (const d of ds) sum += d as number
  const pair = (a: string, b: string) => pairValues[pairKey(a, b)]
  for (let i = 0; i < memberIds.length; i++) {
    for (let j = i + 1; j < memberIds.length; j++) {
      const p = pair(memberIds[i], memberIds[j])
      if (!p || p.status === 'UNREVIEWED') return null
      sum -= p.status === 'NO_OVERLAP' ? 0 : p.overlapDuration ?? 0
    }
  }
  if (memberIds.length === 3) {
    const [a, b, c] = memberIds
    const triple = multiOverlap([a, b, c], (x, y) => pairValues[pairKey(x, y)], durations)
    if (triple.value == null || triple.provisional) return null
    sum += triple.value
  }
  return round12(sum)
}

// ─────────────────── ۴) اعتبارسنجی محلی (§۷.۱) ───────────────────

export interface LocalCheckFailure {
  code: string
  message: string
}

/**
 * کنترل‌های قطعی یک زوج:
 *  ۱. مقدار منفی  ۲. بیش از مدت هر عنصر  ۳. NaN/Infinity  ۴. رابطه با خود
 *  ۶. مثبت برای عنصر با مدت صفر  ۱۰. تناقض status/value
 * (۵ و ۷ و ۸ توسط سرویس مرکزی/DB تضمین می‌شوند؛ ۹ در تغییر مدت)
 */
export function validatePairLocally(
  pair: PairOverlapInput,
  durations: Record<string, number | null>,
): LocalCheckFailure[] {
  const failures: LocalCheckFailure[] = []
  if (pair.elementAId === pair.elementBId) {
    failures.push({ code: 'SELF_RELATION', message: 'عنصر نمی‌تواند با خودش رابطهٔ موازی داشته باشد.' })
    return failures
  }
  const { status, overlapDuration } = pair
  if (status === 'UNREVIEWED') {
    if (overlapDuration != null) {
      failures.push({ code: 'UNREVIEWED_WITH_VALUE', message: 'رابطهٔ بررسی‌نشده نباید مقدار هم‌پوشانی داشته باشد.' })
    }
    return failures
  }
  if (status === 'NO_OVERLAP') {
    if (overlapDuration != null && overlapDuration !== 0) {
      failures.push({ code: 'NO_OVERLAP_WITH_POSITIVE', message: 'وضعیت «بدون هم‌پوشانی» با مقدار مثبت جمع نمی‌شود؛ مقدار باید صفر باشد.' })
    }
    return failures
  }
  // OVERLAP
  if (overlapDuration == null) {
    failures.push({ code: 'OVERLAP_WITHOUT_VALUE', message: 'وضعیت «دارای هم‌پوشانی» نیاز به مقدار مثبت دارد.' })
    return failures
  }
  if (!Number.isFinite(overlapDuration)) {
    failures.push({ code: 'NOT_A_NUMBER', message: 'مقدار هم‌پوشانی عدد معتبری نیست.' })
    return failures
  }
  if (overlapDuration <= 0) {
    failures.push({ code: 'NON_POSITIVE_OVERLAP', message: 'مقدار هم‌پوشانی باید مثبت باشد؛ صفر یا منفی در وضعیت «دارای هم‌پوشانی» نامعتبر است.' })
    return failures
  }
  const dA = durations[pair.elementAId] ?? null
  const dB = durations[pair.elementBId] ?? null
  if (dA != null && dB != null) {
    if (dA === 0 || dB === 0) {
      failures.push({ code: 'POSITIVE_FOR_ZERO_DURATION', message: 'عنصر با مدت صفر نمی‌تواند هم‌پوشانی مثبت داشته باشد.' })
    } else if (overlapDuration > Math.min(dA, dB) + 1e-9) {
      failures.push({ code: 'EXCEEDS_DURATION', message: `مقدار هم‌پوشانی (${overlapDuration}) از مدت کوتاه‌تر عنصر (${round12(Math.min(dA, dB))}) بیشتر است.` })
    }
  }
  return failures
}

// ─────────────────── ۵) کنترل سه‌تایی (§۷.۲) ───────────────────

/**
 * O_BC ≥ max(0, O_AB + O_AC − D_A) — برای هر سه‌تایی متمایز.
 * شرط لازم است اما برای اثبات سازگاری کل ماتریس کافی نیست.
 * nameOf: تبدیل شناسه به نام نمایشی فارسی (پیش‌فرض: خود شناسه)
 */
export function tripleConstraintViolations(
  memberIds: string[],
  durations: Record<string, number | null>,
  pairLookup: (a: string, b: string) => PairOverlapValue | undefined,
  nameOf: (id: string) => string = (id) => id,
): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const confirmed = (a: string, b: string): number | null => {
    const p = pairLookup(a, b)
    if (!p || p.status === 'UNREVIEWED') return null
    return p.status === 'NO_OVERLAP' ? 0 : p.overlapDuration ?? 0
  }
  const seen = new Set<string>()
  for (let i = 0; i < memberIds.length; i++) {
    // عنصر مرجع a
    const a = memberIds[i]
    const dA = durations[a] ?? null
    if (dA == null) continue
    for (let j = 0; j < memberIds.length; j++) {
      for (let k = j + 1; k < memberIds.length; k++) {
        if (i === j || i === k) continue
        const b = memberIds[j]
        const c = memberIds[k]
        const oAB = confirmed(a, b)
        const oAC = confirmed(a, c)
        const oBC = confirmed(b, c)
        if (oAB == null || oAC == null || oBC == null) continue
        const lowerBound = Math.max(0, oAB + oAC - dA)
        if (oBC + 1e-9 < lowerBound) {
          const key = [a, b, c].sort().join('|')
          if (seen.has(key)) continue
          seen.add(key)
          issues.push({
            message: `هم‌پوشانی زوج «${nameOf(b)}» و «${nameOf(c)}» (${oBC}) کمتر از حداقل لازم (${round12(lowerBound)}) بر اساس مدت «${nameOf(a)}» و دو زوج دیگر است.`,
            responsibleElementIds: [a, b, c],
            responsiblePairs: [[a, b], [a, c], [b, c]],
            kind: 'DEFINITE',
          })
        }
      }
    }
  }
  return issues
}

// ─────────────────── ۶) حداقل لازم برای زوج بررسی‌نشده (§۸.۲) ───────────────────

/**
 * برای زوج بررسی‌نشده (B,C) در حضور داده تأییدشده، کمینهٔ لازم را از
 * نامساوی سه‌تایی استخراج می‌کند: O_BC ≥ max(0, O_AB + O_AC − D_A).
 */
export function minimumRequiredOverlap(
  b: string,
  c: string,
  memberIds: string[],
  durations: Record<string, number | null>,
  pairLookup: (a: string, b: string) => PairOverlapValue | undefined,
): number {
  const confirmed = (x: string, y: string): number | null => {
    const p = pairLookup(x, y)
    if (!p || p.status === 'UNREVIEWED') return null
    return p.status === 'NO_OVERLAP' ? 0 : p.overlapDuration ?? 0
  }
  let min = 0
  for (const a of memberIds) {
    if (a === b || a === c) continue
    const dA = durations[a] ?? null
    const oAB = confirmed(a, b)
    const oAC = confirmed(a, c)
    if (dA == null || oAB == null || oAC == null) continue
    min = Math.max(min, oAB + oAC - dA)
  }
  return round12(Math.max(0, min))
}

// ─────────────────── ۷) solver سراسری بازپذیری (§۷.۳) ───────────────────

/**
 * IntervalRealizabilityValidator — آیا می‌توان روی یک محور زمانی مشترک،
 * بازه‌های پیوسته با مدت‌های معلوم چید که همهٔ overlapهای دوتایی تأییدشده
 * را «دقیقاً» برآورده کنند؟
 *
 * الگوریتم:
 *   ۱. تجزیه به مؤلفه‌های همبند (فقط روابط تأییدشده اتصال می‌دهند)
 *   ۲. هر زوج → قیود اختلافی روی S_i:
 *        • 0 < O < min(D): دو جهت — S_j − S_i = D_i − O یا S_i − S_j = D_j − O
 *        • O = min(D) (شامل کوتاه‌تر): بازهٔ قید S_short − S_long ∈ [0, D_long − D_short]
 *        • O = 0: جدایی — S_j − S_i ≥ D_i یا S_i − S_j ≥ D_j
 *   ۳. جست‌وجوی شاخه‌وکران روی انتخاب‌ها + Bellman-Ford (تشخیص دور منفی)
 *      برای امکان‌سنجی هر شاخه + propagation/pruning + memoization
 *   ۴. مرز پیچیدگی — عبور از حد امن → INDETERMINATE (هرگز نامطمئن را VALID نمی‌کنیم)
 */

interface SolverPair {
  a: string
  b: string
  o: number
}

interface DiffConstraint {
  // S_v − S_u ≤ c
  u: string
  v: string
  c: number
}

/** سیستم قیود اختلافی — امکان‌سنجی با Bellman-Ford (دور منفی) */
function differenceConstraintsFeasible(vars: string[], constraints: DiffConstraint[]): boolean {
  // گراف یال u → v با وزده c برای S_v − S_u ≤ c؛ دور منفی = ناپذیرفتنی
  const edges: Array<[string, string, number]> = []
  for (const con of constraints) edges.push([con.u, con.v, con.c])
  const dist = new Map<string, number>()
  for (const v of vars) dist.set(v, 0)
  const n = vars.length
  for (let iter = 0; iter < n; iter++) {
    let changed = false
    for (const [u, v, c] of edges) {
      const du = dist.get(u)!
      const dv = dist.get(v)!
      if (du + c < dv - 1e-9) {
        dist.set(v, du + c)
        changed = true
      }
    }
    if (!changed) return true
    if (iter === n - 1) return false // دور منفی
  }
  return true
}

interface SolverOptions {
  /** سقف گره‌های جست‌وجو — عبور → INDETERMINATE */
  searchBudget?: number
  /** تبدیل شناسه به نام نمایشی (پیام‌های فارسی) */
  nameOf?: (id: string) => string
}

export interface IntervalRealizabilityOutput extends RealizabilityResult {
  /** witness ریاضی (S_i نسبی) — مقدار واقعی مشاهده نیست */
  witness?: Record<string, number>
}

export function validateIntervalRealizability(
  memberIds: string[],
  durations: Record<string, number | null>,
  pairLookup: (a: string, b: string) => PairOverlapValue | undefined,
  options: SolverOptions = {},
): IntervalRealizabilityOutput {
  const searchBudget = options.searchBudget ?? 200_000
  const nameOf = options.nameOf ?? ((id: string) => id)
  const issues: ValidationIssue[] = []

  // عناصر بدون مدت معلوم → قیدهای وابسته قابل بررسی نیست
  const missingDuration = memberIds.filter((id) => durations[id] == null)
  const known = memberIds.filter((id) => durations[id] != null)

  // جمع‌آوری زوج‌های تأییدشده میان عناصر شناخته‌شده
  const pairs: SolverPair[] = []
  for (let i = 0; i < known.length; i++) {
    for (let j = i + 1; j < known.length; j++) {
      const p = pairLookup(known[i], known[j])
      if (!p || p.status === 'UNREVIEWED') continue
      const o = p.status === 'NO_OVERLAP' ? 0 : p.overlapDuration ?? 0
      pairs.push({ a: known[i], b: known[j], o })
    }
  }

  if (missingDuration.length > 0 && pairs.length > 0) {
    issues.push({
      message: `مدت عنصرهای ${missingDuration.map((id) => `«${nameOf(id)}»`).join(' و ')} در این چرخه ثبت نشده؛ اعتبارسنجی سراسری فقط برای عنصرهای دارای داده انجام شد.`,
      responsibleElementIds: missingDuration,
      kind: 'INDETERMINATE',
    })
  }

  // تجزیه به مؤلفه‌های همبند روی زوج‌های تأییدشده
  const adj = new Map<string, Set<string>>()
  for (const id of known) adj.set(id, new Set())
  for (const p of pairs) {
    adj.get(p.a)!.add(p.b)
    adj.get(p.b)!.add(p.a)
  }
  const visited = new Set<string>()
  const components: string[][] = []
  for (const id of known) {
    if (visited.has(id)) continue
    const stack = [id]
    const comp: string[] = []
    visited.add(id)
    while (stack.length) {
      const cur = stack.pop()!
      comp.push(cur)
      for (const nb of adj.get(cur) ?? []) {
        if (!visited.has(nb)) {
          visited.add(nb)
          stack.push(nb)
        }
      }
    }
    components.push(comp)
  }

  let searched = 0
  let overflow = false

  for (const comp of components) {
    const compSet = new Set(comp)
    const compPairs = pairs.filter((p) => compSet.has(p.a) && compSet.has(p.b))
    if (compPairs.length === 0) continue
    const res = solveComponent(comp, compPairs, durations, () => {
      searched++
      return searched <= searchBudget
    })
    if (res === 'BUDGET') {
      overflow = true
      issues.push({
        message: 'پیچیدگی دادهٔ هم‌پوشانی از حد امن محاسباتی فراتر رفت؛ نتیجهٔ سراسری نامعین است (INDETERMINATE).',
        responsibleElementIds: comp,
        kind: 'INDETERMINATE',
      })
      continue
    }
    if (res === 'INFEASIBLE') {
      issues.push({
        message: 'نمی‌توان بازه‌های پیوسته‌ای روی محور زمانی مشترک یافت که همهٔ هم‌پوشانی‌های تأییدشدهٔ این مجموعه را دقیقاً برآورده کند.',
        responsibleElementIds: comp,
        responsiblePairs: compPairs.map((p) => [p.a, p.b] as [string, string]),
        kind: 'DEFINITE',
      })
    }
  }

  const hasDefinite = issues.some((i) => i.kind === 'DEFINITE')
  if (hasDefinite) return { verdict: 'INVALID', issues }
  if (overflow || issues.some((i) => i.kind === 'INDETERMINATE')) {
    return { verdict: 'INDETERMINATE', issues }
  }
  return { verdict: 'VALID', issues }
}

/** حل یک مؤلفه: انتخاب حالت‌های نسبی + قیود اختلافی + شاخه‌وکران */
function solveComponent(
  comp: string[],
  compPairs: SolverPair[],
  durations: Record<string, number | null>,
  budget: () => boolean,
): 'FEASIBLE' | 'INFEASIBLE' | 'BUDGET' {
  // هر زوج → فهرست گزینه‌های قید (disjunction)
  interface Choice {
    pair: SolverPair
    options: DiffConstraint[][]
  }
  const choices: Choice[] = []
  for (const p of compPairs) {
    const dA = durations[p.a] ?? 0
    const dB = durations[p.b] ?? 0
    const minD = Math.min(dA, dB)
    if (p.o > minD + 1e-9) return 'INFEASIBLE' // بیش از مدت کوتاه‌تر — قطعاً ناممکن
    if (p.o <= 1e-9) {
      // جدایی: a قبل از b یا برعکس
      choices.push({
        pair: p,
        options: [
          [{ u: p.b, v: p.a, c: -dA }], // S_a − S_b ≤ −D_a  (a قبل: S_b ≥ S_a + D_a)
          [{ u: p.a, v: p.b, c: -dB }], // b قبل
        ],
      })
    } else if (Math.abs(p.o - minD) <= 1e-9) {
      // شمول کامل کوتاه‌تر در بلندتر: S_short − S_long ∈ [0, D_long − D_short]
      const [short, long] = dA <= dB ? [p.a, p.b] : [p.b, p.a]
      const diff = Math.abs(dA - dB)
      choices.push({
        pair: p,
        options: [[
          { u: long, v: short, c: diff }, // S_short − S_long ≤ D_long − D_short
          { u: short, v: long, c: 0 }, // S_long − S_short ≤ 0 (کوتاه‌تر دیرتر شروع می‌کند)
        ]],
      })
    } else {
      // هم‌پوشانی جزئی — دو جهت دقیق
      choices.push({
        pair: p,
        options: [
          [{ u: p.a, v: p.b, c: dA - p.o }, { u: p.b, v: p.a, c: -(dA - p.o) }], // a پیشتاز: S_b − S_a = D_a − O
          [{ u: p.b, v: p.a, c: dB - p.o }, { u: p.a, v: p.b, c: -(dB - p.o) }], // b پیشتاز
        ],
      })
    }
  }

  // مرتب‌سازی انتخاب‌ها: اول زوج‌های جدایی (محدودکننده‌تر برای pruning)
  choices.sort((x, y) => x.options.length - y.options.length)

  let budgetOver = false

  const search = (idx: number, acc: DiffConstraint[]): boolean => {
    if (idx === choices.length) {
      return differenceConstraintsFeasible(comp, acc)
    }
    for (const opt of choices[idx].options) {
      if (!budget()) {
        budgetOver = true
        return false
      }
      const next = [...acc, ...opt]
      // pruning زودهنگام: امکان‌سنجی جزئی
      if (!differenceConstraintsFeasible(comp, next)) continue
      if (search(idx + 1, next)) return true
    }
    return false
  }

  const feasible = search(0, [])
  if (budgetOver) return 'BUDGET'
  return feasible ? 'FEASIBLE' : 'INFEASIBLE'
}

// ─────────────────── ۸) تحلیل provisional (§۷.۴-ب) ───────────────────

export interface ProvisionalAnalysis {
  /** هشدارها — داده قطعی INVALID اعلام نمی‌شود */
  warnings: ValidationIssue[]
  /** multi-overlap فرضی با صفر برای UNREVIEWED (provisional) */
  provisionalMultiOverlap: Record<string, MultiOverlapResult>
}

/**
 * فرض موقت «عدم هم‌پوشانی» برای روابط UNREVIEWED:
 * اگر فرض صفر با دادهٔ تأییدشده تناقض دارد → هشدار (نه INVALID قطعی).
 */
export function analyzeProvisional(
  memberIds: string[],
  durations: Record<string, number | null>,
  pairLookup: (a: string, b: string) => PairOverlapValue | undefined,
  nameOf: (id: string) => string = (id) => id,
): ProvisionalAnalysis {
  const warnings: ValidationIssue[] = []
  // ۱) حداقل لازم برای هر زوج بررسی‌نشده
  for (let i = 0; i < memberIds.length; i++) {
    for (let j = i + 1; j < memberIds.length; j++) {
      const a = memberIds[i]
      const b = memberIds[j]
      const p = pairLookup(a, b)
      if (p && p.status !== 'UNREVIEWED') continue
      const min = minimumRequiredOverlap(a, b, memberIds, durations, pairLookup)
      if (min > 1e-9) {
        warnings.push({
          message: `رابطهٔ بررسی‌نشده «${nameOf(a)}» و «${nameOf(b)}» بر اساس سایر داده‌های تأییدشده حداقل ${min} ثانیه هم‌پوشانی لازم دارد؛ نتیجهٔ فعلی موقتی است.`,
          responsiblePairs: [[a, b]],
          kind: 'PROVISIONAL',
        })
      }
    }
  }
  // ۲) امکان‌سنجی با فرض صفر — تعارض فقط هشدار است
  const assumedLookup = (a: string, b: string): PairOverlapValue | undefined => {
    const p = pairLookup(a, b)
    if (!p) return undefined
    if (p.status === 'UNREVIEWED') return { status: 'NO_OVERLAP', overlapDuration: 0 }
    return p
  }
  const realizability = validateIntervalRealizability(memberIds, durations, assumedLookup, { nameOf })
  if (realizability.verdict === 'INVALID') {
    for (const iss of realizability.issues) {
      warnings.push({
        message: `با فرض موقت «بدون هم‌پوشانی» برای روابط بررسی‌نشده، داده‌ها قابل تحقق نیستند: ${iss.message} روابط نیازمند بررسی را مشخص و مقداردهی کنید.`,
        responsibleElementIds: iss.responsibleElementIds,
        responsiblePairs: iss.responsiblePairs,
        kind: 'PROVISIONAL',
      })
    }
  }
  // ۳) multi-overlap موقت هر مؤلفه
  const provisionalMultiOverlap: Record<string, MultiOverlapResult> = {}
  const assumed = new Map<string, PairOverlapValue>()
  for (let i = 0; i < memberIds.length; i++) {
    for (let j = i + 1; j < memberIds.length; j++) {
      const k = pairKey(memberIds[i], memberIds[j])
      const v = assumedLookup(memberIds[i], memberIds[j])
      if (v) assumed.set(k, v)
    }
  }
  const components = connectedComponents(memberIds, (a, b) => {
    const p = pairLookup(a, b)
    return !!p // رابطه تعریف‌شده (هر وضعیتی) اتصال می‌دهد
  })
  for (const comp of components) {
    if (comp.length < 3) continue
    const key = [...comp].sort().join('|')
    provisionalMultiOverlap[key] = multiOverlap(
      comp,
      (a, b) => assumed.get(pairKey(a, b)),
      durations,
    )
  }
  return { warnings, provisionalMultiOverlap }
}

/** تجزیه به مؤلفه‌های همبند با معیار اتصال دلخواه */
export function connectedComponents(
  memberIds: string[],
  connected: (a: string, b: string) => boolean,
): string[][] {
  const adj = new Map<string, string[]>()
  for (const id of memberIds) adj.set(id, [])
  for (let i = 0; i < memberIds.length; i++) {
    for (let j = i + 1; j < memberIds.length; j++) {
      if (connected(memberIds[i], memberIds[j])) {
        adj.get(memberIds[i])!.push(memberIds[j])
        adj.get(memberIds[j])!.push(memberIds[i])
      }
    }
  }
  const seen = new Set<string>()
  const out: string[][] = []
  for (const id of memberIds) {
    if (seen.has(id)) continue
    const stack = [id]
    seen.add(id)
    const comp: string[] = []
    while (stack.length) {
      const cur = stack.pop()!
      comp.push(cur)
      for (const nb of adj.get(cur) ?? []) {
        if (!seen.has(nb)) {
          seen.add(nb)
          stack.push(nb)
        }
      }
    }
    out.push(comp.sort())
  }
  return out
}

// ─────────────────── ۹) ارکستراتور اعتبارسنجی کامل ───────────────────

export interface FullValidationOutput {
  /** فقط دادهٔ تأییدشده */
  confirmed: RealizabilityResult
  /** کنترل‌های محلی قطعی */
  localFailures: Array<{ pair: [string, string]; failures: LocalCheckFailure[] }>
  /** نقض سه‌تایی */
  tripleIssues: ValidationIssue[]
  /** تحلیل provisional با فرض صفر */
  provisional: ProvisionalAnalysis
  /** multi-overlap قطعی هر مؤلفه (کلید: اعضای مرتب با |) */
  multiOverlaps: Record<string, MultiOverlapResult>
  /** union هر مؤلفه — فقط با بازه‌های واقعی یا n≤3 کامل */
  unions: Record<string, { value: number | null; source: 'INTERVALS' | 'INCLUSION_EXCLUSION' | 'NOT_COMPUTABLE' }>
}

/**
 * OverlapCalculationOrchestrator — کل خط اعتبارسنجی و محاسبهٔ وابسته
 * برای یک چرخه: محلی → سه‌تایی → سراسری → provisional → چندتایی → union.
 */
export function runFullValidation(
  memberIds: string[],
  durations: Record<string, number | null>,
  intervals: Record<string, TimeInterval | null>,
  pairLookup: (a: string, b: string) => PairOverlapValue | undefined,
  nameOf: (id: string) => string = (id) => id,
): FullValidationOutput {
  // ۱) محلی
  const localFailures: FullValidationOutput['localFailures'] = []
  for (let i = 0; i < memberIds.length; i++) {
    for (let j = i + 1; j < memberIds.length; j++) {
      const a = memberIds[i]
      const b = memberIds[j]
      const p = pairLookup(a, b)
      if (!p) continue
      const failures = validatePairLocally(
        { elementAId: a, elementBId: b, ...p },
        durations,
      )
      if (failures.length > 0) localFailures.push({ pair: [a, b], failures })
    }
  }
  // ۲) سه‌تایی
  const tripleIssues = tripleConstraintViolations(memberIds, durations, pairLookup, nameOf)
  // ۳) سراسری (فقط تأییدشده‌ها)
  const confirmed = validateIntervalRealizability(memberIds, durations, pairLookup, { nameOf })
  // ۴) provisional
  const provisional = analyzeProvisional(memberIds, durations, pairLookup, nameOf)
  // ۵) multi-overlap قطعی بر اساس مؤلفه‌های رابطه‌دار
  const multiOverlaps: Record<string, MultiOverlapResult> = {}
  const unions: FullValidationOutput['unions'] = {}
  const relComponents = connectedComponents(memberIds, (a, b) => !!pairLookup(a, b))
  for (const comp of relComponents) {
    if (comp.length < 2) continue
    const key = [...comp].sort().join('|')
    multiOverlaps[key] = multiOverlap(comp, pairLookup, durations)
    // union: بازه‌های واقعی در دسترس؟
    const realIntervals = comp
      .map((id) => intervals[id])
      .filter((iv): iv is TimeInterval => !!iv && iv.endOffset > iv.startOffset)
    if (realIntervals.length === comp.length) {
      unions[key] = { value: unionOfIntervals(realIntervals), source: 'INTERVALS' }
    } else {
      const byIncEx = unionByInclusionExclusion(
        durations,
        Object.fromEntries(
          comp.flatMap((a) =>
            comp
              .filter((b) => b !== a)
              .map((b) => [pairKey(a, b), pairLookup(a, b)] as const),
          ),
        ),
        comp,
      )
      if (byIncEx != null) unions[key] = { value: byIncEx, source: 'INCLUSION_EXCLUSION' }
      else unions[key] = { value: null, source: 'NOT_COMPUTABLE' }
    }
  }
  return { confirmed, localFailures, tripleIssues, provisional, multiOverlaps, unions }
}
