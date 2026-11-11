// ═══════════════════════════════════════════════════════════
// سرویس زمان‌سنجی — فاز ۳ — FR-06 تا FR-12
// جلسه فعالیت×اپراتور، چرخه‌ها، سلول‌ها، روش برگشت به صفر و
// پیوسته (زنجیره قرائت)، بازه‌های هم‌پوشانی با خطوط زمانی مستقل،
// Paste چندسلولی با پیش‌نمایش، وضعیت مشاهده و آمار نمونه.
//
// قواعد حیاتی:
//  قرائت تجمعی در یک خط زمانی نزولی نیست (FR-09)
//  مدت بازه = پایان − شروع؛ زمان سپری‌شده چرخه = گستره (FR-10)
//  داده خام هرگز با خروج از محاسبه حذف نمی‌شود (FR-11)
//  روش اندازه‌گیری جلسه پس از ایجاد تغییر نمی‌کند (FR-06)
// ═══════════════════════════════════════════════════════════
import { db } from '@/lib/db'
import { AppError, type TimingMethod } from '@/domain/types'
import { recordAudit } from '@/infrastructure/audit'
import { markDeleted } from '@/infrastructure/deletion'
import type {
  SessionCreateInput,
  SessionUpdateInput,
  CyclesAddInput,
  CycleUpdateInput,
  CellsPutInput,
  PasteInput,
  ValidityPutInput,
} from '@/domain/validation'
import { validateInterval } from '@/calculation/overlap'
import { round12 } from '@/calculation/westinghouse'
import { refreshOutliersForElement, refreshOutliersForActivity } from './outlier-service'
import { markProjectCalculationsStale } from './calc-stale'
import type { Prisma, ElementObservation, CycleObservation, StudySession, WorkElement } from '@prisma/client'

/** parse امن snapshot تشخیصی (بدون throw روی داده قدیمی) */
function safeJsonParse(v: string): unknown {
  try {
    return JSON.parse(v)
  } catch {
    return null
  }
}

type Tx = Prisma.TransactionClient

// ── خطای سلولی با محل و علت دقیق — FR-07 ──
export interface CellError {
  workElementId?: string
  cycleNo?: number
  colIndex?: number
  code: string
  message: string
}

// ═══════════════ ساختارهای برگه ═══════════════

export interface ObservationDto {
  id: string
  workElementId: string
  laneId: string | null
  laneType: string | null
  rawDuration: number | null
  cumulativeReading: number | null
  startOffset: number | null
  endOffset: number | null
  derivedDuration: number | null
  validityStatus: string
  isUserExcluded: boolean
  exclusionReason: string | null
}

export interface CycleDto {
  id: string
  cycleNo: number
  notes: string | null
  isComplete: boolean
  createdAt: string
  updatedAt: string
  elapsed: number | null
  /** چرخه دارای عناصر ترتیبی بدون موقعیت است؛ سپری‌شده فقط از بازه‌ها است — FR-10 */
  elapsedExcludesSequential: boolean
  hasExcluded: boolean
  hasSuspect: boolean
  hasIncompleteInterval: boolean
  observations: ObservationDto[]
}

export interface SessionDetailDto {
  session: {
    id: string
    activityId: string
    operatorId: string
    timingMethod: TimingMethod
    status: string
    notes: string | null
    startedAt: string
    endedAt: string | null
    updatedAt: string
  }
  activity: {
    id: string
    name: string
    stationName: string
    targetSampleCount: number | null
    projectId: string
  }
  operator: { id: string; displayName: string; code: string | null }
  elements: {
    id: string
    name: string
    elementType: string
    sortOrder: number
    /** حالت پیش‌فرض ورود: ترتیبی (مدت/قرائت) یا بازه‌ای (شروع/پایان) */
    defaultEntry: 'SEQ' | 'INT'
  }[]
  cycles: CycleDto[]
  stats: {
    perElement: Record<string, { calcCount: number; excludedCount: number; totalCount: number }>
    sessionCycles: number
    sessionValidCycles: number
    activityValidCycles: number
    targetSampleCount: number | null
  }
}

// ═══════════════ کمکی‌ها ═══════════════

async function loadSessionContext(sessionId: string) {
  const session = await db.studySession.findUnique({
    where: { id: sessionId },
    include: {
      activity: { include: { station: { select: { name: true, projectId: true } } } },
      operator: { select: { id: true, displayName: true, code: true } },
    },
  })
  if (!session) throw new AppError('SESSION_NOT_FOUND', 'جلسه زمان‌سنجی یافت نشد.', 404)
  return session
}

async function loadActivityElements(activityId: string): Promise<WorkElement[]> {
  return db.workElement.findMany({
    where: { activityId },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  })
}

/** حالت ورود پیش‌فرض بر اساس نوع عنصر — MANUAL ترتیبی، بقیه بازه‌ای */
function defaultEntryFor(elementType: string): 'SEQ' | 'INT' {
  return elementType === 'MANUAL' ? 'SEQ' : 'INT'
}

/** خط زمانی متناظر با نوع عنصر — FR-10 */
function laneTypeForElement(elementType: string): 'OPERATOR' | 'MACHINE' {
  return elementType === 'MACHINE' || elementType === 'OVERLAP' ? 'MACHINE' : 'OPERATOR'
}

async function getOrCreateLane(tx: Tx, cycleId: string, laneType: 'OPERATOR' | 'MACHINE'): Promise<string> {
  const existing = await tx.timelineLane.findFirst({ where: { cycleId, laneType } })
  if (existing) return existing.id
  const lane = await tx.timelineLane.create({
    data: {
      cycleId,
      laneType,
      label: laneType === 'OPERATOR' ? 'خط زمانی اپراتور' : 'خط زمانی ماشین',
    },
  })
  return lane.id
}

/** مقدار مؤثر مدت یک مشاهده پس از محاسبه */
function observationDerived(o: {
  rawDuration: number | null
  cumulativeReading: number | null
  startOffset: number | null
  endOffset: number | null
  derivedDuration: number | null
}): number | null {
  return o.derivedDuration
}

interface CycleComputed {
  elapsed: number | null
  elapsedExcludesSequential: boolean
  hasExcluded: boolean
  hasSuspect: boolean
  hasInvalid: boolean
  hasIncompleteInterval: boolean
  /** چرخهٔ کامل: همهٔ عناصر دارای مقدار قابل استفاده‌اند — ۸.۲ */
  complete: boolean
  /** چرخهٔ معتبر برای نمونه: کامل + بدون خروج/نامعتبر — FR-12 */
  isValidCycle: boolean
}

