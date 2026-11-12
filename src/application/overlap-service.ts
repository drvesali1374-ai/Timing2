// ═══════════════════════════════════════════════════════════
// سرویس مرکزی هم‌پوشانی عناصر کاری — جلسه دوم
// یک منبع دادهٔ معتبر برای هر رابطه:
//   • OverlapRelation — رابطهٔ دوتایی در سطح پروژه (آرشیو نرم)
//   • ObservationOverlap — مقدار هر رابطه در هر چرخه (سه وضعیت)
// فرم A، فرم B و ماتریس مرکزی هر سه از همین سرویس می‌خوانند؛
// هیچ نسخهٔ کپی یا رکورد معکوس ذخیره نمی‌شود.
// جریان هر تغییر (§۱۰): تعلق project/cycle → کنترل نسخه → اعتبارسنجی
// محلی → سه‌تایی → solver سراسری → rollback یا ثبت → stale → audit.
// ═══════════════════════════════════════════════════════════
import { db } from '@/lib/db'
import { AppError } from '@/domain/types'
import { recordAudit } from '@/infrastructure/audit'
import { markProjectCalculationsStale } from './calc-stale'
import {
  runFullValidation,
  computeVerdicts,
  pairKey,
  type FullValidationOutput,
  type IntervalCheckIssue,
  type OverlapStatus,
  type PairOverlapValue,
} from '@/calculation/overlap-matrix'

// ─────────────────── انواع DTO ───────────────────

export interface MatrixMember {
  elementId: string
  name: string
  activityId: string
  activityName: string
  stationId: string
  stationName: string
  /** برای مرتب‌سازی مطابق ساختار پروژه */
  stationSort: number
  activitySort: number
  elementSort: number
}

export interface RelationDto {
  id: string
  elementLowId: string
  elementHighId: string
  isActive: boolean
  version: number
  createdAt: string
  updatedAt: string
}

export interface CellValueDto {
  relationId: string
  status: OverlapStatus
  overlapDuration: number | null
  version: number
  updatedAt: string
}

export interface CycleOption {
  cycleId: string
  cycleNo: number
  sessionId: string
  operatorId: string
  operatorName: string
  timingMethod: string
  sessionStatus: string
  activityId: string
  activityName: string
  createdAt: string
  /** نسخهٔ مجموعهٔ مقادیر هم‌پوشانی این چرخه — کنترل هم‌زمانی §۱۰ ممیزی جلسه ۲ */
  overlapRevision: number
}

export interface CatalogEntry {
  elementId: string
  name: string
  activityId: string
  activityName: string
  stationId: string
  stationName: string
}

export interface ValidationSummaryDto {
  /** نتیجهٔ نهایی — با توجه به کامل‌بودن اعتبارسنجی (روابط بررسی‌نشده → INDETERMINATE) */
  verdict: 'VALID' | 'INVALID' | 'INDETERMINATE'
  /** سازگاری داده‌های تأییدشده با هم — مستقل از کامل‌بودن — §۳ ممیزی جلسه ۲ */
  confirmedVerdict: 'VALID' | 'INVALID' | 'INDETERMINATE'
  /** همان verdict — برای تمایز صریح دو مفهوم در DTO */
  overallVerdict: 'VALID' | 'INVALID' | 'INDETERMINATE'
  localFailures: Array<{ pair: [string, string]; failures: Array<{ code: string; message: string }> }>
  tripleIssues: Array<{ message: string; responsibleElementIds?: string[] }>
  globalIssues: Array<{ message: string; responsibleElementIds?: string[] }>
  /** تطبیق مقادیر ثبت‌شده با بازهٔ واقعی چرخه — §۴ ممیزی جلسه ۲ */
  intervalIssues: Array<{
    pair: [string, string]
    recorded: number | null
    computed: number | null
    message: string
    kind: 'DEFINITE' | 'INDETERMINATE'
  }>
  provisionalWarnings: Array<{ message: string; responsiblePairs?: Array<[string, string]> }>
  multiOverlaps: Array<{ members: string[]; value: number | null; provisional: boolean }>
  unions: Array<{ members: string[]; value: number | null; source: string }>
}

/** مقایسه‌پذیری یک زوج در چرخهٔ انتخاب‌شده — §۵ ممیزی جلسه ۲ */
export interface ComparabilityDto {
  isComparable: boolean
  notComparableReason: string | null
}

export interface OverlapMatrixDto {
  projectId: string
  members: MatrixMember[]
  relations: RelationDto[]
  /** مقادیر چرخهٔ انتخاب‌شده — کلید: relationId؛ فقط رکوردهای واقعی (بدون رکورد ساختگی) */
  cells: Record<string, CellValueDto>
  /** مقایسه‌پذیری هر رابطهٔ فعال در چرخهٔ انتخاب‌شده — خالی وقتی چرخه‌ای انتخاب نشده */
  comparability: Record<string, ComparabilityDto>
  selectedCycle: CycleOption | null
  cycles: CycleOption[]
  elementsCatalog: CatalogEntry[]
  validation: ValidationSummaryDto | null
}

