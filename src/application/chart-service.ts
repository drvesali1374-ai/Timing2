// ═══════════════════════════════════════════════════════════
// سرویس نمودار فرایند OPC/FPC — FR-20 / فاز ۵
// ▸ گره‌های پایه از فعالیت‌ها ساخته می‌شوند (سینک تنبل در GET)
// ▸ OPC فقط عملیات/بازرسی؛ FPC هر پنج نوع رویداد
// ▸ گره دستی مستقل (ActivityId=null) قابل ایجاد/ویرایش/حذف
// ▹ چیدمان خودکار لایه‌ای + ذخیرهٔ مختصات جابه‌جایی دستی
// ▸ اتصال گره‌ها: زنجیرهٔ توالی (سیستمی، isChain) + اتصال دستی
// ▸ ارتباط پایدار بر اساس شناسهٔ فعالیت (نه نام) — تغییر نام
//   فقط برچسب را به‌روز می‌کند، نه شناسهٔ گره را
// ▹ حذف/تغییر نمودار هرگز مشاهدات زمان‌سنجی را حذف نمی‌کند
// ═══════════════════════════════════════════════════════════
import { db } from '@/lib/db'
import { AppError } from '@/domain/types'
import { recordAudit } from '@/infrastructure/audit'
import type { Prisma, ChartNode as ChartNodeRow } from '@prisma/client'
import type { ChartManualNodeCreateInput, ChartNodeUpdateInput, ChartOrderMoveInput } from '@/domain/validation'

type Tx = Prisma.TransactionClient

// ── ثابت‌های چیدمان (مختصات نسبی بوم) ──
export const NODE_W = 200
export const NODE_H_EST = 92
export const COL_GAP = 56
export const ROW_GAP = 72
const CANVAS_MARGIN = 48

export type ChartType = 'OPC' | 'FPC'
export const CHART_TYPE_LABELS: Record<ChartType, string> = {
  OPC: 'OPC — نمودار فرایند عملیات',
  FPC: 'FPC — نمودار فرایند جریان',
}

const OPC_TYPES = new Set(['OPERATION', 'INSPECTION'])
// جلسه ۲ §۱۵.۱ — OPC توسعه‌یافته: ورودی مواد (node مستقل) + انبار (مثلث وارونه) به‌صورت اختیاری
const OPC_EXTENSION_TYPES = new Set(['OPERATION', 'INSPECTION', 'MATERIAL_INPUT', 'STORAGE'])
const ALL_TYPES = ['OPERATION', 'INSPECTION', 'TRANSPORT', 'DELAY', 'STORAGE', 'MATERIAL_INPUT'] as const

/** آیا نمودار OPC حاوی گره توسعه است؟ → حالت نمایش «OPC توسعه‌یافته» */
export function isExtendedOpc(nodes: Array<{ nodeType: string }>): boolean {
  return nodes.some((n) => n.nodeType === 'MATERIAL_INPUT' || n.nodeType === 'STORAGE')
}

/** پرسش برای پرچم بودن گره توسعه (نماد متفاوت در UI) */
export function isExtensionNodeType(nodeType: string): boolean {
  return nodeType === 'MATERIAL_INPUT'
}

export function assertChartType(v: string): asserts v is ChartType {
  if (v !== 'OPC' && v !== 'FPC') {
    throw new AppError('INVALID_CHART_TYPE', 'نوع نمودار معتبر نیست (OPC یا FPC).', 422)
  }
}

function allowedNodeTypes(chartType: ChartType): readonly string[] {
  return chartType === 'OPC' ? [...OPC_EXTENSION_TYPES] : ALL_TYPES
}

async function assertProject(projectId: string) {
  const p = await db.project.findUnique({ where: { id: projectId }, select: { id: true, name: true } })
  if (!p) throw new AppError('PROJECT_NOT_FOUND', 'پروژه یافت نشد.', 404)
  return p
}

// ─── DTO ───

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
  chartType: ChartType
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
  /** جلسه ۲ — OPC دارای گره ورودی مواد/انبار → نمایش «OPC توسعه‌یافته» */
  isExtendedOpc: boolean
}

// ─── سینک تنبل — تولید گره‌ها از فعالیت‌ها — FR-20.2 ───

