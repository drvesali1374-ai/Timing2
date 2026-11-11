'use client'

// انتخاب چرخه برای ماتریس — گروه‌بندی بر اساس جلسه (اپراتور × فعالیت × روش) — §۵
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CalendarClock } from 'lucide-react'
import type { OverlapMatrixDto } from '@/lib/api/endpoints'
import { formatDate } from '@/lib/format'

const METHOD_LABEL: Record<string, string> = {
  SNAPBACK: 'برگشت به صفر',
  CONTINUOUS: 'پیوسته',
}

export default function CycleSelector({
  matrix,
  isLoading,
  cycleId,
  onChange,
}: {
  matrix: OverlapMatrixDto | null
  isLoading: boolean
  cycleId: string | null
  onChange: (cycleId: string | null) => void
}) {
  if (isLoading) {
    return <div className="h-10 animate-pulse rounded-xl bg-muted" aria-label="در حال بارگذاری چرخه‌ها" />
  }
  if (!matrix || matrix.cycles.length === 0) {
    return (
      <p className="rounded-xl bg-amber-soft/60 p-3 text-sm">
        هنوز چرخه‌ای در این پروژه ثبت نشده است. برای ثبت مقادیر هم‌پوشانی، ابتدا در «زمان‌سنجی» داده ثبت کنید.
      </p>
    )
  }
  // گروه‌بندی جلسات مستقل — ادغام نمی‌شوند (§۵)
  const sessions = new Map<string, { label: string; cycles: OverlapMatrixDto['cycles'] }>()
  for (const c of matrix.cycles) {
    const label = `${c.activityName} — ${c.operatorName} (${METHOD_LABEL[c.timingMethod] ?? c.timingMethod})`
    const entry = sessions.get(c.sessionId) ?? { label, cycles: [] }
    entry.cycles.push(c)
    sessions.set(c.sessionId, entry)
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="flex items-center gap-1.5 text-sm font-bold">
        <CalendarClock className="size-4 text-brand" aria-hidden />
        چرخه:
      </span>
      <Select value={cycleId ?? 'none'} onValueChange={(v) => onChange(v === 'none' ? null : v)}>
        <SelectTrigger className="w-full max-w-md" aria-label="انتخاب چرخه">
          <SelectValue placeholder="یک چرخه انتخاب کنید" />
        </SelectTrigger>
        <SelectContent dir="rtl">
          <SelectItem value="none">— بدون انتخاب چرخه —</SelectItem>
          {[...sessions.entries()].map(([sessionId, { label, cycles }]) => (
            <SelectGroup key={sessionId}>
              <SelectLabel className="max-w-[22rem] truncate">{label}</SelectLabel>
              {cycles.map((c) => (
                <SelectItem key={c.cycleId} value={c.cycleId} className="max-w-[22rem]">
                  چرخهٔ {c.cycleNo.toLocaleString('fa-IR')} — {formatDate(c.createdAt.slice(0, 10), { calendar: 'jalali', digits: 'persian', decimals: 2 })}
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
