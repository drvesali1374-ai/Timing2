// ═══════════════════════════════════════════════════════════
// کلیدهای TanStack Query — قرارداد واحد برای کل برنامه
// ═══════════════════════════════════════════════════════════
export const qk = {
  projects: (params?: { q?: string; sort?: string; dir?: string }) =>
    ['projects', params ?? {}] as const,
  project: (id: string) => ['project', id] as const,
  projectSummary: (id: string) => ['project-summary', id] as const,
  projectCalcSettings: (id: string) => ['project-calc-settings', id] as const,
  structure: (projectId: string) => ['structure', projectId] as const,
  stations: (projectId: string) => ['stations', projectId] as const,
  activities: (stationId: string) => ['activities', stationId] as const,
  elements: (activityId: string) => ['elements', activityId] as const,
  // ── الونس‌های سلسله‌مراتبی — جلسه اول ──
  allowanceDefinitions: (projectId: string) => ['allowance-definitions', projectId] as const,
  scopeAllowances: (scopeType: string, scopeId: string) => ['scope-allowances', scopeType, scopeId] as const,
  elementRating: (elementId: string) => ['element-rating', elementId] as const,
  operators: (projectId: string) => ['operators', projectId] as const,
  groups: (projectId: string) => ['groups', projectId] as const,
  groupAllowances: (groupId: string) => ['group-allowances', groupId] as const,
  categories: (projectId: string) => ['categories', projectId] as const,
  ratingTables: (projectId: string) => ['rating-tables', projectId] as const,
  ratingTable: (tableId: string) => ['rating-table', tableId] as const,
  ratingMatrix: (projectId: string) => ['rating-matrix', projectId] as const,
  backups: () => ['backups'] as const,
  audit: (projectId?: string) => ['audit', projectId ?? 'all'] as const,
  settings: () => ['settings'] as const,
  // ── زمان‌سنجی — فاز ۳ ──
  sessions: (activityId: string) => ['timing-sessions', activityId] as const,
  sessionSheet: (sessionId: string) => ['timing-sheet', sessionId] as const,
  // ── ماتریس هم‌پوشانی — جلسه ۲ ──
  overlapMatrix: (projectId: string, cycleId?: string | null) =>
    ['overlap-matrix', projectId, cycleId ?? 'none'] as const,
  elementRelations: (elementId: string) => ['element-relations', elementId] as const,
  // ── تحلیل — فاز ۴ ──
  activityAnalysis: (activityId: string) => ['activity-analysis', activityId] as const,
  analysisActivities: (projectId: string) => ['analysis-activities', projectId] as const,
  latestCalculation: (projectId: string) => ['latest-calculation', projectId] as const,
  // ── نمودار فرایند — فاز ۵ ──
  chart: (projectId: string, chartType: string) => ['chart', projectId, chartType] as const,
  // ── داشبورد و گزارش‌ها — فاز ۶ ──
  dashboard: (projectId: string) => ['dashboard', projectId] as const,
  dashboardLayout: (projectId: string) => ['dashboard-layout', projectId] as const,
  reportSelection: (projectId: string) => ['report-selection', projectId] as const,
  studyReport: (projectId: string, activityId?: string, operatorId?: string) =>
    ['study-report', projectId, activityId ?? 'all', operatorId ?? 'all'] as const,
}
