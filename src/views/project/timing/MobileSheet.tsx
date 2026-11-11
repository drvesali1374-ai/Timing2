'use client'

// ═══════════════════════════════════════════════════════════
// برگهٔ زمان‌سنجی موبایل — حالت کارت/فرم چرخه — FR-07 / FR-30
// همان مدل داده و همان قواعد اعتبارسنجی دسکتاپ؛
// جدول به کارت تبدیل می‌شود نه حذف قابلیت.
// ═══════════════════════════════════════════════════════════
import { useEffect, useState } from 'react'
import { AlertTriangle, Check, ChevronDown, Eraser, Plus, Trash2, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import type { CycleRowDto, ObservationCellDto, SessionSheetDto } from '@/lib/api/endpoints'
import type { DisplayPrefs as Prefs } from '@/lib/format'
import { formatTimeValue, formatInt } from '@/lib/format'
import {
  ELEMENT_TYPE_BADGE,
  cellEditValue,
  findObservation,
  parseCellInput,
  payloadFromParsed,
  type CellPayload,
  type ElementColumn,
} from './shared'
import { CycleTimeline } from './CycleTimeline'
import { SuspectDiagnosticDialog, type SuspectDiagTarget } from './SuspectDiagnosticDialog'
import { DeleteCycleConfirm } from './DeleteCycleConfirm'

interface MobileSheetProps {
  sheet: SessionSheetDto
  columns: ElementColumn[]
  prefs: Prefs
  editable: boolean
  commitCell: (cycle: CycleRowDto, column: ElementColumn, payload: CellPayload) => void
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
  commitCell,
  onDeleteCycle,
  onSetValidity,
  onUpdateNotes,
  onAddCycle,
  adding,
}: MobileSheetProps) {
  const [expanded, setExpanded] = useState<string | null>(null)
  // هدف دیالوگ تشخیص مشاهدهٔ مشکوک — §۱۲.۳
  const [diagTarget, setDiagTarget] = useState<SuspectDiagTarget | null>(null)
  // چرخهٔ در انتظار تأیید حذف — §۱۲.۴
  const [deleteTarget, setDeleteTarget] = useState<CycleRowDto | null>(null)
  const method = sheet.session.timingMethod

  return (
    <div className="space-y-3">
      {sheet.cycles.length === 0 && (
        <div className="card-premium p-8 text-center text-sm text-muted-foreground">
          هنوز چرخه‌ای ثبت نشده است.
        </div>
      )}
      {sheet.cycles.map((cycle) => (
        <MobileCycleCard
          key={cycle.id}
          cycle={cycle}
          sheet={sheet}
          columns={columns}
          prefs={prefs}
          editable={editable}
          expanded={expanded === cycle.id}
          onToggle={() => setExpanded(expanded === cycle.id ? null : cycle.id)}
          commitCell={commitCell}
          onDeleteCycle={onDeleteCycle}
          onSetValidity={onSetValidity}
          onDiagnose={(obs, elementName) => setDiagTarget({ cycle, obs, elementName })}
          onUpdateNotes={onUpdateNotes}
        />
      ))}
      {editable && (
        <Button onClick={onAddCycle} disabled={adding} className="btn-brand w-full gap-1.5 border-0">
          <Plus className="size-4" aria-hidden />
          افزودن چرخه
        </Button>
      )}

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

function MobileCycleCard({
  cycle,
  sheet,
  columns,
  prefs,
  editable,
  expanded,
  onToggle,
  commitCell,
  onDeleteCycle,
  onSetValidity,
  onDiagnose,
  onUpdateNotes,
}: {
  cycle: CycleRowDto
  sheet: SessionSheetDto
  columns: ElementColumn[]
  prefs: Prefs
  editable: boolean
  expanded: boolean
  onToggle: () => void
  commitCell: (cycle: CycleRowDto, column: ElementColumn, payload: CellPayload) => void
  onDeleteCycle: (cycle: CycleRowDto) => void
  onSetValidity: (cycle: CycleRowDto, obs: ObservationCellDto) => void
  /** بازکردن دیالوگ تشخیص برای مشاهدهٔ مشکوک — §۱۲.۳ */
  onDiagnose: (obs: ObservationCellDto, elementName: string) => void
  onUpdateNotes: (cycle: CycleRowDto, notes: string) => void
}) {
  const method = sheet.session.timingMethod
  const [notes, setNotes] = useState(cycle.notes ?? '')
  const [notesDirty, setNotesDirty] = useState(false)

  // همگام‌سازی با تغییر سرور (Undo/Redo) — تنظیم حالت در رندر
  const [prevServerNotes, setPrevServerNotes] = useState(cycle.notes ?? '')
  if ((cycle.notes ?? '') !== prevServerNotes) {
    setPrevServerNotes(cycle.notes ?? '')
    if (!notesDirty) setNotes(cycle.notes ?? '')
  }

  return (
    <div className="card-premium overflow-hidden">
      {/* سربرگ کارت */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-2 p-3 text-right"
      >
        <span className="flex items-center gap-2">
          <span className="num flex size-9 items-center justify-center rounded-xl bg-brand-soft text-sm font-extrabold text-brand">
            {formatInt(cycle.cycleNo, prefs)}
          </span>
          <span className="text-right">
            <span className="block text-xs font-bold">چرخه</span>
            <span className="num flex items-center gap-1.5 text-[11px] text-muted-foreground">
              {cycle.elapsed !== null ? (
                <>
                  <span className="font-bold">{formatTimeValue(cycle.elapsed, prefs)} ثانیه</span>
                  {cycle.elapsedExcludesSequential && <AlertTriangle className="size-3 text-amber" aria-hidden />}
                </>
              ) : (
                <span>نیازمند تکمیل</span>
              )}
            </span>
          </span>
        </span>
        <span className="flex items-center gap-1.5">
          {cycle.isComplete ? (
            <span className="flex items-center gap-1 rounded-full bg-green-soft px-2 py-0.5 text-[10px] font-bold text-green">
              <Check className="size-3" aria-hidden /> کامل
            </span>
          ) : (
            <span className="flex items-center gap-1 rounded-full bg-amber-soft px-2 py-0.5 text-[10px] font-bold text-amber">
              <AlertTriangle className="size-3" aria-hidden /> ناقص
            </span>
          )}
          {cycle.hasExcluded && (
            <span className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-faint">
              <Eraser className="size-3" aria-hidden /> خروج
            </span>
          )}
          <ChevronDown className={`size-4 text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden />
        </span>
      </button>

      {expanded && (
        <div className="space-y-3 border-t p-3">
          {/* فرم عناصر — همان اعتبارسنجی — FR-07 */}
          <div className="space-y-3">
            {columns.map((col) => {
              const obs = findObservation(cycle, col.id)
              const excluded = obs?.validityStatus === 'EXCLUDED'
              return (
                <MobileElementField
                  key={col.id}
                  cycle={cycle}
                  column={col}
                  obs={obs}
                  method={method}
                  prefs={prefs}
                  editable={editable && !excluded}
                  commitCell={commitCell}
                  onSetValidity={() => obs && onSetValidity(cycle, obs)}
                  onDiagnose={() => obs && onDiagnose(obs, col.name)}
                />
              )
            })}
          </div>

          {/* خط زمانی — FR-10 */}
          <CycleTimeline cycle={cycle} sheet={sheet} prefs={prefs} />

          {/* یادداشت */}
          <div className="space-y-1">
            <p className="text-[11px] font-bold text-muted-foreground">یادداشت چرخه</p>
            <textarea
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value)
                setNotesDirty(true)
              }}
              onBlur={() => {
                if (notesDirty) {
                  onUpdateNotes(cycle, notes)
                  setNotesDirty(false)
                }
              }}
              disabled={!editable}
              rows={2}
              className="w-full rounded-xl border bg-background p-2 text-xs focus-visible:outline-2 focus-visible:outline-ring"
            />
          </div>

          {editable && (
            <div className="flex items-center justify-between gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onDeleteCycle(cycle)}
                className="gap-1.5 text-red hover:text-red"
              >
                <Trash2 className="size-3.5" aria-hidden />
                حذف چرخه…
              </Button>
              <span className="text-[10px] text-faint">حذف با Undo قابل بازگردانی است</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function MobileElementField({
  cycle,
  column,
  obs,
  method,
  prefs,
  editable,
  commitCell,
  onSetValidity,
  onDiagnose,
}: {
  cycle: CycleRowDto
  column: ElementColumn
  obs: ObservationCellDto | undefined
  method: 'SNAPBACK' | 'CONTINUOUS'
  prefs: Prefs
  editable: boolean
  commitCell: (cycle: CycleRowDto, column: ElementColumn, payload: CellPayload) => void
  onSetValidity: () => void
  /** بازکردن دیالوگ تشخیص مشاهدهٔ مشکوک — §۱۲.۳ */
  onDiagnose: () => void
}) {
  const init = cellEditValue(obs, method)
  const [seq, setSeq] = useState(init.seq)
  const [start, setStart] = useState(init.start)
  const [end, setEnd] = useState(init.end)
  const [error, setError] = useState<string | null>(null)

  // همگام‌سازی با دادهٔ سرور (Undo/Redo) — تنظیم حالت در رندر
  const [prevObs, setPrevObs] = useState(obs)
  if (obs !== prevObs) {
    setPrevObs(obs)
    const v = cellEditValue(obs, method)
    setSeq(v.seq)
    setStart(v.start)
    setEnd(v.end)
    setError(null)
  }

  const commit = () => {
    let parsed
    if (column.entryMode === 'INT') {
      const s = start.trim()
      const e = end.trim()
      parsed = s === '' && e === '' ? ({ kind: 'EMPTY' } as const) : parseCellInput(s === '' || e === '' ? s || e : `${s}-${e}`)
    } else {
      parsed = parseCellInput(seq)
    }
    const result = payloadFromParsed(parsed, column, method)
    if ('error' in result) {
      setError(result.error)
      toast.error(`${column.name}: ${result.error}`)
    } else {
      setError(null)
      commitCell(cycle, column, result)
    }
  }

  const excluded = obs?.validityStatus === 'EXCLUDED'

  return (
    <div className={`space-y-1 rounded-xl border p-2.5 ${excluded ? 'opacity-60' : ''}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="flex min-w-0 items-center gap-1.5 text-xs font-bold">
          <span className={`shrink-0 rounded-full px-1.5 py-px text-[10px] font-bold ${ELEMENT_TYPE_BADGE[column.elementType].className}`}>
            {ELEMENT_TYPE_BADGE[column.elementType].label}
          </span>
          <span className="truncate">{column.name}</span>
        </p>
        <span className="num shrink-0 text-[10px] text-faint">
          {obs?.derivedDuration != null ? `مدت: ${formatTimeValue(obs.derivedDuration, prefs)}` : '—'}
        </span>
      </div>

      {column.entryMode === 'INT' ? (
        // گروه بصری «از/تا» برای ورودی بازه‌ای — §۱۲.۲
        <div
          dir="ltr"
          className="grid grid-cols-[1fr_auto_1fr] items-end gap-1 rounded-lg border bg-background p-1 focus-within:border-brand focus-within:ring-1 focus-within:ring-brand"
        >
          <label className="flex min-w-0 flex-col items-center gap-0.5">
            <span className="text-[10px] font-bold leading-none text-muted-foreground" aria-hidden>
              از
            </span>
            <input
              value={start}
              onChange={(e) => setStart(e.target.value)}
              onBlur={commit}
              disabled={!editable}
              inputMode="decimal"
              aria-label={`شروع بازهٔ ${column.name}`}
              placeholder="شروع"
              dir="ltr"
              className="num w-full rounded-md bg-muted/50 px-2 py-1.5 text-center text-xs focus-visible:bg-brand-soft/40 focus-visible:outline-none"
            />
          </label>
          <span className="self-end pb-2.5 text-faint" aria-hidden>
            –
          </span>
          <label className="flex min-w-0 flex-col items-center gap-0.5">
            <span className="text-[10px] font-bold leading-none text-muted-foreground" aria-hidden>
              تا
            </span>
            <input
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              onBlur={commit}
              disabled={!editable}
              inputMode="decimal"
              aria-label={`پایان بازهٔ ${column.name}`}
              placeholder="پایان"
              dir="ltr"
              className="num w-full rounded-md bg-muted/50 px-2 py-1.5 text-center text-xs focus-visible:bg-brand-soft/40 focus-visible:outline-none"
            />
          </label>
        </div>
      ) : (
        <input
          value={seq}
          onChange={(e) => setSeq(e.target.value)}
          onBlur={commit}
          disabled={!editable}
          inputMode="decimal"
          aria-label={`${column.name} — ${method === 'CONTINUOUS' ? 'قرائت تجمعی' : 'مدت'}`}
          placeholder={method === 'CONTINUOUS' ? 'قرائت تجمعی کرنومتر' : 'مدت (ثانیه)'}
          className="num w-full rounded-lg border bg-background px-2 py-1.5 text-center text-xs focus-visible:outline-2 focus-visible:outline-ring"
        />
      )}

      {error && (
        <p className="flex items-center gap-1 text-[10px] text-red">
          <XCircle className="size-3" aria-hidden /> {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {excluded && (
          <button type="button" onClick={onSetValidity} className="text-[10px] font-bold text-green">
            خارج‌شده از محاسبات — بازگشت به محاسبات
          </button>
        )}
        {obs?.validityStatus === 'SUSPECT' && (
          // دکمهٔ تشخیص مشاهدهٔ مشکوک — §۱۲.۳
          <button
            type="button"
            onClick={onDiagnose}
            className="flex items-center gap-1 text-[10px] font-bold text-amber"
          >
            <AlertTriangle className="size-3" aria-hidden />
            مشاهدهٔ مشکوک — نمایش تشخیص
          </button>
        )}
      </div>
    </div>
  )
}