export interface RelationUpdateInput {
  relationId: string
  status: OverlapStatus
  overlapDuration?: number | null
  expectedVersion?: number
}

// ─────────────────── کمک‌های داخلی ───────────────────

function assertStatus(v: string): asserts v is OverlapStatus {
  if (v !== 'UNREVIEWED' && v !== 'NO_OVERLAP' && v !== 'OVERLAP') {
    throw new AppError('INVALID_OVERLAP_STATUS', 'وضعیت هم‌پوشانی معتبر نیست.', 422)
  }
}

async function loadProjectElements(projectId: string) {
  return db.workElement.findMany({
    where: { activity: { station: { projectId } } },
    select: {
      id: true,
      name: true,
      sortOrder: true,
      activity: {
        select: {
          id: true,
          name: true,
          sortOrder: true,
          station: { select: { id: true, name: true, sortOrder: true } },
        },
      },
    },
    orderBy: [
      { activity: { station: { sortOrder: 'asc' } } },
      { activity: { sortOrder: 'asc' } },
      { sortOrder: 'asc' },
    ],
  })
}

/** مدت و بازهٔ هر عنصر در یک چرخه — از دادهٔ خام مشاهده، بدون هیچ تغییری */
async function loadCycleContext(cycleId: string) {
  const cycle = await db.cycleObservation.findUnique({
    where: { id: cycleId },
    select: {
      id: true,
      cycleNo: true,
      session: {
        select: {
          id: true,
          timingMethod: true,
          status: true,
          activityId: true,
          activity: { select: { name: true } },
          operator: { select: { id: true, displayName: true } },
        },
      },
    },
  })
  if (!cycle) throw new AppError('CYCLE_NOT_FOUND', 'چرخه یافت نشد.', 404)
  const observations = await db.elementObservation.findMany({
    where: { cycleId },
    select: {
      workElementId: true,
      derivedDuration: true,
      rawDuration: true,
      startOffset: true,
      endOffset: true,
    },
  })
  const durations: Record<string, number | null> = {}
  const intervals: Record<string, { startOffset: number; endOffset: number } | null> = {}
  for (const obs of observations) {
    const d = obs.derivedDuration ?? obs.rawDuration ?? null
    durations[obs.workElementId] = d
    intervals[obs.workElementId] =
      obs.startOffset != null && obs.endOffset != null
        ? { startOffset: obs.startOffset, endOffset: obs.endOffset }
        : null
  }
  return { cycle, durations, intervals }
}

function toValidationSummary(
  out: FullValidationOutput,
  memberList: string[],
  pairLookup: (a: string, b: string) => PairOverlapValue | undefined,
): ValidationSummaryDto {
  const { confirmedVerdict, overallVerdict } = computeVerdicts(memberList, pairLookup, out)
  return {
    verdict: overallVerdict,
    confirmedVerdict,
    overallVerdict,
    localFailures: out.localFailures,
    tripleIssues: out.tripleIssues.map((i) => ({ message: i.message, responsibleElementIds: i.responsibleElementIds })),
    globalIssues: out.confirmed.issues.map((i) => ({ message: i.message, responsibleElementIds: i.responsibleElementIds })),
    intervalIssues: out.intervalIssues.map((i) => ({
      pair: i.pair,
      recorded: i.recorded,
      computed: i.computed,
      message: i.message,
      kind: i.kind === 'DEFINITE' ? 'DEFINITE' : 'INDETERMINATE',
    })),
    provisionalWarnings: out.provisional.warnings.map((w) => ({ message: w.message, responsiblePairs: w.responsiblePairs })),
    multiOverlaps: Object.entries(out.multiOverlaps).map(([key, r]) => ({
      members: key.split('|'),
      value: r.value,
      provisional: r.provisional,
    })),
    unions: Object.entries(out.unions).map(([key, u]) => ({
      members: key.split('|'),
      value: u.value,
      source: u.source,
    })),
  }
}

// ── مقایسه‌پذیری زوج‌ها در یک چرخه — §۵ ممیزی جلسه ۲ ──
// رابطه در سطح پروژه بین عناصر دو Activity متفاوت مجاز است؛ اما ثبت مقدار چرخه‌ای
// فقط وقتی معنا دارد که هر دو عنصر در همان چرخه روی یک محور زمانی مشترک داده
// قابل‌مقایسه داشته باشند. چون هر چرخه به یک جلسه (و هر جلسه به یک فعالیت)
// تعلق دارد، عنصرِ فعالیت دیگر هرگز در این چرخه مشاهده‌ای ندارد → غیرقابل‌مقایسه.
// این وضعیت به‌عنوان NO_OVERLAP ذخیره نمی‌شود و رکورد قطعی جعلی ساخته نمی‌شود.

/** آیا عنصر در این چرخه ردیف مشاهده دارد؟ (حضور در durations — حتی با مقدار تهی) */
function isObservedInCycle(elementId: string, durations: Record<string, number | null>): boolean {
  return Object.prototype.hasOwnProperty.call(durations, elementId)
}

