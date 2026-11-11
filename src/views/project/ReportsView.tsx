'use client'

// ═══════════════════════════════════════════════════════════
// مرکز گزارش‌ها و خروجی‌ها — فاز ۶ / FR-22
//
// • انتخاب پروژه (زمینهٔ جاری)، ایستگاه/فعالیت، اپراتور و نوع گزارش
// • خروجی Excel برای تحلیل داده‌ها (۴ نوع گزارش)
// • خروجی PDF/چاپ برای گزارش رسمی — نمای کاغذ A4 با چیدمان چاپ
// • گزارش شامل: پارامترها و فرض‌های محاسبات، روش کرنومتر، تعداد
//   نمونه، داده‌های خارج‌شده، جدول وستینگهاوس، دسته‌های مجاز و
//   فرمول زمان استاندارد
// • گزارش نتیجهٔ نیازمند بازبینی را استاندارد قطعی معرفی نمی‌کند
// ═══════════════════════════════════════════════════════════
import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  AlertTriangle,
  BadgeCheck,
  FileSpreadsheet,
  FileText,
  Loader2,
  Printer,
  RefreshCw,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { EmptyState } from '@/components/common/Feedback'
import { HelpDot } from '@/components/common/HelpDot'
import {
  EXCEL_REPORT_LABELS,
  reportsApi,
  type ExcelReportTypeValue,
  type StudyReportInfoDto,
} from '@/lib/api/endpoints'
import { qk } from '@/lib/api/keys'
import { useDisplayPrefs } from '@/store/display-store'
import { useAppStore } from '@/store/app-store'
import { displayServerText, formatDate, formatDateTime, formatInt, formatPercent, formatTimeValue } from '@/lib/format'

const NOT_COMPUTABLE = 'قابل محاسبه نیست'

// ═══════════════ پیش‌نمایش گزارش رسمی (کاغذ A4) ═══════════════

