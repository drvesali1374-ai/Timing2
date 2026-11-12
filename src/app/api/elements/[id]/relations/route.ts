// روابط موازی یک عنصر — نمای فرم (منبع واحد سرویس مرکزی) — جلسه ۲ §۴.۲
// §۶ ممیزی جلسه ۲: پارامتر sessionId مقدار نمایشی را به چرخه‌های همان جلسه
// محدود می‌کند (فرم زمان‌سنجی)؛ بدون آن، آخرین مقدار کل پروژه با برچسب صریح.
import { NextRequest } from 'next/server'
import { handle, ok } from '@/lib/api-helpers'
import { getElementRelations } from '@/application/overlap-service'

type Ctx = { params: Promise<{ id: string }> }

export function GET(req: NextRequest, ctx: Ctx) {
  return handle(req, async () => {
    const { id } = await ctx.params
    const sessionId = req.nextUrl.searchParams.get('sessionId')
    const data = await getElementRelations(id, { sessionId: sessionId || null })
    return ok(data)
  })
}
