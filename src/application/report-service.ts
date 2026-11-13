// ═══════════════════════════════════════════════════════════
// سرویس گزارش مطالعه — فاز ۶ / FR-22
//
// محتوای الزامی گزارش (FR-22):
//  • پارامترها و فرض‌های محاسبات (روش مجاز، فرمول ST، روش تجمیع،
//    روش تشخیص غیرعادی، نسخهٔ فرمول)
//  • روش کرنومتر استفاده‌شده در جلسات (برگشت به صفر / پیوسته)
//  • تعداد نمونه و وضعیت هدف
//  • داده‌های خارج‌شده با دلیل
//  • جدول وستینگهاوس (۴ عامل + جدول مرجع + ضریب کل)
//  • دسته‌های مجاز مؤثر با منبع (گروه / بازنویسی فعالیت)
//  • فرمول زمان استاندارد
//
// قاعدهٔ صداقت:
//  • گزارش نتیجه‌ای را که نیازمند بازبینی است به‌عنوان استاندارد
//    قطعی معرفی نمی‌کند — پرچم‌های بازبینی به‌صورت صریح اعلام می‌شوند.
//  • مقادیر غیرقابل محاسبه با علت گزارش می‌شوند؛ نه صفر، نه مقدار ساختگی.
//  • در حالت تک‌اپراتوره، OT = میانگین همان اپراتور است و این موضوع
//    در متن گزارش شفاف می‌شود (نه تجمیع چند اپراتور).
// ═══════════════════════════════════════════════════════════
import { db } from '@/lib/db'
import {
  AppError,
  PROCESS_TYPE_LABELS,
  TIMING_METHOD_LABELS,
  PROJECT_STATUS_LABELS,
  RATING_FACTOR_LABELS,
  type ProcessType,
  type TimingMethod,
  type ProjectStatus,
} from '@/domain/types'
import { getActivityAnalysis, type ActivityAnalysisDto, type ActivityAllowancesDto, type SuspectItemDto } from './analysis-service'
import { getLatestCalculation } from './calculation-run-service'
import type { DescriptiveStats } from '@/calculation/statistics'
import type { RatingAssessment } from '@prisma/client'

// ─────────────────────── DTO ───────────────────────

export interface RatingFactorDetail {
  grade: string | null
  value: number
  label: string
}

export interface ElementReportRating {
  tableName: string
  tableVersion: number
  skill: RatingFactorDetail
  effort: RatingFactorDetail
  conditions: RatingFactorDetail
  consistency: RatingFactorDetail
  totalFactor: number
}

export interface ElementReportRow {
  name: string
  counts: { calcBasis: number; suspect: number; excluded: number }
  stats: Pick<DescriptiveStats, 'count' | 'mean' | 'median' | 'sampleSD' | 'cvPercent' | 'ci95'>
  ot: number | null
  otNote: string
  rating: ElementReportRating | null
  nt: number | null
  st: number | null
  stError: string | null
  /** جمع درصدهای الونس مؤثر این عنصر — جلسه اول (§۳) */
  allowanceP: number
  /** ثانیه‌های ثابت per-execution این عنصر */
  allowanceT: number
  operatorsCount: number
}

export interface ActivityMethodUsage {
  methodKey: TimingMethod
  methodLabel: string
  sessionsCount: number
  operators: string[]
}

export interface ActivityReportSection {
  activity: {
    id: string
    name: string
    stationName: string
    processTypeLabel: string
    groupName: string | null
    description: string | null
    targetSampleCount: number | null
  }
  methods: ActivityMethodUsage[]
  /**
   * شمارش نمونه — در حالت تک‌اپراتوره، شمارش چرخه در سطح کل فعالیت
   * معنا ندارد و null می‌شود (نمایش «—» + توضیح)؛ صفر ساختگی ممنوع.
   */
  sampleProgress: {
    targetSampleCount: number | null
    validCycles: number | null
    totalCycles: number | null
    sessionsCount: number
    reached: boolean | null
    message: string
  }
  allowances: ActivityAllowancesDto
  elements: ElementReportRow[]
  activityTotal: ActivityAnalysisDto['activityTotal']
  cycleStats: { count: number | null; mean: number | null; sampleSD: number | null; cvPercent: number | null; methodNote: string }
  suspects: SuspectItemDto[]
}

