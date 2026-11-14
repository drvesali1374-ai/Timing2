// ═══════════════════════════════════════════════════════════
// سرویس مرکزی روابط موازی عناصر کاری — v1.5.2 بخش سوم §۲
// پس از حذف کامل ماتریس هم‌پوشانی، این سرویس فقط عملیات ضروری
// مدیریت «رابطهٔ موازی» را انجام می‌دهد:
//   • ParallelElementRelation — رابطهٔ دوتایی ساختاری در سطح پروژه (آرشیو نرم)
//   • کاتالوگ عناصر پروژه — منبع مستقل نامزدهای رابطه (ایستگاه←فعالیت←عنصر)
// فرم A، فرم B و برگهٔ زمان‌سنجی هر سه از همین سرویس می‌خوانند؛
// هیچ نسخهٔ کپی یا رکورد معکوس ذخیره نمی‌شود.
// ═══════════════════════════════════════════════════════════
import { db } from '@/lib/db'
import { AppError } from '@/domain/types'
import { recordAudit } from '@/infrastructure/audit'
import { markProjectCalculationsStale } from './calc-stale'

// ─────────────────── انواع DTO ───────────────────

export interface RelationDto {
  id: string
  elementLowId: string
  elementHighId: string
  isActive: boolean
  archiveReason: string | null
  version: number
  createdAt: string
  updatedAt: string
}

export interface CatalogEntry {
  elementId: string
  name: string
  activityId: string
  activityName: string
  stationId: string
  stationName: string
}

export interface ElementsCatalogDto {
  projectId: string
  elementsCatalog: CatalogEntry[]
}

// ─────────────────── کمک‌های داخلی ───────────────────

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

// ─────────────────── رابطه‌ها ───────────────────

export async function listRelations(projectId: string) {
  const relations = await db.parallelElementRelation.findMany({
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
    db.workElement.findUnique({
      where: { id: elementAId },
      select: { id: true, name: true, activityId: true, activity: { select: { station: { select: { projectId: true } } } } },
    }),
    db.workElement.findUnique({
      where: { id: elementBId },
      select: { id: true, name: true, activityId: true, activity: { select: { station: { select: { projectId: true } } } } },
    }),
  ])
  if (!elA || !elB) throw new AppError('ELEMENT_NOT_FOUND', 'عنصر کاری یافت نشد.', 404)
  if (elA.activity.station.projectId !== projectId || elB.activity.station.projectId !== projectId) {
    throw new AppError('WRONG_PROJECT', 'هر دو عنصر باید متعلق به همین پروژه باشند.', 422)
  }
  // v1.5.1 §۶/§۱ — رابطهٔ موازی بین هر دو عنصرِ «یک پروژه» مجاز است؛ حتی اگر در دو
  // Activity یا دو Station متفاوت باشند. اعتبارسنجی‌های حفظ‌شده: وجود هر دو عنصر،
  // تعلق به یک Project، منع خود-رابطه، منع رابطهٔ فعال تکراری و رکورد canonical یکتا.
  const low = elementAId < elementBId ? elementAId : elementBId
  const high = elementAId < elementBId ? elementBId : elementAId
  const existing = await db.parallelElementRelation.findUnique({
    where: { projectId_elementLowId_elementHighId: { projectId, elementLowId: low, elementHighId: high } },
  })
  if (existing?.isActive) {
    throw new AppError('DUPLICATE_RELATION', 'رابطهٔ موازی این دو عنصر از قبل تعریف شده است.', 422)
  }
  const relation = existing
    ? await db.parallelElementRelation.update({
        where: { id: existing.id },
        data: { isActive: true, version: { increment: 1 }, archiveReason: null },
      })
    : await db.parallelElementRelation.create({
        data: { projectId, elementLowId: low, elementHighId: high },
      })
  await markProjectCalculationsStale(projectId)
  await recordAudit({
    entityType: 'ParallelElementRelation',
    entityId: relation.id,
    action: existing ? 'RESTORE' : 'CREATE',
    entityName: `${elA.name} ↔ ${elB.name}`,
    after: { projectId, elementLowId: low, elementHighId: high, isActive: true },
    projectId,
  })
  return serializeRelation(relation)
}

export async function archiveRelation(relationId: string): Promise<RelationDto> {
  const relation = await db.parallelElementRelation.findUnique({ where: { id: relationId } })
  if (!relation) throw new AppError('RELATION_NOT_FOUND', 'رابطه یافت نشد.', 404)
  if (!relation.isActive) return serializeRelation(relation)
  const [elA, elB] = await Promise.all([
    db.workElement.findUnique({ where: { id: relation.elementLowId }, select: { name: true } }),
    db.workElement.findUnique({ where: { id: relation.elementHighId }, select: { name: true } }),
  ])
  const updated = await db.parallelElementRelation.update({
    where: { id: relationId },
    data: { isActive: false, version: { increment: 1 } },
  })
  await markProjectCalculationsStale(relation.projectId)
  await recordAudit({
    entityType: 'ParallelElementRelation',
    entityId: relationId,
    action: 'DELETE',
    entityName: `${elA?.name ?? '?'} ↔ ${elB?.name ?? '?'}`,
    projectId: relation.projectId,
  })
  return serializeRelation(updated)
}

