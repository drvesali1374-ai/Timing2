'use client'

// ═══════════════════════════════════════════════════════════
// پنل برگهٔ زمان‌سنجی — ارکستراتور فاز ۳ — FR-06…FR-12
// نوار ابزار (Undo/Redo، افزودن چرخه، Paste، بستن جلسه،
// نشانگر ذخیره)، پیشرفت نمونه، دیالوگ وضعیت مشاهده و
// اتصال جدول دسکتاپ/کارت موبایل به API.
// ═══════════════════════════════════════════════════════════
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  ArrowRight,
  ClipboardPaste,
  Lock,
  LockOpen,
  Plus,
  Redo2,
  Target,
  Undo2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Input } from '@/components/ui/input'
import { HelpDot } from '@/components/common/HelpDot'
import { SaveIndicator } from '@/components/common/SaveIndicator'
import { timingApi, type CycleRowDto, type ObservationCellDto, type RemovedCycleDataDto, type SessionSheetDto } from '@/lib/api/endpoints'
import { qk } from '@/lib/api/keys'
import type { DisplayPrefs as Prefs } from '@/lib/format'
import { formatInt, formatTimeValue } from '@/lib/format'
import { useIsMobile } from '@/hooks/use-mobile'
import { TIMING_METHOD_LABELS } from '@/domain/types'
import { buildColumns, captureBefore, findObservation, type CellPayload, type ElementColumn } from './shared'
import { useCellSaver } from './useCellSaver'
import { useSheetHistory } from './useSheetHistory'
import { SheetGrid } from './SheetGrid'
import { MobileSheet } from './MobileSheet'
import { PasteDialog, type PasteAnchor } from './PasteDialog'
import { EXCLUSION_REASONS } from './shared'

