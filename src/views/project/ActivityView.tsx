'use client'

// ═══════════════════════════════════════════════════════════
// صفحه اختصاصی فعالیت — FR-03 (چهار زبانه)
// ۱. مشخصات: فرم ذخیره خودکار (expectedUpdatedAt) + مجازهای
//    مؤثر (FR-04: ارث گروه + بازنویسی با debounce) + عملیات
// ۲. عناصر کاری: SortableList با D&D، ویرایش autosave، حذف
//    با شمارش وابستگی‌ها (FR-26)
// ۳. زمان‌سنجی و ۴. تحلیل نتایج: برگهٔ زمان‌سنجی و تحلیل کامل همان فعالیت
// سربرگ: بازگشت + مسیر (ساختار ← ایستگاه ← فعالیت) + نوع
// فرایندی + وضعیت ارزیابی + «اقدام بعدی» — FR-03
// ═══════════════════════════════════════════════════════════
import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  ArrowLeft,
  BarChart3,
  CircleCheck,
  Info,
  Lightbulb,
  ListTree,
  Loader2,
  Pencil,
  Plus,
  Tags,
  Timer,
  Trash2,
  X,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { ConfirmDeleteDialog, EmptyState } from '@/components/common/Feedback'
import { HelpDot } from '@/components/common/HelpDot'
import { PersianNumberInput } from '@/components/common/PersianNumberInput'
import { SaveIndicator } from '@/components/common/SaveIndicator'
import { SortableList } from '@/components/common/SortableList'
import { useAutosave, type SaveStatus } from '@/hooks/use-autosave'
import { useIsMobile } from '@/hooks/use-mobile'
import { api } from '@/lib/api-client'
import {
  allowancesApi,
  structureApi,
  type ActivityDto,
  type ElementDto,
  type GroupDto,
} from '@/lib/api/endpoints'
import { qk } from '@/lib/api/keys'
import {
  ELEMENT_TYPES,
  ELEMENT_TYPE_LABELS,
  PROCESS_TYPES,
  PROCESS_TYPE_LABELS,
  PROCESS_TYPE_SYMBOLS,
  type ElementType,
  type ProcessType,
} from '@/domain/types'
import { useAppStore } from '@/store/app-store'
import { useDisplayPrefs } from '@/store/display-store'
import { formatDate, formatDateTime, formatInt, formatPercent, formatTimeValue } from '@/lib/format'
import { cn } from '@/lib/utils'
import TimingView from './TimingView'
import AnalysisContent from './analysis/AnalysisContent'
import { AllowanceSection } from './allowances/AllowanceSection'

type Prefs = ReturnType<typeof useDisplayPrefs>
type TabKey = 'info' | 'elements' | 'timing' | 'analysis'

/** مقدار Sentinel — Radix Select مقدار رشته خالی قبول نمی‌کند */
const NO_GROUP = 'none'
/** سقف مقدار اعشاری درصد طبق اعتبارسنجی API (۰٫۹۹۹۹ = ۹۹٫۹۹٪) — FR-15 */
const MAX_PERCENT_DECIMAL = 0.9999
/** تأخیر debounce ذخیره بازنویسی مجازها */
const OVERRIDE_DEBOUNCE_MS = 600

interface ActivityInfoFormState {
  name: string
  description: string
  processType: string
  groupId: string
  targetSampleCount: number | null
}

interface ElementFormState {
  name: string
  description: string
  elementType: string
}

const EMPTY_ELEMENT_FORM: ElementFormState = { name: '', description: '', elementType: 'MANUAL' }

/** پاسخ GET /api/elements/{id} — فقط برای شمارش وابستگی‌های حذف */
interface ElementDepsDto {
  counts: { observations: number; hasRating: boolean }
}

const elementDepsKey = (id: string) => ['element-depends', id] as const

// ── نگاشت رنگ Badge نوع عنصر — FR-02 ──
const ELEMENT_TYPE_BADGE: Record<ElementType, string> = {
  MANUAL: 'border-0 bg-brand-soft text-brand',
  MACHINE: 'border-0 bg-cyan-soft text-cyan',
  WAITING: 'border-0 bg-muted text-muted-foreground',
  OVERLAP: 'border-0 bg-amber-soft text-amber',
}

// ── محتوای راهنمای آیکونی — FR-28 / ۷.۵ ──
const TARGET_SAMPLE_HELP = {
  what: 'تعداد نمونه هدف (تعداد چرخه‌هایی که باید از این فعالیت زمان‌گیری شود) در سطح کل فعالیت تعیین می‌شود، نه جداگانه برای هر اپراتور.',
  input: 'عدد صحیح بزرگ‌تر یا مساوی ۱؛ خالی بگذارید تا هدفی تعیین نشده باشد.',
  example: 'مثلاً ۱۵ چرخه برای کل فعالیت — هر اپراتور سهم خود را از همین هدف ثبت می‌کند.',
  note: 'رسیدن به هدف صرفاً به معنای ثبت تعداد هدف است و معادل اثبات کفایت آماری نیست؛ شاخص‌های پراکندگی و عدم‌قطعیت در مرحله «تحلیل نتایج» نمایش داده می‌شوند.',
} as const

