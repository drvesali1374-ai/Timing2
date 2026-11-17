'use client'

// ═══════════════════════════════════════════════════════════
// فوتر چسبان — الزام UI: پایین صفحه در محتوای کوتاه
// و رانده‌شدن طبیعی در محتوای بلند
// ═══════════════════════════════════════════════════════════
import { ShieldCheck, WifiOff } from 'lucide-react'

export function AppFooter({ compact = false }: { compact?: boolean }) {
  return (
    <footer className="mt-auto border-t bg-surface-2/70 no-print">
      <div
        className={`mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 text-[11px] text-faint sm:flex-row ${
          compact ? 'py-2' : 'py-3'
        }`}
      >
        <p className="flex items-center gap-1.5">
          <span className="font-bold text-muted-foreground">زمان‌سنجی صنعتی</span>
          <span aria-hidden>·</span>
          {/* v1.5.3 §۶ — فقط شناسهٔ نسخه؛ عنوان «نسخه اول — کامل (۷ فاز)» حذف شد */}
          <span className="font-mono" title="شناسهٔ ساخت — برای اطمینان از به‌روز بودن نسخه">
            v1.5.3
          </span>
        </p>
        <p className="flex items-center gap-3">
          <span className="flex items-center gap-1" title="بدون هیچ درخواست خارجی در زمان اجرا">
            <WifiOff className="size-3.5" aria-hidden />
            کارکرد کاملاً آفلاین
          </span>
          <span className="flex items-center gap-1" title="داده‌ها روی دیسک محلی همین میزبان">
            <ShieldCheck className="size-3.5" aria-hidden />
            داده محلی و امن
          </span>
        </p>
      </div>
    </footer>
  )
}
