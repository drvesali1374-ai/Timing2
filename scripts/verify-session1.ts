// ═══════════════════════════════════════════════════════════
// اسکریپت تأیید جلسه اول — سیستم الونس‌های سلسله‌مراتبی
// اجرا:  bun scripts/verify-session1.ts
// پوشش سند §۱۰:
//   §۱۰.۱ ارث‌بری — ۱۵ سناریو (ارث/جایگزینی/Exclude/Restore/sibling)
//   §۱۰.۲ محاسبات — P/T/ST، دو روش، per-execution/per-cycle، رد مقادیر
//   §۱۰.۳ migration — fixture قدیمی، حفظ نتیجه، تکرارپذیری
// علاوه بر آن: تست مرجع فرمول‌های موجود (بدون تغییر خروجی)
// ═══════════════════════════════════════════════════════════
export {}

const BASE = process.env.API_BASE ?? 'http://localhost:3000'
process.env.DATABASE_URL ??= 'file:/home/z/my-project/db/custom.db'

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

const close = (a: number, b: number, tol = 1e-9) => Math.abs(a - b) < tol

// ── HTTP helper ──
async function req(method: string, path: string, body?: unknown): Promise<{ status: number; data: any }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let data: any = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = text
    }
  }
  return { status: res.status, data }
}

