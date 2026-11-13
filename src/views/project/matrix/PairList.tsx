'use client'

// نمای موبایل — لیست زوج‌ها به‌جای جدول فشرده — فقط‌خواندنی — v1.5.0 §۱۱
// هیچ ورودی عددی یا دکمهٔ ثبت مقداری وجود ندارد؛ ثبت مقدار فقط
// در برگهٔ زمان‌سنجی (زیرردیف رابطه) انجام می‌شود.
import { useState } from 'react'
import { useDisplayPrefs } from '@/store/display-store'
import { formatTimeValue } from '@/lib/format'
import type { OverlapMatrixDto, OverlapStatusValue } from '@/lib/api/endpoints'

const STATUS_LABEL: Record<OverlapStatusValue, string> = {
  UNREVIEWED: 'بررسی‌نشده',
  NO_OVERLAP: 'بدون هم‌پوشانی',
  OVERLAP: 'دارای هم‌پوشانی',
}

export default function PairList({
  matrix,
  cycleSelected,
  onGoTiming,
}: {
  matrix: OverlapMatrixDto | null
  cycleSelected: boolean
  onGoTiming: () => void
}) {
  const prefs = useDisplayPrefs()
  const [expanded, setExpanded] = useState<string | null>(null)
  if (!matrix) return null
  const nameOf = (id: string) => matrix.members.find((m) => m.elementId === id)
  const activeRelations = matrix.relations.filter((r) => r.isActive)

  return (
    <ul className="space-y-2">
      {activeRelations.map((r) => {
        const a = nameOf(r.elementLowId)
        const b = nameOf(r.elementHighId)
        const cell = matrix.cells[r.id] ?? null
        const comparable = matrix.comparability[r.id]?.isComparable !== false
        const notComparableReason = matrix.comparability[r.id]?.notComparableReason ?? null
        const status = cell?.status ?? 'UNREVIEWED'
        const overlapDuration = cell?.overlapDuration ?? null
        const isOpen = expanded === r.id
        return (
          <li key={r.id} className="rounded-xl border bg-card p-3">
            <button
              type="button"
              className="flex w-full items-center justify-between gap-2 text-right"
              onClick={() => setExpanded(isOpen ? null : r.id)}
              aria-expanded={isOpen}
            >
              <span className="min-w-0 flex-1 space-y-0.5">
                <span className="block truncate text-sm font-bold">
                  {a?.name ?? '؟'} ↔ {b?.name ?? '؟'}
                </span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {a?.activityName ?? '؟'} / {a?.stationName ?? '؟'} — {b?.activityName ?? '؟'} / {b?.stationName ?? '؟'}
                </span>
              </span>
              <span className="shrink-0">
                {!cycleSelected ? (
                  <span className="text-[10px] text-muted-foreground">—</span>
                ) : status === 'UNREVIEWED' ? (
                  <span className="rounded-md border border-dashed border-amber/70 bg-amber-soft/40 px-2 py-1 text-[11px]">
                    {STATUS_LABEL.UNREVIEWED}
                  </span>
                ) : status === 'NO_OVERLAP' ? (
                  <span className="rounded-md border border-green/40 bg-green-soft/50 px-2 py-1 text-[11px]">
                    {STATUS_LABEL.NO_OVERLAP}
                  </span>
                ) : (
                  <span className="num rounded-md bg-brand-soft px-2 py-1 text-xs font-bold" dir="ltr">
                    {formatTimeValue(overlapDuration, prefs)} s
                  </span>
                )}
              </span>
            </button>
            {isOpen && (
              <div className="mt-3 space-y-2 border-t pt-3">
                {!cycleSelected ? (
                  <p className="text-xs text-muted-foreground">برای مشاهدهٔ مقدار، ابتدا یک چرخه انتخاب کنید.</p>
                ) : !comparable ? (
                  <p className="text-xs text-muted-foreground">
                    {notComparableReason ?? 'این زوج در این چرخه قابل‌مقایسه نیست.'}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    مقدار این چرخه:{' '}
                    {status === 'OVERLAP' ? `${formatTimeValue(overlapDuration, prefs)} ثانیه` : STATUS_LABEL[status]}
                  </p>
                )}
                <button
                  type="button"
                  onClick={onGoTiming}
                  className="text-xs font-bold text-brand underline underline-offset-2"
                >
                  ورود به برگهٔ زمان‌سنجی برای ثبت مقدار
                </button>
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
