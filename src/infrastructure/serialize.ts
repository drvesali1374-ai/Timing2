// ═══════════════════════════════════════════════════════════
// زیرساخت — سریال‌سازی جداول دامنه — FR-24 / FR-25
// پشتیبان و بسته خروجی از همین سریال‌سازی استفاده می‌کنند.
// روش رسمی و سازگار با موتور: پرس‌وجو از طریق API پایگاه داده
// (کپی خام فایل DB در حین نوشتن ممنوع است — FR-24)
// ═══════════════════════════════════════════════════════════
import { db } from '@/lib/db'
import type { Prisma } from '@prisma/client'

/** نسخه ساختار داده بسته/پشتیبان — v۳: روابط موازی و مقادیر هم‌پوشانی چرخه‌ای (جلسه دوم) */
export const SCHEMA_VERSION = 3

/** نام جداول دامنه به ترتیب درج (والد قبل از فرزند) */
export const DOMAIN_TABLES_INSERT_ORDER = [
  'project',
  'projectSetting',
  'station',
  'activityGroup',
  'allowanceCategory',
  'allowanceDefinition',
  'operator',
  'ratingTable',
  'activity',
  'ratingTableGrade',
  'groupAllowance',
  'activityAllowanceOverride',
  'workElement',
  'allowanceAssignment',
  'studySession',
  'ratingAssessment',
  'cycleObservation',
  'timelineLane',
  'elementObservation',
  'overlapRelation',
  'observationOverlap',
  'chartNode',
  'chartEdge',
  'calculationRun',
  'finalizationInfo',
] as const

export type DomainTable = (typeof DOMAIN_TABLES_INSERT_ORDER)[number]

/** نام جداول به ترتیب حذف (فرزند قبل از والد) */
export const DOMAIN_TABLES_DELETE_ORDER = [...DOMAIN_TABLES_INSERT_ORDER].reverse() as DomainTable[]

type DbDelegate = {
  findMany: (args?: { where?: unknown; orderBy?: unknown }) => Promise<Record<string, unknown>[]>
  createMany: (args: { data: unknown[]; skipDuplicates?: boolean }) => Promise<{ count: number }>
  deleteMany: (args?: { where?: unknown }) => Promise<{ count: number }>
}

 
function delegate(table: DomainTable): DbDelegate {
  return (db as any)[table] as DbDelegate
}
 

export interface DomainSnapshot {
  [table: string]: Record<string, unknown>[]
}

/** گرفتن snapshot کامل (یا محدود به یک پروژه) از جداول دامنه */
export async function dumpDomain(tables: DomainTable[], projectId?: string): Promise<DomainSnapshot> {
  const snapshot: DomainSnapshot = {}
  for (const table of tables) {
    const where = projectId ? whereForProject(table, projectId) : undefined
    snapshot[table] = await delegate(table).findMany({ where })
  }
  return snapshot
}

/** فیلتر پروژه برای جداولی که مستقیم یا با یک پل به پروژه وصل‌اند */
function whereForProject(table: DomainTable, projectId: string): Record<string, unknown> | undefined {
  // جدول خود پروژه با کلید اصلی فیلتر می‌شود
  if (table === 'project') return { id: projectId }
  const direct: DomainTable[] = [
    'projectSetting', 'station', 'activityGroup', 'allowanceCategory', 'allowanceDefinition',
    'operator', 'ratingTable', 'chartNode', 'chartEdge', 'calculationRun', 'finalizationInfo',
  ]
  if (direct.includes(table)) return { projectId }

  switch (table) {
    case 'activity':
      return { station: { projectId } }
    case 'ratingTableGrade':
      return { ratingTable: { projectId } }
    case 'groupAllowance':
      return { group: { projectId } }
    case 'activityAllowanceOverride':
      return { activity: { station: { projectId } } }
    case 'allowanceAssignment':
      // همهٔ تخصیص‌های تعریف‌های همین پروژه — scopeها همیشه درون پروژه‌اند (اعتبارسنجی سرویس)
      return { definition: { projectId } }
    case 'workElement':
      return { activity: { station: { projectId } } }
    case 'studySession':
      return { activity: { station: { projectId } } }
    case 'ratingAssessment':
      return { workElement: { activity: { station: { projectId } } } }
    case 'cycleObservation':
      return { session: { activity: { station: { projectId } } } }
    case 'timelineLane':
      return { cycle: { session: { activity: { station: { projectId } } } } }
    case 'elementObservation':
      return { cycle: { session: { activity: { station: { projectId } } } } }
    default:
      return undefined
  }
}

/** درج snapshot در یک تراکنش باز شده (tx) */
export async function loadDomain(
  tx: Prisma.TransactionClient,
  snapshot: DomainSnapshot
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {}
  for (const table of DOMAIN_TABLES_INSERT_ORDER) {
    const rows = snapshot[table]
    if (!rows || rows.length === 0) {
      counts[table] = 0
      continue
    }
     
    const result = await (tx as any)[table].createMany({ data: rows })
    counts[table] = result.count
  }
  return counts
}

/** حذف کامل جداول دامنه در تراکنش */
export async function clearDomain(tx: Prisma.TransactionClient): Promise<void> {
  for (const table of DOMAIN_TABLES_DELETE_ORDER) {
     
    await (tx as any)[table].deleteMany({})
  }
}

