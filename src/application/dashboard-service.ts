// ═══════════════════════════════════════════════════════════
// سرویس داشبورد تحلیل پروژه — فاز ۶ / FR-21
//
// قواعد حیاتی (FR-21):
//  • ابتدا کارت‌های خلاصه: زمان استاندارد (در صورت قابل محاسبه بودن)،
//    میانگین، تعداد نمونه و وضعیت هدف نمونه.
//  • در دادهٔ ناقص/غیرقابل محاسبه، کارت باید «علت» را نشان دهد؛
//    نمایش صفر یا مقدار ساختگی ممنوع است.
//  • محاسبات از همان موتور واحد تحلیل فعالیت (analysis-service)
//    خوانده می‌شود؛ هیچ فرمولی اینجا تکرار نمی‌شود.
//  • استاندارد کل پروژه = جمع ST فعالیت‌ها فقط وقتی «همهٔ» فعالیت‌ها
//    وضعیت OK داشته باشند؛ فعالیت هم‌پوشان نیازمند قاعدهٔ تجمیع
//    است و جمع ساده ممنوع — FR-16/۱۰.۳.
// ═══════════════════════════════════════════════════════════
import { db } from '@/lib/db'
import { AppError, type AllowanceMethod, type AggregationMethod } from '@/domain/types'
import { round12 } from '@/calculation/westinghouse'
import { getActivityAnalysis, type ActivityAnalysisDto } from './analysis-service'
import { getLatestCalculation } from './calculation-run-service'

// ─────────────────────── DTO ───────────────────────

/** کارت خلاصه — مقدار در صورت قابل محاسبه بودن؛ وگرنه علت صادقانه */
export interface DashboardCardDto {
  key: 'st' | 'meanCycle' | 'samples' | 'target'
  title: string
  value: number | null
  unit: string
  /** مخرج نمایشی (مثلاً «۲ از ۳ فعالیت») — فقط کارت هدف */
  denominator: number | null
  /** علت غیرقابل محاسبه بودن — فقط وقتی value = null */
  reason: string | null
  /** توضیح/زیرنویس کارت (مثلاً تعداد چرخه یا روش محاسبه) */
  note: string
  /** وضعیت کیفی کارت برای رنگ/آیکون */
  tone: 'OK' | 'WARNING' | 'INFO'
}

export interface DashboardActivityRow {
  activityId: string
  stationName: string
  activityName: string
  processType: string
  elementsCount: number
  validCycles: number
  totalCycles: number
  target: number | null
  targetReached: boolean | null
  /** جمع OT عناصر دارای داده — شاخص مقایسه؛ برای فعالیت هم‌پوشان معادل زمان سپری‌شده نیست */
  otSum: number | null
  st: number | null
  stStatus: 'OK' | 'NEEDS_AGGREGATION_RULE' | 'INCOMPLETE'
  stReason: string
  suspectsPending: number
}

export interface DashboardOperatorRow {
  operatorId: string
  operatorName: string
  /** تعداد مشاهدات مبنای محاسبه در کل پروژه */
  observations: number
  /** تعداد فعالیت‌های دارای دادهٔ این اپراتور */
  activitiesCount: number
  suspectCount: number
  excludedCount: number
  /**
   * شاخص نسبی: میانگین نسبت میانگین اپراتور به OT تجمیعی همان عنصر.
   * ۱٫۰۰ = مطابق تجمیع؛ ۱٫۰۴ ≈ ۴٪ کندتر. null = دادهٔ کافی نیست.
   */
  relativeIndex: number | null
}

export interface DashboardElementCvRow {
  elementName: string
  activityName: string
  cvPercent: number | null
  count: number
  ot: number | null
}

export interface ProjectDashboardDto {
  project: {
    id: string
    name: string
    lineName: string
    productName: string
    studyDate: string | null
    finalized: boolean
  }
  settings: {
    allowanceMethod: AllowanceMethod
    aggregationMethod: AggregationMethod
  }
  /** چهار کارت خلاصه — همیشه با ترتیب پیش‌فرض st، meanCycle، samples، target */
  cards: DashboardCardDto[]
  activities: DashboardActivityRow[]
  observationStatus: { valid: number; suspect: number; excluded: number; invalid: number }
  operators: DashboardOperatorRow[]
  /** عناصر مرتب بر اساس CV٪ نزولی (پراکندگی) — حداکثر ۲۰ ردیف */
  elementCv: DashboardElementCvRow[]
  reviewNeeds: {
    suspectsPending: number
    suspectsByActivity: { activityName: string; count: number }[]
    elementsWithoutRating: string[]
    activitiesNeedingAggregationRule: string[]
    activitiesIncomplete: string[]
    sampleShortfall: { activityName: string; valid: number; target: number }[]
    /** snapshot محاسبات به‌روز نیست یا هنوز اجرا نشده — FR-27 */
    needsRecalc: boolean
    lastCalculationAt: string | null
    lastCalculationStatus: string | null
  }
  /** میانگین وزنی زمان سپری‌شدهٔ چرخه‌ها در کل پروژه */
  cycleSummary: { count: number; weightedMean: number | null }
  counts: {
    stations: number
    activities: number
    elements: number
    operators: number
    sessions: number
  }
  generatedAt: string
}

