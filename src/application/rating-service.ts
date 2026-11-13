// ═══════════════════════════════════════════════════════════
// سرویس وستینگهاوس — FR-13
// • جدول مرجع نسخه‌دار (Seed قابل ویرایش؛ ذخیره نسخه جدید)
// • ارزیابی در سطح عنصر کاری — مشترک برای تمام مشاهدات همان عنصر
// • R = 1 + Skill + Effort + Conditions + Consistency (موتور محاسبات)
// • کپی ارزیابی از عنصر مشابه
// ═══════════════════════════════════════════════════════════
import { db } from '@/lib/db'
import { AppError } from '@/domain/types'
import { computeRatingFactor } from '@/calculation/westinghouse'
import { recordAudit } from '@/infrastructure/audit'
import { markDeleted } from '@/infrastructure/deletion'
import type { RatingTableCreateInput, AssessmentPutInput } from '@/domain/validation'

async function assertProject(projectId: string) {
  const p = await db.project.findUnique({ where: { id: projectId }, select: { id: true } })
  if (!p) throw new AppError('PROJECT_NOT_FOUND', 'پروژه یافت نشد.', 404)
  return p
}

/** فهرست جدول‌های پروژه با نسخه و منبع — FR-13 */
export async function listRatingTables(projectId: string) {
  await assertProject(projectId)
  const tables = await db.ratingTable.findMany({
    where: { projectId },
    orderBy: { createdAt: 'asc' },
    include: { _count: { select: { grades: true, assessments: true } } },
  })
  return tables.map((t) => ({
    ...t,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    gradesCount: t._count.grades,
    assessmentsCount: t._count.assessments,
  }))
}

/** جزئیات جدول با تمام درجه‌ها */
export async function getRatingTable(tableId: string) {
  const table = await db.ratingTable.findUnique({
    where: { id: tableId },
    include: { grades: { orderBy: [{ factor: 'asc' }, { sortOrder: 'asc' }] } },
  })
  if (!table) throw new AppError('RATING_TABLE_NOT_FOUND', 'جدول ارزیابی یافت نشد.', 404)
  return {
    ...table,
    createdAt: table.createdAt.toISOString(),
    updatedAt: table.updatedAt.toISOString(),
    grades: table.grades,
  }
}

/** ایجاد جدول جدید یا نسخه جدید از جدول موجود — FR-13
 *  تغییر جدول نباید محاسبات تاریخی را بی‌صدا تغییر دهد؛
 *  نسخه جدید رکورد مستقل است و ارزیابی‌های قدیمی به نسخه قبلی ارجاع دارند */
export async function createRatingTable(projectId: string, input: RatingTableCreateInput) {
  await assertProject(projectId)

  // اگر بر اساس جدول موجود است، مقادیر پیش‌فرض از آن پر می‌شود (فرانت تأیید گرفته است)
  const baseGrades = input.grades

  const maxVersion = await db.ratingTable.aggregate({
    where: { projectId },
    _max: { version: true },
  })

  const result = await db.$transaction(async (tx) => {
    if (input.makeDefault) {
      await tx.ratingTable.updateMany({ where: { projectId }, data: { isDefault: false } })
    }
    const table = await tx.ratingTable.create({
      data: {
        projectId,
        name: input.name,
        version: (maxVersion._max.version ?? 0) + 1,
        source: input.source ?? null,
        notes: input.notes ?? null,
        isDefault: input.makeDefault,
      },
    })
    await tx.ratingTableGrade.createMany({
      data: baseGrades.map((g) => ({
        ratingTableId: table.id,
        factor: g.factor,
        gradeCode: g.gradeCode,
        label: g.label,
        value: g.value,
        hint: g.hint ?? null,
        sortOrder: g.sortOrder,
      })),
    })
    return table
  })

  await recordAudit({
    entityType: 'RatingTable', entityId: result.id, action: 'CREATE', entityName: result.name,
    after: { name: result.name, version: result.version, gradesCount: baseGrades.length }, projectId,
  })
  return result
}

/** ویرایش فراداده جدول (نام/منبع/پیش‌فرض) — مقادیر درجه‌ها فقط با نسخه جدید */
export async function updateRatingTable(
  tableId: string,
  input: { name?: string; source?: string | null; notes?: string | null; isDefault?: boolean; expectedUpdatedAt?: string }
) {
  const existing = await db.ratingTable.findUnique({ where: { id: tableId } })
  if (!existing) throw new AppError('RATING_TABLE_NOT_FOUND', 'جدول ارزیابی یافت نشد.', 404)
  if (input.expectedUpdatedAt) {
    const expected = new Date(input.expectedUpdatedAt).getTime()
    if (Math.abs(existing.updatedAt.getTime() - expected) > 1000) {
      throw new AppError('CONFLICT', 'این جدول جای دیگری تغییر کرده؛ تازه‌سازی کنید.', 409)
    }
  }
  const updated = await db.$transaction(async (tx) => {
    if (input.isDefault === true) {
      await tx.ratingTable.updateMany({ where: { projectId: existing.projectId }, data: { isDefault: false } })
    }
    return tx.ratingTable.update({
      where: { id: tableId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.source !== undefined ? { source: input.source } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.isDefault !== undefined ? { isDefault: input.isDefault } : {}),
      },
    })
  })
  await recordAudit({
    entityType: 'RatingTable', entityId: tableId, action: 'UPDATE', entityName: updated.name,
    before: { name: existing.name, source: existing.source, isDefault: existing.isDefault },
    after: { name: updated.name, source: updated.source, isDefault: updated.isDefault },
    projectId: existing.projectId,
  })
  return updated
}

