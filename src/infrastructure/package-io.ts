// ═══════════════════════════════════════════════════════════
// زیرساخت — بسته خروجی کامل پروژه و ورود آن — FR-25
// • بسته دارای manifest، نسخه schema و checksum
// • ورود بسته همیشه پروژه «جدید» می‌سازد (بازنویسی ممنوع)
// • پیش از ورود: اعتبارسنجی ساختار، شناسه‌ها، نسخه و checksum
// • تمام شناسه‌ها هنگام ورود بازتولید می‌شوند (remap) تا
//   هیچ تداخلی با داده موجود ایجاد نشود
// • هیچ کد اجرایی/اسکریپتی از بسته اجرا نمی‌شود
// ═══════════════════════════════════════════════════════════
import { db } from '@/lib/db'
import { randomUUID } from 'crypto'
import { AppError } from '@/domain/types'
import { recordAudit } from './audit'
import {
  DOMAIN_TABLES_INSERT_ORDER,
  SCHEMA_VERSION,
  checksumOf,
  dumpDomain,
  loadDomain,
  type DomainTable,
} from './serialize'

export interface ProjectPackageManifest {
  format: 'timing-project-package'
  schemaVersion: number
  createdAt: string
  appVersion: string
  includes: string[]
  projectName: string
}

export interface ProjectPackage {
  manifest: ProjectPackageManifest
  project: Record<string, unknown>
  data: Record<string, Record<string, unknown>[]>
  checksum: string
}

/** جداول متعلق به هر بخش قابل انتخاب در کپی/خروجی — FR-01/FR-25 */
export const SECTION_TABLES: Record<string, DomainTable[]> = {
  settings: ['projectSetting'],
  structure: ['station', 'activity', 'workElement', 'activityAllowanceOverride'],
  operators: ['operator'],
  // تعریف مرکزی + تخصیص‌های سلسله‌مراتبی (جلسه اول) —
  // جداول قدیمی گروه/دسته نیز برای سازگاری بسته‌های قدیمی منتقل می‌شوند
  groupsAndAllowances: ['activityGroup', 'allowanceCategory', 'groupAllowance', 'allowanceDefinition', 'allowanceAssignment'],
  // ارزیابی‌های ثبت‌شدهٔ عناصر نیز بخشی از دادهٔ وستینگهاوس‌اند — FR-25
  ratingTables: ['ratingTable', 'ratingTableGrade', 'ratingAssessment'],
  rawObservations: ['studySession', 'cycleObservation', 'timelineLane', 'elementObservation'],
  // جلسه ۲ — روابط موازی و مقادیر هم‌پوشانی هر چرخه (بخشی از دادهٔ خام)
  overlaps: ['overlapRelation', 'observationOverlap'],
  charts: ['chartNode', 'chartEdge'],
  calculations: ['calculationRun'],
}

export interface ExportSections {
  settings: boolean
  structure: boolean
  operators: boolean
  groupsAndAllowances: boolean
  ratingTables: boolean
  rawObservations: boolean
  overlaps: boolean
  charts: boolean
  calculations: boolean
}

export const DEFAULT_EXPORT_SECTIONS: ExportSections = {
  settings: true,
  structure: true,
  operators: true,
  groupsAndAllowances: true,
  ratingTables: true,
  rawObservations: true,
  overlaps: true,
  charts: true,
  calculations: true,
}

function tablesForSections(sections: Partial<ExportSections>): DomainTable[] {
  const tables: DomainTable[] = []
  for (const [key, tbls] of Object.entries(SECTION_TABLES)) {
    if (sections[key as keyof ExportSections]) tables.push(...tbls)
  }
  return tables
}

/** ساخت بسته خروجی کامل یک پروژه */
export async function exportProjectPackage(projectId: string): Promise<ProjectPackage> {
  const project = await db.project.findUnique({ where: { id: projectId } })
  if (!project) throw new AppError('PROJECT_NOT_FOUND', 'پروژه یافت نشد.', 404)

  const tables = tablesForSections(DEFAULT_EXPORT_SECTIONS)
  // رکورد خود پروژه نیز باید در data باشد تا remap شناسه‌ها درست کار کند
  const data = await dumpDomain(['project', ...tables], projectId)

  const manifest: ProjectPackageManifest = {
    format: 'timing-project-package',
    schemaVersion: SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    appVersion: '1.0.0-phase1-2',
    includes: Object.keys(SECTION_TABLES),
    projectName: project.name,
  }
  const checksum = await checksumOf({ manifest, data })
  await recordAudit({
    entityType: 'Project',
    entityId: projectId,
    action: 'EXPORT',
    entityName: project.name,
    after: { checksum },
    projectId,
  })
  return { manifest, project: project as unknown as Record<string, unknown>, data, checksum }
}

