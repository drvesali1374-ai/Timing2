// ارزیابی وستینگهاوس عنصر — FR-13
import { NextRequest } from 'next/server'
import { handle, ok, readJson } from '@/lib/api-helpers'
import { getElementRating, putElementRating } from '@/application/rating-service'
import { assessmentPutSchema } from '@/domain/validation'

type Ctx = { params: Promise<{ id: string }> }

export function GET(req: NextRequest, ctx: Ctx) {
  return handle(req, async () => {
    const { id } = await ctx.params
    return ok(await getElementRating(id))
  })
}

export function PUT(req: NextRequest, ctx: Ctx) {
  return handle(req, async () => {
    const { id } = await ctx.params
    const body = assessmentPutSchema.parse(await readJson(req))
    return ok(await putElementRating(id, body))
  })
}
