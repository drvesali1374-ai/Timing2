'use client'

// ═══════════════════════════════════════════════════════════
// محتوای تحلیل نتایج یک فعالیت — فاز ۴
// FR-12 (پیشرفت نمونه)، FR-14/15 (OT/NT/ST)، FR-16 (کل فعالیت)،
// FR-17 (آمار + هیستوگرام/روند)، FR-18 (مرور مشکوک‌ها)،
// FR-19 (مقایسه اپراتورها)
// قاعده نمایش: دادهٔ ناکافی = «قابل محاسبه نیست»، نه صفر — FR-21
// ═══════════════════════════════════════════════════════════
import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Activity as ActivityIcon,
  AlertTriangle,
  Ban,
  BarChart3,
  CheckCircle2,
  Clock,
  FileSpreadsheet,
  FileText,
  FlaskConical,
  Gauge,
  Info,
  Layers,
  LineChart as LineChartIcon,
  RefreshCw,
  RotateCcw,
  Sigma,
  Timer,
  Users,
} from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from 'recharts'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { EmptyState } from '@/components/common/Feedback'
import { HelpDot } from '@/components/common/HelpDot'
import { analysisApi, reportsApi, timingApi, type ElementAnalysisItemDto } from '@/lib/api/endpoints'
import { qk } from '@/lib/api/keys'
import { ELEMENT_TYPE_LABELS, type ElementType } from '@/domain/types'
import { useDisplayPrefs } from '@/store/display-store'
import { useAppStore } from '@/store/app-store'
import { formatDateTime, formatInt, formatPercent, formatTimeValue } from '@/lib/format'
import { cn } from '@/lib/utils'

const NOT_COMPUTABLE = 'قابل محاسبه نیست'

const chartConfig = {
  count: { label: 'فراوانی', color: 'var(--brand)' },
  value: { label: 'مدت (ثانیه)', color: 'var(--brand)' },
} satisfies ChartConfig

/** نقطهٔ روند با رنگ وضعیت (رنگ به‌تنهایی کافی نیست — راهنمای زیر نمودار) */
function TrendDot({ cx, cy, payload }: { cx?: number; cy?: number; payload?: { status?: string } }) {
  if (cx === undefined || cy === undefined) return null
  const color =
    payload?.status === 'SUSPECT' ? 'var(--amber)' : payload?.status === 'EXCLUDED' ? 'var(--red)' : 'var(--brand)'
  return <circle cx={cx} cy={cy} r={3.5} fill={color} />
}

/**
 * عنوان محور افقی — همیشه افقی، زیر تیک‌ها (تیک‌ها تا y+20 می‌رسند؛
 * عنوان با فاصله در y+34). viewBox = نوار محور — §۱۳
 */
function HorizontalAxisTitle({
  viewBox,
  value,
}: {
  viewBox?: { x: number; y: number; width: number; height: number }
  value: string
}) {
  if (!viewBox) return null
  return (
    <text
      x={viewBox.x + viewBox.width / 2}
      y={viewBox.y + 34}
      textAnchor="middle"
      fontSize={10}
      fill="var(--muted-foreground)"
    >
      {value}
    </text>
  )
}

/**
 * عنوان محور عمودی — چرخش ۹۰ درجه (خوانش بالا→پایین، مناسب RTL)؛
 * نزدیک لبهٔ چپ نوار محور تا با اعداد تیک تداخل نکند — §۱۳
 */
function VerticalAxisTitle({
  viewBox,
  value,
}: {
  viewBox?: { x: number; y: number; width: number; height: number }
  value: string
}) {
  if (!viewBox) return null
  const cx = viewBox.x + 9
  const cy = viewBox.y + viewBox.height / 2
  return (
    <text
      x={cx}
      y={cy}
      transform={`rotate(90 ${cx} ${cy})`}
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={10}
      fill="var(--muted-foreground)"
    >
      {value}
    </text>
  )
}

