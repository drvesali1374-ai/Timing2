'use client'

// دکمهٔ سربرگ ستون برگهٔ زمان‌سنجی — باز کردن بخش روابط موازی عنصر با چرخه‌های همین جلسه — §۴.۱
import { useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="rounded-full bg-muted px-1.5 py-px text-[10px] font-bold text-muted-foreground transition-colors hover:bg-brand-soft hover:text-brand"
          title={`عناصر موازی و اطلاعات هم‌پوشانی «${elementName}»`}
          aria-label={`عناصر موازی و اطلاعات هم‌پوشانی «${elementName}»`}
          onClick={(e) => e.stopPropagation()}
        >
          <Network className="inline size-3" aria-hidden />
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto sm:max-w-xl" dir="rtl">
        <DialogHeader className="space-y-0 text-right">
          <DialogTitle className="text-right text-sm">عناصر موازی و اطلاعات هم‌پوشانی</DialogTitle>
          <DialogDescription className="text-right text-xs">
            عنصر «{elementName}» — مقادیر چرخه‌های همین جلسه
          </DialogDescription>
        </DialogHeader>
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
      </DialogContent>
    </Dialog>
  )
}