function ReportPaper({ report }: { report: StudyReportInfoDto }) {
  const prefs = useDisplayPrefs()

  return (
    <div
      id="print-area"
      className="print-report mx-auto w-full max-w-[820px] space-y-6 rounded-2xl border bg-white p-6 text-slate-900 shadow-sm sm:p-8"
      style={{ colorScheme: 'light' }}
    >
      {/* ── سربرگ گزارش ── */}
      <header className="print-break-avoid space-y-2 border-b-2 border-slate-800 pb-4 text-center">
        <h1 className="text-lg font-black sm:text-xl">گزارش مطالعهٔ زمان</h1>
        <p className="text-sm font-bold">{report.project.name}</p>
        <p className="text-xs text-slate-600">
          خط تولید: {report.project.lineName} · محصول: {report.project.productName}
          {report.project.studyDate ? ` · تاریخ مطالعه: ${formatDate(report.project.studyDate, prefs)}` : ''}
        </p>
        <p className="text-xs text-slate-600">
          وضعیت: {report.project.statusLabel}
          {report.project.finalized ? ' (نهایی‌شده؛ ویرایش باز است)' : ''} · تاریخ گزارش:{' '}
          {formatDateTime(report.reportMeta.generatedAt, prefs)}
          {report.reportMeta.activityFilter ? ` · فعالیت: ${report.reportMeta.activityFilter.name}` : ' · همهٔ فعالیت‌ها'}
          {report.reportMeta.operatorFilter ? ` · اپراتور: ${report.reportMeta.operatorFilter.name}` : ' · همهٔ اپراتورها'}
        </p>
      </header>

      {/* ── پرچم‌های بازبینی — صداقت گزارش ── */}
      {(report.flags.pendingSuspects > 0 ||
        report.flags.needsRecalc ||
        report.flags.activitiesNeedingAggregationRule.length > 0 ||
        report.flags.activitiesIncomplete.length > 0 ||
        report.flags.sampleTargetsNotReached.length > 0 ||
        report.flags.elementsUnrated.length > 0) && (
        <section className="print-break-avoid space-y-1.5 rounded-lg border border-amber-500 bg-amber-50 p-3 text-xs leading-6 text-amber-800">
          <p className="flex items-center gap-1.5 font-bold">
            <AlertTriangle className="size-4 shrink-0" aria-hidden />
            موارد نیازمند توجه پیش از اتکا به نتایج:
          </p>
          <ul className="list-inside list-disc space-y-0.5 pr-4">
            {report.flags.pendingSuspects > 0 && (
              <li>{formatInt(report.flags.pendingSuspects, prefs)} مشاهدهٔ مشکوک بازبینی‌نشده در محاسبات لحاظ شده است.</li>
            )}
            {report.flags.needsRecalc && <li>محاسبهٔ رسمی پس از آخرین تغییر مؤثر تازه‌سازی نشده است.</li>}
            {report.flags.activitiesNeedingAggregationRule.length > 0 && (
              <li>فعالیت‌های نیازمند قاعدهٔ تجمیع: {report.flags.activitiesNeedingAggregationRule.join('، ')}</li>
            )}
            {report.flags.activitiesIncomplete.length > 0 && (
              <li>فعالیت‌های ناقص (ST قابل محاسبه نیست): {report.flags.activitiesIncomplete.join('، ')}</li>
            )}
            {report.flags.elementsUnrated.length > 0 && (
              <li>
                {formatInt(report.flags.elementsUnrated.length, prefs)} عنصر بدون ارزیابی وستینگهاوس:{' '}
                {report.flags.elementsUnrated.slice(0, 5).join('، ')}
                {report.flags.elementsUnrated.length > 5 ? ' و …' : ''}
              </li>
            )}
            {report.flags.sampleTargetsNotReached.length > 0 && (
              <li>فعالیت‌های نرسیده به هدف نمونه: {report.flags.sampleTargetsNotReached.join('، ')}</li>
            )}
          </ul>
        </section>
      )}

      {report.reportMeta.operatorNote && (
        <p className="print-break-avoid rounded-lg border border-slate-300 bg-slate-50 p-3 text-xs leading-6">
          {displayServerText(report.reportMeta.operatorNote, prefs)}
        </p>
      )}

      {/* ── پارامترها و فرض‌های محاسبات ── */}
      <section className="print-break-avoid">
        <h2 className="mb-2 border-b border-slate-300 pb-1 text-sm font-black">۱) پارامترها و فرض‌های محاسبات</h2>
        <table className="w-full text-xs">
          <tbody>
            {[
              ['فرمول زمان استاندارد', report.assumptions.stFormula + (report.assumptions.stFormulaConstraint ? ` — ${report.assumptions.stFormulaConstraint}` : '')],
              ['روش اعمال مجاز', report.assumptions.allowanceMethodLabel],
              ['روش تجمیع چند اپراتور', report.assumptions.aggregationMethodLabel],
              ['روش تشخیص دادهٔ غیرعادی', displayServerText(`${report.assumptions.outlierMethodLabel} (آستانهٔ ${report.assumptions.outlierThresholdLabel})`, prefs)],
              ['نسخهٔ فرمول', displayServerText(report.assumptions.formulaVersion, prefs)],
              ['قاعدهٔ وستینگهاوس', displayServerText(report.assumptions.westinghouseNote, prefs)],
            ].map(([label, value]) => (
              <tr key={label} className="border-b border-slate-100 align-top">
                <th scope="row" className="w-44 py-1.5 pl-2 text-right font-bold">
                  {label}
                </th>
                <td className="py-1.5 leading-6">{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-1.5 text-[10px] leading-5 text-slate-500">
          R = 1 + Skill + Effort + Conditions + Consistency · NT = OT × R · زمان پایه ثانیه است؛ گردکردن فقط نمایشی است و مقادیر خام با دقت کامل نگهداری می‌شوند.
        </p>
      </section>

      {/* ── بخش هر فعالیت ── */}
      {report.activities.map((sec, idx) => (
        <section key={sec.activity.id} className="space-y-3">
          <h2 className="print-break-avoid border-b border-slate-300 pb-1 text-sm font-black">
            {formatInt(idx + 2, prefs)}) فعالیت: {sec.activity.name}
            <span className="text-xs font-normal text-slate-600">
              {' '}
              — ایستگاه {sec.activity.stationName} · {sec.activity.processTypeLabel}
              {sec.activity.groupName ? ` · گروه ${sec.activity.groupName}` : ''}
            </span>
          </h2>

          {sec.activity.description && (
            <p className="text-[11px] leading-5 text-slate-600">{sec.activity.description}</p>
          )}

          {/* روش کرنومتر + نمونه */}
          <div className="print-break-avoid grid gap-3 text-xs sm:grid-cols-2">
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="mb-1 font-bold">روش کرنومتر جلسات</p>
              {sec.methods.length === 0 ? (
                <p className="text-slate-500">
                  {report.reportMeta.operatorFilter
                    ? 'این اپراتور در این فعالیت جلسه‌ای ثبت نکرده است.'
                    : 'جلسه‌ای ثبت نشده است.'}
                </p>
              ) : (
                <ul className="space-y-0.5">
                  {sec.methods.map((m) => (
                    <li key={m.methodKey}>
                      • {m.methodLabel} — {formatInt(m.sessionsCount, prefs)} جلسه · اپراتورها: {m.operators.join('، ')}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="mb-1 font-bold">تعداد نمونه</p>
              <p>
                {sec.sampleProgress.validCycles === null || sec.sampleProgress.totalCycles === null ? (
                  <>
                    جلسه‌های این اپراتور: <b>{formatInt(sec.sampleProgress.sessionsCount, prefs)}</b> جلسه
                    {sec.activity.targetSampleCount !== null
                      ? ` — هدف فعالیت: ${formatInt(sec.activity.targetSampleCount, prefs)} چرخهٔ معتبر`
                      : ''}
                  </>
                ) : (
                  <>
                    چرخهٔ معتبر: <b>{formatInt(sec.sampleProgress.validCycles, prefs)}</b> از{' '}
                    {formatInt(sec.sampleProgress.totalCycles, prefs)} چرخهٔ ثبت‌شده در{' '}
                    {formatInt(sec.sampleProgress.sessionsCount, prefs)} جلسه
                    {sec.activity.targetSampleCount !== null
                      ? ` — هدف: ${formatInt(sec.activity.targetSampleCount, prefs)} (${sec.sampleProgress.reached ? 'رسیده' : 'نرسیده'})`
                      : ' — هدف ثبت نشده'}
                  </>
                )}
              </p>
              <p className="mt-1 text-[10px] leading-4 text-slate-500">{displayServerText(sec.sampleProgress.message, prefs)}</p>
            </div>
          </div>

          {/* زمان سپری‌شدهٔ چرخه‌ها */}
          <p className="print-break-avoid text-xs leading-6">
            {sec.cycleStats.count === null ? (
              <>
                زمان سپری‌شدهٔ چرخه: <b>{NOT_COMPUTABLE}</b> (مفهوم سطح کل فعالیت)
              </>
            ) : (
              <>
                زمان سپری‌شدهٔ چرخه‌های قابل استفاده: <b>{formatInt(sec.cycleStats.count, prefs)}</b> چرخه · میانگین{' '}
                <b>{sec.cycleStats.mean === null ? NOT_COMPUTABLE : formatTimeValue(sec.cycleStats.mean, prefs)}</b> ثانیه · انحراف معیار{' '}
                <b>{sec.cycleStats.sampleSD === null ? NOT_COMPUTABLE : formatTimeValue(sec.cycleStats.sampleSD, prefs)}</b> · CV{' '}
                <b>{sec.cycleStats.cvPercent === null ? NOT_COMPUTABLE : formatPercent(sec.cycleStats.cvPercent / 100, prefs, 1)}</b>
              </>
            )}
            <span className="block text-[10px] leading-4 text-slate-500">{displayServerText(sec.cycleStats.methodNote, prefs)}</span>
          </p>

          {/* الونس‌های مؤثر — جلسه اول */}
          <div className="print-break-avoid">
            <p className="mb-1 text-xs font-bold">
              الونس‌های مؤثر (جمع A = {formatPercent(sec.allowances.summary.totalPercent, prefs, 2)})
              {sec.allowances.summary.perCycleSeconds > 0 || sec.allowances.perCycleTotal > 0
                ? ` — زمان ثابت هر چرخه: ${formatTimeValue(sec.allowances.perCycleTotal, prefs, 1)} ثانیه`
                : ''}
            </p>
            {sec.allowances.rows.length === 0 ? (
              <p className="text-xs text-slate-500">الونسی برای این فعالیت مؤثر نیست.</p>
            ) : (
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="border-b border-slate-300 text-center">
                    <th className="py-1 pl-1 text-right font-bold">عنوان الونس</th>
                    <th className="py-1 font-bold">نوع / مبنا</th>
                    <th className="py-1 font-bold">مقدار مؤثر</th>
                    <th className="py-1 font-bold">مبدأ</th>
                    <th className="py-1 font-bold">وضعیت</th>
                  </tr>
                </thead>
                <tbody>
                  {sec.allowances.rows.map((row) => (
                    <tr key={row.definitionId} className="border-b border-slate-100">
                      <td className="py-1 pl-1 text-right">
                        {row.title}
                        {row.code ? ` (${row.code})` : ''}
                      </td>
                      <td className="py-1 text-center">
                        {row.valueType === 'PERCENT'
                          ? 'درصدی'
                          : row.valueType === 'FIXED_TIME'
                            ? row.applicationBasis === 'PER_CYCLE'
                              ? 'زمان ثابت — هر چرخه'
                              : 'زمان ثابت — هر اجرا'
                            : '—'}
                      </td>
                      <td className="py-1 text-center font-bold tabular-nums">
                        {row.status === 'EXCLUDED'
                          ? '—'
                          : row.valueType === 'PERCENT'
                            ? formatPercent(row.percentValue, prefs, 2)
                            : row.valueType === 'FIXED_TIME'
                              ? `${formatTimeValue(row.timeValueSeconds, prefs, 1)}s`
                              : '—'}
                      </td>
                      <td className="py-1 text-center">{row.sourceScopeLabel ?? '—'}</td>
                      <td className="py-1 text-center">
                        {row.status === 'INHERITED'
                          ? 'ارث‌رسیده'
                          : row.status === 'OVERRIDDEN'
                            ? 'جایگزین‌شده'
                            : row.status === 'CUSTOM'
                              ? 'اختصاصی'
                              : 'حذف از ارث‌بری'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* جدول عناصر + وستینگهاوس */}
          <div className="print-break-avoid space-y-1">
            <p className="text-xs font-bold">عناصر کاری — آمار، وستینگهاوس و زمان‌ها (ثانیه)</p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-[11px]">
                <thead>
                  <tr className="border-b border-slate-300 text-right">
                    <th className="py-1 pl-1 font-bold">عنصر</th>
                    <th className="py-1 font-bold">نوع</th>
                    <th className="py-1 font-bold">n</th>
                    <th className="py-1 font-bold">میانگین</th>
                    <th className="py-1 font-bold">SD</th>
                    <th className="py-1 font-bold">CV٪</th>
                    <th className="py-1 font-bold">OT</th>
                    <th className="py-1 font-bold">وستینگهاوس (S/E/C/Cons)</th>
                    <th className="py-1 font-bold">R</th>
                    <th className="py-1 font-bold">NT</th>
                    <th className="py-1 font-bold">ST</th>
                  </tr>
                </thead>
                <tbody>
                  {sec.elements.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="py-2 text-center text-slate-500">
                        عنصری تعریف نشده است.
                      </td>
                    </tr>
                  ) : (
                    sec.elements.map((el, i) => (
                      <tr key={`${sec.activity.id}-${i}`} className="border-b border-slate-100">
                        <td className="py-1 pl-1">{el.name}</td>
                        <td className="py-1 text-center">{el.elementTypeLabel}</td>
                        <td className="py-1 text-center tabular-nums">{formatInt(el.stats.count, prefs)}</td>
                        <td className="py-1 text-center tabular-nums">
                          {el.stats.mean === null ? '—' : formatTimeValue(el.stats.mean, prefs)}
                        </td>
                        <td className="py-1 text-center tabular-nums">
                          {el.stats.sampleSD === null ? '—' : formatTimeValue(el.stats.sampleSD, prefs)}
                        </td>
                        <td className="py-1 text-center tabular-nums">
                          {el.stats.cvPercent === null ? '—' : formatPercent(el.stats.cvPercent / 100, prefs, 1)}
                        </td>
                        <td className="py-1 text-center font-bold tabular-nums">
                          {el.ot === null ? '—' : formatTimeValue(el.ot, prefs)}
                        </td>
                        <td className="py-1 text-center">
                          {el.rating ? (
                            <span className="tabular-nums" dir="rtl">
                              {el.rating.skill.grade ?? '—'}/{formatTimeValue(el.rating.skill.value, prefs)} ·{' '}
                              {el.rating.effort.grade ?? '—'}/{formatTimeValue(el.rating.effort.value, prefs)} ·{' '}
                              {el.rating.conditions.grade ?? '—'}/{formatTimeValue(el.rating.conditions.value, prefs)} ·{' '}
                              {el.rating.consistency.grade ?? '—'}/{formatTimeValue(el.rating.consistency.value, prefs)}
                              <span className="block text-[9px] text-slate-500">جدول: {el.rating.tableName}</span>
                            </span>
                          ) : (
                            <span className="text-amber-700">ارزیابی نشده</span>
                          )}
                        </td>
                        <td className="py-1 text-center tabular-nums">
                          {el.rating ? formatTimeValue(el.rating.totalFactor, prefs, 3) : '—'}
                        </td>
                        <td className="py-1 text-center tabular-nums">
                          {el.nt === null ? '—' : formatTimeValue(el.nt, prefs)}
                        </td>
                        <td className="py-1 text-center font-bold tabular-nums">
                          {el.stError ? (
                            <span className="font-normal text-amber-700">{displayServerText(el.stError, prefs)}</span>
                          ) : el.st === null ? (
                            '—'
                          ) : (
                            formatTimeValue(el.st, prefs)
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <p className="text-[10px] leading-4 text-slate-500">مبنای OT: {displayServerText(sec.elements[0]?.otNote ?? '—', prefs)}</p>
          </div>

          {/* استاندارد کل فعالیت */}
          <p
            className={`print-break-avoid rounded-lg border p-2.5 text-xs leading-6 ${
              sec.activityTotal.status === 'OK'
                ? 'border-green-600 bg-green-50 font-bold text-green-800'
                : 'border-amber-500 bg-amber-50 text-amber-800'
            }`}
          >
            {sec.activityTotal.status === 'OK' ? (
              <>
                <BadgeCheck className="ml-1 inline size-4 align-[-3px]" aria-hidden />
                زمان استاندارد کل فعالیت: {formatTimeValue(sec.activityTotal.st, prefs)} ثانیه — {displayServerText(sec.activityTotal.reason, prefs)}
              </>
            ) : (
              <>
                <AlertTriangle className="ml-1 inline size-4 align-[-3px]" aria-hidden />
                زمان استاندارد کل فعالیت:{' '}
                {sec.activityTotal.status === 'NEEDS_AGGREGATION_RULE' ? 'نیازمند قاعدهٔ تجمیع' : 'قابل محاسبه نیست'} —{' '}
                {displayServerText(sec.activityTotal.reason, prefs)}
              </>
            )}
          </p>

          {/* داده‌های مشکوک و خارج‌شده */}
          {sec.suspects.length > 0 && (
            <div className="print-break-avoid space-y-1">
              <p className="text-xs font-bold">مشاهدات مشکوک و خارج‌شده از محاسبات (دادهٔ خام حفظ می‌شود)</p>
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="border-b border-slate-300 text-right">
                    <th className="py-1 pl-1 font-bold">عنصر</th>
                    <th className="py-1 font-bold">چرخه</th>
                    <th className="py-1 font-bold">اپراتور</th>
                    <th className="py-1 font-bold">مقدار (ثانیه)</th>
                    <th className="py-1 font-bold">وضعیت</th>
                    <th className="py-1 font-bold">امتیاز / قاعده</th>
                    <th className="py-1 font-bold">دلیل خروج</th>
                  </tr>
                </thead>
                <tbody>
                  {sec.suspects.map((s) => (
                    <tr key={s.observationId} className="border-b border-slate-100">
                      <td className="py-1 pl-1">{s.elementName}</td>
                      <td className="py-1 text-center tabular-nums">{formatInt(s.cycleNo, prefs)}</td>
                      <td className="py-1 text-center">{s.operatorName}</td>
                      <td className="py-1 text-center tabular-nums">{formatTimeValue(s.value, prefs)}</td>
                      <td className="py-1 text-center">
                        {s.validityStatus === 'SUSPECT' ? 'مشکوک (در محاسبات مانده)' : 'خارج‌شده'}
                      </td>
                      <td className="py-1 text-center tabular-nums">
                        {s.score === null ? '—' : formatTimeValue(s.score, prefs, 2)} / {s.rule ?? '—'}
                      </td>
                      <td className="py-1 text-center">{s.exclusionReason ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ))}

      {/* ── سلب مسئولیت و امضا ── */}
      <footer className="print-break-avoid space-y-4 border-t-2 border-slate-800 pt-3">
        <p className="text-[11px] leading-6 text-slate-700">{displayServerText(report.disclaimer, prefs)}</p>
        <div className="grid grid-cols-2 gap-6 text-xs sm:grid-cols-3">
          <div className="border-t border-slate-400 pt-1 text-center">نام کارشناس زمان‌سنجی</div>
          <div className="border-t border-slate-400 pt-1 text-center">تأیید سرپرست تولید</div>
          <div className="hidden border-t border-slate-400 pt-1 text-center sm:block">تاریخ تأیید</div>
        </div>
        <p className="text-center text-[10px] text-slate-400">
          تولیدشده توسط نرم‌افزار زمان‌سنجی صنعتی — {formatDateTime(report.reportMeta.generatedAt, prefs)}
        </p>
      </footer>
    </div>
  )
}

// ═══════════════ نمای اصلی ═══════════════

export default function ReportsView({ projectId }: { projectId: string }) {
  const prefs = useDisplayPrefs()
  const [excelType, setExcelType] = useState<ExcelReportTypeValue>('overview')
  const [operatorId, setOperatorId] = useState<string>('all')
  // انتخاب صریح کاربر مقدم بر پیش‌انتخاب یک‌باره است (الگوی پیش‌فرض بدون Effect)
  const [userActivityId, setUserActivityId] = useState<string | null>(null)

  const selectionQuery = useQuery({
    queryKey: qk.reportSelection(projectId),
    queryFn: () => reportsApi.selection(projectId),
  })

  // پیش‌انتخاب از خروجی سریع تحلیل فعالیت — FR-22 (یک‌بار مصرف)
  const prefillActivityId = useAppStore((s) => s.reportPrefillActivityId)
  const setReportPrefillActivity = useAppStore((s) => s.setReportPrefillActivity)
  const activityId = userActivityId ?? prefillActivityId ?? 'all'
  const selectActivity = (next: string) => {
    setReportPrefillActivity(null)
    setUserActivityId(next)
  }
  // با خروج از صفحهٔ گزارش‌ها، پیش‌انتخاب مصرف می‌شود
  useEffect(
    () => () => {
      setReportPrefillActivity(null)
    },
    [setReportPrefillActivity]
  )

  const filterOpts = useMemo(
    () => ({
      activityId: activityId !== 'all' ? activityId : undefined,
      operatorId: operatorId !== 'all' ? operatorId : undefined,
    }),
    [activityId, operatorId]
  )

  const reportQuery = useQuery({
    queryKey: qk.studyReport(projectId, filterOpts.activityId, filterOpts.operatorId),
    queryFn: () => reportsApi.study(projectId, filterOpts),
    enabled: (selectionQuery.data?.sessionsCount ?? 0) > 0,
  })

  const downloadExcel = () => {
    const url = reportsApi.excelUrl(projectId, excelType, filterOpts)
    window.open(url)
    toast.success('فایل Excel در حال دانلود است؛ برای تحلیل، مقادیر عددی واقعی هستند.')
  }

  const stations = selectionQuery.data?.stations ?? []
  const allActivities = stations.flatMap((s) => s.activities)
  const operators = selectionQuery.data?.operators ?? []
  const hasData = (selectionQuery.data?.sessionsCount ?? 0) > 0

  if (selectionQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    )
  }

  if (selectionQuery.isError) {
    return (
      <EmptyState
        title="بارگذاری مرکز گزارش‌ها ناموفق بود"
        description={(selectionQuery.error as Error).message}
        action={
          <Button variant="outline" onClick={() => selectionQuery.refetch()}>
            <RefreshCw className="size-4" aria-hidden />
            تلاش مجدد
          </Button>
        }
      />
    )
  }

  return (
    <div className="space-y-5">
      {/* ── سربرگ ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex flex-wrap items-center gap-2 text-lg font-black">
          <FileText className="size-5 text-brand" aria-hidden />
          مرکز گزارش‌ها و خروجی‌ها
          <HelpDot
            label="مرکز گزارش‌ها"
            content={{
              what: 'محل تهیهٔ خروجی Excel برای تحلیل داده و گزارش رسمی PDF/چاپ با تمام پارامترها و فرض‌های محاسبات.',
              input: 'نوع گزارش، فعالیت و اپراتور را انتخاب کنید؛ فیلترها هم روی Excel و هم روی گزارش رسمی اعمال می‌شوند.',
              example: 'برای گزارش یک اپراتور خاص، او را از فیلتر انتخاب کنید؛ زمان‌ها میانگین همان اپراتور خواهد بود و در متن گزارش شفاف می‌شود.',
              note: 'گزارش رسمی، نتیجهٔ نیازمند بازبینی را استاندارد قطعی معرفی نمی‌کند و موارد بازبینی را در ابتدا فهرست می‌کند.',
            }}
          />
        </h2>
        {hasData && (
          <Button variant="outline" size="sm" className="gap-1.5 print:hidden" onClick={() => window.print()}>
            <Printer className="size-4" aria-hidden />
            چاپ / ذخیره PDF
          </Button>
        )}
      </div>

      {!hasData ? (
        <EmptyState
          icon={<FileSpreadsheet className="size-7" aria-hidden />}
          title="هنوز داده‌ای برای گزارش‌گیری ثبت نشده است"
          description="پس از ثبت چرخه‌ها در مرحلهٔ زمان‌سنجی، خروجی Excel و گزارش رسمی PDF در همین صفحه فعال می‌شوند."
        />
      ) : (
        <>
          {/* ── فیلترها و Excel ── */}
          <Card className="print:hidden rounded-2xl">
            <CardHeader className="pb-3">
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                <FileSpreadsheet className="size-5 text-brand" aria-hidden />
                فیلترها و خروجی Excel
                <HelpDot
                  label="خروجی Excel"
                  content={{
                    what: 'چهار نوع خروجی Excel برای تحلیل داده‌ها؛ همهٔ شیت‌ها راست‌به‌چپ و مقادیر عددی واقعی‌اند.',
                    input: 'نوع گزارش را انتخاب کنید: نگاه کل، خلاصهٔ محاسبات (با شیت وستینگهاوس و دسته‌های مجاز)، مقایسهٔ اپراتورها یا داده‌های خام.',
                    example: '«داده‌های خام» برای بازبینی در Excel مناسب است؛ مقدار خام، قرائت تجمعی، بازه‌ها و وضعیت هر مشاهده در آن است.',
                    note: 'فیلتر فعالیت/اپراتور روی همهٔ انواع اعمال می‌شود؛ سلول‌های فاقد داده خالی می‌مانند نه صفر.',
                  }}
                />
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <div className="space-y-1.5">
                  <Label htmlFor="rp-type">نوع گزارش Excel</Label>
                  <Select value={excelType} onValueChange={(v) => setExcelType(v as ExcelReportTypeValue)}>
                    <SelectTrigger id="rp-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(EXCEL_REPORT_LABELS) as ExcelReportTypeValue[]).map((t) => (
                        <SelectItem key={t} value={t}>
                          {EXCEL_REPORT_LABELS[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rp-activity">فعالیت</Label>
                  <Select value={activityId} onValueChange={selectActivity}>
                    <SelectTrigger id="rp-activity">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">همهٔ فعالیت‌ها</SelectItem>
                      {stations.map((s) => (
                        <SelectGroup key={s.id}>
                          <SelectLabel>{s.name}</SelectLabel>
                          {s.activities.map((a) => (
                            <SelectItem key={a.id} value={a.id}>
                              {a.name}
                              {a.hasData ? '' : ' (بدون داده)'}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rp-operator">اپراتور</Label>
                  <Select value={operatorId} onValueChange={setOperatorId}>
                    <SelectTrigger id="rp-operator">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">همهٔ اپراتورها</SelectItem>
                      {operators.map((o) => (
                        <SelectItem key={o.id} value={o.id}>
                          {o.name}
                          {o.hasData ? '' : ' (بدون داده)'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <Button className="btn-brand w-full gap-2" onClick={downloadExcel}>
                    <FileSpreadsheet className="size-4" aria-hidden />
                    دانلود Excel
                  </Button>
                </div>
              </div>
              <p className="text-xs leading-5 text-muted-foreground">
                {formatInt(allActivities.length, prefs)} فعالیت و {formatInt(operators.length, prefs)} اپراتور در دسترس انتخاب است.
                برای گزارش رسمی (PDF/چاپ)، پیش‌نمایش کاغذی زیر را بازبینی و از دکمهٔ «چاپ / ذخیره PDF» استفاده کنید.
              </p>
            </CardContent>
          </Card>

          {/* ── پیش‌نمایش گزارش رسمی ── */}
          {reportQuery.isLoading ? (
            <div className="mx-auto w-full max-w-[820px] space-y-3">
              <Skeleton className="h-40 rounded-2xl" />
              <Skeleton className="h-72 rounded-2xl" />
              <Skeleton className="h-56 rounded-2xl" />
            </div>
          ) : reportQuery.isError ? (
            <EmptyState
              title="ساخت گزارش رسمی ناموفق بود"
              description={(reportQuery.error as Error).message}
              action={
                <Button variant="outline" onClick={() => reportQuery.refetch()}>
                  <RefreshCw className="size-4" aria-hidden />
                  تلاش مجدد
                </Button>
              }
            />
          ) : reportQuery.data ? (
            <div className="space-y-3">
              <div className="print:hidden mx-auto flex w-full max-w-[820px] flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-sm font-bold">
                  <FileText className="size-4 text-brand" aria-hidden />
                  پیش‌نمایش گزارش رسمی (کاغذ A4)
                </p>
                <Badge variant="secondary" className="gap-1">
                  {reportQuery.isFetching ? (
                    <>
                      <Loader2 className="size-3 animate-spin" aria-hidden />
                      به‌روزرسانی…
                    </>
                  ) : (
                    'همگام با فیلترها'
                  )}
                </Badge>
              </div>
              <ReportPaper report={reportQuery.data} />
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}
