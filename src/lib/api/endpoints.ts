// ═══════════════════════════════════════════════════════════
// توابع تایپ‌شده‌ی کلاینت API — قرارداد کامل فاز ۱ و ۲
// ═══════════════════════════════════════════════════════════
import { api } from '../api-client'

// ── انواع مشترک ──
export interface ProjectSummaryItem {
  id: string
  name: string
  lineName: string
  productName: string
  studyDate: string | null
  status: string
  description: string | null
  createdAt: string
  updatedAt: string
  counts: { stations: number; activities: number; elements: number; operators: number }
  progress: number
  finalized: boolean
}

export interface StageState {
  status: 'PENDING' | 'IN_PROGRESS' | 'DONE' | 'NEEDS_REVIEW' | 'FUTURE_PHASE'
  phase?: number
  hint: string
}

export interface StageSummaryDto {
  stages: Record<string, StageState>
  progress: number
  counts: {
    stations: number
    activities: number
    elements: number
    operators: number
    groups: number
    categories: number
    elementsWithRating: number
    finalized: boolean
  }
}

export interface ProjectDetailDto {
  project: {
    id: string
    name: string
    lineName: string
    productName: string
    studyDate: string | null
    status: string
    description: string | null
    createdAt: string
    updatedAt: string
    settings: Record<string, string>
  }
  dependencyCounts: {
    stations: number
    activities: number
    elements: number
    operators: number
    groups: number
    sessions: number
    observations: number
  }
  stageSummary: StageSummaryDto
}

export interface StationDto {
  id: string
  projectId: string
  name: string
  description: string | null
  sortOrder: number
  createdAt: string
  updatedAt: string
  activities: ActivityDto[]
}

export interface ActivityDto {
  id: string
  stationId: string
  groupId: string | null
  name: string
  description: string | null
  processType: string
  sortOrder: number
  targetSampleCount: number | null
  createdAt: string
  updatedAt: string
  group?: { id: string; name: string } | null
  _count?: { workElements: number; sessions: number }
  elements?: ElementDto[]
}

export interface ElementDto {
  id: string
  activityId: string
  name: string
  description: string | null
  elementType: string
  sortOrder: number
  createdAt: string
  updatedAt: string
  rating?: { totalFactor: number } | null
}

export interface OperatorDto {
  id: string
  projectId: string
  displayName: string
  code: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
  sessionsCount: number
  activitiesCount: number
}

export interface GroupDto {
  id: string
  projectId: string
  name: string
  description: string | null
  createdAt: string
  updatedAt: string
  totalA: number
  groupAllowances: { categoryId: string; percentValue: number; category: { name: string; isActive: boolean } }[]
  activities: { id: string; name: string; station: { name: string } }[]
}

export interface CategoryDto {
  id: string
  projectId: string
  name: string
  code: string | null
  isActive: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
  groupValuesCount: number
  overrideCount: number
}

export interface AllowanceDefinitionDto {
  id: string
  title: string
  code: string | null
  description: string | null
  defaultValueType: string | null
  defaultValuePercent: number | null
  defaultTimeSeconds: number | null
  isActive: boolean
  isArchived: boolean
  sortOrder: number
  assignmentCount: number
  createdAt: string
  updatedAt: string
}

/** یک ردیف الونس resolve‌شده — جلسه اول (§۲.۴) */
export interface ResolvedAllowanceRowDto {
  definitionId: string
  title: string
  code: string | null
  status: 'INHERITED' | 'OVERRIDDEN' | 'CUSTOM' | 'EXCLUDED'
  valueType: 'PERCENT' | 'FIXED_TIME'
  percentValue: number | null
  timeValueSeconds: number | null
  applicationBasis: 'PER_ELEMENT_EXECUTION' | 'PER_CYCLE' | null
  sourceScopeType: string | null
  sourceScopeLabel: string | null
  hasLocalDecision: boolean
  parentValue: number | null
  parentScopeType: string | null
  needsAggregationRule: boolean
  note: string | null
}

export interface EffectiveAllowanceSummaryDto {
  count: number
  totalPercent: number
  perExecutionSeconds: number
  perCycleSeconds: number
  needsAggregationCount: number
}

/** الونس‌های یک scope + resolve کامل — جلسه اول (§۵) */
export interface ScopeAllowancesDto {
  scope: { type: 'PROJECT' | 'STATION' | 'ACTIVITY' | 'WORK_ELEMENT'; id: string; label: string; projectId: string }
  chain: { type: string; id: string; label: string }[]
  descendants: { stations: number; activities: number; elements: number }
  settings: { method: string; methodLabel: string; formula: string }
  definitions: AllowanceDefinitionDto[]
  resolved: { rows: ResolvedAllowanceRowDto[]; summary: EffectiveAllowanceSummaryDto }
  localAssignments: {
    definitionId: string
    mode: string
    valueType: string
    percentValue: number | null
    timeValueSeconds: number | null
    applicationBasis: string | null
    updatedAt: string
  }[]
  lastModifiedAt: string | null
}

