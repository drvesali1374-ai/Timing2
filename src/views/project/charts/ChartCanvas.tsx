'use client'

// ═══════════════════════════════════════════════════════════
// بوم نمودار فرایند OPC/FPC — بازطراحی جلسه ۲ §۱۵
// ▸ Zoom In/Out/Fit/Reset + درصد زوم + wheel — مختصات واقعی گره‌ها جدا از زوم
// ▸ Pan با درگ زمینه + کنترل‌های لمسی/ترک‌پد قابل پیش‌بینی
// ▸ چهار anchor (بالا/پایین/چپ/راست) — اتصال با drag از anchor به anchor
// ▸ مسیر یال orthogonal/elbow — بازمحاسبه با جابه‌جایی گره
// ▸ snapshot چیدمان دستی قبل از Auto Layout + «بازگردانی آخرین چیدمان دستی»
// ▸ ابعاد بوم دلخواه با preset — مستقل از زوم و PDF
// ▸ خروجی PDF تک‌صفحه‌ای/تایل‌دار
// ▸ گره ورودی مواد (MATERIAL_INPUT) + انبار اختیاری در OPC → «OPC توسعه‌یافته»
// ═══════════════════════════════════════════════════════════
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  ChevronDown,
  ChevronUp,
  FileDown,
  History,
  Loader2,
  Maximize2,
  Pencil,
  Plus,
  RefreshCw,
  Ruler,
  Trash2,
  Undo2,
  Redo2,
  Waypoints,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { ConfirmDeleteDialog, EmptyState } from '@/components/common/Feedback'
import { ProcessSymbol, PROCESS_TYPE_LABELS_WITH_INPUT } from '@/components/common/ProcessSymbol'
import { chartsApi, type ChartEdgeDto, type ChartNodeDto, type ChartTypeValue } from '@/lib/api/endpoints'
import { qk } from '@/lib/api/keys'
import { MATERIAL_INPUT_NODE_TYPE } from '@/domain/types'
import { useDisplayPrefs } from '@/store/display-store'
import { formatInt } from '@/lib/format'
import { cn } from '@/lib/utils'
import PdfExportDialog from './PdfExportDialog'
import { useChartHistory, type HistoryEntry } from './useChartHistory'

// ابعاد مرجع گره — باید با ثابت‌های چیدمان بک‌اند هماهنگ بماند
const NODE_W = 200
const NODE_H = 96
const MARGIN = 48

