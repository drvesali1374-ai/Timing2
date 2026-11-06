// دسته‌های مجاز پروژه — FR-04
import { NextRequest } from 'next/server'
import { handle, ok, readJson } from '@/lib/api-helpers'
import { listCategories, createCategory } from '@/application/allowance-service'
import { categoryCreateSchema } from '@/domain/validation'

type Ctx = { params: Promise<{ id: string }> }

export function GET(req: NextRequest, ctx: Ctx) {
  return handle(req, async () => {
    const { id } = await ctx.params
    const items = await listCategories(id)
    return ok({ items })
  })
}

export function POST(req: NextRequest, ctx: Ctx) {
  return handle(req, async () => {
    const { id } = await ctx.params
    const body = categoryCreateSchema.parse(await readJson(req))
    const category = await createCategory(id, body)
    return ok({ category }, 201)
  })
}
