'use client'

// ═══════════════════════════════════════════════════════════
// ماتریس هم‌پوشانی عناصر کاری — نمای مرور فقط‌خواندنی — v1.5.0 §۱۱
// ▸ یک ماتریس مرکزی یکتا در هر پروژه — عضویت پویا از روابط فعال
// ▸ انتخاب چرخه نزدیک عنوان؛ فقط مقادیر همان چرخه
// ▸ سه وضعیت متمایز: بررسی‌نشده / بدون هم‌پوشانی / دارای هم‌پوشانی
// ▸ ثبت و ویرایش مقدار فقط در برگهٔ زمان‌سنجی (زیرردیف‌ها) انجام
//   می‌شود؛ هیچ ورودی عددی یا دکمهٔ ثبت مقداری در این صفحه نیست.
// ▸ روابط آرشیوشده + بازگردانی معتبر حفظ شده است.
// ═══════════════════════════════════════════════════════════
import { useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Network, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { HelpDot } from '@/components/common/HelpDot'
import { useStuck } from '@/components/common/SectionHeading'
import { EmptyState } from '@/components/common/Feedback'
import { qk } from '@/lib/api/keys'
import { overlapApi, type OverlapMatrixDto } from '@/lib/api/endpoints'
import { useAppStore } from '@/store/app-store'
import MatrixTable from './matrix/MatrixTable'
import PairList from './matrix/PairList'
import AddRelationDialog from './matrix/AddRelationDialog'
import ValidationPanel from './matrix/ValidationPanel'
import CycleSelector from './matrix/CycleSelector'
import { RestoreRelationControl } from './matrix/RelationControls'

export default function MatrixView({ projectId }: { projectId: string }) {
  const qc = useQueryClient()
  const openProject = useAppStore((s) => s.openProject)
  const [cycleId, setCycleId] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  // هدر بخش اصلی در top-14 چسبان می‌ماند — دسترسی دائم به «افزودن رابطهٔ موازی» (v1.5.2 §۸)
  const headRef = useRef<HTMLDivElement>(null)
  const headStuck = useStuck(headRef)

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

  const goTiming = () => openProject(projectId, 'timing')

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          ref={headRef}
          data-stuck={headStuck ? 'true' : 'false'}
          className="card-head sticky-heading pb-3"
        >
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
                  input: 'این صفحه فقط برای مرور و تحلیل است. ثبت مقدار هم‌پوشانی در برگهٔ زمان‌سنجی و در زیرردیف همان رابطه انجام می‌شود؛ روابط را می‌توانید از فرم عنصر یا خود برگه تعریف کنید.',
                  example: 'اگر عنصر «بارگذاری» و «پرس کوبی» هم‌زمان اجرا می‌شوند، رابطهٔ موازی آن‌ها را تعریف کنید؛ سپس مقدار هر چرخه را در زیرردیف همین رابطه در برگهٔ زمان‌سنجی ثبت کنید.',
                  note: 'همهٔ نماها به یک منبع داده وصل هستند؛ تغییر مقدار از برگهٔ زمان‌سنجی، ماتریس و فرم هر دو عنصر را هم‌زمان به‌روز می‌کند. «بررسی‌نشده» به معنی صفر نیست.',
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
            onChange={setCycleId}
          />

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
                  برای مشاهدهٔ مقادیر، یک چرخه انتخاب کنید. تا پیش از انتخاب چرخه، مقداری نمایش داده نمی‌شود
                  (میانگین یا حدس زده نمی‌شود).
                </p>
              )}

              {/* جدول دسکتاپ / لیست موبایل — فقط‌خواندنی (§۱۱) */}
              <div className="hidden md:block">
                <MatrixTable matrix={matrix ?? null} cycleSelected={!!cycleId} onGoTiming={goTiming} />
              </div>
              <div className="md:hidden">
                <PairList matrix={matrix ?? null} cycleSelected={!!cycleId} onGoTiming={goTiming} />
              </div>

              <ValidationPanel matrix={matrix ?? null} />

              {/* روابط آرشیوشده — بازگردانی در صورت معتبر بودن */}
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
            description: 'زیرردیف این رابطه در برگهٔ زمان‌سنجی (برای همهٔ اپراتورهای هر دو فعالیت درگیر) و فرم هر دو عنصر نمایش داده می‌شود.',
          })
        }}
      />
    </div>
  )
}

function ArchivedRelations({ matrix, onRestored }: { matrix: OverlapMatrixDto | null; onRestored: () => void }) {
  const archived = useMemo(() => matrix?.relations.filter((r) => !r.isActive) ?? [], [matrix])
  const nameOf = (id: string) => matrix?.members.find((m) => m.elementId === id)?.name
  if (archived.length === 0) return null
  // v1.5.1 §۶ — دلیل آرشیو CROSS_ACTIVITY صرفاً برچسب اطلاعاتی است؛
  // بازگردانی رابطهٔ بین‌فعالیت مجاز است و دیگر مسدود نمی‌شود.
  const isCrossActivity = (r: { elementLowId: string; elementHighId: string; archiveReason: string | null }) =>
    r.archiveReason === 'CROSS_ACTIVITY_NOT_SUPPORTED_BY_SESSION_SHEET'
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
              {isCrossActivity(r) ? ' — بین‌فعالیت' : ''}
            </span>
            <RestoreRelationControl
              projectId={matrix?.projectId ?? ''}
              relationId={r.id}
              label={`${nameOf(r.elementLowId) ?? '؟'} ↔ ${nameOf(r.elementHighId) ?? '؟'}`}
              crossActivity={isCrossActivity(r)}
              onDone={onRestored}
            />
          </li>
        ))}
      </ul>
    </details>
  )
}
