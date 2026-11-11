// مقادیر هم‌پوشانی یک چرخه — ثبت دسته‌ای با خط اعتبارسنجی کامل — جلسه ۲ §۱۰
import { NextRequest } from 'next/server'
import { handle, ok, readJson } from '@/lib/api-helpers'
import { setCycleOverlaps } from '@/application/overlap-service'
import { z } from 'zod'

type Ctx = { params: Promise<{ id: string }> }

const updateSchema = z.object({
  updates: z
    .array(
      z.object({
        relationId: z.string().min(1),
        status: z.enum(['UNREVIEWED', 'NO_OVERLAP', 'OVERLAP']),
        overlapDuration: z.number().nullable().optional(),
        expectedVersion: z.number().int().optional(),
      }),
    )
    .min(1),
})

export function PUT(req: NextRequest, ctx: Ctx) {
  return handle(req, async () => {
    const { id } = await ctx.params
    const body = updateSchema.parse(await readJson(req))
    const result = await setCycleOverlaps(id, body.updates)
    return ok(result)
  })
}
