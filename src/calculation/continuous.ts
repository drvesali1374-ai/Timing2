// ═══════════════════════════════════════════════════════════
// موتور محاسبات — روش پیوسته (Continuous) — FR-09
// مدت عنصر = قرائت تجمعی فعلی − قرائت تجمعی قبلی در همان خط زمانی
// قرائت نزولی خطا است (مگر رخداد ریست/جلسه جدید که باید جلسه جدید ساخته شود)
// ═══════════════════════════════════════════════════════════
import { AppError } from '@/domain/types'
import { round12 } from './westinghouse'

export interface ContinuousReading {
  /** قرائت تجمعی خام ثبت‌شده توسط کاربر */
  cumulativeReading: number
  /** قرائت تجمعی قبلی در همان خط زمانی؛ برای نخستین عنصر صفر فرض می‌شود */
  previousReading?: number
}

export interface ContinuousResult {
  /** قرائت خام (بدون تغییر نگهداری می‌شود) */
  rawReading: number
  /** مدت تفاضلی محاسبه‌شده */
  duration: number
}

/** تبدیل یک قرائت تجمعی به مدت عنصر */
export function deriveContinuousDuration(r: ContinuousReading): ContinuousResult {
  const prev = r.previousReading ?? 0
  if (r.cumulativeReading < prev) {
    throw new AppError(
      'READING_GOING_BACK',
      `قرائت تجمعی (${r.cumulativeReading}) نمی‌تواند از قرائت قبلی (${prev}) کمتر باشد؛ برای شروع مجدد، جلسه جدید ایجاد کنید.`,
      422,
      { cumulativeReading: r.cumulativeReading, previousReading: prev }
    )
  }
  return { rawReading: r.cumulativeReading, duration: round12(r.cumulativeReading - prev) }
}

/** تبدیل دنباله قرائت‌های تجمعی به مدت‌ها (در یک خط زمانی)
 *  قرائت‌های ۸، ۲۰، ۴۵ → مدت‌های ۸، ۱۲، ۲۵ */
export function deriveContinuousSequence(readings: number[]): ContinuousResult[] {
  const out: ContinuousResult[] = []
  let prev = 0
  for (const reading of readings) {
    out.push(deriveContinuousDuration({ cumulativeReading: reading, previousReading: prev }))
    prev = reading
  }
  return out
}

/** آزمون مرجع PRD — بخش ۸.۳ */
export const CONTINUOUS_REFERENCE_TEST = {
  readings: [8, 20, 45],
  expectedDurations: [8, 12, 25],
} as const
