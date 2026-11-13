// عنصر کاری — ویرایش/حذف/شمارش وابستگی — FR-02 / FR-26
import { NextRequest } from 'next/server'
import { handle, ok, readJson } from '@/lib/api-helpers'
import { updateElement, deleteElement, getElementDependencyCounts } from '@/application/structure-service'
import { elementUpdateSchema } from '@/domain/validation'

type Ctx = { params: Promise<{ id: string }> }

export function GET(req: NextRequest, ctx: Ctx) {
  return handle(req, async () => {
    const { id } = await ctx.params
    const { element, counts } = await getElementDependencyCounts(id)
    return ok({
      element: {
        id: element.id,
        name: element.name,
        description: element.description,
        activityId: element.activityId,
        updatedAt: element.updatedAt.toISOString(),
      },
      counts,
    })
  })
}

export function PUT(req: NextRequest, ctx: Ctx) {
  return handle(req, async () => {
    const { id } = await ctx.params
    const body = elementUpdateSchema.parse(await readJson(req))
    const element = await updateElement(id, body)
    return ok({ element })
  })
}

export function DELETE(req: NextRequest, ctx: Ctx) {
  return handle(req, async () => {
    const { id } = await ctx.params
    const counts = await deleteElement(id)
    return ok({ deleted: true, removedCounts: counts })
  })
}