/** عملیات تخصیص الونس — §۶ */
export interface AllowanceOpInput {
  definitionId: string
  action: 'SET' | 'EXCLUDE' | 'RESTORE' | 'REMOVE'
  valueType?: 'PERCENT' | 'FIXED_TIME'
  percentValue?: number | null
  timeValueSeconds?: number | null
  applicationBasis?: 'PER_ELEMENT_EXECUTION' | 'PER_CYCLE' | null
}

export interface RatingTableDto {
  id: string
  projectId: string
  name: string
  version: number
  source: string | null
  notes: string | null
  isDefault: boolean
  createdAt: string
  updatedAt: string
  gradesCount: number
  assessmentsCount: number
}

export interface RatingGradeDto {
  id: string
  ratingTableId: string
  factor: string
  gradeCode: string
  label: string
  value: number
  hint: string | null
  sortOrder: number
}

export interface RatingTableDetailDto extends RatingTableDto {
  grades: RatingGradeDto[]
}

export interface ElementRatingDto {
  element: { id: string; name: string }
  projectId: string
  assessment: {
    ratingTableId: string
    ratingTableName: string
    ratingTableVersion: number
    ratingTableSource: string | null
    skillGrade: string | null
    effortGrade: string | null
    conditionsGrade: string | null
    consistencyGrade: string | null
    skillValue: number
    effortValue: number
    conditionsValue: number
    consistencyValue: number
    totalFactor: number
    notes: string | null
  } | null
}

export interface RatingMatrixDto {
  tables: { id: string; name: string; version: number; isDefault: boolean; source: string | null }[]
  defaultTableId: string | null
  stations: {
    id: string
    name: string
    activities: {
      id: string
      name: string
      elements: {
        id: string
        name: string
        elementType: string
        rating: { totalFactor: number; ratingTableId: string; ratingTableName: string; ratingTableVersion: number } | null
      }[]
    }[]
  }[]
}

export interface BackupDto {
  id: string
  fileName: string
  kind: string
  sizeBytes: number
  checksum: string
  schemaVersion: string
  projectCount: number
  createdAt: string
}

export interface AuditDto {
  id: string
  entityType: string
  entityId: string
  action: string
  entityName: string | null
  beforeJson: string | null
  afterJson: string | null
  projectId: string | null
  actor: string
  occurredAt: string
}

export interface AppSettingsDto {
  settings: Record<string, string>
}

// ── زمان‌سنجی — فاز ۳ ──
export interface SessionListItemDto {
  id: string
  operatorId: string
  operatorName: string
  timingMethod: 'SNAPBACK' | 'CONTINUOUS'
  status: string
  notes: string | null
  startedAt: string
  endedAt: string | null
  cyclesCount: number
  validCyclesCount: number
}

export interface ObservationCellDto {
  id: string
  workElementId: string
  laneId: string | null
  laneType: string | null
  rawDuration: number | null
  cumulativeReading: number | null
  startOffset: number | null
  endOffset: number | null
  derivedDuration: number | null
  validityStatus: string
  isUserExcluded: boolean
  exclusionReason: string | null
}

export interface CycleRowDto {
  id: string
  cycleNo: number
  notes: string | null
  isComplete: boolean
  createdAt: string
  updatedAt: string
  elapsed: number | null
  elapsedExcludesSequential: boolean
  hasExcluded: boolean
  hasSuspect: boolean
  hasIncompleteInterval: boolean
  observations: ObservationCellDto[]
}

export interface SessionSheetDto {
  session: {
    id: string
    activityId: string
    operatorId: string
    timingMethod: 'SNAPBACK' | 'CONTINUOUS'
    status: string
    notes: string | null
    startedAt: string
    endedAt: string | null
    updatedAt: string
  }
  activity: {
    id: string
    name: string
    stationName: string
    targetSampleCount: number | null
    projectId: string
  }
  operator: { id: string; displayName: string; code: string | null }
  elements: {
    id: string
    name: string
    elementType: string
    sortOrder: number
    defaultEntry: 'SEQ' | 'INT'
  }[]
  cycles: CycleRowDto[]
  stats: {
    perElement: Record<string, { calcCount: number; excludedCount: number; totalCount: number }>
    sessionCycles: number
    sessionValidCycles: number
    activityValidCycles: number
    targetSampleCount: number | null
  }
}

export interface PasteCellResultDto {
  colIndex: number
  row: number
  cycleNo: number
  elementId: string | null
  rawDuration?: number | null
  cumulativeReading?: number | null
  startOffset?: number | null
  endOffset?: number | null
  previewDerived?: number | null
  status: 'OK' | 'WARN' | 'ERROR' | 'SKIP'
  message?: string
}

export interface PastePreviewDto {
  startCycleNo: number
  startColIndex: number
  rows: { cycleNo: number; isNew: boolean; cells: PasteCellResultDto[] }[]
  errorCount: number
  warnCount: number
  okCount: number
  skipCount: number
  createdCycles: number
}

