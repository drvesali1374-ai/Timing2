'use client'

// جدول ماتریس دسکتاپ — هدر sticky + ستون اول sticky + چهار حالت سلول — §۱۱
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { cn } from '@/lib/utils'
import { CircleHelp, CircleMinus, CircleX, Pencil } from 'lucide-react'
import { useDisplayPrefs } from '@/store/display-store'
import { formatTimeValue } from '@/lib/format'
import type { OverlapMatrixDto, OverlapStatusValue } from '@/lib/api/endpoints'
import type { CellDraft } from '../MatrixView'
import { useState } from 'react'

const STATUS_LABEL: Record<OverlapStatusValue, string> = {
  UNREVIEWED: 'بررسی‌نشده',
  NO_OVERLAP: 'بدون هم‌پوشانی',
  OVERLAP: 'دارای هم‌پوشانی',
}

export default function MatrixTable({
  matrix,
  drafts,
  onDraft,
  cycleSelected,
}: {
  matrix: OverlapMatrixDto | null
  drafts: Record<string, CellDraft>
  onDraft: (relationId: string, draft: CellDraft | null) => void
  /** §۷ ممیزی جلسه ۲ — بدون چرخه، سلول‌ها کاملاً غیرقابل‌ویرایش‌اند */
  cycleSelected: boolean
}) {
  const prefs = useDisplayPrefs()
  if (!matrix) return null
  const { members, relations, cells, comparability } = matrix
  const activeRelations = relations.filter((r) => r.isActive)
  const relByPair = new Map<string, string>()
  for (const r of activeRelations) relByPair.set(`${r.elementLowId}|${r.elementHighId}`, r.id)

  // زوج‌های دارای خطا (برای نشانگذاری سلول)
  const failedPairs = new Set<string>()
  if (matrix.validation) {
    for (const lf of matrix.validation.localFailures) {
      const key = lf.pair[0] < lf.pair[1] ? `${lf.pair[0]}|${lf.pair[1]}` : `${lf.pair[1]}|${lf.pair[0]}`
      failedPairs.add(key)
    }
    for (const ti of matrix.validation.tripleIssues) {
      const ids = ti.responsibleElementIds ?? []
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const key = ids[i] < ids[j] ? `${ids[i]}|${ids[j]}` : `${ids[j]}|${ids[i]}`
          failedPairs.add(key)
        }
      }
    }
    for (const ii of matrix.validation.intervalIssues ?? []) {
      if (ii.kind !== 'DEFINITE') continue
      const key = ii.pair[0] < ii.pair[1] ? `${ii.pair[0]}|${ii.pair[1]}` : `${ii.pair[1]}|${ii.pair[0]}`
      failedPairs.add(key)
    }
  }

  if (members.length === 0) return null

  return (
    <div className="overflow-x-auto rounded-2xl border" dir="rtl">
      <table className="w-full border-collapse text-sm" style={{ minWidth: `${Math.max(members.length * 108 + 190, 420)}px` }}>
        <thead>
          <tr className="sticky top-0 z-20 bg-card">
            <th className="sticky right-0 z-30 min-w-[170px] border-b border-l bg-card p-2 text-center text-xs font-bold">
              عنصر کاری
            </th>
            {members.map((m) => (
              <th
                key={m.elementId}
                className="min-w-[104px] border-b p-2 text-center text-xs font-bold"
                title={`${m.name} — ${m.activityName} / ${m.stationName}`}
              >
                <span className="line-clamp-2 leading-4">{m.name}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {members.map((row) => (
            <tr key={row.elementId} className="border-b last:border-b-0 hover:bg-surface-2/50">
              <th
                className="sticky right-0 z-10 max-w-[190px] border-l bg-card p-2 text-center text-xs font-bold"
                title={`${row.name} — ${row.activityName} / ${row.stationName}`}
              >
                <span className="line-clamp-2 leading-4">{row.name}</span>
              </th>
              {members.map((col) => {
                if (row.elementId === col.elementId) {
                  // قطر اصلی — خط‌دار و غیرقابل ویرایش (§۱۱)
                  return (
                    <td key={col.elementId} className="matrix-diagonal p-2" aria-label="قطر ماتریس" />
                  )
                }
                const low = row.elementId < col.elementId ? row.elementId : col.elementId
                const high = row.elementId < col.elementId ? col.elementId : row.elementId
                const relationId = relByPair.get(`${low}|${high}`)
                const pairKey = `${low}|${high}`
                const failed = failedPairs.has(pairKey)
                if (!relationId) {
                  return (
                    <td key={col.elementId} className="p-2 text-center text-muted-foreground/50" title="رابطه‌ای تعریف نشده است">
                      ·
                    </td>
                  )
                }
                return (
                  <td key={col.elementId} className={cn('p-1.5 text-center', failed && 'bg-red-soft/50')}>
                    <MatrixCell
                      relationId={relationId}
                      cell={cells[relationId] ?? null}
                      draft={drafts[relationId] ?? null}
                      onDraft={onDraft}
                      prefs={prefs}
                      rowName={row.name}
                      colName={col.name}
                      cycleSelected={cycleSelected}
                      comparable={comparability[relationId]?.isComparable !== false}
                      notComparableReason={comparability[relationId]?.notComparableReason ?? null}
                    />
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function MatrixCell({
  relationId,
  cell,
  draft,
  onDraft,
  prefs,
  rowName,
  colName,
  cycleSelected,
  comparable,
  notComparableReason,
}: {
  relationId: string
  cell: OverlapMatrixDto['cells'][string] | null
  draft: CellDraft | null
  onDraft: (relationId: string, draft: CellDraft | null) => void
  prefs: ReturnType<typeof useDisplayPrefs>
  rowName: string
  colName: string
  cycleSelected: boolean
  comparable: boolean
  notComparableReason: string | null
}) {
  const [open, setOpen] = useState(false)
  const effective: CellDraft = draft ?? {
    status: cell?.status ?? 'UNREVIEWED',
    overlapDuration: cell?.overlapDuration ?? null,
  }
  const isDraft = draft != null
  // §۷ ممیزی جلسه ۲ — بدون چرخه یا برای زوج غیرقابل‌مقایسه، ویرایش غیرفعال است
  const editable = cycleSelected && comparable
  if (!editable) {
    return (
      <span
        className="flex w-full min-h-[38px] cursor-not-allowed items-center justify-center rounded-lg px-1.5 py-1 opacity-80"
        aria-disabled="true"
        title={
          !cycleSelected
            ? 'برای ویرایش مقدار، ابتدا یک چرخه انتخاب کنید'
            : notComparableReason ?? 'در این چرخه قابل‌مقایسه نیست'
        }
      >
        {comparable ? (
          <CellContent status={effective.status} duration={effective.overlapDuration} prefs={prefs} />
        ) : (
          <span className="rounded-md border border-dashed border-muted-foreground/50 bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">
            در این چرخه قابل‌مقایسه نیست
          </span>
        )}
      </span>
    )
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex w-full min-h-[38px] items-center justify-center gap-1 rounded-lg px-1.5 py-1 text-xs transition-colors hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
            isDraft && 'ring-2 ring-brand/60'
          )}
          aria-label={`ویرایش هم‌پوشانی ${rowName} و ${colName}`}
        >
          <CellContent status={effective.status} duration={effective.overlapDuration} prefs={prefs} />
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-sm" dir="rtl">
        <DialogHeader className="space-y-0 text-right">
          <DialogTitle className="text-right text-sm">ویرایش هم‌پوشانی</DialogTitle>
          <DialogDescription className="text-right text-xs">
            {rowName} ↔ {colName}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <RadioGroup
            value={effective.status}
            onValueChange={(v) =>
              onDraft(relationId, {
                status: v as OverlapStatusValue,
                overlapDuration: v === 'OVERLAP' ? effective.overlapDuration : null,
              })
            }
            className="gap-2"
          >
            <Label className="flex items-center gap-2 rounded-lg border p-2 text-xs font-normal">
              <RadioGroupItem value="UNREVIEWED" />
              <CircleHelp className="size-4 text-muted-foreground" aria-hidden />
              بررسی‌نشده (مقدار ثبت نشده)
            </Label>
            <Label className="flex items-center gap-2 rounded-lg border p-2 text-xs font-normal">
              <RadioGroupItem value="NO_OVERLAP" />
              <CircleMinus className="size-4 text-green" aria-hidden />
              بدون هم‌پوشانی (تأیید صفر)
            </Label>
            <Label className="flex items-center gap-2 rounded-lg border p-2 text-xs font-normal">
              <RadioGroupItem value="OVERLAP" />
              <CircleX className="size-4 text-brand" aria-hidden />
              دارای هم‌پوشانی (مقدار مثبت)
            </Label>
          </RadioGroup>
          {effective.status === 'OVERLAP' && (
            <div className="space-y-1">
              <Label htmlFor={`ov-${relationId}`} className="text-xs">
                مدت هم‌پوشانی (ثانیه)
              </Label>
              <Input
                id={`ov-${relationId}`}
                dir="ltr"
                type="number"
                min="0.001"
                step="0.001"
                value={effective.overlapDuration ?? ''}
                onChange={(e) =>
                  onDraft(relationId, {
                    status: 'OVERLAP',
                    overlapDuration: e.target.value === '' ? null : Number(e.target.value),
                  })
                }
              />
            </div>
          )}
          <p className="text-[11px] leading-5 text-muted-foreground">
            مقدار فقط برای چرخهٔ انتخاب‌شده ثبت می‌شود. پس از «ثبت تغییرات» نوار بالا، اعتبارسنجی و هم‌پوشانی
            چندتایی مجدداً محاسبه می‌شود.
          </p>
          <div className="flex justify-between gap-2">
            <Button variant="ghost" size="sm" onClick={() => onDraft(relationId, null)} disabled={!isDraft}>
              بازگردانی سلول
            </Button>
            <Button size="sm" onClick={() => setOpen(false)} disabled={!isDraft}>
              <Pencil className="size-3.5" aria-hidden />
              نگه‌داری تغییر
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function CellContent({
  status,
  duration,
  prefs,
}: {
  status: OverlapStatusValue
  duration: number | null
  prefs: ReturnType<typeof useDisplayPrefs>
}) {
  if (status === 'UNREVIEWED') {
    // UNREVIEWED هرگز به شکل عدد صفر نمایش داده نمی‌شود (§۱۱)
    return (
      <span className="rounded-md border border-dashed border-amber/70 bg-amber-soft/40 px-1.5 py-0.5 text-[11px] text-amber-foreground">
        {STATUS_LABEL.UNREVIEWED}
      </span>
    )
  }
  if (status === 'NO_OVERLAP') {
    return (
      <span className="rounded-md border border-green/40 bg-green-soft/50 px-1.5 py-0.5 text-[11px] text-green-foreground">
        {STATUS_LABEL.NO_OVERLAP}
      </span>
    )
  }
  return (
    <span className="num font-bold" dir="ltr">
      {formatTimeValue(duration, prefs)}
      <span className="mr-1 text-[10px] font-normal text-muted-foreground">s</span>
    </span>
  )
}
