// مجازهای مؤثر فعالیت (ارث + بازنویسی) — FR-04
import { NextRequest } from 'next/server'
import { handle, ok, readJson } from '@/lib/api-helpers'
import { getEffectiveAllowances, putActivityAllowances } from '@/application/allowance-service'
import { activityAllowancesPutSchema } from '@/domain/validation'

type Ctx = { params: Promise<{ id: string }> }

export function GET(req: NextRequest, ctx: Ctx) {
  return handle(req, async () => {
    const { id } = await ctx.params
    return ok(await getEffectiveAllowances(id))
  })
}

export function PUT(req: NextRequest, ctx: Ctx) {
  return handle(req, async () => {
    const { id } = await ctx.params
    const body = activityAllowancesPutSchema.parse(await readJson(req))
    const result = await putActivityAllowances(id, body.overrides, body.expectedUpdatedAt)
    return ok(result)
  })
}
