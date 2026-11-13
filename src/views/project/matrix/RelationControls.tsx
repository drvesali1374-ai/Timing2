'use client'

// ═══════════════════════════════════════════════════════════
// کنترل‌های مشترک مدیریت رابطهٔ موازی — v1.5.0 §۶ / v1.5.1 §۲
// افزودن/آرشیو/بازگردانی رابطه از «یک» کامپوننت مشترک؛
// هم برگهٔ زمان‌سنجی (دکمهٔ «+ موازی» و زیرردیف‌ها) و هم فرم
// ویرایش عنصر کاری از همین‌جا استفاده می‌کنند — منطق ایجاد
// رابطه در دو محل جداگانه کپی نمی‌شود.
// v1.5.1 — نامزدها از «تمام Activityهای همان پروژه» انتخاب می‌شوند؛
// گروه‌بندی بر اساس شناسهٔ واقعی ایستگاه/فعالیت (Station ← Activity ← Element).
// ═══════════════════════════════════════════════════════════
import { useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ArchiveRestore, Check, Factory, Network, Plus, Trash2 } from 'lucide-react'
import { overlapApi } from '@/lib/api/endpoints'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { cn } from '@/lib/utils'

/** گزینهٔ عنصر برای انتخاب رابطه — v1.5.1: شناسه‌های واقعی برای هویت (نه نام‌ها) */
export interface RelationCandidate {
  elementId: string
  name: string
  activityId: string
  activityName: string
  stationId: string
  stationName: string
}

/** باطل‌سازی کش‌های مرتبط پس از تغییر رابطه — §۷ */
export function useRelationInvalidation(projectId: string) {
  const qc = useQueryClient()
  return () => {
    void qc.invalidateQueries({ queryKey: ['element-relations'] })
    void qc.invalidateQueries({ queryKey: ['overlap-matrix', projectId] })
    void qc.invalidateQueries({ queryKey: ['timing-sheet'] })
  }
}

// ── افزودن رابطهٔ موازی — انتخاب عنصر + تأیید (§۴.۴) ──