/** اعتبارسنجی بسته ورودی — ساختار، نسخه و checksum — FR-25 */
export async function validateProjectPackage(jsonText: string): Promise<ProjectPackage> {
  let parsed: ProjectPackage
  try {
    parsed = JSON.parse(jsonText)
  } catch {
    throw new AppError('PACKAGE_INVALID_JSON', 'فایل بسته JSON معتبر نیست.', 422)
  }
  if (parsed?.manifest?.format !== 'timing-project-package') {
    throw new AppError('PACKAGE_INVALID_FORMAT', 'این فایل یک بسته پروژه معتبر این نرم‌افزار نیست.', 422)
  }
  if (parsed.manifest.schemaVersion > SCHEMA_VERSION) {
    throw new AppError(
      'PACKAGE_NEWER_SCHEMA',
      `نسخه ساختار بسته (${parsed.manifest.schemaVersion}) از نسخه فعلی (${SCHEMA_VERSION}) جدیدتر است.`,
      422
    )
  }
  if (!parsed.data || typeof parsed.data !== 'object' || !parsed.project) {
    throw new AppError('PACKAGE_INVALID_DATA', 'ساختار داده بسته نامعتبر است.', 422)
  }
  const actual = await checksumOf({ manifest: parsed.manifest, data: parsed.data })
  if (actual !== parsed.checksum) {
    throw new AppError('PACKAGE_CHECKSUM_MISMATCH', 'checksum بسته با محتوای آن مطابقت ندارد؛ فایل آسیب دیده است.', 422)
  }
  // اعتبارسنجی ساختاری حداقلی
  const stations = parsed.data.station ?? []
  const activities = parsed.data.activity ?? []
  const stationIds = new Set(stations.map((s) => s.id))
  for (const a of activities) {
    if (typeof a.stationId === 'string' && !stationIds.has(a.stationId)) {
      throw new AppError('PACKAGE_BROKEN_REFS', 'ارجاع فعالیت به ایستگاه ناموجود در بسته یافت شد.', 422)
    }
  }
  return parsed
}

/** نگاشت فیلدهای خارجی هر جدول برای بازتولید شناسه‌ها */
const FK_MAP: Record<string, string[]> = {
  project: [],
  projectSetting: ['projectId'],
  station: ['projectId'],
  activityGroup: ['projectId'],
  allowanceCategory: ['projectId'],
  allowanceDefinition: ['projectId'],
  operator: ['projectId'],
  ratingTable: ['projectId'],
  activity: ['stationId', 'groupId'],
  ratingTableGrade: ['ratingTableId'],
  groupAllowance: ['groupId', 'categoryId'],
  activityAllowanceOverride: ['activityId', 'categoryId'],
  // scopeId چندشکلی است و در remapProjectData به‌صورت اختصاصی بازنویسی می‌شود
  allowanceAssignment: ['definitionId'],
  workElement: ['activityId'],
  studySession: ['activityId', 'operatorId'],
  ratingAssessment: ['workElementId', 'ratingTableId'],
  cycleObservation: ['sessionId'],
  timelineLane: ['cycleId'],
  elementObservation: ['cycleId', 'workElementId', 'laneId'],
  // جلسه ۲ — روابط موازی: عنصرها با FK نرم (بدون Cascade)؛ در نبود عنصر، سطر حذف می‌شود
  overlapRelation: ['projectId', 'elementLowId', 'elementHighId'],
  observationOverlap: ['relationId', 'cycleId'],
  chartNode: ['projectId', 'activityId'],
  chartEdge: ['projectId', 'sourceNodeId', 'targetNodeId'],
  calculationRun: ['projectId'],
  finalizationInfo: ['projectId'],
}

/** جدول مقصد scope چندشکلی تخصیص الونس — remap */
const ASSIGNMENT_SCOPE_TABLE: Record<string, string> = {
  PROJECT: 'project',
  STATION: 'station',
  ACTIVITY: 'activity',
  WORK_ELEMENT: 'workElement',
}

/** فیلدهای FK اختیاری — اگر مبدأ کپی نشده باشد null می‌شوند؛
 *  FK اجباری حل‌نشده باعث حذف ردیف بی‌معنا می‌شود (مثلاً Override بدون دسته مجاز) */