export interface RemovedCycleDataDto {
  cycle: {
    cycleNo: number
    notes: string | null
    isComplete: boolean
    observations: {
      workElementId: string
      rawDuration: number | null
      cumulativeReading: number | null
      startOffset: number | null
      endOffset: number | null
      validityStatus: string
      exclusionReason: string | null
    }[]
  }
}

export const timingApi = {
  sessions: (activityId: string) =>
    api.get<{ sessions: SessionListItemDto[] }>(`/api/activities/${activityId}/sessions`),
  createSession: (
    activityId: string,
    body: { operatorId: string; timingMethod: 'SNAPBACK' | 'CONTINUOUS'; notes?: string | null }
  ) => api.post<{ session: SessionSheetDto['session']; sheet: SessionSheetDto }>(`/api/activities/${activityId}/sessions`, body),
  sheet: (sessionId: string) => api.get<{ sheet: SessionSheetDto }>(`/api/sessions/${sessionId}`),
  updateSession: (
    sessionId: string,
    body: { notes?: string | null; status?: 'OPEN' | 'CLOSED'; expectedUpdatedAt?: string }
  ) => api.put<{ sheet: SessionSheetDto }>(`/api/sessions/${sessionId}`, body),
  deleteSession: (sessionId: string) =>
    api.del<{ deleted: boolean; removedCounts: { cycles: number; observations: number } }>(`/api/sessions/${sessionId}`),

  addCycles: (sessionId: string, body: { count?: number } | { withData: RemovedCycleDataDto['cycle'][] }) =>
    api.post<{ created: { id: string; cycleNo: number }[]; sheet: SessionSheetDto }>(`/api/sessions/${sessionId}/cycles`, body),
  deleteCycle: (cycleId: string) =>
    api.del<{ removed: RemovedCycleDataDto; sheet: SessionSheetDto }>(`/api/cycles/${cycleId}`),
  updateCycleNotes: (cycleId: string, body: { notes: string | null; expectedUpdatedAt?: string }) =>
    api.put<{ cycle: { id: string; cycleNo: number; notes: string | null; updatedAt: string }; sheet: SessionSheetDto }>(`/api/cycles/${cycleId}`, body),
  updateCells: (
    cycleId: string,
    cells: {
      workElementId: string
      rawDuration?: number | null
      cumulativeReading?: number | null
      startOffset?: number | null
      endOffset?: number | null
    }[]
  ) =>
    api.put<{ warnings: string[]; sheet: SessionSheetDto }>(`/api/cycles/${cycleId}/cells`, { cells }),

  pastePreview: (
    sessionId: string,
    body: { startCycleNo: number; startColIndex: number; data: string[][] }
  ) => api.post<{ preview: PastePreviewDto }>(`/api/sessions/${sessionId}/paste-preview`, body),
  pasteCommit: (
    sessionId: string,
    body: {
      startCycleNo: number
      startColIndex: number
      data: string[][]
      mode: 'ALL_OR_NOTHING' | 'SKIP_INVALID'
    }
  ) =>
    api.post<{ committed: number; skipped: number; createdCycles: number; warnings: string[]; sheet: SessionSheetDto }>(
      `/api/sessions/${sessionId}/paste-commit`,
      body
    ),

  setValidity: (observationId: string, body: { validityStatus: 'VALID' | 'EXCLUDED'; exclusionReason?: string | null }) =>
    api.put<{
      observation: { id: string; validityStatus: string; isUserExcluded: boolean; exclusionReason: string | null; rawDuration: number | null }
      sheet: SessionSheetDto
    }>(`/api/observations/${observationId}/validity`, body),
}

// ── پروژه ──
export const projectsApi = {
  list: (params?: { q?: string; sort?: string; dir?: string }) => {
    const sp = new URLSearchParams()
    if (params?.q) sp.set('q', params.q)
    if (params?.sort) sp.set('sort', params.sort)
    if (params?.dir) sp.set('dir', params.dir)
    const qs = sp.toString()
    return api.get<{ items: ProjectSummaryItem[] }>(`/api/projects${qs ? `?${qs}` : ''}`)
  },
  get: (id: string) => api.get<ProjectDetailDto>(`/api/projects/${id}`),
  create: (body: { name: string; lineName: string; productName: string; studyDate?: string | null; description?: string | null }) =>
    api.post<{ project: { id: string } }>('/api/projects', body),
  update: (id: string, body: Record<string, unknown>, changeId?: string) =>
    api.put<{ project: { id: string; updatedAt: string } }>(`/api/projects/${id}`, body, changeId),
  remove: (id: string) => api.del<{ deleted: boolean }>(`/api/projects/${id}`),
  duplicate: (id: string, body: unknown) => api.post<{ projectId: string }>(`/api/projects/${id}/duplicate`, body),
  finalize: (id: string, reason?: string | null) => api.post<{ finalized: boolean }>(`/api/projects/${id}/finalize`, { reason: reason ?? null }),
  unfinalize: (id: string) => api.del<{ finalized: boolean }>(`/api/projects/${id}/finalize`),
  summary: (id: string) => api.get<StageSummaryDto>(`/api/projects/${id}/summary`),
  calcSettings: (id: string) => api.get<{ allowanceMethod: string; aggregationMethod: string }>(`/api/projects/${id}/calc-settings`),
  putCalcSettings: (id: string, body: { allowanceMethod?: string; aggregationMethod?: string }) =>
    api.put<{ allowanceMethod: string; aggregationMethod: string }>(`/api/projects/${id}/calc-settings`, body),
}

