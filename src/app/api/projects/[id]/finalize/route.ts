// نهایی‌سازی / بازگشت از نهایی‌سازی — FR-27 / FR-12
import { NextRequest } from 'next/server'
import { handle, ok, readJson } from '@/lib/api-helpers'
import { finalizeProject, unfinalizeProject } from '@/application/project-service'
import { finalizeSchema } from '@/domain/validation'

type Ctx = { params: Promise<{ id: string }> }

export function POST(req: NextRequest, ctx: Ctx) {
  return handle(req, async () => {
    const { id } = await ctx.params
    const body = finalizeSchema.parse(await readJson(req))
    await finalizeProject(id, body.reason ?? null)
    return ok({ finalized: true })
  })
}

export function DELETE(req: NextRequest, ctx: Ctx) {
  return handle(req, async () => {
    const { id } = await ctx.params
    await unfinalizeProject(id)
    return ok({ finalized: false })
  })
}