/** آیا عنصر شواهد قابل‌مقایسه (بازهٔ واقعی یا مدت غیرتهی) در چرخه دارد؟ */
function hasComparableEvidence(
  elementId: string,
  durations: Record<string, number | null>,
  intervals: Record<string, { startOffset: number; endOffset: number } | null>,
): boolean {
  const iv = intervals[elementId]
  if (iv && iv.startOffset != null && iv.endOffset != null) return true
  return durations[elementId] != null
}

function comparabilityForRelations(
  activeRelations: Array<{ id: string; elementLowId: string; elementHighId: string }>,
  durations: Record<string, number | null>,
  intervals: Record<string, { startOffset: number; endOffset: number } | null>,
  nameOf: (id: string) => string,
): Record<string, ComparabilityDto> {
  const out: Record<string, ComparabilityDto> = {}
  for (const r of activeRelations) {
    const reasons: string[] = []
    for (const eid of [r.elementLowId, r.elementHighId]) {
      if (!isObservedInCycle(eid, durations)) {
        reasons.push(`«${nameOf(eid)}» در این چرخه مشاهده‌ای ندارد`)
      } else if (!hasComparableEvidence(eid, durations, intervals)) {
        reasons.push(`«${nameOf(eid)}» در این چرخه مدت یا بازهٔ قابل‌مقایسه ندارد`)
      }
    }
    out[r.id] =
      reasons.length === 0
        ? { isComparable: true, notComparableReason: null }
        : { isComparable: false, notComparableReason: `در این چرخه قابل‌مقایسه نیست: ${reasons.join('؛ ')}` }
  }
  return out
}

// ─────────────────── رابطه‌ها (OverlapRelationService) ───────────────────

export async function listRelations(projectId: string) {
  const relations = await db.overlapRelation.findMany({
    where: { projectId },
    orderBy: { createdAt: 'asc' },
  })
  return relations
}

export async function createRelation(projectId: string, elementAId: string, elementBId: string): Promise<RelationDto> {
  if (elementAId === elementBId) {
    throw new AppError('SELF_RELATION', 'عنصر نمی‌تواند با خودش رابطهٔ موازی داشته باشد.', 422)
  }
  const [elA, elB] = await Promise.all([
    db.workElement.findUnique({ where: { id: elementAId }, select: { id: true, name: true, activity: { select: { station: { select: { projectId: true } } } } } }),
    db.workElement.findUnique({ where: { id: elementBId }, select: { id: true, name: true, activity: { select: { station: { select: { projectId: true } } } } } }),
  ])
  if (!elA || !elB) throw new AppError('ELEMENT_NOT_FOUND', 'عنصر کاری یافت نشد.', 404)
  if (elA.activity.station.projectId !== projectId || elB.activity.station.projectId !== projectId) {
    throw new AppError('WRONG_PROJECT', 'هر دو عنصر باید متعلق به همین پروژه باشند.', 422)
  }
  const low = elementAId < elementBId ? elementAId : elementBId
  const high = elementAId < elementBId ? elementBId : elementAId
  const existing = await db.overlapRelation.findUnique({
    where: { projectId_elementLowId_elementHighId: { projectId, elementLowId: low, elementHighId: high } },
  })
  if (existing?.isActive) {
    throw new AppError('DUPLICATE_RELATION', 'رابطهٔ موازی این دو عنصر از قبل تعریف شده است.', 422)
  }
  const relation = existing
    ? await db.overlapRelation.update({
        where: { id: existing.id },
        data: { isActive: true, version: { increment: 1 } },
      })
    : await db.overlapRelation.create({
        data: { projectId, elementLowId: low, elementHighId: high },
      })
  await markProjectCalculationsStale(projectId)
  await recordAudit({
    entityType: 'OverlapRelation',
    entityId: relation.id,
    action: existing ? 'RESTORE' : 'CREATE',
    entityName: `${elA.name} ↔ ${elB.name}`,
    after: { projectId, elementLowId: low, elementHighId: high, isActive: true },
    projectId,
  })
  return serializeRelation(relation)
}

export async function archiveRelation(relationId: string): Promise<RelationDto> {
  const relation = await db.overlapRelation.findUnique({ where: { id: relationId } })
  if (!relation) throw new AppError('RELATION_NOT_FOUND', 'رابطه یافت نشد.', 404)
  if (!relation.isActive) return serializeRelation(relation)
  const [elA, elB] = await Promise.all([
    db.workElement.findUnique({ where: { id: relation.elementLowId }, select: { name: true } }),
    db.workElement.findUnique({ where: { id: relation.elementHighId }, select: { name: true } }),
  ])
  const updated = await db.overlapRelation.update({
    where: { id: relationId },
    data: { isActive: false, version: { increment: 1 } },
  })
  await markProjectCalculationsStale(relation.projectId)
  // تاریخچهٔ مقادیر چرخه‌ها فیزیکی حذف نمی‌شود — فقط isActive=false
  await recordAudit({
    entityType: 'OverlapRelation',
    entityId: relationId,
    action: 'DELETE',
    entityName: `${elA?.name ?? '?'} ↔ ${elB?.name ?? '?'}`,
    projectId: relation.projectId,
  })
  return serializeRelation(updated)
}

