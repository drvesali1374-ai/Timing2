'use client'

// ═══════════════════════════════════════════════════════════
// دیالوگ «تشخیص مشاهدهٔ مشکوک» — §۱۲.۳ جلسه دوم
// پنل فقط-خواندنی برای یک مشاهدهٔ SUSPECT: مقدار، روش تشخیص،
// N/Median/MAD، امتیاز و آستانهٔ واقعی استفاده‌شده، جزئیات IQR در
// حالت fallback، دلیل پرچم، تاریخ ثبت و وضعیت فعلی.
// مبنای نمایش snapshot ثبت‌شده در لحظهٔ پرچم‌گذاری است؛ برای
// داده‌های قدیمی از امتیاز/روش زندهٔ فعلی استفاده و فقدان snapshot
// اعلام می‌شود. این دیالوگ هیچ داده‌ای را تغییر نمی‌دهد؛ دکمهٔ
// «خروج از محاسبات» فقط جریان دیالوگ وضعیت موجود را زنجیر می‌کند.
// ═══════════════════════════════════════════════════════════
import { AlertTriangle, CheckCircle2, Eraser, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { CycleRowDto, ObservationCellDto } from '@/lib/api/endpoints'
import type { DisplayPrefs as Prefs } from '@/lib/format'
import { displayServerText, formatDateTime, formatInt, formatTimeValue } from '@/lib/format'

/** هدف تشخیص: چرخه + مشاهده + نام عنصر برای سربرگ دیالوگ */
export interface SuspectDiagTarget {
  cycle: CycleRowDto
  obs: ObservationCellDto
  elementName: string
}

/** snapshot تشخیصی ثبت‌شده در لحظهٔ پرچم‌گذاری — ساختار سرویس outlier */
interface OutlierSnapshot {
  value?: number | null
  method?: string | null
  methodLabel?: string | null
  threshold?: number | null
  thresholdLabel?: string | null
  score?: number | null
  rule?: string | null
  reason?: string | null
  n?: number | null
  appliedRule?: string | null
  flaggedAt?: string | null
  statistics?: {
    median?: number | null
    mad?: number | null
    mean?: number | null
    sampleSD?: number | null
    q1?: number | null
    q3?: number | null
    iqr?: number | null
    lowerFence?: number | null
    upperFence?: number | null
  } | null
}

/** برچسب فارسی قواعد تشخیص — هم‌نام با موتور محاسبات */
const OUTLIER_RULE_LABELS: Record<string, string> = {
  MODIFIED_Z_MAD: 'امتیاز Z تعدیل‌شده (میانه و MAD)',
  IQR_FENCE: 'حصار IQR',
  INSUFFICIENT_DATA: 'دادهٔ ناکافی',
}

/**
 * خواندن فیلدهای تشخیص خارج از ادنا از DTO مشاهده.
 * فیلدها به‌تازگی به DTO اضافه شده‌اند و ممکن است در پاسخ‌های قدیمی
 * نباشند؛ بنابراین ساختاری و دفاعی خوانده می‌شوند.
 */
function readOutlierInfo(obs: ObservationCellDto): {
  score: number | null
  rule: string | null
  snapshot: OutlierSnapshot | null
} {
  const o = obs as ObservationCellDto & {
    outlierScore?: number | null
    outlierRule?: string | null
    outlierSnapshot?: unknown
  }
  let snapshot: OutlierSnapshot | null = null
  const raw = o.outlierSnapshot
  if (typeof raw === 'string' && raw.trim() !== '') {
    try {
      const parsed = JSON.parse(raw) as OutlierSnapshot
      snapshot = parsed && typeof parsed === 'object' ? parsed : null
    } catch {
      snapshot = null
    }
  } else if (raw && typeof raw === 'object') {
    snapshot = raw as OutlierSnapshot
  }
  return {
    score: typeof o.outlierScore === 'number' ? o.outlierScore : null,
    rule: typeof o.outlierRule === 'string' ? o.outlierRule : null,
    snapshot,
  }
}

/** مقدار مشاهده به‌صورت متنی — بازه‌ها «ش تا م» — §۱۲.۳ */
function observationValueText(obs: ObservationCellDto, prefs: Prefs): string {
  if (obs.startOffset !== null || obs.endOffset !== null) {
    const start = obs.startOffset !== null ? formatTimeValue(obs.startOffset, prefs) : '؟'
    const end = obs.endOffset !== null ? formatTimeValue(obs.endOffset, prefs) : '؟'
    return `${start} تا ${end}`
  }
  return formatTimeValue(obs.rawDuration ?? obs.cumulativeReading ?? obs.derivedDuration, prefs)
}

/** عدد با حداکثر دو اعشار بدون صفرهای انتهایی — برای آستانه/ضریب */
function fmtCompact(value: number | null | undefined, prefs: Prefs): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  return displayServerText(String(Math.round(value * 100) / 100), prefs)
}