/** محاسبهٔ شاخص‌های یک چرخه از روی مشاهدات recomputed — FR-10/FR-12 */
function computeCycleIndicators(
  observations: (ElementObservation & { workElement: { sortOrder: number } })[],
  elementIds: string[]
): CycleComputed {
  const byElement = new Map(observations.map((o) => [o.workElementId, o]))

  const fullIntervals = observations.filter((o) => o.startOffset !== null && o.endOffset !== null)
  const seqObs = observations.filter((o) => o.rawDuration !== null || o.cumulativeReading !== null)

  // زمان سپری‌شده: اگر بازه‌ای ثبت شده ← گستره؛ وگرنه جمع مدت‌های ترتیبی — FR-10
  let elapsed: number | null
  let elapsedExcludesSequential = false
  if (fullIntervals.length > 0) {
    const earliest = Math.min(...fullIntervals.map((o) => o.startOffset as number))
    const latest = Math.max(...fullIntervals.map((o) => o.endOffset as number))
    elapsed = round12(latest - earliest)
    elapsedExcludesSequential = seqObs.length > 0
  } else if (seqObs.length > 0) {
    elapsed = round12(seqObs.reduce((s, o) => s + (o.derivedDuration ?? 0), 0))
  } else {
    elapsed = null
  }

  const hasIncompleteInterval = observations.some(
    (o) => (o.startOffset !== null) !== (o.endOffset !== null)
  )
  const hasExcluded = observations.some((o) => o.validityStatus === 'EXCLUDED')
  const hasSuspect = observations.some((o) => o.validityStatus === 'SUSPECT')
  const hasInvalid = observations.some((o) => o.validityStatus === 'INVALID')

  // چرخهٔ کامل: همهٔ عناصر دارای مقدار قابل استفاده‌اند — ۸.۲
  const complete =
    elementIds.length > 0 &&
    elementIds.every((eid) => {
      const o = byElement.get(eid)
      return o !== undefined && observationDerived(o) !== null
    })

  // چرخهٔ معتبر برای نمونه: کامل + بدون خروج/نامعتبر — FR-12
  const isValidCycle = complete && !hasExcluded && !hasInvalid

  return { elapsed, elapsedExcludesSequential, hasExcluded, hasSuspect, hasInvalid, hasIncompleteInterval, complete, isValidCycle }
}

/** بازمحاسبهٔ کامل زنجیرهٔ پیوسته + بازه‌ها + وضعیت چرخه‌ها — قلب سازگاری داده
 *  داخل تراکنش فراخوانی می‌شود؛ در صورت ناسازگاری throw می‌کند (rollback) */
async function recomputeSession(tx: Tx, sessionId: string): Promise<void> {
  const session = await tx.studySession.findUnique({
    where: { id: sessionId },
    select: { timingMethod: true, activityId: true },
  })
  if (!session) throw new AppError('SESSION_NOT_FOUND', 'جلسه زمان‌سنجی یافت نشد.', 404)

  const elements = await tx.workElement.findMany({
    where: { activityId: session.activityId },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: { id: true },
  })
  const elementIds = elements.map((e) => e.id)

  const cycles = await tx.cycleObservation.findMany({
    where: { sessionId },
    orderBy: { cycleNo: 'asc' },
    include: { observations: { include: { workElement: { select: { sortOrder: true } } } } },
  })

  // ۱) بازه‌ها: اعتبارسنجی + مدت — FR-10
  for (const cycle of cycles) {
    for (const o of cycle.observations) {
      const hasStart = o.startOffset !== null
      const hasEnd = o.endOffset !== null
      if (hasStart && hasEnd) {
        validateInterval({ startOffset: o.startOffset as number, endOffset: o.endOffset as number })
        const derived = round12((o.endOffset as number) - (o.startOffset as number))
        if (o.derivedDuration !== derived) {
          await tx.elementObservation.update({ where: { id: o.id }, data: { derivedDuration: derived } })
          o.derivedDuration = derived
        }
      } else if (o.derivedDuration !== null && o.rawDuration === null && o.cumulativeReading === null) {
        // بازهٔ ناقص: مدت نامعتبر
        await tx.elementObservation.update({ where: { id: o.id }, data: { derivedDuration: null } })
        o.derivedDuration = null
      }
    }
  }

  // ۲) زنجیرهٔ پیوسته — FR-09: مدت = قرائت فعلی − قرائت قبلی همان خط زمانی
  if (session.timingMethod === 'CONTINUOUS') {
    const seq: { o: ElementObservation & { workElement: { sortOrder: number } }; cycleNo: number }[] = []
    for (const cycle of cycles) {
      for (const o of cycle.observations) {
        if (o.cumulativeReading !== null) {
          seq.push({ o: o as ElementObservation & { workElement: { sortOrder: number } }, cycleNo: cycle.cycleNo })
        }
      }
    }
    seq.sort((a, b) =>
      a.cycleNo !== b.cycleNo ? a.cycleNo - b.cycleNo : a.o.workElement.sortOrder - b.o.workElement.sortOrder
    )
    let prev = 0 // مبنای قرائت با شروع جلسه صفر است — FR-06
    for (const { o, cycleNo } of seq) {
      const reading = o.cumulativeReading as number
      if (reading < prev) {
        throw new AppError(
          'READING_GOING_BACK',
          `قرائت تجمعی در چرخه ${cycleNo} از قرائت قبلی (${prev}) کمتر است (${reading})؛ قرائت نزولی مجاز نیست. برای شروع مجدد، جلسه جدید ایجاد کنید.`,
          422,
          { workElementId: o.workElementId, cycleNo, code: 'READING_GOING_BACK', message: 'قرائت نزولی' } satisfies CellError
        )
      }
      const derived = round12(reading - prev)
      if (o.derivedDuration !== derived) {
        await tx.elementObservation.update({ where: { id: o.id }, data: { derivedDuration: derived } })
        o.derivedDuration = derived
      }
      prev = reading
    }
  } else {
    // روش برگشت به صفر: مدت = مقدار خام — FR-08
    for (const cycle of cycles) {
      for (const o of cycle.observations) {
        if (o.rawDuration !== null && o.derivedDuration !== o.rawDuration) {
          await tx.elementObservation.update({ where: { id: o.id }, data: { derivedDuration: o.rawDuration } })
          o.derivedDuration = o.rawDuration
        }
      }
    }
  }

  // ۳) وضعیت چرخه‌ها — isComplete = کمال داده (بدون توجه به خروج) — ۸.۲
  for (const cycle of cycles) {
    const ind = computeCycleIndicators(cycle.observations, elementIds)
    if (cycle.isComplete !== ind.complete) {
      await tx.cycleObservation.update({ where: { id: cycle.id }, data: { isComplete: ind.complete } })
    }
  }
}

