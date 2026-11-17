'use client'

// ═══════════════════════════════════════════════════════════
// دیالوگ مشترک ارزیابی عنصر — v1.5.3 §۱
// • از صفحهٔ ارزیابی وستینگهاوس و از جدول ثبت زمان (صفحهٔ زمان‌سنجی)
//   بدون جابه‌جایی باز می‌شود
// • operator مشخص → ارزیابی اختصاصی «اپراتور × عنصر»؛
//   operator = null → ارزیابی عمومی عنصر (میراث نسخه‌های قبل)
// ═══════════════════════════════════════════════════════════
import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Gauge, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
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
import { EmptyState } from '@/components/common/Feedback'
import { ratingApi, type RatingTableDto } from '@/lib/api/endpoints'
import { qk } from '@/lib/api/keys'
import { RATING_FACTORS, RATING_FACTOR_LABELS, type RatingFactor } from '@/domain/types'
import { computeRatingFactor } from '@/calculation/westinghouse'
import { useDisplayPrefs } from '@/store/display-store'
import { formatInt, formatTimeValue } from '@/lib/format'

type Prefs = ReturnType<typeof useDisplayPrefs>

/** مقدار «بدون انتخاب» در Selectهای اختیاری — مقدار خالی در Radix مجاز نیست */
const NONE = '__none__'

const EMPTY_GRADES: Record<RatingFactor, string | null> = {
  SKILL: null,
  EFFORT: null,
  CONDITIONS: null,
  CONSISTENCY: null,
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

const COPY_HELP: HelpContent = {
  what: 'درجه‌های چهار عامل یک ارزیابی دیگرِ همین پروژه را عیناً به این مورد کپی می‌کند؛ برای موارد تکراری مشابه.',
  input: 'یک مورد دارای ارزیابی انتخاب کنید، یا حالت «انتخاب دستی درجه‌ها» را نگه دارید.',
  note: 'مقدار درجه‌ها از جدول انتخابی بالا خوانده می‌شود؛ اگر جدول کدی را نداشته باشد، ثبت با خطا مواجه می‌شود.',
}

/** نمایش مقدار درجه با علامت ± و دو رقم اعشار */
function formatSigned(v: number | null | undefined, prefs: Prefs): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—'
  if (Math.abs(v) < 1e-9) return formatTimeValue(0, prefs, 2)
  return (v > 0 ? '+' : '−') + formatTimeValue(Math.abs(v), prefs, 2)
}

export interface RatingDialogElement {
  id: string
  name: string
  activityName: string
  stationName: string
}

export interface RatingDialogOperator {
  id: string
  displayName: string
}

interface RatingFormState {
  tableId: string
  grades: Record<RatingFactor, string | null>
  notes: string
  copyFrom: string | null
}