/** بارگذاری فعالیت‌های پروژه به ترتیب ایستگاه/فعالیت با اطلاعات نام */
async function loadProjectActivities(projectId: string) {
  const stations = await db.station.findMany({
    where: { projectId },
    orderBy: { sortOrder: 'asc' },
    select: { id: true, name: true },
  })
  const stationName = new Map(stations.map((s) => [s.id, s.name]))
  const activities = await db.activity.findMany({
    where: { stationId: { in: stations.map((s) => s.id) } },
    orderBy: [{ station: { sortOrder: 'asc' } }, { sortOrder: 'asc' }],
    select: { id: true, name: true, processType: true, stationId: true },
  })
  return activities.map((a) => ({ ...a, stationName: stationName.get(a.stationId) ?? '' }))
}

/**
 * سینک نمودار با فعالیت‌های پروژه:
 * ۱) حذف گره‌های خودکار یتیم (فعالیت حذف شده یا دیگر مشمول این نوع نمودار نیست)
 * ۲) همگام‌سازی برچسب/نوع گره‌های خودکار (شناسه پایدار می‌ماند)
 * ۳) افزودن گره فعالیت‌های جدید — اگر نمودار خالی بود: ساخت کامل با چیدمان خودکار
 * ۴) بازسازی زنجیرهٔ توالی پس از تغییر ساختار
 */
async function syncChart(projectId: string, chartType: ChartType): Promise<void> {
  const allActivities = await loadProjectActivities(projectId)
  const qualifying = allActivities.filter((a) =>
    chartType === 'OPC' ? OPC_TYPES.has(a.processType) : true
  )
  const qualifyingIds = new Set(qualifying.map((a) => a.id))
  const activityById = new Map(allActivities.map((a) => [a.id, a]))

  const existing = await db.chartNode.findMany({
    where: { projectId, chartType },
    orderBy: { sortOrder: 'asc' },
  })

  const orphans = existing.filter((n) => !n.isManual && !(n.activityId && qualifyingIds.has(n.activityId)))
  const kept = existing.filter((n) => !orphans.includes(n))
  const keptActivityIds = new Set(
    kept.filter((n) => !n.isManual).map((n) => n.activityId as string)
  )
  const missing = qualifying.filter((a) => !keptActivityIds.has(a.id))

  if (orphans.length === 0 && missing.length === 0) {
    // فقط همگام‌سازی برچسب/نوع (بدون تغییر ساختار)
    for (const node of kept) {
      if (node.isManual || !node.activityId) continue
      const activity = activityById.get(node.activityId)
      if (!activity) continue
      if (node.label !== activity.name || node.nodeType !== activity.processType) {
        await db.chartNode.update({
          where: { id: node.id },
          data: { label: activity.name, nodeType: activity.processType },
        })
      }
    }
    return
  }

  await db.$transaction(async (tx) => {
    // ۱) پاک‌سازی گره‌های یتیم + یال‌های وابسته
    for (const orphan of orphans) {
      await tx.chartEdge.deleteMany({ where: { OR: [{ sourceNodeId: orphan.id }, { targetNodeId: orphan.id }] } })
      await tx.chartNode.delete({ where: { id: orphan.id } })
    }

    // ۲) همگام‌سازی برچسب/نوع — ارتباط با شناسهٔ فعالیت پایدار است — FR-20.8
    for (const node of kept) {
      if (node.isManual || !node.activityId) continue
      const activity = activityById.get(node.activityId)
      if (!activity) continue
      if (node.label !== activity.name || node.nodeType !== activity.processType) {
        await tx.chartNode.update({
          where: { id: node.id },
          data: { label: activity.name, nodeType: activity.processType },
        })
        node.label = activity.name
        node.nodeType = activity.processType
      }
    }

    // ۳) افزودن گره‌های جدید
    if (missing.length > 0) {
      const wasEmpty = kept.length === 0
      let nextOrder = kept.length > 0 ? Math.max(...kept.map((n) => n.sortOrder)) + 1 : 0
      const created: ChartNodeRow[] = []
      for (const activity of missing) {
        const node = await tx.chartNode.create({
          data: {
            projectId,
            chartType,
            nodeType: activity.processType,
            activityId: activity.id,
            label: activity.name,
            isManual: false,
            sortOrder: nextOrder++,
            positionX: 0,
            positionY: 0,
          },
        })
        created.push(node)
      }
      const allOrdered = [...kept, ...created]
      if (wasEmpty) {
        // ساخت اولیه: چیدمان خودکار + زنجیره — FR-20.6
        // زنجیرهٔ ضمنی برای لایه‌گذاری (ستون عمودی کلاسیک) — یال‌ها هنوز ساخته نشده‌اند
        const virtualEdges: { sourceNodeId: string; targetNodeId: string }[] = []
        for (let i = 0; i + 1 < allOrdered.length; i++) {
          virtualEdges.push({ sourceNodeId: allOrdered[i].id, targetNodeId: allOrdered[i + 1].id })
        }
        const positions = computeAutoLayout(allOrdered, virtualEdges)
        for (const node of allOrdered) {
          const p = positions.get(node.id)
          if (p) await tx.chartNode.update({ where: { id: node.id }, data: { positionX: p.x, positionY: p.y } })
        }
      } else {
        // الحاق زیر آخرین گره — چیدمان دستی موجود دست نمی‌خورد — FR-20.7
        const last = kept[kept.length - 1]
        let y = last.positionY
        for (const node of created) {
          await tx.chartNode.update({
            where: { id: node.id },
            data: { positionX: last.positionX, positionY: y + NODE_H_EST + ROW_GAP },
          })
          y += NODE_H_EST + ROW_GAP
        }
      }
      kept.push(...created)
    }

    // ۴) بازسازی زنجیرهٔ توالی پس از تغییر ساختار
    const finalNodes = await tx.chartNode.findMany({
      where: { projectId, chartType },
      orderBy: { sortOrder: 'asc' },
    })
    await rebuildChain(tx, projectId, chartType, finalNodes.map((n) => n.id))
  })
}

