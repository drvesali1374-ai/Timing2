// گروه‌های فعالیت — FR-04
import { NextRequest } from 'next/server'
import { handle, ok, readJson } from '@/lib/api-helpers'
import { listGroups, createGroup } from '@/application/allowance-service'
import { groupCreateSchema } from '@/domain/validation'

type Ctx = { params: Promise<{ id: string }> }

export function GET(req: NextRequest, ctx: Ctx) {
  return handle(req, async () => {
    const { id } = await ctx.params
    const items = await listGroups(id)
    return ok({ items })
  })
}

export function POST(req: NextRequest, ctx: Ctx) {
  return handle(req, async () => {
    const { id } = await ctx.params
    const body = groupCreateSchema.parse(await readJson(req))
    const group = await createGroup(id, body)
    return ok({ group }, 201)
  })
}
