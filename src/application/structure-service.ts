// ═══════════════════════════════════════════════════════════
// سرویس ساختار تولید — ایستگاه/فعالیت/عنصر کاری — FR-02
// CRUD + ترتیب‌بندی Drag&Drop + شمارش وابستگی برای حذف تأییدشده
// ═══════════════════════════════════════════════════════════
import { db } from '@/lib/db'
import { AppError } from '@/domain/types'
import { recordAudit } from '@/infrastructure/audit'
import { collectActivitiesTreeIds, markDeleted } from '@/infrastructure/deletion'
import { markProjectCalculationsStale } from './calc-stale'
import {
  appendActivityToExistingCharts,
  deleteActivityChartRows,
  rebuildProjectChains,
  syncActivityAfterUpdate,
} from './chart-service'
import type { StationCreateInput, StationUpdateInput, ActivityCreateInput, ActivityUpdateInput, ElementCreateInput, ElementUpdateInput } from '@/domain/validation'

async function assertProject(projectId: string) {
  const p = await db.project.findUnique({ where: { id: projectId }, select: { id: true, name: true } })
  if (!p) throw new AppError('PROJECT_NOT_FOUND', 'پروژه یافت نشد.', 404)
  return p
}

async function assertStation(stationId: string) {
  const s = await db.station.findUnique({ where: { id: stationId }, include: { project: { select: { id: true } } } })
  if (!s) throw new AppError('STATION_NOT_FOUND', 'ایستگاه یافت نشد.', 404)
  return s
}

async function assertActivity(activityId: string) {
  const a = await db.activity.findUnique({
    where: { id: activityId },
    include: { station: { include: { project: { select: { id: true } } } } },
  })
  if (!a) throw new AppError('ACTIVITY_NOT_FOUND', 'فعالیت یافت نشد.', 404)
  return a
}

async function assertElement(elementId: string) {
  const e = await db.workElement.findUnique({
    where: { id: elementId },
    include: { activity: { include: { station: { include: { project: { select: { id: true } } } } } } },
  })
  if (!e) throw new AppError('ELEMENT_NOT_FOUND', 'عنصر کاری یافت نشد.', 404)
  return e
}

// ── ایستگاه‌ها ──

export async function listStations(projectId: string) {
  await assertProject(projectId)
  return db.station.findMany({
    where: { projectId },
    orderBy: { sortOrder: 'asc' },
    include: {
      activities: {
        orderBy: { sortOrder: 'asc' },
        include: {
          group: { select: { id: true, name: true } },
          _count: { select: { workElements: true, sessions: true } },
        },
      },
    },
  })
}

export async function createStation(projectId: string, input: StationCreateInput) {
  await assertProject(projectId)
  const maxOrder = await db.station.aggregate({ where: { projectId }, _max: { sortOrder: true } })
  const station = await db.station.create({
    data: {
      projectId,
      name: input.name,
      description: input.description ?? null,
      sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
    },
  })
  await recordAudit({
    entityType: 'Station', entityId: station.id, action: 'CREATE', entityName: station.name,
    after: { name: station.name }, projectId,
  })
  return station
}

export async function updateStation(stationId: string, input: StationUpdateInput) {
  const existing = await assertStation(stationId)
  if (input.expectedUpdatedAt) {
    const expected = new Date(input.expectedUpdatedAt).getTime()
    if (Math.abs(existing.updatedAt.getTime() - expected) > 1000) {
      throw new AppError('CONFLICT', 'این ایستگاه جای دیگری تغییر کرده؛ تازه‌سازی کنید.', 409)
    }
  }
  const data: Record<string, unknown> = {}
  if (input.name !== undefined) data.name = input.name
  if (input.description !== undefined) data.description = input.description
  const updated = await db.station.update({ where: { id: stationId }, data })
  await recordAudit({
    entityType: 'Station', entityId: stationId, action: 'UPDATE', entityName: updated.name,
    before: { name: existing.name, description: existing.description },
    after: { name: updated.name, description: updated.description },
    projectId: existing.project.id,
  })
  return updated
}

