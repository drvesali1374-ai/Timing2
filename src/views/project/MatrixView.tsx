'use client'

// ═══════════════════════════════════════════════════════════
// ماتریس هم‌پوشانی عناصر کاری — جلسه دوم §۲/§۳/§۵/§۱۱
// ▸ یک ماتریس مرکزی یکتا در هر پروژه — عضویت پویا از روابط فعال
// ▸ انتخاب چرخه نزدیک عنوان؛ فقط مقادیر همان چرخه
// ▸ سه وضعیت متمایز: بررسی‌نشده / بدون هم‌پوشانی / دارای هم‌پوشانی
// ▸ ویرایش سلول با draft + «ثبت تغییرات» + تأیید اثرات
// ▸ موبایل: نمای لیست زوج‌ها به‌جای جدول فشرده
// ═══════════════════════════════════════════════════════════
import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Network, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { HelpDot } from '@/components/common/HelpDot'
import { EmptyState } from '@/components/common/Feedback'
import { qk } from '@/lib/api/keys'
import { overlapApi, type OverlapMatrixDto, type OverlapStatusValue } from '@/lib/api/endpoints'
import { useAppStore } from '@/store/app-store'
import MatrixTable from './matrix/MatrixTable'
import PairList from './matrix/PairList'
import AddRelationDialog from './matrix/AddRelationDialog'
import ValidationPanel from './matrix/ValidationPanel'
import CycleSelector from './matrix/CycleSelector'

export interface CellDraft {
  status: OverlapStatusValue
  overlapDuration: number | null
}

