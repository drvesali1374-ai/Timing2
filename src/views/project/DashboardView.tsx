'use client'

// ═══════════════════════════════════════════════════════════
// داشبورد تحلیل پروژه — فاز ۶ / FR-21
//
// • ابتدا کارت‌های خلاصه: زمان استاندارد (در صورت قابل محاسبه بودن)،
//   میانگین، تعداد نمونه و وضعیت هدف نمونه.
// • شاخص‌ها و نمودارهای تخصصی در بخش‌های بازشونده.
// • شخصی‌سازی: فعال/غیرفعال + مرتب‌سازی کارت‌ها و نمودارها؛
//   چیدمان در تنظیمات پروژه ذخیره می‌شود.
// • دادهٔ ناقص/غیرقابل محاسبه = نمایش علت؛ هرگز صفر یا مقدار ساختگی.
// ═══════════════════════════════════════════════════════════
import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Activity as ActivityIcon,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BarChart3,
  CheckCircle2,
  ChevronLeft,
  Eye,
  EyeOff,
  FileSpreadsheet,
  Gauge,
  History,
  Layers,
  LayoutDashboard,
  Loader2,
  RefreshCw,
  RotateCcw,
  Save,
  Sigma,
  Timer,
  Users,
} from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from 'recharts'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { EmptyState } from '@/components/common/Feedback'
import { HelpDot } from '@/components/common/HelpDot'
import { SectionHeading } from '@/components/common/SectionHeading'
import { dashboardApi, type DashboardLayoutDto, type ProjectDashboardDto } from '@/lib/api/endpoints'
import { qk } from '@/lib/api/keys'
import { useAppStore } from '@/store/app-store'
import { useDisplayPrefs } from '@/store/display-store'
import { displayServerText, formatDateTime, formatInt, formatPercent, formatTimeValue } from '@/lib/format'
import { cn } from '@/lib/utils'

// ── شناسه‌های کارت و نمودار — هماهنگ با اعتبارسنجی سرور ──
type CardKey = 'st' | 'meanCycle' | 'samples' | 'target'
type WidgetKey = 'activities' | 'statusDonut' | 'operators' | 'elementCv' | 'reviewNeeds'

const DEFAULT_CARD_ORDER: CardKey[] = ['st', 'meanCycle', 'samples', 'target']
const DEFAULT_WIDGET_ORDER: WidgetKey[] = ['activities', 'statusDonut', 'operators', 'elementCv', 'reviewNeeds']

const CARD_META: Record<CardKey, { title: string; icon: typeof Sigma; help: { what: string; input: string; example: string; note: string } }> = {
  st: {
    title: 'زمان استاندارد کل پروژه',
    icon: Sigma,
    help: {
      what: 'جمع زمان استاندارد (ST) همهٔ فعالیت‌های پروژه؛ فقط وقتی قابل ارائه است که همهٔ فعالیت‌ها قابل محاسبه و ترتیبی باشند.',
      input: 'به‌صورت خودکار از داده‌های ثبت‌شده محاسبه می‌شود؛ ورودی مستقیم ندارد.',
      example: 'اگر دو فعالیت با ST برابر ۱۰٫۴ و ۸٫۲ ثانیه داشته باشید، کل پروژه ۱۸٫۶ ثانیه است.',
      note: 'فعالیت دارای کار هم‌زمان نیازمند «قاعدهٔ تجمیع» است و در جمع ساده وارد نمی‌شود؛ کارت علت را نشان می‌دهد.',
    },
  },
  meanCycle: {
    title: 'میانگین زمان چرخه',
    icon: Timer,
    help: {
      what: 'میانگین وزنی زمان سپری‌شدهٔ چرخه‌های قابل استفاده در کل پروژه.',
      input: 'از چرخه‌های کامل بدون دادهٔ خارج‌شده/نامعتبر محاسبه می‌شود.',
      example: 'اگر ۱۰ چرخه با میانگین ۲۵ ثانیه و ۵ چرخه با میانگین ۲۸ ثانیه دارید، میانگین وزنی ۲۶ ثانیه است.',
      note: 'برای چرخه‌های دارای بازهٔ هم‌زمان، «گسترهٔ بازه‌ها» ملاک است نه جمع مدت‌ها.',
    },
  },
  samples: {
    title: 'تعداد نمونهٔ معتبر',
    icon: Layers,
    help: {
      what: 'مجموع چرخه‌های کامل معتبر همهٔ فعالیت‌ها؛ مبنای شمارش، چرخهٔ بدون مشاهدهٔ خارج‌شده/نامعتبر است.',
      input: 'با ثبت داده در مرحلهٔ زمان‌سنجی به‌روز می‌شود.',
      example: '۸ چرخهٔ معتبر در یک فعالیت و ۴ چرخه در فعالیت دیگر = ۱۲ نمونهٔ معتبر.',
      note: 'مجموع «چرخهٔ ثبت‌شده» ممکن است بیشتر باشد؛ تفاوت یعنی دادهٔ ناقص/خارج‌شده.',
    },
  },
  target: {
    title: 'وضعیت هدف نمونه',
    icon: Gauge,
    help: {
      what: 'تعداد فعالیت‌هایی که به هدف تعداد نمونهٔ ثبت‌شده رسیده‌اند.',
      input: 'هدف هر فعالیت در مشخصات همان فعالیت تعیین می‌شود.',
      example: 'اگر ۳ فعالیت هدف‌دار دارید و ۲ تای آن‌ها به هدف رسیده‌اند، کارت «۲ از ۳» را نشان می‌دهد.',
      note: 'هدف نمونه کاربرمحور است؛ رسیدن به آن، کفایت آماری را تضمین نمی‌کند — شاخص‌های پراکندی را بازبینی کنید.',
    },
  },
}

