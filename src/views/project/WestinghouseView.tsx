'use client'

// ═══════════════════════════════════════════════════════════
// نمای ارزیابی وستینگهاوس — FR-13
// • زبانه «ارزیابی عناصر»: ماتریس ایستگاه→فعالیت→عناصر با
//   دیالوگ ارزیابی (چهار عامل + پیش‌نمایش زنده R + کپی از
//   عنصر مشابه) — ارزیابی برای عنصر یک‌بار ثبت و به تمام
//   مشاهدات همان عنصر از همه اپراتورها اعمال می‌شود
// • زبانه «جدول‌های مرجع»: جدول‌های نسخه‌دار + ویرایش درجه‌ها
//   در پیش‌نویس محلی + «ذخیره به‌عنوان نسخه جدید» برای حفظ
//   سابقه محاسباتی — جدول جاری هرگز بی‌صدا تغییر نمی‌کند
// • جدول Seed صرفاً نقطه شروع است و باید توسط کارشناس/رویه
//   شرکت تأیید شود — استاندارد جهان‌شمول نیست
// ═══════════════════════════════════════════════════════════
import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ChevronDown, CopyPlus, Factory, Gauge, Loader2, Table2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
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
import { HelpDot, type HelpContent } from '@/components/common/HelpDot'
import { ConfirmDeleteDialog, EmptyState } from '@/components/common/Feedback'
import { SaveIndicator } from '@/components/common/SaveIndicator'
import { PersianNumberInput } from '@/components/common/PersianNumberInput'
import { useAutosave } from '@/hooks/use-autosave'
import { ApiError } from '@/lib/api-client'
import {
  ratingApi,
  type RatingGradeDto,
  type RatingMatrixDto,
  type RatingTableDto,
} from '@/lib/api/endpoints'
import { qk } from '@/lib/api/keys'
import {
  ELEMENT_TYPE_LABELS,
  RATING_FACTORS,
  RATING_FACTOR_LABELS,
  type ElementType,
  type RatingFactor,
} from '@/domain/types'
import { computeRatingFactor } from '@/calculation/westinghouse'
import { useAppStore } from '@/store/app-store'
import { useDisplayPrefs } from '@/store/display-store'
import { formatDateTime, formatInt, formatTimeValue } from '@/lib/format'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'

type Prefs = ReturnType<typeof useDisplayPrefs>

type MatrixActivity = RatingMatrixDto['stations'][number]['activities'][number]
type MatrixElement = MatrixActivity['elements'][number]
type MatrixElementRow = MatrixElement & { activityName: string; stationName: string }

/** مقدار «بدون انتخاب» در Selectهای اختیاری — مقدار خالی در Radix مجاز نیست */
const NONE = '__none__'

const NO_TABLES: RatingMatrixDto['tables'] = []

const EMPTY_GRADES: Record<RatingFactor, string | null> = {
  SKILL: null,
  EFFORT: null,
  CONDITIONS: null,
  CONSISTENCY: null,
}

/** رنگ Badge نوع عنصر — MANUAL بنفش (رنگ برند)، MACHINE فیروزه‌ای، WAITING خاکستری، OVERLAP کهربایی */
const ELEMENT_TYPE_BADGE_CLASS: Record<string, string> = {
  MANUAL: 'border-brand/30 bg-brand-soft text-brand',
  MACHINE: 'border-cyan/30 bg-cyan-soft text-cyan',
  WAITING: 'border-border bg-muted text-muted-foreground',
  OVERLAP: 'border-amber/30 bg-amber-soft text-amber',
}

/** راهنمای واقعی هر عامل — FR-13 */
const FACTOR_HELP: Record<RatingFactor, HelpContent> = {
  SKILL: {
    what: 'تسلط و روانی حرکات — میزان مهارت اپراتور در اجرای روان و دقیق عنصر کاری.',
    input: 'درجه‌ای از جدول انتخاب‌شده برگزینید؛ «انتخاب نشده» یعنی سهم صفر.',
    example: 'در جدول Seed: A1 (+۰٫۱۵) تا F2 (−۰٫۲۲)؛ D مرجع با سهم صفر.',
    note: 'جدول Seed صرفاً نقطه شروع است و باید توسط کارشناس تأیید شود.',
  },
  EFFORT: {
    what: 'سرعت و تمرکز نسبت به ریتم معمول — تلاش بیش‌ازحد یا کمتر از تمپوی متعارف همان کار.',
    input: 'درجه‌ای از جدول انتخاب‌شده برگزینید؛ «انتخاب نشده» یعنی سهم صفر.',
    example: 'در جدول Seed: C1 (+۰٫۰۵) تلاش خوب یا E1 (−۰٫۰۴) تلاش کم.',
    note: 'جدول Seed صرفاً نقطه شروع است و باید توسط کارشناس تأیید شود.',
  },
  CONDITIONS: {
    what: 'وضعیت محیط کار — نور، صدا، دما، تهویه، نظم و دسترسی به ابزار در ایستگاه.',
    input: 'درجه‌ای از جدول انتخاب‌شده برگزینید؛ «انتخاب نشده» یعنی سهم صفر.',
    example: 'در جدول Seed: B (+۰٫۰۴) اندکی بهتر از متوسط یا E (−۰٫۰۳) نامطلوب.',
    note: 'جدول Seed صرفاً نقطه شروع است و باید توسط کارشناس تأیید شود.',
  },
  CONSISTENCY: {
    what: 'ثبات زمان‌ها بین چرخه‌ها — هرچه پراکندگی زمان‌های ثبت‌شده کمتر باشد، یکنواختی بالاتر است.',
    input: 'درجه‌ای از جدول انتخاب‌شده برگزینید؛ «انتخاب نشده» یعنی سهم صفر.',
    example: 'در جدول Seed: C (+۰٫۰۱) عملکرد پیوسته یا E (−۰٫۰۲) نوسان محسوس.',
    note: 'جدول Seed صرفاً نقطه شروع است و باید توسط کارشناس تأیید شود.',
  },
}

/** نمایش مقدار درجه با علامت ± و دو رقم اعشار */
function formatSigned(v: number | null | undefined, prefs: Prefs): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—'
  if (Math.abs(v) < 1e-9) return formatTimeValue(0, prefs, 2)
  return (v > 0 ? '+' : '−') + formatTimeValue(Math.abs(v), prefs, 2)
}

function ElementTypeBadge({ type }: { type: string }) {
  return (
    <Badge variant="outline" className={ELEMENT_TYPE_BADGE_CLASS[type] ?? ''}>
      {ELEMENT_TYPE_LABELS[type as ElementType] ?? type}
    </Badge>
  )
}

