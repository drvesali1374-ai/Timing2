// گروه فعالیت — ویرایش/حذف — FR-04 / FR-26
import { NextRequest } from 'next/server'
import { handle, ok, readJson } from '@/lib/api-helpers'
import { updateGroup, deleteGroup } from '@/application/allowance-service'
import { groupUpdateSchema } from '@/domain/validation'

type Ctx = { params: Promise<{ id: string }> }

export function PUT(req: NextRequest, ctx: Ctx) {
  return handle(req, async () => {
    const { id } = await ctx.params
    const body = groupUpdateSchema.parse(await readJson(req))
    const group = await updateGroup(id, body)
    return ok({ group })
  })
}

export function DELETE(req: NextRequest, ctx: Ctx) {
  return handle(req, async () => {
    const { id } = await ctx.params
    const counts = await deleteGroup(id)
    return ok({ deleted: true, removedCounts: counts })
  })
}
