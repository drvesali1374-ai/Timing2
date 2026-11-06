// اپراتور — ویرایش/حذف/شمارش وابستگی — FR-05 / FR-26
import { NextRequest } from 'next/server'
import { handle, ok, readJson } from '@/lib/api-helpers'
import { updateOperator, deleteOperator, getOperatorDependencyCounts } from '@/application/operator-service'
import { operatorUpdateSchema } from '@/domain/validation'

type Ctx = { params: Promise<{ id: string }> }

export function GET(req: NextRequest, ctx: Ctx) {
  return handle(req, async () => {
    const { id } = await ctx.params
    const { operator, counts } = await getOperatorDependencyCounts(id)
    return ok({
      operator: {
        id: operator.id,
        displayName: operator.displayName,
        code: operator.code,
        notes: operator.notes,
        projectId: operator.projectId,
        updatedAt: operator.updatedAt.toISOString(),
      },
      counts,
    })
  })
}

export function PUT(req: NextRequest, ctx: Ctx) {
  return handle(req, async () => {
    const { id } = await ctx.params
    const body = operatorUpdateSchema.parse(await readJson(req))
    const operator = await updateOperator(id, body)
    return ok({ operator })
  })
}

export function DELETE(req: NextRequest, ctx: Ctx) {
  return handle(req, async () => {
    const { id } = await ctx.params
    const counts = await deleteOperator(id)
    return ok({ deleted: true, removedCounts: counts })
  })
}
