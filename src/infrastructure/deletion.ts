// ═══════════════════════════════════════════════════════════
// زیرساخت — نشانگر حذف دائمی — FR-26 / ۱۰.۵
// حذف از پایگاه عملیاتی دائمی است؛ DeletionMarker مانع
// بازگردانی ناخواسته همان داده‌ها هنگام Restore می‌شود.
// ═══════════════════════════════════════════════════════════
import { db } from '@/lib/db'
import type { Prisma } from '@prisma/client'

type Tx = Prisma.TransactionClient

/** ثبت نشانگر حذف برای مجموعه‌ای از شناسه‌ها */
export async function markDeleted(tx: Tx, entityType: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return
  for (const entityId of ids) {
    // upsert — سازگار با SQLite (skipDuplicates پشتیبانی نمی‌شود)
    await tx.deletionMarker.upsert({
      where: { entityType_entityId: { entityType, entityId } },
      create: { entityType, entityId },
      update: { deletedAt: new Date() },
    })
  }
}

/** شناسه تمام فرزندان وابسته به یک پروژه (برای نشانگذاری پیش از حذف) */
export async function collectProjectTreeIds(projectId: string): Promise<Record<string, string[]>> {
  const [settings, stations, operators, ratingTables, chartNodes, chartEdges, runs, finalization, parallelRelations] =
    await Promise.all([
      db.projectSetting.findMany({ where: { projectId }, select: { id: true } }),
      db.station.findMany({ where: { projectId }, select: { id: true } }),
      db.operator.findMany({ where: { projectId }, select: { id: true } }),
      db.ratingTable.findMany({ where: { projectId }, select: { id: true } }),
      db.chartNode.findMany({ where: { projectId }, select: { id: true } }),
      db.chartEdge.findMany({ where: { projectId }, select: { id: true } }),
      db.calculationRun.findMany({ where: { projectId }, select: { id: true } }),
      db.finalizationInfo.findMany({ where: { projectId }, select: { id: true } }),
      // ParallelElementRelation FK مستقیم به Project ندارد؛ در مدیریت
      // وابستگی‌ها باید صریحاً لحاظ شود تا رابطهٔ یتیم باقی نماند.
      db.parallelElementRelation.findMany({ where: { projectId }, select: { id: true } }),
    ])
  const stationIds = stations.map((s) => s.id)
  const activityTree = await collectStationsTreeIds(stationIds)
  return {
    Project: [projectId],
    ProjectSetting: settings.map((x) => x.id),
    Station: stationIds,
    Operator: operators.map((x) => x.id),
    RatingTable: ratingTables.map((x) => x.id),
    ChartNode: chartNodes.map((x) => x.id),
    ChartEdge: chartEdges.map((x) => x.id),
    CalculationRun: runs.map((x) => x.id),
    FinalizationInfo: finalization.map((x) => x.id),
    ParallelElementRelation: parallelRelations.map((x) => x.id),
    ...activityTree,
  }
}

/** درخت وابستگی ایستگاه‌ها — شامل خودِ ایستگاه‌ها (نشانگر حذف باید ریشه را هم بپوشاند تا با Restore شبح خالی برنگردد — FR-26) */
export async function collectStationsTreeIds(stationIds: string[]): Promise<Record<string, string[]>> {
  if (stationIds.length === 0) {
    return { Station: [], Activity: [], WorkElement: [], StudySession: [], CycleObservation: [], TimelineLane: [], ElementObservation: [], RatingAssessment: [], ChartNode: [], ChartEdge: [] }
  }
  const activities = await db.activity.findMany({
    where: { stationId: { in: stationIds } },
    select: { id: true },
  })
  const activityIds = activities.map((a) => a.id)
  const sub = await collectActivitiesTreeIds(activityIds)
  return { Station: [...stationIds], Activity: activityIds, ...sub }
}