/** مقدار عددی با واحد ثانیه — عدد LTR و واحد فارسی */
function valueWithUnit(text: string): React.ReactNode {
  return (
    <span className="inline-flex min-w-0 items-baseline justify-end gap-1">
      <span className="num" dir="ltr">
        {text}
      </span>
      <span className="text-[10px] font-normal text-muted-foreground">ثانیه</span>
    </span>
  )
}

function ValidityBadge({ status }: { status: string }) {
  if (status === 'EXCLUDED')
    return (
      <Badge variant="outline" className="gap-1 text-faint">
        <Eraser className="size-3" aria-hidden /> خارج‌شده
      </Badge>
    )
  if (status === 'SUSPECT')
    return (
      <Badge className="gap-1 bg-amber-soft text-amber">
        <AlertTriangle className="size-3" aria-hidden /> مشکوک
      </Badge>
    )
  if (status === 'INVALID')
    return (
      <Badge className="gap-1 bg-red-soft text-red">
        <XCircle className="size-3" aria-hidden /> نامعتبر
      </Badge>
    )
  return (
    <Badge className="gap-1 bg-green-soft text-green">
      <CheckCircle2 className="size-3" aria-hidden /> معتبر
    </Badge>
  )
}

function DiagRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 rounded-lg bg-muted/60 px-2.5 py-1.5">
      <span className="text-[11px] font-bold text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right text-xs font-bold">{value}</span>
    </div>
  )
}

