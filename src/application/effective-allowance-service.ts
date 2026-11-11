// ═══════════════════════════════════════════════════════════
// سرویس الونس‌های سلسله‌مراتبی — جلسه اول بازطراحی
// • تعریف مرکزی الونس‌ها (تفکیک از تخصیص — §۲.۲)
// • تخصیص در چهار scope: PROJECT/LINE, STATION, ACTIVITY, WORK_ELEMENT
// • Override / Exclude / Restore (§۲.۴)
// • resolve از والدها — بدون ذخیره کپی تکراری (§۲.۴ قاعده ۱۰)
// • migration از مدل قدیمی GroupAllowance/ActivityAllowanceOverride (§۴)
// • mark stale محاسبات و snapshot تاریخی از طریق CalculationRun
// ═══════════════════════════════════════════════════════════
import { db } from '@/lib/db'
import {
  AppError,
  ALLOWANCE_METHOD_LABELS,
  ALLOWANCE_METHOD_FORMULAS,
  ALLOWANCE_SCOPE_LABELS,
  PROJECT_SETTING_KEYS,
  DEFAULT_PROJECT_SETTINGS,
  type AllowanceMethod,
  type AllowanceScopeType,
  type AllowanceBasis,
  type AllowanceValueType,
} from '@/domain/types'
import { recordAudit } from '@/infrastructure/audit'
import { getProjectSettings } from './settings-service'
import type { AllowanceDefinitionCreateInput, AllowanceDefinitionUpdateInput, AllowanceOpsPutInput } from '@/domain/validation'
import {
  resolveEffectiveAllowances,
  validateAssignmentValue,
  type AllowanceDefinitionLike,
  type AllowanceAssignmentLike,
  type ScopeChain,
  type ResolvedAllowances,
  type ResolvedAllowanceRow,
  type EffectiveAllowanceSummary,
} from '@/calculation/effective-allowances'

// ── DTO ──

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

export interface LocalAssignmentDto {
  definitionId: string
  mode: string
  valueType: string
  percentValue: number | null
  timeValueSeconds: number | null
  applicationBasis: string | null
  updatedAt: string
}

export interface ScopeAllowancesDto {
  scope: { type: AllowanceScopeType; id: string; label: string; projectId: string }
  /** زنجیره والد از ریشه به این scope — برای نمایش مبدأ */
  chain: { type: AllowanceScopeType; id: string; label: string }[]
  /** شمارش زیرشاخه‌های متأثر برای پیام عملیات ساختاری (§۶) */
  descendants: { stations: number; activities: number; elements: number }
  settings: { method: AllowanceMethod; methodLabel: string; formula: string }
  definitions: AllowanceDefinitionDto[]
  resolved: {
    rows: ResolvedAllowanceRow[]
    summary: EffectiveAllowanceSummary
  }
  localAssignments: LocalAssignmentDto[]
  /** آخرین تغییر تخصیص‌های محلی — کنترل هم‌زمانی ۶.۶ */
  lastModifiedAt: string | null
}

export interface MigrationReport {
  projectId: string
  migrated: boolean
  definitionsCreated: number
  assignmentsCreated: number
  activitiesProcessed: number
  skippedInactiveCategories: number
  issues: string[]
}

// ── کمکی‌ها ──

async function assertProject(projectId: string) {
  const p = await db.project.findUnique({ where: { id: projectId }, select: { id: true, name: true, lineName: true } })
  if (!p) throw new AppError('PROJECT_NOT_FOUND', 'پروژه یافت نشد.', 404)
  return p
}

async function getMethod(projectId: string): Promise<AllowanceMethod> {
  const settings = await getProjectSettings(projectId)
  return (settings[PROJECT_SETTING_KEYS.allowanceMethod] ??
    DEFAULT_PROJECT_SETTINGS[PROJECT_SETTING_KEYS.allowanceMethod]) as AllowanceMethod
}

/** مارکر migration — تکرارپذیری (§۴.۱.۲) */
const MIGRATION_MARKER_KEY = 'migration.allowanceModel'
const MIGRATION_MARKER_VALUE = 'v2'

// ── بافت scope — زنجیره والد و اعتبارسنجی تعلق به پروژه (§۵) ──

interface ScopeContext {
  projectId: string
  projectName: string
  scopeLabel: string
  chain: ScopeChain
  descendants: { stations: number; activities: number; elements: number }
}

