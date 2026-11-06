// فعالیت‌های یک ایستگاه — FR-02
import { NextRequest } from 'next/server'
import { handle, ok, readJson } from '@/lib/api-helpers'
import { listActivities, createActivity } from '@/application/structure-service'
import { activityCreateSchema } from '@/domain/validation'

type Ctx = { params: Promise<{ id: string }> }

export function GET(req: NextRequest, ctx: Ctx) {
  return handle(req, async () => {
    const { id } = await ctx.params
    const items = await listActivities(id)
    return ok({ items })
  })
}

export function POST(req: NextRequest, ctx: Ctx) {
  return handle(req, async () => {
    const { id } = await ctx.params
    const body = activityCreateSchema.parse(await readJson(req))
    const activity = await createActivity(id, body)
    return ok({ activity }, 201)
  })
}