export async function restoreRelation(relationId: string): Promise<RelationDto> {
  const relation = await db.overlapRelation.findUnique({ where: { id: relationId } })
  if (!relation) throw new AppError('RELATION_NOT_FOUND', 'رابطه یافت نشد.', 404)
  if (relation.isActive) return serializeRelation(relation)
  const updated = await db.overlapRelation.update({
    where: { id: relationId },
    data: { isActive: true, version: { increment: 1 } },
  })
  await markProjectCalculationsStale(relation.projectId)
  await recordAudit({
    entityType: 'OverlapRelation',
    entityId: relationId,
    action: 'RESTORE',
    projectId: relation.projectId,
  })
  return serializeRelation(updated)
}

/** حذف عنصر → آرشیو روابط مرجع به آن (حفظ تاریخچه) */
export async function archiveRelationsForElement(elementId: string): Promise<number> {
  const relations = await db.overlapRelation.findMany({
    where: { OR: [{ elementLowId: elementId }, { elementHighId: elementId }], isActive: true },
  })
  if (relations.length === 0) return 0
  await db.overlapRelation.updateMany({
    where: { id: { in: relations.map((r) => r.id) } },
    data: { isActive: false, version: { increment: 1 } },
  })
  for (const r of relations) {
    await recordAudit({
      entityType: 'OverlapRelation',
      entityId: r.id,
      action: 'DELETE',
      entityName: 'آرشیو خودکار پس از حذف عنصر',
      projectId: r.projectId,
    })
  }
  return relations.length
}

function serializeRelation(r: {
  id: string
  elementLowId: string
  elementHighId: string
  isActive: boolean
  version: number
  createdAt: Date
  updatedAt: Date
}): RelationDto {
  return {
    id: r.id,
    elementLowId: r.elementLowId,
    elementHighId: r.elementHighId,
    isActive: r.isActive,
    version: r.version,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }
}

// ─────────────────── ماتریس مرکزی (ProjectOverlapMatrixService) ───────────────────