/** بازسازی یال‌های زنجیرهٔ توالی — فقط یال‌های سیستمی (isChain) دست می‌خورند؛ اتصال‌های دستی کاربر محفوظ‌اند */
async function rebuildChain(tx: Tx, projectId: string, chartType: ChartType, orderedIds: string[]): Promise<void> {
  const edges = await tx.chartEdge.findMany({ where: { projectId, chartType } })
  const desired: { source: string; target: string }[] = []
  for (let i = 0; i + 1 < orderedIds.length; i++) {
    desired.push({ source: orderedIds[i], target: orderedIds[i + 1] })
  }
  const pairKey = (s: string, t: string) => `${s}->${t}`
  const desiredKeys = new Set(desired.map((d) => pairKey(d.source, d.target)))
  const existingByKey = new Map(edges.map((e) => [pairKey(e.sourceNodeId, e.targetNodeId), e]))

  // حذف زنجیره‌هایی که دیگر متوالی نیستند
  for (const edge of edges) {
    if (edge.isChain && !desiredKeys.has(pairKey(edge.sourceNodeId, edge.targetNodeId))) {
      await tx.chartEdge.delete({ where: { id: edge.id } })
    }
  }
  // ایجاد جفت‌های متوالیِ ندارندهٔ یال (اگر کاربر خودش یال دستی بین جفت متوالی ساخته، همان را زنجیره اعلام می‌کنیم)
  for (const d of desired) {
    const key = pairKey(d.source, d.target)
    const existing = existingByKey.get(key)
    if (!existing) {
      await tx.chartEdge.create({
        data: {
          projectId,
          chartType,
          sourceNodeId: d.source,
          targetNodeId: d.target,
          isChain: true,
          sortOrder: 0,
        },
      })
    } else if (!existing.isChain) {
      await tx.chartEdge.update({ where: { id: existing.id }, data: { isChain: true } })
    }
  }
}

