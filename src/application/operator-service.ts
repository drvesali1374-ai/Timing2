// ═══════════════════════════════════════════════════════════
// سرویس اپراتورها — FR-05
// اپراتور در سطح پروژه تعریف می‌شود و می‌تواند در چند
// فعالیت همان پروژه شرکت کند؛ برگه هر اپراتور مستقل است.
// ═══════════════════════════════════════════════════════════
import { db } from '@/lib/db'
import { AppError } from '@/domain/types'
import { recordAudit } from '@/infrastructure/audit'
import { markDeleted } from '@/infrastructure/deletion'
import { markProjectCalculationsStale } from './calc-stale'
import type { OperatorCreateInput, OperatorUpdateInput } from '@/domain/validation'

async function assertProject(projectId: string) {
  const p = await db.project.findUnique({ where: { id: projectId }, select: { id: true } })
  if (!p) throw new AppError('PROJECT_NOT_FOUND', 'پروژه یافت نشد.', 404)
}

export async function listOperators(projectId: string) {
  await assertProject(projectId)
  const operators = await db.operator.findMany({
    where: { projectId },
    orderBy: { createdAt: 'asc' },
    include: {
      _count: {
        select: {
          sessions: true,
        },
      },
    },
  })
  // تعداد فعالیت‌های دارای جلسه برای هر اپراتور
  return Promise.all(
    operators.map(async (op) => {
      const activitiesCount = await db.studySession.groupBy({
        by: ['activityId'],
        where: { operatorId: op.id },
      })
      return {
        ...op,
        createdAt: op.createdAt.toISOString(),
        updatedAt: op.updatedAt.toISOString(),
        sessionsCount: op._count.sessions,
        activitiesCount: activitiesCount.length,
      }
    })
  )
}

export async function createOperator(projectId: string, input: OperatorCreateInput) {
  await assertProject(projectId)
  const operator = await db.operator.create({
    data: {
      projectId,
      displayName: input.displayName,
      code: input.code ?? null,
      notes: input.notes ?? null,
    },
  })
  await recordAudit({
    entityType: 'Operator', entityId: operator.id, action: 'CREATE', entityName: operator.displayName,
    after: { displayName: operator.displayName, code: operator.code }, projectId,
  })
  return operator
}

export async function updateOperator(operatorId: string, input: OperatorUpdateInput) {
  const existing = await db.operator.findUnique({ where: { id: operatorId } })
  if (!existing) throw new AppError('OPERATOR_NOT_FOUND', 'اپراتور یافت نشد.', 404)
  if (input.expectedUpdatedAt) {
    const expected = new Date(input.expectedUpdatedAt).getTime()
    if (Math.abs(existing.updatedAt.getTime() - expected) > 1000) {
      throw new AppError('CONFLICT', 'این اپراتور جای دیگری تغییر کرده؛ تازه‌سازی کنید.', 409)
    }
  }
  const data: Record<string, unknown> = {}
  if (input.displayName !== undefined) data.displayName = input.displayName
  if (input.code !== undefined) data.code = input.code
  if (input.notes !== undefined) data.notes = input.notes
  const updated = await db.operator.update({ where: { id: operatorId }, data })
  await recordAudit({
    entityType: 'Operator', entityId: operatorId, action: 'UPDATE', entityName: updated.displayName,
    before: { displayName: existing.displayName, code: existing.code, notes: existing.notes },
    after: { displayName: updated.displayName, code: updated.code, notes: updated.notes },
    projectId: existing.projectId,
  })
  return updated
}

export async function getOperatorDependencyCounts(operatorId: string) {
  const op = await db.operator.findUnique({ where: { id: operatorId } })
  if (!op) throw new AppError('OPERATOR_NOT_FOUND', 'اپراتور یافت نشد.', 404)
  const [sessions, observations] = await Promise.all([
    db.studySession.count({ where: { operatorId } }),
    db.elementObservation.count({ where: { cycle: { session: { operatorId } } } }),
  ])
  return { operator: op, counts: { sessions, observations } }
}

export async function deleteOperator(operatorId: string) {
  const { operator, counts } = await getOperatorDependencyCounts(operatorId)
  await db.$transaction(async (tx) => {
    await markDeleted(tx, 'Operator', [operatorId])
    await tx.operator.delete({ where: { id: operatorId } })
  })
  // حذف اپراتور = حذف آبشاری جلسات و مشاهدات او — FR-27
  await markProjectCalculationsStale(operator.projectId)
  await recordAudit({
    entityType: 'Operator', entityId: operatorId, action: 'DELETE', entityName: operator.displayName,
    projectId: operator.projectId,
  })
  return counts
}
