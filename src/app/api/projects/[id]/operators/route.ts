// اپراتورهای پروژه — FR-05
import { NextRequest } from 'next/server'
import { handle, ok, readJson } from '@/lib/api-helpers'
import { listOperators, createOperator } from '@/application/operator-service'
import { operatorCreateSchema } from '@/domain/validation'

type Ctx = { params: Promise<{ id: string }> }

export function GET(req: NextRequest, ctx: Ctx) {
  return handle(req, async () => {
    const { id } = await ctx.params
    const items = await listOperators(id)
    return ok({ items })
  })
}

export function POST(req: NextRequest, ctx: Ctx) {
  return handle(req, async () => {
    const { id } = await ctx.params
    const body = operatorCreateSchema.parse(await readJson(req))
    const operator = await createOperator(id, body)
    return ok({ operator }, 201)
  })
}