export async function getOverlapMatrix(projectId: string, cycleId?: string | null): Promise<OverlapMatrixDto> {
  const project = await db.project.findUnique({ where: { id: projectId }, select: { id: true } })
  if (!project) throw new AppError('PROJECT_NOT_FOUND', 'پروژه یافت نشد.', 404)

  const [relations, elements] = await Promise.all([
    db.overlapRelation.findMany({ where: { projectId }, orderBy: { createdAt: 'asc' } }),
    loadProjectElements(projectId),
  ])
  const elementById = new Map(elements.map((e) => [e.id, e]))
  const nameOf = (id: string) => elementById.get(id)?.name ?? id

  // عضویت پویا: فقط عناصر دارای حداقل یک رابطهٔ فعال (§۳)
  const activeRelations = relations.filter((r) => r.isActive)
  const memberIds = new Set<string>()
  for (const r of activeRelations) {
    memberIds.add(r.elementLowId)
    memberIds.add(r.elementHighId)
  }
  // ترتیب مطابق ساختار پروژه: ایستگاه → فعالیت → sortOrder عنصر
  const members: MatrixMember[] = elements
    .filter((e) => memberIds.has(e.id))
    .map((e) => ({
      elementId: e.id,
      name: e.name,
      activityId: e.activity.id,
      activityName: e.activity.name,
      stationId: e.activity.station.id,
      stationName: e.activity.station.name,
      stationSort: e.activity.station.sortOrder,
      activitySort: e.activity.sortOrder,
      elementSort: e.sortOrder,
    }))

  // فهرست چرخه‌ها برای انتخاب‌گر (گروه‌بندی بر اساس جلسه)
  const sessions = await db.studySession.findMany({
    where: { activity: { station: { projectId } } },
    select: {
      id: true,
      timingMethod: true,
      status: true,
      activityId: true,
      activity: { select: { name: true } },
      operator: { select: { id: true, displayName: true } },
      cycles: { select: { id: true, cycleNo: true, overlapRevision: true, createdAt: true }, orderBy: { cycleNo: 'asc' } },
    },
    orderBy: { startedAt: 'asc' },
  })
  const cycles: CycleOption[] = []
  for (const s of sessions) {
    for (const c of s.cycles) {
      cycles.push({
        cycleId: c.id,
        cycleNo: c.cycleNo,
        sessionId: s.id,
        operatorId: s.operator.id,
        operatorName: s.operator.displayName,
        timingMethod: s.timingMethod,
        sessionStatus: s.status,
        activityId: s.activityId,
        activityName: s.activity.name,
        createdAt: c.createdAt.toISOString(),
        overlapRevision: c.overlapRevision,
      })
    }
  }

  // مقادیر چرخهٔ انتخاب‌شده
  const cells: Record<string, CellValueDto> = {}
  const comparability: Record<string, ComparabilityDto> = {}
  let selectedCycle: CycleOption | null = null
  let validation: ValidationSummaryDto | null = null
  if (cycleId) {
    selectedCycle = cycles.find((c) => c.cycleId === cycleId) ?? null
    if (!selectedCycle) throw new AppError('CYCLE_NOT_FOUND', 'چرخه یافت نشد یا متعلق به این پروژه نیست.', 404)
    const values = await db.observationOverlap.findMany({ where: { cycleId } })
    for (const v of values) {
      assertStatus(v.status)
      cells[v.relationId] = {
        relationId: v.relationId,
        status: v.status,
        overlapDuration: v.overlapDuration,
        version: v.version,
        updatedAt: v.updatedAt.toISOString(),
      }
    }
    // اعتبارسنجی و محاسبات وابسته (§۱۰)
    const { durations, intervals } = await loadCycleContext(cycleId)
    const memberList = members.map((m) => m.elementId)
    // §۳ ممیزی جلسه ۲ — قرارداد یکسان در همهٔ مسیرها:
    //   نبود OverlapRelation → undefined (رابطه تعریف‌نشده)
    //   رابطهٔ فعال بدون رکورد چرخه → UNREVIEWED (رابطه بررسی‌نشده — صفر قطعی نیست)
    const pairLookup = (a: string, b: string): PairOverlapValue | undefined => {
      const rel = activeRelations.find(
        (r) =>
          (r.elementLowId === a && r.elementHighId === b) || (r.elementLowId === b && r.elementHighId === a),
      )
      if (!rel) return undefined
      const cell = cells[rel.id]
      if (!cell) return { status: 'UNREVIEWED', overlapDuration: null }
      return { status: cell.status, overlapDuration: cell.overlapDuration }
    }
    const out = runFullValidation(memberList, durations, intervals, pairLookup, nameOf)
    validation = toValidationSummary(out, memberList, pairLookup)
    // مقایسه‌پذیری زوج‌ها در این چرخه — §۵ ممیزی جلسه ۲
    Object.assign(comparability, comparabilityForRelations(activeRelations, durations, intervals, nameOf))
  }

  return {
    projectId,
    members,
    relations: relations.map(serializeRelation),
    cells,
    comparability,
    selectedCycle,
    cycles,
    elementsCatalog: elements.map((e) => ({
      elementId: e.id,
      name: e.name,
      activityId: e.activity.id,
      activityName: e.activity.name,
      stationId: e.activity.station.id,
      stationName: e.activity.station.name,
    })),
    validation,
  }
}

// ─────────────────── ثبت مقادیر چرخه‌ای (ObservationOverlapService) ───────────────────

export interface SetOverlapsResult {
  cells: Record<string, CellValueDto>
  validation: ValidationSummaryDto
  warnings: string[]
}