/** اعمال تغییرات یک سلول روی مشاهده (absent=بدون تغییر / null=پاک / عدد=ثبت) */
async function applyCellToObservation(
  tx: Tx,
  cycle: CycleObservation & { observations: ElementObservation[] },
  cell: { workElementId: string; rawDuration?: number | null; cumulativeReading?: number | null; startOffset?: number | null; endOffset?: number | null },
  element: WorkElement,
  session: { timingMethod: string }
): Promise<void> {
  let obs = cycle.observations.find((o) => o.workElementId === cell.workElementId)
  const fields: Record<string, number | null | string> = {}
  if (cell.rawDuration !== undefined) fields.rawDuration = cell.rawDuration
  if (cell.cumulativeReading !== undefined) fields.cumulativeReading = cell.cumulativeReading
  if (cell.startOffset !== undefined) fields.startOffset = cell.startOffset
  if (cell.endOffset !== undefined) fields.endOffset = cell.endOffset

  // مقدار نهایی پس از اعمال تغییرات (غیبت = حفظ مقدار فعلی / null = پاک)
  const merged = {
    rawDuration: cell.rawDuration !== undefined ? cell.rawDuration : (obs?.rawDuration ?? null),
    cumulativeReading: cell.cumulativeReading !== undefined ? cell.cumulativeReading : (obs?.cumulativeReading ?? null),
    startOffset: cell.startOffset !== undefined ? cell.startOffset : (obs?.startOffset ?? null),
    endOffset: cell.endOffset !== undefined ? cell.endOffset : (obs?.endOffset ?? null),
  }

  // تعیین خط زمانی متناسب با نوع دادهٔ نهایی — FR-10
  const willHaveInterval = merged.startOffset !== null || merged.endOffset !== null
  const willHaveReading = merged.cumulativeReading !== null

  if (!obs && Object.keys(fields).length === 0) return

  if (!obs) {
    const laneId = willHaveInterval
      ? await getOrCreateLane(tx, cycle.id, laneTypeForElement(element.elementType))
      : willHaveReading && session.timingMethod === 'CONTINUOUS'
        ? await getOrCreateLane(tx, cycle.id, 'OPERATOR')
        : null
    obs = await tx.elementObservation.create({
      data: {
        cycleId: cycle.id,
        workElementId: cell.workElementId,
        laneId,
        ...fields,
      },
    })
    cycle.observations.push(obs)
  } else {
    const noDataAtAll =
      merged.rawDuration === null &&
      merged.cumulativeReading === null &&
      merged.startOffset === null &&
      merged.endOffset === null
    const laneId = noDataAtAll
      ? null
      : willHaveInterval
        ? await getOrCreateLane(tx, cycle.id, laneTypeForElement(element.elementType))
        : willHaveReading && session.timingMethod === 'CONTINUOUS'
          ? await getOrCreateLane(tx, cycle.id, 'OPERATOR')
          : obs.laneId
    await tx.elementObservation.update({
      where: { id: obs.id },
      data: { ...fields, laneId },
    })
    Object.assign(obs, fields, { laneId })
  }
}

/** اعتبارسنجی ساختار سلول‌ها نسبت به روش جلسه — خطای سلولی با علت دقیق */
function validateCellsAgainstMethod(
  cells: CellsPutInput['cells'],
  elements: WorkElement[],
  method: string,
  existingByElement: Map<string, ElementObservation>
): CellError[] {
  const errors: CellError[] = []
  const elementById = new Map(elements.map((e) => [e.id, e]))
  for (const cell of cells) {
    const el = elementById.get(cell.workElementId)
    if (!el) {
      errors.push({ workElementId: cell.workElementId, code: 'ELEMENT_NOT_FOUND', message: 'عنصر کاری متعلق به فعالیت این جلسه نیست.' })
      continue
    }
    const existing = existingByElement.get(cell.workElementId)
    // مقدار نهایی پس از اعمال تغییرات (غیبت = حفظ / null = پاک)
    const raw = cell.rawDuration !== undefined ? cell.rawDuration : (existing?.rawDuration ?? null)
    const reading = cell.cumulativeReading !== undefined ? cell.cumulativeReading : (existing?.cumulativeReading ?? null)
    const start = cell.startOffset !== undefined ? cell.startOffset : (existing?.startOffset ?? null)
    const end = cell.endOffset !== undefined ? cell.endOffset : (existing?.endOffset ?? null)

    if (raw !== null && reading !== null) {
      errors.push({ workElementId: el.id, code: 'MIXED_ENTRY', message: 'یک سلول نمی‌تواند هم‌زمان مقدار خام و قرائت تجمعی داشته باشد.' })
    }
    if ((raw !== null || reading !== null) && (start !== null || end !== null)) {
      errors.push({ workElementId: el.id, code: 'MIXED_ENTRY', message: 'یک سلول یا ترتیبی است (یک عدد) یا بازه‌ای (شروع/پایان)؛ ترکیب هر دو مجاز نیست.' })
    }
    if (method === 'CONTINUOUS' && cell.rawDuration !== undefined && cell.rawDuration !== null) {
      errors.push({ workElementId: el.id, code: 'WRONG_METHOD_FIELD', message: 'در جلسهٔ پیوسته، قرائت تجمعی ثبت می‌شود نه مدت مستقیم.' })
    }
    if (method === 'SNAPBACK' && cell.cumulativeReading !== undefined && cell.cumulativeReading !== null) {
      errors.push({ workElementId: el.id, code: 'WRONG_METHOD_FIELD', message: 'در جلسهٔ برگشت به صفر، مدت مستقیم ثبت می‌شود نه قرائت تجمعی.' })
    }
  }
  return errors
}

// ═══════════════ DTO ساز ═══════════════

