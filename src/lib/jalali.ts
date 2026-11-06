// ═══════════════════════════════════════════════════════════
// تقویم جلالی — FR-29
// پیچش نازک روی کتابخانه مرجع jalaali-js (مجوز MIT، بسته‌بندی
// محلی در زمان build — بدون هیچ تماس خارجی در زمان اجرا)
// تاریخ در پایگاه داده ISO میلادی ذخیره می‌شود؛
// تبدیل شمسی/میلادی فقط در لایه نمایش انجام می‌شود.
// ═══════════════════════════════════════════════════════════
import {
  toJalaali as jToJalaali,
  toGregorian as jToGregorian,
  isLeapJalaaliYear,
  jalaaliMonthLength,
  isValidJalaaliDate,
} from 'jalaali-js'

export interface JalaliDate {
  jy: number
  jm: number
  jd: number
}

export { isLeapJalaaliYear as isLeapJalaliYear }
/** نام یکسان با API قبلی ما */
export const jalaliMonthLength = jalaaliMonthLength

export function toJalali(gy: number, gm: number, gd: number): JalaliDate {
  return jToJalaali(gy, gm, gd)
}

export function toGregorian(jy: number, jm: number, jd: number): { gy: number; gm: number; gd: number } {
  return jToGregorian(jy, jm, jd)
}

// ── نام‌های فارسی ──
export const JALALI_MONTH_NAMES = [
  'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند',
]

export const JALALI_WEEKDAY_SHORT = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج']

/** شماره روز هفته از تاریخ جلالی (۰=شنبه) */
export function jalaliWeekDay(jy: number, jm: number, jd: number): number {
  const g = toGregorian(jy, jm, jd)
  const jsDate = new Date(Date.UTC(g.gy, g.gm - 1, g.gd))
  // getUTCDay: 0=Sunday ... 6=Saturday → شنبه=0
  return (jsDate.getUTCDay() + 1) % 7
}

/** تاریخ امروز جلالی */
export function todayJalali(): JalaliDate {
  const now = new Date()
  return toJalali(now.getFullYear(), now.getMonth() + 1, now.getDate())
}

// ── ISO (yyyy-mm-dd میلادی) ↔ جلالی ──

export function isoToJalali(iso: string): JalaliDate | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return null
  return toJalali(Number(m[1]), Number(m[2]), Number(m[3]))
}

export function jalaliToISO(jy: number, jm: number, jd: number): string {
  const g = toGregorian(jy, jm, jd)
  return `${String(g.gy).padStart(4, '0')}-${String(g.gm).padStart(2, '0')}-${String(g.gd).padStart(2, '0')}`
}

/** اعتبارسنجی تاریخ جلالی */
export function isValidJalali(jy: number, jm: number, jd: number): boolean {
  return isValidJalaaliDate(jy, jm, jd)
}
