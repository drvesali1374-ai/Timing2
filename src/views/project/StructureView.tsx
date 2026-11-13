'use client'

// ═══════════════════════════════════════════════════════════
// نمای ساختار تولید — بازطراحی جلسه اول (§۷)
// درخت کامل سلسله‌مراتبی:
//   پروژه (ریشه) ← ایستگاه ← فعالیت ← عنصر کاری
// • کلیک نام/بدنه گره = فقط انتخاب (فعالیت → صفحه فعالیت؛
//   عنصر → دیالوگ ویرایش با الونس‌ها)؛ کلیک chevron = فقط
//   باز/بسته — دو رفتار مستقل (§۷.۲)
// • جست‌وجو در نام‌ها؛ نتایج مسیر والد را باز می‌کنند (§۷.۴)
// • DnD سه سطح با محدوده مجاز — انتقال عنصر بین فعالیت‌ها
//   ممنوع (SortableList مستقل هر والد — §۷.۳)
// • پنل جزئیات ایستگاه: ذخیره خودکار + «الونس‌ها و زمان‌های
//   مجاز» سطح ایستگاه (§۶)
// • دکمه افزودن ایستگاه/فعالیت/عنصر با variant متمایز btn-brand
// • عملیات ویرایش/حذف عمودی در سمت چپ ردیف RTL (§۷.۵)
// ═══════════════════════════════════════════════════════════
import { useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  ChevronDown,
  ChevronsDownUp,
  ChevronsUpDown,
  CircleDot,
  Factory,
  ListTree,
  Loader2,
  MousePointerClick,
  Pencil,
  Plus,
  Search,
  Trash2,
  Warehouse,
  X,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
  type ElementDto,
  type GroupDto,
  type StationDto,
} from '@/lib/api/endpoints'
import { api } from '@/lib/api-client'
import { qk } from '@/lib/api/keys'
import {
  PROCESS_TYPES,
  PROCESS_TYPE_LABELS,
  type ProcessType,
} from '@/domain/types'
import { useAppStore } from '@/store/app-store'
import { useDisplayPrefs } from '@/store/display-store'
import { formatDate, formatDateTime, formatInt } from '@/lib/format'
import { cn } from '@/lib/utils'
import { AllowanceSection } from './allowances/AllowanceSection'
import ParallelRelationsSection from './matrix/ParallelRelationsSection'
import { ProcessSymbol } from '@/components/common/ProcessSymbol'

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

interface ElementFormState {
  name: string
  description: string
}

const EMPTY_STATION_FORM: StationFormState = { name: '', description: '' }
const EMPTY_ACTIVITY_FORM: ActivityFormState = { name: '', description: '', processType: 'OPERATION', groupId: '' }
const EMPTY_ELEMENT_FORM: ElementFormState = { name: '', description: '' }

/** مقدار Sentinel — Radix Select مقدار رشته خالی قبول نمی‌کند */
const NO_GROUP = 'none'

// ── محتوای راهنمای آیکونی — FR-28 / ۷.۵ ──
const LINE_HELP = {
  what: 'هر پروژه مطالعه زمان‌سنجی دقیقاً یک خط تولید و یک محصول را پوشش می‌دهد؛ ریشه درخت ساختار از همین آغاز می‌شود: خط ← ایستگاه ← فعالیت ← عنصر کاری ← مشاهده.',
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
  what: 'گروه فعالیت فقط برای طبقه‌بندی فعالیت‌های مشابه است؛ دیگر منبع اعمال الونس نیست. الونس‌ها به‌صورت سلسله‌مراتبی از خط ← ایستگاه ← فعالیت ← عنصر resolve می‌شوند.',
  input: 'گروه دلخواه را انتخاب کنید یا «بدون گروه» بگذارید.',
  example: '«کار دستی سبک»، «کار ماشینی سنگین»',
  note: 'مقادیر قدیمی گروه‌ها هنگام مهاجرت به تخصیص سطح فعالیت تبدیل شده‌اند تا نتیجه پروژه‌های موجود حفظ شود.',
} as const

const ELEMENT_NAME_HELP = {
  what: 'عنصر کاری کوچک‌ترین واحد قابل‌تفکیک کار در فعالیت است؛ زمان‌سنجی روی همین سطح انجام می‌شود.',
  input: 'نامی کوتاه با نقطه پایانی مشخص؛ ترجیحاً فعل + مفعول.',
  example: '«برداشتن قطعه از گراناق» یا «بستن پیچ با آچار مخفی»',
  note: 'حذف عنصر همه مشاهدات و ارزیابی وستینگهاوس آن را دائمی حذف می‌کند. ترتیب عناصر با Drag & Drop داخل همین فعالیت تغییر می‌کند.',
} as const

const TREE_HELP = {
  what: 'درخت ساختار تولید با چهار سطح: خط تولید (ریشه پروژه) ← ایستگاه ← فعالیت ← عنصر کاری.',
  input: 'کلیک روی نام هر گره آن را انتخاب می‌کند (فعالیت → صفحه اختصاصی؛ عنصر → دیالوگ ویرایش). باز/بسته کردن زیرشاخه فقط با فلش کنار گره انجام می‌شود.',
  example: 'با جست‌وجو، ایستگاه/فعالیت/عنصرِ منطبق و مسیر والدش باز می‌شوند.',
  note: 'جابه‌جایی با کشیدن دستگیره لبه راست هر ردیف؛ عنصر فقط درون فعالیت خودش جابه‌جا می‌شود.',
} as const

// ── کمک‌تابع‌ها ──
function activityElementCount(a: ActivityDto): number {
  return a._count?.workElements ?? a.elements?.length ?? 0
}

function processLabelOf(pt: string): string {
  return PROCESS_TYPE_LABELS[pt as ProcessType] ?? pt
}

/** توضیح فارسی شمارش داده‌های حذف‌شده برای toast — اعداد واقعی Backend */
function removedCountsText(prefs: Prefs, parts: Array<[string, number]>): string | undefined {
  const segs = parts.filter(([, n]) => n > 0).map(([label, n]) => `${formatInt(n, prefs)} ${label}`)
  return segs.length > 0 ? `${segs.join('، ')} نیز به‌طور دائمی حذف شدند.` : undefined
}

