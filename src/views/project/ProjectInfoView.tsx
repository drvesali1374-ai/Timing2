'use client'

// ═══════════════════════════════════════════════════════════
// نمای مشخصات پروژه — FR-01 / FR-15 / FR-27 【F1】
// مشخصات مطالعه (ذخیره خودکار)، تنظیمات محاسبات،
// وضعیت نهایی‌سازی و عملیات پروژه (کپی/خروجی/حذف دائمی)
// ═══════════════════════════════════════════════════════════
import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Calculator,
  Copy,
  Database,
  Download,
  FileText,
  Flag,
  Loader2,
  Settings2,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { HelpDot } from '@/components/common/HelpDot'
import { SectionHeading } from '@/components/common/SectionHeading'
import { ConfirmDeleteDialog, EmptyState } from '@/components/common/Feedback'
import { SaveIndicator } from '@/components/common/SaveIndicator'
import { useAutosave } from '@/hooks/use-autosave'
import { JalaliDatePicker } from '@/components/common/JalaliDatePicker'
import { UnfinalizeButton } from '@/components/layout/TopBar'
import { auditApi, projectsApi, type ProjectDetailDto } from '@/lib/api/endpoints'
import { qk } from '@/lib/api/keys'
import { useAppStore } from '@/store/app-store'
import { useDisplayPrefs } from '@/store/display-store'
import {
  AGGREGATION_METHODS,
  AGGREGATION_METHOD_LABELS,
  ALLOWANCE_METHODS,
  ALLOWANCE_METHOD_FORMULAS,
  ALLOWANCE_METHOD_LABELS,
} from '@/domain/types'
import { formatDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'

// ── فرم و راهنما ──
interface InfoForm {
  name: string
  lineName: string
  productName: string
  studyDate: string | null
  description: string
}

interface DuplicateSections {
  structureAndSettings: boolean
  operators: boolean
  groupsAndAllowances: boolean
  ratingTables: boolean
  rawObservations: boolean
}

/** محتوای راهنمای فیلدها — FR-28 */
const FIELD_HELP = {
  name: {
    what: 'عنوان این مطالعه زمان‌سنجی؛ در فهرست پروژه‌ها، سایدبار و گزارش‌های رسمی نمایش داده می‌شود.',
    input: 'نام کوتاه و قابل تشخیص؛ می‌تواند شامل مدل یا کد محصول باشد.',
    example: '«مطالعه خط مونتاژ پمپ آب مدل A»',
    note: 'شناسه داخلی پروژه پایدار است؛ تغییر نام، تاریخچه و بسته‌های خروجی قبلی را بی‌اعتبار نمی‌کند.',
  },
  lineName: {
    what: 'نام خط تولیدی که مطالعه روی آن انجام می‌شود؛ هر پروژه دقیقاً یک خط تولید دارد.',
    input: 'نام رسمی خط در کارخانه.',
    example: '«خط مونتاژ ۱» یا «خط پرداخت کاری»',
  },
  productName: {
    what: 'محصولی که روی این خط تولید می‌شود؛ مبنای مقایسه مطالعات مختلفِ همان محصول است.',
    input: 'نام تجاری یا مدل محصول.',
    example: '«پمپ آب مدل A»',
  },
  studyDate: {
    what: 'تاریخ رسمی انجام مطالعه؛ در سربرگ گزارش‌های رسمی درج می‌شود.',
    input: 'از تقویم شمسی انتخاب کنید یا قالب ۱۴۰۴/۰۸/۱۳ را دستی وارد کنید.',
    note: 'در پایگاه داده ISO میلادی ذخیره می‌شود؛ نمایش شمسی فقط لایه نمایش است.',
  },
  description: {
    what: 'هدف مطالعه، دامنه و نکات مهم مانند محدودیت‌های دسترسی به خط.',
    example: '«تعیین زمان استاندارد برای سفارش‌های سریع؛ خارج از ساعت اوج شیفت عصر.»',
  },
} as const

/** تجزیه امن JSON شیء‌شکل */
function parseJsonObject(text: string | null): Record<string, unknown> | null {
  if (!text) return null
  try {
    const parsed: unknown = JSON.parse(text)
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : null
  } catch {
    // JSON نامعتبر — مقدار نامعتبر نادیده گرفته می‌شود
    return null
  }
}

export default function ProjectInfoView({ projectId }: { projectId: string }) {
  const prefs = useDisplayPrefs()
  const qc = useQueryClient()
  const navigate = useAppStore((s) => s.navigate)

  const { data, isLoading, error } = useQuery({
    queryKey: qk.project(projectId),
    queryFn: () => projectsApi.get(projectId),
  })

  const isFinalized =
    !!data && (data.project.status === 'FINALIZED' || data.stageSummary.counts.finalized)

  // رویداد نهایی‌سازی برای تاریخ/دلیل — فقط در حالت نهایی‌شده (FR-27)
  const { data: auditData } = useQuery({
    queryKey: qk.audit(projectId),
    queryFn: () => auditApi.list(projectId, 100),
    enabled: isFinalized,
  })

  const finalizeEvent = useMemo(
    () => auditData?.items.find((a) => a.action === 'FINALIZE') ?? null,
    [auditData]
  )
  const finalizeReason = useMemo(() => {
    if (!finalizeEvent) return null
    const reason = parseJsonObject(finalizeEvent.afterJson)?.['reason']
    return typeof reason === 'string' && reason.trim() ? reason.trim() : null
  }, [finalizeEvent])

  const invalidateProject = () => {
    void qc.invalidateQueries({ queryKey: qk.project(projectId) })
    void qc.invalidateQueries({ queryKey: qk.projectSummary(projectId) })
    void qc.invalidateQueries({ queryKey: ['projects'] })
  }

  return (
    <div className="animate-view-in mx-auto max-w-3xl space-y-5">
      {/* سربرگ — چسبان زیر نوار اصلی (v1.5.2 §۸) */}
      <SectionHeading>
        <div className="flex items-center gap-3">
          <div className="chip-icon bg-brand-soft text-brand">
            <Settings2 className="size-6" aria-hidden />
          </div>
          <div>
            <h1 className="text-xl font-extrabold">مشخصات پروژه</h1>
            <p className="text-xs text-muted-foreground">مشخصات مطالعه، تنظیمات محاسبات و عملیات پروژه</p>
          </div>
        </div>
      </SectionHeading>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-80 w-full rounded-2xl" />
          <Skeleton className="h-60 w-full rounded-2xl" />
        </div>
      ) : error || !data ? (
        <EmptyState
          title="بارگذاری پروژه ناموفق بود"
          description={error instanceof Error ? error.message : 'پروژه یافت نشد یا خطایی رخ داده است.'}
          action={
            <Button
              variant="outline"
              onClick={() => void qc.invalidateQueries({ queryKey: qk.project(projectId) })}
            >
              تلاش مجدد
            </Button>
          }
        />
      ) : (
        <>
          {/* بخش ۱ — مشخصات مطالعه با ذخیره خودکار */}
          <StudyInfoForm projectId={projectId} project={data.project} onSaved={invalidateProject} />

          {/* بخش ۲ — تنظیمات محاسبات — FR-15 / ۱۰.۱ */}
          <CalcSettingsCard projectId={projectId} />

          {/* بخش ۳ — وضعیت مطالعه (فقط هنگام نهایی‌شده) */}
          {isFinalized && (
            <section className="card-premium border-green/40 p-5" aria-label="وضعیت مطالعه">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="chip-icon bg-green-soft text-green">
                    <Flag className="size-5" aria-hidden />
                  </div>
                  <div>
                    <h2 className="font-extrabold">این مطالعه نهایی شده است</h2>
                    <p className="mt-1 text-xs leading-6 text-muted-foreground">
                      وضعیت «نهایی‌شده» قفل ویرایش نیست؛ هر تغییر مؤثر، نتایج را «نیازمند محاسبه مجدد»
                      می‌کند (FR-27).
                    </p>
                    <div className="num mt-2 space-y-0.5 text-xs text-muted-foreground">
                      {finalizeEvent ? (
                        <p>تاریخ نهایی‌سازی: {formatDateTime(finalizeEvent.occurredAt, prefs)}</p>
                      ) : (
                        <p>در حال دریافت اطلاعات نهایی‌سازی…</p>
                      )}
                      {finalizeReason && <p>دلیل ثبت‌شده: {finalizeReason}</p>}
                    </div>
                  </div>
                </div>
                <UnfinalizeButton projectId={projectId} />
              </div>
            </section>
          )}

          {/* بخش ۴ — عملیات پروژه (منطقه خطرناک) */}
          <ProjectOperationsCard
            projectId={projectId}
            projectName={data.project.name}
            dependencyCounts={data.dependencyCounts}
            onDeleted={() => navigate({ name: 'home' })}
          />
        </>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════
// بخش ۱ — فرم مشخصات مطالعه با ذخیره خودکار — FR-23
// (پس از بارگذاری داده mount می‌شود تا وضعیت اولیه فرم با
// سرور همگام باشد و ذخیره‌ی بی‌دلیل رخ ندهد)
// ═══════════════════════════════════════════════════════════
function StudyInfoForm({
  projectId,
  project,
  onSaved,
}: {
  projectId: string
  project: ProjectDetailDto['project']
  onSaved: () => void
}) {
  const prefs = useDisplayPrefs()
  const [form, setForm] = useState<InfoForm>({
    name: project.name,
    lineName: project.lineName,
    productName: project.productName,
    studyDate: project.studyDate,
    description: project.description ?? '',
  })
  const updatedAtRef = useRef(project.updatedAt)

  const { status, retry, flush } = useAutosave<InfoForm>({
    data: form,
    ready: true,
    save: async (value) => {
      const res = await projectsApi.update(projectId, {
        name: value.name.trim(),
        lineName: value.lineName.trim(),
        productName: value.productName.trim(),
        studyDate: value.studyDate,
        description: value.description.trim() || null,
        expectedUpdatedAt: updatedAtRef.current,
      })
      updatedAtRef.current = res.project.updatedAt
      onSaved()
    },
  })

  // flush هنگام خروج از صفحه — تغییرات صف‌شده از بین نمی‌روند (FR-23)
  const flushRef = useRef(flush)
  useEffect(() => {
    flushRef.current = flush
  }, [flush])
  useEffect(() => {
    return () => {
      void flushRef.current()
    }
  }, [])

  return (
    <section className="card-premium p-5" aria-label="مشخصات مطالعه">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="chip-icon bg-brand-soft text-brand">
            <FileText className="size-5" aria-hidden />
          </div>
          <div>
            <h2 className="font-extrabold">مشخصات مطالعه</h2>
            <p className="text-xs text-muted-foreground">تغییرات به‌صورت خودکار ذخیره می‌شوند.</p>
          </div>
        </div>
        <SaveIndicator status={status} onRetry={retry} />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <div className="flex items-center gap-1">
            <Label htmlFor="info-name">نام پروژه</Label>
            <HelpDot label="نام پروژه" content={FIELD_HELP.name} />
          </div>
          <Input
            id="info-name"
            value={form.name}
            onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
          />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center gap-1">
            <Label htmlFor="info-line">نام خط تولید</Label>
            <HelpDot label="نام خط تولید" content={FIELD_HELP.lineName} />
          </div>
          <Input
            id="info-line"
            value={form.lineName}
            onChange={(e) => setForm((s) => ({ ...s, lineName: e.target.value }))}
          />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center gap-1">
            <Label htmlFor="info-product">نام محصول</Label>
            <HelpDot label="نام محصول" content={FIELD_HELP.productName} />
          </div>
          <Input
            id="info-product"
            value={form.productName}
            onChange={(e) => setForm((s) => ({ ...s, productName: e.target.value }))}
          />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center gap-1">
            <Label htmlFor="info-date">تاریخ مطالعه</Label>
            <HelpDot label="تاریخ مطالعه" content={FIELD_HELP.studyDate} />
          </div>
          <JalaliDatePicker
            value={form.studyDate}
            onChange={(iso) => setForm((s) => ({ ...s, studyDate: iso }))}
            id="info-date"
            aria-label="تاریخ مطالعه"
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <div className="flex items-center gap-1">
            <Label htmlFor="info-desc">شرح (اختیاری)</Label>
            <HelpDot label="شرح مطالعه" content={FIELD_HELP.description} />
          </div>
          <Textarea
            id="info-desc"
            value={form.description}
            onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))}
            className="min-h-16"
            placeholder="هدف مطالعه، دامنه یا نکات مهم…"
          />
        </div>
      </div>

      <div className="num mt-4 flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-[11px] text-faint">
        <span>ایجاد: {formatDateTime(project.createdAt, prefs)}</span>
        <span>آخرین تغییر: {formatDateTime(project.updatedAt, prefs)}</span>
      </div>
    </section>
  )
}

