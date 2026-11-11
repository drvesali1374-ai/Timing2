'use client'

// ═══════════════════════════════════════════════════════════
// بخش «عناصر موازی و اطلاعات هم‌پوشانی» — مشترک بین فرم عنصر
// (StructureView/ActivityView) و پاپ‌اور سربرگ ستون برگهٔ زمان‌سنجی.
// منبع داده: سرویس مرکزی — همان رابطه در ماتریس و فرم عنصر مقابل
// بدون کپی نمایش داده می‌شود (§۴).
// ═══════════════════════════════════════════════════════════
import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Badge } from '@/components/ui/badge'
import { Network, Pencil, Plus, Trash2 } from 'lucide-react'
import { qk } from '@/lib/api/keys'
import { overlapApi, type OverlapStatusValue } from '@/lib/api/endpoints'
import { formatTimeValue } from '@/lib/format'
import { useDisplayPrefs } from '@/store/display-store'
import { useAppStore } from '@/store/app-store'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Check, ChevronsUpDown, Factory } from 'lucide-react'
import { cn } from '@/lib/utils'

const STATUS_LABEL: Record<OverlapStatusValue, string> = {
  UNREVIEWED: 'بررسی‌نشده',
  NO_OVERLAP: 'بدون هم‌پوشانی',
  OVERLAP: 'دارای هم‌پوشانی',
}

/** گزینهٔ چرخه — در زمینهٔ برگه به جلسهٔ باز محدود می‌شود */
export interface CycleContextOption {
  cycleId: string
  cycleNo: number
  label: string
}