async function getScopeContext(scopeType: AllowanceScopeType, scopeId: string): Promise<ScopeContext> {
  if (scopeType === 'PROJECT') {
    const p = await db.project.findUnique({
      where: { id: scopeId },
      select: { id: true, name: true, _count: { select: { stations: true } } },
    })
    if (!p) throw new AppError('PROJECT_NOT_FOUND', 'پروژه یافت نشد.', 404)
    const stations = await db.station.findMany({
      where: { projectId: scopeId },
      select: { _count: { select: { activities: true } } },
    })
    const activities = stations.reduce((s, st) => s + st._count.activities, 0)
    const elements = await db.workElement.count({ where: { activity: { station: { projectId: scopeId } } } })
    return {
      projectId: p.id,
      projectName: p.name,
      scopeLabel: p.name,
      chain: [{ type: 'PROJECT', id: p.id, label: p.name }],
      descendants: { stations: p._count.stations, activities, elements },
    }
  }

  if (scopeType === 'STATION') {
    const s = await db.station.findUnique({
      where: { id: scopeId },
      include: {
        project: { select: { id: true, name: true } },
        _count: { select: { activities: true } },
      },
    })
    if (!s) throw new AppError('STATION_NOT_FOUND', 'ایستگاه یافت نشد.', 404)
    const elements = await db.workElement.count({ where: { activity: { stationId: scopeId } } })
    return {
      projectId: s.project.id,
      projectName: s.project.name,
      scopeLabel: s.name,
      chain: [
        { type: 'PROJECT', id: s.project.id, label: s.project.name },
        { type: 'STATION', id: s.id, label: s.name },
      ],
      descendants: { stations: 0, activities: s._count.activities, elements },
    }
  }

  if (scopeType === 'ACTIVITY') {
    const a = await db.activity.findUnique({
      where: { id: scopeId },
      include: {
        station: { select: { id: true, name: true, project: { select: { id: true, name: true } } } },
        _count: { select: { workElements: true } },
      },
    })
    if (!a) throw new AppError('ACTIVITY_NOT_FOUND', 'فعالیت یافت نشد.', 404)
    return {
      projectId: a.station.project.id,
      projectName: a.station.project.name,
      scopeLabel: a.name,
      chain: [
        { type: 'PROJECT', id: a.station.project.id, label: a.station.project.name },
        { type: 'STATION', id: a.station.id, label: a.station.name },
        { type: 'ACTIVITY', id: a.id, label: a.name },
      ],
      descendants: { stations: 0, activities: 0, elements: a._count.workElements },
    }
  }

  // WORK_ELEMENT
  const e = await db.workElement.findUnique({
    where: { id: scopeId },
    include: {
      activity: {
        select: {
          id: true,
          name: true,
          station: { select: { id: true, name: true, project: { select: { id: true, name: true } } } },
        },
      },
    },
  })
  if (!e) throw new AppError('ELEMENT_NOT_FOUND', 'عنصر کاری یافت نشد.', 404)
  return {
    projectId: e.activity.station.project.id,
    projectName: e.activity.station.project.name,
    scopeLabel: e.name,
    chain: [
      { type: 'PROJECT', id: e.activity.station.project.id, label: e.activity.station.project.name },
      { type: 'STATION', id: e.activity.station.id, label: e.activity.station.name },
      { type: 'ACTIVITY', id: e.activity.id, label: e.activity.name },
      { type: 'WORK_ELEMENT', id: e.id, label: e.name },
    ],
    descendants: { stations: 0, activities: 0, elements: 0 },
  }
}

// ── بافت پروژه — تعریف‌ها + تخصیص‌ها + روش محاسبه (بارگذاری یکجا) ──

export interface ProjectAllowanceContext {
  projectId: string
  method: AllowanceMethod
  definitions: AllowanceDefinitionLike[]
  assignments: AllowanceAssignmentLike[]
  definitionById: Map<string, AllowanceDefinitionLike>
}

