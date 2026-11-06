// ═══════════════════════════════════════════════════════════
// قالب‌بندی نمایش تاریخ/عدد بر اساس تنظیمات کاربر — FR-29
// این ماژول سمت کلاینت استفاده می‌شود؛ تاریخ خام ISO است.
// ═══════════════════════════════════════════════════════════
import { isoToJalali, JALALI_MONTH_NAMES } from './jalali'
import { toPersianDigits } from './persian'
import type { CalendarMode, DigitsMode } from '@/domain/types'

export interface DisplayPrefs {
  calendar: CalendarMode
  digits: DigitsMode
  decimals: number
}

export const DEFAULT_DISPLAY_PREFS: DisplayPrefs = {
  calendar: 'jalali',
  digits: 'persian',
  decimals: 2,
}

function applyDigits(text: string, mode: DigitsMode): string {
  return mode === 'persian' ? toPersianDigits(text).replace(/\./g, '٫') : text
}

/** نمایش تاریخ ISO بر اساس تقویم انتخابی؛ خالی → «—» */
export function formatDate(iso: string | null | undefined, prefs: DisplayPrefs): string {
  if (!iso) return '—'
  if (prefs.calendar === 'gregorian') {
    return applyDigits(iso, prefs.digits)
  }
  const j = isoToJalali(iso)
  if (!j) return applyDigits(iso, prefs.digits)
  return applyDigits(`${j.jd} ${JALALI_MONTH_NAMES[j.jm - 1]} ${j.jy}`, prefs.digits)
}

/** نمایش تاریخ و ساعت ISO datetime */
export function formatDateTime(isoDateTime: string | null | undefined, prefs: DisplayPrefs): string {
  if (!isoDateTime) return '—'
  const d = new Date(isoDateTime)
  if (Number.isNaN(d.getTime())) return applyDigits(isoDateTime, prefs.digits)
  const datePart = formatDate(d.toISOString().slice(0, 10), prefs)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${datePart}، ${applyDigits(`${hh}:${mm}`, prefs.digits)}`
}

/** نمایش عدد با ارقام و اعشار انتخابی (گردکردن فقط نمایشی) */
export function formatTimeValue(
  value: number | null | undefined,
  prefs: DisplayPrefs,
  decimalsOverride?: number
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  const dec = decimalsOverride ?? prefs.decimals
  const fixed = Math.round((value + Number.EPSILON) * Math.pow(10, dec)) / Math.pow(10, dec)
  return applyDigits(fixed.toFixed(dec), prefs.digits)
}

/** نمایش درصد (ورودی اعشاری محاسباتی: 0.15 → ۱۵٪) */
export function formatPercent(
  decimalValue: number | null | undefined,
  prefs: DisplayPrefs,
  decimals = 1
): string {
  if (decimalValue === null || decimalValue === undefined || !Number.isFinite(decimalValue)) return '—'
  const pct = decimalValue * 100
  const fixed = Math.round(pct * Math.pow(10, decimals)) / Math.pow(10, decimals)
  return applyDigits(`${fixed}٪`, prefs.digits)
}

/** نمایش عدد صحیح */
export function formatInt(value: number | null | undefined, prefs: DisplayPrefs): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  return applyDigits(String(Math.round(value)), prefs.digits)
}

/**
 * متن توضیحی تولیدشدهٔ سرور را مطابق ترجیح ارقام نمایش می‌دهد — FR-29.
 * فقط برای جمله‌های سیستمی (یادداشت/علت/پیام)؛ نام‌های ثبت‌شدهٔ کاربر
 * دست‌نخورده می‌مانند.
 */
export function displayServerText(text: string, prefs: DisplayPrefs): string {
  return applyDigits(text, prefs.digits)
}
