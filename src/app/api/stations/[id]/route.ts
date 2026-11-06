// ایستگاه — ویرایش/حذف/شمارش وابستگی — FR-02 / FR-26
import { NextRequest } from 'next/server'
import { handle, ok, readJson } from '@/lib/api-helpers'
import { updateStation, deleteStation, getStationDependencyCounts } from '@/application/structure-service'
import { stationUpdateSchema } from '@/domain/validation'

type Ctx = { params: Promise<{ id: string }> }

export function GET(req: NextRequest, ctx: Ctx) {
  return handle(req, async () => {
    const { id } = await ctx.params
    const { station, counts } = await getStationDependencyCounts(id)
    return ok({
      station: {
        id: station.id,
        name: station.name,
        description: station.description,
        projectId: station.projectId,
      },
      counts,
    })
  })
}

export function PUT(req: NextRequest, ctx: Ctx) {
  return handle(req, async () => {
    const { id } = await ctx.params
    const body = stationUpdateSchema.parse(await readJson(req))
    const station = await updateStation(id, body)
    return ok({ station })
  })
}

export function DELETE(req: NextRequest, ctx: Ctx) {
  return handle(req, async () => {
    const { id } = await ctx.params
    const counts = await deleteStation(id)
    return ok({ deleted: true, removedCounts: counts })
  })
}