/** درخت وابستگی فعالیت‌ها — شامل خودِ فعالیت‌ها (نشانگر حذف باید ریشه را هم بپوشاند — FR-26) */
export async function collectActivitiesTreeIds(activityIds: string[]): Promise<Record<string, string[]>> {
  if (activityIds.length === 0) {
    return { Activity: [], WorkElement: [], StudySession: [], CycleObservation: [], TimelineLane: [], ElementObservation: [], RatingAssessment: [], ChartNode: [], ChartEdge: [] }
  }
  const [elements, sessions, chartNodes] = await Promise.all([
    db.workElement.findMany({ where: { activityId: { in: activityIds } }, select: { id: true } }),
    db.studySession.findMany({ where: { activityId: { in: activityIds } }, select: { id: true } }),
    // گره‌های خودکار نمودارِ این فعالیت‌ها (گره دستی activityId=null دارد و شامل نمی‌شود) — FR-20.10
    db.chartNode.findMany({
      where: { activityId: { in: activityIds }, isManual: false },
      select: { id: true },
    }),
  ])
  const chartNodeIds = chartNodes.map((n) => n.id)
  const chartEdges = chartNodeIds.length
    ? await db.chartEdge.findMany({
        where: { OR: [{ sourceNodeId: { in: chartNodeIds } }, { targetNodeId: { in: chartNodeIds } }] },
        select: { id: true },
      })
    : []
  const elementIds = elements.map((e) => e.id)
  const sessionIds = sessions.map((s) => s.id)
  const cycles = sessionIds.length
    ? await db.cycleObservation.findMany({ where: { sessionId: { in: sessionIds } }, select: { id: true } })
    : []
  const cycleIds = cycles.map((c) => c.id)
  let lanes: string[] = []
  let observations: string[] = []
  if (cycleIds.length > 0) {
    const [l, o] = await Promise.all([
      db.timelineLane.findMany({ where: { cycleId: { in: cycleIds } }, select: { id: true } }),
      db.elementObservation.findMany({ where: { cycleId: { in: cycleIds } }, select: { id: true } }),
    ])
    lanes = l.map((x) => x.id)
    observations = o.map((x) => x.id)
  }
  const ratings = elementIds.length
    ? await db.ratingAssessment.findMany({ where: { workElementId: { in: elementIds } }, select: { id: true } })
    : []
  return {
    Activity: [...activityIds],
    WorkElement: elementIds,
    StudySession: sessionIds,
    RatingAssessment: ratings.map((x) => x.id),
    CycleObservation: cycleIds,
    TimelineLane: lanes,
    ElementObservation: observations,
    ChartNode: chartNodeIds,
    ChartEdge: chartEdges.map((x) => x.id),
  }
}

/** نام‌های قدیمی (پیش از v1.5.2) هر جدول — نشانگرهای حذفِ بسته‌های قدیمی */
const LEGACY_MARKER_ALIASES: Record<string, string[]> = {
  parallelElementRelation: ['ParallelElementRelation', 'OverlapRelation'],
}

/** اعمال نشانگرها بر snapshot بازیابی‌شده: حذف ردیف‌هایی که نشانگر حذف دارند */
export function applyDeletionMarkers(
  snapshot: Record<string, Record<string, unknown>[]>,
  markers: { entityType: string; entityId: string }[]
): { removed: number } {
  if (markers.length === 0) return { removed: 0 }
  const markerSet = new Set(markers.map((m) => `${m.entityType}:${m.entityId}`))
  let removed = 0
  for (const table of Object.keys(snapshot)) {
    const before = snapshot[table]
    const canonical = `${table.charAt(0).toUpperCase()}${table.slice(1)}`
    const keys = LEGACY_MARKER_ALIASES[table] ?? [canonical]
    const after = before.filter((row) => {
      for (const k of keys) {
        if (markerSet.has(`${k}:${row.id}`)) {
          removed += 1
          return false
        }
      }
      return true
    })
    snapshot[table] = after
  }
  return { removed }
}