async function buildSessionDetail(sessionId: string): Promise<SessionDetailDto> {
  const session = await loadSessionContext(sessionId)
  const [elements, cyclesRaw, activityValidCycles] = await Promise.all([
    loadActivityElements(session.activityId),
    db.cycleObservation.findMany({
      where: { sessionId },
      orderBy: { cycleNo: 'asc' },
      include: {
        observations: {
          include: { lane: { select: { laneType: true } } },
        },
      },
    }),
    db.cycleObservation.count({
      where: {
        isComplete: true,
        session: { activityId: session.activityId },
        observations: { none: { validityStatus: { in: ['EXCLUDED', 'INVALID'] } } },
      },
    }),
  ])
  const elementIds = elements.map((e) => e.id)

  const perElement: Record<string, { calcCount: number; excludedCount: number; totalCount: number }> = {}
  for (const e of elements) perElement[e.id] = { calcCount: 0, excludedCount: 0, totalCount: 0 }

  const cycles: CycleDto[] = cyclesRaw.map((c) => {
    const ind = computeCycleIndicators(
      c.observations.map((o) => ({ ...o, workElement: { sortOrder: elementIds.indexOf(o.workElementId) } })),
      elementIds
    )
    for (const o of c.observations) {
      const pe = perElement[o.workElementId]
      if (!pe) continue
      pe.totalCount++
      if (o.validityStatus === 'EXCLUDED') pe.excludedCount++
      else if (o.derivedDuration !== null && o.validityStatus !== 'INVALID') pe.calcCount++
    }
    return {
      id: c.id,
      cycleNo: c.cycleNo,
      notes: c.notes,
      isComplete: c.isComplete,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
      elapsed: ind.elapsed,
      elapsedExcludesSequential: ind.elapsedExcludesSequential,
      hasExcluded: ind.hasExcluded,
      hasSuspect: ind.hasSuspect,
      hasIncompleteInterval: ind.hasIncompleteInterval,
      observations: c.observations.map((o) => ({
        id: o.id,
        workElementId: o.workElementId,
        laneId: o.laneId,
        laneType: o.lane?.laneType ?? null,
        rawDuration: o.rawDuration,
        cumulativeReading: o.cumulativeReading,
        startOffset: o.startOffset,
        endOffset: o.endOffset,
        derivedDuration: o.derivedDuration,
        validityStatus: o.validityStatus,
        isUserExcluded: o.isUserExcluded,
        exclusionReason: o.exclusionReason,
        // جلسه ۲ — snapshot تشخیصی SUSPECT برای پنل تشخیص (§۱۲.۳)
        outlierScore: o.outlierScore,
        outlierRule: o.outlierRule,
        outlierSnapshot: o.outlierSnapshot ? safeJsonParse(o.outlierSnapshot) : null,
      })),
    }
  })

  return {
    session: {
      id: session.id,
      activityId: session.activityId,
      operatorId: session.operatorId,
      timingMethod: session.timingMethod as TimingMethod,
      status: session.status,
      notes: session.notes,
      startedAt: session.startedAt.toISOString(),
      endedAt: session.endedAt?.toISOString() ?? null,
      updatedAt: session.updatedAt.toISOString(),
    },
    activity: {
      id: session.activity.id,
      name: session.activity.name,
      stationName: session.activity.station.name,
      targetSampleCount: session.activity.targetSampleCount,
      projectId: session.activity.station.projectId,
    },
    operator: session.operator,
    elements: elements.map((e) => ({
      id: e.id,
      name: e.name,
      elementType: e.elementType,
      sortOrder: e.sortOrder,
      defaultEntry: defaultEntryFor(e.elementType),
    })),
    cycles,
    stats: {
      perElement,
      sessionCycles: cycles.length,
      sessionValidCycles: cycles.filter((c) => c.isComplete && !c.hasExcluded && !c.observations.some((o) => o.validityStatus === 'INVALID')).length,
      activityValidCycles,
      targetSampleCount: session.activity.targetSampleCount,
    },
  }
}

// ═══════════════ جلسات — FR-06 ═══════════════

export interface SessionListItem {
  id: string
  operatorId: string
  operatorName: string
  timingMethod: TimingMethod
  status: string
  notes: string | null
  startedAt: string
  endedAt: string | null
  cyclesCount: number
  validCyclesCount: number
}

export async function listSessions(activityId: string): Promise<SessionListItem[]> {
  const activity = await db.activity.findUnique({
    where: { id: activityId },
    select: { id: true },
  })
  if (!activity) throw new AppError('ACTIVITY_NOT_FOUND', 'فعالیت یافت نشد.', 404)

  const sessions = await db.studySession.findMany({
    where: { activityId },
    orderBy: { startedAt: 'desc' },
    include: {
      operator: { select: { displayName: true } },
      cycles: { select: { isComplete: true, observations: { select: { validityStatus: true } } } },
    },
  })

  return sessions.map((s) => ({
    id: s.id,
    operatorId: s.operatorId,
    operatorName: s.operator.displayName,
    timingMethod: s.timingMethod as TimingMethod,
    status: s.status,
    notes: s.notes,
    startedAt: s.startedAt.toISOString(),
    endedAt: s.endedAt?.toISOString() ?? null,
    cyclesCount: s.cycles.length,
    validCyclesCount: s.cycles.filter(
      (c) => c.isComplete && !c.observations.some((o) => o.validityStatus === 'EXCLUDED' || o.validityStatus === 'INVALID')
    ).length,
  }))
}

export async function createSession(activityId: string, input: SessionCreateInput) {
  const activity = await db.activity.findUnique({
    where: { id: activityId },
    select: { id: true, station: { select: { projectId: true } } },
  })
  if (!activity) throw new AppError('ACTIVITY_NOT_FOUND', 'فعالیت یافت نشد.', 404)

  const operator = await db.operator.findUnique({ where: { id: input.operatorId } })
  if (!operator) throw new AppError('OPERATOR_NOT_FOUND', 'اپراتور یافت نشد.', 404)
  if (operator.projectId !== activity.station.projectId) {
    throw new AppError('OPERATOR_PROJECT_MISMATCH', 'اپراتور متعلق به پروژهٔ این فعالیت نیست.', 422)
  }

  const elements = await loadActivityElements(activityId)
  if (elements.length === 0) {
    throw new AppError(
      'NO_ELEMENTS',
      'این فعالیت هنوز عنصر کاری ندارد؛ ابتدا عناصر کاری را در ساختار تولید تعریف کنید.',
      422
    )
  }

  const session = await db.studySession.create({
    data: {
      activityId,
      operatorId: input.operatorId,
      timingMethod: input.timingMethod,
      notes: input.notes ?? null,
    },
  })
  await recordAudit({
    entityType: 'StudySession',
    entityId: session.id,
    action: 'CREATE',
    entityName: `جلسه ${input.timingMethod === 'SNAPBACK' ? 'برگشت به صفر' : 'پیوسته'} — ${operator.displayName}`,
    after: { activityId, operatorId: input.operatorId, timingMethod: input.timingMethod },
    projectId: activity.station.projectId,
  })
  return session
}

export async function updateSession(sessionId: string, input: SessionUpdateInput) {
  const existing = await loadSessionContext(sessionId)
  if (input.expectedUpdatedAt) {
    const expected = new Date(input.expectedUpdatedAt).getTime()
    if (Math.abs(existing.updatedAt.getTime() - expected) > 1000) {
      throw new AppError('CONFLICT', 'این جلسه جای دیگری تغییر کرده؛ تازه‌سازی کنید.', 409)
    }
  }
  const data: Record<string, unknown> = {}
  if (input.notes !== undefined) data.notes = input.notes
  if (input.status !== undefined) {
    data.status = input.status
    data.endedAt = input.status === 'CLOSED' ? new Date() : null
  }
  const updated = await db.studySession.update({ where: { id: sessionId }, data })
  await recordAudit({
    entityType: 'StudySession',
    entityId: sessionId,
    action: 'UPDATE',
    entityName: `جلسهٔ ${existing.operator.displayName}`,
    before: { notes: existing.notes, status: existing.status },
    after: { notes: updated.notes, status: updated.status },
    projectId: existing.activity.station.projectId,
  })
  return updated
}

