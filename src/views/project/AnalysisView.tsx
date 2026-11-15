'use client'

// ═══════════════════════════════════════════════════════════
// نمای تحلیل نتایج — سطح پروژه — فاز ۴
// • انتخاب فعالیت و نمایش تحلیل کامل همان فعالیت
// • کارت Snapshot محاسبات: آخرین اجرا، وضعیت تازگی و
//   اجرای محاسبهٔ نسخه‌دار — FR-27
// ═══════════════════════════════════════════════════════════
import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  BarChart3,
  CheckCircle2,
  ChevronLeft,
  Database,
  Factory,
  History,
  Loader2,
  Play,
  RefreshCw,
  Save,
  SlidersHorizontal,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/common/Feedback'
import { SectionHeading } from '@/components/common/SectionHeading'
import { HelpDot } from '@/components/common/HelpDot'
import { PersianNumberInput } from '@/components/common/PersianNumberInput'
import { analysisApi, calculationsApi, settingsApi } from '@/lib/api/endpoints'
import { qk } from '@/lib/api/keys'
import { PROCESS_TYPE_LABELS, type ProcessType } from '@/domain/types'
import { useDisplayPrefs } from '@/store/display-store'
import { formatDateTime, formatInt, formatTimeValue } from '@/lib/format'
import { cn } from '@/lib/utils'
import AnalysisContent from './analysis/AnalysisContent'

