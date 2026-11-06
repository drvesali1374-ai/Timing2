// بازیابی پشتیبان — با تأیید صریح — FR-24
import { NextRequest } from 'next/server'
import { handle, ok, readJson } from '@/lib/api-helpers'
import { restoreBackup } from '@/infrastructure/backup'
import { restoreSchema } from '@/domain/validation'

type Ctx = { params: Promise<{ id: string }> }

export function POST(req: NextRequest, ctx: Ctx) {
  return handle(req, async () => {
    const { id } = await ctx.params
    const body = restoreSchema.parse(await readJson(req))
    if (!body.confirmReplace) {
      return ok(
        { error: { code: 'CONFIRM_REQUIRED', message: 'برای بازیابی، تأیید صریح جایگزینی داده‌ها الزامی است.' } },
        422
      )
    }
    const result = await restoreBackup({ backupId: id })
    return ok(result)
  })
}