export function SheetPanel({
  sessionId,
  prefs,
  onBack,
}: {
  sessionId: string
  prefs: Prefs
  onBack: () => void
}) {
  const qc = useQueryClient()
  const isMobile = useIsMobile()
  const [entryOverrides, setEntryOverrides] = useState<Record<string, 'SEQ' | 'INT'>>({})
  const [cellErrors, setCellErrors] = useState<Record<string, string>>({})
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteAnchor, setPasteAnchor] = useState<PasteAnchor>({ cycleNo: 1, colIndex: 0 })
  const [pasteText, setPasteText] = useState<string | undefined>(undefined)
  const [validityTarget, setValidityTarget] = useState<{ cycle: CycleRowDto; obs: ObservationCellDto } | null>(null)
  const [closeConfirm, setCloseConfirm] = useState(false)
  const [actionBusy, setActionBusy] = useState(false)
  const lastSaveErrorRef = useRef<string | null>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: qk.sessionSheet(sessionId),
    queryFn: () => timingApi.sheet(sessionId),
  })
  const sheet = data?.sheet

  // ── به‌روزرسانی برگه از پاسخ‌های API ──
  const onSheet = useCallback(
    (s: SessionSheetDto) => {
      qc.setQueryData(qk.sessionSheet(sessionId), { sheet: s })
      void qc.invalidateQueries({ queryKey: qk.sessions(s.activity.id) })
      void qc.invalidateQueries({ queryKey: qk.projectSummary(s.activity.projectId) })
    },
    [qc, sessionId]
  )

  const saver = useCellSaver(onSheet)
  const history = useSheetHistory(saver.flush)

  // هشدار خطای ذخیره — یک‌بار برای هر پیام — ۷.۶
  useEffect(() => {
    if (saver.lastError && saver.lastError !== lastSaveErrorRef.current) {
      toast.error(saver.lastError, {
        action: { label: 'تلاش مجدد', onClick: () => saver.retry() },
      })
    }
    lastSaveErrorRef.current = saver.lastError
  }, [saver.lastError, saver.retry])

  // خروج از صفحه → flush — ۶.۶
  useEffect(() => {
    return () => {
      void saver.flush()
    }
  }, [saver])

  const columns: ElementColumn[] = useMemo(
    () => (sheet ? buildColumns(sheet, entryOverrides) : []),
    [sheet, entryOverrides]
  )

  const editable = sheet?.session.status === 'OPEN'

  // ── اعمال فوری سلول‌ها (Undo/Redo) ──
  const applyCells = useCallback(
    async (cycleId: string, cells: CellPayload[]) => {
      const res = await timingApi.updateCells(cycleId, cells)
      onSheet(res.sheet)
    },
    [onSheet]
  )

  // ── ثبت سلول با صف + تاریخچه — FR-07/FR-23 ──
  const commitCell = useCallback(
    (cycle: CycleRowDto, column: ElementColumn, payload: CellPayload) => {
      if (!sheet) return
      const before = captureBefore(findObservation(cycle, column.id), column.id)
      const after = payload
      const cycleId = cycle.id
      saver.schedule(cycleId, payload)
      setCellErrors((s) => {
        const next = { ...s }
        const rowIdx = sheet.cycles.findIndex((c) => c.id === cycleId)
        delete next[`${rowIdx}:${column.index}`]
        return next
      })
      history.push({
        label: `ویرایش «${column.name}» در چرخهٔ ${cycle.cycleNo}`,
        undo: () => applyCells(cycleId, [before]),
        redo: () => applyCells(cycleId, [after]),
      })
    },
    [sheet, saver, history, applyCells]
  )

  const onCellError = useCallback((key: string, message: string) => {
    setCellErrors((s) => ({ ...s, [key]: message }))
  }, [])

  // ── افزودن چرخه — FR-07 ──
  const addCycles = useCallback(
    async (count: number) => {
      if (!sheet) return
      setActionBusy(true)
      try {
        await saver.flush()
        const res = await timingApi.addCycles(sessionId, { count })
        onSheet(res.sheet)
        let currentIds: string[] = res.created.map((c) => c.id)
        let stash: RemovedCycleDataDto['cycle'][] = []
        history.push({
          label: `افزودن ${count} چرخه`,
          undo: async () => {
            const data: RemovedCycleDataDto['cycle'][] = []
            for (const id of currentIds) {
              const del = await timingApi.deleteCycle(id)
              onSheet(del.sheet)
              data.push(del.removed.cycle)
            }
            stash = data
          },
          redo: async () => {
            if (stash.length === 0) return
            const res2 = await timingApi.addCycles(sessionId, { withData: stash })
            onSheet(res2.sheet)
            currentIds = res2.created.map((c) => c.id)
            stash = []
          },
        })
        toast.success(`${formatInt(count, prefs)} چرخه اضافه شد`)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'افزودن چرخه ناموفق بود')
      } finally {
        setActionBusy(false)
      }
    },
    [sheet, sessionId, onSheet, saver, history, prefs]
  )

  // ── حذف چرخه (با Undo) — FR-07 ──
  const deleteCycle = useCallback(
    async (cycle: CycleRowDto) => {
      setActionBusy(true)
      try {
        await saver.flush()
        const res = await timingApi.deleteCycle(cycle.id)
        onSheet(res.sheet)
        let currentId = cycle.id
        const removedData = res.removed.cycle
        history.push({
          label: `حذف چرخهٔ ${cycle.cycleNo}`,
          undo: async () => {
            const res2 = await timingApi.addCycles(sessionId, { withData: [removedData] })
            onSheet(res2.sheet)
            currentId = res2.created[0]?.id ?? currentId
          },
          redo: async () => {
            const res3 = await timingApi.deleteCycle(currentId)
            onSheet(res3.sheet)
          },
        })
        toast.success(`چرخهٔ ${formatInt(cycle.cycleNo, prefs)} حذف شد — برای بازگردانی Ctrl+Z`)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'حذف چرخه ناموفق بود')
      } finally {
        setActionBusy(false)
      }
    },
    [sessionId, onSheet, saver, history, prefs]
  )

  // ── Paste — FR-07 ──
  const doPaste = useCallback(
    async (data: string[][], mode: 'ALL_OR_NOTHING' | 'SKIP_INVALID') => {
      if (!sheet) return
      await saver.flush()
      // تصویر «قبل» برای Undo: چرخه‌های موجود در محدودهٔ هدف
      const startNo = pasteAnchor.cycleNo
      const endNo = startNo + data.length - 1
      const beforeCells: { cycleId: string; cells: CellPayload[] }[] = []
      const beforeIds = new Set(sheet.cycles.map((c) => c.id))
      for (const c of sheet.cycles) {
        if (c.cycleNo < startNo || c.cycleNo > endNo) continue
        const cells: CellPayload[] = []
        const rowLen = data[0]?.length ?? 0
        for (let ci = 0; ci < rowLen; ci++) {
          const col = columns[pasteAnchor.colIndex + ci]
          if (!col) continue
          const obs = findObservation(c, col.id)
          cells.push(
            obs
              ? captureBefore(obs, col.id)
              : { workElementId: col.id, rawDuration: null, cumulativeReading: null, startOffset: null, endOffset: null }
          )
        }
        if (cells.length > 0) beforeCells.push({ cycleId: c.id, cells })
      }

      const res = await timingApi.pasteCommit(sessionId, {
        startCycleNo: pasteAnchor.cycleNo,
        startColIndex: pasteAnchor.colIndex,
        data,
        mode,
      })
      onSheet(res.sheet)
      const createdIds = res.sheet.cycles.filter((c) => !beforeIds.has(c.id)).map((c) => c.id)

      let currentCreatedIds = createdIds
      history.push({
        label: 'Paste چندسلولی',
        undo: async () => {
          for (const b of beforeCells) {
            await applyCells(b.cycleId, b.cells)
          }
          for (const id of [...currentCreatedIds].reverse()) {
            const del = await timingApi.deleteCycle(id)
            onSheet(del.sheet)
          }
        },
        redo: async () => {
          const res2 = await timingApi.pasteCommit(sessionId, {
            startCycleNo: pasteAnchor.cycleNo,
            startColIndex: pasteAnchor.colIndex,
            data,
            mode,
          })
          onSheet(res2.sheet)
          currentCreatedIds = res2.sheet.cycles.filter((c) => !beforeIds.has(c.id)).map((c) => c.id)
        },
      })
      toast.success(
        `${formatInt(res.committed, prefs)} سلول ثبت شد${res.skipped > 0 ? `؛ ${formatInt(res.skipped, prefs)} سلول رد شد` : ''}${res.createdCycles > 0 ? `؛ ${formatInt(res.createdCycles, prefs)} چرخهٔ جدید` : ''}`
      )
      for (const w of res.warnings) toast.warning(w)
    },
    [sheet, saver, pasteAnchor, columns, sessionId, onSheet, history, applyCells, prefs]
  )

  // ── وضعیت مشاهده — FR-11 ──
  const setValidity = useCallback(
    async (obs: ObservationCellDto, status: 'VALID' | 'EXCLUDED', reason: string | null) => {
      const before = { status: obs.validityStatus, reason: obs.exclusionReason }
      const res = await timingApi.setValidity(obs.id, { validityStatus: status, exclusionReason: reason })
      onSheet(res.sheet)
      const obsId = obs.id
      history.push({
        label: status === 'EXCLUDED' ? 'خروج مشاهده از محاسبه' : 'بازگشت مشاهده به محاسبات',
        undo: async () => {
          const r = await timingApi.setValidity(obsId, {
            validityStatus: before.status === 'EXCLUDED' ? 'EXCLUDED' : 'VALID',
            exclusionReason: before.reason,
          })
          onSheet(r.sheet)
        },
        redo: async () => {
          const r = await timingApi.setValidity(obsId, { validityStatus: status, exclusionReason: reason })
          onSheet(r.sheet)
        },
      })
      toast.success(status === 'EXCLUDED' ? 'مشاهده از محاسبات خارج شد (دادهٔ خام محفوظ است)' : 'مشاهده به محاسبات بازگشت')
    },
    [onSheet, history]
  )

  // ── یادداشت چرخه ──
  const updateNotes = useCallback(
    async (cycle: CycleRowDto, notes: string) => {
      const before = cycle.notes ?? null
      const res = await timingApi.updateCycleNotes(cycle.id, { notes })
      onSheet(res.sheet)
      const cycleId = cycle.id
      history.push({
        label: `یادداشت چرخهٔ ${cycle.cycleNo}`,
        undo: async () => {
          const r = await timingApi.updateCycleNotes(cycleId, { notes: before })
          onSheet(r.sheet)
        },
        redo: async () => {
          const r = await timingApi.updateCycleNotes(cycleId, { notes })
          onSheet(r.sheet)
        },
      })
    },
    [onSheet, history]
  )

  // ── بستن/بازگشایی جلسه — FR-06 ──
  const setSessionStatus = useCallback(
    async (status: 'OPEN' | 'CLOSED') => {
      try {
        const res = await timingApi.updateSession(sessionId, { status })
        onSheet(res.sheet)
        toast.success(status === 'CLOSED' ? 'جلسه بسته شد؛ برگه فقط‌خواندنی است' : 'جلسه بازگشایی شد')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'تغییر وضعیت جلسه ناموفق بود')
      }
    },
    [sessionId, onSheet]
  )

  const openPaste = (anchor: PasteAnchor, text?: string) => {
    if (!editable) {
      toast.error('جلسه بسته است؛ برای ثبت داده، جلسهٔ جدید ایجاد کنید')
      return
    }
    setPasteAnchor(anchor)
    setPasteText(text)
    setPasteOpen(true)
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="h-12 animate-pulse rounded-xl bg-muted" />
        <div className="h-64 animate-pulse rounded-2xl bg-muted" />
      </div>
    )
  }
  if (error || !sheet) {
    return (
      <div className="card-premium p-8 text-center text-sm text-muted-foreground">
        بارگذاری برگه ناموفق بود: {error instanceof Error ? error.message : 'خطای نامشخص'}
        <Button variant="outline" className="mt-3 block" onClick={onBack}>
          بازگشت به جلسات
        </Button>
      </div>
    )
  }

  const target = sheet.stats.targetSampleCount
  const validCount = sheet.stats.activityValidCycles
  const progressPct = target ? Math.min((validCount / target) * 100, 100) : 0
  const belowTarget = target !== null && validCount < target

  // راهنمای برگه — نزدیک عنوان برگه — §۱۲.۲
  const sheetHelp = {
    what: 'جدول چرخه‌محور زمان‌سنجی: هر ردیف یک چرخهٔ کامل فعالیت و هر ستون یک عنصر کاری.',
    input:
      sheet.session.timingMethod === 'CONTINUOUS'
        ? 'در روش پیوسته، قرائت تجمعی کرنومتر را در پایان هر عنصر وارد کنید؛ مدت هر عنصر به‌صورت خودکار از تفاضل قرائت‌ها محاسبه و زیر سلول نمایش داده می‌شود. قرائت‌ها باید نزولی نباشند.'
        : 'در روش برگشت به صفر، مدت سپری‌شدهٔ هر عنصر را مستقیم وارد کنید. برای عناصر هم‌زمان، مقدار را به‌صورت «از تا» (مثل ۳ تا ۹) نسبت به مبدأ چرخه وارد کنید.',
    example:
      'ورودی «۱۲٫۵» یا «12.5» — بازهٔ «۳ تا ۹» یا «3-9» — حرکت با Tab/Enter و جهت‌نما؛ کپی محدوده با Shift+جهت‌نما و Ctrl+C.',
    note: 'زمان سپری‌شدهٔ چرخه در کارهای هم‌زمان، گستره (دیرترین پایان − زودترین شروع) است نه جمع مدت‌ها. دادهٔ خام هرگز حذف نمی‌شود؛ خروج از محاسبه فقط وضعیت را عوض می‌کند.',
  }

  return (
    <div className="animate-view-in space-y-4">
      {/* سربرگ لاغر برگه + نوار ابزار — §۱۲.۱: عنوان فعالیت/ایستگاه و اپراتور
          فقط در زیرهدر چسبان بالای صفحه نمایش داده می‌شوند */}
      <div className="card-premium overflow-hidden">
        <div className="card-head flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-3 py-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={onBack} className="shrink-0 gap-1.5">
              <ArrowRight className="size-4" aria-hidden />
              بازگشت به جلسات
            </Button>
            <h2 className="flex shrink-0 items-center gap-1 text-sm font-extrabold">
              برگهٔ زمان‌سنجی
              <HelpDot label="برگهٔ زمان‌سنجی" content={sheetHelp} />
            </h2>
            <Badge variant="outline" className="num shrink-0">
              {TIMING_METHOD_LABELS[sheet.session.timingMethod]}
            </Badge>
            {sheet.session.status === 'CLOSED' && (
              <Badge className="shrink-0 gap-1 bg-muted text-faint">
                <Lock className="size-3" aria-hidden /> بسته
              </Badge>
            )}
            <span className="num shrink-0 text-[11px] text-muted-foreground">
              {formatInt(sheet.stats.sessionCycles, prefs)} چرخه در این جلسه
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <SaveIndicator status={saver.status} onRetry={saver.retry} />
            {editable ? (
              <Button variant="outline" size="sm" onClick={() => setCloseConfirm(true)} className="gap-1.5">
                <Lock className="size-4" aria-hidden />
                بستن جلسه
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={() => void setSessionStatus('OPEN')} className="gap-1.5">
                <LockOpen className="size-4" aria-hidden />
                بازگشایی
              </Button>
            )}
          </div>
        </div>

        {/* نوار ابزار برگه — FR-07 / ۷.۴ */}
        <div className="flex flex-wrap items-center gap-2 p-2.5">
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              onClick={() => void history.undo()}
              disabled={!history.canUndo || actionBusy}
              aria-label="واگردانی (Ctrl+Z)"
              title={history.undoLabel ?? 'واگردانی'}
            >
              <Undo2 className="size-4" aria-hidden />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => void history.redo()}
              disabled={!history.canRedo || actionBusy}
              aria-label="ازنو (Ctrl+Y)"
              title={history.redoLabel ?? 'ازنو'}
            >
              <Redo2 className="size-4" aria-hidden />
            </Button>
          </div>

          {editable && (
            <>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" disabled={actionBusy} className="gap-1.5">
                    <Plus className="size-4" aria-hidden />
                    افزودن چرخه
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {[1, 5, 10, 20].map((n) => (
                    <DropdownMenuItem key={n} onClick={() => void addCycles(n)} className="num">
                      {formatInt(n, prefs)} چرخه
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => openPaste({ cycleNo: sheet.cycles[0]?.cycleNo ?? 1, colIndex: 0 })}
              >
                <ClipboardPaste className="size-4" aria-hidden />
                Paste از Excel
              </Button>
            </>
          )}

          <div className="ms-auto flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="hidden sm:inline">Tab/Enter حرکت • F2 یا دابل‌کلیک ویرایش • Ctrl+Z واگردانی</span>
          </div>
        </div>
      </div>

      {/* پیشرفت نمونه — FR-12 */}
      <div className="card-premium space-y-2 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-xs font-bold">
            <Target className="size-4 text-brand" aria-hidden />
            پیشرفت تعداد نمونهٔ فعالیت
            <HelpDot
              label="تعداد نمونه"
              content={{
                what: 'تعداد چرخه‌های معتبر ثبت‌شده در برابر هدف تعیین‌شده برای کل فعالیت (نه هر اپراتور).',
                input: 'هدف را در مشخصات فعالیت (ساختار تولید) تعیین کنید. شمارش بر اساس چرخه‌های کامل بدون مشاهدهٔ خارج‌شده است.',
                example: 'هدف ۱۰ چرخه؛ اگر ۷ چرخهٔ معتبر ثبت شده باشد، هشدار کمبود نمونه نمایش داده می‌شود.',
                note: 'رسیدن به تعداد هدف فقط به معنای «رسیدن به تعداد ثبت‌شده» است و کفایت آماری تضمین‌شده تلقی نمی‌شود؛ شاخص‌های پراکندگی در فاز تحلیل نمایش داده می‌شوند.',
              }}
            />
          </p>
          <p className="num text-xs">
            {formatInt(validCount, prefs)}
            {target !== null ? ` / ${formatInt(target, prefs)}` : ' (بدون هدف)'}
            <span className="ms-2 text-muted-foreground">— این جلسه: {formatInt(sheet.stats.sessionValidCycles, prefs)} معتبر</span>
          </p>
        </div>
        {target !== null && (
          <>
            <Progress value={progressPct} aria-label="پیشرفت تعداد نمونه" />
            {belowTarget && (
              <p className="rounded-lg bg-amber-soft px-2.5 py-1.5 text-[11px] font-bold leading-5 text-amber">
                هنوز به تعداد نمونهٔ هدف نرسیده‌اید ({formatInt(target - validCount, prefs)} چرخه باقی مانده). رسیدن به
                هدف، کفایت آماری را به‌تنهایی تضمین نمی‌کند.
              </p>
            )}
          </>
        )}
      </div>

      {/* برگه — دسکتاپ/موبایل — FR-07 */}
      {isMobile ? (
        <MobileSheet
          sheet={sheet}
          columns={columns}
          prefs={prefs}
          editable={editable}
          commitCell={commitCell}
          onDeleteCycle={(c) => void deleteCycle(c)}
          onSetValidity={(c, obs) => setValidityTarget({ cycle: c, obs })}
          onUpdateNotes={(c, notes) => void updateNotes(c, notes)}
          onAddCycle={() => void addCycles(1)}
          adding={actionBusy}
        />
      ) : (
        <SheetGrid
          sheet={sheet}
          columns={columns}
          prefs={prefs}
          editable={editable}
          onToggleEntryMode={(elementId) =>
            setEntryOverrides((s) => ({
              ...s,
              [elementId]: (s[elementId] ?? (columns.find((c) => c.id === elementId)?.entryMode ?? 'SEQ')) === 'SEQ' ? 'INT' : 'SEQ',
            }))
          }
          commitCell={commitCell}
          onCellError={onCellError}
          onDeleteCycle={(c) => void deleteCycle(c)}
          onSetValidity={(c, obs) => setValidityTarget({ cycle: c, obs })}
          onUpdateNotes={(c, notes) => void updateNotes(c, notes)}
          onOpenPaste={(anchor, text) => openPaste(anchor, text)}
          history={history}
          cellErrors={cellErrors}
        />
      )}

      {sheet.session.notes && (
        <p className="rounded-xl bg-muted p-3 text-xs leading-6 text-muted-foreground">
          <b className="text-foreground">یادداشت جلسه: </b>
          {sheet.session.notes}
        </p>
      )}

      {/* دیالوگ Paste — FR-07 */}
      <PasteDialog
        open={pasteOpen}
        onOpenChange={(open) => {
          setPasteOpen(open)
          if (!open) setPasteText(undefined)
        }}
        sessionId={sessionId}
        anchor={pasteAnchor}
        elementNames={columns.map((c) => c.name)}
        prefs={prefs}
        initialText={pasteText}
        onCommit={(data, mode) => doPaste(data, mode)}
      />

      {/* دیالوگ وضعیت مشاهده — FR-11 */}
      <ValidityDialog
        target={validityTarget}
        prefs={prefs}
        onClose={() => setValidityTarget(null)}
        onConfirm={(status, reason) => {
          if (validityTarget) void setValidity(validityTarget.obs, status, reason)
          setValidityTarget(null)
        }}
      />

      {/* تأیید بستن جلسه — FR-06 */}
      <AlertDialog open={closeConfirm} onOpenChange={setCloseConfirm}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>بستن جلسهٔ زمان‌سنجی؟</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-right">
                <p>
                  پس از بستن، برگهٔ این جلسه <b>فقط‌خواندنی</b> می‌شود. برای ادامهٔ ثبت داده (یا تغییر روش اندازه‌گیری)
                  باید جلسهٔ جدیدی ایجاد کنید؛ جلسهٔ جدید مستقل است و مبنای قرائت پیوسته از نو آغاز می‌شود.
                </p>
                <p className="text-xs text-muted-foreground">
                  می‌توانید جلسه را بعداً بازگشایی کنید؛ روش اندازه‌گیری هرگز تغییر نمی‌کند.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                setCloseConfirm(false)
                void setSessionStatus('CLOSED')
              }}
            >
              بستن جلسه
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ═══════════════ دیالوگ وضعیت مشاهده — FR-11 ═══════════════