export function SuspectDiagnosticDialog({
  target,
  prefs,
  onClose,
  onExclude,
}: {
  target: SuspectDiagTarget | null
  prefs: Prefs
  onClose: () => void
  /** زنجیره به دیالوگ وضعیت مشاهدهٔ موجود برای خروج/بازگشت */
  onExclude: (target: SuspectDiagTarget) => void
}) {
  if (!target) return null

  const { cycle, obs, elementName } = target
  const { score, rule, snapshot } = readOutlierInfo(obs)
  const st = snapshot?.statistics ?? null
  const isIqrFallback = snapshot?.appliedRule === 'IQR_FENCE' || (!snapshot && rule === 'IQR_FENCE')
  const isExcluded = obs.validityStatus === 'EXCLUDED'

  const methodLabel = snapshot?.methodLabel ?? (rule ? (OUTLIER_RULE_LABELS[rule] ?? rule) : '—')
  const thresholdLabel = isIqrFallback ? 'ضریب حصار' : 'آستانهٔ امتیاز Z'
  const shownScore = snapshot?.score ?? score
  const shownThreshold = snapshot?.threshold ?? null

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent dir="rtl" className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="size-5 text-amber" aria-hidden />
            تشخیص مشاهدهٔ مشکوک
          </DialogTitle>
          <DialogDescription>
            عنصر «{elementName}» — چرخهٔ <b className="num">{formatInt(cycle.cycleNo, prefs)}</b>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <DiagRow label="مقدار مشاهده" value={valueWithUnit(observationValueText(obs, prefs))} />
          {obs.cumulativeReading !== null && obs.startOffset === null && (
            <DiagRow
              label="قرائت تجمعی ثبت‌شده"
              value={valueWithUnit(formatTimeValue(obs.cumulativeReading, prefs))}
            />
          )}
          <DiagRow
            label="مدت مبنای تشخیص"
            value={valueWithUnit(formatTimeValue(snapshot?.value ?? obs.derivedDuration, prefs))}
          />
          <DiagRow label="روش تشخیص" value={methodLabel} />
          {snapshot?.n != null && (
            <DiagRow
              label="تعداد مشاهدات مبنای تشخیص (N)"
              value={<span className="num">{formatInt(snapshot.n, prefs)}</span>}
            />
          )}
          {st && (
            <DiagRow
              label="میانه و MAD"
              value={
                <span className="num" dir="ltr">
                  {formatTimeValue(st.median, prefs)} / {formatTimeValue(st.mad, prefs)}
                </span>
              }
            />
          )}
          <DiagRow
            label={isIqrFallback ? 'فاصلهٔ نرمال‌شده و ضریب حصار' : 'امتیاز Z و آستانه'}
            value={
              shownScore !== null ? (
                <span dir="rtl">
                  <b className="num" dir="ltr">
                    {formatTimeValue(shownScore, prefs, 2)}
                  </b>
                  {' • '}
                  {thresholdLabel} ={' '}
                  <b className="num" dir="ltr">
                    {fmtCompact(shownThreshold, prefs)}
                  </b>
                </span>
              ) : (
                '—'
              )
            }
          />
          {isIqrFallback && (
            <div className="space-y-1 rounded-lg border border-amber/40 bg-amber-soft/50 p-2.5">
              <p className="text-[11px] font-bold text-amber">
                جزئیات حصار IQR — روش تشخیص واقعی در زمان پرچم‌گذاری (fallback از میانه/MAD)
              </p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] sm:grid-cols-3">
                <span className="num" dir="ltr">
                  Q1 = {fmtCompact(st?.q1, prefs)}
                </span>
                <span className="num" dir="ltr">
                  Q3 = {fmtCompact(st?.q3, prefs)}
                </span>
                <span className="num" dir="ltr">
                  IQR = {fmtCompact(st?.iqr, prefs)}
                </span>
                <span className="num" dir="ltr">
                  حصار پایین = {fmtCompact(st?.lowerFence, prefs)}
                </span>
                <span className="num" dir="ltr">
                  حصار بالا = {fmtCompact(st?.upperFence, prefs)}
                </span>
              </div>
            </div>
          )}
          {snapshot?.reason && (
            <DiagRow label="دلیل پرچم" value={displayServerText(snapshot.reason, prefs)} />
          )}
          <DiagRow label="تاریخ/زمان مشاهده" value={formatDateTime(cycle.createdAt, prefs)} />
          <DiagRow label="وضعیت فعلی" value={<ValidityBadge status={obs.validityStatus} />} />
        </div>

        {!snapshot && (
          <p className="rounded-lg bg-muted px-3 py-2 text-[11px] leading-6 text-muted-foreground">
            snapshot تشخیصی در زمان پرچم‌گذاری ثبت نشده (دادهٔ قدیمی)؛ امتیاز و روش نمایش‌داده‌شده از آخرین
            بازمحاسبهٔ زنده است.
          </p>
        )}

        <p className="rounded-lg bg-amber-soft px-3 py-2 text-[11px] leading-6 text-amber">
          مشکوک به معنی حذف خودکار نیست؛ داده خام حفظ می‌شود و تصمیم خروج از محاسبات با شماست.
        </p>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            بستن
          </Button>
          <Button
            className={
              isExcluded
                ? 'btn-brand gap-1.5 border-0'
                : 'gap-1.5 border-0 bg-red text-white hover:bg-red/90'
            }
            onClick={() => onExclude(target)}
          >
            {isExcluded ? 'بازگشت به محاسبات' : 'خروج از محاسبات'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
