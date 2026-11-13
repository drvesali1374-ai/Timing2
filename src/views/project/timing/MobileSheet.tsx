'use client'

// ═══════════════════════════════════════════════════════════
// برگهٔ زمان‌سنجی موبایل — v1.5.0 §۹.۳
// همان مدل محوری دسکتاپ حفظ می‌شود (عنصر=ردیف، چرخه=ستون)؛
// نام عنصر/رابطه ثابت سمت راست، ستون‌های چرخه در سمت چپ با
// اسکرول افقی، هدر چسبان، ارتفاع لمسی، بدون نیاز به Hover.
// به مدل قدیمی «کارت برای هر چرخه» برنمی‌گردد.
// ═══════════════════════════════════════════════════════════
import { useMemo, useState } from 'react'
import { AlertTriangle, Check, CornerDownRight, Plus, StickyNote, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import type { CycleRowDto, ObservationCellDto, SessionSheetDto } from '@/lib/api/endpoints'
import type { DisplayPrefs as Prefs } from '@/lib/format'
import { formatInt, formatTimeValue } from '@/lib/format'
import {
  buildRows,
  cellDisplayValue,
  cellEditValue,
  computedOverlapFor,
  findObservation,
  overlapCellOf,
  parseCellInput,
  parseOverlapInput,
  payloadFromParsed,
  relationComparability,
  type CellPayload,
  type ElementColumn,
  type GridRow,
  type OverlapCellState,
} from './shared'
import { AddRelationControl, ArchiveRelationControl } from '../matrix/RelationControls'
import { SuspectDiagnosticDialog, type SuspectDiagTarget } from './SuspectDiagnosticDialog'
import { DeleteCycleConfirm } from './DeleteCycleConfirm'
import { CycleDetailDialog } from './CycleDetailDialog'

interface MobileSheetProps {
  sheet: SessionSheetDto
  columns: ElementColumn[]
  prefs: Prefs
  editable: boolean
  /** v1.5.1 §۴ — کاتالوگ کامل عناصر پروژه؛ همان منبع دسکتاپ (نه منطق انتخاب مستقل) */
  projectCatalog: Array<{ elementId: string; name: string; activityId: string; activityName: string; stationId: string; stationName: string }>
  commitCell: (cycle: CycleRowDto, column: ElementColumn, payload: CellPayload) => void
  commitOverlap: (relationId: string, cycle: CycleRowDto, state: OverlapCellState) => void
  onCellError: (key: string, message: string) => void
  onDeleteCycle: (cycle: CycleRowDto) => void
  onSetValidity: (cycle: CycleRowDto, obs: ObservationCellDto) => void
  onUpdateNotes: (cycle: CycleRowDto, notes: string) => void
  onAddCycle: () => void
  adding: boolean
}

export function MobileSheet({
  sheet,
  columns,
  prefs,
  editable,
  projectCatalog,
  commitCell,
  commitOverlap,
  onCellError,
  onDeleteCycle,
  onSetValidity,
  onUpdateNotes,
  onAddCycle,
  adding,
}: MobileSheetProps) {
  const [diagTarget, setDiagTarget] = useState<SuspectDiagTarget | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<CycleRowDto | null>(null)
  const [detailTarget, setDetailTarget] = useState<CycleRowDto | null>(null)

  const cycles = sheet.cycles
  const method = sheet.session.timingMethod
  const rows: GridRow[] = useMemo(() => buildRows(sheet, columns), [sheet, columns])
  const relationById = useMemo(
    () => new Map(sheet.parallelRelations.map((r) => [r.relationId, r])),
    [sheet.parallelRelations]
  )
  // v1.5.1 §۷ — نام عناصر خارج از Activity جاری نیز از روابط برگه حل می‌شود
  const nameOf = (id: string) =>
    sheet.elements.find((e) => e.id === id)?.name ??
    sheet.parallelRelations.reduce<string>((acc, r) => {
      if (acc !== '؟') return acc
      if (r.elementLowId === id) return r.elementLowName
      if (r.elementHighId === id) return r.elementHighName
      return acc
    }, '؟')

  return (
    <div className="space-y-3">
      <div className="card-premium overflow-hidden">
        {/* سربرگ جلسه */}
        <div className="card-head flex items-center justify-between gap-2 px-3 py-2">
          <p className="num text-xs font-bold">
            {formatInt(cycles.length, prefs)} چرخه — {sheet.operator.displayName}
          </p>
          <Button size="sm" variant="outline" onClick={onAddCycle} disabled={adding || !editable} className="gap-1">
            <Plus className="size-3.5" aria-hidden />
            چرخه
          </Button>
        </div>

        {/* جدول معکوس‌شده لمسی — §۹.۳ */}
        <div className="timing-grid-mobile max-h-[70vh] overflow-auto" dir="rtl">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-20">
              <tr className="bg-surface-2/95 backdrop-blur">
                <th className="sticky right-0 z-30 min-w-32 border-b border-l bg-surface-2/95 px-2 py-2 text-center text-[10px] font-bold backdrop-blur">
                  عنصر / رابطه
                </th>
                {cycles.length === 0 && (
                  <th className="border-b px-2 py-2 text-center text-[10px] font-bold text-muted-foreground">
                    چرخه‌ای نیست
                  </th>
                )}
                {cycles.map((cycle) => (
                  <th key={cycle.id} className="min-w-20 border-b border-l px-1 py-1.5 text-center last:border-l-0">
                    <button
                      type="button"
                      onClick={() => setDetailTarget(cycle)}
                      className="flex w-full flex-col items-center gap-0.5 rounded-lg px-1 py-1 transition-colors active:bg-brand-soft/60"
                      aria-label={`جزئیات چرخهٔ ${cycle.cycleNo}`}
                    >
                      <span className="num text-sm font-extrabold">{formatInt(cycle.cycleNo, prefs)}</span>
                      <span className="flex items-center gap-0.5">
                        {cycle.isComplete ? (
                          <Check className="size-3.5 text-green" aria-hidden />
                        ) : (
                          <AlertTriangle className="size-3.5 text-amber" aria-hidden />
                        )}
                        {cycle.notes && <StickyNote className="size-3 text-faint" aria-hidden />}
                      </span>
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cycles.length === 0 && (
                <tr>
                  <td colSpan={2} className="px-4 py-8 text-center text-xs text-muted-foreground">
                    هنوز چرخه‌ای ثبت نشده است؛ با دکمهٔ «چرخه» شروع کنید.
                  </td>
                </tr>
              )}
              {rows.map((row) =>
                row.kind === 'ELEMENT' ? (
                  <MobileElementRow
                    key={`el:${row.elementId}`}
                    row={row}
                    column={columns[row.elementIndex]}
                    sheet={sheet}
                    cycles={cycles}
                    prefs={prefs}
                    editable={editable}
                    method={method}
                    projectCatalog={projectCatalog}
                    commitCell={commitCell}
                    onCellError={onCellError}
                    onOpenDiag={(cycle, obs) => setDiagTarget({ cycle, obs, elementName: row.name })}
                  />
                ) : (
                  <MobileParallelRow
                    key={row.displayKey}
                    row={row}
                    relation={relationById.get(row.relationId)}
                    sheet={sheet}
                    cycles={cycles}
                    prefs={prefs}
                    editable={editable}
                    commitOverlap={commitOverlap}
                    onCellError={onCellError}
                    nameOf={nameOf}
                  />
                )
              )}
            </tbody>
            {cycles.length > 0 && rows.length > 0 && (
              <tfoot className="sticky bottom-0 bg-surface-2/95 backdrop-blur">
                <tr>
                  <th scope="row" className="sticky right-0 z-10 border-t bg-surface-2/95 px-2 py-1.5 text-right text-[10px] font-bold text-muted-foreground backdrop-blur">
                    سپری‌شده
                  </th>
                  {cycles.map((cycle) => (
                    <td key={cycle.id} className="border-t border-l px-1 py-1.5 text-center last:border-l-0">
                      {cycle.elapsed === null ? (
                        <span className="text-[9px] text-faint">تکمیل</span>
                      ) : (
                        <span className="num inline-flex items-center gap-0.5 text-[10px] font-bold">
                          {formatTimeValue(cycle.elapsed, prefs)}
                          {cycle.elapsedExcludesSequential && <AlertTriangle className="size-2.5 text-amber" aria-hidden />}
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* دیالوگ جزئیات چرخه — §۸.۱ */}
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
          if (cycle) setDiagTarget({ cycle, obs, elementName: columns.find((c) => c.id === obs.workElementId)?.name ?? '' })
        }}
        onUpdateNotes={onUpdateNotes}
      />

      <SuspectDiagnosticDialog
        target={diagTarget}
        prefs={prefs}
        onClose={() => setDiagTarget(null)}
        onExclude={(t) => {
          setDiagTarget(null)
          onSetValidity(t.cycle, t.obs)
        }}
      />

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

// ── ردیف اصلی عنصر با ورودی‌های لمسی ──

function MobileElementRow({
  row,
  column,
  sheet,
  cycles,
  prefs,
  editable,
  method,
  projectCatalog,
  commitCell,
  onCellError,
  onOpenDiag,
}: {
  row: Extract<GridRow, { kind: 'ELEMENT' }>
  column: ElementColumn | undefined
  sheet: SessionSheetDto
  cycles: CycleRowDto[]
  prefs: Prefs
  editable: boolean
  method: 'SNAPBACK' | 'CONTINUOUS'
  projectCatalog: Array<{ elementId: string; name: string; activityId: string; activityName: string; stationId: string; stationName: string }>
  commitCell: (cycle: CycleRowDto, column: ElementColumn, payload: CellPayload) => void
  onCellError: (key: string, message: string) => void
  onOpenDiag: (cycle: CycleRowDto, obs: ObservationCellDto) => void
}) {
  // v1.5.1 §۴ — همان فهرست کامل عناصر پروژه که دسکتاپ استفاده می‌کند؛
  // بدون عنصر جاری و بدون رابطهٔ فعال تکراری (منطق انتخاب مستقل ندارد).
  const candidates = useMemo(
    () =>
      column
        ? projectCatalog
            .filter(
              (c) =>
                c.elementId !== column.id &&
                !sheet.parallelRelations.some(
                  (r) =>
                    (r.elementLowId === column.id && r.elementHighId === c.elementId) ||
                    (r.elementHighId === column.id && r.elementLowId === c.elementId)
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
        : [],
    [column, projectCatalog, sheet.parallelRelations]
  )

  if (!column) return null
  const stats = sheet.stats.perElement[column.id]

  return (
    <tr className="border-t-2 border-border/70">
      <th scope="row" className="sticky right-0 z-10 border-b border-l bg-card/95 px-2 py-1.5 text-right backdrop-blur">
        <div className="flex items-start justify-between gap-1">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-extrabold" title={row.name}>
              {row.name}
            </p>
            {stats && stats.calcCount > 0 && (
              <span className="num text-[10px] text-faint" title="مشاهدات وارد محاسبه">
                {formatInt(stats.calcCount, prefs)}/{formatInt(stats.totalCount, prefs)}
              </span>
            )}
          </div>
          {editable && (
            <AddRelationControl
              projectId={sheet.activity.projectId}
              elementId={row.elementId}
              elementName={row.name}
              currentActivityId={sheet.activity.id}
              candidates={candidates}
              trigger={
                <button
                  type="button"
                  aria-label={`افزودن عنصر موازی برای ${row.name}`}
                  title="افزودن رابطهٔ موازی — عناصر همهٔ فعالیت‌های پروژه"
                  className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors active:bg-brand-soft active:text-brand"
                >
                  <CornerDownRight className="size-4 rotate-90" aria-hidden />
                </button>
              }
            />
          )}
        </div>
      </th>
      {cycles.map((cycle) => (
        <MobileElementCell
          key={cycle.id}
          cycle={cycle}
          column={column}
          rowName={row.name}
          prefs={prefs}
          editable={editable}
          method={method}
          commitCell={commitCell}
          onCellError={onCellError}
          onOpenDiag={onOpenDiag}
        />
      ))}
    </tr>
  )
}

function MobileElementCell({
  cycle,
  column,
  rowName,
  prefs,
  editable,
  method,
  commitCell,
  onCellError,
  onOpenDiag,
}: {
  cycle: CycleRowDto
  column: ElementColumn
  rowName: string
  prefs: Prefs
  editable: boolean
  method: 'SNAPBACK' | 'CONTINUOUS'
  commitCell: (cycle: CycleRowDto, column: ElementColumn, payload: CellPayload) => void
  onCellError: (key: string, message: string) => void
  onOpenDiag: (cycle: CycleRowDto, obs: ObservationCellDto) => void
}) {
  const obs = findObservation(cycle, column.id)
  const v = cellEditValue(obs, method)
  const [seq, setSeq] = useState(v.seq)
  const [start, setStart] = useState(v.start)
  const [end, setEnd] = useState(v.end)
  // همگام‌سازی با تغییر سرور (Undo/Redo) — تنظیم حالت در رندر
  const [prevObs, setPrevObs] = useState(obs)
  if (obs !== prevObs) {
    setPrevObs(obs)
    const nv = cellEditValue(obs, method)
    setSeq(nv.seq)
    setStart(nv.start)
    setEnd(nv.end)
  }

  const commit = () => {
    let parsed
    if (column.entryMode === 'INT') {
      const s = start.trim()
      const e = end.trim()
      parsed = s === '' && e === '' ? ({ kind: 'EMPTY' } as const) : parseCellInput(s === '' || e === '' ? (s || e) : `${s}-${e}`)
    } else {
      parsed = parseCellInput(seq)
    }
    const result = payloadFromParsed(parsed, column, method)
    if ('error' in result) {
      onCellError(`${column.id}:${cycle.id}`, result.error)
      toast.error(result.error)
    } else {
      commitCell(cycle, column, result)
    }
  }

  const excluded = obs?.validityStatus === 'EXCLUDED'
  const suspect = obs?.validityStatus === 'SUSPECT'
  const invalid = obs?.validityStatus === 'INVALID'
  const partialInterval = obs && (obs.startOffset !== null) !== (obs.endOffset !== null)

  return (
    <td
      className={`relative border-b border-l p-0.5 text-center align-middle last:border-l-0 ${
        suspect ? 'bg-amber-soft/50' : ''
      } ${invalid ? 'bg-red-soft/60' : ''} ${excluded ? 'bg-muted/60' : ''} ${partialInterval ? 'ring-1 ring-inset ring-amber/60' : ''}`}
    >
      {excluded ? (
        <button
          type="button"
          onClick={() => obs && onOpenDiag(cycle, obs)}
          className="num w-full px-1 py-2 text-[10px] text-faint line-through"
          title="خارج‌شده از محاسبات — برای بازگشت، جزئیات چرخه را باز کنید"
        >
          خارج
        </button>
      ) : suspect && obs ? (
        <button
          type="button"
          onClick={() => onOpenDiag(cycle, obs)}
          className="flex w-full flex-col items-center gap-0.5 px-1 py-1.5 text-amber"
          aria-label="تشخیص مشاهدهٔ مشکوک"
        >
          <AlertTriangle className="size-4" aria-hidden />
          <span className="num text-[10px]">{cellDisplayValue(obs, method, prefs)}</span>
        </button>
      ) : editable ? (
        column.entryMode === 'INT' ? (
          <span dir="ltr" className="inline-flex items-end justify-center gap-0.5 rounded-md border bg-background px-0.5 py-0.5">
            <input
              value={start}
              onChange={(e) => setStart(e.target.value)}
              onBlur={commit}
              aria-label={`شروع بازهٔ ${rowName} چرخهٔ ${cycle.cycleNo}`}
              className="num w-11 rounded-sm border-0 bg-transparent px-0.5 py-1 text-center text-xs focus-visible:bg-brand-soft/40 focus-visible:outline-none"
              inputMode="decimal"
              dir="ltr"
            />
            <span className="pb-1.5 text-faint" aria-hidden>–</span>
            <input
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              onBlur={commit}
              aria-label={`پایان بازهٔ ${rowName} چرخهٔ ${cycle.cycleNo}`}
              className="num w-11 rounded-sm border-0 bg-transparent px-0.5 py-1 text-center text-xs focus-visible:bg-brand-soft/40 focus-visible:outline-none"
              inputMode="decimal"
              dir="ltr"
            />
          </span>
        ) : (
          <input
            value={seq}
            onChange={(e) => setSeq(e.target.value)}
            onBlur={commit}
            aria-label={`مقدار ${rowName} چرخهٔ ${cycle.cycleNo}`}
            className="num w-16 rounded-md border-0 bg-transparent px-0.5 py-2 text-center text-xs focus-visible:bg-brand-soft/40 focus-visible:outline-none"
            inputMode="decimal"
            dir="ltr"
            placeholder="—"
          />
        )
      ) : (
        <span className="num block px-1 py-2 text-xs">{cellDisplayValue(obs, method, prefs)}</span>
      )}
      {method === 'CONTINUOUS' && obs?.cumulativeReading != null && obs?.derivedDuration != null && (
        <span className="block text-[9px] leading-3 text-faint">({formatTimeValue(obs.derivedDuration, prefs)})</span>
      )}
      {obs?.startOffset != null && obs?.endOffset != null && obs.derivedDuration != null && (
        <span className="block text-[9px] leading-3 text-faint">({formatTimeValue(obs.derivedDuration, prefs)})</span>
      )}
    </td>
  )
}

// ── زیرردیف رابطهٔ موازی با ورودی لمسی ──

function MobileParallelRow({
  row,
  relation,
  sheet,
  cycles,
  prefs,
  editable,
  commitOverlap,
  onCellError,
  nameOf,
}: {
  row: Extract<GridRow, { kind: 'PARALLEL' }>
  relation: { relationId: string; elementLowId: string; elementHighId: string } | undefined
  sheet: SessionSheetDto
  cycles: CycleRowDto[]
  prefs: Prefs
  editable: boolean
  commitOverlap: (relationId: string, cycle: CycleRowDto, state: OverlapCellState) => void
  onCellError: (key: string, message: string) => void
  nameOf: (id: string) => string
}) {
  if (!relation) return null
  return (
    <tr className="t2-subrow">
      <th scope="row" className="sticky right-0 z-10 border-b border-l bg-surface-2/50 px-2 py-1 text-right backdrop-blur">
        <div className="flex items-center justify-between gap-1">
          <div className="flex min-w-0 items-center gap-1">
            <span className="h-4 w-2 shrink-0 rounded-e border-b-2 border-l-2 border-brand/30" aria-hidden />
            <p
              className="flex min-w-0 items-center gap-1 truncate text-[10px] font-bold text-muted-foreground"
              title={`هم‌پوشانی با ${row.otherName}${row.crossActivity ? ` (فعالیت ${row.otherActivityName ?? '؟'} / ایستگاه ${row.otherStationName ?? '؟'})` : ''}`}
            >
              <span className="truncate">↳ {row.otherName}</span>
              {row.crossActivity && (
                <span
                  className="shrink-0 rounded-md border border-amber/70 bg-amber-soft/40 px-1 py-px text-[8px] font-bold"
                  title={`رابطهٔ بین‌فعالیت — «${row.otherActivityName ?? '؟'}» / «${row.otherStationName ?? '؟'}»`}
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
                  className="flex size-7 shrink-0 items-center justify-center rounded-lg text-faint transition-colors active:bg-red-soft active:text-red"
                >
                  <XCircle className="size-3.5" aria-hidden />
                </button>
              }
            />
          )}
        </div>
      </th>
      {cycles.map((cycle) => (
        <MobileOverlapCell
          key={cycle.id}
          cycle={cycle}
          row={row}
          relation={relation}
          prefs={prefs}
          editable={editable}
          commitOverlap={commitOverlap}
          onCellError={onCellError}
          nameOf={nameOf}
        />
      ))}
    </tr>
  )
}

function MobileOverlapCell({
  cycle,
  row,
  relation,
  prefs,
  editable,
  commitOverlap,
  onCellError,
  nameOf,
}: {
  cycle: CycleRowDto
  row: Extract<GridRow, { kind: 'PARALLEL' }>
  relation: { elementLowId: string; elementHighId: string }
  prefs: Prefs
  editable: boolean
  commitOverlap: (relationId: string, cycle: CycleRowDto, state: OverlapCellState) => void
  onCellError: (key: string, message: string) => void
  nameOf: (id: string) => string
}) {
  const cell = overlapCellOf(cycle, row.relationId)
  const cmp = relationComparability(cycle, relation, nameOf)
  const computed = computedOverlapFor(cycle, relation)
  const [value, setValue] = useState(cell.status === 'UNREVIEWED' ? '' : String(cell.overlapDuration ?? ''))
  const [prevCell, setPrevCell] = useState(cell)
  if (cell !== prevCell) {
    setPrevCell(cell)
    setValue(cell.status === 'UNREVIEWED' ? '' : String(cell.overlapDuration ?? ''))
  }

  const commit = () => {
    const parsed = parseOverlapInput(value)
    if (parsed.kind === 'INVALID') {
      onCellError(`${row.relationId}:${cycle.id}`, parsed.reason)
      toast.error(parsed.reason)
      return
    }
    if (parsed.kind === 'EMPTY') {
      commitOverlap(row.relationId, cycle, { status: 'UNREVIEWED', overlapDuration: null })
      return
    }
    if (parsed.value < 0) {
      const msg = 'مقدار هم‌پوشانی منفی مجاز نیست'
      onCellError(`${row.relationId}:${cycle.id}`, msg)
      toast.error(msg)
      return
    }
    if (parsed.value === 0) {
      if (computed !== null && computed > 1e-9) {
        const msg = `بازهٔ واقعی این چرخه هم‌پوشانی ${formatTimeValue(computed, prefs)} دارد؛ ثبت «بدون هم‌پوشانی» ممکن نیست`
        onCellError(`${row.relationId}:${cycle.id}`, msg)
        toast.error(msg)
        return
      }
      commitOverlap(row.relationId, cycle, { status: 'NO_OVERLAP', overlapDuration: 0 })
      return
    }
    if (computed !== null && Math.abs(parsed.value - computed) > 1e-6) {
      const msg = `مقدار واردشده (${parsed.value}) با هم‌پوشانی بازهٔ واقعی (${formatTimeValue(computed, prefs)}) نمی‌خواند`
      onCellError(`${row.relationId}:${cycle.id}`, msg)
      toast.error(msg)
      return
    }
    commitOverlap(row.relationId, cycle, { status: 'OVERLAP', overlapDuration: parsed.value })
  }

  const canEdit = editable && cmp.isComparable

  return (
    <td
      className={`border-b border-l p-0.5 text-center last:border-l-0 ${
        cell.status === 'NO_OVERLAP' ? 'bg-green-soft/30' : ''
      } ${cell.status === 'OVERLAP' ? 'bg-green-soft/40' : ''}`}
      title={!cmp.isComparable ? (cmp.notComparableReason ?? undefined) : undefined}
    >
      {canEdit ? (
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          aria-label={`هم‌پوشانی ${row.parentName} با ${row.otherName} چرخهٔ ${cycle.cycleNo}`}
          className="num w-16 rounded-md border-0 bg-transparent px-0.5 py-2 text-center text-xs focus-visible:bg-brand-soft/40 focus-visible:outline-none"
          inputMode="decimal"
          dir="ltr"
          placeholder="—"
        />
      ) : cell.status === 'UNREVIEWED' ? (
        <span className="mx-auto block w-fit rounded border border-dashed border-amber/50 px-1 text-[9px] leading-5 text-amber/70" title={cmp.notComparableReason ?? 'بررسی‌نشده'}>
          ؟
        </span>
      ) : cell.status === 'NO_OVERLAP' ? (
        <span className="num block py-2 text-xs text-green">۰</span>
      ) : (
        <span className="num block py-2 text-xs font-bold">
          {formatTimeValue(cell.overlapDuration, prefs)}
          <span className="ms-0.5 text-[9px] font-normal text-faint">s</span>
        </span>
      )}
      {computed !== null && cell.status !== 'OVERLAP' && canEdit && (
        <button
          type="button"
          onClick={() => commitOverlap(row.relationId, cycle, { status: 'OVERLAP', overlapDuration: computed })}
          className="block w-full text-[8px] leading-3 text-brand/80"
          title={`هم‌پوشانی محاسبه‌شده از بازهٔ واقعی: ${formatTimeValue(computed, prefs)} — برای اعمال لمس کنید`}
        >
          ≈ {formatTimeValue(computed, prefs)}
        </button>
      )}
    </td>
  )
}
