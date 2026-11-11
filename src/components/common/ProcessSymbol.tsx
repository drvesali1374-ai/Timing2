'use client'

// ═══════════════════════════════════════════════════════════
// رندرکنندهٔ مشترک نمادهای فرایندی — جلسه ۲ §۱۵.۲
// یک renderer/component واحد در همهٔ نماها (StructureView، ActivityView،
// ChartCanvas، انتخاب‌گر گره‌ها، legend) — CSS patch پراکنده ممنوع.
// FPC پنج نماد استاندارد: ○ □ ⇨ D ▽
// MATERIAL_INPUT گرهٔ مستقل ورودی مواد/قطعه/نیم‌ساخته است (⬡) — event فراینی نیست.
// ═══════════════════════════════════════════════════════════
import { cn } from '@/lib/utils'
import {
  PROCESS_TYPE_SYMBOLS,
  MATERIAL_INPUT_SYMBOL,
  MATERIAL_INPUT_NODE_TYPE,
} from '@/domain/types'

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

export function processSymbolOf(type: ProcessSymbolType): string {
  if (type === MATERIAL_INPUT_NODE_TYPE) return MATERIAL_INPUT_SYMBOL
  return PROCESS_TYPE_SYMBOLS[type as keyof typeof PROCESS_TYPE_SYMBOLS] ?? '?'
}

/** استایل قاب نماد بر اساس نوع — قرارداد رنگی واحد */
export const PROCESS_SYMBOL_BOX: Record<string, string> = {
  OPERATION: 'rounded-full border-2 border-brand text-brand bg-brand-soft',
  INSPECTION: 'rounded-md border-2 border-amber text-amber bg-amber-soft',
  TRANSPORT: 'rounded-md border-2 border-muted-foreground/60 text-muted-foreground bg-muted/40',
  DELAY: 'rounded-md border-2 border-red text-red bg-red-soft',
  STORAGE: 'rounded-md border-2 border-green text-green bg-green-soft',
  [MATERIAL_INPUT_NODE_TYPE]: 'rounded-lg border-2 border-dashed border-cyan text-cyan bg-cyan-soft',
}

const SIZES = {
  sm: { box: 'size-6 text-sm rounded-lg', font: 'text-sm' },
  md: { box: 'size-9 text-lg rounded-xl', font: 'text-lg' },
  lg: { box: 'size-12 text-2xl rounded-2xl', font: 'text-2xl' },
} as const

export type ProcessSymbolSize = keyof typeof SIZES

/**
 * نماد فرایندی در قاب خوانا — اندازه‌های sm/md/lg.
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
  const s = SIZES[size] ?? SIZES.md
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center font-bold leading-none select-none',
        PROCESS_SYMBOL_BOX[type] ?? PROCESS_SYMBOL_BOX.OPERATION,
        s.box,
        className
      )}
      title={title ?? PROCESS_TYPE_LABELS_WITH_INPUT[type] ?? type}
      aria-hidden
    >
      {processSymbolOf(type)}
    </span>
  )
}
