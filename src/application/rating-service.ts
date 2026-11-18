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

/** ارزیابی یک عنصر — فرم R و جدول در حال استفاده — FR-13
 *  v1.5.3 §۱: operatorId مشخص → ارزیابی اختصاصی «اپراتور × عنصر»؛
 *  خروجی هم ارزیابی مؤثر همان سطح را می‌دهد و هم فهرست همهٔ ارزیابی‌های عنصر */
export async function getElementRating(elementId: string, operatorId?: string | null) {
  const element = await db.workElement.findUnique({
    where: { id: elementId },
    include: {
      activity: { include: { station: { select: { project: { select: { id: true } } } } } },
      ratings: {
        include: {
          ratingTable: { select: { id: true, name: true, version: true, source: true } },
          operator: { select: { id: true, displayName: true } },
        },
      },
    },
  })
  if (!element) throw new AppError('ELEMENT_NOT_FOUND', 'عنصر کاری یافت نشد.', 404)
  const toAssessmentDto = (r: (typeof element.ratings)[number]) => ({
    operatorId: r.operatorId,
    operatorName: r.operator?.displayName ?? null,
    ratingTableId: r.ratingTableId,
    ratingTableName: r.ratingTable.name,
    ratingTableVersion: r.ratingTable.version,
    ratingTableSource: r.ratingTable.source,
    skillGrade: r.skillGrade,
    effortGrade: r.effortGrade,
    conditionsGrade: r.conditionsGrade,
    consistencyGrade: r.consistencyGrade,
    skillValue: r.skillValue,
    effortValue: r.effortValue,
    conditionsValue: r.conditionsValue,
    consistencyValue: r.consistencyValue,
    totalFactor: r.totalFactor,
    notes: r.notes,
  })
  const general = element.ratings.find((r) => r.operatorId === null) ?? null
  const operatorSpecific = operatorId ? (element.ratings.find((r) => r.operatorId === operatorId) ?? null) : null
  const effective = operatorSpecific ?? general
  return {
    element: { id: element.id, name: element.name },
    projectId: element.activity.station.project.id,
    // ارزیابی مؤثر همین سطح (اختصاصی اپراتور؛ وگرنه عمومی)
    assessment: effective ? toAssessmentDto(effective) : null,
    // ارزیابی عمومی عنصر (بدون اپراتور) — میراث نسخه‌های قبل
    generalAssessment: general ? toAssessmentDto(general) : null,
    // همهٔ ارزیابی‌های اختصاصی اپراتورهای این عنصر
    operatorRatings: element.ratings.filter((r) => r.operatorId !== null).map(toAssessmentDto),
  }
}

/** ثبت/به‌روزرسانی ارزیابی عنصر — محاسبه R با موتور محاسبات
 *  v1.5.3 §۱: کلید = (عنصر، اپراتور؟) — اپراتور مشخص یعنی ارزیابی اختصاصی */
