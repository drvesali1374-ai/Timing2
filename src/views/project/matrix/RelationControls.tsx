'use client'

// ═══════════════════════════════════════════════════════════
// کنترل‌های مشترک مدیریت رابطهٔ موازی — v1.5.0 §۶
// افزودن/آرشیو/بازگردانی رابطه از «یک» کامپوننت مشترک؛
// هم برگهٔ زمان‌سنجی (دکمهٔ «+ موازی» و زیرردیف‌ها) و هم فرم
// ویرایش عنصر کاری از همین‌جا استفاده می‌کنند — منطق ایجاد
// رابطه در دو محل جداگانه کپی نمی‌شود.
// ═══════════════════════════════════════════════════════════
import { useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ArchiveRestore, Check, ChevronsUpDown, Factory, Network, Plus, Trash2 } from 'lucide-react'
import { overlapApi } from '@/lib/api/endpoints'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { cn } from '@/lib/utils'

/** گزینهٔ عنصر برای انتخاب رابطه */
export interface RelationCandidate {
  elementId: string
  name: string
  activityName: string
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
  /** فقط عناصر مجاز: همان Activity، بدون خود عنصر و بدون رابطهٔ فعال تکراری (§۴.۳) */
  candidates,
  onAdded,
  trigger,
}: {
  projectId: string
  elementId: string
  elementName: string
  candidates: RelationCandidate[]
  onAdded?: () => void
  trigger?: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const invalidate = useRelationInvalidation(projectId)

  const groups = useMemo(() => {
    const byStation = new Map<string, Map<string, RelationCandidate[]>>()
    for (const e of candidates) {
      if (e.elementId === elementId) continue
      const acts = byStation.get(e.stationName) ?? new Map()
      const list = acts.get(e.activityName) ?? []
      list.push(e)
      acts.set(e.activityName, list)
      byStation.set(e.stationName, acts)
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
        description: 'زیرردیف مربوطه در برگهٔ زمان‌سنجی، فرم هر دو عنصر و ماتریس نمایش داده می‌شود.',
      })
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'ایجاد رابطه ناموفق بود'),
  })

  const selectedName = candidates.find((c) => c.elementId === selected)?.name ?? '؟'
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
              title="افزودن رابطهٔ موازی — فقط عناصر همین فعالیت"
            >
              <Plus className="size-3.5" aria-hidden />
              موازی
            </Button>
          )}
        </PopoverTrigger>
        <PopoverContent className="w-[20rem] p-0" dir="rtl" align="start">
          <Command>
            <CommandInput placeholder="نام عنصر کاری…" />
            <CommandList>
              <CommandEmpty>
                {candidateCount === 0
                  ? 'عنصر دیگری در همین فعالیت برای رابطه وجود ندارد.'
                  : 'عنصری یافت نشد.'}
              </CommandEmpty>
              {[...groups.entries()].map(([stationName, acts]) =>
                [...acts.entries()].map(([activityName, elements]) => (
                  <CommandGroup
                    key={`${stationName}|${activityName}`}
                    heading={
                      <span className="flex items-center gap-1 text-[11px]">
                        <Factory className="size-3" aria-hidden /> {stationName}
                        <span className="text-muted-foreground">— {activityName}</span>
                      </span>
                    }
                  >
                    {elements.map((e) => (
                      <CommandItem
                        key={e.elementId}
                        value={`${e.name} ${activityName} ${stationName}`}
                        onSelect={() => {
                          setSelected(e.elementId)
                          setOpen(false)
                          setConfirming(true)
                        }}
                      >
                        <Check className={cn('size-4', selected === e.elementId ? 'opacity-100' : 'opacity-0')} aria-hidden />
                        {e.name}
                      </CommandItem>
                    ))}
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
              با افزودن رابطهٔ «{elementName}» و «{selectedName}»، زیرردیف هم‌پوشانی در برگهٔ زمان‌سنجی (برای همهٔ
              اپراتورهای این فعالیت)، فرم هر دو عنصر و ماتریس مرکزی نمایش داده می‌شود. ادامه می‌دهید؟
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

// ── بازگردانی رابطهٔ آرشیوشده — در صورت معتبر بودن (§۴.۱/§۴.۳) ──

export function RestoreRelationControl({
  projectId,
  relationId,
  label,
  /** رابطهٔ بین‌فعالیت تا هم‌فعالیت‌شدن عناصر قابل بازگردانی نیست (§۴.۳) */
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
  if (crossActivity) {
    return (
      <span className="text-[10px] leading-4 text-muted-foreground" title="رابطهٔ بین‌فعالیت تا زمانی که هر دو عنصر در یک فعالیت نباشند قابل بازگردانی نیست.">
        بین‌فعالیت — بازگردانی ممنوع
      </span>
    )
  }
  return (
    <Button type="button" size="sm" variant="ghost" className="text-green" onClick={() => restore.mutate()} disabled={restore.isPending}>
      <ArchiveRestore className="size-3.5" aria-hidden />
      {restore.isPending ? 'در حال بازگردانی…' : 'بازگردانی'}
    </Button>
  )
}