const ACTIVITY_NAME_HELP = {
  what: 'فعالیت کار قابل‌تعریف و مستقلی در ایستگاه است که از عناصر کاری تشکیل می‌شود؛ این صفحه اختصاصی همین فعالیت است.',
  input: 'نامی کوتاه و گویا؛ ترجیحاً فعل + مفعول.',
  example: '«بستن درب پنل» یا «کنترل کیفیت نهایی»',
  note: 'نوع رویداد فرایندی در نمودارهای فرایند (فاز ۵) با نماد ASCME نمایش داده می‌شود و روی محاسبات زمان اثری ندارد.',
} as const

const PROCESS_TYPE_HELP = {
  what: 'دسته‌بندی فرایندی فعالیت مطابق استاندارد نمودار فرایند: عملیات ○، بازرسی □، حمل‌ونقل ⇨، تأخیر D و انبارش ▽.',
  input: 'ماهیت غالب فعالیت را انتخاب کنید.',
  example: 'برای کنترل کیفیت «بازرسی» و برای انتقال قطعه «حمل‌ونقل» را انتخاب کنید.',
} as const

const GROUP_ASSIGN_HELP = {
  what: 'گروه مجازها مجموعه‌ای از درصدهای مجاز است که فعالیت مقادیر آن را به ارث می‌برد؛ با انتخاب گروه، جدول «مجازهای مؤثر» پایین فعال می‌شود.',
  input: 'گروه مناسب ماهیت فعالیت را انتخاب کنید یا «بدون گروه» بگذارید.',
  example: '«کار دستی سبک»، «کار ماشینی سنگین»',
  note: 'بدون گروه هیچ مجازی اعمال نمی‌شود؛ در همین صفحه می‌توانید پس از انتخاب گروه، مقدار هر دسته را بازنویسی کنید.',
} as const

const ELEMENT_NAME_HELP = {
  what: 'عنصر کاری کوچک‌ترین واحد قابل‌اندازه‌گیری فعالیت است؛ شناسه آن پایدار است و تغییر نام، ارتباط تاریخی و گره‌های نموداری را از بین نمی‌برد.',
  input: 'نامی کوتاه برای بخشی از کار که در یک حرکت اجرا می‌شود.',
  example: '«برداشتن قطعه از گراناق» یا «بستن چهار پیچ»',
  note: 'عناصر با کشیدن‌ورها کردن مرتب می‌شوند؛ ترتیب همان ترتیب اجرای کار در چرخه است.',
} as const

const ELEMENT_TYPE_HELP = {
  what: 'نوع عنصر تعیین می‌کند زمان آن چگونه در محاسبات رفتار می‌کند: دستی، خودکار ماشین، انتظار، یا هم‌زمان/دارای هم‌پوشانی.',
  input: 'ماهیت غالب عنصر را انتخاب کنید؛ پیش‌فرض «دستی» است.',
  example: '«پرس اتوماتیک» → خودکار ماشین؛ «انتظار برای خشک‌شدن رنگ» → انتظار.',
  note: 'عنصر هم‌زمان/دارای هم‌پوشانی برای کار هم‌زمان اپراتور و ماشین است؛ با بازه شروع/پایان ثبت می‌شود (فاز ۳) و زمان سپری‌شده چرخه از گستره بازه‌ها محاسبه می‌شود نه جمع مدت‌ها.',
} as const

// ── کمک‌تابع‌ها ──
function processLabelOf(pt: string): string {
  return PROCESS_TYPE_LABELS[pt as ProcessType] ?? pt
}

function processSymbolOf(pt: string): string {
  return PROCESS_TYPE_SYMBOLS[pt as ProcessType] ?? '○'
}

function elementTypeLabelOf(et: string): string {
  return ELEMENT_TYPE_LABELS[et as ElementType] ?? et
}

function removedCountsText(prefs: Prefs, parts: Array<[string, number]>): string | undefined {
  const segs = parts.filter(([, n]) => n > 0).map(([label, n]) => `${formatInt(n, prefs)} ${label}`)
  return segs.length > 0 ? `${segs.join('، ')} نیز به‌طور دائمی حذف شدند.` : undefined
}

export default function ActivityView({ projectId }: { projectId: string }) {
  const view = useAppStore((s) => s.view)
  if (view.name !== 'activity') return null
  return <ActivityScreen projectId={projectId} activityId={view.activityId} />
}

