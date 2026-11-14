// کاتالوگ عناصر پروژه — منبع مستقل نامزدهای رابطهٔ موازی — v1.5.2 §۲-۵
// جایگزین API ماتریس: تمام ایستگاه‌ها/فعالیت‌ها/عناصر پروژه با شناسه‌های واقعی.
import { NextRequest } from 'next/server'
import { handle, ok } from '@/lib/api-helpers'
import { getElementsCatalog } from '@/application/parallel-relation-service'

type Ctx = { params: Promise<{ id: string }> }

export function GET(req: NextRequest, ctx: Ctx) {
  return handle(req, async () => {
    const { id } = await ctx.params
    const catalog = await getElementsCatalog(id)
    return ok(catalog)
  })
}