const WIDGET_META: Record<WidgetKey, { title: string; icon: typeof BarChart3; help: { what: string; input: string; example: string; note: string } }> = {
  activities: {
    title: 'مقایسهٔ فعالیت‌ها',
    icon: BarChart3,
    help: {
      what: 'نمودار زمان استاندارد هر فعالیت (در صورت قابل محاسبه بودن) به‌همراه جدول وضعیت کامل.',
      input: 'از موتور محاسبات پروژه خوانده می‌شود.',
      example: 'نمودار می‌تواند نشان دهد کدام ایستگاه گلوگاه خط است.',
      note: 'فعالیت‌های «نیازمند قاعدهٔ تجمیع» یا «ناقص» در نمودار نمی‌آیند و در جدول با برچسب علتشان مشخص می‌شوند.',
    },
  },
  statusDonut: {
    title: 'توزیع وضعیت مشاهدات',
    icon: ActivityIcon,
    help: {
      what: 'سهم مشاهدات معتبر، مشکوک، خارج‌شده و نامعتبر در کل پروژه.',
      input: 'به‌صورت خودکار از وضعیت مشاهدات محاسبه می‌شود.',
      example: 'اگر از ۵۰ مشاهده، ۳ مورد مشکوک باشد، سهم مشکوک ۶٪ است.',
      note: 'مشاهدهٔ مشکوک فقط هشدار است و همچنان در محاسبات می‌ماند؛ خروج فقط با تصمیم شما.',
    },
  },
  operators: {
    title: 'مقایسهٔ اپراتورها',
    icon: Users,
    help: {
      what: 'شاخص نسبی هر اپراتور: میانگین نسبت عملکرد او به زمان تجمیعی همان عناصر.',
      input: 'از مشاهدات مبنای محاسبه (معتبر + مشکوک) محاسبه می‌شود.',
      example: 'شاخص ۱٫۰۴ یعنی این اپراتور به‌طور متوسط ۴٪ کندتر از تجمیع عناصر مربوط عمل کرده است.',
      note: 'تفاوت شاخص لزوماً به معنی ضعف نیست؛ مهارت، روش کار و شرایط باید مهندسی قضاوت شود.',
    },
  },
  elementCv: {
    title: 'پراکندگی عناصر (CV٪)',
    icon: ActivityIcon,
    help: {
      what: 'ضرایب تغییرات (انحراف معیار نسبی) عناصر کاری؛ پراکندگی زیاد یعنی روش کار ناپایدار یا دادهٔ نیازمند بازبینی.',
      input: 'به‌صورت خودکار از مشاهدات مبنای محاسبه محاسبه می‌شود.',
      example: 'CV٪ زیر ۱۰٪ معمولاً پایدار تلقی می‌شود؛ بالای ۲۵٪ نیازمند بررسی دلیل است.',
      note: 'این آستانه‌ها قاعدهٔ قطعی نیستند؛ قضاوت نهایی مهندسی است.',
    },
  },
  reviewNeeds: {
    title: 'نیازهای بازبینی',
    icon: AlertTriangle,
    help: {
      what: 'فهرست مواردی که پیش از اتکا به نتایج باید بازبینی شوند: دادهٔ مشکوک، ارزیابی ناقص، قاعدهٔ تجمیع، کمبود نمونه و تازگی محاسبات.',
      input: 'از وضعیت واقعی داده‌های پروژه استخراج می‌شود.',
      example: 'اگر ۲ مشاهدهٔ مشکوک بازبینی‌نشده داشته باشید، اینجا دکمهٔ رفتن به تحلیل آن فعالیت را می‌بینید.',
      note: 'این بخش عمداً صادقانه خالی می‌ماند وقتی موردی نیست — نمایش همیشگی هشدار، خستگی ایجاد می‌کند.',
    },
  },
}

const stChartConfig = {
  st: { label: 'زمان استاندارد (ثانیه)', color: 'var(--brand)' },
} satisfies ChartConfig

const statusChartConfig = {
  count: { label: 'تعداد مشاهده' },
} satisfies ChartConfig

/** شکستن نام بلند فعالیت به حداکثر ۳ خط کوتاه — برچسب محور «مقایسهٔ فعالیت‌ها» §۱۴ */
function wrapActivityName(name: string, maxChars = 12, maxLines = 3): string[] {
  const words = name.split(/\s+/).filter(Boolean)
  if (words.length === 0) return ['']
  const lines: string[] = []
  for (const word of words) {
    if (lines.length >= maxLines) break
    const last = lines.length - 1
    if (last >= 0 && `${lines[last]} ${word}`.length <= maxChars) {
      lines[last] = `${lines[last]} ${word}`
    } else {
      lines.push(word)
    }
  }
  if (lines.join(' ') !== words.join(' ')) {
    lines[lines.length - 1] = `${lines[lines.length - 1]}…`
  }
  return lines
}

/** تیک چندخطیِ افقی با نام کامل؛ نام کامل در tooltip بومی SVG (title) — §۱۴ */
function ActivityNameTick({ x, y, payload }: { x?: number; y?: number; payload?: { value?: string } }) {
  const name = payload?.value ?? ''
  const lines = wrapActivityName(name)
  return (
    <text x={x ?? 0} y={y ?? 0} textAnchor="middle" fontSize={10} fill="var(--muted-foreground)">
      <title>{name}</title>
      {lines.map((line, i) => (
        <tspan key={i} x={x ?? 0} dy={i === 0 ? 0 : 11}>
          {line}
        </tspan>
      ))}
    </text>
  )
}

