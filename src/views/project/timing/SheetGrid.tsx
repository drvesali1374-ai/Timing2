'use client'

// ═══════════════════════════════════════════════════════════
// برگهٔ زمان‌سنجی دسکتاپ — جدول اکسل‌مانند — FR-07 / v1.5.0 §۵
// محور جدید: ردیف = عنصر کاری + زیرردیف‌های روابط موازی؛
// ستون = چرخه. ستون نام عنصر/رابطه چسبان راست، سربرگ چرخه‌ها
// چسبان بالا، پانوشت «سپری‌شده» چسبان پایین.
// زیرردیف A-B زیر A و زیر B از «یک» رکورد ObservationOverlap
// خوانده می‌شود (§۵.۳)؛ ویرایش هر طرف طرف مقابل را به‌روز می‌کند.
// کلیدهای جهت‌دار (بالا/پایین=عنصر، چپ/راست=چرخه RTL)،
// Tab/Enter، ویرایش مستقیم، کپی محدوده، Paste با پیش‌نمایش،
// Undo/Redo و افزودن رابطه از خود جدول (§۶).
// ═══════════════════════════════════════════════════════════
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  Check,
  CornerDownRight,
  Eraser,
  StickyNote,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import type { CycleRowDto, ObservationCellDto, SessionSheetDto } from '@/lib/api/endpoints'
import type { DisplayPrefs as Prefs } from '@/lib/format'
import { formatTimeValue, formatInt } from '@/lib/format'
import {
  buildRows,
  cellDisplayValue,
  cellEditValue,
  computedOverlapFor,
  findObservation,
  overlapCellOf,
  overlapCellText,
  parseCellInput,
  parseOverlapInput,
  payloadFromParsed,
  relationComparability,
  type CellPayload,
  type ElementColumn,
  type GridRow,
  type OverlapCellState,
} from './shared'
import { CycleTimeline } from './CycleTimeline'
import { AddRelationControl, ArchiveRelationControl } from '../matrix/RelationControls'
import type { SheetHistory } from './useSheetHistory'
import { SuspectDiagnosticDialog, type SuspectDiagTarget } from './SuspectDiagnosticDialog'
import { DeleteCycleConfirm } from './DeleteCycleConfirm'
import { CycleDetailDialog } from './CycleDetailDialog'

export interface GridSelection {
  rowIdx: number
  colIdx: number
}

/** لنگر Paste — بر اساس شناسهٔ ردیف و شمارهٔ چرخه (§۸.۳) */
export interface GridPasteAnchor {
  cycleNo: number
  elementId: string
  relationId: string | null
}

interface SheetGridProps {
  sheet: SessionSheetDto
  columns: ElementColumn[]
  prefs: Prefs
  editable: boolean
  /** v1.5.1 §۳ — کاتالوگ کامل عناصر پروژه (برای نامزدهای «+ موازی» از همهٔ فعالیت‌ها) */
  projectCatalog: Array<{ elementId: string; name: string; activityId: string; activityName: string; stationId: string; stationName: string }>
  onToggleEntryMode: (elementId: string) => void
  commitCell: (cycle: CycleRowDto, column: ElementColumn, payload: CellPayload) => void
  /** §۵.۳/§۵.۵ — ثبت مقدار هم‌پوشانی از مسیر مرکزی setCycleOverlaps */
  commitOverlap: (relationId: string, cycle: CycleRowDto, state: OverlapCellState) => void
  onCellError: (key: string, message: string) => void
  onDeleteCycle: (cycle: CycleRowDto) => void
  onSetValidity: (cycle: CycleRowDto, obs: ObservationCellDto) => void
  onUpdateNotes: (cycle: CycleRowDto, notes: string) => void
  onOpenPaste: (anchor: GridPasteAnchor, text?: string) => void
  history: SheetHistory
  cellErrors: Record<string, string>
}

