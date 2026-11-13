'use client'

// جدول ماتریس دسکتاپ — فقط‌خواندنی — v1.5.0 §۱۱
// هدر sticky + ستون اول sticky + نمایش سه وضعیت سلول؛
// هیچ ورودی عددی یا دکمهٔ ثبت مقداری وجود ندارد — ثبت مقدار
// فقط در برگهٔ زمان‌سنجی (زیرردیف رابطه) انجام می‌شود.
import { cn } from '@/lib/utils'
import { useDisplayPrefs } from '@/store/display-store'
import { formatTimeValue } from '@/lib/format'
import type { OverlapMatrixDto, OverlapStatusValue } from '@/lib/api/endpoints'

const STATUS_LABEL: Record<OverlapStatusValue, string> = {
  UNREVIEWED: 'بررسی‌نشده',
  NO_OVERLAP: 'بدون هم‌پوشانی',
  OVERLAP: 'دارای هم‌پوشانی',
}

export default function MatrixTable({
  matrix,
  cycleSelected,
  onGoTiming,
}: {
  matrix: OverlapMatrixDto | null
  /** §۷ ممیزی جلسه ۲ — بدون چرخه، مقادیر نمایش داده نمی‌شوند */
  cycleSelected: boolean
  /** میانبر ورود به برگهٔ زمان‌سنجی برای ثبت مقدار (§۱۱) */
  onGoTiming: () => void
}) {
  const prefs = useDisplayPrefs()
  if (!matrix) return null
  const { members, relations, cells, comparability } = matrix
  const activeRelations = relations.filter((r) => r.isActive)
  const relByPair = new Map<string, string>()
  for (const r of activeRelations) relByPair.set(`${r.elementLowId}|${r.elementHighId}`, r.id)

  // زوج‌های دارای خطا (برای نشانگذاری سلول)
  const failedPairs = new Set<string>()
  if (matrix.validation) {
    for (const lf of matrix.validation.localFailures) {
      const key = lf.pair[0] < lf.pair[1] ? `${lf.pair[0]}|${lf.pair[1]}` : `${lf.pair[1]}|${lf.pair[0]}`
      failedPairs.add(key)
    }
    for (const ti of matrix.validation.tripleIssues) {
      const ids = ti.responsibleElementIds ?? []
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const key = ids[i] < ids[j] ? `${ids[i]}|${ids[j]}` : `${ids[j]}|${ids[i]}`
          failedPairs.add(key)
        }
      }
    }
    for (const ii of matrix.validation.intervalIssues ?? []) {
      if (ii.kind !== 'DEFINITE') continue
      const key = ii.pair[0] < ii.pair[1] ? `${ii.pair[0]}|${ii.pair[1]}` : `${ii.pair[1]}|${ii.pair[0]}`
      failedPairs.add(key)
    }
  }

  if (members.length === 0) return null

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-2xl border" dir="rtl">
        <table className="w-full border-collapse text-sm" style={{ minWidth: `${Math.max(members.length * 108 + 190, 420)}px` }}>
          <thead>
            <tr className="sticky top-0 z-20 bg-card">
              <th className="sticky right-0 z-30 min-w-[170px] border-b border-l bg-card p-2 text-center text-xs font-bold">
                عنصر کاری
              </th>
              {members.map((m) => (
                <th
                  key={m.elementId}
                  className="min-w-[104px] border-b p-2 text-center text-xs font-bold"
                  title={`${m.name} — ${m.activityName} / ${m.stationName}`}
                >
                  <span className="line-clamp-2 leading-4">{m.name}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {members.map((row) => (
              <tr key={row.elementId} className="border-b last:border-b-0 hover:bg-surface-2/50">
                <th
                  className="sticky right-0 z-10 max-w-[190px] border-l bg-card p-2 text-center text-xs font-bold"
                  title={`${row.name} — ${row.activityName} / ${row.stationName}`}
                >
                  <span className="line-clamp-2 leading-4">{row.name}</span>
                </th>
                {members.map((col) => {
                  if (row.elementId === col.elementId) {
                    // قطر اصلی — خط‌دار (§۱۱)
                    return (
                      <td key={col.elementId} className="matrix-diagonal p-2" aria-label="قطر ماتریس" />
                    )
                  }
                  const low = row.elementId < col.elementId ? row.elementId : col.elementId
                  const high = row.elementId < col.elementId ? col.elementId : row.elementId
                  const relationId = relByPair.get(`${low}|${high}`)
                  const pairKey = `${low}|${high}`
                  const failed = failedPairs.has(pairKey)
                  if (!relationId) {
                    return (
                      <td key={col.elementId} className="p-2 text-center text-muted-foreground/50" title="رابطه‌ای تعریف نشده است">
                        ·
                      </td>
                    )
                  }
                  const cell = cells[relationId] ?? null
                  const comparable = comparability[relationId]?.isComparable !== false
                  const notComparableReason = comparability[relationId]?.notComparableReason ?? null
                  return (
                    <td key={col.elementId} className={cn('p-1.5 text-center', failed && 'bg-red-soft/50')}>
                      <span
                        className="flex w-full min-h-[38px] items-center justify-center rounded-lg px-1.5 py-1"
                        title={
                          !cycleSelected
                            ? 'برای مشاهدهٔ مقدار، یک چرخه انتخاب کنید'
                            : !comparable
                              ? notComparableReason ?? 'در این چرخه قابل‌مقایسه نیست'
                              : 'ثبت و ویرایش مقدار در برگهٔ زمان‌سنجی انجام می‌شود'
                        }
                      >
                        {!cycleSelected ? (
                          <span className="text-[10px] text-muted-foreground">—</span>
                        ) : comparable ? (
                          <CellContent
                            status={cell?.status ?? 'UNREVIEWED'}
                            duration={cell?.overlapDuration ?? null}
                            prefs={prefs}
                          />
                        ) : (
                          <span className="rounded-md border border-dashed border-muted-foreground/50 bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                            غیرقابل‌مقایسه
                          </span>
                        )}
                      </span>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-muted-foreground">
        این صفحه فقط برای مرور است — برای ثبت یا ویرایش مقدار هم‌پوشانی،{' '}
        <button type="button" onClick={onGoTiming} className="font-bold text-brand underline underline-offset-2">
          برگهٔ زمان‌سنجی
        </button>{' '}
        را باز کنید و از زیرردیف همین رابطه مقدار وارد کنید.
      </p>
    </div>
  )
}

function CellContent({
  status,
  duration,
  prefs,
}: {
  status: OverlapStatusValue
  duration: number | null
  prefs: ReturnType<typeof useDisplayPrefs>
}) {
  if (status === 'UNREVIEWED') {
    // UNREVIEWED هرگز به شکل عدد صفر نمایش داده نمی‌شود (§۱۱)
    return (
      <span className="rounded-md border border-dashed border-amber/70 bg-amber-soft/40 px-1.5 py-0.5 text-[11px] text-amber-foreground">
        {STATUS_LABEL.UNREVIEWED}
      </span>
    )
  }
  if (status === 'NO_OVERLAP') {
    return (
      <span className="rounded-md border border-green/40 bg-green-soft/50 px-1.5 py-0.5 text-[11px] text-green-foreground">
        {STATUS_LABEL.NO_OVERLAP}
      </span>
    )
  }
  return (
    <span className="num font-bold" dir="ltr">
      {formatTimeValue(duration, prefs)}
      <span className="mr-1 text-[10px] font-normal text-muted-foreground">s</span>
    </span>
  )
}
