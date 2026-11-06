// جدول وستینگهاوس — جزئیات/ویرایش فراداده/حذف — FR-13
import { NextRequest } from 'next/server'
import { handle, ok, readJson } from '@/lib/api-helpers'
import { getRatingTable, updateRatingTable, deleteRatingTable } from '@/application/rating-service'
import { ratingTableUpdateSchema } from '@/domain/validation'

type Ctx = { params: Promise<{ id: string }> }

export function GET(req: NextRequest, ctx: Ctx) {
  return handle(req, async () => {
    const { id } = await ctx.params
    return ok(await getRatingTable(id))
  })
}

export function PUT(req: NextRequest, ctx: Ctx) {
  return handle(req, async () => {
    const { id } = await ctx.params
    const body = ratingTableUpdateSchema.parse(await readJson(req))
    const table = await updateRatingTable(id, body)
    return ok({ table })
  })
}

export function DELETE(req: NextRequest, ctx: Ctx) {
  return handle(req, async () => {
    const { id } = await ctx.params
    await deleteRatingTable(id)
    return ok({ deleted: true })
  })
}