export default function MatrixView({ projectId }: { projectId: string }) {
  const qc = useQueryClient()
  const openProject = useAppStore((s) => s.openProject)
  const [cycleId, setCycleId] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [drafts, setDrafts] = useState<Record<string, CellDraft>>({})
  const [busy, setBusy] = useState(false)

  const matrixQ = useQuery({
    queryKey: qk.overlapMatrix(projectId, cycleId),
    queryFn: () => overlapApi.matrix(projectId, cycleId ?? undefined),
  })
  const matrix = matrixQ.data

  const activeRelations = useMemo(() => matrix?.relations.filter((r) => r.isActive) ?? [], [matrix])
  const hasRelations = activeRelations.length > 0

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['overlap-matrix', projectId] })
    void qc.invalidateQueries({ queryKey: ['element-relations'] })
    void qc.invalidateQueries({ queryKey: ['timing-sheet'] })
  }

  const commitMutation = useMutation({
    mutationFn: async (payload: { cycleId: string; expectedOverlapRevision?: number; updates: Array<{ relationId: string; status: OverlapStatusValue; overlapDuration: number | null; expectedVersion?: number }> }) =>
      overlapApi.setCycleOverlaps(payload.cycleId, { updates: payload.updates, expectedOverlapRevision: payload.expectedOverlapRevision }),
    onSuccess: (res) => {
      setDrafts({})
      invalidate()
      toast.success('تغییرات هم‌پوشانی ثبت شد', {
        description: res.warnings.length > 0 ? undefined : 'فرم هر دو عنصر و ماتریس از همان منبع به‌روز شد.',
      })
      for (const w of res.warnings) {
        toast.warning('هشدار — نتیجه موقتی است', { description: w })
      }
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : 'ثبت تغییرات ناموفق بود'
      // نمایش همهٔ دلایل قطعی (Payload multiline)
      toast.error('ثبت تغییرات ممکن نیست', { description: msg })
    },
  })

  const setDraft = (relationId: string, draft: CellDraft | null) => {
    setDrafts((prev) => {
      const next = { ...prev }
      if (draft === null) delete next[relationId]
      else next[relationId] = draft
      return next
    })
  }

  // §۷ ممیزی جلسه ۲ — تغییر چرخه باید Draftهای قبلی را پاک کند؛
  // Draft چرخهٔ قبلی هرگز روی چرخهٔ جدید اعمال نمی‌شود.
  const changeCycle = (nextCycleId: string | null) => {
    setCycleId(nextCycleId)
    setDrafts({})
  }

  const commitDrafts = async () => {
    if (!cycleId || !matrix) return
    const updates = Object.entries(drafts).map(([relationId, d]) => {
      const existing = matrix.cells[relationId]
      return {
        relationId,
        status: d.status,
        overlapDuration: d.status === 'NO_OVERLAP' ? 0 : d.status === 'UNREVIEWED' ? null : d.overlapDuration,
        expectedVersion: existing?.version,
      }
    })
    setBusy(true)
    try {
      await commitMutation.mutateAsync({
        cycleId,
        expectedOverlapRevision: matrix.selectedCycle?.overlapRevision,
        updates,
      })
    } finally {
      setBusy(false)
    }
  }

  const goTiming = () => openProject(projectId, 'timing')

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="card-head pb-3">
          <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-lg">
            <span className="flex items-center gap-2">
              <span className="flex size-9 items-center justify-center rounded-xl bg-brand-soft text-brand">
                <Network className="size-5" aria-hidden />
              </span>
              ماتریس هم‌پوشانی عناصر کاری
              <HelpDot
                label="ماتریس هم‌پوشانی"
                content={{
                  what: 'این ماتریس، روابط موازی عناصر کاری پروژه را در یک نما نشان می‌دهد. هر خانه، میزان هم‌پوشانی دو عنصر در چرخهٔ انتخاب‌شده را نمایش می‌دهد.',
                  input: 'ابتدا یک «رابطهٔ موازی» بین دو عنصر تعریف کنید؛ سپس یک چرخه انتخاب کنید و مقدار هر خانه را با کلیک روی آن ثبت کنید. مقدار ثبت‌شده فقط برای همان چرخه است.',
                  example: 'اگر عنصر «بارگذاری» و «پرس کوبی» هم‌زمان اجرا می‌شوند، رابطهٔ موازی آن‌ها را تعریف کنید و در هر چرخه مقدار هم‌پوشانی (مثلاً ۳٫۵ ثانیه) را ثبت کنید.',
                  note: 'تغییر مقدار از فرم هر عنصر، ماتریس و فرم عنصر مقابل را هم‌زمان به‌روز می‌کند — همهٔ نماها به یک منبع داده وصل هستند. «بررسی‌نشده» به معنی صفر نیست.',
                }}
              />
            </span>
            <Button size="sm" onClick={() => setAddOpen(true)} disabled={matrixQ.isLoading}>
              <Plus className="size-4" aria-hidden />
              افزودن رابطهٔ موازی
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* انتخاب چرخه — نزدیک عنوان ماتریس (§۵) */}
          <CycleSelector
            matrix={matrix ?? null}
            isLoading={matrixQ.isLoading}
            cycleId={cycleId}
            onChange={changeCycle}
          />

          {/* نوار ثبت تغییرات draft (§۴.۴) */}
          {Object.keys(drafts).length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-brand/30 bg-brand-soft/50 p-3">
              <p className="text-sm">
                {Object.keys(drafts).length.toLocaleString('fa-IR')} تغییر ثبت‌نشده دارید. پس از «ثبت تغییرات»،
                هم‌پوشانی چندتایی و اعتبارسنجی مجدداً محاسبه می‌شود.
              </p>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setDrafts({})} disabled={busy}>
                  انصراف
                </Button>
                <Button size="sm" onClick={commitDrafts} disabled={busy || !cycleId}>
                  {busy ? 'در حال ثبت…' : 'ثبت تغییرات'}
                </Button>
              </div>
            </div>
          )}

          {matrixQ.isLoading ? (
            <div className="h-48 animate-pulse rounded-2xl bg-muted" aria-label="در حال بارگذاری" />
          ) : !hasRelations ? (
            <EmptyState
              icon={<Network className="size-7" aria-hidden />}
              title="هنوز رابطهٔ موازی تعریف نشده است"
              description="برای نمایش عناصر در ماتریس، ابتدا یک رابطهٔ موازی تعریف کنید. فقط عناصری وارد ماتریس می‌شوند که دست‌کم یک رابطهٔ فعال داشته باشند."
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  <Button onClick={() => setAddOpen(true)}>
                    <Plus className="size-4" aria-hidden />
                    افزودن رابطهٔ موازی
                  </Button>
                  <Button variant="outline" onClick={goTiming}>
                    رفتن به زمان‌سنجی
                  </Button>
                </div>
              }
            />
          ) : (
            <>
              {cycleId && matrix?.selectedCycle ? (
                <p className="text-xs text-muted-foreground">
                  مقادیر متعلق به: اپراتور «{matrix.selectedCycle.operatorName}» — فعالیت «
                  {matrix.selectedCycle.activityName}» — چرخهٔ{' '}
                  {matrix.selectedCycle.cycleNo.toLocaleString('fa-IR')}
                </p>
              ) : (
                <p className="rounded-xl bg-amber-soft/60 p-3 text-sm">
                  برای مشاهده و ویرایش مقادیر، یک چرخه انتخاب کنید. تا پیش از انتخاب چرخه، مقداری نمایش داده
                  نمی‌شود (میانگین یا حدس زده نمی‌شود).
                </p>
              )}

              {/* جدول دسکتاپ / لیست موبایل — §۷ ممیزی جلسه ۲:
                  تا زمانی که چرخه‌ای انتخاب نشده، سلول‌ها کاملاً غیرقابل‌ویرایش‌اند؛
                  موبایل و دسکتاپ رفتار یکسان دارند. */}
              <div className="hidden md:block">
                <MatrixTable
                  matrix={matrix ?? null}
                  drafts={drafts}
                  onDraft={setDraft}
                  cycleSelected={!!cycleId}
                />
              </div>
              <div className="md:hidden">
                <PairList
                  matrix={matrix ?? null}
                  drafts={drafts}
                  onDraft={setDraft}
                  cycleSelected={!!cycleId}
                />
              </div>

              <ValidationPanel matrix={matrix ?? null} />

              {/* روابط آرشیوشده — بازگردانی */}
              <ArchivedRelations matrix={matrix ?? null} onRestored={invalidate} />
            </>
          )}
        </CardContent>
      </Card>

      <AddRelationDialog
        projectId={projectId}
        open={addOpen}
        onOpenChange={setAddOpen}
        matrix={matrix ?? null}
        onAdded={(rel) => {
          invalidate()
          toast.success(`رابطهٔ موازی «${rel.label}» افزوده شد`, {
            description: 'این رابطه در ماتریس مرکزی و فرم زمان‌سنجی هر دو عنصر نمایش داده می‌شود.',
          })
        }}
      />
    </div>
  )
}