// ─────────────────────── سرویس ───────────────────────

export async function getProjectDashboard(projectId: string): Promise<ProjectDashboardDto> {
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: {
      id: true, name: true, lineName: true, productName: true, studyDate: true,
      finalization: { select: { finalizedAt: true } },
    },
  })
  if (!project) throw new AppError('PROJECT_NOT_FOUND', 'پروژه یافت نشد.', 404)

  const [activitiesRaw, stationsCount, operatorsList, sessionsCount, latestCalc] = await Promise.all([
    db.activity.findMany({
      where: { station: { projectId } },
      orderBy: [{ station: { sortOrder: 'asc' } }, { sortOrder: 'asc' }],
      select: { id: true },
    }),
    db.station.count({ where: { projectId } }),
    db.operator.findMany({ where: { projectId }, select: { id: true, displayName: true }, orderBy: { displayName: 'asc' } }),
    db.studySession.count({ where: { activity: { station: { projectId } } } }),
    getLatestCalculation(projectId),
  ])

  // تحلیل هر فعالیت از موتور واحد — بدون تکرار فرمول
  const analyses: ActivityAnalysisDto[] = []
  for (const a of activitiesRaw) {
    analyses.push(await getActivityAnalysis(a.id))
  }

  // ── ردیف فعالیت‌ها ──
  const rows: DashboardActivityRow[] = analyses.map((an) => {
    const otParts = an.elements.filter((e) => e.ot !== null)
    return {
      activityId: an.activity.id,
      stationName: an.activity.stationName,
      activityName: an.activity.name,
      processType: an.activity.processType,
      elementsCount: an.elements.length,
      validCycles: an.sampleProgress.validCycles,
      totalCycles: an.sampleProgress.totalCycles,
      target: an.sampleProgress.targetSampleCount,
      targetReached: an.sampleProgress.reached,
      otSum:
        otParts.length === 0
          ? null
          : otParts.length === an.elements.length
            ? round12(otParts.reduce((s, e) => s + (e.ot as number), 0))
            : null, // برخی عناصر بدون داده → جمع کامل ممکن نیست؛ صفر ساختگی ممنوع
      st: an.activityTotal.st,
      stStatus: an.activityTotal.status,
      stReason: an.activityTotal.reason,
      suspectsPending: an.suspects.filter((s) => s.validityStatus === 'SUSPECT').length,
    }
  })

  // ── کارت ۱: زمان استاندارد کل پروژه ──
  const blocking = rows.filter((r) => r.stStatus !== 'OK')
  const stCard: DashboardCardDto =
    rows.length === 0
      ? {
          key: 'st', title: 'زمان استاندارد کل پروژه', value: null, unit: 'ثانیه', denominator: null,
          reason: 'هنوز فعالیتی تعریف نشده است؛ ابتدا ساختار تولید را تکمیل کنید.',
          note: 'جمع زمان استاندارد فعالیت‌ها', tone: 'INFO',
        }
      : blocking.length > 0
        ? {
            key: 'st', title: 'زمان استاندارد کل پروژه', value: null, unit: 'ثانیه', denominator: null,
            reason: `استاندارد ${blocking.length} فعالیت از ${rows.length} فعالیت قابل تعیین نیست (${blocking
              .slice(0, 3)
              .map((r) => `«${r.activityName}»`)
              .join('، ')}${blocking.length > 3 ? ' و …' : ''}). ${blocking.some((r) => r.stStatus === 'NEEDS_AGGREGATION_RULE') ? 'فعالیت دارای کار هم‌زمان نیازمند قاعدهٔ تجمیع است؛ جمع ساده ممنوع.' : 'علت رایج: دادهٔ ناکافی یا ارزیابی وستینگهاوس ناقص.'}`,
            note: 'جمع زمان استاندارد فعالیت‌ها', tone: 'WARNING',
          }
        : {
            key: 'st', title: 'زمان استاندارد کل پروژه',
            value: round12(rows.reduce((s, r) => s + (r.st as number), 0)),
            unit: 'ثانیه', denominator: null,
            reason: null,
            note: `جمع ${rows.length} فعالیت — همهٔ فعالیت‌ها ترتیبی و کامل`,
            tone: 'OK',
          }

  // ── کارت ۲: میانگین زمان سپری‌شدهٔ چرخه (میانگین وزنی بر تعداد) ──
  let cycleCount = 0
  let weightedSum = 0
  for (const an of analyses) {
    const cs = an.cycleStats
    if (cs.stats.mean !== null && cs.count > 0) {
      cycleCount += cs.count
      weightedSum += cs.stats.mean * cs.count
    }
  }
  const meanCycleCard: DashboardCardDto =
    cycleCount === 0
      ? {
          key: 'meanCycle', title: 'میانگین زمان چرخه', value: null, unit: 'ثانیه', denominator: null,
          reason:
            rows.length === 0
              ? 'فعالیتی تعریف نشده است.'
              : 'هنوز چرخهٔ کامل معتبری ثبت نشده است؛ در مرحلهٔ زمان‌سنجی داده ثبت کنید.',
          note: 'زمان سپری‌شدهٔ چرخه‌های قابل استفاده', tone: 'INFO',
        }
      : {
          key: 'meanCycle', title: 'میانگین زمان چرخه',
          value: round12(weightedSum / cycleCount), unit: 'ثانیه', denominator: null, reason: null,
          note: `از ${cycleCount} چرخهٔ قابل استفاده در کل پروژه — برای فعالیت‌های هم‌زمان، گسترهٔ بازه‌ها ملاک است نه جمع مدت‌ها`,
          tone: 'OK',
        }

  // ── کارت ۳: تعداد نمونه (چرخه‌های معتبر) ──
  const totalValid = rows.reduce((s, r) => s + r.validCycles, 0)
  const totalCyclesAll = rows.reduce((s, r) => s + r.totalCycles, 0)
  const samplesCard: DashboardCardDto =
    rows.length === 0
      ? {
          key: 'samples', title: 'تعداد نمونهٔ معتبر', value: null, unit: 'چرخه', denominator: null,
          reason: 'فعالیتی تعریف نشده است.', note: 'چرخهٔ کامل بدون دادهٔ خارج/نامعتبر', tone: 'INFO',
        }
      : {
          key: 'samples', title: 'تعداد نمونهٔ معتبر', value: totalValid, unit: 'چرخه', denominator: null, reason: null,
          note: `${totalCyclesAll} چرخهٔ ثبت‌شده در ${sessionsCount} جلسه — مبنای شمارش: چرخهٔ کامل بدون مشاهدهٔ خارج‌شده/نامعتبر`,
          tone: totalValid === 0 ? 'WARNING' : 'OK',
        }

  // ── کارت ۴: وضعیت هدف نمونه ──
  const withTarget = rows.filter((r) => r.target !== null)
  const reached = withTarget.filter((r) => r.targetReached === true)
  const shortfall = withTarget
    .filter((r) => r.targetReached !== true)
    .map((r) => ({ activityName: r.activityName, valid: r.validCycles, target: r.target as number }))
  const targetCard: DashboardCardDto =
    rows.length === 0
      ? { key: 'target', title: 'وضعیت هدف نمونه', value: null, unit: '', denominator: null, reason: 'فعالیتی تعریف نشده است.', note: 'بر اساس هدف ثبت‌شدهٔ هر فعالیت', tone: 'INFO' }
      : withTarget.length === 0
        ? {
            key: 'target', title: 'وضعیت هدف نمونه', value: null, unit: '', denominator: null,
            reason: 'برای هیچ فعالیتی هدف تعداد نمونه ثبت نشده است؛ در مشخصات فعالیت قابل تعیین است.',
            note: 'بر اساس هدف ثبت‌شدهٔ هر فعالیت', tone: 'WARNING',
          }
        : shortfall.length === 0
          ? {
              key: 'target', title: 'وضعیت هدف نمونه', value: reached.length, unit: 'فعالیت', denominator: withTarget.length,
              reason: null,
              note: `هدف همهٔ ${withTarget.length} فعالیت دارای هدف تکمیل شده — توجه: رسیدن به هدف تعداد، تضمین کفایت آماری نیست؛ شاخص‌های پراکندی را بازبینی کنید.`,
              tone: 'OK',
            }
          : {
              key: 'target', title: 'وضعیت هدف نمونه', value: reached.length, unit: 'فعالیت', denominator: withTarget.length,
              reason: `${shortfall.length} فعالیت به هدف نمونه نرسیده است. توجه: هدف، کاربرمحور است و کفایت آماری را تضمین نمی‌کند.`,
              note: shortfall
                .slice(0, 3)
                .map((s) => `«${s.activityName}»: ${s.valid}/${s.target}`)
                .join('، ') + (shortfall.length > 3 ? ' و …' : ''),
              tone: 'WARNING',
            }

  // ── توزیع وضعیت مشاهدات ──
  const observationStatus = { valid: 0, suspect: 0, excluded: 0, invalid: 0 }
  for (const an of analyses) {
    for (const el of an.elements) {
      observationStatus.valid += el.counts.valid
      observationStatus.suspect += el.counts.suspect
      observationStatus.excluded += el.counts.excluded
      observationStatus.invalid += el.counts.invalid
    }
  }

  // ── مقایسهٔ اپراتورها در سطح پروژه ──
  interface OpAcc {
    name: string
    observations: number
    suspect: number
    excluded: number
    activities: Set<string>
    /** نسبت‌های میانگین اپراتور به OT عنصر برای شاخص نسبی */
    ratios: number[]
  }
  const opAcc = new Map<string, OpAcc>()
  const operatorNameById = new Map(operatorsList.map((o) => [o.id, o.displayName]))
  const touchOp = (id: string): OpAcc => {
    let acc = opAcc.get(id)
    if (!acc) {
      acc = {
        name: operatorNameById.get(id) ?? 'اپراتور حذف‌شده',
        observations: 0, suspect: 0, excluded: 0, activities: new Set(), ratios: [],
      }
      opAcc.set(id, acc)
    }
    return acc
  }
  for (const an of analyses) {
    for (const el of an.elements) {
      for (const op of el.operators) {
        const acc = touchOp(op.operatorId)
        acc.observations += op.count
        acc.suspect += op.suspectCount
        acc.excluded += op.excludedCount
        if (op.count > 0) acc.activities.add(an.activity.id)
        // شاخص نسبی: میانگین اپراتور نسبت به OT تجمیعی همان عنصر
        if (op.mean !== null && el.ot !== null && el.ot > 0) {
          acc.ratios.push(op.mean / el.ot)
        }
      }
    }
  }
  const operators: DashboardOperatorRow[] = [...opAcc.entries()]
    .map(([operatorId, acc]) => ({
      operatorId,
      operatorName: acc.name,
      observations: acc.observations,
      activitiesCount: acc.activities.size,
      suspectCount: acc.suspect,
      excludedCount: acc.excluded,
      relativeIndex:
        acc.ratios.length > 0 ? round12(acc.ratios.reduce((s, r) => s + r, 0) / acc.ratios.length) : null,
    }))
    .sort((a, b) => a.operatorName.localeCompare(b.operatorName, 'fa'))

  // ── پراکندگی عناصر (CV٪) ──
  const elementCv: DashboardElementCvRow[] = analyses
    .flatMap((an) =>
      an.elements.map((el) => ({
        elementName: el.name,
        activityName: an.activity.name,
        cvPercent: el.stats.cvPercent,
        count: el.counts.calcBasis,
        ot: el.ot,
      }))
    )
    .sort((a, b) => (b.cvPercent ?? -1) - (a.cvPercent ?? -1))
    .slice(0, 20)

  // ── نیازهای بازبینی ──
  const suspectsByActivity = rows
    .filter((r) => r.suspectsPending > 0)
    .map((r) => ({ activityName: r.activityName, count: r.suspectsPending }))
  const elementsWithoutRating: string[] = []
  for (const an of analyses) {
    for (const el of an.elements) {
      if (!el.rating) elementsWithoutRating.push(`«${el.name}» (${an.activity.name})`)
    }
  }

  return {
    project: {
      id: project.id,
      name: project.name,
      lineName: project.lineName,
      productName: project.productName,
      studyDate: project.studyDate,
      finalized: Boolean(project.finalization),
    },
    settings: {
      allowanceMethod: analyses[0]?.settings.allowanceMethod ?? 'PERCENT_OF_NT',
      aggregationMethod: analyses[0]?.settings.aggregationMethod ?? 'WEIGHTED_BY_COUNT',
    },
    cards: [stCard, meanCycleCard, samplesCard, targetCard],
    activities: rows,
    observationStatus,
    operators,
    elementCv,
    reviewNeeds: {
      suspectsPending: suspectsByActivity.reduce((s, x) => s + x.count, 0),
      suspectsByActivity,
      elementsWithoutRating: elementsWithoutRating.slice(0, 12),
      activitiesNeedingAggregationRule: rows
        .filter((r) => r.stStatus === 'NEEDS_AGGREGATION_RULE')
        .map((r) => r.activityName),
      activitiesIncomplete: rows.filter((r) => r.stStatus === 'INCOMPLETE').map((r) => r.activityName),
      sampleShortfall: shortfall,
      needsRecalc: latestCalc.needsRecalc,
      lastCalculationAt: latestCalc.run?.createdAt ?? null,
      lastCalculationStatus: latestCalc.run?.status ?? null,
    },
    cycleSummary: { count: cycleCount, weightedMean: cycleCount > 0 ? round12(weightedSum / cycleCount) : null },
    counts: {
      stations: stationsCount,
      activities: rows.length,
      elements: analyses.reduce((s, an) => s + an.elements.length, 0),
      operators: operatorsList.length,
      sessions: sessionsCount,
    },
    generatedAt: new Date().toISOString(),
  }
}