const NULLABLE_FKS = new Set(['activity.groupId', 'chartNode.activityId', 'elementObservation.laneId'])

/** بازتولید تمام شناسه‌های یک snapshot داده پروژه (remap)
 *  شناسه جدید UUID تازه است؛ ارجاعات داخلی بازنویسی می‌شوند */
function remapProjectData(
  data: Record<string, Record<string, unknown>[]>,
  newProjectId: string
): Record<string, Record<string, unknown>[]> {
  const idMap = new Map<string, string>()
  const out: Record<string, Record<string, unknown>[]> = {}

  // مرحله ۱: تخصیص شناسه جدید
  for (const table of Object.keys(FK_MAP)) {
    const rows = data[table] ?? []
    for (const row of rows) {
      const oldId = String(row.id)
      idMap.set(`${table}:${oldId}`, randomUUID())
    }
  }
  const newProjectRowId = idMap.get(`project:${String(data.project?.[0]?.id ?? '')}`) ?? newProjectId

  // مرحله ۲: بازنویسی ردیف‌ها
  for (const [table, fks] of Object.entries(FK_MAP)) {
    const rows = data[table] ?? []
    const kept: Record<string, unknown>[] = []
    for (const row of rows) {
      const newRow: Record<string, unknown> = { ...row }
      newRow.id = idMap.get(`${table}:${String(row.id)}`) ?? String(row.id)
      let drop = false
      for (const fk of fks) {
        const oldFk = row[fk]
        if (oldFk === null || oldFk === undefined) {
          newRow[fk] = null
          continue
        }
        const fkTable = reverseFkTable(table, fk)
        const mapped = idMap.get(`${fkTable}:${String(oldFk)}`)
        if (mapped) {
          newRow[fk] = mapped
        } else if (NULLABLE_FKS.has(`${table}.${fk}`)) {
          newRow[fk] = null
        } else {
          // والد در بخش انتخاب‌شده کپی نشده است؛ این ردیف بدون والد بی‌معناست
          drop = true
          break
        }
      }
      // بازنویسی چندشکلی scope تخصیص الونس — scope مقصد باید کپی شده باشد
      if (!drop && table === 'allowanceAssignment') {
        const scopeTable = ASSIGNMENT_SCOPE_TABLE[String(row.scopeType)]
        const mappedScope = scopeTable ? idMap.get(`${scopeTable}:${String(row.scopeId)}`) : undefined
        if (mappedScope) {
          newRow.scopeId = mappedScope
        } else {
          // scope در بخش انتخاب‌شده کپی نشده؛ تخصیص بدون مقصد بی‌معناست
          drop = true
        }
      }
      if (!drop) kept.push(newRow)
    }
    out[table] = kept
  }
  // شناسه پروژه جدید را در ریشه تثبیت می‌کنیم
  if (out.project && out.project.length > 0) {
    out.project[0].id = newProjectRowId
  }
  return out
}

function reverseFkTable(table: string, fk: string): string {
  if (fk === 'projectId') return 'project'
  if (fk === 'stationId') return 'station'
  if (fk === 'groupId') return 'activityGroup'
  if (fk === 'categoryId') return 'allowanceCategory'
  if (fk === 'definitionId') return 'allowanceDefinition'
  if (fk === 'activityId') return 'activity'
  if (fk === 'ratingTableId') return 'ratingTable'
  if (fk === 'operatorId') return 'operator'
  if (fk === 'workElementId') return 'workElement'
  if (fk === 'sessionId') return 'studySession'
  if (fk === 'cycleId') return 'cycleObservation'
  if (fk === 'laneId') return 'timelineLane'
  if (fk === 'sourceNodeId' || fk === 'targetNodeId') return 'chartNode'
  throw new Error(`نگاشت ناشناخته: ${table}.${fk}`)
}

