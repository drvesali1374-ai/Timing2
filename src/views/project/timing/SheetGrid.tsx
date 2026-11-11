'use client'

// ═══════════════════════════════════════════════════════════
// برگهٔ زمان‌سنجی دسکتاپ — جدول اکسل‌مانند — FR-07 / ۷.۴
// هر ردیف یک چرخه، هر ستون یک عنصر کاری.
// حرکت با کلیدهای جهت‌دار (RTL)، Tab/Enter، ویرایش مستقیم،
// کپی محدوده، Paste با پیش‌نمایش، Undo/Redo، ستون چرخه و
// سربرگ ثابت، وضعیت مشاهده با رنگ/آیکون/متن قابل دسترسی.
// ═══════════════════════════════════════════════════════════
import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronLeft,
  Eraser,
  StickyNote,
  Trash2,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import type { CycleRowDto, ObservationCellDto, SessionSheetDto } from '@/lib/api/endpoints'
import type { DisplayPrefs as Prefs } from '@/lib/format'
import { formatTimeValue, formatInt } from '@/lib/format'
import {
  cellDisplayValue,
  cellEditValue,
  ELEMENT_TYPE_BADGE,
  findObservation,
  parseCellInput,
  payloadFromParsed,
  type CellPayload,
  type ElementColumn,
} from './shared'
import { CycleTimeline } from './CycleTimeline'
import ElementParallelPopover from '../matrix/ElementParallelPopover'
import type { SheetHistory } from './useSheetHistory'
import { SuspectDiagnosticDialog, type SuspectDiagTarget } from './SuspectDiagnosticDialog'
import { DeleteCycleConfirm } from './DeleteCycleConfirm'

export interface GridSelection {
  rowIdx: number
  colIdx: number
}

interface SheetGridProps {
  sheet: SessionSheetDto
  columns: ElementColumn[]
  prefs: Prefs
  editable: boolean
  onToggleEntryMode: (elementId: string) => void
  commitCell: (cycle: CycleRowDto, column: ElementColumn, payload: CellPayload) => void
  onCellError: (key: string, message: string) => void
  onDeleteCycle: (cycle: CycleRowDto) => void
  onSetValidity: (cycle: CycleRowDto, obs: ObservationCellDto) => void
  onUpdateNotes: (cycle: CycleRowDto, notes: string) => void
  onOpenPaste: (anchor: { cycleNo: number; colIndex: number }, text?: string) => void
  history: SheetHistory
  cellErrors: Record<string, string>
}

