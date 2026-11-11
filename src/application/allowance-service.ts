// ═══════════════════════════════════════════════════════════
// سرویس گروه‌ها و مجازها — FR-04 / FR-15
// • گروه‌های دلخواه فعالیت
// • دسته‌های مجاز در سطح پروژه
// • مقادیر گروه + ارث‌بری فعالیت + بازنویسی با برچسب منبع
// • روش اعمال مجاز در سطح پروژه + اعتبارسنجی A < ۱۰۰٪ برای روش ۲
// ═══════════════════════════════════════════════════════════
import { db } from '@/lib/db'
import { AppError, PROJECT_SETTING_KEYS, DEFAULT_PROJECT_SETTINGS } from '@/domain/types'
import { recordAudit } from '@/infrastructure/audit'
import { markDeleted } from '@/infrastructure/deletion'
import { sumAllowances } from '@/calculation/allowances'
import { getProjectSettings, putProjectSettings } from './settings-service'
import { resolveForActivity } from './effective-allowance-service'
import type { GroupCreateInput, GroupUpdateInput, CategoryCreateInput, CategoryUpdateInput } from '@/domain/validation'

async function assertProject(projectId: string) {
  const p = await db.project.findUnique({ where: { id: projectId }, select: { id: true, name: true } })
  if (!p) throw new AppError('PROJECT_NOT_FOUND', 'پروژه یافت نشد.', 404)
  return p
}

// ── دسته‌های مجاز ──

export async function listCategories(projectId: string) {
  await assertProject(projectId)
  const categories = await db.allowanceCategory.findMany({
    where: { projectId },
    orderBy: { sortOrder: 'asc' },
    include: { _count: { select: { groupAllowances: true, activityAllowanceOverrides: true } } },
  })
  return categories.map((c) => ({
    ...c,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    groupValuesCount: c._count.groupAllowances,
    overrideCount: c._count.activityAllowanceOverrides,
  }))
}

export async function createCategory(projectId: string, input: CategoryCreateInput) {
  await assertProject(projectId)
  const category = await db.allowanceCategory.create({
    data: {
      projectId,
      name: input.name,
      code: input.code ?? null,
      isActive: input.isActive,
      sortOrder: input.sortOrder,
    },
  })
  await recordAudit({
    entityType: 'AllowanceCategory', entityId: category.id, action: 'CREATE', entityName: category.name,
    after: { name: category.name, isActive: category.isActive }, projectId,
  })
  return category
}

export async function updateCategory(categoryId: string, input: CategoryUpdateInput) {
  const existing = await db.allowanceCategory.findUnique({ where: { id: categoryId } })
  if (!existing) throw new AppError('CATEGORY_NOT_FOUND', 'دسته مجاز یافت نشد.', 404)
  if (input.expectedUpdatedAt) {
    const expected = new Date(input.expectedUpdatedAt).getTime()
    if (Math.abs(existing.updatedAt.getTime() - expected) > 1000) {
      throw new AppError('CONFLICT', 'این دسته جای دیگری تغییر کرده؛ تازه‌سازی کنید.', 409)
    }
  }
  const data: Record<string, unknown> = {}
  if (input.name !== undefined) data.name = input.name
  if (input.code !== undefined) data.code = input.code
  if (input.isActive !== undefined) data.isActive = input.isActive
  if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder
  const updated = await db.allowanceCategory.update({ where: { id: categoryId }, data })
  // تغییر دسته فعال بر محاسبات اثر دارد — FR-27
  await db.calculationRun.updateMany({ where: { projectId: existing.projectId }, data: { status: 'STALE' } })
  await recordAudit({
    entityType: 'AllowanceCategory', entityId: categoryId, action: 'UPDATE', entityName: updated.name,
    before: { name: existing.name, isActive: existing.isActive, code: existing.code },
    after: { name: updated.name, isActive: updated.isActive, code: updated.code },
    projectId: existing.projectId,
  })
  return updated
}

export async function deleteCategory(categoryId: string) {
  const existing = await db.allowanceCategory.findUnique({ where: { id: categoryId } })
  if (!existing) throw new AppError('CATEGORY_NOT_FOUND', 'دسته مجاز یافت نشد.', 404)
  const [groupValues, overrides] = await Promise.all([
    db.groupAllowance.count({ where: { categoryId } }),
    db.activityAllowanceOverride.count({ where: { categoryId } }),
  ])
  await db.$transaction(async (tx) => {
    await markDeleted(tx, 'AllowanceCategory', [categoryId])
    await tx.allowanceCategory.delete({ where: { id: categoryId } })
  })
  await recordAudit({
    entityType: 'AllowanceCategory', entityId: categoryId, action: 'DELETE', entityName: existing.name,
    projectId: existing.projectId,
  })
  return { groupValues, overrides }
}

// ── گروه‌های فعالیت ──

export async function listGroups(projectId: string) {
  await assertProject(projectId)
  const groups = await db.activityGroup.findMany({
    where: { projectId },
    orderBy: { createdAt: 'asc' },
    include: {
      groupAllowances: {
        include: { category: true },
      },
      activities: { select: { id: true, name: true, station: { select: { name: true } } } },
    },
  })
  return groups.map((g) => ({
    ...g,
    createdAt: g.createdAt.toISOString(),
    updatedAt: g.updatedAt.toISOString(),
    totalA: sumAllowances(
      g.groupAllowances.filter((ga) => ga.category.isActive).map((ga) => ({ categoryId: ga.categoryId, percentValue: ga.percentValue }))
    ),
  }))
}

