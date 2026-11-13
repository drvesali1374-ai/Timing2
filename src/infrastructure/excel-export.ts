// ═══════════════════════════════════════════════════════════
// خروجی Excel گزارش‌ها — فاز ۶ / FR-22
//
// اصول مهندسی:
//  • کتابخانهٔ محلی exceljs (MIT) — بدون تماس خارجی در زمان اجرا.
//  • همهٔ شیت‌ها راست‌به‌چپ (rightToLeft) — فارسی/RTL صحیح.
//  • مقادیر عددی به‌صورت «عدد واقعی» نوشته می‌شوند تا تحلیل داده
//    در Excel ممکن باشد؛ ارقام فارسی فقط در متن‌ها و تاریخ‌ها.
//  • تاریخ‌ها مطابق تنظیمات نمایش (تقویم شمسی/میلادی + ارقام) قالب‌بندی می‌شوند.
//  • دادهٔ ناقص = سلول خالی با یادداشت علت؛ نه صفر، نه مقدار ساختگی — FR-21/22.
// ═══════════════════════════════════════════════════════════
import ExcelJS from 'exceljs'
import { db } from '@/lib/db'
import { getAppSettings } from '@/application/settings-service'
import { getStudyReport, type StudyReportDto } from '@/application/report-service'
import { getActivityAnalysis } from '@/application/analysis-service'
import { VALIDITY_STATUS_LABELS, TIMING_METHOD_LABELS, type ValidityStatus, type TimingMethod } from '@/domain/types'
import { isoToJalali } from '@/lib/jalali'
import { toPersianDigits } from '@/lib/persian'

export type ExcelReportType = 'overview' | 'summary' | 'operators' | 'raw'

export const EXCEL_REPORT_TYPE_LABELS: Record<ExcelReportType, string> = {
  overview: 'نگاه کل پروژه',
  summary: 'خلاصهٔ محاسبات (عناصر)',
  operators: 'مقایسهٔ اپراتورها',
  raw: 'داده‌های خام مشاهدات',
}

interface DatePrefs {
  calendar: 'jalali' | 'gregorian'
  digits: 'persian' | 'latin'
}

function applyDigits(text: string, mode: 'persian' | 'latin'): string {
  return mode === 'persian' ? toPersianDigits(text).replace(/\./g, '٫') : text
}

function formatReportDate(iso: string | null, prefs: DatePrefs): string {
  if (!iso) return ''
  if (prefs.calendar === 'gregorian') return applyDigits(iso.slice(0, 10), prefs.digits)
  const j = isoToJalali(iso)
  if (!j) return applyDigits(iso.slice(0, 10), prefs.digits)
  return applyDigits(`${j.jy}/${String(j.jm).padStart(2, '0')}/${String(j.jd).padStart(2, '0')}`, prefs.digits)
}

// ── استایل سربرگ ──
const HEADER_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE9E5FF' } }
const TITLE_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF7257FF' } }

function styleHeaderRow(ws: ExcelJS.Worksheet, rowIdx: number) {
  const row = ws.getRow(rowIdx)
  row.font = { bold: true, size: 11, color: { argb: 'FF1E1B4B' } }
  row.fill = HEADER_FILL
  row.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true, readingOrder: 'rtl' }
  row.height = 24
}

function styleTitleRow(ws: ExcelJS.Worksheet, rowIdx: number, span: number) {
  const row = ws.getRow(rowIdx)
  row.font = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } }
  row.fill = TITLE_FILL
  row.alignment = { horizontal: 'center', vertical: 'middle', readingOrder: 'rtl' }
  ws.mergeCells(rowIdx, 1, rowIdx, span)
}

function addMetaRows(ws: ExcelJS.Worksheet, meta: [string, string][]) {
  let r = ws.rowCount + 1
  for (const [label, value] of meta) {
    const cell = ws.getCell(r, 1)
    cell.value = label
    cell.font = { bold: true }
    cell.alignment = { horizontal: 'right', readingOrder: 'rtl' }
    const vcell = ws.getCell(r, 2)
    vcell.value = value
    vcell.alignment = { horizontal: 'right', readingOrder: 'rtl' }
    ws.mergeCells(r, 2, r, Math.min(6, Math.max(2, ws.columnCount)))
    r++
  }
}

// ═══════════ ساخت Workbook بر اساس نوع گزارش ═══════════

