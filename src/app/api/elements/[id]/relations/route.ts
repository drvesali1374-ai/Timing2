// روابط موازی یک عنصر — نمای فرم (منبع واحد سرویس مرکزی) — جلسه ۲ §۴.۲
import { NextRequest } from 'next/server'
import { handle, ok } from '@/lib/api-helpers'
import { getElementRelations } from '@/application/overlap-service'

type Ctx = { params: Promise<{ id: string }> }

export function GET(req: NextRequest, ctx: Ctx) {
  return handle(req, async () => {
    const { id } = await ctx.params
    const data = await getElementRelations(id)
    return ok(data)
  })
}
