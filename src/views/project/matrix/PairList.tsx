'use client'

// نمای موبایل — لیست زوج‌ها به‌جای جدول فشرده — §۱۱
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { cn } from '@/lib/utils'
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

export default function PairList({
  matrix,
  drafts,
  onDraft,
  cycleSelected,
}: {
  matrix: OverlapMatrixDto | null
  drafts: Record<string, CellDraft>
  onDraft: (relationId: string, draft: CellDraft | null) => void
  cycleSelected: boolean
}) {
  const prefs = useDisplayPrefs()
  const [expanded, setExpanded] = useState<string | null>(null)
  if (!matrix) return null
  const nameOf = (id: string) => matrix.members.find((m) => m.elementId === id)
  const activeRelations = matrix.relations.filter((r) => r.isActive)

  return (
    <ul className="space-y-2">
      {activeRelations.map((r) => {
        const a = nameOf(r.elementLowId)
        const b = nameOf(r.elementHighId)
        const cell = matrix.cells[r.id] ?? null
        const draft = drafts[r.id] ?? null
        const effective: CellDraft = draft ?? {
          status: cell?.status ?? 'UNREVIEWED',
          overlapDuration: cell?.overlapDuration ?? null,
        }
        const isOpen = expanded === r.id
        return (
          <li key={r.id} className="rounded-xl border bg-card p-3">
            <button
              type="button"
              className="flex w-full items-center justify-between gap-2 text-right"
              onClick={() => setExpanded(isOpen ? null : r.id)}
              aria-expanded={isOpen}
            >
              <span className="min-w-0 flex-1 space-y-0.5">
                <span className="block truncate text-sm font-bold">
                  {a?.name ?? '؟'} ↔ {b?.name ?? '؟'}
                </span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {a?.activityName ?? '؟'} / {a?.stationName ?? '؟'} — {b?.activityName ?? '؟'} / {b?.stationName ?? '؟'}
                </span>
              </span>
              <span className="shrink-0">
                {effective.status === 'UNREVIEWED' ? (
                  <span className="rounded-md border border-dashed border-amber/70 bg-amber-soft/40 px-2 py-1 text-[11px]">
                    {STATUS_LABEL.UNREVIEWED}
                  </span>
                ) : effective.status === 'NO_OVERLAP' ? (
                  <span className="rounded-md border border-green/40 bg-green-soft/50 px-2 py-1 text-[11px]">
                    {STATUS_LABEL.NO_OVERLAP}
                  </span>
                ) : (
                  <span className="num rounded-md bg-brand-soft px-2 py-1 text-xs font-bold" dir="ltr">
                    {formatTimeValue(effective.overlapDuration, prefs)} s
                  </span>
                )}
              </span>
            </button>
            {isOpen && cycleSelected && (
              <div className="mt-3 space-y-3 border-t pt-3">
                <RadioGroup
                  value={effective.status}
                  onValueChange={(v) =>
                    onDraft(r.id, {
                      status: v as OverlapStatusValue,
                      overlapDuration: v === 'OVERLAP' ? effective.overlapDuration : null,
                    })
                  }
                  className="gap-2"
                >
                  <Label className="flex items-center gap-2 rounded-lg border p-2 text-xs font-normal">
                    <RadioGroupItem value="UNREVIEWED" />
                    بررسی‌نشده
                  </Label>
                  <Label className="flex items-center gap-2 rounded-lg border p-2 text-xs font-normal">
                    <RadioGroupItem value="NO_OVERLAP" />
                    بدون هم‌پوشانی
                  </Label>
                  <Label className="flex items-center gap-2 rounded-lg border p-2 text-xs font-normal">
                    <RadioGroupItem value="OVERLAP" />
                    دارای هم‌پوشانی
                  </Label>
                </RadioGroup>
                {effective.status === 'OVERLAP' && (
                  <div className="space-y-1">
                    <Label htmlFor={`mov-${r.id}`} className="text-xs">
                      مدت هم‌پوشانی (ثانیه)
                    </Label>
                    <Input
                      id={`mov-${r.id}`}
                      dir="ltr"
                      type="number"
                      min="0.001"
                      step="0.001"
                      value={effective.overlapDuration ?? ''}
                      onChange={(e) =>
                        onDraft(r.id, {
                          status: 'OVERLAP',
                          overlapDuration: e.target.value === '' ? null : Number(e.target.value),
                        })
                      }
                    />
                  </div>
                )}
                {draft && (
                  <Button variant="ghost" size="sm" onClick={() => onDraft(r.id, null)}>
                    بازگردانی سلول
                  </Button>
                )}
              </div>
            )}
            {isOpen && !cycleSelected && (
              <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">
                برای ویرایش مقدار، ابتدا یک چرخه انتخاب کنید.
              </p>
            )}
          </li>
        )
      })}
    </ul>
  )
}
