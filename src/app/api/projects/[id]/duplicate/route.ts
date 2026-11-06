// کپی پروژه با انتخاب بخش‌ها — FR-01
import { NextRequest } from 'next/server'
import { handle, ok, readJson } from '@/lib/api-helpers'
import { duplicateProject } from '@/infrastructure/package-io'
import { projectDuplicateSchema } from '@/domain/validation'

type Ctx = { params: Promise<{ id: string }> }

export function POST(req: NextRequest, ctx: Ctx) {
  return handle(req, async () => {
    const { id } = await ctx.params
    const body = projectDuplicateSchema.parse(await readJson(req))
    const result = await duplicateProject(id, body.newProjectName, body.include)
    return ok(result, 201)
  })
}
