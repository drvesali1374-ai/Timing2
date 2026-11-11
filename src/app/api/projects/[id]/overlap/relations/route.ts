// روابط موازی عناصر کاری — فهرست/ایجاد (سرویس مرکزی) — جلسه ۲ §۲/§۴
import { NextRequest } from 'next/server'
import { handle, ok, readJson } from '@/lib/api-helpers'
import { listRelations, createRelation, getOverlapMatrix } from '@/application/overlap-service'
import { z } from 'zod'

type Ctx = { params: Promise<{ id: string }> }

const createSchema = z.object({
  elementAId: z.string().min(1),
  elementBId: z.string().min(1),
})

export function GET(req: NextRequest, ctx: Ctx) {
  return handle(req, async () => {
    const { id } = await ctx.params
    const relations = await listRelations(id)
    return ok({ relations })
  })
}

export function POST(req: NextRequest, ctx: Ctx) {
  return handle(req, async () => {
    const { id } = await ctx.params
    const body = createSchema.parse(await readJson(req))
    const relation = await createRelation(id, body.elementAId, body.elementBId)
    const matrix = await getOverlapMatrix(id, null)
    return ok({ relation, matrix }, 201)
  })
}
