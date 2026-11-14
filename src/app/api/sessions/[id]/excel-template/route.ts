// قالب Excel برگهٔ زمان‌سنجی — v1.5.2 §۹
// GET  → دانلود قالب xlsx متناسب با جلسه (پروژه/فعالیت/عناصر واقعی)
// POST → تجزیهٔ فایل تکمیل‌شده؛ خروجی فقط «ورودی همان مسیر Paste» است
//        و هیچ ذخیرهٔ مستقیمی انجام نمی‌شود (§۹-۶).
import { NextRequest, NextResponse } from 'next/server'
import { handle, ok } from '@/lib/api-helpers'
import { AppError } from '@/domain/types'
import { buildTimingExcelTemplate, parseTimingExcelTemplate } from '@/infrastructure/excel-sheet-template'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, ctx: Ctx) {
  return handle(req, async () => {
    const { id } = await ctx.params
    const { buffer, filename } = await buildTimingExcelTemplate(id)

    // نام فایل فارسی — RFC 5987 برای پشتیبانی مرورگرها
    const encodedName = encodeURIComponent(filename)
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'content-disposition': `attachment; filename="timing-template.xlsx"; filename*=UTF-8''${encodedName}`,
        'cache-control': 'no-store',
      },
    })
  })
}

export async function POST(req: NextRequest, ctx: Ctx) {
  return handle(req, async () => {
    const { id } = await ctx.params

    let file: File | null = null
    try {
      const form = await req.formData()
      const f = form.get('file')
      if (f instanceof File) file = f
    } catch {
      // بدنهٔ multipart نامعتبر
    }
    if (!file || file.size === 0) {
      throw new AppError('VALIDATION_ERROR', 'فایلی برای بارگذاری ارسال نشد یا فایل خالی است.', 422)
    }
    if (file.size > 15 * 1024 * 1024) {
      throw new AppError('VALIDATION_ERROR', 'حجم فایل بیش از حد مجاز است (حداکثر ۱۵ مگابایت).', 422)
    }

    const parsed = await parseTimingExcelTemplate(id, file)
    return ok({ result: parsed })
  })
}