export interface StudyReportDto {
  reportMeta: {
    title: string
    generatedAt: string
    activityFilter: { id: string; name: string } | null
    operatorFilter: { id: string; name: string } | null
    operatorNote: string | null
  }
  project: {
    name: string
    lineName: string
    productName: string
    studyDate: string | null
    statusLabel: string
    description: string | null
    finalized: boolean
    finalizationReason: string | null
  }
  assumptions: {
    allowanceMethodLabel: string
    stFormula: string
    stFormulaConstraint: string | null
    aggregationMethodLabel: string
    outlierMethodLabel: string
    outlierThresholdLabel: string
    formulaVersion: string
    westinghouseNote: string
  }
  activities: ActivityReportSection[]
  flags: {
    pendingSuspects: number
    needsRecalc: boolean
    lastCalculationAt: string | null
    lastCalculationStatus: string | null
    activitiesNeedingAggregationRule: string[]
    activitiesIncomplete: string[]
    sampleTargetsNotReached: string[]
    elementsUnrated: string[]
    anyStError: boolean
  }
  disclaimer: string
}

// ─────────────────────── سرویس ───────────────────────

export async function getStudyReport(
  projectId: string,
  opts: { activityId?: string; operatorId?: string } = {}
): Promise<StudyReportDto> {
  const project = await db.project.findUnique({
    where: { id: projectId },
    include: { finalization: true },
  })
  if (!project) throw new AppError('PROJECT_NOT_FOUND', 'پروژه یافت نشد.', 404)

  // اپراتور فیلتر؟
  let operatorFilter: { id: string; name: string } | null = null
  if (opts.operatorId) {
    const op = await db.operator.findUnique({ where: { id: opts.operatorId } })
    if (op && op.projectId === projectId) operatorFilter = { id: op.id, name: op.displayName }
  }

  // فعالیت‌ها (با فیلتر اختیاری) به ترتیب ایستگاه
  const activities = await db.activity.findMany({
    where: {
      station: { projectId },
      ...(opts.activityId ? { id: opts.activityId } : {}),
    },
    orderBy: [{ station: { sortOrder: 'asc' } }, { sortOrder: 'asc' }],
    select: { id: true, name: true, description: true },
  })

  // تحلیل‌ها از موتور واحد + جلسه‌ها برای روش کرنومتر
  const analyses: ActivityAnalysisDto[] = []
  for (const a of activities) {
    analyses.push(await getActivityAnalysis(a.id))
  }

  const sessions = await db.studySession.findMany({
    where: {
      activity: { station: { projectId } },
      ...(opts.activityId ? { activityId: opts.activityId } : {}),
    },
    include: { operator: true },
    orderBy: { startedAt: 'asc' },
  })

  // جزئیات وستینگهاوس (درجه‌ها) — یک پرس‌وجو برای همهٔ عناصر درگیر
  const ratingRows: (RatingAssessment & { ratingTable: { name: string; version: number } })[] = []
  if (analyses.length > 0) {
    const elementIds = analyses.flatMap((an) => an.elements.map((e) => e.id))
    if (elementIds.length > 0) {
      const rows = await db.ratingAssessment.findMany({
        where: { workElementId: { in: elementIds } },
        include: { ratingTable: { select: { name: true, version: true } } },
      })
      ratingRows.push(...rows)
    }
  }
  const ratingByElement = new Map(ratingRows.map((r) => [r.workElementId, r]))

  const latestCalc = await getLatestCalculation(projectId)

  // ── بخش‌های هر فعالیت ──
  const sections: ActivityReportSection[] = analyses.map((an) => {
    const actDesc = activities.find((a) => a.id === an.activity.id)

    // روش‌های کرنومتر استفاده‌شده در این فعالیت — FR-22
    // در حالت تک‌اپراتوره فقط جلسه‌های همان اپراتور فهرست می‌شود
    const actSessions = sessions.filter(
      (s) => s.activityId === an.activity.id && (!operatorFilter || s.operatorId === operatorFilter.id)
    )
    const byMethod = new Map<string, { sessionsCount: number; operatorNames: Set<string> }>()
    for (const s of actSessions) {
      const key = s.timingMethod
      let entry = byMethod.get(key)
      if (!entry) {
        entry = { sessionsCount: 0, operatorNames: new Set() }
        byMethod.set(key, entry)
      }
      entry.sessionsCount++
      entry.operatorNames.add(s.operator.displayName)
    }
    const methods: ActivityMethodUsage[] = [...byMethod.entries()].map(([key, v]) => ({
      methodKey: key as TimingMethod,
      methodLabel: TIMING_METHOD_LABELS[key as TimingMethod] ?? key,
      sessionsCount: v.sessionsCount,
      operators: [...v.operatorNames].sort((a, b) => a.localeCompare(b, 'fa')),
    }))

    // شمارش نمونه — در حالت تک‌اپراتوره فقط جلسه‌های همان اپراتور شمرده می‌شود
    // و شمارش چرخهٔ کامل (مفهوم کل فعالیت) به‌صورت صادقانه null است.
    const sampleProgress = operatorFilter
      ? {
          targetSampleCount: an.activity.targetSampleCount,
          validCycles: null as number | null,
          totalCycles: null as number | null,
          sessionsCount: actSessions.length,
          reached: null as boolean | null,
          message:
            actSessions.length === 0
              ? `اپراتور «${operatorFilter.name}» در این فعالیت جلسه یا داده‌ای ثبت نکرده است؛ ستون‌های زمان در جدول عناصر خالی («—») می‌مانند.`
              : 'گزارش تک‌اپراتوره: تعداد چرخهٔ کامل معتبر فقط در سطح کل فعالیت تعریف می‌شود و اینجا گزارش نمی‌شود؛ در جدول عناصر، n هر عنصر مربوط به همین اپراتور است.',
        }
      : an.sampleProgress

    // ردیف عناصر — با احترام به فیلتر اپراتور
    const elements: ElementReportRow[] = an.elements.map((el) => {
      const rating = ratingByElement.get(el.id)
      let ot = el.ot
      let nt = el.nt
      let st = el.st
      let stError = el.stError
      let otNote = 'تجمیع طبق روش تنظیم‌شدهٔ پروژه'
      let counts = { calcBasis: el.counts.calcBasis, suspect: el.counts.suspect, excluded: el.counts.excluded }

      // آمار نمایشی: در حالت تک‌اپراتوره از آمار همان اپراتور — نه کل فعالیت
      let stats: ElementReportRow['stats'] = {
        count: el.stats.count,
        mean: el.stats.mean,
        median: el.stats.median,
        sampleSD: el.stats.sampleSD,
        cvPercent: el.stats.cvPercent,
        ci95: el.stats.ci95,
      }
      if (operatorFilter) {
        const opRow = el.operators.find((o) => o.operatorId === operatorFilter.id)
        const opTrend = el.trend.filter((t) => t.operatorId === operatorFilter.id)
        ot = opRow?.mean ?? null
        nt = opRow?.nt ?? null
        st = opRow?.st ?? null
        stError = opRow && opRow.st === null && opRow.nt !== null ? 'محاسبهٔ ST برای این اپراتور ممکن نشد (مجازها).' : null
        otNote = 'میانگین مشاهدات همین اپراتور (گزارش تک‌اپراتوره — نه تجمیع چند اپراتور)'
        counts = {
          calcBasis: opRow?.count ?? 0,
          suspect: opTrend.filter((t) => t.status === 'SUSPECT').length,
          excluded: opTrend.filter((t) => t.status === 'EXCLUDED').length,
        }
        stats = {
          count: opRow?.count ?? 0,
          mean: opRow?.mean ?? null,
          median: opRow?.median ?? null,
          sampleSD: opRow?.sampleSD ?? null,
          cvPercent: opRow?.cvPercent ?? null,
          ci95: opRow?.ci95 ?? null,
        }
      }

      const ratingDetail: ElementReportRating | null = rating
        ? {
            tableName: rating.ratingTable.name,
            tableVersion: rating.ratingTable.version,
            skill: { grade: rating.skillGrade, value: rating.skillValue, label: RATING_FACTOR_LABELS.SKILL },
            effort: { grade: rating.effortGrade, value: rating.effortValue, label: RATING_FACTOR_LABELS.EFFORT },
            conditions: { grade: rating.conditionsGrade, value: rating.conditionsValue, label: RATING_FACTOR_LABELS.CONDITIONS },
            consistency: { grade: rating.consistencyGrade, value: rating.consistencyValue, label: RATING_FACTOR_LABELS.CONSISTENCY },
            totalFactor: rating.totalFactor,
          }
        : null

      return {
        name: el.name,
        counts,
        stats,
        ot,
        otNote,
        rating: ratingDetail,
        nt,
        st,
        stError,
        allowanceP: el.allowances.totalPercent,
        allowanceT: el.allowances.perExecutionSeconds,
        operatorsCount: el.operators.length,
      }
    })

    const suspects = operatorFilter
      ? an.suspects.filter((s) => s.operatorId === operatorFilter.id)
      : an.suspects

    // زمان سپری‌شدهٔ چرخه: مفهوم کل فعالیت — در حالت تک‌اپراتوره گزارش نمی‌شود (صفر ساختگی ممنوع)
    const cycleStats = operatorFilter
      ? {
          count: null as number | null,
          mean: null as number | null,
          sampleSD: null as number | null,
          cvPercent: null as number | null,
          methodNote:
            'در گزارش تک‌اپراتوره، زمان سپری‌شدهٔ چرخه (مفهومی در سطح کل فعالیت) گزارش نمی‌شود؛ آمار هر عنصر از مشاهدات همین اپراتور است.',
        }
      : {
          count: an.cycleStats.count,
          mean: an.cycleStats.stats.mean,
          sampleSD: an.cycleStats.stats.sampleSD,
          cvPercent: an.cycleStats.stats.cvPercent,
          methodNote: an.cycleStats.methodNote,
        }

    // استاندارد کل فعالیت: در حالت تک‌اپراتوره تجمیع کل فعالیت است — برچسب شفاف
    const activityTotal = operatorFilter
      ? an.activityTotal.status === 'OK'
        ? {
            st: an.activityTotal.st,
            status: an.activityTotal.status,
            reason: `${an.activityTotal.reason} — توجه: این مقدار تجمیع کل فعالیت (همهٔ اپراتورها) است و مربوط به فقط این اپراتور نیست.`,
          }
        : an.activityTotal
      : an.activityTotal

    return {
      activity: {
        id: an.activity.id,
        name: an.activity.name,
        stationName: an.activity.stationName,
        processTypeLabel: PROCESS_TYPE_LABELS[an.activity.processType as ProcessType] ?? an.activity.processType,
        groupName: an.activity.groupName,
        description: actDesc?.description ?? null,
        targetSampleCount: an.activity.targetSampleCount,
      },
      methods,
      sampleProgress,
      allowances: an.allowances,
      elements,
      activityTotal,
      cycleStats,
      suspects,
    }
  })

  // ── پرچم‌های بازبینی — گزارش صادقانه ──
  const pendingSuspects = sections.reduce((s, sec) => s + sec.suspects.filter((x) => x.validityStatus === 'SUSPECT').length, 0)
  const elementsUnrated: string[] = []
  for (const sec of sections) {
    for (const el of sec.elements) {
      if (!el.rating) elementsUnrated.push(`«${el.name}» (${sec.activity.name})`)
    }
  }
  const sampleTargetsNotReached = sections
    .filter((s) => s.sampleProgress.targetSampleCount !== null && s.sampleProgress.reached !== true)
    .map((s) => s.activity.name)

  const firstSettings = analyses[0]?.settings
  const flags: StudyReportDto['flags'] = {
    pendingSuspects,
    needsRecalc: latestCalc.needsRecalc,
    lastCalculationAt: latestCalc.run?.createdAt ?? null,
    lastCalculationStatus: latestCalc.run?.status ?? null,
    activitiesNeedingAggregationRule: sections
      .filter((s) => s.activityTotal.status === 'NEEDS_AGGREGATION_RULE')
      .map((s) => s.activity.name),
    activitiesIncomplete: sections.filter((s) => s.activityTotal.status === 'INCOMPLETE').map((s) => s.activity.name),
    sampleTargetsNotReached,
    elementsUnrated: elementsUnrated.slice(0, 15),
    anyStError: sections.some((s) => s.elements.some((e) => e.stError !== null)),
  }

  const disclaimerParts: string[] = [
    'این گزارش خلاصهٔ محاسبات مطالعهٔ زمان است؛ نتیجه‌ای را که نیازمند بازبینی است به‌عنوان استاندارد قطعی معرفی نمی‌کند.',
  ]
  if (flags.pendingSuspects > 0)
    disclaimerParts.push(`${flags.pendingSuspects} مشاهدهٔ مشکوک هنوز بازبینی نشده و در محاسبات لحاظ شده است.`)
  if (flags.needsRecalc)
    disclaimerParts.push('پس از آخرین تغییر مؤثر، محاسبهٔ رسمی تازه‌سازی نشده است (وضعیت: نیازمند محاسبهٔ مجدد).')
  if (flags.activitiesNeedingAggregationRule.length > 0)
    disclaimerParts.push('برای فعالیت‌های دارای کار هم‌زمان، زمان استاندارد کل فعلاً «نیازمند قاعدهٔ تجمیع» است.')
  if (flags.sampleTargetsNotReached.length > 0)
    disclaimerParts.push('رسیدن به هدف تعداد نمونه، کفایت آماری را تضمین نمی‌کند و باید با شاخص‌های پراکندی بازبینی شود.')

  return {
    reportMeta: {
      title: 'گزارش مطالعهٔ زمان',
      generatedAt: new Date().toISOString(),
      activityFilter: opts.activityId ? { id: opts.activityId, name: analyses[0]?.activity.name ?? '' } : null,
      operatorFilter,
      operatorNote: operatorFilter
        ? `این گزارش فقط داده‌های اپراتور «${operatorFilter.name}» را شامل می‌شود؛ زمان‌های گزارش‌شده میانگین همین اپراتور است و تعمیم آن به کل خط نیازمند قضاوت مهندسی است.`
        : null,
    },
    project: {
      name: project.name,
      lineName: project.lineName,
      productName: project.productName,
      studyDate: project.studyDate,
      statusLabel: PROJECT_STATUS_LABELS[project.status as ProjectStatus] ?? project.status,
      description: project.description,
      finalized: Boolean(project.finalization),
      finalizationReason: project.finalization?.reason ?? null,
    },
    assumptions: {
      allowanceMethodLabel: firstSettings?.allowanceMethodLabel ?? '—',
      stFormula: firstSettings?.formula ?? '—',
      stFormulaConstraint:
        firstSettings?.allowanceMethod === 'SHARE_OF_ST' ? 'در این روش A باید کمتر از ۱۰۰٪ باشد.' : null,
      aggregationMethodLabel: firstSettings?.aggregationMethodLabel ?? '—',
      outlierMethodLabel:
        firstSettings?.outlierMethod === 'iqr' ? 'IQR (حصار چارکی)' : 'MAD (امتیاز Z مقاوم)',
      outlierThresholdLabel: String(firstSettings?.outlierThreshold ?? '—'),
      formulaVersion: firstSettings?.formulaVersion ?? '—',
      westinghouseNote:
        'ضریب وستینگهاوس در سطح عنصر کاری و مشترک برای تمام مشاهدات همان عنصر اعمال می‌شود (R = 1 + Skill + Effort + Conditions + Consistency).',
    },
    activities: sections,
    flags,
    disclaimer: disclaimerParts.join(' '),
  }
}

/** فهرست انتخاب گزارش: ایستگاه‌ها/فعالیت‌ها/اپراتورهای دارای داده — FR-22 */
export async function getReportSelection(projectId: string) {
  const [stations, operators, sessions] = await Promise.all([
    db.station.findMany({
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
            sessions: { select: { id: true, cycles: { select: { id: true } } } },
          },
        },
      },
    }),
    db.operator.findMany({
      where: { projectId },
      orderBy: { displayName: 'asc' },
      select: {
        id: true,
        displayName: true,
        sessions: { select: { id: true } },
      },
    }),
    db.studySession.count({ where: { activity: { station: { projectId } } } }),
  ])
  return {
    stations: stations.map((s) => ({
      id: s.id,
      name: s.name,
      activities: s.activities.map((a) => ({
        id: a.id,
        name: a.name,
        hasData: a.sessions.some((se) => se.cycles.length > 0),
      })),
    })),
    operators: operators.map((o) => ({
      id: o.id,
      name: o.displayName,
      hasData: o.sessions.length > 0,
    })),
    sessionsCount: sessions,
  }
}