// ── ساختار ──
export const structureApi = {
  tree: (projectId: string) => api.get<{ stations: StationDto[] }>(`/api/projects/${projectId}/structure`),
  stations: (projectId: string) => api.get<{ items: StationDto[] }>(`/api/projects/${projectId}/stations`),
  createStation: (projectId: string, body: { name: string; description?: string | null }) =>
    api.post<{ station: StationDto }>(`/api/projects/${projectId}/stations`, body),
  updateStation: (id: string, body: Record<string, unknown>, changeId?: string) =>
    api.put<{ station: StationDto }>(`/api/stations/${id}`, body, changeId),
  deleteStation: (id: string) => api.del<{ deleted: boolean; removedCounts: { activities: number; elements: number; sessions: number; observations: number } }>(`/api/stations/${id}`),
  reorderStations: (projectId: string, ids: string[]) =>
    api.post<{ reordered: boolean }>(`/api/projects/${projectId}/stations/reorder`, { ids }),

  activities: (stationId: string) => api.get<{ items: ActivityDto[] }>(`/api/stations/${stationId}/activities`),
  createActivity: (stationId: string, body: Record<string, unknown>) =>
    api.post<{ activity: ActivityDto }>(`/api/stations/${stationId}/activities`, body),
  updateActivity: (id: string, body: Record<string, unknown>, changeId?: string) =>
    api.put<{ activity: ActivityDto }>(`/api/activities/${id}`, body, changeId),
  deleteActivity: (id: string) => api.del<{ deleted: boolean; removedCounts: { elements: number; sessions: number; observations: number } }>(`/api/activities/${id}`),
  reorderActivities: (stationId: string, ids: string[]) =>
    api.post<{ reordered: boolean }>(`/api/stations/${stationId}/activities/reorder`, { ids }),

  elements: (activityId: string) => api.get<{ activity: { id: string; name: string; stationId: string }; elements: ElementDto[] }>(`/api/activities/${activityId}/elements`),
  createElement: (activityId: string, body: Record<string, unknown>) =>
    api.post<{ element: ElementDto }>(`/api/activities/${activityId}/elements`, body),
  updateElement: (id: string, body: Record<string, unknown>, changeId?: string) =>
    api.put<{ element: ElementDto }>(`/api/elements/${id}`, body, changeId),
  deleteElement: (id: string) => api.del<{ deleted: boolean; removedCounts: { observations: number; hasRating: boolean } }>(`/api/elements/${id}`),
  reorderElements: (activityId: string, ids: string[]) =>
    api.post<{ reordered: boolean }>(`/api/activities/${activityId}/elements/reorder`, { ids }),
}

// ── اپراتورها ──
export const operatorsApi = {
  list: (projectId: string) => api.get<{ items: OperatorDto[] }>(`/api/projects/${projectId}/operators`),
  create: (projectId: string, body: { displayName: string; code?: string | null; notes?: string | null }) =>
    api.post<{ operator: OperatorDto }>(`/api/projects/${projectId}/operators`, body),
  update: (id: string, body: Record<string, unknown>, changeId?: string) =>
    api.put<{ operator: OperatorDto }>(`/api/operators/${id}`, body, changeId),
  delete: (id: string) => api.del<{ deleted: boolean; removedCounts: { sessions: number; observations: number } }>(`/api/operators/${id}`),
}