/** checksum یک snapshot (SHA-256 روی JSON کانونی) */
export async function checksumOf(data: unknown): Promise<string> {
  const canonical = JSON.stringify(data)
  const bytes = new TextEncoder().encode(canonical)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** گراف وابستگی فرزند → والد (FK های اجباری و اختیاری)
 *  برای پاکسازی ردیف‌های یتیم پس از اعمال نشانگرهای حذف */
const FK_DEPENDENCIES: Record<string, { table: string; fk: string; nullable: boolean }[]> = {
  projectSetting: [{ table: 'project', fk: 'projectId', nullable: false }],
  station: [{ table: 'project', fk: 'projectId', nullable: false }],
  activityGroup: [{ table: 'project', fk: 'projectId', nullable: false }],
  allowanceCategory: [{ table: 'project', fk: 'projectId', nullable: false }],
  allowanceDefinition: [{ table: 'project', fk: 'projectId', nullable: false }],
  operator: [{ table: 'project', fk: 'projectId', nullable: false }],
  ratingTable: [{ table: 'project', fk: 'projectId', nullable: false }],
  activity: [
    { table: 'station', fk: 'stationId', nullable: false },
    { table: 'activityGroup', fk: 'groupId', nullable: true },
  ],
  ratingTableGrade: [{ table: 'ratingTable', fk: 'ratingTableId', nullable: false }],
  groupAllowance: [
    { table: 'activityGroup', fk: 'groupId', nullable: false },
    { table: 'allowanceCategory', fk: 'categoryId', nullable: false },
  ],
  activityAllowanceOverride: [
    { table: 'activity', fk: 'activityId', nullable: false },
    { table: 'allowanceCategory', fk: 'categoryId', nullable: false },
  ],
  allowanceAssignment: [
    // scopeId چندشکلی است — در enforceReferentialIntegrity به‌صورت اختصاصی بررسی می‌شود
    { table: 'allowanceDefinition', fk: 'definitionId', nullable: false },
  ],
  workElement: [{ table: 'activity', fk: 'activityId', nullable: false }],
  studySession: [
    { table: 'activity', fk: 'activityId', nullable: false },
    { table: 'operator', fk: 'operatorId', nullable: false },
  ],
  ratingAssessment: [
    { table: 'workElement', fk: 'workElementId', nullable: false },
    { table: 'ratingTable', fk: 'ratingTableId', nullable: false },
  ],
  cycleObservation: [{ table: 'studySession', fk: 'sessionId', nullable: false }],
  timelineLane: [{ table: 'cycleObservation', fk: 'cycleId', nullable: false }],
  elementObservation: [
    { table: 'cycleObservation', fk: 'cycleId', nullable: false },
    { table: 'workElement', fk: 'workElementId', nullable: false },
    { table: 'timelineLane', fk: 'laneId', nullable: true },
  ],
  chartNode: [
    { table: 'project', fk: 'projectId', nullable: false },
    { table: 'activity', fk: 'activityId', nullable: true },
  ],
  chartEdge: [
    { table: 'project', fk: 'projectId', nullable: false },
    { table: 'chartNode', fk: 'sourceNodeId', nullable: false },
    { table: 'chartNode', fk: 'targetNodeId', nullable: false },
  ],
  calculationRun: [{ table: 'project', fk: 'projectId', nullable: false }],
  finalizationInfo: [{ table: 'project', fk: 'projectId', nullable: false }],
}

/** جدول مقصد scope چندشکلی تخصیص الونس */
const ASSIGNMENT_SCOPE_TABLE: Record<string, string> = {
  PROJECT: 'project',
  STATION: 'station',
  ACTIVITY: 'activity',
  WORK_ELEMENT: 'workElement',
}

/** پاکسازی ردیف‌های یتیم: هر ردیفی که FK اجباری‌اش به ردیف حذف‌شده
 *  اشاره کند، به‌صورت گذرا حذف می‌شود (تا وقتی پایدار شود).
 *  کاربرد: پس از اعمال DeletionMarkerها در Restore — چون cascade
 *  حذف دائمی فرزندانِ بی‌نشانگر (مثل ارزیابی عنصر حذف‌شده) را
 *  بدون نشان‌گذاری حذف می‌کند. */
export function enforceReferentialIntegrity(
  snapshot: Record<string, Record<string, unknown>[]>
): { removed: number } {
  let removed = 0
  let changed = true
  while (changed) {
    changed = false
    // مجموعه شناسه‌های موجود هر جدول
    const live = new Map<string, Set<string>>()
    for (const [table, rows] of Object.entries(snapshot)) {
      live.set(table, new Set(rows.map((r) => String(r.id))))
    }
    for (const [table, deps] of Object.entries(FK_DEPENDENCIES)) {
      const rows = snapshot[table]
      if (!rows || rows.length === 0) continue
      const kept = rows.filter((row) => {
        for (const dep of deps) {
          const value = row[dep.fk]
          if (value === null || value === undefined) {
            if (!dep.nullable) {
              removed++
              changed = true
              return false
            }
            continue
          }
          const parentSet = live.get(dep.table)
          if (!parentSet || !parentSet.has(String(value))) {
            removed++
            changed = true
            return false
          }
        }
        // بررسی چندشکلی scope تخصیص الونس — scope مقصد باید زنده باشد
        if (table === 'allowanceAssignment') {
          const scopeTable = ASSIGNMENT_SCOPE_TABLE[String(row.scopeType)]
          const scopeSet = scopeTable ? live.get(scopeTable) : undefined
          if (!scopeSet || !scopeSet.has(String(row.scopeId))) {
            removed++
            changed = true
            return false
          }
        }
        return true
      })
      if (kept.length !== rows.length) {
        snapshot[table] = kept
      }
    }
  }
  return { removed }
}
