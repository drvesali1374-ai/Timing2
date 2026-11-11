'use client'

// ═══════════════════════════════════════════════════════════
// بخش «الونس‌ها و زمان‌های مجاز» — جلسه اول (§۶)
// یک بخش واحد برای چهار scope (خط/ایستگاه/فعالیت/عنصر)؛
// ارث‌رسیده و اختصاصی در یک فهرست.
// عملیات: جایگزینی، حذف از ارث‌بری، بازگردانی به والد،
// تغییر مبنا، حذف تخصیص محلی، افزودن از فهرست مرکزی،
// ایجاد تعریف جدید در همین فرم.
// ═══════════════════════════════════════════════════════════
import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  AlertTriangle,
  Ban,
  CirclePlus,
  Loader2,
  MoreHorizontal,
  PencilLine,
  Plus,
  RotateCcw,
  Tags,
  Timer,
  X,
} from 'lucide-react'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { HelpDot } from '@/components/common/HelpDot'
import { PercentInput, PersianNumberInput } from '@/components/common/PersianNumberInput'
import { EmptyState } from '@/components/common/Feedback'
import {
  allowancesApi,
  type AllowanceDefinitionDto,
  type AllowanceOpInput,
  type ResolvedAllowanceRowDto,
  type ScopeAllowancesDto,
} from '@/lib/api/endpoints'
import { qk } from '@/lib/api/keys'
import { formatPercent, formatTimeValue } from '@/lib/format'
import { useDisplayPrefs } from '@/store/display-store'
import { cn } from '@/lib/utils'

// ── راهنمای آیکونی ──

const BASIS_HELP = {
  what: 'مبنای وقوع، مشخص می‌کند زمان ثابت الونس چه زمانی به زمان استاندارد افزوده می‌شود.',
  input: '«به‌ازای هر اجرای عنصر» برای زمان‌هایی مثل ابزاربرداری هر قطعه؛ «یک‌بار در هر چرخه» برای زمان‌های شخصی/شیفتی مثل استراحت.',
  example: 'استراحت ۵ دقیقه‌ای هر چرخه = زمان ثابت با مبنا «هر چرخه»؛ بازرسی قالب هر قطعه = «هر اجرا».',
  note: 'الونس «هر چرخه» فقط یک‌بار در سطح چرخه اعمال می‌شود و در زمان استاندارد تک‌تک عناصر ضرب نمی‌شود.',
} as const

const ALLOWANCES_SECTION_HELP = {
  what: 'الونس‌ها (زمان‌های مجاز) به‌صورت سلسله‌مراتبی از خط تولید به ایستگاه، فعالیت و عنصر کاری ارث می‌رسند. در هر سطح می‌توانید مقدار را جایگزین کنید، آن را از ارث‌بری حذف کنید یا مقدار اختصاصی ثبت کنید.',
  input: 'با «افزودن الونس» از فهرست مرکزی پروژه انتخاب کنید؛ مقدار پیش‌فرض تعریف صرفاً پیشنهاد اولیه است.',
  example: 'استراحت و نیازهای شخصی ۵٪ در سطح خط + ابزاربرداری ۳۰ ثانیه برای یک عنصر خاص.',
  note: 'نزدیک‌ترین تخصیص به عنصر ملاک است؛ حذف از ارث‌بری در یک سطح، همان الونس را در کل زیرشاخه غیرفعال می‌کند.',
} as const

// ── کمکی‌ها ──

export type AllowanceScope = 'PROJECT' | 'STATION' | 'ACTIVITY' | 'WORK_ELEMENT'

const SCOPE_FETCH = {
  PROJECT: allowancesApi.projectAllowances,
  STATION: allowancesApi.stationAllowances,
  ACTIVITY: allowancesApi.activityAllowances,
  WORK_ELEMENT: allowancesApi.elementAllowances,
} as const

const SCOPE_PUT = {
  PROJECT: allowancesApi.putProjectAllowances,
  STATION: allowancesApi.putStationAllowances,
  ACTIVITY: allowancesApi.putActivityAllowances,
  WORK_ELEMENT: allowancesApi.putElementAllowances,
} as const

const SCOPE_LABELS: Record<string, string> = {
  PROJECT: 'خط تولید',
  STATION: 'ایستگاه',
  ACTIVITY: 'فعالیت',
  WORK_ELEMENT: 'عنصر کاری',
}

const STATUS_BADGE: Record<ResolvedAllowanceRowDto['status'], { label: string; className: string }> = {
  INHERITED: { label: 'ارث‌رسیده', className: 'border-0 bg-brand-soft text-brand' },
  OVERRIDDEN: { label: 'جایگزین‌شده', className: 'border-0 bg-amber-soft text-amber' },
  CUSTOM: { label: 'اختصاصی', className: 'border-0 bg-green-soft text-green' },
  EXCLUDED: { label: 'حذف از ارث‌بری', className: 'border-0 bg-red-soft text-red' },
}

function defaultBasis(scope: AllowanceScope): 'PER_ELEMENT_EXECUTION' | 'PER_CYCLE' {
  return scope === 'WORK_ELEMENT' ? 'PER_ELEMENT_EXECUTION' : 'PER_CYCLE'
}

type Prefs = ReturnType<typeof useDisplayPrefs>

function formatSeconds(v: number | null, prefs: Prefs): string {
  if (v === null) return '—'
  return `${formatTimeValue(v, prefs)} ثانیه`
}

/** برچسب مبنای زمان ثابت — null هرگز به «هر اجرا» تبدیل نمی‌شود (بازبینی تکمیلی ج۱) */
function basisLabel(basis: 'PER_ELEMENT_EXECUTION' | 'PER_CYCLE' | null | undefined): string {
  if (basis === 'PER_CYCLE') return 'هر چرخه'
  if (basis === 'PER_ELEMENT_EXECUTION') return 'هر اجرا'
  return 'مبنا نامشخص'
}

