// ورود بسته پروژه — همیشه پروژه جدید — FR-25
import { NextRequest } from 'next/server'
import { AppError } from '@/domain/types'
import { handle, ok } from '@/lib/api-helpers'
import { importProjectPackage } from '@/infrastructure/package-io'

export function POST(req: NextRequest) {
  return handle(req, async () => {
    const contentType = req.headers.get('content-type') ?? ''
    let jsonText: string
    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData()
      const file = form.get('file')
      if (!(file instanceof File)) {
        throw new AppError('NO_FILE', 'فایل بسته انتخاب نشده است.', 422)
      }
      if (file.size > 50 * 1024 * 1024) {
        throw new AppError('FILE_TOO_LARGE', 'حجم فایل بسته بیش از ۵۰ مگابایت است.', 413)
      }
      jsonText = await file.text()
    } else {
      jsonText = await req.text()
    }
    const result = await importProjectPackage(jsonText)
    return ok(result, 201)
  })
}
