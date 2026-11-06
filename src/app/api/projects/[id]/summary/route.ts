// وضعیت مراحل مطالعه — ۷.۲
import { NextRequest } from 'next/server'
import { handle, ok } from '@/lib/api-helpers'
import { computeStageSummary } from '@/application/stage-status'

type Ctx = { params: Promise<{ id: string }> }

export function GET(req: NextRequest, ctx: Ctx) {
  return handle(req, async () => {
    const { id } = await ctx.params
    return ok(await computeStageSummary(id))
  })
}
