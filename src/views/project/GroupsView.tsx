'use client'

// ═══════════════════════════════════════════════════════════
// نمای «مجازها و الونس‌ها» — بازطراحی جلسه اول
// • زبانه تعریف‌های مرکزی: فهرست مرکزی الونس‌های پروژه
//   (تفکیک تعریف از تخصیص — §۲.۲) با ایجاد/ویرایش/آرشیو
// • زبانه الونس‌های خط تولید: تخصیص سطح PROJECT از طریق
//   بخش واحد «الونس‌ها و زمان‌های مجاز» (§۶)
// • زبانه گروه‌های فعالیت: فقط طبقه‌بندی — پس از migration
//   گروه‌ها دیگر منبع دوم اعمال الونس نیستند (§۵)
// • درصدها: کاربر عدد درصد می‌بیند (۱۵)؛ API مقدار اعشاری
//   می‌گیرد (0.15) — PercentInput + formatPercent — FR-15
// ═══════════════════════════════════════════════════════════
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Archive, FolderTree, Layers, ListPlus, Loader2, Pencil, Plus, Tags, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { HelpDot } from '@/components/common/HelpDot'
import { ConfirmDeleteDialog, EmptyState } from '@/components/common/Feedback'
import { SaveIndicator } from '@/components/common/SaveIndicator'
import { PercentInput, PersianNumberInput } from '@/components/common/PersianNumberInput'
import { useAutosave } from '@/hooks/use-autosave'
import { allowancesApi, type AllowanceDefinitionDto, type GroupDto } from '@/lib/api/endpoints'
import { qk } from '@/lib/api/keys'
import { useAppStore } from '@/store/app-store'
import { useDisplayPrefs } from '@/store/display-store'
import { formatDateTime, formatPercent, formatTimeValue } from '@/lib/format'
import { cn } from '@/lib/utils'
import { AllowanceSection } from './allowances/AllowanceSection'

type Prefs = ReturnType<typeof useDisplayPrefs>

// ── راهنمای آیکونی ──

const DEFINITIONS_HELP = {
  what: 'فهرست مرکزی الونس‌های پروژه؛ تعریف (عنوان/کد/مقدار پیش‌فرض) از تخصیص به سطوح جدا است. هر تعریف با ID پایدار به سطوح خط/ایستگاه/فعالیت/عنصر تخصیص می‌یابد.',
  input: 'عنوان الزامی است؛ کد، توضیحات و مقدار پیش‌فرض اختیاری‌اند. مقدار پیش‌فرض صرفاً پیشنهاد اولیه فرم تخصیص است.',
  example: '«نیازهای شخصی» (کد PP-۱، پیش‌فرض ۵٪) یا «استراحت شیفت» (زمان ثابت ۳۰۰ ثانیه، هر چرخه).',
  note: 'حذف تعریف دارای تخصیص/سابقه، به‌جای نابودی سوابق، آن را بایگانی می‌کند؛ تغییر عنوان ارتباط تخصیص‌ها را از بین نمی‌برد (ارتباط با ID است).',
} as const

const PROJECT_SCOPE_HELP = {
  what: 'الونس‌های این سطح به همه ایستگاه‌ها، فعالیت‌ها و عناصر کاری پروژه ارث می‌رسند؛ مگر آنکه در سطح پایین‌تر جایگزین یا حذف از ارث‌بری شوند.',
  input: 'با «افزودن الونس» از فهرست مرکزی انتخاب کنید؛ درصد یا زمان ثابت با مبنا ثبت می‌شود.',
  example: 'الونس نیازهای شخصی ۵٪ در سطح خط = پیش‌فرض کل خط؛ یک ایستگاه خاص می‌تواند مقدار خودش را جایگزین کند.',
  note: 'الونس زمانی سطح خط را با مبنا «هر چرخه» ثبت کنید تا در زمان تک‌تک عناصر ضرب نشود.',
} as const

const GROUPS_HELP = {
  what: 'گروه‌های فعالیت صرفاً برای طبقه‌بندی و برچسب‌گذاری فعالیت‌های مشابه‌اند. پس از مهاجرت به مدل سلسله‌مراتبی، مقادیر الونس از سطوح خط/ایستگاه/فعالیت/عنصر resolve می‌شوند و گروه منبع دوم محاسبه نیست.',
  input: 'گروه بسازید و در فرم «مشخصات فعالیت» به فعالیت‌ها نسبت دهید.',
  example: 'گروه «کار دستی سبک» یا «کار ماشینی سنگین».',
  note: 'مقادیر قدیمی گروه‌ها در زمان مهاجرت به تخصیص سطح فعالیت تبدیل شده‌اند تا نتیجه پروژه‌های موجود حفظ شود.',
} as const