export async function getSessionDependencyCounts(sessionId: string) {
  const session = await loadSessionContext(sessionId)
  const [cycles, observations] = await Promise.all([
    db.cycleObservation.count({ where: { sessionId } }),
    db.elementObservation.count({ where: { cycle: { sessionId } } }),
  ])
  return { session, counts: { cycles, observations } }
}

export async function deleteSession(sessionId: string) {
  const { session, counts } = await getSessionDependencyCounts(sessionId)
  const cycleIds = (
    await db.cycleObservation.findMany({ where: { sessionId }, select: { id: true } })
  ).map((c) => c.id)
  const laneIds = cycleIds.length
    ? (await db.timelineLane.findMany({ where: { cycleId: { in: cycleIds } }, select: { id: true } })).map((l) => l.id)
    : []
  const obsIds = cycleIds.length
    ? (await db.elementObservation.findMany({ where: { cycleId: { in: cycleIds } }, select: { id: true } })).map((o) => o.id)
    : []

  await db.$transaction(async (tx) => {
    await markDeleted(tx, 'CycleObservation', cycleIds)
    await markDeleted(tx, 'TimelineLane', laneIds)
    await markDeleted(tx, 'ElementObservation', obsIds)
    await markDeleted(tx, 'StudySession', [sessionId])
    await tx.studySession.delete({ where: { id: sessionId } })
  })
  // حذف جلسه = حذف مشاهدات → نتایج snapshot قبلی نیازمند محاسبه مجدد — FR-27
  await markProjectCalculationsStale(session.activity.station.projectId)
  await recordAudit({
    entityType: 'StudySession',
    entityId: sessionId,
    action: 'DELETE',
    entityName: `جلسهٔ ${session.operator.displayName}`,
    projectId: session.activity.station.projectId,
  })
  return counts
}

// ═══════════════ چرخه‌ها — FR-07 ═══════════════

export async function addCycles(sessionId: string, input: CyclesAddInput) {
  const session = await loadSessionContext(sessionId)
  assertSessionOpen(session)

  const created: { id: string; cycleNo: number }[] = []
  await db.$transaction(async (tx) => {
    const maxRow = await tx.cycleObservation.findFirst({
      where: { sessionId },
      orderBy: { cycleNo: 'desc' },
      select: { cycleNo: true },
    })
    let nextNo = (maxRow?.cycleNo ?? 0) + 1
    const taken = new Set(
      (
        await tx.cycleObservation.findMany({ where: { sessionId }, select: { cycleNo: true } })
      ).map((c) => c.cycleNo)
    )

    const entries: {
      cycleNo: number
      notes?: string | null
      observations: NonNullable<CyclesAddInput['withData']>[number]['observations']
    }[] = []
    if (input.withData && input.withData.length > 0) {
      for (const wd of input.withData) {
        // شمارهٔ اصلی اگر آزاد باشد؛ وگرنه در انتها — مسیر بازگردانی Undo
        const no = !taken.has(wd.cycleNo) ? wd.cycleNo : nextNo++
        taken.add(no)
        if (no >= nextNo) nextNo = no + 1
        entries.push({ cycleNo: no, notes: wd.notes, observations: wd.observations })
      }
    } else {
      for (let i = 0; i < (input.count ?? 1); i++) {
        entries.push({ cycleNo: nextNo++, observations: [] })
      }
    }

    for (const entry of entries) {
      const cycle = await tx.cycleObservation.create({
        data: { sessionId, cycleNo: entry.cycleNo, notes: entry.notes ?? null },
      })
      created.push({ id: cycle.id, cycleNo: cycle.cycleNo })

      if (entry.observations && entry.observations.length > 0) {
        const elements = await tx.workElement.findMany({ where: { activityId: session.activityId } })
        const elementById = new Map(elements.map((e) => [e.id, e]))
        const cycleWithObs = { ...cycle, observations: [] as ElementObservation[] }
        for (const op of entry.observations) {
          const el = elementById.get(op.workElementId)
          if (!el) continue
          await applyCellToObservation(
            tx,
            cycleWithObs as CycleObservation & { observations: ElementObservation[] },
            {
              workElementId: op.workElementId,
              rawDuration: op.rawDuration ?? undefined,
              cumulativeReading: op.cumulativeReading ?? undefined,
              startOffset: op.startOffset ?? undefined,
              endOffset: op.endOffset ?? undefined,
            },
            el,
            session
          )
          if (op.validityStatus) {
            await tx.elementObservation.updateMany({
              where: { cycleId: cycle.id, workElementId: op.workElementId },
              data: {
                validityStatus: op.validityStatus,
                isUserExcluded: op.validityStatus === 'EXCLUDED',
                exclusionReason: op.exclusionReason ?? null,
              },
            })
          }
        }
      }
    }

    await recomputeSession(tx, sessionId)
  })

  if (input.withData && input.withData.length > 0) {
    // بازگردانی داده → بازمحاسبه پرچم‌ها + STALE — FR-18/27
    await markProjectCalculationsStale(session.activity.station.projectId)
    await refreshOutliersForActivity(session.activityId)
    await recordAudit({
      entityType: 'CycleObservation',
      entityId: sessionId,
      action: 'RESTORE',
      entityName: 'بازگردانی چرخه‌های حذف‌شده (Undo)',
      after: { count: created.length },
      projectId: session.activity.station.projectId,
    })
  }
  return created
}

export async function deleteCycle(cycleId: string) {
  const cycle = await db.cycleObservation.findUnique({
    where: { id: cycleId },
    include: { session: { include: { activity: { select: { station: { select: { projectId: true } } } } } } },
  })
  if (!cycle) throw new AppError('CYCLE_NOT_FOUND', 'چرخه یافت نشد.', 404)
  assertSessionOpen(cycle.session)

  // دادهٔ حذف‌شده برای Undo برگردانده می‌شود — FR-07
  const observations = await db.elementObservation.findMany({ where: { cycleId } })
  const removedData = {
    cycle: {
      cycleNo: cycle.cycleNo,
      notes: cycle.notes,
      isComplete: cycle.isComplete,
      observations: observations.map((o) => ({
        workElementId: o.workElementId,
        rawDuration: o.rawDuration,
        cumulativeReading: o.cumulativeReading,
        startOffset: o.startOffset,
        endOffset: o.endOffset,
        validityStatus: o.validityStatus,
        exclusionReason: o.exclusionReason,
      })),
    },
  }

  const laneIds = (await db.timelineLane.findMany({ where: { cycleId }, select: { id: true } })).map((l) => l.id)
  await db.$transaction(async (tx) => {
    await markDeleted(tx, 'ElementObservation', observations.map((o) => o.id))
    await markDeleted(tx, 'TimelineLane', laneIds)
    await markDeleted(tx, 'CycleObservation', [cycleId])
    await tx.cycleObservation.delete({ where: { id: cycleId } })
    await recomputeSession(tx, cycle.sessionId)
  })
  // حذف چرخه → مبنای آماری عناصر تغییر می‌کند — FR-18/27
  await markProjectCalculationsStale(cycle.session.activity.station.projectId)
  for (const eid of new Set(observations.map((o) => o.workElementId))) {
    await refreshOutliersForElement(eid)
  }
  await recordAudit({
    entityType: 'CycleObservation',
    entityId: cycleId,
    action: 'DELETE',
    entityName: `چرخهٔ ${cycle.cycleNo}`,
    projectId: cycle.session.activity.station.projectId,
  })
  return { removedData, sessionId: cycle.sessionId }
}

