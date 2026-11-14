'use client'

// ═══════════════════════════════════════════════════════════
// بخش «عناصر موازی» در فرم ویرایش عنصر کاری — v1.5.0 §۴ / v1.5.1 §۲ / v1.5.2 §۲
// این فرم فقط تعریف‌کنندهٔ رابطه است؛ نه محل اندازه‌گیری.
// ثبت زمان عادی عنصر موازی در برگهٔ زمان‌سنجی (زیرردیف، به‌صورت بازهٔ از/تا)
// انجام می‌شود. v1.5.2 §۲-۶ — ساده‌سازی پس از حذف ماتریس هم‌پوشانی:
// بدون وضعیت/مقدار هم‌پوشانی و بدون لینک ماتریس.
// v1.5.1 — نامزدها: تمام عناصر «همان پروژه» (هر Activity/Station)؛
// هویت فقط با شناسه‌های واقعی (elementId/activityId/stationId) تعیین می‌شود.
// ═══════════════════════════════════════════════════════════
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Network } from 'lucide-react'
import { qk } from '@/lib/api/keys'
import { parallelApi } from '@/lib/api/endpoints'
import { useAppStore } from '@/store/app-store'
import { cn } from '@/lib/utils'
import { AddRelationControl, ArchiveRelationControl, RestoreRelationControl } from './RelationControls'

export default function ParallelRelationsSection({
  projectId,
  elementId,
  elementName,
  compact,
}: {
  projectId: string
  elementId: string
  elementName: string
  compact?: boolean
}) {
  const openProject = useAppStore((s) => s.openProject)

  const rowsQ = useQuery({
    queryKey: qk.elementRelations(elementId),
    queryFn: () => parallelApi.elementRelations(elementId),
  })
  // کاتالوگ عناصر برای افزودن — منبع مستقل از ساختار تولید (v1.5.2 §۲-۵)
  const catalogQ = useQuery({
    queryKey: qk.elementsCatalog(projectId),
    queryFn: () => parallelApi.catalog(projectId),
  })

  const allRows = rowsQ.data?.rows ?? []
  const rows = allRows.filter((r) => r.isActive)
  const archivedRows = allRows.filter((r) => !r.isActive)

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

      <p className="text-[11px] leading-5 text-muted-foreground">
        اینجا فقط رابطه‌های موازی تعریف یا حذف می‌شوند؛ ثبت زمان عادی عنصر موازی (به‌صورت بازهٔ از/تا) در
        زیرردیف همین رابطه در برگهٔ زمان‌سنجی انجام می‌شود.
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
                <div className="flex shrink-0 items-center gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openProject(projectId, 'timing')}
                    title="ثبت زمان عنصر موازی در برگهٔ زمان‌سنجی انجام می‌شود"
                  >
                    ورود به زمان‌سنجی
                  </Button>
                  <ArchiveRelationControl
                    projectId={projectId}
                    relationId={r.relationId}
                    label={`${elementName} ↔ ${r.otherElementName}`}
                  />
                </div>
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
