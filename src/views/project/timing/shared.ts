// ═══════════════════════════════════════════════════════════
// زمان‌سنجی — انواع و ابزارهای مشترک UI برگه — FR-07 / v1.5.0
// پارس اعداد فارسی/لاتین، قالب‌بندی نمایش، مدل ردیف شبکهٔ جدید:
// ردیف = عنصر کاری + زیرردیف‌های روابط موازی؛ ستون = چرخه (§۵)
// ═══════════════════════════════════════════════════════════
import type { CycleRowDto, ObservationCellDto, SessionSheetDto } from '@/lib/api/endpoints'
import { parseNumber } from '@/lib/persian'
import type { DisplayPrefs } from '@/lib/format'
import { formatTimeValue } from '@/lib/format'

/** نوع مقدار یک سلول پس از پارس ورودی کاربر */
export type ParsedCellValue =
  | { kind: 'EMPTY' }
  | { kind: 'NUMBER'; value: number }
  | { kind: 'INTERVAL'; start: number; end: number }
  | { kind: 'INVALID'; reason: string }

/** پارس ورودی سلول — یک عدد یا بازهٔ «شروع-پایان» — FR-07 */
export function parseCellInput(text: string): ParsedCellValue {
  const t = text.trim()
  if (t === '' || t === '-' || t === '—' || t === '–') return { kind: 'EMPTY' }
  const normalized = t
    .replace(/\s*تا\s*/, '-')
    .replace(/\s*\.\.\s*/, '-')
    .replace(/\s*:\s*/, '-')
    .replace(/\s*-\s*/, '-')
  const intervalMatch = normalized.match(/^(-?[\d.,٫\u0660-\u0669\u06f0-\u06f9]+)-(-?[\d.,٫\u0660-\u0669\u06f0-\u06f9]+)$/)
  if (intervalMatch) {
    const start = parseNumber(intervalMatch[1])
    const end = parseNumber(intervalMatch[2])
    if (Number.isFinite(start) && Number.isFinite(end)) return { kind: 'INTERVAL', start, end }
    return { kind: 'INVALID', reason: 'عدد بازه معتبر نیست' }
  }
  const n = parseNumber(normalized)
  if (!Number.isFinite(n)) return { kind: 'INVALID', reason: 'مقدار عددی معتبر نیست (ارقام فارسی یا لاتین)' }
  return { kind: 'NUMBER', value: n }
}

/** بارهای ارسالی سلول به API */
export interface CellPayload {
  workElementId: string
  rawDuration?: number | null
  cumulativeReading?: number | null
  startOffset?: number | null
  endOffset?: number | null
}

/** حالت ورود یک عنصر در برگه */
export interface ElementColumn {
  index: number
  id: string
  name: string
  entryMode: 'SEQ' | 'INT'
}

export function buildColumns(sheet: SessionSheetDto, overrides: Record<string, 'SEQ' | 'INT'>): ElementColumn[] {
  return sheet.elements.map((e, i) => ({
    index: i,
    id: e.id,
    name: e.name,
    entryMode: overrides[e.id] ?? e.defaultEntry,
  }))
}

export function findObservation(cycle: CycleRowDto, workElementId: string): ObservationCellDto | undefined {
  return cycle.observations.find((o) => o.workElementId === workElementId)
}

// ═══════════════ مدل ردیف‌های شبکه — §۵.۲ v1.5.0 ═══════════════

/** ردیف اصلی عنصر کاری */
export interface ElementRowModel {
  kind: 'ELEMENT'
  elementIndex: number
  elementId: string
  name: string
  entryMode: 'SEQ' | 'INT'
}

/** زیرردیف رابطهٔ موازی — فقط نمایی از رابطه؛ هرگز WorkElement نیست (§۵.۲) */
export interface ParallelRowModel {
  kind: 'PARALLEL'
  parentElementId: string
  parentElementIndex: number
  parentName: string
  relationId: string
  otherElementId: string
  otherName: string
  /** v1.5.1 §۷ — فعالیت/ایستگاه عنصر مقابل (برای برچسب روابط بین‌فعالیت) */
  otherActivityName: string | null
  otherStationName: string | null
  /** v1.5.1 §۷ — آیا عنصر مقابل خارج از Activity این برگه است؟ */
  crossActivity: boolean
  /** کلید نمایشی §۵.۲: parallel:{relationId}:under:{parentElementId} */
  displayKey: string
}

export type GridRow = ElementRowModel | ParallelRowModel

/** ساخت ردیف‌های شبکه: عناصر به ترتیب sortOrder + زیرردیف روابط فعال
 *  زیر endpoint حاضر در این Activity (به ترتیب عنصر مقصد) — §۵.۱/§۹.۱.
 *  v1.5.1 §۷ — روابط بین‌فعالیت فقط زیر endpoint حاضر ساخته می‌شوند؛
 *  در برگهٔ Activity مقابل، همان relationId زیر endpoint دیگر ظاهر می‌شود. */
