'use client'

// ═══════════════════════════════════════════════════════════
// سایدبار مراحل مطالعه — ۷.۲
// وضعیت چهارگانه + جابه‌جایی آزاد + برچسب صادقانه فاز بعدی
// جمع‌شونده در دسکتاپ، کشویی در موبایل
// ═══════════════════════════════════════════════════════════
import { useQuery } from '@tanstack/react-query'
import {
  BarChart3,
  ChevronLeft,
  DatabaseBackup,
  FileText,
  Gauge,
  LayoutDashboard,
  Network,
  Settings2,
  Timer,
  Users,
  Workflow,
  Percent,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { StageStatusDot } from '@/components/common/StatusBadge'
import { cn } from '@/lib/utils'
import { STUDY_STAGES } from '@/domain/types'
import { projectsApi } from '@/lib/api/endpoints'
import { qk } from '@/lib/api/keys'
import { useAppStore, type RouteStage } from '@/store/app-store'
import { useIsMobile } from '@/hooks/use-mobile'

const STAGE_ICONS: Record<string, typeof Settings2> = {
  info: Settings2,
  structure: Network,
  operators: Users,
  allowances: Percent,
  westinghouse: Gauge,
  timing: Timer,
  analysis: BarChart3,
  charts: Workflow,
  dashboard: LayoutDashboard,
  reports: FileText,
  data: DatabaseBackup,
}

export function StageSidebarContent({ projectId, activeStage }: { projectId: string; activeStage: RouteStage }) {
  const navigate = useAppStore((s) => s.navigate)
  const { data: summary, isLoading } = useQuery({
    queryKey: qk.projectSummary(projectId),
    queryFn: () => projectsApi.summary(projectId),
  })

  const items = [
    ...STUDY_STAGES.map((s) => ({ key: s.key as RouteStage, label: s.label, desc: s.desc, isTool: false })),
    { key: 'data' as RouteStage, label: 'داده و پشتیبان', desc: 'پشتیبان‌گیری، بازیابی، بسته پروژه و تاریخچه', isTool: true },
  ]

  return (
    <nav aria-label="مراحل مطالعه" className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 px-4 pb-3 pt-1">
        <div className="flex size-9 items-center justify-center rounded-xl bg-brand-soft text-brand">
          <Timer className="size-5" aria-hidden />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-extrabold">مراحل مطالعه</p>
          <p className="truncate text-[11px] text-muted-foreground">جابه‌جایی آزاد بین مراحل</p>
        </div>
      </div>

      <div className="scroll-slim flex-1 space-y-5 overflow-y-auto px-2 pb-4">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : (
          <>
            <ul className="space-y-1">
              {items
                .filter((i) => !i.isTool)
                .map((item) => {
                  const Icon = STAGE_ICONS[item.key] ?? Settings2
                  const stageState = summary?.stages[item.key]
                  const isActive = activeStage === item.key
                  return (
                    <li key={item.key}>
                      <button
                        type="button"
                        onClick={() => navigate({ name: 'project', projectId, stage: item.key })}
                        aria-current={isActive ? 'page' : undefined}
                        title={item.desc}
                        className={cn(
                          'group flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-right transition-colors',
                          isActive
                            ? 'bg-brand-soft text-brand font-bold'
                            : 'text-foreground/80 hover:bg-muted'
                        )}
                      >
                        <StageStatusDot status={stageState?.status ?? 'PENDING'} />
                        <Icon className="size-4.5 shrink-0 opacity-70" aria-hidden />
                        <span className="min-w-0 flex-1 truncate text-[13px]">{item.label}</span>
                        {stageState?.status === 'FUTURE_PHASE' && stageState.phase && (
                          <span className="num rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-bold text-faint">
                            فاز {stageState.phase.toLocaleString('fa-IR')}
                          </span>
                        )}
                      </button>
                    </li>
                  )
                })}
            </ul>

            <div>
              <p className="px-2.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-faint">ابزارها</p>
              <ul className="space-y-1">
                {items
                  .filter((i) => i.isTool)
                  .map((item) => {
                    const Icon = STAGE_ICONS[item.key] ?? DatabaseBackup
                    const isActive = activeStage === item.key
                    return (
                      <li key={item.key}>
                        <button
                          type="button"
                          onClick={() => navigate({ name: 'project', projectId, stage: item.key })}
                          aria-current={isActive ? 'page' : undefined}
                          className={cn(
                            'flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-right transition-colors',
                            isActive ? 'bg-brand-soft font-bold text-brand' : 'text-foreground/80 hover:bg-muted'
                          )}
                        >
                          <span className="size-2 shrink-0" />
                          <Icon className="size-4.5 shrink-0 opacity-70" aria-hidden />
                          <span className="min-w-0 flex-1 truncate text-[13px]">{item.label}</span>
                        </button>
                      </li>
                    )
                  })}
              </ul>
            </div>
          </>
        )}
      </div>
    </nav>
  )
}

export function StageSidebar({ projectId, activeStage }: { projectId: string; activeStage: RouteStage }) {
  const { sidebarCollapsed, toggleSidebar } = useAppStore()
  const isMobile = useIsMobile()

  if (isMobile) return null // در موبایل از طریق دکمه منو در TopBar باز می‌شود

  return (
    <aside
      className={cn(
        'sticky top-0 hidden h-screen shrink-0 border-l bg-sidebar transition-[width] duration-300 lg:block',
        sidebarCollapsed ? 'w-16' : 'w-[268px]'
      )}
      aria-label="ناوبری مراحل"
    >
      <div className={cn('flex h-full flex-col', sidebarCollapsed && '[&_*]:!px-0')}>
        <div className={cn('p-3', sidebarCollapsed && 'px-1.5')}>
          <div className={cn(!sidebarCollapsed && 'border-b pb-3')}>
            {sidebarCollapsed ? (
              <Button variant="ghost" size="icon" onClick={toggleSidebar} aria-label="بازکردن منو" className="mx-auto">
                <ChevronLeft className="size-4 rotate-180" aria-hidden />
              </Button>
            ) : (
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-faint">منوی پروژه</span>
                <Button variant="ghost" size="icon" className="size-7" onClick={toggleSidebar} aria-label="جمع‌کردن منو">
                  <ChevronLeft className="size-4" aria-hidden />
                </Button>
              </div>
            )}
          </div>
        </div>
        {sidebarCollapsed ? (
          <div className="flex flex-col items-center gap-1 px-1.5">
            {Object.entries(STAGE_ICONS).map(([key, Icon]) => (
              <Button
                key={key}
                variant="ghost"
                size="icon"
                title={key}
                aria-label={key}
                className={cn('size-9', activeStage === key && 'bg-brand-soft text-brand')}
                onClick={() => useAppStore.getState().navigate({ name: 'project', projectId, stage: key as RouteStage })}
              >
                <Icon className="size-4" aria-hidden />
              </Button>
            ))}
          </div>
        ) : (
          <StageSidebarContent projectId={projectId} activeStage={activeStage} />
        )}
      </div>
    </aside>
  )
}

/** نسخه موبایل — Sheet کشویی */
export function StageSidebarMobile({
  projectId,
  activeStage,
  open,
  onOpenChange,
}: {
  projectId: string
  activeStage: RouteStage
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-72 p-0" dir="rtl">
        <SheetTitle className="sr-only">مراحل مطالعه</SheetTitle>
        <div className="p-2">
          <StageSidebarContent projectId={projectId} activeStage={activeStage} />
        </div>
      </SheetContent>
    </Sheet>
  )
}
