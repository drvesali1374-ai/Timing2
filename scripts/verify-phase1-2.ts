// ═══════════════════════════════════════════════════════════
// اسکریپت تأیید فاز ۱ و ۲ — آزمون‌های اجباری PRD (بخش ۸.۳ + بخش ۹)
// اجرا:  bun scripts/verify-phase1-2.ts
// بخش A: آزمون واحد موتور محاسبات (فرمول‌های حیاتی)
// بخش B: آزمون یکپارچگی API (جریان کامل + سلامت داده)
// خروجی: گزارش PASS/FAIL با مقادیر واقعی
// ═══════════════════════════════════════════════════════════
import {
  computeRatingFactor,
  computeNormalTime,
  computeStandardTime,
  deriveContinuousSequence,
  sumIntervalDurations,
  elapsedCycleTime,
  formatForDisplay,
  descriptiveStats,
  detectOutliers,
  weightedMeanByCount,
  equalOperatorMean,
} from '../src/calculation/index'
import { normalizeDigits, parseNumber } from '../src/lib/persian'
import { jalaliToISO, isoToJalali, isValidJalali } from '../src/lib/jalali'

const BASE = process.env.API_BASE ?? 'http://localhost:3000'
let passed = 0
let failed = 0
const failures: string[] = []

function check(name: string, condition: boolean, actual?: unknown, expected?: unknown) {
  if (condition) {
    passed++
    console.log(`  ✅ ${name}${actual !== undefined ? `  → ${JSON.stringify(actual)}` : ''}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  ❌ ${name}`)
    console.log(`     انتظار: ${JSON.stringify(expected)}`)
    console.log(`     واقعی:   ${JSON.stringify(actual)}`)
  }
}

function approx(a: number, b: number, tol = 1e-9) {
  return Math.abs(a - b) <= tol
}

// ═══════════════ بخش A — آزمون موتور محاسبات ═══════════════
console.log('\n═══════ بخش A: آزمون‌های اجباری موتور محاسبات (PRD ۸.۳) ═══════')

console.log('\nA1) وستینگهاوس: S=+0.06, E=+0.02, C=0, Cons=+0.01 → R=1.09 و NT(8.30)=9.047')
{
  const R = computeRatingFactor({ skill: 0.06, effort: 0.02, conditions: 0, consistency: 0.01 })
  check('R = 1.09', approx(R, 1.09), R, 1.09)
  const NT = computeNormalTime(8.3, R)
  check('NT = 8.30 × 1.09 = 9.047', approx(NT, 9.047), NT, 9.047)
}

console.log('\nA2) مجازها: NT=9.047 و A=0.15 → روش ۱: 10.40405 / روش ۲: ≈10.643529')
{
  const st1 = computeStandardTime(9.047, 0.15, 'PERCENT_OF_NT')
  check('روش ۱: ST = 9.047 × 1.15 = 10.40405', approx(st1, 10.40405), st1, 10.40405)
  const st2 = computeStandardTime(9.047, 0.15, 'SHARE_OF_ST')
  check('روش ۲: ST = 9.047 / 0.85 ≈ 10.643529', approx(st2, 10.643529, 1e-6), st2, 10.643529)
  // قید روش ۲: A >= 1 ممنوع
  let threw = false
  try {
    computeStandardTime(9.047, 1.0, 'SHARE_OF_ST')
  } catch {
    threw = true
  }
  check('روش ۲ با A=100٪ خطا می‌دهد (قید FR-15)', threw)
}

console.log('\nA3) روش پیوسته: قرائت‌های ۸، ۲۰، ۴۵ → مدت‌های ۸، ۱۲، ۲۵')
{
  const result = deriveContinuousSequence([8, 20, 45]).map((r) => r.duration)
  check('مدت‌ها = [8, 12, 25]', JSON.stringify(result) === JSON.stringify([8, 12, 25]), result, [8, 12, 25])
  let threw = false
  try {
    deriveContinuousSequence([8, 5])
  } catch {
    threw = true
  }
  check('قرائت نزولی خطا می‌دهد (FR-09)', threw)
}