export async function putElementRating(elementId: string, input: AssessmentPutInput) {
  const element = await db.workElement.findUnique({
    where: { id: elementId },
    include: {
      activity: { include: { station: { select: { project: { select: { id: true } } } } } },
    },
  })
  if (!element) throw new AppError('ELEMENT_NOT_FOUND', 'عنصر کاری یافت نشد.', 404)
  const projectId = element.activity.station.project.id
  const operatorId = input.operatorId ?? null

  // اپراتور باید به همین پروژه تعلق داشته باشد — v1.5.3 §۱
  if (operatorId) {
    const operator = await db.operator.findUnique({ where: { id: operatorId } })
    if (!operator || operator.projectId !== projectId) {
      throw new AppError('OPERATOR_NOT_IN_PROJECT', 'اپراتور به این پروژه تعلق ندارد.', 422)
    }
  }

  // جدول باید به همین پروژه تعلق داشته باشد — FR-13
  const table = await db.ratingTable.findUnique({
    where: { id: input.ratingTableId },
    include: { grades: true },
  })
  if (!table || table.projectId !== projectId) {
    throw new AppError('RATING_TABLE_NOT_IN_PROJECT', 'جدول ارزیابی به این پروژه تعلق ندارد.', 422)
  }

  // اگر کپی درخواست شده، درجه‌ها از منبع خوانده می‌شود — FR-13
  // مرجع کپی: «elementId» (عمومی) یا «elementId|operatorId» (اختصاصی) — v1.5.3 §۱
  let gradesInput = {
    skillGrade: input.skillGrade,
    effortGrade: input.effortGrade,
    conditionsGrade: input.conditionsGrade,
    consistencyGrade: input.consistencyGrade,
  }
  if (input.copyFromElementId) {
    const [srcElementId, srcOperatorId] = String(input.copyFromElementId).split('|')
    const source = await db.ratingAssessment.findFirst({
      where: { workElementId: srcElementId, operatorId: srcOperatorId ?? null },
    })
    if (!source) {
      throw new AppError('SOURCE_ASSESSMENT_NOT_FOUND', 'مورد مبدأ برای کپی ارزیابی، ارزیابی ثبت‌شده ندارد.', 422)
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

  // (?? null فقط برای نوع؛ رفتار تغییری نمی‌کند — undefined هم مثل null سهم صفر دارد)
  const skillValue = gradeValue('SKILL', gradesInput.skillGrade ?? null)
  const effortValue = gradeValue('EFFORT', gradesInput.effortGrade ?? null)
  const conditionsValue = gradeValue('CONDITIONS', gradesInput.conditionsGrade ?? null)
  const consistencyValue = gradeValue('CONSISTENCY', gradesInput.consistencyGrade ?? null)
  const totalFactor = computeRatingFactor({ skill: skillValue, effort: effortValue, conditions: conditionsValue, consistency: consistencyValue })

  const existing = await db.ratingAssessment.findFirst({
    where: { workElementId: elementId, operatorId },
  })

  const assessment = existing
    ? await db.ratingAssessment.update({
        where: { id: existing.id },
        data: {
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
    : await db.ratingAssessment.create({
        data: {
          workElementId: elementId,
          operatorId,
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
    entityName: `${element.name}${operatorId ? ' × اپراتور' : ''} — R=${totalFactor}`,
    before: existing ? { totalFactor: existing.totalFactor, ratingTableId: existing.ratingTableId } : undefined,
    after: { totalFactor, ratingTableId: table.id, ratingTableVersion: table.version, grades: gradesInput, operatorId },
    projectId,
  })
  return getElementRating(elementId, operatorId)
}

/** حذف ارزیابی — عمومی یا اختصاصی اپراتور — v1.5.3 §۱ */
export async function deleteElementRating(elementId: string, operatorId?: string | null) {
  const element = await db.workElement.findUnique({
    where: { id: elementId },
    include: {
      activity: { include: { station: { select: { project: { select: { id: true } } } } } },
    },
  })
  if (!element) throw new AppError('ELEMENT_NOT_FOUND', 'عنصر کاری یافت نشد.', 404)
  const existing = await db.ratingAssessment.findFirst({
    where: { workElementId: elementId, operatorId: operatorId ?? null },
  })
  if (!existing) throw new AppError('ASSESSMENT_NOT_FOUND', 'ارزیابی یافت نشد.', 404)
  await db.ratingAssessment.delete({ where: { id: existing.id } })
  await db.calculationRun.updateMany({
    where: { projectId: element.activity.station.project.id },
    data: { status: 'STALE' },
  })
  await recordAudit({
    entityType: 'RatingAssessment', entityId: existing.id, action: 'DELETE',
    entityName: `${element.name}${operatorId ? ' × اپراتور' : ''}`,
    projectId: element.activity.station.project.id,
  })
  return { deleted: true }
}

/** برگه‌های زمان‌سنجی ثبت‌شده برای یک عنصر کاری (توسط هر اپراتور) — v1.5.4 §۱
 *  جلسه‌های فعالیتِ این عنصر که دست‌کم یک مشاهده (حتی ناقص) برای آن ثبت کرده‌اند.
 *  مبنای فهرست «انتخاب برگه» در صفحهٔ وستینگهاوس است. */
export async function listElementTimingSheets(elementId: string) {
  const element = await db.workElement.findUnique({
    where: { id: elementId },
    include: { activity: { include: { station: { select: { name: true } } } } },
  })
  if (!element) throw new AppError('ELEMENT_NOT_FOUND', 'عنصر کاری یافت نشد.', 404)
  const activity = element.activity

  // جلسه‌های فعالیت این عنصر، همراه با چرخه‌ها و مشاهداتِ همین عنصر
  const sessions = await db.studySession.findMany({
    where: { activityId: activity.id },
    include: {
      operator: { select: { id: true, displayName: true, code: true } },
      cycles: {
        include: {
          observations: {
            where: { workElementId: elementId },
            select: { validityStatus: true, derivedDuration: true },
          },
        },
      },
    },
    orderBy: { startedAt: 'desc' },
  })

  const sheets: {
    sessionId: string
    operatorId: string
    operatorName: string
    operatorCode: string | null
    startedAt: string
    endedAt: string | null
    status: string
    timingMethod: string
    cyclesForElement: number
    obsForElement: number
    validForElement: number
  }[] = []
  for (const se of sessions) {
    let cyclesWithElement = 0
    let obsCount = 0
    let validObs = 0
    for (const c of se.cycles) {
      if (c.observations.length === 0) continue // در این چرخه برای این عنصر چیزی ثبت نشده است
      cyclesWithElement++
      obsCount += c.observations.length
      for (const o of c.observations) {
        // معتبر = خارج‌شده/نامعتبر نیست و مدت محاسبه‌شده دارد
        if (o.validityStatus !== 'EXCLUDED' && o.validityStatus !== 'INVALID' && o.derivedDuration !== null) validObs++
      }
    }
    if (cyclesWithElement === 0) continue // در این برگه برای این عنصر چیزی ثبت نشده است
    sheets.push({
      sessionId: se.id,
      operatorId: se.operatorId,
      operatorName: se.operator?.displayName ?? 'اپراتور حذف‌شده',
      operatorCode: se.operator?.code ?? null,
      startedAt: se.startedAt.toISOString(),
      endedAt: se.endedAt ? se.endedAt.toISOString() : null,
      status: se.status,
      timingMethod: se.timingMethod,
      cyclesForElement: cyclesWithElement,
      obsForElement: obsCount,
      validForElement: validObs,
    })
  }

  return {
    element: { id: element.id, name: element.name },
    activity: { id: activity.id, name: activity.name },
    stationName: activity.station?.name ?? '',
    sheets,
  }
}

/** ماتریس ارزیابی همه عناصر پروژه — v1.5.3 §۱: ارزیابی عمومی + اختصاصی هر
 *  اپراتور + اپراتورهای دارای ثبت زمان برای همین عنصر (برای هشدارهای ناقص) */
export async function getRatingMatrix(projectId: string) {
  await assertProject(projectId)
  const [tables, stations, observationOps] = await Promise.all([
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
              include: {
                ratings: {
                  include: {
                    ratingTable: { select: { name: true, version: true } },
                    operator: { select: { id: true, displayName: true } },
                  },
                },
              },
            },
          },
        },
      },
    }),
    // اپراتورهایی که برای هر عنصر ثبت زمان (مشاهده) دارند — هشدار تکمیل‌نشدگی
    db.elementObservation.findMany({
      where: { workElement: { activity: { station: { projectId } } } },
      select: { workElementId: true, cycle: { select: { session: { select: { operatorId: true } } } } },
    }),
  ])
  const timingOpsByElement = new Map<string, Set<string>>()
  for (const o of observationOps) {
    const set = timingOpsByElement.get(o.workElementId) ?? new Set<string>()
    set.add(o.cycle.session.operatorId)
    timingOpsByElement.set(o.workElementId, set)
  }
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
        elements: a.workElements.map((e) => {
          const general = e.ratings.find((r) => r.operatorId === null) ?? null
          const operatorRatings = e.ratings
            .filter((r) => r.operatorId !== null)
            .map((r) => ({
              operatorId: r.operatorId as string,
              operatorName: r.operator?.displayName ?? 'اپراتور حذف‌شده',
              totalFactor: r.totalFactor,
              ratingTableName: r.ratingTable.name,
              ratingTableVersion: r.ratingTable.version,
            }))
          const timingOperatorIds = [...(timingOpsByElement.get(e.id) ?? [])]
          return {
            id: e.id,
            name: e.name,
            rating: general
              ? {
                  totalFactor: general.totalFactor,
                  ratingTableId: general.ratingTableId,
                  ratingTableName: general.ratingTable.name,
                  ratingTableVersion: general.ratingTable.version,
                }
              : null,
            operatorRatings,
            timingOperatorIds,
          }
        }),
      })),
    })),
  }
}
