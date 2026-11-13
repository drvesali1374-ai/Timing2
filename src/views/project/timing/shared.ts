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
  /** کلید نمایشی §۵.۲: parallel:{relationId}:under:{parentElementId} */
  displayKey: string
}

export type GridRow = ElementRowModel | ParallelRowModel

/** ساخت ردیف‌های شبکه: عناصر به ترتیب sortOrder + زیرردیف روابط فعال
 *  هر عنصر زیر آن (به ترتیب عنصر مقصد) — §۵.۱/§۹.۱ */
export function buildRows(sheet: SessionSheetDto, columns: ElementColumn[]): GridRow[] {
  const rows: GridRow[] = []
  const byId = new Map(columns.map((c) => [c.id, c]))
  for (const col of columns) {
    rows.push({ kind: 'ELEMENT', elementIndex: col.index, elementId: col.id, name: col.name, entryMode: col.entryMode })
    const rels = sheet.parallelRelations
      .filter((r) => r.elementLowId === col.id || r.elementHighId === col.id)
      .map((r) => {
        const otherId = r.elementLowId === col.id ? r.elementHighId : r.elementLowId
        const otherName = r.elementLowId === col.id ? r.elementHighName : r.elementLowName
        return { r, otherId, otherName, otherSort: byId.get(otherId)?.index ?? 9999 }
      })
      .sort((a, b) => a.otherSort - b.otherSort)
    for (const { r, otherId, otherName } of rels) {
      rows.push({
        kind: 'PARALLEL',
        parentElementId: col.id,
        parentElementIndex: col.index,
        parentName: col.name,
        relationId: r.relationId,
        otherElementId: otherId,
        otherName,
        displayKey: `parallel:${r.relationId}:under:${col.id}`,
      })
    }
  }
  return rows
}

// ═══════════════ مقایسه‌پذیری و بازهٔ واقعی — §۵.۵ (هم‌ارز منطق سرور) ═══════════════

/** شواهد عناصر یک چرخه — همان قرارداد loadCycleContext سرور */
function cycleEvidence(cycle: CycleRowDto) {
  const durationOf = new Map<string, number | null>()
  const intervalOf = new Map<string, { startOffset: number; endOffset: number } | null>()
  for (const o of cycle.observations) {
    durationOf.set(o.workElementId, o.derivedDuration ?? o.rawDuration ?? null)
    intervalOf.set(
      o.workElementId,
      o.startOffset != null && o.endOffset != null ? { startOffset: o.startOffset, endOffset: o.endOffset } : null
    )
  }
  return { durationOf, intervalOf }
}

/** مقایسه‌پذیری یک رابطه در یک چرخه — همان قواعد سرور (isObservedInCycle + hasComparableEvidence) */
export function relationComparability(
  cycle: CycleRowDto,
  rel: { elementLowId: string; elementHighId: string },
  nameOf: (id: string) => string,
): { isComparable: boolean; notComparableReason: string | null } {
  const { durationOf, intervalOf } = cycleEvidence(cycle)
  const reasons: string[] = []
  for (const eid of [rel.elementLowId, rel.elementHighId]) {
    if (!durationOf.has(eid)) {
      reasons.push(`«${nameOf(eid)}» در این چرخه مشاهده‌ای ندارد`)
    } else {
      const iv = intervalOf.get(eid)
      const hasEvidence = (iv != null && iv.startOffset != null && iv.endOffset != null) || durationOf.get(eid) != null
      if (!hasEvidence) reasons.push(`«${nameOf(eid)}» در این چرخه مدت یا بازهٔ قابل‌مقایسه ندارد`)
    }
  }
  return reasons.length === 0
    ? { isComparable: true, notComparableReason: null }
    : { isComparable: false, notComparableReason: `در این چرخه قابل‌مقایسه نیست: ${reasons.join('؛ ')}` }
}

/** هم‌پوشانی محاسبه‌شده از بازهٔ واقعی — §۵.۵: O(A,B) = max(0, min(E_A,E_B) − max(S_A,S_B))
 *  فقط وقتی هر دو عنصر بازهٔ کامل دارند؛ در غیر این صورت null */
export function computedOverlapFor(
  cycle: CycleRowDto,
  rel: { elementLowId: string; elementHighId: string },
): number | null {
  const { intervalOf } = cycleEvidence(cycle)
  const a = intervalOf.get(rel.elementLowId)
  const b = intervalOf.get(rel.elementHighId)
  if (!a || !b) return null
  return Math.max(0, Math.min(a.endOffset, b.endOffset) - Math.max(a.startOffset, b.startOffset))
}

// ═══════════════ سلول هم‌پوشانی — §۵.۴ (خالی=UNREVIEWED / ۰=NO_OVERLAP / مثبت=OVERLAP) ═══════════════

export type OverlapCellState =
  | { status: 'UNREVIEWED'; overlapDuration: number | null }
  | { status: 'NO_OVERLAP'; overlapDuration: number | null }
  | { status: 'OVERLAP'; overlapDuration: number | null }

/** مقدار فعلی سلول هم‌پوشانی — نبود رکورد = UNREVIEWED (هرگز صفر فرض نمی‌شود) */
export function overlapCellOf(cycle: CycleRowDto, relationId: string): OverlapCellState & { version: number } {
  const v = cycle.overlaps?.[relationId]
  if (!v) return { status: 'UNREVIEWED', overlapDuration: null, version: 0 }
  return { status: v.status as OverlapCellState['status'], overlapDuration: v.overlapDuration, version: v.version }
}

/** پارس ورودی سلول هم‌پوشانی — خالی/صفر/مثبت (§۵.۴) */
export function parseOverlapInput(text: string): { kind: 'EMPTY' } | { kind: 'NUMBER'; value: number } | { kind: 'INVALID'; reason: string } {
  const t = text.trim()
  if (t === '' || t === '-' || t === '—' || t === '–') return { kind: 'EMPTY' }
  const n = parseNumber(t)
  if (!Number.isFinite(n)) return { kind: 'INVALID', reason: 'مقدار عددی معتبر نیست (ارقام فارسی یا لاتین)' }
  return { kind: 'NUMBER', value: n }
}

/** نمایش متنی سلول هم‌پوشانی برای Copy — خالی/۰/مقدار */
export function overlapCellText(cell: OverlapCellState): string {
  if (cell.status === 'UNREVIEWED') return ''
  if (cell.status === 'NO_OVERLAP') return '0'
  return String(cell.overlapDuration ?? '')
}

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