// ── مجازها و الونس‌ها — جلسه اول: مدل سلسله‌مراتبی ──
export const allowancesApi = {
  // تعریف‌های مرکزی (§۲.۲)
  definitions: (projectId: string) => api.get<{ items: AllowanceDefinitionDto[] }>(`/api/projects/${projectId}/allowance-definitions`),
  createDefinition: (projectId: string, body: Record<string, unknown>) =>
    api.post<{ definition: AllowanceDefinitionDto }>(`/api/projects/${projectId}/allowance-definitions`, body),
  updateDefinition: (id: string, body: Record<string, unknown>, changeId?: string) =>
    api.put<{ definition: AllowanceDefinitionDto }>(`/api/allowance-definitions/${id}`, body, changeId),
  deleteDefinition: (id: string) =>
    api.del<{ archived: boolean; assignmentCount: number }>(`/api/allowance-definitions/${id}`),

  // تخصیص در چهار سطح — resolve + عملیات (§۵)
  projectAllowances: (projectId: string) => api.get<ScopeAllowancesDto>(`/api/projects/${projectId}/allowances`),
  stationAllowances: (stationId: string) => api.get<ScopeAllowancesDto>(`/api/stations/${stationId}/allowances`),
  activityAllowances: (activityId: string) => api.get<ScopeAllowancesDto>(`/api/activities/${activityId}/allowances`),
  elementAllowances: (elementId: string) => api.get<ScopeAllowancesDto>(`/api/elements/${elementId}/allowances`),
  putProjectAllowances: (projectId: string, ops: AllowanceOpInput[], expectedUpdatedAt?: string) =>
    api.put<ScopeAllowancesDto>(`/api/projects/${projectId}/allowances`, { ops, expectedUpdatedAt }),
  putStationAllowances: (stationId: string, ops: AllowanceOpInput[], expectedUpdatedAt?: string) =>
    api.put<ScopeAllowancesDto>(`/api/stations/${stationId}/allowances`, { ops, expectedUpdatedAt }),
  putActivityAllowances: (activityId: string, ops: AllowanceOpInput[], expectedUpdatedAt?: string) =>
    api.put<ScopeAllowancesDto>(`/api/activities/${activityId}/allowances`, { ops, expectedUpdatedAt }),
  putElementAllowances: (elementId: string, ops: AllowanceOpInput[], expectedUpdatedAt?: string) =>
    api.put<ScopeAllowancesDto>(`/api/elements/${elementId}/allowances`, { ops, expectedUpdatedAt }),

  // گروه‌های فعالیت — فقط طبقه‌بندی (پس از migration منبع دوم محاسبه نیست)
  groups: (projectId: string) => api.get<{ items: GroupDto[] }>(`/api/projects/${projectId}/groups`),
  createGroup: (projectId: string, body: { name: string; description?: string | null }) =>
    api.post<{ group: GroupDto }>(`/api/projects/${projectId}/groups`, body),
  updateGroup: (id: string, body: Record<string, unknown>, changeId?: string) =>
    api.put<{ group: GroupDto }>(`/api/groups/${id}`, body, changeId),
  deleteGroup: (id: string) => api.del<{ deleted: boolean; removedCounts: { values: number; activities: number } }>(`/api/groups/${id}`),
}

// ── وستینگهاوس ──
export const ratingApi = {
  tables: (projectId: string) => api.get<{ items: RatingTableDto[] }>(`/api/projects/${projectId}/rating-tables`),
  table: (tableId: string) => api.get<RatingTableDetailDto>(`/api/rating-tables/${tableId}`),
  createTable: (projectId: string, body: Record<string, unknown>) =>
    api.post<{ table: RatingTableDto }>(`/api/projects/${projectId}/rating-tables`, body),
  updateTable: (id: string, body: Record<string, unknown>, changeId?: string) =>
    api.put<{ table: RatingTableDto }>(`/api/rating-tables/${id}`, body, changeId),
  deleteTable: (id: string) => api.del<{ deleted: boolean }>(`/api/rating-tables/${id}`),
  elementRating: (elementId: string) => api.get<ElementRatingDto>(`/api/elements/${elementId}/rating`),
  putElementRating: (elementId: string, body: Record<string, unknown>) =>
    api.put<ElementRatingDto>(`/api/elements/${elementId}/rating`, body),
  matrix: (projectId: string) => api.get<RatingMatrixDto>(`/api/projects/${projectId}/rating-matrix`),
}

// ── پشتیبان/تنظیمات/تاریخچه ──
export const backupsApi = {
  list: () => api.get<{ items: BackupDto[]; health: { total: number; missing: string[] } }>('/api/backups'),
  createManual: () => api.post<BackupDto>('/api/backups'),
  autoTick: () => api.post<{ skipped?: boolean }>('/api/backups?auto=1'),
  remove: (id: string) => api.del<{ deleted: boolean }>(`/api/backups/${id}`),
  restore: (id: string) => api.post(`/api/backups/${id}/restore`, { confirmReplace: true }),
  restoreUpload: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    form.append('confirmReplace', 'true')
    return fetch('/api/backups/restore-upload', { method: 'POST', body: form }).then(async (res) => {
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        const err = (data as { error?: { code?: string; message?: string } })?.error
        throw new Error(err?.message ?? 'بازیابی ناموفق بود')
      }
      return data
    })
  },
}

// ── تحلیل و کنترل کیفیت داده — فاز ۴ ──

export interface StatsDto {
  count: number
  mean: number | null
  median: number | null
  min: number | null
  max: number | null
  range: number | null
  sampleVariance: number | null
  sampleSD: number | null
  cvPercent: number | null
  q1: number | null
  q3: number | null
  iqr: number | null
  ci95: { lower: number; upper: number } | null
}

export interface OperatorComparisonRowDto {
  operatorId: string
  operatorName: string
  count: number
  mean: number | null
  sampleSD: number | null
  cvPercent: number | null
  suspectCount: number
  excludedCount: number
  nt: number | null
  st: number | null
}