export default function WestinghouseView({ projectId }: { projectId: string }) {
  const prefs = useDisplayPrefs()
  const isMobile = useIsMobile()
  const qc = useQueryClient()
  const navigate = useAppStore((s) => s.navigate)

  const [tab, setTab] = useState<'assess' | 'tables'>('assess')

  // ── داده‌ها ──
  const matrixQ = useQuery({
    queryKey: qk.ratingMatrix(projectId),
    queryFn: () => ratingApi.matrix(projectId),
  })
  const tablesQ = useQuery({
    queryKey: qk.ratingTables(projectId),
    queryFn: () => ratingApi.tables(projectId),
  })

  const matrix = matrixQ.data
  const tables = tablesQ.data?.items ?? []

  // همه عناصر پروژه (تخت) برای شمارش کل و «کپی از عنصر مشابه»
  const allElements = useMemo<MatrixElementRow[]>(() => {
    const out: MatrixElementRow[] = []
    for (const s of matrix?.stations ?? []) {
      for (const a of s.activities) {
        for (const e of a.elements) {
          out.push({ ...e, activityName: a.name, stationName: s.name })
        }
      }
    }
    return out
  }, [matrix])
  const ratedCount = allElements.filter((e) => e.rating !== null).length
  const pct = allElements.length === 0 ? 0 : Math.round((ratedCount / allElements.length) * 100)

  // ── دیالوگ ارزیابی ──
  const [dialogEl, setDialogEl] = useState<MatrixElementRow | null>(null)
  const candidateSources = useMemo(
    () =>
      allElements
        .filter((e) => e.rating !== null && e.id !== dialogEl?.id)
        .map((e) => ({ id: e.id, label: `${e.activityName} ← ${e.name}` })),
    [allElements, dialogEl?.id]
  )

  // ── انتخاب جدول مرجع در زبانه جدول‌ها — انتخاب مؤثر در render محاسبه می‌شود ──
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null)
  const effectiveSelectedTableId =
    selectedTableId && tables.some((t) => t.id === selectedTableId)
      ? selectedTableId
      : (tables.find((t) => t.isDefault) ?? tables[0])?.id ?? null
  const selectedTable = tables.find((t) => t.id === effectiveSelectedTableId) ?? null
  const nextVersion = tables.reduce((m, t) => Math.max(m, t.version), 0) + 1

  // ── حذف جدول — اگر در استفاده باشد سرور 409/RATING_TABLE_IN_USE می‌دهد ──
  const [deletingTable, setDeletingTable] = useState<RatingTableDto | null>(null)
  const deleteTableMutation = useMutation({
    mutationFn: (id: string) => ratingApi.deleteTable(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.ratingTables(projectId) })
      void qc.invalidateQueries({ queryKey: qk.ratingMatrix(projectId) })
      void qc.invalidateQueries({ queryKey: qk.projectSummary(projectId) })
      setDeletingTable(null)
      toast.success('جدول ارزیابی حذف شد')
    },
    onError: (err) => {
      if (err instanceof ApiError && err.code === 'RATING_TABLE_IN_USE') {
        // پیام فارسی و گویای سرور عیناً نمایش داده می‌شود
        toast.error(err.message)
        return
      }
      toast.error(err instanceof Error ? err.message : 'حذف جدول ناموفق بود')
    },
  })

  return (
    <div className="animate-view-in mx-auto max-w-6xl space-y-5">
      {/* سربرگ بخش */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="chip-icon bg-brand-soft text-brand">
            <Gauge className="size-6" aria-hidden />
          </div>
          <div>
            <h1 className="text-xl font-extrabold">ارزیابی وستینگهاوس</h1>
            <p className="num text-xs text-muted-foreground">
              R = 1 + مهارت + تلاش + شرایط + یکنواختی — {formatInt(ratedCount, prefs)} از{' '}
              {formatInt(allElements.length, prefs)} عنصر ارزیابی شده
            </p>
          </div>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as 'assess' | 'tables')} dir="rtl">
        <TabsList>
          <TabsTrigger value="assess">ارزیابی عناصر</TabsTrigger>
          <TabsTrigger value="tables">جدول‌های مرجع</TabsTrigger>
        </TabsList>

        {/* ═══════════ زبانه ارزیابی عناصر — FR-13 ═══════════ */}
        <TabsContent value="assess" className="space-y-4">
          {matrixQ.isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-28 w-full rounded-xl" />
              ))}
            </div>
          ) : matrixQ.error ? (
            <EmptyState
              title="بارگذاری ماتریس ارزیابی ناموفق بود"
              description={matrixQ.error instanceof Error ? matrixQ.error.message : 'خطای نامشخص'}
              action={
                <Button variant="outline" onClick={() => qc.invalidateQueries({ queryKey: qk.ratingMatrix(projectId) })}>
                  تلاش مجدد
                </Button>
              }
            />
          ) : allElements.length === 0 ? (
            <EmptyState
              icon={<Factory className="size-7" aria-hidden />}
              title="هنوز عنصر کاری برای ارزیابی وجود ندارد"
              description="ابتدا در ساختار تولید فعالیت و عنصر تعریف کنید؛ سپس هر عنصر را با چهار عامل مهارت، تلاش، شرایط و یکنواختی ارزیابی کنید."
              action={
                <Button
                  className="btn-brand gap-1.5 border-0"
                  onClick={() => navigate({ name: 'project', projectId, stage: 'structure' })}
                >
                  رفتن به ساختار تولید
                </Button>
              }
            />
          ) : (
            <>
              {/* خلاصه پیشرفت */}
              <div className="card-premium p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="num text-sm font-bold">
                    {formatInt(ratedCount, prefs)} از {formatInt(allElements.length, prefs)} عنصر ارزیابی شده
                  </p>
                  <div className="flex items-center gap-1.5">
                    <span className="num text-xs text-muted-foreground">{formatInt(pct, prefs)}٪</span>
                    <HelpDot
                      label="ارزیابی وستینگهاوس"
                      content={{
                        what: 'ضریب عملکرد R = 1 + مهارت + تلاش + شرایط + یکنواختی؛ برای هر عنصر یک‌بار ثبت و به تمام مشاهدات همان عنصر از همه اپراتورها اعمال می‌شود (تصمیم مالک محصول).',
                        input: 'برای هر عنصر، جدول مرجع و درجه هر عامل را انتخاب کنید؛ امکان کپی از عنصر مشابه نیز وجود دارد.',
                        example: 'مهارت +۰٫۰۶، تلاش +۰٫۰۲، شرایط ۰ و یکنواختی +۰٫۰۱ ⇒ R = ۱٫۰۹',
                        note: 'جدول Seed صرفاً نقطه شروع نرم‌افزار است و باید توسط کارشناس/رویه شرکت تأیید شود.',
                      }}
                    />
                  </div>
                </div>
                <div
                  className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={pct}
                  aria-label="درصد عناصر ارزیابی‌شده"
                >
                  <div
                    className="h-full rounded-full bg-gradient-to-l from-brand to-brand-2 transition-all duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>

              {/* ماتریس ایستگاه → فعالیت → عناصر */}
              <div className="space-y-4">
                {(matrix?.stations ?? []).map((station) => (
                  <StationSection
                    key={station.id}
                    station={station}
                    prefs={prefs}
                    isMobile={isMobile}
                    onRate={setDialogEl}
                  />
                ))}
              </div>
            </>
          )}
        </TabsContent>

        {/* ═══════════ زبانه جدول‌های مرجع — FR-13 ═══════════ */}
        <TabsContent value="tables" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-1 text-sm font-bold">
              جدول‌های مرجع
              <HelpDot
                label="جدول‌های مرجع"
                content={{
                  what: 'جدول درجه‌های چهار عامل وستینگهاوس؛ هر جدول نام، نسخه، منبع و توضیح دارد و هر ارزیابی به نسخه جدول مورد استفاده ارجاع می‌دهد.',
                  input: 'جدولی را از فهرست انتخاب کنید؛ فراداده قابل ویرایش است و تغییر درجه‌ها فقط با «نسخه جدید» ذخیره می‌شود.',
                  example: 'جدول Seed اولیه از نسخه رایج نظام Westinghouse بارگذاری شده است.',
                  note: 'جدول Seed صرفاً نقطه شروع است و استاندارد جهان‌شمول یا رویه مصوب شرکت نیست؛ تغییر جدول نباید محاسبات تاریخی را بی‌صدا تغییر دهد.',
                }}
              />
            </h2>
            <p className="num text-xs text-muted-foreground">{formatInt(tables.length, prefs)} جدول</p>
          </div>

          {tablesQ.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-24 w-full rounded-xl" />
              ))}
            </div>
          ) : tablesQ.error ? (
            <EmptyState
              title="بارگذاری جدول‌ها ناموفق بود"
              description={tablesQ.error instanceof Error ? tablesQ.error.message : 'خطای نامشخص'}
              action={
                <Button variant="outline" onClick={() => qc.invalidateQueries({ queryKey: qk.ratingTables(projectId) })}>
                  تلاش مجدد
                </Button>
              }
            />
          ) : tables.length === 0 ? (
            <EmptyState
              icon={<Table2 className="size-7" aria-hidden />}
              title="جدول ارزیابی‌ای وجود ندارد"
              description="جدول Seed در زمان ایجاد پروژه بارگذاری می‌شود؛ اگر حذف شده است، از نسخه پشتیبان بازیابی کنید."
            />
          ) : (
            <div className="grid items-start gap-4 lg:grid-cols-5">
              {/* فهرست جدول‌ها */}
              <div
                className="scroll-slim max-h-[28rem] space-y-2 overflow-y-auto pl-1 lg:col-span-2"
                aria-label="فهرست جدول‌های ارزیابی"
              >
                {tables.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSelectedTableId(t.id)}
                    aria-pressed={selectedTableId === t.id}
                    aria-label={`انتخاب جدول ${t.name}`}
                    className={cn(
                      'card-premium w-full p-3 text-right transition-all',
                      selectedTableId === t.id ? 'ring-2 ring-brand' : 'hover:border-brand/40'
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="truncate text-sm font-bold">{t.name}</p>
                      {t.isDefault && (
                        <Badge className="shrink-0 bg-brand-soft text-brand">پیش‌فرض</Badge>
                      )}
                    </div>
                    <p className="mt-1 truncate text-xs text-muted-foreground" title={t.source ?? undefined} dir="auto">
                      {t.source ?? 'بدون منبع'}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <Badge variant="secondary" className="num">
                        نسخه {formatInt(t.version, prefs)}
                      </Badge>
                      <span className="num text-[11px] text-faint">
                        {formatInt(t.gradesCount, prefs)} درجه / {formatInt(t.assessmentsCount, prefs)} ارزیابی
                      </span>
                    </div>
                    <p className="num mt-1 text-[11px] text-faint">{formatDateTime(t.updatedAt, prefs)}</p>
                  </button>
                ))}
              </div>

              {/* جزئیات جدول انتخاب‌شده */}
              <div className="lg:col-span-3">
                {selectedTable && (
                  <TableDetailPanel
                    key={selectedTable.id}
                    table={selectedTable}
                    projectId={projectId}
                    nextVersion={nextVersion}
                    prefs={prefs}
                    isMobile={isMobile}
                    onDelete={() => setDeletingTable(selectedTable)}
                    onCreated={(id) => setSelectedTableId(id)}
                  />
                )}
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* دیالوگ ارزیابی عنصر — هسته FR-13 */}
      <ElementRatingDialog
        element={dialogEl}
        tables={matrix?.tables ?? NO_TABLES}
        defaultTableId={matrix?.defaultTableId ?? null}
        candidateSources={candidateSources}
        projectId={projectId}
        prefs={prefs}
        onClose={() => setDialogEl(null)}
      />

      {/* تأیید حذف جدول — FR-26 */}
      <ConfirmDeleteDialog
        open={deletingTable !== null}
        onOpenChange={(open) => !open && setDeletingTable(null)}
        title="حذف جدول ارزیابی"
        entityName={deletingTable?.name ?? ''}
        dependencies={{
          'ارزیابی ارجاع‌دار به این جدول — در صورت وجود، حذف توسط سرور ممنوع می‌شود تا سابقه محاسباتی حفظ شود':
            deletingTable?.assessmentsCount ?? 0,
        }}
        onConfirm={() => deletingTable && deleteTableMutation.mutate(deletingTable.id)}
        loading={deleteTableMutation.isPending}
      />
    </div>
  )
}