/** وابستگی‌های حذف عنصر — GET /api/elements/{id} فقط هنگام دیالوگ */
interface ElementDepsDto {
  element: ElementDto & { _count?: { observations: number; sessions: number } }
}
const elementDepsKey = (id: string) => ['element-depends', id] as const

// ═══════════════ نمای اصلی ═══════════════

export default function StructureView({ projectId }: { projectId: string }) {
  const prefs = useDisplayPrefs()
  const isMobile = useIsMobile()
  const qc = useQueryClient()
  const selectedStationId = useAppStore((s) => s.selectedStationId)
  const setSelectedStation = useAppStore((s) => s.setSelectedStation)
  const openActivity = useAppStore((s) => s.openActivity)
  const navigate = useAppStore((s) => s.navigate)

  // ── وضعیت محلی ──
  const [treeOpen, setTreeOpen] = useState(true) // درخت تاشوی موبایل
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({}) // ایستگاه‌های باز (پیش‌فرض: باز)
  const [openActivityMap, setOpenActivityMap] = useState<Record<string, boolean>>({}) // فعالیت‌های باز (پیش‌فرض: بسته)
  const [search, setSearch] = useState('')
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
  const [deletingElement, setDeletingElement] = useState<{ element: ElementDto; activity: ActivityDto } | null>(null)
  const [elementEditor, setElementEditor] = useState<ElementDto | null>(null)
  const [elementCreateFor, setElementCreateFor] = useState<ActivityDto | null>(null)
  const [elementCreateForm, setElementCreateForm] = useState<ElementFormState>(EMPTY_ELEMENT_FORM)
  const [elementCreating, setElementCreating] = useState(false)

  // ── داده‌ها ──
  const treeQuery = useQuery({
    queryKey: qk.structure(projectId),
    queryFn: () => structureApi.tree(projectId),
  })
  const projectQuery = useQuery({
    queryKey: qk.project(projectId),
    queryFn: () => projectsApi.get(projectId),
    select: (d) => ({
      name: d.project.name,
      lineName: d.project.lineName,
      productName: d.project.productName,
    }),
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
  const elementDepsQuery = useQuery({
    queryKey: elementDepsKey(deletingElement?.element.id ?? 'none'),
    queryFn: () => api.get<ElementDepsDto>(`/api/elements/${deletingElement!.element.id}`),
    enabled: deletingElement !== null,
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
    void qc.invalidateQueries({ queryKey: ['scope-allowances'] })
  }
  const onActivitySaved = () => {
    invalidateActivityData()
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

  const createElementMutation = useMutation({
    mutationFn: (vars: { activityId: string; body: Record<string, unknown> }) =>
      structureApi.createElement(vars.activityId, vars.body),
    onSuccess: () => {
      invalidateActivityData()
      toast.success('عنصر کاری ثبت شد')
      setElementCreateFor(null)
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'ثبت عنصر ناموفق بود'),
  })

  const deleteElementMutation = useMutation({
    mutationFn: (elementId: string) => structureApi.deleteElement(elementId),
    onSuccess: (res, elementId) => {
      invalidateActivityData()
      const name = deletingElement?.element.name ?? 'عنصر'
      toast.success(`عنصر «${name}» به‌طور دائمی حذف شد`, {
        description: removedCountsText(prefs, [
          ['مشاهده', res.removedCounts.observations],
          ...(res.removedCounts.hasRating ? [['ارزیابی وستینگهاوس', 1] as [string, number]] : []),
        ]),
      })
      setDeletingElement(null)
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'حذف عنصر ناموفق بود'),
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

  const reorderElementsMutation = useMutation({
    mutationFn: (vars: { activityId: string; ids: string[] }) =>
      structureApi.reorderElements(vars.activityId, vars.ids),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.structure(projectId) })
      void qc.invalidateQueries({ queryKey: ['elements'] })
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'تغییر ترتیب عناصر ناموفق بود')
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

  const handleReorderElements = (activityId: string, ids: string[]) => {
    qc.setQueryData<{ stations: StationDto[] }>(qk.structure(projectId), (old) => {
      if (!old) return old
      return {
        stations: old.stations.map((s) => ({
          ...s,
          activities: s.activities.map((a) => {
            if (a.id !== activityId || !a.elements) return a
            return {
              ...a,
              elements: ids.flatMap((id) => {
                const e = a.elements!.find((x) => x.id === id)
                return e ? [e] : []
              }),
            }
          }),
        })),
      }
    })
    reorderElementsMutation.mutate({ activityId, ids })
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

  const openElementCreate = (activity: ActivityDto) => {
    setElementCreateForm(EMPTY_ELEMENT_FORM)
    setElementCreateFor(activity)
  }

  const submitElementCreate = async () => {
    if (!elementCreateFor) return
    if (!elementCreateForm.name.trim()) {
      toast.error('نام عنصر کاری الزامی است')
      return
    }
    setElementCreating(true)
    try {
      await createElementMutation.mutateAsync({
        activityId: elementCreateFor.id,
        body: {
          name: elementCreateForm.name.trim(),
          description: elementCreateForm.description.trim() || null,
        },
      })
    } finally {
      setElementCreating(false)
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

  const elementDeleteDeps = useMemo(() => {
    if (!deletingElement) return {}
    const deps: Record<string, number> = {}
    const obsCount = elementDepsQuery.data?.element._count?.observations ?? 0
    if (obsCount > 0) deps['مشاهده'] = obsCount
    if (elementDepsQuery.data?.element.rating) deps['ارزیابی وستینگهاوس این عنصر'] = 1
    return deps
  }, [deletingElement, elementDepsQuery.data])

  const editorStationName = activityEditor
    ? stations.find((s) => s.id === activityEditor.stationId)?.name ?? ''
    : ''

  // ── پروپ‌های مشترک درخت (نمونه موبایل و دسکتاپ) ──
  const treeProps = {
    stations,
    prefs,
    openMap,
    openActivityMap,
    onStationOpenChange: (stationId: string, open: boolean) =>
      setOpenMap((m) => ({ ...m, [stationId]: open })),
    onActivityOpenChange: (activityId: string, open: boolean) =>
      setOpenActivityMap((m) => ({ ...m, [activityId]: open })),
    onExpandAll: () => {
      setOpenMap(Object.fromEntries(stations.map((s) => [s.id, true])))
      setOpenActivityMap(
        Object.fromEntries(stations.flatMap((s) => s.activities.map((a) => [a.id, true])))
      )
    },
    onCollapseAll: () => {
      setOpenMap(Object.fromEntries(stations.map((s) => [s.id, false])))
      setOpenActivityMap({})
    },
    project: projectQuery.data ?? null,
    lineLoading: projectQuery.isLoading,
    selectedStationId,
    onSelectStation: selectStation,
    onEditStation: openEditStation,
    onDeleteStation: (station: StationDto) => setDeletingStation(station),
    onOpenActivity: (activityId: string) => openActivity(projectId, activityId),
    onEditActivity: (activity: ActivityDto) =>
      setActivityEditor({ stationId: activity.stationId, activity }),
    onDeleteActivity: (activity: ActivityDto) => setDeletingActivity(activity),
    onNewActivity: openActivityCreate,
    onEditElement: (element: ElementDto) => setElementEditor(element),
    onDeleteElement: (element: ElementDto, activity: ActivityDto) => setDeletingElement({ element, activity }),
    onNewElement: openElementCreate,
    onReorderStations: handleReorderStations,
    onReorderActivities: handleReorderActivities,
    onReorderElements: handleReorderElements,
    onNewStation: openStationCreate,
    onEditProject: () => navigate({ name: 'project', projectId, stage: 'info' }),
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
                      <StructureTree {...treeProps} search={search} onSearchChange={setSearch} />
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            </div>
            <div className="hidden lg:block">
              <div className="card-premium overflow-hidden">
                <StructureTree {...treeProps} search={search} onSearchChange={setSearch} />
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
                projectId={projectId}
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
                      با انتخاب هر ایستگاه، فرم ویرایش آن، الونس‌های سطح ایستگاه و فهرست فعالیت‌هایش در این بخش
                      نمایش داده می‌شود. برای مشاهده عناصر کاری، فعالیت را در درخت باز کنید.
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
                    placeholder="مثلاً: بستن ۴ پیچ با آچار بکس"
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
                      <SelectTrigger aria-label="نوع رویداد فرایندی">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent dir="rtl">
                        {PROCESS_TYPES.map((pt) => (
                          <SelectItem key={pt} value={pt}>
                            <ProcessSymbol type={pt} size="sm" /> {processLabelOf(pt)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1">
                      <Label>گروه فعالیت (طبقه‌بندی)</Label>
                      <HelpDot label="گروه فعالیت" content={GROUP_ASSIGN_HELP} />
                    </div>
                    <Select
                      value={activityCreateForm.groupId || NO_GROUP}
                      onValueChange={(v) =>
                        setActivityCreateForm((s) => ({ ...s, groupId: v === NO_GROUP ? '' : v }))
                      }
                      disabled={groupsQuery.isLoading}
                    >
                      <SelectTrigger aria-label="گروه فعالیت">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent dir="rtl">
                        <SelectItem value={NO_GROUP}>بدون گروه</SelectItem>
                        {groups.map((g) => (
                          <SelectItem key={g.id} value={g.id}>
                            {g.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {groupsQuery.isError && (
                      <p className="text-xs leading-5 text-red">
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

      {/* دیالوگ ویرایش عنصر کاری — با الونس‌های عنصر (§۶) */}
      {elementEditor && (
        <ElementEditDialog
          key={elementEditor.id}
          projectId={projectId}
          element={elementEditor}
          onClose={() => setElementEditor(null)}
          onSaved={invalidateActivityData}
        />
      )}

      {/* دیالوگ ایجاد عنصر کاری */}
      <Dialog open={elementCreateFor !== null} onOpenChange={(open) => !open && setElementCreateFor(null)}>
        <DialogContent dir="rtl" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>عنصر کاری جدید</DialogTitle>
            <DialogDescription>
              {elementCreateFor ? `در فعالیت «${elementCreateFor.name}» — ` : ''}
              عنصر در انتهای فهرست افزوده می‌شود.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-1">
                <Label htmlFor="element-create-name">نام عنصر کاری</Label>
                <HelpDot label="نام عنصر کاری" content={ELEMENT_NAME_HELP} />
              </div>
              <Input
                id="element-create-name"
                value={elementCreateForm.name}
                onChange={(e) => setElementCreateForm((s) => ({ ...s, name: e.target.value }))}
                placeholder="مثلاً: برداشتن قطعه از گراناق"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="element-create-desc">شرح عنصر (اختیاری)</Label>
              <Textarea
                id="element-create-desc"
                value={elementCreateForm.description}
                onChange={(e) => setElementCreateForm((s) => ({ ...s, description: e.target.value }))}
                placeholder="مثلاً: برداشت با دو دست و قراردادن روی میز کار"
                className="min-h-16"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setElementCreateFor(null)}>
              انصراف
            </Button>
            <Button onClick={submitElementCreate} disabled={elementCreating} className="btn-brand border-0">
              {elementCreating ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Plus className="size-4" aria-hidden />
              )}
              ثبت عنصر
            </Button>
          </DialogFooter>
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

      {/* تأیید حذف دائمی عنصر — FR-26 */}
      <ConfirmDeleteDialog
        open={deletingElement !== null}
        onOpenChange={(open) => !open && setDeletingElement(null)}
        title="حذف دائمی عنصر کاری"
        entityName={deletingElement?.element.name ?? ''}
        dependencies={elementDeleteDeps}
        onConfirm={() => deletingElement && deleteElementMutation.mutate(deletingElement.element.id)}
        loading={deleteElementMutation.isPending}
      />
    </div>
  )
}

// ═══════════════════════════════════════════════════════════
// درخت ساختار — چهار سطح + جست‌وجو + باز/بستن همه — §۷
// ═══════════════════════════════════════════════════════════

interface StructureTreeProps {
  stations: StationDto[]
  prefs: Prefs
  openMap: Record<string, boolean>
  openActivityMap: Record<string, boolean>
  onStationOpenChange: (stationId: string, open: boolean) => void
  onActivityOpenChange: (activityId: string, open: boolean) => void
  onExpandAll: () => void
  onCollapseAll: () => void
  project: { name: string; lineName: string; productName: string } | null
  lineLoading: boolean
  selectedStationId: string | null
  onSelectStation: (stationId: string) => void
  onEditStation: (station: StationDto) => void
  onDeleteStation: (station: StationDto) => void
  onOpenActivity: (activityId: string) => void
  onEditActivity: (activity: ActivityDto) => void
  onDeleteActivity: (activity: ActivityDto) => void
  onNewActivity: (stationId: string) => void
  onEditElement: (element: ElementDto) => void
  onDeleteElement: (element: ElementDto, activity: ActivityDto) => void
  onNewElement: (activity: ActivityDto) => void
  onReorderStations: (ids: string[]) => void
  onReorderActivities: (stationId: string, ids: string[]) => void
  onReorderElements: (activityId: string, ids: string[]) => void
  onNewStation: () => void
  onEditProject: () => void
  search: string
  onSearchChange: (q: string) => void
}

function StructureTree(props: StructureTreeProps) {
  const {
    stations,
    prefs,
    openMap,
    openActivityMap,
    onStationOpenChange,
    onActivityOpenChange,
    onExpandAll,
    onCollapseAll,
    project,
    lineLoading,
    selectedStationId,
    onSelectStation,
    onEditStation,
    onDeleteStation,
    onOpenActivity,
    onEditActivity,
    onDeleteActivity,
    onNewActivity,
    onEditElement,
    onDeleteElement,
    onNewElement,
    onReorderStations,
    onReorderActivities,
    onReorderElements,
    onNewStation,
    onEditProject,
    search,
    onSearchChange,
  } = props

  // ── فیلتر جست‌وجو — نتایج مسیر والد را باز می‌کنند (§۷.۴) ──
  const q = search.trim()
  const matchName = (name: string) => !q || name.includes(q)
  const visibleStations = stations.filter(
    (s) =>
      matchName(s.name) ||
      s.activities.some((a) => matchName(a.name) || (a.elements ?? []).some((e) => matchName(e.name)))
  )
  const stationVisibleActivities = (s: StationDto): ActivityDto[] =>
    q
      ? s.activities.filter(
          (a) => matchName(a.name) || (a.elements ?? []).some((e) => matchName(e.name))
        )
      : s.activities
  const activityVisibleElements = (a: ActivityDto): ElementDto[] =>
    q ? (a.elements ?? []).filter((e) => matchName(e.name)) : (a.elements ?? [])
  const hasSearch = q.length > 0

  return (
    <div>
      {/* ریشه: پروژه/خط تولید + محصول — §۷.۱ */}
      <div className="border-b bg-gradient-to-l from-brand-soft/70 to-transparent p-4">
        <div className="flex items-center gap-2.5">
          <span className="chip-icon bg-brand-soft text-brand">
            <Factory className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            {lineLoading ? (
              <Skeleton className="h-5 w-40" />
            ) : (
              <>
                <p className="truncate font-extrabold" title={project?.name ?? undefined}>
                  {project?.name ?? 'پروژه'}
                </p>
                <p className="num truncate text-[11px] text-muted-foreground">
                  خط: {project?.lineName ?? '—'} · محصول: {project?.productName ?? '—'}
                </p>
              </>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 shrink-0"
            aria-label="ویرایش مشخصات پروژه"
            title="ویرایش مشخصات پروژه"
            onClick={onEditProject}
          >
            <Pencil className="size-3.5" aria-hidden />
          </Button>
          <HelpDot label="درخت ساختار تولید" content={TREE_HELP} />
        </div>
      </div>

      {/* نوار ابزار: جست‌وجو + باز/بستن همه — §۷.۳/۷.۴ */}
      <div className="flex items-center gap-1.5 border-b bg-surface-2/40 p-2.5">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute inset-y-0 start-2.5 my-auto size-3.5 text-faint" aria-hidden />
          <Input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="جست‌وجوی ایستگاه، فعالیت یا عنصر…"
            className="h-8 rounded-lg bg-card ps-8 text-xs"
            aria-label="جست‌وجو در درخت ساختار"
          />
          {search && (
            <button
              type="button"
              className="absolute inset-y-0 end-2 my-auto text-faint transition-colors hover:text-foreground"
              aria-label="پاک‌کردن جست‌وجو"
              onClick={() => onSearchChange('')}
            >
              <X className="size-3.5" aria-hidden />
            </button>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 shrink-0"
          aria-label="باز کردن همه شاخه‌ها"
          title="باز کردن همه"
          onClick={onExpandAll}
        >
          <ChevronsUpDown className="size-4" aria-hidden />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 shrink-0"
          aria-label="بستن همه شاخه‌ها"
          title="بستن همه"
          onClick={onCollapseAll}
        >
          <ChevronsDownUp className="size-4" aria-hidden />
        </Button>
      </div>

      {/* ایستگاه‌ها */}
      <div className="scroll-slim max-h-[26rem] overflow-y-auto p-3 lg:max-h-[calc(100vh-23rem)]">
        {visibleStations.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/70 p-5 text-center">
            <p className="text-sm font-bold">
              {hasSearch ? 'موردی منطبق با جست‌وجو یافت نشد' : 'هنوز ایستگاهی ثبت نشده است'}
            </p>
            {!hasSearch && (
              <Button size="sm" className="btn-brand mt-3 gap-1.5 border-0" onClick={onNewStation}>
                <Plus className="size-4" aria-hidden />
                ثبت اولین ایستگاه
              </Button>
            )}
          </div>
        ) : (
          <SortableList
            items={visibleStations}
            onReorder={(ids) => onReorderStations(ids.filter((id) => visibleStations.some((s) => s.id === id)))}
            handleClassName="rounded-s-xl"
            renderItem={(station) => {
              const isSelected = station.id === selectedStationId
              // هنگام جست‌وجو، مسیر والد باز نمایش داده می‌شود (بدون تغییر state)
              const isOpen = hasSearch || openMap[station.id] !== false
              const acts = stationVisibleActivities(station)
              return (
                <StationNode
                  key={station.id}
                  station={station}
                  activities={acts}
                  prefs={prefs}
                  isSelected={isSelected}
                  isOpen={isOpen}
                  hasSearch={hasSearch}
                  openActivityMap={openActivityMap}
                  selectedStationId={selectedStationId}
                  onStationOpenChange={onStationOpenChange}
                  onActivityOpenChange={onActivityOpenChange}
                  onSelectStation={onSelectStation}
                  onEditStation={onEditStation}
                  onDeleteStation={onDeleteStation}
                  onOpenActivity={onOpenActivity}
                  onEditActivity={onEditActivity}
                  onDeleteActivity={onDeleteActivity}
                  onNewActivity={onNewActivity}
                  onEditElement={onEditElement}
                  onDeleteElement={onDeleteElement}
                  onNewElement={onNewElement}
                  onReorderActivities={onReorderActivities}
                  onReorderElements={onReorderElements}
                  visibleActivities={stationVisibleActivities}
                  activityVisibleElements={activityVisibleElements}
                />
              )
            }}
          />
        )}
      </div>

      {/* پانوشت: افزودن ایستگاه — §۷.۶ variant متمایز */}
      <div className="border-t p-3">
        <Button variant="outline" className="btn-brand gap-1.5 border-0" onClick={onNewStation}>
          <Plus className="size-4" aria-hidden />
          ایستگاه جدید
        </Button>
      </div>
    </div>
  )
}

// ═══════════════ گره ایستگاه — کارت متمایز از ردیف فعالیت (§۷.۶) ═══════════════

interface StationNodeProps {
  station: StationDto
  activities: ActivityDto[]
  prefs: Prefs
  isSelected: boolean
  isOpen: boolean
  hasSearch: boolean
  openActivityMap: Record<string, boolean>
  selectedStationId: string | null
  onStationOpenChange: (stationId: string, open: boolean) => void
  onActivityOpenChange: (activityId: string, open: boolean) => void
  onSelectStation: (stationId: string) => void
  onEditStation: (station: StationDto) => void
  onDeleteStation: (station: StationDto) => void
  onOpenActivity: (activityId: string) => void
  onEditActivity: (activity: ActivityDto) => void
  onDeleteActivity: (activity: ActivityDto) => void
  onNewActivity: (stationId: string) => void
  onEditElement: (element: ElementDto) => void
  onDeleteElement: (element: ElementDto, activity: ActivityDto) => void
  onNewElement: (activity: ActivityDto) => void
  onReorderActivities: (stationId: string, ids: string[]) => void
  onReorderElements: (activityId: string, ids: string[]) => void
  visibleActivities: (s: StationDto) => ActivityDto[]
  activityVisibleElements: (a: ActivityDto) => ElementDto[]
}

function StationNode(p: StationNodeProps) {
  const { station, prefs, isSelected, isOpen, hasSearch } = p
  const elementCount = station.activities.reduce((sum, a) => sum + activityElementCount(a), 0)

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={(open) => p.onStationOpenChange(station.id, open)}
    >
      <div
        className={cn(
          // کارت ایستگاه: پس‌زمینه متفاوت از ردیف فعالیت + border واضح‌تر (§۷.۶)
          'overflow-hidden rounded-xl border bg-card transition-all',
          isSelected
            ? 'border-brand bg-brand-soft/40 shadow-[0_6px_18px_-8px_rgba(114,87,255,0.5)] ring-2 ring-brand/25'
            : 'border-line-strong bg-card hover:border-brand/40'
        )}
      >
        {/* سربرگ کارت: chevron مستقل + بدنه انتخاب + عملیات چپ — §۷.۲ */}
        <div className="flex items-stretch gap-1 py-1 pe-1.5 ps-8">
          {/* chevron — فقط باز/بسته زیرشاخه (§۷.۲) */}
          <button
            type="button"
            className="flex w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-brand-soft/50 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
            aria-label={(isOpen ? 'بستن' : 'باز کردن') + ' زیرشاخه ایستگاه ' + station.name}
            aria-expanded={isOpen}
            title="فعالیت‌های ایستگاه"
            onClick={(e) => {
              e.stopPropagation()
              p.onStationOpenChange(station.id, !isOpen)
            }}
          >
            <ChevronDown className={cn('size-4 transition-transform', !isOpen && '-rotate-90')} aria-hidden />
          </button>
          {/* بدنه — کلیک = فقط انتخاب (§۷.۲) */}
          <div
            role="button"
            tabIndex={0}
            aria-current={isSelected ? 'true' : undefined}
            className="flex min-w-0 flex-1 cursor-pointer flex-col justify-center gap-0.5 rounded-md px-1.5 py-1.5 transition-colors hover:bg-brand-soft/25 focus-visible:outline-2 focus-visible:outline-ring"
            onClick={() => p.onSelectStation(station.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                p.onSelectStation(station.id)
              }
            }}
          >
            <div className="flex items-center gap-1.5">
              <span className="line-clamp-2 min-w-0 flex-1 text-sm font-bold leading-5">{station.name}</span>
              <Badge variant="secondary" className="num shrink-0 border-0 bg-surface-3 text-[10px]" aria-label="تعداد فعالیت">
                {formatInt(station.activities.length, prefs)}
              </Badge>
            </div>
            {isSelected && (
              <p className="num text-[11px] leading-4 text-muted-foreground">
                {formatInt(station.activities.length, prefs)} فعالیت · {formatInt(elementCount, prefs)} عنصر کاری
              </p>
            )}
          </div>
          {/* عملیات ویرایش/حذف عمودی در چپ ردیف RTL — §۷.۵ */}
          <div className="flex shrink-0 flex-col justify-center gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              aria-label={`ویرایش ایستگاه ${station.name}`}
              onClick={(e) => {
                e.stopPropagation()
                p.onEditStation(station)
              }}
            >
              <Pencil className="size-3.5" aria-hidden />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 text-red hover:text-red"
              aria-label={`حذف ایستگاه ${station.name}`}
              onClick={(e) => {
                e.stopPropagation()
                p.onDeleteStation(station)
              }}
            >
              <Trash2 className="size-3.5" aria-hidden />
            </Button>
          </div>
        </div>

        {/* زیرشاخه فعالیت‌ها — خط راهنمای سلسله‌مراتبی */}
        <CollapsibleContent>
          <div className="mb-2 mt-1 ms-2 border-s-2 border-dashed border-brand/25 pb-1 ps-2.5">
            {p.activities.length === 0 ? (
              <p className="px-1 py-1.5 text-[11px] text-faint">
                {hasSearch ? 'فعالیت منطبقی نیست' : 'فعالیتی ثبت نشده است'}
              </p>
            ) : (
              <SortableList
                items={p.activities}
                onReorder={(ids) => p.onReorderActivities(station.id, ids)}
                className="space-y-1"
                renderItem={(activity) => {
                  const parentSelected = station.id === p.selectedStationId
                  // هنگام جست‌وجو مسیر والد باز است؛ در حالت عادی از openActivityMap
                  const actOpen = hasSearch || p.openActivityMap[activity.id] === true
                  return (
                    <ActivityNode
                      key={activity.id}
                      activity={activity}
                      station={station}
                      prefs={prefs}
                      parentSelected={parentSelected}
                      isOpen={actOpen}
                      hasSearch={hasSearch}
                      onActivityOpenChange={p.onActivityOpenChange}
                      onOpenActivity={p.onOpenActivity}
                      onEditActivity={p.onEditActivity}
                      onDeleteActivity={p.onDeleteActivity}
                      onEditElement={p.onEditElement}
                      onDeleteElement={p.onDeleteElement}
                      onNewElement={p.onNewElement}
                      onReorderElements={p.onReorderElements}
                      visibleElements={p.activityVisibleElements}
                    />
                  )
                }}
              />
            )}
            {/* افزودن فعالیت — §۷.۶ variant متمایز */}
            <Button
              variant="ghost"
              size="sm"
              className="mt-1 w-full gap-1.5 text-muted-foreground"
              onClick={() => p.onNewActivity(station.id)}
            >
              <Plus className="size-3.5" aria-hidden />
              فعالیت جدید
            </Button>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}

// ═══════════════ گره فعالیت — ردیف با border مستقل ظریف + badge نوع فرایند (§۷.۶) ═══════════════

interface ActivityNodeProps {
  activity: ActivityDto
  station: StationDto
  prefs: Prefs
  parentSelected: boolean
  isOpen: boolean
  hasSearch: boolean
  onActivityOpenChange: (activityId: string, open: boolean) => void
  onOpenActivity: (activityId: string) => void
  onEditActivity: (activity: ActivityDto) => void
  onDeleteActivity: (activity: ActivityDto) => void
  onEditElement: (element: ElementDto) => void
  onDeleteElement: (element: ElementDto, activity: ActivityDto) => void
  onNewElement: (activity: ActivityDto) => void
  onReorderElements: (activityId: string, ids: string[]) => void
  visibleElements: (a: ActivityDto) => ElementDto[]
}

function ActivityNode(p: ActivityNodeProps) {
  const { activity, prefs, parentSelected, isOpen, hasSearch } = p
  const elements = p.visibleElements(activity)
  const elementCount = activityElementCount(activity)
  const groupLabel = activity.group?.name ?? null

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={(open) => p.onActivityOpenChange(activity.id, open)}
    >
      <div
        className={cn(
          // ردیف فعالیت: پس‌زمینه متفاوت از کارت ایستگاه + border مستقل ظریف (§۷.۶)
          'overflow-hidden rounded-lg border border-border/60 bg-surface-2/80 transition-colors hover:border-brand/35',
          parentSelected && 'bg-brand-soft/25'
        )}
        title={`${processLabelOf(activity.processType)}${groupLabel ? ` · گروه: ${groupLabel}` : ''} · ${formatInt(elementCount, prefs)} عنصر کاری`}
      >
        <div className="flex items-stretch gap-1 py-0.5 pe-1 ps-8">
          {/* chevron — فقط باز/بسته عناصر کاری (§۷.۲) */}
          <button
            type="button"
            className="flex w-5 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-brand-soft/50 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
            aria-label={(isOpen ? 'بستن' : 'باز کردن') + ' عناصر کاری فعالیت ' + activity.name}
            aria-expanded={isOpen}
            title="عناصر کاری"
            onClick={(e) => {
              e.stopPropagation()
              p.onActivityOpenChange(activity.id, !isOpen)
            }}
          >
            <ChevronDown className={cn('size-3.5 transition-transform', !isOpen && '-rotate-90')} aria-hidden />
          </button>
          {/* بدنه — کلیک = باز شدن صفحه فعالیت */}
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1.5 py-1 text-right transition-colors hover:bg-brand-soft/30 focus-visible:outline-2 focus-visible:outline-ring"
            aria-label={`باز کردن صفحه فعالیت ${activity.name}`}
            onClick={() => p.onOpenActivity(activity.id)}
          >
            <span className="line-clamp-2 min-w-0 flex-1 text-[13px] font-medium leading-4.5">{activity.name}</span>
            {/* badge نوع فرایند کنار نام — نه فقط در title (§۷.۶) */}
            <span
              className="num size-5 shrink-0 rounded-md bg-brand-soft text-[11px] font-bold leading-5 text-brand"
              title={processLabelOf(activity.processType)}
              aria-label={`نوع فرایند: ${processLabelOf(activity.processType)}`}
            >
              <ProcessSymbol type={activity.processType} size="sm" />
            </span>
            <Badge variant="secondary" className="num shrink-0 border-0 bg-surface-3 text-[9.5px]" aria-label="تعداد عنصر">
              {formatInt(elementCount, prefs)}
            </Badge>
          </button>
          {/* عملیات ویرایش/حذف عمودی در چپ — §۷.۵ */}
          <div className="flex shrink-0 flex-col justify-center gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              className="size-6"
              aria-label={`ویرایش فعالیت ${activity.name}`}
              onClick={(e) => {
                e.stopPropagation()
                p.onEditActivity(activity)
              }}
            >
              <Pencil className="size-3" aria-hidden />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-6 text-red hover:text-red"
              aria-label={`حذف فعالیت ${activity.name}`}
              onClick={(e) => {
                e.stopPropagation()
                p.onDeleteActivity(activity)
              }}
            >
              <Trash2 className="size-3" aria-hidden />
            </Button>
          </div>
        </div>

        {/* زیرشاخه عناصر کاری — سطح چهارم (§۷.۱) */}
        <CollapsibleContent>
          <div className="mb-1 mt-0.5 ms-2 border-s-2 border-dashed border-border/70 pb-1 ps-2">
            {elements.length === 0 ? (
              <p className="px-1 py-1 text-[10.5px] text-faint">
                {hasSearch ? 'عنصر منطبقی نیست' : 'عنصری ثبت نشده است'}
              </p>
            ) : (
              <SortableList
                items={elements}
                onReorder={(ids) => p.onReorderElements(activity.id, ids)}
                className="space-y-0.5"
                renderItem={(element) => (
                  <div
                    key={element.id}
                    className="group flex items-stretch gap-1 rounded-md py-0.5 pe-1 ps-7 transition-colors hover:bg-brand-soft/25"
                  >
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1 py-0.5 text-right focus-visible:outline-2 focus-visible:outline-ring"
                      aria-label={`ویرایش عنصر کاری ${element.name}`}
                      title={`${element.name}${element.rating ? ` · R = ${element.rating.totalFactor}` : ' · ارزیابی نشده'}`}
                      onClick={() => p.onEditElement(element)}
                    >
                      <CircleDot className="size-3 shrink-0 text-brand" aria-hidden />
                      <span className="line-clamp-1 min-w-0 flex-1 text-[11.5px] leading-4">{element.name}</span>
                      {element.rating && (
                        <span className="num shrink-0 rounded bg-green-soft px-1 text-[9px] font-bold text-green" dir="ltr">
                          R = {element.rating.totalFactor}
                        </span>
                      )}
                    </button>
                    <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-5"
                        aria-label={`ویرایش عنصر ${element.name}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          p.onEditElement(element)
                        }}
                      >
                        <Pencil className="size-2.5" aria-hidden />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-5 text-red hover:text-red"
                        aria-label={`حذف عنصر ${element.name}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          p.onDeleteElement(element, activity)
                        }}
                      >
                        <Trash2 className="size-2.5" aria-hidden />
                      </Button>
                    </div>
                  </div>
                )}
              />
            )}
            <Button
              variant="ghost"
              size="sm"
              className="mt-0.5 w-full gap-1 justify-start ps-2 text-[11px] text-muted-foreground"
              onClick={() => p.onNewElement(activity)}
            >
              <Plus className="size-3" aria-hidden />
              عنصر جدید
            </Button>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}

// ═══════════════════════════════════════════════════════════
// پنل جزئیات ایستگاه — autosave + الونس‌های سطح ایستگاه (§۶)
// ═══════════════════════════════════════════════════════════

function StationDetailsPanel({
  projectId,
  station,
  prefs,
  dialogOpen,
  onDialogOpenChange,
  onSaved,
  onNewActivity,
  onOpenActivity,
  onDeleteStation,
}: {
  projectId: string
  station: StationDto
  prefs: Prefs
  dialogOpen: boolean
  onDialogOpenChange: (open: boolean) => void
  onSaved: () => void
  onNewActivity: () => void
  onOpenActivity: (activityId: string) => void
  onDeleteStation: () => void
}) {
  const [form, setForm] = useState<StationFormState>(() => ({
    name: station.name,
    description: station.description ?? '',
  }))
  const updatedAtRef = useRef(station.updatedAt)

  const { status, lastError, retry } = useAutosave<StationFormState>({
    data: form,
    ready: form.name.trim().length > 0,
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
        className="min-h-16"
      />
    </div>
  )

  return (
    <div className="space-y-4">
      {/* جزئیات ایستگاه */}
      <section className="card-premium p-5" aria-label={`جزئیات ایستگاه ${station.name}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="chip-icon bg-brand-soft text-brand">
              <Warehouse className="size-6" aria-hidden />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-lg font-extrabold">{station.name}</h2>
              <p className="num text-xs text-muted-foreground">
                {formatInt(station.activities.length, prefs)} فعالیت · {formatInt(totalElements, prefs)} عنصر کاری
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <SaveIndicator status={status} onRetry={retry} error={lastError} />
            <Button variant="outline" size="sm" onClick={() => onDialogOpenChange(true)}>
              ویرایش
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="size-8 text-red hover:text-red"
              aria-label={`حذف ایستگاه ${station.name}`}
              onClick={onDeleteStation}
            >
              <Trash2 className="size-4" aria-hidden />
            </Button>
          </div>
        </div>
        <div className="mt-4 space-y-3">
          {nameField(`station-name-${station.id}`)}
          {descField(`station-desc-${station.id}`)}
        </div>
        <p className="num mt-3 text-[11px] text-faint">
          ایجاد: {formatDateTime(station.createdAt, prefs)} · آخرین تغییر: {formatDateTime(station.updatedAt, prefs)} ·
          تغییرات به‌صورت خودکار ذخیره می‌شوند.
        </p>
      </section>

      {/* الونس‌های سطح ایستگاه — §۶ */}
      <AllowanceSection projectId={projectId} scopeType="STATION" scopeId={station.id} />

      {/* فعالیت‌های ایستگاه */}
      <section className="card-premium p-5" aria-label="فعالیت‌های ایستگاه">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h2 className="font-extrabold">فعالیت‌های این ایستگاه</h2>
            <Badge variant="secondary" className="num border-0 bg-surface-2">
              {formatInt(station.activities.length, prefs)}
            </Badge>
          </div>
          <Button size="sm" className="btn-brand gap-1.5 border-0" onClick={onNewActivity}>
            <Plus className="size-4" aria-hidden />
            فعالیت جدید
          </Button>
        </div>
        {station.activities.length === 0 ? (
          <EmptyState
            className="mt-4 py-6"
            icon={<ListTree className="size-6" aria-hidden />}
            title="فعالیتی ثبت نشده است"
            description="هر فعالیت از عناصر کاری تشکیل می‌شود؛ عناصر را در صفحه فعالیت یا درخت ساختار اضافه کنید."
            action={
              <Button size="sm" onClick={onNewActivity} className="btn-brand gap-1.5 border-0">
                <Plus className="size-4" aria-hidden />
                ثبت اولین فعالیت
              </Button>
            }
          />
        ) : (
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {station.activities.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  className="group flex w-full items-center gap-2.5 rounded-xl border border-border/60 bg-surface-2/50 p-3 text-right transition-colors hover:border-brand/40 hover:bg-brand-soft/40 focus-visible:outline-2 focus-visible:outline-ring"
                  onClick={() => onOpenActivity(a.id)}
                  aria-label={`باز کردن صفحه فعالیت ${a.name}`}
                >
                  <span
                    className="num size-9 shrink-0 rounded-lg bg-brand-soft text-base font-bold text-brand"
                    title={processLabelOf(a.processType)}
                    aria-hidden
                  >
                    <ProcessSymbol type={a.processType} size="sm" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">{a.name}</span>
                    <span className="num block truncate text-[11px] text-muted-foreground">
                      {formatInt(activityElementCount(a), prefs)} عنصر کاری
                      {a.group ? ` · گروه ${a.group.name}` : ''}
                    </span>
                  </span>
                  <ChevronDown className="size-4 shrink-0 -rotate-90 text-faint transition-colors group-hover:text-brand" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* دیالوگ ویرایش مشترک با autosave */}
      <Dialog open={dialogOpen} onOpenChange={onDialogOpenChange}>
        <DialogContent dir="rtl" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>ویرایش ایستگاه</DialogTitle>
            <DialogDescription>تغییرات به‌صورت خودکار ذخیره می‌شوند.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {nameField(`station-edit-name-${station.id}`)}
            {descField(`station-edit-desc-${station.id}`)}
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
// فرم ویرایش فعالیت (داخل دیالوگ) — ذخیره خودکار
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
  onSaved: () => void
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
    ready: form.name.trim().length > 0,
    save: async (value) => {
      const res = await structureApi.updateActivity(activity.id, {
        name: value.name.trim(),
        description: value.description.trim() || null,
        processType: value.processType,
        groupId: value.groupId || null,
        expectedUpdatedAt: updatedAtRef.current,
      })
      updatedAtRef.current = res.activity.updatedAt
      onSaved()
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
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`activity-edit-desc-${activity.id}`}>شرح فعالیت (اختیاری)</Label>
          <Textarea
            id={`activity-edit-desc-${activity.id}`}
            value={form.description}
            onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))}
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
              <SelectTrigger aria-label="نوع رویداد فرایندی">
                <SelectValue />
              </SelectTrigger>
              <SelectContent dir="rtl">
                {PROCESS_TYPES.map((pt) => (
                  <SelectItem key={pt} value={pt}>
                    <ProcessSymbol type={pt} size="sm" /> {processLabelOf(pt)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-1">
              <Label>گروه فعالیت (طبقه‌بندی)</Label>
              <HelpDot label="گروه فعالیت" content={GROUP_ASSIGN_HELP} />
            </div>
            <Select
              value={form.groupId || NO_GROUP}
              onValueChange={(v) => setForm((s) => ({ ...s, groupId: v === NO_GROUP ? '' : v }))}
              disabled={groupsLoading}
            >
              <SelectTrigger aria-label="گروه فعالیت">
                <SelectValue />
              </SelectTrigger>
              <SelectContent dir="rtl">
                <SelectItem value={NO_GROUP}>بدون گروه</SelectItem>
                {groups.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {groupsError && (
              <p className="text-xs leading-5 text-red">
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

// ═══════════════════════════════════════════════════════════
// دیالوگ ویرایش عنصر کاری — با الونس‌های سطح عنصر (§۶)
// ═══════════════════════════════════════════════════════════

function ElementEditDialog({
  projectId,
  element,
  onClose,
  onSaved,
}: {
  projectId: string
  element: ElementDto
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState<ElementFormState>(() => ({
    name: element.name,
    description: element.description ?? '',
  }))
  const updatedAtRef = useRef(element.updatedAt)

  const { status, lastError, retry } = useAutosave<ElementFormState>({
    data: form,
    ready: form.name.trim().length > 0,
    save: async (value) => {
      const res = await structureApi.updateElement(element.id, {
        name: value.name.trim(),
        description: value.description.trim() || null,
        expectedUpdatedAt: updatedAtRef.current,
      })
      updatedAtRef.current = res.element.updatedAt
      onSaved()
    },
  })

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent dir="rtl" className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>ویرایش عنصر کاری</DialogTitle>
          <DialogDescription>
            مشخصات به‌صورت خودکار ذخیره می‌شوند؛ الونس‌های اختصاصی این عنصر در بخش پایین.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-1">
              <Label htmlFor={`element-edit-name-${element.id}`}>نام عنصر کاری</Label>
              <HelpDot label="نام عنصر کاری" content={ELEMENT_NAME_HELP} />
            </div>
            <Input
              id={`element-edit-name-${element.id}`}
              value={form.name}
              onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
              placeholder="مثلاً: برداشتن قطعه از گراناق"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`element-edit-desc-${element.id}`}>شرح عنصر (اختیاری)</Label>
            <Textarea
              id={`element-edit-desc-${element.id}`}
              value={form.description}
              onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))}
              placeholder="مثلاً: برداشت با دو دست و قراردادن روی میز کار"
              className="min-h-16"
            />
          </div>
          {/* الونس‌ها و زمان‌های مجاز — سطح عنصر کاری (§۶) */}
          <AllowanceSection projectId={projectId} scopeType="WORK_ELEMENT" scopeId={element.id} compact />

          {/* عناصر موازی و اطلاعات هم‌پوشانی — جلسه ۲ §۴.۱ */}
          <ParallelRelationsSection
            projectId={projectId}
            elementId={element.id}
            elementName={element.name}
            compact
          />
        </div>
        <DialogFooter className="flex-row justify-between gap-2">
          <SaveIndicator status={status} onRetry={retry} error={lastError} />
          <Button variant="outline" onClick={onClose}>
            بستن
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