/** واحد محور عمودی — بالای محور؛ RLM برای جهت درست پرانتز در متن RTL §۱۴ */
function SecondsUnitLabel({ viewBox }: { viewBox?: { x: number; y: number; width: number; height: number } }) {
  if (!viewBox) return null
  return (
    <text x={viewBox.x + 2} y={viewBox.y + 4} fontSize={9} fill="var(--muted-foreground)" dominantBaseline="hanging">
      {'\u200F(ثانیه)\u200F'}
    </text>
  )
}

// ═══════════════ کارت خلاصه ═══════════════

function SummaryCard({ card }: { card: ProjectDashboardDto['cards'][number] }) {
  const prefs = useDisplayPrefs()
  const meta = CARD_META[card.key]
  const Icon = meta.icon
  const toneClass =
    card.tone === 'OK'
      ? 'border-green/40 bg-green-soft/50'
      : card.tone === 'WARNING'
        ? 'border-amber/40 bg-amber-soft/50'
        : 'border-border bg-card'
  const valueTone =
    card.tone === 'OK' ? 'text-green' : card.tone === 'WARNING' ? 'text-amber' : 'text-foreground'

  return (
    <Card className={cn('rounded-2xl transition-shadow hover:shadow-sm', toneClass)}>
      <CardContent className="space-y-2 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-sm font-bold leading-6">
            <Icon className="size-4 shrink-0 text-brand" aria-hidden />
            {card.title}
          </p>
          <HelpDot label={meta.title} content={meta.help} />
        </div>
        {card.value !== null ? (
          <p className={cn('text-2xl font-black tabular-nums sm:text-3xl', valueTone)}>
            {/* شمارش‌ها عدد صحیح؛ زمان‌ها با اعشار تنظیمات */}
            {card.key === 'samples' || card.key === 'target' ? (
              <>
                {formatInt(card.value, prefs)}
                {card.denominator !== null && (
                  <span className="text-base font-bold text-muted-foreground"> از {formatInt(card.denominator, prefs)}</span>
                )}{' '}
                <span className="text-base font-bold text-muted-foreground">{card.unit}</span>
              </>
            ) : (
              <>
                {formatTimeValue(card.value, prefs)}{' '}
                <span className="text-base font-bold text-muted-foreground">{card.unit}</span>
              </>
            )}
          </p>
        ) : (
          <div className="flex items-start gap-2 rounded-lg border border-dashed border-amber/50 bg-amber-soft/40 p-2.5">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber" aria-hidden />
            <p className="text-xs font-medium leading-5 text-amber">{displayServerText(card.reason ?? '', prefs)}</p>
          </div>
        )}
        <p className="text-[11px] leading-5 text-muted-foreground">{displayServerText(card.note, prefs)}</p>
      </CardContent>
    </Card>
  )
}

// ═══════════════ نمودار ۱: مقایسهٔ فعالیت‌ها ═══════════════