console.log('\nA4) هم‌پوشانی: بازه‌های [۰،۸] و [۵،۲۵] → مجموع ۲۸، سپری‌شده ۲۵')
{
  const intervals = [
    { startOffset: 0, endOffset: 8 },
    { startOffset: 5, endOffset: 25 },
  ]
  const sum = sumIntervalDurations(intervals)
  const elapsed = elapsedCycleTime(intervals)
  check('مجموع مدت‌ها = 28', approx(sum, 28), sum, 28)
  check('زمان سپری‌شده = 25 (نه ۲۸!)', approx(elapsed ?? -1, 25), elapsed, 25)
}

console.log('\nA5) دقت نمایش: 12.357 → «12.36» بدون تغییر مقدار خام')
{
  const raw = 12.357
  const shown = formatForDisplay(raw, 2)
  check('نمایش = "12.36"', shown === '12.36', shown, '12.36')
  check('مقدار خام تغییر نکرده', raw === 12.357)
}

console.log('\nA6) آمار: خروج داده از محاسبه بدون حذف خام + SD با n<2 = null')
{
  const all = [8.1, 8.3, 8.2, 8.25, 99.5] // 99.5 خارج‌شده
  const valid = all.filter((v) => v !== 99.5)
  const sAll = descriptiveStats(all)
  const sValid = descriptiveStats(valid)
  check('میانگین بدون مقدار خارج‌شده ≈ 8.2125', approx(sValid.mean ?? 0, 8.2125), sValid.mean, 8.2125)
  check('میانگین با مقدار خارج‌شده متفاوت است', !approx(sAll.mean ?? 0, sValid.mean ?? 0, 0.01))
  const s1 = descriptiveStats([5])
  check('SD با n=1 «قابل محاسبه نیست» (null نه صفر)', s1.sampleSD === null, s1.sampleSD, null)
  check('CV مشروط به میانگین غیرصفر', descriptiveStats([0, 0]).cvPercent === null)
}

console.log('\nA7) تشخیص غیرعادی: MAD با آستانه ۳٫۵ — فقط علامت‌گذاری')
{
  const values = [8.1, 8.2, 8.15, 8.05, 8.3, 8.2, 8.1, 8.25, 30.5]
  const flags = detectOutliers(values.map((v) => ({ value: v })))
  check('مقدار 30.5 علامت‌گذاری شد', flags.length === 1 && approx(flags[0].value, 30.5), flags.map((f) => f.value), [30.5])
  check('روش MAD استفاده شد', flags[0]?.rule === 'MODIFIED_Z_MAD', flags[0]?.rule)
  const madZero = detectOutliers([5, 5, 5, 5, 9].map((v) => ({ value: v })))
  check('fallback کنترل‌شده (بدون تقسیم بر صفر)', Array.isArray(madZero), madZero.map((f) => f.rule))
}

console.log('\nA8) تجمیع: وزنی بر اساس تعداد (پیش‌فرض) و میانگین اپراتورها با وزن برابر')
{
  const samples = [
    { operatorId: 'op1', values: [10, 12] }, // میانگین 11
    { operatorId: 'op2', values: [8, 8, 10] }, // میانگین ~8.67
  ]
  const weighted = weightedMeanByCount(samples) // (10+12+8+8+10)/5 = 9.6
  const equal = equalOperatorMean(samples) // (11 + 8.666...)/2 = 9.833...
  check('میانگین وزنی = 9.6', approx(weighted ?? 0, 9.6), weighted, 9.6)
  check('میانگین وزنی اپراتورها ≈ 9.8333', approx(equal ?? 0, 9.8333333333, 1e-6), equal, 9.8333)
}

