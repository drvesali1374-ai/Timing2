// تعریف مرکزی الونس — به‌روزرسانی و حذف (آرشیو دارای سابقه — §۲.۲)
import { NextRequest } from 'next/server'
import { handle, ok, readJson } from '@/lib/api-helpers'
import { updateDefinition, deleteDefinition } from '@/application/effective-allowance-service'
import { allowanceDefinitionUpdateSchema } from '@/domain/validation'

type Ctx = { params: Promise<{ id: string }> }

export function PUT(req: NextRequest, ctx: Ctx) {
  return handle(req, async () => {
    const { id } = await ctx.params
    const body = allowanceDefinitionUpdateSchema.parse(await readJson(req))
    const definition = await updateDefinition(id, body)
    return ok({ definition })
  })
}

export function DELETE(req: NextRequest, ctx: Ctx) {
  return handle(req, async () => {
    const { id } = await ctx.params
    const result = await deleteDefinition(id)
    return ok(result)
  })
}
