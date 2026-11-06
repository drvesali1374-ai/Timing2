'use client'

// ═══════════════════════════════════════════════════════════
// نمای ساختار تولید — FR-02 + ۷.۳
// درخت خط ← ایستگاه ← فعالیت با Drag & Drop (SortableList)؛
// پنل جزئیات ایستگاه با ذخیره خودکار و کنترل هم‌زمانی
// (expectedUpdatedAt — ۶.۶)؛ ایجاد/ویرایش/حذف با شمارش
// وابستگی‌های واقعی (FR-26).
// دسکتاپ: دو ستون هم‌عرض (۵۰-۵۰) با عرض کامل صفحه —
// دستگیره درگ داخل کارت چسبیده به لبه راست؛ عملیات ویرایش/حذف
// عمودی در راست کارت؛ عنوان تا دو خط؛ شمارش/گروه فقط روی کارت
// انتخاب‌شده؛ موبایل: درخت تاشو در بالا + جزئیات در پایین — FR-30
// ═══════════════════════════════════════════════════════════
import { useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  ArrowLeft,
  ChevronDown,
  Factory,
  ListTree,
  Loader2,
  MousePointerClick,
  Pencil,
  Plus,
  Trash2,
  Warehouse,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { ConfirmDeleteDialog, EmptyState } from '@/components/common/Feedback'
import { HelpDot } from '@/components/common/HelpDot'
import { SaveIndicator } from '@/components/common/SaveIndicator'
import { SortableList } from '@/components/common/SortableList'
import { useAutosave } from '@/hooks/use-autosave'
import { useIsMobile } from '@/hooks/use-mobile'
import {
  allowancesApi,
  projectsApi,
  structureApi,
  type ActivityDto,
  type GroupDto,
  type StationDto,
} from '@/lib/api/endpoints'
import { qk } from '@/lib/api/keys'
import {
  PROCESS_TYPES,
  PROCESS_TYPE_LABELS,
  PROCESS_TYPE_SYMBOLS,
  type ProcessType,
} from '@/domain/types'
import { useAppStore } from '@/store/app-store'
import { useDisplayPrefs } from '@/store/display-store'
import { formatDate, formatDateTime, formatInt } from '@/lib/format'
import { cn } from '@/lib/utils'

type Prefs = ReturnType<typeof useDisplayPrefs>

// ── وضعیت فرم‌ها ──
interface StationFormState {
  name: string
  description: string
}

interface ActivityFormState {
  name: string
  description: string
  processType: string
  groupId: string // '' یعنی بدون گروه
}

const EMPTY_STATION_FORM: StationFormState = { name: '', description: '' }
const EMPTY_ACTIVITY_FORM: ActivityFormState = { name: '', description: '', processType: 'OPERATION', groupId: '' }
/** مقدار Sentinel — Radix Select مقدار رشته خالی قبول نمی‌کند */
const NO_GROUP = 'none'

// ── محتوای راهنمای آیکونی — FR-28 / ۷.۵ ──
const LINE_HELP = {
  what: 'هر پروژه مطالعه زمان‌سنجی دقیقاً یک خط تولید و یک محصول را پوشش می‌دهد؛ ساختار داده از خط آغاز می‌شود: خط ← ایستگاه ← فعالیت ← عنصر کاری ← مشاهده.',
  input: 'نام خط و محصول در مرحله «مشخصات پروژه» وارد و ویرایش می‌شود.',
  example: 'خط مونتاژ ماشین لباسشویی — مدل X-۲۰۰',
  note: 'ترکیب چند خط یا چند محصول در یک پروژه، مقایسه‌پذیری زمان‌های استاندارد را از بین می‌برد؛ برای هر خط/محصول پروژه‌ای جدا بسازید.',
} as const

const STATION_NAME_HELP = {
  what: 'ایستگاه بخشی مشخص از خط تولید است که کار در آن انجام می‌شود؛ فعالیت‌های زمان‌سنجی زیر ایستگاه تعریف می‌شوند.',
  input: 'نام ایستگاه را مطابق نقشه خط یا استقرار فیزیکی وارد کنید.',
  example: '«ایستگاه برش ورق» یا «میز مونتاژ شماره ۳»',
  note: 'حذف ایستگاه همه فعالیت‌ها، عناصر کاری، جلسات و مشاهدات زیرمجموعه را دائمی حذف می‌کند. ترتیب ایستگاه‌ها با کشیدن‌ورها کردن (Drag & Drop) تغییر می‌کند.',
} as const

const ACTIVITY_NAME_HELP = {
  what: 'فعالیت کار قابل‌تعریف و مستقلی در ایستگاه است که از عناصر کاری تشکیل می‌شود و صفحه اختصاصی چهارزبانه دارد: مشخصات، عناصر کاری، زمان‌سنجی و تحلیل نتایج.',
  input: 'نامی کوتاه و گویا؛ ترجیحاً فعل + مفعول.',
  example: '«بستن درب پنل» یا «کنترل کیفیت نهایی»',
  note: 'نوع رویداد فرایندی فعالیت در نمودارهای فرایند (فاز ۵) با نماد ASCME نمایش داده می‌شود.',
} as const

const PROCESS_TYPE_HELP = {
  what: 'دسته‌بندی فرایندی فعالیت مطابق استاندارد نمودار فرایند: عملیات ○، بازرسی □، حمل‌ونقل ⇨، تأخیر D و انبارش ▽.',
  input: 'ماهیت غالب فعالیت را انتخاب کنید؛ پیش‌فرض «عملیات» است.',
  example: 'برای کنترل کیفیت «بازرسی» و برای انتقال قطعه بین ایستگاه‌ها «حمل‌ونقل» را انتخاب کنید.',
  note: 'این نوع صرفاً دسته‌بندی و نمادگذاری است و روی محاسبات زمان اثری ندارد.',
} as const

const GROUP_ASSIGN_HELP = {
  what: 'گروه مجازها مجموعه‌ای از درصدهای مجاز (مانند نیازهای شخصی و خستگی) است که فعالیت‌های مشابه مقادیر آن را به ارث می‌برند.',
  input: 'گروه مناسب ماهیت فعالیت را انتخاب کنید یا «بدون گروه» بگذارید.',
  example: '«کار دستی سبک»، «کار ماشینی سنگین»',
  note: 'بدون گروه، هیچ مجازی برای فعالیت اعمال نمی‌شود؛ در صفحه فعالیت می‌توانید مقدار هر دسته را بازنویسی کنید.',
} as const

// ── کمک‌تابع‌ها ──
function activityElementCount(a: ActivityDto): number {
  return a._count?.workElements ?? a.elements?.length ?? 0
}

function processLabelOf(pt: string): string {
  return PROCESS_TYPE_LABELS[pt as ProcessType] ?? pt
}

function processSymbolOf(pt: string): string {
  return PROCESS_TYPE_SYMBOLS[pt as ProcessType] ?? '○'
}

/** توضیح فارسی شمارش داده‌های حذف‌شده برای toast — اعداد واقعی Backend */
function removedCountsText(prefs: Prefs, parts: Array<[string, number]>): string | undefined {
  const segs = parts.filter(([, n]) => n > 0).map(([label, n]) => `${formatInt(n, prefs)} ${label}`)
  return segs.length > 0 ? `${segs.join('، ')} نیز به‌طور دائمی حذف شدند.` : undefined
}

export default function StructureView({ projectId }: { projectId: string }) {
  const prefs = useDisplayPrefs()
  const isMobile = useIsMobile()
  const qc = useQueryClient()
  const selectedStationId = useAppStore((s) => s.selectedStationId)
  const setSelectedStation = useAppStore((s) => s.setSelectedStation)
  const openActivity = useAppStore((s) => s.openActivity)

  // ── وضعیت محلی ──
  const [treeOpen, setTreeOpen] = useState(true) // درخت تاشوی موبایل
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({}) // ایستگاه‌های باز (پیش‌فرض: باز)
  const [stationCreateOpen, setStationCreateOpen] = useState(false)
  const [stationCreateForm, setStationCreateForm] = useState<StationFormState>(EMPTY_STATION_FORM)
  const [stationCreating, setStationCreating] = useState(false)
  const [stationDialogOpen, setStationDialogOpen] = useState(false)
  const [activityEditor, setActivityEditor] = useState<{
    stationId: string
    activity: ActivityDto | null
  } | null>(null)
  const [activityCreateForm, setActivityCreateForm] = useState<ActivityFormState>(EMPTY_ACTIVITY_FORM)
  const [activityCreating, setActivityCreating] = useState(false)
  const [deletingStation, setDeletingStation] = useState<StationDto | null>(null)
  const [deletingActivity, setDeletingActivity] = useState<ActivityDto | null>(null)

  // ── داده‌ها ──
  const treeQuery = useQuery({
    queryKey: qk.structure(projectId),
    queryFn: () => structureApi.tree(projectId),
  })
  const lineQuery = useQuery({
    queryKey: qk.project(projectId),
    queryFn: () => projectsApi.get(projectId),
    select: (d) => ({ lineName: d.project.lineName, productName: d.project.productName }),
  })
  const groupsQuery = useQuery({
    queryKey: qk.groups(projectId),
    queryFn: () => allowancesApi.groups(projectId),
  })
  // درخت، _count.sessions را برنمی‌گرداند؛ هنگام باز شدن دیالوگ تأیید حذف،
  // فهرست ایستگاه‌ها (که شمارش جلسات دارد) به‌صورت تازه بارگذاری می‌شود — FR-26
  const deleteDepsQuery = useQuery({
    queryKey: qk.stations(projectId),
    queryFn: () => structureApi.stations(projectId),
    enabled: deletingStation !== null || deletingActivity !== null,
  })

  const stations = treeQuery.data?.stations ?? []
  const groups = groupsQuery.data?.items ?? []
  const selectedStation = useMemo(
    () => stations.find((s) => s.id === selectedStationId) ?? null,
    [stations, selectedStationId]
  )
  const totalActivities = useMemo(() => stations.reduce((sum, s) => sum + s.activities.length, 0), [stations])
  const totalElements = useMemo(
    () => stations.reduce((sum, s) => sum + s.activities.reduce((x, a) => x + activityElementCount(a), 0), 0),
    [stations]
  )

  // ── بی‌اعتبارسازی کش ──
  const invalidateStructureMeta = () => {
    void qc.invalidateQueries({ queryKey: qk.structure(projectId) })
    void qc.invalidateQueries({ queryKey: qk.stations(projectId) })
    void qc.invalidateQueries({ queryKey: qk.projectSummary(projectId) })
    void qc.invalidateQueries({ queryKey: qk.projects() })
  }
  const invalidateActivityData = () => {
    invalidateStructureMeta()
    void qc.invalidateQueries({ queryKey: ['activities'] })
    void qc.invalidateQueries({ queryKey: ['elements'] })
    void qc.invalidateQueries({ queryKey: qk.groups(projectId) })
  }
  const onActivitySaved = (activityId: string) => {
    invalidateActivityData()
    void qc.invalidateQueries({ queryKey: qk.activityAllowances(activityId) })
  }

  // ── جهش‌ها ──
  const createStationMutation = useMutation({
    mutationFn: () =>
      structureApi.createStation(projectId, {
        name: stationCreateForm.name.trim(),
        description: stationCreateForm.description.trim() || null,
      }),
    onSuccess: (res) => {
      invalidateStructureMeta()
      toast.success('ایستگاه ثبت شد')
      setSelectedStation(res.station.id)
      setStationCreateOpen(false)
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'ثبت ایستگاه ناموفق بود'),
  })

  const deleteStationMutation = useMutation({
    mutationFn: (station: StationDto) => structureApi.deleteStation(station.id),
    onSuccess: (res, station) => {
      invalidateStructureMeta()
      if (selectedStationId === station.id) setSelectedStation(null)
      toast.success(`ایستگاه «${station.name}» به‌طور دائمی حذف شد`, {
        description: removedCountsText(prefs, [
          ['فعالیت', res.removedCounts.activities],
          ['عنصر کاری', res.removedCounts.elements],
          ['جلسه زمان‌سنجی', res.removedCounts.sessions],
          ['مشاهده', res.removedCounts.observations],
        ]),
      })
      setDeletingStation(null)
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'حذف ایستگاه ناموفق بود'),
  })

  const createActivityMutation = useMutation({
    mutationFn: (vars: { stationId: string; body: Record<string, unknown> }) =>
      structureApi.createActivity(vars.stationId, vars.body),
    onSuccess: () => {
      invalidateActivityData()
      toast.success('فعالیت ثبت شد')
      setActivityEditor(null)
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'ثبت فعالیت ناموفق بود'),
  })

  const deleteActivityMutation = useMutation({
    mutationFn: (activity: ActivityDto) => structureApi.deleteActivity(activity.id),
    onSuccess: (res, activity) => {
      invalidateActivityData()
      toast.success(`فعالیت «${activity.name}» به‌طور دائمی حذف شد`, {
        description: removedCountsText(prefs, [
          ['عنصر کاری', res.removedCounts.elements],
          ['جلسه زمان‌سنجی', res.removedCounts.sessions],
          ['مشاهده', res.removedCounts.observations],
        ]),
      })
      setDeletingActivity(null)
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'حذف فعالیت ناموفق بود'),
  })

  // ── جابه‌جایی خوش‌بینانه: کش بلافاصله به‌روز می‌شود و سرور تأیید می‌کند ──
  const reorderStationsMutation = useMutation({
    mutationFn: (ids: string[]) => structureApi.reorderStations(projectId, ids),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.structure(projectId) })
      void qc.invalidateQueries({ queryKey: qk.stations(projectId) })
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'تغییر ترتیب ایستگاه‌ها ناموفق بود')
      invalidateStructureMeta() // بازگشت به ترتیب واقعی سرور
    },
  })

  const reorderActivitiesMutation = useMutation({
    mutationFn: (vars: { stationId: string; ids: string[] }) =>
      structureApi.reorderActivities(vars.stationId, vars.ids),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.structure(projectId) })
      void qc.invalidateQueries({ queryKey: ['activities'] })
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'تغییر ترتیب فعالیت‌ها ناموفق بود')
      invalidateStructureMeta()
    },
  })

  const handleReorderStations = (ids: string[]) => {
    qc.setQueryData<{ stations: StationDto[] }>(qk.structure(projectId), (old) => {
      if (!old) return old
      return {
        stations: ids.flatMap((id) => {
          const s = old.stations.find((x) => x.id === id)
          return s ? [s] : []
        }),
      }
    })
    reorderStationsMutation.mutate(ids)
  }

  const handleReorderActivities = (stationId: string, ids: string[]) => {
    qc.setQueryData<{ stations: StationDto[] }>(qk.structure(projectId), (old) => {
      if (!old) return old
      return {
        stations: old.stations.map((s) =>
          s.id !== stationId
            ? s
            : {
                ...s,
                activities: ids.flatMap((id) => {
                  const a = s.activities.find((x) => x.id === id)
                  return a ? [a] : []
                }),
              }
        ),
      }
    })
    reorderActivitiesMutation.mutate({ stationId, ids })
  }

  // ── کنش‌ها ──
  const selectStation = (stationId: string) => {
    setSelectedStation(stationId)
    setStationDialogOpen(false)
    if (isMobile) setTreeOpen(false)
  }

  const openEditStation = (station: StationDto) => {
    // فرم ویرایش در پنل جزئیات رندر می‌شود؛ انتخاب + باز کردن دیالوگ مشترک
    setSelectedStation(station.id)
    setStationDialogOpen(true)
  }

  const openStationCreate = () => {
    setStationCreateForm(EMPTY_STATION_FORM)
    setStationCreateOpen(true)
  }

  const submitStationCreate = async () => {
    if (!stationCreateForm.name.trim()) {
      toast.error('نام ایستگاه الزامی است')
      return
    }
    setStationCreating(true)
    try {
      await createStationMutation.mutateAsync()
    } finally {
      setStationCreating(false)
    }
  }

  const openActivityCreate = (stationId: string) => {
    setActivityCreateForm(EMPTY_ACTIVITY_FORM)
    setActivityEditor({ stationId, activity: null })
  }

  const submitActivityCreate = async () => {
    if (!activityEditor || activityEditor.activity) return
    if (!activityCreateForm.name.trim()) {
      toast.error('نام فعالیت الزامی است')
      return
    }
    setActivityCreating(true)
    try {
      await createActivityMutation.mutateAsync({
        stationId: activityEditor.stationId,
        body: {
          name: activityCreateForm.name.trim(),
          description: activityCreateForm.description.trim() || null,
          processType: activityCreateForm.processType,
          groupId: activityCreateForm.groupId || null,
        },
      })
    } finally {
      setActivityCreating(false)
    }
  }

  // ── شمارش وابستگی‌ها پیش از حذف — FR-26 ──
  const stationDeleteDeps = useMemo(() => {
    if (!deletingStation) return {}
    const acts = deletingStation.activities
    const activityCount = acts.length
    const elementCount = acts.reduce((sum, a) => sum + activityElementCount(a), 0)
    // شمارش جلسات از پرس‌وجوی به‌هنگام (درخت این شمارش را ندارد)
    const detailed = deleteDepsQuery.data?.items.find((s) => s.id === deletingStation.id)
    const sessionCount = (detailed ?? deletingStation).activities.reduce(
      (sum, a) => sum + (a._count?.sessions ?? 0),
      0
    )
    const deps: Record<string, number> = {}
    if (activityCount > 0) deps['فعالیت'] = activityCount
    if (elementCount > 0) deps['عنصر کاری'] = elementCount
    if (sessionCount > 0) deps['جلسه زمان‌سنجی'] = sessionCount
    return deps
  }, [deletingStation, deleteDepsQuery.data])

  const activityDeleteDeps = useMemo(() => {
    if (!deletingActivity) return {}
    const elementCount = activityElementCount(deletingActivity)
    const stationDetailed = deleteDepsQuery.data?.items.find((s) => s.id === deletingActivity.stationId)
    const sessionCount =
      stationDetailed?.activities.find((a) => a.id === deletingActivity.id)?._count?.sessions ??
      deletingActivity._count?.sessions ??
      0
    const deps: Record<string, number> = {}
    if (elementCount > 0) deps['عنصر کاری'] = elementCount
    if (sessionCount > 0) deps['جلسه زمان‌سنجی'] = sessionCount
    return deps
  }, [deletingActivity, deleteDepsQuery.data])

  const editorStationName = activityEditor
    ? stations.find((s) => s.id === activityEditor.stationId)?.name ?? ''
    : ''

  // ── پروپ‌های مشترک درخت (نمونه موبایل و دسکتاپ) ──
  const treeProps = {
    stations,
    prefs,
    openMap,
    lineName: lineQuery.data?.lineName ?? null,
    productName: lineQuery.data?.productName ?? null,
    lineLoading: lineQuery.isLoading,
    selectedStationId,
    onStationOpenChange: (stationId: string, open: boolean) =>
      setOpenMap((m) => ({ ...m, [stationId]: open })),
    onSelectStation: selectStation,
    onEditStation: openEditStation,
    onDeleteStation: (station: StationDto) => setDeletingStation(station),
    onOpenActivity: (activityId: string) => openActivity(projectId, activityId),
    onEditActivity: (activity: ActivityDto) =>
      setActivityEditor({ stationId: activity.stationId, activity }),
    onDeleteActivity: (activity: ActivityDto) => setDeletingActivity(activity),
    onNewActivity: openActivityCreate,
    onReorderStations: handleReorderStations,
    onReorderActivities: handleReorderActivities,
    onNewStation: openStationCreate,
  }

  return (
    <div className="animate-view-in w-full space-y-5">
      {/* سربرگ بخش */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="chip-icon bg-brand-soft text-brand">
            <ListTree className="size-6" aria-hidden />
          </div>
          <div>
            <h1 className="text-xl font-extrabold">ساختار تولید</h1>
            <p className="num text-xs text-muted-foreground">
              {formatInt(stations.length, prefs)} ایستگاه · {formatInt(totalActivities, prefs)} فعالیت ·{' '}
              {formatInt(totalElements, prefs)} عنصر کاری
            </p>
          </div>
        </div>
      </div>

      {/* محتوا */}
      {treeQuery.isLoading ? (
        <div className="grid items-start gap-5 lg:grid-cols-2">
          <Skeleton className="h-[30rem] w-full rounded-2xl" />
          <div className="space-y-4">
            <Skeleton className="h-56 w-full rounded-2xl" />
            <Skeleton className="h-64 w-full rounded-2xl" />
          </div>
        </div>
      ) : treeQuery.isError ? (
        <EmptyState
          title="بارگذاری ساختار تولید ناموفق بود"
          description={treeQuery.error instanceof Error ? treeQuery.error.message : 'خطای نامشخص'}
          action={
            <Button
              variant="outline"
              onClick={() => qc.invalidateQueries({ queryKey: qk.structure(projectId) })}
            >
              تلاش مجدد
            </Button>
          }
        />
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-2">
          {/* ستون راست (RTL): درخت ساختار — موبایل: تاشو در بالا */}
          <div className="lg:sticky lg:top-20">
            <div className="lg:hidden">
              <Collapsible open={treeOpen} onOpenChange={setTreeOpen}>
                <div className="card-premium overflow-hidden">
                  <CollapsibleTrigger asChild>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-2 p-4 text-sm font-bold"
                      aria-label={treeOpen ? 'بستن درخت ساختار' : 'باز کردن درخت ساختار'}
                    >
                      <span className="flex items-center gap-2">
                        <ListTree className="size-4 text-brand" aria-hidden />
                        درخت ساختار
                        <Badge variant="secondary" className="num border-0 bg-surface-2">
                          {formatInt(stations.length, prefs)}
                        </Badge>
                      </span>
                      <ChevronDown
                        className={cn('size-4 text-muted-foreground transition-transform', !treeOpen && '-rotate-90')}
                        aria-hidden
                      />
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="border-t">
                      <StructureTree {...treeProps} />
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            </div>
            <div className="hidden lg:block">
              <div className="card-premium overflow-hidden">
                <StructureTree {...treeProps} />
              </div>
            </div>
          </div>

          {/* ستون چپ (RTL): جزئیات ایستگاه انتخاب‌شده */}
          <div className="min-w-0">
            {stations.length === 0 ? (
              <EmptyState
                icon={<Warehouse className="size-7" aria-hidden />}
                title="هنوز ایستگاهی ثبت نشده است"
                description="ساختار تولید از ایستگاه‌ها شکل می‌گیرد؛ هر ایستگاه فعالیت‌ها و هر فعالیت، عناصر کاری خود را دارد. با ثبت اولین ایستگاه، درخت ساختار و پنل جزئیات فعال می‌شود."
                action={
                  <Button onClick={openStationCreate} className="btn-brand gap-1.5 border-0">
                    <Plus className="size-4" aria-hidden />
                    ثبت اولین ایستگاه
                  </Button>
                }
              />
            ) : selectedStation ? (
              <StationDetailsPanel
                key={selectedStation.id}
                station={selectedStation}
                prefs={prefs}
                dialogOpen={stationDialogOpen}
                onDialogOpenChange={setStationDialogOpen}
                onSaved={invalidateStructureMeta}
                onNewActivity={() => openActivityCreate(selectedStation.id)}
                onOpenActivity={(activityId) => openActivity(projectId, activityId)}
                onDeleteStation={() => setDeletingStation(selectedStation)}
              />
            ) : (
              <div className="card-premium p-8">
                <div className="flex flex-col items-center gap-3 text-center">
                  <div className="chip-icon bg-cyan-soft text-cyan">
                    <MousePointerClick className="size-6" aria-hidden />
                  </div>
                  <div className="space-y-1">
                    <p className="font-bold">ایستگاهی را از درخت انتخاب کنید</p>
                    <p className="mx-auto max-w-md text-sm leading-6 text-muted-foreground">
                      با انتخاب هر ایستگاه، فرم ویرایش آن و فهرست فعالیت‌هایش در این بخش نمایش داده می‌شود. برای
                      مشاهده عناصر کاری و مجازها، روی فعالیت کلیک کنید تا صفحه اختصاصی آن باز شود.
                    </p>
                  </div>
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => setSelectedStation(stations[0].id)}>
                      انتخاب اولین ایستگاه
                    </Button>
                    <Button variant="ghost" size="sm" onClick={openStationCreate} className="gap-1.5">
                      <Plus className="size-4" aria-hidden />
                      ایستگاه جدید
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* دیالوگ ایجاد ایستگاه */}
      <Dialog open={stationCreateOpen} onOpenChange={setStationCreateOpen}>
        <DialogContent dir="rtl" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>ایستگاه جدید</DialogTitle>
            <DialogDescription>
              ایستگاه در انتهای فهرست افزوده می‌شود و با کشیدن‌ورها کردن قابل جابه‌جایی است.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-1">
                <Label htmlFor="station-create-name">نام ایستگاه</Label>
                <HelpDot label="نام ایستگاه" content={STATION_NAME_HELP} />
              </div>
              <Input
                id="station-create-name"
                value={stationCreateForm.name}
                onChange={(e) => setStationCreateForm((s) => ({ ...s, name: e.target.value }))}
                placeholder="مثلاً: ایستگاه برش ورق"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="station-create-desc">شرح ایستگاه (اختیاری)</Label>
              <Textarea
                id="station-create-desc"
                value={stationCreateForm.description}
                onChange={(e) => setStationCreateForm((s) => ({ ...s, description: e.target.value }))}
                placeholder="مثلاً: برش ورق گالوانیزه با گیوتین ۳ متری"
                className="min-h-16"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setStationCreateOpen(false)}>
              انصراف
            </Button>
            <Button onClick={submitStationCreate} disabled={stationCreating} className="btn-brand border-0">
              {stationCreating ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Plus className="size-4" aria-hidden />
              )}
              ثبت ایستگاه
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* دیالوگ ایجاد/ویرایش فعالیت */}
      <Dialog open={activityEditor !== null} onOpenChange={(open) => !open && setActivityEditor(null)}>
        <DialogContent dir="rtl" className="sm:max-w-md">
          {activityEditor?.activity ? (
            <ActivityEditForm
              key={activityEditor.activity.id}
              activity={activityEditor.activity}
              groups={groups}
              groupsLoading={groupsQuery.isLoading}
              groupsError={groupsQuery.isError}
              onClose={() => setActivityEditor(null)}
              onSaved={onActivitySaved}
            />
          ) : activityEditor ? (
            <>
              <DialogHeader>
                <DialogTitle>فعالیت جدید</DialogTitle>
                <DialogDescription>
                  {editorStationName ? `در ایستگاه «${editorStationName}» — ` : ''}
                  فعالیت در انتهای فهرست افزوده می‌شود.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1">
                    <Label htmlFor="activity-create-name">نام فعالیت</Label>
                    <HelpDot label="نام فعالیت" content={ACTIVITY_NAME_HELP} />
                  </div>
                  <Input
                    id="activity-create-name"
                    value={activityCreateForm.name}
                    onChange={(e) => setActivityCreateForm((s) => ({ ...s, name: e.target.value }))}
                    placeholder="مثلاً: بستن درب پنل"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="activity-create-desc">شرح فعالیت (اختیاری)</Label>
                  <Textarea
                    id="activity-create-desc"
                    value={activityCreateForm.description}
                    onChange={(e) => setActivityCreateForm((s) => ({ ...s, description: e.target.value }))}
                    placeholder="مثلاً: بستن ۴ پیچ با پیچ‌گوشتی برقی"
                    className="min-h-16"
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1">
                      <Label>نوع رویداد فرایندی</Label>
                      <HelpDot label="نوع رویداد فرایندی" content={PROCESS_TYPE_HELP} />
                    </div>
                    <Select
                      value={activityCreateForm.processType}
                      onValueChange={(v) => setActivityCreateForm((s) => ({ ...s, processType: v }))}
                    >
                      <SelectTrigger className="w-full" aria-label="نوع رویداد فرایندی">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PROCESS_TYPES.map((pt) => (
                          <SelectItem key={pt} value={pt}>
                            <span className="num">{PROCESS_TYPE_SYMBOLS[pt]}</span> {PROCESS_TYPE_LABELS[pt]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1">
                      <Label>گروه مجازها</Label>
                      <HelpDot label="گروه مجازها" content={GROUP_ASSIGN_HELP} />
                    </div>
                    <Select
                      value={activityCreateForm.groupId || NO_GROUP}
                      onValueChange={(v) =>
                        setActivityCreateForm((s) => ({ ...s, groupId: v === NO_GROUP ? '' : v }))
                      }
                      disabled={groupsQuery.isLoading}
                    >
                      <SelectTrigger className="w-full" aria-label="گروه مجازها">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_GROUP}>بدون گروه</SelectItem>
                        {groups.map((g) => (
                          <SelectItem key={g.id} value={g.id}>
                            {g.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {groupsQuery.isError && (
                      <p className="text-[11px] leading-5 text-red">
                        بارگذاری گروه‌ها ناموفق بود؛ فعلاً تنها «بدون گروه» در دسترس است.
                      </p>
                    )}
                  </div>
                </div>
              </div>
              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setActivityEditor(null)}>
                  انصراف
                </Button>
                <Button onClick={submitActivityCreate} disabled={activityCreating} className="btn-brand border-0">
                  {activityCreating ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <Plus className="size-4" aria-hidden />
                  )}
                  ثبت فعالیت
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* تأیید حذف دائمی ایستگاه — FR-26 */}
      <ConfirmDeleteDialog
        open={deletingStation !== null}
        onOpenChange={(open) => !open && setDeletingStation(null)}
        title="حذف دائمی ایستگاه"
        entityName={deletingStation?.name ?? ''}
        dependencies={stationDeleteDeps}
        onConfirm={() => deletingStation && deleteStationMutation.mutate(deletingStation)}
        loading={deleteStationMutation.isPending}
      />

      {/* تأیید حذف دائمی فعالیت — FR-26 */}
      <ConfirmDeleteDialog
        open={deletingActivity !== null}
        onOpenChange={(open) => !open && setDeletingActivity(null)}
        title="حذف دائمی فعالیت"
        entityName={deletingActivity?.name ?? ''}
        dependencies={activityDeleteDeps}
        onConfirm={() => deletingActivity && deleteActivityMutation.mutate(deletingActivity)}
        loading={deleteActivityMutation.isPending}
      />
    </div>
  )
}

// ═══════════════════════════════════════════════════════════
// درخت ساختار — ریشه: خط تولید؛ ایستگاه‌ها و فعالیت‌ها با D&D
// فعالیت‌های هر ایستگاه داخل Collapsible باز/بسته می‌شوند
// ═══════════════════════════════════════════════════════════
function StructureTree({
  stations,
  prefs,
  openMap,
  lineName,
  productName,
  lineLoading,
  selectedStationId,
  onStationOpenChange,
  onSelectStation,
  onEditStation,
  onDeleteStation,
  onOpenActivity,
  onEditActivity,
  onDeleteActivity,
  onNewActivity,
  onReorderStations,
  onReorderActivities,
  onNewStation,
}: {
  stations: StationDto[]
  prefs: Prefs
  openMap: Record<string, boolean>
  lineName: string | null
  productName: string | null
  lineLoading: boolean
  selectedStationId: string | null
  onStationOpenChange: (stationId: string, open: boolean) => void
  onSelectStation: (stationId: string) => void
  onEditStation: (station: StationDto) => void
  onDeleteStation: (station: StationDto) => void
  onOpenActivity: (activityId: string) => void
  onEditActivity: (activity: ActivityDto) => void
  onDeleteActivity: (activity: ActivityDto) => void
  onNewActivity: (stationId: string) => void
  onReorderStations: (ids: string[]) => void
  onReorderActivities: (stationId: string, ids: string[]) => void
  onNewStation: () => void
}) {
  return (
    <div>
      {/* ریشه درخت: خط تولید + محصول (کامل، بدون برش) */}
      <div className="border-b bg-gradient-to-l from-brand-soft/70 to-transparent p-4">
        <div className="flex items-center gap-2.5">
          <div className="chip-icon bg-brand-soft text-brand">
            <Factory className="size-5" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            {lineLoading ? (
              <Skeleton className="h-5 w-28" />
            ) : (
              <p className="truncate font-extrabold" title={lineName ?? undefined}>
                {lineName ?? 'خط تولید'}
              </p>
            )}
            <p className="text-xs leading-5 text-muted-foreground">
              محصول: {productName ?? '—'}
            </p>
          </div>
          <HelpDot label="خط تولید و محصول" content={LINE_HELP} />
        </div>
      </div>

      {/* ایستگاه‌ها — قابل مرتب‌سازی با Drag & Drop */}
      <div className="scroll-slim max-h-[24rem] overflow-y-auto p-3 lg:max-h-[calc(100vh-19rem)]">
        {stations.length === 0 ? (
          <div className="space-y-2 rounded-xl border border-dashed p-4 text-center">
            <p className="text-xs leading-6 text-muted-foreground">هنوز ایستگاهی ثبت نشده است.</p>
            <Button size="sm" onClick={onNewStation} className="btn-brand gap-1.5 border-0">
              <Plus className="size-3.5" aria-hidden />
              ثبت اولین ایستگاه
            </Button>
          </div>
        ) : (
          <SortableList
            items={stations}
            onReorder={onReorderStations}
            handleClassName="rounded-s-xl"
            renderItem={(station) => {
              const isSelected = station.id === selectedStationId
              const isOpen = openMap[station.id] !== false
              const elementCount = station.activities.reduce(
                (sum, a) => sum + activityElementCount(a),
                0
              )
              return (
                <Collapsible
                  key={station.id}
                  open={isOpen}
                  onOpenChange={(open) => onStationOpenChange(station.id, open)}
                >
                  <div
                    className={cn(
                      'overflow-hidden rounded-xl border bg-card transition-all',
                      isSelected
                        ? 'border-brand bg-brand-soft/40 shadow-[0_6px_18px_-8px_rgba(114,87,255,0.5)] ring-2 ring-brand/25'
                        : 'border-border/60 hover:border-brand/40'
                    )}
                  >
                    {/* سربرگ کارت — کل ناحیه کلیک‌پذیر: انتخاب + باز/بسته شدن */}
                    <div
                      role="button"
                      tabIndex={0}
                      aria-expanded={isOpen}
                      aria-current={isSelected ? true : undefined}
                      onClick={(e) => {
                        if ((e.target as HTMLElement).closest('button')) return
                        onSelectStation(station.id)
                        onStationOpenChange(station.id, !isOpen)
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          onSelectStation(station.id)
                          onStationOpenChange(station.id, !isOpen)
                        }
                      }}
                      className="flex cursor-pointer items-stretch gap-1.5 py-1 pe-1.5 ps-8 focus-visible:outline-2 focus-visible:outline-ring"
                    >
                      {/* عملیات: ویرایش بالا، حذف پایین — چسبیده به راست */}
                      <div className="flex shrink-0 flex-col justify-center gap-0.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          onClick={(e) => {
                            e.stopPropagation()
                            onEditStation(station)
                          }}
                          aria-label={`ویرایش ایستگاه ${station.name}`}
                        >
                          <Pencil className="size-3.5" aria-hidden />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 text-red hover:text-red"
                          onClick={(e) => {
                            e.stopPropagation()
                            onDeleteStation(station)
                          }}
                          aria-label={`حذف ایستگاه ${station.name}`}
                        >
                          <Trash2 className="size-3.5" aria-hidden />
                        </Button>
                      </div>
                      {/* عنوان تا دو خط + شمارش فقط برای کارت انتخاب‌شده */}
                      <div className="min-w-0 flex-1 self-center">
                        <p
                          className="line-clamp-2 text-sm font-bold leading-5"
                          title={station.name}
                        >
                          {station.name}
                        </p>
                        {isSelected && (
                          <p className="num mt-0.5 text-[11px] leading-4 text-muted-foreground">
                            {formatInt(station.activities.length, prefs)} فعالیت ·{' '}
                            {formatInt(elementCount, prefs)} عنصر کاری
                          </p>
                        )}
                      </div>
                    </div>

                    <CollapsibleContent>
                      {/* زیرمنوی فعالیت‌ها — تورفتگی + خط راهنمای درختی در راست */}
                      <div className="mt-1 mb-2 ms-2 border-s-2 border-dashed border-brand/25 pb-1 ps-2.5">
                        {station.activities.length === 0 ? (
                          <p className="py-1.5 text-center text-[11px] text-faint">فعالیتی ثبت نشده است</p>
                        ) : (
                          <SortableList
                            items={station.activities}
                            onReorder={(ids) => onReorderActivities(station.id, ids)}
                            className="space-y-1"
                            renderItem={(activity) => {
                              const parentSelected = isSelected
                              const group = activity.group
                              return (
                                <div
                                  className="flex items-stretch gap-1.5 rounded-lg bg-surface-2/70 py-0.5 pe-1 ps-8 transition-colors hover:bg-brand-soft/30"
                                  title={`نوع رویداد فرایندی: ${processLabelOf(activity.processType)}${group ? ` · گروه مجازها: ${group.name}` : ''} · ${formatInt(activityElementCount(activity), prefs)} عنصر`}
                                >
                                  {/* عملیات: ویرایش بالا، حذف پایین — چسبیده به راست */}
                                  <div className="flex shrink-0 flex-col justify-center gap-0.5">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="size-6"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        onEditActivity(activity)
                                      }}
                                      aria-label={`ویرایش فعالیت ${activity.name}`}
                                    >
                                      <Pencil className="size-3" aria-hidden />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="size-6 text-red hover:text-red"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        onDeleteActivity(activity)
                                      }}
                                      aria-label={`حذف فعالیت ${activity.name}`}
                                    >
                                      <Trash2 className="size-3" aria-hidden />
                                    </Button>
                                  </div>
                                  {/* عنوان تا دو خط + گروه/شمارش فقط برای فعالیت‌های ایستگاه انتخاب‌شده */}
                                  <button
                                    type="button"
                                    onClick={() => onOpenActivity(activity.id)}
                                    className="flex min-w-0 flex-1 items-center rounded-md text-right focus-visible:outline-2 focus-visible:outline-ring"
                                    aria-label={`باز کردن صفحه فعالیت ${activity.name}`}
                                  >
                                    <span className="min-w-0">
                                      <span className="line-clamp-2 block text-[13px] font-medium leading-5">
                                        {activity.name}
                                      </span>
                                      {parentSelected && (
                                        <span className="num mt-0.5 block text-[10.5px] leading-4 text-muted-foreground">
                                          {formatInt(activityElementCount(activity), prefs)} عنصر ·{' '}
                                          {group ? group.name : 'بدون گروه'}
                                        </span>
                                      )}
                                    </span>
                                  </button>
                                </div>
                              )
                            }}
                          />
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="mt-1.5 w-full gap-1 text-xs text-muted-foreground"
                          onClick={() => onNewActivity(station.id)}
                        >
                          <Plus className="size-3.5" aria-hidden />
                          فعالیت جدید
                        </Button>
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              )
            }}
          />
        )}
      </div>

      {/* افزودن ایستگاه جدید */}
      <div className="border-t p-3">
        <Button variant="outline" className="w-full gap-1.5" onClick={onNewStation}>
          <Plus className="size-4" aria-hidden />
          ایستگاه جدید
        </Button>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════
// پنل جزئیات ایستگاه — فرم ویرایش با ذخیره خودکار (FR-23)
// دیالوگ ویرایش همان فرم مشترک را نمایش می‌دهد تا تنها یک
// نمونه autosave برای هر ایستگاه فعال باشد (کنترل هم‌زمانی)
// ═══════════════════════════════════════════════════════════
function StationDetailsPanel({
  station,
  prefs,
  dialogOpen,
  onDialogOpenChange,
  onSaved,
  onNewActivity,
  onOpenActivity,
  onDeleteStation,
}: {
  station: StationDto
  prefs: Prefs
  dialogOpen: boolean
  onDialogOpenChange: (open: boolean) => void
  onSaved: () => void
  onNewActivity: () => void
  onOpenActivity: (activityId: string) => void
  onDeleteStation: () => void
}) {
  // فرم یک‌بار از داده اولیه مقداردهی می‌شود؛ ref آخرین updatedAt را
  // برای کنترل هم‌زمانی (expectedUpdatedAt) نگه می‌دارد — ۶.۶
  const [form, setForm] = useState<StationFormState>(() => ({
    name: station.name,
    description: station.description ?? '',
  }))
  const updatedAtRef = useRef(station.updatedAt)

  const { status, lastError, retry } = useAutosave<StationFormState>({
    data: form,
    ready: true,
    save: async (value) => {
      const res = await structureApi.updateStation(station.id, {
        name: value.name.trim(),
        description: value.description.trim() || null,
        expectedUpdatedAt: updatedAtRef.current,
      })
      updatedAtRef.current = res.station.updatedAt
      onSaved()
    },
  })

  const totalElements = station.activities.reduce((sum, a) => sum + activityElementCount(a), 0)

  const nameField = (id: string) => (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1">
        <Label htmlFor={id}>نام ایستگاه</Label>
        <HelpDot label="نام ایستگاه" content={STATION_NAME_HELP} />
      </div>
      <Input
        id={id}
        value={form.name}
        onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
        placeholder="مثلاً: ایستگاه برش ورق"
      />
    </div>
  )

  const descField = (id: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={id}>شرح ایستگاه (اختیاری)</Label>
      <Textarea
        id={id}
        value={form.description}
        onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))}
        placeholder="مثلاً: برش ورق گالوانیزه با گیوتین ۳ متری"
        className="min-h-20"
      />
    </div>
  )

  return (
    <div className="space-y-5">
      {/* کارت ایستگاه — فرم ویرایش با ذخیره خودکار */}
      <section className="card-premium p-5" aria-label={`جزئیات ایستگاه ${station.name}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="chip-icon bg-brand-soft text-brand">
              <Warehouse className="size-6" aria-hidden />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-lg font-extrabold">{station.name}</h2>
              <p className="num text-xs text-muted-foreground">
                {formatInt(station.activities.length, prefs)} فعالیت · {formatInt(totalElements, prefs)} عنصر کاری
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <SaveIndicator status={status} onRetry={retry} error={lastError} />
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onDialogOpenChange(true)}>
              <Pencil className="size-3.5" aria-hidden />
              ویرایش
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-red hover:text-red"
              onClick={onDeleteStation}
              aria-label={`حذف ایستگاه ${station.name}`}
            >
              <Trash2 className="size-4" aria-hidden />
            </Button>
          </div>
        </div>

        <div className="mt-4 space-y-4">
          {nameField(`station-name-${station.id}`)}
          {descField(`station-desc-${station.id}`)}
        </div>

        <p className="num mt-3 text-[11px] text-faint">
          ایجاد: {formatDate(station.createdAt, prefs)} · آخرین تغییر: {formatDateTime(station.updatedAt, prefs)} ·
          تغییرات به‌صورت خودکار ذخیره می‌شوند.
        </p>
      </section>

      {/* فعالیت‌های ایستگاه — کارت‌های کلیک‌شو به صفحه اختصاصی فعالیت */}
      <section className="card-premium p-5" aria-label="فعالیت‌های ایستگاه">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="font-extrabold">فعالیت‌های این ایستگاه</h2>
            <Badge variant="secondary" className="num border-0 bg-surface-2">
              {formatInt(station.activities.length, prefs)}
            </Badge>
          </div>
          <Button onClick={onNewActivity} className="btn-brand gap-1.5 border-0">
            <Plus className="size-4" aria-hidden />
            فعالیت جدید
          </Button>
        </div>

        {station.activities.length === 0 ? (
          <EmptyState
            icon={<ListTree className="size-7" aria-hidden />}
            title="فعالیتی برای این ایستگاه ثبت نشده است"
            description="هر فعالیت از عناصر کاری تشکیل می‌شود و صفحه اختصاصی چهارزبانه دارد: مشخصات، عناصر کاری، زمان‌سنجی و تحلیل نتایج."
            action={
              <Button onClick={onNewActivity} className="btn-brand gap-1.5 border-0">
                <Plus className="size-4" aria-hidden />
                ثبت اولین فعالیت
              </Button>
            }
            className="mt-3"
          />
        ) : (
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {station.activities.map((activity) => (
              <li key={activity.id}>
                <ActivityCard activity={activity} prefs={prefs} onOpen={onOpenActivity} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* دیالوگ ویرایش — نمای بزرگ‌تر همان فرم ذخیره خودکار */}
      <Dialog open={dialogOpen} onOpenChange={onDialogOpenChange}>
        <DialogContent dir="rtl" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>ویرایش ایستگاه</DialogTitle>
            <DialogDescription>
              تغییرات به‌صورت خودکار ذخیره می‌شوند؛ همین فرم در پنل جزئیات نیز فعال است.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {nameField(`station-dialog-name-${station.id}`)}
            {descField(`station-dialog-desc-${station.id}`)}
          </div>
          <DialogFooter className="flex-row justify-between gap-2">
            <SaveIndicator status={status} onRetry={retry} error={lastError} />
            <Button variant="outline" onClick={() => onDialogOpenChange(false)}>
              بستن
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════
// کارت فعالیت — کلیک → صفحه اختصاصی فعالیت (FR-03)
// ═══════════════════════════════════════════════════════════
function ActivityCard({
  activity,
  prefs,
  onOpen,
}: {
  activity: ActivityDto
  prefs: Prefs
  onOpen: (activityId: string) => void
}) {
  const label = processLabelOf(activity.processType)
  return (
    <button
      type="button"
      onClick={() => onOpen(activity.id)}
      className="group flex w-full items-center gap-2.5 rounded-xl border border-border/60 bg-surface-2/50 p-3 text-right transition-all hover:border-brand/40 hover:bg-brand-soft/40 focus-visible:outline-2 focus-visible:outline-ring"
      aria-label={`باز کردن صفحه فعالیت ${activity.name}`}
    >
      <span
        className="num flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-base font-bold text-brand"
        title={label}
        aria-hidden
      >
        {processSymbolOf(activity.processType)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold">{activity.name}</span>
        <span className="num mt-0.5 block truncate text-[11px] text-muted-foreground">
          {formatInt(activityElementCount(activity), prefs)} عنصر کاری
          {activity.group ? ` · گروه ${activity.group.name}` : ' · بدون گروه'}
        </span>
      </span>
      <ArrowLeft className="size-4 shrink-0 text-faint transition-colors group-hover:text-brand" aria-hidden />
    </button>
  )
}

// ═══════════════════════════════════════════════════════════
// فرم ویرایش فعالیت (داخل دیالوگ) — ذخیره خودکار؛
// با key فعالیت رندر می‌شود تا وضعیت فرم با تعویض فعالیت بازنشانی شود
// ═══════════════════════════════════════════════════════════
function ActivityEditForm({
  activity,
  groups,
  groupsLoading,
  groupsError,
  onClose,
  onSaved,
}: {
  activity: ActivityDto
  groups: GroupDto[]
  groupsLoading: boolean
  groupsError: boolean
  onClose: () => void
  onSaved: (activityId: string) => void
}) {
  const [form, setForm] = useState<ActivityFormState>(() => ({
    name: activity.name,
    description: activity.description ?? '',
    processType: activity.processType,
    groupId: activity.groupId ?? '',
  }))
  const updatedAtRef = useRef(activity.updatedAt)

  const { status, lastError, retry } = useAutosave<ActivityFormState>({
    data: form,
    ready: true,
    save: async (value) => {
      const res = await structureApi.updateActivity(activity.id, {
        name: value.name.trim(),
        description: value.description.trim() || null,
        processType: value.processType,
        groupId: value.groupId || null,
        expectedUpdatedAt: updatedAtRef.current,
      })
      updatedAtRef.current = res.activity.updatedAt
      onSaved(activity.id)
    },
  })

  return (
    <>
      <DialogHeader>
        <DialogTitle>ویرایش فعالیت</DialogTitle>
        <DialogDescription>تغییرات به‌صورت خودکار ذخیره می‌شوند.</DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-1">
            <Label htmlFor={`activity-edit-name-${activity.id}`}>نام فعالیت</Label>
            <HelpDot label="نام فعالیت" content={ACTIVITY_NAME_HELP} />
          </div>
          <Input
            id={`activity-edit-name-${activity.id}`}
            value={form.name}
            onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
            placeholder="مثلاً: بستن درب پنل"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`activity-edit-desc-${activity.id}`}>شرح فعالیت (اختیاری)</Label>
          <Textarea
            id={`activity-edit-desc-${activity.id}`}
            value={form.description}
            onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))}
            placeholder="مثلاً: بستن ۴ پیچ با پیچ‌گوشتی برقی"
            className="min-h-16"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <div className="flex items-center gap-1">
              <Label>نوع رویداد فرایندی</Label>
              <HelpDot label="نوع رویداد فرایندی" content={PROCESS_TYPE_HELP} />
            </div>
            <Select value={form.processType} onValueChange={(v) => setForm((s) => ({ ...s, processType: v }))}>
              <SelectTrigger className="w-full" aria-label="نوع رویداد فرایندی">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROCESS_TYPES.map((pt) => (
                  <SelectItem key={pt} value={pt}>
                    <span className="num">{PROCESS_TYPE_SYMBOLS[pt]}</span> {PROCESS_TYPE_LABELS[pt]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-1">
              <Label>گروه مجازها</Label>
              <HelpDot label="گروه مجازها" content={GROUP_ASSIGN_HELP} />
            </div>
            <Select
              value={form.groupId || NO_GROUP}
              onValueChange={(v) => setForm((s) => ({ ...s, groupId: v === NO_GROUP ? '' : v }))}
              disabled={groupsLoading}
            >
              <SelectTrigger className="w-full" aria-label="گروه مجازها">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_GROUP}>بدون گروه</SelectItem>
                {groups.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {groupsError && (
              <p className="text-[11px] leading-5 text-red">
                بارگذاری گروه‌ها ناموفق بود؛ فعلاً تنها «بدون گروه» در دسترس است.
              </p>
            )}
          </div>
        </div>
      </div>
      <DialogFooter className="flex-row justify-between gap-2">
        <SaveIndicator status={status} onRetry={retry} error={lastError} />
        <Button variant="outline" onClick={onClose}>
          بستن
        </Button>
      </DialogFooter>
    </>
  )
}