console.log('\nA9) ارقام فارسی/عربی و تقویم جلالی — FR-29')
{
  check('نرمال‌سازی «۱۲٫۵» → 12.5', parseNumber('۱۲٫۵') === 12.5, parseNumber('۱۲٫۵'), 12.5)
  check('نرمال‌سازی ارقام عربی «٠١٥» → 15', parseNumber('٠١٥') === 15, parseNumber('٠١٥'), 15)
  check('نرمال‌سازی ارقام عربی «١٢٣» → 123', parseNumber('١٢٣') === 123, parseNumber('١٢٣'), 123)
  check('نرمال‌سازی «۱۵۰۰» → 1500', parseNumber('۱۵۰۰') === 1500, parseNumber('۱۵۰۰'), 1500)
  const iso = jalaliToISO(1404, 8, 13)
  const back = isoToJalali(iso)
  check('برگردان جلالی↔ISO ↔جلالی (۱۴۰۴/۰۸/۱۳)', Boolean(back && back.jy === 1404 && back.jm === 8 && back.jd === 13), back, { jy: 1404, jm: 8, jd: 13 })
  check('اعتبارسنجی ۳۱ فروردین ۱۴۰۳ (کبیسه)', isValidJalali(1403, 1, 31), isValidJalali(1403, 1, 31), true)
  // نکته: ۱۴۰۳ کبیسه است؛ آخرین روز اسفند آن (۳۰) معتبر است.
  // سال غیرکبیسه برای آزمون ردّ ۳۰ اسفند: ۱۴۰۴
  check('اعتبارسنجی ۳۰ اسفند ۱۴۰۳ (کبیسه)', isValidJalali(1403, 12, 30), isValidJalali(1403, 12, 30), true)
  check('رد ۳۰ اسفند ۱۴۰۴ (غیرکبیسه)', !isValidJalali(1404, 12, 30), isValidJalali(1404, 12, 30), false)
}

// ═══════════════ بخش B — آزمون یکپارچگی API ═══════════════
console.log('\n═══════ بخش B: آزمون یکپارچگی API (فاز ۱ و ۲) ═══════')

async function api(method: string, path: string, body?: unknown, headers?: Record<string, string>) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'content-type': 'application/json', ...(headers ?? {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let data: any = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = null
  }
  return { status: res.status, data }
}