/** برچسب منوی عملیات Restore — با وضعیت واقعی تخصیص هماهنگ (الزام ۴) */
function restoreMenuLabel(row: ResolvedAllowanceRowDto): string {
  if (row.status === 'CUSTOM') return 'حذف تخصیص محلی'
  if (row.status === 'EXCLUDED') return row.parentMode === 'ACTIVE' ? 'بازگردانی الونس والد' : 'حذف استثنای محلی'
  // والد مستقیم EXCLUDE است → Restore فقط تخصیص محلی را حذف می‌کند و وضعیت
  // «حذف از ارث‌بری» والد دوباره برقرار می‌شود — «مقدار» والدی برای بازگشت نیست.
  if (row.parentMode === 'EXCLUDE') return 'بازگردانی به وضعیت والد (حذف تخصیص محلی)'
  return 'بازگردانی به مقدار والد'
}

/** پیام موفقیت Restore — متن هماهنگ با وضعیت والد (گمراه‌کننده نباشد) */
function restoreToast(row: ResolvedAllowanceRowDto): string {
  if (row.status === 'CUSTOM') return `تخصیص محلی «${row.title}» حذف شد`
  if (row.status === 'EXCLUDED') {
    return row.parentMode === 'ACTIVE'
      ? `استثنای محلی «${row.title}» حذف شد و الونس والد بازگشت`
      : `استثنای محلی «${row.title}» حذف شد`
  }
  if (row.parentMode === 'EXCLUDE') {
    return `تخصیص محلی «${row.title}» حذف شد و وضعیت حذف از ارث‌بری والد دوباره برقرار شد`
  }
  return `تخصیص محلی «${row.title}» حذف شد و مقدار والد بازگشت`
}

/** مقدار والد با «نوع و مبنای خودش» قالب‌بندی می‌شود — نه نوع تخصیص محلی (الزام ۳) */
function formatParentValue(row: ResolvedAllowanceRowDto, prefs: Prefs): string {
  if (row.parentValue === null || row.parentValue === undefined) return '—'
  if (row.parentValueType === 'PERCENT') return formatPercent(row.parentValue, prefs, 2)
  const seconds = `${formatTimeValue(row.parentValue, prefs, 1)} ثانیه`
  const basis =
    row.parentApplicationBasis === 'PER_CYCLE' ? ' (هر چرخه)' : row.parentApplicationBasis === 'PER_ELEMENT_EXECUTION' ? ' (هر اجرا)' : ''
  return seconds + basis
}

// ═══════════════ بخش اصلی ═══════════════

