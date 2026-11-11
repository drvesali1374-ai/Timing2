// ═══════════════════════════════════════════════════════════
// سرویس تحلیل نتایج و کنترل کیفیت داده — فاز ۴
// FR-12 (پیشرفت نمونه)، FR-14 (OT/NT)، FR-15 (ST و دو فرمول)،
// FR-16 (استاندارد کل فعالیت هم‌پوشان)، FR-17 (آمار)،
// FR-18 (مرور مشکوک‌ها)، FR-19 (مقایسه اپراتورها)
//
// قواعد حیاتی:
//  • مبنای محاسبات = مشاهدات VALID + SUSPECT با مدت محاسبه‌شده
//    (هشدار آماری مساوی حذف نیست — FR-11)
//  • مشاهدات EXCLUDED/INVALID هرگز در OT وارد نمی‌شوند؛
//    داده خام آن‌ها حفظ و نمایش داده می‌شود.
//  • اگر داده ناکافی باشد «قابل محاسبه نیست» نمایش داده می‌شود،
//    نه صفر یا مقدار ساختگی — FR-21
//  • فعالیت دارای هم‌پوشانی: استاندارد کل = «نیازمند قاعده تجمیع»
//    (جمع ساده ممنوع — FR-16/۱۰.۳)
// ═══════════════════════════════════════════════════════════
import { db } from '@/lib/db'
import {
  AppError,
  ALLOWANCE_METHOD_LABELS,
  ALLOWANCE_METHOD_FORMULAS,
  AGGREGATION_METHOD_LABELS,
  PROJECT_SETTING_KEYS,
  DEFAULT_PROJECT_SETTINGS,
  FORMULA_VERSION,
  type AllowanceMethod,
  type AggregationMethod,
} from '@/domain/types'
import { descriptiveStats, type DescriptiveStats } from '@/calculation/statistics'
import { aggregateElement } from '@/calculation/aggregate'
import { computeElementStandardTime } from '@/calculation/effective-allowances'
import type { EffectiveAllowanceSummary, ResolvedAllowanceRow } from '@/calculation/effective-allowances'
import { round12 } from '@/calculation/westinghouse'
import { getProjectSettings } from './settings-service'
import { resolveForActivity } from './effective-allowance-service'
import { getOutlierConfig } from './outlier-service'
import type { ElementObservation, CycleObservation, StudySession, Operator, WorkElement, RatingAssessment } from '@prisma/client'

type ObservationRow = ElementObservation & {
  cycle: CycleObservation & { session: StudySession & { operator: Operator } }
}

// ═══════════════ DTO ═══════════════

export interface OperatorComparisonRow {
  operatorId: string
  operatorName: string
  count: number
  mean: number | null
  median: number | null
  sampleSD: number | null
  cvPercent: number | null
  ci95: { lower: number; upper: number } | null
  suspectCount: number
  excludedCount: number
  nt: number | null
  st: number | null
}

export interface TrendPoint {
  cycleNo: number
  operatorId: string
  value: number
  status: 'VALID' | 'SUSPECT' | 'EXCLUDED'
}

export interface HistogramBin {
  binStart: number
  binEnd: number
  count: number
}

export interface ElementAnalysisDto {
  id: string
  name: string
  elementType: string
  counts: { total: number; calcBasis: number; valid: number; suspect: number; excluded: number; invalid: number }
  stats: DescriptiveStats
  /** OT تجمیعی طبق روش انتخابی پروژه — FR-14/۱۰.۱ */
  ot: number | null
  otAggregationMethod: AggregationMethod
  otAggregationMethodLabel: string
  /** ضریب وستینگهاوس عنصر (مشترک بین اپراتورها — ۱۰.۲) */
  rating: {
    totalFactor: number
    tableName: string
    tableVersion: number
  } | null
  nt: number | null
  st: number | null
  /** خطای محاسبه ST (مثلاً A ≥ ۱۰۰٪ در روش ۲) — FR-15 */
  stError: string | null
  /** الونس‌های مؤثر این عنصر — جلسه اول (§۳) */
  allowances: {
    totalPercent: number
    perExecutionSeconds: number
    perCycleSeconds: number
    needsAggregationCount: number
  }
  /** توضیح فرمول ST اعمال‌شده — خروجی قابل توضیح (§۳.۳) */
  stExplanation: string | null
  operators: OperatorComparisonRow[]
  trend: TrendPoint[]
  histogram: HistogramBin[]
}

