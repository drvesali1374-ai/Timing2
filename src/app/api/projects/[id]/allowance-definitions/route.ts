// تعریف‌های مرکزی الونس پروژه — جلسه اول (§۵)
import { NextRequest } from 'next/server'
import { handle, ok, readJson } from '@/lib/api-helpers'
import { listDefinitions, createDefinition } from '@/application/effective-allowance-service'
import { allowanceDefinitionCreateSchema } from '@/domain/validation'

type Ctx = { params: Promise<{ id: string }> }

export function GET(req: NextRequest, ctx: Ctx) {
  return handle(req, async () => {
    const { id } = await ctx.params
    const items = await listDefinitions(id)
    return ok({ items })
  })
}

export function POST(req: NextRequest, ctx: Ctx) {
  return handle(req, async () => {
    const { id } = await ctx.params
    const body = allowanceDefinitionCreateSchema.parse(await readJson(req))
    const definition = await createDefinition(id, body)
    return ok({ definition }, 201)
  })
}