function ValidityDialog({
  target,
  prefs,
  onClose,
  onConfirm,
}: {
  target: { cycle: CycleRowDto; obs: ObservationCellDto } | null
  prefs: Prefs
  onClose: () => void
  onConfirm: (status: 'VALID' | 'EXCLUDED', reason: string | null) => void
}) {
  const [preset, setPreset] = useState('')
  const [custom, setCustom] = useState('')

  // بازنشانی با تغییر هدف — تنظیم حالت در رندر
  const [prevTarget, setPrevTarget] = useState(target)
  if (target !== prevTarget) {
    setPrevTarget(target)
    setPreset('')
    setCustom('')
  }

  if (!target) return null
  const isExcluded = target.obs.validityStatus === 'EXCLUDED'

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent dir="rtl" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isExcluded ? 'بازگشت مشاهده به محاسبات' : 'خروج مشاهده از محاسبات'}</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-1 text-right">
              <p>
                چرخهٔ <b className="num">{formatInt(target.cycle.cycleNo, prefs)}</b> — مقدار ثبت‌شده:{' '}
                <b className="num" dir="ltr">
                  {target.obs.startOffset != null
                    ? `${target.obs.startOffset}–${target.obs.endOffset ?? '؟'}`
                    : (target.obs.rawDuration ?? target.obs.cumulativeReading ?? '—')}
                </b>
              </p>
              <p className="text-xs text-muted-foreground">
                {isExcluded
                  ? 'این مشاهده دوباره در محاسبات وارد می‌شود.'
                  : 'دادهٔ خام هرگز حذف نمی‌شود؛ فقط از محاسبات خارج می‌شود و در گزارش‌ها با برچسب «خارج‌شده» می‌آید.'}
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>

        {!isExcluded && (
          <div className="space-y-2">
            <div className="flex items-center gap-1">
              <Label>دلیل خروج (توصیه می‌شود)</Label>
              <HelpDot
                label="دلیل خروج"
                content={{
                  what: 'مستندسازی چرایی خارج‌کردن مشاهده از محاسبات.',
                  input: 'یک دلیل استاندارد را انتخاب کنید یا دلیل دلخواه بنویسید.',
                  example: '«اپراتور کار را در میانهٔ چرخه متوقف کرد»',
                  note: 'هشدار آماری مساوی حذف نیست؛ تصمیم نهایی همیشه با شماست و مشاهده را می‌توانید برگردانید.',
                }}
              />
            </div>
            <RadioGroup value={preset} onValueChange={(v) => { setPreset(v); setCustom('') }} className="gap-1.5">
              {EXCLUSION_REASONS.map((r) => (
                <label key={r} className="flex cursor-pointer items-center gap-2 rounded-lg p-1.5 text-xs hover:bg-muted/50">
                  <RadioGroupItem value={r} />
                  {r}
                </label>
              ))}
            </RadioGroup>
            <Input
              value={custom}
              onChange={(e) => {
                setCustom(e.target.value)
                if (e.target.value) setPreset('')
              }}
              placeholder="یا دلیل دلخواه…"
              className="text-xs"
            />
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            انصراف
          </Button>
          <Button
            className={isExcluded ? 'btn-brand border-0' : 'border-0 bg-red text-white hover:bg-red/90'}
            onClick={() => {
              const finalReason = custom.trim() !== '' ? custom.trim() : preset || null
              onConfirm(isExcluded ? 'VALID' : 'EXCLUDED', isExcluded ? null : finalReason)
            }}
          >
            {isExcluded ? 'بازگشت به محاسبات' : 'خروج از محاسبه'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
