'use client'

// ═══════════════════════════════════════════════════════════
// دیالوگ جزئیات چرخه — v1.5.0 §۸.۱
// در جدول معکوس‌شده، عملیات چرخه در سربرگ ستون آن قرار دارد؛
// جزئیات کم‌استفاده (خط زمانی + وضعیت مشاهدات + یادداشت +
// حذف) از منوی سه‌نقطهٔ سربرگ در این دیالوگ باز می‌شود.
// ═══════════════════════════════════════════════════════════
import { useState } from 'react'
import { AlertTriangle, Check, Eraser, Trash2, XCircle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import type { CycleRowDto, ObservationCellDto, SessionSheetDto } from '@/lib/api/endpoints'
import type { DisplayPrefs as Prefs } from '@/lib/format'
import { formatTimeValue } from '@/lib/format'
import type { ElementColumn } from './shared'
import { CycleTimeline } from './CycleTimeline'

export function CycleDetailDialog({
  cycle,
  sheet,
  columns,
  prefs,
  editable,
  onClose,
  onDelete,
  onSetValidity,
  onDiagnose,
  onUpdateNotes,
}: {
  cycle: CycleRowDto | null
  sheet: SessionSheetDto
  columns: ElementColumn[]
  prefs: Prefs
  editable: boolean
  onClose: () => void
  onDelete: (cycle: CycleRowDto) => void
  onSetValidity: (cycle: CycleRowDto, obs: ObservationCellDto) => void
  onDiagnose: (obs: ObservationCellDto) => void
  onUpdateNotes: (cycle: CycleRowDto, notes: string) => void
}) {
  const [notes, setNotes] = useState(cycle?.notes ?? '')
  const [notesDirty, setNotesDirty] = useState(false)

  // همگام‌سازی با تغییر سرور (Undo/Redo) — تنظیم حالت در رندر
  const [prevServerNotes, setPrevServerNotes] = useState(cycle?.notes ?? '')
  if (cycle && (cycle.notes ?? '') !== prevServerNotes) {
    setPrevServerNotes(cycle.notes ?? '')
    if (!notesDirty) setNotes(cycle.notes ?? '')
  }
  if (!cycle) {
    // ریست هنگام بسته‌شدن
    if (notesDirty) setNotesDirty(false)
  }

  return (
    <Dialog open={!!cycle} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent dir="rtl" className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
        {cycle && (
          <>
            <DialogHeader>
              <DialogTitle className="num">جزئیات چرخهٔ {cycle.cycleNo.toLocaleString('fa-IR')}</DialogTitle>
              <DialogDescription>
                ثبت: {new Date(cycle.createdAt).toLocaleString('fa-IR')} — شناسه:{' '}
                <span dir="ltr" className="num font-mono">{cycle.id.slice(0, 8)}</span>
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
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
                          <td className="px-3 py-2 font-bold">{col.name}</td>
                          <td className="num px-3 py-2">{rawText}</td>
                          <td className="num px-3 py-2">{obs?.derivedDuration != null ? formatTimeValue(obs.derivedDuration, prefs) : '—'}</td>
                          <td className="px-3 py-2">
                            {obs?.validityStatus === 'EXCLUDED' ? (
                              <span className="flex items-center gap-1 text-faint">
                                <Eraser className="size-3.5" aria-hidden /> خارج‌شده
                                {obs.exclusionReason && <span className="text-[10px]">({obs.exclusionReason})</span>}
                              </span>
                            ) : obs?.validityStatus === 'SUSPECT' ? (
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
                                onClick={() => onSetValidity(cycle, obs)}
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

              {/* یادداشت چرخه — v1.5.2 §۶: راست‌چین کامل با فاصلهٔ مناسب */}
              <div className="space-y-1.5 text-right">
                <Label
                  htmlFor={`cycle-notes-${cycle.id}`}
                  className="text-[11px] font-bold text-muted-foreground"
                >
                  یادداشت چرخه (رویدادهای ویژه، وقفه‌ها و …)
                </Label>
                <textarea
                  id={`cycle-notes-${cycle.id}`}
                  dir="rtl"
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
                  placeholder="مثلاً: اپراتور در ثانیهٔ ۱۲ برای دریافت قطعه متوقف شد"
                />
              </div>

              {editable && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => onDelete(cycle)}
                    className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold text-red transition-colors hover:bg-red-soft"
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                    حذف چرخه…
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