export async function buildExcelReport(
  projectId: string,
  type: ExcelReportType,
  opts: { activityId?: string; operatorId?: string } = {}
): Promise<{ buffer: Buffer; filename: string }> {
  const appSettings = await getAppSettings()
  const prefs: DatePrefs = {
    calendar: (appSettings['ui.calendar'] as 'jalali' | 'gregorian') ?? 'jalali',
    digits: (appSettings['ui.digits'] as 'persian' | 'latin') ?? 'persian',
  }

  const wb = new ExcelJS.Workbook()
  wb.creator = 'نرم‌افزار زمان‌سنجی صنعتی'
  wb.created = new Date()

  const report = await getStudyReport(projectId, opts)
  const baseName =
    report.project.name.replace(/[\\/:*?"<>|]/g, '-').slice(0, 40) +
    (opts.activityId ? `-${report.activities[0]?.activity.name.replace(/[\\/:*?"<>|]/g, '-').slice(0, 25) ?? ''}` : '') +
    (opts.operatorId ? `-${report.reportMeta.operatorFilter?.name ?? ''}` : '')

  switch (type) {
    case 'overview':
      buildOverviewSheet(wb, report, prefs)
      break
    case 'summary':
      buildSummarySheet(wb, report, prefs)
      break
    case 'operators':
      await buildOperatorsSheet(wb, projectId, report, opts)
      break
    case 'raw':
      await buildRawSheet(wb, projectId, report, opts, prefs)
      break
  }

  const buffer = Buffer.from(await wb.xlsx.writeBuffer())
  const filename = `${EXCEL_REPORT_TYPE_LABELS[type]} - ${baseName}.xlsx`
  return { buffer, filename }
}

// ── ۱) نگاه کل پروژه ──
function buildOverviewSheet(wb: ExcelJS.Workbook, report: StudyReportDto, prefs: DatePrefs) {
  const ws = wb.addWorksheet('نگاه کل', { views: [{ rightToLeft: true }] })
  ws.columns = [
    { width: 26 }, { width: 22 }, { width: 14 }, { width: 12 }, { width: 12 },
    { width: 14 }, { width: 14 }, { width: 16 }, { width: 12 }, { width: 26 },
  ]
  styleTitleRow(ws, 1, 10)
  ws.getCell(1, 1).value = `گزارش نگاه کل پروژه — ${report.project.name}`
  addMetaRows(ws, [
    ['خط تولید', report.project.lineName],
    ['محصول', report.project.productName],
    ['تاریخ مطالعه', formatReportDate(report.project.studyDate, prefs)],
    ['تاریخ گزارش', formatReportDate(report.reportMeta.generatedAt, prefs)],
    ['وضعیت پروژه', report.project.statusLabel + (report.project.finalized ? ' (نهایی‌شده)' : '')],
    ['فرمول زمان استاندارد', report.assumptions.stFormula],
    ['روش اعمال مجاز', report.assumptions.allowanceMethodLabel],
    ['روش تجمیع چند اپراتور', report.assumptions.aggregationMethodLabel],
    ['نسخهٔ فرمول', applyDigits(report.assumptions.formulaVersion, prefs.digits)],
  ])

  const headerRow = ws.rowCount + 2
  const headers = [
    'ایستگاه', 'فعالیت', 'نوع فرایند', 'عناصر', 'چرخهٔ معتبر',
    'هدف نمونه', 'جمع OT (ثانیه)', 'زمان استاندارد (ثانیه)', 'وضعیت ST', 'مشاهدهٔ مشکوک بازبینی‌نشده',
  ]
  headers.forEach((h, i) => (ws.getCell(headerRow, i + 1).value = h))
  styleHeaderRow(ws, headerRow)

  // داده از تحلیل فعالیت‌ها — از همان گزارش (بدون محاسبهٔ مجدد)
  let r = headerRow + 1
  for (const sec of report.activities) {
    // جمع OT فقط وقتی همهٔ عناصر داده دارند — صفر ساختگی ممنوع
    const completeOt = sec.elements.length > 0 && sec.elements.every((e) => e.ot !== null)
    const otSum = completeOt ? sec.elements.reduce((s, e) => s + (e.ot as number), 0) : null
    ws.getCell(r, 1).value = sec.activity.stationName
    ws.getCell(r, 2).value = sec.activity.name
    ws.getCell(r, 3).value = sec.activity.processTypeLabel
    ws.getCell(r, 4).value = sec.elements.length
    ws.getCell(r, 5).value = sec.sampleProgress.validCycles
    ws.getCell(r, 6).value = sec.activity.targetSampleCount
    if (otSum !== null) ws.getCell(r, 7).value = Number(otSum.toFixed(6))
    ws.getCell(r, 8).value = sec.activityTotal.st
    ws.getCell(r, 9).value =
      sec.activityTotal.status === 'OK' ? 'قابل ارائه' : sec.activityTotal.status === 'NEEDS_AGGREGATION_RULE' ? 'نیازمند قاعدهٔ تجمیع' : 'ناقص'
    ws.getCell(r, 10).value = sec.suspects.filter((s) => s.validityStatus === 'SUSPECT').length
    for (let c = 1; c <= 10; c++) ws.getCell(r, c).alignment = { horizontal: 'center', readingOrder: 'rtl' }
    r++
  }

  // یادداشت صداقت
  const noteRow = r + 1
  const noteCell = ws.getCell(noteRow, 1)
  noteCell.value = `یادداشت: ${report.disclaimer} جمع OT عناصر در فعالیت‌های دارای کار هم‌زمان معادل زمان سپری‌شدهٔ چرخه نیست.`
  noteCell.alignment = { horizontal: 'right', wrapText: true, readingOrder: 'rtl' }
  noteCell.font = { italic: true, size: 10, color: { argb: 'FF7A5C00' } }
  ws.mergeCells(noteRow, 1, noteRow, 10)
  ws.getRow(noteRow).height = 42
}

// ── ۲) خلاصهٔ محاسبات (عناصر) ──
function buildSummarySheet(wb: ExcelJS.Workbook, report: StudyReportDto, prefs: DatePrefs) {
  const ws = wb.addWorksheet('خلاصهٔ محاسبات', { views: [{ rightToLeft: true }] })
  ws.columns = [
    { width: 22 }, { width: 26 }, { width: 14 }, { width: 8 }, { width: 12 },
    { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 },
    { width: 10 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 34 },
  ]
  styleTitleRow(ws, 1, 15)
  ws.getCell(1, 1).value = `خلاصهٔ محاسبات عناصر — ${report.project.name}`
  addMetaRows(ws, [
    ['تاریخ گزارش', formatReportDate(report.reportMeta.generatedAt, prefs)],
    ['فرمول', report.assumptions.stFormula],
    ['مبنای OT', report.reportMeta.operatorNote ?? report.assumptions.aggregationMethodLabel],
  ])

  const headerRow = ws.rowCount + 2
  const headers = [
    'ایستگاه', 'فعالیت', 'عنصر کاری', 'n',
    'میانگین (ثانیه)', 'میانه', 'انحراف معیار', 'CV٪', 'OT (ثانیه)',
    'ضریب R', 'NT (ثانیه)', 'ST (ثانیه)', 'A کل', 'وضعیت / علت',
  ]
  headers.forEach((h, i) => (ws.getCell(headerRow, i + 1).value = h))
  styleHeaderRow(ws, headerRow)

  let r = headerRow + 1
  for (const sec of report.activities) {
    for (const el of sec.elements) {
      ws.getCell(r, 1).value = sec.activity.stationName
      ws.getCell(r, 2).value = sec.activity.name
      ws.getCell(r, 3).value = el.name
      ws.getCell(r, 4).value = el.stats.count
      if (el.stats.mean !== null) ws.getCell(r, 5).value = Number(el.stats.mean.toFixed(6))
      if (el.stats.median !== null) ws.getCell(r, 6).value = Number(el.stats.median.toFixed(6))
      if (el.stats.sampleSD !== null) ws.getCell(r, 7).value = Number(el.stats.sampleSD.toFixed(6))
      if (el.stats.cvPercent !== null) ws.getCell(r, 8).value = Number(el.stats.cvPercent.toFixed(4))
      if (el.ot !== null) ws.getCell(r, 9).value = Number(el.ot.toFixed(6))
      if (el.rating) ws.getCell(r, 10).value = Number(el.rating.totalFactor.toFixed(4))
      if (el.nt !== null) ws.getCell(r, 11).value = Number(el.nt.toFixed(6))
      if (el.st !== null) ws.getCell(r, 12).value = Number(el.st.toFixed(6))
      ws.getCell(r, 13).value = Number(el.allowanceP.toFixed(6))
      ws.getCell(r, 14).value =
        el.stError ??
        (el.st !== null
          ? el.rating
            ? ''
            : 'بدون ارزیابی وستینگهاوس — NT/ST محاسبه نشد'
          : el.ot === null
            ? 'دادهٔ معتبر کافی نیست'
            : 'غیرقابل محاسبه')
      for (let c = 1; c <= 14; c++) ws.getCell(r, c).alignment = { horizontal: 'center', readingOrder: 'rtl' }
      r++
    }
  }

  // جدول وستینگهاوس — شیت دوم
  const ws2 = wb.addWorksheet('وستینگهاوس', { views: [{ rightToLeft: true }] })
  ws2.columns = [
    { width: 22 }, { width: 26 }, { width: 26 }, { width: 14 }, { width: 12 },
    { width: 14 }, { width: 12 }, { width: 14 }, { width: 12 }, { width: 14 }, { width: 12 }, { width: 16 },
  ]
  styleTitleRow(ws2, 1, 12)
  ws2.getCell(1, 1).value = `جدول ارزیابی وستینگهاوس عناصر — ${report.project.name}`
  const h2 = 3
  // ساختار دقیق: هر عامل درجه + مقدار
  const h2real = ['ایستگاه', 'فعالیت', 'عنصر کاری', 'جدول مرجع', 'مهارت (درجه/مقدار)', 'تلاش (درجه/مقدار)', 'شرایط (درجه/مقدار)', 'یکنواختی (درجه/مقدار)', 'ضریب کل R', 'نسخهٔ جدول']
  h2real.forEach((h, i) => (ws2.getCell(h2, i + 1).value = h))
  styleHeaderRow(ws2, h2)
  let r2 = h2 + 1
  for (const sec of report.activities) {
    for (const el of sec.elements) {
      if (!el.rating) {
        ws2.getCell(r2, 1).value = sec.activity.stationName
        ws2.getCell(r2, 2).value = sec.activity.name
        ws2.getCell(r2, 3).value = el.name
        ws2.getCell(r2, 4).value = 'ارزیابی نشده — NT/ST قابل محاسبه نیست'
        r2++
        continue
      }
      const fmt = (d: { grade: string | null; value: number }) => `${d.grade ?? '—'} / ${applyDigits(d.value.toFixed(2), prefs.digits)}`
      ws2.getCell(r2, 1).value = sec.activity.stationName
      ws2.getCell(r2, 2).value = sec.activity.name
      ws2.getCell(r2, 3).value = el.name
      ws2.getCell(r2, 4).value = el.rating.tableName
      ws2.getCell(r2, 5).value = fmt(el.rating.skill)
      ws2.getCell(r2, 6).value = fmt(el.rating.effort)
      ws2.getCell(r2, 7).value = fmt(el.rating.conditions)
      ws2.getCell(r2, 8).value = fmt(el.rating.consistency)
      ws2.getCell(r2, 9).value = Number(el.rating.totalFactor.toFixed(4))
      ws2.getCell(r2, 10).value = applyDigits(String(el.rating.tableVersion), prefs.digits)
      for (let c = 1; c <= 10; c++) ws2.getCell(r2, c).alignment = { horizontal: 'center', readingOrder: 'rtl' }
      r2++
    }
  }

  // دسته‌های مجاز — شیت سوم
  const ws3 = wb.addWorksheet('دسته‌های مجاز', { views: [{ rightToLeft: true }] })
  ws3.columns = [{ width: 24 }, { width: 26 }, { width: 22 }, { width: 14 }, { width: 14 }, { width: 16 }, { width: 14 }]
  styleTitleRow(ws3, 1, 7)
  ws3.getCell(1, 1).value = `الونس‌های مؤثر — ${report.project.name}`
  const h3 = 3
  const headers3 = ['فعالیت', 'عنوان الونس', 'نوع', 'مقدار مؤثر', 'مبدأ', 'وضعیت', 'مبنا']
  styleHeaderRow(ws3, h3)
  let r3 = h3 + 1
  const seen = new Set<string>()
  for (const sec of report.activities) {
    for (const row of sec.allowances.rows) {
      const key = `${sec.activity.id}:${row.definitionId}`
      if (seen.has(key)) continue
      seen.add(key)
      ws3.getCell(r3, 1).value = sec.activity.name
      ws3.getCell(r3, 2).value = row.title
      ws3.getCell(r3, 3).value = row.valueType === 'PERCENT' ? 'درصدی' : row.valueType === 'FIXED_TIME' ? 'زمان ثابت' : '—'
      if (row.valueType === 'PERCENT' && row.percentValue !== null) ws3.getCell(r3, 4).value = Number((row.percentValue * 100).toFixed(4))
      if (row.valueType === 'FIXED_TIME' && row.timeValueSeconds !== null) ws3.getCell(r3, 4).value = Number(row.timeValueSeconds.toFixed(4))
      ws3.getCell(r3, 5).value = row.sourceScopeLabel ?? '—'
      ws3.getCell(r3, 6).value = row.status === 'INHERITED' ? 'ارث‌رسیده' : row.status === 'OVERRIDDEN' ? 'جایگزین‌شده' : row.status === 'CUSTOM' ? 'اختصاصی' : 'حذف از ارث‌بری'
      ws3.getCell(r3, 7).value = row.applicationBasis === 'PER_ELEMENT_EXECUTION' ? 'هر اجرا' : row.applicationBasis === 'PER_CYCLE' ? 'هر چرخه' : '—'
      for (let c = 1; c <= 7; c++) ws3.getCell(r3, c).alignment = { horizontal: 'center', readingOrder: 'rtl' }
      r3++
    }
  }
  // درصدها در ستون‌های مقدار اعشاری درصدی‌اند
  for (const col of [4, 5, 6]) {
    ws3.getColumn(col).numFmt = '0.00"٪"'
  }
}

// ── ۳) مقایسهٔ اپراتورها ──
async function buildOperatorsSheet(
  wb: ExcelJS.Workbook,
  projectId: string,
  report: StudyReportDto,
  opts: { activityId?: string; operatorId?: string }
) {
  const ws = wb.addWorksheet('مقایسهٔ اپراتورها', { views: [{ rightToLeft: true }] })
  ws.columns = [
    { width: 22 }, { width: 26 }, { width: 26 }, { width: 20 }, { width: 8 },
    { width: 14 }, { width: 14 }, { width: 12 }, { width: 12 }, { width: 12 },
    { width: 12 }, { width: 12 },
  ]
  styleTitleRow(ws, 1, 12)
  ws.getCell(1, 1).value = `مقایسهٔ اپراتورها — ${report.project.name}`
  addMetaRows(ws, [
    ['تاریخ گزارش', formatReportDate(report.reportMeta.generatedAt, prefsFallback())],
    ['یادداشت', 'R وستینگهاوس مشترک عنصر است؛ تفاوت اپراتورها از میانگین مشاهده‌شدهٔ هر اپراتور در همان عنصر — FR-19'],
  ])
  const headerRow = ws.rowCount + 2
  const headers = [
    'ایستگاه', 'فعالیت', 'عنصر کاری', 'اپراتور', 'n', 'میانگین (ثانیه)', 'انحراف معیار',
    'CV٪', 'NT اپراتور', 'ST اپراتور', 'مشکوک', 'خارج‌شده',
  ]
  headers.forEach((h, i) => (ws.getCell(headerRow, i + 1).value = h))
  styleHeaderRow(ws, headerRow)

  // داده از موتور تحلیل واحد — بدون محاسبهٔ موازی
  const activities = await db.activity.findMany({
    where: { station: { projectId }, ...(opts.activityId ? { id: opts.activityId } : {}) },
    orderBy: [{ station: { sortOrder: 'asc' } }, { sortOrder: 'asc' }],
    select: { id: true },
  })
  let r = headerRow + 1
  for (const a of activities) {
    const an = await getActivityAnalysis(a.id)
    for (const el of an.elements) {
      for (const op of el.operators) {
        if (opts.operatorId && op.operatorId !== opts.operatorId) continue
        ws.getCell(r, 1).value = an.activity.stationName
        ws.getCell(r, 2).value = an.activity.name
        ws.getCell(r, 3).value = el.name
        ws.getCell(r, 4).value = op.operatorName
        ws.getCell(r, 5).value = op.count
        if (op.mean !== null) ws.getCell(r, 6).value = Number(op.mean.toFixed(6))
        if (op.sampleSD !== null) ws.getCell(r, 7).value = Number(op.sampleSD.toFixed(6))
        if (op.cvPercent !== null) ws.getCell(r, 8).value = Number(op.cvPercent.toFixed(4))
        if (op.nt !== null) ws.getCell(r, 9).value = Number(op.nt.toFixed(6))
        if (op.st !== null) ws.getCell(r, 10).value = Number(op.st.toFixed(6))
        ws.getCell(r, 11).value = op.suspectCount
        ws.getCell(r, 12).value = op.excludedCount
        for (let c = 1; c <= 12; c++) ws.getCell(r, c).alignment = { horizontal: 'center', readingOrder: 'rtl' }
        r++
      }
    }
  }
}

// ── ۴) داده‌های خام ──
async function buildRawSheet(
  wb: ExcelJS.Workbook,
  projectId: string,
  report: StudyReportDto,
  opts: { activityId?: string; operatorId?: string },
  prefs: DatePrefs
) {
  const ws = wb.addWorksheet('داده‌های خام', { views: [{ rightToLeft: true }] })
  ws.columns = [
    { width: 22 }, { width: 26 }, { width: 26 }, { width: 16 }, { width: 20 },
    { width: 10 }, { width: 14 }, { width: 16 }, { width: 14 }, { width: 14 },
    { width: 14 }, { width: 22 }, { width: 26 },
  ]
  styleTitleRow(ws, 1, 13)
  ws.getCell(1, 1).value = `داده‌های خام مشاهدات — ${report.project.name}`
  addMetaRows(ws, [
    ['تاریخ گزارش', formatReportDate(report.reportMeta.generatedAt, prefs)],
    ['یادداشت', 'دادهٔ خام حفظ می‌شود؛ خروج از محاسبات فقط با تصمیم کاربر و با حفظ مقدار — FR-11'],
  ])

  const headerRow = ws.rowCount + 2
  const headers = [
    'ایستگاه', 'فعالیت', 'عنصر کاری', 'روش کرنومتر', 'اپراتور', 'چرخه',
    'مقدار خام', 'قرائت تجمعی', 'شروع بازه', 'پایان بازه', 'مدت محاسبه‌شده', 'وضعیت', 'دلیل خروج',
  ]
  headers.forEach((h, i) => (ws.getCell(headerRow, i + 1).value = h))
  styleHeaderRow(ws, headerRow)

  const rows = await db.elementObservation.findMany({
    where: {
      cycle: {
        session: {
          activity: {
            station: { projectId },
            ...(opts.activityId ? { id: opts.activityId } : {}),
          },
          ...(opts.operatorId ? { operatorId: opts.operatorId } : {}),
        },
      },
    },
    include: {
      workElement: { select: { name: true } },
      cycle: {
        select: {
          cycleNo: true,
          session: {
            select: {
              timingMethod: true,
              activity: { select: { name: true, station: { select: { name: true } } } },
              operator: { select: { displayName: true } },
            },
          },
        },
      },
    },
    orderBy: [
      { cycle: { session: { startedAt: 'asc' } } },
      { cycle: { cycleNo: 'asc' } },
      { workElement: { sortOrder: 'asc' } },
    ],
  })

  let r = headerRow + 1
  for (const o of rows) {
    const s = o.cycle.session
    ws.getCell(r, 1).value = s.activity.station.name
    ws.getCell(r, 2).value = s.activity.name
    ws.getCell(r, 3).value = o.workElement.name
    ws.getCell(r, 4).value = TIMING_METHOD_LABELS[s.timingMethod as TimingMethod] ?? s.timingMethod
    ws.getCell(r, 5).value = s.operator.displayName
    ws.getCell(r, 6).value = o.cycle.cycleNo
    if (o.rawDuration !== null) ws.getCell(r, 7).value = Number(o.rawDuration.toFixed(6))
    if (o.cumulativeReading !== null) ws.getCell(r, 8).value = Number(o.cumulativeReading.toFixed(6))
    if (o.startOffset !== null) ws.getCell(r, 9).value = Number(o.startOffset.toFixed(6))
    if (o.endOffset !== null) ws.getCell(r, 10).value = Number(o.endOffset.toFixed(6))
    if (o.derivedDuration !== null) ws.getCell(r, 11).value = Number(o.derivedDuration.toFixed(6))
    ws.getCell(r, 12).value = VALIDITY_STATUS_LABELS[o.validityStatus as ValidityStatus] ?? o.validityStatus
    if (o.exclusionReason) ws.getCell(r, 13).value = o.exclusionReason
    for (let c = 1; c <= 13; c++) ws.getCell(r, c).alignment = { horizontal: 'center', readingOrder: 'rtl' }
    r++
  }
}

function prefsFallback(): DatePrefs {
  return { calendar: 'jalali', digits: 'persian' }
}
