'use client'

// ═══════════════════════════════════════════════════════════
// چیپ مشترک فرمول زمان استاندارد — v1.5.2 §۳.۲
// «ST = NT × (1 + A)» / «ST = NT / (1 − A)» در همهٔ محل‌های پروژه از
// همین کامپوننت استفاده می‌کند: فاصلهٔ داخلی یکنواخت از لبهٔ کادر،
// direction:ltr برای عبارت ریاضی (ترتیب ریاضی تغییر نمی‌کند) و جایگاه
// مناسب در رابط فارسی (RTL). هم‌ارز آفلاین: UI.stFormula در ui.js.
// ═══════════════════════════════════════════════════════════
import { cn } from '@/lib/utils'

export function StFormula({
  formula,
  className,
}: {
  formula: string
  className?: string
}) {
  return (
    <span
      dir="ltr"
      className={cn(
        'num inline-flex items-center justify-center rounded-lg border border-dashed border-brand/40 bg-brand-soft/40 px-3.5 py-2 text-[12px] font-extrabold leading-5 text-brand',
        className
      )}
    >
      {formula}
    </span>
  )
}
