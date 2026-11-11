// ═══════════════════════════════════════════════════════════
// ثبت نماهای SPA — هر نمای مرحله یک فایل مستقل
// امضای مشترک: ({ projectId }: { projectId: string })
// ═══════════════════════════════════════════════════════════
import { lazy, type ComponentType } from 'react'

export type RegistryView =
  | 'home'
  | 'info'
  | 'structure'
  | 'activity'
  | 'operators'
  | 'allowances'
  | 'westinghouse'
  | 'timing'
  | 'matrix'
  | 'analysis'
  | 'charts'
  | 'dashboard'
  | 'reports'
  | 'data'

export type ViewComponent = ComponentType<{ projectId: string }>

export const registry: Record<RegistryView, ViewComponent> = {
  home: lazy(() => import('./HomeView')),
  info: lazy(() => import('./project/ProjectInfoView')),
  structure: lazy(() => import('./project/StructureView')),
  activity: lazy(() => import('./project/ActivityView')),
  operators: lazy(() => import('./project/OperatorsView')),
  allowances: lazy(() => import('./project/GroupsView')),
  westinghouse: lazy(() => import('./project/WestinghouseView')),
  timing: lazy(() => import('./project/TimingView')),
  matrix: lazy(() => import('./project/MatrixView')),
  analysis: lazy(() => import('./project/AnalysisView')),
  charts: lazy(() => import('./project/ChartsView')),
  dashboard: lazy(() => import('./project/DashboardView')),
  reports: lazy(() => import('./project/ReportsView')),
  data: lazy(() => import('./project/DataView')),
}