// ═══════════════════════════════════════════════════════════
// بخش ایستگاه — Collapsible باز پیش‌فرض شامل فعالیت‌ها
// ═══════════════════════════════════════════════════════════
function StationSection({
  station,
  prefs,
  isMobile,
  onRate,
}: {
  station: RatingMatrixDto['stations'][number]
  prefs: Prefs
  isMobile: boolean
  onRate: (el: MatrixElementRow) => void
}) {
  const [open, setOpen] = useState(true)
  const allElements = station.activities.flatMap((a) => a.elements)
  const rated = allElements.filter((e) => e.rating !== null).length

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="card-premium overflow-hidden">
      <CollapsibleTrigger
        className="flex w-full items-center justify-between gap-2 border-b bg-surface-2/60 px-4 py-3 text-right transition-colors hover:bg-muted/50"
        aria-label={`ایستگاه ${station.name}`}
      >
        <span className="flex min-w-0 flex-wrap items-center gap-2">
          <Factory className="size-4 shrink-0 text-brand" aria-hidden />
          <span className="truncate font-extrabold">{station.name}</span>
          <span className="num rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
            {formatInt(rated, prefs)}/{formatInt(allElements.length, prefs)} ارزیابی‌شده
          </span>
        </span>
        <ChevronDown
          className={cn('size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')}
          aria-hidden
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        {station.activities.length === 0 ? (
          <p className="px-4 py-3 text-xs text-muted-foreground">فعالیتی در این ایستگاه تعریف نشده است.</p>
        ) : (
          station.activities.map((activity) => (
            <ActivityElements
              key={activity.id}
              activity={activity}
              stationName={station.name}
              prefs={prefs}
              isMobile={isMobile}
              onRate={onRate}
            />
          ))
        )}
      </CollapsibleContent>
    </Collapsible>
  )
}