export function buildRows(sheet: SessionSheetDto, columns: ElementColumn[]): GridRow[] {
  const rows: GridRow[] = []
  const byId = new Map(columns.map((c) => [c.id, c]))
  for (const col of columns) {
    rows.push({ kind: 'ELEMENT', elementIndex: col.index, elementId: col.id, name: col.name, entryMode: col.entryMode })
    const rels = sheet.parallelRelations
      .filter((r) => r.elementLowId === col.id || r.elementHighId === col.id)
      .map((r) => {
        const isLow = r.elementLowId === col.id
        const otherId = isLow ? r.elementHighId : r.elementLowId
        const otherName = isLow ? r.elementHighName : r.elementLowName
        const otherActivityId = isLow ? r.elementHighActivityId : r.elementLowActivityId
        const otherActivityName = isLow ? r.elementHighActivityName : r.elementLowActivityName
        const otherStationName = isLow ? r.elementHighStationName : r.elementLowStationName
        // روابط بین‌فعالیت (عنصر مقصد خارج از این Activity) پس از روابط داخلی
        return {
          r,
          otherId,
          otherName,
          otherActivityId,
          otherActivityName,
          otherStationName,
          crossActivity: otherActivityId !== null && otherActivityId !== sheet.activity.id,
          otherSort: byId.has(otherId) ? (byId.get(otherId)!.index as number) : 10000,
        }
      })
      .sort((a, b) => a.otherSort - b.otherSort)
    for (const rel of rels) {
      rows.push({
        kind: 'PARALLEL',
        parentElementId: col.id,
        parentElementIndex: col.index,
        parentName: col.name,
        relationId: rel.r.relationId,
        otherElementId: rel.otherId,
        otherName: rel.otherName,
        otherActivityName: rel.otherActivityName,
        otherStationName: rel.otherStationName,
        crossActivity: rel.crossActivity,
        displayKey: `parallel:${rel.r.relationId}:under:${col.id}`,
      })
    }
  }
  return rows
}

// v1.5.2 §۲-۸ — سلول وضعیت/مقدار هم‌پوشانی حذف شد؛ زیرردیف موازی
// زمان عادی عنصر مقابل را از همان observations چرخه می‌خواند (بازهٔ از/تا).

/** متن نمایشی یک سلول بر اساس دادهٔ سرور — دو رقم اعشار پیش‌فرض — FR-07 */
export function cellDisplayValue(
  obs: ObservationCellDto | undefined,
  method: 'SNAPBACK' | 'CONTINUOUS',
  prefs: DisplayPrefs
): string {
  if (!obs) return ''
  if (obs.startOffset !== null || obs.endOffset !== null) {
    if (obs.startOffset !== null && obs.endOffset !== null) {
      return `${formatTimeValue(obs.startOffset, prefs)} – ${formatTimeValue(obs.endOffset, prefs)}`
    }
    return obs.startOffset !== null ? `${formatTimeValue(obs.startOffset, prefs)} – ؟` : `؟ – ${formatTimeValue(obs.endOffset, prefs)}`
  }
  if (method === 'CONTINUOUS' && obs.cumulativeReading !== null) {
    return formatTimeValue(obs.cumulativeReading, prefs)
  }
  if (obs.rawDuration !== null) return formatTimeValue(obs.rawDuration, prefs)
  return ''
}

/** مقدار ویرایش اولیهٔ سلول هنگام شروع تایپ (لاتین، بدون قالب‌بندی) */
export function cellEditValue(
  obs: ObservationCellDto | undefined,
  method: 'SNAPBACK' | 'CONTINUOUS'
): { seq: string; start: string; end: string } {
  if (!obs) return { seq: '', start: '', end: '' }
  const round = (v: number | null) => (v === null ? '' : String(Math.round(v * 1e6) / 1e6))
  return {
    seq: round(method === 'CONTINUOUS' ? obs.cumulativeReading : obs.rawDuration),
    start: round(obs.startOffset),
    end: round(obs.endOffset),
  }
}

/** ساخت payload از ورودی پارس‌شده بر اساس روش جلسه و حالت عنصر */
export function payloadFromParsed(
  parsed: ParsedCellValue,
  column: ElementColumn,
  method: 'SNAPBACK' | 'CONTINUOUS'
): CellPayload | { error: string } {
  const base: CellPayload = { workElementId: column.id }
  if (parsed.kind === 'EMPTY') {
    // پاک‌کردن کامل سلول — خالی با صفر یکسان نیست — ۸.۲
    if (column.entryMode === 'INT') {
      base.startOffset = null
      base.endOffset = null
    } else if (method === 'CONTINUOUS') {
      base.cumulativeReading = null
    } else {
      base.rawDuration = null
    }
    return base
  }
  if (parsed.kind === 'INVALID') return { error: parsed.reason }
  if (parsed.kind === 'INTERVAL') {
    if (parsed.start < 0) return { error: 'شروع بازه نمی‌تواند منفی باشد' }
    if (parsed.end <= parsed.start) return { error: 'پایان بازه باید بزرگ‌تر از شروع آن باشد' }
    base.startOffset = parsed.start
    base.endOffset = parsed.end
    return base
  }
  // NUMBER
  if (parsed.value < 0) return { error: 'زمان منفی مجاز نیست' }
  if (method === 'CONTINUOUS') base.cumulativeReading = parsed.value
  else base.rawDuration = parsed.value
  return base
}

/** مقدار قبلی سلول برای Undo — دقیقاً همان فیلدهایی که اکنون مقدار دارند */
export function captureBefore(
  obs: ObservationCellDto | undefined,
  workElementId: string
): CellPayload {
  const p: CellPayload = { workElementId }
  if (!obs) return p
  p.rawDuration = obs.rawDuration
  p.cumulativeReading = obs.cumulativeReading
  p.startOffset = obs.startOffset
  p.endOffset = obs.endOffset
  return p
}

/** دلایل استاندارد خروج از محاسبه — FR-11 */
export const EXCLUSION_REASONS = [
  'اپراتور کار را در میانهٔ چرخه متوقف کرد',
  'مداخلهٔ بیرونی در چرخه (سرپرست/مواد/قطعه)',
  'خطای ثبت یا خواندن زمان',
  'مواد یا قطعهٔ غیرمعیار',
  'چرخهٔ نمایندهٔ شرایط عادی نیست',
] as const