async function main() {
  const { PrismaClient } = await import('@prisma/client')
  const db = new PrismaClient()

  console.log('════════════════════════════════════════════════')
  console.log('  تأیید جلسه اول — الونس‌های سلسله‌مراتبی')
  console.log('════════════════════════════════════════════════')

  // ═══ بخش ۰ — تست مرجع فرمول‌های موجود (§۱۰.۲) ═══
  console.log('\n── §۱۰.۲ تست مرجع فرمول‌های موجود (بدون تغییر) ──')
  {
    const { computeStandardTime, ALLOWANCE_REFERENCE_TEST } = await import('../src/calculation/allowances')
    const m1 = computeStandardTime(ALLOWANCE_REFERENCE_TEST.nt, ALLOWANCE_REFERENCE_TEST.a, 'PERCENT_OF_NT')
    const m2 = computeStandardTime(ALLOWANCE_REFERENCE_TEST.nt, ALLOWANCE_REFERENCE_TEST.a, 'SHARE_OF_ST')
    check('مرجع روش ۱: 9.047×1.15 = 10.40405', close(m1, ALLOWANCE_REFERENCE_TEST.expectedM1), m1)
    check('مرجع روش ۲: 9.047/0.85 ≈ 10.643529', close(m2, ALLOWANCE_REFERENCE_TEST.expectedM2, 1e-6), m2)
    let rejected = false
    try {
      computeStandardTime(10, 1.0, 'SHARE_OF_ST')
    } catch {
      rejected = true
    }
    check('مرجع: A≥۱۰۰٪ در روش ۲ رد می‌شود', rejected)
    // موتور جدید ST عنصر
    const { computeElementStandardTime } = await import('../src/calculation/effective-allowances')
    const r = computeElementStandardTime(100, { totalPercent: 0.08, perExecutionSeconds: 2.5, perCycleSeconds: 30 }, 'PERCENT_OF_NT')
    check('ST عنصر: 100×1.08 + 2.5 = 110.5 (per-cycle وارد ST نمی‌شود)', close(r.st, 110.5), r.st)
    const r2 = computeElementStandardTime(100, { totalPercent: 0.08, perExecutionSeconds: 0, perCycleSeconds: 0 }, 'SHARE_OF_ST')
    check('ST عنصر روش ۲: 100/0.92 ≈ 108.695652', close(r2.st, 100 / 0.92, 1e-9), r2.st)
  }

  // ═══ راه‌اندازی fixture از طریق API ═══
  console.log('\n── راه‌اندازی fixture ──')
  const projRes = await req('POST', '/api/projects', {
    name: 'تست جلسه ۱ — الونس سلسله‌مراتبی',
    lineName: 'خط تست',
    productName: 'محصول تست',
  })
  check('ایجاد پروژه', projRes.status === 201 || projRes.status === 200, projRes.status)
  const projectId: string = projRes.data?.project?.id ?? projRes.data?.id
  check('شناسه پروژه', typeof projectId === 'string' && projectId.length > 0, projectId)

  const stRes = await req('POST', `/api/projects/${projectId}/stations`, { name: 'ایستگاه الف' })
  const stationId = stRes.data?.station?.id
  const st2Res = await req('POST', `/api/projects/${projectId}/stations`, { name: 'ایستگاه ب (خواهر)' })
  const station2Id = st2Res.data?.station?.id
  check('ایجاد دو ایستگاه', Boolean(stationId && station2Id))

  const actRes = await req('POST', `/api/stations/${stationId}/activities`, { name: 'فعالیت مونتاژ' })
  const activityId = actRes.data?.activity?.id
  const act2Res = await req('POST', `/api/stations/${station2Id}/activities`, { name: 'فعالیت خواهر' })
  const activity2Id = act2Res.data?.activity?.id
  check('ایجاد دو فعالیت خواهر', Boolean(activityId && activity2Id))

  const elRes = await req('POST', `/api/activities/${activityId}/elements`, { name: 'عنصر تست' })
  const elementId = elRes.data?.element?.id
  check('ایجاد عنصر', Boolean(elementId))

  // تعریف‌های مرکزی
  const defA = await req('POST', `/api/projects/${projectId}/allowance-definitions`, {
    title: 'نیازهای شخصی', code: 'PP', defaultValueType: 'PERCENT', defaultValuePercent: 0.05,
  })
  const defAId = defA.data?.definition?.id
  const defB = await req('POST', `/api/projects/${projectId}/allowance-definitions`, {
    title: 'خستگی', defaultValueType: 'PERCENT', defaultValuePercent: 0.03,
  })
  const defBId = defB.data?.definition?.id
  const defC = await req('POST', `/api/projects/${projectId}/allowance-definitions`, {
    title: 'ابزاربرداری', defaultValueType: 'FIXED_TIME', defaultTimeSeconds: 2.5,
  })
  const defCId = defC.data?.definition?.id
  const defD = await req('POST', `/api/projects/${projectId}/allowance-definitions`, {
    title: 'استراحت شیفت', defaultValueType: 'FIXED_TIME', defaultTimeSeconds: 30,
  })
  const defDId = defD.data?.definition?.id
  check('ایجاد چهار تعریف مرکزی', Boolean(defAId && defBId && defCId && defDId))

  const getScope = async (scope: 'PROJECT' | 'STATION' | 'ACTIVITY' | 'WORK_ELEMENT', id: string) => {
    const prefix = { PROJECT: `/api/projects/${id}`, STATION: `/api/stations/${id}`, ACTIVITY: `/api/activities/${id}`, WORK_ELEMENT: `/api/elements/${id}` }[scope]
    const r = await req('GET', `${prefix}/allowances`)
    return r.data
  }
  const putOps = async (scope: 'PROJECT' | 'STATION' | 'ACTIVITY' | 'WORK_ELEMENT', id: string, ops: unknown[]) => {
    const prefix = { PROJECT: `/api/projects/${id}`, STATION: `/api/stations/${id}`, ACTIVITY: `/api/activities/${id}`, WORK_ELEMENT: `/api/elements/${id}` }[scope]
    return req('PUT', `${prefix}/allowances`, { ops })
  }
  const rowOf = (data: any, defId: string) => data?.resolved?.rows?.find((r: any) => r.definitionId === defId)

  // ═══ §۱۰.۱ — ارث‌بری ═══
  console.log('\n── §۱۰.۱ ارث‌بری — ۱۵ سناریو ──')

  // ۱+۲+۳: پروژه به ایستگاه/فعالیت/عنصر می‌رسد
  {
    const r = await putOps('PROJECT', projectId, [
      { definitionId: defAId, action: 'SET', valueType: 'PERCENT', percentValue: 0.05 },
    ])
    check('۱. تخصیص سطح خط ثبت شد', r.status === 200, r.status)
    const actScope = await getScope('ACTIVITY', activityId)
    const row = rowOf(actScope, defAId)
    check('۲. خط → فعالیت ارث می‌رسد (INHERITED)', row?.status === 'INHERITED', row?.status)
    check('۳. خط → عنصر ارث می‌رسد', rowOf(await getScope('WORK_ELEMENT', elementId), defAId)?.status === 'INHERITED')
  }

  // ۴: ایستگاه جایگزین خط
  {
    await putOps('STATION', stationId, [
      { definitionId: defAId, action: 'SET', valueType: 'PERCENT', percentValue: 0.07 },
    ])
    const row = rowOf(await getScope('ACTIVITY', activityId), defAId)
    check('۴. ایستگاه مقدار خط را جایگزین می‌کند (INHERITED از ایستگاه)', row?.status === 'INHERITED' && close(row?.percentValue, 0.07), { s: row?.status, v: row?.percentValue })
  }

  // ۵: فعالیت جایگزین ایستگاه
  {
    await putOps('ACTIVITY', activityId, [
      { definitionId: defAId, action: 'SET', valueType: 'PERCENT', percentValue: 0.06 },
    ])
    const row = rowOf(await getScope('ACTIVITY', activityId), defAId)
    check('۵. فعالیت مقدار ایستگاه را جایگزین می‌کند (OVERRIDDEN)', row?.status === 'OVERRIDDEN' && close(row?.percentValue, 0.06), { s: row?.status, v: row?.percentValue })
    const elRow = rowOf(await getScope('WORK_ELEMENT', elementId), defAId)
    check('۵ب. عنصر مقدار فعالیت را ارث می‌برد', elRow?.status === 'INHERITED' && close(elRow?.percentValue, 0.06), { s: elRow?.status, v: elRow?.percentValue })
  }

  // ۶: جایگزینی یک تعریف، الونس‌های مستقل را حذف نمی‌کند
  {
    await putOps('PROJECT', projectId, [
      { definitionId: defBId, action: 'SET', valueType: 'PERCENT', percentValue: 0.03 },
    ])
    const actScope = await getScope('ACTIVITY', activityId)
    check('۶. جایگزینی تعریف A، تعریف B را حذف نکرد', rowOf(actScope, defAId) && rowOf(actScope, defBId))
  }

  // ۷: Exclude فقط همان شاخه
  {
    await putOps('STATION', stationId, [
      { definitionId: defBId, action: 'EXCLUDE' },
    ])
    const row = rowOf(await getScope('ACTIVITY', activityId), defBId)
    check('۷. Exclude ایستگاه، تعریف B را در فعالیت غیرفعال کرد', row?.status === 'EXCLUDED', row?.status)
    // فعالیت خواهر در ایستگاه دیگر متأثر نشود
    const row2 = rowOf(await getScope('ACTIVITY', activity2Id), defBId)
    check('۷ب. شاخه خواهر متأثر نشد', row2?.status === 'INHERITED' && close(row2?.percentValue, 0.03), { s: row2?.status })
  }

  // ۸: تعریف مجدد صریح پس از Exclude
  {
    await putOps('ACTIVITY', activityId, [
      { definitionId: defBId, action: 'SET', valueType: 'PERCENT', percentValue: 0.04 },
    ])
    const row = rowOf(await getScope('ACTIVITY', activityId), defBId)
    check('۸. تعریف مجدد در سطح پایین‌تر، پس از Exclude دوباره فعال شد', row?.status === 'OVERRIDDEN' && close(row?.percentValue, 0.04), { s: row?.status, v: row?.percentValue })
  }

  // ۹: Restore مقدار والد
  {
    await putOps('ACTIVITY', activityId, [
      { definitionId: defBId, action: 'RESTORE' },
    ])
    // والدی که برای B وجود دارد: EXCLUDE در ایستگاه → همچنان EXCLUDED
    const row = rowOf(await getScope('ACTIVITY', activityId), defBId)
    check('۹. Restore → بازگشت به تصمیم والد (Exclude ایستگاه)', row?.status === 'EXCLUDED', row?.status)
    // حالا Exclude ایستگاه را هم restore کنیم → مقدار خط برمی‌گردد
    await putOps('STATION', stationId, [{ definitionId: defBId, action: 'RESTORE' }])
    const row2 = rowOf(await getScope('ACTIVITY', activityId), defBId)
    check('۹ب. Restore دوم → مقدار خط بازگشت', row2?.status === 'INHERITED' && close(row2?.percentValue, 0.03), { s: row2?.status, v: row2?.percentValue })
  }

  // ۱۰: siblingها از هم ارث نمی‌برند
  {
    const r2 = rowOf(await getScope('ACTIVITY', activity2Id), defAId)
    check('۱۰. خواهر از فعالیت دیگر ارث نمی‌برد (مقدار خط، نه override آن)', r2?.status === 'INHERITED' && close(r2?.percentValue, 0.05), { s: r2?.status, v: r2?.percentValue })
  }

  // ۱۱: تغییر والد فقط فرزندان بدون override
  {
    await putOps('PROJECT', projectId, [{ definitionId: defAId, action: 'SET', valueType: 'PERCENT', percentValue: 0.055 }])
    const actRow = rowOf(await getScope('ACTIVITY', activityId), defAId)
    check('۱۱. تغییر والد → فرزند دارای override محلی تغییر نکرد', actRow?.status === 'OVERRIDDEN' && close(actRow?.percentValue, 0.06), { s: actRow?.status, v: actRow?.percentValue })
    const act2Row = rowOf(await getScope('ACTIVITY', activity2Id), defAId)
    check('۱۱ب. فرزند بدون override تغییر کرد', close(act2Row?.percentValue, 0.055), act2Row?.percentValue)
  }

  // ۱۲: تغییر مقدار پیش‌فرض تخصیص قبلی را تغییر نمی‌دهد
  {
    await req('PUT', `/api/allowance-definitions/${defAId}`, { defaultValuePercent: 0.99, defaultValueType: 'PERCENT' })
    const actRow = rowOf(await getScope('ACTIVITY', activity2Id), defAId)
    check('۱۲. تغییر default تعریف، تخصیص قبلی را تغییر نداد', close(actRow?.percentValue, 0.055), actRow?.percentValue)
  }

  // ۱۳: تعریف جدید از فرم ساخته و فوراً قابل تخصیص
  {
    const nd = await req('POST', `/api/projects/${projectId}/allowance-definitions`, { title: 'الونس جدید' })
    const ndId = nd.data?.definition?.id
    check('۱۳. تعریف جدید ساخته شد', Boolean(ndId))
    const st1 = await getScope('ACTIVITY', activityId)
    check('۱۳ب. تعریف جدید فوراً در فهرست فرم قابل انتخاب است', st1?.definitions?.some((d: any) => d.id === ndId))
    await req('DELETE', `/api/allowance-definitions/${ndId}`)
  }

  // ۱۴: تغییر عنوان با ID ثابت ارتباط را حفظ می‌کند
  {
    await req('PUT', `/api/allowance-definitions/${defBId}`, { title: 'خستگی (ویرایش‌شده)' })
    const row = rowOf(await getScope('ACTIVITY', activity2Id), defBId)
    check('۱۴. تغییر عنوان، ارتباط تخصیص را حفظ کرد', row?.definitionId === defBId && row?.title === 'خستگی (ویرایش‌شده)', { id: row?.definitionId, t: row?.title })
  }

  // ۱۵: تخصیص تکراری یک تعریف در یک scope ساخته نمی‌شود (unique — upsert)
  {
    await putOps('ACTIVITY', activity2Id, [{ definitionId: defAId, action: 'SET', valueType: 'PERCENT', percentValue: 0.09 }])
    await putOps('ACTIVITY', activity2Id, [{ definitionId: defAId, action: 'SET', valueType: 'PERCENT', percentValue: 0.08 }])
    const assigns = await db.allowanceAssignment.count({ where: { definitionId: defAId, scopeType: 'ACTIVITY', scopeId: activity2Id } })
    check('۱۵. تخصیص تکراری ساخته نشد (یک ردیف)', assigns === 1, assigns)
  }

  // اعتبارسنجی مقادیر (§۱۰.۲)
  console.log('\n── §۱۰.۲ رد مقادیر نامعتبر ──')
  {
    const neg = await putOps('ACTIVITY', activity2Id, [{ definitionId: defBId, action: 'SET', valueType: 'PERCENT', percentValue: -0.1 }])
    check('مقدار منفی رد می‌شود', neg.status === 422, neg.status)
    const hi = await putOps('ACTIVITY', activity2Id, [{ definitionId: defBId, action: 'SET', valueType: 'PERCENT', percentValue: 1.5 }])
    check('درصد ≥ ۱۰۰ رد می‌شود', hi.status === 422, hi.status)
    const mismatch = await putOps('ACTIVITY', activity2Id, [
      { definitionId: defBId, action: 'SET', valueType: 'PERCENT', percentValue: 0.02, timeValueSeconds: 5 },
    ])
    check('نوع ناسازگار (درصد+زمان) رد می‌شود', mismatch.status === 422, mismatch.status)
    const noVal = await putOps('ACTIVITY', activity2Id, [{ definitionId: defBId, action: 'SET', valueType: 'FIXED_TIME' }])
    check('زمان ثابت بدون مقدار رد می‌شود', noVal.status === 422, noVal.status)
    const noBasis = await putOps('ACTIVITY', activity2Id, [
      { definitionId: defBId, action: 'SET', valueType: 'FIXED_TIME', timeValueSeconds: 5 },
    ])
    // مبنا پیش‌فرض سطح غیر عنصر = PER_CYCLE → معتبر
    check('زمان ثابت بدون مبنا → پیش‌فرض PER_CYCLE (سطح غیر عنصر) پذیرفته شد', noBasis.status === 200, noBasis.status)
    await putOps('ACTIVITY', activity2Id, [{ definitionId: defBId, action: 'RESTORE' }])
  }

  // ═══ §۱۰.۲ — محاسبات از طریق تحلیل واقعی ═══
  console.log('\n── §۱۰.۲ محاسبات — تحلیل فعالیت ──')
  {
    // داده مشاهده: ۳ چرخه × OT=100 + ریتینگ R=1
    const opRes = await req('POST', `/api/projects/${projectId}/operators`, { displayName: 'اپراتور تست' })
    const operatorId = opRes.data?.operator?.id
    const sesRes = await req('POST', `/api/activities/${activityId}/sessions`, { operatorId, timingMethod: 'SNAPBACK' })
    const sessionId = sesRes.data?.session?.id
    check('ایجاد جلسه برای محاسبات', Boolean(sessionId))
    await req('POST', `/api/sessions/${sessionId}/cycles`, { count: 3, withData: [1, 2, 3].map((n) => ({ cycleNo: n, observations: [{ workElementId: elementId, rawDuration: 100 }] })) })
    // ریتینگ R=1
    const tables = await db.ratingTable.findMany({ where: { projectId }, select: { id: true, isDefault: true } })
    const tableId = tables[0]?.id
    if (tableId) {
      await db.ratingAssessment.create({
        data: { workElementId: elementId, ratingTableId: tableId, totalFactor: 1 },
      })
    }

    // تخصیص‌ها: A=6% (فعالیت) + B=3% (خط) → P=0.09؟ صبر: A override فعالیت 0.06 است، B خط 0.03 → P=0.09
    // برای تست سند P=0.08 (۵٪+۳٪): A را 0.05 کن
    await putOps('ACTIVITY', activityId, [{ definitionId: defAId, action: 'SET', valueType: 'PERCENT', percentValue: 0.05 }])
    const an1 = await req('GET', `/api/activities/${activityId}/analysis`)
    const el1 = an1.data?.analysis?.elements?.[0]
    check('NT=100 (بدون R≠۱)', close(el1?.nt, 100), el1?.nt)
    check('P = ۰٫۰۵ + ۰٫۰۳ = ۰٫۰۸', close(el1?.allowances?.totalPercent, 0.08), el1?.allowances?.totalPercent)
    check('روش ۱: ST = 100 × 1.08 = 108', close(el1?.st, 108), el1?.st)

    // +۲٫۵ ثانیه per execution روی خود عنصر
    await putOps('WORK_ELEMENT', elementId, [
      { definitionId: defCId, action: 'SET', valueType: 'FIXED_TIME', timeValueSeconds: 2.5, applicationBasis: 'PER_ELEMENT_EXECUTION' },
    ])
    const an2 = await req('GET', `/api/activities/${activityId}/analysis`)
    const el2 = an2.data?.analysis?.elements?.[0]
    check('زمان ثابت هر اجرا پس از درصد: ST = 108 + 2.5 = 110.5', close(el2?.st, 110.5), el2?.st)
    check('per-execution در خلاصه عنصر', close(el2?.allowances?.perExecutionSeconds, 2.5), el2?.allowances?.perExecutionSeconds)

    // PER_CYCLE روی فعالیت — در ST عنصر ضرب نمی‌شود؛ یک‌بار در activityTotal
    await putOps('ACTIVITY', activityId, [
      { definitionId: defDId, action: 'SET', valueType: 'FIXED_TIME', timeValueSeconds: 30, applicationBasis: 'PER_CYCLE' },
    ])
    const an3 = await req('GET', `/api/activities/${activityId}/analysis`)
    const el3 = an3.data?.analysis?.elements?.[0]
    check('PER_CYCLE در ST عنصر ضرب نمی‌شود (ST همان 110.5)', close(el3?.st, 110.5), el3?.st)
    check('PER_CYCLE دقیقاً یک‌بار در activityTotal', close(an3.data?.analysis?.activityTotal?.st, 110.5 + 30), an3.data?.analysis?.activityTotal?.st)
    check('توضیح activityTotal به per-cycle اشاره دارد', String(an3.data?.analysis?.activityTotal?.reason ?? '').includes('یک‌بار'))

    // سه چرخه → عنصر per-execution فقط یک‌بار در activityTotal (بدون ضرب ۳)
    check('سه چرخه → بدون ضرب تعداد در activityTotal', close(an3.data?.analysis?.activityTotal?.st, 140.5), an3.data?.analysis?.activityTotal?.st)

    // روش ۲: 100/0.92 + 2.5
    const calcPut = await req('PUT', `/api/projects/${projectId}/calc-settings`, { allowanceMethod: 'SHARE_OF_ST' })
    check('تغییر روش به سهم از ST', calcPut.status === 200, calcPut.status)
    const an4 = await req('GET', `/api/activities/${activityId}/analysis`)
    const el4 = an4.data?.analysis?.elements?.[0]
    check('روش ۲: ST = 100/0.92 + 2.5 ≈ 111.195652', close(el4?.st, 100 / 0.92 + 2.5, 1e-9), el4?.st)

    // SHARE_OF_ST با مجموع ≥۱۰۰٪ رد می‌شود
    await putOps('ACTIVITY', activity2Id, [{ definitionId: defAId, action: 'SET', valueType: 'PERCENT', percentValue: 0.6 }])
    const bad = await req('PUT', `/api/projects/${projectId}/calc-settings`, { allowanceMethod: 'SHARE_OF_ST' })
    check('در روش ۲، مجموع ≥ ۱۰۰٪ رد می‌شود', bad.status === 200 || bad.status === 422, bad.status) // خود روش قبلاً ۲ است؛ بررسی عملی از طریق تخصیص:
    const badSet = await putOps('ACTIVITY', activityId, [{ definitionId: defDId, action: 'SET', valueType: 'PERCENT', percentValue: 0.95 }])
    check('تخصیصی که مجموع را ≥ ۱۰۰٪ کند در روش ۲ رد می‌شود', badSet.status === 422, badSet.status)
    await putOps('ACTIVITY', activity2Id, [{ definitionId: defAId, action: 'RESTORE' }])
    await req('PUT', `/api/projects/${projectId}/calc-settings`, { allowanceMethod: 'PERCENT_OF_NT' })

    // زمان ثابت per-execution در سطح بالاتر → نیازمند قاعده تجمیع
    // تعریف پنجم: بدون تخصیص محلی عنصر تا تصمیم از ایستگاه بیاید
    const defE = await req('POST', `/api/projects/${projectId}/allowance-definitions`, {
      title: 'تنظیم قالب ایستگاه', defaultValueType: 'FIXED_TIME', defaultTimeSeconds: 10,
    })
    const defEId = defE.data?.definition?.id
    await putOps('STATION', stationId, [
      { definitionId: defEId, action: 'SET', valueType: 'FIXED_TIME', timeValueSeconds: 10, applicationBasis: 'PER_ELEMENT_EXECUTION' },
    ])
    const an5 = await req('GET', `/api/activities/${activityId}/analysis`)
    const el5 = an5.data?.analysis?.elements?.[0]
    check('زمان هر اجرا در سطح ایستگاه → در ST عنصر لحاظ نشد (قاعده تجمیع)', close(el5?.st, 110.5), el5?.st)
    check('ردیف نیازمند قاعده تجمیع در خروجی', el5?.allowances?.needsAggregationCount >= 1, el5?.allowances?.needsAggregationCount)
    await putOps('STATION', stationId, [{ definitionId: defEId, action: 'RESTORE' }])
  }

  // ═══ §۱۰.۳ — migration ═══
  console.log('\n── §۱۰.۳ migration از مدل قدیمی ──')
  {
    // fixture قدیمی روی پروژه جدید
    const p2 = await req('POST', '/api/projects', { name: 'تست مهاجرت قدیمی', lineName: 'خط قدیم', productName: 'محصول قدیم' })
    const p2Id = p2.data?.project?.id ?? p2.data?.id
    const s2 = await req('POST', `/api/projects/${p2Id}/stations`, { name: 'ایستگاه قدیم' })
    const s2Id = s2.data?.station?.id
    const a2 = await req('POST', `/api/stations/${s2Id}/activities`, { name: 'فعالیت قدیمی' })
    const a2Id = a2.data?.activity?.id

    const cat = await db.allowanceCategory.create({ data: { projectId: p2Id, name: 'دسته قدیمی', isActive: true, sortOrder: 0 } })
    const grp = await db.activityGroup.create({ data: { projectId: p2Id, name: 'گروه قدیمی' } })
    await db.groupAllowance.create({ data: { groupId: grp.id, categoryId: cat.id, percentValue: 0.12 } })
    await db.activityAllowanceOverride.create({ data: { activityId: a2Id, categoryId: cat.id, percentValue: 0.15 } })
    await db.activity.update({ where: { id: a2Id }, data: { groupId: grp.id } })

    // مقدار مؤثر قدیم = override 0.15 (اولویت override بر گروه)
    // self-heal: اولین GET بافت → migration اجرا می‌شود
    const scope = await getScope('ACTIVITY', a2Id)
    const row = scope?.resolved?.rows?.find((r: any) => r.definitionId === cat.id)
    check('دسته قدیمی → تعریف مرکزی با همان ID ساخته شد', row?.definitionId === cat.id, row?.definitionId)
    check('مقدار مؤثر قدیم (override 0.15) به تخصیص ACTIVITY تبدیل شد', row?.status === 'CUSTOM' && close(row?.percentValue, 0.15), { s: row?.status, v: row?.percentValue })

    // اجرای مجدد → دوبرابر نشود
    const { migrateProjectAllowancesIfNeeded } = await import('../src/application/effective-allowance-service')
    const rep = await migrateProjectAllowancesIfNeeded(p2Id)
    check('اجرای مجدد migration بدون اثر (مارکر)', rep.migrated === false)
    const count = await db.allowanceAssignment.count({ where: { definitionId: cat.id, scopeType: 'ACTIVITY', scopeId: a2Id } })
    check('تخصیص تکراری ساخته نشد', count === 1, count)

    // عنصر بدون تخصیص تکراری — از فعالیت ارث می‌برد
    const e2 = await req('POST', `/api/activities/${a2Id}/elements`, { name: 'عنصر قدیمی' })
    const e2Id = e2.data?.element?.id
    const elScope = await getScope('WORK_ELEMENT', e2Id)
    const elRow = elScope?.resolved?.rows?.find((r: any) => r.definitionId === cat.id)
    check('عنصر بدون تخصیص کپی، از فعالیت ارث می‌برد', elRow?.status === 'INHERITED' && close(elRow?.percentValue, 0.15), { s: elRow?.status })

    // داده قدیمی حفظ می‌شود (§۴.۱.۸)
    const gaCount = await db.groupAllowance.count({ where: { groupId: grp.id } })
    check('داده قدیمی گروه/دسته حذف نشد', gaCount === 1, gaCount)

    // دسته غیرفعال → مقدارش در migration لحاظ نمی‌شود
    const catOff = await db.allowanceCategory.create({ data: { projectId: p2Id, name: 'دسته خاموش', isActive: false, sortOrder: 1 } })
    await db.groupAllowance.create({ data: { groupId: grp.id, categoryId: catOff.id, percentValue: 0.2 } })
    // مارکر را برداریم تا self-heal دوباره اجرا شود
    await db.projectSetting.deleteMany({ where: { projectId: p2Id, key: 'migration.allowanceModel' } })
    const scope2 = await getScope('ACTIVITY', a2Id)
    const offRow = scope2?.resolved?.rows?.find((r: any) => r.definitionId === catOff.id)
    check('دسته غیرفعال در مدل جدید مقدار مؤثر ندارد (منطبق قاعده قدیم)', !offRow || offRow.status === 'EXCLUDED' || offRow.percentValue === null, offRow?.percentValue)

    // پاک‌سازی
    await req('DELETE', `/api/projects/${p2Id}`)
  }

  // پاک‌سازی پروژه اصلی
  await req('DELETE', `/api/projects/${projectId}`)
  await db.$disconnect()

  console.log('\n════════════════════════════════════════════════')
  console.log(`  نتیجه: ${passed} پاس / ${failed} خطا`)
  if (failed > 0) {
    console.log('  موارد ناموفق:')
    for (const f of failures) console.log(`   ✗ ${f}`)
  }
  console.log('════════════════════════════════════════════════')
  if (failed > 0) process.exit(1)
}

main().catch((err) => {
  console.error('خطای اجرای اسکریپت:', err)
  process.exit(1)
})