export async function updateCycle(cycleId: string, input: CycleUpdateInput) {
  const cycle = await db.cycleObservation.findUnique({
    where: { id: cycleId },
    include: { session: true },
  })
  if (!cycle) throw new AppError('CYCLE_NOT_FOUND', 'چرخه یافت نشد.', 404)
  assertSessionOpen(cycle.session)
  if (input.expectedUpdatedAt) {
    const expected = new Date(input.expectedUpdatedAt).getTime()
    if (Math.abs(cycle.updatedAt.getTime() - expected) > 1000) {
      throw new AppError('CONFLICT', 'این چرخه جای دیگری تغییر کرده؛ تازه‌سازی کنید.', 409)
    }
  }
  const data: Record<string, unknown> = {}
  if (input.notes !== undefined) data.notes = input.notes
  const updated = await db.cycleObservation.update({ where: { id: cycleId }, data })
  return {
    cycle: {
      id: updated.id,
      cycleNo: updated.cycleNo,
      notes: updated.notes,
      updatedAt: updated.updatedAt.toISOString(),
    },
    sessionId: cycle.sessionId,
  }
}

function assertSessionOpen(session: StudySession) {
  if (session.status === 'CLOSED') {
    throw new AppError(
      'SESSION_CLOSED',
      'این جلسه بسته شده و فقط‌خواندنی است؛ برای ادامهٔ ثبت، جلسهٔ جدیدی با همان روش یا روش دیگر ایجاد کنید.',
      422
    )
  }
}

// ═══════════════ سلول‌ها — FR-07/08/09/10 ═══════════════

export async function updateCells(cycleId: string, input: CellsPutInput) {
  const cycle = await db.cycleObservation.findUnique({
    where: { id: cycleId },
    include: {
      session: { include: { activity: { include: { station: { select: { projectId: true } } } } } },
      observations: true,
    },
  })
  if (!cycle) throw new AppError('CYCLE_NOT_FOUND', 'چرخه یافت نشد.', 404)
  assertSessionOpen(cycle.session)

  const elements = await loadActivityElements(cycle.session.activityId)
  const existingByElement = new Map(cycle.observations.map((o) => [o.workElementId, o]))
  const cellErrors = validateCellsAgainstMethod(input.cells, elements, cycle.session.timingMethod, existingByElement)
  if (cellErrors.length > 0) {
    throw new AppError('CELL_VALIDATION_FAILED', 'برخی سلول‌ها معتبر نیستند.', 422, { cellErrors })
  }

  const elementById = new Map(elements.map((e) => [e.id, e]))
  const warnings: string[] = []
  const touchedElementIds = input.cells.map((c) => c.workElementId)
  await db.$transaction(async (tx) => {
    for (const cell of input.cells) {
      const el = elementById.get(cell.workElementId)
      if (!el) continue
      await applyCellToObservation(tx, cycle, cell, el, cycle.session)
    }
    await recomputeSession(tx, cycle.sessionId)
  })

  // هشدار مدت صفر بر اساس مقدار نهایی محاسبه‌شده — ۸.۲
  // (مدت صفر هشدار است نه خطا؛ مثلاً قرائت برابر قرائت قبلی)
  const touched = await db.elementObservation.findMany({
    where: { cycleId, workElementId: { in: touchedElementIds } },
  })
  for (const o of touched) {
    if (o.derivedDuration === 0) {
      const el = elementById.get(o.workElementId)
      warnings.push(`مدت صفر برای «${el?.name ?? 'عنصر'}» ثبت شد؛ برای عنصر عادی معمولاً باید مثبت باشد.`)
    }
  }

  // تغییر داده خام → بازمحاسبه پرچم‌های غیرعادی عناصر تغییر یافته + STALE — FR-18/27
  await markProjectCalculationsStale(cycle.session.activity.station.projectId)
  for (const eid of new Set(touchedElementIds)) {
    await refreshOutliersForElement(eid)
  }

  return { warnings, sessionId: cycle.sessionId }
}

// ═══════════════ Paste — FR-07 ═══════════════

export type PasteCellStatus = 'OK' | 'WARN' | 'ERROR' | 'SKIP'

export interface PasteCellResult {
  colIndex: number
  row: number
  cycleNo: number
  elementId: string | null
  /** مقادیر تجزیه‌شده */
  rawDuration?: number | null
  cumulativeReading?: number | null
  startOffset?: number | null
  endOffset?: number | null
  /** پیش‌نمایش مدت محاسبه‌شده (پیوسته/بازه) */
  previewDerived?: number | null
  status: PasteCellStatus
  message?: string
}

export interface PastePreviewResult {
  startCycleNo: number
  startColIndex: number
  rows: { cycleNo: number; isNew: boolean; cells: PasteCellResult[] }[]
  errorCount: number
  warnCount: number
  okCount: number
  skipCount: number
  createdCycles: number
}

/** تجزیهٔ متن یک سلول Paste — عدد تکی یا بازهٔ «شروع-پایان» */
function parsePasteCell(text: string): { kind: 'EMPTY' } | { kind: 'NUMBER'; value: number } | { kind: 'INTERVAL'; start: number; end: number } | { kind: 'INVALID' } {
  const t = text.trim()
  if (t === '' || t === '-' || t === '—' || t === '–') return { kind: 'EMPTY' }
  const normalized = t
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/٫|،/g, '.')
    .replace(/\u200c|\u200f|\u200e/g, '')
    .replace(/\s*تا\s*/, '-')
    .replace(/\s*-\s*/, '-')
    .replace(/\s*\.\.\s*/, '-')
    .replace(/\s*:\s*/, '-')
  const intervalMatch = normalized.match(/^(-?\d*\.?\d+)-(-?\d*\.?\d+)$/)
  if (intervalMatch) {
    const start = Number(intervalMatch[1])
    const end = Number(intervalMatch[2])
    if (Number.isFinite(start) && Number.isFinite(end)) return { kind: 'INTERVAL', start, end }
    return { kind: 'INVALID' }
  }
  const n = Number(normalized)
  if (Number.isFinite(n) && normalized.match(/^-?\d*\.?\d+$/)) return { kind: 'NUMBER', value: n }
  return { kind: 'INVALID' }
}

