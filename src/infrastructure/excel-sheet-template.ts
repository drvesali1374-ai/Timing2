// ═══════════════════════════════════════════════════════════
// قالب Excel برگهٔ زمان‌سنجی — v1.5.2 §۹
//
// اصول مهندسی:
//  • کتابخانهٔ محلی exceljs (MIT) — بدون تماس خارجی در زمان اجرا.
//  • شیت اصلی راست‌به‌چپ: ستون «عنصر کاری / رابطه» در راست (ستون A)،
//    چرخه‌ها در ستون‌های بعدی — هم‌راستا با جدول برگهٔ برنامه.
//  • نگاشت داده‌ها فقط با شناسهٔ پایدار (عنصر/رابطه) — هرگز با نام؛
//    شناسه‌ها در شیت Metadata (مخفی) ذخیره می‌شوند (§۹-۴).
//  • ساختار ردیف‌ها دقیقاً همان مدل ردیف‌های شبکهٔ برگه (buildGridRows)
//    است: عنصر + زیرردیف‌های روابط موازی (§۹-۳).
//  • ستون‌های چرخه = چرخه‌های موجود (با مقادیر فعلی) + ۱۰ ستون خالی
//    برای چرخه‌های جدید.
//  • سلول‌های ورود اطلاعات با قالب متنی (@) و رنگ ملایم متمایز؛
//    بازهٔ «شروع-پایان» (مثل 3-9) به‌صورت متنی می‌ماند و به تاریخ
//    تبدیل نمی‌شود (§۹-۵).
//  • بارگذاری فایل فقط «ورودی همان فرآیند Paste» را می‌سازد؛ هیچ
//    ذخیرهٔ مستقیمی انجام نمی‌شود (§۹-۶).
// ═══════════════════════════════════════════════════════════
import ExcelJS from 'exceljs'
import { db } from '@/lib/db'
import { AppError, TIMING_METHOD_LABELS, type TimingMethod } from '@/domain/types'
import { buildGridRows } from '@/application/timing-service'

/** نسخهٔ ساختار قالب — با تغییر ناسازگار باید افزایش یابد */
const TEMPLATE_VERSION = 1
/** ستون‌های خالی اضافه برای چرخه‌های جدید */
const EXTRA_CYCLE_COLS = 10
/** نام شیت‌ها */
const SHEET_DATA = 'برگه زمان‌سنجی'
const SHEET_README = 'راهنما'
const SHEET_META = 'Metadata'

/** ردیف شروع داده‌ها در شیت اصلی (۱-مبنا؛ ردیف ۷ سربرگ است) */
const DATA_START_ROW = 8
const HEADER_ROW = 7

/** نتیجهٔ تجزیهٔ فایل بارگذاری‌شده — ورودی همان مسیر Paste */
export interface ExcelTemplateParseResult {
  data: string[][]
  startCycleNo: number
  startElementId: string
  startRelationId: string | null
  warnings: string[]
  sourceName: string | null
}

// ── استایل‌ها (هم‌خانوادهٔ excel-export.ts) ──
const HEADER_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE9E5FF' } }
const LABEL_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F0EF' } }
const EDIT_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F5EE' } }
const TITLE_FONT: Partial<ExcelJS.Font> = { bold: true, size: 14, color: { argb: 'FF5B21B6' } }
const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FFD6D3D1' } },
  left: { style: 'thin', color: { argb: 'FFD6D3D1' } },
  bottom: { style: 'thin', color: { argb: 'FFD6D3D1' } },
  right: { style: 'thin', color: { argb: 'FFD6D3D1' } },
}

/** گردکردن به ۶ رقم اعشار — حذف خطای ممیز شناور در رفت‌وبرگشت */
function round6(v: number): number {
  return Math.round(v * 1e6) / 1e6
}

// ═══════════════ ساخت قالب ═══════════════

