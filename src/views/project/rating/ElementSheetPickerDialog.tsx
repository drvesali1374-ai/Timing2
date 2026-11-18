'use client'

// ═══════════════════════════════════════════════════════════
// دیالوگ انتخاب برگهٔ زمان‌سنجی برای ارزیابی عنصر — v1.5.4 §۱
// فهرست برگه‌هایی که تا به حال برای این عنصر ثبت شده‌اند (توسط هر اپراتور؛
// حتی برگه‌های ناقص)، همراه با نام اپراتور، تاریخ دقیق، فعالیت و ایستگاه.
// با انتخاب هر برگه، همان فرم «ارزیابی عنصر» برگهٔ زمان‌سنجی برای اپراتورِ
// همان برگه باز می‌شود (عیناً همان فرم صفحهٔ زمان‌سنجی).
// ═══════════════════════════════════════════════════════════
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Info, Lock, Timer, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { EmptyState } from '@/components/common/Feedback'
import { ratingApi, type ElementTimingSheetItemDto } from '@/lib/api/endpoints'
import { qk } from '@/lib/api/keys'
import { TIMING_METHOD_LABELS, type TimingMethod } from '@/domain/types'
import { formatDateTime, formatInt, formatTimeValue } from '@/lib/format'
import { useDisplayPrefs } from '@/store/display-store'
import { useAppStore } from '@/store/app-store'
import { cn } from '@/lib/utils'
import type { RatingDialogElement, RatingDialogOperator } from './ElementRatingDialog'