// ═══════════════════════════════════════════════════════════
// بخش ۲ — تنظیمات محاسبات — FR-15 / ۱۰.۱
// ═══════════════════════════════════════════════════════════
function CalcSettingsCard({ projectId }: { projectId: string }) {
  const qc = useQueryClient()
  const { data, isLoading, error } = useQuery({
    queryKey: qk.projectCalcSettings(projectId),
    queryFn: () => projectsApi.calcSettings(projectId),
  })

  // فقط ویرایش‌های محلی کاربر (روی داده سرور سوار می‌شود)
  const [override, setOverride] = useState<{
    allowanceMethod: string
    aggregationMethod: string
  } | null>(null)
  const calc = override ?? data ?? null

  const applyCalc = async (patch: { allowanceMethod?: string; aggregationMethod?: string }) => {
    if (!calc) return
    setOverride({ ...calc, ...patch })
    try {
      await projectsApi.putCalcSettings(projectId, patch)
      setOverride(null)
      void qc.invalidateQueries({ queryKey: qk.projectCalcSettings(projectId) })
      void qc.invalidateQueries({ queryKey: qk.projectSummary(projectId) })
      toast.success('تنظیمات محاسبات ذخیره شد')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'ذخیره تنظیمات محاسبات ناموفق بود')
      // بازگشت به مقدار سرور
      setOverride(null)
      void qc.invalidateQueries({ queryKey: qk.projectCalcSettings(projectId) })
    }
  }

  return (
    <section className="card-premium p-5" aria-label="تنظیمات محاسبات">
      <div className="flex items-center gap-3">
        <div className="chip-icon bg-cyan-soft text-cyan">
          <Calculator className="size-5" aria-hidden />
        </div>
        <div>
          <h2 className="font-extrabold">تنظیمات محاسبات</h2>
          <p className="text-xs text-muted-foreground">روش اعمال مجازها و تجمیع چند اپراتور</p>
        </div>
      </div>

      {isLoading ? (
        <div className="mt-4 space-y-3">
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-10 w-full rounded-xl" />
        </div>
      ) : error ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-red-soft/60 p-3 text-xs text-red">
          <span>{error instanceof Error ? error.message : 'خطا در بارگذاری تنظیمات محاسبات'}</span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void qc.invalidateQueries({ queryKey: qk.projectCalcSettings(projectId) })}
          >
            تلاش مجدد
          </Button>
        </div>
      ) : (
        <div className="mt-4 space-y-5">
          {/* روش اعمال مجازها — FR-15 */}
          <div className="space-y-2">
            <div className="flex items-center gap-1">
              <Label>روش اعمال مجازها (A)</Label>
              <HelpDot
                label="روش اعمال مجازها"
                content={{
                  what: 'تعیین می‌کند درصد مجازها چگونه در زمان استاندارد (ST) لحاظ شود؛ روی تمام محاسبات این مطالعه اثر می‌گذارد.',
                  input: 'یکی از دو روش مجاز را انتخاب کنید؛ فرمول هر روش زیر آن نمایش داده می‌شود.',
                  note: 'روش انتخابی در گزارش‌های رسمی ثبت می‌شود.',
                }}
              />
            </div>
            <RadioGroup
              dir="rtl"
              value={calc?.allowanceMethod ?? ''}
              onValueChange={(v) => void applyCalc({ allowanceMethod: v })}
              className="gap-2"
            >
              {ALLOWANCE_METHODS.map((m) => (
                <label
                  key={m}
                  htmlFor={`am-${m}`}
                  className={cn(
                    'flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 transition-colors hover:bg-muted/50',
                    calc?.allowanceMethod === m && 'border-brand bg-brand-soft/40'
                  )}
                >
                  <RadioGroupItem value={m} id={`am-${m}`} className="mt-0.5" />
                  <span className="min-w-0 space-y-1.5">
                    <span className="block text-sm font-bold">{ALLOWANCE_METHOD_LABELS[m]}</span>
                    <span dir="ltr" className="num block text-right text-xs text-muted-foreground">
                      {ALLOWANCE_METHOD_FORMULAS[m]}
                    </span>
                    {m === 'SHARE_OF_ST' && (
                      <span className="block rounded-lg bg-amber-soft px-2 py-1 text-[11px] font-bold leading-5 text-amber">
                        مجموع مجازها باید کمتر از ۱۰۰٪ باشد وگرنه خطا می‌گیرید.
                      </span>
                    )}
                  </span>
                </label>
              ))}
            </RadioGroup>
          </div>

          {/* روش تجمیع چند اپراتور — ۱۰.۱ */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1">
              <Label>روش تجمیع چند اپراتور</Label>
              <HelpDot
                label="روش تجمیع چند اپراتور"
                content={{
                  what: 'هنگام محاسبه زمان استاندارد یک عنصر با مشاهدات چند اپراتور، نحوه ترکیب نتایج مشخص می‌شود.',
                  example: 'میانگین وزنی: اپراتوری که مشاهدات معتبر بیشتری ثبت کرده، اثر بیشتری دارد.',
                  note: 'روش انتخابی در گزارش ثبت می‌شود.',
                }}
              />
            </div>
            <Select
              dir="rtl"
              value={calc?.aggregationMethod ?? ''}
              onValueChange={(v) => void applyCalc({ aggregationMethod: v })}
            >
              <SelectTrigger className="w-full" aria-label="روش تجمیع چند اپراتور">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AGGREGATION_METHODS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {AGGREGATION_METHOD_LABELS[m]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}
    </section>
  )
}