export default function ParallelRelationsSection({
  projectId,
  elementId,
  elementName,
  /** در برگهٔ زمان‌سنجی: چرخه‌های همین جلسه؛ در فرم ساختار: تعریف نشده = همهٔ پروژه */
  cycleOptions,
  defaultCycleId,
  compact,
}: {
  projectId: string
  elementId: string
  elementName: string
  cycleOptions?: CycleContextOption[]
  defaultCycleId?: string | null
  compact?: boolean
}) {
  const prefs = useDisplayPrefs()
  const qc = useQueryClient()
  const openProject = useAppStore((s) => s.openProject)
  const [addOpen, setAddOpen] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)

  const rowsQ = useQuery({
    queryKey: qk.elementRelations(elementId),
    queryFn: () => overlapApi.elementRelations(elementId),
  })
  // کاتالوگ عناصر برای افزودن — از ماتریس بدون چرخه (سبک)
  const catalogQ = useQuery({
    queryKey: qk.overlapMatrix(projectId, null),
    queryFn: () => overlapApi.matrix(projectId, null),
  })

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['element-relations'] })
    void qc.invalidateQueries({ queryKey: ['overlap-matrix', projectId] })
    void qc.invalidateQueries({ queryKey: ['timing-sheet'] })
  }

  const rows = rowsQ.data?.rows.filter((r) => r.isActive) ?? []

  return (
    <div className={cn('space-y-3 rounded-xl border bg-surface-2/60 p-3', compact && 'p-2.5')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-bold">
          <Network className="size-4 text-brand" aria-hidden />
          عناصر موازی و اطلاعات هم‌پوشانی
        </p>
        <div className="flex gap-1.5">
          <Button size="sm" variant="outline" onClick={() => openProject(projectId, 'matrix')}>
            مشاهده در ماتریس
          </Button>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="size-3.5" aria-hidden />
            عنصر موازی
          </Button>
        </div>
      </div>

      {rowsQ.isLoading ? (
        <div className="h-16 animate-pulse rounded-lg bg-muted" aria-label="در حال بارگذاری روابط" />
      ) : rows.length === 0 ? (
        <p className="text-xs leading-5 text-muted-foreground">
          برای «{elementName}» رابطهٔ موازی ثبت نشده است. اگر عنصر دیگری هم‌زمان با آن اجرا می‌شود، آن را
          اضافه کنید تا در ماتریس هم‌پوشانی و مقدار هر چرخه قابل ثبت شود.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((r) => (
            <li key={r.relationId} className="rounded-lg bg-card p-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{r.otherElementName}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {r.otherActivityName} / {r.otherStationName}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {r.latest ? (
                    <>
                      <span className="flex items-center gap-1.5">
                        {r.latest.status === 'UNREVIEWED' ? (
                          <span className="rounded-md border border-dashed border-amber/70 bg-amber-soft/40 px-1.5 py-0.5 text-[10px]">
                            {STATUS_LABEL.UNREVIEWED}
                          </span>
                        ) : r.latest.status === 'NO_OVERLAP' ? (
                          <span className="rounded-md border border-green/40 bg-green-soft/50 px-1.5 py-0.5 text-[10px]">
                            {STATUS_LABEL.NO_OVERLAP}
                          </span>
                        ) : (
                          <span className="num text-xs font-bold" dir="ltr">
                            {formatTimeValue(r.latest.overlapDuration, prefs)} s
                          </span>
                        )}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        آخرین ثبت: چرخهٔ {r.latest.cycleNo.toLocaleString('fa-IR')} — {r.latest.operatorName} —{' '}
                        {r.latest.activityName}
                      </span>
                    </>
                  ) : (
                    <span className="text-[10px] text-muted-foreground">هنوز مقداری ثبت نشده است</span>
                  )}
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setEditing(editing === r.relationId ? null : r.relationId)}
                >
                  <Pencil className="size-3.5" aria-hidden />
                  ثبت مقدار
                </Button>
                <ArchiveRelationButton relationId={r.relationId} label={`${elementName} ↔ ${r.otherElementName}`} onDone={invalidate} />
              </div>
              {editing === r.relationId && (
                <QuickValueEditor
                  projectId={projectId}
                  relationId={r.relationId}
                  pairLabel={`${elementName} ↔ ${r.otherElementName}`}
                  cycleOptions={cycleOptions ?? defaultProjectCycles(catalogQ.data?.cycles ?? [])}
                  defaultCycleId={defaultCycleId ?? null}
                  onDone={() => {
                    setEditing(null)
                    invalidate()
                  }}
                />
              )}
            </li>
          ))}
        </ul>
      )}

      <AddRelationInline
        projectId={projectId}
        elementId={elementId}
        elementName={elementName}
        catalog={catalogQ.data?.elementsCatalog ?? []}
        open={addOpen}
        onOpenChange={setAddOpen}
        onAdded={() => {
          invalidate()
          toast.success('رابطهٔ موازی افزوده شد', {
            description: 'این رابطه در فرم هر دو عنصر و ماتریس مرکزی نمایش داده می‌شود.',
          })
        }}
      />
    </div>
  )
}

function defaultProjectCycles(cycles: Array<{ cycleId: string; cycleNo: number; operatorName: string; activityName: string }>): CycleContextOption[] {
  return cycles.map((c) => ({
    cycleId: c.cycleId,
    cycleNo: c.cycleNo,
    label: `چرخهٔ ${c.cycleNo} — ${c.operatorName} — ${c.activityName}`,
  }))
}