/** حذف دائمی ایستگاه با شمارش وابستگی‌ها و نشانگذاری — FR-26 */
export async function getStationDependencyCounts(stationId: string) {
  const s = await assertStation(stationId)
  const [activities, elements, sessions, observations] = await Promise.all([
    db.activity.count({ where: { stationId } }),
    db.workElement.count({ where: { activity: { stationId } } }),
    db.studySession.count({ where: { activity: { stationId } } }),
    db.elementObservation.count({ where: { cycle: { session: { activity: { stationId } } } } }),
  ])
  return { station: s, counts: { activities, elements, sessions, observations } }
}

export async function deleteStation(stationId: string) {
  const { station, counts } = await getStationDependencyCounts(stationId)
  const treeIds = await (await import('@/infrastructure/deletion')).collectStationsTreeIds([stationId])
  await db.$transaction(async (tx) => {
    for (const [entityType, ids] of Object.entries(treeIds)) {
      await markDeleted(tx, entityType, ids)
    }
    // گره‌های خودکار نمودارِ فعالیت‌های این ایستگاه + یال‌های وابسته — FR-20.10
    await deleteActivityChartRows(tx, treeIds.Activity ?? [])
    await tx.station.delete({ where: { id: stationId } })
  })
  // بازسازی زنجیرهٔ توالی نمودارها پس از حذف
  await rebuildProjectChains(station.projectId)
  await recordAudit({
    entityType: 'Station', entityId: stationId, action: 'DELETE', entityName: station.name,
    projectId: station.projectId,
  })
  return counts
}

export async function reorderStations(projectId: string, ids: string[]) {
  await assertProject(projectId)
  await db.$transaction(
    ids.map((id, index) =>
      db.station.updateMany({ where: { id, projectId }, data: { sortOrder: index } })
    )
  )
  await recordAudit({ entityType: 'Station', entityId: projectId, action: 'REORDER', entityName: 'ترتیب ایستگاه‌ها', after: { ids }, projectId })
}

// ── فعالیت‌ها ──

export async function listActivities(stationId: string) {
  await assertStation(stationId)
  return db.activity.findMany({
    where: { stationId },
    orderBy: { sortOrder: 'asc' },
    include: {
      group: { select: { id: true, name: true } },
      _count: { select: { workElements: true, sessions: true } },
    },
  })
}

export async function createActivity(stationId: string, input: ActivityCreateInput) {
  const station = await assertStation(stationId)
  if (input.groupId) {
    const group = await db.activityGroup.findUnique({ where: { id: input.groupId } })
    if (!group || group.projectId !== station.projectId) {
      throw new AppError('GROUP_NOT_IN_PROJECT', 'گروه انتخاب‌شده به این پروژه تعلق ندارد.', 422)
    }
  }
  const maxOrder = await db.activity.aggregate({ where: { stationId }, _max: { sortOrder: true } })
  const activity = await db.activity.create({
    data: {
      stationId,
      name: input.name,
      description: input.description ?? null,
      processType: input.processType,
      groupId: input.groupId ?? null,
      targetSampleCount: input.targetSampleCount ?? null,
      sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
    },
  })
  await recordAudit({
    entityType: 'Activity', entityId: activity.id, action: 'CREATE', entityName: activity.name,
    after: { name: activity.name, processType: activity.processType }, projectId: station.project.id,
  })
  // فعالیت جدید در نتایج پروژه به‌عنوان ناقص ظاهر می‌شود — FR-27
  await markProjectCalculationsStale(station.projectId)
  // اگر نمودار فرایند از قبل ساخته شده باشد، گره جدید بلافاصله الحاق می‌شود — FR-20.2
  await appendActivityToExistingCharts(station.projectId, activity.id)
  return activity
}