export default function AnalysisView({ projectId }: { projectId: string }) {
  const prefs = useDisplayPrefs()
  const qc = useQueryClient()
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null)

  const activitiesQuery = useQuery({
    queryKey: qk.analysisActivities(projectId),
    queryFn: () => analysisApi.activities(projectId),
  })

  const latestQuery = useQuery({
    queryKey: qk.latestCalculation(projectId),
    queryFn: () => calculationsApi.latest(projectId),
  })

  // ── تنظیمات پیشرفتهٔ تشخیص غیرعادی — FR-18 ──
  const settingsQuery = useQuery({
    queryKey: qk.settings(),
    queryFn: () => settingsApi.get(),
  })
  // الگوی پیش‌نویس: مقدار مؤثر = ویرایش محلی یا مقدار ذخیره‌شدهٔ سرور
  const serverMethod = settingsQuery.data?.settings['outlier.method'] === 'iqr' ? 'iqr' : 'mad'
  const serverThresholdRaw = Number(settingsQuery.data?.settings['outlier.threshold'])
  const serverThreshold = Number.isFinite(serverThresholdRaw) && serverThresholdRaw > 0 ? serverThresholdRaw : 3.5
  const [methodDraft, setMethodDraft] = useState<'mad' | 'iqr' | null>(null)
  const [thresholdDraft, setThresholdDraft] = useState<number | null>(null)
  const outlierMethod = methodDraft ?? serverMethod
  const outlierThreshold = thresholdDraft ?? serverThreshold
  const [advancedOpen, setAdvancedOpen] = useState(false)

  const outlierSettingsMutation = useMutation({
    mutationFn: (values: Record<string, string>) => settingsApi.put(values),
    onSuccess: async () => {
      setMethodDraft(null)
      setThresholdDraft(null)
      await qc.invalidateQueries({ queryKey: qk.settings() })
      // پرچم‌ها در سرور بازمحاسبه شدند؛ تحلیل‌ها را تازه‌سازی کن
      await qc.invalidateQueries({ queryKey: ['activity-analysis'] })
      toast.success('تنظیمات تشخیص غیرعادی ذخیره و پرچم‌ها بازمحاسبه شد.')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const runMutation = useMutation({
    mutationFn: () => calculationsApi.run(projectId),
    onSuccess: async (data) => {
      await qc.invalidateQueries({ queryKey: qk.latestCalculation(projectId) })
      toast.success(
        `محاسبهٔ پروژه اجرا و به‌صورت نسخه ثبت شد (${formatInt(
          Number((data.run.result as { activities?: unknown[] } | null)?.activities?.length ?? 0),
          prefs
        )} فعالیت). نسخه‌های قبلی حفظ شده‌اند.`
      )
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const stations = activitiesQuery.data?.stations ?? []
  const allActivities = useMemo(() => stations.flatMap((s) => s.activities), [stations])

  // پیش‌فرض: انتخاب کاربر یا اولین فعالیت دارای داده (بدون Effect)
  const effectiveSelectedActivityId =
    (selectedActivityId && allActivities.some((a) => a.id === selectedActivityId)
      ? selectedActivityId
      : (allActivities.find((a) => a.cyclesCount > 0) ?? allActivities[0])?.id) ?? null

  if (activitiesQuery.isLoading || latestQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-16 rounded-2xl" />
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    )
  }

  if (activitiesQuery.isError) {
    return (
      <EmptyState
        title="بارگذاری فعالیت‌ها ناموفق بود"
        description={(activitiesQuery.error as Error).message}
        action={
          <Button variant="outline" onClick={() => activitiesQuery.refetch()}>
            <RefreshCw className="size-4" aria-hidden />
            تلاش مجدد
          </Button>
        }
      />
    )
  }

  const latest = latestQuery.data

  return (
    <div className="space-y-5">
      {/* سربرگ چسبان بخش — v1.5.2 §۱۸ */}
      <SectionHeading>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="chip-icon bg-brand-soft text-brand">
              <BarChart3 className="size-6" aria-hidden />
            </div>
            <div>
              <h1 className="text-xl font-extrabold">تحلیل نتایج</h1>
              <p className="text-xs text-muted-foreground">آمار، دادهٔ غیرعادی و مقایسهٔ اپراتورها</p>
            </div>
          </div>
        </div>
      </SectionHeading>

      {/* ── کارت Snapshot محاسبات — FR-27 ── */}
      <Card className="rounded-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <History className="size-5 text-brand" aria-hidden />
            وضعیت محاسبات پروژه
            <HelpDot
              label="Snapshot محاسبات"
              content={{
                what: 'نتیجهٔ محاسبات به‌صورت نسخه‌های تاریخ‌دار ذخیره می‌شود؛ هر اجرا یک نسخهٔ جدید می‌سازد و نسخه‌های قبلی حذف نمی‌شوند.',
                input: 'پس از هر تغییر مؤثر (دادهٔ خام، ارزیابی وستینگهاوس، مجازها یا روش محاسبه)، نتیجهٔ ثبت‌شده «نیازمند محاسبهٔ مجدد» می‌شود تا دوباره اجرا کنید.',
                example: 'اگر ضریب یک عنصر را تغییر دهید، نسخهٔ قبلی با برچسب «نیازمند محاسبهٔ مجدد» باقی می‌ماند تا نسخهٔ جدید بسازید.',
                note: 'تحلیل زیر همیشه زنده و بر اساس دادهٔ فعلی است؛ Snapshot برای تاریخچه و مقایسه است.',
              }}
            />
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            {latest?.run ? (
              latest.needsRecalc ? (
                <Badge className="gap-1.5 bg-amber-soft px-3 py-1 text-amber">
                  <RefreshCw className="size-3.5" aria-hidden />
                  نیازمند محاسبهٔ مجدد
                </Badge>
              ) : (
                <Badge className="gap-1.5 bg-green-soft px-3 py-1 text-green">
                  <CheckCircle2 className="size-3.5" aria-hidden />
                  به‌روز
                </Badge>
              )
            ) : latest?.hasAnyData ? (
              <Badge className="gap-1.5 bg-amber-soft px-3 py-1 text-amber">
                <Database className="size-3.5" aria-hidden />
                هنوز محاسبه نسخه‌دار اجرا نشده است
              </Badge>
            ) : (
              <Badge variant="secondary" className="px-3 py-1">
                داده‌ای برای محاسبه ثبت نشده است
              </Badge>
            )}
            {latest?.run && (
              <span className="text-sm text-muted-foreground">
                آخرین اجرا: {formatDateTime(latest.run.createdAt, prefs)} — نسخهٔ فرمول {latest.run.formulaVersion}
                {latest.runsCount > 1 ? ` (${formatInt(latest.runsCount, prefs)} نسخهٔ تاریخ‌دار)` : ''}
              </span>
            )}
          </div>
          <Button
            onClick={() => runMutation.mutate()}
            disabled={runMutation.isPending || !latest?.hasAnyData}
            className="btn-brand gap-2"
          >
            {runMutation.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Play className="size-4" aria-hidden />}
            {runMutation.isPending ? 'در حال اجرای محاسبه…' : 'اجرای محاسبه و ثبت نسخه'}
          </Button>
        </CardContent>
      </Card>

      {/* ── تنظیمات پیشرفتهٔ تشخیص غیرعادی — FR-18 ── */}
      <Card className="rounded-2xl">
        <CardHeader className="pb-3">
          {/* دکمهٔ باز/بسته مستقل؛ HelpDot دکمهٔ جدا است (button تودرتو ممنوع) */}
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              <SlidersHorizontal className="size-5 text-brand" aria-hidden />
              تنظیمات پیشرفتهٔ تشخیص دادهٔ غیرعادی
              <HelpDot
                label="تشخیص دادهٔ غیرعادی"
                content={{
                  what: 'قاعده‌ای آماری که مشاهدات پرت را برای بازبینی علامت‌گذاری می‌کند؛ هرگز خودکار حذف نمی‌کند.',
                  input: 'روش پیش‌فرض «امتیاز Z تعدیل‌شده» بر پایهٔ میانه و MAD با آستانهٔ ۳٫۵ است. اگر MAD صفر یا نمونه بسیار کم باشد، روش با کنترل به حصار IQR می‌رود یا هشدار نمی‌دهد.',
                  example: 'مجموعهٔ ۸، ۱۲، ۲۵ ثانیه: مقدار ۲۵ با آستانهٔ معمول علامت‌گذاری می‌شود تا شرایط واقعی مشاهده بررسی شود.',
                  note: 'تغییر آستانه فقط برچسب‌گذاری را علامت‌گذاری می‌کند؛ دادهٔ خام و تصمیم‌های خروج شما تغییری نمی‌کنند.',
                }}
              />
            </CardTitle>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setAdvancedOpen((v) => !v)}
              aria-expanded={advancedOpen}
              className="gap-1.5"
            >
              {advancedOpen ? 'بستن' : 'بازکردن'}
              <ChevronLeft className={cn('size-4 transition-transform', advancedOpen && '-rotate-90')} aria-hidden />
            </Button>
          </div>
        </CardHeader>
        {advancedOpen && (
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>روش تشخیص</Label>
                <RadioGroup
                  dir="rtl"
                  value={outlierMethod}
                  onValueChange={(v) => setMethodDraft(v as 'mad' | 'iqr')}
                  className="flex gap-4"
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="mad" id="ol-mad" />
                    <Label htmlFor="ol-mad" className="font-normal">امتیاز Z تعدیل‌شده (میانه و MAD)</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="iqr" id="ol-iqr" />
                    <Label htmlFor="ol-iqr" className="font-normal">حصار IQR</Label>
                  </div>
                </RadioGroup>
              </div>
              <div className="space-y-2">
                <Label htmlFor="ol-threshold">آستانه (فقط برای روش Z تعدیل‌شده)</Label>
                <PersianNumberInput
                  id="ol-threshold"
                  value={outlierThreshold}
                  onChange={(v) => setThresholdDraft(v)}
                  decimals
                  min={0.5}
                  max={10}
                />
                <p className="text-[11px] leading-5 text-muted-foreground">
                  مقدار پیش‌فرض ۳٫۵ است؛ مقادیر کوچکتر حساسیت را بالا می‌برند. مقدار فعلی:{' '}
                  {formatTimeValue(outlierThreshold ?? 3.5, prefs, 2)}
                </p>
              </div>
            </div>
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="outline"
                className="gap-2"
                onClick={() =>
                  outlierSettingsMutation.mutate({
                    'outlier.method': outlierMethod,
                    'outlier.threshold': String(outlierThreshold ?? 3.5),
                  })
                }
                disabled={outlierSettingsMutation.isPending}
              >
                {outlierSettingsMutation.isPending ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <Save className="size-4" aria-hidden />
                )}
                ذخیره و بازمحاسبهٔ پرچم‌ها
              </Button>
            </div>
          </CardContent>
        )}
      </Card>

      {/* ── انتخاب فعالیت ── */}
      {allActivities.length === 0 ? (
        <EmptyState
          icon={<Factory className="size-7" aria-hidden />}
          title="فعالیتی تعریف نشده است"
          description="برای تحلیل نتایج، ابتدا در «ساختار تولید» ایستگاه و فعالیت تعریف کنید و داده ثبت نمایید."
        />
      ) : (
        <>
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-sm font-bold">
              <BarChart3 className="size-4 text-brand" aria-hidden />
              فعالیت موردنظر را انتخاب کنید
            </p>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {stations
                .filter((s) => s.activities.length > 0)
                .flatMap((s) =>
                  s.activities.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => setSelectedActivityId(a.id)}
                      className={cn(
                        'group flex items-center justify-between gap-2 rounded-xl border p-3 text-right transition-colors',
                        effectiveSelectedActivityId === a.id
                          ? 'border-brand bg-brand-soft/60'
                          : 'border-border bg-card hover:border-brand/50'
                      )}
                      aria-pressed={effectiveSelectedActivityId === a.id}
                    >
                      <div className="min-w-0">
                        <p className="truncate font-bold">{a.name}</p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {s.name} — {PROCESS_TYPE_LABELS[a.processType as ProcessType] ?? a.processType}
                          {' · '}
                          {formatInt(a.elementsCount, prefs)} عنصر، {formatInt(a.cyclesCount, prefs)} چرخه
                        </p>
                      </div>
                      <ChevronLeft
                        className={cn(
                          'size-4 shrink-0 transition-transform',
                          effectiveSelectedActivityId === a.id ? 'text-brand' : 'text-faint group-hover:-translate-x-0.5'
                        )}
                        aria-hidden
                      />
                    </button>
                  ))
                )}
            </div>
          </div>

          {/* ── محتوای تحلیل فعالیت ── */}
          {effectiveSelectedActivityId ? (
            <AnalysisContent activityId={effectiveSelectedActivityId} />
          ) : (
            <EmptyState
              icon={<Save className="size-7" aria-hidden />}
              title="فعالیتی انتخاب نشده است"
              description="از فهرست بالا یک فعالیت را برای نمایش تحلیل انتخاب کنید."
            />
          )}
        </>
      )}
    </div>
  )
}
