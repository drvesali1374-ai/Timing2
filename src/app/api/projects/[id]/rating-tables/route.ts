// جدول‌های وستینگهاوس پروژه — FR-13
import { NextRequest } from 'next/server'
import { handle, ok, readJson } from '@/lib/api-helpers'
import { listRatingTables, createRatingTable } from '@/application/rating-service'
import { ratingTableCreateSchema } from '@/domain/validation'

type Ctx = { params: Promise<{ id: string }> }

export function GET(req: NextRequest, ctx: Ctx) {
  return handle(req, async () => {
    const { id } = await ctx.params
    const items = await listRatingTables(id)
    return ok({ items })
  })
}

export function POST(req: NextRequest, ctx: Ctx) {
  return handle(req, async () => {
    const { id } = await ctx.params
    const body = ratingTableCreateSchema.parse(await readJson(req))
    const table = await createRatingTable(id, body)
    return ok({ table }, 201)
  })
}