export interface SuspectItemDto {
  observationId: string
  elementId: string
  elementName: string
  cycleNo: number
  sessionId: string
  operatorId: string
  operatorName: string
  value: number | null
  score: number | null
  rule: string | null
  validityStatus: 'SUSPECT' | 'EXCLUDED'
  exclusionReason: string | null
}

/** الونس‌های مؤثر فعالیت — مدل سلسله‌مراتبی جدید (§۳) */
export interface ActivityAllowancesDto {
  method: AllowanceMethod
  methodLabel: string
  formula: string
  /** ردیف‌های resolve در سطح فعالیت */
  rows: ResolvedAllowanceRow[]
  /** خلاصه سطح فعالیت */
  summary: EffectiveAllowanceSummary
  /** جمع ثانیه‌های per-cycle در سطح چرخه — دقیقاً یک‌بار (dedupe) */
  perCycleTotal: number
  /** ردیف‌های زمان ثابت نیازمند قاعده تجمیع */
  needsAggregation: { title: string; sourceScopeLabel: string | null; timeValueSeconds: number }[]
}

export interface ActivityAnalysisDto {
  activity: {
    id: string
    name: string
    stationName: string
    processType: string
    targetSampleCount: number | null
    groupId: string | null
    groupName: string | null
    projectId: string
  }
  settings: {
    allowanceMethod: AllowanceMethod
    allowanceMethodLabel: string
    formula: string
    aggregationMethod: AggregationMethod
    aggregationMethodLabel: string
    formulaVersion: string
    outlierMethod: string
    outlierThreshold: number
  }
  allowances: ActivityAllowancesDto
  sampleProgress: {
    targetSampleCount: number | null
    validCycles: number
    totalCycles: number
    sessionsCount: number
    reached: boolean | null
    message: string
  }
  elements: ElementAnalysisDto[]
  /** آمار زمان سپری‌شده چرخه‌های قابل استفاده — FR-10/17 */
  cycleStats: {
    count: number
    stats: DescriptiveStats
    methodNote: string
  }
  /** شاخص‌های مجزای زمان دستی/ماشین/انتظار — FR-10 */
  elementTypeTotals: {
    manual: number | null
    machine: number | null
    waiting: number | null
    /** جمع مدت عناصر هم‌پوشان — فقط شاخص؛ زمان سپری‌شده نیست */
    overlapSum: number | null
  }
  activityTotal: {
    st: number | null
    status: 'OK' | 'NEEDS_AGGREGATION_RULE' | 'INCOMPLETE'
    reason: string
  }
  suspects: SuspectItemDto[]
  generatedAt: string
}

// ═══════════════ کمکی‌ها ═══════════════

function isInCalc(o: ElementObservation): boolean {
  return (o.validityStatus === 'VALID' || o.validityStatus === 'SUSPECT') && o.derivedDuration !== null
}

/** سبد هیستوگرام — قاعده Sturges با محدودهٔ معقول ۴ تا ۱۲ سبد */
function buildHistogram(values: number[]): HistogramBin[] {
  if (values.length < 2) return []
  const min = Math.min(...values)
  const max = Math.max(...values)
  if (max === min) return [{ binStart: min, binEnd: max, count: values.length }]
  const bins = Math.min(12, Math.max(4, Math.ceil(1 + Math.log2(values.length))))
  const width = (max - min) / bins
  const counts = new Array<number>(bins).fill(0)
  for (const v of values) {
    let idx = Math.floor((v - min) / width)
    if (idx >= bins) idx = bins - 1
    if (idx < 0) idx = 0
    counts[idx]++
  }
  const out: HistogramBin[] = []
  for (let i = 0; i < bins; i++) {
    out.push({
      binStart: round12(min + i * width),
      binEnd: round12(min + (i + 1) * width),
      count: counts[i],
    })
  }
  return out
}