/** ورود بسته به‌صورت پروژه جدید — با بازتولید شناسه‌ها */
export async function importProjectPackage(jsonText: string): Promise<{ projectId: string; name: string }> {
  const parsed = await validateProjectPackage(jsonText)
  const newName = `${String(parsed.project.name)} (ورودی)`

  const result = await db.$transaction(async (tx) => {
    const data = remapProjectData(parsed.data as Record<string, Record<string, unknown>[]>, randomUUID())
    if (data.project?.[0]) {
      data.project[0].name = newName
      data.project[0].createdAt = new Date()
      data.project[0].updatedAt = new Date()
    }
    // finalization در ورود بسته منتقل نمی‌شود (مطالعه ورودی از نو ارزیابی می‌شود)
    delete data.finalizationInfo
    const counts = await loadDomain(tx, data)
    const newProjectId = String(data.project?.[0]?.id ?? '')
    await tx.auditEvent.create({
      data: {
        entityType: 'Project',
        entityId: newProjectId,
        action: 'IMPORT',
        entityName: newName,
        afterJson: JSON.stringify({ source: parsed.manifest.projectName, counts }),
        projectId: newProjectId,
        actor: 'کاربر محلی',
      },
    })
    return { projectId: newProjectId }
  })
  // بسته‌های قدیمی (schema v1) تعریف‌های مرکزی ندارند —
  // مهاجرت idempotent پس از درج اجرا می‌شود (§۴)
  const { migrateProjectAllowancesIfNeeded } = await import('../application/effective-allowance-service')
  await migrateProjectAllowancesIfNeeded(result.projectId)
  return { projectId: result.projectId, name: newName }
}

/** کپی پروژه با انتخاب بخش‌ها — FR-01
 *  پیش‌فرض فقط ساختار و تنظیمات؛ مشاهدات/تاریخچه فقط با انتخاب صریح */
export async function duplicateProject(
  projectId: string,
  newProjectName: string,
  sections: {
    structure: boolean
    settings: boolean
    operators: boolean
    groupsAndAllowances: boolean
    ratingTables: boolean
    rawObservations: boolean
  }
): Promise<{ projectId: string }> {
  const project = await db.project.findUnique({ where: { id: projectId } })
  if (!project) throw new AppError('PROJECT_NOT_FOUND', 'پروژه یافت نشد.', 404)

  const selected: Partial<ExportSections> = {
    settings: sections.settings,
    structure: sections.structure,
    operators: sections.operators,
    groupsAndAllowances: sections.groupsAndAllowances,
    ratingTables: sections.ratingTables,
    rawObservations: sections.rawObservations,
    overlaps: sections.rawObservations, // روابط موازی همراه دادهٔ خام معنا دارد
    charts: sections.structure, // نمودار فقط همراه ساختار معنا دارد
    calculations: false, // نتایج محاسبه‌شده هرگز بدون انتخاب صریح کپی نمی‌شوند
  }
  const tables = tablesForSections(selected)
  const data = await dumpDomain(['project', ...tables], projectId)

  const result = await db.$transaction(async (tx) => {
    const remapped = remapProjectData(data as Record<string, Record<string, unknown>[]>, randomUUID())
    if (remapped.project?.[0]) {
      remapped.project[0].name = newProjectName
      remapped.project[0].createdAt = new Date()
      remapped.project[0].updatedAt = new Date()
    }
    // کپی عادی هرگز تاریخچه و نهایی‌سازی پروژه مبدأ را منتقل نمی‌کند — FR-01
    delete remapped.finalizationInfo
    await loadDomain(tx, remapped)
    if (!remapped.ratingTable || remapped.ratingTable.length === 0) {
      const { WESTINGHOUSE_SEED_GRADES, WESTINGHOUSE_SEED_META } = await import('./seed-data')
      const table = await tx.ratingTable.create({
        data: {
          projectId: String(remapped.project?.[0]?.id ?? ''),
          name: WESTINGHOUSE_SEED_META.name,
          version: 1,
          source: WESTINGHOUSE_SEED_META.source,
          notes: WESTINGHOUSE_SEED_META.notes,
          isDefault: true,
        },
      })
      await tx.ratingTableGrade.createMany({
        data: WESTINGHOUSE_SEED_GRADES.map((g) => ({
          ratingTableId: table.id,
          factor: g.factor,
          gradeCode: g.gradeCode,
          label: g.label,
          value: g.value,
          hint: g.hint,
          sortOrder: g.sortOrder,
        })),
      })
    }
    const newProjectId = String(remapped.project?.[0]?.id ?? '')
    await tx.auditEvent.create({
      data: {
        entityType: 'Project',
        entityId: newProjectId,
        action: 'DUPLICATE',
        entityName: newProjectName,
        afterJson: JSON.stringify({ sourceProjectId: projectId, sections }),
        projectId: newProjectId,
        actor: 'کاربر محلی',
      },
    })
    return { projectId: newProjectId }
  })
  // مبدأ مهاجرت‌نشده (داده قدیمی بدون تعریف مرکزی) — مهاجرت idempotent
  const { migrateProjectAllowancesIfNeeded } = await import('../application/effective-allowance-service')
  await migrateProjectAllowancesIfNeeded(result.projectId)
  return result
}
