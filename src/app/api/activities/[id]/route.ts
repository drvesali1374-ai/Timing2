// فعالیت — ویرایش/حذف/شمارش وابستگی — FR-02 / FR-26
import { NextRequest } from 'next/server'
import { handle, ok, readJson } from '@/lib/api-helpers'
import { updateActivity, deleteActivity, getActivityDependencyCounts } from '@/application/structure-service'
import { activityUpdateSchema } from '@/domain/validation'

type Ctx = { params: Promise<{ id: string }> }

export function GET(req: NextRequest, ctx: Ctx) {
  return handle(req, async () => {
    const { id } = await ctx.params
    const { activity, counts } = await getActivityDependencyCounts(id)
    return ok({
      activity: {
        id: activity.id,
        name: activity.name,
        description: activity.description,
        processType: activity.processType,
        groupId: activity.groupId,
        targetSampleCount: activity.targetSampleCount,
        stationId: activity.stationId,
        updatedAt: activity.updatedAt.toISOString(),
      },
      counts,
    })
  })
}

export function PUT(req: NextRequest, ctx: Ctx) {
  return handle(req, async () => {
    const { id } = await ctx.params
    const body = activityUpdateSchema.parse(await readJson(req))
    const activity = await updateActivity(id, body)
    return ok({ activity })
  })
}

export function DELETE(req: NextRequest, ctx: Ctx) {
  return handle(req, async () => {
    const { id } = await ctx.params
    const counts = await deleteActivity(id)
    return ok({ deleted: true, removedCounts: counts })
  })
}
