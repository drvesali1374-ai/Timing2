// ═══════════════════════════════════════════════════════════
// سرویس مدیریت پروژه — FR-01 / FR-26 / FR-27
// ایجاد (با جدول Seed وستینگهاوس)، ویرایش، حذف دائمی اتمیک
// با نشانگذاری فرزندان، نهایی‌سازی، شمارش وابستگی‌ها
// ═══════════════════════════════════════════════════════════
import { db } from '@/lib/db'
import { AppError, DEFAULT_PROJECT_SETTINGS, FORMULA_VERSION } from '@/domain/types'
import { recordAudit } from '@/infrastructure/audit'
import { collectProjectTreeIds, markDeleted } from '@/infrastructure/deletion'
import { WESTINGHOUSE_SEED_GRADES, WESTINGHOUSE_SEED_META } from '@/infrastructure/seed-data'
import { computeStageSummary } from './stage-status'
import type { ProjectCreateInput, ProjectUpdateInput } from '@/domain/validation'

export interface ProjectListItem {
  id: string
  name: string
  lineName: string
  productName: string
  studyDate: string | null
  status: string
  description: string | null
  createdAt: string
  updatedAt: string
  counts: { stations: number; activities: number; elements: number; operators: number }
  progress: number
  finalized: boolean
}

/** فهرست پروژه‌ها با جست‌وجو و مرتب‌سازی — FR-01 */
export async function listProjects(params: { q?: string; sort?: string; dir?: 'asc' | 'desc' }): Promise<ProjectListItem[]> {
  const q = params.q?.trim()
  const where = q
    ? {
        OR: [
          { name: { contains: q } },
          { lineName: { contains: q } },
          { productName: { contains: q } },
        ],
      }
    : {}

  const projects = await db.project.findMany({ where, orderBy: { createdAt: 'desc' } })

  const items = await Promise.all(
    projects.map(async (p) => {
      const [stations, activities, elements, operators] = await Promise.all([
        db.station.count({ where: { projectId: p.id } }),
        db.activity.count({ where: { station: { projectId: p.id } } }),
        db.workElement.count({ where: { activity: { station: { projectId: p.id } } } }),
        db.operator.count({ where: { projectId: p.id } }),
      ])
      const summary = await computeStageSummary(p.id)
      return {
        id: p.id,
        name: p.name,
        lineName: p.lineName,
        productName: p.productName,
        studyDate: p.studyDate,
        status: p.status,
        description: p.description,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
        counts: { stations, activities, elements, operators },
        progress: summary.progress,
        finalized: summary.counts.finalized,
      }
    })
  )

  const dir = params.dir === 'asc' ? 1 : -1
  const sort = params.sort ?? 'recent'
  items.sort((a, b) => {
    switch (sort) {
      case 'name':
        return a.name.localeCompare(b.name, 'fa') * (dir === 1 ? 1 : -1)
      case 'progress':
        return (a.progress - b.progress) * dir
      case 'status':
        return (a.status.localeCompare(b.status) * (a.status === b.status ? 0 : 1)) * dir
      default:
        return (new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()) * (dir === 1 ? -1 : 1)
    }
  })
  return items
}

/** جزئیات یک پروژه با شمارش وابستگی‌ها (برای حذف تأییدشده — FR-26) */
export async function getProjectDetail(projectId: string) {
  const project = await db.project.findUnique({
    where: { id: projectId },
    include: { finalization: true, settings: true },
  })
  if (!project) throw new AppError('PROJECT_NOT_FOUND', 'پروژه یافت نشد.', 404)

  const [stations, activities, elements, operators, groups, sessions, observations, summaries] =
    await Promise.all([
      db.station.count({ where: { projectId } }),
      db.activity.count({ where: { station: { projectId } } }),
      db.workElement.count({ where: { activity: { station: { projectId } } } }),
      db.operator.count({ where: { projectId } }),
      db.activityGroup.count({ where: { projectId } }),
      db.studySession.count({ where: { activity: { station: { projectId } } } }),
      db.elementObservation.count({ where: { cycle: { session: { activity: { station: { projectId } } } } } }),
      computeStageSummary(projectId),
    ])

  return {
    project: {
      id: project.id,
      name: project.name,
      lineName: project.lineName,
      productName: project.productName,
      studyDate: project.studyDate,
      status: project.status,
      description: project.description,
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
      settings: Object.fromEntries(project.settings.map((s) => [s.key, s.value])),
    },
    dependencyCounts: { stations, activities, elements, operators, groups, sessions, observations },
    stageSummary: summaries,
  }
}

