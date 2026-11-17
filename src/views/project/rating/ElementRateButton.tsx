'use client'

// ═══════════════════════════════════════════════════════════
// دکمهٔ کوچک ارزیابی وستینگهاوس در سربرگ ردیف عنصرِ جدول ثبت زمان — v1.5.3 §۱
// ارزیابی اختصاصی «همین اپراتور × همین عنصر» بدون ترک صفحهٔ زمان‌سنجی
// ═══════════════════════════════════════════════════════════
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Gauge } from 'lucide-react'
import { ratingApi } from '@/lib/api/endpoints'
import { qk } from '@/lib/api/keys'
import { formatTimeValue } from '@/lib/format'
import { useDisplayPrefs } from '@/store/display-store'
import { ElementRatingDialog } from './ElementRatingDialog'

export function ElementRateButton({
  projectId,
  elementId,
  elementName,
  activityName,
  stationName,
  operatorId,
  operatorName,
}: {
  projectId: string
  elementId: string
  elementName: string
  activityName: string
  stationName: string
  operatorId: string
  operatorName: string
}) {
  const prefs = useDisplayPrefs()
  const [open, setOpen] = useState(false)

  // وضعیت ارزیابی همین اپراتور برای همین عنصر (سبز + نشان R در صورت ثبت)
  const ratingQ = useQuery({
    queryKey: qk.operatorElementRating(elementId, operatorId),
    queryFn: () => ratingApi.elementRating(elementId, operatorId),
    staleTime: 10_000,
  })
  const r = ratingQ.data?.assessment ?? null

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={
          r
            ? `ویرایش ارزیابی وستینگهاوس عنصر «${elementName}» برای ${operatorName}`
            : `ثبت ارزیابی وستینگهاوس عنصر «${elementName}» برای ${operatorName}`
        }
        title={
          r
            ? `ویرایش ارزیابی وستینگهاوس — ${operatorName} / «${elementName}» — R = ${formatTimeValue(r.totalFactor, prefs, 2)}`
            : `ثبت ارزیابی وستینگهاوس (مهارت/تلاش/شرایط/یکنواختی) برای «${elementName}» — اپراتور ${operatorName}`
        }
        className={`flex size-5 shrink-0 items-center justify-center rounded-md transition-colors ${
          r ? 'bg-green-soft text-green hover:brightness-95' : 'text-muted-foreground hover:bg-brand-soft hover:text-brand'
        }`}
      >
        <Gauge className="size-3.5" aria-hidden />
      </button>
      {r && (
        <span
          className="num rounded-full border border-green/35 bg-green-soft px-1.5 text-[9.5px] font-extrabold text-green"
          dir="ltr"
          title={`ارزیابی ثبت‌شده: ${operatorName} — ${r.ratingTableName ?? '—'}`}
        >
          R = {formatTimeValue(r.totalFactor, prefs, 2)}
        </span>
      )}
      <ElementRatingDialog
        element={open ? { id: elementId, name: elementName, activityName, stationName } : null}
        operator={{ id: operatorId, displayName: operatorName }}
        projectId={projectId}
        onClose={() => setOpen(false)}
      />
    </>
  )
}