export async function updateActivity(activityId: string, input: ActivityUpdateInput) {
  const existing = await assertActivity(activityId)
  if (input.expectedUpdatedAt) {
    const expected = new Date(input.expectedUpdatedAt).getTime()
    if (Math.abs(existing.updatedAt.getTime() - expected) > 1000) {
      throw new AppError('CONFLICT', 'این فعالیت جای دیگری تغییر کرده؛ تازه‌سازی کنید.', 409)
    }
  }
  if (input.groupId) {
    const group = await db.activityGroup.findUnique({ where: { id: input.groupId } })
    if (!group || group.projectId !== existing.station.projectId) {
      throw new AppError('GROUP_NOT_IN_PROJECT', 'گروه انتخاب‌شده به این پروژه تعلق ندارد.', 422)
    }
  }
  const data: Record<string, unknown> = {}
  for (const key of ['name', 'description', 'processType', 'groupId', 'targetSampleCount'] as const) {
    if (input[key] !== undefined) data[key] = input[key]
  }
  const updated = await db.activity.update({ where: { id: activityId }, data })
  // تغییر پارامتر مؤثر بر محاسبات → نتایج قبلی نیازمند محاسبه مجدد — FR-27
  if (input.groupId !== undefined || input.targetSampleCount !== undefined) {
    await markProjectCalculationsStale(existing.station.projectId)
  }
  await recordAudit({
    entityType: 'Activity', entityId: activityId, action: 'UPDATE', entityName: updated.name,
    before: { name: existing.name, processType: existing.processType, groupId: existing.groupId, targetSampleCount: existing.targetSampleCount },
    after: { name: updated.name, processType: updated.processType, groupId: updated.groupId, targetSampleCount: updated.targetSampleCount },
    projectId: existing.station.projectId,
  })
  // همگام‌سازی گره‌های نمودار (شناسه پایدار؛ فقط برچسب/نوع به‌روز می‌شود و در صورت لزوم از OPC حذف می‌شود) — FR-20.8/10
  if (input.name !== undefined || input.processType !== undefined) {
    await syncActivityAfterUpdate(activityId, existing.station.projectId)
  }
  return updated
}

export async function getActivityDependencyCounts(activityId: string) {
  const a = await assertActivity(activityId)
  const [elements, sessions, observations] = await Promise.all([
    db.workElement.count({ where: { activityId } }),
    db.studySession.count({ where: { activityId } }),
    db.elementObservation.count({ where: { cycle: { session: { activityId } } } }),
  ])
  return { activity: a, counts: { elements, sessions, observations } }
}

export async function deleteActivity(activityId: string) {
  const { activity, counts } = await getActivityDependencyCounts(activityId)
  const treeIds = await collectActivitiesTreeIds([activityId])
  await db.$transaction(async (tx) => {
    for (const [entityType, ids] of Object.entries(treeIds)) {
      await markDeleted(tx, entityType, ids)
    }
    // گره‌های خودکار نمودارِ این فعالیت + یال‌های وابسته پاک‌سازی می‌شوند — FR-20.10
    await deleteActivityChartRows(tx, [activityId])
    await tx.activity.delete({ where: { id: activityId } })
  })
  // بازسازی زنجیرهٔ توالی نمودارها پس از حذف گره
  await rebuildProjectChains(activity.station.projectId)
  // حذف فعالیت = حذف مشاهدات آن — FR-27
  await markProjectCalculationsStale(activity.station.projectId)
  await recordAudit({
    entityType: 'Activity', entityId: activityId, action: 'DELETE', entityName: activity.name,
    projectId: activity.station.projectId,
  })
  return counts
}

export async function reorderActivities(stationId: string, ids: string[]) {
  await assertStation(stationId)
  await db.$transaction(
    ids.map((id, index) =>
      db.activity.updateMany({ where: { id, stationId }, data: { sortOrder: index } })
    )
  )
  const s = await db.station.findUnique({ where: { id: stationId }, select: { projectId: true } })
  await recordAudit({ entityType: 'Activity', entityId: stationId, action: 'REORDER', entityName: 'ترتیب فعالیت‌ها', after: { ids }, projectId: s?.projectId })
}

// ── عناصر کاری ──

export async function listElements(activityId: string) {
  const a = await assertActivity(activityId)
  const elements = await db.workElement.findMany({
    where: { activityId },
    orderBy: { sortOrder: 'asc' },
    include: { rating: { include: { ratingTable: { select: { name: true, version: true } } } } },
  })
  return { activity: a, elements }
}

