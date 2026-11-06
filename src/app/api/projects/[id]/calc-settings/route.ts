// تنظیمات محاسباتی پروژه — FR-15 / ۱۰.۱
import { NextRequest } from 'next/server'
import { handle, ok, readJson } from '@/lib/api-helpers'
import { getCalcSettings, putCalcSettings } from '@/application/allowance-service'
import { projectCalcSettingsSchema } from '@/domain/validation'

type Ctx = { params: Promise<{ id: string }> }

export function GET(req: NextRequest, ctx: Ctx) {
  return handle(req, async () => {
    const { id } = await ctx.params
    return ok(await getCalcSettings(id))
  })
}

export function PUT(req: NextRequest, ctx: Ctx) {
  return handle(req, async () => {
    const { id } = await ctx.params
    const body = projectCalcSettingsSchema.parse(await readJson(req))
    return ok(await putCalcSettings(id, body))
  })
}