export async function setCycleOverlaps(
  cycleId: string,
  updates: RelationUpdateInput[],
  opts?: { expectedOverlapRevision?: number },
): Promise<SetOverlapsResult> {
  if (updates.length === 0) throw new AppError('NO_UPDATES', 'تغلیاتی برای ثبت وجود ندارد.', 422)
  const { cycle, durations, intervals } = await loadCycleContext(cycleId)
  const projectId = await projectOfActivity(cycle.session.activityId)

  // اعتبارسنجی تعلق رابطه‌ها و کنترل نسخه
  const relationIds = updates.map((u) => u.relationId)
  const relations = await db.overlapRelation.findMany({ where: { id: { in: relationIds } } })
  const relationById = new Map(relations.map((r) => [r.id, r]))
  const elements = await loadProjectElements(projectId)
  const elementById = new Map(elements.map((e) => [e.id, e]))
  const nameOf = (id: string) => elementById.get(id)?.name ?? id

  for (const u of updates) {
    const rel = relationById.get(u.relationId)
    if (!rel) throw new AppError('RELATION_NOT_FOUND', `رابطه یافت نشد.`, 404)
    if (rel.projectId !== projectId) {
      throw new AppError('WRONG_PROJECT', 'رابطه به پروژهٔ این چرخه تعلق ندارد.', 422)
    }
    if (!rel.isActive) {
      throw new AppError('RELATION_ARCHIVED', 'رابطهٔ آرشیوشده قابل ویرایش نیست؛ ابتدا آن را بازگردانی کنید.', 422)
    }
    assertStatus(u.status)
  }

  // §۵ ممیزی جلسه ۲ — مقایسه‌پذیری زوج در چرخهٔ جاری:
  // ثبت مقدار قطعی (OVERLAP/NO_OVERLAP) فقط وقتی مجاز است که هر دو عنصر
  // در همین چرخه مشاهده داشته باشند و شواهد قابل‌مقایسه (بازه یا مدت) موجود باشد.
  // چرخه به همین پروژه تعلق دارد (projectOfActivity + کنترل projectId رابطه).
  // این وضعیت هرگز به‌عنوان NO_OVERLAP ذخیره نمی‌شود و رکورد قطعی جعلی ساخته نمی‌شود.
  for (const u of updates) {
    const rel = relationById.get(u.relationId)!
    if (u.status === 'UNREVIEWED') continue // پاک‌کردن مقدار همیشه مجاز است
    for (const eid of [rel.elementLowId, rel.elementHighId]) {
      if (!isObservedInCycle(eid, durations)) {
        throw new AppError(
          'NOT_COMPARABLE_IN_CYCLE',
          `ثبت مقدار ممکن نیست — «${nameOf(eid)}» در چرخهٔ ${cycle.cycleNo} مشاهده‌ای ندارد؛ این زوج در این چرخه قابل‌مقایسه نیست (در این چرخه قابل‌مقایسه نیست).`,
          422,
          { elementId: eid, notComparableReason: `«${nameOf(eid)}» در این چرخه مشاهده‌ای ندارد` },
        )
      }
      if (!hasComparableEvidence(eid, durations, intervals)) {
        throw new AppError(
          'NOT_COMPARABLE_IN_CYCLE',
          `ثبت مقدار ممکن نیست — «${nameOf(eid)}» در چرخهٔ ${cycle.cycleNo} مدت یا بازهٔ قابل‌مقایسه ندارد؛ این زوج در این چرخه قابل‌مقایسه نیست.`,
          422,
          { elementId: eid, notComparableReason: `«${nameOf(eid)}» در این چرخه مدت یا بازهٔ قابل‌مقایسه ندارد` },
        )
      }
    }
  }

  // سازوکار اعتبارسنجی + ثبت اتمیک — §۱۰ ممیزی جلسه ۲:
  // پیش‌اعتبارسنجی بیرون تراکنش فقط یک مسیر سریعِ خطاست؛ اعتبارسنجی نهایی
  // «درون تراکنش» روی snapshot قفل‌شده انجام می‌شود. نخستین نوشتنِ تراکنش
  // (افزایش overlapRevision) قفل نوشتن SQLite را می‌گیرد و تضمین می‌کند
  // همهٔ خواندن‌های بعدی روی یک snapshot معتبر انجام شوند؛ بنابراین دو
  // درخواست هم‌زمان یا سریال می‌شوند یا درخواست با مبنا کهنه با 409 رد می‌شود.
  const allRelationsPre = await db.overlapRelation.findMany({ where: { projectId, isActive: true } })
  const preValues = await db.observationOverlap.findMany({ where: { cycleId } })
  const preOut = validateOverlapSet(allRelationsPre, preValues, updates, cycleId, durations, intervals, nameOf)
  assertNoDefiniteFailure(preOut, nameOf)

  const cells: Record<string, CellValueDto> = {}
  const pendingAudits: Array<Parameters<typeof recordAudit>[0]> = []
  await db.$transaction(async (tx) => {
    // ۱) قفل نوشتن + کنترل نسخهٔ مجموعهٔ مقادیر چرخه
    const bumped = await tx.cycleObservation.update({
      where: { id: cycleId },
      data: { overlapRevision: { increment: 1 } },
      select: { overlapRevision: true },
    })
    if (opts?.expectedOverlapRevision != null && bumped.overlapRevision - 1 !== opts.expectedOverlapRevision) {
      throw new AppError(
        'OVERLAP_REVISION_CONFLICT',
        'مجموعهٔ مقادیر هم‌پوشانی این چرخه از محل دیگری هم‌زمان تغییر کرده است؛ صفحه را نوسازی کنید.',
        409,
      )
    }
    // ۲) خواندن تازهٔ کل وضعیت مؤثر (روی snapshot قفل‌شده)
    const allRelationsTx = await tx.overlapRelation.findMany({ where: { projectId, isActive: true } })
    const existingValuesTx = await tx.observationOverlap.findMany({ where: { cycleId } })
    // ۳) اعتبارسنجی نهایی روی snapshot معتبر
    const out = validateOverlapSet(allRelationsTx, existingValuesTx, updates, cycleId, durations, intervals, nameOf)
    assertNoDefiniteFailure(out, nameOf)
    // ۴) ثبت
    for (const u of updates) {
      assertStatus(u.status)
      const normalizedDuration = u.status === 'NO_OVERLAP' ? 0 : u.status === 'UNREVIEWED' ? null : u.overlapDuration
      const existing = await tx.observationOverlap.findUnique({
        where: { relationId_cycleId: { relationId: u.relationId, cycleId } },
      })
      if (existing) {
        if (u.expectedVersion != null && existing.version !== u.expectedVersion) {
          throw new AppError(
            'VERSION_CONFLICT',
            'مقدار این زوج هم‌پوشانی از محل دیگری هم‌زمان تغییر کرده است؛ صفحه را نوسازی کنید.',
            409,
          )
        }
        const updated = await tx.observationOverlap.update({
          where: { id: existing.id },
          data: { status: u.status, overlapDuration: normalizedDuration, version: { increment: 1 } },
        })
        cells[updated.relationId] = serializeCell(updated)
      } else {
        const created = await tx.observationOverlap.create({
          data: { relationId: u.relationId, cycleId, status: u.status, overlapDuration: normalizedDuration },
        })
        cells[created.relationId] = serializeCell(created)
      }
      const rel = relationById.get(u.relationId)!
      pendingAudits.push({
        entityType: 'ObservationOverlap',
        entityId: `${u.relationId}:${cycleId}`,
        action: 'UPDATE',
        entityName: `${nameOf(rel.elementLowId)} ↔ ${nameOf(rel.elementHighId)} — چرخهٔ ${cycle.cycleNo}`,
        before: existing ? { status: existing.status, overlapDuration: existing.overlapDuration } : null,
        after: { status: u.status, overlapDuration: normalizedDuration },
        projectId,
      })
    }
  })

  // رویدادهای تاریخچه پس از commit (خارج از تراکنش — جلوگیری از بن‌بست SQLite)
  for (const entry of pendingAudits) {
    await recordAudit(entry)
  }

  await markProjectCalculationsStale(projectId)

  // اعتبارسنجی پس از ثبت برای پاسخ (از همان منبع واحد خوانده می‌شود)
  const { validation } = await getOverlapMatrix(projectId, cycleId)
  const warnings = preOut.provisional.warnings.map((w) => w.message)
  return { cells, validation: validation ?? emptyValidation(), warnings }
}