export function ElementSheetPickerDialog({
  element,
  projectId,
  onClose,
  onPick,
}: {
  element: RatingDialogElement | null
  projectId: string
  onClose: () => void
  /** انتخاب برگه → باز شدن فرم ارزیابی برای اپراتور همان برگه */
  onPick: (operator: RatingDialogOperator) => void
}) {
  const prefs = useDisplayPrefs()
  const qc = useQueryClient()
  const navigate = useAppStore((s) => s.navigate)
  const open = element !== null

  // برگه‌های زمان‌سنجی ثبت‌شده برای این عنصر (هر اپراتور؛ حتی ناقص)
  const sheetsQ = useQuery({
    queryKey: element ? qk.elementTimingSheets(element.id) : qk.elementTimingSheets('none'),
    queryFn: () => ratingApi.timingSheets(element!.id),
    enabled: open,
  })

  // ارزیابی‌های اختصاصی اپراتورهای همین عنصر — برای نشان R هر ردیف
  const ratingsQ = useQuery({
    queryKey: element ? qk.elementRating(element.id) : qk.elementRating('none'),
    queryFn: () => ratingApi.elementRating(element!.id),
    enabled: open,
  })
  const ratingByOperator = new Map((ratingsQ.data?.operatorRatings ?? []).map((r) => [r.operatorId as string, r]))

  const data = sheetsQ.data
  const stationName = data?.stationName || element?.stationName || ''

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl" className="scroll-slim max-h-[88vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>انتخاب برگهٔ زمان‌سنجی — عنصر «{element?.name ?? ''}»</DialogTitle>
          <DialogDescription>
            برگه‌های زمان‌سنجی که برای این عنصر ثبت شده‌اند (هر اپراتور؛ حتی ناقص) در زیر فهرست شده‌اند. با انتخاب هر
            برگه، فرم «ارزیابی عنصر» برای اپراتور همان برگه باز می‌شود.
          </DialogDescription>
        </DialogHeader>

        {sheetsQ.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-xl" />
            ))}
          </div>
        ) : sheetsQ.error ? (
          <EmptyState
            className="py-6"
            title="بارگذاری برگه‌های زمان‌سنجی ناموفق بود"
            description={sheetsQ.error instanceof Error ? sheetsQ.error.message : 'خطای نامشخص'}
            action={
              <Button
                variant="outline"
                onClick={() => element && qc.invalidateQueries({ queryKey: qk.elementTimingSheets(element.id) })}
              >
                تلاش مجدد
              </Button>
            }
          />
        ) : data && data.sheets.length === 0 ? (
          <div className="flex items-start gap-2 rounded-xl bg-brand-soft p-3 text-xs leading-6 text-accent-foreground">
            <Info className="mt-1 size-4 shrink-0 text-brand" aria-hidden />
            <div className="flex flex-col items-start gap-2 text-start">
              <span>
                هنوز هیچ برگهٔ زمان‌سنجی برای این عنصر ثبت نشده است. ارزیابی وستینگهاوس مبنای ثبت زمان دارد؛ ابتدا از
                صفحهٔ زمان‌سنجی برای اپراتورها برگه ثبت کنید.
              </span>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => {
                  onClose()
                  navigate({ name: 'project', projectId, stage: 'timing' })
                }}
              >
                <Timer className="size-4" aria-hidden />
                رفتن به صفحهٔ زمان‌سنجی
              </Button>
            </div>
          </div>
        ) : data ? (
          <>
            <p className="text-xs text-muted-foreground">
              فعالیت: {data.activity.name} — ایستگاه: {stationName || '—'} — {formatInt(data.sheets.length, prefs)}{' '}
              برگهٔ ثبت‌شده (جدیدترین اول)
            </p>
            <div
              className="scroll-slim flex max-h-[52vh] flex-col gap-2 overflow-y-auto"
              aria-label="فهرست برگه‌های زمان‌سنجی این عنصر"
            >
              {data.sheets.map((sh) => (
                <SheetRow
                  key={sh.sessionId}
                  sheet={sh}
                  activityName={data.activity.name}
                  stationName={stationName}
                  ratedR={ratingByOperator.get(sh.operatorId)?.totalFactor ?? null}
                  prefs={prefs}
                  onPick={() => onPick({ id: sh.operatorId, displayName: sh.operatorName })}
                />
              ))}
            </div>
          </>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            انصراف
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** یک ردیف برگهٔ زمان‌سنجی — قابل کلیک و دسترس‌پذیر با صفحه‌کلید */
function SheetRow({
  sheet,
  activityName,
  stationName,
  ratedR,
  prefs,
  onPick,
}: {
  sheet: ElementTimingSheetItemDto
  activityName: string
  stationName: string
  ratedR: number | null
  prefs: ReturnType<typeof useDisplayPrefs>
  onPick: () => void
}) {
  const methodLabel = TIMING_METHOD_LABELS[sheet.timingMethod as TimingMethod] ?? sheet.timingMethod
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`ارزیابی عنصر برای برگهٔ ${sheet.operatorName} (${formatDateTime(sheet.startedAt, prefs)})`}
      onClick={onPick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onPick()
        }
      }}
      className="flex cursor-pointer items-center gap-2.5 rounded-xl border bg-card p-2.5 text-start transition-colors hover:border-line-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="flex items-center gap-1 truncate font-bold">
            <Users className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            {sheet.operatorName}
          </span>
          {sheet.operatorCode && (
            <span className="text-xs text-faint" dir="ltr">
              {sheet.operatorCode}
            </span>
          )}
          <Badge
            className={cn(
              'num shrink-0 text-[10px] font-bold',
              sheet.timingMethod === 'SNAPBACK' ? 'bg-cyan-soft text-cyan' : 'bg-brand-soft text-brand'
            )}
          >
            {methodLabel}
          </Badge>
          {sheet.status === 'OPEN' ? (
            <Badge variant="outline" className="gap-1 border-green/40 text-[10px] text-green">
              <CheckCircle2 className="size-3" aria-hidden /> باز
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-1 text-[10px] text-muted-foreground">
              <Lock className="size-3" aria-hidden /> بسته
            </Badge>
          )}
        </div>
        <p className="truncate text-xs text-muted-foreground">تاریخ ثبت: {formatDateTime(sheet.startedAt, prefs)}</p>
        <p className="truncate text-xs text-muted-foreground">
          فعالیت: {activityName} · ایستگاه: {stationName || '—'} · {formatInt(sheet.cyclesForElement, prefs)} چرخه برای
          این عنصر ({formatInt(sheet.validForElement, prefs)} معتبر)
        </p>
      </div>
      {ratedR !== null ? (
        <span
          className="num shrink-0 rounded-full border border-green/35 bg-green-soft px-1.5 text-[9.5px] font-extrabold text-green"
          dir="ltr"
          title="ارزیابی ثبت‌شدهٔ همین اپراتور برای این عنصر"
        >
          R = {formatTimeValue(ratedR, prefs, 2)}
        </span>
      ) : (
        <Badge variant="outline" className="shrink-0 text-[11px] text-faint">
          بدون ارزیابی
        </Badge>
      )}
    </div>
  )
}
