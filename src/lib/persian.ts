// ═══════════════════════════════════════════════════════════
// ابزارهای ارقام فارسی/عربی/لاتین — FR-29، FR-07
// ورودی ارقام فارسی و لاتین پذیرفته می‌شود و پیش از پردازش
// به قالب عددی استاندارد تبدیل می‌گردد.
// ═══════════════════════════════════════════════════════════

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹'
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩'
const LATIN_DIGITS = '0123456789'

/** تبدیل رشته عددی شامل ارقام فارسی/عربی به رشته با ارقام لاتین */
export function normalizeDigits(input: string): string {
  if (!input) return input
  let out = ''
  for (const ch of input) {
    const pi = PERSIAN_DIGITS.indexOf(ch)
    if (pi >= 0) {
      out += LATIN_DIGITS[pi]
      continue
    }
    const ai = ARABIC_DIGITS.indexOf(ch)
    if (ai >= 0) {
      out += LATIN_DIGITS[ai]
      continue
    }
    // جداکننده اعشار فارسی «٫» و عربی «٬» و ممیز فارسی «،» → نقطه
    if (ch === '٫' || ch === '،' || ch === '٬') {
      out += '.'
      continue
    }
    // فاصله‌های نامرئی و جداکننده هزارگان
    if (ch === '\u200c' || ch === '\u200f' || ch === '\u200e' || ch === ' ' || ch === '_') continue
    out += ch
  }
  return out
}

/** تجزیه عدد از ورودی فارسی/لاتین؛ در صورت نامعتبر بودن NaN برمی‌گرداند */
export function parseNumber(input: string | number | null | undefined): number {
  if (input === null || input === undefined) return NaN
  if (typeof input === 'number') return input
  const s = normalizeDigits(String(input)).trim()
  if (s === '') return NaN
  const n = Number(s)
  return n
}

/** تبدیل رشته لاتین به رشته با ارقام فارسی */
export function toPersianDigits(input: string | number): string {
  const s = String(input)
  let out = ''
  for (const ch of s) {
    const li = LATIN_DIGITS.indexOf(ch)
    out += li >= 0 ? PERSIAN_DIGITS[li] : ch
  }
  return out
}

/** تبدیل رشته لاتین به رشته با ارقام لاتین (بدون تغییر) — برای تقارن API */
export function toLatinDigits(input: string | number): string {
  return normalizeDigits(String(input))
}

/** قالب‌بندی عدد با ارقام فارسی یا لاتین و جداکننده هزارگان اختیاری */
export function formatNumberByMode(
  value: number,
  mode: 'persian' | 'latin',
  options?: { decimals?: number; groupSeparator?: boolean }
): string {
  const decimals = options?.decimals ?? 2
  const fixed = Number.isFinite(value) ? value.toFixed(decimals) : '—'
  let out: string
  if (options?.groupSeparator) {
    const [int, frac] = fixed.split('.')
    const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    out = frac !== undefined ? `${grouped}.${frac}` : grouped
  } else {
    out = fixed
  }
  return mode === 'persian' ? toPersianDigits(out).replace(/\./g, '٫') : out
}
