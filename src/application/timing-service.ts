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
import { applyOverlapUpdatesInTx } from './overlap-service'
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
  /** v1.5.0 — نسخهٔ مجموعهٔ مقادیر هم‌پوشانی چرخه (کنترل هم‌زمانی زیرردیف‌ها) */
  overlapRevision: number
  /** v1.5.0 — مقادیر هم‌پوشانی این چرخه بر اساس relationId؛ نبود کلید = UNREVIEWED */
  overlaps: Record<string, { status: string; overlapDuration: number | null; version: number }>
}

/** v1.5.1 §۷ — رابطهٔ موازی فعال که «حداقل یکی» از دو endpoint آن در Activity جلسه است.
 *  رابطهٔ بین‌فعالیت در برگهٔ هر دو Activity (زیر endpoint حاضر) دیده می‌شود؛
 *  نام/فعالیت/ایستگاه هر دو endpoint از اطلاعات کامل پروژه batch دریافت می‌شود. */
export interface SessionRelationDto {
  relationId: string
  elementLowId: string
  elementHighId: string
  elementLowName: string
  elementHighName: string
  /** v1.5.1 §۷ — فعالیت/ایستگاه هر دو endpoint (برای برچسب بین‌فعالیت) */
  elementLowActivityId: string | null
  elementLowActivityName: string
  elementLowStationName: string
  elementHighActivityId: string | null
  elementHighActivityName: string
  elementHighStationName: string
  version: number
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
    sortOrder: number
    /** حالت پیش‌فرض ورود: ترتیبی (مدت/قرائت) یا بازه‌ای (شروع/پایان) — v1.5.0 مستقل از نوع عنصر */
    defaultEntry: 'SEQ' | 'INT'
    /** خط زمانی پیش‌فرض عنصر — v1.5.0 مستقل از نوع عنصر (داده تاریخی حفظ شده) */
    defaultLaneType: 'OPERATOR' | 'MACHINE'
  }[]
  /** v1.5.1 §۷ — روابط موازی فعال مرتبط با Activity جلسه (حداقل یک endpoint)؛ زیرردیف‌های برگه (§۵) */
  parallelRelations: SessionRelationDto[]
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

/** حالت ورود پیش‌فرض عنصر — v1.5.0: مفهوم فنی مستقل ( elementType legacy فقط برای مهاجرت) */
function defaultEntryFor(element: { defaultEntryMode: string }): 'SEQ' | 'INT' {
  return element.defaultEntryMode === 'INT' ? 'INT' : 'SEQ'
}

