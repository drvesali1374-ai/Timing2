// ═══════════════════════════════════════════════════════════
// موتور محاسبات — کار هم‌زمان و هم‌پوشانی — FR-10 / FR-16
// مدت بازه = پایان − شروع
// زمان سپری‌شده چرخه = دیرترین پایان − زودترین شروع (گستره)
// ⚠ جمع مدت‌های هم‌پوشان هرگز زمان سپری‌شده چرخه نیست
// ═══════════════════════════════════════════════════════════
import { AppError } from '@/domain/types'
import { round12 } from './westinghouse'

export interface TimeInterval {
  startOffset: number
  endOffset: number
}

/** اعتبارسنجی بازه: پایان باید بزرگ‌تر از شروع باشد — ۸.۲ */
export function validateInterval(interval: TimeInterval): void {
  if (interval.endOffset <= interval.startOffset) {
    throw new AppError(
      'INVALID_INTERVAL',
      `پایان بازه (${interval.endOffset}) باید بزرگ‌تر از شروع آن (${interval.startOffset}) باشد.`,
      422,
      interval
    )
  }
  if (interval.startOffset < 0) {
    throw new AppError(
      'NEGATIVE_START',
      `شروع بازه (${interval.startOffset}) نمی‌تواند منفی باشد؛ آفست‌ها نسبت به مبدأ چرخه اندازه‌گیری می‌شوند.`,
      422,
      interval
    )
  }
}

/** مدت یک بازه: پایان − شروع */
export function intervalDuration(interval: TimeInterval): number {
  validateInterval(interval)
  return round12(interval.endOffset - interval.startOffset)
}

/** مجموع مدت بازه‌ها (شاخص جداگانه؛ نه زمان سپری‌شده!) */
export function sumIntervalDurations(intervals: TimeInterval[]): number {
  return round12(intervals.reduce((s, i) => s + intervalDuration(i), 0))
}

/** زمان سپری‌شده چرخه از گستره بازه‌ها: دیرترین پایان − زودترین شروع
 *  اگر بازه‌ای ثبت نشده باشد → null (محاسبه‌نشده/نیازمند تکمیل — FR-10) */
export function elapsedCycleTime(intervals: TimeInterval[]): number | null {
  if (intervals.length === 0) return null
  intervals.forEach(validateInterval)
  const earliestStart = Math.min(...intervals.map((i) => i.startOffset))
  const latestEnd = Math.max(...intervals.map((i) => i.endOffset))
  return round12(latestEnd - earliestStart)
}

/** آیا فعالیت دارای عنصر هم‌پوشان است؟ (برای FR-16: استاندارد کل فعالیت نیازمند قاعده تجمیع) */
export function hasOverlap(intervals: TimeInterval[]): boolean {
  const sorted = [...intervals].sort((a, b) => a.startOffset - b.startOffset)
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].startOffset < sorted[i - 1].endOffset) return true
  }
  return false
}

/** آزمون مرجع PRD — بخش ۸.۳:
 *  بازه‌های [۰،۸] و [۵،۲۵]: مجموع مدت‌ها ۲۸ و زمان سپری‌شده ۲۵ */
export const OVERLAP_REFERENCE_TEST = {
  intervals: [
    { startOffset: 0, endOffset: 8 },
    { startOffset: 5, endOffset: 25 },
  ],
  expectedSumDurations: 28,
  expectedElapsed: 25,
} as const