export async function createElement(activityId: string, input: ElementCreateInput) {
  const activity = await assertActivity(activityId)
  const maxOrder = await db.workElement.aggregate({ where: { activityId }, _max: { sortOrder: true } })
  const element = await db.workElement.create({
    data: {
      activityId,
      name: input.name,
      description: input.description ?? null,
      elementType: input.elementType,
      sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
    },
  })
  await recordAudit({
    entityType: 'WorkElement', entityId: element.id, action: 'CREATE', entityName: element.name,
    after: { name: element.name, elementType: element.elementType }, projectId: activity.station.projectId,
  })
  // عنصر جدید بدون داده = فعالیت ناقص در نتایج — FR-27
  await markProjectCalculationsStale(activity.station.projectId)
  return element
}

export async function updateElement(elementId: string, input: ElementUpdateInput) {
  const existing = await assertElement(elementId)
  if (input.expectedUpdatedAt) {
    const expected = new Date(input.expectedUpdatedAt).getTime()
    if (Math.abs(existing.updatedAt.getTime() - expected) > 1000) {
      throw new AppError('CONFLICT', 'این عنصر جای دیگری تغییر کرده؛ تازه‌سازی کنید.', 409)
    }
  }
  const data: Record<string, unknown> = {}
  if (input.name !== undefined) data.name = input.name
  if (input.description !== undefined) data.description = input.description
  if (input.elementType !== undefined) data.elementType = input.elementType
  const updated = await db.workElement.update({ where: { id: elementId }, data })
  // نوع عنصر بر مدل محاسباتی اثر دارد — FR-27
  if (input.elementType !== undefined) {
    await markProjectCalculationsStale(existing.activity.station.projectId)
  }
  await recordAudit({
    entityType: 'WorkElement', entityId: elementId, action: 'UPDATE', entityName: updated.name,
    before: { name: existing.name, elementType: existing.elementType },
    after: { name: updated.name, elementType: updated.elementType },
    projectId: existing.activity.station.projectId,
  })
  return updated
}

export async function getElementDependencyCounts(elementId: string) {
  const e = await assertElement(elementId)
  const [observations, ratingCount] = await Promise.all([
    db.elementObservation.count({ where: { workElementId: elementId } }),
    db.ratingAssessment.count({ where: { workElementId: elementId } }),
  ])
  return { element: e, counts: { observations, hasRating: ratingCount > 0 } }
}

export async function deleteElement(elementId: string) {
  const { element, counts } = await getElementDependencyCounts(elementId)
  await db.$transaction(async (tx) => {
    await markDeleted(tx, 'WorkElement', [elementId])
    // ارزیابی و مشاهدات با Cascade حذف می‌شوند
    await tx.workElement.delete({ where: { id: elementId } })
  })
  // حذف عنصر = حذف مشاهدات و ارزیابی آن — FR-27
  await markProjectCalculationsStale(element.activity.station.projectId)
  await recordAudit({
    entityType: 'WorkElement', entityId: elementId, action: 'DELETE', entityName: element.name,
    projectId: element.activity.station.projectId,
  })
  return counts
}

export async function reorderElements(activityId: string, ids: string[]) {
  await assertActivity(activityId)
  await db.$transaction(
    ids.map((id, index) =>
      db.workElement.updateMany({ where: { id, activityId }, data: { sortOrder: index } })
    )
  )
}

/** درخت کامل ساختار برای نما — FR-02 */
export async function getStructureTree(projectId: string) {
  await assertProject(projectId)
  const [stations, activities, elements] = await Promise.all([
    db.station.findMany({ where: { projectId }, orderBy: { sortOrder: 'asc' } }),
    db.activity.findMany({
      where: { station: { projectId } },
      orderBy: { sortOrder: 'asc' },
      include: {
        group: { select: { id: true, name: true } },
        _count: { select: { workElements: true } },
      },
    }),
    db.workElement.findMany({
      where: { activity: { station: { projectId } } },
      orderBy: { sortOrder: 'asc' },
      include: { rating: { select: { totalFactor: true } } },
    }),
  ])
  return stations.map((s) => ({
    ...s,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
    activities: activities
      .filter((a) => a.stationId === s.id)
      .map((a) => ({
        ...a,
        createdAt: a.createdAt.toISOString(),
        updatedAt: a.updatedAt.toISOString(),
        elements: elements
          .filter((e) => e.activityId === a.id)
          .map((e) => ({
            ...e,
            createdAt: e.createdAt.toISOString(),
            updatedAt: e.updatedAt.toISOString(),
          })),
      })),
  }))
}