type AnchorSide = 'top' | 'bottom' | 'left' | 'right'
const ANCHOR_POS: Record<AnchorSide, { x: number; y: number }> = {
  top: { x: NODE_W / 2, y: 0 },
  bottom: { x: NODE_W / 2, y: NODE_H },
  left: { x: 0, y: NODE_H / 2 },
  right: { x: NODE_W, y: NODE_H / 2 },
}
const ANCHOR_NORMAL: Record<AnchorSide, { x: number; y: number }> = {
  top: { x: 0, y: -1 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
}

interface Position { x: number; y: number }

function anchorPoint(p: Position, a: AnchorSide): Position {
  return { x: p.x + ANCHOR_POS[a].x, y: p.y + ANCHOR_POS[a].y }
}

/** v1.5.2 §۶-۱ — انتخاب خودکار جفت anchor از میان «همهٔ ترکیب‌ها» (۴×۴).
 *  بر خلاف نسخهٔ قبل که فقط زوج‌های هم‌جهت (top-bottom / left-right) را
 *  می‌ساخت، اکنون نزدیک‌ترین زوج نقطهٔ مناسب از هر دو مستطیل انتخاب
 *  می‌شود — حتی ترکیب‌های متقاطع مثل left-top یا right-bottom.
 *  معیار: طول مسیر elbow + جریمهٔ سنگین برای عبور از داخل گره‌ها. */
const ALL_SIDES: AnchorSide[] = ['top', 'bottom', 'left', 'right']

/** تقاطع پاره‌خط با مستطیل (برای جریمهٔ عبور از داخل گره) */
function segmentHitsRect(a: Position, b: Position, r: { x: number; y: number; w: number; h: number }): boolean {
  // نمونه‌گیری چندنقطه‌ای روی پاره‌خط — کافی و ارزان
  const steps = 12
  for (let i = 0; i <= steps; i++) {
    const k = i / steps
    const x = a.x + (b.x - a.x) * k
    const y = a.y + (b.y - a.y) * k
    if (x > r.x + 1 && x < r.x + r.w - 1 && y > r.y + 1 && y < r.y + r.h - 1) return true
  }
  return false
}

/** نقاط مسیر elbow از anchor مبدأ به anchor مقصد — v1.5.2 §۶-۱/§۶-۲ */
function elbowPoints(s: Position, sa: AnchorSide, t: Position, ta: AnchorSide): Position[] {
  const sA = anchorPoint(s, sa)
  const tA = anchorPoint(t, ta)
  const stub = 22
  const sOut = { x: sA.x + ANCHOR_NORMAL[sa].x * stub, y: sA.y + ANCHOR_NORMAL[sa].y * stub }
  /** §۶-۳ — نقطهٔ ورود به مقصد باید «بیرون» گره باشد (tA + نرمال×stub)،
   *  تا آخرین قطعهٔ مسیر (tIn→tA) به سمت داخل گره و پیکانِ marker-end
   *  رو به مقصد باشد. فرمول قبلی (tA − نرمال×stub) نقطه را داخل گره
   *  می‌گذاشت؛ قطعهٔ آخر معکوس می‌شد و پیکان رو به مبدأ/زیر خط پنهان
   *  می‌ماند — یعنی marker-end هرگز دیده نمی‌شد. */
  const tIn = { x: tA.x + ANCHOR_NORMAL[ta].x * stub, y: tA.y + ANCHOR_NORMAL[ta].y * stub }
  const pts: Position[] = [sA, sOut]
  const vSrc = sa === 'bottom' || sa === 'top'
  const vDst = ta === 'bottom' || ta === 'top'
  if (Math.abs(sOut.x - tIn.x) > 1 && Math.abs(sOut.y - tIn.y) > 1) {
    if (vSrc && vDst) {
      const midY = (sOut.y + tIn.y) / 2
      pts.push({ x: sOut.x, y: midY }, { x: tIn.x, y: midY })
    } else if (!vSrc && !vDst) {
      const midX = (sOut.x + tIn.x) / 2
      pts.push({ x: midX, y: sOut.y }, { x: midX, y: tIn.y })
    } else if (vSrc && !vDst) {
      // مبدأ عمودی → مقصد افقی: خم در سطح ورودی افقی مقصد
      pts.push({ x: sOut.x, y: tIn.y })
    } else {
      // مبدأ افقی → مقصد عمودی: خم در سطح خروجی افقی مبدأ
      pts.push({ x: tIn.x, y: sOut.y })
    }
  }
  pts.push(tIn, tA)
  return pts
}

/** امتیاز یک زوج anchor: طول مسیر + جریمهٔ عبور از داخل گره‌ها (§۶-۱) */
function anchorPairScore(
  s: Position, sa: AnchorSide, t: Position, ta: AnchorSide,
  srcRect: { x: number; y: number; w: number; h: number },
  dstRect: { x: number; y: number; w: number; h: number },
): number {
  const pts = elbowPoints(s, sa, t, ta)
  let len = 0
  for (let i = 1; i < pts.length; i++) {
    len += Math.abs(pts[i].x - pts[i - 1].x) + Math.abs(pts[i].y - pts[i - 1].y)
  }
  let penalty = 0
  for (let i = 1; i < pts.length; i++) {
    if (segmentHitsRect(pts[i - 1], pts[i], srcRect)) penalty += 400
    if (segmentHitsRect(pts[i - 1], pts[i], dstRect)) penalty += 400
  }
  return len + penalty
}

/** بهترین جفت anchor از میان همهٔ ۱۶ ترکیب (§۶-۱) */
function autoAnchors(s: Position, t: Position): [AnchorSide, AnchorSide] {
  const srcRect = { x: s.x, y: s.y, w: NODE_W, h: NODE_H }
  const dstRect = { x: t.x, y: t.y, w: NODE_W, h: NODE_H }
  let best: [AnchorSide, AnchorSide] = ['bottom', 'top']
  let bestScore = Infinity
  for (const sa of ALL_SIDES) {
    for (const ta of ALL_SIDES) {
      if (sa === ta) continue
      const score = anchorPairScore(s, sa, t, ta, srcRect, dstRect)
      if (score < bestScore) {
        bestScore = score
        best = [sa, ta]
      }
    }
  }
  return best
}

/** مسیر orthogonal/elbow از anchor مبدأ به anchor مقصد — بدون عبور از داخل گره */
function orthogonalPath(s: Position, sa: AnchorSide, t: Position, ta: AnchorSide): string {
  return elbowPoints(s, sa, t, ta)
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${Math.round(p.x)} ${Math.round(p.y)}`)
    .join(' ')
}

const OPC_ALLOWED: string[] = ['OPERATION', 'INSPECTION', MATERIAL_INPUT_NODE_TYPE, 'STORAGE']
const FPC_ALLOWED: string[] = ['OPERATION', 'INSPECTION', 'TRANSPORT', 'DELAY', 'STORAGE', MATERIAL_INPUT_NODE_TYPE]

const CANVAS_PRESETS = [
  { label: 'کوچک (۱۲۰۰×۸۰۰)', w: 1200, h: 800 },
  { label: 'متوسط (۲۰۰۰×۱۲۰۰)', w: 2000, h: 1200 },
  { label: 'بزرگ (۳۰۰۰×۱۸۰۰)', w: 3000, h: 1800 },
  { label: 'خیلی بزرگ (۴۰۰۰×۲۴۰۰)', w: 4000, h: 2400 },
]

export default function ChartCanvas({ projectId, chartType }: { projectId: string; chartType: ChartTypeValue }) {
  const prefs = useDisplayPrefs()
  const qc = useQueryClient()

  const chartQuery = useQuery({
    queryKey: qk.chart(projectId, chartType),
    queryFn: () => chartsApi.get(projectId, chartType),
  })
  const canvasQ = useQuery({
    queryKey: ['chart-canvas-size', projectId, chartType],
    queryFn: () => chartsApi.getCanvas(projectId, chartType),
  })
  const snapshotQ = useQuery({
    queryKey: ['chart-layout-snapshot', projectId, chartType],
    queryFn: () => chartsApi.getLayoutSnapshot(projectId, chartType),
  })

  // ── وضعیت محلی ──
  const [positions, setPositions] = useState<Record<string, Position>>({})
  const [dragging, setDragging] = useState<{ id: string; startX: number; startY: number; orig: Position } | null>(null)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState<Position>({ x: 0, y: 0 })
  const [panning, setPanning] = useState<{ startX: number; startY: number; origX: number; origY: number } | null>(null)
  const [connecting, setConnecting] = useState<{ sourceId: string; sourceAnchor: AnchorSide; x: number; y: number } | null>(null)
  const [hoverTarget, setHoverTarget] = useState<{ nodeId: string; anchor: AnchorSide } | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [editNode, setEditNode] = useState<ChartNodeDto | null>(null)
  const [infoNode, setInfoNode] = useState<ChartNodeDto | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ChartNodeDto | null>(null)
  const [edgeTarget, setEdgeTarget] = useState<ChartEdgeDto | null>(null)
  /** v1.5.2 §۶-۶ — یال انتخاب‌شده (کلیک روی یال → هایلایت + دکمه/کلید حذف) */
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  const [pdfOpen, setPdfOpen] = useState(false)
  const [canvasOpen, setCanvasOpen] = useState(false)
  const dragMovedRef = useRef(false)
  const viewportRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  const data = chartQuery.data
  const nodes = useMemo(() => data?.nodes ?? [], [data])
  const edges = useMemo(() => data?.edges ?? [], [data])
  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes])
  /** §۶-۶ — یال انتخاب‌شدهٔ فعلی (اگر هنوز موجود باشد) */
  const selectedEdge = useMemo(() => edges.find((e) => e.id === selectedEdgeId) ?? null, [edges, selectedEdgeId])

  /** §۱۰.۸ — تاریخچهٔ Undo/Redy بوم؛ busy = جهش در حال اجرا */
  const historyBusy = () =>
    savePositionMutation.isPending ||
    moveOrderMutation.isPending ||
    layoutMutation.isPending ||
    restoreSnapshotMutation.isPending ||
    createNodeMutation.isPending ||
    updateContentMutation.isPending ||
    deleteNodeMutation.isPending ||
    createEdgeMutation.isPending ||
    deleteEdgeMutation.isPending ||
    edgeAppearanceMutation.isPending
  const { push: pushHistory, undo, redo, canUndo, canRedo, undoLabel, redoLabel } = useChartHistory(historyBusy)

  useEffect(() => {
    if (data) {
      void qc.invalidateQueries({ queryKey: qk.projectSummary(projectId) })
    }
  }, [data?.counts.total, data, projectId, qc])

  const pos = useCallback(
    (n: ChartNodeDto): Position => positions[n.id] ?? { x: n.positionX, y: n.positionY },
    [positions]
  )

  const invalidateAll = useCallback(async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: qk.chart(projectId, chartType) }),
      qc.invalidateQueries({ queryKey: qk.projectSummary(projectId) }),
    ])
  }, [qc, projectId, chartType])

  /** ذخیرهٔ snapshot آخرین چیدمان دستی — پس از هر جابه‌جایی موفق */
  const saveSnapshot = useCallback(
    async (currentNodes: ChartNodeDto[], currentPositions: Record<string, Position>, canvas: { width: number; height: number }) => {
      try {
        await chartsApi.saveLayoutSnapshot(projectId, chartType, {
          nodes: currentNodes.map((n) => ({
            id: n.id,
            positionX: currentPositions[n.id]?.x ?? n.positionX,
            positionY: currentPositions[n.id]?.y ?? n.positionY,
          })),
          canvas,
        })
        void qc.invalidateQueries({ queryKey: ['chart-layout-snapshot', projectId, chartType] })
      } catch {
        /* snapshot بی‌صدا — چیدمان اصلی ذخیره شده است */
      }
    },
    [projectId, chartType, qc]
  )

  // ── جهش‌ها ──
  const savePositionMutation = useMutation({
    mutationFn: ({ nodeId, x, y }: { nodeId: string; x: number; y: number }) =>
      chartsApi.updateNode(nodeId, { positionX: x, positionY: y }),
    onError: (e: Error) => toast.error(`ذخیرهٔ مختصات گره ناموفق بود: ${e.message}`),
  })

  const moveOrderMutation = useMutation({
    mutationFn: (body: { nodeId: string; direction: 'up' | 'down' }) =>
      chartsApi.moveOrder(projectId, chartType, body),
    onSuccess: async (_res, body) => {
      await invalidateAll()
      /* §۱۰.۸ — معکوس جابه‌جایی ترتیب، حرکت مخالف همان گره است */
      pushHistory({
        label: 'تغییر ترتیب گره',
        undo: () => chartsApi.moveOrder(projectId, chartType, { nodeId: body.nodeId, direction: body.direction === 'up' ? 'down' : 'up' }).then(() => invalidateAll()),
        redo: () => chartsApi.moveOrder(projectId, chartType, body).then(() => invalidateAll()),
      })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  // چیدمان خودکار: ابتدا snapshot دستی ذخیره می‌شود — سپس بازچینی (§۱۵.۵)
  const layoutMutation = useMutation({
    mutationFn: async () => {
      await saveSnapshot(nodes, positions, { width: effCanvas.w, height: effCanvas.h })
      return chartsApi.applyLayout(projectId, chartType)
    },
    onMutate: () => ({
      // §۱۰.۸ — مختصات همهٔ گره‌ها قبل از چیدمان خودکار
      before: nodes.map((n) => ({ id: n.id, x: pos(n).x, y: pos(n).y })),
    }),
    onSuccess: async (_res, _vars, ctx) => {
      setPositions({})
      await invalidateAll()
      toast.success('چیدمان خودکار اعمال شد؛ چیدمان دستی قبلی ذخیره شد و با «بازگردانی چیدمان دستی» قابل بازیابی است.')
      const before = (ctx as { before: Array<{ id: string; x: number; y: number }> } | undefined)?.before
      if (before && before.length > 0) {
        pushHistory({
          label: 'چیدمان خودکار',
          undo: async () => {
            for (const b of before) {
              await chartsApi.updateNode(b.id, { positionX: b.x, positionY: b.y })
            }
            await invalidateAll()
          },
          redo: async () => {
            await saveSnapshot(nodes, positions, { width: effCanvas.w, height: effCanvas.h })
            await chartsApi.applyLayout(projectId, chartType)
            await invalidateAll()
          },
        })
      }
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const restoreSnapshotMutation = useMutation({
    mutationFn: async () => {
      const snap = snapshotQ.data
      if (!snap) throw new Error('چیدمان دستی ذخیره‌شده‌ای وجود ندارد.')
      for (const n of snap.nodes) {
        await chartsApi.updateNode(n.id, { positionX: n.positionX, positionY: n.positionY })
      }
      return snap
    },
    onSuccess: async (snap) => {
      setPositions({})
      await invalidateAll()
      toast.success('آخرین چیدمان دستی بازگردانی شد.', {
        description: snap.savedAt ? `ذخیره‌شده در ${new Date(snap.savedAt).toLocaleString('fa-IR')}` : undefined,
      })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const createNodeMutation = useMutation({
    mutationFn: (body: { label: string; nodeType: string }) => chartsApi.createNode(projectId, chartType, body),
    onSuccess: async (res, body) => {
      setCreateOpen(false)
      await invalidateAll()
      toast.success('گره دستی به انتهای توالی اضافه شد.')
      /* §۱۰.۸ — Undo افزودن گره = حذف آن؛ Redo = بازسازی با همان مشخصات */
      const createdId = res.node.id
      pushHistory({
        label: `افزودن گره «${body.label}»`,
        undo: () => chartsApi.deleteNode(createdId).then(() => invalidateAll()),
        redo: async () => {
          await chartsApi.createNode(projectId, chartType, body)
          await invalidateAll()
        },
      })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const updateContentMutation = useMutation({
    mutationFn: ({ nodeId, body }: { nodeId: string; body: { label?: string; nodeType?: string } }) =>
      chartsApi.updateNode(nodeId, body),
    onMutate: ({ nodeId }) => {
      // §۱۰.۸ — snapshot مقادیر قبل برای Undo
      const n = nodes.find((x) => x.id === nodeId)
      return { before: n ? { label: n.label, nodeType: n.nodeType } : undefined }
    },
    onSuccess: async (_res, { nodeId, body }, ctx) => {
      setEditNode(null)
      await invalidateAll()
      toast.success('گره به‌روزرسانی شد.')
      const before = (ctx as { before?: { label?: string; nodeType?: string } } | undefined)?.before
      if (before) {
        pushHistory({
          label: 'ویرایش گره',
          undo: () => chartsApi.updateNode(nodeId, before).then(() => invalidateAll()),
          redo: () => chartsApi.updateNode(nodeId, body).then(() => invalidateAll()),
        })
      }
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const deleteNodeMutation = useMutation({
    mutationFn: (nodeId: string) => chartsApi.deleteNode(nodeId),
    onMutate: (nodeId: string) => {
      // §۱۰.۸ — snapshot گره + یال‌های آن برای بازسازی در Undo
      const n = nodes.find((x) => x.id === nodeId)
      const nodeEdges = edges.filter((e) => e.sourceNodeId === nodeId || e.targetNodeId === nodeId)
      return { node: n ? { ...n } : null, edges: nodeEdges.map((e) => ({ ...e })) }
    },
    onSuccess: async (_res, nodeId, ctx) => {
      setDeleteTarget(null)
      await invalidateAll()
      toast.success('گره دستی حذف شد؛ گره‌های خودکار فعالیت‌ها دست‌نخورده‌اند.')
      const snapshot = ctx as { node: ChartNodeDto | null; edges: ChartEdgeDto[] } | undefined
      const node = snapshot?.node
      if (node) {
        const removedEdges = snapshot?.edges ?? []
        /* §۱۰.۸ — Undo حذف گره = بازسازی با همان مشخصات/موقعیت + یال‌هایش؛
         * شناسهٔ گرهِ بازسازی‌شده روی خود ورودی نگه داشته می‌شود تا Redo
         * دقیقاً همان گره را حذف کند (بدون اتکا به کش ممکن است کهنه باشد). */
        const entry: HistoryEntry & { recreatedId?: string } = {
          label: `حذف گره «${node.label}»`,
          undo: async () => {
            const r = await chartsApi.createNode(projectId, chartType, { label: node.label, nodeType: node.nodeType })
            entry.recreatedId = r.node.id
            await chartsApi.updateNode(r.node.id, { positionX: node.positionX, positionY: node.positionY })
            for (const e of removedEdges) {
              const src = e.sourceNodeId === nodeId ? r.node.id : e.sourceNodeId
              const tgt = e.targetNodeId === nodeId ? r.node.id : e.targetNodeId
              await chartsApi.createEdge(projectId, { sourceNodeId: src, targetNodeId: tgt, sourceAnchor: null, targetAnchor: null }).catch(() => undefined)
            }
            await invalidateAll()
          },
          redo: async () => {
            if (entry.recreatedId) await chartsApi.deleteNode(entry.recreatedId)
            await invalidateAll()
          },
        }
        pushHistory(entry)
      }
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const createEdgeMutation = useMutation({
    mutationFn: (body: { sourceNodeId: string; targetNodeId: string; sourceAnchor: AnchorSide | null; targetAnchor: AnchorSide | null }) =>
      chartsApi.createEdge(projectId, body),
    onSuccess: async (res, body) => {
      await invalidateAll()
      toast.success('اتصال ایجاد شد.')
      /* §۱۰.۸ — Undo ایجاد یال = حذف؛ Redo = ایجاد مجدد همان اتصال */
      const createdId = res.edge.id
      pushHistory({
        label: 'ایجاد اتصال',
        undo: () => chartsApi.deleteEdge(createdId).then(() => invalidateAll()),
        redo: () => chartsApi.createEdge(projectId, body).then(() => invalidateAll()),
      })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const deleteEdgeMutation = useMutation({
    mutationFn: (edgeId: string) => chartsApi.deleteEdge(edgeId),
    onMutate: (edgeId: string) => {
      const e = edges.find((x) => x.id === edgeId)
      return { edge: e ? { ...e } : null }
    },
    onSuccess: async (_res, edgeId, ctx) => {
      setEdgeTarget(null)
      await invalidateAll()
      toast.success('اتصال حذف شد؛ مشاهدات زمان‌سنجی تغییری نکرده‌اند.')
      const snapshot = (ctx as { edge: ChartEdgeDto | null } | undefined)?.edge
      if (snapshot) {
        /* §۱۰.۸ — Undo حذف یال = ایجاد مجدد همان اتصال (مسیر هوشمند) */
        const entry: HistoryEntry & { recreatedId?: string } = {
          label: 'حذف اتصال',
          undo: async () => {
            const r = await chartsApi.createEdge(projectId, {
              sourceNodeId: snapshot.sourceNodeId,
              targetNodeId: snapshot.targetNodeId,
              sourceAnchor: null,
              targetAnchor: null,
            })
            entry.recreatedId = r.edge.id
            if (snapshot.lineStyle || snapshot.lineColor) {
              await chartsApi.updateEdgeAppearance(r.edge.id, { lineStyle: snapshot.lineStyle, lineColor: snapshot.lineColor }).catch(() => undefined)
            }
            await invalidateAll()
          },
          redo: async () => {
            if (entry.recreatedId) await chartsApi.deleteEdge(entry.recreatedId)
            else await chartsApi.deleteEdge(edgeId)
            await invalidateAll()
          },
        }
        pushHistory(entry)
      }
    },
    onError: (e: Error) => toast.error(e.message),
  })

  /** v1.5.2 §۱۰.۵ — تغییر ظاهر یال انتخاب‌شده (نوع خط/رنگ) */
  const edgeAppearanceMutation = useMutation({
    mutationFn: ({ edgeId, body }: { edgeId: string; body: { lineStyle?: 'SOLID' | 'DASHED' | 'DOTTED' | null; lineColor?: string | null } }) =>
      chartsApi.updateEdgeAppearance(edgeId, body),
    onMutate: ({ edgeId }) => {
      const e = edges.find((x) => x.id === edgeId)
      return { before: e ? { lineStyle: e.lineStyle, lineColor: e.lineColor } : null }
    },
    onSuccess: async (_res, { edgeId, body }, ctx) => {
      await invalidateAll()
      const before = (ctx as { before: { lineStyle: 'SOLID' | 'DASHED' | 'DOTTED' | null; lineColor: string | null } | null } | undefined)?.before
      if (before) {
        pushHistory({
          label: 'ظاهر اتصال',
          undo: () => chartsApi.updateEdgeAppearance(edgeId, before).then(() => invalidateAll()),
          redo: () => chartsApi.updateEdgeAppearance(edgeId, body).then(() => invalidateAll()),
        })
      }
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const putCanvasMutation = useMutation({
    mutationFn: (body: { width: number; height: number }) => chartsApi.putCanvas(projectId, chartType, body),
    onSuccess: async () => {
      setCanvasOpen(false)
      await qc.invalidateQueries({ queryKey: ['chart-canvas-size', projectId, chartType] })
      toast.success('ابعاد بوم ذخیره شد؛ مختصات گره‌ها تغییر نکرد.')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  // ── تبدیل مختصات صفحه ↔ بوم (مستقل از زوم) ──
  const toChartCoords = useCallback((clientX: number, clientY: number): Position => {
    const rect = contentRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return { x: (clientX - rect.left) / zoom, y: (clientY - rect.top) / zoom }
  }, [zoom])

  // ── درگ گره — Pointer Events؛ دلتا تقسیم بر زوم = مختصات صحیح (§۱۵.۳) ──
  const onPointerDown = (e: React.PointerEvent, node: ChartNodeDto) => {
    if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('.chart-anchor')) return
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    dragMovedRef.current = false
    setDragging({ id: node.id, startX: e.clientX, startY: e.clientY, orig: pos(node) })
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging) return
    const dx = (e.clientX - dragging.startX) / zoom
    const dy = (e.clientY - dragging.startY) / zoom
    if (Math.abs(dx) + Math.abs(dy) * zoom > 3) dragMovedRef.current = true
    setPositions((p) => ({ ...p, [dragging.id]: { x: Math.round(dragging.orig.x + dx), y: Math.round(dragging.orig.y + dy) } }))
  }

  const onPointerUp = () => {
    if (dragging && dragMovedRef.current) {
      const p = positions[dragging.id]
      if (p) {
        const before = { x: dragging.orig.x, y: dragging.orig.y }
        savePositionMutation.mutate({ nodeId: dragging.id, x: p.x, y: p.y })
        /* §۱۰.۸ — Undo جابه‌جایی گره = بازگشت به مختصات قبلی */
        if (before.x !== p.x || before.y !== p.y) {
          pushHistory({
            label: 'جابه‌جایی گره',
            undo: () => chartsApi.updateNode(dragging.id, { positionX: before.x, positionY: before.y }).then(() => invalidateAll()),
            redo: () => chartsApi.updateNode(dragging.id, { positionX: p.x, positionY: p.y }).then(() => invalidateAll()),
          })
        }
        // snapshot چیدمان دستی پس از رهاسازی (§۱۵.۵)
        void saveSnapshot(nodes, { ...positions, [dragging.id]: p }, { width: effCanvas.w, height: effCanvas.h })
      }
    }
    setDragging(null)
  }

  // ── zoom ──
  const zoomAt = useCallback((clientX: number, clientY: number, factor: number) => {
    const rect = viewportRef.current?.getBoundingClientRect()
    if (!rect) return
    setZoom((z) => {
      const nz = Math.min(3, Math.max(0.15, z * factor))
      setPan((p) => {
        const cx = clientX - rect.left
        const cy = clientY - rect.top
        const chartX = (cx - p.x) / z
        const chartY = (cy - p.y) / z
        return { x: cx - chartX * nz, y: cy - chartY * nz }
      })
      return nz
    })
  }, [])

  /** v1.5.2 §۶-۴ — چرخ ماوس روی بوم همیشه Zoom است (نزدیک نشانگر)؛
   *  صفحه اسکرول نمی‌شود و بوم با چرخ جابه‌جا (Pan) نمی‌شود.
   *  جابه‌جایی فقط با درگ زمینه. Ctrl/Meta+چرخ نیز زوم می‌ماند
   *  (رفتار اشاره‌ای pinch ترک‌پد حفظ شده است).
   *  نکته: listener بومی non-passive روی خود viewport — چون onWheel ری‌اکت
   *  passive است و preventDefault آن بی‌اثر می‌شود (صفحه هم اسکرول می‌خورد). */
  useEffect(() => {
    const vp = viewportRef.current
    if (!vp) return
    const onWheelNative = (e: WheelEvent) => {
      e.preventDefault()
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1
      zoomAt(e.clientX, e.clientY, factor)
    }
    vp.addEventListener('wheel', onWheelNative, { passive: false })
    return () => vp.removeEventListener('wheel', onWheelNative)
  }, [zoomAt, data])

  const fitToView = () => {
    const rect = viewportRef.current?.getBoundingClientRect()
    if (!rect || effCanvas.w === 0) return
    const z = Math.min((rect.width - 32) / effCanvas.w, (rect.height - 32) / effCanvas.h, 1.5)
    const nz = Math.max(0.15, Math.min(3, z))
    setZoom(nz)
    setPan({
      x: Math.max(16, (rect.width - effCanvas.w * nz) / 2),
      y: Math.max(16, (rect.height - effCanvas.h * nz) / 2),
    })
  }

  // ── pan با درگ زمینه ──
  const onBackgroundPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('.chart-node') || (e.target as HTMLElement).closest('.chart-anchor')) return
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    setPanning({ startX: e.clientX, startY: e.clientY, origX: pan.x, origY: pan.y })
  }
  const onBackgroundPointerMove = (e: React.PointerEvent) => {
    if (!panning) return
    setPan({ x: panning.origX + (e.clientX - panning.startX), y: panning.origY + (e.clientY - panning.startY) })
  }
  const onBackgroundPointerUp = () => setPanning(null)

  // ── اتصال از anchor به anchor (§۱۵.۴) ──
  const startConnection = (e: React.PointerEvent, node: ChartNodeDto, anchor: AnchorSide) => {
    e.stopPropagation()
    e.preventDefault()
    const pt = toChartCoords(e.clientX, e.clientY)
    setConnecting({ sourceId: node.id, sourceAnchor: anchor, x: pt.x, y: pt.y })
  }

  // ── §۶-۶ — حذف یال انتخاب‌شده با Delete/Backspace (فقط وقتی یال
  //    انتخاب شده و کاربر داخل فیلد متنی تایپ نمی‌کند) ──
  useEffect(() => {
    if (!selectedEdgeId) return
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== 'Delete' && ev.key !== 'Backspace') return
      const t = ev.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return
      if (document.querySelector('[data-state="open"] [role="dialog"]')) return // دیالوگ باز است
      const edge = edges.find((e) => e.id === selectedEdgeId)
      if (!edge) return
      ev.preventDefault()
      setEdgeTarget(edge) // تأییدیهٔ حذف باز می‌شود
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedEdgeId, edges])

  useEffect(() => {
    if (!connecting) return
    const onMove = (ev: PointerEvent) => {
      const pt = toChartCoords(ev.clientX, ev.clientY)
      setConnecting((c) => (c ? { ...c, x: pt.x, y: pt.y } : c))
      const el = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null
      const anchorEl = el?.closest('.chart-anchor') as HTMLElement | null
      if (anchorEl?.dataset.nodeId && anchorEl.dataset.anchor) {
        setHoverTarget({ nodeId: anchorEl.dataset.nodeId, anchor: anchorEl.dataset.anchor as AnchorSide })
      } else {
        setHoverTarget(null)
      }
    }
    const onUp = () => {
      if (hoverTarget && hoverTarget.nodeId !== connecting.sourceId) {
        /* v1.5.2 §۱۰.۴ — یال دستی از همان منطق مسیریابی هوشمند یال‌های
         * خودکار استفاده می‌کند: anchorهای ذخیره‌شده تهی می‌مانند تا
         * بهترین نقاط اتصال (از میان هر ۴ ضلع هر دو کارت) بر اساس
         * موقعیت واقعی و بدون عبور از داخل کارت‌ها انتخاب شوند و
         * پس از جابه‌جایی کارت‌ها مسیر دوباره محاسبه شود. */
        createEdgeMutation.mutate({
          sourceNodeId: connecting.sourceId,
          targetNodeId: hoverTarget.nodeId,
          sourceAnchor: null,
          targetAnchor: null,
        })
      }
      setConnecting(null)
      setHoverTarget(null)
    }
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        setConnecting(null)
        setHoverTarget(null)
      }
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('keydown', onKey)
    }
  }, [connecting, hoverTarget])

  // ── رندر ──
  if (chartQuery.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-[480px] w-full rounded-2xl" />
      </div>
    )
  }
  if (chartQuery.isError) {
    return (
      <EmptyState
        title="بارگذاری نمودار ناموفق بود"
        description={chartQuery.error instanceof Error ? chartQuery.error.message : 'خطای نامشخص'}
        action={<Button variant="outline" onClick={() => void chartQuery.refetch()}>تلاش دوباره</Button>}
      />
    )
  }
  if (!data) return null

  const counts = data.counts
  const allowedTypes = chartType === 'OPC' ? OPC_ALLOWED : FPC_ALLOWED
  const isExtendedOpc = chartType === 'OPC' && (data.isExtendedOpc || (counts.byType[MATERIAL_INPUT_NODE_TYPE] ?? 0) > 0 || (counts.byType.STORAGE ?? 0) > 0)

  if (counts.activitiesTotal === 0) {
    return (
      <EmptyState
        icon={<Waypoints className="size-7" aria-hidden />}
        title="هنوز فعالیتی تعریف نشده است"
        description="گره‌های نمودار فرایند به‌صورت خودکار از فعالیت‌های تعریف‌شده در «ساختار تولید» ساخته می‌شوند. ابتدا ایستگاه و فعالیت بسازید."
      />
    )
  }

  if (nodes.length === 0) {
    return (
      <EmptyState
        icon={<Waypoints className="size-7" aria-hidden />}
        title={chartType === 'OPC' ? 'فعالیتی برای OPC مشمول نیست' : 'گره‌ای برای نمایش نیست'}
        description={
          chartType === 'OPC'
            ? 'در نمودار OPC فقط فعالیت‌های از نوع «عملیات» و «بازرسی» نمایش داده می‌شوند. فعالیت‌های حمل‌ونقل، تأخیر و انبارش را در نمای FPC ببینید.'
            : 'گره‌ای برای نمایش وجود ندارد.'
        }
      />
    )
  }

  // ابعاد مؤثر بوم: تنظیم صریح کاربر یا گسترهٔ محتوا
  let canvasW = canvasQ.data?.width ?? 0
  let canvasH = canvasQ.data?.height ?? 0
  for (const n of nodes) {
    const p = pos(n)
    canvasW = Math.max(canvasW, p.x + NODE_W + MARGIN)
    canvasH = Math.max(canvasH, p.y + NODE_H + MARGIN)
  }
  const effCanvas = { w: canvasW, h: canvasH }

  /** §۶-۵ — محدودهٔ واقعی محتوای نمودار (گره‌ها + یال‌ها + پیکان‌ها):
   *  خروجی PDF فقط همین محدوده را شامل می‌شود، نه کل فضای خالی بوم.
   *  مختصات ذخیره‌شده گره‌ها هرگز تغییر نمی‌کند — فقط برش نمایشی. */
  const contentBBox = (() => {
    if (nodes.length === 0) return null
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    const expand = (x: number, y: number) => {
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
    const PAD = 48 // فاصلهٔ امن اطراف محتوا (شامل پیکان‌ها و سایهٔ گره‌ها)
    for (const n of nodes) {
      const p = pos(n)
      expand(p.x - PAD, p.y - PAD)
      expand(p.x + NODE_W + PAD, p.y + NODE_H + PAD)
    }
    for (const e of edges) {
      const sn = nodeById.get(e.sourceNodeId)
      const tn = nodeById.get(e.targetNodeId)
      if (!sn || !tn) continue
      const sp = pos(sn)
      const tp = pos(tn)
      const sa = (e.sourceAnchor as AnchorSide | null) ?? autoAnchors(sp, tp)[0]
      const ta = (e.targetAnchor as AnchorSide | null) ?? autoAnchors(sp, tp)[1]
      for (const pt of elbowPoints(sp, sa, tp, ta)) {
        expand(pt.x - PAD, pt.y - PAD)
        expand(pt.x + PAD, pt.y + PAD)
      }
    }
    if (!Number.isFinite(minX)) return null
    // مختصات منفی/چیدمان نامتعارف نیز درست پشتیبانی می‌شود
    return { x: Math.min(minX, 0) === 0 ? Math.max(0, minX) : minX, y: Math.min(minY, 0) === 0 ? Math.max(0, minY) : minY, w: maxX - minX, h: maxY - minY, maxX, maxY }
  })()

  const unconnected = nodes.filter(
    (n) => !edges.some((e) => e.sourceNodeId === n.id || e.targetNodeId === n.id)
  ).length

  const connectingSourceNode = connecting ? nodeById.get(connecting.sourceId) : null

  return (
    <div className="space-y-4">
      {/* نوار ابزار — v1.5.2 §۱۰.۱: دسته‌بندی بر اساس کاربرد
          [ایجاد/ویرایش نمودار] │ [بوم] │ [Undo/Redo §۱۰.۸] │ [نمایش: زوم]
          │ [خروجی PDF با تم متمایز] — چیپ‌های شمارش در انتهای نوار */}
      <div className="flex flex-wrap items-center gap-2">
        {/* ── ایجاد و ویرایش نمودار — نزدیک خود نمودار ── */}
        <div className="flex items-center gap-1.5 rounded-xl border bg-card p-1" role="group" aria-label="ایجاد و ویرایش نمودار">
          <Button size="sm" className="btn-brand gap-1.5 border-0" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" aria-hidden />
            گره دستی
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => layoutMutation.mutate()}
            disabled={layoutMutation.isPending}
          >
            {layoutMutation.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            چیدمان خودکار
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => restoreSnapshotMutation.mutate()}
            disabled={restoreSnapshotMutation.isPending || !snapshotQ.data}
            title={snapshotQ.data?.savedAt ? `آخرین چیدمان دستی ذخیره‌شده: ${new Date(snapshotQ.data.savedAt).toLocaleString('fa-IR')}` : 'هنوز چیدمان دستی ذخیره نشده است'}
          >
            <History className="size-4" aria-hidden />
            بازگردانی چیدمان دستی
          </Button>
        </div>

        {/* ── بوم ── */}
        <div className="flex items-center gap-1.5 rounded-xl border bg-card p-1" role="group" aria-label="ابزار بوم">
          <Button size="sm" variant="ghost" onClick={() => setCanvasOpen(true)}>
            <Ruler className="size-4" aria-hidden />
            ابعاد بوم
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void qc.invalidateQueries({ queryKey: qk.chart(projectId, chartType) })}
            aria-label="بازخوانی نمودار از فعالیت‌ها"
          >
            <RefreshCw className="size-4" aria-hidden />
            بازخوانی
          </Button>
        </div>

        {/* ── §۱۰.۸ — Undo/Redo ── */}
        <div className="flex items-center gap-1 rounded-xl border bg-card p-1" role="group" aria-label="واگردانی و ازنو">
          <Button
            size="icon"
            variant="ghost"
            className="size-8"
            onClick={() => void undo()}
            disabled={!canUndo}
            aria-label="واگردانی (Ctrl+Z)"
            title={undoLabel ?? 'واگردانی'}
          >
            <Undo2 className="size-4" aria-hidden />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="size-8"
            onClick={() => void redo()}
            disabled={!canRedo}
            aria-label="ازنو (Ctrl+Y)"
            title={redoLabel ?? 'ازنو'}
          >
            <Redo2 className="size-4" aria-hidden />
          </Button>
        </div>

        {/* کنترل‌های زوم (§۱۵.۳) */}
        <div className="flex items-center gap-1 rounded-xl border bg-card p-1" role="group" aria-label="کنترل زوم">
          <Button size="icon" variant="ghost" className="size-7" aria-label="کوچک‌نمایی" onClick={() => zoomAt((viewportRef.current?.getBoundingClientRect().left ?? 0) + 100, (viewportRef.current?.getBoundingClientRect().top ?? 0) + 100, 1 / 1.25)}>
            <ZoomOut className="size-4" aria-hidden />
          </Button>
          <span className="num min-w-12 text-center text-xs font-bold" dir="ltr" aria-live="polite">
            {formatInt(Math.round(zoom * 100), prefs)}٪
          </span>
          <Button size="icon" variant="ghost" className="size-7" aria-label="بزرگ‌نمایی" onClick={() => zoomAt((viewportRef.current?.getBoundingClientRect().left ?? 0) + 100, (viewportRef.current?.getBoundingClientRect().top ?? 0) + 100, 1.25)}>
            <ZoomIn className="size-4" aria-hidden />
          </Button>
          <Button size="icon" variant="ghost" className="size-7" aria-label="جا دادن در نما" onClick={fitToView}>
            <Maximize2 className="size-4" aria-hidden />
          </Button>
          <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" aria-label="بازنشانی زوم به ۱۰۰٪" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }) }}>
            ۱۰۰٪
          </Button>
        </div>

        {/* §۶-۶ — حذف یال انتخاب‌شده + §۱۰.۵ ظاهر آن */}
        {selectedEdge && !selectedEdge.isChain && (
          <EdgeAppearanceBar
            edge={selectedEdge}
            onApply={(body) => edgeAppearanceMutation.mutate({ edgeId: selectedEdge.id, body })}
            pending={edgeAppearanceMutation.isPending}
            onDelete={() => setEdgeTarget(selectedEdge)}
          />
        )}
        {selectedEdge && selectedEdge.isChain && (
          <Button
            size="sm"
            variant="destructive"
            className="gap-1.5"
            onClick={() => setEdgeTarget(selectedEdge)}
            title="حذف اتصال انتخاب‌شده (یا کلید Delete)"
          >
            <Trash2 className="size-4" aria-hidden />
            حذف اتصال انتخاب‌شده
          </Button>
        )}

        {/* §۱۰.۱ — خروجی PDF: تم متمایز قرمز PDF، همیشه در دسترس بالای صفحه */}
        <Button
          size="sm"
          className="gap-1.5 border border-red/40 bg-red-soft font-bold text-red hover:border-red/60 hover:bg-red-soft/80 hover:text-red focus-visible:ring-red/30"
          onClick={() => setPdfOpen(true)}
          title="خروجی PDF نمودار — تک‌صفحه‌ای یا تایل‌دار"
        >
          <FileDown className="size-4" aria-hidden />
          خروجی PDF
        </Button>

        <div className="ms-auto flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          {isExtendedOpc && (
            <span className="inline-flex items-center gap-1 rounded-full border border-cyan/50 bg-cyan-soft px-2 py-0.5 font-bold text-cyan">
              OPC توسعه‌یافته — دارای ورودی مواد/انبار
            </span>
          )}
          {allowedTypes.map((t) => (
            <span key={t} className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5', counts.byType[t] ? 'border-border' : 'opacity-40')}>
              <ProcessSymbol type={t} size="sm" />
              {PROCESS_TYPE_LABELS_WITH_INPUT[t]}: {formatInt(counts.byType[t] ?? 0, prefs)}
            </span>
          ))}
          {counts.manual > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5">
              دستی: {formatInt(counts.manual, prefs)}
            </span>
          )}
        </div>
      </div>

      {unconnected > 0 && (
        <div className="rounded-xl bg-amber-soft px-3 py-2 text-xs text-amber" role="status">
          {formatInt(unconnected, prefs)} گره به هیچ گره دیگری متصل نیست؛ برای اتصال، از یکی از چهار لنگر گردِ گره بکشید و روی لنگر گره مقصد رها کنید.
        </div>
      )}

      {/* بوم — زوم/پن جدا از مختصات واقعی گره‌ها */}
      <div
        ref={viewportRef}
        className={cn(
          'relative h-[68vh] overflow-hidden rounded-2xl border bg-gradient-subtle',
          panning ? 'cursor-grabbing' : 'cursor-grab',
          connecting && 'cursor-crosshair'
        )}
        dir="ltr"
        role="application"
        aria-label={`بوم نمودار ${chartType} — زوم ${Math.round(zoom * 100)}٪`}
        onPointerDown={onBackgroundPointerDown}
        onPointerMove={onBackgroundPointerMove}
        onPointerUp={onBackgroundPointerUp}
        onPointerCancel={onBackgroundPointerUp}
      >
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: '0 0',
          }}
        >
          <div ref={contentRef} className="relative" style={{ width: effCanvas.w, height: effCanvas.h }}>
            {/* شبکهٔ نقطه‌ای زمینه */}
            <div
              className="pointer-events-none absolute inset-0 opacity-60"
              style={{
                backgroundImage: 'radial-gradient(circle, color-mix(in srgb, var(--muted-foreground) 30%, transparent) 1px, transparent 1px)',
                backgroundSize: '32px 32px',
              }}
              aria-hidden
            />

            {/* یال‌ها — مسیر orthogonal از anchorها */}
            <svg className="pointer-events-none absolute inset-0" width={effCanvas.w} height={effCanvas.h} aria-hidden>
              <defs>
                {/* v1.5.2 §۱۰.۵ — پیکان هم‌رنگ یال‌های رنگ‌آمیزی‌شدهٔ دلخواه */}
                {[...new Set(edges.map((e) => e.lineColor).filter((c): c is string => !!c))].map((c) => (
                  <marker key={c} id={`arrow-c-${chartType}-${c.replace(/[^a-zA-Z0-9]/g, '')}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill={c} />
                  </marker>
                ))}
                {/* §۶-۳ — پیکان جهت جریان در انتهای مسیر (سمت مقصد)؛
                    اندازه/رنگ به‌اندازهٔ کافی واضح و هم‌رنگ خط */}
                <marker id={`arrow-${chartType}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" className="fill-brand" />
                </marker>
                <marker id={`arrow-selected-${chartType}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" className="fill-brand" />
                </marker>
              </defs>
              {edges.map((e) => {
                const s = nodeById.get(e.sourceNodeId)
                const t = nodeById.get(e.targetNodeId)
                if (!s || !t) return null
                const sp = pos(s)
                const tp = pos(t)
                const sa = (e.sourceAnchor as AnchorSide | null) ?? autoAnchors(sp, tp)[0]
                const ta = (e.targetAnchor as AnchorSide | null) ?? autoAnchors(sp, tp)[1]
                const d = orthogonalPath(sp, sa, tp, ta)
                const isSelected = selectedEdgeId === e.id
                /* v1.5.2 §۱۰.۵ — ظاهر یال: پیش‌فرض = پیوسته با رنگ استاندارد
                 * (همانند یال‌های خودکار)؛ کاربر می‌تواند خط‌چین/نقطه‌چین/رنگ
                 * دلخواه را برای هر یال دستی تنظیم کند (ماندگار در DB). */
                const style = e.lineStyle ?? 'SOLID'
                const dash = isSelected ? undefined : style === 'DASHED' ? '6 4' : style === 'DOTTED' ? '1.5 3.5' : undefined
                const strokeColor = e.lineColor ?? undefined
                return (
                  <g
                    key={e.id}
                    className="pointer-events-auto cursor-pointer"
                    onClick={() => setSelectedEdgeId((prev) => (prev === e.id ? null : e.id))}
                    aria-label={`اتصال ${s!.label} به ${t!.label}${isSelected ? ' — انتخاب‌شده' : ''}`}
                  >
                    <title>{isSelected ? 'اتصال انتخاب‌شده — حذف با دکمهٔ نوار ابزار یا کلید Delete؛ ظاهر آن از پنل «ظاهر اتصال» قابل تنظیم است' : 'کلیک: انتخاب اتصال'}</title>
                    <path d={d} className="fill-none stroke-transparent" strokeWidth={16} />
                    <path
                      d={d}
                      className={cn(
                        'fill-none transition-colors',
                        !strokeColor && (isSelected ? 'stroke-brand' : 'hover:stroke-red'),
                        !strokeColor && !isSelected && (e.isChain ? 'stroke-brand/55' : 'stroke-brand-2/70'),
                      )}
                      stroke={strokeColor ?? undefined}
                      strokeWidth={isSelected ? 3.5 : style === 'SOLID' ? 2 : 2.25}
                      strokeLinecap={style === 'DOTTED' ? 'round' : 'butt'}
                      strokeDasharray={dash}
                      markerEnd={
                        !isSelected && strokeColor
                          ? `url(#arrow-c-${chartType}-${strokeColor.replace(/[^a-zA-Z0-9]/g, '')})`
                          : `url(#arrow${isSelected ? '-selected' : ''}-${chartType})`
                      }
                    />
                  </g>
                )
              })}
              {/* خط زندهٔ اتصال در جریان drag */}
              {connecting && connectingSourceNode && (() => {
                const sp = pos(connectingSourceNode)
                const sA = anchorPoint(sp, connecting.sourceAnchor)
                return (
                  <g>
                    <path
                      d={`M ${sA.x} ${sA.y} L ${connecting.x} ${connecting.y}`}
                      className="fill-none stroke-cyan"
                      strokeWidth={2}
                      strokeDasharray="5 4"
                    />
                    <circle cx={connecting.x} cy={connecting.y} r={4} className="fill-cyan" />
                  </g>
                )
              })()}
            </svg>

            {/* گره‌ها */}
            {nodes.map((n) => {
              const p = pos(n)
              const isDragging = dragging?.id === n.id
              /* §۱۰.۶ — اگر بالای کارت در نمای فعلی جا نیست (نزدیک لبهٔ بالای
               * بوم)، نوار ابزار با فاصلهٔ امن زیر کارت قرار می‌گیرد —
               * هرگز روی لنگرهای اتصال نمی‌نشیند. */
              const toolbarBelow = p.y * zoom + pan.y < 64
              return (
                <div
                  key={n.id}
                  className={cn(
                    'chart-node group absolute rounded-xl border bg-card p-2.5 shadow-sm transition-shadow',
                    'cursor-grab active:cursor-grabbing',
                    isDragging && 'z-50 shadow-lg ring-2 ring-brand/40',
                    hoverTarget?.nodeId === n.id && 'ring-2 ring-cyan',
                    'hover:shadow-md focus-visible:outline-2 focus-visible:outline-ring'
                  )}
                  style={{ left: p.x, top: p.y, width: NODE_W, touchAction: 'none', userSelect: 'none' }}
                  dir="rtl"
                  role="button"
                  tabIndex={0}
                  aria-label={`گره ${formatInt(n.sortOrder + 1, prefs)}: ${n.label}`}
                  onPointerDown={(e) => onPointerDown(e, n)}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerCancel={onPointerUp}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowUp') {
                      e.preventDefault()
                      moveOrderMutation.mutate({ nodeId: n.id, direction: 'up' })
                    }
                    if (e.key === 'ArrowDown') {
                      e.preventDefault()
                      moveOrderMutation.mutate({ nodeId: n.id, direction: 'down' })
                    }
                  }}
                >
                  {/* شماره توالی */}
                  <span className="absolute -start-1.5 -top-1.5 inline-flex size-6 items-center justify-center rounded-full border bg-background text-[11px] font-bold num">
                    {formatInt(n.sortOrder + 1, prefs)}
                  </span>

                  {/* چهار anchor — فقط با هاور/فوکوس/اتصال نمایان (§۱۵.۴) */}
                  {(['top', 'bottom', 'left', 'right'] as AnchorSide[]).map((a) => (
                    <span
                      key={a}
                      data-node-id={n.id}
                      data-anchor={a}
                      aria-label={`لنگر ${a === 'top' ? 'بالا' : a === 'bottom' ? 'پایین' : a === 'left' ? 'چپ' : 'راست'} گره ${n.label}`}
                      role="button"
                      tabIndex={-1}
                      onPointerDown={(e) => startConnection(e, n, a)}
                      className={cn(
                        'chart-anchor pointer-events-auto absolute z-10 flex size-3.5 items-center justify-center rounded-full border-2 border-background bg-brand shadow transition-opacity',
                        'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100',
                        connecting && 'opacity-70',
                        hoverTarget?.nodeId === n.id && hoverTarget.anchor === a && 'scale-150 bg-cyan opacity-100',
                        a === 'top' && '-top-1.5 left-1/2 -translate-x-1/2',
                        a === 'bottom' && '-bottom-1.5 left-1/2 -translate-x-1/2',
                        a === 'left' && '-left-1.5 top-1/2 -translate-y-1/2',
                        a === 'right' && '-right-1.5 top-1/2 -translate-y-1/2'
                      )}
                    />
                  ))}

                  <div className="flex items-start gap-2.5">
                    <ProcessSymbol type={n.nodeType} size="md" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold leading-6" title={n.label}>{n.label}</p>
                      <p className="truncate text-[11px] leading-5 text-muted-foreground">
                        {PROCESS_TYPE_LABELS_WITH_INPUT[n.nodeType] ?? n.nodeType}
                        {n.isManual ? ' · گره دستی' : n.stationName ? ` · ${n.stationName}` : ''}
                      </p>
                    </div>
                  </div>

                  {/* کنترل‌ها — با هاور یا فوکوس نمایان؛ §۱۰.۶ بالای کارت
                      (۸px فاصله از لبه) تا لنگر پایین اتصال آزاد بماند */}
                  <div
                    className={cn(
                      'absolute left-1/2 z-20 flex -translate-x-1/2 items-center gap-0.5 rounded-full border bg-background p-0.5 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-within:opacity-100',
                      toolbarBelow ? '-bottom-3 translate-y-full' : '-top-3 -translate-y-full'
                    )}
                  >
                    <button
                      type="button"
                      className="inline-flex size-6 items-center justify-center rounded-full text-muted-foreground hover:bg-brand-soft hover:text-brand disabled:opacity-30"
                      aria-label={`جابه‌جایی «${n.label}» به بالا در توالی`}
                      disabled={moveOrderMutation.isPending || n.sortOrder === 0}
                      onClick={() => moveOrderMutation.mutate({ nodeId: n.id, direction: 'up' })}
                    >
                      <ChevronUp className="size-4" aria-hidden />
                    </button>
                    <button
                      type="button"
                      className="inline-flex size-6 items-center justify-center rounded-full text-muted-foreground hover:bg-brand-soft hover:text-brand disabled:opacity-30"
                      aria-label={`جابه‌جایی «${n.label}» به پایین در توالی`}
                      disabled={moveOrderMutation.isPending || n.sortOrder === nodes.length - 1}
                      onClick={() => moveOrderMutation.mutate({ nodeId: n.id, direction: 'down' })}
                    >
                      <ChevronDown className="size-4" aria-hidden />
                    </button>
                    {n.isManual ? (
                      <>
                        <button
                          type="button"
                          className="inline-flex size-6 items-center justify-center rounded-full text-muted-foreground hover:bg-brand-soft hover:text-brand"
                          aria-label={`ویرایش گره «${n.label}»`}
                          onClick={() => setEditNode(n)}
                        >
                          <Pencil className="size-4" aria-hidden />
                        </button>
                        <button
                          type="button"
                          className="inline-flex size-6 items-center justify-center rounded-full text-red hover:bg-red-soft"
                          aria-label={`حذف گره «${n.label}»`}
                          onClick={() => setDeleteTarget(n)}
                        >
                          <Trash2 className="size-4" aria-hidden />
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="inline-flex size-6 items-center justify-center rounded-full text-muted-foreground hover:bg-brand-soft hover:text-brand"
                        aria-label={`اطلاعات فعالیت «${n.label}»`}
                        onClick={() => setInfoNode(n)}
                      >
                        <Waypoints className="size-4" aria-hidden />
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* راهنمای زوم/پن */}
        <div className="pointer-events-none absolute bottom-2 left-2 rounded-lg bg-background/85 px-2 py-1 text-[10px] text-muted-foreground shadow-sm" dir="rtl">
          چرخ ماوس = زوم · درگ زمینه = جابه‌جایی · کشیدن از لنگر گردِ گره = اتصال
        </div>
      </div>

      {/* دیالوگ ایجاد گره دستی */}
      {createOpen && (
        <ManualNodeDialog
          chartType={chartType}
          onClose={() => setCreateOpen(false)}
          onCreate={(body) => createNodeMutation.mutate(body)}
          pending={createNodeMutation.isPending}
        />
      )}

      {/* دیالوگ ویرایش گره دستی */}
      {editNode && (
        <ManualNodeDialog
          chartType={chartType}
          initial={{ label: editNode.label, nodeType: editNode.nodeType }}
          onClose={() => setEditNode(null)}
          onCreate={(body) => updateContentMutation.mutate({ nodeId: editNode.id, body })}
          pending={updateContentMutation.isPending}
          editMode
        />
      )}

      {/* اطلاعات گره خودکار */}
      {infoNode && (
        <Dialog open onOpenChange={(v) => !v && setInfoNode(null)}>
          <DialogContent dir="rtl" className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ProcessSymbol type={infoNode.nodeType} size="sm" />
                {infoNode.label}
              </DialogTitle>
              <DialogDescription>
                نوع رویداد: {PROCESS_TYPE_LABELS_WITH_INPUT[infoNode.nodeType] ?? infoNode.nodeType}
                {infoNode.stationName ? ` — ${infoNode.stationName}` : ''}
                <br />
                این گره به‌صورت خودکار از فعالیت «{infoNode.label}» ساخته شده است؛ برای تغییر نام یا نوع، فعالیت را در «ساختار تولید» ویرایش کنید.
              </DialogDescription>
            </DialogHeader>
          </DialogContent>
        </Dialog>
      )}

      {/* حذف گره دستی */}
      {deleteTarget && (
        <ConfirmDeleteDialog
          open={!!deleteTarget}
          onOpenChange={(v) => !v && setDeleteTarget(null)}
          title="حذف گره دستی"
          entityName={deleteTarget.label}
          dependencies={{ 'اتصال‌های این گره': edges.filter((e) => e.sourceNodeId === deleteTarget.id || e.targetNodeId === deleteTarget.id).length }}
          onConfirm={() => deleteNodeMutation.mutate(deleteTarget.id)}
          loading={deleteNodeMutation.isPending}
        />
      )}

      {/* حذف اتصال */}
      {edgeTarget && (
        <AlertDialog open onOpenChange={(v) => !v && setEdgeTarget(null)}>
          <AlertDialogContent dir="rtl">
            <AlertDialogHeader>
              <AlertDialogTitle>حذف اتصال گره‌ها؟</AlertDialogTitle>
              <AlertDialogDescription>
                این اتصال حذف می‌شود؛ گره‌ها و دادهٔ زمان‌سنجی فعالیت‌ها دست‌نخورده می‌مانند.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="gap-2">
              <AlertDialogCancel>انصراف</AlertDialogCancel>
              <AlertDialogAction onClick={() => deleteEdgeMutation.mutate(edgeTarget.id)}>حذف اتصال</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* ابعاد بوم (§۱۵.۶) */}
      {canvasOpen && (
        <CanvasSizeDialog
          current={canvasQ.data ?? null}
          onClose={() => setCanvasOpen(false)}
          onSave={(w, h) => putCanvasMutation.mutate({ width: w, height: h })}
          onReset={async () => {
            await chartsApi.resetCanvas(projectId, chartType)
            await qc.invalidateQueries({ queryKey: ['chart-canvas-size', projectId, chartType] })
            setCanvasOpen(false)
            toast.success('ابعاد بوم به حالت خودکار (گسترهٔ گره‌ها) بازگشت.')
          }}
          pending={putCanvasMutation.isPending}
        />
      )}

      {/* خروجی PDF (§۱۵.۷) */}
      <PdfExportDialog
        open={pdfOpen}
        onOpenChange={setPdfOpen}
        sourceFactory={() =>
          contentRef.current
            ? {
                contentEl: contentRef.current,
                chartWidth: contentBBox ? Math.ceil(contentBBox.w) : effCanvas.w,
                chartHeight: contentBBox ? Math.ceil(contentBBox.h) : effCanvas.h,
                /** §۶-۵ — برش به محدودهٔ واقعی محتوا: محتوا با آفست منفی
                 *  درون قاب برش‌خورده قرار می‌گیرد (بدون تغییر مختصات پروژه) */
                cropOffset: contentBBox ? { x: -Math.floor(contentBBox.x), y: -Math.floor(contentBBox.y) } : null,
                chartTitle: `${data.chartType === 'OPC' ? 'نمودار فرایند عملیات (OPC)' : 'نمودار فرایند جریان (FPC)'}${isExtendedOpc ? ' — توسعه‌یافته' : ''}`,
              }
            : null
        }
      />
    </div>
  )
}

// ── دیالوگ گره دستی — با نماد مشترک و انواع توسعه‌یافته ──
function ManualNodeDialog({
  chartType,
  initial,
  onClose,
  onCreate,
  pending,
  editMode,
}: {
  chartType: ChartTypeValue
  initial?: { label: string; nodeType: string }
  onClose: () => void
  onCreate: (body: { label: string; nodeType: string }) => void
  pending: boolean
  editMode?: boolean
}) {
  const [label, setLabel] = useState(initial?.label ?? '')
  const [nodeType, setNodeType] = useState(initial?.nodeType ?? 'OPERATION')
  const allowed = chartType === 'OPC' ? OPC_ALLOWED : FPC_ALLOWED
  const isOpcExtension = chartType === 'OPC' && (nodeType === MATERIAL_INPUT_NODE_TYPE || nodeType === 'STORAGE')
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editMode ? 'ویرایش گره دستی' : 'گره دستی جدید'}</DialogTitle>
          <DialogDescription>
            گره‌های دستی برای رویدادهای فاقد فعالیت زمان‌سنجی هستند (مثل ورودی مواد، تأخیر یا انبارش کمکی).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="manual-node-label">برچسب گره</Label>
            <Input
              id="manual-node-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={200}
              placeholder="مثلاً: ورودی قطعه از تأمین‌کننده"
            />
          </div>
          <div className="space-y-1.5">
            <Label>نوع رویداد فرایندی</Label>
            <Select value={nodeType} onValueChange={setNodeType}>
              <SelectTrigger className="w-full" aria-label="نوع رویداد فرایندی">
                <SelectValue />
              </SelectTrigger>
              <SelectContent dir="rtl">
                {allowed.map((t) => (
                  <SelectItem key={t} value={t}>
                    <span className="flex items-center gap-2">
                      <ProcessSymbol type={t} size="sm" className="size-5" />
                      {PROCESS_TYPE_LABELS_WITH_INPUT[t]}
                      {chartType === 'OPC' && (t === MATERIAL_INPUT_NODE_TYPE || t === 'STORAGE') ? ' (توسعهٔ اختیاری)' : ''}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isOpcExtension && (
              <p className="text-[11px] leading-5 text-cyan">
                با افزودن این نوع گره، حالت نمودار به «OPC توسعه‌یافته» تغییر می‌کند تا با تعریف کلاسیک OPC اشتباه نشود.
              </p>
            )}
            {chartType === 'OPC' && !isOpcExtension && (
              <p className="text-[11px] leading-5 text-faint">
                در OPC کلاسیک، رویدادهای اصلی فقط «عملیات» و «بازرسی» هستند.
              </p>
            )}
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>انصراف</Button>
          <Button disabled={!label.trim() || pending} onClick={() => onCreate({ label: label.trim(), nodeType })}>
            {pending ? 'در حال ذخیره…' : editMode ? 'ذخیرهٔ تغییرات' : 'افزودن گره'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── دیالوگ ابعاد بوم — مستقل از زوم و PDF (§۱۵.۶) ──
function CanvasSizeDialog({
  current,
  onClose,
  onSave,
  onReset,
  pending,
}: {
  current: { width: number; height: number } | null
  onClose: () => void
  onSave: (w: number, h: number) => void
  onReset: () => void
  pending: boolean
}) {
  const [w, setW] = useState(String(current?.width ?? 2000))
  const [h, setH] = useState(String(current?.height ?? 1200))
  const valid = Number(w) >= 600 && Number(w) <= 20000 && Number(h) >= 400 && Number(h) <= 20000
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ruler className="size-5 text-brand" aria-hidden />
            ابعاد بوم طراحی
          </DialogTitle>
          <DialogDescription>
            ابعاد بوم مستقل از زوم نمایش و اندازهٔ کاغذ PDF است و در خود نمودار ذخیره می‌شود. تغییر ابعاد،
            مختصات گره‌ها را جابه‌جا نمی‌کند.
            {!current && ' در حالت خودکار، بوم به اندازهٔ گسترهٔ گره‌ها است.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="canvas-w">عرض (پیکسل)</Label>
              <Input id="canvas-w" dir="ltr" type="number" min={600} max={20000} step={50} value={w} onChange={(e) => setW(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="canvas-h">ارتفاع (پیکسل)</Label>
              <Input id="canvas-h" dir="ltr" type="number" min={400} max={20000} step={50} value={h} onChange={(e) => setH(e.target.value)} />
            </div>
          </div>
          {!valid && (
            <p className="text-xs text-red">محدودهٔ مجاز: عرض ۶۰۰ تا ۲۰۰۰۰ و ارتفاع ۴۰۰ تا ۲۰۰۰۰ پیکسل.</p>
          )}
          <div className="space-y-1.5">
            <Label>اندازه‌های آماده</Label>
            <div className="flex flex-wrap gap-2">
              {CANVAS_PRESETS.map((p) => (
                <Button
                  key={p.w}
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setW(String(p.w))
                    setH(String(p.h))
                  }}
                >
                  {p.label}
                </Button>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter className="flex-row justify-between">
          <Button variant="ghost" size="sm" onClick={onReset}>
            بازگشت به خودکار
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>انصراف</Button>
            <Button disabled={!valid || pending} onClick={() => onSave(Number(w), Number(h))}>
              {pending ? 'در حال ذخیره…' : 'ذخیرهٔ ابعاد'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}


// ── §۱۰.۵ — نوار ظاهر یال انتخاب‌شده: نوع خط + رنگ + حذف ──
const EDGE_COLORS = [
  { value: null, label: 'رنگ استاندارد' },
  { value: '#7257ff', label: 'بنفش برند' },
  { value: '#0f9d8f', label: 'سبزآبی' },
  { value: '#d97706', label: 'کهربایی' },
  { value: '#dc2626', label: 'قرمز' },
  { value: '#475569', label: 'خاکستری' },
] as const

function EdgeAppearanceBar({
  edge,
  onApply,
  pending,
  onDelete,
}: {
  edge: ChartEdgeDto
  onApply: (body: { lineStyle?: 'SOLID' | 'DASHED' | 'DOTTED' | null; lineColor?: string | null }) => void
  pending: boolean
  onDelete: () => void
}) {
  const style = edge.lineStyle ?? 'SOLID'
  return (
    <div
      className="flex flex-wrap items-center gap-1 rounded-xl border border-brand/40 bg-brand-soft/30 p-1"
      role="group"
      aria-label="ظاهر اتصال انتخاب‌شده"
    >
      <span className="px-1.5 text-[11px] font-bold text-brand">ظاهر اتصال:</span>
      {([
        ['SOLID', 'پیوسته'],
        ['DASHED', 'خط‌چین'],
        ['DOTTED', 'نقطه‌چین'],
      ] as const).map(([value, label]) => (
        <Button
          key={value}
          size="sm"
          variant="ghost"
          className={cn('h-7 gap-1.5 px-2 text-[11px]', style === value && 'bg-brand-soft font-bold text-brand')}
          aria-pressed={style === value}
          disabled={pending}
          onClick={() => onApply({ lineStyle: value })}
        >
          <svg width="26" height="8" aria-hidden className="shrink-0">
            <line
              x1="1"
              y1="4"
              x2="25"
              y2="4"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap={value === 'DOTTED' ? 'round' : 'butt'}
              strokeDasharray={value === 'DASHED' ? '5 3' : value === 'DOTTED' ? '1.5 3.5' : undefined}
            />
          </svg>
          {label}
        </Button>
      ))}
      <span className="mx-1 h-5 w-px bg-border" aria-hidden />
      {EDGE_COLORS.map((c) => (
        <button
          key={c.label}
          type="button"
          title={c.label}
          aria-label={`رنگ یال: ${c.label}`}
          aria-pressed={(edge.lineColor ?? null) === c.value}
          disabled={pending}
          onClick={() => onApply({ lineColor: c.value })}
          className={cn(
            'size-5 shrink-0 rounded-full border-2 transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50',
            (edge.lineColor ?? null) === c.value ? 'border-foreground ring-2 ring-brand/50' : 'border-border'
          )}
          style={c.value ? { background: c.value } : { background: 'linear-gradient(135deg, var(--brand) 50%, var(--brand-2) 50%)' }}
        />
      ))}
      <Button
        size="sm"
        variant="ghost"
        className="h-7 px-2 text-[11px] text-muted-foreground"
        disabled={pending}
        title="بازگشت به ظاهر پیش‌فرض نمودار (پیوسته + رنگ استاندارد)"
        onClick={() => onApply({ lineStyle: null, lineColor: null })}
      >
        پیش‌فرض
      </Button>
      <span className="mx-1 h-5 w-px bg-border" aria-hidden />
      <Button
        size="sm"
        variant="destructive"
        className="h-7 gap-1.5 px-2 text-[11px]"
        onClick={onDelete}
        title="حذف اتصال انتخاب‌شده (یا کلید Delete)"
      >
        <Trash2 className="size-3.5" aria-hidden />
        حذف اتصال
      </Button>
    </div>
  )
}