export async function buildTimingExcelTemplate(sessionId: string): Promise<{ buffer: Buffer; filename: string }> {
  const session = await db.studySession.findUnique({
    where: { id: sessionId },
    include: {
      activity: {
        select: {
          id: true,
          name: true,
          station: { select: { name: true, projectId: true } },
        },
      },
      operator: { select: { displayName: true } },
    },
  })
  if (!session) throw new AppError('SESSION_NOT_FOUND', 'جلسه زمان‌سنجی یافت نشد.', 404)

  const project = await db.project.findUnique({
    where: { id: session.activity.station.projectId },
    select: { name: true, lineName: true, productName: true },
  })

  const { rows: gridRows } = await buildGridRows(session.activityId, session.activity.station.projectId)
  if (gridRows.length === 0 || gridRows[0].kind !== 'ELEMENT') {
    throw new AppError('TEMPLATE_NO_ROWS', 'این فعالیت عنصر کاری ندارد؛ قالب Excel فقط برای فعالیتِ دارای عنصر ساخته می‌شود.', 422)
  }

  // عناصر فعالیت برای حالت ورود پیش‌فرض (بازه‌ای/ترتیبی) و مقدار فعلی
  const elements = await db.workElement.findMany({
    where: { activityId: session.activityId },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, name: true, defaultEntryMode: true },
  })
  const elementById = new Map(elements.map((e) => [e.id, e]))

  // چرخه‌های جلسه + مشاهدات + مقادیر هم‌پوشانی
  const cycles = await db.cycleObservation.findMany({
    where: { sessionId },
    orderBy: { cycleNo: 'asc' },
    include: { observations: true },
  })
  const overlaps = await db.observationOverlap.findMany({ where: { cycle: { sessionId } } })
  const overlapByCycle = new Map<string, Map<string, { status: string; overlapDuration: number | null }>>()
  for (const ov of overlaps) {
    let m = overlapByCycle.get(ov.cycleId)
    if (!m) {
      m = new Map()
      overlapByCycle.set(ov.cycleId, m)
    }
    m.set(ov.relationId, { status: ov.status, overlapDuration: ov.overlapDuration })
  }

  const maxCycleNo = cycles.length > 0 ? cycles[cycles.length - 1].cycleNo : 0
  const totalCols = maxCycleNo + EXTRA_CYCLE_COLS
  const cycleByNo = new Map(cycles.map((c) => [c.cycleNo, c]))

  const wb = new ExcelJS.Workbook()
  wb.creator = 'Timing2'
  wb.created = new Date()

  // ── شیت اصلی: برگه زمان‌سنجی (RTL) ──
  const ws = wb.addWorksheet(SHEET_DATA, {
    views: [{ rightToLeft: true, state: 'frozen', xSplit: 1, ySplit: HEADER_ROW }],
  })

  // بلوک اطلاعات پروژه/جلسه — §۹-۲
  const methodLabel = TIMING_METHOD_LABELS[session.timingMethod as TimingMethod] ?? String(session.timingMethod)
  const infoLines: Array<[string, Partial<ExcelJS.Font>]> = [
    [`قالب زمان‌سنجی — پروژهٔ «${project?.name ?? '؟'}»`, TITLE_FONT],
    [`خط تولید: ${project?.lineName ?? '؟'}    |    محصول: ${project?.productName ?? '؟'}`, {}],
    [`ایستگاه: ${session.activity.station.name}    |    فعالیت: ${session.activity.name}`, { bold: true }],
    [
      `اپراتور: ${session.operator.displayName}    |    روش: ${methodLabel}    |    شروع جلسه: ${session.startedAt.toISOString().slice(0, 10)}    |    وضعیت: ${session.status === 'CLOSED' ? 'بسته' : 'باز'}`,
      {},
    ],
  ]
  infoLines.forEach(([text, font], i) => {
    const row = ws.getRow(i + 1)
    const cell = row.getCell(1)
    cell.value = text
    cell.font = { size: 11, ...font }
    cell.alignment = { horizontal: 'right', vertical: 'middle', readingOrder: 'rtl' }
    row.height = i === 0 ? 22 : 18
  })

  // سربرگ ستون‌ها — ردیف ۷
  const headerRow = ws.getRow(HEADER_ROW)
  const headCell = headerRow.getCell(1)
  headCell.value = 'عنصر کاری / رابطهٔ موازی'
  for (let c = 1; c <= totalCols; c++) {
    headerRow.getCell(c + 1).value = `چرخهٔ ${c}`
  }
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, size: 11, color: { argb: 'FF1E1B4B' } }
    cell.fill = HEADER_FILL
    cell.alignment = { horizontal: 'center', vertical: 'middle', readingOrder: 'rtl', wrapText: true }
    cell.border = THIN_BORDER
  })
  headerRow.height = 24

  // ردیف‌های داده — همان ترتیب ردیف‌های شبکهٔ برگه (§۹-۳)
  gridRows.forEach((grow, ri) => {
    const row = ws.getRow(DATA_START_ROW + ri)
    const labelCell = row.getCell(1)
    if (grow.kind === 'ELEMENT') {
      labelCell.value = grow.elementName
      labelCell.font = { bold: true, size: 11 }
    } else {
      labelCell.value = `↲ هم‌پوشانی با ${grow.otherElementName}`
      labelCell.font = { size: 10, color: { argb: 'FF71717A' } }
      labelCell.alignment = { horizontal: 'right', vertical: 'middle', readingOrder: 'rtl', indent: 2 }
    }
    labelCell.fill = LABEL_FILL
    labelCell.border = THIN_BORDER
    if (grow.kind === 'ELEMENT') {
      labelCell.alignment = { horizontal: 'right', vertical: 'middle', readingOrder: 'rtl' }
    }

    for (let c = 1; c <= totalCols; c++) {
      const cell = row.getCell(c + 1)
      cell.numFmt = '@' // متنی — بازهٔ «3-9» به تاریخ تبدیل نمی‌شود
      cell.fill = EDIT_FILL
      cell.border = THIN_BORDER
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
      cell.font = { size: 11 }

      const text = cellTextFor(grow, c, cycleByNo, elementById, overlapByCycle, session.timingMethod)
      if (text !== '') cell.value = text
    }
  })

  // عرض ستون‌ها
  ws.getColumn(1).width = 36
  for (let c = 2; c <= totalCols + 1; c++) ws.getColumn(c).width = 11

  // ── شیت راهنما — §۹-۵ ──
  const readme = wb.addWorksheet(SHEET_README, { views: [{ rightToLeft: true }] })
  readme.getColumn(1).width = 100
  const readmeLines = [
    ['راهنمای قالب زمان‌سنجی', { bold: true, size: 14 }],
    ['', {}],
    ['۱. این قالب مخصوص «همین جلسهٔ زمان‌سنجی» است (شناسهٔ جلسه در شیت مخفی Metadata). برای جلسهٔ دیگری، قالب جدید دانلود کنید.', {}],
    ['۲. فقط سلول‌های سبز روشن را تکمیل کنید (ستون‌های چرخه). نام عناصر، ستون اول و سربرگ‌ها را تغییر ندهید و سطری را جابه‌جا یا حذف نکنید.', {}],
    ['۳. مقدار هر عنصر: یک عدد (مثل 12.5 یا ۱۲٫۵) یا برای عناصر هم‌زمان بازهٔ «شروع-پایان» (مثل 3-9).', {}],
    ['۴. زیرردیف «هم‌پوشانی با …»: خالی = بررسی‌نشده، ۰ = بدون هم‌پوشانی، عدد مثبت = مدت هم‌پوشانی (ثانیه).', {}],
    ['۵. ستون‌های خالی انتهایی برای چرخه‌های جدیدند؛ در صورت نیاز می‌توانید در سمت چپ ستون‌های بیشتری اضافه کنید (عنوان ستون جدید را هم «چرخهٔ N» بگذارید).', {}],
    ['۶. سلول خالی به معنی «بدون تغییر» است — دادهٔ موجود حذف نمی‌شود.', {}],
    ['', {}],
    ['برگرداندن داده‌ها به برنامه — دو راه مستقل:', { bold: true }],
    ['الف) ذخیرهٔ فایل و بارگذاری: در برنامه، در دیالوگ Paste از Excel روی «بارگذاری فایل Excel» بزنید و همین فایل تکمیل‌شده را انتخاب کنید؛ پس از مشاهدهٔ پیش‌نمایش و رفع خطاها، ثبت نهایی انجام می‌شود.', {}],
    ['ب) کپی و Paste: محدودهٔ داده‌های تکمیل‌شده را در Excel انتخاب و کپی (Ctrl+C) کنید و در برنامه در دیالوگ Paste بچسبانید (Ctrl+V).', {}],
    ['', {}],
    ['هیچ داده‌ای بدون پیش‌نمایش و تأیید شما ثبت نمی‌شود؛ خطای هر سلول با محل و علت دقیق نمایش داده می‌شود.', { italic: true }],
  ] as Array<[string, Partial<ExcelJS.Font>]>
  readmeLines.forEach(([text, font], i) => {
    const cell = readme.getRow(i + 1).getCell(1)
    cell.value = text
    cell.font = { size: 11, ...font }
    cell.alignment = { horizontal: 'right', vertical: 'top', readingOrder: 'rtl', wrapText: true }
  })

  // ── شیت Metadata (مخفی) — نگاشت شناسهٔ پایدار — §۹-۴ ──
  const meta = wb.addWorksheet(SHEET_META, { views: [{ rightToLeft: false }] })
  meta.state = 'hidden'
  meta.getCell('A1').value = 'T2_TIMING_TEMPLATE'
  meta.getCell('B1').value = TEMPLATE_VERSION
  meta.getCell('A2').value = 'SESSION_ID'
  meta.getCell('B2').value = sessionId
  meta.getCell('A3').value = 'START_CYCLE_NO'
  meta.getCell('B3').value = 1
  meta.getCell('A4').value = 'DATA_START_ROW'
  meta.getCell('B4').value = DATA_START_ROW
  meta.getCell('A5').value = 'LABEL_COL'
  meta.getCell('B5').value = 1
  meta.getCell('A6').value = 'TOTAL_COLS'
  meta.getCell('B6').value = totalCols
  const metaHead = meta.getRow(8)
  ;['ROW_INDEX', 'KIND', 'ELEMENT_ID', 'RELATION_ID', 'PARENT_ELEMENT_ID'].forEach((h, i) => {
    metaHead.getCell(i + 1).value = h
  })
  gridRows.forEach((grow, ri) => {
    const r = meta.getRow(9 + ri)
    r.getCell(1).value = ri
    r.getCell(2).value = grow.kind
    /* ستون ۳ = عنصر «صاحب» ردیف: برای عنصر خودش، برای زیرردیف والدش —
       همان قرارداد buildGridRows برای اعتبارسنجی ساختار (§۹-۴) */
    r.getCell(3).value = grow.elementId
    r.getCell(4).value = grow.kind === 'RELATION' ? grow.relationId : null
    r.getCell(5).value = grow.kind === 'RELATION' ? grow.elementId : null
  })
  meta.getColumn(1).width = 12
  meta.getColumn(2).width = 10
  meta.getColumn(3).width = 40
  meta.getColumn(4).width = 40
  meta.getColumn(5).width = 40

  ws.views = [{ rightToLeft: true, state: 'frozen', xSplit: 1, ySplit: HEADER_ROW }]

  const buffer = Buffer.from(await wb.xlsx.writeBuffer())
  const filename = `قالب زمان‌سنجی — ${session.activity.name} (${session.operator.displayName}).xlsx`
  return { buffer, filename }
}

