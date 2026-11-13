'use client'

// ═══════════════════════════════════════════════════════════
// بخش «عناصر موازی» در فرم ویرایش عنصر کاری — v1.5.0 §۴ / v1.5.1 §۲
// این فرم فقط تعریف‌کنندهٔ رابطه است؛ نه محل اندازه‌گیری.
// ثبت/ویرایش مقدار هم‌پوشانی فقط در برگهٔ زمان‌سنجی (زیرردیف‌ها)
// انجام می‌شود — QuickValueEditor و هرگونه ورودی مقدار حذف شد.
// v1.5.1 — نامزدها: تمام عناصر «همان پروژه» (هر Activity/Station)؛
// هویت فقط با شناسه‌های واقعی (elementId/activityId/stationId) تعیین می‌شود.
// ═══════════════════════════════════════════════════════════
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Network } from 'lucide-react'
import { qk } from '@/lib/api/keys'
import { overlapApi, type OverlapStatusValue } from '@/lib/api/endpoints'
import { formatTimeValue } from '@/lib/format'
import { useDisplayPrefs } from '@/store/display-store'
import { useAppStore } from '@/store/app-store'
import { cn } from '@/lib/utils'
import { AddRelationControl, ArchiveRelationControl, RestoreRelationControl } from './RelationControls'

const STATUS_LABEL: Record<OverlapStatusValue, string> = {
  UNREVIEWED: 'بررسی‌نشده',
  NO_OVERLAP: 'بدون هم‌پوشانی',
  OVERLAP: 'دارای هم‌پوشانی',
}

