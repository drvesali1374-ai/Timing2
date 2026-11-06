// ماتریس ارزیابی عناصر پروژه — FR-13
import { NextRequest } from 'next/server'
import { handle, ok } from '@/lib/api-helpers'
import { getRatingMatrix } from '@/application/rating-service'

type Ctx = { params: Promise<{ id: string }> }

export function GET(req: NextRequest, ctx: Ctx) {
  return handle(req, async () => {
    const { id } = await ctx.params
    return ok(await getRatingMatrix(id))
  })
}