// ═══════════════════════════════════════════════════════════
// بخش ۴ — عملیات پروژه (کپی/خروجی بسته/حذف دائمی) — FR-26
// ═══════════════════════════════════════════════════════════
function ProjectOperationsCard({
  projectId,
  projectName,
  dependencyCounts,
  onDeleted,
}: {
  projectId: string
  projectName: string
  dependencyCounts: ProjectDetailDto['dependencyCounts']
  onDeleted: () => void
}) {
  const qc = useQueryClient()
  const navigate = useAppStore((s) => s.navigate)
  const [dupOpen, setDupOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const deps: Record<string, number> = {
    'ایستگاه‌ها': dependencyCounts.stations,
    'فعالیت‌ها': dependencyCounts.activities,
    'عناصر کاری': dependencyCounts.elements,
    'اپراتورها': dependencyCounts.operators,
    'گروه‌های مجاز': dependencyCounts.groups,
    'جلسات زمان‌سنجی': dependencyCounts.sessions,
    'مشاهدات خام': dependencyCounts.observations,
  }

  const deleteMutation = useMutation({
    mutationFn: () => projectsApi.remove(projectId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['projects'] })
      void qc.removeQueries({ queryKey: qk.project(projectId) })
      toast.success('پروژه به‌طور دائمی حذف شد')
      setDeleteOpen(false)
      onDeleted()
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'حذف پروژه ناموفق بود'),
  })

  const exportPackage = () => {
    const win = window.open(`/api/projects/${projectId}/export`)
    if (!win) {
      toast.error('مرورگر پنجره دانلود را مسدود کرد؛ مجوز پاپ‌آپ مرورگر را بررسی کنید.')
      return
    }
    toast.success('خروجی بسته آغاز شد', {
      description: `فایل بسته کامل «${projectName}» دانلود می‌شود.`,
    })
  }

  const onDuplicated = (newProjectId: string, newName: string) => {
    void qc.invalidateQueries({ queryKey: ['projects'] })
    setDupOpen(false)
    toast.success(`پروژه «${newName}» ساخته شد`, {
      description: 'کپی با بخش‌های انتخاب‌شده ایجاد شد.',
      action: { label: 'بازکردن', onClick: () => navigate({ name: 'project', projectId: newProjectId, stage: 'info' }) },
    })
  }

  return (
    <section className="card-premium border-red/40 p-5" aria-label="عملیات پروژه">
      <div className="flex items-center gap-3">
        <div className="chip-icon bg-red-soft text-red">
          <Database className="size-5" aria-hidden />
        </div>
        <div>
          <h2 className="font-extrabold">عملیات پروژه</h2>
          <p className="text-xs text-muted-foreground">کپی، خروجی بسته کامل و حذف دائمی</p>
        </div>
      </div>

      <div className="mt-4 divide-y overflow-hidden rounded-xl border border-red/25">
        {/* کپی پروژه */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3.5">
          <div>
            <p className="text-sm font-bold">کپی پروژه</p>
            <p className="text-xs text-muted-foreground">
              ساخت پروژه جدید از بخش‌های انتخابی این مطالعه؛ پیش‌فرض فقط ساختار و تنظیمات.
            </p>
          </div>
          <Button variant="outline" className="gap-1.5" onClick={() => setDupOpen(true)}>
            <Copy className="size-4" aria-hidden />
            کپی پروژه
          </Button>
        </div>

        {/* خروجی بسته کامل */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3.5">
          <div>
            <p className="text-sm font-bold">خروجی بسته کامل</p>
            <p className="text-xs text-muted-foreground">
              فایل JSON نسخه‌دار شامل کل داده پروژه با manifest و checksum.
            </p>
          </div>
          <Button variant="outline" className="gap-1.5" onClick={exportPackage}>
            <Download className="size-4" aria-hidden />
            دانلود بسته
          </Button>
        </div>

        {/* حذف دائمی */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-red-soft/30 p-3.5">
          <div>
            <p className="text-sm font-bold text-red">حذف دائمی پروژه</p>
            <p className="text-xs text-muted-foreground">
              حذف کامل پروژه و تمام داده‌های وابسته؛ بدون سطل بازیافت.
            </p>
          </div>
          <Button
            variant="outline"
            className="gap-1.5 border-red/40 text-red hover:bg-red-soft hover:text-red"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="size-4" aria-hidden />
            حذف دائمی
          </Button>
        </div>
      </div>

      {/* دیالوگ کپی پروژه — همان دیالوگ صفحه خانه */}
      {dupOpen && (
        <DuplicateProjectDialog
          project={{ id: projectId, name: projectName }}
          onClose={() => setDupOpen(false)}
          onDone={onDuplicated}
        />
      )}

      {/* تأیید حذف دائمی با وابستگی‌ها — FR-26 */}
      <ConfirmDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="حذف دائمی پروژه"
        entityName={projectName}
        dependencies={deps}
        onConfirm={() => deleteMutation.mutate()}
        loading={deleteMutation.isPending}
      />
    </section>
  )
}

// ═══════════════════════════════════════════════════════════
// دیالوگ کپی پروژه با انتخاب بخش‌ها — FR-01
// ═══════════════════════════════════════════════════════════
function DuplicateProjectDialog({
  project,
  onClose,
  onDone,
}: {
  project: { id: string; name: string }
  onClose: () => void
  onDone: (newProjectId: string, newName: string) => void
}) {
  const [newName, setNewName] = useState(`${project.name} (کپی)`)
  const [sections, setSections] = useState<DuplicateSections>({
    structureAndSettings: true,
    operators: false,
    groupsAndAllowances: false,
    ratingTables: false,
    rawObservations: false,
  })
  const [saving, setSaving] = useState(false)

  const rows: { key: keyof DuplicateSections; label: string; desc: string }[] = [
    {
      key: 'structureAndSettings',
      label: 'ساختار و تنظیمات',
      desc: 'ایستگاه‌ها، فعالیت‌ها، عناصر کاری و تنظیمات محاسبات',
    },
    { key: 'operators', label: 'اپراتورها', desc: 'فهرست اپراتورهای این مطالعه' },
    {
      key: 'groupsAndAllowances',
      label: 'گروه‌ها و دسته‌های مجاز',
      desc: 'گروه‌های فعالیت، دسته‌های مجاز و مقادیر گروهی',
    },
    { key: 'ratingTables', label: 'جدول‌های وستینگهاوس', desc: 'جدول‌های مرجع، نمرات و ارزیابی‌های ثبت‌شدهٔ عناصر' },
    { key: 'rawObservations', label: 'مشاهدات خام', desc: 'داده‌های خام زمان‌سنجی ثبت‌شده' },
  ]

  const submit = async () => {
    if (!newName.trim()) {
      toast.error('نام پروژه جدید الزامی است')
      return
    }
    setSaving(true)
    try {
      const res = await projectsApi.duplicate(project.id, {
        newProjectName: newName.trim(),
        include: {
          structure: sections.structureAndSettings,
          settings: sections.structureAndSettings,
          operators: sections.operators,
          groupsAndAllowances: sections.groupsAndAllowances,
          ratingTables: sections.ratingTables,
          rawObservations: sections.rawObservations,
        },
      })
      onDone(res.projectId, newName.trim())
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'کپی پروژه ناموفق بود')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent dir="rtl" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>کپی پروژه</DialogTitle>
          <DialogDescription>
            از «{project.name}» یک پروژه جدید با بخش‌های انتخابی شما ساخته می‌شود.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="pi-dup-name">نام پروژه جدید</Label>
            <Input
              id="pi-dup-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="مثلاً: مطالعه خط مونتاژ پمپ (کپی)"
            />
          </div>
          <fieldset className="space-y-1.5">
            <legend className="text-sm font-bold">بخش‌های قابل کپی</legend>
            {rows.map((row) => (
              <label
                key={row.key}
                htmlFor={`pi-dup-${row.key}`}
                className={cn(
                  'flex cursor-pointer items-start gap-2.5 rounded-xl border p-2.5 transition-colors hover:bg-muted/50',
                  sections[row.key] && 'border-brand bg-brand-soft/40'
                )}
              >
                <Checkbox
                  id={`pi-dup-${row.key}`}
                  checked={sections[row.key]}
                  onCheckedChange={(checked) =>
                    setSections((s) => ({ ...s, [row.key]: checked === true }))
                  }
                  className="mt-0.5"
                />
                <span>
                  <span className="block text-sm font-bold">{row.label}</span>
                  <span className="block text-xs text-muted-foreground">{row.desc}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <p className="rounded-xl bg-amber-soft p-3 text-xs leading-6 text-muted-foreground">
            <b className="text-amber">توجه: </b>
            کپی عادی مشاهدات، نتایج محاسبه‌شده و تاریخچه مبدأ را منتقل نمی‌کند مگر صریحاً انتخاب شوند.
          </p>
        </div>
        <DialogFooter className="flex-row justify-between gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            انصراف
          </Button>
          <Button onClick={() => void submit()} disabled={saving} className="btn-brand gap-1.5 border-0">
            {saving ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Copy className="size-4" aria-hidden />
            )}
            {saving ? 'در حال کپی…' : 'ساخت کپی'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