/** ساخت pairLookup از رابطه‌های فعال + مقادیر موجود + به‌روزرسانی‌های درخواست و اجرای خط کامل اعتبارسنجی */
function validateOverlapSet(
  allRelations: Array<{ id: string; projectId: string; elementLowId: string; elementHighId: string; isActive: boolean }>,
  existingValues: Array<{ relationId: string; cycleId: string; status: string; overlapDuration: number | null; version: number }>,
  updates: RelationUpdateInput[],
  cycleId: string,
  durations: Record<string, number | null>,
  intervals: Record<string, { startOffset: number; endOffset: number } | null>,
  nameOf: (id: string) => string,
): FullValidationOutput {
  const valueByKey = new Map(existingValues.map((v) => [v.relationId, v]))
  const newByKey = new Map(valueByKey)
  for (const u of updates) {
    newByKey.set(u.relationId, {
      relationId: u.relationId,
      cycleId,
      status: u.status,
      overlapDuration: u.status === 'NO_OVERLAP' ? 0 : u.status === 'UNREVIEWED' ? null : u.overlapDuration ?? null,
      version: valueByKey.get(u.relationId)?.version ?? 0,
    })
  }
  const memberIds = new Set<string>()
  for (const r of allRelations) {
    memberIds.add(r.elementLowId)
    memberIds.add(r.elementHighId)
  }
  const memberList = [...memberIds]
  // §۳ ممیزی جلسه ۲ — رابطهٔ فعال بدون رکورد چرخه = UNREVIEWED (نه undefined)
  const pairLookup = (a: string, b: string): PairOverlapValue | undefined => {
    const rel = allRelations.find(
      (r) => (r.elementLowId === a && r.elementHighId === b) || (r.elementLowId === b && r.elementHighId === a),
    )
    if (!rel) return undefined
    const v = newByKey.get(rel.id)
    if (!v) return { status: 'UNREVIEWED', overlapDuration: null }
    return { status: v.status as OverlapStatus, overlapDuration: v.overlapDuration }
  }
  return runFullValidation(memberList, durations, intervals, pairLookup, nameOf)
}

/** خطای قطعی → استاپ با پیام روشن (rollback کامل — §۱۰-۶) */
function assertNoDefiniteFailure(out: FullValidationOutput, nameOf: (id: string) => string): void {
  const hasDefinite =
    out.localFailures.length > 0 ||
    out.tripleIssues.length > 0 ||
    out.intervalIssues.some((i) => i.kind === 'DEFINITE') ||
    out.confirmed.verdict === 'INVALID'
  if (!hasDefinite) return
  const msgs = [
    ...out.localFailures.flatMap((lf) => lf.failures.map((f) => `${nameOf(lf.pair[0])} ↔ ${nameOf(lf.pair[1])}: ${f.message}`)),
    ...out.tripleIssues.map((i) => i.message),
    ...out.intervalIssues.filter((i) => i.kind === 'DEFINITE').map((i) => i.message),
    ...out.confirmed.issues.filter((i) => i.kind === 'DEFINITE').map((i) => i.message),
  ]
  throw new AppError(
    'OVERLAP_VALIDATION_FAILED',
    'ثبت تغییرات ممکن نیست — دادهٔ غیرممکن رد شد:\n' + msgs.join('\n'),
    422,
    { issues: msgs, localFailures: out.localFailures, tripleIssues: out.tripleIssues, globalIssues: out.confirmed.issues },
  )
}