export async function loadProjectAllowanceContext(projectId: string): Promise<ProjectAllowanceContext> {
  await assertProject(projectId)
  // self-heal: داده قدیمی فراریوشده (import/restore بسته‌های قدیمی) خودکار مهاجرت می‌شود
  await migrateProjectAllowancesIfNeeded(projectId)

  const [defs, assignments, method] = await Promise.all([
    db.allowanceDefinition.findMany({ where: { projectId }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }),
    db.allowanceAssignment.findMany({
      where: { definition: { projectId } },
      include: { definition: { select: { projectId: true } } },
    }),
    getMethod(projectId),
  ])

  const definitions: AllowanceDefinitionLike[] = defs.map((d) => ({
    id: d.id,
    title: d.title,
    code: d.code,
    description: d.description,
    isActive: d.isActive && !d.isArchived,
    sortOrder: d.sortOrder,
    defaultValueType: d.defaultValueType,
    defaultValuePercent: d.defaultValuePercent,
    defaultTimeSeconds: d.defaultTimeSeconds,
  }))

  return {
    projectId,
    method,
    definitions,
    assignments: assignments.map((a) => ({
      definitionId: a.definitionId,
      scopeType: a.scopeType as AllowanceScopeType,
      scopeId: a.scopeId,
      mode: a.mode as 'ACTIVE' | 'EXCLUDE',
      valueType: a.valueType as AllowanceValueType,
      percentValue: a.percentValue,
      timeValueSeconds: a.timeValueSeconds,
      applicationBasis: a.applicationBasis as AllowanceBasis | null,
    })),
    definitionById: new Map(definitions.map((d) => [d.id, d])),
  }
}

// ── خواندن تخصیص‌های یک scope + resolve ──

function toDefinitionDto(
  d: {
    id: string; title: string; code: string | null; description: string | null
    defaultValueType: string | null; defaultValuePercent: number | null; defaultTimeSeconds: number | null
    isActive: boolean; isArchived: boolean; sortOrder: number
    createdAt: Date; updatedAt: Date
    _count?: { assignments: number }
  },
  assignmentCount?: number
): AllowanceDefinitionDto {
  return {
    id: d.id,
    title: d.title,
    code: d.code,
    description: d.description,
    defaultValueType: d.defaultValueType,
    defaultValuePercent: d.defaultValuePercent,
    defaultTimeSeconds: d.defaultTimeSeconds,
    isActive: d.isActive,
    isArchived: d.isArchived,
    sortOrder: d.sortOrder,
    assignmentCount: assignmentCount ?? d._count?.assignments ?? 0,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  }
}