/** حذف جدول — اگر ارزیابی‌ای به آن ارجاع دارد، ممنوع (حفظ سلامت تاریخی) */
export async function deleteRatingTable(tableId: string) {
  const existing = await db.ratingTable.findUnique({
    where: { id: tableId },
    include: { _count: { select: { assessments: true } } },
  })
  if (!existing) throw new AppError('RATING_TABLE_NOT_FOUND', 'جدول ارزیابی یافت نشد.', 404)
  if (existing._count.assessments > 0) {
    throw new AppError(
      'RATING_TABLE_IN_USE',
      `این جدول توسط ${existing._count.assessments} ارزیابی در حال استفاده است و حذف آن سلامت محاسبات تاریخی را به خطر می‌اندازد. به‌جای ویرایش مقادیر، «نسخه جدید» بسازید.`,
      409
    )
  }
  await db.$transaction(async (tx) => {
    await markDeleted(tx, 'RatingTable', [tableId])
    await tx.ratingTable.delete({ where: { id: tableId } })
  })
  await recordAudit({
    entityType: 'RatingTable', entityId: tableId, action: 'DELETE', entityName: existing.name,
    projectId: existing.projectId,
  })
}

/** ارزیابی یک عنصر — فرم R و جدول در حال استفاده — FR-13 */
export async function getElementRating(elementId: string) {
  const element = await db.workElement.findUnique({
    where: { id: elementId },
    include: {
      activity: { include: { station: { select: { project: { select: { id: true } } } } } },
      rating: { include: { ratingTable: { select: { id: true, name: true, version: true, source: true } } } },
    },
  })
  if (!element) throw new AppError('ELEMENT_NOT_FOUND', 'عنصر کاری یافت نشد.', 404)
  return {
    element: { id: element.id, name: element.name },
    projectId: element.activity.station.project.id,
    assessment: element.rating
      ? {
          ratingTableId: element.rating.ratingTableId,
          ratingTableName: element.rating.ratingTable.name,
          ratingTableVersion: element.rating.ratingTable.version,
          ratingTableSource: element.rating.ratingTable.source,
          skillGrade: element.rating.skillGrade,
          effortGrade: element.rating.effortGrade,
          conditionsGrade: element.rating.conditionsGrade,
          consistencyGrade: element.rating.consistencyGrade,
          skillValue: element.rating.skillValue,
          effortValue: element.rating.effortValue,
          conditionsValue: element.rating.conditionsValue,
          consistencyValue: element.rating.consistencyValue,
          totalFactor: element.rating.totalFactor,
          notes: element.rating.notes,
        }
      : null,
  }
}