function emptyValidation(): ValidationSummaryDto {
  return {
    verdict: 'INDETERMINATE',
    confirmedVerdict: 'INDETERMINATE',
    overallVerdict: 'INDETERMINATE',
    localFailures: [],
    tripleIssues: [],
    globalIssues: [],
    intervalIssues: [],
    provisionalWarnings: [],
    multiOverlaps: [],
    unions: [],
  }
}

function serializeCell(v: {
  relationId: string
  status: string
  overlapDuration: number | null
  version: number
  updatedAt: Date
}): CellValueDto {
  return {
    relationId: v.relationId,
    status: v.status as OverlapStatus,
    overlapDuration: v.overlapDuration,
    version: v.version,
    updatedAt: v.updatedAt.toISOString(),
  }
}

async function projectOfActivity(activityId: string): Promise<string> {
  const activity = await db.activity.findUnique({
    where: { id: activityId },
    select: { station: { select: { projectId: true } } },
  })
  if (!activity) throw new AppError('ACTIVITY_NOT_FOUND', 'فعالیت یافت نشد.', 404)
  return activity.station.projectId
}

// ─────────────────── نمای فرم عنصر (OverlapMatrixSyncService — منبع واحد) ───────────────────

export interface ElementRelationRow {
  relationId: string
  otherElementId: string
  otherElementName: string
  otherActivityName: string
  otherStationName: string
  isActive: boolean
  /** مقدار چرخهٔ آخر ثبت‌شده این رابطه — در حالت Session-محدود فقط چرخه‌های همان جلسه (§۶ ممیزی جلسه ۲) */
  latest: { cycleNo: number; operatorName: string; activityName: string; status: OverlapStatus; overlapDuration: number | null; cycleId: string } | null
}

export async function getElementRelations(
  elementId: string,
  opts?: { sessionId?: string | null },
): Promise<{ elementId: string; elementName: string; rows: ElementRelationRow[]; scope: 'PROJECT' | 'SESSION' }> {
  const element = await db.workElement.findUnique({
    where: { id: elementId },
    select: { id: true, name: true, activity: { select: { station: { select: { projectId: true } } } } },
  })
  if (!element) throw new AppError('ELEMENT_NOT_FOUND', 'عنصر کاری یافت نشد.', 404)
  const projectId = element.activity.station.projectId
  const relations = await db.overlapRelation.findMany({
    where: { OR: [{ elementLowId: elementId }, { elementHighId: elementId }] },
    orderBy: { createdAt: 'asc' },
  })
  const otherIds = relations.map((r) => (r.elementLowId === elementId ? r.elementHighId : r.elementLowId))
  const others = await db.workElement.findMany({
    where: { id: { in: otherIds } },
    select: {
      id: true,
      name: true,
      activity: { select: { name: true, station: { select: { name: true } } } },
    },
  })
  const otherById = new Map(others.map((o) => [o.id, o]))
  // §۶ ممیزی جلسه ۲ — در فرم زمان‌سنجی، مقدار نمایشی به چرخه‌های Session جاری محدود می‌شود؛
  // دادهٔ جلسه/اپراتور دیگر هرگز وارد فرم Timing فعلی نمی‌شود. در فرم ساختار پروژه،
  // نمایش آخرین مقدار کل پروژه مجاز است ولی باید با برچسب «آخرین ثبت در کل پروژه» مشخص باشد.
  const sessionScoped = opts?.sessionId != null

  const rows: ElementRelationRow[] = []
  for (const r of relations) {
    const otherId = r.elementLowId === elementId ? r.elementHighId : r.elementLowId
    const other = otherById.get(otherId)
    let latest: ElementRelationRow['latest'] = null
    if (r.isActive) {
      const lastValue = await db.observationOverlap.findFirst({
        where: sessionScoped ? { relationId: r.id, cycle: { sessionId: opts!.sessionId! } } : { relationId: r.id },
        orderBy: { updatedAt: 'desc' },
      })
      if (lastValue) {
        const cyc = await db.cycleObservation.findUnique({
          where: { id: lastValue.cycleId },
          select: {
            cycleNo: true,
            session: { select: { operator: { select: { displayName: true } }, activity: { select: { name: true } } } },
          },
        })
        if (cyc) {
          latest = {
            cycleNo: cyc.cycleNo,
            operatorName: cyc.session.operator.displayName,
            activityName: cyc.session.activity.name,
            status: lastValue.status as OverlapStatus,
            overlapDuration: lastValue.overlapDuration,
            cycleId: lastValue.cycleId,
          }
        }
      }
    }
    rows.push({
      relationId: r.id,
      otherElementId: otherId,
      otherElementName: other?.name ?? '؟',
      otherActivityName: other?.activity.name ?? '؟',
      otherStationName: other?.activity.station.name ?? '؟',
      isActive: r.isActive,
      latest,
    })
  }
  return { elementId, elementName: element.name, rows, scope: sessionScoped ? 'SESSION' : 'PROJECT' }
}