// ═══════════════════════════════════════════════════════════
// صفحه فعالیت — همه قلاب‌ها به‌صورت بدون‌قید فراخوانی می‌شوند
// ═══════════════════════════════════════════════════════════
function ActivityScreen({ projectId, activityId }: { projectId: string; activityId: string }) {
  const prefs = useDisplayPrefs()
  const isMobile = useIsMobile()
  const qc = useQueryClient()
  const navigate = useAppStore((s) => s.navigate)
  const [tab, setTab] = useState<TabKey>('info')
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)

  // ── داده‌ها ──
  const elementsQ = useQuery({
    queryKey: qk.elements(activityId),
    queryFn: () => structureApi.elements(activityId),
  })
  const stationId = elementsQ.data?.activity.stationId ?? null
  const activityName = elementsQ.data?.activity.name ?? ''

  // نام ایستگاه والد برای مسیر — از درخت ساختار (FR-03)
  const treeQ = useQuery({
    queryKey: qk.structure(projectId),
    queryFn: () => structureApi.tree(projectId),
  })

  // مشخصات کامل فعالیت (شامل _count.sessions و updatedAt تازه)
  const actsQ = useQuery({
    queryKey: qk.activities(stationId ?? 'none'),
    queryFn: () => structureApi.activities(stationId!),
    enabled: stationId !== null,
  })

  const groupsQ = useQuery({
    queryKey: qk.groups(projectId),
    queryFn: () => allowancesApi.groups(projectId),
  })
  const groups = groupsQ.data?.items ?? []

  const stationName = useMemo(
    () => treeQ.data?.stations.find((s) => s.id === stationId)?.name ?? null,
    [treeQ.data, stationId]
  )
  const treeActivity = useMemo(
    () => treeQ.data?.stations.flatMap((s) => s.activities).find((a) => a.id === activityId) ?? null,
    [treeQ.data, activityId]
  )
  const activity = useMemo(
    () => actsQ.data?.items.find((a) => a.id === activityId) ?? treeActivity,
    [actsQ.data, treeActivity, activityId]
  )

  const elements = elementsQ.data?.elements ?? []
  const ratedCount = elements.filter((e) => e.rating != null).length

  // ── بی‌اعتبارسازی کش ──
  const invalidateActivityScope = () => {
    void qc.invalidateQueries({ queryKey: qk.structure(projectId) })
    void qc.invalidateQueries({ queryKey: ['activities'] })
    void qc.invalidateQueries({ queryKey: ['elements'] })
    void qc.invalidateQueries({ queryKey: qk.groups(projectId) })
    void qc.invalidateQueries({ queryKey: ['scope-allowances'] })
    void qc.invalidateQueries({ queryKey: qk.projectSummary(projectId) })
    void qc.invalidateQueries({ queryKey: qk.projects() })
    void qc.invalidateQueries({ queryKey: qk.ratingMatrix(projectId) })
  }

  // ── حذف فعالیت — پس از موفقیت به ساختار بازمی‌گردیم ──
  const deleteActivityMutation = useMutation({
    mutationFn: () => structureApi.deleteActivity(activityId),
    onSuccess: (res) => {
      invalidateActivityScope()
      toast.success(`فعالیت «${activityName}» به‌طور دائمی حذف شد`, {
        description: removedCountsText(prefs, [
          ['عنصر کاری', res.removedCounts.elements],
          ['جلسه زمان‌سنجی', res.removedCounts.sessions],
          ['مشاهده', res.removedCounts.observations],
        ]),
      })
      setConfirmDeleteOpen(false)
      navigate({ name: 'project', projectId, stage: 'structure' })
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'حذف فعالیت ناموفق بود'),
  })

  const goBack = () => navigate({ name: 'project', projectId, stage: 'structure' })

  // ── بارگذاری / خطای کل صفحه ──
  if (elementsQ.isLoading) {
    return (
      <div className="animate-view-in mx-auto max-w-5xl space-y-4">
        <div className="flex items-center gap-2">
          <Skeleton className="size-9 rounded-lg" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-8 w-full rounded-xl" />
        <Skeleton className="h-72 w-full rounded-2xl" />
        <Skeleton className="h-48 w-full rounded-2xl" />
      </div>
    )
  }

  if (elementsQ.isError) {
    return (
      <div className="animate-view-in mx-auto max-w-3xl">
        <EmptyState
          title="بارگذاری فعالیت ناموفق بود"
          description={elementsQ.error instanceof Error ? elementsQ.error.message : 'خطای نامشخص'}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="outline" onClick={goBack}>
                بازگشت به ساختار
              </Button>
              <Button variant="outline" onClick={() => qc.invalidateQueries({ queryKey: qk.elements(activityId) })}>
                تلاش مجدد
              </Button>
            </div>
          }
        />
      </div>
    )
  }

  return (
    <div className="animate-view-in mx-auto max-w-5xl space-y-4">
      {/* سربرگ: بازگشت + مسیر + نوع فرایندی + وضعیت + اقدام بعدی — FR-03 */}
      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="icon" className="shrink-0" onClick={goBack} aria-label="بازگشت به ساختار تولید">
            <ArrowLeft className="size-4" aria-hidden />
          </Button>
          <nav aria-label="مسیر فعالیت" className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
            ساختار ←{' '}
            {treeQ.isLoading ? (
              <Skeleton className="inline-block h-3 w-16 align-middle" />
            ) : (
              stationName ?? '—'
            )}{' '}
            ← <span className="font-bold text-foreground">{activityName}</span>
          </nav>
          {activity ? (
            <Badge
              className="shrink-0 border-0 bg-brand-soft text-brand"
              title={`نوع رویداد فرایندی: ${processLabelOf(activity.processType)}`}
            >
              <span className="num font-bold">{processSymbolOf(activity.processType)}</span>
              {processLabelOf(activity.processType)}
            </Badge>
          ) : (
            <Skeleton className="h-6 w-24 shrink-0 rounded-full" />
          )}
        </div>

        <p className="num text-xs text-muted-foreground">
          وضعیت: {formatInt(ratedCount, prefs)} از {formatInt(elements.length, prefs)} عنصر ارزیابی‌شده
        </p>

        {/* اقدام بعدی */}
        {elements.length === 0 ? (
          <div className="flex flex-wrap items-center gap-2 rounded-xl bg-amber-soft/70 px-3 py-2 text-xs">
            <Lightbulb className="size-4 shrink-0 text-amber" aria-hidden />
            <span className="font-bold text-amber">اقدام بعدی:</span>
            <Button
              variant="link"
              size="sm"
              className="h-auto gap-1 p-0 text-xs font-bold text-amber underline-offset-4"
              onClick={() => setTab('elements')}
            >
              اولین عنصر کاری را در زبانه «عناصر کاری» اضافه کنید
            </Button>
          </div>
        ) : ratedCount < elements.length ? (
          <div className="flex flex-wrap items-center gap-2 rounded-xl bg-amber-soft/70 px-3 py-2 text-xs">
            <Lightbulb className="size-4 shrink-0 text-amber" aria-hidden />
            <span className="font-bold text-amber">اقدام بعدی:</span>
            <Button
              variant="link"
              size="sm"
              className="h-auto gap-1 p-0 text-xs font-bold text-amber underline-offset-4"
              onClick={() => navigate({ name: 'project', projectId, stage: 'westinghouse' })}
            >
              تکمیل ارزیابی وستینگهاوس
            </Button>
            <span className="num text-muted-foreground">
              ({formatInt(elements.length - ratedCount, prefs)} عنصر بدون ارزیابی)
            </span>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2 rounded-xl bg-green-soft/70 px-3 py-2 text-xs">
            <CircleCheck className="size-4 shrink-0 text-green" aria-hidden />
            <span className="font-bold text-green">همه عناصر این فعالیت ارزیابی شده‌اند.</span>
            <span className="text-muted-foreground">
              ثبت مشاهدات در مرحله «زمان‌سنجی» (فاز ۳) انجام می‌شود.
            </span>
          </div>
        )}
      </header>

      {/* زبانه‌های چهارگانه — FR-03 */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)} dir="rtl" className="gap-4">
        <TabsList className="scroll-slim sticky top-14 z-30 flex h-auto w-full justify-start gap-1 overflow-x-auto rounded-xl border border-border/60 bg-background/95 p-1 shadow-sm backdrop-blur">
          <TabsTrigger value="info" className="shrink-0 gap-1.5 px-3 text-xs sm:px-4 sm:text-sm">
            <Info aria-hidden />
            مشخصات
          </TabsTrigger>
          <TabsTrigger value="elements" className="shrink-0 gap-1.5 px-3 text-xs sm:px-4 sm:text-sm">
            <ListTree aria-hidden />
            عناصر کاری
          </TabsTrigger>
          <TabsTrigger value="timing" className="shrink-0 gap-1.5 px-3 text-xs sm:px-4 sm:text-sm">
            <Timer aria-hidden />
            زمان‌سنجی
          </TabsTrigger>
          <TabsTrigger value="analysis" className="shrink-0 gap-1.5 px-3 text-xs sm:px-4 sm:text-sm">
            <BarChart3 aria-hidden />
            تحلیل نتایج
          </TabsTrigger>
        </TabsList>

        {/* ۱. مشخصات */}
        <TabsContent value="info" className="space-y-5">
          {activity ? (
            <ActivityInfoForm
              key={activity.id}
              activity={activity}
              groups={groups}
              groupsLoading={groupsQ.isLoading}
              groupsError={groupsQ.isError}
              prefs={prefs}
              onSaved={invalidateActivityScope}
            />
          ) : actsQ.isError && treeActivity === null ? (
            <EmptyState
              title="بارگذاری مشخصات فعالیت ناموفق بود"
              description={actsQ.error instanceof Error ? actsQ.error.message : 'خطای نامشخص'}
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  <Button
                    variant="outline"
                    onClick={() => qc.invalidateQueries({ queryKey: ['activities'] })}
                  >
                    تلاش مجدد
                  </Button>
                  <Button variant="outline" onClick={() => qc.invalidateQueries({ queryKey: qk.structure(projectId) })}>
                    تازه‌سازی درخت ساختار
                  </Button>
                </div>
              }
            />
          ) : (
            <div className="card-premium space-y-4 p-5">
              <Skeleton className="h-5 w-36" />
              <Skeleton className="h-10 w-full rounded-lg" />
              <Skeleton className="h-20 w-full rounded-lg" />
              <div className="grid gap-4 sm:grid-cols-2">
                <Skeleton className="h-10 rounded-lg" />
                <Skeleton className="h-10 rounded-lg" />
              </div>
              <Skeleton className="h-10 w-40 rounded-lg" />
            </div>
          )}

          {/* الونس‌ها و زمان‌های مجاز — جلسه اول (§۶) */}
          <AllowanceSection projectId={projectId} scopeType="ACTIVITY" scopeId={activityId} />

          {/* عملیات */}
          <section className="card-premium p-5" aria-label="عملیات فعالیت">
            <h3 className="text-sm font-extrabold text-red">عملیات</h3>
            <p className="mt-2 text-xs leading-6 text-muted-foreground">
              حذف فعالیت دائمی است و همه عناصر کاری، مشاهدات و جلسات زمان‌سنجی آن را نیز حذف می‌کند. پیش از
              تأیید، شمارش داده‌های وابسته نمایش داده می‌شود و پس از حذف به مرحله «ساختار تولید» بازمی‌گردید.
            </p>
            <Button
              variant="outline"
              className="mt-3 gap-1.5 text-red hover:text-red"
              onClick={() => setConfirmDeleteOpen(true)}
            >
              <Trash2 className="size-4" aria-hidden />
              حذف این فعالیت
            </Button>
          </section>
        </TabsContent>

        {/* ۲. عناصر کاری — FR-02 */}
        <TabsContent value="elements">
          <ElementsSection
            projectId={projectId}
            activityId={activityId}
            stationId={stationId}
            elements={elements}
            prefs={prefs}
            isMobile={isMobile}
          />
        </TabsContent>

        {/* ۳. زمان‌سنجی — فاز ۳ فعال: برگهٔ چرخه‌محور این فعالیت */}
        <TabsContent value="timing">
          <TimingView projectId={projectId} initialActivityId={activityId} />
        </TabsContent>

        {/* ۴. تحلیل نتایج — فاز ۴: آمار، وستینگهاوس، مجازها و مقایسهٔ اپراتورها */}
        <TabsContent value="analysis">
          <AnalysisContent activityId={activityId} />
        </TabsContent>
      </Tabs>

      {/* تأیید حذف دائمی فعالیت — FR-26 */}
      <ConfirmDeleteDialog
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        title="حذف دائمی فعالیت"
        entityName={activityName}
        dependencies={{
          'عنصر کاری': elements.length,
          'جلسه زمان‌سنجی': activity?._count?.sessions ?? 0,
        }}
        onConfirm={() => deleteActivityMutation.mutate()}
        loading={deleteActivityMutation.isPending}
      />
    </div>
  )
}