export function ElementRatingDialog({
  element,
  operator,
  projectId,
  onClose,
}: {
  element: RatingDialogElement | null
  operator?: RatingDialogOperator | null
  projectId: string
  onClose: () => void
}) {
  const prefs = useDisplayPrefs()
  const qc = useQueryClient()
  const open = element !== null
  const operatorId = operator?.id ?? null

  // جدول‌های پروژه + ماتریس (برای منابع کپی) — تنها وقتی دیالوگ باز است
  const tablesQ = useQuery({
    queryKey: qk.ratingTables(projectId),
    queryFn: () => ratingApi.tables(projectId),
    enabled: open,
  })
  const matrixQ = useQuery({
    queryKey: qk.ratingMatrix(projectId),
    queryFn: () => ratingApi.matrix(projectId),
    enabled: open,
  })
  const tables: RatingTableDto[] = tablesQ.data?.items ?? []
  const defaultTableId = matrixQ.data?.defaultTableId ?? null

  // ارزیابی مؤثر همین سطح — مبنای مقداردهی اولیه فرم
  const ratingQ = useQuery({
    queryKey: operatorId ? qk.operatorElementRating(element?.id ?? 'none', operatorId) : qk.elementRating(element?.id ?? 'none'),
    queryFn: () => ratingApi.elementRating(element!.id, operatorId),
    enabled: open,
  })

  const [edits, setEdits] = useState<RatingFormState | null>(null)

  const close = () => {
    setEdits(null)
    onClose()
  }

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

  // درجه‌های جدول انتخابی
  const tableQ = useQuery({
    queryKey: qk.ratingTable(form?.tableId ?? 'none'),
    queryFn: () => ratingApi.table(form!.tableId),
    enabled: open && form !== null && form.tableId !== '',
  })

  // منبع کپی برای پیش‌نمایش زنده — v1.5.3 §۱: «elementId» یا «elementId|operatorId»
  const sourceQ = useQuery({
    queryKey: ['element-rating-ref', form?.copyFrom ?? 'none'],
    queryFn: async () => {
      const ref = form!.copyFrom!
      const sep = ref.indexOf('|')
      const elId = sep >= 0 ? ref.slice(0, sep) : ref
      const opId = sep >= 0 ? ref.slice(sep + 1) : null
      return ratingApi.elementRating(elId, opId)
    },
    enabled: open && form !== null && form.copyFrom !== null,
  })

  const gradesByFactor = useMemo(() => {
    const m: Record<RatingFactor, { id: string; gradeCode: string; label: string; value: number }[]> = {
      SKILL: [],
      EFFORT: [],
      CONDITIONS: [],
      CONSISTENCY: [],
    }
    for (const g of tableQ.data?.grades ?? []) {
      if ((RATING_FACTORS as readonly string[]).includes(g.factor)) m[g.factor as RatingFactor].push(g)
    }
    return m
  }, [tableQ.data])

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

  const factorValue = (factor: RatingFactor): number | null => {
    if (!form) return null
    if (form.copyFrom && !sourceQ.data?.assessment) return null
    const code = effectiveGrades[factor]
    if (!code) return 0
    const g = gradesByFactor[factor].find((x) => x.gradeCode === code)
    return g ? g.value : null
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

  const missingFactors = tableQ.data
    ? (RATING_FACTORS as readonly RatingFactor[]).filter((f) => {
        const code = effectiveGrades[f]
        return !!code && !gradesByFactor[f].some((g) => g.gradeCode === code)
      })
    : []

  // منابع کپی: همهٔ ارزیابی‌های پروژه (عمومی + اختصاصی اپراتور) — v1.5.3 §۱
  const selfRef = element ? element.id + (operatorId ? `|${operatorId}` : '') : ''
  const candidateSources = useMemo(() => {
    const out: { id: string; label: string }[] = []
    for (const s of matrixQ.data?.stations ?? []) {
      for (const act of s.activities) {
        for (const e of act.elements) {
          if (e.rating && e.id !== element?.id) {
            out.push({ id: e.id, label: `${act.name} ← ${e.name} (عمومی)` })
          }
          for (const orr of e.operatorRatings ?? []) {
            const ref = `${e.id}|${orr.operatorId}`
            if (ref === selfRef) continue
            out.push({ id: ref, label: `${act.name} ← ${e.name} — ${orr.operatorName}` })
          }
        }
      }
    }
    return out
  }, [matrixQ.data, element?.id, selfRef])

  const saveMutation = useMutation({
    mutationFn: async () => {
      const elId = element!.id
      const f = form!
      const res = await ratingApi.putElementRating(elId, {
        ratingTableId: f.tableId,
        operatorId,
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
      void qc.invalidateQueries({ queryKey: ['element-rating', elId] })
      void qc.invalidateQueries({ queryKey: qk.projectSummary(projectId) })
      toast.success(
        `ارزیابی ثبت شد — R = ${formatTimeValue(res.assessment?.totalFactor ?? null, prefs)}` +
          (operator ? ` (اپراتور «${operator.displayName}»)` : '')
      )
      close()
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'ثبت ارزیابی ناموفق بود'),
  })

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent dir="rtl" className="scroll-slim max-h-[88vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-1.5">
            ارزیابی عنصر «{element?.name ?? ''}»{operator ? ` — اپراتور «${operator.displayName}»` : ''}
            <HelpDot
              label="سیاست ارزیابی"
              content={{
                what: 'ارزیابی برای هر «عنصر کاری × اپراتور» ثبت می‌شود؛ یک اپراتور ممکن است در عنصری ماهر و در عنصر دیگر متوسط باشد.',
                note: 'ثبت اصلی از دکمهٔ کوچک کنار نام عنصر در جدول ثبت زمان (صفحهٔ زمان‌سنجی) انجام می‌شود؛ NT هر اپراتور از ارزیابی اختصاصی خودش محاسبه می‌شود.',
              }}
            />
          </DialogTitle>
          <DialogDescription>
            {element ? `${element.stationName} › ${element.activityName} — ` : ''}
            {operator
              ? 'درجه هر عامل را برای همین اپراتور و همین عنصر انتخاب کنید؛ ضریب R به‌صورت زنده پیش‌نمایش می‌شود.'
              : 'ارزیابی عمومی عنصر (بدون اپراتور مشخص)؛ درجه هر عامل را از جدول مرجع انتخاب کنید.'}
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
        ) : form === null || ratingQ.isLoading || tablesQ.isLoading ? (
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
                  جدول ارزیابی‌ای وجود ندارد؛ ابتدا وضعیت زبانهٔ «جدول‌های مرجع» را بررسی کنید.
                </p>
              )}
            </div>

            {/* کپی از ارزیابی مشابه — v1.5.3 §۱ */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-1">
                <Label>کپی از ارزیابی مشابه</Label>
                <HelpDot label="کپی از ارزیابی مشابه" content={COPY_HELP} />
              </div>
              <Select
                value={form.copyFrom ?? NONE}
                onValueChange={(v) => {
                  updateForm({ ...form, copyFrom: v === NONE ? null : v })
                }}
              >
                <SelectTrigger className="w-full" aria-label="کپی ارزیابی از مورد مشابه">
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
                  هنگام ذخیره، درجه‌ها از مورد انتخاب‌شده کپی می‌شوند و انتخاب‌های دستی بالا نادیده گرفته می‌شوند؛ برای ویرایش
                  دستی، گزینه «انتخاب دستی درجه‌ها» را برگزینید.
                </p>
              )}
              {candidateSources.length === 0 && !form.copyFrom && (
                <p className="text-xs text-faint">
                  هنوز ارزیابی ثبت‌شده‌ای در این پروژه وجود ندارد؛ اولین ارزیابی را دستی ثبت کنید.
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

            {/* پیش‌نمایش زنده R */}
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