export function SheetGrid({
  sheet,
  columns,
  prefs,
  editable,
  onToggleEntryMode,
  commitCell,
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
  const [editing, setEditing] = useState<{ rowIdx: number; colIdx: number; seq: string; start: string; end: string } | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  // هدف دیالوگ تشخیص مشاهدهٔ مشکوک — §۱۲.۳
  const [diagTarget, setDiagTarget] = useState<SuspectDiagTarget | null>(null)
  // چرخهٔ در انتظار تأیید حذف — §۱۲.۴
  const [deleteTarget, setDeleteTarget] = useState<CycleRowDto | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const cellRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const seqInputRef = useRef<HTMLInputElement>(null)
  const startInputRef = useRef<HTMLInputElement>(null)
  const endInputRef = useRef<HTMLInputElement>(null)
  // فاصلهٔ کوتاه برای تفکیک کلیک از دابل‌کلیک روی سلول مشکوک — §۱۲.۳
  const diagTimerRef = useRef<number | null>(null)

  const cycles = sheet.cycles
  const method = sheet.session.timingMethod

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

  // ── ناوبری ──
  const focusCell = useCallback(
    (rowIdx: number, colIdx: number) => {
      cancelDiag()
      const r = Math.max(0, Math.min(rowIdx, cycles.length - 1))
      const c = Math.max(0, Math.min(colIdx, columns.length - 1))
      setActive({ rowIdx: r, colIdx: c })
      setRangeEnd(null)
      const el = cellRefs.current.get(`${r}:${c}`)
      el?.focus()
      el?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    },
    [cycles.length, columns.length, cancelDiag]
  )

  useEffect(() => {
    if (editing) {
      const column = columns[editing.colIdx]
      if (column?.entryMode === 'INT') startInputRef.current?.focus()
      else seqInputRef.current?.focus()
    }
  }, [editing, columns])

  const startEdit = useCallback(
    (rowIdx: number, colIdx: number, initial?: string) => {
      if (!editable) return
      cancelDiag()
      const cycle = cycles[rowIdx]
      const column = columns[colIdx]
      if (!cycle || !column) return
      const obs = findObservation(cycle, column.id)
      const v = cellEditValue(obs, method)
      setEditing({
        rowIdx,
        colIdx,
        seq: initial ?? v.seq,
        start: initial ? '' : v.start,
        end: initial ? '' : v.end,
      })
    },
    [cycles, columns, editable, method, cancelDiag]
  )

  const finishEdit = useCallback(
    (move: 'down' | 'next' | 'none' = 'down') => {
      if (!editing) return
      const current = editing
      const cycle = cycles[current.rowIdx]
      const column = columns[current.colIdx]
      if (cycle && column) {
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
          onCellError(`${current.rowIdx}:${current.colIdx}`, result.error)
          toast.error(result.error)
        } else {
          commitCell(cycle, column, result)
        }
      }
      setEditing(null)
      // جابه‌جایی پس از ثبت
      if (move === 'down') focusCell(current.rowIdx + 1, current.colIdx)
      else if (move === 'next') focusCell(current.rowIdx, current.colIdx + 1)
      else focusCell(current.rowIdx, current.colIdx)
    },
    [editing, cycles, columns, method, commitCell, focusCell, onCellError]
  )

  const clearActiveCell = useCallback(() => {
    const cycle = cycles[active.rowIdx]
    const column = columns[active.colIdx]
    if (!cycle || !column || !editable) return
    const parsed = parseCellInput('')
    const result = payloadFromParsed(parsed, column, method)
    if (!('error' in result)) commitCell(cycle, column, result)
  }, [active, cycles, columns, editable, method, commitCell])

  // ── کپی محدوده — FR-07 ──
  const copySelection = useCallback(async () => {
    if (!rangeEnd || !columns.length) {
      // تک‌سلول فعال
      const cycle = cycles[active.rowIdx]
      const column = columns[active.colIdx]
      if (cycle && column) {
        const obs = findObservation(cycle, column.id)
        const t =
          obs?.startOffset != null && obs?.endOffset != null
            ? `${obs.startOffset}-${obs.endOffset}`
            : String(method === 'CONTINUOUS' ? (obs?.cumulativeReading ?? '') : (obs?.rawDuration ?? ''))
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
      const cycle = cycles[r]
      if (!cycle) continue
      const parts: string[] = []
      for (let c = c1; c <= c2; c++) {
        const column = columns[c]
        if (!column) continue
        const obs = findObservation(cycle, column.id)
        parts.push(
          obs?.startOffset != null && obs?.endOffset != null
            ? `${obs.startOffset}-${obs.endOffset}`
            : String(method === 'CONTINUOUS' ? (obs?.cumulativeReading ?? '') : (obs?.rawDuration ?? ''))
        )
      }
      lines.push(parts.join('\t'))
    }
    try {
      await navigator.clipboard.writeText(lines.join('\n'))
      toast.success(`محدودهٔ ${r2 - r1 + 1}×${c2 - c1 + 1} کپی شد`)
    } catch {
      toast.error('کپی توسط مرورگر مسدود شد')
    }
  }, [rangeEnd, active, cycles, columns, method])

  // ── کیبورد سراسری برگه ──
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
          focusCell(active.rowIdx - 1, active.colIdx)
          break
        case 'ArrowDown':
          e.preventDefault()
          focusCell(active.rowIdx + 1, active.colIdx)
          break
        // RTL: عنصر بعدی بصورت چپ است
        case 'ArrowLeft':
          e.preventDefault()
          if (e.shiftKey) setRangeEnd({ rowIdx: active.rowIdx, colIdx: Math.min(active.colIdx + 1, columns.length - 1) })
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
          e.preventDefault()
          startEdit(active.rowIdx, active.colIdx)
          break
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
    [editing, history, copySelection, focusCell, active, columns.length, startEdit, clearActiveCell]
  )

  const onPasteEvent = useCallback(
    (e: React.ClipboardEvent<HTMLDivElement>) => {
      if (!editable || editing) return
      const text = e.clipboardData.getData('text')
      if (!text) return
      e.preventDefault()
      const cycle = cycles[active.rowIdx]
      onOpenPaste({ cycleNo: cycle?.cycleNo ?? 1, colIndex: active.colIdx }, text)
    },
    [editable, editing, cycles, active, onOpenPaste]
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

  const maxCols = columns.length

  return (
    <div
      ref={gridRef}
      role="grid"
      aria-label="برگه زمان‌سنجی"
      tabIndex={-1}
      onKeyDown={onKeyDown}
      onPaste={onPasteEvent}
      className="card-premium timing-grid max-h-[68vh] overflow-auto"
      dir="rtl"
    >
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 z-20">
          <tr className="bg-surface-2/95 backdrop-blur">
            <th className="sticky right-0 z-30 min-w-24 border-b border-l bg-surface-2/95 px-2 py-2 text-center text-xs font-bold backdrop-blur">
              چرخه
            </th>
            {columns.map((col) => {
              const stats = sheet.stats.perElement[col.id]
              return (
                <th key={col.id} className="min-w-28 border-b border-l px-2 py-1.5 text-right align-top last:border-l-0">
                  <div className="flex items-start justify-between gap-1">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold" title={col.name}>
                        {col.name}
                      </p>
                      <div className="mt-0.5 flex items-center gap-1">
                        <span className={`rounded-full px-1.5 py-px text-[10px] font-bold ${ELEMENT_TYPE_BADGE[col.elementType].className}`}>
                          {ELEMENT_TYPE_BADGE[col.elementType].label}
                        </span>
                        {editable && (
                          <button
                            type="button"
                            onClick={() => onToggleEntryMode(col.id)}
                            className={`rounded-full border px-1.5 py-px text-[10px] font-bold transition-colors ${
                              col.entryMode === 'INT'
                                ? 'border-brand/40 bg-brand-soft text-brand'
                                : 'border-border bg-muted text-muted-foreground hover:border-brand/40 hover:bg-brand-soft hover:text-brand'
                            }`}
                            title={
                              col.entryMode === 'SEQ'
                                ? 'ورودی ترتیبی — برای ورودی بازه‌ای (از/تا) کلیک کنید'
                                : 'ورودی بازه‌ای (از/تا) — برای ترتیبی کلیک کنید'
                            }
                            aria-label={`حالت ورود عنصر ${col.name}: ${col.entryMode === 'SEQ' ? 'ترتیبی' : 'بازه‌ای'}`}
                          >
                            {col.entryMode === 'SEQ' ? (method === 'CONTINUOUS' ? 'قرائت' : 'مدت') : 'از/تا'}
                          </button>
                        )}
                        <ElementParallelPopover
                          projectId={sheet.activity.projectId}
                          elementId={col.id}
                          elementName={col.name}
                          cycleOptions={sheet.cycles.map((c) => ({
                            cycleId: c.id,
                            cycleNo: c.cycleNo,
                            label: `چرخهٔ ${c.cycleNo}`,
                          }))}
                          defaultCycleId={sheet.cycles.at(-1)?.id ?? null}
                        />
                      </div>
                    </div>
                    {stats && stats.calcCount > 0 && (
                      <span className="num shrink-0 text-[10px] text-faint" title="مشاهدات وارد محاسبه">
                        {formatInt(stats.calcCount, prefs)}
                      </span>
                    )}
                  </div>
                </th>
              )
            })}
            <th className="min-w-24 border-b px-2 py-2 text-center text-xs font-bold">سپری‌شده</th>
          </tr>
        </thead>
        <tbody>
          {cycles.length === 0 && (
            <tr>
              <td colSpan={maxCols + 2} className="px-4 py-10 text-center text-sm text-muted-foreground">
                هنوز چرخه‌ای ثبت نشده است. با دکمهٔ «افزودن چرخه» شروع کنید یا داده را از Excel بچسبانید.
              </td>
            </tr>
          )}
          {cycles.map((cycle, rowIdx) => {
            const isExpanded = expanded === cycle.id
            return (
              <Fragment key={cycle.id}>
                <tr className="group">
                  {/* ستون چرخه — ثابت راست */}
                  <td className="sticky right-0 z-10 border-b border-l bg-card/95 px-1 py-1 backdrop-blur group-hover:bg-surface-2/60">
                    <div className="flex items-center justify-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => setExpanded(isExpanded ? null : cycle.id)}
                        aria-expanded={isExpanded}
                        aria-label={`جزئیات چرخهٔ ${cycle.cycleNo}`}
                        className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-brand-soft hover:text-brand"
                      >
                        <ChevronDown className={`size-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} aria-hidden />
                      </button>
                      <span className="num w-6 text-center text-sm font-extrabold">{formatInt(cycle.cycleNo, prefs)}</span>
                      <span className="flex w-4 justify-center" title={cycle.isComplete ? 'چرخهٔ کامل' : 'چرخهٔ ناقص'}>
                        {cycle.isComplete ? (
                          <Check className="size-3.5 text-green" aria-hidden />
                        ) : (
                          <AlertTriangle className="size-3.5 text-amber" aria-hidden />
                        )}
                      </span>
                      {cycle.notes && <StickyNote className="size-3 text-faint" aria-hidden />}
                    </div>
                  </td>

                  {/* سلول‌های عناصر */}
                  {columns.map((col, colIdx) => {
                    const obs = findObservation(cycle, col.id)
                    const isActive = active.rowIdx === rowIdx && active.colIdx === colIdx
                    const isEditing = editing?.rowIdx === rowIdx && editing?.colIdx === colIdx
                    const err = cellErrors[`${rowIdx}:${colIdx}`]
                    const excluded = obs?.validityStatus === 'EXCLUDED'
                    const suspect = obs?.validityStatus === 'SUSPECT'
                    const invalid = obs?.validityStatus === 'INVALID'
                    const partialInterval = obs && (obs.startOffset !== null) !== (obs.endOffset !== null)
                    return (
                      <td key={col.id} className="relative border-b border-l p-0 last:border-l-0">
                        <div
                          ref={(el) => {
                            if (el) cellRefs.current.set(`${rowIdx}:${colIdx}`, el)
                            else cellRefs.current.delete(`${rowIdx}:${colIdx}`)
                          }}
                          role="gridcell"
                          aria-label={`چرخهٔ ${cycle.cycleNo}، ${col.name}${obs?.derivedDuration != null ? `، مدت ${obs.derivedDuration}` : ''}${suspect ? '، مشاهدهٔ مشکوک' : ''}${excluded ? '، خارج‌شده از محاسبات' : ''}`}
                          tabIndex={isActive ? 0 : -1}
                          onClick={(e) => {
                            if (e.shiftKey) setRangeEnd({ rowIdx, colIdx })
                            else focusCell(rowIdx, colIdx)
                            // کلیک روی سلول مشکوک → دیالوگ تشخیص — §۱۲.۳
                            // (با تأخیر کوتاه تا دابل‌کلیک برای ویرایش ممکن بماند)
                            if (suspect && obs && !e.shiftKey && !excluded) scheduleDiag(cycle, obs, col.name)
                          }}
                          onDoubleClick={() => {
                            cancelDiag()
                            startEdit(rowIdx, colIdx)
                          }}
                          className={`num relative min-h-10 px-2 py-1.5 text-center outline-none transition-colors focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-brand ${
                            isActive ? 'bg-brand-soft/70 ring-2 ring-brand' : inRange(rowIdx, colIdx) ? 'bg-brand-soft/30' : 'hover:bg-muted/40'
                          } ${excluded ? 'text-faint line-through' : ''} ${suspect ? 'bg-amber-soft/50' : ''} ${invalid || err ? 'bg-red-soft/60' : ''} ${partialInterval ? 'ring-1 ring-inset ring-amber/60' : ''}`}
                        >
                          {isEditing ? (
                            col.entryMode === 'INT' ? (
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
                                    aria-label={`شروع بازهٔ ${col.name}`}
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
                                    aria-label={`پایان بازهٔ ${col.name}`}
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
                                aria-label={`مقدار ${col.name} چرخهٔ ${cycle.cycleNo}`}
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
                                    openDiag(cycle, obs, col.name)
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

                  {/* سپری‌شده — FR-10 */}
                  <td className="border-b px-2 py-1.5 text-center">
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
                </tr>

                {/* ردیف گسترش: خط زمانی + جزئیات + کنترل وضعیت — ۷.۴ */}
                {isExpanded && (
                  <tr className="bg-surface-2/30">
                    <td colSpan={maxCols + 2} className="border-b px-4 py-4">
                      <ExpandedRow
                        cycle={cycle}
                        sheet={sheet}
                        columns={columns}
                        prefs={prefs}
                        editable={editable}
                        onDelete={() => setDeleteTarget(cycle)}
                        onSetValidity={(obs) => onSetValidity(cycle, obs)}
                        onDiagnose={(obs) => openDiag(cycle, obs, columns.find((c) => c.id === obs.workElementId)?.name ?? '')}
                        onUpdateNotes={(notes) => onUpdateNotes(cycle, notes)}
                      />
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
        {/* پانوشت: مشاهدات معتبر هر عنصر — FR-12 */}
        {cycles.length > 0 && (
          <tfoot className="sticky bottom-0 bg-surface-2/95 backdrop-blur">
            <tr>
              <td className="sticky right-0 z-10 border-t bg-surface-2/95 px-2 py-1.5 text-center text-[10px] font-bold text-muted-foreground backdrop-blur">
                معتبر
              </td>
              {columns.map((col) => {
                const st = sheet.stats.perElement[col.id]
                return (
                  <td key={col.id} className="num border-t border-l px-2 py-1.5 text-center text-xs font-bold text-muted-foreground last:border-l-0">
                    {st ? `${formatInt(st.calcCount, prefs)}/${formatInt(st.totalCount, prefs)}` : '—'}
                  </td>
                )
              })}
              <td className="border-t px-2 py-1.5 text-center text-[10px] text-muted-foreground">
                <span className="num">
                  {formatInt(sheet.stats.sessionValidCycles, prefs)} چرخهٔ معتبر
                </span>
              </td>
            </tr>
          </tfoot>
        )}
      </table>

      {/* دیالوگ تشخیص مشاهدهٔ مشکوک — §۱۲.۳ (فقط خواندنی؛ خروج از محاسبات به دیالوگ وضعیت زنجیر می‌شود) */}
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

// ═══════════════ ردیف گسترش‌یافته ═══════════════

function ExpandedRow({
  cycle,
  sheet,
  columns,
  prefs,
  editable,
  onDelete,
  onSetValidity,
  onDiagnose,
  onUpdateNotes,
}: {
  cycle: CycleRowDto
  sheet: SessionSheetDto
  columns: ElementColumn[]
  prefs: Prefs
  editable: boolean
  onDelete: () => void
  onSetValidity: (obs: ObservationCellDto) => void
  /** بازکردن دیالوگ تشخیص برای مشاهدهٔ مشکوک — §۱۲.۳ */
  onDiagnose: (obs: ObservationCellDto) => void
  onUpdateNotes: (notes: string) => void
}) {
  const [notes, setNotes] = useState(cycle.notes ?? '')
  const [notesDirty, setNotesDirty] = useState(false)

  // همگام‌سازی با تغییر سرور (Undo/Redo) — تنظیم حالت در رندر
  const [prevServerNotes, setPrevServerNotes] = useState(cycle.notes ?? '')
  if ((cycle.notes ?? '') !== prevServerNotes) {
    setPrevServerNotes(cycle.notes ?? '')
    if (!notesDirty) setNotes(cycle.notes ?? '')
  }

  return (
    <div className="space-y-4">
      {/* شناسه و زمان ثبت — ۷.۴ */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span className="flex flex-wrap items-center gap-2">
          <span dir="ltr" className="num rounded bg-muted px-1.5 py-0.5 font-mono">
            {cycle.id.slice(0, 8)}
          </span>
          <span>شناسهٔ چرخه</span>
          <ChevronLeft className="size-3" aria-hidden />
          <span>ثبت: {new Date(cycle.createdAt).toLocaleString('fa-IR')}</span>
        </span>
        {editable && (
          <button
            type="button"
            onClick={onDelete}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold text-red transition-colors hover:bg-red-soft"
          >
            <Trash2 className="size-3.5" aria-hidden />
            حذف چرخه…
          </button>
        )}
      </div>

      {/* خط زمانی — FR-10 */}
      <CycleTimeline cycle={cycle} sheet={sheet} prefs={prefs} />

      {/* جزئیات مشاهدات + کنترل وضعیت — FR-11 */}
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b bg-surface-2/70 text-right">
              <th className="px-3 py-2 font-bold">عنصر</th>
              <th className="px-3 py-2 font-bold">مقدار خام</th>
              <th className="px-3 py-2 font-bold">مدت</th>
              <th className="px-3 py-2 font-bold">وضعیت</th>
              <th className="px-3 py-2 font-bold">اقدام</th>
            </tr>
          </thead>
          <tbody>
            {columns.map((col) => {
              const obs = cycle.observations.find((o) => o.workElementId === col.id)
              const rawText = !obs
                ? '—'
                : obs.startOffset != null || obs.endOffset != null
                  ? `${obs.startOffset ?? '؟'} تا ${obs.endOffset ?? '؟'}`
                  : sheet.session.timingMethod === 'CONTINUOUS'
                    ? `قرائت ${obs.cumulativeReading ?? '—'}`
                    : `${obs.rawDuration ?? '—'}`
              return (
                <tr key={col.id} className="border-b last:border-0">
                  <td className="px-3 py-2">
                    <span className="font-bold">{col.name}</span>
                    <span className="mr-1 text-[10px] text-faint">({ELEMENT_TYPE_BADGE[col.elementType].label})</span>
                  </td>
                  <td className="num px-3 py-2">{rawText}</td>
                  <td className="num px-3 py-2">{obs?.derivedDuration != null ? formatTimeValue(obs.derivedDuration, prefs) : '—'}</td>
                  <td className="px-3 py-2">
                    {obs?.validityStatus === 'EXCLUDED' ? (
                      <span className="flex items-center gap-1 text-faint">
                        <Eraser className="size-3.5" aria-hidden /> خارج‌شده
                        {obs.exclusionReason && <span className="text-[10px]">({obs.exclusionReason})</span>}
                      </span>
                    ) : obs?.validityStatus === 'SUSPECT' ? (
                      // دکمهٔ تشخیص مشاهدهٔ مشکوک — §۱۲.۳
                      <button
                        type="button"
                        onClick={() => onDiagnose(obs)}
                        className="flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-amber transition-colors hover:bg-amber-soft"
                        title="نمایش جزئیات تشخیص مشاهدهٔ مشکوک"
                      >
                        <AlertTriangle className="size-3.5" aria-hidden /> مشکوک — تشخیص
                      </button>
                    ) : obs?.validityStatus === 'INVALID' ? (
                      <span className="flex items-center gap-1 text-red">
                        <XCircle className="size-3.5" aria-hidden /> نامعتبر
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-green">
                        <Check className="size-3.5" aria-hidden /> معتبر
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {obs && obs.validityStatus !== 'INVALID' && (
                      <button
                        type="button"
                        onClick={() => onSetValidity(obs)}
                        className={`rounded-lg px-2 py-1 text-[11px] font-bold transition-colors ${
                          obs.validityStatus === 'EXCLUDED'
                            ? 'text-green hover:bg-green-soft'
                            : 'text-red hover:bg-red-soft'
                        }`}
                      >
                        {obs.validityStatus === 'EXCLUDED' ? 'بازگشت به محاسبات' : 'خروج از محاسبه'}
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* یادداشت چرخه */}
      <div className="space-y-1">
        <p className="text-[11px] font-bold text-muted-foreground">یادداشت چرخه (رویدادهای ویژه، وقفه‌ها و …)</p>
        <textarea
          value={notes}
          onChange={(e) => {
            setNotes(e.target.value)
            setNotesDirty(true)
          }}
          onBlur={() => {
            if (notesDirty) {
              onUpdateNotes(notes)
              setNotesDirty(false)
            }
          }}
          disabled={!editable}
          rows={2}
          className="w-full rounded-xl border bg-background p-2 text-xs focus-visible:outline-2 focus-visible:outline-ring"
          placeholder="مثلاً: اپراتور در ثانیهٔ ۱۲ برای دریافت قطعه متوقف شد"
        />
      </div>
    </div>
  )
}
