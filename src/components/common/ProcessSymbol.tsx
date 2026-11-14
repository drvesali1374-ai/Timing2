'use client'

// ═══════════════════════════════════════════════════════════
// رندرکنندهٔ مشترک نمادهای فرایندی — بازطراحی v1.5.2 §۳
// شکل هندسی به‌صورت SVG توپر و بزرگ رندر می‌شود؛ بدون قاب
// مستطیلی، حاشیه و پس‌زمینهٔ بیرونی. رنگ‌آمیزی مستقیماً روی
// خود شکل اعمال می‌شود (fill = رنگ نوع فرایند).
// یک renderer/component واحد در همهٔ نماها (StructureView،
// ActivityView، ChartCanvas، انتخاب‌گر گره‌ها، legend) — CSS patch
// پراکنده ممنوع. FPC پنج نماد استاندارد: ○ □ ⇨ D ▽
// MATERIAL_INPUT گرهٔ مستقل ورودی مواد/قطعه/نیم‌ساخته است (⬡).
// ═══════════════════════════════════════════════════════════
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { MATERIAL_INPUT_NODE_TYPE } from '@/domain/types'

export type ProcessSymbolType = string // ProcessType | 'MATERIAL_INPUT'

/** برچسب فارسی هر نوع — شامل ورودی مواد */
export const PROCESS_TYPE_LABELS_WITH_INPUT: Record<string, string> = {
  OPERATION: 'عملیات',
  INSPECTION: 'بازرسی',
  TRANSPORT: 'حمل‌ونقل',
  DELAY: 'تأخیر',
  STORAGE: 'انبارش',
  [MATERIAL_INPUT_NODE_TYPE]: 'ورودی مواد/قطعات',
}

/** رنگ خود شکل بر اساس نوع — قرارداد رنگی واحد (v1.5.2 §۳: روی خود شکل) */
export const PROCESS_SYMBOL_COLOR: Record<string, string> = {
  OPERATION: 'text-brand',
  INSPECTION: 'text-amber',
  TRANSPORT: 'text-muted-foreground',
  DELAY: 'text-red',
  STORAGE: 'text-green',
  [MATERIAL_INPUT_NODE_TYPE]: 'text-cyan',
}

/** شکل SVG توپر هر نوع (viewBox 24×24) — استانداردهای FPC حفظ شده‌اند */
const PROCESS_SYMBOL_SHAPES: Record<string, ReactNode> = {
  OPERATION: <circle cx="12" cy="12" r="8.5" />,
  INSPECTION: <rect x="4.5" y="4.5" width="15" height="15" rx="2" />,
  TRANSPORT: <path d="M4 11.1 12.4 4.3v4.3H20v5h-7.6v4.3z" />,
  DELAY: <path d="M5 5h7.6a7 7 0 0 1 0 14H5z" />,
  STORAGE: <path d="M4.5 5.5h15L12 19.6z" />,
  [MATERIAL_INPUT_NODE_TYPE]: <path d="M12 3.6 19.7 8v8L12 20.4 4.3 16V8z" />,
}

/** اندازه‌های بازبینی‌شده — بدون قاب، خود شکل شاخص است (v1.5.2 §۳.۷) */
const SIZES = {
  sm: 'size-4',
  md: 'size-6',
  lg: 'size-9',
} as const

export type ProcessSymbolSize = keyof typeof SIZES

/**
 * نماد فرایندی — شکل توپر بدون قاب، در اندازه‌های sm/md/lg.
 * رنگ مستقیماً روی خود شکل اعمال می‌شود؛ تم روشن/تیره پشتیبانی می‌شود.
 * استفاده در همهٔ نماها به‌جای glyph خام یا CSS محلی.
 */
export function ProcessSymbol({
  type,
  size = 'md',
  className,
  title,
}: {
  type: ProcessSymbolType
  size?: ProcessSymbolSize
  className?: string
  title?: string
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      className={cn(
        'inline-block shrink-0 align-middle select-none',
        PROCESS_SYMBOL_COLOR[type] ?? PROCESS_SYMBOL_COLOR.OPERATION,
        SIZES[size] ?? SIZES.md,
        className
      )}
      role="img"
      aria-label={title ?? PROCESS_TYPE_LABELS_WITH_INPUT[type] ?? type}
    >
      {title ? <title>{title}</title> : null}
      {PROCESS_SYMBOL_SHAPES[type] ?? PROCESS_SYMBOL_SHAPES.OPERATION}
    </svg>
  )
}
