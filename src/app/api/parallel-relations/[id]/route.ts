// رابطهٔ موازی — آرشیو/بازگردانی (Soft Delete) — v1.5.2 §۲-۹
import { NextRequest } from 'next/server'
import { handle, ok, readJson } from '@/lib/api-helpers'
import { archiveRelation, restoreRelation } from '@/application/parallel-relation-service'
import { z } from 'zod'

type Ctx = { params: Promise<{ id: string }> }

const patchSchema = z.object({ action: z.enum(['archive', 'restore']) })

export function PATCH(req: NextRequest, ctx: Ctx) {
  return handle(req, async () => {
    const { id } = await ctx.params
    const body = patchSchema.parse(await readJson(req))
    const relation = body.action === 'archive' ? await archiveRelation(id) : await restoreRelation(id)
    return ok({ relation })
  })
}
