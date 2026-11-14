'use client'

// ═══════════════════════════════════════════════════════════
// زیرهدر چسبان فعالیت — §۱۲.۱ جلسه دوم / v1.5.2 §۴
// تنها نوار چسبان صفحهٔ زمان‌سنجی (زیر TopBar با ارتفاع h-14):
// عنوان فعالیت + ایستگاه (تنها یک‌بار)، بازگشت به فهرست فعالیت‌ها،
// فیلتر اپراتور و دکمهٔ کوچک «جلسهٔ جدید».
// v1.5.2 §۴ — حالت «برگهٔ فعال» حذف شد؛ هنگام بازبودن جلسه،
// هدر واحد داخل SheetPanel (SubheaderBar یکپارچه) نمایش داده
// می‌شود و این مؤلفه فقط برای فهرست جلسات استفاده می‌شود.
// کارت‌های جلسه و جدول برگه هرگز چسبان نیستند.
// ═══════════════════════════════════════════════════════════
import { ListTree, Plus, Timer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { DisplayPrefs as Prefs } from '@/lib/format'
import { formatInt } from '@/lib/format'

export interface TimingSubheaderProps {
  prefs: Prefs
  /** عنوان فعالیت منتخب — تنها محل نمایش آن در طول کار */
  activityName: string
  /** ایستگاه فعالیت */
  stationName: string
  /** بازگشت به حالت انتخاب فعالیت */
  onOpenPicker: () => void
  /** امکان ایجاد جلسه (عنصر و اپراتور موجود باشد) */
  canCreateSession: boolean
  onCreateSession: () => void
  /** وضعیت فیلتر اپراتور */
  operatorFilter?: string | 'ALL'
  onOperatorFilter?: (value: string | 'ALL') => void
  /** اپراتورهای پروژه */
  operators?: { id: string; displayName: string }[]
  /** جلسات فعالیت برای شمارش */
  sessions?: { operatorId: string }[]
}

export function TimingSubheader({
  prefs,
  activityName,
  stationName,
  onOpenPicker,
  canCreateSession,
  onCreateSession,
  operatorFilter,
  onOperatorFilter,
  operators,
  sessions,
}: TimingSubheaderProps) {
  const operatorsWithSessions = Array.from(new Set((sessions ?? []).map((s) => s.operatorId)))
  const showChips = (sessions?.length ?? 0) > 0

  return (
    // z-40: بالاتر از سربرگ/ستون چسبان داخل جدول برگه (z-30)؛ هم‌تراز TopBar
    // که هیچ هم‌پوشانی هندسی با آن ندارد (چسبیدن از y=56px آغاز می‌شود).
    <div className="glass-bar sticky top-14 z-40 mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border px-3 py-2 shadow-[var(--shadow-1)]">
      {/* هویت فعالیت — تنها نمایش در حین کار — §۱۲.۱ */}
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
          <Timer className="size-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-extrabold leading-5">{activityName}</p>
          <p className="truncate text-[11px] leading-4 text-muted-foreground">ایستگاه {stationName}</p>
        </div>
      </div>

      <Button
        variant="outline"
        size="sm"
        onClick={onOpenPicker}
        className="shrink-0 gap-1.5"
      >
        <ListTree className="size-4" aria-hidden />
        فهرست فعالیت‌ها
      </Button>

      {showChips && (
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="text-xs font-bold text-muted-foreground">اپراتور:</span>
          <Badge variant="secondary" className="num shrink-0 text-[10px] font-bold">
            {formatInt(sessions!.length, prefs)} جلسه
          </Badge>
          <OperatorChip
            label="همه"
            active={operatorFilter === 'ALL'}
            onClick={() => onOperatorFilter?.('ALL')}
            count={sessions!.length}
            prefs={prefs}
          />
          {(operators ?? [])
            .filter((op) => operatorsWithSessions.includes(op.id))
            .map((op) => (
              <OperatorChip
                key={op.id}
                label={op.displayName}
                active={operatorFilter === op.id}
                onClick={() => onOperatorFilter?.(op.id)}
                count={sessions!.filter((s) => s.operatorId === op.id).length}
                prefs={prefs}
              />
            ))}
        </div>
      )}

      {canCreateSession && (
        <Button size="sm" onClick={onCreateSession} className="btn-brand ms-auto shrink-0 gap-1.5 border-0">
          <Plus className="size-4" aria-hidden />
          جلسهٔ جدید
        </Button>
      )}
    </div>
  )
}

/** چیپ فیلتر اپراتور با نشان تعداد — الگوی موجود TimingView */
function OperatorChip({
  label,
  active,
  onClick,
  count,
  prefs,
}: {
  label: string
  active: boolean
  onClick: () => void
  count: number
  prefs: Prefs
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`num flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold transition-colors ${
        active ? 'bg-brand text-white' : 'bg-muted text-muted-foreground hover:bg-brand-soft hover:text-brand'
      }`}
    >
      {label}
      <span className={`num rounded-full px-1.5 text-[10px] ${active ? 'bg-white/20' : 'bg-background/70'}`}>
        {formatInt(count, prefs)}
      </span>
    </button>
  )
}
