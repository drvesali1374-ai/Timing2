// ═══════════════════════════════════════════════════════════
// وضعیت برنامه و مسیریابی hash — SPA تک‌مسیره (ADR-002)
// مسیرها:  #/  خانه |  #/p/{projectId}/{stage}
//          |  #/p/{projectId}/activity/{activityId}
// جابه‌جایی آزاد بین مراحل (۷.۲)
// ═══════════════════════════════════════════════════════════
import { create } from 'zustand'
import type { StageKey } from '@/domain/types'
import { STAGE_KEYS } from '@/domain/types'

/** مرحله «داده و پشتیبان» — ابزار، جزو مراحل مطالعه نیست ولی مسیر دارد */
export type RouteStage = StageKey | 'data'
export const ROUTE_STAGES: RouteStage[] = [...STAGE_KEYS, 'data']

export type AppView =
  | { name: 'home' }
  | { name: 'project'; projectId: string; stage: RouteStage }
  | { name: 'activity'; projectId: string; stage?: 'structure'; activityId: string }

interface AppState {
  view: AppView
  sidebarCollapsed: boolean
  helpOpen: boolean
  /** شناسه انتخاب فعلی در درخت ساختار (باقی‌مانده هنگام جابه‌جایی) */
  selectedStationId: string | null
  /** پیش‌انتخاب فیلتر فعالیت برای مرکز گزارش‌ها (خروجی سریع — FR-22) */
  reportPrefillActivityId: string | null
  navigate: (view: AppView) => void
  setReportPrefillActivity: (activityId: string | null) => void
  goHome: () => void
  openProject: (projectId: string, stage?: StageKey) => void
  openActivity: (projectId: string, activityId: string) => void
  toggleSidebar: () => void
  setHelpOpen: (open: boolean) => void
  setSelectedStation: (stationId: string | null) => void
}

function viewToHash(view: AppView): string {
  if (view.name === 'home') return '#/'
  if (view.name === 'activity') return `#/p/${view.projectId}/activity/${view.activityId}`
  return `#/p/${view.projectId}/${view.stage}`
}

function hashToView(hash: string): AppView {
  const clean = hash.replace(/^#\/?/, '')
  const parts = clean.split('/').filter(Boolean)
  if (parts.length === 0) return { name: 'home' }
  if (parts[0] === 'p' && parts.length >= 2) {
    const projectId = parts[1]
    if (parts[2] === 'activity' && parts[3]) {
      return { name: 'activity', projectId, activityId: parts[3] }
    }
    const stage = parts[2] as RouteStage | undefined
    const validStage = stage && ROUTE_STAGES.includes(stage) ? stage : 'info'
    return { name: 'project', projectId, stage: validStage }
  }
  return { name: 'home' }
}

export const useAppStore = create<AppState>((set) => ({
  view: { name: 'home' },
  sidebarCollapsed: false,
  helpOpen: false,
  selectedStationId: null,
  reportPrefillActivityId: null,
  navigate: (view) => {
    const hash = viewToHash(view)
    if (window.location.hash !== hash) {
      window.location.hash = hash
    }
    set({ view })
  },
  goHome: () => set((s) => ({ ...s, view: { name: 'home' }, selectedStationId: null })),
  openProject: (projectId, stage: RouteStage = 'info') =>
    set((s) => ({ ...s, view: { name: 'project', projectId, stage } })),
  openActivity: (projectId, activityId) =>
    set((s) => ({ ...s, view: { name: 'activity', projectId, activityId } })),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setHelpOpen: (open) => set({ helpOpen: open }),
  setSelectedStation: (stationId) => set({ selectedStationId: stationId }),
  setReportPrefillActivity: (activityId) => set({ reportPrefillActivityId: activityId }),
}))

/** همگام‌سازی وضعیت با hash مرورگر (بارگذاری مجدد/اشتراک مسیر) */
export function initHashSync(): () => void {
  const applyHash = () => {
    const view = hashToView(window.location.hash)
    const current = useAppStore.getState().view
    if (JSON.stringify(current) !== JSON.stringify(view)) {
      useAppStore.setState({ view })
    }
  }
  applyHash()
  window.addEventListener('hashchange', applyHash)
  return () => window.removeEventListener('hashchange', applyHash)
}