function ArchivedRelations({ matrix, onRestored }: { matrix: OverlapMatrixDto | null; onRestored: () => void }) {
  const [busyId, setBusyId] = useState<string | null>(null)
  const archived = useMemo(() => matrix?.relations.filter((r) => !r.isActive) ?? [], [matrix])
  const nameOf = (id: string) => matrix?.members.find((m) => m.elementId === id)?.name
  if (archived.length === 0) return null
  const restore = async (relationId: string) => {
    setBusyId(relationId)
    try {
      await overlapApi.restoreRelation(relationId)
      onRestored()
      toast.success('رابطه بازگردانی شد', {
        description: 'مقادیر تاریخی چرخه‌های قبلی همین رابطه حفظ شده و دوباره فعال شد.',
      })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'بازگردانی ناموفق بود')
    } finally {
      setBusyId(null)
    }
  }
  return (
    <details className="rounded-xl border bg-surface-2 p-3">
      <summary className="cursor-pointer text-sm font-bold">
        روابط آرشیوشده ({archived.length.toLocaleString('fa-IR')})
      </summary>
      <ul className="mt-2 space-y-1.5">
        {archived.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-2 rounded-lg bg-card px-3 py-2 text-sm">
            <span className="text-muted-foreground">
              {nameOf(r.elementLowId) ?? '؟'} ↔ {nameOf(r.elementHighId) ?? '؟'}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={busyId === r.id}
              onClick={() => restore(r.id)}
            >
              بازگردانی
            </Button>
          </li>
        ))}
      </ul>
    </details>
  )
}