export interface ElementAnalysisItemDto {
  id: string
  name: string
  elementType: string
  counts: { total: number; calcBasis: number; valid: number; suspect: number; excluded: number; invalid: number }
  stats: StatsDto
  ot: number | null
  otAggregationMethod: string
  otAggregationMethodLabel: string
  rating: { totalFactor: number; tableName: string; tableVersion: number } | null
  nt: number | null
  st: number | null
  stError: string | null
  operators: OperatorComparisonRowDto[]
  trend: { cycleNo: number; operatorId: string; value: number; status: string }[]
  histogram: { binStart: number; binEnd: number; count: number }[]
}

export interface SuspectItem {
  observationId: string
  elementId: string
  elementName: string
  cycleNo: number
  sessionId: string
  operatorId: string
  operatorName: string
  value: number | null
  score: number | null
  rule: string | null
  validityStatus: 'SUSPECT' | 'EXCLUDED'
  exclusionReason: string | null
}

export interface ActivityAnalysisDto {
  activity: {
    id: string
    name: string
    stationName: string
    processType: string
    targetSampleCount: number | null
    groupId: string | null
    groupName: string | null
    projectId: string
  }
  settings: {
    allowanceMethod: string
    allowanceMethodLabel: string
    formula: string
    aggregationMethod: string
    aggregationMethodLabel: string
    formulaVersion: string
    outlierMethod: string
    outlierThreshold: number
  }
  allowances: {
    method: string
    methodLabel: string
    formula: string
    rows: ResolvedAllowanceRowDto[]
    summary: EffectiveAllowanceSummaryDto
    perCycleTotal: number
    needsAggregation: { title: string; sourceScopeLabel: string | null; timeValueSeconds: number }[]
  }
  sampleProgress: {
    targetSampleCount: number | null
    validCycles: number | null
    totalCycles: number | null
    sessionsCount: number
    reached: boolean | null
    message: string
  }
  elements: ElementAnalysisItemDto[]
  cycleStats: { count: number; stats: StatsDto; methodNote: string }
  elementTypeTotals: { manual: number | null; machine: number | null; waiting: number | null; overlapSum: number | null }
  activityTotal: { st: number | null; status: 'OK' | 'NEEDS_AGGREGATION_RULE' | 'INCOMPLETE'; reason: string }
  suspects: SuspectItem[]
  generatedAt: string
}

export interface AnalysisActivitiesDto {
  stations: {
    id: string
    name: string
    activities: {
      id: string
      name: string
      processType: string
      targetSampleCount: number | null
      elementsCount: number
      cyclesCount: number
    }[]
  }[]
}

export interface CalculationRunInfoDto {
  id: string
  createdAt: string
  status: 'PENDING' | 'DONE' | 'STALE'
  formulaVersion: string
  settings: Record<string, unknown>
  result: Record<string, unknown> | null
}

export interface LatestCalculationInfoDto {
  run: CalculationRunInfoDto | null
  needsRecalc: boolean
  hasAnyData: boolean
  runsCount: number
}

export const analysisApi = {
  forActivity: (activityId: string) => api.get<{ analysis: ActivityAnalysisDto }>(`/api/activities/${activityId}/analysis`),
  refreshOutliers: (activityId: string) =>
    api.post<{ refreshed: number; results: { elementId: string; flagged: number; unflagged: number }[]; analysis: ActivityAnalysisDto }>(
      `/api/activities/${activityId}/refresh-outliers`
    ),
  activities: (projectId: string) => api.get<AnalysisActivitiesDto>(`/api/projects/${projectId}/analysis-activities`),
}

export const calculationsApi = {
  run: (projectId: string) => api.post<{ run: CalculationRunInfoDto }>(`/api/projects/${projectId}/calculations/run`),
  latest: (projectId: string) => api.get<LatestCalculationInfoDto>(`/api/projects/${projectId}/calculations/latest`),
}

// ── نمودار فرایند OPC/FPC — فاز ۵ / FR-20 ──

export type ChartTypeValue = 'OPC' | 'FPC'

export interface ChartNodeDto {
  id: string
  nodeType: string
  label: string
  activityId: string | null
  activityName: string | null
  stationName: string | null
  isManual: boolean
  sortOrder: number
  positionX: number
  positionY: number
}

export interface ChartEdgeDto {
  id: string
  sourceNodeId: string
  targetNodeId: string
  isChain: boolean
  sortOrder: number
}

export interface ChartDto {
  chartType: ChartTypeValue
  nodes: ChartNodeDto[]
  edges: ChartEdgeDto[]
  counts: {
    total: number
    auto: number
    manual: number
    byType: Record<string, number>
    activitiesIncluded: number
    activitiesTotal: number
  }
  canvas: { width: number; height: number }
}

