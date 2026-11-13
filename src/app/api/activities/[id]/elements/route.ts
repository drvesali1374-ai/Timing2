// عناصر کاری فعالیت — FR-02
import { NextRequest } from 'next/server'
import { handle, ok, readJson } from '@/lib/api-helpers'
import { listElements, createElement } from '@/application/structure-service'
import { elementCreateSchema } from '@/domain/validation'

type Ctx = { params: Promise<{ id: string }> }

export function GET(req: NextRequest, ctx: Ctx) {
  return handle(req, async () => {
    const { id } = await ctx.params
    const { activity, elements } = await listElements(id)
    return ok({
      activity: { id: activity.id, name: activity.name, stationId: activity.stationId },
      // v1.5.0 §۳ — elementType legacy در DTO عرضه نمی‌شود
      elements: elements.map((e) => ({
        id: e.id,
        activityId: e.activityId,
        name: e.name,
        description: e.description,
        sortOrder: e.sortOrder,
        createdAt: e.createdAt.toISOString(),
        updatedAt: e.updatedAt.toISOString(),
        rating: e.rating
          ? { totalFactor: e.rating.totalFactor }
          : null,
      })),
    })
  })
}

export function POST(req: NextRequest, ctx: Ctx) {
  return handle(req, async () => {
    const { id } = await ctx.params
    const body = elementCreateSchema.parse(await readJson(req))
    const element = await createElement(id, body)
    return ok({ element }, 201)
  })
}
