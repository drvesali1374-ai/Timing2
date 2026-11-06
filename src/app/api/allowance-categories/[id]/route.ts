// دسته مجاز — ویرایش/حذف — FR-04 / FR-26
import { NextRequest } from 'next/server'
import { handle, ok, readJson } from '@/lib/api-helpers'
import { updateCategory, deleteCategory } from '@/application/allowance-service'
import { categoryUpdateSchema } from '@/domain/validation'

type Ctx = { params: Promise<{ id: string }> }

export function PUT(req: NextRequest, ctx: Ctx) {
  return handle(req, async () => {
    const { id } = await ctx.params
    const body = categoryUpdateSchema.parse(await readJson(req))
    const category = await updateCategory(id, body)
    return ok({ category })
  })
}

export function DELETE(req: NextRequest, ctx: Ctx) {
  return handle(req, async () => {
    const { id } = await ctx.params
    const counts = await deleteCategory(id)
    return ok({ deleted: true, removedCounts: counts })
  })
}