export const chartsApi = {
  get: (projectId: string, chartType: ChartTypeValue) =>
    api.get<ChartDto>(`/api/projects/${projectId}/charts/${chartType}`),
  createNode: (projectId: string, chartType: ChartTypeValue, body: { label: string; nodeType: string }) =>
    api.post<{ node: { id: string } }>(`/api/projects/${projectId}/charts/${chartType}/nodes`, body),
  applyLayout: (projectId: string, chartType: ChartTypeValue) =>
    api.post<ChartDto>(`/api/projects/${projectId}/charts/${chartType}/layout`),
  moveOrder: (projectId: string, chartType: ChartTypeValue, body: { nodeId: string; direction: 'up' | 'down' }) =>
    api.post<{ moved: boolean }>(`/api/projects/${projectId}/charts/${chartType}/order`, body),
  updateNode: (nodeId: string, body: { label?: string; nodeType?: string; positionX?: number; positionY?: number }) =>
    api.patch<{ node: { id: string } }>(`/api/chart-nodes/${nodeId}`, body),
  deleteNode: (nodeId: string) => api.del<{ deleted: boolean }>(`/api/chart-nodes/${nodeId}`),
  createEdge: (projectId: string, body: { sourceNodeId: string; targetNodeId: string }) =>
    api.post<{ edge: { id: string } }>(`/api/chart-edges?projectId=${projectId}`, body),
  deleteEdge: (edgeId: string) => api.del<{ deleted: boolean }>(`/api/chart-edges/${edgeId}`),
}


// ── داشبورد و گزارش‌ها — فاز ۶ / FR-21/22 ──

export interface DashboardCardItemDto {
  key: 'st' | 'meanCycle' | 'samples' | 'target'
  title: string
  value: number | null
  unit: string
  denominator: number | null
  reason: string | null
  note: string
  tone: 'OK' | 'WARNING' | 'INFO'
}

export interface DashboardActivityRowDto {
  activityId: string
  stationName: string
  activityName: string
  processType: string
  elementsCount: number
  validCycles: number
  totalCycles: number
  target: number | null
  targetReached: boolean | null
  otSum: number | null
  st: number | null
  stStatus: 'OK' | 'NEEDS_AGGREGATION_RULE' | 'INCOMPLETE'
  stReason: string
  suspectsPending: number
}

export interface DashboardOperatorRowDto {
  operatorId: string
  operatorName: string
  observations: number
  activitiesCount: number
  suspectCount: number
  excludedCount: number
  relativeIndex: number | null
}

export interface DashboardElementCvRowDto {
  elementName: string
  activityName: string
  elementType: string
  cvPercent: number | null
  count: number
  ot: number | null
}

export interface ProjectDashboardDto {
  project: {
    id: string
    name: string
    lineName: string
    productName: string
    studyDate: string | null
    finalized: boolean
  }
  settings: { allowanceMethod: string; aggregationMethod: string }
  cards: DashboardCardItemDto[]
  activities: DashboardActivityRowDto[]
  observationStatus: { valid: number; suspect: number; excluded: number; invalid: number }
  operators: DashboardOperatorRowDto[]
  elementCv: DashboardElementCvRowDto[]
  reviewNeeds: {
    suspectsPending: number
    suspectsByActivity: { activityName: string; count: number }[]
    elementsWithoutRating: string[]
    activitiesNeedingAggregationRule: string[]
    activitiesIncomplete: string[]
    sampleShortfall: { activityName: string; valid: number; target: number }[]
    needsRecalc: boolean
    lastCalculationAt: string | null
    lastCalculationStatus: string | null
  }
  cycleSummary: { count: number; weightedMean: number | null }
  counts: { stations: number; activities: number; elements: number; operators: number; sessions: number }
  generatedAt: string
}

/** چیدمان شخصی‌سازی‌شدهٔ داشبورد — FR-21 */
export interface DashboardLayoutDto {
  cardOrder?: string[]
  hiddenCards?: string[]
  widgetOrder?: string[]
  hiddenWidgets?: string[]
}

export const dashboardApi = {
  get: (projectId: string) => api.get<ProjectDashboardDto>(`/api/projects/${projectId}/dashboard`),
  getLayout: (projectId: string) =>
    api.get<{ layout: DashboardLayoutDto | null }>(`/api/projects/${projectId}/dashboard-layout`),
  putLayout: (projectId: string, layout: DashboardLayoutDto) =>
    api.put<{ layout: DashboardLayoutDto }>(`/api/projects/${projectId}/dashboard-layout`, layout),
}

// ── گزارش مطالعه — FR-22 ──

export interface ReportRatingFactorDto {
  grade: string | null
  value: number
  label: string
}

export interface ReportElementRowDto {
  name: string
  elementTypeLabel: string
  counts: { calcBasis: number; suspect: number; excluded: number }
  stats: {
    count: number
    mean: number | null
    median: number | null
    sampleSD: number | null
    cvPercent: number | null
    ci95: { lower: number; upper: number } | null
  }
  ot: number | null
  otNote: string
  rating: {
    tableName: string
    tableVersion: number
    skill: ReportRatingFactorDto
    effort: ReportRatingFactorDto
    conditions: ReportRatingFactorDto
    consistency: ReportRatingFactorDto
    totalFactor: number
  } | null
  nt: number | null
  st: number | null
  stError: string | null
  operatorsCount: number
}

