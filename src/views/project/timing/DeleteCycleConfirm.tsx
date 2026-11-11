'use client'

// ═══════════════════════════════════════════════════════════
// تأیید حذف چرخه — §۱۲.۴ جلسه دوم
// حذف چرخه با یک کلیک ممکن نیست؛ پیش از فراخوانی جریان حذف
// موجود (با Undo/Redo)، این AlertDialog جزئیات و پیامد حذف را
// نشان می‌دهد: شمارهٔ چرخه، اپراتور/جلسه، تعداد مشاهدات و
// قابل‌بازگشت‌بودن با Ctrl+Z تا زمانی که پنجره باز است.
// ═══════════════════════════════════════════════════════════
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
import type { CycleRowDto, SessionSheetDto } from '@/lib/api/endpoints'
import type { DisplayPrefs as Prefs } from '@/lib/format'
import { formatInt } from '@/lib/format'
import { TIMING_METHOD_LABELS } from '@/domain/types'

export function DeleteCycleConfirm({
  cycle,
  sheet,
  prefs,
  onOpenChange,
  onConfirm,
}: {
  /** چرخهٔ در انتظار تأیید — null یعنی بسته */
  cycle: CycleRowDto | null
  sheet: SessionSheetDto
  prefs: Prefs
  onOpenChange: (open: boolean) => void
  /** پس از تأیید — همان جریان حذف موجود (قابل بازگردانی با Undo) */
  onConfirm: () => void
}) {
  return (
    <AlertDialog open={cycle !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent dir="rtl">
        <AlertDialogHeader>
          <AlertDialogTitle>حذف چرخه</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-right leading-6">
              <p>
                چرخهٔ <b className="num">{cycle ? formatInt(cycle.cycleNo, prefs) : '—'}</b> از جلسهٔ{' '}
                <b>{sheet.operator.displayName}</b> (
                {TIMING_METHOD_LABELS[sheet.session.timingMethod]}) با{' '}
                <b className="num">{formatInt(cycle?.observations.length ?? 0, prefs)}</b> مشاهده حذف خواهد شد.
              </p>
              <p className="text-xs text-muted-foreground">
                حذف چرخه، مشاهدات و خطوط زمانی وابستهٔ آن را نیز حذف می‌کند. با Ctrl+Z قابل بازگردانی است تا
                پنجرهٔ فعلی باز باشد.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>انصراف</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="border-0 bg-red text-white hover:bg-red/90 focus-visible:ring-red/40"
          >
            حذف چرخه
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