function ActivitiesWidget({ data }: { data: ProjectDashboardDto }) {
  const prefs = useDisplayPrefs()
  const navigate = useAppStore((s) => s.navigate)
  const chartData = data.activities
    .filter((a) => a.st !== null)
    .map((a) => ({ name: a.activityName, st: a.st as number }))
  const notComputable = data.activities.filter((a) => a.st === null)

  return (
    <div className="space-y-4">
      {chartData.length > 0 ? (
        <div className="h-44 w-full" dir="ltr">
          <ChartContainer config={stChartConfig} className="h-full w-full">
            <BarChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
              {/* نام کامل در چند خط افقی — بدون چرخش؛ interval=0 همهٔ تیک‌ها §۱۴ */}
              <XAxis
                dataKey="name"
                interval={0}
                height={64}
                tick={<ActivityNameTick />}
              />
              <YAxis tick={{ fontSize: 10 }} width={48} label={<SecondsUnitLabel />} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="st" fill="var(--brand)" radius={[6, 6, 0, 0]} maxBarSize={48} />
            </BarChart>
          </ChartContainer>
        </div>
      ) : (
        <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
          هنوز فعالیتی زمان استاندارد قابل نمایش ندارد.
        </p>
      )}
      {notComputable.length > 0 && (
        <p className="text-xs leading-5 text-amber">
          {formatInt(notComputable.length, prefs)} فعالیت در نمودار نیست:{' '}
          {notComputable
            .slice(0, 3)
            .map((a) => `«${a.activityName}» (${a.stStatus === 'NEEDS_AGGREGATION_RULE' ? 'نیازمند قاعدهٔ تجمیع' : 'ناقص'})`)
            .join('، ')}
          {notComputable.length > 3 ? ' و …' : ''}
        </p>
      )}

      {/* جدول وضعیت فعالیت‌ها */}
      <div className="max-h-96 overflow-y-auto rounded-xl border">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-muted/95 backdrop-blur">
            <TableRow>
              <TableHead className="text-right">ایستگاه / فعالیت</TableHead>
              <TableHead className="text-center">چرخهٔ معتبر</TableHead>
              <TableHead className="text-center">هدف</TableHead>
              <TableHead className="text-center">ST (ثانیه)</TableHead>
              <TableHead className="text-center">وضعیت</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.activities.map((a) => (
              <TableRow
                key={a.activityId}
                className="cursor-pointer"
                onClick={() =>
                  navigate({ name: 'project', projectId: data.project.id, stage: 'analysis' })
                }
              >
                <TableCell className="max-w-56">
                  <p className="truncate font-bold">{a.activityName}</p>
                  <p className="truncate text-xs text-muted-foreground">{a.stationName}</p>
                </TableCell>
                <TableCell className="text-center tabular-nums">
                  {formatInt(a.validCycles, prefs)}
                  <span className="text-muted-foreground"> / {formatInt(a.totalCycles, prefs)}</span>
                </TableCell>
                <TableCell className="text-center tabular-nums">
                  {a.target === null ? (
                    <span className="text-muted-foreground">ثبت نشده</span>
                  ) : a.targetReached ? (
                    <Badge className="gap-1 bg-green-soft px-2 text-green">
                      <CheckCircle2 className="size-3" aria-hidden />
                      رسیده
                    </Badge>
                  ) : (
                    <Badge className="gap-1 bg-amber-soft px-2 text-amber">
                      <AlertTriangle className="size-3" aria-hidden />
                      {formatInt(a.validCycles, prefs)} از {formatInt(a.target, prefs)}
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-center tabular-nums">
                  {a.st === null ? <span className="text-muted-foreground">—</span> : formatTimeValue(a.st, prefs)}
                </TableCell>
                <TableCell className="text-center">
                  {a.stStatus === 'OK' ? (
                    <Badge className="bg-green-soft px-2 text-green">قابل ارائه</Badge>
                  ) : a.stStatus === 'NEEDS_AGGREGATION_RULE' ? (
                    <Badge className="bg-amber-soft px-2 text-amber">قاعدهٔ تجمیع</Badge>
                  ) : (
                    <Badge className="bg-amber-soft px-2 text-amber">ناقص</Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

// ═══════════════ نمودار ۲: توزیع وضعیت ═══════════════

function StatusDonutWidget({ data }: { data: ProjectDashboardDto }) {
  const prefs = useDisplayPrefs()
  const s = data.observationStatus
  const total = s.valid + s.suspect + s.excluded + s.invalid
  const slices = [
    { key: 'valid', label: 'معتبر', count: s.valid, color: 'var(--brand)' },
    { key: 'suspect', label: 'مشکوک', count: s.suspect, color: 'var(--amber)' },
    { key: 'excluded', label: 'خارج‌شده', count: s.excluded, color: 'var(--red)' },
    { key: 'invalid', label: 'نامعتبر', count: s.invalid, color: 'var(--muted-foreground, #94a3b8)' },
  ].filter((x) => x.count > 0)

  if (total === 0) {
    return (
      <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
        هنوز مشاهده‌ای ثبت نشده است.
      </p>
    )
  }

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-5">
      {/* ستون راهنما — در RTL فرزند order-1 سمت راست قرار می‌گیرد؛ موبایل: دونات بالا §۱۴ */}
      <ul className="order-2 flex w-full min-w-0 flex-1 flex-col justify-center gap-2 sm:order-1 sm:max-w-80">
        {slices.map((slice) => (
          <li key={slice.key} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-1.5">
            <span className="flex min-w-0 items-center gap-2 text-sm">
              <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: slice.color }} aria-hidden />
              {slice.label}
            </span>
            <span className="shrink-0 text-sm font-bold tabular-nums">
              {formatInt(slice.count, prefs)}
              <span className="mr-1 font-normal text-muted-foreground">({formatPercent(slice.count / total, prefs)})</span>
            </span>
          </li>
        ))}
        {s.suspect > 0 && (
          <li className="rounded-lg bg-amber-soft/60 px-3 py-2 text-xs leading-5 text-amber">
            مشاهدهٔ مشکوک فقط هشدار است و در محاسبات می‌ماند؛ خروج از محاسبات فقط با تصمیم شما در مرحلهٔ تحلیل.
          </li>
        )}
      </ul>
      <div className="relative order-1 h-36 w-36 shrink-0 sm:order-2" dir="ltr">
        <ChartContainer config={statusChartConfig} className="h-full w-full">
          <PieChart>
            <ChartTooltip content={<ChartTooltipContent />} />
            <Pie
              data={slices}
              dataKey="count"
              nameKey="label"
              innerRadius={42}
              outerRadius={64}
              paddingAngle={slices.length > 1 ? 3 : 0}
              strokeWidth={2}
            >
              {slices.map((slice) => (
                <Cell key={slice.key} fill={slice.color} />
              ))}
            </Pie>
          </PieChart>
        </ChartContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-black tabular-nums">{formatInt(total, prefs)}</span>
          <span className="text-[10px] text-muted-foreground">مشاهده</span>
        </div>
      </div>
    </div>
  )
}

// ═══════════════ نمودار ۳: اپراتورها ═══════════════

function OperatorsWidget({ data }: { data: ProjectDashboardDto }) {
  const prefs = useDisplayPrefs()
  if (data.operators.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
        هنوز اپراتوری دادهٔ زمان‌سنجی ثبت نکرده است.
      </p>
    )
  }
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader className="bg-muted/60">
            <TableRow>
              <TableHead className="text-right">اپراتور</TableHead>
              <TableHead className="text-center">مشاهدات</TableHead>
              <TableHead className="text-center">فعالیت‌ها</TableHead>
              <TableHead className="text-center">شاخص نسبی</TableHead>
              <TableHead className="text-center">مشکوک</TableHead>
              <TableHead className="text-center">خارج‌شده</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.operators.map((op) => (
              <TableRow key={op.operatorId}>
                <TableCell className="font-bold">{op.operatorName}</TableCell>
                <TableCell className="text-center tabular-nums">{formatInt(op.observations, prefs)}</TableCell>
                <TableCell className="text-center tabular-nums">{formatInt(op.activitiesCount, prefs)}</TableCell>
                <TableCell className="text-center tabular-nums">
                  {op.relativeIndex === null ? (
                    <span className="text-muted-foreground">دادهٔ کافی نیست</span>
                  ) : (
                    <span
                      className={cn(
                        'font-bold',
                        op.relativeIndex > 1.05 ? 'text-amber' : op.relativeIndex < 0.95 ? 'text-green' : 'text-foreground'
                      )}
                    >
                      {formatPercent(op.relativeIndex, prefs, 1)}
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-center tabular-nums">
                  {op.suspectCount > 0 ? (
                    <span className="font-bold text-amber">{formatInt(op.suspectCount, prefs)}</span>
                  ) : (
                    formatInt(0, prefs)
                  )}
                </TableCell>
                <TableCell className="text-center tabular-nums">
                  {op.excludedCount > 0 ? (
                    <span className="font-bold text-red">{formatInt(op.excludedCount, prefs)}</span>
                  ) : (
                    formatInt(0, prefs)
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs leading-5 text-muted-foreground">
        شاخص نسبی = میانگین نسبت عملکرد اپراتور به زمان تجمیعی همان عناصر (۱۰۰٪ = مطابق تجمیع).
        تفاوت شاخص لزوماً به معنی ضعف نیست؛ مهارت، روش کار و شرایط باید مهندسی قضاوت شود.
      </p>
    </div>
  )
}

// ═══════════════ نمودار ۴: پراکندگی عناصر ═══════════════

function ElementCvWidget({ data }: { data: ProjectDashboardDto }) {
  const prefs = useDisplayPrefs()
  const rows = data.elementCv.filter((e) => e.cvPercent !== null).slice(0, 8)
  const maxCv = rows.length > 0 ? Math.max(...rows.map((e) => e.cvPercent as number)) : 0

  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
        هنوز عنصری با دادهٔ کافی برای محاسبهٔ پراکندگی وجود ندارد (حداقل ۲ مشاهدهٔ مبنای محاسبه لازم است).
      </p>
    )
  }

  return (
    <ul className="space-y-2.5">
      {rows.map((e, i) => {
        const cv = e.cvPercent as number
        const width = maxCv > 0 ? Math.max(4, (cv / maxCv) * 100) : 0
        const tone = cv > 25 ? 'var(--red)' : cv > 10 ? 'var(--amber)' : 'var(--green)'
        return (
          <li key={`${e.elementName}-${e.activityName}-${i}`} className="space-y-1">
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="min-w-0 truncate">
                <span className="font-bold">{e.elementName}</span>
                <span className="text-muted-foreground"> — {e.activityName}</span>
              </span>
              <span className="shrink-0 font-bold tabular-nums" style={{ color: tone }}>
                {formatPercent(cv / 100, prefs, 1)}
              </span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted" role="presentation">
              <div className="h-full rounded-full transition-all" style={{ width: `${width}%`, backgroundColor: tone }} />
            </div>
          </li>
        )
      })}
      <p className="pt-1 text-xs leading-5 text-muted-foreground">
        CV٪ = انحراف معیار نسبی مشاهدات مبنای محاسبه. آستانه‌های رنگی (۱۰٪ و ۲۵٪) صرفاً راهنمای بصری‌اند و قضاوت نهایی مهندسی است.
      </p>
    </ul>
  )
}

// ═══════════════ نمودار ۵: نیازهای بازبینی ═══════════════

function ReviewNeedsWidget({ data }: { data: ProjectDashboardDto }) {
  const prefs = useDisplayPrefs()
  const navigate = useAppStore((s) => s.navigate)
  const rn = data.reviewNeeds
  const hasAny =
    rn.suspectsPending > 0 ||
    rn.elementsWithoutRating.length > 0 ||
    rn.activitiesNeedingAggregationRule.length > 0 ||
    rn.activitiesIncomplete.length > 0 ||
    rn.sampleShortfall.length > 0 ||
    rn.needsRecalc

  if (!hasAny) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-green/40 bg-green-soft/40 p-4">
        <CheckCircle2 className="size-6 shrink-0 text-green" aria-hidden />
        <div>
          <p className="font-bold text-green">موردی برای بازبینی نیست</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            داده‌ها بازبینی شده‌اند و آخرین محاسبه به‌روز است. آخرین اجرا:{' '}
            {rn.lastCalculationAt ? formatDateTime(rn.lastCalculationAt, prefs) : '—'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <ul className="grid items-stretch gap-2.5 sm:grid-cols-2">
      {rn.needsRecalc && (
        <li className="flex h-full flex-col gap-2 rounded-xl border border-amber/40 bg-amber-soft/40 p-3">
          <span className="flex items-start gap-2 text-sm leading-6">
            <History className="mt-0.5 size-4 shrink-0 text-amber" aria-hidden />
            <span>
              پس از آخرین تغییر مؤثر، محاسبهٔ رسمی تازه‌سازی نشده است
              {rn.lastCalculationAt ? ` (آخرین اجرا: ${formatDateTime(rn.lastCalculationAt, prefs)})` : ' (هنوز اجرا نشده)'}.
            </span>
          </span>
          <Button
            size="sm"
            variant="outline"
            className="mt-auto self-start"
            onClick={() => navigate({ name: 'project', projectId: data.project.id, stage: 'analysis' })}
          >
            رفتن به تحلیل
          </Button>
        </li>
      )}
      {rn.suspectsPending > 0 && (
        <li className="flex h-full flex-col gap-2 rounded-xl border border-amber/40 bg-amber-soft/40 p-3">
          <span className="flex items-start gap-2 text-sm leading-6">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber" aria-hidden />
            <span>
              <b>{formatInt(rn.suspectsPending, prefs)}</b> مشاهدهٔ مشکوک بازبینی نشده:{' '}
              {rn.suspectsByActivity.map((x) => `«${x.activityName}» (${formatInt(x.count, prefs)})`).join('، ')}.
              تا بازبینی، این مقادیر در محاسبات می‌مانند.
            </span>
          </span>
          <Button
            size="sm"
            variant="outline"
            className="mt-auto self-start"
            onClick={() => navigate({ name: 'project', projectId: data.project.id, stage: 'analysis' })}
          >
            بازبینی در تحلیل
          </Button>
        </li>
      )}
      {rn.elementsWithoutRating.length > 0 && (
        <li className="flex h-full flex-col gap-2 rounded-xl border border-amber/40 bg-amber-soft/40 p-3">
          <span className="flex items-start gap-2 text-sm leading-6">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber" aria-hidden />
            <span>
              <b>{formatInt(rn.elementsWithoutRating.length, prefs)}</b> عنصر ارزیابی وستینگهاوس ندارد؛ NT/ST آن‌ها قابل محاسبه
              نیست: {rn.elementsWithoutRating.slice(0, 4).join('، ')}
              {rn.elementsWithoutRating.length > 4 ? ' و …' : ''}.
            </span>
          </span>
          <Button
            size="sm"
            variant="outline"
            className="mt-auto self-start"
            onClick={() => navigate({ name: 'project', projectId: data.project.id, stage: 'westinghouse' })}
          >
            ارزیابی وستینگهاوس
          </Button>
        </li>
      )}
      {rn.activitiesNeedingAggregationRule.length > 0 && (
        <li className="flex h-full flex-col gap-2 rounded-xl border border-amber/40 bg-amber-soft/40 p-3 text-sm leading-6">
          <span className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber" aria-hidden />
            <span>
              فعالیت‌های دارای کار هم‌زمان نیازمند قاعدهٔ تجمیع‌اند؛ زمان استاندارد کل آن‌ها تعیین نشده:{' '}
              {rn.activitiesNeedingAggregationRule.join('، ')}.
            </span>
          </span>
        </li>
      )}
      {rn.sampleShortfall.length > 0 && (
        <li className="flex h-full flex-col gap-2 rounded-xl border border-amber/40 bg-amber-soft/40 p-3 text-sm leading-6">
          <span className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber" aria-hidden />
            <span>
              {formatInt(rn.sampleShortfall.length, prefs)} فعالیت به هدف نمونه نرسیده است:{' '}
              {rn.sampleShortfall.map((x) => `«${x.activityName}» (${formatInt(x.valid, prefs)}/${formatInt(x.target, prefs)})`).join('، ')}.
              رسیدن به هدف، کفایت آماری را تضمین نمی‌کند.
            </span>
          </span>
        </li>
      )}
    </ul>
  )
}

// ═══════════════ دیالوگ شخصی‌سازی ═══════════════

function PersonalizeDialog({
  open,
  onOpenChange,
  projectId,
  serverLayout,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  serverLayout: DashboardLayoutDto | null
}) {
  const qc = useQueryClient()
  // پیش‌نویس محلی — تا ذخیره، چیزی تغییر نمی‌کند
  const [draft, setDraft] = useState<DashboardLayoutDto | null>(null)
  const effective = draft ?? normalizeLayout(serverLayout)

  const saveMutation = useMutation({
    mutationFn: (layout: DashboardLayoutDto) => dashboardApi.putLayout(projectId, layout),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: qk.dashboardLayout(projectId) })
      setDraft(null)
      onOpenChange(false)
      toast.success('چیدمان داشبورد ذخیره شد.')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const move = (list: string[], index: number, direction: -1 | 1): string[] => {
    const next = [...list]
    const target = index + direction
    if (target < 0 || target >= next.length) return next
    ;[next[index], next[target]] = [next[target], next[index]]
    return next
  }

  const renderRows = (
    keys: string[],
    metaLookup: Record<string, { title: string }>,
    listKind: 'cardOrder' | 'widgetOrder',
    hiddenKind: 'hiddenCards' | 'hiddenWidgets'
  ) => (
    <ul className="space-y-1.5">
      {keys.map((key, index) => {
        const hidden = (effective[hiddenKind] ?? []).includes(key)
        return (
          <li
            key={key}
            className={cn(
              'flex items-center justify-between gap-2 rounded-xl border p-2.5 transition-colors',
              hidden ? 'border-dashed border-border bg-muted/30 opacity-70' : 'border-border bg-card'
            )}
          >
            <span className="flex min-w-0 items-center gap-2">
              <span className="flex flex-col gap-0.5" aria-hidden>
                <button
                  type="button"
                  className="rounded p-0.5 hover:bg-muted disabled:opacity-30"
                  disabled={index === 0}
                  aria-label={`انتقال ${metaLookup[key]?.title ?? key} به بالا`}
                  onClick={() => setDraft((d) => ({ ...(d ?? normalizeLayout(serverLayout)), [listKind]: move(keys, index, -1) }))}
                >
                  <ArrowUp className="size-3.5" />
                </button>
                <button
                  type="button"
                  className="rounded p-0.5 hover:bg-muted disabled:opacity-30"
                  disabled={index === keys.length - 1}
                  aria-label={`انتقال ${metaLookup[key]?.title ?? key} به پایین`}
                  onClick={() => setDraft((d) => ({ ...(d ?? normalizeLayout(serverLayout)), [listKind]: move(keys, index, 1) }))}
                >
                  <ArrowDown className="size-3.5" />
                </button>
              </span>
              <span className="truncate text-sm font-bold">{metaLookup[key]?.title ?? key}</span>
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <span className="text-xs tabular-nums text-muted-foreground">جایگاه {index + 1}</span>
              <Switch
                checked={!hidden}
                onCheckedChange={(visible) =>
                  setDraft((d) => {
                    const base = d ?? normalizeLayout(serverLayout)
                    const current = new Set(base[hiddenKind] ?? [])
                    if (visible) current.delete(key)
                    else current.add(key)
                    return { ...base, [hiddenKind]: [...current] }
                  })
                }
                aria-label={`نمایش ${metaLookup[key]?.title ?? key}`}
              />
            </span>
          </li>
        )
      })}
    </ul>
  )

  const cardMetaLookup = Object.fromEntries(
    (Object.keys(CARD_META) as CardKey[]).map((k) => [k, { title: CARD_META[k].title }])
  )
  const widgetMetaLookup = Object.fromEntries(
    (Object.keys(WIDGET_META) as WidgetKey[]).map((k) => [k, { title: WIDGET_META[k].title }])
  )

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) setDraft(null); onOpenChange(next) }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LayoutDashboard className="size-5 text-brand" aria-hidden />
            شخصی‌سازی داشبورد
          </DialogTitle>
          <DialogDescription>
            ترتیب و مرئی‌بودن کارت‌ها و نمودارها را تعیین کنید؛ چیدمان برای این پروژه ذخیره می‌شود و روی محاسبات اثری ندارد.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-2">
            <Label className="text-sm font-bold">کارت‌های خلاصه</Label>
            {renderRows(effective.cardOrder ?? [...DEFAULT_CARD_ORDER], cardMetaLookup, 'cardOrder', 'hiddenCards')}
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-bold">نمودارها و شاخص‌ها</Label>
            {renderRows(effective.widgetOrder ?? [...DEFAULT_WIDGET_ORDER], widgetMetaLookup, 'widgetOrder', 'hiddenWidgets')}
          </div>
        </div>

        <DialogFooter className="flex-row gap-2 sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1.5"
            onClick={() => setDraft({ cardOrder: [...DEFAULT_CARD_ORDER], hiddenCards: [], widgetOrder: [...DEFAULT_WIDGET_ORDER], hiddenWidgets: [] })}
          >
            <RotateCcw className="size-4" aria-hidden />
            بازگشت به پیش‌فرض
          </Button>
          <Button
            type="button"
            className="btn-brand gap-2"
            onClick={() => saveMutation.mutate(effective)}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Save className="size-4" aria-hidden />}
            ذخیرهٔ چیدمان
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** نرمال‌سازی چیدمان ذخیره‌شده — کلیدهای ناشناخته حذف و جاافتاده‌ها تکمیل می‌شوند */
function normalizeLayout(layout: DashboardLayoutDto | null): Required<DashboardLayoutDto> {
  const cards = (layout?.cardOrder ?? []).filter((k) => DEFAULT_CARD_ORDER.includes(k as CardKey))
  const widgets = (layout?.widgetOrder ?? []).filter((k) => DEFAULT_WIDGET_ORDER.includes(k as WidgetKey))
  return {
    cardOrder: [...cards, ...DEFAULT_CARD_ORDER.filter((k) => !cards.includes(k))],
    hiddenCards: (layout?.hiddenCards ?? []).filter((k) => DEFAULT_CARD_ORDER.includes(k as CardKey)),
    widgetOrder: [...widgets, ...DEFAULT_WIDGET_ORDER.filter((k) => !widgets.includes(k))],
    hiddenWidgets: (layout?.hiddenWidgets ?? []).filter((k) => DEFAULT_WIDGET_ORDER.includes(k as WidgetKey)),
  }
}

// ═══════════════ نمای اصلی ═══════════════

export default function DashboardView({ projectId }: { projectId: string }) {
  const prefs = useDisplayPrefs()
  const navigate = useAppStore((s) => s.navigate)
  const [personalizeOpen, setPersonalizeOpen] = useState(false)
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({})

  const dashboardQuery = useQuery({
    queryKey: qk.dashboard(projectId),
    queryFn: () => dashboardApi.get(projectId),
  })
  const layoutQuery = useQuery({
    queryKey: qk.dashboardLayout(projectId),
    queryFn: () => dashboardApi.getLayout(projectId),
  })

  const data = dashboardQuery.data
  const layout = useMemo(() => normalizeLayout(layoutQuery.data?.layout ?? null), [layoutQuery.data])

  if (dashboardQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-16 rounded-2xl" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-72 rounded-2xl" />
        <Skeleton className="h-56 rounded-2xl" />
      </div>
    )
  }

  if (dashboardQuery.isError) {
    return (
      <EmptyState
        title="بارگذاری داشبورد ناموفق بود"
        description={(dashboardQuery.error as Error).message}
        action={
          <Button variant="outline" onClick={() => dashboardQuery.refetch()}>
            <RefreshCw className="size-4" aria-hidden />
            تلاش مجدد
          </Button>
        }
      />
    )
  }

  if (!data) return null

  if (data.counts.activities === 0) {
    return (
      <EmptyState
        icon={<LayoutDashboard className="size-7" aria-hidden />}
        title="داشبورد هنوز داده‌ای برای نمایش ندارد"
        description="برای شروع، در «ساختار تولید» ایستگاه و فعالیت تعریف کنید و دادهٔ زمان‌سنجی ثبت نمایید. کارت‌ها به‌محض وجود داده فعال می‌شوند."
        action={
          <Button className="btn-brand" onClick={() => navigate({ name: 'project', projectId, stage: 'structure' })}>
            رفتن به ساختار تولید
          </Button>
        }
      />
    )
  }

  const visibleCards = (layout.cardOrder as CardKey[]).filter(
    (k) => !(layout.hiddenCards as CardKey[]).includes(k) && data.cards.some((c) => c.key === k)
  )
  const cardsByKey = new Map(data.cards.map((c) => [c.key, c]))
  const visibleWidgets = (layout.widgetOrder as WidgetKey[]).filter(
    (k) => !(layout.hiddenWidgets as WidgetKey[]).includes(k)
  )

  const renderWidget = (key: WidgetKey) => {
    switch (key) {
      case 'activities':
        return <ActivitiesWidget data={data} />
      case 'statusDonut':
        return <StatusDonutWidget data={data} />
      case 'operators':
        return <OperatorsWidget data={data} />
      case 'elementCv':
        return <ElementCvWidget data={data} />
      case 'reviewNeeds':
        return <ReviewNeedsWidget data={data} />
    }
  }

  return (
    <div className="space-y-5">
      {/* ── سربرگ — چسبان زیر نوار اصلی (v1.5.2 §۸) ── */}
      <SectionHeading>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="flex flex-wrap items-center gap-2 text-lg font-black">
              <LayoutDashboard className="size-5 text-brand" aria-hidden />
              داشبورد تحلیل
              <HelpDot
                label="داشبورد تحلیل"
                content={{
                  what: 'نمای کلی مطالعه با کارت‌های خلاصه و شاخص‌های تخصصی؛ همهٔ اعداد از دادهٔ واقعی محاسبه می‌شوند.',
                  input: 'شخصی‌سازی کنید: کارت‌ها و نمودارها را مرتب، مخفی یا نمایان کنید — چیدمان ذخیره می‌شود.',
                  example: 'اگر فقط «پراکندگی عناصر» برایتان مهم است، بقیهٔ نمودارها را مخفی کنید تا داشبورد ساده بماند.',
                  note: 'کارت‌ها هرگز مقدار ساختگی نشان نمی‌دهند؛ اگر داده کافی نباشد، علت را می‌بینید.',
                }}
              />
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {data.project.name} · {formatInt(data.counts.activities, prefs)} فعالیت ·{' '}
              {formatInt(data.counts.elements, prefs)} عنصر · {formatInt(data.counts.operators, prefs)} اپراتور ·{' '}
              {formatInt(data.counts.sessions, prefs)} جلسه — به‌روزرسانی: {formatDateTime(data.generatedAt, prefs)}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => navigate({ name: 'project', projectId, stage: 'reports' })}>
              <FileSpreadsheet className="size-4" aria-hidden />
              گزارش‌ها و خروجی
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setPersonalizeOpen(true)}>
              <LayoutDashboard className="size-4" aria-hidden />
              شخصی‌سازی
            </Button>
          </div>
        </div>
      </SectionHeading>

      {/* ── کارت‌های خلاصه — همیشه ابتدا — FR-21 ── */}
      {visibleCards.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {visibleCards.map((key) => {
            const card = cardsByKey.get(key)
            return card ? <SummaryCard key={key} card={card} /> : null
          })}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
          همهٔ کارت‌های خلاصه مخفی شده‌اند؛ از «شخصی‌سازی» می‌توانید آن‌ها را نمایان کنید.
        </p>
      )}

      {/* ── نمودارها و شاخص‌های تخصصی — بخش‌های بازشونده ── */}
      {visibleWidgets.length > 0 ? (
        <div className="space-y-4">
          {visibleWidgets.map((key) => {
            const meta = WIDGET_META[key]
            const Icon = meta.icon
            const isOpen = openSections[key] ?? true
            return (
              <Collapsible key={key} open={isOpen} onOpenChange={(next) => setOpenSections((s) => ({ ...s, [key]: next }))}>
                <Card className="rounded-2xl">
                  <CardHeader className="pb-0">
                    {/* دکمهٔ باز/بسته مستقل؛ HelpDot دکمهٔ جدا (button تودرتو ممنوع) */}
                    <div className="flex w-full flex-wrap items-center justify-between gap-2">
                      <CollapsibleTrigger asChild>
                        <button
                          type="button"
                          className="group flex items-center gap-2 text-right"
                          aria-expanded={isOpen}
                        >
                          <Icon className="size-5 text-brand" aria-hidden />
                          <CardTitle className="text-base">{meta.title}</CardTitle>
                          <ChevronLeft
                            className={cn('size-4 text-faint transition-transform', isOpen && '-rotate-90')}
                            aria-hidden
                          />
                        </button>
                      </CollapsibleTrigger>
                      <HelpDot label={meta.title} content={meta.help} />
                    </div>
                  </CardHeader>
                  <CollapsibleContent>
                    <CardContent className="pt-4">{renderWidget(key)}</CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            )
          })}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
          همهٔ نمودارها مخفی شده‌اند؛ از «شخصی‌سازی» می‌توانید آن‌ها را نمایان کنید.
        </p>
      )}

      <PersonalizeDialog
        open={personalizeOpen}
        onOpenChange={setPersonalizeOpen}
        projectId={projectId}
        serverLayout={layoutQuery.data?.layout ?? null}
      />
    </div>
  )
}