export interface ReportSuspectDto {
  observationId: string
  elementName: string
  cycleNo: number
  operatorName: string
  value: number | null
  score: number | null
  rule: string | null
  validityStatus: 'SUSPECT' | 'EXCLUDED'
  exclusionReason: string | null
}

export interface ReportActivitySectionDto {
  activity: {
    id: string
    name: string
    stationName: string
    processTypeLabel: string
    groupName: string | null
    description: string | null
    targetSampleCount: number | null
  }
  methods: { methodKey: string; methodLabel: string; sessionsCount: number; operators: string[] }[]
  sampleProgress: {
    targetSampleCount: number | null
    validCycles: number
    totalCycles: number
    sessionsCount: number
    reached: boolean | null
    message: string
  }
  allowances: {
    methodLabel: string
    formula: string
    hasGroup: boolean
    groupName: string | null
    totalA: number
    categories: {
      categoryId: string
      name: string
      code: string | null
      isActive: boolean
      source: string
      sourceLabel: string
      groupValue: number | null
      overrideValue: number | null
      effectiveValue: number | null
    }[]
  }
  elements: ReportElementRowDto[]
  activityTotal: { st: number | null; status: 'OK' | 'NEEDS_AGGREGATION_RULE' | 'INCOMPLETE'; reason: string }
  cycleStats: { count: number | null; mean: number | null; sampleSD: number | null; cvPercent: number | null; methodNote: string }
  suspects: ReportSuspectDto[]
}

export interface StudyReportInfoDto {
  reportMeta: {
    title: string
    generatedAt: string
    activityFilter: { id: string; name: string } | null
    operatorFilter: { id: string; name: string } | null
    operatorNote: string | null
  }
  project: {
    name: string
    lineName: string
    productName: string
    studyDate: string | null
    statusLabel: string
    description: string | null
    finalized: boolean
    finalizationReason: string | null
  }
  assumptions: {
    allowanceMethodLabel: string
    stFormula: string
    stFormulaConstraint: string | null
    aggregationMethodLabel: string
    outlierMethodLabel: string
    outlierThresholdLabel: string
    formulaVersion: string
    westinghouseNote: string
  }
  activities: ReportActivitySectionDto[]
  flags: {
    pendingSuspects: number
    needsRecalc: boolean
    lastCalculationAt: string | null
    lastCalculationStatus: string | null
    activitiesNeedingAggregationRule: string[]
    activitiesIncomplete: string[]
    sampleTargetsNotReached: string[]
    elementsUnrated: string[]
    anyStError: boolean
  }
  disclaimer: string
}

export interface ReportSelectionDto {
  stations: { id: string; name: string; activities: { id: string; name: string; hasData: boolean }[] }[]
  operators: { id: string; name: string; hasData: boolean }[]
  sessionsCount: number
}

export type ExcelReportTypeValue = 'overview' | 'summary' | 'operators' | 'raw'

export const EXCEL_REPORT_LABELS: Record<ExcelReportTypeValue, string> = {
  overview: 'نگاه کل پروژه',
  summary: 'خلاصهٔ محاسبات (عناصر)',
  operators: 'مقایسهٔ اپراتورها',
  raw: 'داده‌های خام مشاهدات',
}

export const reportsApi = {
  selection: (projectId: string) =>
    api.get<ReportSelectionDto>(`/api/projects/${projectId}/reports/study?mode=selection`),
  study: (projectId: string, opts: { activityId?: string; operatorId?: string } = {}) => {
    const params = new URLSearchParams()
    if (opts.activityId) params.set('activityId', opts.activityId)
    if (opts.operatorId) params.set('operatorId', opts.operatorId)
    const qs = params.toString()
    return api.get<StudyReportInfoDto>(`/api/projects/${projectId}/reports/study${qs ? `?${qs}` : ''}`)
  },
  /** آدرس دانلود Excel — با window.open باز شود تا فایل دانلود شود */
  excelUrl: (
    projectId: string,
    type: ExcelReportTypeValue,
    opts: { activityId?: string; operatorId?: string } = {}
  ) => {
    const params = new URLSearchParams({ type })
    if (opts.activityId) params.set('activityId', opts.activityId)
    if (opts.operatorId) params.set('operatorId', opts.operatorId)
    return `/api/projects/${projectId}/reports/excel?${params.toString()}`
  },
}


export const settingsApi = {
  get: () => api.get<AppSettingsDto>('/api/settings'),
  put: (values: Record<string, string>) => api.put<AppSettingsDto>('/api/settings', values),
}

export const auditApi = {
  list: (projectId?: string, limit = 100) =>
    api.get<{ items: AuditDto[]; total: number }>(`/api/audit?limit=${limit}${projectId ? `&projectId=${projectId}` : ''}`),
}
