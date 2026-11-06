// ═══════════════════════════════════════════════════════════
// سرویس گروه‌ها و مجازها — FR-04 / FR-15
// • گروه‌های دلخواه فعالیت
// • دسته‌های مجاز در سطح پروژه
// • مقادیر گروه + ارث‌بری فعالیت + بازنویسی با برچسب منبع
// • روش اعمال مجاز در سطح پروژه + اعتبارسنجی A < ۱۰۰٪ برای روش ۲
// ═══════════════════════════════════════════════════════════
import { db } from '@/lib/db'
import { AppError, ALLOWANCE_METHOD_LABELS, ALLOWANCE_METHOD_FORMULAS, PROJECT_SETTING_KEYS, DEFAULT_PROJECT_SETTINGS } from '@/domain/types'
import { recordAudit } from '@/infrastructure/audit'
import { markDeleted } from '@/infrastructure/deletion'
import { sumAllowances, validateAllowanceTotal } from '@/calculation/allowances'
import { getProjectSettings, putProjectSettings } from './settings-service'
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

/** مقادیر مجاز یک گروه (همه دسته‌های فعال پروژه + مقدار ثبت‌شده) */
export async function getGroupAllowances(groupId: string) {
  const group = await db.activityGroup.findUnique({ where: { id: groupId }, include: { groupAllowances: true } })
  if (!group) throw new AppError('GROUP_NOT_FOUND', 'گروه فعالیت یافت نشد.', 404)
  const categories = await db.allowanceCategory.findMany({
    where: { projectId: group.projectId },
    orderBy: { sortOrder: 'asc' },
  })
  return {
    group: { id: group.id, name: group.name },
    values: categories.map((c) => {
      const ga = group.groupAllowances.find((x) => x.categoryId === c.id)
      return {
        categoryId: c.id,
        name: c.name,
        code: c.code,
        isActive: c.isActive,
        percentValue: ga?.percentValue ?? null,
      }
    }),
    totalA: sumAllowances(
      categories
        .filter((c) => c.isActive)
        .map((c) => {
          const ga = group.groupAllowances.find((x) => x.categoryId === c.id)
          return { categoryId: c.id, percentValue: ga?.percentValue ?? 0 }
        })
    ),
  }
}

/** ثبت مقادیر مجاز گروه (upsert هر دسته) */
export async function putGroupAllowances(
  groupId: string,
  values: { categoryId: string; percentValue: number | null }[]
) {
  const group = await db.activityGroup.findUnique({ where: { id: groupId } })
  if (!group) throw new AppError('GROUP_NOT_FOUND', 'گروه فعالیت یافت نشد.', 404)

  await db.$transaction(async (tx) => {
    for (const v of values) {
      const category = await tx.allowanceCategory.findUnique({ where: { id: v.categoryId } })
      if (!category || category.projectId !== group.projectId) {
        throw new AppError('CATEGORY_NOT_IN_PROJECT', 'یکی از دسته‌های انتخاب‌شده به این پروژه تعلق ندارد.', 422)
      }
      if (v.percentValue === null) {
        await tx.groupAllowance.deleteMany({ where: { groupId, categoryId: v.categoryId } })
      } else {
        await tx.groupAllowance.upsert({
          where: { groupId_categoryId: { groupId, categoryId: v.categoryId } },
          create: { groupId, categoryId: v.categoryId, percentValue: v.percentValue },
          update: { percentValue: v.percentValue },
        })
      }
    }
  })
  // تغییر مجازها بر محاسبات اثر دارد — FR-27
  await db.calculationRun.updateMany({ where: { projectId: group.projectId }, data: { status: 'STALE' } })
  await recordAudit({
    entityType: 'ActivityGroup', entityId: groupId, action: 'UPDATE', entityName: group.name,
    after: { allowances: values }, projectId: group.projectId,
  })
  return getGroupAllowances(groupId)
}

// ── مجازهای مؤثر فعالیت (ارث + بازنویسی) — FR-04 ──

export interface EffectiveAllowance {
  method: string
  methodLabel: string
  formula: string
  hasGroup: boolean
  groupId: string | null
  groupName: string | null
  totalA: number
  categories: {
    categoryId: string
    name: string
    code: string | null
    isActive: boolean
    source: 'GROUP' | 'OVERRIDE' | 'NONE'
    sourceLabel: string
    groupValue: number | null
    overrideValue: number | null
    effectiveValue: number | null
  }[]
}