/** ایجاد پروژه — همراه با جدول Seed وستینگهاوس و تنظیمات پیش‌فرض — FR-01/FR-13 */
export async function createProject(input: ProjectCreateInput) {
  const project = await db.project.create({
    data: {
      name: input.name,
      lineName: input.lineName,
      productName: input.productName,
      studyDate: input.studyDate ?? null,
      description: input.description ?? null,
      status: 'IN_PROGRESS',
    },
  })

  // تنظیمات پیش‌فرض پروژه — FR-15 / ۱۰.۱
  await db.projectSetting.createMany({
    data: Object.entries(DEFAULT_PROJECT_SETTINGS).map(([key, value]) => ({ projectId: project.id, key, value })),
  })

  // جدول مرجع اولیه وستینگهاوس — FR-13 (Seed قابل بازبینی)
  const ratingTable = await db.ratingTable.create({
    data: {
      projectId: project.id,
      name: WESTINGHOUSE_SEED_META.name,
      version: 1,
      source: WESTINGHOUSE_SEED_META.source,
      notes: WESTINGHOUSE_SEED_META.notes,
      isDefault: true,
    },
  })
  await db.ratingTableGrade.createMany({
    data: WESTINGHOUSE_SEED_GRADES.map((g) => ({
      ratingTableId: ratingTable.id,
      factor: g.factor,
      gradeCode: g.gradeCode,
      label: g.label,
      value: g.value,
      hint: g.hint,
      sortOrder: g.sortOrder,
    })),
  })

  await recordAudit({
    entityType: 'Project',
    entityId: project.id,
    action: 'CREATE',
    entityName: project.name,
    after: { name: project.name, lineName: project.lineName, productName: project.productName },
    projectId: project.id,
  })
  return project
}

/** ویرایش پروژه با کنترل هم‌زمانی (UpdatedAt) — ۶.۶ */
export async function updateProject(projectId: string, input: ProjectUpdateInput) {
  const existing = await db.project.findUnique({ where: { id: projectId } })
  if (!existing) throw new AppError('PROJECT_NOT_FOUND', 'پروژه یافت نشد.', 404)

  if (input.expectedUpdatedAt) {
    const expected = new Date(input.expectedUpdatedAt).getTime()
    if (Math.abs(existing.updatedAt.getTime() - expected) > 1000) {
      throw new AppError(
        'CONFLICT',
        'این پروژه در جای دیگری تغییر کرده است؛ صفحه را تازه‌سازی کنید و تغییرات را بازبینی نمایید.',
        409,
        { serverUpdatedAt: existing.updatedAt.toISOString() }
      )
    }
  }

  const data: Record<string, unknown> = {}
  const changed: Record<string, unknown> = {}
  for (const key of ['name', 'lineName', 'productName', 'studyDate', 'description', 'status'] as const) {
    if (input[key] !== undefined) {
      data[key] = input[key]
      changed[key] = { from: (existing as unknown as Record<string, unknown>)[key], to: input[key] }
    }
  }

  const updated = await db.project.update({ where: { id: projectId }, data })

  if (Object.keys(changed).length > 0) {
    await recordAudit({
      entityType: 'Project',
      entityId: projectId,
      action: 'UPDATE',
      entityName: updated.name,
      before: Object.fromEntries(Object.entries(changed).map(([k, v]) => [k, (v as { from: unknown }).from])),
      after: Object.fromEntries(Object.entries(changed).map(([k, v]) => [k, (v as { to: unknown }).to])),
      projectId,
    })
  }
  return updated
}