/** چیدمان خودکار لایه‌ای — زنجیرهٔ خطی = ستون عمودی کلاسیک؛ انشعاب = ردیف‌های کنار هم */
export function computeAutoLayout(
  nodes: { id: string; sortOrder: number }[],
  edges: { sourceNodeId: string; targetNodeId: string }[]
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>()
  if (nodes.length === 0) return positions

  // لایه‌گذاری توپولوژیک (با تحمل چرخه)
  const indeg = new Map<string, number>()
  const out = new Map<string, string[]>()
  for (const n of nodes) {
    indeg.set(n.id, 0)
    out.set(n.id, [])
  }
  for (const e of edges) {
    if (indeg.has(e.sourceNodeId) && indeg.has(e.targetNodeId)) {
      indeg.set(e.targetNodeId, (indeg.get(e.targetNodeId) ?? 0) + 1)
      out.get(e.sourceNodeId)!.push(e.targetNodeId)
    }
  }
  const layer = new Map<string, number>()
  let queue = nodes.filter((n) => (indeg.get(n.id) ?? 0) === 0).map((n) => n.id)
  for (const id of queue) layer.set(id, 0)
  let maxLayer = 0
  while (queue.length > 0) {
    const next: string[] = []
    for (const id of queue) {
      const cur = layer.get(id) ?? 0
      for (const succ of out.get(id) ?? []) {
        layer.set(succ, Math.max(layer.get(succ) ?? 0, cur + 1))
        maxLayer = Math.max(maxLayer, layer.get(succ) ?? 0)
        const d = indeg.get(succ)! - 1
        indeg.set(succ, d)
        if (d === 0) next.push(succ)
      }
    }
    queue = next
  }
  // اعضای چرخه: پس از عمیق‌ترین لایه به ترتیب توالی
  const cyclic = nodes.filter((n) => !layer.has(n.id)).sort((a, b) => a.sortOrder - b.sortOrder)
  let fallbackLayer = maxLayer + 1
  for (const n of cyclic) layer.set(n.id, fallbackLayer++)

  // چینش هر لایه حول محور (سپس نرمال‌سازی به مختصات مثبت)
  const byLayer = new Map<number, { id: string; sortOrder: number }[]>()
  for (const n of nodes) {
    const l = layer.get(n.id) ?? 0
    if (!byLayer.has(l)) byLayer.set(l, [])
    byLayer.get(l)!.push(n)
  }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [l, members] of byLayer) {
    members.sort((a, b) => a.sortOrder - b.sortOrder)
    const step = NODE_W + COL_GAP
    const startX = -((members.length - 1) * step) / 2
    members.forEach((m, i) => {
      const x = startX + i * step
      const y = l * (NODE_H_EST + ROW_GAP)
      positions.set(m.id, { x, y })
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    })
  }
  // نرمال‌سازی با حاشیه
  const dx = CANVAS_MARGIN - (Number.isFinite(minX) ? minX : 0)
  const dy = CANVAS_MARGIN - (Number.isFinite(minY) ? minY : 0)
  for (const [id, p] of positions) {
    positions.set(id, { x: Math.round(p.x + dx), y: Math.round(p.y + dy) })
  }
  void maxX
  void maxY
  return positions
}

// ─── خواندن نمودار (با سینک تنبل) ───

export async function getChart(projectId: string, chartTypeInput: string): Promise<ChartDto> {
  assertChartType(chartTypeInput)
  await assertProject(projectId)
  await syncChart(projectId, chartTypeInput)

  const [nodes, edges, allActivities] = await Promise.all([
    db.chartNode.findMany({ where: { projectId, chartType: chartTypeInput }, orderBy: { sortOrder: 'asc' } }),
    db.chartEdge.findMany({ where: { projectId, chartType: chartTypeInput }, orderBy: { sortOrder: 'asc' } }),
    loadProjectActivities(projectId),
  ])
  const activityById = new Map(allActivities.map((a) => [a.id, a]))
  const qualifyingCount = allActivities.filter((a) =>
    chartTypeInput === 'OPC' ? OPC_TYPES.has(a.processType) : true
  ).length

  const byType: Record<string, number> = {}
  for (const t of ALL_TYPES) byType[t] = 0
  let maxX = CANVAS_MARGIN * 2
  let maxY = CANVAS_MARGIN * 2
  const nodeDtos: ChartNodeDto[] = nodes.map((n) => {
    byType[n.nodeType] = (byType[n.nodeType] ?? 0) + 1
    maxX = Math.max(maxX, n.positionX + NODE_W + CANVAS_MARGIN)
    maxY = Math.max(maxY, n.positionY + NODE_H_EST + CANVAS_MARGIN)
    const activity = n.activityId ? activityById.get(n.activityId) : undefined
    return {
      id: n.id,
      nodeType: n.nodeType,
      label: n.label,
      activityId: n.activityId,
      activityName: activity?.name ?? null,
      stationName: activity?.stationName ?? null,
      isManual: n.isManual,
      sortOrder: n.sortOrder,
      positionX: n.positionX,
      positionY: n.positionY,
    }
  })

  return {
    chartType: chartTypeInput,
    nodes: nodeDtos,
    edges: edges.map((e) => ({
      id: e.id,
      sourceNodeId: e.sourceNodeId,
      targetNodeId: e.targetNodeId,
      sourceAnchor: e.sourceAnchor,
      targetAnchor: e.targetAnchor,
      isChain: e.isChain,
      sortOrder: e.sortOrder,
    })),
    counts: {
      total: nodes.length,
      auto: nodes.filter((n) => !n.isManual).length,
      manual: nodes.filter((n) => n.isManual).length,
      byType,
      activitiesIncluded: qualifyingCount,
      activitiesTotal: allActivities.length,
    },
    canvas: { width: maxX, height: maxY },
    isExtendedOpc: chartTypeInput === "OPC" && isExtendedOpc(nodes),
  }
}