export default function ParallelRelationsSection({
  projectId,
  elementId,
  elementName,
  compact,
  /** §۶ ممیزی جلسه ۲ — در زمینهٔ زمان‌سنجی: شناسهٔ جلسهٔ جاری؛ دادهٔ جلسه/اپراتور دیگر نمایش داده نمی‌شود */
  sessionId,
}: {
  projectId: string
  elementId: string
  elementName: string
  compact?: boolean
  sessionId?: string | null
}) {
  const prefs = useDisplayPrefs()
  const openProject = useAppStore((s) => s.openProject)

  const rowsQ = useQuery({
    queryKey: qk.elementRelations(elementId),
    queryFn: () => overlapApi.elementRelations(elementId, sessionId ?? undefined),
  })
  // کاتالوگ عناصر برای افزودن — از ماتریس بدون چرخه (سبک)
  const catalogQ = useQuery({
    queryKey: qk.overlapMatrix(projectId, null),
    queryFn: () => overlapApi.matrix(projectId, null),
  })

  const allRows = rowsQ.data?.rows ?? []
  const rows = allRows.filter((r) => r.isActive)
  const archivedRows = allRows.filter((r) => !r.isActive)
  // §۶ ممیزی جلسه ۲ — برچسب صریح دامنهٔ «آخرین ثبت»
  const latestScopeLabel = sessionId ? 'آخرین ثبت در این جلسه' : 'آخرین ثبت در کل پروژه'

  // v1.5.1 §۲ — نامزدها: تمام عناصر «همان پروژه» (هر Activity و هر Station)؛
  // بدون خود عنصر و بدون رابطهٔ فعال تکراری. هویت فقط بر اساس شناسهٔ واقعی —
  // مقایسهٔ نام فعالیت هرگز مبنای فیلتر نیست (فعالیت‌های هم‌نام اشتباه نمی‌شوند).
  const ownEntry = catalogQ.data?.elementsCatalog.find((c) => c.elementId === elementId)
  const ownActivityId = ownEntry?.activityId ?? null
  const activeOtherIds = new Set(rows.map((r) => r.otherElementId))
  const candidates = (catalogQ.data?.elementsCatalog ?? []).filter(
    (c) => c.elementId !== elementId && !activeOtherIds.has(c.elementId)
  )

  return (
    <div className={cn('space-y-3 rounded-xl border bg-surface-2/60 p-3', compact && 'p-2.5')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-bold">
          <Network className="size-4 text-brand" aria-hidden />
          عناصر موازی
        </p>
        <div className="flex gap-1.5">
          <Button size="sm" variant="outline" onClick={() => openProject(projectId, 'matrix')}>
            مشاهده در ماتریس
          </Button>
          <AddRelationControl
            projectId={projectId}
            elementId={elementId}
            elementName={elementName}
            currentActivityId={ownActivityId}
            candidates={candidates.map((c) => ({
              elementId: c.elementId,
              name: c.name,
              activityId: c.activityId,
              activityName: c.activityName,
              stationId: c.stationId,
              stationName: c.stationName,
            }))}
          />
        </div>
      </div>

      <p className="text-[11px] leading-5 text-muted-foreground">
        اینجا فقط رابطه‌های موازی تعریف یا حذف می‌شوند؛ ثبت مقدار هم‌پوشانی هر چرخه در برگهٔ زمان‌سنجی و در
        زیرردیف همین رابطه انجام می‌شود.
      </p>

      {rowsQ.isLoading ? (
        <div className="h-16 animate-pulse rounded-lg bg-muted" aria-label="در حال بارگذاری روابط" />
      ) : rows.length === 0 ? (
        <p className="text-xs leading-5 text-muted-foreground">
          برای «{elementName}» رابطهٔ موازی ثبت نشده است. اگر عنصر دیگری هم‌زمان با آن اجرا می‌شود، آن را اضافه
          کنید تا زیرردیف آن در برگهٔ زمان‌سنجی نمایش داده شود.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((r) => (
            <li key={r.relationId} className="rounded-lg bg-card p-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate text-sm font-bold">
                    {r.otherElementName}
                    {r.crossActivity && (
                      <span
                        className="shrink-0 rounded-md border border-amber/70 bg-amber-soft/40 px-1 py-px text-[9px] font-bold"
                        title="رابطهٔ بین‌فعالیت — عنصر مقابل در فعالیت دیگری از همین پروژه است"
                      >
                        بین‌فعالیت
                      </span>
                    )}
                  </p>
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
                        {latestScopeLabel}: چرخهٔ {r.latest.cycleNo.toLocaleString('fa-IR')}
                        {sessionId ? '' : ` — ${r.latest.operatorName} — ${r.latest.activityName}`}
                      </span>
                    </>
                  ) : (
                    <span className="text-[10px] text-muted-foreground">
                      {sessionId ? 'در این جلسه هنوز مقداری ثبت نشده است' : 'هنوز مقداری ثبت نشده است'}
                    </span>
                  )}
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => openProject(projectId, 'timing')}
                  title="ثبت مقدار هم‌پوشانی فقط در برگهٔ زمان‌سنجی انجام می‌شود"
                >
                  ورود به برگهٔ زمان‌سنجی
                </Button>
                <ArchiveRelationControl
                  projectId={projectId}
                  relationId={r.relationId}
                  label={`${elementName} ↔ ${r.otherElementName}`}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* روابط آرشیوشده — بازگردانی در صورت معتبر بودن (§۴.۱) */}
      {archivedRows.length > 0 && (
        <details className="rounded-lg border bg-card/60 p-2">
          <summary className="cursor-pointer text-[11px] font-bold text-muted-foreground">
            روابط آرشیوشده ({archivedRows.length.toLocaleString('fa-IR')})
          </summary>
          <ul className="mt-2 space-y-1.5">
            {archivedRows.map((r) => (
              <li key={r.relationId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/40 p-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold text-muted-foreground line-through">{r.otherElementName}</p>
                  <p className="truncate text-[10px] text-muted-foreground">
                    {r.otherActivityName} / {r.otherStationName}
                    {r.crossActivity ? ' — بین‌فعالیت' : ''}
                  </p>
                </div>
                <RestoreRelationControl
                  projectId={projectId}
                  relationId={r.relationId}
                  label={`${elementName} ↔ ${r.otherElementName}`}
                  crossActivity={r.crossActivity}
                />
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}