export async function restoreRelation(relationId: string): Promise<RelationDto> {
  const relation = await db.parallelElementRelation.findUnique({ where: { id: relationId } })
  if (!relation) throw new AppError('RELATION_NOT_FOUND', 'رابطه یافت نشد.', 404)
  if (relation.isActive) return serializeRelation(relation)
  // v1.5.1 §۶ — بازگردانی هر رابطهٔ آرشیوشده مجاز است به شرط وجود هر دو عنصر
  // و تعلق آن‌ها به Project رابطه. Cross-Activity بودن فقط برچسب اطلاعاتی است.
  const [elLow, elHigh] = await Promise.all([
    db.workElement.findUnique({ where: { id: relation.elementLowId }, select: { id: true, activity: { select: { station: { select: { projectId: true } } } } } }),
    db.workElement.findUnique({ where: { id: relation.elementHighId }, select: { id: true, activity: { select: { station: { select: { projectId: true } } } } } }),
  ])
  if (!elLow || !elHigh) {
    throw new AppError('ELEMENT_NOT_FOUND', 'یکی از عناصر این رابطه حذف شده است و بازگردانی ممکن نیست.', 422)
  }
  if (elLow.activity.station.projectId !== relation.projectId || elHigh.activity.station.projectId !== relation.projectId) {
    throw new AppError('WRONG_PROJECT', 'عناصر این رابطه به پروژهٔ دیگری منتقل شده‌اند و بازگردانی ممکن نیست.', 422)
  }
  const updated = await db.parallelElementRelation.update({
    where: { id: relationId },
    data: { isActive: true, version: { increment: 1 }, archiveReason: null },
  })
  await markProjectCalculationsStale(relation.projectId)
  await recordAudit({
    entityType: 'ParallelElementRelation',
    entityId: relationId,
    action: 'RESTORE',
    projectId: relation.projectId,
  })
  return serializeRelation(updated)
}

/** حذف عنصر → آرشیو روابط مرجع به آن */
export async function archiveRelationsForElement(elementId: string): Promise<number> {
  const relations = await db.parallelElementRelation.findMany({
    where: { OR: [{ elementLowId: elementId }, { elementHighId: elementId }], isActive: true },
  })
  if (relations.length === 0) return 0
  await db.parallelElementRelation.updateMany({
    where: { id: { in: relations.map((r) => r.id) } },
    data: { isActive: false, version: { increment: 1 } },
  })
  for (const r of relations) {
    await recordAudit({
      entityType: 'ParallelElementRelation',
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
  archiveReason?: string | null
  version: number
  createdAt: Date
  updatedAt: Date
}): RelationDto {
  return {
    id: r.id,
    elementLowId: r.elementLowId,
    elementHighId: r.elementHighId,
    isActive: r.isActive,
    archiveReason: r.archiveReason ?? null,
    version: r.version,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }
}

// ─────────────────── کاتالوگ عناصر پروژه (منبع مستقل نامزدهای رابطه) ───────────────────
// v1.5.2 §۲-۵ — زمان‌سنجی و فرم عناصر دیگر به API ماتریس وابسته نیستند؛
// این کاتالوگ سبک، تمام ایستگاه‌ها/فعالیت‌ها/عناصر پروژه را با شناسه‌های
// واقعی (stationId → activityId → elementId) برمی‌گرداند.

export async function getElementsCatalog(projectId: string): Promise<ElementsCatalogDto> {
  const project = await db.project.findUnique({ where: { id: projectId }, select: { id: true } })
  if (!project) throw new AppError('PROJECT_NOT_FOUND', 'پروژه یافت نشد.', 404)
  const elements = await loadProjectElements(projectId)
  return {
    projectId,
    elementsCatalog: elements.map((e) => ({
      elementId: e.id,
      name: e.name,
      activityId: e.activity.id,
      activityName: e.activity.name,
      stationId: e.activity.station.id,
      stationName: e.activity.station.name,
    })),
  }
}

// ─────────────────── نمای فرم عنصر (منبع واحد) ───────────────────

export interface ElementRelationRow {
  relationId: string
  otherElementId: string
  otherElementName: string
  otherActivityName: string
  otherStationName: string
  isActive: boolean
  /** v1.5.1 §۶ — پرچم اطلاعاتی بین‌فعالیت (بازگردانی مجاز است؛ فقط برچسب UI) */
  crossActivity: boolean
  archiveReason: string | null
}

export async function getElementRelations(
  elementId: string,
): Promise<{ elementId: string; elementName: string; rows: ElementRelationRow[] }> {
  const element = await db.workElement.findUnique({
    where: { id: elementId },
    select: { id: true, name: true, activityId: true, activity: { select: { station: { select: { projectId: true } } } } },
  })
  if (!element) throw new AppError('ELEMENT_NOT_FOUND', 'عنصر کاری یافت نشد.', 404)
  const relations = await db.parallelElementRelation.findMany({
    where: { OR: [{ elementLowId: elementId }, { elementHighId: elementId }] },
    orderBy: { createdAt: 'asc' },
  })
  const otherIds = relations.map((r) => (r.elementLowId === elementId ? r.elementHighId : r.elementLowId))
  const others = await db.workElement.findMany({
    where: { id: { in: otherIds } },
    select: {
      id: true,
      name: true,
      activityId: true,
      activity: { select: { name: true, station: { select: { name: true } } } },
    },
  })
  const otherById = new Map(others.map((o) => [o.id, o]))

  const rows: ElementRelationRow[] = []
  for (const r of relations) {
    const otherId = r.elementLowId === elementId ? r.elementHighId : r.elementLowId
    const other = otherById.get(otherId)
    rows.push({
      relationId: r.id,
      otherElementId: otherId,
      otherElementName: other?.name ?? '؟',
      otherActivityName: other?.activity.name ?? '؟',
      otherStationName: other?.activity.station.name ?? '؟',
      isActive: r.isActive,
      crossActivity: other != null && other.activityId !== element.activityId,
      archiveReason: r.archiveReason ?? null,
    })
  }
  return { elementId, elementName: element.name, rows }
}