export async function createGroup(projectId: string, input: GroupCreateInput) {
  await assertProject(projectId)
  const group = await db.activityGroup.create({
    data: { projectId, name: input.name, description: input.description ?? null },
  })
  await recordAudit({
    entityType: 'ActivityGroup', entityId: group.id, action: 'CREATE', entityName: group.name,
    after: { name: group.name }, projectId,
  })
  return group
}

export async function updateGroup(groupId: string, input: GroupUpdateInput) {
  const existing = await db.activityGroup.findUnique({ where: { id: groupId } })
  if (!existing) throw new AppError('GROUP_NOT_FOUND', 'گروه فعالیت یافت نشد.', 404)
  if (input.expectedUpdatedAt) {
    const expected = new Date(input.expectedUpdatedAt).getTime()
    if (Math.abs(existing.updatedAt.getTime() - expected) > 1000) {
      throw new AppError('CONFLICT', 'این گروه جای دیگری تغییر کرده؛ تازه‌سازی کنید.', 409)
    }
  }
  const data: Record<string, unknown> = {}
  if (input.name !== undefined) data.name = input.name
  if (input.description !== undefined) data.description = input.description
  const updated = await db.activityGroup.update({ where: { id: groupId }, data })
  await recordAudit({
    entityType: 'ActivityGroup', entityId: groupId, action: 'UPDATE', entityName: updated.name,
    before: { name: existing.name, description: existing.description },
    after: { name: updated.name, description: updated.description },
    projectId: existing.projectId,
  })
  return updated
}

export async function deleteGroup(groupId: string) {
  const existing = await db.activityGroup.findUnique({ where: { id: groupId }, include: { activities: { select: { id: true, name: true } } } })
  if (!existing) throw new AppError('GROUP_NOT_FOUND', 'گروه فعالیت یافت نشد.', 404)
  const [values, activities] = [
    await db.groupAllowance.count({ where: { groupId } }),
    existing.activities.length,
  ]
  await db.$transaction(async (tx) => {
    await markDeleted(tx, 'ActivityGroup', [groupId])
    await tx.activityGroup.delete({ where: { id: groupId } }) // فعالیت‌ها با SetNull گروه را از دست می‌دهند
  })
  await recordAudit({
    entityType: 'ActivityGroup', entityId: groupId, action: 'DELETE', entityName: existing.name,
    projectId: existing.projectId,
  })
  return { values, activities }
}

// ── مدیریت گروه‌های فعالیت — فقط طبقه‌بندی (سند جلسه اول §۵) ──
// پس از migration، GroupAllowance دیگر منبع دوم محاسبه نیست؛
// مقادیر مجاز از مدل سلسله‌مراتبی جدید (effective-allowance-service) خوانده می‌شوند.

/** تنظیمات محاسباتی پروژه — FR-15 / ۱۰.۱ */
export async function getCalcSettings(projectId: string) {
  await assertProject(projectId)
  const settings = await getProjectSettings(projectId)
  return {
    allowanceMethod: settings[PROJECT_SETTING_KEYS.allowanceMethod] ?? DEFAULT_PROJECT_SETTINGS[PROJECT_SETTING_KEYS.allowanceMethod],
    aggregationMethod: settings[PROJECT_SETTING_KEYS.aggregationMethod] ?? DEFAULT_PROJECT_SETTINGS[PROJECT_SETTING_KEYS.aggregationMethod],
  }
}

export async function putCalcSettings(
  projectId: string,
  input: { allowanceMethod?: string; aggregationMethod?: string }
) {
  await assertProject(projectId)
  const values: Record<string, string> = {}
  if (input.allowanceMethod) values[PROJECT_SETTING_KEYS.allowanceMethod] = input.allowanceMethod
  if (input.aggregationMethod) values[PROJECT_SETTING_KEYS.aggregationMethod] = input.aggregationMethod
  await putProjectSettings(projectId, values)

  // تغییر روش محاسبه → نتایج قبلی نیازمند محاسبه مجدد (Snapshot حفظ می‌شود) — FR-27
  await db.calculationRun.updateMany({ where: { projectId }, data: { status: 'STALE' } })

  // اگر روش ۲ انتخاب شده، تمام عناصر را از نظر P < ۱۰۰٪ بازبینی کن — FR-15 + جلسه اول §۳
  if (input.allowanceMethod === 'SHARE_OF_ST') {
    const activities = await db.activity.findMany({ where: { station: { projectId } }, select: { id: true, name: true } })
    const violations: { activityId: string; activityName: string; totalA: number }[] = []
    for (const a of activities) {
      const resolution = await resolveForActivity(a.id)
      for (const [, elRes] of resolution.elements) {
        if (elRes.summary.totalPercent >= 1) {
          violations.push({ activityId: a.id, activityName: a.name, totalA: elRes.summary.totalPercent })
          break // یک عنصر متخلف برای هر فعالیت کافی است
        }
      }
    }
    if (violations.length > 0) {
      await putProjectSettings(projectId, { [PROJECT_SETTING_KEYS.allowanceMethod]: 'PERCENT_OF_NT' })
      throw new AppError(
        'ALLOWANCE_TOO_HIGH',
        `در روش «سهم از زمان استاندارد» مجموع مجازها باید کمتر از ۱۰۰٪ باشد. ${violations.length} فعالیت دارای مجموع غیرمجاز است و تغییر روش اعمال نشد: ${violations.map((v) => v.activityName).join('، ')}`,
        422,
        { violations }
      )
    }
  }

  await recordAudit({
    entityType: 'Project', entityId: projectId, action: 'UPDATE', entityName: 'تنظیمات محاسبات',
    after: input, projectId,
  })
  return getCalcSettings(projectId)
}
