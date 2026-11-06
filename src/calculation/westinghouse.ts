// ═══════════════════════════════════════════════════════════
// موتور محاسبات — ارزیابی وستینگهاوس — FR-13
// R = 1 + Skill + Effort + Conditions + Consistency
// توابع خالص، مستقل از UI و پایگاه داده — ۶.۳
// ═══════════════════════════════════════════════════════════

/** حذف نویز باینری اعداد اعشاری با گردکردن به ۱۲ رقم اعشار
 *  مقدار خام با دقت بالا حفظ می‌شود؛ گردکردن نمایش در لایه جدا است — ۸.۱ */
export function round12(value: number): number {
  if (!Number.isFinite(value)) return value
  return Math.round(value * 1e12) / 1e12
}

export interface RatingFactorValues {
  skill: number
  effort: number
  conditions: number
  consistency: number
}

/** محاسبه ضریب عملکرد R */
export function computeRatingFactor(v: RatingFactorValues): number {
  return round12(1 + v.skill + v.effort + v.conditions + v.consistency)
}

/** زمان نرمال: NT = OT × R */
export function computeNormalTime(observedTime: number, ratingFactor: number): number {
  return round12(observedTime * ratingFactor)
}

/** آزمون مرجع: S=+0.06, E=+0.02, C=0, Cons=+0.01 → R=1.09 و NT(8.30)=9.047 */
export const WESTINGHOUSE_REFERENCE_TEST = {
  factors: { skill: 0.06, effort: 0.02, conditions: 0, consistency: 0.01 },
  expectedR: 1.09,
  ot: 8.3,
  expectedNT: 9.047,
} as const
