// ترتیب‌بندی عناصر کاری — FR-02
import { NextRequest } from 'next/server'
import { handle, ok, readJson } from '@/lib/api-helpers'
import { reorderElements } from '@/application/structure-service'
import { reorderSchema } from '@/domain/validation'

type Ctx = { params: Promise<{ id: string }> }

export function POST(req: NextRequest, ctx: Ctx) {
  return handle(req, async () => {
    const { id } = await ctx.params
    const body = reorderSchema.parse(await readJson(req))
    await reorderElements(id, body.ids)
    return ok({ reordered: true })
  })
}
