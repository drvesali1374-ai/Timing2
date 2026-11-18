// برگه‌های زمان‌سنجی ثبت‌شده برای یک عنصر — v1.5.4 §۱ (انتخاب برگه در وستینگهاوس)
import { NextRequest } from 'next/server'
import { handle, ok } from '@/lib/api-helpers'
import { listElementTimingSheets } from '@/application/rating-service'

type Ctx = { params: Promise<{ id: string }> }

export function GET(req: NextRequest, ctx: Ctx) {
  return handle(req, async () => {
    const { id } = await ctx.params
    return ok(await listElementTimingSheets(id))
  })
}