export function SheetGrid({
  sheet,
  columns,
  prefs,
  editable,
  projectCatalog,
  onToggleEntryMode,
  commitCell,
  commitOverlap,
  onCellError,
  onDeleteCycle,
  onSetValidity,
  onUpdateNotes,
  onOpenPaste,
  history,
  cellErrors,
}: SheetGridProps) {
  const [active, setActive] = useState<GridSelection>({ rowIdx: 0, colIdx: 0 })
  const [rangeEnd, setRangeEnd] = useState<GridSelection | null>(null)
  const [editing, setEditing] = useState<
    | { kind: 'ELEMENT'; rowIdx: number; colIdx: number; seq: string; start: string; end: string }
    | { kind: 'OVERLAP'; rowIdx: number; colIdx: number; value: string }
    | null
  >(null)
  // چرخهٔ باز‌شده در دیالوگ جزئیات — §۸.۱
  const [detailTarget, setDetailTarget] = useState<CycleRowDto | null>(null)
  // هدف دیالوگ تشخیص مشاهدهٔ مشکوک — §۱۲.۳
  const [diagTarget, setDiagTarget] = useState<SuspectDiagTarget | null>(null)
  // چرخهٔ در انتظار تأیید حذف — §۱۲.۴
  const [deleteTarget, setDeleteTarget] = useState<CycleRowDto | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const cellRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const seqInputRef = useRef<HTMLInputElement>(null)
  const startInputRef = useRef<HTMLInputElement>(null)
  const endInputRef = useRef<HTMLInputElement>(null)
  const overlapInputRef = useRef<HTMLInputElement>(null)
  // فاصلهٔ کوتاه برای تفکیک کلیک از دابل‌کلیک روی سلول مشکوک — §۱۲.۳
  const diagTimerRef = useRef<number | null>(null)

  const cycles = sheet.cycles
  const method = sheet.session.timingMethod
  // §۵.۲ — مدل ردیف‌های شبکه: عنصر + زیرردیف روابط
  const rows: GridRow[] = useMemo(() => buildRows(sheet, columns), [sheet, columns])
  const relationById = useMemo(
    () => new Map(sheet.parallelRelations.map((r) => [r.relationId, r])),
    [sheet.parallelRelations]
  )
  // نامزدهای «+ موازی»: تمام عناصر «همان پروژه» (هر Activity/Station) بدون خود و
  // بدون رابطهٔ فعال تکراری — v1.5.1 §۳ از کاتالوگ کامل پروژه، نه فقط ستون‌های برگه.
  // منبع داده به‌صورت batch از DTO ماتریس دریافت و از طریق SheetPanel پاس می‌شود؛
  // برای هر ردیف Query تکراری زده نمی‌شود و رابطه‌های فعال موجود حذف می‌شوند.
  const relationCandidates = useMemo(() => {
    return (elementId: string) =>
      projectCatalog
        .filter(
          (c) =>
            c.elementId !== elementId &&
            !sheet.parallelRelations.some(
              (r) =>
                (r.elementLowId === elementId && r.elementHighId === c.elementId) ||
                (r.elementHighId === elementId && r.elementLowId === c.elementId)
            )
        )
        .map((c) => ({
          elementId: c.elementId,
          name: c.name,
          activityId: c.activityId,
          activityName: c.activityName,
          stationId: c.stationId,
          stationName: c.stationName,
        }))
  }, [projectCatalog, sheet.parallelRelations])

  // ── دیالوگ تشخیص: بازکردن فوری/زمان‌بندی‌شده و لغو ──
  const cancelDiag = useCallback(() => {
    if (diagTimerRef.current !== null) {
      window.clearTimeout(diagTimerRef.current)
      diagTimerRef.current = null
    }
  }, [])

  const openDiag = useCallback(
    (cycle: CycleRowDto, obs: ObservationCellDto, elementName: string) => {
      cancelDiag()
      setDiagTarget({ cycle, obs, elementName })
    },
    [cancelDiag]
  )

  const scheduleDiag = useCallback(
    (cycle: CycleRowDto, obs: ObservationCellDto, elementName: string) => {
      cancelDiag()
      diagTimerRef.current = window.setTimeout(() => {
        diagTimerRef.current = null
        setDiagTarget({ cycle, obs, elementName })
      }, 220)
    },
    [cancelDiag]
  )

  // لغو تایمر معلق هنگام خروج از جدول
  useEffect(() => cancelDiag, [cancelDiag])

  useEffect(() => {
    if (editing) {
      if (editing.kind === 'OVERLAP') overlapInputRef.current?.focus()
      else {
        const row = rows[editing.rowIdx]
        const column = row?.kind === 'ELEMENT' ? columns[row.elementIndex] : undefined
        if (column?.entryMode === 'INT') startInputRef.current?.focus()
        else seqInputRef.current?.focus()
      }
    }
  }, [editing, rows, columns])

  // ── ناوبری — §۸.۴: بالا/پایین=عناصر، چپ/راست=چرخه‌ها (RTL) ──
  const focusCell = useCallback(
    (rowIdx: number, colIdx: number) => {
      cancelDiag()
      const r = Math.max(0, Math.min(rowIdx, rows.length - 1))
      const c = Math.max(0, Math.min(colIdx, cycles.length - 1))
      setActive({ rowIdx: r, colIdx: c })
      setRangeEnd(null)
      const el = cellRefs.current.get(`${r}:${c}`)
      el?.focus()
      el?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    },
    [rows.length, cycles.length, cancelDiag]
  )

  const startEdit = useCallback(
    (rowIdx: number, colIdx: number, initial?: string) => {
      if (!editable) return
      cancelDiag()
      const row = rows[rowIdx]
      const cycle = cycles[colIdx]
      if (!row || !cycle) return
      if (row.kind === 'PARALLEL') {
        // زیرردیف هم‌پوشانی — خالی/صفر/مثبت (§۵.۴)
        const rel = relationById.get(row.relationId)
        if (!rel) return
        const cmp = relationComparability(cycle, rel, (id) =>
          id === row.parentElementId ? row.parentName : row.otherName
        )
        if (!cmp.isComparable) {
          toast.error(cmp.notComparableReason ?? 'این زوج در این چرخه قابل‌مقایسه نیست')
          return
        }
        const cell = overlapCellOf(cycle, row.relationId)
        setEditing({
          kind: 'OVERLAP',
          rowIdx,
          colIdx,
          value: initial ?? (cell.status === 'UNREVIEWED' ? '' : String(cell.overlapDuration ?? '')),
        })
        return
      }
      const column = columns[row.elementIndex]
      if (!column) return
      const obs = findObservation(cycle, column.id)
      const v = cellEditValue(obs, method)
      setEditing({
        kind: 'ELEMENT',
        rowIdx,
        colIdx,
        seq: initial ?? v.seq,
        start: initial ? '' : v.start,
        end: initial ? '' : v.end,
      })
    },
    [editable, rows, cycles, columns, method, relationById, cancelDiag]
  )

  const finishEdit = useCallback(
    (move: 'down' | 'next' | 'none' = 'down') => {
      if (!editing) return
      const current = editing
      const cycle = cycles[current.colIdx]
      if (current.kind === 'OVERLAP') {
        const row = rows[current.rowIdx]
        const rel = row && row.kind === 'PARALLEL' ? relationById.get(row.relationId) : undefined
        if (row && row.kind === 'PARALLEL' && rel && cycle) {
          const parsed = parseOverlapInput(current.value)
          if (parsed.kind === 'INVALID') {
            onCellError(`${row.relationId}:${cycle.id}`, parsed.reason)
            toast.error(parsed.reason)
          } else if (parsed.kind === 'EMPTY') {
            commitOverlap(row.relationId, cycle, { status: 'UNREVIEWED', overlapDuration: null })
          } else if (parsed.value < 0) {
            const msg = 'مقدار هم‌پوشانی منفی مجاز نیست'
            onCellError(`${row.relationId}:${cycle.id}`, msg)
            toast.error(msg)
          } else if (parsed.value === 0) {
            // صفر = تأیید «بدون هم‌پوشانی» — §۵.۴؛ اما با بازهٔ واقعی نمی‌خواند؟
            const computed = computedOverlapFor(cycle, rel)
            if (computed !== null && computed > 1e-9) {
              const msg = `بازهٔ واقعی این چرخه هم‌پوشانی ${formatTimeValue(computed, prefs)} دارد؛ ثبت «بدون هم‌پوشانی» با بازهٔ واقعی نمی‌خواند`
              onCellError(`${row.relationId}:${cycle.id}`, msg)
              toast.error(msg)
            } else {
              commitOverlap(row.relationId, cycle, { status: 'NO_OVERLAP', overlapDuration: 0 })
            }
          } else {
            const computed = computedOverlapFor(cycle, rel)
            if (computed !== null && Math.abs(parsed.value - computed) > 1e-6) {
              const msg = `مقدار واردشده (${parsed.value}) با هم‌پوشانی بازهٔ واقعی (${formatTimeValue(computed, prefs)}) نمی‌خواند`
              onCellError(`${row.relationId}:${cycle.id}`, msg)
              toast.error(msg)
            } else {
              commitOverlap(row.relationId, cycle, { status: 'OVERLAP', overlapDuration: parsed.value })
            }
          }
        }
      } else {
        const row = rows[current.rowIdx]
        const cycleEl = cycles[current.colIdx]
        const column = row && row.kind === 'ELEMENT' ? columns[row.elementIndex] : undefined
        if (row && row.kind === 'ELEMENT' && cycleEl && column) {
          let parsed
          if (column.entryMode === 'INT') {
            const s = current.start.trim()
            const e = current.end.trim()
            parsed = s === '' && e === '' ? ({ kind: 'EMPTY' } as const) : parseCellInput(s === '' || e === '' ? (s || e) : `${s}-${e}`)
          } else {
            parsed = parseCellInput(current.seq)
          }
          const result = payloadFromParsed(parsed, column, method)
          if ('error' in result) {
            onCellError(`${column.id}:${cycleEl.id}`, result.error)
            toast.error(result.error)
          } else {
            commitCell(cycleEl, column, result)
          }
        }
      }
      setEditing(null)
      // جابه‌جایی پس از ثبت — Enter=ردیف بعدی (عنصر)، Tab=چرخهٔ بعدی
      if (move === 'down') focusCell(current.rowIdx + 1, current.colIdx)
      else if (move === 'next') focusCell(current.rowIdx, current.colIdx + 1)
      else focusCell(current.rowIdx, current.colIdx)
    },
    [editing, cycles, rows, columns, method, relationById, commitCell, commitOverlap, focusCell, onCellError, prefs]
  )

  const clearActiveCell = useCallback(() => {
    const row = rows[active.rowIdx]
    const cycle = cycles[active.colIdx]
    if (!row || !cycle || !editable) return
    if (row.kind === 'PARALLEL') {
      // خالی کردن = بررسی‌نشده (§۵.۴) — پاک‌کردن همیشه مجاز است
      commitOverlap(row.relationId, cycle, { status: 'UNREVIEWED', overlapDuration: null })
      return
    }
    const column = columns[row.elementIndex]
    if (!column) return
    const parsed = parseCellInput('')
    const result = payloadFromParsed(parsed, column, method)
    if (!('error' in result)) commitCell(cycle, column, result)
  }, [active, rows, cycles, columns, editable, method, commitCell, commitOverlap])

  // ── کپی محدوده — FR-07 / §۸.۳ (TSV مطابق ظاهر جدید) ──
  const cellTextFor = useCallback(
    (row: GridRow, cycle: CycleRowDto): string => {
      if (row.kind === 'PARALLEL') {
        return overlapCellText(overlapCellOf(cycle, row.relationId))
      }
      const column = columns[row.elementIndex]
      const obs = column ? findObservation(cycle, column.id) : undefined
      return obs?.startOffset != null && obs?.endOffset != null
        ? `${obs.startOffset}-${obs.endOffset}`
        : String(method === 'CONTINUOUS' ? (obs?.cumulativeReading ?? '') : (obs?.rawDuration ?? ''))
    },
    [columns, method]
  )

  const copySelection = useCallback(async () => {
    if (!rows.length || !cycles.length) return
    if (!rangeEnd) {
      // تک‌سلول فعال
      const row = rows[active.rowIdx]
      const cycle = cycles[active.colIdx]
      if (row && cycle) {
        const t = cellTextFor(row, cycle)
        try {
          await navigator.clipboard.writeText(t)
          toast.success('سلول کپی شد')
        } catch {
          toast.error('کپی توسط مرورگر مسدود شد')
        }
      }
      return
    }
    const r1 = Math.min(active.rowIdx, rangeEnd.rowIdx)
    const r2 = Math.max(active.rowIdx, rangeEnd.rowIdx)
    const c1 = Math.min(active.colIdx, rangeEnd.colIdx)
    const c2 = Math.max(active.colIdx, rangeEnd.colIdx)
    const lines: string[] = []
    for (let r = r1; r <= r2; r++) {
      const row = rows[r]
      if (!row) continue
      const parts: string[] = []
      for (let c = c1; c <= c2; c++) {
        const cycle = cycles[c]
        if (!cycle) continue
        parts.push(cellTextFor(row, cycle))
      }
      lines.push(parts.join('\t'))
    }
    try {
      await navigator.clipboard.writeText(lines.join('\n'))
      toast.success(`محدودهٔ ${r2 - r1 + 1}×${c2 - c1 + 1} کپی شد`)
    } catch {
      toast.error('کپی توسط مرورگر مسدود شد')
    }
  }, [rangeEnd, active, rows, cycles, cellTextFor])

  // ── کیبورد سراسری برگه — §۸.۴ ──
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (editing) return // ورودی در حال ویرایش، کلیدها را خودش مدیریت می‌کند
      const ctrl = e.ctrlKey || e.metaKey
      if (ctrl && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) void history.redo()
        else void history.undo()
        return
      }
      if (ctrl && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        void history.redo()
        return
      }
      if (ctrl && e.key.toLowerCase() === 'c') {
        e.preventDefault()
        void copySelection()
        return
      }
      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault()
          if (e.shiftKey) setRangeEnd({ rowIdx: Math.max(active.rowIdx - 1, 0), colIdx: active.colIdx })
          else focusCell(active.rowIdx - 1, active.colIdx)
          break
        case 'ArrowDown':
          e.preventDefault()
          if (e.shiftKey) setRangeEnd({ rowIdx: Math.min(active.rowIdx + 1, rows.length - 1), colIdx: active.colIdx })
          else focusCell(active.rowIdx + 1, active.colIdx)
          break
        // RTL: چرخهٔ بعدی بصورت چپ است — §۸.۴
        case 'ArrowLeft':
          e.preventDefault()
          if (e.shiftKey) setRangeEnd({ rowIdx: active.rowIdx, colIdx: Math.min(active.colIdx + 1, cycles.length - 1) })
          else focusCell(active.rowIdx, active.colIdx + 1)
          break
        case 'ArrowRight':
          e.preventDefault()
          if (e.shiftKey) setRangeEnd({ rowIdx: active.rowIdx, colIdx: Math.max(active.colIdx - 1, 0) })
          else focusCell(active.rowIdx, active.colIdx - 1)
          break
        case 'Tab':
          e.preventDefault()
          focusCell(active.rowIdx, e.shiftKey ? active.colIdx - 1 : active.colIdx + 1)
          break
        case 'Enter':
        case 'F2':
          e.preventDefault()
          startEdit(active.rowIdx, active.colIdx)
          break
        case 'Delete':
        case 'Backspace':
          e.preventDefault()
          clearActiveCell()
          break
        default:
          if (!ctrl && e.key.length === 1 && /[0-9.\-٫،۰-۹٠-٩]/.test(e.key)) {
            e.preventDefault()
            startEdit(active.rowIdx, active.colIdx, e.key)
          }
      }
    },
    [editing, history, copySelection, focusCell, active, rows.length, cycles.length, startEdit, clearActiveCell]
  )

  const onPasteEvent = useCallback(
    (e: React.ClipboardEvent<HTMLDivElement>) => {
      if (!editable || editing) return
      const text = e.clipboardData.getData('text')
      if (!text) return
      e.preventDefault()
      // §۸.۳ — لنگر بر اساس شناسهٔ ردیف و شمارهٔ چرخه
      const row = rows[active.rowIdx]
      const cycle = cycles[active.colIdx]
      if (!row || !cycle) return
      onOpenPaste(
        {
          cycleNo: cycle.cycleNo,
          elementId: row.kind === 'ELEMENT' ? row.elementId : row.parentElementId,
          relationId: row.kind === 'PARALLEL' ? row.relationId : null,
        },
        text
      )
    },
    [editable, editing, rows, cycles, active, onOpenPaste]
  )

  const inRange = (r: number, c: number) => {
    if (!rangeEnd) return false
    return (
      r >= Math.min(active.rowIdx, rangeEnd.rowIdx) &&
      r <= Math.max(active.rowIdx, rangeEnd.rowIdx) &&
      c >= Math.min(active.colIdx, rangeEnd.colIdx) &&
      c <= Math.max(active.colIdx, rangeEnd.colIdx)
    )
  }

  const nameOf = useCallback(
    // v1.5.1 §۷ — نام عناصر خارج از Activity جاری نیز از روابط برگه حل می‌شود
    (id: string) =>
      sheet.elements.find((e) => e.id === id)?.name ??
      sheet.parallelRelations.reduce<string>((acc, r) => {
        if (acc !== '؟') return acc
        if (r.elementLowId === id) return r.elementLowName
        if (r.elementHighId === id) return r.elementHighName
        return acc
      }, '؟'),
    [sheet.elements, sheet.parallelRelations]
  )

  return (
    <div
      ref={gridRef}
      role="grid"
      aria-label="برگه زمان‌سنجی — عناصر در ردیف‌ها و چرخه‌ها در ستون‌ها"
      tabIndex={-1}
      onKeyDown={onKeyDown}
      onPaste={onPasteEvent}
      className="card-premium timing-grid max-h-[68vh] overflow-auto"
      dir="rtl"
    >
      <table className="w-full border-collapse text-sm">
        {/* سربرگ چرخه‌ها — چسبان بالا (§۹.۲) */}
        <thead className="sticky top-0 z-20">
          <tr className="bg-surface-2/95 backdrop-blur">
            <th className="sticky right-0 z-30 min-w-44 border-b border-l bg-surface-2/95 px-2 py-2 text-center text-xs font-bold backdrop-blur">
              عنصر کاری / رابطه
            </th>
            {cycles.length === 0 && (
              <th className="border-b px-2 py-2 text-center text-xs font-bold text-muted-foreground">
                هنوز چرخه‌ای ثبت نشده است
              </th>
            )}
            {cycles.map((cycle, colIdx) => (
              <th key={cycle.id} className="min-w-24 border-b border-l px-1.5 py-1.5 text-center align-top last:border-l-0">
                <button
                  type="button"
                  onClick={() => setDetailTarget(cycle)}
                  aria-label={`جزئیات چرخهٔ ${cycle.cycleNo}`}
                  title="جزئیات چرخه: خط زمانی، وضعیت مشاهدات، یادداشت و حذف"
                  className="group flex w-full flex-col items-center gap-0.5 rounded-lg px-1 py-0.5 transition-colors hover:bg-brand-soft/60"
                >
                  <span className="num text-sm font-extrabold">{formatInt(cycle.cycleNo, prefs)}</span>
                  <span className="flex items-center gap-0.5" title={cycle.isComplete ? 'چرخهٔ کامل' : 'چرخهٔ ناقص'}>
                    {cycle.isComplete ? (
                      <Check className="size-3.5 text-green" aria-hidden />
                    ) : (
                      <AlertTriangle className="size-3.5 text-amber" aria-hidden />
                    )}
                    {cycle.notes && <StickyNote className="size-3 text-faint" aria-hidden />}
                  </span>
                </button>
                {colIdx === active.colIdx && !rangeEnd && <span className="sr-only">ستون فعال</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={Math.max(cycles.length + 1, 2)} className="px-4 py-10 text-center text-sm text-muted-foreground">
                این فعالیت عنصر کاری ندارد؛ ابتدا عناصر را در ساختار تولید تعریف کنید.
              </td>
            </tr>
          )}
          {cycles.length === 0 && rows.length > 0 && (
            <tr>
              <td colSpan={rows.length > 0 ? 2 : 1} className="px-4 py-8 text-center text-sm text-muted-foreground">
                هنوز چرخه‌ای ثبت نشده است. با دکمهٔ «افزودن چرخه» شروع کنید یا داده را از Excel بچسبانید.
              </td>
            </tr>
          )}
          {rows.map((row, rowIdx) => {
            if (row.kind === 'ELEMENT') {
              // ── ردیف اصلی عنصر — §۹.۱ گروه بصری ──
              const column = columns[row.elementIndex]
              if (!column) return null
              const stats = sheet.stats.perElement[column.id]
              return (
                <tr key={`el:${row.elementId}`} className="group border-t-2 border-border/70 first:border-t-0">
                  {/* سربرگ ردیف عنصر — چسبان راست (§۹.۲) */}
                  <th
                    scope="row"
                    className="sticky right-0 z-10 border-b border-l bg-card/95 px-2 py-1.5 text-right align-top backdrop-blur group-hover:bg-surface-2/60"
                  >
                    <div className="flex items-start justify-between gap-1">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-extrabold" title={row.name}>
                          {row.name}
                        </p>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1">
                          {editable && (
                            <button
                              type="button"
                              onClick={() => onToggleEntryMode(column.id)}
                              className={`rounded-full border px-1.5 py-px text-[10px] font-bold transition-colors ${
                                column.entryMode === 'INT'
                                  ? 'border-brand/40 bg-brand-soft text-brand'
                                  : 'border-border bg-muted text-muted-foreground hover:border-brand/40 hover:bg-brand-soft hover:text-brand'
                              }`}
                              title={
                                column.entryMode === 'SEQ'
                                  ? 'ورودی ترتیبی — برای ورودی بازه‌ای (از/تا) کلیک کنید'
                                  : 'ورودی بازه‌ای (از/تا) — برای ترتیبی کلیک کنید'
                              }
                              aria-label={`حالت ورود عنصر ${row.name}: ${column.entryMode === 'SEQ' ? 'ترتیبی' : 'بازه‌ای'}`}
                            >
                              {column.entryMode === 'SEQ' ? (method === 'CONTINUOUS' ? 'قرائت' : 'مدت') : 'از/تا'}
                            </button>
                          )}
                          {stats && stats.calcCount > 0 && (
                            <span className="num text-[10px] text-faint" title="مشاهدات وارد محاسبه">
                              {formatInt(stats.calcCount, prefs)}/{formatInt(stats.totalCount, prefs)}
                            </span>
                          )}
                        </div>
                      </div>
                      {/* §۶ — میانبر افزودن رابطهٔ موازی از خود جدول */}
                      {editable && (
                        <AddRelationControl
                          projectId={sheet.activity.projectId}
                          elementId={row.elementId}
                          elementName={row.name}
                          currentActivityId={sheet.activity.id}
                          candidates={relationCandidates(row.elementId)}
                          trigger={
                            <button
                              type="button"
                              aria-label={`افزودن عنصر موازی برای ${row.name}`}
                              title="افزودن رابطهٔ موازی — عناصر همهٔ فعالیت‌های پروژه"
                              className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-brand-soft hover:text-brand"
                            >
                              <CornerDownRight className="size-3.5 rotate-90" aria-hidden />
                            </button>
                          }
                        />
                      )}
                    </div>
                  </th>
                  {cycles.map((cycle, colIdx) => {
                    const obs = findObservation(cycle, column.id)
                    const isActive = active.rowIdx === rowIdx && active.colIdx === colIdx
                    const isEditing =
                      editing?.kind === 'ELEMENT' && editing.rowIdx === rowIdx && editing.colIdx === colIdx
                    const err = cellErrors[`${column.id}:${cycle.id}`]
                    const excluded = obs?.validityStatus === 'EXCLUDED'
                    const suspect = obs?.validityStatus === 'SUSPECT'
                    const invalid = obs?.validityStatus === 'INVALID'
                    const partialInterval = obs && (obs.startOffset !== null) !== (obs.endOffset !== null)
                    return (
                      <td key={cycle.id} className="relative border-b border-l p-0 last:border-l-0">
                        <div
                          ref={(el) => {
                            if (el) cellRefs.current.set(`${rowIdx}:${colIdx}`, el)
                            else cellRefs.current.delete(`${rowIdx}:${colIdx}`)
                          }}
                          role="gridcell"
                          aria-label={`${row.name}، چرخهٔ ${cycle.cycleNo}${obs?.derivedDuration != null ? `، مدت ${obs.derivedDuration}` : ''}${suspect ? '، مشاهدهٔ مشکوک' : ''}${excluded ? '، خارج‌شده از محاسبات' : ''}`}
                          tabIndex={isActive ? 0 : -1}
                          onClick={(e) => {
                            if (e.shiftKey) setRangeEnd({ rowIdx, colIdx })
                            else focusCell(rowIdx, colIdx)
                            // کلیک روی سلول مشکوک → دیالوگ تشخیص — §۱۲.۳
                            if (suspect && obs && !e.shiftKey && !excluded) scheduleDiag(cycle, obs, row.name)
                          }}
                          onDoubleClick={() => {
                            cancelDiag()
                            startEdit(rowIdx, colIdx)
                          }}
                          className={`num relative min-h-10 px-2 py-1.5 text-center outline-none transition-colors focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-brand ${
                            isActive ? 'bg-brand-soft/70 ring-2 ring-brand' : inRange(rowIdx, colIdx) ? 'bg-brand-soft/30' : 'hover:bg-muted/40'
                          } ${excluded ? 'text-faint line-through' : ''} ${suspect ? 'bg-amber-soft/50' : ''} ${invalid || err ? 'bg-red-soft/60' : ''} ${partialInterval ? 'ring-1 ring-inset ring-amber/60' : ''}`}
                        >
                          {isEditing && editing.kind === 'ELEMENT' ? (
                            column.entryMode === 'INT' ? (
                              // گروه بصری «از/تا» برای ورودی بازه‌ای — §۱۲.۲
                              <span
                                dir="ltr"
                                className="inline-flex items-end justify-center gap-0.5 rounded-md border bg-background px-1 py-0.5 focus-within:border-brand focus-within:ring-1 focus-within:ring-brand"
                              >
                                <label className="flex min-w-0 flex-col items-center">
                                  <span className="text-[9px] font-bold leading-none text-muted-foreground" aria-hidden>
                                    از
                                  </span>
                                  <input
                                    ref={startInputRef}
                                    value={editing.start}
                                    onChange={(e) => setEditing({ ...editing, start: e.target.value })}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Escape') setEditing(null)
                                      if (e.key === 'Tab') {
                                        e.preventDefault()
                                        endInputRef.current?.focus()
                                      }
                                      if (e.key === 'Enter') {
                                        e.preventDefault()
                                        finishEdit('down')
                                      }
                                    }}
                                    aria-label={`شروع بازهٔ ${row.name}`}
                                    className="num w-12 rounded-sm border-0 bg-transparent px-0.5 py-0.5 text-center text-xs focus-visible:bg-brand-soft/40 focus-visible:outline-none"
                                    inputMode="decimal"
                                    dir="ltr"
                                  />
                                </label>
                                <span className="self-end pb-1.5 text-faint" aria-hidden>
                                  –
                                </span>
                                <label className="flex min-w-0 flex-col items-center">
                                  <span className="text-[9px] font-bold leading-none text-muted-foreground" aria-hidden>
                                    تا
                                  </span>
                                  <input
                                    ref={endInputRef}
                                    value={editing.end}
                                    onChange={(e) => setEditing({ ...editing, end: e.target.value })}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Escape') setEditing(null)
                                      if (e.key === 'Tab') {
                                        e.preventDefault()
                                        finishEdit('next')
                                      }
                                      if (e.key === 'Enter') {
                                        e.preventDefault()
                                        finishEdit('down')
                                      }
                                    }}
                                    aria-label={`پایان بازهٔ ${row.name}`}
                                    className="num w-12 rounded-sm border-0 bg-transparent px-0.5 py-0.5 text-center text-xs focus-visible:bg-brand-soft/40 focus-visible:outline-none"
                                    inputMode="decimal"
                                    dir="ltr"
                                  />
                                </label>
                              </span>
                            ) : (
                              <input
                                ref={seqInputRef}
                                value={editing.seq}
                                onChange={(e) => setEditing({ ...editing, seq: e.target.value })}
                                onKeyDown={(e) => {
                                  if (e.key === 'Escape') setEditing(null)
                                  if (e.key === 'Tab') {
                                    e.preventDefault()
                                    finishEdit('next')
                                  }
                                  if (e.key === 'Enter') {
                                    e.preventDefault()
                                    finishEdit('down')
                                  }
                                }}
                                onBlur={() => finishEdit('none')}
                                aria-label={`مقدار ${row.name} چرخهٔ ${cycle.cycleNo}`}
                                className="num w-20 rounded-md border bg-background px-1 py-0.5 text-center text-xs focus-visible:outline-2 focus-visible:outline-ring"
                                inputMode="decimal"
                                dir="ltr"
                              />
                            )
                          ) : (
                            <>
                              <span className="block truncate text-xs font-medium">
                                {cellDisplayValue(obs, method, prefs)}
                              </span>
                              {/* مدت تفاضلی زیر قرائت — FR-09 */}
                              {method === 'CONTINUOUS' && obs?.cumulativeReading != null && obs?.derivedDuration != null && (
                                <span className="block text-[10px] leading-3 text-faint">
                                  ({formatTimeValue(obs.derivedDuration, prefs)})
                                </span>
                              )}
                              {obs?.startOffset != null && obs?.endOffset != null && obs.derivedDuration != null && (
                                <span className="block text-[10px] leading-3 text-faint">
                                  ({formatTimeValue(obs.derivedDuration, prefs)})
                                </span>
                              )}
                              {excluded && <Eraser className="absolute left-1 top-1 size-3 text-faint" aria-hidden />}
                              {suspect && obs && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    openDiag(cycle, obs, row.name)
                                  }}
                                  className="absolute left-1 top-1 flex size-4 items-center justify-center rounded-sm text-amber transition-colors hover:bg-amber-soft focus-visible:outline-2 focus-visible:outline-ring"
                                  aria-label="تشخیص مشاهدهٔ مشکوک"
                                  title="تشخیص مشاهدهٔ مشکوک"
                                >
                                  <AlertTriangle className="size-3" aria-hidden />
                                </button>
                              )}
                              {(invalid || err) && <XCircle className="absolute left-1 top-1 size-3 text-red" aria-hidden />}
                            </>
                          )}
                        </div>
                        {err && (
                          <p className="absolute inset-x-0 -bottom-0.5 z-20 truncate rounded-b-md bg-red px-1 text-right text-[9px] leading-4 text-white" title={err}>
                            {err}
                          </p>
                        )}
                      </td>
                    )
                  })}
                </tr>
              )
            }
            // ── زیرردیف رابطهٔ موازی — §۵.۳ نمایش دوطرفه از یک منبع داده ──
            const rel = relationById.get(row.relationId)
            if (!rel) return null
            return (
              <tr key={row.displayKey} className="group t2-subrow">
                {/* سربرگ زیرردیف — چسبان راست */}
                <th
                  scope="row"
                  className="sticky right-0 z-10 border-b border-l bg-surface-2/50 px-2 py-1 text-right backdrop-blur"
                >
                  <div className="flex items-center justify-between gap-1">
                    <div className="flex min-w-0 items-center gap-1">
                      {/* اتصال بصری ظریف به عنصر والد — §۹.۱ */}
                      <span className="h-4 w-2 shrink-0 rounded-e border-b-2 border-l-2 border-brand/30" aria-hidden />
                      <p
                        className="flex min-w-0 items-center gap-1 truncate text-[11px] font-bold text-muted-foreground"
                        title={`هم‌پوشانی با ${row.otherName}${row.crossActivity ? ` (فعالیت ${row.otherActivityName ?? '؟'} / ایستگاه ${row.otherStationName ?? '؟'})` : ''}`}
                      >
                        <span className="truncate">↳ هم‌پوشانی با {row.otherName}</span>
                        {row.crossActivity && (
                          <span
                            className="shrink-0 rounded-md border border-amber/70 bg-amber-soft/40 px-1 py-px text-[8px] font-bold"
                            title={`رابطهٔ بین‌فعالیت — «${row.otherActivityName ?? '؟'}» / «${row.otherStationName ?? '؟'}»؛ در برگهٔ آن فعالیت نیز زیر «${row.otherName}» دیده می‌شود`}
                          >
                            بین‌فعالیت
                          </span>
                        )}
                      </p>
                    </div>
                    {editable && (
                      <ArchiveRelationControl
                        projectId={sheet.activity.projectId}
                        relationId={row.relationId}
                        label={`${row.parentName} ↔ ${row.otherName}`}
                        trigger={
                          <button
                            type="button"
                            aria-label={`حذف رابطهٔ ${row.parentName} با ${row.otherName}`}
                            title="حذف رابطهٔ موازی (آرشیو — مقادیر تاریخی حفظ می‌شود)"
                            className="flex size-5 shrink-0 items-center justify-center rounded-md text-faint transition-colors hover:bg-red-soft hover:text-red"
                          >
                            <XCircle className="size-3" aria-hidden />
                          </button>
                        }
                      />
                    )}
                  </div>
                </th>
                {cycles.map((cycle, colIdx) => {
                  const cell = overlapCellOf(cycle, row.relationId)
                  const cmp = relationComparability(cycle, rel, nameOf)
                  const computed = computedOverlapFor(cycle, rel)
                  const isActive = active.rowIdx === rowIdx && active.colIdx === colIdx
                  const isEditing =
                    editing?.kind === 'OVERLAP' && editing.rowIdx === rowIdx && editing.colIdx === colIdx
                  const err = cellErrors[`${row.relationId}:${cycle.id}`]
                  const canEdit = editable && cmp.isComparable
                  return (
                    <td key={cycle.id} className="relative border-b border-l p-0 last:border-l-0">
                      <div
                        ref={(el) => {
                          if (el) cellRefs.current.set(`${rowIdx}:${colIdx}`, el)
                          else cellRefs.current.delete(`${rowIdx}:${colIdx}`)
                        }}
                        role="gridcell"
                        aria-label={`هم‌پوشانی ${row.parentName} با ${row.otherName}، چرخهٔ ${cycle.cycleNo}${
                          cell.status === 'UNREVIEWED' ? '، بررسی‌نشده' : cell.status === 'NO_OVERLAP' ? '، بدون هم‌پوشانی' : `، ${cell.overlapDuration} ثانیه`
                        }${!cmp.isComparable ? '، غیرقابل‌مقایسه در این چرخه' : ''}`}
                        tabIndex={isActive ? 0 : -1}
                        onClick={(e) => {
                          if (e.shiftKey) setRangeEnd({ rowIdx, colIdx })
                          else focusCell(rowIdx, colIdx)
                        }}
                        onDoubleClick={() => {
                          if (canEdit) startEdit(rowIdx, colIdx)
                        }}
                        title={!cmp.isComparable ? (cmp.notComparableReason ?? undefined) : undefined}
                        className={`num relative min-h-9 px-2 py-1 text-center outline-none transition-colors focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-brand ${
                          isActive ? 'bg-brand-soft/70 ring-2 ring-brand' : inRange(rowIdx, colIdx) ? 'bg-brand-soft/30' : 'hover:bg-muted/40'
                        } ${cell.status === 'NO_OVERLAP' ? 'bg-green-soft/30' : ''} ${cell.status === 'OVERLAP' ? 'bg-green-soft/40 font-bold' : ''} ${err ? 'bg-red-soft/60' : ''} ${!cmp.isComparable ? 'cursor-not-allowed opacity-60' : ''}`}
                      >
                        {isEditing && editing.kind === 'OVERLAP' ? (
                          <input
                            ref={overlapInputRef}
                            value={editing.value}
                            onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                            onKeyDown={(e) => {
                              if (e.key === 'Escape') setEditing(null)
                              if (e.key === 'Tab') {
                                e.preventDefault()
                                finishEdit('next')
                              }
                              if (e.key === 'Enter') {
                                e.preventDefault()
                                finishEdit('down')
                              }
                            }}
                            onBlur={() => finishEdit('none')}
                            aria-label={`مقدار هم‌پوشانی ${row.parentName} با ${row.otherName} در چرخهٔ ${cycle.cycleNo}`}
                            className="num w-16 rounded-md border bg-background px-1 py-0.5 text-center text-xs focus-visible:outline-2 focus-visible:outline-ring"
                            inputMode="decimal"
                            dir="ltr"
                            placeholder="خالی/۰/مقدار"
                          />
                        ) : (
                          <>
                            {cell.status === 'UNREVIEWED' ? (
                              // نشانهٔ بسیار ظریف بررسی‌نشده — §۵.۴ (خالی ≠ صفر)
                              <span className="mx-auto block w-fit rounded border border-dashed border-amber/50 px-1 text-[9px] leading-4 text-amber/70" title="بررسی‌نشده — خالی به معنی صفر نیست">
                                ؟
                              </span>
                            ) : cell.status === 'NO_OVERLAP' ? (
                              <span className="text-xs text-green" title="بدون هم‌پوشانی — تأییدشده">
                                ۰
                              </span>
                            ) : (
                              <span className="text-xs">
                                {formatTimeValue(cell.overlapDuration, prefs)}
                                <span className="ms-0.5 text-[9px] font-normal text-faint">s</span>
                              </span>
                            )}
                            {/* پیشنهاد مقدار محاسبه‌شده از بازهٔ واقعی — §۵.۵ */}
                            {computed !== null && cell.status !== 'OVERLAP' && canEdit && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  commitOverlap(row.relationId, cycle, { status: 'OVERLAP', overlapDuration: computed })
                                }}
                                className="absolute inset-x-0 -bottom-0.5 z-10 truncate text-[8px] leading-3 text-brand/80 hover:text-brand"
                                title={`هم‌پوشانی محاسبه‌شده از بازهٔ واقعی: ${formatTimeValue(computed, prefs)} — برای اعمال کلیک کنید`}
                              >
                                ≈ {formatTimeValue(computed, prefs)}
                              </button>
                            )}
                          </>
                        )}
                      </div>
                      {err && (
                        <p className="absolute inset-x-0 -bottom-0.5 z-20 truncate rounded-b-md bg-red px-1 text-right text-[9px] leading-4 text-white" title={err}>
                          {err}
                        </p>
                      )}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
        {/* پانوشت: زمان سپری‌شدهٔ هر چرخه — FR-10 / §۸.۱ */}
        {cycles.length > 0 && rows.length > 0 && (
          <tfoot className="sticky bottom-0 bg-surface-2/95 backdrop-blur">
            <tr>
              <th scope="row" className="sticky right-0 z-10 border-t bg-surface-2/95 px-2 py-1.5 text-right text-[10px] font-bold text-muted-foreground backdrop-blur">
                سپری‌شده
              </th>
              {cycles.map((cycle) => (
                <td key={cycle.id} className="border-t border-l px-2 py-1.5 text-center last:border-l-0">
                  {cycle.elapsed === null ? (
                    <span className="text-[10px] text-faint">نیازمند تکمیل</span>
                  ) : (
                    <span className="num inline-flex items-center gap-1 text-xs font-bold">
                      {formatTimeValue(cycle.elapsed, prefs)}
                      {cycle.elapsedExcludesSequential && (
                        <AlertTriangle className="size-3 text-amber" aria-hidden />
                      )}
                    </span>
                  )}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>

      {/* دیالوگ جزئیات چرخه — §۸.۱ (خط زمانی + وضعیت + یادداشت + حذف) */}
      <CycleDetailDialog
        cycle={detailTarget}
        sheet={sheet}
        columns={columns}
        prefs={prefs}
        editable={editable}
        onClose={() => setDetailTarget(null)}
        onDelete={(c) => {
          setDetailTarget(null)
          setDeleteTarget(c)
        }}
        onSetValidity={onSetValidity}
        onDiagnose={(obs) => {
          const cycle = detailTarget
          if (cycle) openDiag(cycle, obs, columns.find((c) => c.id === obs.workElementId)?.name ?? '')
        }}
        onUpdateNotes={onUpdateNotes}
      />

      {/* دیالوگ تشخیص مشاهدهٔ مشکوک — §۱۲.۳ */}
      <SuspectDiagnosticDialog
        target={diagTarget}
        prefs={prefs}
        onClose={() => setDiagTarget(null)}
        onExclude={(t) => {
          setDiagTarget(null)
          onSetValidity(t.cycle, t.obs)
        }}
      />

      {/* تأیید حذف چرخه — §۱۲.۴ (حذف یک‌کلیکی غیرممکن است) */}
      <DeleteCycleConfirm
        cycle={deleteTarget}
        sheet={sheet}
        prefs={prefs}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        onConfirm={() => {
          const c = deleteTarget
          setDeleteTarget(null)
          if (c) onDeleteCycle(c)
        }}
      />
    </div>
  )
}