// ─── گره دستی — FR-20.5 ───

export async function createManualNode(projectId: string, chartTypeInput: string, input: ChartManualNodeCreateInput) {
  assertChartType(chartTypeInput)
  await assertProject(projectId)
  const allowed = allowedNodeTypes(chartTypeInput)
  if (!allowed.includes(input.nodeType)) {
    throw new AppError(
      'NODE_TYPE_NOT_ALLOWED',
      chartTypeInput === 'OPC'
        ? 'در نمودار OPC کلاسیک فقط گره عملیات و بازرسی مجاز است؛ «ورودی مواد» و «انبارش» به‌عنوان توسعهٔ اختیاری قابل افزودن‌اند (نمودار به حالت OPC توسعه‌یافته می‌رود).'
        : 'نوع گره معتبر نیست.',
      422
    )
  }

  const existing = await db.chartNode.findMany({
    where: { projectId, chartType: chartTypeInput },
    orderBy: { sortOrder: 'asc' },
  })

  const node = await db.chartNode.create({
    data: {
      projectId,
      chartType: chartTypeInput,
      nodeType: input.nodeType,
      activityId: null,
      label: input.label,
      isManual: true,
      sortOrder: existing.length > 0 ? Math.max(...existing.map((n) => n.sortOrder)) + 1 : 0,
      // الحاق زیر آخرین گره — چیدمان موجود دست نمی‌خورد
      positionX: existing.length > 0 ? existing[existing.length - 1].positionX : CANVAS_MARGIN,
      positionY:
        existing.length > 0
          ? existing[existing.length - 1].positionY + NODE_H_EST + ROW_GAP
          : CANVAS_MARGIN,
    },
  })

  // گره جدید به انتهای زنجیرهٔ توالی وصل می‌شود (در صورت وجود زنجیره)
  await db.$transaction(async (tx) => {
    const finalNodes = await tx.chartNode.findMany({
      where: { projectId, chartType: chartTypeInput },
      orderBy: { sortOrder: 'asc' },
    })
    await rebuildChain(tx, projectId, chartTypeInput, finalNodes.map((n) => n.id))
  })

  await recordAudit({
    entityType: 'ChartNode', entityId: node.id, action: 'CREATE', entityName: node.label,
    after: { label: node.label, nodeType: node.nodeType, chartType: chartTypeInput }, projectId,
  })
  return node
}

// ─── به‌روزرسانی گره (برچسب/نوع فقط دستی؛ مختصات همه) — FR-20.5/7 ───

export async function updateChartNode(nodeId: string, input: ChartNodeUpdateInput) {
  const existing = await db.chartNode.findUnique({ where: { id: nodeId } })
  if (!existing) throw new AppError('NODE_NOT_FOUND', 'گره یافت نشد.', 404)

  const data: Record<string, unknown> = {}
  if (input.label !== undefined || input.nodeType !== undefined) {
    if (!existing.isManual) {
      throw new AppError(
        'AUTO_NODE_LOCKED',
        'برچسب و نوع گره‌های خودکار از فعالیت متناظر می‌آید؛ برای تغییر، مشخصات فعالیت را در ساختار تولید ویرایش کنید.',
        422
      )
    }
    if (input.label !== undefined) data.label = input.label
    if (input.nodeType !== undefined) {
      const allowed = allowedNodeTypes(existing.chartType as ChartType)
      if (!allowed.includes(input.nodeType)) {
        throw new AppError(
          'NODE_TYPE_NOT_ALLOWED',
          existing.chartType === 'OPC'
            ? 'در نمودار OPC کلاسیک فقط گره عملیات و بازرسی مجاز است؛ «ورودی مواد» و «انبارش» به‌عنوان توسعهٔ اختیاری قابل افزودن‌اند.'
            : 'نوع گره معتبر نیست.',
          422
        )
      }
      data.nodeType = input.nodeType
    }
  }
  if (input.positionX !== undefined) data.positionX = input.positionX
  if (input.positionY !== undefined) data.positionY = input.positionY

  const updated = await db.chartNode.update({ where: { id: nodeId }, data })
  // جابه‌جایی دستی مختصات است؛ Audit فقط برای تغییر محتوایی (نه درگ مکرر)
  if (input.label !== undefined || input.nodeType !== undefined) {
    await recordAudit({
      entityType: 'ChartNode', entityId: nodeId, action: 'UPDATE', entityName: updated.label,
      before: { label: existing.label, nodeType: existing.nodeType },
      after: { label: updated.label, nodeType: updated.nodeType },
      projectId: existing.projectId,
    })
  }
  return updated
}