const DEFAULT_VALUE_HELP = {
  what: 'مقدار پیش‌فرض فقط پیشنهاد اولیه فرم تخصیص است؛ به‌تنهایی به معنی اعمال الونس نیست و تغییر آن تخصیص‌های قبلی را تغییر نمی‌دهد.',
  input: 'نوع (درصدی/زمان ثابت) و مقدار متناظر را وارد کنید یا «بدون مقدار» بگذارید.',
  example: 'پیش‌فرض ۵٪ → فرم تخصیص پیشنهاد ۵٪ را نشان می‌دهد.',
  note: 'زمان پیش‌فرض برحسب ثانیه ذخیره می‌شود؛ واحد دقیقه در فرم تخصیص به ثانیه تبدیل می‌شود.',
} as const

// ═══════════════ نمای اصلی ═══════════════

export default function GroupsView({ projectId }: { projectId: string }) {
  const prefs = useDisplayPrefs()
  const [tab, setTab] = useState<'definitions' | 'project' | 'groups'>('definitions')

  const defsQ = useQuery({
    queryKey: qk.allowanceDefinitions(projectId),
    queryFn: () => allowancesApi.definitions(projectId),
  })
  const groupsQ = useQuery({
    queryKey: qk.groups(projectId),
    queryFn: () => allowancesApi.groups(projectId),
  })

  const activeCount = (defsQ.data?.items ?? []).filter((d) => d.isActive && !d.isArchived).length
  const archivedCount = (defsQ.data?.items ?? []).filter((d) => d.isArchived).length

  return (
    <div className="animate-view-in w-full space-y-5">
      {/* سربرگ بخش */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="chip-icon bg-brand-soft text-brand">
            <Tags className="size-6" aria-hidden />
          </div>
          <div>
            <h1 className="text-xl font-extrabold">مجازها و الونس‌ها</h1>
            <p className="num text-xs text-muted-foreground">
              {activeCount} تعریف فعال
              {archivedCount > 0 ? ` · ${archivedCount} بایگانی‌شده` : ''} ·{' '}
              {groupsQ.data?.items.length ?? 0} گروه فعالیت
            </p>
          </div>
        </div>
      </div>

      <Tabs dir="rtl" value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1 bg-surface-2/70 p-1">
          <TabsTrigger value="definitions" className="gap-1.5">
            <Layers className="size-4" aria-hidden />
            تعریف‌های مرکزی
          </TabsTrigger>
          <TabsTrigger value="project" className="gap-1.5">
            <ListPlus className="size-4" aria-hidden />
            الونس‌های خط تولید
          </TabsTrigger>
          <TabsTrigger value="groups" className="gap-1.5">
            <FolderTree className="size-4" aria-hidden />
            گروه‌های فعالیت
          </TabsTrigger>
        </TabsList>

        <TabsContent value="definitions" className="mt-4">
          <DefinitionsTab projectId={projectId} prefs={prefs} />
        </TabsContent>
        <TabsContent value="project" className="mt-4 space-y-4">
          <div className="card-premium p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex items-center gap-2 text-xs leading-6 text-muted-foreground">
                <HelpDot label="الونس‌های سطح خط تولید" content={PROJECT_SCOPE_HELP} />
                <span>
                  این الونس‌ها به تمام ایستگاه‌ها، فعالیت‌ها و عناصر کاری ارث می‌رسند؛ در هر سطح پایین‌تر قابل جایگزینی
                  یا حذف از ارث‌بری‌اند.
                </span>
              </div>
            </div>
          </div>
          <AllowanceSection projectId={projectId} scopeType="PROJECT" scopeId={projectId} />
        </TabsContent>
        <TabsContent value="groups" className="mt-4">
          <GroupsTab projectId={projectId} prefs={prefs} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ═══════════════ زبانه تعریف‌های مرکزی — §۲.۲ ═══════════════

function DefinitionsTab({ projectId, prefs }: { projectId: string; prefs: Prefs }) {
  const qc = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState<AllowanceDefinitionDto | null>(null)
  const [archiving, setArchiving] = useState<AllowanceDefinitionDto | null>(null)
  const [showArchived, setShowArchived] = useState(false)

  const defsQ = useQuery({
    queryKey: qk.allowanceDefinitions(projectId),
    queryFn: () => allowancesApi.definitions(projectId),
  })
  const items = defsQ.data?.items ?? []
  const visible = showArchived ? items : items.filter((d) => !d.isArchived)
  const archivedCount = items.filter((d) => d.isArchived).length

  const archiveMutation = useMutation({
    mutationFn: (def: AllowanceDefinitionDto) => allowancesApi.deleteDefinition(def.id),
    onSuccess: (res, def) => {
      void qc.invalidateQueries({ queryKey: qk.allowanceDefinitions(projectId) })
      void qc.invalidateQueries({ queryKey: ['scope-allowances'] })
      void qc.invalidateQueries({ queryKey: qk.projectSummary(projectId) })
      if (res.archived) {
        toast.success(`تعریف «${def.title}» بایگانی شد`, {
          description: `این تعریف ${res.assignmentCount} تخصیص داشت؛ برای حفظ سوابق تاریخی، به‌جای حذف بایگانی شد و از محاسبات کنار گذاشته شد.`,
        })
      } else {
        toast.success(`تعریف «${def.title}» حذف شد`)
      }
      setArchiving(null)
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'حذف تعریف ناموفق بود'),
  })

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: qk.allowanceDefinitions(projectId) })
    void qc.invalidateQueries({ queryKey: ['scope-allowances'] })
    void qc.invalidateQueries({ queryKey: qk.projectSummary(projectId) })
    void qc.invalidateQueries({ queryKey: qk.projects() })
  }

  const defaultValueLabel = (d: AllowanceDefinitionDto): string => {
    if (d.defaultValueType === 'PERCENT' && d.defaultValuePercent !== null)
      return formatPercent(d.defaultValuePercent, prefs, 1)
    if (d.defaultValueType === 'FIXED_TIME' && d.defaultTimeSeconds !== null)
      return `${formatTimeValue(d.defaultTimeSeconds, prefs, 1)} ثانیه`
    return '—'
  }

  return (
    <section className="card-premium overflow-hidden" aria-label="تعریف‌های مرکزی الونس">
      <div className="card-head flex flex-wrap items-center justify-between gap-3 p-4 pb-3">
        <div className="flex items-center gap-2.5">
          <span className="chip-icon bg-brand-soft text-brand">
            <Layers className="size-5" aria-hidden />
          </span>
          <div>
            <h2 className="text-sm font-extrabold">تعریف‌های مرکزی الونس</h2>
            <p className="text-[11px] text-muted-foreground">
              فهرست مشترک پروژه — تعریف از تخصیص جدا است
            </p>
          </div>
          <HelpDot label="تعریف‌های مرکزی" content={DEFINITIONS_HELP} />
        </div>
        <div className="flex items-center gap-2">
          {archivedCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-xs"
              onClick={() => setShowArchived((s) => !s)}
              aria-pressed={showArchived}
            >
              <Archive className="size-4" aria-hidden />
              {showArchived ? 'پنهان‌سازی بایگانی' : `بایگانی (${archivedCount})`}
            </Button>
          )}
          <Button size="sm" className="btn-brand gap-1.5 border-0" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" aria-hidden />
            تعریف جدید
          </Button>
        </div>
      </div>

      <div className="p-4 pt-3">
        {defsQ.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-14 w-full rounded-xl" />
            <Skeleton className="h-14 w-full rounded-xl" />
            <Skeleton className="h-14 w-full rounded-xl" />
          </div>
        ) : defsQ.isError ? (
          <EmptyState
            title="بارگذاری تعریف‌ها ناموفق بود"
            description={defsQ.error instanceof Error ? defsQ.error.message : 'خطای نامشخص'}
            action={
              <Button variant="outline" size="sm" onClick={() => defsQ.refetch()}>
                تلاش مجدد
              </Button>
            }
          />
        ) : visible.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/70 bg-surface-2/50 p-6 text-center">
            <p className="text-sm font-bold">
              {showArchived ? 'هیچ تعریفی ثبت نشده است' : 'هنوز تعریف الونسی ثبت نشده است'}
            </p>
            <p className="mx-auto mt-1 max-w-lg text-xs leading-5 text-muted-foreground">
              تعریف مرکزی، الونس نام‌دار پروژه است (مثل «نیازهای شخصی» یا «استراحت شیفت»). پس از ساخت، از زبانه
              «الونس‌های خط تولید» یا فرم ایستگاه/فعالیت/عنصر قابل تخصیص است.
            </p>
            {!showArchived && (
              <Button size="sm" className="btn-brand mt-3 gap-1.5 border-0" onClick={() => setCreateOpen(true)}>
                <Plus className="size-4" aria-hidden />
                اولین تعریف
              </Button>
            )}
          </div>
        ) : (
          <>
            {/* جدول دسکتاپ */}
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60 text-center text-[11px] text-muted-foreground">
                    <th className="px-3 py-2 text-right font-bold">عنوان و کد</th>
                    <th className="px-3 py-2 font-bold">پیش‌فرض</th>
                    <th className="px-3 py-2 font-bold">وضعیت</th>
                    <th className="px-3 py-2 font-bold">تخصیص‌ها</th>
                    <th className="px-3 py-2 font-bold">آخرین تغییر</th>
                    <th className="px-2 py-2 font-bold">عملیات</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((d) => (
                    <tr
                      key={d.id}
                      className={cn(
                        'border-b border-border/40 transition-colors last:border-0 hover:bg-brand-soft/20',
                        d.isArchived && 'opacity-55'
                      )}
                    >
                      <td className="max-w-64 px-3 py-2.5 text-right">
                        <span className="line-clamp-2 text-[13px] font-bold">{d.title}</span>
                        {d.code && (
                          <span className="num text-[10px] text-faint" dir="ltr">
                            {d.code}
                          </span>
                        )}
                        {d.description && (
                          <span className="line-clamp-1 text-[10px] text-faint">{d.description}</span>
                        )}
                      </td>
                      <td className="num px-3 py-2.5 text-center text-xs">
                        {defaultValueLabel(d)}
                        {d.defaultValueType === 'FIXED_TIME' && <span className="block text-[10px] text-faint">زمان ثابت</span>}
                        {d.defaultValueType === 'PERCENT' && <span className="block text-[10px] text-faint">درصدی</span>}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {d.isArchived ? (
                          <span className="rounded-full bg-muted px-2 py-0.5 text-[10.5px] font-bold text-muted-foreground">
                            بایگانی
                          </span>
                        ) : d.isActive ? (
                          <span className="rounded-full bg-green-soft px-2 py-0.5 text-[10.5px] font-bold text-green">
                            فعال
                          </span>
                        ) : (
                          <span className="rounded-full bg-amber-soft px-2 py-0.5 text-[10.5px] font-bold text-amber">
                            غیرفعال
                          </span>
                        )}
                      </td>
                      <td className="num px-3 py-2.5 text-center text-xs">
                        {d.assignmentCount > 0 ? d.assignmentCount.toLocaleString('fa-IR') : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-center text-[11px] text-muted-foreground">
                        {formatDateTime(d.updatedAt, prefs)}
                      </td>
                      <td className="px-2 py-2.5">
                        <div className="flex items-center justify-center gap-0.5">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7"
                            aria-label={`ویرایش تعریف ${d.title}`}
                            onClick={() => setEditing(d)}
                          >
                            <Pencil className="size-3.5" aria-hidden />
                          </Button>
                          {!d.isArchived && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7 text-red hover:text-red"
                              aria-label={`حذف یا بایگانی تعریف ${d.title}`}
                              onClick={() => setArchiving(d)}
                            >
                              <Trash2 className="size-3.5" aria-hidden />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* کارت موبایل */}
            <div className="space-y-2 sm:hidden">
              {visible.map((d) => (
                <div
                  key={d.id}
                  className={cn(
                    'rounded-xl border border-border/60 bg-surface-2/50 p-3',
                    d.isArchived && 'opacity-55'
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[13px] font-bold">{d.title}</span>
                        {d.isArchived ? (
                          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                            بایگانی
                          </span>
                        ) : d.isActive ? (
                          <span className="rounded-full bg-green-soft px-2 py-0.5 text-[10px] font-bold text-green">
                            فعال
                          </span>
                        ) : (
                          <span className="rounded-full bg-amber-soft px-2 py-0.5 text-[10px] font-bold text-amber">
                            غیرفعال
                          </span>
                        )}
                      </div>
                      {d.code && (
                        <span className="num text-[10px] text-faint" dir="ltr">
                          {d.code}
                        </span>
                      )}
                      <p className="num mt-1 text-xs">
                        پیش‌فرض: <b>{defaultValueLabel(d)}</b>
                        {d.defaultValueType === 'FIXED_TIME' && ' (زمان ثابت)'}
                        {d.defaultValueType === 'PERCENT' && ' (درصدی)'}
                      </p>
                      <p className="num mt-0.5 text-[11px] text-muted-foreground">
                        {d.assignmentCount} تخصیص · {formatDateTime(d.updatedAt, prefs)}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col gap-0.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        aria-label={`ویرایش تعریف ${d.title}`}
                        onClick={() => setEditing(d)}
                      >
                        <Pencil className="size-3.5" aria-hidden />
                      </Button>
                      {!d.isArchived && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 text-red hover:text-red"
                          aria-label={`حذف یا بایگانی تعریف ${d.title}`}
                          onClick={() => setArchiving(d)}
                        >
                          <Trash2 className="size-3.5" aria-hidden />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ایجاد تعریف */}
      <DefinitionFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        projectId={projectId}
        definition={null}
        onSaved={invalidate}
      />

      {/* ویرایش تعریف — autosave */}
      <DefinitionFormDialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        projectId={projectId}
        definition={editing}
        onSaved={invalidate}
      />

      {/* تأیید حذف/بایگانی — سیاست آرشیو §۲.۲ */}
      <ConfirmDeleteDialog
        open={archiving !== null}
        onOpenChange={(open) => !open && setArchiving(null)}
        title={archiving && archiving.assignmentCount > 0 ? 'بایگانی تعریف دارای سابقه' : 'حذف تعریف'}
        entityName={archiving?.title ?? ''}
        dependencies={archiving && archiving.assignmentCount > 0 ? { 'تخصیص ثبت‌شده (بایگانی می‌شود، سوابق حفظ می‌شود)': archiving.assignmentCount } : {}}
        onConfirm={() => archiving && archiveMutation.mutate(archiving)}
        loading={archiveMutation.isPending}
      />
    </section>
  )
}

// ═══════════════ فرم تعریف مرکزی — ایجاد/ویرایش (autosave) ═══════════════

interface DefinitionFormState {
  title: string
  code: string
  description: string
  defaultValueType: 'NONE' | 'PERCENT' | 'FIXED_TIME'
  defaultPercent: number | null
  defaultSeconds: number | null
  isActive: boolean
  sortOrder: number | null
}

function stateFromDefinition(d: AllowanceDefinitionDto | null): DefinitionFormState {
  if (!d) {
    return {
      title: '',
      code: '',
      description: '',
      defaultValueType: 'NONE',
      defaultPercent: null,
      defaultSeconds: null,
      isActive: true,
      sortOrder: 0,
    }
  }
  return {
    title: d.title,
    code: d.code ?? '',
    description: d.description ?? '',
    defaultValueType:
      d.defaultValueType === 'PERCENT' ? 'PERCENT' : d.defaultValueType === 'FIXED_TIME' ? 'FIXED_TIME' : 'NONE',
    defaultPercent: d.defaultValuePercent,
    defaultSeconds: d.defaultTimeSeconds,
    isActive: d.isActive,
    sortOrder: d.sortOrder,
  }
}

function DefinitionFormDialog({
  open,
  onOpenChange,
  projectId,
  definition,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  definition: AllowanceDefinitionDto | null
  onSaved: () => void
}) {
  const isEdit = definition !== null
  const [form, setForm] = useState<DefinitionFormState>(() => stateFromDefinition(definition))
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [updatedAtRef, setUpdatedAtRef] = useState<string | null>(() => definition?.updatedAt ?? null)
  const formKey = definition?.id ?? 'new'

  const { status, lastError, retry } = useAutosave<DefinitionFormState>({
    data: form,
    // ویرایش عنوان خالی ذخیره نمی‌شود
    ready: isEdit && form.title.trim().length > 0,
    isEqual: (a, b) =>
      a.title === b.title &&
      a.code === b.code &&
      a.description === b.description &&
      a.defaultValueType === b.defaultValueType &&
      a.defaultPercent === b.defaultPercent &&
      a.defaultSeconds === b.defaultSeconds &&
      a.isActive === b.isActive &&
      a.sortOrder === b.sortOrder,
    save: async (value) => {
      const res = await allowancesApi.updateDefinition(definition!.id, {
        title: value.title.trim(),
        code: value.code.trim() || null,
        description: value.description.trim() || null,
        defaultValueType: value.defaultValueType === 'NONE' ? null : value.defaultValueType,
        defaultValuePercent: value.defaultValueType === 'PERCENT' ? value.defaultPercent : null,
        defaultTimeSeconds: value.defaultValueType === 'FIXED_TIME' ? value.defaultSeconds : null,
        isActive: value.isActive,
        sortOrder: value.sortOrder ?? 0,
        expectedUpdatedAt: updatedAtRef ?? undefined,
      })
      setUpdatedAtRef(res.definition.updatedAt)
      onSaved()
    },
  })

  const submitCreate = async () => {
    if (!form.title.trim()) {
      setCreateError('عنوان الزامی است.')
      return
    }
    if (form.defaultValueType === 'PERCENT' && form.defaultPercent === null) {
      setCreateError('درصد پیش‌فرض را وارد کنید یا نوع پیش‌فرض را «بدون مقدار» بگذارید.')
      return
    }
    if (form.defaultValueType === 'FIXED_TIME' && form.defaultSeconds === null) {
      setCreateError('زمان پیش‌فرض را وارد کنید یا نوع پیش‌فرض را «بدون مقدار» بگذارید.')
      return
    }
    setCreating(true)
    setCreateError(null)
    try {
      await allowancesApi.createDefinition(projectId, {
        title: form.title.trim(),
        code: form.code.trim() || null,
        description: form.description.trim() || null,
        defaultValueType: form.defaultValueType === 'NONE' ? null : form.defaultValueType,
        defaultValuePercent: form.defaultValueType === 'PERCENT' ? form.defaultPercent : null,
        defaultTimeSeconds: form.defaultValueType === 'FIXED_TIME' ? form.defaultSeconds : null,
        isActive: form.isActive,
        sortOrder: form.sortOrder ?? 0,
      })
      toast.success('تعریف ساخته شد')
      onSaved()
      onOpenChange(false)
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'ایجاد تعریف ناموفق بود')
    } finally {
      setCreating(false)
    }
  }

  const resetAndClose = () => {
    setForm(stateFromDefinition(definition))
    setCreateError(null)
    onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(open) => {
        if (!open) resetAndClose()
        else onOpenChange(true)
      }}
    >
      <DialogContent dir="rtl" className="max-h-[92vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? `ویرایش تعریف — «${definition?.title}»` : 'تعریف جدید الونس'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'تغییرات به‌صورت خودکار ذخیره می‌شوند. تغییر عنوان ارتباط تخصیص‌ها را از بین نمی‌برد (ارتباط با ID است).'
              : 'تعریف در فهرست مرکزی پروژه ثبت می‌شود و بلافاصله در فرم‌های تخصیص قابل انتخاب است.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor={`def-title-${formKey}`}>عنوان (الزامی)</Label>
            <Input
              id={`def-title-${formKey}`}
              value={form.title}
              onChange={(e) => setForm((s) => ({ ...s, title: e.target.value }))}
              placeholder="مثلاً: نیازهای شخصی"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor={`def-code-${formKey}`}>کد (اختیاری)</Label>
              <Input
                id={`def-code-${formKey}`}
                dir="ltr"
                className="num text-left"
                value={form.code}
                onChange={(e) => setForm((s) => ({ ...s, code: e.target.value }))}
                placeholder="PP-1"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`def-sort-${formKey}`}>ترتیب نمایش</Label>
              <PersianNumberInput
                id={`def-sort-${formKey}`}
                value={form.sortOrder}
                onChange={(v) => setForm((s) => ({ ...s, sortOrder: v }))}
                decimals={false}
                min={0}
                max={9999}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`def-desc-${formKey}`}>توضیحات (اختیاری)</Label>
            <Textarea
              id={`def-desc-${formKey}`}
              value={form.description}
              onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))}
              className="min-h-14"
            />
          </div>
          <div className="space-y-2 rounded-xl bg-surface-2/70 p-3">
            <div className="flex items-center gap-1">
              <Label>مقدار پیش‌فرض (اختیاری)</Label>
              <HelpDot label="مقدار پیش‌فرض تعریف" content={DEFAULT_VALUE_HELP} />
            </div>
            <RadioGroup
              value={form.defaultValueType}
              onValueChange={(v) => setForm((s) => ({ ...s, defaultValueType: v as DefinitionFormState['defaultValueType'] }))}
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
            {form.defaultValueType === 'PERCENT' && (
              <div className="space-y-1">
                <Label className="text-xs">درصد پیشنهادی</Label>
                <PercentInput
                  value={form.defaultPercent}
                  onChange={(v) => setForm((s) => ({ ...s, defaultPercent: v }))}
                  aria-label="درصد پیشنهادی"
                />
              </div>
            )}
            {form.defaultValueType === 'FIXED_TIME' && (
              <div className="space-y-1">
                <Label className="text-xs">زمان پیشنهادی (ثانیه)</Label>
                <PersianNumberInput
                  value={form.defaultSeconds}
                  onChange={(v) => setForm((s) => ({ ...s, defaultSeconds: v }))}
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
          <div className="space-y-1.5">
            <Label className="flex items-center justify-between">
              وضعیت تعریف
              <Switch
                checked={form.isActive}
                onCheckedChange={(v) => setForm((s) => ({ ...s, isActive: v }))}
                aria-label="تعریف فعال باشد"
              />
            </Label>
            <p className="text-[11px] text-muted-foreground">
              {form.isActive
                ? 'فعال — قابل تخصیص و در محاسبات لحاظ می‌شود.'
                : 'غیرفعال — تخصیص جدید ممکن نیست و از محاسبات کنار گذاشته می‌شود.'}
            </p>
          </div>
          {createError && (
            <p className="rounded-lg bg-red-soft p-2 text-xs text-red">{createError}</p>
          )}
        </div>
        <DialogFooter className="gap-2">
          {isEdit ? (
            <>
              <SaveIndicator status={status} onRetry={retry} error={lastError} />
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                بستن
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={resetAndClose}>
                انصراف
              </Button>
              <Button onClick={submitCreate} disabled={creating} className="btn-brand border-0">
                {creating ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Plus className="size-4" aria-hidden />}
                ثبت تعریف
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ═══════════════ زبانه گروه‌های فعالیت — فقط طبقه‌بندی ═══════════════

function GroupsTab({ projectId, prefs }: { projectId: string; prefs: Prefs }) {
  const qc = useQueryClient()
  const navigate = useAppStore((s) => s.navigate)
  const [createOpen, setCreateOpen] = useState(false)
  const [createForm, setCreateForm] = useState<{ name: string; description: string }>({ name: '', description: '' })
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState<GroupDto | null>(null)

  const groupsQ = useQuery({
    queryKey: qk.groups(projectId),
    queryFn: () => allowancesApi.groups(projectId),
  })
  const groups = groupsQ.data?.items ?? []

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: qk.groups(projectId) })
    void qc.invalidateQueries({ queryKey: qk.projectSummary(projectId) })
  }

  const createMutation = useMutation({
    mutationFn: () =>
      allowancesApi.createGroup(projectId, {
        name: createForm.name.trim(),
        description: createForm.description.trim() || null,
      }),
    onSuccess: () => {
      invalidate()
      toast.success('گروه فعالیت ایجاد شد')
      setCreateOpen(false)
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'ایجاد گروه ناموفق بود'),
  })

  const deleteMutation = useMutation({
    mutationFn: (g: GroupDto) => allowancesApi.deleteGroup(g.id),
    onSuccess: (_res, g) => {
      invalidate()
      toast.success(`گروه «${g.name}» حذف شد`, {
        description: `${g.activities.length} فعالیتِ این گروه بدون گروه شد؛ داده آن‌ها حذف نشد.`,
      })
      setDeleting(null)
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'حذف گروه ناموفق بود'),
  })

  const submitCreate = async () => {
    if (!createForm.name.trim()) {
      toast.error('نام گروه الزامی است')
      return
    }
    setCreating(true)
    try {
      await createMutation.mutateAsync()
    } finally {
      setCreating(false)
    }
  }

  return (
    <section className="card-premium overflow-hidden" aria-label="گروه‌های فعالیت">
      <div className="card-head flex flex-wrap items-center justify-between gap-3 p-4 pb-3">
        <div className="flex items-center gap-2.5">
          <span className="chip-icon bg-cyan-soft text-cyan">
            <FolderTree className="size-5" aria-hidden />
          </span>
          <div>
            <h2 className="text-sm font-extrabold">گروه‌های فعالیت</h2>
            <p className="text-[11px] text-muted-foreground">طبقه‌بندی فعالیت‌های مشابه — منبع محاسبه نیست</p>
          </div>
          <HelpDot label="گروه‌های فعالیت" content={GROUPS_HELP} />
        </div>
        <Button size="sm" className="btn-brand gap-1.5 border-0" onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" aria-hidden />
          گروه جدید
        </Button>
      </div>

      <div className="p-4 pt-3">
        {groupsQ.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-14 w-full rounded-xl" />
            <Skeleton className="h-14 w-full rounded-xl" />
          </div>
        ) : groupsQ.isError ? (
          <EmptyState
            title="بارگذاری گروه‌ها ناموفق بود"
            description={groupsQ.error instanceof Error ? groupsQ.error.message : 'خطای نامشخص'}
            action={
              <Button variant="outline" size="sm" onClick={() => groupsQ.refetch()}>
                تلاش مجدد
              </Button>
            }
          />
        ) : groups.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/70 bg-surface-2/50 p-6 text-center">
            <p className="text-sm font-bold">هنوز گروه فعالیتی ثبت نشده است</p>
            <p className="mx-auto mt-1 max-w-lg text-xs leading-5 text-muted-foreground">
              گروه‌ها صرفاً برچسب طبقه‌بندی فعالیت‌ها هستند؛ الونس‌ها از مدل سلسله‌مراتبی (خط → ایستگاه → فعالیت →
              عنصر) اعمال می‌شوند.
            </p>
            <Button size="sm" className="btn-brand mt-3 gap-1.5 border-0" onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" aria-hidden />
              اولین گروه
            </Button>
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {groups.map((g) => (
              <div key={g.id} className="rounded-xl border border-border/60 bg-surface-2/50 p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{g.name}</p>
                    {g.description && (
                      <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-muted-foreground">{g.description}</p>
                    )}
                    <p className="num mt-1.5 text-[11px] text-faint">
                      {g.activities.length.toLocaleString('fa-IR')} فعالیت · ساخته‌شده{' '}
                      {formatDateTime(g.createdAt, prefs)}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 shrink-0 text-red hover:text-red"
                    aria-label={`حذف گروه ${g.name}`}
                    onClick={() => setDeleting(g)}
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                  </Button>
                </div>
                {g.activities.length > 0 && (
                  <ul className="mt-2.5 space-y-1 border-t border-border/50 pt-2">
                    {g.activities.slice(0, 4).map((a) => (
                      <li key={a.id}>
                        <button
                          type="button"
                          className="w-full truncate rounded-md px-1.5 py-1 text-right text-xs transition-colors hover:bg-brand-soft/40"
                          onClick={() => navigate({ name: 'activity', projectId, activityId: a.id })}
                        >
                          {a.name}
                          <span className="text-faint"> — {a.station.name}</span>
                        </button>
                      </li>
                    ))}
                    {g.activities.length > 4 && (
                      <li className="num px-1.5 text-[10px] text-faint">
                        و {(g.activities.length - 4).toLocaleString('fa-IR')} فعالیت دیگر…
                      </li>
                    )}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ایجاد گروه */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent dir="rtl" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>گروه فعالیت جدید</DialogTitle>
            <DialogDescription>
              گروه فقط برای طبقه‌بندی فعالیت‌هاست؛ مقادیر الونس در سطوح خط/ایستگاه/فعالیت/عنصر تعیین می‌شوند.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="group-create-name">نام گروه (الزامی)</Label>
              <Input
                id="group-create-name"
                value={createForm.name}
                onChange={(e) => setCreateForm((s) => ({ ...s, name: e.target.value }))}
                placeholder="مثلاً: کار دستی سبک"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="group-create-desc">توضیحات (اختیاری)</Label>
              <Textarea
                id="group-create-desc"
                value={createForm.description}
                onChange={(e) => setCreateForm((s) => ({ ...s, description: e.target.value }))}
                className="min-h-14"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              انصراف
            </Button>
            <Button onClick={submitCreate} disabled={creating} className="btn-brand border-0">
              {creating ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Plus className="size-4" aria-hidden />}
              ثبت گروه
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* تأیید حذف گروه */}
      <ConfirmDeleteDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="حذف گروه فعالیت"
        entityName={deleting?.name ?? ''}
        dependencies={
          deleting
            ? {
                ...(deleting.activities.length > 0
                  ? { 'فعالیت — فقط بدون گروه می‌شوند؛ داده آن‌ها حذف نمی‌شود': deleting.activities.length }
                  : {}),
              }
            : {}
        }
        onConfirm={() => deleting && deleteMutation.mutate(deleting)}
        loading={deleteMutation.isPending}
      />
    </section>
  )
}
