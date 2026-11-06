// دانلود فایل پشتیبان — FR-24 (پشتیبان دستی با انتخاب مقصد)
import { NextRequest } from 'next/server'
import { handle } from '@/lib/api-helpers'
import { readBackupFile } from '@/infrastructure/backup'
import { AppError } from '@/domain/types'

type Ctx = { params: Promise<{ id: string }> }

export function GET(req: NextRequest, ctx: Ctx) {
  return handle(req, async () => {
    const { id } = await ctx.params
    const file = await readBackupFile(id)
    if (!file) throw new AppError('BACKUP_FILE_MISSING', 'فایل پشتیبان یافت نشد یا قابل خواندن نیست.', 404)
    return new Response(file.content, {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'content-disposition': `attachment; filename="${file.fileName}"`,
      },
    })
  })
}