// ─── حذف گره — فقط دستی — FR-20.5 ───

export async function deleteChartNode(nodeId: string) {
  const existing = await db.chartNode.findUnique({ where: { id: nodeId } })
  if (!existing) throw new AppError('NODE_NOT_FOUND', 'گره یافت نشد.', 404)
  if (!existing.isManual) {
    throw new AppError(
      'AUTO_NODE_NOT_DELETABLE',
      'گره‌های خودکار به فعالیت متصل‌اند؛ برای حذف، فعالیت مربوط را در ساختار تولید حذف کنید. حذف گره نمودار مشاهدات را حذف نمی‌کند و مسیر درست، حذف فعالیت است.',
      422
    )
  }
  await db.$transaction(async (tx) => {
    await tx.chartEdge.deleteMany({ where: { OR: [{ sourceNodeId: nodeId }, { targetNodeId: nodeId }] } })
    await tx.chartNode.delete({ where: { id: nodeId } })
    const remaining = await tx.chartNode.findMany({
      where: { projectId: existing.projectId, chartType: existing.chartType },
      orderBy: { sortOrder: 'asc' },
    })
    await rebuildChain(tx, existing.projectId, existing.chartType as ChartType, remaining.map((n) => n.id))
  })
  await recordAudit({
    entityType: 'ChartNode', entityId: nodeId, action: 'DELETE', entityName: existing.label,
    projectId: existing.projectId,
  })
}

// ─── اتصال گره‌ها — FR-20 / فاز ۵ «اتصال و ترتیب» ───

export async function createChartEdge(
  projectId: string,
  sourceNodeId: string,
  targetNodeId: string,
  anchors?: { sourceAnchor?: 'top' | 'bottom' | 'left' | 'right'; targetAnchor?: 'top' | 'bottom' | 'left' | 'right' }
) {
  await assertProject(projectId)
  if (sourceNodeId === targetNodeId) {
    throw new AppError('SELF_EDGE', 'اتصال یک گره به خودش معنی ندارد.', 422)
  }
  const [source, target] = await Promise.all([
    db.chartNode.findUnique({ where: { id: sourceNodeId } }),
    db.chartNode.findUnique({ where: { id: targetNodeId } }),
  ])
  if (!source || !target || source.projectId !== projectId || target.projectId !== projectId) {
    throw new AppError('NODE_NOT_FOUND', 'گره مبدأ یا مقصد در این پروژه یافت نشد.', 404)
  }
  if (source.chartType !== target.chartType) {
    throw new AppError('CHART_TYPE_MISMATCH', 'دو گره باید در نمودار یکسان باشند.', 422)
  }
  const duplicate = await db.chartEdge.findFirst({
    where: {
      projectId,
      chartType: source.chartType,
      OR: [
        { sourceNodeId, targetNodeId },
        { sourceNodeId: targetNodeId, targetNodeId: sourceNodeId },
      ],
    },
  })
  if (duplicate) {
    throw new AppError('DUPLICATE_EDGE', 'این دو گره قبلاً به هم متصل شده‌اند.', 422)
  }
  const edge = await db.chartEdge.create({
    data: {
      projectId,
      sourceAnchor: anchors?.sourceAnchor ?? null,
      targetAnchor: anchors?.targetAnchor ?? null,
      chartType: source.chartType,
      sourceNodeId,
      targetNodeId,
      isChain: false,
      sortOrder: 0,
    },
  })
  await recordAudit({
    entityType: 'ChartEdge', entityId: edge.id, action: 'CREATE',
    entityName: `اتصال ${source.label} ← ${target.label}`,
    after: { sourceNodeId, targetNodeId, chartType: source.chartType }, projectId,
  })
  return edge
}

