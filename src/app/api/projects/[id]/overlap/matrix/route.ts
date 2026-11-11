// ماتریس مرکزی هم‌پوشانی — projection اعضا/روابط/مقادیر چرخهٔ انتخاب‌شده — جلسه ۲ §۵
import { NextRequest } from 'next/server'
import { handle, ok } from '@/lib/api-helpers'
import { getOverlapMatrix } from '@/application/overlap-service'

type Ctx = { params: Promise<{ id: string }> }

export function GET(req: NextRequest, ctx: Ctx) {
  return handle(req, async () => {
    const { id } = await ctx.params
    const cycleId = req.nextUrl.searchParams.get('cycleId')
    const matrix = await getOverlapMatrix(id, cycleId)
    return ok(matrix)
  })
}