export async function getScopeAllowances(scopeType: AllowanceScopeType, scopeId: string): Promise<ScopeAllowancesDto> {
  const ctx = await getScopeContext(scopeType, scopeId)
  const [context, defsRaw, localAssignments] = await Promise.all([
    loadProjectAllowanceContext(ctx.projectId),
    db.allowanceDefinition.findMany({
      where: { projectId: ctx.projectId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: { _count: { select: { assignments: true } } },
    }),
    db.allowanceAssignment.findMany({ where: { scopeType, scopeId } }),
  ])

  const resolved = resolveEffectiveAllowances({
    definitions: context.definitions,
    assignments: context.assignments,
    chain: ctx.chain,
  })

  const lastModifiedAt =
    localAssignments.length > 0
      ? new Date(Math.max(...localAssignments.map((a) => a.updatedAt.getTime()))).toISOString()
      : null

  return {
    scope: { type: scopeType, id: scopeId, label: ctx.scopeLabel, projectId: ctx.projectId },
    chain: ctx.chain,
    descendants: ctx.descendants,
    settings: {
      method: context.method,
      methodLabel: ALLOWANCE_METHOD_LABELS[context.method],
      formula: ALLOWANCE_METHOD_FORMULAS[context.method],
    },
    definitions: defsRaw.map((d) => toDefinitionDto(d)),
    resolved: { rows: resolved.rows, summary: resolved.summary },
    localAssignments: localAssignments.map((a) => ({
      definitionId: a.definitionId,
      mode: a.mode,
      valueType: a.valueType,
      percentValue: a.percentValue,
      timeValueSeconds: a.timeValueSeconds,
      applicationBasis: a.applicationBasis,
      updatedAt: a.updatedAt.toISOString(),
    })),
    lastModifiedAt,
  }
}

// ── اعتبارسنجی مجموع پس از تغییر — روش ۲ (A < ۱) روی همه عناصر متأثر ──

async function validateShareOfStForScope(
  ctx: ScopeContext,
  definitions: AllowanceDefinitionLike[],
  assignments: AllowanceAssignmentLike[],
  method: AllowanceMethod
): Promise<void> {
  if (method !== 'SHARE_OF_ST') return
  // عناصر متأثر این scope
  const elements = await db.workElement.findMany({
    where:
      ctx.chain[ctx.chain.length - 1].type === 'PROJECT'
        ? { activity: { station: { projectId: ctx.projectId } } }
        : ctx.chain[ctx.chain.length - 1].type === 'STATION'
          ? { activity: { stationId: ctx.chain[1].id } }
          : ctx.chain[ctx.chain.length - 1].type === 'ACTIVITY'
            ? { activityId: ctx.chain[2].id }
            : { id: ctx.chain[3].id },
    include: {
      activity: { select: { id: true, name: true, station: { select: { id: true, name: true, project: { select: { id: true, name: true } } } } } },
    },
  })
  const violations: string[] = []
  const projectLink = ctx.chain[0]
  for (const el of elements) {
    const chain: ScopeChain = [
      projectLink,
      { type: 'STATION', id: el.activity.station.id, label: el.activity.station.name },
      { type: 'ACTIVITY', id: el.activity.id, label: el.activity.name },
      { type: 'WORK_ELEMENT', id: el.id, label: el.name },
    ]
    const r = resolveEffectiveAllowances({ definitions, assignments, chain })
    if (r.summary.totalPercent >= 1) violations.push(`«${el.name}» (${el.activity.name})`)
  }
  if (violations.length > 0) {
    throw new AppError(
      'ALLOWANCE_TOO_HIGH',
      `در روش «سهم از زمان استاندارد» مجموع مجازها باید کمتر از ۱۰۰٪ باشد. ${violations.length} عنصر کاری زیرمجموعه دارای مجموع غیرمجاز است: ${violations.slice(0, 5).join('، ')}${violations.length > 5 ? ' و …' : ''}`,
      422,
      { violations }
    )
  }
}

// ── ثبت عملیات تخصیص (§۶) ──

function defaultBasisForScope(scopeType: AllowanceScopeType): AllowanceBasis {
  // پیش‌فرض سند: الونس زمانی عنصر → PER_ELEMENT_EXECUTION؛
  // سطح‌های بالاتر (شخصی/شیفتی) → PER_CYCLE تا در زمان تک‌تک عناصر ضرب نشود (§۲.۳)
  return scopeType === 'WORK_ELEMENT' ? 'PER_ELEMENT_EXECUTION' : 'PER_CYCLE'
}

/** اعمال عملیات روی فهرست تخصیص در حافظه — برای اعتبارسنجی پیش از commit */
function applyOpsInMemory(
  assignments: AllowanceAssignmentLike[],
  ops: AllowanceOpsPutInput['ops'],
  scopeType: AllowanceScopeType,
  scopeId: string
): AllowanceAssignmentLike[] {
  const keyOf = (definitionId: string, type: string, id: string) => `${definitionId}|${type}|${id}`
  const map = new Map(assignments.map((a) => [keyOf(a.definitionId, a.scopeType, a.scopeId), a]))
  for (const op of ops) {
    const k = keyOf(op.definitionId, scopeType, scopeId)
    if (op.action === 'SET') {
      const valueType = op.valueType as AllowanceValueType
      const basis: AllowanceBasis | null =
        valueType === 'FIXED_TIME' ? (op.applicationBasis ?? defaultBasisForScope(scopeType)) : null
      map.set(k, {
        definitionId: op.definitionId,
        scopeType,
        scopeId,
        mode: 'ACTIVE',
        valueType,
        percentValue: valueType === 'PERCENT' ? (op.percentValue ?? null) : null,
        timeValueSeconds: valueType === 'FIXED_TIME' ? (op.timeValueSeconds ?? null) : null,
        applicationBasis: basis,
      })
    } else if (op.action === 'EXCLUDE') {
      map.set(k, {
        definitionId: op.definitionId,
        scopeType,
        scopeId,
        mode: 'EXCLUDE',
        valueType: 'PERCENT',
        percentValue: null,
        timeValueSeconds: null,
        applicationBasis: null,
      })
    } else {
      map.delete(k)
    }
  }
  return [...map.values()]
}

export async function putScopeAllowanceOps(
  scopeType: AllowanceScopeType,
  scopeId: string,
  input: AllowanceOpsPutInput
): Promise<ScopeAllowancesDto> {
  const ctx = await getScopeContext(scopeType, scopeId)
  const context = await loadProjectAllowanceContext(ctx.projectId)
  const method = context.method

  // کنترل هم‌زمانی — آخرین تغییر تخصیص‌های همین scope
  if (input.expectedUpdatedAt) {
    const existing = await db.allowanceAssignment.findMany({ where: { scopeType, scopeId } })
    if (existing.length > 0) {
      const latest = Math.max(...existing.map((a) => a.updatedAt.getTime()))
      if (Math.abs(latest - new Date(input.expectedUpdatedAt).getTime()) > 1000) {
        throw new AppError('CONFLICT', 'تخصیص‌های این بخش جای دیگری تغییر کرده؛ تازه‌سازی کنید.', 409)
      }
    }
  }

  // اعتبارسنجی تعلق تعریف‌ها به پروژه (§۵)
  for (const op of input.ops) {
    const def = context.definitionById.get(op.definitionId)
    if (!def) {
      const raw = await db.allowanceDefinition.findUnique({ where: { id: op.definitionId } })
      if (!raw) throw new AppError('DEFINITION_NOT_FOUND', 'تعریف الونس یافت نشد.', 404)
      throw new AppError('DEFINITION_NOT_IN_PROJECT', 'تعریف الونس به این پروژه تعلق ندارد.', 422)
    }
  }

  // اعتبارسنجی مقدار و مجموع — قبل از commit (تا حالت نامعتبر ذخیره نشود)
  for (const op of input.ops) {
    if (op.action !== 'SET') continue
    const valueType = op.valueType as AllowanceValueType
    const basis: AllowanceBasis | null =
      valueType === 'FIXED_TIME' ? (op.applicationBasis ?? defaultBasisForScope(scopeType)) : null
    validateAssignmentValue({
      mode: 'ACTIVE',
      valueType,
      percentValue: op.percentValue ?? null,
      timeValueSeconds: op.timeValueSeconds ?? null,
      applicationBasis: basis,
    })
  }
  const virtualAssignments = applyOpsInMemory(context.assignments, input.ops, scopeType, scopeId)
  await validateShareOfStForScope(ctx, context.definitions, virtualAssignments, method)

  await db.$transaction(async (tx) => {
    for (const op of input.ops) {
      if (op.action === 'SET') {
        const valueType = op.valueType as AllowanceValueType
        const basis: AllowanceBasis | null =
          valueType === 'FIXED_TIME' ? (op.applicationBasis ?? defaultBasisForScope(scopeType)) : null
        const data = {
          mode: 'ACTIVE',
          valueType,
          percentValue: valueType === 'PERCENT' ? (op.percentValue as number) : null,
          timeValueSeconds: valueType === 'FIXED_TIME' ? (op.timeValueSeconds as number) : null,
          applicationBasis: basis,
        }
        const existing = await tx.allowanceAssignment.findUnique({
          where: { definitionId_scopeType_scopeId: { definitionId: op.definitionId, scopeType, scopeId } },
        })
        if (existing) {
          await tx.allowanceAssignment.update({ where: { id: existing.id }, data })
        } else {
          await tx.allowanceAssignment.create({
            data: { definitionId: op.definitionId, scopeType, scopeId, ...data },
          })
        }
      } else if (op.action === 'EXCLUDE') {
        const existing = await tx.allowanceAssignment.findUnique({
          where: { definitionId_scopeType_scopeId: { definitionId: op.definitionId, scopeType, scopeId } },
        })
        const data = { mode: 'EXCLUDE', valueType: 'PERCENT', percentValue: null, timeValueSeconds: null, applicationBasis: null }
        if (existing) {
          await tx.allowanceAssignment.update({ where: { id: existing.id }, data })
        } else {
          await tx.allowanceAssignment.create({
            data: { definitionId: op.definitionId, scopeType, scopeId, ...data },
          })
        }
      } else {
        // RESTORE / REMOVE — حذف تصمیم محلی و بازگشت به مقدار والد (قاعده ۷)
        await tx.allowanceAssignment.deleteMany({ where: { definitionId: op.definitionId, scopeType, scopeId } })
      }
    }
  })

  // تغییر الونس بر محاسبات اثر دارد — FR-27
  await db.calculationRun.updateMany({ where: { projectId: ctx.projectId }, data: { status: 'STALE' } })

  await recordAudit({
    entityType: 'AllowanceAssignment',
    entityId: `${scopeType}:${scopeId}`,
    action: 'UPDATE',
    entityName: `تخصیص الونس — ${ALLOWANCE_SCOPE_LABELS[scopeType]} «${ctx.scopeLabel}»`,
    after: { ops: input.ops },
    projectId: ctx.projectId,
  })

  return getScopeAllowances(scopeType, scopeId)
}

// ── CRUD تعریف مرکزی ──

export async function listDefinitions(projectId: string): Promise<AllowanceDefinitionDto[]> {
  await assertProject(projectId)
  const defs = await db.allowanceDefinition.findMany({
    where: { projectId },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    include: { _count: { select: { assignments: true } } },
  })
  return defs.map((d) => toDefinitionDto(d))
}

export async function createDefinition(projectId: string, input: AllowanceDefinitionCreateInput): Promise<AllowanceDefinitionDto> {
  await assertProject(projectId)
  const def = await db.allowanceDefinition.create({
    data: {
      projectId,
      title: input.title,
      code: input.code ?? null,
      description: input.description ?? null,
      defaultValueType: input.defaultValueType ?? null,
      defaultValuePercent: input.defaultValuePercent ?? null,
      defaultTimeSeconds: input.defaultTimeSeconds ?? null,
      isActive: input.isActive,
      sortOrder: input.sortOrder,
    },
  })
  await recordAudit({
    entityType: 'AllowanceDefinition', entityId: def.id, action: 'CREATE', entityName: def.title,
    after: { title: def.title, defaultValueType: def.defaultValueType }, projectId,
  })
  return toDefinitionDto(def, 0)
}

export async function updateDefinition(definitionId: string, input: AllowanceDefinitionUpdateInput): Promise<AllowanceDefinitionDto> {
  const existing = await db.allowanceDefinition.findUnique({ where: { id: definitionId } })
  if (!existing) throw new AppError('DEFINITION_NOT_FOUND', 'تعریف الونس یافت نشد.', 404)
  if (input.expectedUpdatedAt) {
    const expected = new Date(input.expectedUpdatedAt).getTime()
    if (Math.abs(existing.updatedAt.getTime() - expected) > 1000) {
      throw new AppError('CONFLICT', 'این تعریف جای دیگری تغییر کرده؛ تازه‌سازی کنید.', 409)
    }
  }
  const data: Record<string, unknown> = {}
  if (input.title !== undefined) data.title = input.title
  if (input.code !== undefined) data.code = input.code
  if (input.description !== undefined) data.description = input.description
  if (input.isActive !== undefined) data.isActive = input.isActive
  if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder
  if (input.isArchived !== undefined) data.isArchived = input.isArchived
  if (input.defaultValueType !== undefined) {
    data.defaultValueType = input.defaultValueType ?? null
    data.defaultValuePercent = input.defaultValuePercent ?? null
    data.defaultTimeSeconds = input.defaultTimeSeconds ?? null
  } else {
    // به‌روزرسانی جزئی مقدار پیش‌فرض بدون تغییر نوع — فقط همان فیلد
    if (input.defaultValuePercent !== undefined) data.defaultValuePercent = input.defaultValuePercent ?? null
    if (input.defaultTimeSeconds !== undefined) data.defaultTimeSeconds = input.defaultTimeSeconds ?? null
  }
  const updated = await db.allowanceDefinition.update({ where: { id: definitionId }, data })
  // تغییر تعریف فعال بر محاسبات اثر دارد — FR-27
  await db.calculationRun.updateMany({ where: { projectId: existing.projectId }, data: { status: 'STALE' } })
  await recordAudit({
    entityType: 'AllowanceDefinition', entityId: definitionId, action: 'UPDATE', entityName: updated.title,
    before: { title: existing.title, isActive: existing.isActive, isArchived: existing.isArchived },
    after: { title: updated.title, isActive: updated.isActive, isArchived: updated.isArchived },
    projectId: existing.projectId,
  })
  return toDefinitionDto(updated)
}

/**
 * حذف تعریف مرکزی — سیاست آرشیو (§۲.۲):
 * تعریف دارای تخصیص/سابقه بایگانی می‌شود (isArchived) تا سوابق تخصیص و
 * snapshotهای تاریخی نابود نشوند؛ تعریف بدون سابقه واقعاً حذف می‌شود.
 */
export async function deleteDefinition(definitionId: string): Promise<{ archived: boolean; assignmentCount: number }> {
  const existing = await db.allowanceDefinition.findUnique({
    where: { id: definitionId },
    include: { _count: { select: { assignments: true } } },
  })
  if (!existing) throw new AppError('DEFINITION_NOT_FOUND', 'تعریف الونس یافت نشد.', 404)
  const assignmentCount = existing._count.assignments
  if (assignmentCount > 0) {
    await db.allowanceDefinition.update({
      where: { id: definitionId },
      data: { isArchived: true, isActive: false },
    })
    await db.calculationRun.updateMany({ where: { projectId: existing.projectId }, data: { status: 'STALE' } })
    await recordAudit({
      entityType: 'AllowanceDefinition', entityId: definitionId, action: 'UPDATE', entityName: existing.title,
      before: { isArchived: false }, after: { isArchived: true, reason: 'حذف با سابقه → آرشیو' },
      projectId: existing.projectId,
    })
    return { archived: true, assignmentCount }
  }
  await db.allowanceDefinition.delete({ where: { id: definitionId } })
  await recordAudit({
    entityType: 'AllowanceDefinition', entityId: definitionId, action: 'DELETE', entityName: existing.title,
    projectId: existing.projectId,
  })
  return { archived: false, assignmentCount: 0 }
}

// ── migration از مدل قدیمی (§۴) ──

/**
 * مهاجرت پروژه از مدل گروه/دسته/بازنویسی به مدل مرکزی سلسله‌مراتبی.
 * • دسته‌ها → تعریف مرکزی (حفظ ID — §۴.۱.۳)
 * • مقدار مؤثر قدیم هر فعالیت (دسته فعال + GroupAllowance + اولویت
 *   ActivityAllowanceOverride) → تخصیص سطح ACTIVITY (§۴.۱.۵/۶)
 * • WorkElement بدون تخصیص تکراری — از Activity ارث می‌برد (§۴.۱.۷)
 * • قابل تکرار — مارکر ProjectSetting (§۴.۱.۲)
 * • داده قدیمی حذف نمی‌شود (§۴.۱.۸) — legacy می‌ماند
 */
export async function migrateProjectAllowancesIfNeeded(projectId: string): Promise<MigrationReport> {
  const marker = await db.projectSetting.findUnique({
    where: { projectId_key: { projectId, key: MIGRATION_MARKER_KEY } },
  })
  if (marker?.value === MIGRATION_MARKER_VALUE) {
    return { projectId, migrated: false, definitionsCreated: 0, assignmentsCreated: 0, activitiesProcessed: 0, skippedInactiveCategories: 0, issues: [] }
  }

  const issues: string[] = []
  let definitionsCreated = 0
  let assignmentsCreated = 0
  let skippedInactiveCategories = 0

  const [categories, activities] = await Promise.all([
    db.allowanceCategory.findMany({ where: { projectId }, orderBy: { sortOrder: 'asc' } }),
    db.activity.findMany({
      where: { station: { projectId } },
      include: {
        group: { include: { groupAllowances: true } },
        allowanceOverrides: true,
      },
    }),
  ])

  await db.$transaction(async (tx) => {
    // ۱. دسته‌ها → تعریف مرکزی (حفظ ID)
    for (const cat of categories) {
      const existing = await tx.allowanceDefinition.findUnique({ where: { id: cat.id } })
      if (existing) continue
      await tx.allowanceDefinition.create({
        data: {
          id: cat.id, // حفظ ID دسته — ارتباط سوابق حفظ می‌شود (§۴.۱.۳)
          projectId,
          title: cat.name,
          code: cat.code,
          description: null,
          defaultValueType: null,
          defaultValuePercent: null,
          defaultTimeSeconds: null,
          isActive: cat.isActive,
          sortOrder: cat.sortOrder,
        },
      })
      definitionsCreated++
    }

    // ۲. مقدار مؤثر قدیم فعالیت‌ها → تخصیص ACTIVITY
    for (const activity of activities) {
      for (const cat of categories) {
        if (!cat.isActive) {
          // دسته غیرفعال در مدل قدیم در A لحاظ نمی‌شد — بدون داده ساختگی (§۴.۱.۱۱)
          if (activity.group?.groupAllowances.some((g) => g.categoryId === cat.id) ||
              activity.allowanceOverrides.some((o) => o.categoryId === cat.id)) {
            skippedInactiveCategories++
          }
          continue
        }
        const groupValue = activity.group?.groupAllowances.find((g) => g.categoryId === cat.id)?.percentValue ?? null
        const overrideValue = activity.allowanceOverrides.find((o) => o.categoryId === cat.id)?.percentValue ?? null
        const effective = overrideValue !== null ? overrideValue : groupValue
        if (effective === null) continue

        const existing = await tx.allowanceAssignment.findUnique({
          where: { definitionId_scopeType_scopeId: { definitionId: cat.id, scopeType: 'ACTIVITY', scopeId: activity.id } },
        })
        if (existing) continue // اجرای مجدد داده را دوبرابر نمی‌کند (§۱۰.۳)
        await tx.allowanceAssignment.create({
          data: {
            definitionId: cat.id,
            scopeType: 'ACTIVITY',
            scopeId: activity.id,
            mode: 'ACTIVE',
            valueType: 'PERCENT',
            percentValue: effective,
            timeValueSeconds: null,
            applicationBasis: null,
          },
        })
        assignmentsCreated++
      }
    }

    // ۳. مارکر — تکرارپذیری
    await tx.projectSetting.upsert({
      where: { projectId_key: { projectId, key: MIGRATION_MARKER_KEY } },
      create: { projectId, key: MIGRATION_MARKER_KEY, value: MIGRATION_MARKER_VALUE },
      update: { value: MIGRATION_MARKER_VALUE },
    })
  })

  if (categories.some((c) => !c.isActive)) {
    issues.push(`${skippedInactiveCategories} مقدار متنعلق به دسته غیرفعال نادیده گرفته شد (مطابق قاعده قدیمی: دسته غیرفعال در A لحاظ نمی‌شد).`)
  }

  const report: MigrationReport = {
    projectId,
    migrated: true,
    definitionsCreated,
    assignmentsCreated,
    activitiesProcessed: activities.length,
    skippedInactiveCategories,
    issues,
  }
  if (definitionsCreated > 0 || assignmentsCreated > 0) {
    await recordAudit({
      entityType: 'Project', entityId: projectId, action: 'UPDATE',
      entityName: 'مهاجرت الونس‌ها به مدل سلسله‌مراتبی',
      after: { definitionsCreated, assignmentsCreated, activitiesProcessed: activities.length },
      projectId,
    })
  }
  return report
}

/** اجرای مهاجرت روی همه پروژه‌ها — اسکریپت/گزارش */
export async function migrateAllProjects(): Promise<MigrationReport[]> {
  const projects = await db.project.findMany({ select: { id: true } })
  const reports: MigrationReport[] = []
  for (const p of projects) {
    reports.push(await migrateProjectAllowancesIfNeeded(p.id))
  }
  return reports
}

// ── resolve برای تحلیل/گزارش — بارگذاری یکجا per activity ──

export interface ActivityAllowanceResolution {
  projectId: string
  method: AllowanceMethod
  methodLabel: string
  formula: string
  /** resolve در سطح فعالیت (زنجیره پروژه→ایستگاه→فعالیت) */
  activity: ResolvedAllowances
  /** resolve هر عنصر (زنجیره کامل) */
  elements: Map<string, ResolvedAllowances>
}

export async function resolveForActivity(activityId: string): Promise<ActivityAllowanceResolution> {
  const activity = await db.activity.findUnique({
    where: { id: activityId },
    include: {
      station: { select: { id: true, name: true, project: { select: { id: true, name: true } } } },
      workElements: { select: { id: true, name: true }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
    },
  })
  if (!activity) throw new AppError('ACTIVITY_NOT_FOUND', 'فعالیت یافت نشد.', 404)

  const context = await loadProjectAllowanceContext(activity.station.project.id)
  const projectLink = { type: 'PROJECT' as const, id: activity.station.project.id, label: activity.station.project.name }
  const stationLink = { type: 'STATION' as const, id: activity.station.id, label: activity.station.name }
  const activityLink = { type: 'ACTIVITY' as const, id: activity.id, label: activity.name }

  const activityResolution = resolveEffectiveAllowances({
    definitions: context.definitions,
    assignments: context.assignments,
    chain: [projectLink, stationLink, activityLink],
  })

  const elements = new Map<string, ResolvedAllowances>()
  for (const el of activity.workElements) {
    elements.set(
      el.id,
      resolveEffectiveAllowances({
        definitions: context.definitions,
        assignments: context.assignments,
        chain: [projectLink, stationLink, activityLink, { type: 'WORK_ELEMENT', id: el.id, label: el.name }],
      })
    )
  }

  return {
    projectId: activity.station.project.id,
    method: context.method,
    methodLabel: ALLOWANCE_METHOD_LABELS[context.method],
    formula: ALLOWANCE_METHOD_FORMULAS[context.method],
    activity: activityResolution,
    elements,
  }
}
