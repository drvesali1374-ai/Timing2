'use client'

// ═══════════════════════════════════════════════════════════
// SectionHeading — سازوکار مشترک عنوان چسبان بخش‌های اصلی (v1.5.2 §۸)
// • عنوان اصلی + دکمه‌های مرتبط، هنگام اسکرول در top-14
//   (زیر نوار اصلی h-14) ثابت می‌شود؛ محتوا از زیر آن عبور می‌کند.
// • عنوان فقط در محدودهٔ ظرف خودش (view root یا کارت بخش) می‌چسبد؛
//   با رسیدن به بخش بعدی، عنوان قبلی به‌طور طبیعی جای خود را به
//   عنوان جدید می‌دهد — در هر لحظه فقط یک عنوان اصلی چسبان است.
// • تشخیص حالت «چسبیده» با IntersectionObserver روی خود عنصر:
//   top چسبان یک پیکسل پایین‌تر از مرز viewport منفی‌شده قرار
//   می‌گیرد تا در لحظهٔ چسبیدن نسبت تقاطع از ۱ کم شود.
// • فقط عنوان‌های اصلی صفحات از این سازوکار استفاده می‌کنند؛
//   عنوان‌های فرعی، متن کارت‌ها و هدر ستون جدول‌ها چسبان نمی‌شوند.
// • صفحات دارای نوار چسبان اختصاصی (Timing با TimingSubheader و
//   Activity با نوار زبانه‌ها) عمداً استفاده نمی‌کنند تا Sticky
//   تو در تو یا تداخل لایه‌ها ایجاد نشود.
// ═══════════════════════════════════════════════════════════
import { useEffect, useRef, useState, type RefObject } from 'react'
import { cn } from '@/lib/utils'

/**
 * useStuck — تشخیص حالت چسبیدن یک عنصر sticky در top ≈ 56px.
 * عنصر باید top: calc(3.5rem - 1px) داشته باشد (کلاس sticky-heading).
 */
export function useStuck(ref: RefObject<HTMLElement | null>): boolean {
  const [stuck, setStuck] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    // viewport منفی‌شده از بالا به اندازهٔ نوار اصلی (h-14 = 56px)
    const io = new IntersectionObserver(
      ([entry]) => {
        setStuck(entry.intersectionRatio < 1 && entry.boundingClientRect.top < 56)
      },
      { threshold: [1], rootMargin: '-56px 0px 0px 0px' }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [ref])

  return stuck
}

/** ردیف عنوان چسبان — فرزند مستقیم ظرف بخش (view root یا Card) */
export function SectionHeading({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const stuck = useStuck(ref)

  return (
    <div
      ref={ref}
      data-stuck={stuck ? 'true' : 'false'}
      className={cn('sticky-heading', className)}
    >
      {children}
    </div>
  )
}