/** زمان سپری‌شده یک چرخه: اگر بازه ثبت شده ← گستره؛ وگرنه جمع مدت‌های ترتیبی درون محاسبات */
function cycleElapsed(observations: ElementObservation[]): number | null {
  const fullIntervals = observations.filter((o) => o.startOffset !== null && o.endOffset !== null)
  if (fullIntervals.length > 0) {
    const earliest = Math.min(...fullIntervals.map((o) => o.startOffset as number))
    const latest = Math.max(...fullIntervals.map((o) => o.endOffset as number))
    return round12(latest - earliest)
  }
  const seq = observations.filter(isInCalc)
  if (seq.length === 0) return null
  return round12(seq.reduce((s, o) => s + (o.derivedDuration as number), 0))
}

// ═══════════════ تحلیل فعالیت ═══════════════

export async function getActivityAnalysis(activityId: string): Promise<ActivityAnalysisDto> {
  const activity = await db.activity.findUnique({
    where: { id: activityId },
    include: {
      station: { select: { name: true, project: { select: { id: true } } } },
      group: { select: { id: true, name: true } },
      workElements: {
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        include: { rating: { include: { ratingTable: { select: { name: true, version: true } } } } },
      },
    },
  })
  if (!activity) throw new AppError('ACTIVITY_NOT_FOUND', 'فعالیت یافت نشد.', 404)
  const projectId = activity.station.project.id

  const [settingsRaw, allowanceResolution, outlierConfig, sessions] = await Promise.all([
    getProjectSettings(projectId),
    resolveForActivity(activityId),
    getOutlierConfig(),
    db.studySession.findMany({
      where: { activityId },
      include: { operator: true },
      orderBy: { startedAt: 'asc' },
    }),
  ])

  const allowanceMethod = (settingsRaw[PROJECT_SETTING_KEYS.allowanceMethod] ??
    DEFAULT_PROJECT_SETTINGS[PROJECT_SETTING_KEYS.allowanceMethod]) as AllowanceMethod
  const aggregationMethod = (settingsRaw[PROJECT_SETTING_KEYS.aggregationMethod] ??
    DEFAULT_PROJECT_SETTINGS[PROJECT_SETTING_KEYS.aggregationMethod]) as AggregationMethod

  // همهٔ مشاهدات فعالیت با چرخه و جلسه (برای روند و مرور مشکوک‌ها)
  const cycles = await db.cycleObservation.findMany({
    where: { session: { activityId } },
    include: {
      observations: true,
      session: { include: { operator: true } },
    },
    orderBy: [{ session: { startedAt: 'asc' } }, { cycleNo: 'asc' }],
  })

  // هر چرخه: نقشهٔ عنصر → مشاهده
  const observationsByElement = new Map<string, ObservationRow[]>()
  for (const c of cycles) {
    for (const o of c.observations) {
      const row: ObservationRow = Object.assign(o, { cycle: c })
      const list = observationsByElement.get(o.workElementId)
      if (list) list.push(row)
      else observationsByElement.set(o.workElementId, [row])
    }
  }

  // ── شمارش چرخه‌ها — FR-12 ──
  const elementIds = activity.workElements.map((e) => e.id)
  let validCycles = 0
  for (const c of cycles) {
    const hasBad = c.observations.some((o) => o.validityStatus === 'EXCLUDED' || o.validityStatus === 'INVALID')
    const complete =
      elementIds.length > 0 && elementIds.every((eid) => c.observations.some((o) => o.workElementId === eid && o.derivedDuration !== null))
    if (complete && !hasBad) validCycles++
  }
  const target = activity.targetSampleCount
  const sampleProgress = {
    targetSampleCount: target,
    validCycles,
    totalCycles: cycles.length,
    sessionsCount: sessions.length,
    reached: target === null ? null : validCycles >= target,
    message:
      target === null
        ? 'تعداد نمونه هدف برای این فعالیت ثبت نشده است؛ در مشخصات فعالیت می‌توانید هدف را تعیین کنید.'
        : validCycles >= target
          ? `هدف تعداد نمونه تکمیل شد (${validCycles} از ${target} چرخهٔ معتبر). توجه: رسیدن به هدف تعداد، تضمین کفایت آماری نیست — شاخص‌های پراکندی را بازبینی کنید.`
          : `تا هدف تعداد نمونه ${Math.max(0, target - validCycles)} چرخهٔ معتبر باقی مانده است (${validCycles} از ${target}).`,
  }

  // ── تحلیل هر عنصر ──
  const operatorById = new Map(sessions.map((s) => [s.operatorId, s.operator]))
  const elementDtos: ElementAnalysisDto[] = []

  for (const el of activity.workElements) {
    const rows = observationsByElement.get(el.id) ?? []
    const calcRows = rows.filter(isInCalc)
    const values = calcRows.map((o) => o.derivedDuration as number)
    const stats = descriptiveStats(values)

    // تجمیع OT طبق روش پروژه — FR-14/۱۰.۱
    const perOperatorSamples = new Map<string, number[]>()
    for (const o of calcRows) {
      const list = perOperatorSamples.get(o.cycle.session.operatorId)
      if (list) list.push(o.derivedDuration as number)
      else perOperatorSamples.set(o.cycle.session.operatorId, [o.derivedDuration as number])
    }
    const agg = aggregateElement(
      [...perOperatorSamples.entries()].map(([operatorId, vals]) => ({ operatorId, values: vals })),
      aggregationMethod
    )

    // ضریب وستینگهاوس مشترک عنصر — ۱۰.۲
    const rating = el.rating
    const ratingDto = rating
      ? {
          totalFactor: rating.totalFactor,
          tableName: rating.ratingTable.name,
          tableVersion: rating.ratingTable.version,
        }
      : null

    const ot = agg.value
    const nt = ot !== null && ratingDto !== null ? round12(ot * ratingDto.totalFactor) : null

    // الونس‌های مؤثر این عنصر — resolve سلسله‌مراتبی (§۳)
    const elResolution = allowanceResolution.elements.get(el.id)
    const elFactors = {
      totalPercent: elResolution?.summary.totalPercent ?? 0,
      perExecutionSeconds: elResolution?.summary.perExecutionSeconds ?? 0,
      perCycleSeconds: elResolution?.summary.perCycleSeconds ?? 0,
    }

    let st: number | null = null
    let stError: string | null = null
    let stExplanation: string | null = null
    if (nt !== null) {
      try {
        const res = computeElementStandardTime(nt, elFactors, allowanceMethod)
        st = res.st
        stExplanation = res.explanation
      } catch (err) {
        stError = err instanceof AppError ? err.message : 'محاسبه زمان استاندارد برای این عنصر ممکن نیست.'
      }
    }

    // مقایسهٔ اپراتورها — FR-19 (R مشترک؛ تفاوت از میانگین مشاهده‌شده)
    const operators: OperatorComparisonRow[] = []
    for (const [operatorId, vals] of perOperatorSamples) {
      const opStats = descriptiveStats(vals)
      const opMean = opStats.mean
      const opNt = opMean !== null && ratingDto !== null ? round12(opMean * ratingDto.totalFactor) : null
      let opSt: number | null = null
      if (opNt !== null) {
        try {
          opSt = computeElementStandardTime(opNt, elFactors, allowanceMethod).st
        } catch {
          opSt = null
        }
      }
      const opRows = rows.filter((r) => r.cycle.session.operatorId === operatorId)
      operators.push({
        operatorId,
        operatorName: operatorById.get(operatorId)?.displayName ?? 'اپراتور حذف‌شده',
        count: vals.length,
        mean: opMean,
        median: opStats.median,
        sampleSD: opStats.sampleSD,
        cvPercent: opStats.cvPercent,
        ci95: opStats.ci95,
        suspectCount: opRows.filter((r) => r.validityStatus === 'SUSPECT').length,
        excludedCount: opRows.filter((r) => r.validityStatus === 'EXCLUDED').length,
        nt: opNt,
        st: opSt,
      })
    }
    // ترتیب پایدار اپراتورها بر اساس نام
    operators.sort((a, b) => a.operatorName.localeCompare(b.operatorName, 'fa'))

    // روند مشاهدات به ترتیب ثبت (چرخه) — VALID/SUSPECT/EXCLUDED
    const trend: TrendPoint[] = rows
      .filter((o) => o.derivedDuration !== null && o.validityStatus !== 'INVALID')
      .map((o) => ({
        cycleNo: o.cycle.cycleNo,
        operatorId: o.cycle.session.operatorId,
        value: o.derivedDuration as number,
        status: o.validityStatus as TrendPoint['status'],
      }))

    elementDtos.push({
      id: el.id,
      name: el.name,
      elementType: el.elementType,
      counts: {
        total: rows.length,
        calcBasis: calcRows.length,
        valid: rows.filter((r) => r.validityStatus === 'VALID').length,
        suspect: rows.filter((r) => r.validityStatus === 'SUSPECT').length,
        excluded: rows.filter((r) => r.validityStatus === 'EXCLUDED').length,
        invalid: rows.filter((r) => r.validityStatus === 'INVALID').length,
      },
      stats,
      ot,
      otAggregationMethod: aggregationMethod,
      otAggregationMethodLabel: AGGREGATION_METHOD_LABELS[aggregationMethod],
      rating: ratingDto,
      nt,
      st,
      stError,
      allowances: {
        totalPercent: elFactors.totalPercent,
        perExecutionSeconds: elFactors.perExecutionSeconds,
        perCycleSeconds: elFactors.perCycleSeconds,
        needsAggregationCount: elResolution?.summary.needsAggregationCount ?? 0,
      },
      stExplanation,
      operators,
      trend,
      histogram: buildHistogram(values),
    })
  }

  // ── آمار زمان سپری‌شدهٔ چرخه‌ها — FR-10/17 ──
  const elapsedValues: number[] = []
  let hasIntervalCycle = false
  for (const c of cycles) {
    const bad = c.observations.some((o) => o.validityStatus === 'EXCLUDED' || o.validityStatus === 'INVALID')
    if (bad || !c.isComplete) continue
    if (c.observations.some((o) => o.startOffset !== null && o.endOffset !== null)) hasIntervalCycle = true
    const e = cycleElapsed(c.observations)
    if (e !== null) elapsedValues.push(e)
  }
  const cycleStats = {
    count: elapsedValues.length,
    stats: descriptiveStats(elapsedValues),
    methodNote: hasIntervalCycle
      ? 'چرخه‌های دارای بازهٔ هم‌زمان: زمان سپری‌شده = دیرترین پایان − زودترین شروع (گستره)؛ هرگز جمع مدت‌های هم‌پوشان گزارش نمی‌شود.'
      : 'چرخه‌های ترتیبی: زمان سپری‌شده = جمع مدت عناصر درون محاسبات.',
  }

  // ── شاخص‌های مجزای نوع عنصر — FR-10 ──
  const sumOt = (type: string): number | null => {
    const list = elementDtos.filter((e) => e.elementType === type && e.ot !== null)
    if (list.length === 0) return null
    return round12(list.reduce((s, e) => s + (e.ot as number), 0))
  }
  const elementTypeTotals = {
    manual: sumOt('MANUAL'),
    machine: sumOt('MACHINE'),
    waiting: sumOt('WAITING'),
    overlapSum: sumOt('OVERLAP'),
  }

  // ── استاندارد کل فعالیت — FR-16/۱۰.۳ + الونس per-cycle (§۳.۲) ──
  // الونس‌های زمانی «هر چرخه» دقیقاً یک‌بار در سطح چرخه اعمال می‌شوند:
  // ردیف‌های per-cycle سطح فعالیت/ایستگاه/پروژه یک‌بار + ردیف‌های محلی عناصر
  // (بدون ضرب شدن در ST تک‌تک عناصر — تست §۱۰.۲)
  const actPerCycleRows = allowanceResolution.activity.rows.filter(
    (r) => r.status !== 'EXCLUDED' && !r.needsAggregationRule && r.valueType === 'FIXED_TIME' && r.applicationBasis === 'PER_CYCLE' && r.timeValueSeconds !== null
  )
  let perCycleTotal = round12(actPerCycleRows.reduce((s, r) => s + (r.timeValueSeconds as number), 0))
  const seenPerCycleDefs = new Set(actPerCycleRows.map((r) => r.definitionId))
  for (const elDto of elementDtos) {
    const elRes = allowanceResolution.elements.get(elDto.id)
    if (!elRes) continue
    for (const r of elRes.rows) {
      if (r.sourceScopeType !== 'WORK_ELEMENT') continue // فقط ردیف‌های محلی عنصر
      if (r.status === 'EXCLUDED' || r.needsAggregationRule) continue
      if (r.valueType !== 'FIXED_TIME' || r.applicationBasis !== 'PER_CYCLE' || r.timeValueSeconds === null) continue
      if (seenPerCycleDefs.has(r.definitionId)) continue
      seenPerCycleDefs.add(r.definitionId)
      perCycleTotal = round12(perCycleTotal + r.timeValueSeconds)
    }
  }
  const needsAggregationRows = [
    ...allowanceResolution.activity.rows.filter((r) => r.needsAggregationRule),
    ...[...allowanceResolution.elements.values()].flatMap((res) => res.rows.filter((r) => r.needsAggregationRule)),
  ].map((r) => ({ title: r.title, sourceScopeLabel: r.sourceScopeLabel, timeValueSeconds: r.timeValueSeconds ?? 0 }))

  const hasOverlapElements = activity.workElements.some((e) => e.elementType === 'OVERLAP')
  const hasAnyInterval = cycles.some((c) => c.observations.some((o) => o.startOffset !== null))
  let activityTotal: ActivityAnalysisDto['activityTotal']
  if (hasOverlapElements || hasAnyInterval) {
    activityTotal = {
      st: null,
      status: 'NEEDS_AGGREGATION_RULE',
      reason:
        'این فعالیت دارای کار هم‌زمان/هم‌پوشان است؛ جمع سادهٔ زمان استاندارد عناصر، زمان استاندارد کل چرخه را به دست نمی‌دهد. تا تعریف و تأیید قاعدهٔ تجمیع مهندسی، زمان استاندارد عناصر و زمان سپری‌شدهٔ مشاهده‌شدهٔ چرخه را ملاک قرار دهید.',
    }
  } else if (elementDtos.length === 0) {
    activityTotal = { st: null, status: 'INCOMPLETE', reason: 'برای این فعالیت عنصر کاری تعریف نشده است.' }
  } else {
    const missing = elementDtos.filter((e) => e.st === null)
    if (missing.length > 0) {
      activityTotal = {
        st: null,
        status: 'INCOMPLETE',
        reason: `زمان استاندارد ${missing.length} عنصر از ${elementDtos.length} عنصر قابل محاسبه نیست (${missing
          .slice(0, 3)
          .map((e) => `«${e.name}»`)
          .join('، ')}${missing.length > 3 ? ' و …' : ''}). علت رایج: نبود دادهٔ معتبر، نبود ارزیابی وستینگهاوس یا خطای مجازها.`,
      }
    } else {
      const elementsSt = round12(elementDtos.reduce((s, e) => s + (e.st as number), 0))
      activityTotal = {
        st: round12(elementsSt + perCycleTotal),
        status: 'OK',
        reason:
          perCycleTotal > 0
            ? `فعالیت کاملاً ترتیبی است؛ زمان استاندارد کل = جمع زمان استاندارد عناصر (${elementsSt}) + الونس‌های زمانی «هر چرخه» که دقیقاً یک‌بار افزوده شدند (${perCycleTotal} ثانیه).`
            : 'فعالیت کاملاً ترتیبی است؛ زمان استاندارد کل = جمع زمان استاندارد عناصر.',
      }
    }
  }

  // ── فهرست مرور مشکوک‌ها و خارج‌شده‌ها — FR-11/18 ──
  const elementNameById = new Map(activity.workElements.map((e) => [e.id, e.name]))
  const suspects: SuspectItemDto[] = []
  for (const c of cycles) {
    for (const o of c.observations) {
      if (o.validityStatus !== 'SUSPECT' && o.validityStatus !== 'EXCLUDED') continue
      if (o.derivedDuration === null) continue
      suspects.push({
        observationId: o.id,
        elementId: o.workElementId,
        elementName: elementNameById.get(o.workElementId) ?? 'عنصر حذف‌شده',
        cycleNo: c.cycleNo,
        sessionId: c.sessionId,
        operatorId: c.session.operatorId,
        operatorName: c.session.operator.displayName,
        value: o.derivedDuration,
        score: o.outlierScore,
        rule: o.outlierRule,
        validityStatus: o.validityStatus as SuspectItemDto['validityStatus'],
        exclusionReason: o.exclusionReason,
      })
    }
  }

  return {
    activity: {
      id: activity.id,
      name: activity.name,
      stationName: activity.station.name,
      processType: activity.processType,
      targetSampleCount: activity.targetSampleCount,
      groupId: activity.groupId,
      groupName: activity.group?.name ?? null,
      projectId,
    },
    settings: {
      allowanceMethod,
      allowanceMethodLabel: ALLOWANCE_METHOD_LABELS[allowanceMethod],
      formula: ALLOWANCE_METHOD_FORMULAS[allowanceMethod],
      aggregationMethod,
      aggregationMethodLabel: AGGREGATION_METHOD_LABELS[aggregationMethod],
      formulaVersion: FORMULA_VERSION,
      outlierMethod: outlierConfig.methodKey === 'iqr' ? 'iqr' : 'mad',
      outlierThreshold: outlierConfig.thresholdKey,
    },
    allowances: {
      method: allowanceResolution.method,
      methodLabel: allowanceResolution.methodLabel,
      formula: allowanceResolution.formula,
      rows: allowanceResolution.activity.rows,
      summary: allowanceResolution.activity.summary,
      perCycleTotal,
      needsAggregation: needsAggregationRows,
    },
    sampleProgress,
    elements: elementDtos,
    cycleStats,
    elementTypeTotals,
    activityTotal,
    suspects,
    generatedAt: new Date().toISOString(),
  }
}

/** فهرست فعالیت‌های دارای داده برای انتخاب در نمای تحلیل */
export async function listActivitiesForAnalysis(projectId: string) {
  const stations = await db.station.findMany({
    where: { projectId },
    orderBy: { sortOrder: 'asc' },
    select: {
      id: true,
      name: true,
      activities: {
        orderBy: { sortOrder: 'asc' },
        select: {
          id: true,
          name: true,
          processType: true,
          targetSampleCount: true,
          workElements: { select: { id: true } },
          sessions: { select: { id: true, cycles: { select: { id: true } } } },
        },
      },
    },
  })
  return stations.map((s) => ({
    id: s.id,
    name: s.name,
    activities: s.activities.map((a) => ({
      id: a.id,
      name: a.name,
      processType: a.processType,
      targetSampleCount: a.targetSampleCount,
      elementsCount: a.workElements.length,
      cyclesCount: a.sessions.reduce((sum, se) => sum + se.cycles.length, 0),
    })),
  }))
}