/** مجازهای مؤثر یک فعالیت با برچسب منبع هر مقدار — FR-04 */
export async function getEffectiveAllowances(activityId: string): Promise<EffectiveAllowance> {
  const activity = await db.activity.findUnique({
    where: { id: activityId },
    include: {
      group: { include: { groupAllowances: true } },
      allowanceOverrides: true,
      station: { select: { project: { select: { id: true } } } },
    },
  })
  if (!activity) throw new AppError('ACTIVITY_NOT_FOUND', 'فعالیت یافت نشد.', 404)

  const projectId = activity.station.project.id
  const settings = await getProjectSettings(projectId)
  const method = settings[PROJECT_SETTING_KEYS.allowanceMethod] ?? DEFAULT_PROJECT_SETTINGS[PROJECT_SETTING_KEYS.allowanceMethod]

  const categories = await db.allowanceCategory.findMany({
    where: { projectId },
    orderBy: { sortOrder: 'asc' },
  })

  const cats: EffectiveAllowance['categories'] = categories.map((c) => {
    const groupValue = activity.group?.groupAllowances.find((g) => g.categoryId === c.id)?.percentValue ?? null
    const override = activity.allowanceOverrides.find((o) => o.categoryId === c.id)
    const overrideValue = override?.percentValue ?? null
    let source: 'GROUP' | 'OVERRIDE' | 'NONE' = 'NONE'
    let sourceLabel = 'بدون مقدار'
    let effectiveValue: number | null = null
    if (overrideValue !== null) {
      source = 'OVERRIDE'
      sourceLabel = 'اختصاصی فعالیت (بازنویسی)'
      effectiveValue = overrideValue
    } else if (groupValue !== null) {
      source = 'GROUP'
      sourceLabel = `ارث‌رسیده از گروه «${activity.group?.name ?? ''}»`
      effectiveValue = groupValue
    }
    return {
      categoryId: c.id,
      name: c.name,
      code: c.code,
      isActive: c.isActive,
      source,
      sourceLabel,
      groupValue,
      overrideValue,
      effectiveValue,
    }
  })

  const totalA = sumAllowances(
    cats.filter((c) => c.isActive && c.effectiveValue !== null).map((c) => ({ categoryId: c.categoryId, percentValue: c.effectiveValue ?? 0 }))
  )

  return {
    method,
    methodLabel: ALLOWANCE_METHOD_LABELS[method as keyof typeof ALLOWANCE_METHOD_LABELS] ?? method,
    formula: ALLOWANCE_METHOD_FORMULAS[method as keyof typeof ALLOWANCE_METHOD_FORMULAS] ?? '',
    hasGroup: Boolean(activity.group),
    groupId: activity.groupId,
    groupName: activity.group?.name ?? null,
    totalA,
    categories: cats,
  }
}

/** ثبت بازنویسی‌های فعالیت — با اعتبارسنجی روش ۲ (A < ۱۰۰٪) — FR-15 */
export async function putActivityAllowances(
  activityId: string,
  overrides: { categoryId: string; percentValue: number | null }[],
  expectedUpdatedAt?: string
) {
  const activity = await db.activity.findUnique({ where: { id: activityId }, include: { station: { select: { project: { select: { id: true } } } } } })
  if (!activity) throw new AppError('ACTIVITY_NOT_FOUND', 'فعالیت یافت نشد.', 404)
  if (expectedUpdatedAt) {
    const expected = new Date(expectedUpdatedAt).getTime()
    if (Math.abs(activity.updatedAt.getTime() - expected) > 1000) {
      throw new AppError('CONFLICT', 'این فعالیت جای دیگری تغییر کرده؛ تازه‌سازی کنید.', 409)
    }
  }
  const projectId = activity.station.project.id

  await db.$transaction(async (tx) => {
    for (const v of overrides) {
      const category = await tx.allowanceCategory.findUnique({ where: { id: v.categoryId } })
      if (!category || category.projectId !== projectId) {
        throw new AppError('CATEGORY_NOT_IN_PROJECT', 'یکی از دسته‌های انتخاب‌شده به این پروژه تعلق ندارد.', 422)
      }
      if (v.percentValue === null) {
        await tx.activityAllowanceOverride.deleteMany({ where: { activityId, categoryId: v.categoryId } })
      } else {
        await tx.activityAllowanceOverride.upsert({
          where: { activityId_categoryId: { activityId, categoryId: v.categoryId } },
          create: { activityId, categoryId: v.categoryId, percentValue: v.percentValue },
          update: { percentValue: v.percentValue },
        })
      }
    }
  })

  // اعتبارسنجی مجموع پس از تغییر — FR-15
  const effective = await getEffectiveAllowances(activityId)
  validateAllowanceTotal(effective.totalA, effective.method as 'PERCENT_OF_NT' | 'SHARE_OF_ST')

  await db.calculationRun.updateMany({ where: { projectId }, data: { status: 'STALE' } })
  await recordAudit({
    entityType: 'Activity', entityId: activityId, action: 'UPDATE', entityName: activity.name,
    after: { allowanceOverrides: overrides }, projectId,
  })
  return effective
}

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

  // اگر روش ۲ انتخاب شده، تمام فعالیت‌ها را از نظر A < ۱۰۰٪ بازبینی کن — FR-15
  if (input.allowanceMethod === 'SHARE_OF_ST') {
    const activities = await db.activity.findMany({ where: { station: { projectId } }, select: { id: true, name: true } })
    const violations: { activityId: string; activityName: string; totalA: number }[] = []
    for (const a of activities) {
      const eff = await getEffectiveAllowances(a.id)
      if (eff.totalA >= 1) violations.push({ activityId: a.id, activityName: a.name, totalA: eff.totalA })
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