// ═══════════════════════════════════════════════════════════
// فرم مشخصات فعالیت — ذخیره خودکار با expectedUpdatedAt
// ═══════════════════════════════════════════════════════════
function ActivityInfoForm({
  activity,
  groups,
  groupsLoading,
  groupsError,
  prefs,
  onSaved,
}: {
  activity: ActivityDto
  groups: GroupDto[]
  groupsLoading: boolean
  groupsError: boolean
  prefs: Prefs
  onSaved: () => void
}) {
  const [form, setForm] = useState<ActivityInfoFormState>(() => ({
    name: activity.name,
    description: activity.description ?? '',
    processType: activity.processType,
    groupId: activity.groupId ?? '',
    targetSampleCount: activity.targetSampleCount,
  }))
  const updatedAtRef = useRef(activity.updatedAt)

  const { status, lastError, retry } = useAutosave<ActivityInfoFormState>({
    data: form,
    ready: true,
    save: async (value) => {
      const res = await structureApi.updateActivity(activity.id, {
        name: value.name.trim(),
        description: value.description.trim() || null,
        processType: value.processType,
        groupId: value.groupId || null,
        targetSampleCount: value.targetSampleCount,
        expectedUpdatedAt: updatedAtRef.current,
      })
      updatedAtRef.current = res.activity.updatedAt
      onSaved()
    },
  })

  return (
    <section className="card-premium p-5" aria-label="مشخصات فعالیت">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-extrabold">مشخصات فعالیت</h3>
          <p className="text-xs text-muted-foreground">تغییرات به‌صورت خودکار ذخیره می‌شوند.</p>
        </div>
        <SaveIndicator status={status} onRetry={retry} error={lastError} />
      </div>

      <div className="mt-4 space-y-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-1">
            <Label htmlFor={`act-name-${activity.id}`}>نام فعالیت</Label>
            <HelpDot label="نام فعالیت" content={ACTIVITY_NAME_HELP} />
          </div>
          <Input
            id={`act-name-${activity.id}`}
            value={form.name}
            onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
            placeholder="مثلاً: بستن درب پنل"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`act-desc-${activity.id}`}>شرح فعالیت (اختیاری)</Label>
          <Textarea
            id={`act-desc-${activity.id}`}
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

        {/* تعداد نمونه هدف — FR-12 */}
        <div className="space-y-1.5 sm:max-w-60">
          <div className="flex items-center gap-1">
            <Label htmlFor={`act-sample-${activity.id}`}>تعداد نمونه هدف</Label>
            <HelpDot label="تعداد نمونه هدف" content={TARGET_SAMPLE_HELP} />
          </div>
          <PersianNumberInput
            id={`act-sample-${activity.id}`}
            value={form.targetSampleCount}
            onChange={(v) => setForm((s) => ({ ...s, targetSampleCount: v }))}
            decimals={false}
            min={1}
            max={10000}
            suffix="چرخه"
            aria-label="تعداد نمونه هدف"
          />
          <p className="text-[11px] leading-5 text-faint">
            هدف در سطح کل فعالیت تعیین می‌شود، نه هر اپراتور.
          </p>
        </div>
      </div>

      <p className="num mt-3 text-[11px] text-faint">
        ایجاد: {formatDate(activity.createdAt, prefs)} · آخرین تغییر: {formatDateTime(activity.updatedAt, prefs)}
      </p>
    </section>
  )
}