/** اعتبارسنجی و شبیه‌سازی کامل Paste بدون نوشتن */
async function evaluatePaste(sessionId: string, input: PasteInput): Promise<PastePreviewResult> {
  const session = await loadSessionContext(sessionId)
  const elements = await loadActivityElements(session.activityId)
  const existingCycles = await db.cycleObservation.findMany({
    where: { sessionId },
    orderBy: { cycleNo: 'asc' },
    include: { observations: true },
  })
  const maxCycleNo = existingCycles.length > 0 ? existingCycles[existingCycles.length - 1].cycleNo : 0

  if (input.startCycleNo > maxCycleNo + 1) {
    throw new AppError(
      'PASTE_TARGET_INVALID',
      `ردیف مبدأ (چرخهٔ ${input.startCycleNo}) معتبر نیست؛ Paste باید از یک چرخهٔ موجود یا بلافاصله بعد از آخرین چرخه (${maxCycleNo}) شروع شود.`,
      422
    )
  }

  const result: PastePreviewResult = {
    startCycleNo: input.startCycleNo,
    startColIndex: input.startColIndex,
    rows: [],
    errorCount: 0,
    warnCount: 0,
    okCount: 0,
    skipCount: 0,
    createdCycles: 0,
  }

  // مقادیر فعلی برای شبیه‌سازی زنجیرهٔ پیوسته
  const simReadings: { cycleNo: number; sortOrder: number; workElementId: string; reading: number; isPasted: boolean; row: number }[] = []
  if (session.timingMethod === 'CONTINUOUS') {
    for (const c of existingCycles) {
      for (const o of c.observations) {
        if (o.cumulativeReading !== null) {
          const el = elements.find((e) => e.id === o.workElementId)
          simReadings.push({
            cycleNo: c.cycleNo,
            sortOrder: el?.sortOrder ?? 0,
            workElementId: o.workElementId,
            reading: o.cumulativeReading,
            isPasted: false,
            row: -1,
          })
        }
      }
    }
  }

  const startNo = input.startCycleNo
  for (let r = 0; r < input.data.length; r++) {
    const cycleNo = startNo + r
    const isNew = cycleNo > maxCycleNo
    if (isNew) result.createdCycles++
    const rowCells: PasteCellResult[] = []

    for (let cIdx = 0; cIdx < input.data[r].length; cIdx++) {
      const colIndex = input.startColIndex + cIdx
      const text = input.data[r][cIdx]
      const element = elements[colIndex]
      const base: PasteCellResult = { colIndex, row: r, cycleNo, elementId: element?.id ?? null, status: 'SKIP' }

      if (!element) {
        base.status = 'ERROR'
        base.message = 'ستونی برای این داده وجود ندارد؛ تعداد عناصر کاری فعالیت کمتر است.'
        result.errorCount++
        rowCells.push(base)
        continue
      }

      const parsed = parsePasteCell(text)
      if (parsed.kind === 'EMPTY') {
        base.status = 'SKIP'
        base.message = 'خالی — بدون تغییر'
        result.skipCount++
        rowCells.push(base)
        continue
      }

      if (parsed.kind === 'INVALID') {
        base.status = 'ERROR'
        base.message = 'مقدار عددی معتبر نیست (ارقام فارسی یا لاتین و بازهٔ «شروع-پایان» پذیرفته می‌شود).'
        result.errorCount++
        rowCells.push(base)
        continue
      }

      if (parsed.kind === 'INTERVAL') {
        const { start, end } = parsed
        base.startOffset = start
        base.endOffset = end
        if (start < 0) {
          base.status = 'ERROR'
          base.message = 'شروع بازه نمی‌تواند منفی باشد؛ آفست‌ها نسبت به مبدأ چرخه‌اند.'
          result.errorCount++
        } else if (end <= start) {
          base.status = 'ERROR'
          base.message = `پایان بازه (${end}) باید بزرگ‌تر از شروع آن (${start}) باشد.`
          result.errorCount++
        } else {
          base.status = 'OK'
          base.previewDerived = round12(end - start)
          result.okCount++
        }
        rowCells.push(base)
        continue
      }

      // عدد تکی — وابسته به روش جلسه — FR-08/09
      const value = parsed.value
      if (value < 0) {
        base.status = 'ERROR'
        base.message = 'زمان منفی مجاز نیست.'
        result.errorCount++
        rowCells.push(base)
        continue
      }
      if (session.timingMethod === 'SNAPBACK') {
        base.rawDuration = value
        base.previewDerived = value
        if (value === 0) {
          base.status = 'WARN'
          base.message = 'مدت صفر ثبت می‌شود؛ برای عنصر عادی معمولاً باید مثبت باشد.'
          result.warnCount++
        } else {
          base.status = 'OK'
          result.okCount++
        }
      } else {
        base.cumulativeReading = value
        simReadings.push({ cycleNo, sortOrder: element.sortOrder, workElementId: element.id, reading: value, isPasted: true, row: r })
        base.status = 'OK'
        result.okCount++
        if (value === 0) {
          // قرائت صفر = مدت صفر (هشدار) — ۸.۲
          base.status = 'WARN'
          base.message = 'قرائت صفر ثبت می‌شود؛ مدت این عنصر صفر خواهد بود.'
          result.warnCount++
          result.okCount--
        }
      }
      rowCells.push(base)
    }
    result.rows.push({ cycleNo, isNew, cells: rowCells })
  }

  // شبیه‌سازی زنجیرهٔ پیوسته: قرائت نزولی → خطای سلولی دقیق — FR-09
  if (session.timingMethod === 'CONTINUOUS') {
    simReadings.sort((a, b) =>
      a.cycleNo !== b.cycleNo ? a.cycleNo - b.cycleNo : a.sortOrder - b.sortOrder
    )
    const brokenRows = new Map<number, { reading: number; prev: number }>()
    let prev = 0
    for (const sr of simReadings) {
      if (sr.reading < prev) {
        if (sr.isPasted) {
          brokenRows.set(sr.row, { reading: sr.reading, prev })
        } else {
          // قرائت موجود بعد از محدودهٔ Paste کوچک‌تر شده؛ مقصر بزرگ‌ترین قرائت Paste قبل از آن است
          const pastedBefore = simReadings.filter((x) => x.isPasted && (x.cycleNo < sr.cycleNo || (x.cycleNo === sr.cycleNo && x.sortOrder < sr.sortOrder)))
          const last = pastedBefore[pastedBefore.length - 1]
          if (last) brokenRows.set(last.row, { reading: last.reading, prev: -1 })
        }
      }
      prev = sr.reading
    }
    for (const [row, info] of brokenRows) {
      for (const rowEntry of result.rows) {
        for (const cell of rowEntry.cells) {
          if (cell.row === row && (cell.status === 'OK' || cell.status === 'WARN') && cell.cumulativeReading !== undefined) {
            const wasWarn = cell.status === 'WARN'
            cell.status = 'ERROR'
            cell.message =
              info.prev >= 0
                ? `قرائت (${cell.cumulativeReading}) از قرائت قبلی (${info.prev}) کمتر است؛ قرائت نزولی مجاز نیست.`
                : `این قرائت از قرائت‌های بعدی جلسه بزرگ‌تر است و زنجیره را می‌شکند.`
            if (wasWarn) result.warnCount--
            else result.okCount--
            result.errorCount++
          }
        }
      }
    }
    // پیش‌نمایش تفاضل‌ها
    const sorted = [...simReadings].sort((a, b) => (a.cycleNo !== b.cycleNo ? a.cycleNo - b.cycleNo : a.sortOrder - b.sortOrder))
    let chainPrev = 0
    for (const sr of sorted) {
      if (sr.isPasted && !brokenRows.has(sr.row)) {
        const cell = result.rows[sr.row]?.cells.find((c) => c.elementId === sr.workElementId)
        if (cell) cell.previewDerived = round12(sr.reading - chainPrev)
      }
      chainPrev = sr.reading
    }
  }

  return result
}