/** ویرایش سریع مقدار یک رابطه برای یک چرخه — با draft و تأیید اثرات (§۴.۴) */
function QuickValueEditor({
  projectId: _projectId,
  relationId,
  pairLabel,
  cycleOptions,
  defaultCycleId,
  onDone,
}: {
  projectId: string
  relationId: string
  pairLabel: string
  cycleOptions: CycleContextOption[]
  defaultCycleId: string | null
  onDone: () => void
}) {
  const [cycleId, setCycleId] = useState<string | null>(defaultCycleId ?? cycleOptions.at(-1)?.cycleId ?? null)
  const [status, setStatus] = useState<OverlapStatusValue>('UNREVIEWED')
  const [duration, setDuration] = useState<string>('')
  const [confirming, setConfirming] = useState(false)

  const save = useMutation({
    mutationFn: () =>
      overlapApi.setCycleOverlaps(cycleId!, {
        updates: [
          {
            relationId,
            status,
            overlapDuration: status === 'OVERLAP' ? Number(duration) : status === 'NO_OVERLAP' ? 0 : null,
          },
        ],
      }),
    onSuccess: (res) => {
      onDone()
      toast.success('مقدار هم‌پوشانی ثبت شد', {
        description: 'فرم عنصر مقابل و ماتریس مرکزی هم‌زمان به‌روز شدند.',
      })
      for (const w of res.warnings) toast.warning('هشدار — نتیجه موقتی است', { description: w })
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'ثبت ناموفق بود'),
  })

  if (cycleOptions.length === 0) {
    return <p className="mt-2 text-xs text-muted-foreground">چرخه‌ای برای ثبت وجود ندارد؛ ابتدا در زمان‌سنجی داده ثبت کنید.</p>
  }

  return (
    <div className="mt-2 space-y-2.5 rounded-lg border bg-surface-2/70 p-2.5">
      <div className="space-y-1">
        <Label className="text-xs">چرخه</Label>
        <Select value={cycleId ?? 'none'} onValueChange={(v) => setCycleId(v === 'none' ? null : v)}>
          <SelectTrigger size="sm" className="w-full" aria-label="انتخاب چرخه">
            <SelectValue placeholder="انتخاب چرخه" />
          </SelectTrigger>
          <SelectContent dir="rtl">
            <SelectItem value="none">— بدون انتخاب —</SelectItem>
            {cycleOptions.map((c) => (
              <SelectItem key={c.cycleId} value={c.cycleId} className="max-w-[20rem] truncate">
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <RadioGroup value={status} onValueChange={(v) => setStatus(v as OverlapStatusValue)} className="gap-1.5">
        <Label className="flex items-center gap-2 text-xs font-normal">
          <RadioGroupItem value="UNREVIEWED" /> بررسی‌نشده
        </Label>
        <Label className="flex items-center gap-2 text-xs font-normal">
          <RadioGroupItem value="NO_OVERLAP" /> بدون هم‌پوشانی (تأیید صفر)
        </Label>
        <Label className="flex items-center gap-2 text-xs font-normal">
          <RadioGroupItem value="OVERLAP" /> دارای هم‌پوشانی
        </Label>
      </RadioGroup>
      {status === 'OVERLAP' && (
        <div className="space-y-1">
          <Label className="text-xs">مدت (ثانیه)</Label>
          <Input dir="ltr" type="number" min="0.001" step="0.001" value={duration} onChange={(e) => setDuration(e.target.value)} />
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button size="sm" disabled={!cycleId || save.isPending || (status === 'OVERLAP' && (duration === '' || Number(duration) <= 0))} onClick={() => setConfirming(true)}>
          ثبت تغییر
        </Button>
      </div>

      {/* تأیید اثرات — نمونهٔ §۴.۴ */}
      {confirming && (
        <div className="rounded-lg border border-brand/30 bg-brand-soft/40 p-2.5 text-xs leading-5">
          <p>تغییر مدت هم‌پوشانی {pairLabel} بر هم‌پوشانی چندتایی، اعتبارسنجی و نتایج محاسباتی اثر می‌گذارد. ثبت شود؟</p>
          <div className="mt-2 flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              بازگشت
            </Button>
            <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? 'در حال ثبت…' : 'بله، ثبت کن'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function ArchiveRelationButton({ relationId, label, onDone }: { relationId: string; label: string; onDone: () => void }) {
  const [confirming, setConfirming] = useState(false)
  const archive = useMutation({
    mutationFn: () => overlapApi.archiveRelation(relationId),
    onSuccess: () => {
      onDone()
      toast.success('رابطه آرشیو شد', {
        description: 'اطلاعات تاریخی آن حفظ خواهد شد و از بخش «روابط آرشیوشده» ماتریس قابل بازگردانی است.',
      })
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'آرشیو ناموفق بود'),
  })
  return (
    <>
      <Button size="sm" variant="ghost" className="text-red" onClick={() => setConfirming(true)}>
        <Trash2 className="size-3.5" aria-hidden />
        حذف رابطه
      </Button>
      {confirming && (
        <div className="mt-2 rounded-lg border border-red/40 bg-red-soft/40 p-2.5 text-xs leading-5">
          <p>رابطهٔ {label} از فرم هر دو عنصر و ماتریس فعال خارج می‌شود؛ اطلاعات تاریخی آن حفظ خواهد شد. ادامه می‌دهید؟</p>
          <div className="mt-2 flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              انصراف
            </Button>
            <Button size="sm" variant="destructive" onClick={() => archive.mutate()} disabled={archive.isPending}>
              {archive.isPending ? 'در حال حذف…' : 'بله، حذف کن'}
            </Button>
          </div>
        </div>
      )}
    </>
  )
}

/** افزودن رابطهٔ موازی از فرم — خود عنصر جاری در فهرست نیست (§۴.۱) */
function AddRelationInline({
  projectId,
  elementId,
  elementName,
  catalog,
  open,
  onOpenChange,
  onAdded,
}: {
  projectId: string
  elementId: string
  elementName: string
  catalog: Array<{ elementId: string; name: string; activityName: string; stationName: string }>
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdded: () => void
}) {
  const [selected, setSelected] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const groups = useMemo(() => {
    const byStation = new Map<string, Map<string, typeof catalog>>()
    for (const e of catalog) {
      if (e.elementId === elementId) continue
      const acts = byStation.get(e.stationName) ?? new Map()
      const list = acts.get(e.activityName) ?? []
      list.push(e)
      acts.set(e.activityName, list)
      byStation.set(e.stationName, acts)
    }
    return byStation
  }, [catalog, elementId])

  const create = useMutation({
    mutationFn: () => overlapApi.createRelation(projectId, { elementAId: elementId, elementBId: selected! }),
    onSuccess: () => {
      onAdded()
      setSelected(null)
      setConfirming(false)
      onOpenChange(false)
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'ایجاد رابطه ناموفق بود'),
  })

  const selectedName = catalog.find((c) => c.elementId === selected)?.name ?? '؟'

  return (
    <>
      {open && (
        <div className="space-y-2 rounded-lg border bg-card p-2.5">
          <p className="text-xs">
            عنصر موازی «{elementName}» را انتخاب کنید:
          </p>
          <Popover open={open} onOpenChange={onOpenChange}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="w-full justify-between font-normal">
                {selected ? catalog.find((c) => c.elementId === selected)?.name : 'جست‌وجوی عنصر کاری…'}
                <ChevronsUpDown className="size-4 opacity-50" aria-hidden />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[20rem] p-0" dir="rtl" align="start">
              <Command>
                <CommandInput placeholder="نام عنصر، فعالیت یا ایستگاه…" />
                <CommandList>
                  <CommandEmpty>عنصری یافت نشد.</CommandEmpty>
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
                              onOpenChange(false)
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
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => { setSelected(null); onOpenChange(false) }}>
              انصراف
            </Button>
            <Button size="sm" disabled={!selected} onClick={() => setConfirming(true)}>
              ادامه
            </Button>
          </div>
        </div>
      )}
      {confirming && (
        <div className="rounded-lg border border-brand/30 bg-brand-soft/40 p-2.5 text-xs leading-5">
          <p>
            با افزودن رابطهٔ موازی «{elementName}» و «{selectedName}»، این رابطه در ماتریس مرکزی و فرم زمان‌سنجی
            هر دو عنصر نمایش داده می‌شود. ادامه می‌دهید؟
          </p>
          <div className="mt-2 flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              بازگشت
            </Button>
            <Button size="sm" onClick={() => create.mutate()} disabled={create.isPending}>
              {create.isPending ? 'در حال افزودن…' : 'افزودن'}
            </Button>
          </div>
        </div>
      )}
    </>
  )
}
