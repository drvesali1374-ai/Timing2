'use client'

// ═══════════════════════════════════════════════════════════
// راهنمای آیکونی — FR-28 / ۷.۵ / §۸.۲ جلسه اول
// هر Popover شامل: این مورد چیست؟ / چه چیزی وارد کنم؟ /
// مثال صنعتی / نکته مهم — با محتوای واقعی همان فیلد
// کلیک روی trigger و داخل popover به والد clickable سرریز
// نمی‌شود (stopPropagation) — §۸.۲
// ═══════════════════════════════════════════════════════════
import { CircleHelp } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export interface HelpContent {
  /** این مورد چیست؟ */
  what: string
  /** چه چیزی وارد کنم؟ */
  input?: string
  /** مثال صنعتی واقع‌نما */
  example?: string
  /** نکته مهم — خطای رایج یا اثر محاسباتی */
  note?: string
}

/** جلوگیری از اجرای event والد clickable (کارت/ردیف/بازشو) — §۸.۲ */
function stopParentActivation(e: React.SyntheticEvent) {
  e.stopPropagation()
}

export function HelpDot({
  content,
  label,
  className,
}: {
  content: HelpContent
  label?: string
  className?: string
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label ? `راهنمای ${label}` : 'راهنما'}
          onClick={stopParentActivation}
          onKeyDown={stopParentActivation}
          className={cn(
            'inline-flex size-5 shrink-0 items-center justify-center rounded-full text-faint transition-colors hover:bg-brand-soft hover:text-brand focus-visible:outline-2 focus-visible:outline-ring',
            className
          )}
        >
          <CircleHelp className="size-4" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="center"
        className="w-80 overflow-hidden p-0"
        dir="rtl"
        onClick={stopParentActivation}
        onKeyDown={stopParentActivation}
        onWheel={stopParentActivation}
      >
        <div className="border-b bg-brand-soft/60 px-3 py-2 text-xs font-bold text-accent-foreground">
          راهنمای {label ?? 'این مورد'}
        </div>
        <div className="space-y-2.5 p-3 text-xs leading-6">
          <section>
            <p className="font-bold text-foreground">این مورد چیست؟</p>
            <p className="text-muted-foreground">{content.what}</p>
          </section>
          {content.input && (
            <section>
              <p className="font-bold text-foreground">چه چیزی وارد کنم؟</p>
              <p className="text-muted-foreground">{content.input}</p>
            </section>
          )}
          {content.example && (
            <section className="rounded-lg bg-muted p-2">
              <p className="font-bold text-foreground">مثال</p>
              <p className="text-muted-foreground">{content.example}</p>
            </section>
          )}
          {content.note && (
            <section className="rounded-lg bg-amber-soft p-2">
              <p className="font-bold text-amber">نکته مهم</p>
              <p className="text-muted-foreground">{content.note}</p>
            </section>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
