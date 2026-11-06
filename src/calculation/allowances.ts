// ═══════════════════════════════════════════════════════════
// موتور محاسبات — مجازها و زمان استاندارد — FR-15
// روش ۱: ST = NT × (1 + A)
// روش ۲: ST = NT / (1 − A)   [الزام: A < 1]
// درصد به‌صورت مقدار اعشاری محاسباتی (۱۵٪ = 0.15)
// ═══════════════════════════════════════════════════════════
import { AppError } from '@/domain/types'
import { round12 } from './westinghouse'

export interface AllowanceValue {
  categoryId: string
  percentValue: number // اعشاری محاسباتی
}

/** مجموع مجازها از دسته‌های فعال */
export function sumAllowances(values: AllowanceValue[]): number {
  return round12(values.reduce((s, v) => s + v.percentValue, 0))
}

/** اعتبارسنجی مجموع مجاز برای روش انتخابی
 *  در روش سهم از زمان استاندارد، A باید کمتر از ۱ (۱۰۰٪) باشد — FR-15 */
export function validateAllowanceTotal(totalA: number, method: 'PERCENT_OF_NT' | 'SHARE_OF_ST'): void {
  if (totalA < 0) {
    throw new AppError('ALLOWANCE_NEGATIVE', 'مجموع مجازها نمی‌تواند منفی باشد.', 422)
  }
  if (method === 'SHARE_OF_ST' && totalA >= 1) {
    throw new AppError(
      'ALLOWANCE_TOO_HIGH',
      'در روش «سهم از زمان استاندارد»، مجموع مجازها باید کمتر از ۱۰۰٪ باشد؛ در غیر این صورت محاسبه ممکن نیست.',
      422,
      { totalA }
    )
  }
  if (method === 'PERCENT_OF_NT' && totalA > 10) {
    // محافظ مهندسی: مجاز بیش از ۱۰۰۰٪ قطعاً خطای داده است
    throw new AppError('ALLOWANCE_UNREALISTIC', 'مجموع مجازها غیرمعقول است (بیش از ۱۰۰۰٪).', 422, { totalA })
  }
}

/** زمان استاندارد با روش انتخابی */
export function computeStandardTime(
  normalTime: number,
  totalA: number,
  method: 'PERCENT_OF_NT' | 'SHARE_OF_ST'
): number {
  validateAllowanceTotal(totalA, method)
  if (method === 'PERCENT_OF_NT') {
    return round12(normalTime * (1 + totalA))
  }
  return round12(normalTime / (1 - totalA))
}

/** آزمون مرجع: NT=9.047, A=0.15 → روش ۱: 10.40405 / روش ۲: ≈10.643529 */
export const ALLOWANCE_REFERENCE_TEST = {
  nt: 9.047,
  a: 0.15,
  expectedM1: 10.40405,
  expectedM2: 10.643529,
} as const