/** مقدار متنی فعلی یک سلول قالب — فرمت پذیرفته‌شدهٔ Paste */
function cellTextFor(
  grow: { kind: 'ELEMENT' | 'RELATION'; elementId: string; relationId: string | null },
  cycleNo: number,
  cycleByNo: Map<number, { id: string; observations: { workElementId: string; rawDuration: number | null; cumulativeReading: number | null; startOffset: number | null; endOffset: number | null }[] }>,
  elementById: Map<string, { defaultEntryMode: string }>,
  overlapByCycle: Map<string, Map<string, { status: string; overlapDuration: number | null }>>,
  method: string,
): string {
  const cycle = cycleByNo.get(cycleNo)
  if (!cycle) return ''

  if (grow.kind === 'RELATION') {
    const ov = overlapByCycle.get(cycle.id)?.get(grow.relationId!)
    if (!ov) return ''
    if (ov.status === 'NO_OVERLAP') return '0'
    if (ov.status === 'OVERLAP' && ov.overlapDuration != null) return String(round6(ov.overlapDuration))
    return ''
  }

  const obs = cycle.observations.find((o) => o.workElementId === grow.elementId)
  if (!obs) return ''
  // بازهٔ کامل — فرمت «شروع-پایان» (§۹-۳)
  if (obs.startOffset != null && obs.endOffset != null) {
    return `${round6(obs.startOffset)}-${round6(obs.endOffset)}`
  }
  // بازهٔ ناقص در Paste قابل بیان نیست — خالی = بدون تغییر
  if (obs.startOffset != null || obs.endOffset != null) return ''
  if (method === 'CONTINUOUS') {
    return obs.cumulativeReading != null ? String(round6(obs.cumulativeReading)) : ''
  }
  return obs.rawDuration != null ? String(round6(obs.rawDuration)) : ''
}

