// روابط موازی یک عنصر — نمای فرم (منبع واحد سرویس مرکزی) — v1.5.2 §۲
import { NextRequest } from 'next/server'
import { handle, ok } from '@/lib/api-helpers'
import { getElementRelations } from '@/application/parallel-relation-service'

type Ctx = { params: Promise<{ id: string }> }

export function GET(req: NextRequest, ctx: Ctx) {
  return handle(req, async () => {
    const { id } = await ctx.params
    const data = await getElementRelations(id)
    return ok(data)
  })
}
