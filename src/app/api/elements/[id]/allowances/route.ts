// الونس‌های عنصر کاری (سلسله‌مراتبی: ارث + Override/Exclude/Restore) — جلسه اول
import { NextRequest } from 'next/server'
import { handle, ok, readJson } from '@/lib/api-helpers'
import { getScopeAllowances, putScopeAllowanceOps } from '@/application/effective-allowance-service'
import { allowanceOpsPutSchema } from '@/domain/validation'

type Ctx = { params: Promise<{ id: string }> }

export function GET(req: NextRequest, ctx: Ctx) {
  return handle(req, async () => {
    const { id } = await ctx.params
    return ok(await getScopeAllowances('WORK_ELEMENT', id))
  })
}

export function PUT(req: NextRequest, ctx: Ctx) {
  return handle(req, async () => {
    const { id } = await ctx.params
    const body = allowanceOpsPutSchema.parse(await readJson(req))
    return ok(await putScopeAllowanceOps('WORK_ELEMENT', id, body))
  })
}