// ═══════════════ تجزیهٔ فایل بارگذاری‌شده — §۹-۶ ═══════════════

export async function parseTimingExcelTemplate(sessionId: string, file: File): Promise<ExcelTemplateParseResult> {
  const session = await db.studySession.findUnique({
    where: { id: sessionId },
    include: {
      activity: { select: { id: true, name: true, station: { select: { projectId: true } } } },
    },
  })
  if (!session) throw new AppError('SESSION_NOT_FOUND', 'جلسه زمان‌سنجی یافت نشد.', 404)
  if (session.status !== 'OPEN') {
    throw new AppError('SESSION_CLOSED', 'این جلسه بسته است؛ برای ثبت داده، جلسه را بازگشایی کنید یا جلسهٔ جدید بسازید.', 422)
  }

  let wb: ExcelJS.Workbook
  try {
    const buf = await file.arrayBuffer()
    wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf)
  } catch {
    throw new AppError('TEMPLATE_INVALID', 'فایل Excel قابل خواندن نیست. فایل باید قالب xlsx (همان فایل دانلود‌شده از برنامه) باشد.', 422)
  }

  // ── Metadata — شناسه‌های پایدار (§۹-۴) ──
  const meta = wb.getWorksheet(SHEET_META)
  if (!meta || meta.getCell('A1').value !== 'T2_TIMING_TEMPLATE') {
    throw new AppError('TEMPLATE_INVALID', 'این فایل قالب معتبر Timing2 نیست (شیت Metadata یافت نشد). قالب را از همین جلسه دانلود کنید.', 422)
  }
  const version = Number(meta.getCell('B1').value)
  if (version !== TEMPLATE_VERSION) {
    throw new AppError('TEMPLATE_INVALID', `نسخهٔ قالب (${version}) پشتیبانی نمی‌شود؛ قالب جدیدی دانلود کنید.`, 422)
  }
  const templateSessionId = String(meta.getCell('B2').value ?? '')
  if (templateSessionId !== sessionId) {
    throw new AppError('TEMPLATE_INVALID', 'این قالب متعلق به جلسهٔ دیگری است. برای این جلسه، قالب جدید دانلود کنید.', 422)
  }
  const startCycleNo = Number(meta.getCell('B3').value) || 1
  const dataStartRow = Number(meta.getCell('B4').value) || DATA_START_ROW
  const labelCol = Number(meta.getCell('B5').value) || 1

  // ردیف‌های قالب از Metadata
  const templateRows: Array<{ kind: 'ELEMENT' | 'RELATION'; elementId: string; relationId: string | null; parentElementId: string | null }> = []
  for (let r = 9; ; r++) {
    const row = meta.getRow(r)
    const kind = row.getCell(2).value
    if (kind !== 'ELEMENT' && kind !== 'RELATION') break
    templateRows.push({
      kind,
      elementId: String(row.getCell(3).value ?? ''),
      relationId: row.getCell(4).value != null ? String(row.getCell(4).value) : null,
      parentElementId: row.getCell(5).value != null ? String(row.getCell(5).value) : null,
    })
  }
  if (templateRows.length === 0) {
    throw new AppError('TEMPLATE_INVALID', 'شناسه‌های ردیف‌ها در قالب یافت نشد؛ قالب جدیدی دانلود کنید.', 422)
  }

  // ── اعتبارسنجی ساختار جاری — §۹-۴: ترتیب/تکرار نام هرگز مبنای نگاشت نیست ──
  const { rows: gridRows } = await buildGridRows(session.activityId, session.activity.station.projectId)
  if (gridRows.length !== templateRows.length) {
    throw new AppError(
      'TEMPLATE_STALE',
      `ساختار ردیف‌های برگه از زمان ساخت قالب تغییر کرده است (قالب ${templateRows.length} ردیف دارد، برگهٔ فعلی ${gridRows.length} ردیف). قالب جدیدی دانلود کنید.`,
      422,
    )
  }
  for (let i = 0; i < gridRows.length; i++) {
    const cur = gridRows[i]
    const tpl = templateRows[i]
    const match =
      cur.kind === tpl.kind &&
      cur.elementId === tpl.elementId &&
      (cur.kind === 'ELEMENT' ? tpl.relationId === null : cur.relationId === tpl.relationId)
    if (!match) {
      throw new AppError(
        'TEMPLATE_STALE',
        `ساختار ردیف‌های برگه از زمان ساخت قالب تغییر کرده است (اختلاف در ردیف ${i + 1}${cur.kind === 'ELEMENT' ? ` — «${cur.elementName}»` : ''}). قالب جدیدی دانلود کنید.`,
        422,
      )
    }
  }

  // ── شیت داده ──
  const ws = wb.getWorksheet(SHEET_DATA) ?? wb.worksheets.find((w) => w.name !== SHEET_META && w.name !== SHEET_README)
  if (!ws) {
    throw new AppError('TEMPLATE_INVALID', 'شیت دادهٔ «برگه زمان‌سنجی» در فایل یافت نشد.', 422)
  }

  const warnings: string[] = []
  const cellErrors: string[] = []

  /** تبدیل مقدار سلول به متن Paste — §۹-۷: خطا با محل دقیق */
  const cellText = (value: ExcelJS.CellValue, rowIdx: number, colIdx: number): string => {
    if (value == null) return ''
    const grow = gridRows[rowIdx]
    const where = `ردیف ${rowIdx + 1} (${grow.kind === 'ELEMENT' ? grow.elementName : `هم‌پوشانی ${grow.elementName}↔${grow.otherElementName}`})، چرخهٔ ${startCycleNo + colIdx}`
    if (typeof value === 'string') return value.trim()
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        cellErrors.push(`${where}: عدد نامعتبر است.`)
        return ''
      }
      return String(round6(value))
    }
    if (typeof value === 'boolean') {
      cellErrors.push(`${where}: مقدار منطقی مجاز نیست.`)
      return ''
    }
    if (value instanceof Date) {
      cellErrors.push(`${where}: مقدار به تاریخ تبدیل شده است. قالب سلول باید «متن» باشد؛ مقدار را به‌صورت متن (مثل 3-9) وارد کنید.`)
      return ''
    }
    if (typeof value === 'object') {
      if ('richText' in value && Array.isArray(value.richText)) {
        return value.richText.map((rt) => String(rt.text)).join('').trim()
      }
      if ('result' in value && value.result != null) {
        return cellText(value.result as ExcelJS.CellValue, rowIdx, colIdx)
      }
      if ('error' in value) {
        cellErrors.push(`${where}: خطای فرمول Excel (${String(value.error)}).`)
        return ''
      }
      if ('text' in value && typeof value.text === 'string') return value.text.trim()
      if ('hyperlink' in value && typeof value.hyperlink === 'string') return ''
    }
    cellErrors.push(`${where}: نوع مقدار پشتیبانی نمی‌شود.`)
    return ''
  }

  // محدودهٔ ستون‌ها: تا آخرین ستون دارای مقدار (ستون‌های خالی انتهایی حذف می‌شوند
  // تا چرخهٔ خالی اضافه ساخته نشود)
  let lastCol = 0
  for (let ri = 0; ri < templateRows.length; ri++) {
    const row = ws.getRow(dataStartRow + ri)
    for (let c = labelCol + 1; c <= ws.columnCount; c++) {
      const v = row.getCell(c).value
      if (v != null && String(typeof v === 'object' && 'text' in (v as object) ? (v as { text?: string }).text ?? '' : v).trim() !== '') {
        if (c > lastCol) lastCol = c
      }
    }
  }
  const width = Math.max(0, lastCol - labelCol)

  const data: string[][] = []
  for (let ri = 0; ri < templateRows.length; ri++) {
    const row = ws.getRow(dataStartRow + ri)
    const cells: string[] = []
    for (let c = 0; c < width; c++) {
      cells.push(cellText(row.getCell(labelCol + 1 + c).value, ri, c))
    }
    data.push(cells)
  }

  if (cellErrors.length > 0) {
    throw new AppError('TEMPLATE_CELL_ERRORS', `${cellErrors.length} سلول نامعتبر است:\n• ${cellErrors.slice(0, 8).join('\n• ')}${cellErrors.length > 8 ? `\n• … و ${cellErrors.length - 8} مورد دیگر` : ''}`, 422)
  }
  if (width === 0 || data.every((r) => r.every((v) => v === ''))) {
    throw new AppError('TEMPLATE_EMPTY', 'هیچ داده‌ای در قالب تکمیل نشده است؛ پس از وارد کردن مقادیر، فایل را بارگذاری کنید.', 422)
  }

  const firstRow = gridRows[0]
  if (firstRow.kind !== 'ELEMENT') {
    throw new AppError('TEMPLATE_INVALID', 'اولین ردیف قالب عنصر کاری نیست؛ ساختار قالب معتبر نیست.', 422)
  }

  return {
    data,
    startCycleNo,
    startElementId: firstRow.elementId,
    startRelationId: null,
    warnings,
    sourceName: file.name || null,
  }
}
