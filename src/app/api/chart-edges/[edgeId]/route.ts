// مدیریت اتصال گره‌ها — حذف (FR-20.9) + تغییر ظاهر (v1.5.2 §۱۰.۵)
import { NextRequest } from 'next/server'
import { handle, ok, readJson } from '@/lib/api-helpers'
import { deleteChartEdge, updateChartEdgeAppearance } from '@/application/chart-service'
import { chartEdgeAppearanceSchema } from '@/domain/validation'

type Ctx = { params: Promise<{ edgeId: string }> }

export function DELETE(req: NextRequest, ctx: Ctx) {
  return handle(req, async () => {
    const { edgeId } = await ctx.params
    await deleteChartEdge(edgeId)
    return ok({ deleted: true })
  })
}

export function PATCH(req: NextRequest, ctx: Ctx) {
  return handle(req, async () => {
    const { edgeId } = await ctx.params
    const body = chartEdgeAppearanceSchema.parse(await readJson(req))
    const edge = await updateChartEdgeAppearance(edgeId, body)
    return ok({ edge: { id: edge.id, lineStyle: edge.lineStyle, lineColor: edge.lineColor } })
  })
}
