// بازیابی از فایل بارگذاری‌شده — FR-24
import { NextRequest } from 'next/server'
import { AppError } from '@/domain/types'
import { handle, ok } from '@/lib/api-helpers'
import { restoreBackup } from '@/infrastructure/backup'

export function POST(req: NextRequest) {
  return handle(req, async () => {
    const form = await req.formData()
    const file = form.get('file')
    const confirm = form.get('confirmReplace')
    if (!(file instanceof File)) {
      throw new AppError('NO_FILE', 'فایل پشتیبان انتخاب نشده است.', 422)
    }
    if (confirm !== 'true') {
      throw new AppError('CONFIRM_REQUIRED', 'برای بازیابی، تأیید صریح جایگزینی داده‌ها الزامی است.', 422)
    }
    if (file.size > 100 * 1024 * 1024) {
      throw new AppError('FILE_TOO_LARGE', 'حجم فایل پشتیبان بیش از ۱۰۰ مگابایت است.', 413)
    }
    const jsonText = await file.text()
    const result = await restoreBackup({ fileJson: jsonText })
    return ok(result)
  })
}
