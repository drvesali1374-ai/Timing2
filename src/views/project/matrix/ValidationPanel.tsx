'use client'

// پنل اعتبارسنجی و خلاصهٔ محاسبات وابسته — §۶/§۷/§۸
import { Badge } from '@/components/ui/badge'
import { AlertTriangle, CircleCheck, CircleHelp, Layers, Timer } from 'lucide-react'
import { useDisplayPrefs } from '@/store/display-store'
import { formatTimeValue } from '@/lib/format'
import type { OverlapMatrixDto } from '@/lib/api/endpoints'

export default function ValidationPanel({ matrix }: { matrix: OverlapMatrixDto | null }) {
  const prefs = useDisplayPrefs()
  if (!matrix?.validation || !matrix.selectedCycle) return null
  const v = matrix.validation
  const nameOf = (id: string) => matrix.members.find((m) => m.elementId === id)?.name ?? id

  // §۳ ممیزی جلسه ۲ — دو حکم مستقل: سازگاری دادهٔ تأییدشده vs نتیجهٔ نهایی
  const confirmed = v.confirmedVerdict ?? v.verdict
  const overall = v.overallVerdict ?? v.verdict
  const verdictBadge =
    overall === 'VALID' ? (
      <Badge className="bg-green-soft text-green-foreground hover:bg-green-soft">
        <CircleCheck className="size-3.5" aria-hidden /> داده‌های تأییدشدهٔ این چرخه سازگارند
      </Badge>
    ) : overall === 'INVALID' ? (
      <Badge className="bg-red-soft text-red-foreground hover:bg-red-soft">
        <AlertTriangle className="size-3.5" aria-hidden /> داده‌های ناسازگار — تأیید نهایی مسدود است
      </Badge>
    ) : confirmed === 'VALID' ? (
      <Badge className="bg-amber-soft text-amber-foreground hover:bg-amber-soft">
        <CircleHelp className="size-3.5" aria-hidden /> داده‌های تأییدشده سازگارند؛ اعتبارسنجی کامل نیست
      </Badge>
    ) : (
      <Badge className="bg-amber-soft text-amber-foreground hover:bg-amber-soft">
        <CircleHelp className="size-3.5" aria-hidden /> نامعین — داده کامل نیست
      </Badge>
    )

  const hasAny =
    v.localFailures.length > 0 ||
    v.tripleIssues.length > 0 ||
    v.globalIssues.length > 0 ||
    (v.intervalIssues?.length ?? 0) > 0 ||
    v.provisionalWarnings.length > 0 ||
    v.multiOverlaps.length > 0 ||
    v.unions.length > 0

  if (!hasAny) return <div className="flex justify-center">{verdictBadge}</div>

  return (
    <div className="space-y-3 rounded-xl border bg-surface-2 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-bold">اعتبارسنجی و محاسبات وابسته (چرخهٔ انتخاب‌شده)</p>
        {verdictBadge}
      </div>

      {/* خطاهای قطعی — مسدودکننده (§۸.۱) + تعارض با بازهٔ واقعی (§۴ ممیزی) */}
      {(v.localFailures.length > 0 || v.tripleIssues.length > 0 || v.globalIssues.length > 0 || (v.intervalIssues?.some((i) => i.kind === 'DEFINITE') ?? false)) && (
        <ul className="space-y-1.5">
          {v.localFailures.map((lf, i) =>
            lf.failures.map((f, j) => (
              <li key={`l-${i}-${j}`} className="rounded-lg bg-red-soft/60 p-2 text-xs leading-5">
                <b>{nameOf(lf.pair[0])} ↔ {nameOf(lf.pair[1])}:</b> {f.message}
              </li>
            ))
          )}
          {v.tripleIssues.map((t, i) => (
            <li key={`t-${i}`} className="rounded-lg bg-red-soft/60 p-2 text-xs leading-5">
              {t.message}
            </li>
          ))}
          {v.globalIssues.map((g, i) => (
            <li key={`g-${i}`} className="rounded-lg bg-red-soft/60 p-2 text-xs leading-5">
              {g.message}
            </li>
          ))}
          {v.intervalIssues?.filter((i) => i.kind === 'DEFINITE').map((i, k) => (
            <li key={`iv-${k}`} className="rounded-lg bg-red-soft/60 p-2 text-xs leading-5">
              <b>{nameOf(i.pair[0])} ↔ {nameOf(i.pair[1])}:</b> {i.message}
            </li>
          ))}
        </ul>
      )}

      {/* بازهٔ ناقص — ادعای VALID قطعی ممکن نیست (§۴ ممیزی جلسه ۲) */}
      {(v.intervalIssues?.filter((i) => i.kind === 'INDETERMINATE').length ?? 0) > 0 && (
        <ul className="space-y-1.5">
          {v.intervalIssues?.filter((i) => i.kind === 'INDETERMINATE').map((i, k) => (
            <li key={`ivi-${k}`} className="rounded-lg bg-amber-soft/60 p-2 text-xs leading-5">
              <CircleHelp className="ml-1 inline size-3.5 text-amber" aria-hidden />
              {i.message}
            </li>
          ))}
        </ul>
      )}

      {/* هشدارهای موقتی (§۸.۲) */}
      {v.provisionalWarnings.length > 0 && (
        <ul className="space-y-1.5">
          {v.provisionalWarnings.map((w, i) => (
            <li key={`w-${i}`} className="rounded-lg bg-amber-soft/60 p-2 text-xs leading-5">
              <AlertTriangle className="ml-1 inline size-3.5 text-amber" aria-hidden />
              {w.message}
            </li>
          ))}
        </ul>
      )}

      {/* هم‌پوشانی چندتایی هر مجموعه (§۶.۳) */}
      {v.multiOverlaps.length > 0 && (
        <div className="space-y-1.5">
          <p className="flex items-center gap-1 text-xs font-bold">
            <Layers className="size-3.5 text-brand" aria-hidden />
            هم‌پوشانی چندتایی (کمینهٔ زوج‌های هر مجموعه)
          </p>
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {v.multiOverlaps.map((m, i) => (
              <li key={`m-${i}`} className="rounded-lg bg-card p-2 text-xs">
                <span className="block truncate text-muted-foreground">
                  {m.members.map((id) => nameOf(id)).join(' + ')}
                </span>
                {m.value == null ? (
                  <span className="text-muted-foreground">دادهٔ کافی نیست</span>
                ) : (
                  <span className="num font-bold" dir="ltr">
                    {formatTimeValue(m.value, prefs)} s
                  </span>
                )}
                {m.provisional && (
                  <span className="mr-2 rounded-md border border-dashed border-amber/70 bg-amber-soft/40 px-1 text-[10px]">
                    موقتی — روابط بررسی‌نشده دارد
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* زمان سپری‌شدهٔ مجموعه‌ها (§۶.۴) */}
      {v.unions.length > 0 && (
        <div className="space-y-1.5">
          <p className="flex items-center gap-1 text-xs font-bold">
            <Timer className="size-3.5 text-brand" aria-hidden />
            زمان سپری‌شدهٔ مجموعه‌ها (اجتماع بازه‌ها)
          </p>
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {v.unions.map((u, i) => (
              <li key={`u-${i}`} className="rounded-lg bg-card p-2 text-xs">
                <span className="block truncate text-muted-foreground">
                  {u.members.map((id) => nameOf(id)).join(' + ')}
                </span>
                {u.value == null ? (
                  <span className="text-muted-foreground">
                    قابل محاسبه نیست — بازهٔ شروع/پایان کافی ثبت نشده است
                  </span>
                ) : (
                  <span className="num font-bold" dir="ltr">
                    {formatTimeValue(u.value, prefs)} s
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
