'use client'

// ═══════════════════════════════════════════════════════════
// نماهای تفکیکی و درختی — v1.5.3 §۳
// زبانهٔ مستقل در صفحهٔ ساختار تولید، جدا از ساختار سلسله‌مراتبی:
// • درخت سادهٔ سه‌سطحی (ایستگاه ← فعالیت ← عنصر کاری) لینک‌دار
// • فهرست‌های جدا: فقط ایستگاه‌ها / فقط فعالیت‌ها / فقط عناصر کاری
// کلیک روی هر مورد به صفحهٔ مربوط به آن می‌رود و دکمهٔ «بازگشت به
// نماهای ساختار» (در صفحهٔ فعالیت) برمی‌گرداند.
// ═══════════════════════════════════════════════════════════
import { useMemo, useState } from 'react'
import { ChevronDown, ChevronLeft, Factory, ListTree, SquareArrowOutUpRight, Tags, Workflow } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { EmptyState } from '@/components/common/Feedback'
import { ProcessSymbol } from '@/components/common/ProcessSymbol'
import type { StationDto } from '@/lib/api/endpoints'
import { PROCESS_TYPE_LABELS } from '@/domain/types'
import { formatInt } from '@/lib/format'
import { useDisplayPrefs } from '@/store/display-store'
import { useAppStore } from '@/store/app-store'
import { cn } from '@/lib/utils'

