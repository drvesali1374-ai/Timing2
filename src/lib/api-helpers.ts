// ═══════════════════════════════════════════════════════════
// ابزارهای مشترک API — پاسخ استاندارد + خطای ساختاریافته فارسی
// + Idempotency بر اساس X-Change-Id — ۶.۵ / ۶.۶
// ═══════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { AppError } from '@/domain/types'
import { getIdempotentResult, storeIdempotentResult } from '@/infrastructure/idempotency'

export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data as unknown as Record<string, unknown>, { status })
}

/** تبدیل خطای Zod به پیام فارسی ساختاریافته */
function zodToAppError(e: ZodError): AppError {
  const issues = e.issues.map((i) => ({
    path: i.path.join('.'),
    message: i.message,
  }))
  const first = issues[0]
  const friendly: Record<string, string> = {
    name: 'نام',
    lineName: 'نام خط تولید',
    productName: 'نام محصول',
    studyDate: 'تاریخ مطالعه',
    description: 'شرح',
    displayName: 'نام نمایشی',
    percentValue: 'درصد مجاز',
    targetSampleCount: 'تعداد نمونه هدف',
    groupId: 'گروه',
    processType: 'نوع فرایندی',
  }
  const fieldLabel = first ? friendly[first.path.split('.')[0]] ?? first.path : ''
  return new AppError(
    'VALIDATION_ERROR',
    `ورودی نامعتبر است${fieldLabel ? ` (${fieldLabel})` : ''}: ${first?.message ?? ''}`,
    422,
    { issues }
  )
}

/** مدیریت متمرکز خطاها — هیچ خطایی با catch خالی پنهان نمی‌شود */
export function fail(error: unknown): NextResponse {
  if (error instanceof AppError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message, details: error.details ?? null } },
      { status: error.status }
    )
  }
  if (error instanceof ZodError) {
    const appErr = zodToAppError(error)
    return NextResponse.json(
      { error: { code: appErr.code, message: appErr.message, details: appErr.details } },
      { status: appErr.status }
    )
  }
  const message = error instanceof Error ? error.message : 'خطای ناشناخته'
  // لاگ فنی سرور (جدا از پیام کاربر) — ۷.۶
  console.error('[api-error]', error)
  return NextResponse.json(
    {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'خطای داخلی سرور رخ داد. جزئیات فنی در لاگ سرور ثبت شد.',
        details: process.env.NODE_ENV === 'development' ? message : null,
      },
    },
    { status: 500 }
  )
}

/** اجرای هندلر با پشتیبانی Idempotency (X-Change-Id) */
export async function handle(
  req: NextRequest,
  fn: () => Promise<Response>
): Promise<Response> {
  const changeId = req.headers.get('x-change-id')
  if (changeId && req.method !== 'GET') {
    const cached = getIdempotentResult(changeId)
    if (cached) {
      return NextResponse.json(cached.body as Record<string, unknown>, { status: cached.status })
    }
  }
  try {
    const res = await fn()
    if (changeId && req.method !== 'GET') {
      // فقط پاسخ‌های موفق کش می‌شوند؛ خطاها قابل تکرارند
      if (res.status >= 200 && res.status < 300) {
        // فقط پاسخ‌های JSON قابل کش idempotency هستند
        const ct = res.headers.get('content-type') ?? ''
        if (ct.includes('application/json')) {
          const body = await res.clone().json().catch(() => null)
          if (body) storeIdempotentResult(changeId, res.status, body)
        }
      }
    }
    return res
  } catch (error) {
    return fail(error)
  }
}

/** بدنه JSON با حداقل اندازه */
export async function readJson(req: NextRequest): Promise<unknown> {
  const text = await req.text()
  if (!text || text.length > 25 * 1024 * 1024) {
    throw new AppError('BODY_TOO_LARGE', 'حجم درخواست بیش از حد مجاز است (۲۵ مگابایت).', 413)
  }
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    throw new AppError('INVALID_JSON', 'بدنه درخواست JSON معتبر نیست.', 400)
  }
}
