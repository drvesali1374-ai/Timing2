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
  History,
  Loader2,
  Maximize2,
  Pencil,
  Plus,
  RefreshCw,
  Ruler,
  Trash2,
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

/** انتخاب خودکار anchor بر اساس جهت نسبی دو گره */
function autoAnchors(s: Position, t: Position): [AnchorSide, AnchorSide] {
  const sc = { x: s.x + NODE_W / 2, y: s.y + NODE_H / 2 }
  const tc = { x: t.x + NODE_W / 2, y: t.y + NODE_H / 2 }
  const dx = tc.x - sc.x
  const dy = tc.y - sc.y
  if (Math.abs(dy) >= Math.abs(dx)) {
    return dy >= 0 ? ['bottom', 'top'] : ['top', 'bottom']
  }
  return dx >= 0 ? ['right', 'left'] : ['left', 'right']
}

/** مسیر orthogonal/elbow از anchor مبدأ به anchor مقصد — بدون عبور از داخل گره */
function orthogonalPath(s: Position, sa: AnchorSide, t: Position, ta: AnchorSide): string {
  const sA = anchorPoint(s, sa)
  const tA = anchorPoint(t, ta)
  const stub = 20
  const sOut = { x: sA.x + ANCHOR_NORMAL[sa].x * stub, y: sA.y + ANCHOR_NORMAL[sa].y * stub }
  const tIn = { x: tA.x - ANCHOR_NORMAL[ta].x * stub, y: tA.y - ANCHOR_NORMAL[ta].y * stub }
  const pts: Position[] = [sA, sOut]
  const verticalSource = sa === 'bottom' || sa === 'top'
  if (Math.abs(sOut.x - tIn.x) > 1 && Math.abs(sOut.y - tIn.y) > 1) {
    if (verticalSource) {
      const midY = (sOut.y + tIn.y) / 2
      pts.push({ x: sOut.x, y: midY }, { x: tIn.x, y: midY })
    } else {
      const midX = (sOut.x + tIn.x) / 2
      pts.push({ x: midX, y: sOut.y }, { x: midX, y: tIn.y })
    }
  }
  pts.push(tIn, tA)
  return pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${Math.round(p.x)} ${Math.round(p.y)}`).join(' ')
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
  const [pdfOpen, setPdfOpen] = useState(false)
  const [canvasOpen, setCanvasOpen] = useState(false)
  const dragMovedRef = useRef(false)
  const viewportRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  const data = chartQuery.data
  const nodes = useMemo(() => data?.nodes ?? [], [data])
  const edges = useMemo(() => data?.edges ?? [], [data])
  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes])

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
    onSuccess: invalidateAll,
    onError: (e: Error) => toast.error(e.message),
  })

  // چیدمان خودکار: ابتدا snapshot دستی ذخیره می‌شود — سپس بازچینی (§۱۵.۵)
  const layoutMutation = useMutation({
    mutationFn: async () => {
      await saveSnapshot(nodes, positions, { width: effCanvas.w, height: effCanvas.h })
      return chartsApi.applyLayout(projectId, chartType)
    },
    onSuccess: async () => {
      setPositions({})
      await invalidateAll()
      toast.success('چیدمان خودکار اعمال شد؛ چیدمان دستی قبلی ذخیره شد و با «بازگردانی چیدمان دستی» قابل بازیابی است.')
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
    onSuccess: async () => {
      setCreateOpen(false)
      await invalidateAll()
      toast.success('گره دستی به انتهای توالی اضافه شد.')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const updateContentMutation = useMutation({
    mutationFn: ({ nodeId, body }: { nodeId: string; body: { label?: string; nodeType?: string } }) =>
      chartsApi.updateNode(nodeId, body),
    onSuccess: async () => {
      setEditNode(null)
      await invalidateAll()
      toast.success('گره به‌روزرسانی شد.')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const deleteNodeMutation = useMutation({
    mutationFn: (nodeId: string) => chartsApi.deleteNode(nodeId),
    onSuccess: async () => {
      setDeleteTarget(null)
      await invalidateAll()
      toast.success('گره دستی حذف شد؛ گره‌های خودکار فعالیت‌ها دست‌نخورده‌اند.')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const createEdgeMutation = useMutation({
    mutationFn: (body: { sourceNodeId: string; targetNodeId: string; sourceAnchor: AnchorSide; targetAnchor: AnchorSide }) =>
      chartsApi.createEdge(projectId, body),
    onSuccess: async () => {
      await invalidateAll()
      toast.success('اتصال ایجاد شد.')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const deleteEdgeMutation = useMutation({
    mutationFn: (edgeId: string) => chartsApi.deleteEdge(edgeId),
    onSuccess: async () => {
      setEdgeTarget(null)
      await invalidateAll()
      toast.success('اتصال حذف شد؛ مشاهدات زمان‌سنجی تغییری نکرده‌اند.')
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
        savePositionMutation.mutate({ nodeId: dragging.id, x: p.x, y: p.y })
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

  const onWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.1 : 1 / 1.1)
    } else {
      // pan با wheel/trackpad — رفتار قابل پیش‌بینی
      setPan((p) => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }))
    }
  }

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
        createEdgeMutation.mutate({
          sourceNodeId: connecting.sourceId,
          targetNodeId: hoverTarget.nodeId,
          sourceAnchor: connecting.sourceAnchor,
          targetAnchor: hoverTarget.anchor,
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

  const unconnected = nodes.filter(
    (n) => !edges.some((e) => e.sourceNodeId === n.id || e.targetNodeId === n.id)
  ).length

  const connectingSourceNode = connecting ? nodeById.get(connecting.sourceId) : null

  return (
    <div className="space-y-4">
      {/* نوار ابزار */}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" aria-hidden />
          گره دستی
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => layoutMutation.mutate()}
          disabled={layoutMutation.isPending}
        >
          {layoutMutation.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          چیدمان خودکار
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => restoreSnapshotMutation.mutate()}
          disabled={restoreSnapshotMutation.isPending || !snapshotQ.data}
          title={snapshotQ.data?.savedAt ? `آخرین چیدمان دستی ذخیره‌شده: ${new Date(snapshotQ.data.savedAt).toLocaleString('fa-IR')}` : 'هنوز چیدمان دستی ذخیره نشده است'}
        >
          <History className="size-4" aria-hidden />
          بازگردانی چیدمان دستی
        </Button>
        <Button size="sm" variant="outline" onClick={() => setCanvasOpen(true)}>
          <Ruler className="size-4" aria-hidden />
          ابعاد بوم
        </Button>
        <Button size="sm" variant="outline" onClick={() => setPdfOpen(true)}>
          خروجی PDF
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => void qc.invalidateQueries({ queryKey: qk.chart(projectId, chartType) })}
          aria-label="بازخوانی نمودار از فعالیت‌ها"
        >
          <RefreshCw className="size-4" aria-hidden />
          بازخوانی
        </Button>

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
        onWheel={onWheel}
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
                <marker id={`arrow-${chartType}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
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
                return (
                  <g key={e.id} className="pointer-events-auto cursor-pointer" onClick={() => setEdgeTarget(e)}>
                    <title>حذف اتصال</title>
                    <path d={d} className="fill-none stroke-transparent" strokeWidth={14} />
                    <path
                      d={d}
                      className={cn(
                        'fill-none transition-colors hover:stroke-red',
                        e.isChain ? 'stroke-brand/55' : 'stroke-brand-2/70'
                      )}
                      strokeWidth={2}
                      strokeDasharray={e.isChain ? undefined : '6 4'}
                      markerEnd={`url(#arrow-${chartType})`}
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

                  {/* کنترل‌ها — با هاور یا فوکوس نمایان */}
                  <div className="absolute -bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded-full border bg-background p-0.5 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
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
          درگ زمینه = جابه‌جایی · Ctrl+چرخ ماوس = زوم · کشیدن از لنگر گردِ گره = اتصال
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
                chartWidth: effCanvas.w,
                chartHeight: effCanvas.h,
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
                      <ProcessSymbol type={t} size="sm" />
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
