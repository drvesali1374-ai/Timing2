'use client'

// ═══════════════════════════════════════════════════════════
// نشان وضعیت — رنگ + آیکون + متن (FR-30: رنگ به‌تنهایی کافی نیست)
// ═══════════════════════════════════════════════════════════
import { AlertTriangle, CheckCircle2, Circle, CircleDashed, Hourglass, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { StageStatus } from '@/domain/types'
import { STAGE_STATUS_LABELS } from '@/domain/types'

const MAP: Record<string, { icon: typeof Circle; cls: string; dot: string }> = {
  PENDING: { icon: Circle, cls: 'bg-muted text-muted-foreground', dot: 'bg-faint' },
  IN_PROGRESS: { icon: Hourglass, cls: 'bg-cyan-soft text-cyan', dot: 'bg-cyan animate-pulse' },
  DONE: { icon: CheckCircle2, cls: 'bg-green-soft text-green', dot: 'bg-green' },
  NEEDS_REVIEW: { icon: AlertTriangle, cls: 'bg-amber-soft text-amber', dot: 'bg-amber' },
  FUTURE_PHASE: { icon: Lock, cls: 'bg-muted text-faint', dot: 'bg-faint' },
}

export function StageStatusBadge({ status, className }: { status: string; className?: string }) {
  const conf = MAP[status] ?? MAP.PENDING
  const Icon = conf.icon
  const label =
    status === 'FUTURE_PHASE' ? 'فاز بعدی' : STAGE_STATUS_LABELS[status as StageStatus] ?? status
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold',
        conf.cls,
        className
      )}
    >
      <Icon className="size-3" aria-hidden />
      {label}
    </span>
  )
}

/** نقطه وضعیت برای سایدبار */
export function StageStatusDot({ status }: { status: string }) {
  const conf = MAP[status] ?? MAP.PENDING
  return <span className={cn('inline-block size-2 rounded-full shrink-0', conf.dot)} aria-hidden />
}

export function ProjectStatusBadge({ status, finalized }: { status: string; finalized?: boolean }) {
  if (finalized || status === 'FINALIZED') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-soft px-2.5 py-0.5 text-[11px] font-bold text-green">
        <CheckCircle2 className="size-3" aria-hidden />
        نهایی‌شده
      </span>
    )
  }
  if (status === 'DRAFT') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-bold text-muted-foreground">
        <CircleDashed className="size-3" aria-hidden />
        پیش‌نویس
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-cyan-soft px-2.5 py-0.5 text-[11px] font-bold text-cyan">
      <Hourglass className="size-3" aria-hidden />
      در حال انجام
    </span>
  )
}