export function StructureExplorer({ projectId, stations }: { projectId: string; stations: StationDto[] }) {
  const prefs = useDisplayPrefs()
  const openActivity = useAppStore((s) => s.openActivity)
  const setExplorerReturn = useAppStore((s) => s.setExplorerReturn)
  const setSelectedStation = useAppStore((s) => s.setSelectedStation)
  const setStructureMainTab = useAppStore((s) => s.setStructureMainTab)

  /** رفتن به صفحهٔ فعالیت — دکمهٔ بازگشت فعال می‌شود */
  const goActivity = (activityId: string) => {
    setExplorerReturn(true)
    openActivity(projectId, activityId)
  }
  /** ایستگاه صفحهٔ مستقل ندارد؛ نمای سلسله‌مراتبی با انتخاب همین ایستگاه باز می‌شود */
  const goStation = (stationId: string) => {
    setStructureMainTab('hierarchy')
    setSelectedStation(stationId)
  }

  const allActivities = useMemo(
    () => stations.flatMap((s) => s.activities.map((a) => ({ a, station: s }))),
    [stations]
  )
  const allElements = useMemo(
    () => stations.flatMap((s) => s.activities.flatMap((a) => (a.elements ?? []).map((e) => ({ e, a, station: s })))),
    [stations]
  )

  return (
    <div className="space-y-4">
      <Tabs defaultValue="tree" dir="rtl">
        <TabsList>
          <TabsTrigger value="tree" className="gap-1.5">
            <ListTree className="size-3.5" aria-hidden />
            نمای درختی ساده
          </TabsTrigger>
          <TabsTrigger value="stations" className="gap-1.5">
            <Factory className="size-3.5" aria-hidden />
            همهٔ ایستگاه‌ها
          </TabsTrigger>
          <TabsTrigger value="activities" className="gap-1.5">
            <Workflow className="size-3.5" aria-hidden />
            همهٔ فعالیت‌ها
          </TabsTrigger>
          <TabsTrigger value="elements" className="gap-1.5">
            <Tags className="size-3.5" aria-hidden />
            همهٔ عناصر کاری
          </TabsTrigger>
        </TabsList>

        <p className="text-xs leading-6 text-muted-foreground">
          این نماها مستقل از ساختار سلسله‌مراتبی‌اند: با کلیک روی هر ایستگاه، فعالیت یا عنصر کاری، به صفحهٔ مربوط به آن
          می‌روید و با دکمهٔ «بازگشت به نماهای ساختار» به همین‌جا برمی‌گردید.
        </p>

        {/* ═══ درخت سادهٔ سه‌سطحی ═══ */}
        <TabsContent value="tree" className="space-y-2">
          {stations.length === 0 ? (
            <div className="card-premium p-6">
              <EmptyState
                icon={<Factory className="size-7" aria-hidden />}
                title="هنوز ایستگاهی ثبت نشده است"
                description='برای دیدن درخت، ابتدا در زبانهٔ «ساختار سلسله‌مراتبی» ایستگاه و فعالیت بسازید.'
                action={
                  <Button variant="outline" onClick={() => setStructureMainTab('hierarchy')}>
                    رفتن به ساختار سلسله‌مراتبی
                  </Button>
                }
              />
            </div>
          ) : (
            stations.map((station) => (
              <StationBranch
                key={station.id}
                station={station}
                prefs={prefs}
                onGoActivity={goActivity}
                onGoStation={goStation}
              />
            ))
          )}
        </TabsContent>

        {/* ═══ فقط ایستگاه‌ها ═══ */}
        <TabsContent value="stations">
          {stations.length === 0 ? (
            <div className="card-premium p-6">
              <EmptyState icon={<Factory className="size-7" aria-hidden />} title="هنوز ایستگاهی ثبت نشده است" />
            </div>
          ) : (
            <div className="card-premium overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-surface-2/70 text-center text-xs text-muted-foreground">
                    <th className="px-4 py-2.5 text-center font-bold">ایستگاه</th>
                    <th className="px-4 py-2.5 text-center font-bold">تعداد فعالیت</th>
                    <th className="px-4 py-2.5 text-center font-bold">تعداد عنصر کاری</th>
                  </tr>
                </thead>
                <tbody>
                  {stations.map((station) => {
                    const elTotal = station.activities.reduce((x, a) => x + activityElementCount(a), 0)
                    return (
                      <tr key={station.id} className="border-b transition-colors last:border-0 hover:bg-muted/50">
                        <td className="px-4 py-2.5 text-center font-medium">
                          <button
                            type="button"
                            onClick={() => goStation(station.id)}
                            title={`نمایش «${station.name}» در ساختار سلسله‌مراتبی`}
                            className="font-semibold text-brand underline decoration-dotted underline-offset-4 hover:text-brand-2"
                          >
                            {station.name}
                          </button>
                        </td>
                        <td className="num px-4 py-2.5 text-center">{formatInt(station.activities.length, prefs)}</td>
                        <td className="num px-4 py-2.5 text-center">{formatInt(elTotal, prefs)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        {/* ═══ فقط فعالیت‌ها ═══ */}
        <TabsContent value="activities">
          {allActivities.length === 0 ? (
            <div className="card-premium p-6">
              <EmptyState icon={<Workflow className="size-7" aria-hidden />} title="هنوز فعالیتی ثبت نشده است" />
            </div>
          ) : (
            <div className="card-premium overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-surface-2/70 text-center text-xs text-muted-foreground">
                    <th className="px-4 py-2.5 text-center font-bold">فعالیت</th>
                    <th className="px-4 py-2.5 text-center font-bold">ایستگاه</th>
                    <th className="px-4 py-2.5 text-center font-bold">نوع فرایندی</th>
                    <th className="px-4 py-2.5 text-center font-bold">عناصر کاری</th>
                  </tr>
                </thead>
                <tbody>
                  {allActivities.map(({ a, station }) => (
                    <tr key={a.id} className="border-b transition-colors last:border-0 hover:bg-muted/50">
                      <td className="px-4 py-2.5 text-center font-medium">
                        <button
                          type="button"
                          onClick={() => goActivity(a.id)}
                          title={`رفتن به صفحهٔ فعالیت «${a.name}»`}
                          className="font-semibold text-brand underline decoration-dotted underline-offset-4 hover:text-brand-2"
                        >
                          {a.name}
                        </button>
                      </td>
                      <td className="px-4 py-2.5 text-center">{station.name}</td>
                      <td className="px-4 py-2.5 text-center">
                        <span className="inline-flex items-center gap-1.5">
                          <ProcessSymbol type={a.processType} size="sm" />
                          {PROCESS_TYPE_LABELS[a.processType as keyof typeof PROCESS_TYPE_LABELS] ?? a.processType}
                        </span>
                      </td>
                      <td className="num px-4 py-2.5 text-center">{formatInt(activityElementCount(a), prefs)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        {/* ═══ فقط عناصر کاری ═══ */}
        <TabsContent value="elements">
          {allElements.length === 0 ? (
            <div className="card-premium p-6">
              <EmptyState icon={<Tags className="size-7" aria-hidden />} title="هنوز عنصر کاری ثبت نشده است" />
            </div>
          ) : (
            <div className="card-premium overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-surface-2/70 text-center text-xs text-muted-foreground">
                    <th className="px-4 py-2.5 text-center font-bold">عنصر کاری</th>
                    <th className="px-4 py-2.5 text-center font-bold">فعالیت</th>
                    <th className="px-4 py-2.5 text-center font-bold">ایستگاه</th>
                  </tr>
                </thead>
                <tbody>
                  {allElements.map(({ e, a, station }) => (
                    <tr key={e.id} className="border-b transition-colors last:border-0 hover:bg-muted/50">
                      <td className="px-4 py-2.5 text-center font-medium">
                        <button
                          type="button"
                          onClick={() => goActivity(a.id)}
                          title={`رفتن به صفحهٔ فعالیت «${a.name}» (جدول ثبت زمان همین عنصر در آنجاست)`}
                          className="font-semibold text-brand underline decoration-dotted underline-offset-4 hover:text-brand-2"
                        >
                          {e.name}
                        </button>
                      </td>
                      <td className="px-4 py-2.5 text-center">{a.name}</td>
                      <td className="px-4 py-2.5 text-center">{station.name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

/** شاخهٔ ایستگاه در درخت ساده — باز/بسته + فعالیت‌ها + عناصر زیر هر فعالیت */
function StationBranch({
  station,
  prefs,
  onGoActivity,
  onGoStation,
}: {
  station: StationDto
  prefs: ReturnType<typeof useDisplayPrefs>
  onGoActivity: (activityId: string) => void
  onGoStation: (stationId: string) => void
}) {
  const [open, setOpen] = useState(true)
  const elTotal = station.activities.reduce((x, a) => x + activityElementCount(a), 0)

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="card-premium p-2.5">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="size-7 shrink-0"
          onClick={(e) => {
            e.stopPropagation()
            setOpen(!open)
          }}
          aria-label={`${open ? 'بستن' : 'بازکردن'} شاخهٔ ${station.name}`}
          title={open ? 'بستن شاخه' : 'بازکردن شاخه'}
        >
          <ChevronDown className={cn('size-4 transition-transform', !open && '-rotate-90')} aria-hidden />
        </Button>
        <button
          type="button"
          onClick={() => onGoStation(station.id)}
          title={`نمایش «${station.name}» در ساختار سلسله‌مراتبی`}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-lg p-1 text-right transition-colors hover:bg-brand-soft/60"
        >
          <span className="chip-icon size-7 bg-brand-soft text-brand">
            <Factory className="size-4" aria-hidden />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-bold">{station.name}</span>
            <span className="num block text-[10px] text-muted-foreground">
              {formatInt(station.activities.length, prefs)} فعالیت · {formatInt(elTotal, prefs)} عنصر کاری
            </span>
          </span>
        </button>
      </div>
      <CollapsibleContent>
        <div
          className="mt-1 flex flex-col gap-1 border-r border-dashed pr-2.5"
          dir="rtl"
          style={{ marginInlineStart: '18px' }}
        >
          {station.activities.length === 0 ? (
            <p className="text-xs text-faint">فعالیتی ندارد</p>
          ) : (
            station.activities.map((a) => (
              <div key={a.id} className="flex flex-col gap-0.5">
                <button
                  type="button"
                  onClick={() => onGoActivity(a.id)}
                  title={`رفتن به صفحهٔ فعالیت «${a.name}» (مشخصات، عناصر، زمان‌سنجی و تحلیل)`}
                  className="flex min-h-8 w-full items-center gap-1.5 rounded-lg px-1.5 py-1 text-right transition-colors hover:bg-brand-soft"
                >
                  <SquareArrowOutUpRight className="size-3.5 shrink-0 text-brand" aria-hidden />
                  <span className="text-[13px] font-semibold">{a.name}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {PROCESS_TYPE_LABELS[a.processType as keyof typeof PROCESS_TYPE_LABELS] ?? a.processType} ·{' '}
                    {formatInt(activityElementCount(a), prefs)} عنصر
                  </span>
                </button>
                {(a.elements ?? []).map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => onGoActivity(a.id)}
                    title={`رفتن به صفحهٔ فعالیت «${a.name}» — عنصر «${e.name}» در جدول ثبت زمان همان فعالیت ثبت/مصرف می‌شود`}
                    className="flex min-h-7 w-full items-center gap-1.5 rounded-lg py-0.5 pl-1.5 pr-3.5 text-right transition-colors hover:bg-brand-soft/55"
                  >
                    <ChevronLeft className="size-3 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="text-xs">{e.name}</span>
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

/** شمارش عناصر فعالیت — از _count یا فهرست عناصر */
function activityElementCount(a: StationDto['activities'][number]): number {
  if (a.elements) return a.elements.length
  return a._count?.workElements ?? 0
}
