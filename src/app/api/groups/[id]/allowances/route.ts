// مقادیر مجاز گروه — FR-04 / FR-15
import { NextRequest } from 'next/server'
import { handle, ok, readJson } from '@/lib/api-helpers'
import { getGroupAllowances, putGroupAllowances } from '@/application/allowance-service'
import { groupAllowancesPutSchema } from '@/domain/validation'

type Ctx = { params: Promise<{ id: string }> }

export function GET(req: NextRequest, ctx: Ctx) {
  return handle(req, async () => {
    const { id } = await ctx.params
    return ok(await getGroupAllowances(id))
  })
}

export function PUT(req: NextRequest, ctx: Ctx) {
  return handle(req, async () => {
    const { id } = await ctx.params
    const body = groupAllowancesPutSchema.parse(await readJson(req))
    return ok(await putGroupAllowances(id, body.values))
  })
}
