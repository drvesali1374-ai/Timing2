'use client'

// ═══════════════════════════════════════════════════════════
// نشانگر وضعیت ذخیره — FR-23
// سه وضعیت: در حال ذخیره / ذخیره شد / خطا (+ تلاش مجدد)
// پیام موفقیت فقط پس از تأیید Backend
// ═══════════════════════════════════════════════════════════
import { Check, CloudOff, Loader2, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { SaveStatus } from '@/hooks/use-autosave'
import { cn } from '@/lib/utils'

export function SaveIndicator({
  status,
  onRetry,
  error,
  compact = false,
}: {
  status: SaveStatus
  onRetry?: () => void
  error?: string | null
  compact?: boolean
}) {
  if (status === 'idle') return null

  const base = cn('inline-flex items-center gap-1.5 text-xs font-medium transition-colors', compact && 'gap-1')

  switch (status) {
    case 'dirty':
      return (
        <span className={cn(base, 'text-faint')} aria-live="polite">
          <span className="size-1.5 rounded-full bg-amber animate-pulse" />
          تغییرات در صف ذخیره…
        </span>
      )
    case 'saving':
      return (
        <span className={cn(base, 'text-muted-foreground')} aria-live="polite" role="status">
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
          در حال ذخیره…
        </span>
      )
    case 'saved':
      return (
        <span className={cn(base, 'text-green')} aria-live="polite">
          <Check className="size-3.5" aria-hidden />
          ذخیره شد
        </span>
      )
    case 'error':
      return (
        <span className={cn(base, 'text-red')} role="alert">
          <CloudOff className="size-3.5" aria-hidden />
          <span className="max-w-52 truncate" title={error ?? undefined}>
            {error ? 'خطا در ذخیره‌سازی' : 'خطا در ذخیره‌سازی'}
          </span>
          {onRetry && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 gap-1 px-2 text-red hover:text-red"
              onClick={onRetry}
            >
              <RotateCcw className="size-3" aria-hidden />
              تلاش مجدد
            </Button>
          )}
        </span>
      )
  }
}