export function AddRelationControl({
  projectId,
  elementId,
  elementName,
  /** نامزدها: تمام عناصر همان پروژه، بدون خود عنصر و بدون رابطهٔ فعال تکراری (v1.5.1 §۲) */
  candidates,
  /** v1.5.1 §۲ — شناسهٔ فعالیت عنصر جاری؛ برای برچسب «بین‌فعالیت» روی نامزدهای سایر فعالیت‌ها */
  currentActivityId,
  onAdded,
  trigger,
}: {
  projectId: string
  elementId: string
  elementName: string
  candidates: RelationCandidate[]
  currentActivityId?: string | null
  onAdded?: () => void
  trigger?: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const invalidate = useRelationInvalidation(projectId)

  // گروه‌بندی سلسله‌مراتبی Station ← Activity ← Element بر اساس شناسه‌های واقعی (§۲ قاعدهٔ ۶)
  const groups = useMemo(() => {
    const byStation = new Map<string, { stationName: string; activities: Map<string, { activityName: string; elements: RelationCandidate[] }> }>()
    for (const e of candidates) {
      if (e.elementId === elementId) continue
      let st = byStation.get(e.stationId)
      if (!st) {
        st = { stationName: e.stationName, activities: new Map() }
        byStation.set(e.stationId, st)
      }
      let act = st.activities.get(e.activityId)
      if (!act) {
        act = { activityName: e.activityName, elements: [] }
        st.activities.set(e.activityId, act)
      }
      act.elements.push(e)
    }
    return byStation
  }, [candidates, elementId])

  const create = useMutation({
    mutationFn: () => overlapApi.createRelation(projectId, { elementAId: elementId, elementBId: selected! }),
    onSuccess: () => {
      invalidate()
      onAdded?.()
      setSelected(null)
      setConfirming(false)
      setOpen(false)
      toast.success('رابطهٔ موازی افزوده شد', {
        description: 'زیرردیف مربوطه در برگهٔ زمان‌سنجی (برای همهٔ اپراتورهای هر دو فعالیت درگیر)، فرم هر دو عنصر و ماتریس نمایش داده می‌شود.',
      })
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'ایجاد رابطه ناموفق بود'),
  })

  const selectedEntry = candidates.find((c) => c.elementId === selected)
  const selectedName = selectedEntry?.name ?? '؟'
  const isCrossActivity = selectedEntry != null && currentActivityId != null && selectedEntry.activityId !== currentActivityId
  const candidateCount = candidates.filter((c) => c.elementId !== elementId).length

  return (
    <>
      <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setSelected(null); setConfirming(false) } }}>
        <PopoverTrigger asChild>
          {trigger ?? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1"
              aria-label={`افزودن عنصر موازی برای ${elementName}`}
              title="افزودن رابطهٔ موازی — عناصر همهٔ فعالیت‌های پروژه"
            >
              <Plus className="size-3.5" aria-hidden />
              موازی
            </Button>
          )}
        </PopoverTrigger>
        <PopoverContent className="w-[20rem] p-0" dir="rtl" align="start">
          <Command>
            <CommandInput placeholder="نام عنصر، فعالیت یا ایستگاه…" />
            <CommandList>
              <CommandEmpty>
                {candidateCount === 0
                  ? 'عنصر دیگری در این پروژه برای رابطه وجود ندارد (یا همهٔ روابط ممکن تعریف شده‌اند).'
                  : 'عنصری یافت نشد.'}
              </CommandEmpty>
              {[...groups.entries()].map(([stationId, st]) =>
                [...st.activities.entries()].map(([activityId, act]) => (
                  <CommandGroup
                    key={`${stationId}|${activityId}`}
                    heading={
                      <span className="flex items-center gap-1 text-[11px]">
                        <Factory className="size-3" aria-hidden /> {st.stationName}
                        <span className="text-muted-foreground">— {act.activityName}</span>
                      </span>
                    }
                  >
                    {act.elements.map((e) => {
                      const cross = currentActivityId != null && e.activityId !== currentActivityId
                      return (
                        <CommandItem
                          key={e.elementId}
                          value={`${e.name} ${act.activityName} ${st.stationName}`}
                          onSelect={() => {
                            setSelected(e.elementId)
                            setOpen(false)
                            setConfirming(true)
                          }}
                        >
                          <Check className={cn('size-4 shrink-0', selected === e.elementId ? 'opacity-100' : 'opacity-0')} aria-hidden />
                          <span className="min-w-0 flex-1 truncate">{e.name}</span>
                          {cross && (
                            <span
                              className="shrink-0 rounded-md border border-amber/70 bg-amber-soft/40 px-1 py-px text-[9px] font-bold"
                              title="این عنصر در فعالیت دیگری از همین پروژه است — رابطهٔ بین‌فعالیت"
                            >
                              بین‌فعالیت
                            </span>
                          )}
                        </CommandItem>
                      )
                    })}
                  </CommandGroup>
                ))
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* تأیید اثرات — §۴.۴ */}
      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent dir="rtl" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-1.5">
              <Network className="size-4 text-brand" aria-hidden />
              افزودن رابطهٔ موازی
            </DialogTitle>
            <DialogDescription>
              با افزودن رابطهٔ «{elementName}» و «{selectedName}»
              {isCrossActivity
                ? ` (رابطهٔ بین‌فعالیت — «${selectedEntry?.activityName ?? '؟'}» / «${selectedEntry?.stationName ?? '؟'}»)`
                : ''}
              ، زیرردیف هم‌پوشانی در برگهٔ زمان‌سنجی (برای همهٔ اپراتورهای هر دو فعالیتِ درگیر)، فرم هر دو عنصر و ماتریس مرکزی
              نمایش داده می‌شود. ادامه می‌دهید؟
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              بازگشت
            </Button>
            <Button size="sm" onClick={() => create.mutate()} disabled={create.isPending}>
              {create.isPending ? 'در حال افزودن…' : 'افزودن'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ── آرشیو رابطه — با تأییدیه (§۶.۱) ──

export function ArchiveRelationControl({
  projectId,
  relationId,
  label,
  onDone,
  trigger,
}: {
  projectId: string
  relationId: string
  label: string
  onDone?: () => void
  trigger?: React.ReactNode
}) {
  const [confirming, setConfirming] = useState(false)
  const invalidate = useRelationInvalidation(projectId)
  const archive = useMutation({
    mutationFn: () => overlapApi.archiveRelation(relationId),
    onSuccess: () => {
      invalidate()
      onDone?.()
      setConfirming(false)
      toast.success('رابطه آرشیو شد', {
        description: 'مقادیر تاریخی آن حفظ می‌شود و از بخش «روابط آرشیوشده» قابل بازگردانی است.',
      })
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'آرشیو ناموفق بود'),
  })
  return (
    <>
      {trigger ? (
        <span onClick={() => setConfirming(true)} role="button" tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setConfirming(true) }}
          aria-label={`حذف رابطهٔ ${label}`}>
          {trigger}
        </span>
      ) : (
        <Button type="button" size="sm" variant="ghost" className="text-red" onClick={() => setConfirming(true)}>
          <Trash2 className="size-3.5" aria-hidden />
          حذف رابطه
        </Button>
      )}
      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent dir="rtl" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>حذف رابطهٔ موازی</DialogTitle>
            <DialogDescription>
              رابطهٔ {label} آرشیو می‌شود؛ زیرردیف آن در برگهٔ زمان‌سنجی (هر دو سمت و همهٔ اپراتورهای فعالیت) و
              ماتریس فعال خارج می‌شود. مقادیر تاریخی چرخه‌ها حذف نمی‌شوند و با بازگردانی رابطه برمی‌گردند. ادامه
              می‌دهید؟
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              انصراف
            </Button>
            <Button size="sm" variant="destructive" onClick={() => archive.mutate()} disabled={archive.isPending}>
              {archive.isPending ? 'در حال حذف…' : 'بله، حذف کن'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ── بازگردانی رابطهٔ آرشیوشده — در صورت معتبر بودن (§۴.۱) ──

export function RestoreRelationControl({
  projectId,
  relationId,
  label,
  /** v1.5.1 §۶ — فقط برچسب اطلاعاتی بین‌فعالیت؛ دیگر مانع بازگردانی نیست */
  crossActivity,
  onDone,
}: {
  projectId: string
  relationId: string
  label: string
  crossActivity?: boolean
  onDone?: () => void
}) {
  const invalidate = useRelationInvalidation(projectId)
  const restore = useMutation({
    mutationFn: () => overlapApi.restoreRelation(relationId),
    onSuccess: () => {
      invalidate()
      onDone?.()
      toast.success('رابطه بازگردانی شد', {
        description: 'زیرردیف‌ها و مقادیر تاریخی آن دوباره نمایش داده می‌شوند.',
      })
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'بازگردانی ناموفق بود'),
  })
  // v1.5.1 §۶ — Cross-Activity بودن دیگر Restore را غیرفعال نمی‌کند؛
  // فقط یک برچسب اطلاعاتی کنار دکمه نمایش داده می‌شود.
  return (
    <span className="flex items-center gap-1.5">
      {crossActivity && (
        <span
          className="rounded-md border border-amber/70 bg-amber-soft/40 px-1 py-px text-[9px] font-bold"
          title="رابطهٔ بین‌فعالیت — عناصر در دو فعالیتِ متفاوت همین پروژه هستند."
        >
          بین‌فعالیت
        </span>
      )}
      <Button type="button" size="sm" variant="ghost" className="text-green" onClick={() => restore.mutate()} disabled={restore.isPending}>
        <ArchiveRestore className="size-3.5" aria-hidden />
        {restore.isPending ? 'در حال بازگردانی…' : 'بازگردانی'}
      </Button>
    </span>
  )
}