export default function AnalysisContent({ activityId }: { activityId: string }) {
  const prefs = useDisplayPrefs()
  const qc = useQueryClient()
  const navigate = useAppStore((s) => s.navigate)
  const setReportPrefillActivity = useAppStore((s) => s.setReportPrefillActivity)
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null)
  const [excludeTarget, setExcludeTarget] = useState<{ observationId: string; elementName: string; cycleNo: number; value: number | null } | null>(null)
  const [excludeReason, setExcludeReason] = useState('')

  const analysisQuery = useQuery({
    queryKey: qk.activityAnalysis(activityId),
    queryFn: () => analysisApi.forActivity(activityId),
    enabled: Boolean(activityId),
  })

  const refreshMutation = useMutation({
    mutationFn: () => analysisApi.refreshOutliers(activityId),
    onSuccess: (data) => {
      qc.setQueryData(qk.activityAnalysis(activityId), data)
      toast.success(
        data.refreshed > 0
          ? `پرچم‌های غیرعادی بازمحاسبه شد (${data.refreshed} تغییر).`
          : 'پرچم‌های غیرعادی بازمحاسبه شد؛ تغییری لازم نبود.'
      )
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const excludeMutation = useMutation({
    mutationFn: (input: { observationId: string; validityStatus: 'VALID' | 'EXCLUDED'; exclusionReason?: string | null }) =>
      timingApi.setValidity(input.observationId, {
        validityStatus: input.validityStatus,
        ...(input.validityStatus === 'EXCLUDED' ? { exclusionReason: input.exclusionReason ?? null } : {}),
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: qk.activityAnalysis(activityId) })
      toast.success('وضعیت مشاهده به‌روزرسانی شد؛ دادهٔ خام دست‌نخورده باقی مانده است.')
      setExcludeTarget(null)
      setExcludeReason('')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const analysis = analysisQuery.data?.analysis

  const selectedElement = useMemo(() => {
    if (!analysis) return null
    if (!selectedElementId) return analysis.elements[0] ?? null
    return analysis.elements.find((e) => e.id === selectedElementId) ?? analysis.elements[0] ?? null
  }, [analysis, selectedElementId])

  if (analysisQuery.isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-40 rounded-2xl" />
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    )
  }

  if (analysisQuery.isError) {
    return (
      <EmptyState
        icon={<AlertTriangle className="size-7" aria-hidden />}
        title="بارگذاری تحلیل ناموفق بود"
        description={(analysisQuery.error as Error).message}
        action={
          <Button variant="outline" onClick={() => analysisQuery.refetch()}>
            <RefreshCw className="size-4" aria-hidden />
            تلاش مجدد
          </Button>
        }
      />
    )
  }

  if (!analysis) return null

  const suspectCount = analysis.elements.reduce((s, e) => s + e.counts.suspect, 0)
  const excludedCount = analysis.elements.reduce((s, e) => s + e.counts.excluded, 0)
  const calcCount = analysis.elements.reduce((s, e) => s + e.counts.calcBasis, 0)

  // هیستوگرام عنصر منتخب: برچسب بازه‌ای «شروع–پایان» + گام تیک برای حداکثر ~۸ برچسب افقی — §۱۳
  const histDecimals =
    selectedElement?.histogram.some((b) => !Number.isInteger(b.binStart) || !Number.isInteger(b.binEnd)) ? 1 : 0
  const histTickInterval = selectedElement ? Math.max(0, Math.ceil(selectedElement.histogram.length / 8) - 1) : 0
  const histData =
    selectedElement?.histogram.map((b) => ({
      ...b,
      label: `${formatTimeValue(b.binStart, prefs, histDecimals)}–${formatTimeValue(b.binEnd, prefs, histDecimals)}`,
    })) ?? []

  return (
    <div className="space-y-5">
      {/* ── کارت‌های خلاصه ── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          icon={<FlaskConical className="size-5" aria-hidden />}
          title="چرخه‌های معتبر"
          value={
            analysis.sampleProgress.targetSampleCount !== null
              ? `${formatInt(analysis.sampleProgress.validCycles, prefs)} از ${formatInt(analysis.sampleProgress.targetSampleCount, prefs)}`
              : formatInt(analysis.sampleProgress.validCycles, prefs)
          }
          hint={
            analysis.sampleProgress.reached === null
              ? 'هدفی ثبت نشده است'
              : analysis.sampleProgress.reached
                ? 'هدف تعداد نمونه تکمیل شد'
                : 'به هدف نرسیده — شاخص‌های پراکندگی را ببینید'
          }
          tone={analysis.sampleProgress.reached === false ? 'amber' : analysis.sampleProgress.reached === true ? 'green' : 'brand'}
        />
        <SummaryCard
          icon={<Sigma className="size-5" aria-hidden />}
          title="مشاهدات در محاسبات"
          value={formatInt(calcCount, prefs)}
          hint={`معتبر + مشکوک (هشدار ≠ حذف) — مجموع ${formatInt(analysis.elements.reduce((s, e) => s + e.counts.total, 0), prefs)} مشاهده`}
          tone="brand"
        />
        <SummaryCard
          icon={<AlertTriangle className="size-5" aria-hidden />}
          title="نیازمند بازبینی"
          value={formatInt(suspectCount, prefs)}
          hint={suspectCount > 0 ? 'مشاهدهٔ مشکوک — تصمیم نگه‌داشتن یا خروج با شماست' : 'مشاهدهٔ مشکوکی علامت‌گذاری نشده است'}
          tone={suspectCount > 0 ? 'amber' : 'brand'}
        />
        <SummaryCard
          icon={<Clock className="size-5" aria-hidden />}
          title="میانگین زمان سپری‌شدهٔ چرخه"
          value={formatTimeValue(analysis.cycleStats.stats.mean, prefs)}
          hint={
            analysis.cycleStats.count > 0
              ? `از ${formatInt(analysis.cycleStats.count, prefs)} چرخهٔ قابل استفاده (ثانیه)`
              : 'چرخهٔ قابل استفاده‌ای وجود ندارد'
          }
          tone="brand"
        />
      </div>

      {/* ── خروجی سریع این فعالیت — FR-22 ── */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border bg-card p-3">
        <p className="flex items-center gap-1.5 text-sm font-bold">
          <FileText className="size-4 text-brand" aria-hidden />
          خروجی سریع این فعالیت
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() =>
              window.open(reportsApi.excelUrl(analysis.activity.projectId, 'summary', { activityId }))
            }
          >
            <FileSpreadsheet className="size-4" aria-hidden />
            Excel محاسبات
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() =>
              window.open(reportsApi.excelUrl(analysis.activity.projectId, 'raw', { activityId }))
            }
          >
            <FileSpreadsheet className="size-4" aria-hidden />
            Excel داده‌های خام
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => {
              setReportPrefillActivity(activityId)
              navigate({ name: 'project', projectId: analysis.activity.projectId, stage: 'reports' })
            }}
          >
            <FileText className="size-4" aria-hidden />
            گزارش رسمی (PDF)
          </Button>
        </div>
      </div>

      {/* پیام پیشرفت نمونه — FR-12 */}
      <div
        className={cn(
          'flex items-start gap-2 rounded-2xl border p-3 text-sm leading-6',
          analysis.sampleProgress.reached === false
            ? 'border-amber/40 bg-amber-soft text-foreground'
            : 'border-border bg-card text-muted-foreground'
        )}
      >
        {analysis.sampleProgress.reached === false ? (
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber" aria-hidden />
        ) : (
          <Info className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
        )}
        <span>{analysis.sampleProgress.message}</span>
      </div>

      {/* ── روش محاسبه و مجازها ── */}
      <Card className="rounded-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <Gauge className="size-5 text-brand" aria-hidden />
            روش محاسبه و مجازهای مؤثر
            <HelpDot
              label="روش محاسبه چیست؟"
              content={{
                what: 'پارامترهایی که زمان استاندارد هر عنصر را از زمان مشاهده‌شده می‌سازند.',
                input: 'روش اعمال مجاز و روش تجمیع اپراتورها در «مشخصات پروژه ← تنظیمات محاسبات» انتخاب می‌شود؛ مجازها در گروه فعالیت تعریف و در فعالیت قابل بازنویسی‌اند.',
                example: 'با NT=۹٫۰۴۷ ثانیه و A=۱۵٪: روش درصدی ST=۱۰٫۴۰ و روش سهمی ST=۱۰٫۶۴ ثانیه.',
                note: 'در روش «سهم از زمان استاندارد» مجموع مجازها باید کمتر از ۱۰۰٪ باشد وگرنه محاسبه انجام نمی‌شود.',
              }}
            />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl bg-muted/60 p-3">
              <p className="text-xs text-muted-foreground">روش اعمال مجاز</p>
              <p className="mt-1 font-bold">{analysis.settings.allowanceMethodLabel}</p>
            </div>
            <div className="rounded-xl bg-muted/60 p-3">
              <p className="text-xs text-muted-foreground">فرمول زمان استاندارد</p>
              <p dir="ltr" className="mt-1 text-left font-mono font-bold">
                {analysis.settings.formula}
              </p>
            </div>
            <div className="rounded-xl bg-muted/60 p-3">
              <p className="text-xs text-muted-foreground">تجمیع چند اپراتور</p>
              <p className="mt-1 font-bold leading-5">{analysis.settings.aggregationMethodLabel}</p>
            </div>
            <div className="rounded-xl bg-muted/60 p-3">
              <p className="text-xs text-muted-foreground">مجموع مجاز (A)</p>
              <p className="mt-1 font-bold">
                {formatPercent(analysis.allowances.summary.totalPercent, prefs, 2)}
                {analysis.settings.allowanceMethod === 'SHARE_OF_ST' && analysis.allowances.summary.totalPercent >= 1 ? (
                  <span className="mr-2 text-xs font-bold text-red">≥ ۱۰۰٪ — محاسبه ممنوع</span>
                ) : null}
              </p>
            </div>
          </div>
          {analysis.allowances.rows.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {analysis.allowances.rows
                .filter((r) => r.status !== 'EXCLUDED')
                .map((r) => (
                  <Badge key={r.definitionId} variant="outline" className={cn('gap-1', r.status === 'EXCLUDED' && 'opacity-50')}>
                    {r.title}:{' '}
                    {r.valueType === 'PERCENT'
                      ? formatPercent(r.percentValue, prefs, 2)
                      : `${formatTimeValue(r.timeValueSeconds, prefs, 1)}s`}
                    <span className="text-[10px] text-muted-foreground">
                      {r.status === 'CUSTOM'
                        ? '(اختصاصی)'
                        : r.status === 'OVERRIDDEN'
                          ? '(جایگزین‌شده)'
                          : `(${r.sourceScopeLabel ?? ''})`}
                    </span>
                  </Badge>
                ))}
              {analysis.allowances.perCycleTotal > 0 && (
                <Badge variant="outline" className="num gap-1">
                  الونس‌های هر چرخه: {formatTimeValue(analysis.allowances.perCycleTotal, prefs, 1)}s
                  <span className="text-[10px] text-muted-foreground">(یک‌بار در سطح چرخه)</span>
                </Badge>
              )}
              {analysis.allowances.summary.count === 0 && (
                <p className="text-sm text-muted-foreground">هیچ الونس مؤثری ندارد؛ مجموع A صفر است.</p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              الونسی تعریف نشده است؛ در مرحله «مجازها و الونس‌ها» تعریف کنید.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            نسخهٔ فرمول {analysis.settings.formulaVersion} — تشخیص غیرعادی: امتیاز Z تعدیل‌شده (آستانه{' '}
            {formatTimeValue(analysis.settings.outlierThreshold, prefs, 1)})
          </p>
        </CardContent>
      </Card>

      {/* ── جدول نتایج عناصر ── */}
      <Card className="rounded-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <Layers className="size-5 text-brand" aria-hidden />
            نتایج عناصر کاری (OT → NT → ST)
            <HelpDot
              label="جدول نتایج عناصر"
              content={{
                what: 'زمان مشاهده‌شده (OT)، زمان نرمال (NT) و زمان استاندارد (ST) هر عنصر از مشاهدات معتبر محاسبه می‌شود.',
                input: 'مشاهدات معتبر و مشکوک در محاسبات‌اند؛ خارج‌شده و ناقص نیستند. OT با روش تجمیع انتخابی، NT = OT × R و ST طبق فرمول مجاز پروژه.',
                example: 'اگر میانگین مشاهده‌شده ۸٫۳۰ ثانیه و ضریب R=۱٫۰۹ باشد، NT=۹٫۰۴۷ ثانیه.',
                note: '«قابل محاسبه نیست» یعنی داده یا ارزیابی کافی وجود ندارد؛ هرگز صفر گزارش نمی‌شود.',
              }}
            />
          </CardTitle>
        </CardHeader>
        <CardContent>
          {analysis.elements.length === 0 ? (
            <EmptyState
              title="عنصری تعریف نشده است"
              description="ابتدا در زبانهٔ «عناصر کاری» عناصر فعالیت را تعریف کنید."
            />
          ) : (
            <>
              {/* دسکتاپ: جدول — سیاست alignment مشترک «tbl» (هدر/داده کوتاه center، متن بلند right) — §۸.۳ */}
              <div className="hidden overflow-x-auto lg:block">
                <Table className="tbl">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="tbl-text">عنصر</TableHead>
                      <TableHead>نوع</TableHead>
                      <TableHead>در محاسبات</TableHead>
                      <TableHead>مشکوک / خارج</TableHead>
                      <TableHead>OT (ثانیه)</TableHead>
                      <TableHead>R</TableHead>
                      <TableHead>NT (ثانیه)</TableHead>
                      <TableHead>ST (ثانیه)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {analysis.elements.map((el) => (
                      <ElementRow key={el.id} el={el} prefs={prefs} />
                    ))}
                  </TableBody>
                </Table>
              </div>
              {/* موبایل/تبلت: کارت */}
              <div className="space-y-3 lg:hidden">
                {analysis.elements.map((el) => (
                  <div key={el.id} className="rounded-xl border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-bold">{el.name}</p>
                      <Badge variant="outline" className="shrink-0">
                        {ELEMENT_TYPE_LABELS[el.elementType as ElementType] ?? el.elementType}
                      </Badge>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                      <Metric label="در محاسبات" value={formatInt(el.counts.calcBasis, prefs)} />
                      <Metric
                        label="مشکوک / خارج"
                        value={`${formatInt(el.counts.suspect, prefs)} / ${formatInt(el.counts.excluded, prefs)}`}
                      />
                      <Metric label="OT (ثانیه)" value={formatTimeValue(el.ot, prefs)} />
                      <Metric label="R" value={el.rating ? formatTimeValue(el.rating.totalFactor, prefs, 3) : NOT_COMPUTABLE} />
                      <Metric label="NT (ثانیه)" value={formatTimeValue(el.nt, prefs)} />
                      <Metric
                        label="ST (ثانیه)"
                        value={el.stError ? '—' : formatTimeValue(el.st, prefs)}
                        error={el.stError}
                      />
                    </div>
                    {el.stError && <p className="mt-2 text-xs text-red">{el.stError}</p>}
                  </div>
                ))}
              </div>

              {/* کل فعالیت — FR-16 */}
              <div
                className={cn(
                  'mt-4 rounded-xl border p-3 text-sm leading-6',
                  analysis.activityTotal.status === 'OK'
                    ? 'border-green/40 bg-green-soft/60'
                    : analysis.activityTotal.status === 'NEEDS_AGGREGATION_RULE'
                      ? 'border-amber/40 bg-amber-soft'
                      : 'border-border bg-muted/50'
                )}
              >
                <div className="flex flex-wrap items-center gap-2">
                  {analysis.activityTotal.status === 'OK' ? (
                    <CheckCircle2 className="size-4 text-green" aria-hidden />
                  ) : (
                    <AlertTriangle
                      className={cn('size-4', analysis.activityTotal.status === 'NEEDS_AGGREGATION_RULE' ? 'text-amber' : 'text-muted-foreground')}
                      aria-hidden
                    />
                  )}
                  <span className="font-bold">زمان استاندارد کل فعالیت:</span>
                  {analysis.activityTotal.st !== null ? (
                    <span className="font-mono font-bold">{formatTimeValue(analysis.activityTotal.st, prefs)} ثانیه</span>
                  ) : (
                    <span className="font-bold">
                      {analysis.activityTotal.status === 'NEEDS_AGGREGATION_RULE' ? 'نیازمند قاعده تجمیع' : 'نیازمند تکمیل داده'}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-muted-foreground">{analysis.activityTotal.reason}</p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ── شاخص‌های نوع زمان + آمار چرخه ── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="rounded-2xl">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Timer className="size-5 text-brand" aria-hidden />
              شاخص‌های نوع زمان (از OT)
              <HelpDot
              label="شاخص‌های نوع زمان"
              content={{
                what: 'جمع زمان مشاهده‌شدهٔ عناصر بر اساس نوع آن‌ها — جداگانه گزارش می‌شود.',
                input: 'مجموع OT عناصر دستی، ماشینی و انتظار به‌صورت مستقل محاسبه می‌شود.',
                example: 'اگر عنصر دستی OT=۱۰ و دو عنصر ماشینی OT=۵ و ۷ داشته باشید: کار دستی ۱۰ و کار ماشینی ۱۲ ثانیه.',
                note: 'جمع عناصر هم‌زمان فقط یک شاخص است و زمان سپری‌شدهٔ چرخه محسوب نمی‌شود.',
              }}
            />
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <Metric label="کار دستی" value={formatTimeValue(analysis.elementTypeTotals.manual, prefs)} muted={analysis.elementTypeTotals.manual === null} />
            <Metric label="خودکار ماشین" value={formatTimeValue(analysis.elementTypeTotals.machine, prefs)} muted={analysis.elementTypeTotals.machine === null} />
            <Metric label="انتظار" value={formatTimeValue(analysis.elementTypeTotals.waiting, prefs)} muted={analysis.elementTypeTotals.waiting === null} />
            <Metric label="جمع هم‌زمان (شاخص)" value={formatTimeValue(analysis.elementTypeTotals.overlapSum, prefs)} muted={analysis.elementTypeTotals.overlapSum === null} />
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader className="pb-3">
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              <ActivityIcon className="size-5 text-brand" aria-hidden />
              آمار زمان سپری‌شدهٔ چرخه
              <HelpDot
                label="زمان سپری‌شدهٔ چرخه"
                content={{
                  what: '«سپری‌شده» یعنی زمان واقعی گذر یک چرخه؛ برای دادهٔ بازه‌ای برابر است با دیرترین پایان منهای زودترین شروع همان چرخه و در غیر این صورت با جمع مدت عناصر ترتیبی همان چرخه.',
                  input: 'به‌صورت خودکار از داده‌های زمان‌سنجی محاسبه می‌شود؛ فقط چرخه‌های کامل و قابل استفاده وارد آمار می‌شوند.',
                  example: 'اگر زودترین شروع عناصر چرخه ثانیهٔ ۱۰۰ و دیرترین پایان آن‌ها ثانیهٔ ۱۴۵ باشد، زمان سپری‌شدهٔ چرخه ۴۵ ثانیه است.',
                  note: 'کاربرد: ارزیابی زمان واقعی چرخه در شرایط میدانی؛ برای زمان استاندارد، ملاک ST عناصر است.',
                }}
              />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {analysis.cycleStats.count === 0 ? (
              <p className="text-muted-foreground">چرخهٔ قابل استفاده‌ای برای آمار وجود ندارد.</p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <Metric label="تعداد" value={formatInt(analysis.cycleStats.count, prefs)} />
                  <Metric label="میانگین (ثانیه)" value={formatTimeValue(analysis.cycleStats.stats.mean, prefs)} />
                  <Metric label="میانه" value={formatTimeValue(analysis.cycleStats.stats.median, prefs)} />
                  <Metric label="کمینه" value={formatTimeValue(analysis.cycleStats.stats.min, prefs)} />
                  <Metric label="بیشینه" value={formatTimeValue(analysis.cycleStats.stats.max, prefs)} />
                  <Metric label="انحراف معیار نمونه" value={analysis.cycleStats.stats.sampleSD === null ? NOT_COMPUTABLE : formatTimeValue(analysis.cycleStats.stats.sampleSD, prefs)} />
                </div>
                <p className="text-xs leading-5 text-muted-foreground">{analysis.cycleStats.methodNote}</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── بررسی عمیق عنصر: نمودارها + آمار + مقایسه اپراتور ── */}
      {analysis.elements.length > 0 && selectedElement && (
        <Card className="rounded-2xl">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                <BarChart3 className="size-5 text-brand" aria-hidden />
                بررسی عمیق عنصر
                <HelpDot
                  label="بررسی عمیق عنصر"
                  content={{
                    what: 'ابزار بررسی تک‌به‌تک عناصر: یک عنصر را انتخاب کنید تا آمار کامل، توزیع (هیستوگرام) و روند مشاهدات آن را در کنار مقایسهٔ اپراتورها ببینید.',
                    input: 'از فهرست کنار عنوان، یک عنصر کاری انتخاب کنید؛ همهٔ آمارها و نمودارهای همین بخش برای همان عنصر به‌روز می‌شوند.',
                    example: 'اگر پراکندگی یک عنصر بالا باشد، در هیستوگرام می‌بینید مشاهدات در دو خوشهٔ جدا افتاده‌اند — مثلاً دو روش کار متفاوت.',
                    note: 'این بخش تغییری در داده ایجاد نمی‌کند؛ تصمیم‌های نگه‌داشتن/خروج مشاهده در «بازبینی مشاهدات مشکوک» گرفته می‌شود.',
                  }}
                />
              </CardTitle>
              <Select value={selectedElement.id} onValueChange={(v) => setSelectedElementId(v)} dir="rtl">
                <SelectTrigger className="w-full max-w-72">
                  <SelectValue placeholder="عنصر را انتخاب کنید" />
                </SelectTrigger>
                <SelectContent dir="rtl">
                  {analysis.elements.map((el) => (
                    <SelectItem key={el.id} value={el.id}>
                      {el.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* آمار کامل عنصر — FR-17 */}
            <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4 lg:grid-cols-6">
              <Metric label="در محاسبات" value={formatInt(selectedElement.counts.calcBasis, prefs)} />
              <Metric label="میانگین" value={formatTimeValue(selectedElement.stats.mean, prefs)} />
              <Metric label="میانه" value={formatTimeValue(selectedElement.stats.median, prefs)} />
              <Metric label="دامنه" value={formatTimeValue(selectedElement.stats.range, prefs)} />
              <Metric label="واریانس نمونه" value={selectedElement.stats.sampleVariance === null ? NOT_COMPUTABLE : formatTimeValue(selectedElement.stats.sampleVariance, prefs, 4)} />
              <Metric label="انحراف معیار نمونه" value={selectedElement.stats.sampleSD === null ? NOT_COMPUTABLE : formatTimeValue(selectedElement.stats.sampleSD, prefs)} />
              <Metric label="CV" value={selectedElement.stats.cvPercent === null ? NOT_COMPUTABLE : `${formatTimeValue(selectedElement.stats.cvPercent, prefs)}٪`} />
              <Metric label="چارک ۱" value={formatTimeValue(selectedElement.stats.q1, prefs)} />
              <Metric label="چارک ۳" value={formatTimeValue(selectedElement.stats.q3, prefs)} />
              <Metric label="IQR" value={formatTimeValue(selectedElement.stats.iqr, prefs)} />
              <Metric
                label="بازهٔ اطمینان ۹۵٪ میانگین"
                value={
                  selectedElement.stats.ci95
                    ? `${formatTimeValue(selectedElement.stats.ci95.lower, prefs)} تا ${formatTimeValue(selectedElement.stats.ci95.upper, prefs)}`
                    : NOT_COMPUTABLE
                }
                wide
              />
            </div>
            <p className="text-xs leading-5 text-muted-foreground">
              آمار بر اساس {formatInt(selectedElement.counts.calcBasis, prefs)} مشاهدهٔ درون محاسبات (معتبر + مشکوک). برای n&lt;۲ انحراف معیار و واریانس «قابل محاسبه نیست» است. بازهٔ اطمینان: توزیع t سطح ۹۵٪.
            </p>

            {/* نمودارها */}
            <div className="grid gap-4 xl:grid-cols-2">
              <div className="rounded-xl border p-3">
                <p className="mb-1 flex items-center gap-1.5 text-sm font-bold">
                  <BarChart3 className="size-4 text-brand" aria-hidden />
                  توزیع (هیستوگرام)
                </p>
                <p className="mb-2 text-xs leading-5 text-muted-foreground">
                  هر ستون نشان می‌دهد چند مشاهده در آن بازهٔ زمانی قرار گرفته است.
                </p>
                {selectedElement.histogram.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">دادهٔ کافی برای هیستوگرام وجود ندارد.</p>
                ) : (
                  <ChartContainer config={chartConfig} className="h-64 w-full">
                    <BarChart data={histData} margin={{ top: 8, right: 8, bottom: 24, left: 16 }}>
                      <CartesianGrid vertical={false} strokeDasharray="3 3" />
                      <XAxis
                        dataKey="label"
                        interval={histTickInterval}
                        angle={0}
                        textAnchor="middle"
                        tick={{ fontSize: 10 }}
                        height={56}
                        label={<HorizontalAxisTitle value="مدت (ثانیه)" />}
                      />
                      <YAxis
                        tick={{ fontSize: 10 }}
                        allowDecimals={false}
                        width={44}
                        label={<VerticalAxisTitle value="تعداد مشاهدات" />}
                      />
                      <ChartTooltip
                        content={
                          <ChartTooltipContent
                            hideLabel
                            formatter={(value, _name, item) => {
                              const bin = item?.payload as { binStart: number; binEnd: number } | undefined
                              const total = selectedElement.counts.calcBasis
                              return (
                                <div className="text-xs">
                                  بازه: {formatTimeValue(bin?.binStart ?? null, prefs, histDecimals)} تا{' '}
                                  {formatTimeValue(bin?.binEnd ?? null, prefs, histDecimals)} ثانیه — تعداد:{' '}
                                  {formatInt(Number(value), prefs)} از {formatInt(total, prefs)} مشاهده
                                </div>
                              )
                            }}
                          />
                        }
                      />
                      <Bar dataKey="count" fill="var(--brand)" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ChartContainer>
                )}
              </div>

              <div className="rounded-xl border p-3">
                <p className="mb-1 flex items-center gap-1.5 text-sm font-bold">
                  <LineChartIcon className="size-4 text-brand" aria-hidden />
                  روند مشاهدات به ترتیب چرخه
                </p>
                <p className="mb-2 text-xs leading-5 text-muted-foreground">
                  روند مقدار ثبت‌شده در چرخه‌های متوالی؛ رنگ‌ها وضعیت هر مشاهده را نشان می‌دهد.
                </p>
                {selectedElement.trend.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">داده‌ای برای نمایش روند وجود ندارد.</p>
                ) : (
                  <ChartContainer config={chartConfig} className="h-64 w-full">
                    <LineChart data={selectedElement.trend} margin={{ top: 8, right: 8, bottom: 24, left: 16 }}>
                      <CartesianGrid vertical={false} strokeDasharray="3 3" />
                      <XAxis
                        dataKey="cycleNo"
                        tick={{ fontSize: 10 }}
                        tickFormatter={(v: number) => formatInt(v, prefs)}
                        angle={0}
                        textAnchor="middle"
                        height={56}
                        label={<HorizontalAxisTitle value="شمارهٔ چرخه" />}
                      />
                      <YAxis
                        tick={{ fontSize: 10 }}
                        tickFormatter={(v: number) => formatTimeValue(v, prefs, 1)}
                        width={48}
                        label={<VerticalAxisTitle value="مدت (ثانیه)" />}
                      />
                      <ChartTooltip
                        content={
                          <ChartTooltipContent
                            hideLabel
                            formatter={(value, _name, item) => {
                              const p = item?.payload as { status?: string; operatorId?: string; cycleNo?: number } | undefined
                              const opName =
                                selectedElement.operators.find((o) => o.operatorId === p?.operatorId)?.operatorName ?? ''
                              const statusLabel =
                                p?.status === 'SUSPECT' ? 'مشکوک' : p?.status === 'EXCLUDED' ? 'خارج‌شده' : 'معتبر'
                              return (
                                <div className="text-xs">
                                  چرخهٔ {formatInt(Number(p?.cycleNo ?? 0), prefs)}
                                  {opName ? ` (${opName})` : ''} — مقدار: {formatTimeValue(Number(value), prefs, 3)} ثانیه —{' '}
                                  {statusLabel}
                                </div>
                              )
                            }}
                          />
                        }
                      />
                      {selectedElement.stats.mean !== null && (
                        <ReferenceLine y={selectedElement.stats.mean} stroke="var(--amber)" strokeDasharray="6 4" />
                      )}
                      <Line dataKey="value" stroke="var(--brand)" strokeWidth={2} dot={<TrendDot />} />
                    </LineChart>
                  </ChartContainer>
                )}
                <p className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <span className="inline-block size-2 rounded-full" style={{ background: 'var(--brand)' }} />
                    معتبر
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="inline-block size-2 rounded-full" style={{ background: 'var(--amber)' }} />
                    مشکوک
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="inline-block size-2 rounded-full" style={{ background: 'var(--red)' }} />
                    خارج‌شده
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="inline-block h-0.5 w-4" style={{ background: 'var(--amber)' }} />
                    میانگین
                  </span>
                </p>
              </div>
            </div>

            {/* مقایسه اپراتورها — FR-19 */}
            <div>
              <p className="mb-2 flex flex-wrap items-center gap-2 text-sm font-bold">
                <Users className="size-4 text-brand" aria-hidden />
                مقایسهٔ اپراتورها برای «{selectedElement.name}»
                <HelpDot
              label="مقایسهٔ اپراتورها"
              content={{
                what: 'آمار جداگانهٔ هر اپراتور برای همین عنصر، همراه ضریب وستینگهاوس مشترک.',
                input: 'تفاوت زمان نرمال اپراتورها از میانگین مشاهده‌شدهٔ خودشان ناشی می‌شود؛ R عنصر برای همه مشترک است.',
                example: 'اپراتور الف میانگین ۸٫۲ و اپراتور ب ۸٫۶ ثانیه با R=۱٫۰۹ → NT: ۸٫۹۴ و ۹٫۳۷ ثانیه.',
                note: 'سیستم ارزیابی جداگانهٔ هر اپراتور نمی‌سازد؛ ضریب در سطح عنصر مشترک است.',
              }}
            />
              </p>
              {selectedElement.operators.length === 0 ? (
                <p className="text-sm text-muted-foreground">هیچ اپراتوری دادهٔ درون محاسبات برای این عنصر ندارد.</p>
              ) : (
                <div className="overflow-x-auto rounded-xl border">
                  <Table className="tbl">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="tbl-text">اپراتور</TableHead>
                        <TableHead>تعداد</TableHead>
                        <TableHead>میانگین (ثانیه)</TableHead>
                        <TableHead>انحراف معیار</TableHead>
                        <TableHead>CV</TableHead>
                        <TableHead>R (مشترک)</TableHead>
                        <TableHead>NT</TableHead>
                        <TableHead>ST</TableHead>
                        <TableHead>مشکوک / خارج</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedElement.operators.map((op) => (
                        <TableRow key={op.operatorId}>
                          <TableCell className="tbl-text font-bold">{op.operatorName}</TableCell>
                          <TableCell className="tbl-num">{formatInt(op.count, prefs)}</TableCell>
                          <TableCell className="tbl-num font-mono">{formatTimeValue(op.mean, prefs)}</TableCell>
                          <TableCell className="tbl-num font-mono">{op.sampleSD === null ? NOT_COMPUTABLE : formatTimeValue(op.sampleSD, prefs)}</TableCell>
                          <TableCell className="font-mono">{op.cvPercent === null ? NOT_COMPUTABLE : `${formatTimeValue(op.cvPercent, prefs)}٪`}</TableCell>
                          <TableCell className="tbl-num font-mono">
                            {selectedElement.rating ? formatTimeValue(selectedElement.rating.totalFactor, prefs, 3) : '—'}
                          </TableCell>
                          <TableCell className="tbl-num font-mono">{formatTimeValue(op.nt, prefs)}</TableCell>
                          <TableCell className="tbl-num font-mono">{formatTimeValue(op.st, prefs)}</TableCell>
                          <TableCell>
                            <span className={op.suspectCount > 0 ? 'font-bold text-amber' : ''}>{formatInt(op.suspectCount, prefs)}</span>
                            {' / '}
                            <span className={op.excludedCount > 0 ? 'font-bold text-red' : ''}>{formatInt(op.excludedCount, prefs)}</span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── بازبینی مشاهدات مشکوک/خارج‌شده — FR-11/18 ── */}
      <Card className="rounded-2xl">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              <AlertTriangle className="size-5 text-amber" aria-hidden />
              بازبینی مشاهدات مشکوک و خارج‌شده
              <Badge variant="outline">{formatInt(analysis.suspects.length, prefs)} مورد</Badge>
              <HelpDot
              label="بازبینی مشکوک‌ها"
              content={{
                what: 'فهرست مشاهداتی که قاعدهٔ آماری آن‌ها را برای بازبینی علامت‌گذاری کرده یا شما از محاسبات خارج کرده‌اید.',
                input: 'برای هر مورد تصمیم بگیرید: «خارج از محاسبات» (با ثبت دلیل) یا «بازگشت به محاسبات». دادهٔ خام در هر دو حالت حفظ می‌شود.',
                example: 'اگر یک چرخه به‌دلیل قطع نوار نقاله عدد بزرگ‌تری دارد، با دلیل «اختلال در حین مشاهده» خارجش کنید.',
                note: 'هشدار آماری به‌تنهایی دلیل حذف نیست؛ شرایط واقعی مشاهده را بررسی کنید.',
              }}
            />
            </CardTitle>
            <Button variant="outline" size="sm" onClick={() => refreshMutation.mutate()} disabled={refreshMutation.isPending}>
              <RefreshCw className={cn('size-4', refreshMutation.isPending && 'animate-spin')} aria-hidden />
              بازمحاسبهٔ پرچم‌ها
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {analysis.suspects.length === 0 ? (
            <EmptyState
              icon={<CheckCircle2 className="size-7" aria-hidden />}
              title="موردی برای بازبینی نیست"
              description="هیچ مشاهده‌ای مشکوک یا خارج‌شده در این فعالیت وجود ندارد."
            />
          ) : (
            <div className="max-h-96 space-y-2 overflow-y-auto pl-1">
              {analysis.suspects.map((s) => (
                <div
                  key={s.observationId}
                  className={cn(
                    'flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3',
                    s.validityStatus === 'SUSPECT' ? 'border-amber/40 bg-amber-soft/50' : 'border-border bg-muted/40'
                  )}
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-bold">{s.elementName}</span>
                      <Badge variant="secondary">چرخهٔ {formatInt(s.cycleNo, prefs)}</Badge>
                      <Badge variant="outline">{s.operatorName}</Badge>
                      {s.validityStatus === 'SUSPECT' ? (
                        <Badge className="gap-1 bg-amber-soft text-amber">
                          <AlertTriangle className="size-3" aria-hidden />
                          مشکوک
                        </Badge>
                      ) : (
                        <Badge className="gap-1 bg-red-soft text-red">
                          <Ban className="size-3" aria-hidden />
                          خارج‌شده
                        </Badge>
                      )}
                    </div>
                    <p className="font-mono text-sm">
                      مقدار: {formatTimeValue(s.value, prefs)} ثانیه
                      {s.score !== null && (
                        <span className="mr-2 text-xs text-muted-foreground">امتیاز Z تعدیل‌شده: {formatTimeValue(s.score, prefs, 2)}</span>
                      )}
                    </p>
                    <p className="text-xs leading-5 text-muted-foreground">
                      {s.validityStatus === 'SUSPECT'
                        ? `قاعده: ${
                            s.rule === 'MODIFIED_Z_MAD'
                              ? 'امتیاز Z تعدیل‌شده (میانه و MAD)'
                              : s.rule === 'IQR_FENCE'
                                ? 'حصار IQR'
                                : s.rule ?? '—'
                          } — این مشاهده همچنان در محاسبات است تا تصمیم شما.`
                        : `دلیل خروج: ${s.exclusionReason ?? 'ثبت نشده است'}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {s.validityStatus === 'SUSPECT' ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-red"
                        onClick={() =>
                          setExcludeTarget({
                            observationId: s.observationId,
                            elementName: s.elementName,
                            cycleNo: s.cycleNo,
                            value: s.value,
                          })
                        }
                      >
                        <Ban className="size-3.5" aria-hidden />
                        خارج از محاسبات
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => excludeMutation.mutate({ observationId: s.observationId, validityStatus: 'VALID' })}
                        disabled={excludeMutation.isPending}
                      >
                        <RotateCcw className="size-3.5" aria-hidden />
                        بازگشت به محاسبات
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-center text-xs text-muted-foreground">
        تحلیل زنده بر اساس دادهٔ فعلی — {formatDateTime(analysis.generatedAt, prefs)}
      </p>

      {/* دیالوگ ثبت دلیل خروج — FR-11 */}
      <Dialog open={excludeTarget !== null} onOpenChange={(open) => !open && setExcludeTarget(null)}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Ban className="size-5 text-red" aria-hidden />
              خارج‌کردن مشاهده از محاسبات
            </DialogTitle>
            <DialogDescription className="text-right leading-6">
              مشاهدهٔ «{excludeTarget?.elementName}» در چرخهٔ {formatInt(excludeTarget?.cycleNo ?? 0, prefs)} با مقدار{' '}
              {formatTimeValue(excludeTarget?.value ?? null, prefs)} ثانیه از محاسبات خارج می‌شود. دادهٔ خام حذف نمی‌شود و هر
              زمان می‌توانید آن را برگردانید. ثبت دلیل برای پیگیری توصیه می‌شود.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="exclude-reason">دلیل خروج (اختیاری اما توصیه‌شده)</Label>
            <Textarea
              id="exclude-reason"
              value={excludeReason}
              onChange={(e) => setExcludeReason(e.target.value)}
              placeholder="مثلاً: اختلال نوار نقاله در حین ثبت این چرخه"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setExcludeTarget(null)}>
              انصراف
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                excludeTarget &&
                excludeMutation.mutate({
                  observationId: excludeTarget.observationId,
                  validityStatus: 'EXCLUDED',
                  exclusionReason: excludeReason.trim() || null,
                })
              }
              disabled={excludeMutation.isPending}
            >
              {excludeMutation.isPending ? 'در حال ثبت…' : 'خارج کن'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ═══════════════ زیرکامپوننت‌ها ═══════════════

function SummaryCard({
  icon,
  title,
  value,
  hint,
  tone = 'brand',
}: {
  icon: React.ReactNode
  title: string
  value: string
  hint: string
  tone?: 'brand' | 'amber' | 'green'
}) {
  return (
    <Card className="rounded-2xl">
      <CardContent className="flex items-start gap-3 p-4">
        <div
          className={cn(
            'flex size-10 shrink-0 items-center justify-center rounded-xl',
            tone === 'amber' ? 'bg-amber-soft text-amber' : tone === 'green' ? 'bg-green-soft text-green' : 'bg-brand-soft text-brand'
          )}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <p className="truncate text-xs text-muted-foreground">{title}</p>
          <p className="mt-0.5 text-lg font-black leading-7">{value}</p>
          <p className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-muted-foreground">{hint}</p>
        </div>
      </CardContent>
    </Card>
  )
}

function ElementRow({ el, prefs }: { el: ElementAnalysisItemDto; prefs: ReturnType<typeof useDisplayPrefs> }) {
  return (
    <TableRow>
      <TableCell className="tbl-text max-w-48 font-bold">
        <span className="line-clamp-1">{el.name}</span>
      </TableCell>
      <TableCell>
        <Badge variant="outline">{ELEMENT_TYPE_LABELS[el.elementType as ElementType] ?? el.elementType}</Badge>
      </TableCell>
      <TableCell className="tbl-num">{formatInt(el.counts.calcBasis, prefs)}</TableCell>
      <TableCell>
        <span className={el.counts.suspect > 0 ? 'font-bold text-amber' : ''}>{formatInt(el.counts.suspect, prefs)}</span>
        {' / '}
        <span className={el.counts.excluded > 0 ? 'font-bold text-red' : ''}>{formatInt(el.counts.excluded, prefs)}</span>
      </TableCell>
      <TableCell className="tbl-num font-mono">{formatTimeValue(el.ot, prefs)}</TableCell>
      <TableCell className="tbl-num font-mono">{el.rating ? formatTimeValue(el.rating.totalFactor, prefs, 3) : '—'}</TableCell>
      <TableCell className="tbl-num font-mono">{formatTimeValue(el.nt, prefs)}</TableCell>
      <TableCell className="tbl-num font-mono">
        {el.stError ? (
          <span className="text-xs font-bold text-red" title={el.stError}>
            خطا
          </span>
        ) : (
          formatTimeValue(el.st, prefs)
        )}
      </TableCell>
    </TableRow>
  )
}

function Metric({
  label,
  value,
  muted,
  error,
  wide,
}: {
  label: string
  value: string
  muted?: boolean
  error?: string | null
  wide?: boolean
}) {
  return (
    <div className={cn('rounded-lg bg-muted/50 px-2.5 py-2', wide && 'col-span-2 sm:col-span-2 lg:col-span-2')}>
      <p className="truncate text-[11px] text-muted-foreground">{label}</p>
      <p className={cn('mt-0.5 font-mono text-sm font-bold', muted && 'text-muted-foreground')} title={error ?? undefined}>
        {value}
      </p>
    </div>
  )
}