/** حذف دائمی پروژه — تراکنش اتمیک + نشانگذاری تمام فرزندان — FR-26 */
export async function deleteProject(projectId: string) {
  const project = await db.project.findUnique({ where: { id: projectId } })
  if (!project) throw new AppError('PROJECT_NOT_FOUND', 'پروژه یافت نشد.', 404)

  const treeIds = await collectProjectTreeIds(projectId)

  await db.$transaction(async (tx) => {
    // نشانگذاری همه موجودیت‌های در حال حذف (جلوگیری از بازگردانی ناخواسته در Restore)
    for (const [entityType, ids] of Object.entries(treeIds)) {
      await markDeleted(tx, entityType, ids)
    }
    // ارزیابی‌ها را پیش از cascade جدول‌های وستینگهاوس حذف کن (قید Restrict — FR-13)
    await tx.ratingAssessment.deleteMany({
      where: { workElement: { activity: { station: { projectId } } } },
    })
    // حذف اتمیک (Cascade کلیدهای خارجی)
    await tx.project.delete({ where: { id: projectId } })
  })

  // Audit حداقلی حذف — بدون کپی محتوای حذف‌شده — FR-26
  await recordAudit({
    entityType: 'Project',
    entityId: projectId,
    action: 'DELETE',
    entityName: project.name,
  })
}

/** نهایی‌سازی مطالعه — ویرایش قفل نمی‌شود — FR-27 / FR-12 */
export async function finalizeProject(projectId: string, reason: string | null) {
  const project = await db.project.findUnique({ where: { id: projectId } })
  if (!project) throw new AppError('PROJECT_NOT_FOUND', 'پروژه یافت نشد.', 404)

  const existing = await db.finalizationInfo.findUnique({ where: { projectId } })
  if (existing) {
    throw new AppError('ALREADY_FINALIZED', 'این مطالعه قبلاً نهایی شده است.', 409)
  }

  await db.$transaction(async (tx) => {
    await tx.finalizationInfo.create({ data: { projectId, reason } })
    await tx.project.update({ where: { id: projectId }, data: { status: 'FINALIZED' } })
    await tx.auditEvent.create({
      data: {
        entityType: 'Project',
        entityId: projectId,
        action: 'FINALIZE',
        entityName: project.name,
        afterJson: JSON.stringify({ reason }),
        projectId,
        actor: 'کاربر محلی',
      },
    })
    // تغییر پس از نهایی‌سازی → وضعیت نیاز به محاسبه مجدد (نسخه فاز ۴ فعال می‌شود)
    await tx.calculationRun.updateMany({ where: { projectId }, data: { status: 'STALE' } })
  })
}

/** بازگشت از نهایی‌سازی (ویرایش همیشه باز است — FR-27) */
export async function unfinalizeProject(projectId: string) {
  await db.$transaction(async (tx) => {
    await tx.finalizationInfo.deleteMany({ where: { projectId } })
    await tx.project.updateMany({ where: { id: projectId }, data: { status: 'IN_PROGRESS' } })
  })
  await recordAudit({
    entityType: 'Project',
    entityId: projectId,
    action: 'UPDATE',
    entityName: 'بازگشت از نهایی‌سازی',
    after: { unfinalized: true },
    projectId,
  })
}

/** ثبت نسخه فرمول فعال پروژه (برای snapshot فاز ۴) */
export async function touchCalculationStale(projectId: string): Promise<void> {
  await db.calculationRun.updateMany({ where: { projectId }, data: { status: 'STALE' } })
}

export const PROJECT_FORMULA_VERSION = FORMULA_VERSION
