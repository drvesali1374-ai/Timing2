// ═══════════════════════════════════════════════════════════
// موتور محاسبات — گردکردن نمایش — ۸.۱
// گردکردن فقط در لایه نمایش/خروجی انجام می‌شود؛
// مقدار خام و محاسباتی با دقت بالا باقی می‌ماند.
// نمایش پیش‌فرض: دو رقم اعشار (۱۲٫۳۵۷ → ۱۲٫۳۶)
// ═══════════════════════════════════════════════════════════

/** گردکردن نیم‌به‌بالا (round half away from zero) — قاعده صریح و یکسان */
export function roundForDisplay(value: number, decimals = 2): number {
  if (!Number.isFinite(value)) return value
  const factor = Math.pow(10, decimals)
  // حذف نویز باینری پیش از گردکردن (مثلاً 12.345999999 → 12.346)
  const cleaned = Math.round((value + Number.EPSILON) * 1e12) / 1e12
  return Number.isFinite(cleaned)
    ? cleaned >= 0
      ? Math.round(cleaned * factor + Number.EPSILON * factor) / factor
      : -Math.round(-cleaned * factor + Number.EPSILON * factor) / factor
    : cleaned
}

/** نمایش رشته‌ای با ارقام لاتین (تبدیل ارقام فارسی در لایه UI انجام می‌شود) */
export function formatForDisplay(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return '—'
  return roundForDisplay(value, decimals).toFixed(decimals)
}

/** آزمون مرجع: ۱۲٫۳۵۷ → ۱۲٫۳۶ بدون تغییر مقدار خام */
export const ROUNDING_REFERENCE_TEST = {
  raw: 12.357,
  expectedDisplay: '12.36',
} as const