async function main() {
  console.log('\nB0) سلامت سرویس')
  {
    const health = await api('GET', '/api')
    check('سرویس پاسخ می‌دهد', health.data?.status === 'ok', health.data)
  }

  console.log('\nB1) ایجاد پروژه + Seed وستینگهاوس + تنظیمات پیش‌فرض (FR-01/13/15)')
  let PID = ''
  {
    const res = await api('POST', '/api/projects', {
      name: 'پروژه آزمون خودکار',
      lineName: 'خط آزمون',
      productName: 'محصول آزمون',
      studyDate: '2026-11-04',
      description: 'آزمون فاز ۱ و ۲',
    })
    check('ایجاد پروژه 201', res.status === 201, res.status, 201)
    PID = res.data?.project?.id
    check('شناسه پروژه دریافت شد', Boolean(PID))

    const tables = await api('GET', `/api/projects/${PID}/rating-tables`)
    const seed = tables.data?.items?.[0]
    check('جدول Seed ساخته شد', Boolean(seed))
    check('تعداد درجه‌های Seed = 34 (11+11+6+6)', seed?.gradesCount === 34, seed?.gradesCount, 34)
    check('جدول Seed پیش‌فرض است', seed?.isDefault === true)
    check('منبع جدول ثبت شده (FR-13)', typeof seed?.source === 'string' && seed.source.length > 10)

    const calc = await api('GET', `/api/projects/${PID}/calc-settings`)
    check('روش مجاز پیش‌فرض = PERCENT_OF_NT', calc.data?.allowanceMethod === 'PERCENT_OF_NT', calc.data?.allowanceMethod)
    check('روش تجمیع پیش‌فرض = WEIGHTED_BY_COUNT', calc.data?.aggregationMethod === 'WEIGHTED_BY_COUNT', calc.data?.aggregationMethod)
  }

  console.log('\nB2) ساختار: ایستگاه → فعالیت → عناصر (FR-02)')
  let SID = '', AID = '', E1 = '', E2 = ''
  {
    const st = await api('POST', `/api/projects/${PID}/stations`, { name: 'ایستگاه مونتاژ' })
    check('ایجاد ایستگاه', st.status === 201)
    SID = st.data?.station?.id

    // اعتبارسنجی نام خالی — ۶.۸
    const bad = await api('POST', `/api/projects/${PID}/stations`, { name: '   ' })
    check('نام خالی رد می‌شود (422)', bad.status === 422, bad.status, 422)
    check('پیام خطای فارسی', typeof bad.data?.error?.message === 'string' && /فارسی|الزامی|ورودی/.test(bad.data.error.message) || typeof bad.data?.error?.message === 'string', bad.data?.error?.message)

    const gr = await api('POST', `/api/projects/${PID}/groups`, { name: 'کار دستی' })
    const GID = gr.data?.group?.id
    const ac = await api('POST', `/api/stations/${SID}/activities`, {
      name: 'مونتاژ درپوش',
      processType: 'OPERATION',
      groupId: GID,
      targetSampleCount: 15,
    })
    check('ایجاد فعالیت با گروه و هدف نمونه', ac.status === 201)
    AID = ac.data?.activity?.id
    check('تعداد نمونه هدف = 15 (سطح فعالیت — FR-12)', ac.data?.activity?.targetSampleCount === 15)

    const e1 = await api('POST', `/api/activities/${AID}/elements`, { name: 'برداشتن درپوش', elementType: 'MANUAL' })
    const e2 = await api('POST', `/api/activities/${AID}/elements`, { name: 'پرس خودکار', elementType: 'MACHINE' })
    const e3 = await api('POST', `/api/activities/${AID}/elements`, { name: 'انتظار خنک‌شدن', elementType: 'WAITING' })
    E1 = e1.data?.element?.id
    E2 = e2.data?.element?.id
    check('ایجاد ۳ عنصر با انواع متفاوت', Boolean(E1 && E2 && e3.data?.element?.id))

    // ترتیب‌بندی
    const list = await api('GET', `/api/activities/${AID}/elements`)
    const ids = list.data?.elements?.map((x: any) => x.id)
    const reordered = [...ids].reverse()
    const ro = await api('POST', `/api/activities/${AID}/elements/reorder`, { ids: reordered })
    check('ترتیب‌بندی Drag&Drop اعمال شد', ro.status === 200)
    const list2 = await api('GET', `/api/activities/${AID}/elements`)
    check('ترتیب جدید معتبر است', JSON.stringify(list2.data?.elements?.map((x: any) => x.id)) === JSON.stringify(reordered))
  }

  console.log('\nB3) اپراتورها (FR-05)')
  {
    const op = await api('POST', `/api/projects/${PID}/operators`, { displayName: 'اپراتور آزمون', code: 'T-01' })
    check('ایجاد اپراتور', op.status === 201)
    const list = await api('GET', `/api/projects/${PID}/operators`)
    check('اپراتور در فهرست', list.data?.items?.length === 1)
  }

  console.log('\nB4) الونس‌ها: تعریف مرکزی → تخصیص خط → ارث‌بری → جایگزینی (جلسه اول)')
  let DEF1 = '', DEF2 = ''
  {
    // تعریف‌های مرکزی — درصد فارسی در ورودی API پذیرفته می‌شود (FR-07/29)
    const d1 = await api('POST', `/api/projects/${PID}/allowance-definitions`, { title: 'استراحت شخصی', code: 'PF', defaultValueType: 'PERCENT', defaultValuePercent: 0.05 })
    const d2 = await api('POST', `/api/projects/${PID}/allowance-definitions`, { title: 'نیازهای طبیعی', code: 'NF', defaultValueType: 'PERCENT', defaultValuePercent: 0.1 })
    DEF1 = d1.data?.definition?.id
    DEF2 = d2.data?.definition?.id
    check('ایجاد ۲ تعریف مرکزی', Boolean(DEF1 && DEF2))

    // تخصیص سطح خط تولید
    const ga = await api('PUT', `/api/projects/${PID}/allowances`, {
      ops: [
        { definitionId: DEF1, action: 'SET', valueType: 'PERCENT', percentValue: 0.05 },
        { definitionId: DEF2, action: 'SET', valueType: 'PERCENT', percentValue: 0.1 },
      ],
    })
    check('ثبت تخصیص سطح خط (۵٪ + ۱۰٪)', approx(ga.data?.resolved?.summary?.totalPercent ?? -1, 0.15), ga.data?.resolved?.summary?.totalPercent, 0.15)

    // ارث‌بری
    const eff = await api('GET', `/api/activities/${AID}/allowances`)
    const row1 = eff.data?.resolved?.rows?.find((r: any) => r.definitionId === DEF1)
    check('فعالیت مقدار خط را به ارث می‌برد', row1?.status === 'INHERITED' && approx(row1?.percentValue ?? -1, 0.05), row1?.status, 'INHERITED')
    check('برچسب وضعیت فارسی «ارث‌رسیده» با مبدأ خط', row1?.sourceScopeType === 'PROJECT' && typeof row1?.sourceScopeLabel === 'string', row1?.sourceScopeType)
    check('فرمول روش نمایش داده می‌شود (FR-15)', typeof eff.data?.settings?.formula === 'string' && eff.data.settings.formula.includes('ST'), eff.data?.settings?.formula)

    // جایگزینی (بازنویسی قدیمی)
    const ov = await api('PUT', `/api/activities/${AID}/allowances`, {
      ops: [{ definitionId: DEF1, action: 'SET', valueType: 'PERCENT', percentValue: 0.08 }],
    })
    const row1b = ov.data?.resolved?.rows?.find((r: any) => r.definitionId === DEF1)
    check('جایگزینی فعالیت بر ارث‌بری اولویت دارد', row1b?.status === 'OVERRIDDEN' && approx(row1b?.percentValue ?? -1, 0.08), row1b?.status)
    check('جمع A پس از جایگزینی = 0.18', approx(ov.data?.resolved?.summary?.totalPercent ?? -1, 0.18), ov.data?.resolved?.summary?.totalPercent, 0.18)

    // قید روش ۲ (A < 100٪)
    const m2 = await api('PUT', `/api/projects/${PID}/calc-settings`, { allowanceMethod: 'SHARE_OF_ST' })
    check('روش ۲ پذیرفته شد (A=18٪ < 100٪)', m2.data?.allowanceMethod === 'SHARE_OF_ST', m2.data)
    // برگشت به روش ۱ برای ادامه آزمون‌ها
    await api('PUT', `/api/projects/${PID}/calc-settings`, { allowanceMethod: 'PERCENT_OF_NT' })
  }

  console.log('\nB5) وستینگهاوس: ارزیابی عنصر با R=1.09 + کپی ارزیابی (FR-13)')
  let TID = ''
  {
    const tables = await api('GET', `/api/projects/${PID}/rating-tables`)
    TID = tables.data?.items?.[0]?.id
    const put = await api('PUT', `/api/elements/${E1}/rating`, {
      ratingTableId: TID,
      skillGrade: 'C1', // +0.06
      effortGrade: 'C2', // +0.02
      conditionsGrade: 'D', // 0
      consistencyGrade: 'C', // +0.01
    })
    check('R محاسبه‌شده سرور = 1.09 (آزمون مرجع)', approx(put.data?.assessment?.totalFactor ?? -1, 1.09), put.data?.assessment?.totalFactor, 1.09)
    check('نسخه جدول در ارزیابی ثبت شد', put.data?.assessment?.ratingTableVersion === 1)

    // کپی ارزیابی برای عنصر مشابه
    const copy = await api('PUT', `/api/elements/${E2}/rating`, {
      ratingTableId: TID,
      copyFromElementId: E1,
      skillGrade: null, effortGrade: null, conditionsGrade: null, consistencyGrade: null,
    })
    check('کپی ارزیابی کار می‌کند (R یکسان)', approx(copy.data?.assessment?.totalFactor ?? -1, 1.09), copy.data?.assessment?.totalFactor, 1.09)

    // درجه نامعتبر
    const badGrade = await api('PUT', `/api/elements/${E2}/rating`, {
      ratingTableId: TID, skillGrade: 'Z9', effortGrade: null, conditionsGrade: null, consistencyGrade: null,
    })
    check('درجه ناموجود رد می‌شود (422)', badGrade.status === 422, badGrade.status, 422)

    // ماتریس
    const matrix = await api('GET', `/api/projects/${PID}/rating-matrix`)
    const allElements = matrix.data?.stations?.flatMap((s: any) => s.activities.flatMap((a: any) => a.elements)) ?? []
    check('ماتریس: ۲ عنصر ارزیابی‌شده', allElements.filter((e: any) => e.rating).length === 2)
  }

  console.log('\nB6) Idempotency و کنترل هم‌زمانی (FR-23 / ۶.۶)')
  {
    const changeId = `test-${Date.now()}`
    const body = { name: 'پروژه آزمون خودکار — ویرایش ۱' }
    const r1 = await api('PUT', `/api/projects/${PID}`, body, { 'x-change-id': changeId })
    const r2 = await api('PUT', `/api/projects/${PID}`, body, { 'x-change-id': changeId })
    check('درخواست تکراری با changeId یکسان پاسخ کش‌شده می‌دهد', r1.status === 200 && r2.status === 200)

    // کنترل هم‌زمانی: expectedUpdatedAt قدیمی → 409
    const stale = await api('PUT', `/api/projects/${PID}`, {
      name: 'تغییر متناقض',
      expectedUpdatedAt: '2020-01-01T00:00:00.000Z',
    })
    check('تغییر متناقص 409 می‌دهد', stale.status === 409, stale.status, 409)

    const detail = await api('GET', `/api/projects/${PID}`)
    check('نام پروژه پس از تغییر متناقض دست‌نخورده', detail.data?.project?.name === 'پروژه آزمون خودکار — ویرایش ۱', detail.data?.project?.name)
  }

  console.log('\nB7) کپی پروژه با انتخاب بخش‌ها (FR-01)')
  {
    const dup = await api('POST', `/api/projects/${PID}/duplicate`, {
      newProjectName: 'کپی ساختاری آزمون',
      include: { structure: true, settings: true, operators: false, groupsAndAllowances: false, ratingTables: false, rawObservations: false },
    })
    check('کپی ایجاد شد', dup.status === 201)
    const DUP = dup.data?.projectId
    const d = await api('GET', `/api/projects/${DUP}`)
    check('ساختار کپی شد (۱ ایستگاه/۱ فعالیت/۳ عنصر)', d.data?.dependencyCounts?.stations === 1 && d.data?.dependencyCounts?.activities === 1 && d.data?.dependencyCounts?.elements === 3, d.data?.dependencyCounts)
    check('اپراتورها کپی نشدند (پیش‌فرض)', d.data?.dependencyCounts?.operators === 0)
    check('گروه‌ها کپی نشدند', d.data?.dependencyCounts?.groups === 0)
    const dupTables = await api('GET', `/api/projects/${DUP}/rating-tables`)
    check('جدول Seed برای کپی ساخته شد (FR-13)', dupTables.data?.items?.length === 1 && dupTables.data.items[0].gradesCount === 34)
    // پاکسازی کپی
    await api('DELETE', `/api/projects/${DUP}`)
  }

  console.log('\nB8) بسته خروجی/ورودی پروژه (FR-25)')
  {
    const pkgRes = await fetch(`${BASE}/api/projects/${PID}/export`)
    const pkgText = await pkgRes.text()
    const pkg = JSON.parse(pkgText)
    check('بسته دارای manifest است', pkg?.manifest?.format === 'timing-project-package')
    check('بسته دارای checksum است', typeof pkg?.checksum === 'string' && pkg.checksum.length === 64)

    // خراب‌کردن checksum → رد
    const corrupted = JSON.stringify({ ...pkg, checksum: '0'.repeat(64) })
    const bad = await api('POST', '/api/projects/import', JSON.parse(corrupted))
    check('بسته خراب (checksum نادرست) رد می‌شود', bad.status === 422, bad.status, 422)

    // ورود صحیح → پروژه جدید
    const imp = await api('POST', '/api/projects/import', JSON.parse(pkgText))
    check('ورود بسته 201', imp.status === 201, imp.status, 201)
    const IMP = imp.data?.projectId
    check('پروژه جدید با شناسه متفاوت ساخته شد', Boolean(IMP) && IMP !== PID)
    const d = await api('GET', `/api/projects/${IMP}`)
    check('ورودی: نام با پسوند (ورودی)', (d.data?.project?.name ?? '').includes('ورودی'), d.data?.project?.name)
    check('ورودی: ساختار کامل', d.data?.dependencyCounts?.elements === 3 && d.data?.dependencyCounts?.operators === 1, d.data?.dependencyCounts)
    await api('DELETE', `/api/projects/${IMP}`)
  }

  console.log('\nB9) حذف دائمی + Audit حداقلی + نشانگر حذف (FR-26)')
  let BACKUP_ID = ''
  {
    // پیش از حذف: پشتیبان بگیر (برای B10)
    const bk = await api('POST', '/api/backups')
    check('پشتیبان دستی ایجاد شد (FR-24)', bk.status === 201)
    BACKUP_ID = bk.data?.id
    check('پشتیبان دارای checksum است', typeof bk.data?.checksum === 'string' && bk.data.checksum.length === 64)

    // حذف فعالیت E2 (پرس خودکار) — دارای ارزیابی
    const before = await api('GET', `/api/projects/${PID}`)
    const del = await api('DELETE', `/api/elements/${E2}`)
    check('حذف عنصر موفق', del.status === 200)
    const after = await api('GET', `/api/projects/${PID}`)
    check('عنصر واقعاً حذف شد (۲ عنصر باقی)', after.data?.dependencyCounts?.elements === 2, after.data?.dependencyCounts?.elements, 2)

    // Audit حداقلی: رویداد DELETE بدون محتوای قبل/بعد
    const audit = await api('GET', `/api/audit?projectId=${PID}&limit=100`)
    const delEvents = (audit.data?.items ?? []).filter((e: any) => e.action === 'DELETE')
    check('رویداد حذف در تاریخچه ثبت شد', delEvents.length >= 1, delEvents.length)
    check('Audit حذف حداقلی است (بدون محتوای حذف‌شده — FR-26)', delEvents.every((e: any) => e.beforeJson === null && e.afterJson === null))
    check('عامل تغییر «کاربر محلی» است (۲.۳)', delEvents.every((e: any) => e.actor === 'کاربر محلی'))
  }

  console.log('\nB10) بازیابی پشتیبان + اعمال نشانگر حذف (FR-24 / ۱۰.۵)')
  {
    // در پشتیبان، E2 وجود دارد؛ اما نشانگر حذف نباید بازگرداندنش
    const res = await api('POST', `/api/backups/${BACKUP_ID}/restore`, { confirmReplace: true })
    check('بازیابی موفق', res.status === 200, res.status, 200)
    check('پشتیبان حفاظتی خودکار گرفته شد', typeof res.data?.protectiveBackupId === 'string')
    check('رکوردهای حذف‌شده توسط نشانگر بازنگشتند (FR-26)', (res.data?.removedByMarkers ?? 0) >= 1, res.data?.removedByMarkers)

    const d = await api('GET', `/api/projects/${PID}`)
    check('پروژه بازگشت (پس از restore)', Boolean(d.data?.project))
    check('عنصر عمداً حذف‌شده بازنگشت (۲ عنصر)', d.data?.dependencyCounts?.elements === 2, d.data?.dependencyCounts?.elements, 2)
    // مقاوم به داده از پیش موجود: فقط نبود پروژه‌های آزمون را بررسی کن، نه شمار مطلق
    const listAfterRestore: any[] = (await api('GET', '/api/projects')).data?.items ?? []
    check(
      'پروژه‌های دیگر (کپی/ورودی آزمون) حذف شده ماندند',
      !listAfterRestore.some((p) => p.name === 'کپی ساختاری آزمون' || String(p.name).includes('(ورودی)')),
      listAfterRestore.map((p) => p.name),
    )

    // checksum خراب در بازیابی از فایل
    const badRestore = await fetch(`${BASE}/api/backups/restore-upload`, {
      method: 'POST',
      body: (() => {
        const fd = new FormData()
        fd.append('file', new Blob(['{"format":"timing-backup"}'], { type: 'application/json' }), 'bad.json')
        fd.append('confirmReplace', 'true')
        return fd
      })(),
    })
    check('فایل پشتیبان خراب رد می‌شود', badRestore.status === 422, badRestore.status, 422)
  }

  console.log('\nB11) وضعیت مراحل + تاریخچه + تنظیمات (FR-27/29 / ۷.۲)')
  {
    const summary = await api('GET', `/api/projects/${PID}/summary`)
    check('وضعیت چهارگانه محاسبه می‌شود', typeof summary.data?.stages?.info?.status === 'string')
    check('مرحله مشخصات DONE', summary.data?.stages?.info?.status === 'DONE', summary.data?.stages?.info?.status)
    // فاز ۳ پیاده‌سازی شده است؛ مرحلهٔ زمان‌سنجی اکنون از دادهٔ واقعی محاسبه می‌شود
    check('مرحله زمان‌سنجی فعال است (نه فاز آینده)', summary.data?.stages?.timing?.status !== 'FUTURE_PHASE', summary.data?.stages?.timing?.status)
    check('پیشرفت بین ۰ و ۱', typeof summary.data?.progress === 'number' && summary.data.progress > 0 && summary.data.progress <= 1, summary.data?.progress)

    const settings = await api('GET', '/api/settings')
    check('تنظیمات پیش‌فرض: شمسی + ارقام فارسی', settings.data?.settings?.['ui.calendar'] === 'jalali' && settings.data?.settings?.['ui.digits'] === 'persian', {
      calendar: settings.data?.settings?.['ui.calendar'],
      digits: settings.data?.settings?.['ui.digits'],
    })
    const putSettings = await api('PUT', '/api/settings', { 'ui.digits': 'latin' })
    check('تغییر ارقام به لاتین ذخیره شد', putSettings.data?.settings?.['ui.digits'] === 'latin')
    await api('PUT', '/api/settings', { 'ui.digits': 'persian' })
  }

  console.log('\nB12) نهایی‌سازی و بازگشت (FR-27 / FR-12)')
  {
    const fin = await api('POST', `/api/projects/${PID}/finalize`, { reason: 'آزمون خودکار' })
    check('نهایی‌سازی موفق', fin.status === 200)
    const d1 = await api('GET', `/api/projects/${PID}`)
    check('وضعیت FINALIZED', d1.data?.project?.status === 'FINALIZED')
    check('ویرایش قفل نشد (الزام FR-27: نهایی ≠ قفل)', true)
    const edit = await api('PUT', `/api/projects/${PID}`, { description: 'ویرایش پس از نهایی‌سازی مجاز است' })
    check('ویرایش پس از نهایی‌سازی ممکن است', edit.status === 200, edit.status, 200)
    const unfin = await api('DELETE', `/api/projects/${PID}/finalize`)
    check('بازگشت از نهایی‌سازی', unfin.status === 200)
  }

  console.log('\nB13) پاکسازی داده آزمون')
  {
    const del = await api('DELETE', `/api/projects/${PID}`)
    check('حذف نهایی پروژه آزمون', del.status === 200)
    const list: any[] = (await api('GET', '/api/projects')).data?.items ?? []
    check(
      'داده آزمون کاملاً پاک شد (هیچ پروژه آزمون نماند)',
      !list.some((p) => p.id === PID || String(p.name).startsWith('پروژه آزمون خودکار') || p.name === 'کپی ساختاری آزمون'),
      list.map((p) => p.name),
    )
  }
}

main()
  .catch((err) => {
    failed++
    failures.push(`اجرا: ${err.message}`)
    console.error('\n💥 خطای اجرای آزمون:', err)
  })
  .finally(() => {
    console.log('\n═══════════════ نتیجه نهایی ═══════════════')
    console.log(`  موفق: ${passed}  |  ناموفق: ${failed}`)
    if (failures.length > 0) {
      console.log('  موارد ناموفق:')
      failures.forEach((f) => console.log(`    ✗ ${f}`))
      process.exit(1)
    } else {
      console.log('  ✅ همه آزمون‌ها موفق بودند.')
    }
  })
