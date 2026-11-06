'use client'

// ═══════════════════════════════════════════════════════════
// حالت خالی، تأیید حذف با شمارش وابستگی‌ها، فاز در انتظار
// FR-26 (نمایش تعداد و نوع داده‌های وابسته پیش از حذف)
// ═══════════════════════════════════════════════════════════
import type { ReactNode } from 'react'
import { AlertTriangle, Inbox, Rocket } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed p-10 text-center', className)}>
      <div className="flex size-14 items-center justify-center rounded-2xl bg-brand-soft text-brand">
        {icon ?? <Inbox className="size-7" aria-hidden />}
      </div>
      <div className="space-y-1">
        <p className="font-bold">{title}</p>
        {description && <p className="mx-auto max-w-sm text-sm leading-6 text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  )
}

/** تأیید حذف دائمی — با فهرست وابستگی‌ها — FR-26 */
export function ConfirmDeleteDialog({
  open,
  onOpenChange,
  title,
  entityName,
  dependencies,
  onConfirm,
  loading,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  entityName: string
  /** برچسب فارسی → تعداد؛ فقط موارد بزرگ‌تر از صفر نمایش داده می‌شوند */
  dependencies: Record<string, number>
  onConfirm: () => void
  loading?: boolean
}) {
  const deps = Object.entries(dependencies).filter(([, count]) => count > 0)
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent dir="rtl">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-red">
            <AlertTriangle className="size-5" aria-hidden />
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-right">
              <p>
                «{entityName}» به‌طور <b>دائمی</b> حذف خواهد شد. این عملیات قابل بازگشت نیست و سطل بازیافت
                وجود ندارد.
              </p>
              {deps.length > 0 ? (
                <div className="rounded-xl bg-red-soft p-3">
                  <p className="mb-1.5 text-xs font-bold text-red">داده‌های وابسته که همزمان حذف می‌شوند:</p>
                  <ul className="list-inside list-disc space-y-0.5 text-xs text-muted-foreground">
                    {deps.map(([label, count]) => (
                      <li key={label} className="num">
                        {label}: {count.toLocaleString('fa-IR')}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">موردی وابسته به این رکورد وجود ندارد.</p>
              )}
              <p className="text-xs text-muted-foreground">
                برای حفظ قابلیت پیگیری، رویداد حداقلی حذف در تاریخچه ثبت می‌شود. نسخه‌های پشتیبان قدیمی ممکن
                است تا زمان چرخش حاوی این داده باشند؛ بازیابی آن‌ها با نشانگر حذف کنترل می‌شود.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel>انصراف</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault()
              onConfirm()
            }}
            className="bg-red text-white hover:bg-red/90"
            disabled={loading}
          >
            {loading ? 'در حال حذف…' : 'حذف دائمی'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/** نمای مراحل فازهای بعدی — صادقانه، بدون دکمه بی‌عمل — ADR-۰۰۱ */
export function PendingPhaseView({
  phase,
  title,
  items,
}: {
  phase: number
  title: string
  items: string[]
}) {
  return (
    <div className="animate-view-in mx-auto max-w-2xl space-y-4">
      <div className="card-premium overflow-hidden">
        <div className="flex items-center gap-3 border-b bg-gradient-to-l from-brand-soft/70 to-transparent p-5">
          <div className="chip-icon bg-brand-soft text-brand">
            <Rocket className="size-6" aria-hidden />
          </div>
          <div>
            <h2 className="text-lg font-extrabold">{title}</h2>
            <p className="text-xs text-muted-foreground">
              این بخش در <b>فاز {phase.toLocaleString('fa-IR')}</b> نقشه توسعه فعال می‌شود — قابلیت حذف
              نشده است
            </p>
          </div>
        </div>
        <div className="space-y-2.5 p-5">
          <p className="text-sm leading-7 text-muted-foreground">
            طبق سند مرجع، تمام قابلیت‌ها متعلق به نسخه اول هستند و فازبندی صرفاً ترتیب توسعه است. موارد زیر
            در این بخش پیاده‌سازی خواهند شد:
          </p>
          <ul className="space-y-2">
            {items.map((item, i) => (
              <li key={i} className="flex items-start gap-2 rounded-xl bg-muted p-3 text-sm">
                <span className="num mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[11px] font-bold text-brand">
                  {(i + 1).toLocaleString('fa-IR')}
                </span>
                {item}
              </li>
            ))}
          </ul>
          <div className="rounded-xl bg-amber-soft p-3 text-xs leading-6">
            <b className="text-amber">وضعیت فعلی:</b> ساختار داده و API پایه این بخش آماده است؛ رابط کاربری
            در جلسه توسعه بعدی افزوده می‌شود.
          </div>
        </div>
      </div>
    </div>
  )
}

export function PrimaryButton({
  children,
  className,
  ...props
}: React.ComponentProps<typeof Button>) {
  return (
    <Button className={cn('btn-brand border-0', className)} {...props}>
      {children}
    </Button>
  )
}