// ═══════════════════════════════════════════════════════════
// فعالیت در ماتریس — جدول/کارت عناصر با دکمه ارزیابی
// ═══════════════════════════════════════════════════════════
function ActivityElements({
  activity,
  stationName,
  prefs,
  isMobile,
  onRate,
}: {
  activity: MatrixActivity
  stationName: string
  prefs: Prefs
  isMobile: boolean
  onRate: (el: MatrixElementRow) => void
}) {
  const rated = activity.elements.filter((e) => e.rating !== null).length

  return (
    <div className="border-t first:border-t-0">
      <div className="flex flex-wrap items-center justify-between gap-2 bg-surface-2/40 px-4 py-2.5">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h4 className="truncate text-sm font-bold">{activity.name}</h4>
          <span className="num rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
            {formatInt(rated, prefs)}/{formatInt(activity.elements.length, prefs)} ارزیابی‌شده
          </span>
        </div>
      </div>
      {activity.elements.length === 0 ? (
        <p className="px-4 py-3 text-xs text-muted-foreground">عنصر کاری در این فعالیت تعریف نشده است.</p>
      ) : isMobile ? (
        /* کارت موبایل — FR-30 */
        <div className="grid gap-3 p-3 sm:grid-cols-2">
          {activity.elements.map((el) => (
            <ElementCard
              key={el.id}
              el={el}
              prefs={prefs}
              onRate={() => onRate({ ...el, activityName: activity.name, stationName })}
            />
          ))}
        </div>
      ) : (
        /* جدول دسکتاپ */
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-surface-2/70 text-right text-xs text-muted-foreground">
              <th className="px-4 py-2.5 font-bold">عنصر کاری</th>
              <th className="px-4 py-2.5 font-bold">نوع</th>
              <th className="px-4 py-2.5 font-bold">وضعیت ارزیابی</th>
              <th className="px-4 py-2.5" aria-label="عملیات" />
            </tr>
          </thead>
          <tbody>
            {activity.elements.map((el) => (
              <tr key={el.id} className="border-b transition-colors last:border-0 hover:bg-muted/50">
                <td className="px-4 py-2.5 font-medium">{el.name}</td>
                <td className="px-4 py-2.5">
                  <ElementTypeBadge type={el.elementType} />
                </td>
                <td className="px-4 py-2.5">
                  {el.rating ? (
                    <Badge
                      className="num bg-green-soft text-green"
                      title={`${el.rating.ratingTableName} — نسخه ${formatInt(el.rating.ratingTableVersion, prefs)}`}
                    >
                      R = {formatTimeValue(el.rating.totalFactor, prefs)}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-faint">
                      ارزیابی نشده
                    </Badge>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex justify-end">
                    {el.rating ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onRate({ ...el, activityName: activity.name, stationName })}
                        aria-label={`ویرایش ارزیابی عنصر ${el.name}`}
                      >
                        ویرایش ارزیابی
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        className="btn-brand gap-1 border-0"
                        onClick={() => onRate({ ...el, activityName: activity.name, stationName })}
                        aria-label={`ارزیابی عنصر ${el.name}`}
                      >
                        <Gauge className="size-3.5" aria-hidden />
                        ارزیابی
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════
// کارت موبایل عنصر در ماتریس — FR-30
// ═══════════════════════════════════════════════════════════
function ElementCard({
  el,
  prefs,
  onRate,
}: {
  el: MatrixElement
  prefs: Prefs
  onRate: () => void
}) {
  return (
    <div className="rounded-xl border p-3">
      <p className="text-sm font-bold">{el.name}</p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <ElementTypeBadge type={el.elementType} />
        {el.rating ? (
          <Badge
            className="num bg-green-soft text-green"
            title={`${el.rating.ratingTableName} — نسخه ${formatInt(el.rating.ratingTableVersion, prefs)}`}
          >
            R = {formatTimeValue(el.rating.totalFactor, prefs)}
          </Badge>
        ) : (
          <Badge variant="outline" className="text-faint">
            ارزیابی نشده
          </Badge>
        )}
      </div>
      <div className="mt-3">
        {el.rating ? (
          <Button variant="outline" size="sm" onClick={onRate} aria-label={`ویرایش ارزیابی عنصر ${el.name}`}>
            ویرایش ارزیابی
          </Button>
        ) : (
          <Button size="sm" className="btn-brand gap-1 border-0" onClick={onRate} aria-label={`ارزیابی عنصر ${el.name}`}>
            <Gauge className="size-3.5" aria-hidden />
            ارزیابی
          </Button>
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════
// دیالوگ ارزیابی عنصر — FR-13
// جدول + چهار عامل + پیش‌نمایش زنده R + کپی از عنصر مشابه
// ═══════════════════════════════════════════════════════════
interface RatingFormState {
  tableId: string
  grades: Record<RatingFactor, string | null>
  notes: string
  copyFrom: string | null
}

function ElementRatingDialog({
  element,
  tables,
  defaultTableId,
  candidateSources,
  projectId,
  prefs,
  onClose,
}: {
  element: MatrixElementRow | null
  tables: RatingMatrixDto['tables']
  defaultTableId: string | null
  candidateSources: { id: string; label: string }[]
  projectId: string
  prefs: Prefs
  onClose: () => void
}) {
  const qc = useQueryClient()
  const open = element !== null

  // ارزیابی فعلی عنصر — مبنای مقداردهی اولیه فرم
  const ratingQ = useQuery({
    queryKey: qk.elementRating(open ? element.id : 'none'),
    queryFn: () => ratingApi.elementRating(element!.id),
    enabled: open,
  })

  const [edits, setEdits] = useState<RatingFormState | null>(null)

  const close = () => {
    setEdits(null)
    onClose()
  }

  // فرم مؤثر: ویرایش‌های کاربر روی مقدار اولیه مشتق‌شده از ارزیابی فعلی — بدون effect
  const a = ratingQ.data?.assessment ?? null
  const baseForm: RatingFormState = {
    tableId: a?.ratingTableId ?? defaultTableId ?? tables[0]?.id ?? '',
    grades: {
      SKILL: a?.skillGrade ?? null,
      EFFORT: a?.effortGrade ?? null,
      CONDITIONS: a?.conditionsGrade ?? null,
      CONSISTENCY: a?.consistencyGrade ?? null,
    },
    notes: a?.notes ?? '',
    copyFrom: null,
  }
  const form: RatingFormState | null = edits ?? (element ? baseForm : null)
  const updateForm = (next: RatingFormState) => setEdits(next)

  // درجه‌های جدول انتخابی — با تغییر جدول بارگذاری می‌شود
  const tableQ = useQuery({
    queryKey: qk.ratingTable(form?.tableId ?? 'none'),
    queryFn: () => ratingApi.table(form!.tableId),
    enabled: open && form !== null && form.tableId !== '',
  })

  // ارزیابی عنصر مبدأ برای پیش‌نمایش زنده کپی
  const sourceQ = useQuery({
    queryKey: qk.elementRating(form?.copyFrom ?? 'none'),
    queryFn: () => ratingApi.elementRating(form!.copyFrom!),
    enabled: open && form !== null && form.copyFrom !== null,
  })

  const gradesByFactor = useMemo(() => {
    const m: Record<RatingFactor, RatingGradeDto[]> = { SKILL: [], EFFORT: [], CONDITIONS: [], CONSISTENCY: [] }
    for (const g of tableQ.data?.grades ?? []) {
      if ((RATING_FACTORS as readonly string[]).includes(g.factor)) m[g.factor as RatingFactor].push(g)
    }
    return m
  }, [tableQ.data])

  // کدهای مؤثر: دستی یا کپی‌شده از عنصر مبدأ
  const effectiveGrades = useMemo((): Record<RatingFactor, string | null> => {
    if (!form) return EMPTY_GRADES
    if (!form.copyFrom) return form.grades
    const a = sourceQ.data?.assessment
    if (!a) return EMPTY_GRADES
    return {
      SKILL: a.skillGrade,
      EFFORT: a.effortGrade,
      CONDITIONS: a.conditionsGrade,
      CONSISTENCY: a.consistencyGrade,
    }
  }, [form, sourceQ.data])

  // مقدار هر عامل از جدول انتخابی (منطق سرور)؛ null = نامعلوم/ناموجود
  const factorValue = (factor: RatingFactor): number | null => {
    if (!form) return null
    if (form.copyFrom && !sourceQ.data?.assessment) return null // در انتظار بارگذاری عنصر مبدأ
    const code = effectiveGrades[factor]
    if (!code) return 0 // انتخاب نشده = صفر
    const g = gradesByFactor[factor].find((x) => x.gradeCode === code)
    return g ? g.value : null // کد در جدول فعلی وجود ندارد
  }

  const values = {
    skill: factorValue('SKILL'),
    effort: factorValue('EFFORT'),
    conditions: factorValue('CONDITIONS'),
    consistency: factorValue('CONSISTENCY'),
  }
  const previewR =
    values.skill === null || values.effort === null || values.conditions === null || values.consistency === null
      ? null
      : computeRatingFactor({
          skill: values.skill,
          effort: values.effort,
          conditions: values.conditions,
          consistency: values.consistency,
        })

  // عامل‌هایی که درجه انتخاب‌شده‌شان در جدول فعلی وجود ندارد — ثبت قطعاً خطا می‌خورد
  const missingFactors = tableQ.data
    ? (RATING_FACTORS as readonly RatingFactor[]).filter((f) => {
        const code = effectiveGrades[f]
        return !!code && !gradesByFactor[f].some((g) => g.gradeCode === code)
      })
    : []

  const saveMutation = useMutation({
    // شناسه عنصر در نتیجه بازگردانده می‌شود تا هنگام callback معتبر بماند
    mutationFn: async () => {
      const elId = element!.id
      const f = form!
      const res = await ratingApi.putElementRating(elId, {
        ratingTableId: f.tableId,
        skillGrade: f.grades.SKILL,
        effortGrade: f.grades.EFFORT,
        conditionsGrade: f.grades.CONDITIONS,
        consistencyGrade: f.grades.CONSISTENCY,
        notes: f.notes.trim() || null,
        copyFromElementId: f.copyFrom,
      })
      return { res, elId }
    },
    onSuccess: ({ res, elId }) => {
      void qc.invalidateQueries({ queryKey: qk.ratingMatrix(projectId) })
      void qc.invalidateQueries({ queryKey: qk.structure(projectId) })
      void qc.invalidateQueries({ queryKey: qk.elementRating(elId) })
      void qc.invalidateQueries({ queryKey: qk.projectSummary(projectId) })
      toast.success(`ارزیابی ثبت شد — R = ${formatTimeValue(res.assessment?.totalFactor ?? null, prefs)}`)
      close()
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'ثبت ارزیابی ناموفق بود'),
  })

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent dir="rtl" className="scroll-slim max-h-[88vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-1.5">
            ارزیابی عنصر «{element?.name ?? ''}»
            <HelpDot
              label="سیاست ارزیابی"
              content={{
                what: 'برای هر عنصر کاری یک ارزیابی با چهار عامل مهارت، تلاش، شرایط و یکنواختی ثبت می‌شود.',
                note: 'ارزیابی برای عنصر یک‌بار ثبت و به تمام مشاهدات همان عنصر از همه اپراتورها اعمال می‌شود (تصمیم مالک محصول)؛ سیستم ارزیابی جداگانه اپراتوری جعل نمی‌کند.',
              }}
            />
          </DialogTitle>
          <DialogDescription>
            {element ? `${element.stationName} › ${element.activityName} — ` : ''}
            درجه هر عامل را از جدول مرجع انتخاب کنید؛ ضریب R به‌صورت زنده پیش‌نمایش می‌شود.
          </DialogDescription>
        </DialogHeader>

        {ratingQ.error ? (
          <EmptyState
            className="py-6"
            title="بارگذاری ارزیابی فعلی ناموفق بود"
            description={ratingQ.error instanceof Error ? ratingQ.error.message : 'خطای نامشخص'}
            action={
              <Button
                variant="outline"
                onClick={() => element && qc.invalidateQueries({ queryKey: qk.elementRating(element.id) })}
              >
                تلاش مجدد
              </Button>
            }
          />
        ) : form === null || ratingQ.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* جدول ارزیابی */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-1">
                <Label>جدول ارزیابی</Label>
                <HelpDot
                  label="جدول ارزیابی"
                  content={{
                    what: 'جدول مرجعی که کد و مقدار درجه‌های چهار عامل از آن خوانده می‌شود؛ هر ارزیابی به نسخه جدول مورد استفاده ارجاع دارد.',
                    note: 'با تغییر جدول، درجه‌ها از جدول جدید خوانده می‌شوند؛ جدول Seed صرفاً نقطه شروع است و باید توسط کارشناس/رویه شرکت تأیید شود.',
                  }}
                />
              </div>
              <Select
                value={form.tableId}
                onValueChange={(v) => {
                  updateForm({ ...form, tableId: v })
                }}
              >
                <SelectTrigger className="w-full" aria-label="جدول ارزیابی">
                  <SelectValue placeholder="جدول را انتخاب کنید" />
                </SelectTrigger>
                <SelectContent>
                  {tables.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      <span className="num">
                        {t.name} (نسخه {formatInt(t.version, prefs)}){t.isDefault ? ' — پیش‌فرض' : ''}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {tables.length === 0 && (
                <p className="text-xs text-amber">
                  جدول ارزیابی‌ای وجود ندارد؛ ابتدا وضعیت زبانه «جدول‌های مرجع» را بررسی کنید.
                </p>
              )}
            </div>

            {/* کپی از عنصر مشابه — FR-13 */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-1">
                <Label>کپی از عنصر مشابه</Label>
                <HelpDot
                  label="کپی از عنصر مشابه"
                  content={{
                    what: 'درجه‌های چهار عامل یک عنصر دیگرِ همین پروژه را عیناً به این عنصر کپی می‌کند؛ برای عناصر تکراری مشابه.',
                    input: 'یک عنصر دارای ارزیابی انتخاب کنید، یا حالت «انتخاب دستی درجه‌ها» را نگه دارید.',
                    note: 'مقدار درجه‌ها از جدول انتخابی بالا خوانده می‌شود؛ اگر جدول کدی را نداشته باشد، ثبت با خطا مواجه می‌شود.',
                  }}
                />
              </div>
              <Select
                value={form.copyFrom ?? NONE}
                onValueChange={(v) => {
                  updateForm({ ...form, copyFrom: v === NONE ? null : v })
                }}
              >
                <SelectTrigger className="w-full" aria-label="کپی ارزیابی از عنصر مشابه">
                  <SelectValue placeholder="انتخاب دستی درجه‌ها" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>— انتخاب دستی درجه‌ها —</SelectItem>
                  {candidateSources.map((src) => (
                    <SelectItem key={src.id} value={src.id}>
                      <span className="text-xs">{src.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.copyFrom && (
                <p className="rounded-lg bg-cyan-soft p-2 text-xs leading-5 text-cyan">
                  هنگام ذخیره، درجه‌ها از عنصر انتخاب‌شده کپی می‌شوند و انتخاب‌های دستی بالا نادیده گرفته می‌شوند؛ برای ویرایش
                  دستی، گزینه «انتخاب دستی درجه‌ها» را برگزینید.
                </p>
              )}
              {candidateSources.length === 0 && !form.copyFrom && (
                <p className="text-xs text-faint">
                  هنوز عنصر ارزیابی‌شده‌ای در این پروژه وجود ندارد؛ اولین ارزیابی را دستی ثبت کنید.
                </p>
              )}
            </div>

            {/* چهار عامل */}
            <div className="grid gap-3 sm:grid-cols-2">
              {RATING_FACTORS.map((factor) => (
                <div key={factor} className="space-y-1.5">
                  <div className="flex items-center gap-1">
                    <Label>{RATING_FACTOR_LABELS[factor]}</Label>
                    <HelpDot label={RATING_FACTOR_LABELS[factor]} content={FACTOR_HELP[factor]} />
                  </div>
                  <Select
                    value={effectiveGrades[factor] ?? NONE}
                    onValueChange={(v) => {
                      updateForm({ ...form, grades: { ...form.grades, [factor]: v === NONE ? null : v } })
                    }}
                    disabled={form.copyFrom !== null || tableQ.isLoading}
                  >
                    <SelectTrigger className="w-full" aria-label={`درجه ${RATING_FACTOR_LABELS[factor]}`}>
                      <SelectValue placeholder={`درجه ${RATING_FACTOR_LABELS[factor]}`} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>— انتخاب نشده (صفر)</SelectItem>
                      {gradesByFactor[factor].map((g) => (
                        <SelectItem key={g.id} value={g.gradeCode}>
                          <span className="num">
                            {g.gradeCode} — {g.label} ({formatSigned(g.value, prefs)})
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>

            {/* هشدار درجه ناموجود در جدول */}
            {missingFactors.length > 0 && (
              <p className="rounded-lg bg-amber-soft p-2 text-xs leading-5 text-amber" role="alert">
                درجه انتخاب‌شده برای {missingFactors.map((f) => RATING_FACTOR_LABELS[f]).join('، ')} در جدول فعلی وجود
                ندارد؛ درجه را مجدداً انتخاب کنید یا جدول را عوض کنید.
              </p>
            )}

            {/* پیش‌نمایش زنده R — محاسبه کلاینت؛ مقدار نهایی ملاک، پاسخ سرور است */}
            <div className="rounded-xl border border-brand/30 bg-brand-soft/50 p-3" aria-live="polite">
              <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm leading-7">
                <span className="font-bold text-brand">پیش‌نمایش زنده:</span>
                <span className="num">
                  R = ۱ + (مهارت {formatSigned(values.skill, prefs)}) + (تلاش {formatSigned(values.effort, prefs)}) +
                  (شرایط {formatSigned(values.conditions, prefs)}) + (یکنواختی{' '}
                  {formatSigned(values.consistency, prefs)}) ={' '}
                  <span className="text-base font-extrabold text-brand">
                    {previewR === null ? '—' : formatTimeValue(previewR, prefs, 2)}
                  </span>
                </span>
              </p>
              <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                مقادیر از درجه‌های انتخابی جدول خوانده می‌شوند؛ «انتخاب نشده» یعنی سهم صفر. مقدار نهایی پس از ذخیره توسط
                سرور محاسبه و ملاک است.
              </p>
            </div>

            {/* یادداشت */}
            <div className="space-y-1.5">
              <Label htmlFor="rating-notes">یادداشت (اختیاری)</Label>
              <Textarea
                id="rating-notes"
                value={form.notes}
                onChange={(e) => {
                  updateForm({ ...form, notes: e.target.value })
                }}
                placeholder="مثلاً: مبنا مشاهده سه چرخه در شیفت صبح"
                className="min-h-16"
              />
            </div>
          </div>
        )}

        <DialogFooter className="flex-row justify-between gap-2 sm:justify-end">
          <Button variant="outline" onClick={close}>
            انصراف
          </Button>
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || form === null || form.tableId === '' || missingFactors.length > 0}
            className="btn-brand border-0"
          >
            {saveMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Gauge className="size-4" aria-hidden />
            )}
            ثبت ارزیابی
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ═══════════════════════════════════════════════════════════
// پنل جزئیات جدول مرجع — فراداده autosave + ویرایش درجه‌ها
// در پیش‌نویس محلی + «ذخیره به‌عنوان نسخه جدید» — FR-13
// ═══════════════════════════════════════════════════════════
function TableDetailPanel({
  table,
  projectId,
  nextVersion,
  prefs,
  isMobile,
  onDelete,
  onCreated,
}: {
  table: RatingTableDto
  projectId: string
  nextVersion: number
  prefs: Prefs
  isMobile: boolean
  onDelete: () => void
  onCreated: (tableId: string) => void
}) {
  const qc = useQueryClient()

  const detailQ = useQuery({
    queryKey: qk.ratingTable(table.id),
    queryFn: () => ratingApi.table(table.id),
  })

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: qk.ratingTables(projectId) })
    void qc.invalidateQueries({ queryKey: qk.ratingMatrix(projectId) })
    void qc.invalidateQueries({ queryKey: qk.ratingTable(table.id) })
  }

  // ── فراداده با ذخیره خودکار (کنترل هم‌زمانی expectedUpdatedAt) ──
  const updatedAtRef = useRef(table.updatedAt)
  const [meta, setMeta] = useState({ name: table.name, source: table.source ?? '', notes: table.notes ?? '' })
  const { status: metaStatus, retry: metaRetry } = useAutosave({
    data: meta,
    ready: true,
    save: async (v) => {
      if (!v.name.trim()) return // نام خالی معتبر نیست؛ تا تکمیل نام ذخیره نمی‌شود
      const res = await ratingApi.updateTable(table.id, {
        name: v.name.trim(),
        source: v.source.trim() || null,
        notes: v.notes.trim() || null,
        expectedUpdatedAt: updatedAtRef.current,
      })
      updatedAtRef.current = res.table.updatedAt
      invalidate()
    },
  })

  // ── پیش‌فرض پروژه ──
  const [switchingDefault, setSwitchingDefault] = useState(false)
  const setDefault = async (next: boolean) => {
    setSwitchingDefault(true)
    try {
      const res = await ratingApi.updateTable(table.id, { isDefault: next, expectedUpdatedAt: updatedAtRef.current })
      updatedAtRef.current = res.table.updatedAt
      invalidate()
      toast.success(
        next ? `«${table.name}» جدول پیش‌فرض پروژه شد` : `پیش‌فرض بودن «${table.name}» برداشته شد`
      )
    } catch (err) {
      invalidate()
      toast.error(err instanceof Error ? err.message : 'تغییر جدول پیش‌فرض ناموفق بود')
    } finally {
      setSwitchingDefault(false)
    }
  }

  // ── ویرایش محلی درجه‌ها — پیش‌نویس؛ ذخیره فقط از طریق نسخه جدید ──
  const [draft, setDraft] = useState<RatingGradeDto[] | null>(null)
  useEffect(() => {
    const d = detailQ.data
    if (!d) return
    setDraft((prev) => {
      if (prev === null) return [...d.grades]
      const byId = new Map(prev.map((g) => [g.id, g]))
      return d.grades.map((g) => byId.get(g.id) ?? g)
    })
  }, [detailQ.data])

  const serverGrades = detailQ.data?.grades ?? []
  const dirtyCount =
    draft?.reduce((n, g) => {
      const sv = serverGrades.find((x) => x.id === g.id)
      const same = sv && sv.label === g.label && sv.value === g.value && (sv.hint ?? '') === (g.hint ?? '')
      return n + (same ? 0 : 1)
    }, 0) ?? 0

  const updateGrade = (id: string, patch: Partial<Pick<RatingGradeDto, 'label' | 'value' | 'hint'>>) => {
    setDraft((prev) => prev?.map((g) => (g.id === id ? { ...g, ...patch } : g)) ?? prev)
  }

  // ── ذخیره به‌عنوان نسخه جدید — حفظ سابقه محاسباتی ──
  const [versioning, setVersioning] = useState(false)
  const saveNewVersion = async () => {
    if (!draft || draft.length === 0) return
    const invalid = draft.find((g) => !g.gradeCode.trim() || !g.label.trim())
    if (invalid) {
      toast.error(`کد و برچسب درجه «${invalid.gradeCode || invalid.label || '؟'}» نمی‌تواند خالی باشد`)
      return
    }
    setVersioning(true)
    try {
      const res = await ratingApi.createTable(projectId, {
        name: `${meta.name.trim() || table.name} — نسخه ${nextVersion}`,
        source: meta.source.trim() || null,
        notes: meta.notes.trim() || null,
        baseOnTableId: table.id,
        grades: draft.map((g) => ({
          factor: g.factor,
          gradeCode: g.gradeCode.trim(),
          label: g.label.trim(),
          value: g.value,
          hint: g.hint?.trim() || null,
          sortOrder: g.sortOrder,
        })),
        makeDefault: true,
      })
      void qc.invalidateQueries({ queryKey: qk.ratingTables(projectId) })
      void qc.invalidateQueries({ queryKey: qk.ratingMatrix(projectId) })
      void qc.invalidateQueries({ queryKey: qk.projectSummary(projectId) })
      toast.success('نسخه جدید ساخته شد؛ ارزیابی‌های قبلی به نسخه پیشین ارجاع دارند')
      onCreated(res.table.id)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'ساخت نسخه جدید ناموفق بود')
    } finally {
      setVersioning(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* سربرگ جدول — نام + منبع کامل + شمارنده‌ها */}
      <div className="card-premium p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="flex flex-wrap items-center gap-2 font-extrabold">
              <Table2 className="size-4 text-brand" aria-hidden />
              <span className="truncate">{meta.name || table.name}</span>
              <Badge variant="secondary" className="num">
                نسخه {formatInt(table.version, prefs)}
              </Badge>
              {table.isDefault && <Badge className="bg-brand-soft text-brand">پیش‌فرض</Badge>}
            </h3>
            <p className="mt-1.5 text-xs leading-5 text-muted-foreground" dir="auto">
              منبع: {meta.source || 'ثبت نشده'}
            </p>
            <p className="num mt-1 text-xs text-faint">
              {formatInt(table.gradesCount, prefs)} درجه · {formatInt(table.assessmentsCount, prefs)} ارزیابی ·{' '}
              {formatDateTime(table.updatedAt, prefs)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <SaveIndicator status={metaStatus} onRetry={metaRetry} />
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-red hover:text-red"
              onClick={onDelete}
              aria-label={`حذف جدول ${table.name}`}
            >
              <Trash2 className="size-4" aria-hidden />
            </Button>
          </div>
        </div>
      </div>

      {/* تأکید Seed — FR-13 */}
      <div className="rounded-xl border border-amber/30 bg-amber-soft/60 p-3 text-xs leading-6" role="note">
        <p className="text-amber">
          ⚠️ این جدول Seed صرفاً نقطه شروع نرم‌افزار است؛ پیش از استفاده عملی توسط کارشناس/رویه شرکت تأیید شود (منبع
          ثبت‌شده: {meta.source || 'ثبت نشده'}).
        </p>
      </div>

      {/* فراداده — ذخیره خودکار */}
      <div className="card-premium p-4">
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor={`rt-name-${table.id}`}>نام جدول</Label>
            <Input
              id={`rt-name-${table.id}`}
              value={meta.name}
              onChange={(e) => setMeta((s) => ({ ...s, name: e.target.value }))}
              aria-label="نام جدول"
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-1">
              <Label htmlFor={`rt-source-${table.id}`}>منبع</Label>
              <HelpDot
                label="منبع جدول"
                content={{
                  what: 'مرجع یا رویه‌ای که مقادیر درجه‌ها از آن گرفته شده است.',
                  input: 'نام کتاب، استاندارد یا رویه داخلی شرکت.',
                  example: '«نسخه رایج نظام Westinghouse — بارگذاری‌شده به‌عنوان Seed نرم‌افزار».',
                  note: 'ذکر دقیق منبع برای پاسخ‌گویی در بررسی‌های کیفی ضروری است؛ جدول Seed صرفاً نقطه شروع است.',
                }}
              />
            </div>
            <Textarea
              id={`rt-source-${table.id}`}
              value={meta.source}
              onChange={(e) => setMeta((s) => ({ ...s, source: e.target.value }))}
              className="min-h-14"
              dir="auto"
              aria-label="منبع جدول"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`rt-notes-${table.id}`}>یادداشت</Label>
            <Textarea
              id={`rt-notes-${table.id}`}
              value={meta.notes}
              onChange={(e) => setMeta((s) => ({ ...s, notes: e.target.value }))}
              className="min-h-14"
              aria-label="یادداشت جدول"
            />
          </div>
          <div className="flex items-center justify-between rounded-xl bg-surface-2/70 p-3">
            <div>
              <Label htmlFor={`rt-default-${table.id}`} className="text-sm">
                پیش‌فرض پروژه
              </Label>
              <p className="mt-0.5 text-xs text-muted-foreground">جدول پیش‌فرض هنگام ارزیابی جدید پیشنهاد می‌شود.</p>
            </div>
            <Switch
              id={`rt-default-${table.id}`}
              checked={table.isDefault}
              onCheckedChange={setDefault}
              disabled={switchingDefault}
              aria-label="جدول پیش‌فرض پروژه"
            />
          </div>
        </div>
      </div>

      {/* درجه‌ها بر اساس عامل — پیش‌نویس محلی */}
      {detailQ.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-xl" />
          ))}
        </div>
      ) : detailQ.error ? (
        <EmptyState
          className="py-6"
          title="بارگذاری درجه‌ها ناموفق بود"
          description={detailQ.error instanceof Error ? detailQ.error.message : 'خطای نامشخص'}
          action={
            <Button variant="outline" onClick={() => qc.invalidateQueries({ queryKey: qk.ratingTable(table.id) })}>
              تلاش مجدد
            </Button>
          }
        />
      ) : draft === null ? null : (
        <>
          {dirtyCount > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber/40 bg-amber-soft/70 p-3 text-xs">
              <p className="text-amber">
                <b className="num">{formatInt(dirtyCount, prefs)}</b> درجه ویرایش شده و هنوز ذخیره نشده است؛ تغییرات فقط با
                ساخت «نسخه جدید» اعمال می‌شوند.
              </p>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-amber hover:text-amber"
                onClick={() => setDraft([...serverGrades])}
              >
                بازگردانی تغییرات
              </Button>
            </div>
          )}

          {RATING_FACTORS.map((factor) => {
            const rows = draft.filter((g) => g.factor === factor)
            if (rows.length === 0) return null
            return (
              <section key={factor} className="card-premium overflow-hidden">
                <div className="border-b bg-surface-2/70 px-4 py-2.5">
                  <h4 className="text-sm font-bold">{RATING_FACTOR_LABELS[factor]}</h4>
                </div>
                {isMobile ? (
                  /* کارت موبایل — FR-30 */
                  <div className="space-y-3 p-3">
                    {rows.map((g) => (
                      <GradeCard key={g.id} grade={g} onChange={(patch) => updateGrade(g.id, patch)} />
                    ))}
                  </div>
                ) : (
                  /* جدول دسکتاپ */
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-surface-2/70 text-right text-xs text-muted-foreground">
                        <th className="w-20 px-3 py-2 font-bold">کد</th>
                        <th className="w-48 px-3 py-2 font-bold">برچسب</th>
                        <th className="w-28 px-3 py-2 font-bold">مقدار (±)</th>
                        <th className="px-3 py-2 font-bold">راهنما</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((g) => (
                        <tr key={g.id} className="border-b last:border-0">
                          <td className="px-3 py-2">
                            <span className="font-mono font-bold" dir="ltr">
                              {g.gradeCode}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <Input
                              value={g.label}
                              onChange={(e) => updateGrade(g.id, { label: e.target.value })}
                              className="h-8"
                              aria-label={`برچسب درجه ${g.gradeCode}`}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <PersianNumberInput
                              value={g.value}
                              onChange={(v) => updateGrade(g.id, { value: v ?? 0 })}
                              min={-0.5}
                              max={0.5}
                              className="h-8"
                              title={`مقدار امتیاز: ${formatSigned(g.value, prefs)}`}
                              aria-label={`مقدار درجه ${g.gradeCode}`}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <Input
                              value={g.hint ?? ''}
                              onChange={(e) => updateGrade(g.id, { hint: e.target.value })}
                              className="h-8"
                              aria-label={`راهنمای درجه ${g.gradeCode}`}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>
            )
          })}

          {/* نوار عملیات چسبان پایین — نسخه جدید */}
          <div className="sticky bottom-0 z-10 rounded-xl border bg-card/95 p-3 shadow-lg backdrop-blur">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <p className="text-xs leading-6 text-muted-foreground">
                  به‌جای تغییر جدول جاری، نسخه جدید بسازید تا محاسبات تاریخی بی‌صدا تغییر نکند.
                </p>
                <p className="num text-[11px] leading-5 text-faint">
                  نام نسخه جدید: «{meta.name.trim() || table.name} — نسخه {formatInt(nextVersion, prefs)}» · نسخه جدید
                  به‌صورت خودکار پیش‌فرض پروژه می‌شود.
                </p>
              </div>
              <Button
                onClick={saveNewVersion}
                disabled={versioning || draft.length === 0}
                className="btn-brand shrink-0 gap-1.5 border-0"
              >
                {versioning ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <CopyPlus className="size-4" aria-hidden />
                )}
                ذخیره به‌عنوان نسخه جدید
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════
// کارت موبایل درجه — FR-30
// ═══════════════════════════════════════════════════════════
function GradeCard({
  grade,
  onChange,
}: {
  grade: RatingGradeDto
  onChange: (patch: Partial<Pick<RatingGradeDto, 'label' | 'value' | 'hint'>>) => void
}) {
  return (
    <div className="rounded-xl border p-3">
      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <p className="text-[11px] font-bold text-muted-foreground">کد</p>
          <p className="mt-1 font-mono font-bold" dir="ltr">
            {grade.gradeCode}
          </p>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`gc-val-${grade.id}`} className="text-[11px]">
            مقدار (±)
          </Label>
          <PersianNumberInput
            id={`gc-val-${grade.id}`}
            value={grade.value}
            onChange={(v) => onChange({ value: v ?? 0 })}
            min={-0.5}
            max={0.5}
            aria-label={`مقدار درجه ${grade.gradeCode}`}
          />
        </div>
        <div className="col-span-2 space-y-1">
          <Label htmlFor={`gc-label-${grade.id}`} className="text-[11px]">
            برچسب
          </Label>
          <Input
            id={`gc-label-${grade.id}`}
            value={grade.label}
            onChange={(e) => onChange({ label: e.target.value })}
            aria-label={`برچسب درجه ${grade.gradeCode}`}
          />
        </div>
        <div className="col-span-2 space-y-1">
          <Label htmlFor={`gc-hint-${grade.id}`} className="text-[11px]">
            راهنما
          </Label>
          <Input
            id={`gc-hint-${grade.id}`}
            value={grade.hint ?? ''}
            onChange={(e) => onChange({ hint: e.target.value })}
            aria-label={`راهنمای درجه ${grade.gradeCode}`}
          />
        </div>
      </div>
    </div>
  )
}