export async function deleteChartEdge(edgeId: string) {
  const existing = await db.chartEdge.findUnique({ where: { id: edgeId } })
  if (!existing) throw new AppError('EDGE_NOT_FOUND', 'اتصال یافت نشد.', 404)
  await db.chartEdge.delete({ where: { id: edgeId } })
  await recordAudit({
    entityType: 'ChartEdge', entityId: edgeId, action: 'DELETE',
    entityName: 'حذف اتصال گره‌ها', projectId: existing.projectId,
  })
}

// ─── ترتیب گره‌ها — جابه‌جایی در توالی ───

export async function moveChartNodeOrder(input: ChartOrderMoveInput) {
  const node = await db.chartNode.findUnique({ where: { id: input.nodeId } })
  if (!node) throw new AppError('NODE_NOT_FOUND', 'گره یافت نشد.', 404)

  const all = await db.chartNode.findMany({
    where: { projectId: node.projectId, chartType: node.chartType },
    orderBy: { sortOrder: 'asc' },
  })
  const idx = all.findIndex((n) => n.id === node.id)
  const swapWith = input.direction === 'up' ? idx - 1 : idx + 1
  if (swapWith < 0 || swapWith >= all.length) {
    throw new AppError(
      'ORDER_BOUNDARY',
      input.direction === 'up' ? 'این گره در ابتدای توالی است.' : 'این گره در انتهای توالی است.',
      422
    )
  }

  await db.$transaction(async (tx) => {
    // جابه‌جایی و شماره‌گذاری فشرده
    const reordered = [...all]
    ;[reordered[idx], reordered[swapWith]] = [reordered[swapWith], reordered[idx]]
    for (let i = 0; i < reordered.length; i++) {
      if (reordered[i].sortOrder !== i) {
        await tx.chartNode.update({ where: { id: reordered[i].id }, data: { sortOrder: i } })
      }
    }
    await rebuildChain(tx, node.projectId, node.chartType as ChartType, reordered.map((n) => n.id))
  })
  await recordAudit({
    entityType: 'ChartNode', entityId: node.id, action: 'REORDER', entityName: node.label,
    after: { direction: input.direction }, projectId: node.projectId,
  })
  return { moved: true }
}

// ─── چیدمان خودکار (بازنشانی) — FR-20.6 ───

export async function applyChartAutoLayout(projectId: string, chartTypeInput: string) {
  assertChartType(chartTypeInput)
  await assertProject(projectId)
  const [nodes, edges] = await Promise.all([
    db.chartNode.findMany({ where: { projectId, chartType: chartTypeInput }, orderBy: { sortOrder: 'asc' } }),
    db.chartEdge.findMany({ where: { projectId, chartType: chartTypeInput } }),
  ])
  const positions = computeAutoLayout(nodes, edges)
  await db.$transaction(
    nodes.flatMap((n) => {
      const p = positions.get(n.id)
      return p ? [db.chartNode.update({ where: { id: n.id }, data: { positionX: p.x, positionY: p.y } })] : []
    })
  )
  await recordAudit({
    entityType: 'ChartNode', entityId: projectId, action: 'UPDATE',
    entityName: 'چیدمان خودکار نمودار', after: { chartType: chartTypeInput, nodes: nodes.length }, projectId,
  })
  return getChart(projectId, chartTypeInput)
}

// ─── اتصال به چرخهٔ عمر فعالیت — FR-20.10 ───

/** حذف گره‌های خودکار فعالیت‌های در حال حذف + یال‌های وابسته (داخل تراکنشِ حذف ساختار) */
export async function deleteActivityChartRows(tx: Tx, activityIds: string[]): Promise<void> {
  if (activityIds.length === 0) return
  const nodes = await tx.chartNode.findMany({
    where: { activityId: { in: activityIds }, isManual: false },
    select: { id: true },
  })
  if (nodes.length === 0) return
  const nodeIds = nodes.map((n) => n.id)
  await tx.chartEdge.deleteMany({ where: { OR: [{ sourceNodeId: { in: nodeIds } }, { targetNodeId: { in: nodeIds } }] } })
  await tx.chartNode.deleteMany({ where: { id: { in: nodeIds } } })
}