export function AllowanceSection({
  projectId,
  scopeType,
  scopeId,
  compact = false,
}: {
  projectId: string
  scopeType: AllowanceScope
  scopeId: string
  /** حالت فشرده برای دیالوگ‌ها (بدون کارت) */
  compact?: boolean
}) {
  const prefs = useDisplayPrefs()
  const qc = useQueryClient()
  const [addOpen, setAddOpen] = useState(false)
  const [editing, setEditing] = useState<{ definition: AllowanceDefinitionDto; row: ResolvedAllowanceRowDto | null } | null>(null)
  const [creating, setCreating] = useState(false)
  const [excluding, setExcluding] = useState<ResolvedAllowanceRowDto | null>(null)
  const [basisTarget, setBasisTarget] = useState<ResolvedAllowanceRowDto | null>(null)

  const query = useQuery({
    queryKey: qk.scopeAllowances(scopeType, scopeId),
    queryFn: () => SCOPE_FETCH[scopeType](scopeId),
  })
  const data = query.data

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['scope-allowances'] })
    void qc.invalidateQueries({ queryKey: qk.allowanceDefinitions(projectId) })
    void qc.invalidateQueries({ queryKey: qk.projectSummary(projectId) })
    void qc.invalidateQueries({ queryKey: qk.projects() })
    void qc.invalidateQueries({ queryKey: ['activity-analysis'] })
    void qc.invalidateQueries({ queryKey: ['latest-calculation'] })
    void qc.invalidateQueries({ queryKey: ['study-report'] })
  }

  const putMutation = useMutation({
    mutationFn: (ops: AllowanceOpInput[]) =>
      SCOPE_PUT[scopeType](scopeId, ops, data?.lastModifiedAt ?? undefined),
    onSuccess: (res) => {
      qc.setQueryData(qk.scopeAllowances(scopeType, scopeId), res)
      invalidate()
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'ثبت تغییرات الونس ناموفق بود')
      void query.refetch()
    },
  })

  const runOp = (op: AllowanceOpInput, successMsg?: string) => {
    putMutation.mutate([op], {
      onSuccess: () => {
        if (successMsg) toast.success(successMsg)
      },
    })
  }

  const scopeTitle =
    scopeType === 'PROJECT'
      ? 'سطح خط تولید (همه ایستگاه‌ها و فعالیت‌ها)'
      : scopeType === 'STATION'
        ? 'سطح ایستگاه (فعالیت‌ها و عناصر زیرمجموعه)'
        : scopeType === 'ACTIVITY'
          ? 'سطح فعالیت (عناصر کاری زیرمجموعه)'
          : 'سطح عنصر کاری'

  const rows = data?.resolved.rows ?? []
  const summary = data?.resolved.summary
  const needsAggregation = rows.filter((r) => r.needsAggregationRule)

  return (
    <section
      aria-label="الونس‌ها و زمان‌های مجاز"
      className={cn(compact ? 'space-y-3' : 'card-premium overflow-hidden')}
    >
      {/* هدر */}
      <div className={cn(!compact && 'card-head flex flex-wrap items-center justify-between gap-3 p-4 pb-3')}>
        <div className="flex items-center gap-2.5">
          <span className="chip-icon bg-brand-soft text-brand">
            <Tags className="size-5" aria-hidden />
          </span>
          <div>
            <h3 className="text-sm font-extrabold">الونس‌ها و زمان‌های مجاز</h3>
            <p className="text-[11px] text-muted-foreground">{scopeTitle}</p>
          </div>
          <HelpDot label="الونس‌ها و زمان‌های مجاز" content={ALLOWANCES_SECTION_HELP} />
        </div>
        <div className="flex items-center gap-2">
          {data && (
            <Badge variant="outline" className="num border-border/60 bg-surface-2 text-[11px]">
              {data.settings.methodLabel}
            </Badge>
          )}
          <Button
            size="sm"
            className="btn-brand gap-1.5 border-0"
            onClick={() => setAddOpen(true)}
            disabled={query.isLoading}
          >
            <Plus className="size-4" aria-hidden />
            افزودن الونس
          </Button>
        </div>
      </div>

      {/* بدنه */}
      <div className={cn(compact ? '' : 'space-y-3 p-4 pt-3', 'space-y-3')}>
        {query.isLoading ? (
          <p className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            در حال بارگذاری الونس‌ها…
          </p>
        ) : query.isError ? (
          <EmptyState
            title="بارگذاری الونس‌ها ناموفق بود"
            description={query.error instanceof Error ? query.error.message : 'خطای نامشخص'}
            action={
              <Button variant="outline" size="sm" onClick={() => query.refetch()}>
                تلاش مجدد
              </Button>
            }
          />
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/70 bg-surface-2/50 p-4 text-center">
            <p className="text-sm font-bold">هنوز الونسی برای این سطح تعریف نشده است</p>
            <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-muted-foreground">
              الونس‌های تعریف‌شده در سطوح بالاتر (خط تولید/ایستگاه/فعالیت) به‌طور خودکار به این سطح ارث می‌رسند.
              با «افزودن الونس» می‌توانید مقدار اختصاصی همین سطح را ثبت کنید.
            </p>
          </div>
        ) : (
          <>
            {/* جدول دسکتاپ */}
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60 text-center text-[11px] text-muted-foreground">
                    <th className="px-3 py-2 text-right font-bold">عنوان الونس</th>
                    <th className="px-3 py-2 font-bold">نوع و مبنا</th>
                    <th className="px-3 py-2 font-bold">مقدار مؤثر</th>
                    <th className="px-3 py-2 font-bold">مبدأ</th>
                    <th className="px-3 py-2 font-bold">وضعیت</th>
                    <th className="px-2 py-2 font-bold">عملیات</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <AllowanceRowDesktop
                      key={row.definitionId}
                      row={row}
                      prefs={prefs}
                      onEdit={() => {
                        const def = data?.definitions.find((d) => d.id === row.definitionId)
                        if (def) setEditing({ definition: def, row })
                      }}
                      onExclude={() => setExcluding(row)}
                      onRestore={() => runOp({ definitionId: row.definitionId, action: 'RESTORE' }, restoreToast(row)) }
                      onBasis={() => setBasisTarget(row)}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            {/* کارت موبایل */}
            <div className="space-y-2 sm:hidden">
              {rows.map((row) => (
                <AllowanceRowMobile
                  key={row.definitionId}
                  row={row}
                  prefs={prefs}
                  onEdit={() => {
                    const def = data?.definitions.find((d) => d.id === row.definitionId)
                    if (def) setEditing({ definition: def, row })
                  }}
                  onExclude={() => setExcluding(row)}
                  onRestore={() => runOp({ definitionId: row.definitionId, action: 'RESTORE' }, restoreToast(row)) }
                  onBasis={() => setBasisTarget(row)}
                />
              ))}
            </div>

            {/* خلاصه — §۶ */}
            {summary && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl bg-surface-2/70 px-3.5 py-2.5 text-xs">
                <span className="font-bold">
                  خلاصه: <span className="num text-brand">{formatIntFa(summary.count)} الونس مؤثر</span>
                </span>
                <span className="num">
                  جمع درصدها (A): <b className="text-brand">{formatPercent(summary.totalPercent, prefs, 2)}</b>
                </span>
                <span className="num">
                  زمان ثابت هر اجرا: <b>{formatSeconds(summary.perExecutionSeconds, prefs)}</b>
                </span>
                <span className="num">
                  زمان ثابت هر چرخه: <b>{formatSeconds(summary.perCycleSeconds, prefs)}</b>
                  <span className="text-faint"> (جدا از ST عناصر)</span>
                </span>
                {data?.settings.formula && (
                  <Badge variant="outline" dir="ltr" className="num border-border/60 text-[10px]">
                    {data.settings.formula}
                  </Badge>
                )}
              </div>
            )}

            {/* ردیف‌های نیازمند قاعده تجمیع — §۲.۳/۳.۳ */}
            {needsAggregation.length > 0 && (
              <div className="rounded-xl bg-amber-soft p-3 text-xs leading-6">
                <p className="flex items-center gap-1.5 font-bold text-amber">
                  <AlertTriangle className="size-4" aria-hidden />
                  {formatIntFa(needsAggregation.length)} الونس زمان ثابت «هر اجرا» در سطح بالاتر از عنصر — نیازمند قاعده تجمیع
                </p>
                <ul className="mt-1 list-inside list-disc space-y-0.5 text-muted-foreground">
                  {needsAggregation.map((r) => (
                    <li key={r.definitionId} className="num">
                      «{r.title}» — {formatSeconds(r.timeValueSeconds, prefs)} از سطح «
                      {r.sourceScopeLabel ?? SCOPE_LABELS[r.sourceScopeType ?? ''] ?? '—'}»؛ تا تعریف قاعده تجمیع
                      مهندسی، بی‌صدا حذف یا چندبار اعمال نمی‌شود.
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>

      {/* افزودن از فهرست مرکزی */}
      {data && (
        <AddAllowancePopover
          open={addOpen}
          onOpenChange={setAddOpen}
          data={data}
          onPick={(def) => setEditing({ definition: def, row: null })}
          onCreateNew={() => {
            setAddOpen(false)
            setCreating(true)
          }}
        />
      )}

      {/* ویرایشگر مقدار (جایگزینی / افزودن) */}
      {editing && data && (
        <AllowanceEditorDialog
          key={editing.definition.id}
          definition={editing.definition}
          row={editing.row}
          scopeType={scopeType}
          scopeLabel={data.scope.label}
          saving={putMutation.isPending}
          onClose={() => setEditing(null)}
          onSave={(op) => {
            runOp(op, editing.row ? `مقدار «${editing.definition.title}» جایگزین شد` : `الونس «${editing.definition.title}» اضافه شد`)
            setEditing(null)
          }}
        />
      )}

      {/* ایجاد تعریف جدید از فرم — §۲.۲ */}
      <DefinitionCreateDialog
        open={creating}
        onOpenChange={setCreating}
        projectId={projectId}
        onCreated={(def) => {
          setCreating(false)
          setEditing({ definition: def, row: null })
        }}
      />

      {/* تأیید حذف از ارث‌بری — نمایش نام الونس و زیرشاخه متأثر (§۶) */}
      <AlertDialog open={excluding !== null} onOpenChange={(open) => !open && setExcluding(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-amber">
              <Ban className="size-5" aria-hidden />
              حذف «{excluding?.title}» از ارث‌بری
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-right">
                <p>
                  این الونس در سطح <b>{scopeTitle}</b> از ارث‌بری حذف می‌شود و در تمام زیرشاخه‌های همین سطح غیرفعال
                  خواهد بود.
                </p>
                {data && (data.descendants.activities > 0 || data.descendants.elements > 0) && (
                  <div className="rounded-xl bg-amber-soft p-3 text-xs">
                    <p className="mb-1 font-bold text-amber">زیرشاخه‌های متأثر:</p>
                    <ul className="list-inside list-disc space-y-0.5 text-muted-foreground">
                      {data.descendants.stations > 0 && (
                        <li className="num">{formatIntFa(data.descendants.stations)} ایستگاه</li>
                      )}
                      {data.descendants.activities > 0 && (
                        <li className="num">{formatIntFa(data.descendants.activities)} فعالیت</li>
                      )}
                      {data.descendants.elements > 0 && (
                        <li className="num">{formatIntFa(data.descendants.elements)} عنصر کاری</li>
                      )}
                    </ul>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  تعریف مرکزی حذف نمی‌شود؛ هر زمان بخواهید می‌توانید با «جایگزینی مقدار» دوباره آن را فعال کنید.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                if (excluding) {
                  runOp({ definitionId: excluding.definitionId, action: 'EXCLUDE' }, `«${excluding.title}» از ارث‌بری حذف شد`)
                  setExcluding(null)
                }
              }}
              disabled={putMutation.isPending}
              className="bg-amber text-white hover:bg-amber/90"
            >
              حذف از ارث‌بری
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* تغییر مبنای زمان ثابت — §۶ */}
      <Dialog open={basisTarget !== null} onOpenChange={(open) => !open && setBasisTarget(null)}>
        <DialogContent dir="rtl" className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>تغییر مبنای «{basisTarget?.title}»</DialogTitle>
            <DialogDescription>مبنای وقوع این زمان ثابت را انتخاب کنید.</DialogDescription>
          </DialogHeader>
          <RadioGroup
            value={basisTarget?.applicationBasis ?? defaultBasis(scopeType)}
            onValueChange={(v) => {
              if (!basisTarget || basisTarget.valueType !== 'FIXED_TIME') return
              runOp(
                {
                  definitionId: basisTarget.definitionId,
                  action: 'SET',
                  valueType: 'FIXED_TIME',
                  timeValueSeconds: basisTarget.timeValueSeconds ?? 0,
                  applicationBasis: v as 'PER_ELEMENT_EXECUTION' | 'PER_CYCLE',
                },
                'مبنای وقوع تغییر کرد'
              )
              setBasisTarget(null)
            }}
          >
            <Label className="radio-card cursor-pointer">
              <RadioGroupItem value="PER_ELEMENT_EXECUTION" />
              <span className="flex-1">
                <span className="block text-sm font-bold">به‌ازای هر اجرای عنصر</span>
                <span className="block text-xs text-muted-foreground">
                  به زمان استاندارد همین عنصر، هر بار اجرا افزوده می‌شود.
                </span>
              </span>
            </Label>
            <Label className="radio-card cursor-pointer">
              <RadioGroupItem value="PER_CYCLE" />
              <span className="flex-1">
                <span className="block text-sm font-bold">یک‌بار در هر چرخه</span>
                <span className="block text-xs text-muted-foreground">
                  فقط یک‌بار در سطح چرخه اعمال می‌شود؛ در ST عناصر ضرب نمی‌شود.
                </span>
              </span>
            </Label>
          </RadioGroup>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBasisTarget(null)}>
              بستن
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}

/** عدد صحیح با ارقام فارسی — بدون وابستگی به prefs (برای شمارش‌ها) */
function formatIntFa(v: number): string {
  return v.toLocaleString('fa-IR')
}

// ═══════════════ ردیف دسکتاپ ═══════════════

function AllowanceRowDesktop({
  row,
  prefs,
  onEdit,
  onExclude,
  onRestore,
  onBasis,
}: {
  row: ResolvedAllowanceRowDto
  prefs: ReturnType<typeof useDisplayPrefs>
  onEdit: () => void
  onExclude: () => void
  onRestore: () => void
  onBasis: () => void
}) {
  const badge = STATUS_BADGE[row.status]
  const excluded = row.status === 'EXCLUDED'
  return (
    <tr className={cn('border-b border-border/40 transition-colors last:border-0 hover:bg-brand-soft/20', excluded && 'opacity-60')}>
      <td className="max-w-56 px-3 py-2.5 text-right">
        <span className="line-clamp-2 text-[13px] font-bold">{row.title}</span>
        {row.code && (
          <span className="num text-[10px] text-faint" dir="ltr">
            {row.code}
          </span>
        )}
      </td>
      <td className="px-3 py-2.5 text-center text-xs">
        {row.valueType === 'PERCENT' ? (
          <span>درصدی</span>
        ) : row.valueType === 'FIXED_TIME' ? (
          <span>
            زمان ثابت
            <span className="block text-[10px] text-muted-foreground">{basisLabel(row.displayApplicationBasis)}</span>
          </span>
        ) : (
          <span className="text-faint">—</span>
        )}
      </td>
      <td className="num px-3 py-2.5 text-center font-bold">
        {excluded ? (
          <span className="text-faint">—</span>
        ) : row.valueType === 'PERCENT' ? (
          <span className="text-brand">{formatPercent(row.percentValue, prefs, 2)}</span>
        ) : (
          <span>{formatSeconds(row.timeValueSeconds, prefs)}</span>
        )}
      </td>
      <td className="max-w-40 px-3 py-2.5 text-center text-xs text-muted-foreground">
        {row.sourceScopeLabel ?? '—'}
        <span className="block text-[10px] text-faint">{SCOPE_LABELS[row.sourceScopeType ?? ''] ?? ''}</span>
      </td>
      <td className="px-3 py-2.5 text-center">
        <span className={cn('inline-block rounded-full px-2 py-0.5 text-[10.5px] font-bold', badge.className)}>
          {badge.label}
        </span>
        {row.note && (
          <span className="mt-0.5 block max-w-44 text-[10px] leading-4 text-faint" title={row.note}>
            {row.note}
          </span>
        )}
      </td>
      <td className="px-2 py-2.5">
        <RowActionsMenu row={row} onEdit={onEdit} onExclude={onExclude} onRestore={onRestore} onBasis={onBasis} />
      </td>
    </tr>
  )
}

// ═══════════════ کارت موبایل ═══════════════

function AllowanceRowMobile({
  row,
  prefs,
  onEdit,
  onExclude,
  onRestore,
  onBasis,
}: {
  row: ResolvedAllowanceRowDto
  prefs: ReturnType<typeof useDisplayPrefs>
  onEdit: () => void
  onExclude: () => void
  onRestore: () => void
  onBasis: () => void
}) {
  const badge = STATUS_BADGE[row.status]
  const excluded = row.status === 'EXCLUDED'
  return (
    <div className={cn('rounded-xl border border-border/60 bg-surface-2/50 p-3', excluded && 'opacity-60')}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[13px] font-bold">{row.title}</span>
            <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold', badge.className)}>{badge.label}</span>
          </div>
          <p className="num mt-1 text-xs">
            {excluded || (row.valueType !== 'PERCENT' && row.valueType !== 'FIXED_TIME') ? (
              <span className="text-faint">—</span>
            ) : row.valueType === 'PERCENT' ? (
              <span className="font-bold text-brand">{formatPercent(row.percentValue, prefs, 2)}</span>
            ) : (
              <span className="font-bold">{formatSeconds(row.timeValueSeconds, prefs)}</span>
            )}
            {row.valueType === 'FIXED_TIME' && (
              <span className="text-muted-foreground"> · {basisLabel(row.displayApplicationBasis)}</span>
            )}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            مبدأ: {row.sourceScopeLabel ?? '—'}
            {row.sourceScopeType ? ` (${SCOPE_LABELS[row.sourceScopeType]})` : ''}
          </p>
          {row.note && <p className="mt-1 text-[10px] leading-4 text-faint">{row.note}</p>}
        </div>
        <RowActionsMenu row={row} onEdit={onEdit} onExclude={onExclude} onRestore={onRestore} onBasis={onBasis} />
      </div>
    </div>
  )
}

// ═══════════════ منوی عملیات کم‌تراکم — §۶ ═══════════════

function RowActionsMenu({
  row,
  onEdit,
  onExclude,
  onRestore,
  onBasis,
}: {
  row: ResolvedAllowanceRowDto
  onEdit: () => void
  onExclude: () => void
  onRestore: () => void
  onBasis: () => void
}) {
  const excluded = row.status === 'EXCLUDED'
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-7" aria-label={`عملیات الونس ${row.title}`}>
          <MoreHorizontal className="size-4" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onClick={onEdit} disabled={excluded}>
          <PencilLine className="size-4" aria-hidden />
          جایگزینی مقدار…
        </DropdownMenuItem>
        {row.valueType === 'FIXED_TIME' && !excluded && (
          <DropdownMenuItem onClick={onBasis}>
            <Timer className="size-4" aria-hidden />
            تغییر مبنای زمان ثابت…
          </DropdownMenuItem>
        )}
        {!excluded && (
          <DropdownMenuItem onClick={onExclude}>
            <Ban className="size-4" aria-hidden />
            حذف از ارث‌بری
          </DropdownMenuItem>
        )}
        {row.hasLocalDecision && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onRestore} className="text-red focus:text-red">
              <RotateCcw className="size-4" aria-hidden />
              {restoreMenuLabel(row)}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ═══════════════ افزودن از فهرست مرکزی ═══════════════

function AddAllowancePopover({
  open,
  onOpenChange,
  data,
  onPick,
  onCreateNew,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  data: ScopeAllowancesDto
  onPick: (def: AllowanceDefinitionDto) => void
  onCreateNew: () => void
}) {
  const prefs = useDisplayPrefs()
  const [search, setSearch] = useState('')
  const available = useMemo(() => {
    return data.definitions
      .filter((d) => d.isActive && !d.isArchived)
      .filter((d) => !search.trim() || d.title.includes(search.trim()) || (d.code ?? '').includes(search.trim()))
  }, [data, search])
  const rowDefIds = useMemo(() => new Set(data.resolved.rows.map((r) => r.definitionId)), [data])

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <span aria-hidden className="hidden" />
      </PopoverTrigger>
      <PopoverContent side="bottom" align="start" className="w-80 overflow-hidden p-0" dir="rtl" onClick={(e) => e.stopPropagation()}>
        <div className="border-b bg-brand-soft/50 px-3 py-2 text-xs font-bold">افزودن الونس از فهرست مرکزی</div>
        <div className="space-y-1 p-2">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="جست‌وجوی عنوان یا کد…"
            className="h-8 text-xs"
          />
          <div className="max-h-64 space-y-0.5 overflow-y-auto scroll-slim">
            {available.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground">تعریف فعالی یافت نشد؛ تعریف جدید بسازید.</p>
            ) : (
              available.map((def) => {
                const active = rowDefIds.has(def.id)
                return (
                  <button
                    key={def.id}
                    type="button"
                    onClick={() => {
                      onPick(def)
                      onOpenChange(false)
                    }}
                    className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-right transition-colors hover:bg-brand-soft/50 focus-visible:bg-brand-soft/50 focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-bold">{def.title}</span>
                      <span className="block text-[10px] text-muted-foreground">
                        {def.defaultValueType === 'PERCENT'
                          ? `پیشنهادی: ${formatPercent(def.defaultValuePercent, prefs, 1)}`
                          : def.defaultValueType === 'FIXED_TIME'
                            ? `پیشنهادی: ${formatTimeValue(def.defaultTimeSeconds, prefs, 1)} ثانیه`
                            : 'بدون مقدار پیش‌فرض'}
                      </span>
                    </span>
                    {active && (
                      <Badge variant="secondary" className="border-0 bg-brand-soft text-[9px] text-brand">
                        فعال
                      </Badge>
                    )}
                  </button>
                )
              })
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              setSearch('')
              onCreateNew()
            }}
            className="flex w-full items-center gap-1.5 rounded-lg border border-dashed border-border/70 px-2.5 py-2 text-xs font-bold text-brand transition-colors hover:bg-brand-soft/40"
          >
            <CirclePlus className="size-4" aria-hidden />
            ایجاد تعریف جدید در همین فرم…
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

// ═══════════════ ویرایشگر مقدار — §۶ ورودی‌ها ═══════════════

function AllowanceEditorDialog({
  definition,
  row,
  scopeType,
  scopeLabel,
  saving,
  onClose,
  onSave,
}: {
  definition: AllowanceDefinitionDto
  row: ResolvedAllowanceRowDto | null
  scopeType: AllowanceScope
  scopeLabel: string
  saving: boolean
  onClose: () => void
  onSave: (op: AllowanceOpInput) => void
}) {
  const current = row && row.status !== 'EXCLUDED' ? row : null
  const prefs = useDisplayPrefs()
  const [valueType, setValueType] = useState<'PERCENT' | 'FIXED_TIME'>(
    (current?.valueType ?? definition.defaultValueType ?? 'PERCENT') as 'PERCENT' | 'FIXED_TIME'
  )
  const [percent, setPercent] = useState<number | null>(
    (current?.valueType ?? definition.defaultValueType ?? 'PERCENT') === 'PERCENT'
      ? (current?.percentValue ?? definition.defaultValuePercent ?? null)
      : null
  )
  const [amount, setAmount] = useState<number | null>(
    (current?.valueType ?? definition.defaultValueType) === 'FIXED_TIME'
      ? (current?.timeValueSeconds ?? definition.defaultTimeSeconds ?? null)
      : null
  )
  const [unit, setUnit] = useState<'sec' | 'min'>('sec')
  const [basis, setBasis] = useState<'PER_ELEMENT_EXECUTION' | 'PER_CYCLE'>(
    (current?.applicationBasis as 'PER_ELEMENT_EXECUTION' | 'PER_CYCLE' | null) ?? defaultBasis(scopeType)
  )
  const [touched, setTouched] = useState(false)

  const seconds = amount === null || amount === undefined ? null : unit === 'min' ? amount * 60 : amount
  const fieldError =
    valueType === 'PERCENT' && touched && percent === null
      ? 'مقدار درصدی الزامی است.'
      : valueType === 'FIXED_TIME' && touched && seconds === null
        ? 'مقدار زمان ثابت الزامی است.'
        : null

  const switchType = (t: 'PERCENT' | 'FIXED_TIME') => {
    setValueType(t)
    setTouched(false)
    if (t === 'PERCENT') {
      setPercent(current?.percentValue ?? definition.defaultValuePercent ?? null)
    } else {
      setAmount(current?.timeValueSeconds ?? definition.defaultTimeSeconds ?? null)
      setUnit('sec')
      setBasis((current?.applicationBasis as 'PER_ELEMENT_EXECUTION' | 'PER_CYCLE' | null) ?? defaultBasis(scopeType))
    }
  }

  const changeUnit = (u: 'sec' | 'min') => {
    if (amount !== null && amount !== undefined) {
      setAmount(u === 'min' ? amount / 60 : amount * 60)
    }
    setUnit(u)
  }

  const submit = () => {
    setTouched(true)
    if (valueType === 'PERCENT') {
      if (percent === null || percent === undefined) return
      onSave({ definitionId: definition.id, action: 'SET', valueType: 'PERCENT', percentValue: percent })
    } else {
      if (seconds === null || seconds === undefined) return
      onSave({
        definitionId: definition.id,
        action: 'SET',
        valueType: 'FIXED_TIME',
        timeValueSeconds: Math.round(seconds * 10000) / 10000,
        applicationBasis: basis,
      })
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent dir="rtl" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {row ? 'جایگزینی مقدار' : 'افزودن الونس'} — «{definition.title}»
          </DialogTitle>
          <DialogDescription>
            در {scopeLabel} ثبت می‌شود؛ مقدار فعلی والد (در صورت وجود) جایگزین می‌شود.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <RadioGroup value={valueType} onValueChange={(v) => switchType(v as 'PERCENT' | 'FIXED_TIME')}>
            <div className="grid grid-cols-2 gap-2">
              <Label className="radio-card cursor-pointer">
                <RadioGroupItem value="PERCENT" />
                <span className="text-sm font-bold">درصدی</span>
              </Label>
              <Label className="radio-card cursor-pointer">
                <RadioGroupItem value="FIXED_TIME" />
                <span className="text-sm font-bold">زمان ثابت</span>
              </Label>
            </div>
          </RadioGroup>

          {valueType === 'PERCENT' ? (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1">
                <Label htmlFor="allowance-percent">مقدار درصدی</Label>
                {definition.defaultValueType === 'PERCENT' && definition.defaultValuePercent !== null && (
                  <Badge variant="outline" className="border-0 bg-surface-2 text-[10px] text-muted-foreground">
                    پیشنهادی: {formatPercent(definition.defaultValuePercent, prefs, 1)}
                  </Badge>
                )}
              </div>
              <PercentInput
                id="allowance-percent"
                value={percent}
                onChange={(v) => {
                  setPercent(v)
                  setTouched(true)
                }}
                aria-label={`درصد الونس ${definition.title}`}
              />
              {fieldError && <p className="text-xs text-red">{fieldError}</p>}
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <div className="flex items-center gap-1">
                  <Label htmlFor="allowance-time">مقدار زمان ثابت</Label>
                  {definition.defaultValueType === 'FIXED_TIME' && definition.defaultTimeSeconds !== null && (
                    <Badge variant="outline" className="border-0 bg-surface-2 text-[10px] text-muted-foreground">
                      پیشنهادی: {formatTimeValue(definition.defaultTimeSeconds, prefs, 1)} ثانیه
                    </Badge>
                  )}
                </div>
                <div className="flex gap-2">
                  <div className="min-w-0 flex-1">
                    <PersianNumberInput
                      id="allowance-time"
                      value={amount}
                      onChange={(v) => {
                        setAmount(v)
                        setTouched(true)
                      }}
                      decimals
                      min={0}
                      aria-label={`زمان ثابت الونس ${definition.title}`}
                    />
                  </div>
                  <Select value={unit} onValueChange={(v) => changeUnit(v as 'sec' | 'min')}>
                    <SelectTrigger className="w-24" aria-label="واحد زمان">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent dir="rtl">
                      <SelectItem value="sec">ثانیه</SelectItem>
                      <SelectItem value="min">دقیقه</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {fieldError && <p className="text-xs text-red">{fieldError}</p>}
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-1">
                  <Label>مبنای وقوع</Label>
                  <HelpDot label="مبنای وقوع زمان ثابت" content={BASIS_HELP} />
                </div>
                <Select value={basis} onValueChange={(v) => setBasis(v as 'PER_ELEMENT_EXECUTION' | 'PER_CYCLE')}>
                  <SelectTrigger aria-label="مبنای وقوع">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent dir="rtl">
                    <SelectItem value="PER_ELEMENT_EXECUTION">به‌ازای هر اجرای عنصر</SelectItem>
                    <SelectItem value="PER_CYCLE">یک‌بار در هر چرخه</SelectItem>
                  </SelectContent>
                </Select>
                {basis === 'PER_ELEMENT_EXECUTION' && scopeType !== 'WORK_ELEMENT' && (
                  <p className="rounded-lg bg-amber-soft p-2 text-[11px] leading-5 text-amber">
                    زمان ثابت «هر اجرا» در سطح بالاتر از عنصر، نیازمند قاعده تجمیع مهندسی است؛ تا تعیین قاعده، در ST
                    عناصر اعمال نمی‌شود (بی‌صدا حذف یا چندبار اعمال نمی‌شود).
                  </p>
                )}
              </div>
            </>
          )}

          {row && row.parentDecisionExists && row.parentMode === 'ACTIVE' && row.parentValue !== null && row.parentValue !== undefined ? (
            <p className="text-[11px] text-muted-foreground">
              مقدار فعلی والد{row.parentScopeType ? ` (${SCOPE_LABELS[row.parentScopeType] ?? ''})` : ''}:{' '}
              <b className="num">{formatParentValue(row, prefs)}</b>
            </p>
          ) : null}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>
            انصراف
          </Button>
          <Button onClick={submit} disabled={saving} className="btn-brand border-0">
            {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            ذخیره
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ═══════════════ ایجاد تعریف جدید از فرم — §۲.۲ ═══════════════

function DefinitionCreateDialog({
  open,
  onOpenChange,
  projectId,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  onCreated: (def: AllowanceDefinitionDto) => void
}) {
  const qc = useQueryClient()
  const [title, setTitle] = useState('')
  const [code, setCode] = useState('')
  const [description, setDescription] = useState('')
  const [defaultValueType, setDefaultValueType] = useState<'NONE' | 'PERCENT' | 'FIXED_TIME'>('NONE')
  const [defaultPercent, setDefaultPercent] = useState<number | null>(null)
  const [defaultSeconds, setDefaultSeconds] = useState<number | null>(null)
  const [isActive, setIsActive] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reset = () => {
    setTitle('')
    setCode('')
    setDescription('')
    setDefaultValueType('NONE')
    setDefaultPercent(null)
    setDefaultSeconds(null)
    setIsActive(true)
    setError(null)
  }

  const submit = async () => {
    if (!title.trim()) {
      setError('عنوان الزامی است.')
      return
    }
    if (defaultValueType === 'PERCENT' && defaultPercent === null) {
      setError('مقدار پیش‌فرض درصدی را وارد کنید یا نوع پیش‌فرض را «بدون مقدار» بگذارید.')
      return
    }
    if (defaultValueType === 'FIXED_TIME' && defaultSeconds === null) {
      setError('مقدار پیش‌فرض زمانی را وارد کنید یا نوع پیش‌فرض را «بدون مقدار» بگذارید.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const res = await allowancesApi.createDefinition(projectId, {
        title: title.trim(),
        code: code.trim() || null,
        description: description.trim() || null,
        defaultValueType: defaultValueType === 'NONE' ? null : defaultValueType,
        defaultValuePercent: defaultValueType === 'PERCENT' ? defaultPercent : null,
        defaultTimeSeconds: defaultValueType === 'FIXED_TIME' ? defaultSeconds : null,
        isActive,
        sortOrder: 0,
      })
      void qc.invalidateQueries({ queryKey: qk.allowanceDefinitions(projectId) })
      toast.success(`تعریف «${res.definition.title}» ساخته شد و بلافاصله قابل تخصیص است`)
      reset()
      onCreated(res.definition)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ایجاد تعریف ناموفق بود')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(open) => {
        if (!open) reset()
        onOpenChange(open)
      }}
    >
      <DialogContent dir="rtl" className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>ایجاد تعریف جدید الونس</DialogTitle>
          <DialogDescription>
            تعریف در فهرست مرکزی پروژه ثبت می‌شود و بلافاصله در همین فرم قابل تخصیص است.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="def-title">عنوان (الزامی)</Label>
            <Input
              id="def-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="مثلاً: نیازهای شخصی"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="def-code">کد (اختیاری)</Label>
              <Input
                id="def-code"
                dir="ltr"
                className="num text-left"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="PP-1"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center justify-between">
                وضعیت
                <Switch checked={isActive} onCheckedChange={setIsActive} aria-label="تعریف فعال باشد" />
              </Label>
              <p className="text-[11px] text-muted-foreground">
                {isActive ? 'فعال — قابل تخصیص' : 'غیرفعال — در محاسبات لحاظ نمی‌شود'}
              </p>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="def-desc">توضیحات (اختیاری)</Label>
            <Textarea id="def-desc" value={description} onChange={(e) => setDescription(e.target.value)} className="min-h-14" />
          </div>
          <div className="space-y-2 rounded-xl bg-surface-2/70 p-3">
            <Label>مقدار پیش‌فرض (اختیاری — صرفاً پیشنهاد فرم تخصیص)</Label>
            <RadioGroup
              value={defaultValueType}
              onValueChange={(v) => setDefaultValueType(v as 'NONE' | 'PERCENT' | 'FIXED_TIME')}
            >
              <div className="grid grid-cols-3 gap-2">
                <Label className="radio-card cursor-pointer px-2 py-1.5">
                  <RadioGroupItem value="NONE" />
                  <span className="text-xs font-bold">بدون مقدار</span>
                </Label>
                <Label className="radio-card cursor-pointer px-2 py-1.5">
                  <RadioGroupItem value="PERCENT" />
                  <span className="text-xs font-bold">درصدی</span>
                </Label>
                <Label className="radio-card cursor-pointer px-2 py-1.5">
                  <RadioGroupItem value="FIXED_TIME" />
                  <span className="text-xs font-bold">زمان ثابت</span>
                </Label>
              </div>
            </RadioGroup>
            {defaultValueType === 'PERCENT' && (
              <div className="space-y-1">
                <Label className="text-xs">درصد پیشنهادی</Label>
                <PercentInput value={defaultPercent} onChange={setDefaultPercent} aria-label="درصد پیشنهادی" />
              </div>
            )}
            {defaultValueType === 'FIXED_TIME' && (
              <div className="space-y-1">
                <Label className="text-xs">زمان پیشنهادی (ثانیه)</Label>
                <PersianNumberInput
                  value={defaultSeconds}
                  onChange={setDefaultSeconds}
                  decimals
                  min={0}
                  aria-label="زمان پیشنهادی ثانیه"
                />
              </div>
            )}
            <p className="text-[10px] leading-4 text-muted-foreground">
              مقدار پیش‌فرض با برچسب «پیشنهادی» در فرم تخصیص نمایش داده می‌شود؛ ایجاد یا تغییر آن تخصیص‌های قبلی را
              تغییر نمی‌دهد.
            </p>
          </div>
          {error && (
            <p className="flex items-center gap-1.5 rounded-lg bg-red-soft p-2 text-xs text-red">
              <X className="size-3.5 shrink-0" aria-hidden />
              {error}
            </p>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            انصراف
          </Button>
          <Button onClick={submit} disabled={submitting} className="btn-brand border-0">
            {submitting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Plus className="size-4" aria-hidden />}
            ایجاد و ادامه
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