/** ثبت/به‌روزرسانی ارزیابی عنصر — محاسبه R با موتور محاسبات */
export async function putElementRating(elementId: string, input: AssessmentPutInput) {
  const element = await db.workElement.findUnique({
    where: { id: elementId },
    include: { activity: { include: { station: { select: { project: { select: { id: true } } } } } } },
  })
  if (!element) throw new AppError('ELEMENT_NOT_FOUND', 'عنصر کاری یافت نشد.', 404)
  const projectId = element.activity.station.project.id

  // جدول باید به همین پروژه تعلق داشته باشد — FR-13
  const table = await db.ratingTable.findUnique({
    where: { id: input.ratingTableId },
    include: { grades: true },
  })
  if (!table || table.projectId !== projectId) {
    throw new AppError('RATING_TABLE_NOT_IN_PROJECT', 'جدول ارزیابی به این پروژه تعلق ندارد.', 422)
  }

  // اگر کپی از عنصر دیگر درخواست شده، درجه‌ها از آن عنصر خوانده می‌شود — FR-13
  let gradesInput = {
    skillGrade: input.skillGrade,
    effortGrade: input.effortGrade,
    conditionsGrade: input.conditionsGrade,
    consistencyGrade: input.consistencyGrade,
  }
  if (input.copyFromElementId) {
    const source = await db.ratingAssessment.findUnique({
      where: { workElementId: input.copyFromElementId },
    })
    if (!source) {
      throw new AppError('SOURCE_ASSESSMENT_NOT_FOUND', 'عنصر مبدأ برای کپی ارزیابی، ارزیابی ثبت‌شده ندارد.', 422)
    }
    gradesInput = {
      skillGrade: source.skillGrade,
      effortGrade: source.effortGrade,
      conditionsGrade: source.conditionsGrade,
      consistencyGrade: source.consistencyGrade,
    }
  }

  // استخراج مقادیر از درجه‌های جدول انتخابی
  const gradeValue = (factor: string, code: string | null): number => {
    if (!code) return 0
    const g = table.grades.find((x) => x.factor === factor && x.gradeCode === code)
    if (!g) {
      const factorLabel: Record<string, string> = { SKILL: 'مهارت', EFFORT: 'تلاش', CONDITIONS: 'شرایط', CONSISTENCY: 'یکنواختی' }
      throw new AppError(
        'GRADE_NOT_FOUND',
        `درجه «${code}» برای عامل «${factorLabel[factor]}» در جدول انتخاب‌شده وجود ندارد.`,
        422
      )
    }
    return g.value
  }

  const skillValue = gradeValue('SKILL', gradesInput.skillGrade)
  const effortValue = gradeValue('EFFORT', gradesInput.effortGrade)
  const conditionsValue = gradeValue('CONDITIONS', gradesInput.conditionsGrade)
  const consistencyValue = gradeValue('CONSISTENCY', gradesInput.consistencyGrade)
  const totalFactor = computeRatingFactor({ skill: skillValue, effort: effortValue, conditions: conditionsValue, consistency: consistencyValue })

  const existing = await db.ratingAssessment.findUnique({ where: { workElementId: elementId } })

  const assessment = await db.ratingAssessment.upsert({
    where: { workElementId: elementId },
    create: {
      workElementId: elementId,
      ratingTableId: table.id,
      skillGrade: gradesInput.skillGrade,
      effortGrade: gradesInput.effortGrade,
      conditionsGrade: gradesInput.conditionsGrade,
      consistencyGrade: gradesInput.consistencyGrade,
      skillValue,
      effortValue,
      conditionsValue,
      consistencyValue,
      totalFactor,
      notes: input.notes ?? null,
    },
    update: {
      ratingTableId: table.id,
      skillGrade: gradesInput.skillGrade,
      effortGrade: gradesInput.effortGrade,
      conditionsGrade: gradesInput.conditionsGrade,
      consistencyGrade: gradesInput.consistencyGrade,
      skillValue,
      effortValue,
      conditionsValue,
      consistencyValue,
      totalFactor,
      notes: input.notes ?? null,
    },
  })

  // تغییر ضریب عملکرد بر محاسبات اثر دارد — FR-27
  await db.calculationRun.updateMany({ where: { projectId }, data: { status: 'STALE' } })

  await recordAudit({
    entityType: 'RatingAssessment', entityId: assessment.id, action: existing ? 'UPDATE' : 'CREATE',
    entityName: `${element.name} — R=${totalFactor}`,
    before: existing ? { totalFactor: existing.totalFactor, ratingTableId: existing.ratingTableId } : undefined,
    after: { totalFactor, ratingTableId: table.id, ratingTableVersion: table.version, grades: gradesInput },
    projectId,
  })
  return getElementRating(elementId)
}

/** ماتریس ارزیابی همه عناصر پروژه (برای نمای کلی وستینگهاوس) */
export async function getRatingMatrix(projectId: string) {
  await assertProject(projectId)
  const [tables, stations] = await Promise.all([
    db.ratingTable.findMany({ where: { projectId }, orderBy: { createdAt: 'asc' } }),
    db.station.findMany({
      where: { projectId },
      orderBy: { sortOrder: 'asc' },
      include: {
        activities: {
          orderBy: { sortOrder: 'asc' },
          include: {
            workElements: {
              orderBy: { sortOrder: 'asc' },
              include: { rating: { include: { ratingTable: { select: { name: true, version: true } } } } },
            },
          },
        },
      },
    }),
  ])
  const defaultTable = tables.find((t) => t.isDefault) ?? tables[0] ?? null
  return {
    tables: tables.map((t) => ({ id: t.id, name: t.name, version: t.version, isDefault: t.isDefault, source: t.source })),
    defaultTableId: defaultTable?.id ?? null,
    stations: stations.map((s) => ({
      id: s.id,
      name: s.name,
      activities: s.activities.map((a) => ({
        id: a.id,
        name: a.name,
        elements: a.workElements.map((e) => ({
          id: e.id,
          name: e.name,
          rating: e.rating
            ? {
                totalFactor: e.rating.totalFactor,
                ratingTableId: e.rating.ratingTableId,
                ratingTableName: e.rating.ratingTable.name,
                ratingTableVersion: e.rating.ratingTable.version,
              }
            : null,
        })),
      })),
    })),
  }
}
