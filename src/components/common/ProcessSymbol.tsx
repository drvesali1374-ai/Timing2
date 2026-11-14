'use client'

// ═══════════════════════════════════════════════════════════
// رندرکنندهٔ مشترک نمادهای فرایندی — v1.5.2 Part-3 §۴
// شکل هندسی به‌صورت «خط‌دار» (outline) رندر می‌شود:
//   • خط دور (stroke) با رنگ کامل نوع فرایند — واضح و غالب؛
//   • داخل شکل با همان رنگ ولی تینت بسیار ملایم (~۱۲٪) پر می‌شود؛
//   • ضخامت خط متناسب با اندازه (~۱٫۵–۲px در مقیاس مبنا) تنظیم می‌شود.
// اندازه‌ها حدوداً ۳ برابر شدند (§۴.۲): sm=۴۸ · md=۷۲ · lg=۹۶px.
// یک renderer/component واحد در همهٔ نماها (StructureView،
// ActivityView، ChartCanvas، انتخاب‌گر گره‌ها، legend) — CSS patch
// پراکنده ممنوع. FPC پنج نماد استاندارد: ○ □ ⇨ D ▽
// MATERIAL_INPUT گرهٔ مستقل ورودی مواد/قطعه/نیم‌ساخته است (⬡).
// تم روشن/تیره: رنگ از currentColor کلاس text-* می‌آید؛ تینت و
// خط هر دو از همان رنگ مشتق می‌شوند — در هر دو تم خواناست.
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

/** رنگ نماد بر اساس نوع — قرارداد رنگی واحد (روی stroke و تینت داخل) */
export const PROCESS_SYMBOL_COLOR: Record<string, string> = {
  OPERATION: 'text-brand',
  INSPECTION: 'text-amber',
  TRANSPORT: 'text-muted-foreground',
  DELAY: 'text-red',
  STORAGE: 'text-green',
  [MATERIAL_INPUT_NODE_TYPE]: 'text-cyan',
}

/** شکل SVG هر نوع (viewBox 24×24) — استانداردهای FPC حفظ شده‌اند.
 *  مسیرها توپر تعریف می‌شوند ولی رندر خط‌دار است: stroke کامل + fill ملایم. */
const PROCESS_SYMBOL_SHAPES: Record<string, ReactNode> = {
  OPERATION: <circle cx="12" cy="12" r="8.5" />,
  INSPECTION: <rect x="4.5" y="4.5" width="15" height="15" rx="2" />,
  TRANSPORT: <path d="M4 11.1 12.4 4.3v4.3H20v5h-7.6v4.3z" />,
  DELAY: <path d="M5 5h7.6a7 7 0 0 1 0 14H5z" />,
  STORAGE: <path d="M4.5 5.5h15L12 19.6z" />,
  [MATERIAL_INPUT_NODE_TYPE]: <path d="M12 3.6 19.7 8v8L12 20.4 4.3 16V8z" />,
}

/** اندازه‌های بازبینی‌شده — ~۳ برابر (v1.5.2 Part-3 §۴.۲):
 *  sm=۴۸px (کارت‌های فعالیت/نمادهای همراه متن) · md=۷۲px (کارت گره
 *  نمودار OPC/FPC) · lg=۹۶px (نمایش‌های بزرگ). */
const SIZES = {
  sm: 'size-12',
  md: 'size-18',
  lg: 'size-24',
} as const

/** ضخامت خط دور بر حسب واحد viewBox (۲۴) — به‌گونه‌ای تنظیم شده که
 *  وزن بصری خط در هر سه اندازه متعادل بماند (خط هرگز توپر/سنگین نمی‌شود
 *  و در اندازهٔ مبنا ≈ ۱٫۵–۲px است — §۴.۱). */
const STROKE_WIDTH: Record<ProcessSymbolSize, number> = {
  sm: 1.75,
  md: 1.5,
  lg: 1.4,
}

/** تینت داخل شکل — ~۱۲٪ رنگ نوع فرایند (§۴.۱: ۱۰–۱۵٪) */
const FILL_OPACITY = 0.12

export type ProcessSymbolSize = keyof typeof SIZES

/**
 * نماد فرایندی — شکل خط‌دار با داخلِ تینت‌شده، در اندازه‌های sm/md/lg.
 * stroke با رنگ کامل نوع فرایند و fill با ~۱۲٪ همان رنگ؛ تم روشن/تیره
 * از طریق currentColor پشتیبانی می‌شود. استفاده در همهٔ نماها به‌جای
 * glyph خام یا CSS محلی. برای چیدمان‌های فشرده (آیتم‌های دراپ‌داون و
 * غیره) می‌توان با className اندازهٔ ظاهری را کوچک‌تر کرد؛ ضخامت خط
 * هم‌مقیاس باقی می‌ماند.
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
      xmlns="http://www.w3.org/2000/svg"
      fill="currentColor"
      fillOpacity={FILL_OPACITY}
      stroke="currentColor"
      strokeWidth={STROKE_WIDTH[size] ?? STROKE_WIDTH.md}
      strokeLinejoin="round"
      strokeLinecap="round"
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
