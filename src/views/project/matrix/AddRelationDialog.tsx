'use client'

// افزودن رابطهٔ موازی — انتخاب دو عنصر با جست‌وجو + نمایش فعالیت/ایستگاه — §۴.۳/§۱۱
import { useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { Check, ChevronsUpDown, User, Factory } from 'lucide-react'
import { overlapApi, type OverlapMatrixDto } from '@/lib/api/endpoints'

function ElementPicker({
  value,
  onChange,
  catalog,
  excludeId,
  label,
  /** v1.5.0 §۴.۳ — محدود کردن فهرست به عناصر همین فعالیت */
  restrictToActivityId,
}: {
  value: string | null
  onChange: (id: string | null) => void
  catalog: OverlapMatrixDto['elementsCatalog']
  excludeId: string | null
  label: string
  restrictToActivityId?: string | null
}) {
  const [open, setOpen] = useState(false)
  const selected = catalog.find((c) => c.elementId === value) ?? null
  // گروه‌بندی بر اساس ایستگاه → فعالیت برای تشخیص نام‌های مشابه (§۱۱)
  const groups = useMemo(() => {
    const byStation = new Map<string, Map<string, typeof catalog>>()
    for (const e of catalog) {
      if (excludeId && e.elementId === excludeId) continue
      if (restrictToActivityId && e.activityId !== restrictToActivityId) continue
      const acts = byStation.get(e.stationName) ?? new Map()
      const list = acts.get(e.activityName) ?? []
      list.push(e)
      acts.set(e.activityName, list)
      byStation.set(e.stationName, acts)
    }
    return byStation
  }, [catalog, excludeId, restrictToActivityId])

  return (
    <div className="space-y-1.5">
      <p className="text-sm font-bold">{label}</p>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between font-normal">
            {selected ? (
              <span className="flex min-w-0 flex-col items-start">
                <span className="truncate">{selected.name}</span>
                <span className="truncate text-[11px] text-muted-foreground">
                  {selected.activityName} / {selected.stationName}
                </span>
              </span>
            ) : (
              'جست‌وجوی عنصر کاری…'
            )}
            <ChevronsUpDown className="size-4 shrink-0 opacity-50" aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[22rem] p-0" dir="rtl" align="start">
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
                          onChange(e.elementId === value ? null : e.elementId)
                          setOpen(false)
                        }}
                      >
                        <Check className={cn('size-4', value === e.elementId ? 'opacity-100' : 'opacity-0')} aria-hidden />
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
    </div>
  )
}

export default function AddRelationDialog({
  projectId,
  open,
  onOpenChange,
  matrix,
  onAdded,
}: {
  projectId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  matrix: OverlapMatrixDto | null
  onAdded: (rel: { id: string; label: string }) => void
}) {
  const [aId, setAId] = useState<string | null>(null)
  const [bId, setBId] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const catalog = matrix?.elementsCatalog ?? []

  const create = useMutation({
    mutationFn: () => overlapApi.createRelation(projectId, { elementAId: aId!, elementBId: bId! }),
    onSuccess: (res) => {
      const a = catalog.find((c) => c.elementId === aId)?.name ?? '؟'
      const b = catalog.find((c) => c.elementId === bId)?.name ?? '؟'
      onAdded({ id: res.relation.id, label: `${a} ↔ ${b}` })
      setAId(null)
      setBId(null)
      setConfirming(false)
      onOpenChange(false)
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'ایجاد رابطه ناموفق بود'),
  })

  const nameOf = (id: string | null) => catalog.find((c) => c.elementId === id)?.name ?? '؟'
  // v1.5.0 §۴.۳ — عنصر دوم فقط از همان فعالیت عنصر اول selectable است
  const aActivityId = aId ? catalog.find((c) => c.elementId === aId)?.activityId ?? null : null
  const canSubmit = aId && bId && aId !== bId

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) { setAId(null); setBId(null); setConfirming(false) } }}>
        <DialogContent dir="rtl" className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <User className="size-5 text-brand" aria-hidden />
              افزودن رابطهٔ موازی
            </DialogTitle>
            <DialogDescription>
              دو عنصر کاری که هم‌زمان اجرا می‌شوند را انتخاب کنید. رابطه در ساختار پروژه پایدار است و با تغییر
              نام عنصر از بین نمی‌رود.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <ElementPicker value={aId} onChange={setAId} catalog={catalog} excludeId={bId} label="عنصر اول" />
            <ElementPicker
              value={bId}
              onChange={setBId}
              catalog={catalog}
              excludeId={aId}
              label={aId ? `عنصر دوم (فقط عناصر فعالیت «${catalog.find((c) => c.elementId === aId)?.activityName ?? '؟'}»)` : 'عنصر دوم'}
              restrictToActivityId={aActivityId}
            />
            <p className="text-[11px] leading-5 text-muted-foreground">
              رابطهٔ موازی فقط بین عناصر «یک فعالیت» ممکن است؛ زیرردیف‌های برگهٔ زمان‌سنجی باید قابل‌مقایسه باشند.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              انصراف
            </Button>
            <Button disabled={!canSubmit || create.isPending} onClick={() => setConfirming(true)}>
              ادامه
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* تأییدیه با نام دو عنصر و اثر عملیات — §۴.۴ */}
      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle>تأیید افزودن رابطهٔ موازی</DialogTitle>
            <DialogDescription className="leading-6">
              با افزودن رابطهٔ موازی «{nameOf(aId)}» و «{nameOf(bId)}»، زیرردیف این رابطه در برگهٔ زمان‌سنجی
              (برای همهٔ اپراتورهای همین فعالیت)، فرم هر دو عنصر و ماتریس مرکزی نمایش داده می‌شود. ادامه می‌دهید؟
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)}>
              انصراف
            </Button>
            <Button onClick={() => create.mutate()} disabled={create.isPending}>
              {create.isPending ? 'در حال افزودن…' : 'افزودن رابطه'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
