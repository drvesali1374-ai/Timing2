'use client'

// دکمهٔ سربرگ ستون برگهٔ زمان‌سنجی — باز کردن بخش روابط موازی عنصر با چرخه‌های همین جلسه — §۴.۱
import { useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Network } from 'lucide-react'
import ParallelRelationsSection, { type CycleContextOption } from './ParallelRelationsSection'

export default function ElementParallelPopover({
  projectId,
  elementId,
  elementName,
  cycleOptions,
  defaultCycleId,
}: {
  projectId: string
  elementId: string
  elementName: string
  cycleOptions: CycleContextOption[]
  defaultCycleId: string | null
}) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="rounded-full bg-muted px-1.5 py-px text-[10px] font-bold text-muted-foreground transition-colors hover:bg-brand-soft hover:text-brand"
          title={`عناصر موازی و اطلاعات هم‌پوشانی «${elementName}»`}
          aria-label={`عناصر موازی و اطلاعات هم‌پوشانی «${elementName}»`}
          onClick={(e) => e.stopPropagation()}
        >
          <Network className="inline size-3" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-96" dir="rtl" align="start">
        {open && (
          <ParallelRelationsSection
            projectId={projectId}
            elementId={elementId}
            elementName={elementName}
            cycleOptions={cycleOptions}
            defaultCycleId={defaultCycleId}
            compact
          />
        )}
      </PopoverContent>
    </Popover>
  )
}
