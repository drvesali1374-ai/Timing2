'use client'

// ═══════════════════════════════════════════════════════════
// صفحه اصلی — تنها مسیر کاربر (ADR-002)
// روتر SPA با hash — نمای خانه یا پوسته پروژه
// ═══════════════════════════════════════════════════════════
import { Suspense, useEffect, type ComponentType } from 'react'
import { useAppStore, initHashSync } from '@/store/app-store'
import { AppShell } from '@/components/layout/AppShell'
import { Skeleton } from '@/components/ui/skeleton'
import { registry, type RegistryView } from '@/views/registry'

function ViewSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-56" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-40 w-full rounded-2xl" />
        ))}
      </div>
    </div>
  )
}

function StageRouter() {
  const view = useAppStore((s) => s.view)

  if (view.name === 'home') {
    const HomeView = registry.home as ComponentType
    return <HomeView />
  }

  const stage: RegistryView =
    view.name === 'activity' ? 'activity' : (view.stage as RegistryView)
  const StageView = registry[stage] ?? registry.info
  return (
    <AppShell projectId={view.projectId}>
      <Suspense fallback={<ViewSkeleton />}>
        <div key={`${view.projectId}-${stage}-${view.name === 'activity' ? view.activityId : ''}`}>
          <StageView projectId={view.projectId} />
        </div>
      </Suspense>
    </AppShell>
  )
}

export default function Page() {
  useEffect(() => initHashSync(), [])
  return (
    <Suspense fallback={<ViewSkeleton />}>
      <StageRouter />
    </Suspense>
  )
}