/** خط زمانی پیش‌فرض عنصر — FR-10 — v1.5.0: مستقل از نوع عنصر */
function laneTypeForElement(element: { defaultLaneType: string }): 'OPERATOR' | 'MACHINE' {
  return element.defaultLaneType === 'MACHINE' ? 'MACHINE' : 'OPERATOR'
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
    // v1.5.0: مشاهدهٔ دارای بازهٔ کامل، مدتش از بازه است؛ خام آن را بازنویسی نمی‌کند
    for (const cycle of cycles) {
      for (const o of cycle.observations) {
        if (o.startOffset !== null && o.endOffset !== null) continue
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
      ? await getOrCreateLane(tx, cycle.id, laneTypeForElement(element))
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
        ? await getOrCreateLane(tx, cycle.id, laneTypeForElement(element))
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
  const elements = await loadActivityElements(session.activityId)
  const elementIds = elements.map((e) => e.id)

  // v1.5.1 §۷ — روابط فعال که «حداقل یکی» از دو endpoint آن در Activity جاری است
  // به برگه ارسال می‌شوند (روابط بین‌فعالیت در برگهٔ هر دو Activity دیده می‌شوند) +
  // مقادیر چرخه‌های جلسه و اطلاعات کامل عناصر پروژه، همه به‌صورت batch (بدون N+1).
  const [cyclesRaw, activityValidCycles, relationsRaw, overlapsRaw, projectElementsRaw] = await Promise.all([
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
    elementIds.length > 0
      ? db.overlapRelation.findMany({
          where: {
            projectId: session.activity.station.projectId,
            isActive: true,
            OR: [{ elementLowId: { in: elementIds } }, { elementHighId: { in: elementIds } }],
          },
          orderBy: { createdAt: 'asc' },
        })
      : Promise.resolve([]),
    // §۱۰ — همهٔ مقادیر هم‌پوشانی چرخه‌های جلسه در یک کوئری (بدون N+1)
    db.observationOverlap.findMany({ where: { cycle: { sessionId } } }),
    // v1.5.1 §۷ — اطلاعات کامل عناصر پروژه برای نام/فعالیت/ایستگاه هر دو endpoint (batch)
    db.workElement.findMany({
      where: { activity: { station: { projectId: session.activity.station.projectId } } },
      select: {
        id: true,
        name: true,
        activity: { select: { id: true, name: true, station: { select: { id: true, name: true } } } },
      },
    }),
  ])

  const projectElementById = new Map(projectElementsRaw.map((e) => [e.id, e]))
  const parallelRelations: SessionRelationDto[] = relationsRaw.map((r) => {
    const lo = projectElementById.get(r.elementLowId)
    const hi = projectElementById.get(r.elementHighId)
    return {
      relationId: r.id,
      elementLowId: r.elementLowId,
      elementHighId: r.elementHighId,
      elementLowName: lo?.name ?? '؟',
      elementHighName: hi?.name ?? '؟',
      elementLowActivityId: lo?.activity.id ?? null,
      elementLowActivityName: lo?.activity.name ?? '؟',
      elementLowStationName: lo?.activity.station.name ?? '؟',
      elementHighActivityId: hi?.activity.id ?? null,
      elementHighActivityName: hi?.activity.name ?? '؟',
      elementHighStationName: hi?.activity.station.name ?? '؟',
      version: r.version,
    }
  })

  // مقادیر هم‌پوشانی بر اساس cycleId گروه‌بندی می‌شوند (§۱۰ — گروه‌بندی با relationId و cycleId)
  const overlapsByCycle = new Map<string, Record<string, { status: string; overlapDuration: number | null; version: number }>>()
  for (const ov of overlapsRaw) {
    let m = overlapsByCycle.get(ov.cycleId)
    if (!m) {
      m = {}
      overlapsByCycle.set(ov.cycleId, m)
    }
    m[ov.relationId] = { status: ov.status, overlapDuration: ov.overlapDuration, version: ov.version }
  }

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
      overlapRevision: c.overlapRevision,
      overlaps: overlapsByCycle.get(c.id) ?? {},
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
      sortOrder: e.sortOrder,
      defaultEntry: defaultEntryFor(e),
      defaultLaneType: laneTypeForElement(e),
    })),
    parallelRelations,
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
      overlaps?: Array<{ relationId: string; status: string; overlapDuration?: number | null; version?: number }>
      observations: NonNullable<CyclesAddInput['withData']>[number]['observations']
    }[] = []
    if (input.withData && input.withData.length > 0) {
      for (const wd of input.withData) {
        // شمارهٔ اصلی اگر آزاد باشد؛ وگرنه در انتها — مسیر بازگردانی Undo
        const no = !taken.has(wd.cycleNo) ? wd.cycleNo : nextNo++
        taken.add(no)
        if (no >= nextNo) nextNo = no + 1
        entries.push({ cycleNo: no, notes: wd.notes, observations: wd.observations, overlaps: wd.overlaps })
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

      // §۸ ممیزی جلسه ۲ — بازگردانی مقادیر هم‌پوشانی چرخهٔ حذف‌شده (Undo):
      // رکوردها با شناسهٔ چرخهٔ جدید بازسازی می‌شوند؛ relationId، status،
      // overlapDuration و version معتبر حفظ می‌شوند و مقادیر سایر چرخه‌ها
      // دست نمی‌خورد. رابطهٔ حذف‌شدهٔ کامل (فقط در حذف پروژه) نادیده گرفته می‌شود.
      if (entry.overlaps && entry.overlaps.length > 0) {
        for (const ov of entry.overlaps) {
          const rel = await tx.overlapRelation.findUnique({
            where: { id: ov.relationId },
            select: { id: true, isActive: true },
          })
          if (!rel) continue
          const normalized = ov.status === 'NO_OVERLAP' ? 0 : ov.status === 'UNREVIEWED' ? null : ov.overlapDuration ?? null
          await tx.observationOverlap.create({
            data: {
              relationId: ov.relationId,
              cycleId: cycle.id,
              status: ov.status,
              overlapDuration: normalized,
              ...(ov.version != null ? { version: ov.version } : {}),
            },
          })
        }
        // نسخهٔ مجموعهٔ مقادیر چرخهٔ جدید نیز جلو می‌رود (§۱۰)
        await tx.cycleObservation.update({
          where: { id: cycle.id },
          data: { overlapRevision: { increment: 1 } },
        })
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
  // §۸ ممیزی جلسه ۲ — مقادیر هم‌پوشانی چرخه نیز همراه داده حذف‌شده ذخیره و حذف می‌شوند
  const observations = await db.elementObservation.findMany({ where: { cycleId } })
  const overlaps = await db.observationOverlap.findMany({ where: { cycleId } })
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
      overlaps: overlaps.map((o) => ({
        relationId: o.relationId,
        status: o.status,
        overlapDuration: o.overlapDuration,
        version: o.version,
      })),
    },
  }

  const laneIds = (await db.timelineLane.findMany({ where: { cycleId }, select: { id: true } })).map((l) => l.id)
  await db.$transaction(async (tx) => {
    await markDeleted(tx, 'ElementObservation', observations.map((o) => o.id))
    await markDeleted(tx, 'TimelineLane', laneIds)
    // §۸ ممیزی جلسه ۲ — حذف صریح مقادیر هم‌پوشانی چرخه (بدون ردیف یتیم)
    await markDeleted(tx, 'ObservationOverlap', overlaps.map((o) => o.id))
    await tx.observationOverlap.deleteMany({ where: { cycleId } })
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

// ═══════════════ Paste — FR-07 — v1.5.0 محور جدید (§۸.۳) ═══════════════
// ردیف‌های دادهٔ Paste = ردیف‌های شبکهٔ برگه (عنصر اصلی + زیرردیف رابطهٔ موازی)
// ستون‌های داده = چرخه‌ها به ترتیب شماره. لنگر بر اساس شناسهٔ ردیف و شمارهٔ
// چرخه است (نه اندیس قدیمی). زیرردیف رابطه: خالی→بدون تغییر، ۰→NO_OVERLAP،
// مثبت→OVERLAP؛ مقایسه‌پذیری و تطابق با بازهٔ واقعی در Preview بررسی می‌شود.

export type PasteCellStatus = 'OK' | 'WARN' | 'ERROR' | 'SKIP'

export interface PasteCellResult {
  /** اندیس ستون داده (چرخه) — ۰-مبنا از startCycleNo */
  colIndex: number
  /** اندیس ردیف داده — ۰-مبنا از ردیف لنگر شبکه */
  row: number
  cycleNo: number
  isNew: boolean
  /** هدف ردیف اصلی عنصر */
  elementId: string | null
  /** هدف زیرردیف رابطهٔ موازی */
  relationId: string | null
  parentElementId: string | null
  otherElementId: string | null
  /** مقادیر تجزیه‌شدهٔ عنصر */
  rawDuration?: number | null
  cumulativeReading?: number | null
  startOffset?: number | null
  endOffset?: number | null
  /** مقدار هم‌پوشانی زیرردیف: ۰→NO_OVERLAP / مثبت→OVERLAP */
  overlapStatus?: 'UNREVIEWED' | 'NO_OVERLAP' | 'OVERLAP'
  overlapDuration?: number | null
  /** هم‌پوشانی محاسبه‌شده از بازهٔ واقعی — پیشنهاد §۵.۵ */
  computedOverlap?: number | null
  /** پیش‌نمایش مدت محاسبه‌شده (پیوسته/بازه) */
  previewDerived?: number | null
  status: PasteCellStatus
  message?: string
}

export interface PastePreviewRow {
  row: number
  kind: 'ELEMENT' | 'RELATION'
  elementId: string | null
  elementName: string | null
  relationId: string | null
  otherElementName: string | null
  cells: PasteCellResult[]
}

export interface PastePreviewResult {
  startCycleNo: number
  anchor: { elementId: string; relationId: string | null }
  rows: PastePreviewRow[]
  errorCount: number
  warnCount: number
  okCount: number
  skipCount: number
  createdCycles: number
}

/** مدل ردیف‌های شبکهٔ برگه — عنصر + زیرردیف روابط (§۵.۲) */
export interface GridModelRow {
  kind: 'ELEMENT' | 'RELATION'
  /** عنصر ردیف اصلی، یا عنصر والدِ زیرردیف رابطه */
  elementId: string
  elementName: string
  relationId: string | null
  otherElementId: string | null
  otherElementName: string | null
}

/** ساخت مدل ردیف‌های شبکه: عناصر به ترتیب sortOrder + زیرردیف روابط فعال
 *  مرتبط با این Activity زیر هر endpoint حاضر (به ترتیب عنصر مقصد) — §۵.۱/§۹.۱.
 *  v1.5.1 §۷ — روابط بین‌فعالیت نیز زیر endpoint حاضر در این Activity می‌آیند؛
 *  نام عنصر خارجی از اطلاعات کامل پروژه (batch) حل می‌شود. */
async function buildGridRows(activityId: string, projectId: string) {
  const elements = await loadActivityElements(activityId)
  const elementIds = elements.map((e) => e.id)
  const relations =
    elementIds.length > 0
      ? await db.overlapRelation.findMany({
          where: {
            projectId,
            isActive: true,
            OR: [{ elementLowId: { in: elementIds } }, { elementHighId: { in: elementIds } }],
          },
          orderBy: { createdAt: 'asc' },
        })
      : []
  const byId = new Map(elements.map((e) => [e.id, e]))
  // v1.5.1 §۷ — نام عناصر خارج از Activity جاری (endpoint مقابل رابطهٔ بین‌فعالیت) — batch
  const externalIds = [...new Set(relations.flatMap((r) => [r.elementLowId, r.elementHighId]).filter((id) => !byId.has(id)))]
  const external = externalIds.length > 0
    ? await db.workElement.findMany({ where: { id: { in: externalIds } }, select: { id: true, name: true } })
    : []
  const externalById = new Map(external.map((e) => [e.id, e]))
  const nameResolv = (id: string) => byId.get(id)?.name ?? externalById.get(id)?.name ?? '؟'
  const rows: GridModelRow[] = []
  for (const el of elements) {
    rows.push({ kind: 'ELEMENT', elementId: el.id, elementName: el.name, relationId: null, otherElementId: null, otherElementName: null })
    const rels = relations
      .filter((r) => r.elementLowId === el.id || r.elementHighId === el.id)
      .map((r) => {
        const otherId = r.elementLowId === el.id ? r.elementHighId : r.elementLowId
        // عناصر همین Activity بر اساس ترتیب ستون؛ عناصر خارجی پس از آن‌ها (پایدار)
        return { r, otherId, otherSort: byId.get(otherId)?.sortOrder ?? 10000, otherName: nameResolv(otherId) }
      })
      .sort((a, b) => a.otherSort - b.otherSort)
    for (const { r, otherId, otherName } of rels) {
      rows.push({ kind: 'RELATION', elementId: el.id, elementName: el.name, relationId: r.id, otherElementId: otherId, otherElementName: otherName })
    }
  }
  return { rows, relations }
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
  const projectId = session.activity.station.projectId
  const { rows: gridRows, relations } = await buildGridRows(session.activityId, projectId)
  const elements = await loadActivityElements(session.activityId)
  const relationById = new Map(relations.map((r) => [r.id, r]))
  const existingCycles = await db.cycleObservation.findMany({
    where: { sessionId },
    orderBy: { cycleNo: 'asc' },
    include: { observations: true },
  })
  const maxCycleNo = existingCycles.length > 0 ? existingCycles[existingCycles.length - 1].cycleNo : 0

  // §۸.۳ — لنگر بر اساس شناسهٔ ردیف (عنصر/رابطه) و شمارهٔ چرخه، نه اندیس
  const anchorIdx = input.startRelationId
    ? gridRows.findIndex(
        (g) => g.kind === 'RELATION' && g.relationId === input.startRelationId && g.elementId === input.startElementId,
      )
    : gridRows.findIndex((g) => g.kind === 'ELEMENT' && g.elementId === input.startElementId)
  if (anchorIdx < 0) {
    throw new AppError(
      'PASTE_TARGET_INVALID',
      'ردیف مبدأ Paste معتبر نیست؛ عنصر یا رابطهٔ انتخاب‌شده در این فعالیت یافت نشد.',
      422,
    )
  }
  if (input.startCycleNo > maxCycleNo + 1) {
    throw new AppError(
      'PASTE_TARGET_INVALID',
      `ستون مبدأ (چرخهٔ ${input.startCycleNo}) معتبر نیست؛ Paste باید از یک چرخهٔ موجود یا بلافاصله بعد از آخرین چرخه (${maxCycleNo}) شروع شود.`,
      422,
    )
  }

  // مشاهدات هر چرخهٔ موجود برای مقایسه‌پذیری و بازهٔ واقعی زیرردیف‌ها
  const obsByCycleNo = new Map<number, typeof existingCycles[number]['observations']>()
  for (const c of existingCycles) obsByCycleNo.set(c.cycleNo, c.observations)

  const result: PastePreviewResult = {
    startCycleNo: input.startCycleNo,
    anchor: { elementId: input.startElementId, relationId: input.startRelationId ?? null },
    rows: [],
    errorCount: 0,
    warnCount: 0,
    okCount: 0,
    skipCount: 0,
    createdCycles: 0,
  }

  // مقادیر فعلی برای شبیه‌سازی زنجیرهٔ پیوسته — مختصات (row, col) سلول Paste
  const simReadings: { cycleNo: number; sortOrder: number; workElementId: string; reading: number; isPasted: boolean; pRow: number; pCol: number }[] = []
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
            pRow: -1,
            pCol: -1,
          })
        }
      }
    }
  }

  for (let r = 0; r < input.data.length; r++) {
    const grow = gridRows[anchorIdx + r]
    const rowCells: PasteCellResult[] = []
    const previewRow: PastePreviewRow = {
      row: r,
      kind: grow?.kind ?? 'ELEMENT',
      elementId: grow?.elementId ?? null,
      elementName: grow?.elementName ?? null,
      relationId: grow?.relationId ?? null,
      otherElementName: grow?.otherElementName ?? null,
      cells: [],
    }

    for (let cIdx = 0; cIdx < input.data[r].length; cIdx++) {
      const cycleNo = input.startCycleNo + cIdx
      const isNew = cycleNo > maxCycleNo
      const text = input.data[r][cIdx]
      const base: PasteCellResult = {
        colIndex: cIdx,
        row: r,
        cycleNo,
        isNew,
        elementId: grow?.kind === 'ELEMENT' ? grow.elementId : null,
        relationId: grow?.kind === 'RELATION' ? grow.relationId : null,
        parentElementId: grow?.elementId ?? null,
        otherElementId: grow?.otherElementId ?? null,
        status: 'SKIP',
      }

      if (!grow) {
        base.status = 'ERROR'
        base.message = 'ردیفی برای این داده وجود ندارد؛ تعداد ردیف‌های شبکه (عناصر و زیرردیف‌ها) کمتر است.'
        result.errorCount++
        rowCells.push(base)
        continue
      }

      if (grow.kind === 'RELATION') {
        // ── زیرردیف رابطهٔ موازی — §۸.۳: خالی/صفر/مثبت ──
        const parsed = parsePasteCell(text)
        if (parsed.kind === 'EMPTY') {
          base.status = 'SKIP'
          base.message = 'خالی — بدون تغییر'
          result.skipCount++
          rowCells.push(base)
          continue
        }
        if (parsed.kind === 'INTERVAL') {
          base.status = 'ERROR'
          base.message = 'زیرردیف هم‌پوشانی فقط یک عدد می‌پذیرد: خالی (بررسی‌نشده)، صفر (بدون هم‌پوشانی) یا مقدار مثبت.'
          result.errorCount++
          rowCells.push(base)
          continue
        }
        if (parsed.kind === 'INVALID') {
          base.status = 'ERROR'
          base.message = 'مقدار عددی معتبر نیست (ارقام فارسی یا لاتین).'
          result.errorCount++
          rowCells.push(base)
          continue
        }
        if (parsed.value < 0) {
          base.status = 'ERROR'
          base.message = 'مقدار هم‌پوشانی منفی مجاز نیست.'
          result.errorCount++
          rowCells.push(base)
          continue
        }
        if (isNew) {
          base.status = 'ERROR'
          base.message = 'چرخهٔ جدید هنوز مشاهده‌ای ندارد؛ ابتدا زمان عناصر را ثبت کنید تا این زوج قابل‌مقایسه شود.'
          result.errorCount++
          rowCells.push(base)
          continue
        }
        const rel = relationById.get(grow.relationId!)
        const obsList = obsByCycleNo.get(cycleNo) ?? []
        const byEl = new Map(obsList.map((o) => [o.workElementId, o]))
        const oLow = rel ? byEl.get(rel.elementLowId) : undefined
        const oHigh = rel ? byEl.get(rel.elementHighId) : undefined
        const reasons: string[] = []
        const lowName = rel && grow.elementId === rel.elementLowId ? grow.elementName : grow.otherElementName
        const highName = rel && grow.elementId === rel.elementHighId ? grow.elementName : grow.otherElementName
        if (rel) {
          if (!oLow) reasons.push(`«${lowName}» در این چرخه مشاهده‌ای ندارد`)
          else if (!((oLow.startOffset !== null && oLow.endOffset !== null) || (oLow.derivedDuration ?? oLow.rawDuration) !== null))
            reasons.push(`«${lowName}» در این چرخه مدت یا بازهٔ قابل‌مقایسه ندارد`)
          if (!oHigh) reasons.push(`«${highName}» در این چرخه مشاهده‌ای ندارد`)
          else if (!((oHigh.startOffset !== null && oHigh.endOffset !== null) || (oHigh.derivedDuration ?? oHigh.rawDuration) !== null))
            reasons.push(`«${highName}» در این چرخه مدت یا بازهٔ قابل‌مقایسه ندارد`)
        }
        if (reasons.length > 0) {
          base.status = 'ERROR'
          base.message = `در این چرخه قابل‌مقایسه نیست: ${reasons.join('؛ ')}`
          result.errorCount++
          rowCells.push(base)
          continue
        }
        // بازهٔ واقعی — §۵.۵: O(A,B) = max(0, min(E_A,E_B) − max(S_A,S_B))
        if (oLow && oHigh && oLow.startOffset !== null && oLow.endOffset !== null && oHigh.startOffset !== null && oHigh.endOffset !== null) {
          const computed = round12(Math.max(0, Math.min(oLow.endOffset, oHigh.endOffset) - Math.max(oLow.startOffset, oHigh.startOffset)))
          base.computedOverlap = computed
          if (parsed.value === 0 && computed > 1e-9) {
            base.status = 'ERROR'
            base.message = `بازهٔ واقعی این چرخه هم‌پوشانی ${computed} دارد؛ ثبت «بدون هم‌پوشانی» با بازهٔ واقعی نمی‌خواند.`
            result.errorCount++
            rowCells.push(base)
            continue
          }
          if (parsed.value > 0 && Math.abs(parsed.value - computed) > 1e-6) {
            base.status = 'ERROR'
            base.message = `مقدار واردشده (${parsed.value}) با هم‌پوشانی بازهٔ واقعی (${computed}) نمی‌خواند.`
            result.errorCount++
            rowCells.push(base)
            continue
          }
        }
        // سقف مدت عنصر کوتاه‌تر — §۵.۵
        const dLow = oLow ? (oLow.derivedDuration ?? oLow.rawDuration) : null
        const dHigh = oHigh ? (oHigh.derivedDuration ?? oHigh.rawDuration) : null
        if (parsed.value > 0 && dLow !== null && dHigh !== null && parsed.value > Math.min(dLow, dHigh) + 1e-9) {
          base.status = 'ERROR'
          base.message = `مقدار (${parsed.value}) از مدت عنصر کوتاه‌تر (${Math.min(dLow, dHigh)}) بیشتر است.`
          result.errorCount++
          rowCells.push(base)
          continue
        }
        if (parsed.value === 0) {
          base.overlapStatus = 'NO_OVERLAP'
          base.overlapDuration = 0
          base.status = 'OK'
          result.okCount++
        } else {
          base.overlapStatus = 'OVERLAP'
          base.overlapDuration = parsed.value
          base.status = 'OK'
          result.okCount++
        }
        rowCells.push(base)
        continue
      }

      // ── ردیف اصلی عنصر — منطق FR-07/08/09 ──
      const element = elements.find((e) => e.id === grow.elementId)
      if (!element) {
        base.status = 'ERROR'
        base.message = 'عنصر کاری یافت نشد.'
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
        simReadings.push({ cycleNo, sortOrder: element.sortOrder, workElementId: element.id, reading: value, isPasted: true, pRow: r, pCol: cIdx })
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
    previewRow.cells = rowCells
    result.rows.push(previewRow)
  }

  // شمارش چرخه‌های جدید (ستون‌های فراتر از آخرین چرخه) — §۸.۳
  const width = input.data.reduce((m, row) => Math.max(m, row.length), 0)
  for (let c = 0; c < width; c++) {
    if (input.startCycleNo + c > maxCycleNo) result.createdCycles++
  }

  // شبیه‌سازی زنجیرهٔ پیوسته: قرائت نزولی → خطای سلولی دقیق — FR-09
  if (session.timingMethod === 'CONTINUOUS') {
    simReadings.sort((a, b) =>
      a.cycleNo !== b.cycleNo ? a.cycleNo - b.cycleNo : a.sortOrder - b.sortOrder
    )
    const brokenCells = new Map<string, { reading: number; prev: number }>()
    let prev = 0
    for (const sr of simReadings) {
      if (sr.reading < prev) {
        if (sr.isPasted) {
          brokenCells.set(`${sr.pRow}:${sr.pCol}`, { reading: sr.reading, prev })
        } else {
          // قرائت موجود بعد از محدودهٔ Paste کوچک‌تر شده؛ مقصر بزرگ‌ترین قرائت Paste قبل از آن است
          const pastedBefore = simReadings.filter((x) => x.isPasted && (x.cycleNo < sr.cycleNo || (x.cycleNo === sr.cycleNo && x.sortOrder < sr.sortOrder)))
          const last = pastedBefore[pastedBefore.length - 1]
          if (last) brokenCells.set(`${last.pRow}:${last.pCol}`, { reading: last.reading, prev: -1 })
        }
      }
      prev = sr.reading
    }
    for (const [key, info] of brokenCells) {
      for (const rowEntry of result.rows) {
        for (const cell of rowEntry.cells) {
          if (`${cell.row}:${cell.colIndex}` === key && (cell.status === 'OK' || cell.status === 'WARN') && cell.cumulativeReading !== undefined) {
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
      if (sr.isPasted && !brokenCells.has(`${sr.pRow}:${sr.pCol}`)) {
        const cell = result.rows[sr.pRow]?.cells.find((c) => c.colIndex === sr.pCol && c.elementId === sr.workElementId)
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
  const projectId = session.activity.station.projectId

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
  const elementById = new Map(elements.map((e) => [e.id, e]))
  const committedCells: PasteCellResult[] = []
  const skippedCells: PasteCellResult[] = []
  const overlapPendingAudits: Array<Parameters<typeof recordAudit>[0]> = []

  await db.$transaction(async (tx) => {
    // ایجاد چرخه‌های موردنیاز — ستون‌های Paste (چرخه‌ها) به ترتیب
    const existingNos = new Set(
      (await tx.cycleObservation.findMany({ where: { sessionId }, select: { cycleNo: true } })).map((c) => c.cycleNo)
    )
    const cycleIds = new Map<number, string>()
    const width = input.data.reduce((m, row) => Math.max(m, row.length), 0)
    for (let c = 0; c < width; c++) {
      const cycleNo = input.startCycleNo + c
      if (!existingNos.has(cycleNo)) {
        const cycle = await tx.cycleObservation.create({ data: { sessionId, cycleNo } })
        cycleIds.set(cycleNo, cycle.id)
      } else {
        const cyc = await tx.cycleObservation.findUnique({ where: { sessionId_cycleNo: { sessionId, cycleNo } } })
        if (cyc) cycleIds.set(cycleNo, cyc.id)
      }
    }

    // کش چرخه‌ها برای اعمال سلول‌های عنصر (وضعیت in-memory به‌روز می‌شود)
    const cycleCache = new Map<number, CycleObservation & { observations: ElementObservation[] }>()
    const cycleOf = async (cycleNo: number): Promise<(CycleObservation & { observations: ElementObservation[] }) | null> => {
      const cached = cycleCache.get(cycleNo)
      if (cached) return cached
      const id = cycleIds.get(cycleNo)
      if (!id) return null
      const cyc = await tx.cycleObservation.findUnique({ where: { id }, include: { observations: true } })
      if (cyc) cycleCache.set(cycleNo, cyc)
      return cyc
    }

    // ۱) اعمال سلول‌های ردیف‌های عنصر — FR-07
    for (const prow of preview.rows) {
      if (prow.kind !== 'ELEMENT') continue
      for (const cell of prow.cells) {
        if (cell.status === 'ERROR' || cell.status === 'SKIP') {
          if (cell.status === 'ERROR') skippedCells.push(cell)
          continue
        }
        const el = cell.elementId ? elementById.get(cell.elementId) : undefined
        if (!el) continue
        const cycle = await cycleOf(cell.cycleNo)
        if (!cycle) continue
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

    // ۲) اعمال سلول‌های زیرردیف‌های رابطه — §۸.۳/§۵.۵
    //    پس از اعمال سلول‌های عنصر در همان تراکنش؛ اعتبارسنجی کامل
    //    (مقایسه‌پذیری + محلی + سه‌تایی + solver + بازهٔ واقعی) روی
    //    snapshot پس از اعمال انجام می‌شود (applyOverlapUpdatesInTx).
    const overlapUpdatesByCycle = new Map<number, Array<{ relationId: string; status: 'UNREVIEWED' | 'NO_OVERLAP' | 'OVERLAP'; overlapDuration?: number | null }>>()
    for (const prow of preview.rows) {
      if (prow.kind !== 'RELATION') continue
      for (const cell of prow.cells) {
        if (cell.status === 'ERROR') {
          skippedCells.push(cell)
          continue
        }
        if (cell.status === 'SKIP' || !cell.relationId || !cell.overlapStatus) continue
        const arr = overlapUpdatesByCycle.get(cell.cycleNo) ?? []
        arr.push({ relationId: cell.relationId, status: cell.overlapStatus, overlapDuration: cell.overlapDuration ?? null })
        overlapUpdatesByCycle.set(cell.cycleNo, arr)
        committedCells.push(cell)
      }
    }
    const nameOf = (id: string) => elementById.get(id)?.name ?? id
    for (const [cycleNo, updates] of overlapUpdatesByCycle) {
      const cycleId = cycleIds.get(cycleNo)
      if (!cycleId) continue
      const { pendingAudits } = await applyOverlapUpdatesInTx(tx, {
        cycleId,
        projectId,
        updates,
        nameOf,
      })
      overlapPendingAudits.push(...pendingAudits)
    }

    await recomputeSession(tx, sessionId)
  })

  for (const entry of overlapPendingAudits) {
    await recordAudit(entry)
  }

  await recordAudit({
    entityType: 'StudySession',
    entityId: sessionId,
    action: 'IMPORT',
    entityName: `Paste چندسلولی در جلسهٔ ${session.operator.displayName}`,
    after: { committed: committedCells.length, skipped: skippedCells.length, createdCycles: preview.createdCycles },
    projectId,
  })

  // دادهٔ جدید → بازمحاسبه پرچم‌های غیرعادی کل فعالیت (زنجیره پیوسته ممکن است جابه‌جا شده باشد) — FR-18/27
  await markProjectCalculationsStale(projectId)
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
