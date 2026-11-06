// حذف نسخه پشتیبان — FR-24
import { NextRequest } from 'next/server'
import { handle, ok } from '@/lib/api-helpers'
import { deleteBackup } from '@/infrastructure/backup'

type Ctx = { params: Promise<{ id: string }> }

export function DELETE(req: NextRequest, ctx: Ctx) {
  return handle(req, async () => {
    const { id } = await ctx.params
    await deleteBackup(id)
    return ok({ deleted: true })
  })
}