export async function pastePreview(sessionId: string, input: PasteInput): Promise<PastePreviewResult> {
  return evaluatePaste(sessionId, input)
}

export async function pasteCommit(sessionId: string, input: PasteInput) {
  const session = await loadSessionContext(sessionId)
  assertSessionOpen(session)

  const preview = await evaluatePaste(sessionId, input)

  // Paste نامعتبر ثبت ناقص و پنهانی ایجاد نمی‌کند — FR-07
  if (input.mode === 'ALL_OR_NOTHING' && preview.errorCount > 0) {
    throw new AppError(
      'PASTE_HAS_ERRORS',
      `برخی سلول‌ها نامعتبر هستند (${preview.errorCount} سلول). در حالت «همه یا هیچ» هیچ داده‌ای ثبت نشد؛ سلول‌های مشکل‌دار را اصلاح کنید یا حالت «رد سلول‌های مشکل‌دار» را انتخاب کنید.`,
      422,
      { preview }
    )
  }

  const elements = await loadActivityElements(session.activityId)
  const committedCells: PasteCellResult[] = []
  const skippedCells: PasteCellResult[] = []

  await db.$transaction(async (tx) => {
    // ایجاد چرخه‌های موردنیاز به ترتیب
    const existingNos = new Set(
      (await tx.cycleObservation.findMany({ where: { sessionId }, select: { cycleNo: true } })).map((c) => c.cycleNo)
    )
    const cycleIds = new Map<number, string>()
    for (const row of preview.rows) {
      if (!existingNos.has(row.cycleNo)) {
        const cycle = await tx.cycleObservation.create({ data: { sessionId, cycleNo: row.cycleNo } })
        cycleIds.set(row.cycleNo, cycle.id)
      } else {
        const cyc = await tx.cycleObservation.findUnique({ where: { sessionId_cycleNo: { sessionId, cycleNo: row.cycleNo } } })
        if (cyc) cycleIds.set(row.cycleNo, cyc.id)
      }
    }

    for (const row of preview.rows) {
      const cycleId = cycleIds.get(row.cycleNo)
      if (!cycleId) continue
      const cycle = await tx.cycleObservation.findUnique({ where: { id: cycleId }, include: { observations: true } })
      if (!cycle) continue
      for (const cell of row.cells) {
        if (cell.status === 'ERROR' || cell.status === 'SKIP') {
          if (cell.status === 'ERROR') skippedCells.push(cell)
          continue
        }
        const el = elements.find((e) => e.id === cell.elementId)
        if (!el) continue
        await applyCellToObservation(
          tx,
          cycle,
          {
            workElementId: el.id,
            rawDuration: cell.rawDuration ?? undefined,
            cumulativeReading: cell.cumulativeReading ?? undefined,
            startOffset: cell.startOffset ?? undefined,
            endOffset: cell.endOffset ?? undefined,
          },
          el,
          session
        )
        committedCells.push(cell)
      }
    }

    await recomputeSession(tx, sessionId)
  })

  await recordAudit({
    entityType: 'StudySession',
    entityId: sessionId,
    action: 'IMPORT',
    entityName: `Paste چندسلولی در جلسهٔ ${session.operator.displayName}`,
    after: { committed: committedCells.length, skipped: skippedCells.length, createdCycles: preview.createdCycles },
    projectId: session.activity.station.projectId,
  })

  // دادهٔ جدید → بازمحاسبه پرچم‌های غیرعادی کل فعالیت (زنجیره پیوسته ممکن است جابه‌جا شده باشد) — FR-18/27
  await markProjectCalculationsStale(session.activity.station.projectId)
  await refreshOutliersForActivity(session.activityId)

  return {
    committed: committedCells.length,
    skipped: skippedCells.length,
    createdCycles: preview.createdCycles,
    warnings: committedCells.filter((c) => c.status === 'WARN').map((c) => c.message ?? ''),
  }
}

// ═══════════════ وضعیت مشاهده — FR-11 ═══════════════

export async function setObservationValidity(observationId: string, input: ValidityPutInput) {
  const obs = await db.elementObservation.findUnique({
    where: { id: observationId },
    include: {
      cycle: {
        include: {
          session: { include: { activity: { select: { station: { select: { projectId: true } } } } } },
        },
      },
      workElement: { select: { name: true } },
    },
  })
  if (!obs) throw new AppError('OBSERVATION_NOT_FOUND', 'مشاهده یافت نشد.', 404)

  // داده خام هرگز تغییر نمی‌کند — فقط وضعیت محاسباتی — FR-11
  const updated = await db.elementObservation.update({
    where: { id: observationId },
    data: {
      validityStatus: input.validityStatus,
      isUserExcluded: input.validityStatus === 'EXCLUDED',
      exclusionReason: input.validityStatus === 'EXCLUDED' ? (input.exclusionReason ?? null) : null,
    },
  })

  // بازمحاسبهٔ وضعیت چرخه (چرخهٔ دارای خروج ممکن است از «معتبر» خارج شود)
  await db.$transaction(async (tx) => {
    await recomputeSession(tx, obs.cycle.sessionId)
  })

  // مبنای آماری عنصر تغییر کرد → بازمحاسبه پرچم‌های همان عنصر + STALE — FR-18/27
  // (تصمیم EXCLUDED کاربر هرگز بازنویسی نمی‌شود؛ خارج‌شده در مبنای تشخیص نیست)
  await markProjectCalculationsStale(obs.cycle.session.activity.station.projectId)
  await refreshOutliersForElement(obs.workElementId)

  return {
    observation: {
      id: updated.id,
      validityStatus: updated.validityStatus,
      isUserExcluded: updated.isUserExcluded,
      exclusionReason: updated.exclusionReason,
      rawDuration: updated.rawDuration, // خام دست‌نخورده — FR-11
    },
    sessionId: obs.cycle.sessionId,
  }
}

// ═══════════════ خواندن برگه ═══════════════

export { buildSessionDetail }