// ═══════════════════════════════════════════════════════════
function ElementsSection({
  projectId,
  activityId,
  stationId,
  elements,
  prefs,
  isMobile,
}: {
  projectId: string
  activityId: string
  stationId: string | null
  elements: ElementDto[]
  prefs: Prefs
  isMobile: boolean
}) {
  const qc = useQueryClient()

  const [createOpen, setCreateOpen] = useState(false)
  const [createForm, setCreateForm] = useState<ElementFormState>(EMPTY_ELEMENT_FORM)
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<ElementDto | null>(null)
  const [deleting, setDeleting] = useState<ElementDto | null>(null)

  // شمارش وابستگی‌های حذف — GET /api/elements/{id} (فقط هنگام باز شدن دیالوگ)
  const depsQ = useQuery({
    queryKey: elementDepsKey(deleting?.id ?? 'none'),
    queryFn: () => api.get<ElementDepsDto>(`/api/elements/${deleting!.id}`),
    enabled: deleting !== null,
  })

  const invalidateElements = () => {
    void qc.invalidateQueries({ queryKey: qk.elements(activityId) })
    void qc.invalidateQueries({ queryKey: qk.structure(projectId) })
    if (stationId) void qc.invalidateQueries({ queryKey: qk.activities(stationId) })
    void qc.invalidateQueries({ queryKey: qk.projectSummary(projectId) })
    void qc.invalidateQueries({ queryKey: qk.projects() })
    void qc.invalidateQueries({ queryKey: qk.ratingMatrix(projectId) })
  }

  const createMutation = useMutation({
    mutationFn: () =>
      structureApi.createElement(activityId, {
        name: createForm.name.trim(),
        description: createForm.description.trim() || null,
        elementType: createForm.elementType,
      }),
    onSuccess: () => {
      invalidateElements()
      toast.success('عنصر کاری ثبت شد')
      setCreateOpen(false)
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'ثبت عنصر کاری ناموفق بود'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => structureApi.deleteElement(id),
    onSuccess: (res, id) => {
      invalidateElements()
      const el = elements.find((e) => e.id === id)
      const parts: Array<[string, number]> = [['مشاهده', res.removedCounts.observations]]
      if (res.removedCounts.hasRating) parts.push(['ارزیابی وستینگهاوس', 1])
      toast.success(`عنصر «${el?.name ?? ''}» به‌طور دائمی حذف شد`, {
        description: removedCountsText(prefs, parts),
      })
      setDeleting(null)
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'حذف عنصر کاری ناموفق بود'),
  })

  const reorderMutation = useMutation({
    mutationFn: (ids: string[]) => structureApi.reorderElements(activityId, ids),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.elements(activityId) })
      void qc.invalidateQueries({ queryKey: qk.structure(projectId) })
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'تغییر ترتیب عناصر ناموفق بود')
      void qc.invalidateQueries({ queryKey: qk.elements(activityId) }) // بازگشت به ترتیب سرور
    },
  })

  // جابه‌جایی خوش‌بینانه: کش بلافاصله به‌روز می‌شود و سرور تأیید می‌کند
  const handleReorder = (ids: string[]) => {
    qc.setQueryData<{ activity: { id: string; name: string }; elements: ElementDto[] }>(
      qk.elements(activityId),
      (old) => {
        if (!old) return old
        return {
          ...old,
          elements: ids.flatMap((id) => {
            const e = old.elements.find((x) => x.id === id)
            return e ? [e] : []
          }),
        }
      }
    )
    reorderMutation.mutate(ids)
  }

  const submitCreate = async () => {
    if (!createForm.name.trim()) {
      toast.error('نام عنصر کاری الزامی است')
      return
    }
    setCreating(true)
    try {
      await createMutation.mutateAsync()
    } finally {
      setCreating(false)
    }
  }

  const openCreate = () => {
    setCreateForm(EMPTY_ELEMENT_FORM)
    setCreateOpen(true)
  }

  // وابستگی‌های دیالوگ حذف — FR-26
  const deleteDeps: Record<string, number> = {}
  const counts = depsQ.data?.counts
  if (counts && counts.observations > 0) deleteDeps['مشاهده'] = counts.observations
  if (counts?.hasRating) deleteDeps['ارزیابی وستینگهاوس این عنصر'] = 1

  return (
    <section className="space-y-3" aria-label="عناصر کاری فعالیت">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-extrabold">
          <ListTree className="size-4 text-brand" aria-hidden />
          عناصر کاری
          <Badge variant="secondary" className="num border-0 bg-surface-2">
            {formatInt(elements.length, prefs)}
          </Badge>
          <HelpDot label="عناصر کاری" content={ELEMENT_TYPE_HELP} />
        </h3>
        <Button onClick={openCreate} className="btn-brand gap-1.5 border-0">
          <Plus className="size-4" aria-hidden />
          عنصر جدید
        </Button>
      </div>

      {elements.length === 0 ? (
        <EmptyState
          icon={<ListTree className="size-7" aria-hidden />}
          title="هنوز عنصر کاری ثبت نشده است"
          description="هر چرخه فعالیت از عناصر کاری تشکیل می‌شود؛ برای زمان‌سنجی (فاز ۳) حداقل به یک عنصر نیاز دارید. نوع عنصر (دستی، خودکار ماشین، انتظار، هم‌زمان) را می‌توانید بعداً نیز تغییر دهید."
          action={
            <Button onClick={openCreate} className="btn-brand gap-1.5 border-0">
              <Plus className="size-4" aria-hidden />
              ثبت اولین عنصر کاری
            </Button>
          }
        />
      ) : (
        <SortableList
          items={elements}
          onReorder={handleReorder}
          handleClassName="rounded-s-xl"
          renderItem={(element, index) => (
            <ElementRow
              element={element}
              index={index}
              prefs={prefs}
              isMobile={isMobile}
              onEdit={() => setEditing(element)}
              onDelete={() => setDeleting(element)}
            />
          )}
        />
      )}

      {/* دیالوگ ایجاد عنصر کاری */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent dir="rtl" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>عنصر کاری جدید</DialogTitle>
            <DialogDescription>
              عنصر در انتهای فهرست افزوده می‌شود و با کشیدن‌ورها کردن قابل جابه‌جایی است.
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
                value={createForm.name}
                onChange={(e) => setCreateForm((s) => ({ ...s, name: e.target.value }))}
                placeholder="مثلاً: برداشتن قطعه از گراناق"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="element-create-desc">شرح عنصر (اختیاری)</Label>
              <Textarea
                id="element-create-desc"
                value={createForm.description}
                onChange={(e) => setCreateForm((s) => ({ ...s, description: e.target.value }))}
                placeholder="مثلاً: برداشت با دو دست و قراردادن روی میز کار"
                className="min-h-16"
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-1">
                <Label>نوع عنصر کاری</Label>
                <HelpDot label="نوع عنصر کاری" content={ELEMENT_TYPE_HELP} />
              </div>
              <Select
                value={createForm.elementType}
                onValueChange={(v) => setCreateForm((s) => ({ ...s, elementType: v }))}
              >
                <SelectTrigger className="w-full" aria-label="نوع عنصر کاری">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ELEMENT_TYPES.map((et) => (
                    <SelectItem key={et} value={et}>
                      {ELEMENT_TYPE_LABELS[et]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              انصراف
            </Button>
            <Button onClick={submitCreate} disabled={creating} className="btn-brand border-0">
              {creating ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Plus className="size-4" aria-hidden />}
              ثبت عنصر
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* دیالوگ ویرایش عنصر — ذخیره خودکار + الونس‌های عنصر (§۶) */}
      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent dir="rtl" className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
          {editing ? (
            <ElementEditForm
              key={editing.id}
              element={editing}
              projectId={projectId}
              onClose={() => setEditing(null)}
              onSaved={invalidateElements}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      {/* تأیید حذف دائمی عنصر — FR-26 */}
      <ConfirmDeleteDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="حذف دائمی عنصر کاری"
        entityName={deleting?.name ?? ''}
        dependencies={deleteDeps}
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
        loading={deleteMutation.isPending}
      />
    </section>
  )
}

// ── ردیف عنصر کاری — دسکتاپ: ردیف فشرده / موبایل: کارت ──
function ElementRow({
  element,
  index,
  prefs,
  isMobile,
  onEdit,
  onDelete,
}: {
  element: ElementDto
  index: number
  prefs: Prefs
  isMobile: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  const typeLabel = elementTypeLabelOf(element.elementType)

  const typeBadge = (
    <Badge
      className={cn('shrink-0', ELEMENT_TYPE_BADGE[element.elementType as ElementType] ?? '')}
      title={`نوع عنصر: ${typeLabel}`}
    >
      {typeLabel}
    </Badge>
  )

  const ratingBadge = element.rating ? (
    <Badge className="num border-0 bg-green-soft text-green" dir="ltr" title="ضریب ارزیابی وستینگهاوس">
      R = {formatTimeValue(element.rating.totalFactor, prefs)}
    </Badge>
  ) : (
    <Badge variant="outline" className="shrink-0 text-faint">
      ارزیابی نشده
    </Badge>
  )

  const actions = (
    <div className="flex shrink-0 gap-1">
      <Button variant="ghost" size="icon" className="size-8" onClick={onEdit} aria-label={`ویرایش عنصر ${element.name}`}>
        <Pencil className="size-4" aria-hidden />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-8 text-red hover:text-red"
        onClick={onDelete}
        aria-label={`حذف عنصر ${element.name}`}
      >
        <Trash2 className="size-4" aria-hidden />
      </Button>
    </div>
  )

  if (isMobile) {
    return (
      <div className="space-y-2.5 rounded-xl border border-border/60 bg-surface-2/50 py-3 pe-3 ps-9">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            {typeBadge}
            <p className="min-w-0 flex-1 truncate text-sm font-bold">{element.name}</p>
          </div>
          {actions}
        </div>
        {element.description && (
          <p className="line-clamp-2 text-[11px] leading-5 text-faint">{element.description}</p>
        )}
        <div className="flex items-center justify-between">
          {ratingBadge}
          <span className="num text-[11px] text-faint">عنصر {formatInt(index + 1, prefs)}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-border/60 bg-surface-2/50 py-2 pe-1.5 ps-8 transition-colors hover:border-brand/40 hover:bg-brand-soft/30">
      <span className="num w-4 shrink-0 text-[11px] text-faint">{formatInt(index + 1, prefs)}</span>
      {typeBadge}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold">{element.name}</p>
        {element.description && (
          <p className="truncate text-[11px] text-faint" title={element.description}>
            {element.description}
          </p>
        )}
      </div>
      {ratingBadge}
      {actions}
    </div>
  )
}

// ── فرم ویرایش عنصر (داخل دیالوگ) — ذخیره خودکار ──
function ElementEditForm({
  element,
  projectId,
  onClose,
  onSaved,
}: {
  element: ElementDto
  projectId: string
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState<ElementFormState>(() => ({
    name: element.name,
    description: element.description ?? '',
    elementType: element.elementType,
  }))
  const updatedAtRef = useRef(element.updatedAt)

  const { status, lastError, retry } = useAutosave<ElementFormState>({
    data: form,
    ready: true,
    save: async (value) => {
      const res = await structureApi.updateElement(element.id, {
        name: value.name.trim(),
        description: value.description.trim() || null,
        elementType: value.elementType,
        expectedUpdatedAt: updatedAtRef.current,
      })
      updatedAtRef.current = res.element.updatedAt
      onSaved()
    },
  })

  return (
    <>
      <DialogHeader>
        <DialogTitle>ویرایش عنصر کاری</DialogTitle>
        <DialogDescription>تغییرات به‌صورت خودکار ذخیره می‌شوند.</DialogDescription>
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
        <div className="space-y-1.5">
          <div className="flex items-center gap-1">
            <Label>نوع عنصر کاری</Label>
            <HelpDot label="نوع عنصر کاری" content={ELEMENT_TYPE_HELP} />
          </div>
          <Select value={form.elementType} onValueChange={(v) => setForm((s) => ({ ...s, elementType: v }))}>
            <SelectTrigger className="w-full" aria-label="نوع عنصر کاری">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ELEMENT_TYPES.map((et) => (
                <SelectItem key={et} value={et}>
                  {ELEMENT_TYPE_LABELS[et]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] leading-5 text-faint">
            تغییر نوع عنصر بر مدل محاسباتی اثر دارد و وضعیت محاسبات را «نیازمند محاسبه مجدد» می‌کند.
          </p>
        </div>

        {/* الونس‌ها و زمان‌های مجاز — سطح عنصر کاری (§۶) */}
        <AllowanceSection projectId={projectId} scopeType="WORK_ELEMENT" scopeId={element.id} compact />
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