/** بازسازی زنجیره‌های هر دو نمودار پس از حذف فعالیت‌ها (خارج از تراکنش) */
export async function rebuildProjectChains(projectId: string): Promise<void> {
  for (const chartType of ['OPC', 'FPC'] as const) {
    const nodes = await db.chartNode.findMany({
      where: { projectId, chartType },
      orderBy: { sortOrder: 'asc' },
    })
    await db.$transaction(async (tx) => {
      await rebuildChain(tx, projectId, chartType, nodes.map((n) => n.id))
    })
  }
}

/** پس از ویرایش فعالیت: همگام‌سازی برچسب/نوع + حذف از OPC در صورت خارج‌شدن از دامنهٔ انواع آن */
export async function syncActivityAfterUpdate(activityId: string, projectId: string): Promise<void> {
  const activity = await db.activity.findUnique({
    where: { id: activityId },
    select: { id: true, name: true, processType: true },
  })
  if (!activity) return

  for (const chartType of ['OPC', 'FPC'] as const) {
    const node = await db.chartNode.findFirst({ where: { activityId, chartType } })
    if (chartType === 'OPC') {
      if (!OPC_TYPES.has(activity.processType)) {
        // فعالیت دیگر مشمول OPC نیست → گره خودکار آن پاک می‌شود (گره‌های دستی بی‌دلیل حذف نمی‌شوند)
        if (node) {
          await db.$transaction(async (tx) => {
            await tx.chartEdge.deleteMany({ where: { OR: [{ sourceNodeId: node.id }, { targetNodeId: node.id }] } })
            await tx.chartNode.delete({ where: { id: node.id } })
            const remaining = await tx.chartNode.findMany({
              where: { projectId, chartType }, orderBy: { sortOrder: 'asc' },
            })
            await rebuildChain(tx, projectId, chartType, remaining.map((n) => n.id))
          })
        }
        continue
      }
    }
    if (node) {
      if (node.label !== activity.name || node.nodeType !== activity.processType) {
        await db.chartNode.update({
          where: { id: node.id },
          data: { label: activity.name, nodeType: activity.processType },
        })
      }
    }
  }
}

/** پس از ایجاد فعالیت: اگر نموداری از قبل ساخته شده باشد، گره جدید بلافاصله الحاق می‌شود */
export async function appendActivityToExistingCharts(projectId: string, activityId: string): Promise<void> {
  const activity = await db.activity.findUnique({
    where: { id: activityId },
    select: { id: true, name: true, processType: true },
  })
  if (!activity) return
  for (const chartType of ['OPC', 'FPC'] as const) {
    if (chartType === 'OPC' && !OPC_TYPES.has(activity.processType)) continue
    const count = await db.chartNode.count({ where: { projectId, chartType } })
    if (count === 0) continue // نمودار هنوز ساخته نشده — سینک تنبل هنگام بازکردن می‌سازد
    const existing = await db.chartNode.findFirst({ where: { activityId, chartType } })
    if (existing) continue
    await syncChart(projectId, chartType)
  }
}

// ─── وضعیت مرحلهٔ نمودار برای stage-status ───

export async function getChartsStageState(projectId: string): Promise<{
  activitiesCount: number
  opcNodes: number
  opcEdges: number
  unconnectedOpc: number
}> {
  const [activitiesCount, opcNodes, opcEdges] = await Promise.all([
    db.activity.count({ where: { station: { projectId } } }),
    db.chartNode.count({ where: { projectId, chartType: 'OPC' } }),
    db.chartEdge.count({ where: { projectId, chartType: 'OPC' } }),
  ])
  const nodes = await db.chartNode.findMany({
    where: { projectId, chartType: 'OPC' },
    select: { id: true },
  })
  const edges = await db.chartEdge.findMany({
    where: { projectId, chartType: 'OPC' },
    select: { sourceNodeId: true, targetNodeId: true },
  })
  const connected = new Set<string>()
  for (const e of edges) {
    connected.add(e.sourceNodeId)
    connected.add(e.targetNodeId)
  }
  return {
    activitiesCount,
    opcNodes,
    opcEdges,
    unconnectedOpc: nodes.filter((n) => !connected.has(n.id)).length,
  }
}
