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
  pairKey,
  type FullValidationOutput,
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
  verdict: 'VALID' | 'INVALID' | 'INDETERMINATE'
  localFailures: Array<{ pair: [string, string]; failures: Array<{ code: string; message: string }> }>
  tripleIssues: Array<{ message: string; responsibleElementIds?: string[] }>
  globalIssues: Array<{ message: string; responsibleElementIds?: string[] }>
  provisionalWarnings: Array<{ message: string; responsiblePairs?: Array<[string, string]> }>
  multiOverlaps: Array<{ members: string[]; value: number | null; provisional: boolean }>
  unions: Array<{ members: string[]; value: number | null; source: string }>
}

export interface OverlapMatrixDto {
  projectId: string
  members: MatrixMember[]
  relations: RelationDto[]
  /** مقادیر چرخهٔ انتخاب‌شده — کلید: relationId */
  cells: Record<string, CellValueDto>
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

function toValidationSummary(out: FullValidationOutput): ValidationSummaryDto {
  return {
    verdict:
      out.localFailures.length > 0 || out.tripleIssues.length > 0 || out.confirmed.verdict === 'INVALID'
        ? 'INVALID'
        : out.confirmed.verdict === 'INDETERMINATE'
          ? 'INDETERMINATE'
          : 'VALID',
    localFailures: out.localFailures,
    tripleIssues: out.tripleIssues.map((i) => ({ message: i.message, responsibleElementIds: i.responsibleElementIds })),
    globalIssues: out.confirmed.issues.map((i) => ({ message: i.message, responsibleElementIds: i.responsibleElementIds })),
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
      cycles: { select: { id: true, cycleNo: true, createdAt: true }, orderBy: { cycleNo: 'asc' } },
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
      })
    }
  }

  // مقادیر چرخهٔ انتخاب‌شده
  const cells: Record<string, CellValueDto> = {}
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
    const pairLookup = (a: string, b: string): PairOverlapValue | undefined => {
      const rel = activeRelations.find(
        (r) =>
          (r.elementLowId === a && r.elementHighId === b) || (r.elementLowId === b && r.elementHighId === a),
      )
      if (!rel) return undefined
      const cell = cells[rel.id]
      if (!cell) return undefined
      return { status: cell.status, overlapDuration: cell.overlapDuration }
    }
    const out = runFullValidation(memberList, durations, intervals, pairLookup, nameOf)
    validation = toValidationSummary(out)
  }

  return {
    projectId,
    members,
    relations: relations.map(serializeRelation),
    cells,
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

export async function setCycleOverlaps(cycleId: string, updates: RelationUpdateInput[]): Promise<SetOverlapsResult> {
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
    if (u.expectedVersion != null) {
      // کنترل هم‌زمانی خوش‌بینانه بعداً در تراکنش اعمال می‌شود
    }
  }

  // پیش‌نمایش مقادیر جدید (بدون ثبت) برای کل خط اعتبارسنجی
  const allRelations = await db.overlapRelation.findMany({ where: { projectId, isActive: true } })
  const existingValues = await db.observationOverlap.findMany({ where: { cycleId } })
  const valueByKey = new Map(existingValues.map((v) => [`${v.relationId}`, v]))
  const newByKey = new Map(valueByKey)
  for (const u of updates) {
    assertStatus(u.status)
    newByKey.set(u.relationId, {
      id: 'draft',
      relationId: u.relationId,
      cycleId,
      status: u.status,
      overlapDuration: u.status === 'NO_OVERLAP' ? 0 : u.status === 'UNREVIEWED' ? null : u.overlapDuration ?? null,
      version: valueByKey.get(u.relationId)?.version ?? 0,
      updatedAt: new Date(),
    })
  }

  // عضویت و pairLookup کامل چرخه
  const memberIds = new Set<string>()
  for (const r of allRelations) {
    memberIds.add(r.elementLowId)
    memberIds.add(r.elementHighId)
  }
  const memberList = [...memberIds]
  const pairLookup = (a: string, b: string): PairOverlapValue | undefined => {
    const rel = allRelations.find(
      (r) => (r.elementLowId === a && r.elementHighId === b) || (r.elementLowId === b && r.elementHighId === a),
    )
    if (!rel) return undefined
    const v = newByKey.get(rel.id)
    if (!v) return undefined
    return { status: v.status as OverlapStatus, overlapDuration: v.overlapDuration }
  }

  const out = runFullValidation(memberList, durations, intervals, pairLookup, nameOf)
  const hasDefinite =
    out.localFailures.length > 0 || out.tripleIssues.length > 0 || out.confirmed.verdict === 'INVALID'
  if (hasDefinite) {
    // خطای قطعی → rollback کامل و پیام روشن (§۱۰-۶)
    const msgs = [
      ...out.localFailures.flatMap((lf) => lf.failures.map((f) => `${nameOf(lf.pair[0])} ↔ ${nameOf(lf.pair[1])}: ${f.message}`)),
      ...out.tripleIssues.map((i) => i.message),
      ...out.confirmed.issues.filter((i) => i.kind === 'DEFINITE').map((i) => i.message),
    ]
    throw new AppError(
      'OVERLAP_VALIDATION_FAILED',
      'ثبت تغییرات ممکن نیست — دادهٔ غیرممکن رد شد:\n' + msgs.join('\n'),
      422,
      { issues: msgs, localFailures: out.localFailures, tripleIssues: out.tripleIssues, globalIssues: out.confirmed.issues },
    )
  }

  // ثبت تراکنشی — توجه: recordAudit از db سراسری استفاده می‌کند و نباید داخل
  // تراکنش باز SQLite فراخوانی شود (بن‌بست قفل نوشتن)؛ رویدادها بعد از commit ثبت می‌شوند.
  const cells: Record<string, CellValueDto> = {}
  const pendingAudits: Array<Parameters<typeof recordAudit>[0]> = []
  await db.$transaction(async (tx) => {
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
  const warnings = out.provisional.warnings.map((w) => w.message)
  return { cells, validation: validation ?? emptyValidation(), warnings }
}

function emptyValidation(): ValidationSummaryDto {
  return {
    verdict: 'INDETERMINATE',
    localFailures: [],
    tripleIssues: [],
    globalIssues: [],
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
  /** مقدار چرخهٔ آخر ثبت‌شده این رابطه در کل پروژه */
  latest: { cycleNo: number; operatorName: string; activityName: string; status: OverlapStatus; overlapDuration: number | null; cycleId: string } | null
}

export async function getElementRelations(elementId: string): Promise<{ elementId: string; elementName: string; rows: ElementRelationRow[] }> {
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

  const rows: ElementRelationRow[] = []
  for (const r of relations) {
    const otherId = r.elementLowId === elementId ? r.elementHighId : r.elementLowId
    const other = otherById.get(otherId)
    let latest: ElementRelationRow['latest'] = null
    if (r.isActive) {
      const lastValue = await db.observationOverlap.findFirst({
        where: { relationId: r.id },
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
  return { elementId, elementName: element.name, rows }
}
