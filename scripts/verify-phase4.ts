// ═══════════════════════════════════════════════════════════
// اسکریپت تأیید فاز ۴ — کیفیت داده و موتور محاسبات
// اجرا:  bun scripts/verify-phase4.ts
// آزمون‌های اجباری PRD ۸.۳:
//   B1) وستینگهاوس: OT=8.30 و R=1.09 → NT=9.047
//   B2) NT=9.047 و A=0.15 → روش ۱: 10.40405 / روش ۲: ≈10.643529
//   B5) دادهٔ خارج‌شده: خام حفظ + خارج از میانگین
//   B7) تغییر پارامتر: Snapshot قبلی حفظ + وضعیت STALE
// به‌علاوه: آمار FR-17، تشخیص غیرعادی FR-18، مقایسهٔ اپراتور FR-19،
// تجمیع ۱۰.۱، هم‌پوشانی FR-16 و پیشرفت نمونه FR-12
// ═══════════════════════════════════════════════════════════
export {}

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

function approx(a: number | null | undefined, b: number, tol = 1e-9) {
  return a !== null && a !== undefined && Math.abs(a - b) <= tol
}

async function api(method: string, path: string, body?: unknown) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'content-type': 'application/json' },
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
  console.log('\n═══════ فاز ۴: آزمون‌های اجباری کیفیت داده و موتور محاسبات (PRD ۸.۳ / FR-12…19،27) ═══════')

  // ── C0) آماده‌سازی ──
  console.log('\nC0) آماده‌سازی پروژه آزمون')
  const pr = await api('POST', '/api/projects', {
    name: 'پروژه آزمون فاز ۴ (خودکار)',
    lineName: 'خط آزمون فاز ۴',
    productName: 'محصول آزمون',
    studyDate: '2026-11-05',
  })
  check('ایجاد پروژه', pr.status === 201, pr.status, 201)
  const PID = pr.data?.project?.id
  const st = await api('POST', `/api/projects/${PID}/stations`, { name: 'ایستگاه مونتاژ' })
  const SID = st.data?.station?.id
  const op1 = (await api('POST', `/api/projects/${PID}/operators`, { displayName: 'اپراتور الف', code: 'A-01' })).data?.operator?.id
  const op2 = (await api('POST', `/api/projects/${PID}/operators`, { displayName: 'اپراتور ب', code: 'B-02' })).data?.operator?.id
  check('ایستگاه و اپراتورها', Boolean(SID && op1 && op2))

  // الونس ۱۵٪ — مدل سلسله‌مراتبی (جلسه اول): تعریف مرکزی + تخصیص سطح خط
  const def15 = (await api('POST', `/api/projects/${PID}/allowance-definitions`, {
    title: 'استراحت و نیازهای شخصی', defaultValueType: 'PERCENT', defaultValuePercent: 0.15,
  })).data?.definition?.id
  const grp = (await api('POST', `/api/projects/${PID}/groups`, { name: 'کار دستی' })).data?.group?.id
  await api('PUT', `/api/projects/${PID}/allowances`, {
    ops: [{ definitionId: def15, action: 'SET', valueType: 'PERCENT', percentValue: 0.15 }],
  })

  // جدول وستینگهاوس پیش‌فرض پروژه
  const tables = await api('GET', `/api/projects/${PID}/rating-tables`)
  const RT = tables.data?.items?.[0]?.id
  check('جدول وستینگهاوس Seed موجود است', Boolean(RT))

  // ═══════════ B1 — زمان نرمال ═══════════
  console.log('\nB1) وستینگهاوس: OT=8.30 و R=1.09 → NT=9.047 — FR-13/14')
  const acA = await api('POST', `/api/stations/${SID}/activities`, {
    name: 'فعالیت مونتاژ اصلی',
    targetSampleCount: 3,
    groupId: grp,
  })
  const AID_A = acA.data?.activity?.id
  const elA = (await api('POST', `/api/activities/${AID_A}/elements`, { name: 'مونتاژ قطعه', elementType: 'MANUAL' })).data?.element?.id

  // ارزیابی: Skill=C1(+0.06) Effort=C2(+0.02) Conditions=D(0) Consistency=C(+0.01) → R=1.09
  const rating = await api('PUT', `/api/elements/${elA}/rating`, {
    ratingTableId: RT,
    skillGrade: 'C1',
    effortGrade: 'C2',
    conditionsGrade: 'D',
    consistencyGrade: 'C',
  })
  check('ثبت ارزیابی 200', rating.status === 200, rating.status)
  check('R = 1 + 0.06 + 0.02 + 0 + 0.01 = 1.09', approx(rating.data?.assessment?.totalFactor, 1.09), rating.data?.assessment?.totalFactor, 1.09)

  const seA = await api('POST', `/api/activities/${AID_A}/sessions`, { operatorId: op1, timingMethod: 'SNAPBACK' })
  const SSA = seA.data?.session?.id
  const cyA = await api('POST', `/api/sessions/${SSA}/cycles`, { count: 3 })
  const cA = cyA.data?.created as { id: string }[]
  for (let i = 0; i < 3; i++) {
    await api('PUT', `/api/cycles/${cA[i].id}/cells`, { cells: [{ workElementId: elA, rawDuration: 8.3 }] })
  }

  let an = (await api('GET', `/api/activities/${AID_A}/analysis`)).data?.analysis
  let elAdto = an?.elements?.[0]
  check('OT = میانگین ۳ مشاهدۀ 8.30 = 8.30', approx(elAdto?.ot, 8.3), elAdto?.ot, 8.3)
  check('NT = 8.30 × 1.09 = 9.047', approx(elAdto?.nt, 9.047), elAdto?.nt, 9.047)
  check('پیشرفت نمونه: ۳ از ۳ → رسیده به هدف', an?.sampleProgress?.reached === true, an?.sampleProgress?.reached, true)

  // ═══════════ B2 — دو مبنای مجاز ═══════════
  console.log('\nB2) مجازها: NT=9.047 و A=0.15 — FR-15')
  an = (await api('GET', `/api/activities/${AID_A}/analysis`)).data?.analysis
  elAdto = an?.elements?.[0]
  check('مجموع مجاز مؤثر A = 0.15', approx(an?.allowances?.summary?.totalPercent, 0.15), an?.allowances?.summary?.totalPercent, 0.15)
  check('روش ۱ (پیش‌فرض): ST = 9.047 × 1.15 = 10.40405', approx(elAdto?.st, 10.40405), elAdto?.st, 10.40405)
  check('منبع مجاز: ارث از خط تولید', an?.allowances?.rows?.[0]?.status === 'INHERITED' && an?.allowances?.rows?.[0]?.sourceScopeType === 'PROJECT', an?.allowances?.rows?.[0]?.status, 'INHERITED')

  const sw2 = await api('PUT', `/api/projects/${PID}/calc-settings`, { allowanceMethod: 'SHARE_OF_ST' })
  check('تغییر روش به سهم از زمان استاندارد', sw2.status === 200, sw2.status)
  an = (await api('GET', `/api/activities/${AID_A}/analysis`)).data?.analysis
  elAdto = an?.elements?.[0]
  check('روش ۲: ST = 9.047 / 0.85 ≈ 10.643529', approx(elAdto?.st, 10.643529, 1e-6), elAdto?.st, 10.643529)
  check('فرمول نمایشی روش ۲', an?.settings?.formula === 'ST = NT / (1 − A)', an?.settings?.formula)

  const swBack = await api('PUT', `/api/projects/${PID}/calc-settings`, { allowanceMethod: 'PERCENT_OF_NT' })
  check('بازگشت به روش ۱', swBack.status === 200, swBack.status)

  // ═══════════ B7 — Snapshot و نیاز به محاسبه مجدد ═══════════
  console.log('\nB7) Snapshot نسخه‌دار: تغییر پارامتر → حفظ نسخهٔ قبلی + STALE — FR-27')
  const run1 = await api('POST', `/api/projects/${PID}/calculations/run`)
  check('اجرای محاسبه 201', run1.status === 201, run1.status, 201)
  const run1Id = run1.data?.run?.id
  const run1St = run1.data?.run?.result?.activities?.find((a: any) => a.id === AID_A)?.elements?.[0]?.st
  check('نتیجهٔ Snapshot شامل ST عنصر = 10.40405', approx(run1St, 10.40405), run1St, 10.40405)

  let latest = (await api('GET', `/api/projects/${PID}/calculations/latest`)).data
  check('وضعیت اجرای اخیر: به‌روز (DONE)', latest?.run?.status === 'DONE' && latest?.needsRecalc === false, latest?.run?.status)

  // تغییر پارامتر محاسباتی → STALE + حفظ نتیجه
  await api('PUT', `/api/projects/${PID}/calc-settings`, { allowanceMethod: 'SHARE_OF_ST' })
  latest = (await api('GET', `/api/projects/${PID}/calculations/latest`)).data
  check('پس از تغییر پارامتر: نیازمند محاسبهٔ مجدد (STALE)', latest?.needsRecalc === true && latest?.run?.status === 'STALE', latest?.run?.status)
  const preservedSt = (latest?.run?.result as any)?.activities?.find((a: any) => a.id === AID_A)?.elements?.[0]?.st
  check('Snapshot قبلی حفظ شده (ST=10.40405 در نتیجهٔ قدیمی)', approx(preservedSt, 10.40405), preservedSt, 10.40405)
  check('شناسهٔ اجرای قبلی تغییر نکرده', latest?.run?.id === run1Id)

  // تغییر دادهٔ خام نیز STALE می‌کند
  const run2 = await api('POST', `/api/projects/${PID}/calculations/run`)
  check('اجرای مجدد محاسبه (نسخهٔ ۲)', run2.status === 201)
  await api('PUT', `/api/cycles/${cA[0].id}/cells`, { cells: [{ workElementId: elA, rawDuration: 8.31 }] })
  latest = (await api('GET', `/api/projects/${PID}/calculations/latest`)).data
  check('تغییر دادهٔ خام هم STALE می‌کند', latest?.needsRecalc === true, latest?.needsRecalc)
  await api('PUT', `/api/cycles/${cA[0].id}/cells`, { cells: [{ workElementId: elA, rawDuration: 8.3 }] })
  await api('PUT', `/api/projects/${PID}/calc-settings`, { allowanceMethod: 'PERCENT_OF_NT' })

  // ═══════════ آمار توصیفی — FR-17 ═══════════
  console.log('\nS1) آمار توصیفی عنصر — FR-17')
  const acB = await api('POST', `/api/stations/${SID}/activities`, { name: 'فعالیت بسته‌بندی', targetSampleCount: 10 })
  const AID_B = acB.data?.activity?.id
  const el1 = (await api('POST', `/api/activities/${AID_B}/elements`, { name: 'بسته‌بندی', elementType: 'MANUAL' })).data?.element?.id
  const el2 = (await api('POST', `/api/activities/${AID_B}/elements`, { name: 'انتظار خشک‌شدن', elementType: 'WAITING' })).data?.element?.id
  const el3 = (await api('POST', `/api/activities/${AID_B}/elements`, { name: 'کنترل کیفیت', elementType: 'MANUAL' })).data?.element?.id
  await api('PUT', `/api/elements/${el1}/rating`, { ratingTableId: RT, skillGrade: 'C1', effortGrade: 'C2', conditionsGrade: 'D', consistencyGrade: 'C' })
  await api('PUT', `/api/elements/${el3}/rating`, { ratingTableId: RT, skillGrade: 'C1', effortGrade: 'C2', conditionsGrade: 'D', consistencyGrade: 'C' })

  const seB1 = await api('POST', `/api/activities/${AID_B}/sessions`, { operatorId: op1, timingMethod: 'SNAPBACK' })
  const SSB1 = seB1.data?.session?.id
  const vals1 = [10, 10.2, 9.8, 10.1, 9.9]
  const cyB = (await api('POST', `/api/sessions/${SSB1}/cycles`, { count: 5 })).data?.created as { id: string }[]
  for (let i = 0; i < 5; i++) {
    await api('PUT', `/api/cycles/${cyB[i].id}/cells`, {
      cells: [
        { workElementId: el1, rawDuration: vals1[i] },
        { workElementId: el3, rawDuration: vals1[i] },
      ],
    })
  }
  // عنصر تک‌مشاهده‌ای — SD/واریانس «قابل محاسبه نیست»
  const cyWait = (await api('POST', `/api/sessions/${SSB1}/cycles`, { count: 1 })).data?.created as { id: string }[]
  await api('PUT', `/api/cycles/${cyWait[0].id}/cells`, { cells: [{ workElementId: el2, rawDuration: 5 }] })

  an = (await api('GET', `/api/activities/${AID_B}/analysis`)).data?.analysis
  const el1dto = an?.elements?.find((e: any) => e.id === el1)
  const el2dto = an?.elements?.find((e: any) => e.id === el2)
  const s = el1dto?.stats
  check('میانگین = 10', approx(s?.mean, 10), s?.mean, 10)
  check('میانه = 10', approx(s?.median, 10), s?.median, 10)
  check('کمینه/بیشینه/دامنه = 9.8 / 10.2 / 0.4', approx(s?.min, 9.8) && approx(s?.max, 10.2) && approx(s?.range, 0.4), `${s?.min}…${s?.max}`)
  check('انحراف معیار نمونه = √0.025 ≈ 0.15811', approx(s?.sampleSD, Math.sqrt(0.025), 1e-5), s?.sampleSD, 0.15811)
  check('واریانس نمونه = 0.025', approx(s?.sampleVariance, 0.025, 1e-9), s?.sampleVariance, 0.025)
  check('CV ≈ 1.5811٪', approx(s?.cvPercent, (Math.sqrt(0.025) / 10) * 100, 1e-4), s?.cvPercent, 1.5811)
  check('چارک ۱ / ۳ و IQR = 9.9 / 10.1 / 0.2', approx(s?.q1, 9.9) && approx(s?.q3, 10.1) && approx(s?.iqr, 0.2), `${s?.q1} / ${s?.q3}`)
  check('بازهٔ اطمینان ۹۵٪ ≈ [9.8037، 10.1963] (t)', approx(s?.ci95?.lower, 10 - 2.776 * Math.sqrt(0.025) / Math.sqrt(5), 1e-3) && approx(s?.ci95?.upper, 10 + 2.776 * Math.sqrt(0.025) / Math.sqrt(5), 1e-3), s?.ci95)
  check('عنصر تک‌مشاهده‌ای: SD = null (نه صفر)', el2dto?.stats?.sampleSD === null, el2dto?.stats?.sampleSD, null)
  check('عنصر تک‌مشاهده‌ای: CV = null', el2dto?.stats?.cvPercent === null, el2dto?.stats?.cvPercent, null)
  check('عنصر تک‌مشاهده‌ای: بازهٔ اطمینان = null', el2dto?.stats?.ci95 === null, el2dto?.stats?.ci95, null)
  check('هیستوگرام ساخته می‌شود', (el1dto?.histogram?.length ?? 0) >= 4, el1dto?.histogram?.length)
  check('روند ۵ نقطه دارد', el1dto?.trend?.length === 5, el1dto?.trend?.length, 5)
  check('هدف نمونه ۱۰ → هنوز رسیده نشده (FR-12)', an?.sampleProgress?.reached === false, an?.sampleProgress?.reached, false)
  check('پیام هشدار کمرجوع هدف شامل «باقی مانده» است', String(an?.sampleProgress?.message ?? '').includes('باقی مانده'))

  // ═══════════ تجمیع و مقایسهٔ اپراتورها — ۱۰.۱ / FR-19 ═══════════
  console.log('\nO1) تجمیع چند اپراتور و مقایسه — FR-19 / ۱۰.۱')
  const seB2 = await api('POST', `/api/activities/${AID_B}/sessions`, { operatorId: op2, timingMethod: 'SNAPBACK' })
  const SSB2 = seB2.data?.session?.id
  const cyB2 = (await api('POST', `/api/sessions/${SSB2}/cycles`, { count: 2 })).data?.created as { id: string }[]
  await api('PUT', `/api/cycles/${cyB2[0].id}/cells`, { cells: [{ workElementId: el1, rawDuration: 12 }] })
  await api('PUT', `/api/cycles/${cyB2[1].id}/cells`, { cells: [{ workElementId: el1, rawDuration: 12.4 }] })

  an = (await api('GET', `/api/activities/${AID_B}/analysis`)).data?.analysis
  const el1d = an?.elements?.find((e: any) => e.id === el1)
  check('میانگین وزنی (پیش‌فرض): 74.4/7 ≈ 10.628571', approx(el1d?.ot, 74.4 / 7, 1e-9), el1d?.ot, 10.628571)
  const ops = el1d?.operators ?? []
  check('دو اپراتور در مقایسه', ops.length === 2, ops.length, 2)
  const opA = ops.find((o: any) => o.operatorName === 'اپراتور الف')
  const opB = ops.find((o: any) => o.operatorName === 'اپراتور ب')
  check('میانگین اپراتور الف = 10', approx(opA?.mean, 10), opA?.mean, 10)
  check('میانگین اپراتور ب = 12.2', approx(opB?.mean, 12.2), opB?.mean, 12.2)
  check('R مشترک عنصر در هر دو اپراتور = 1.09', approx(opA?.nt, 10 * 1.09) && approx(opB?.nt, 12.2 * 1.09), `${opA?.nt} / ${opB?.nt}`)

  await api('PUT', `/api/projects/${PID}/calc-settings`, { aggregationMethod: 'EQUAL_OPERATOR_MEAN' })
  an = (await api('GET', `/api/activities/${AID_B}/analysis`)).data?.analysis
  check('میانگین اپراتورها با وزن برابر: (10+12.2)/2 = 11.1', approx(an?.elements?.find((e: any) => e.id === el1)?.ot, 11.1), an?.elements?.find((e: any) => e.id === el1)?.ot, 11.1)
  await api('PUT', `/api/projects/${PID}/calc-settings`, { aggregationMethod: 'WEIGHTED_BY_COUNT' })

  // ═══════════ تشخیص غیرعادی — FR-18 ═══════════
  console.log('\nW1) تشخیص دادهٔ غیرعادی: مقدار 35 در مجموعهٔ [9.8…10.2] — FR-18')
  const cyOut = (await api('POST', `/api/sessions/${SSB1}/cycles`, { count: 1 })).data?.created as { id: string }[]
  await api('PUT', `/api/cycles/${cyOut[0].id}/cells`, { cells: [{ workElementId: el3, rawDuration: 35 }] })

  an = (await api('GET', `/api/activities/${AID_B}/analysis`)).data?.analysis
  const el3d = an?.elements?.find((e: any) => e.id === el3)
  check('مقدار 35 علامت‌گذاری شد (SUSPECT)', el3d?.counts?.suspect === 1, el3d?.counts?.suspect, 1)
  check('هشدار ≠ حذف: در مبنای محاسبات باقی است (6)', el3d?.counts?.calcBasis === 6, el3d?.counts?.calcBasis, 6)
  const suspect = an?.suspects?.find((x: any) => x.value === 35)
  check('فهرست مشکوک‌ها: مقدار/عنصر/چرخه/اپراتور', Boolean(suspect && suspect.elementName === 'کنترل کیفیت' && suspect.cycleNo === 7 && suspect.operatorName === 'اپراتور الف'), suspect)
  check('قاعدهٔ هشدار: امتیاز Z تعدیل‌شده', suspect?.rule === 'MODIFIED_Z_MAD', suspect?.rule, 'MODIFIED_Z_MAD')
  check('امتیاز هشدار ثبت شد (≈112)', suspect?.score !== null && suspect?.score > 100, suspect?.score)
  const sheet1 = (await api('GET', `/api/sessions/${SSB1}`)).data?.sheet
  const rawObs = sheet1?.cycles?.find((c: any) => c.cycleNo === 7)?.observations?.find((o: any) => o.workElementId === el3)
  check('دادهٔ خام 35 در برگه حفظ شده (SUSPECT)', rawObs?.rawDuration === 35 && rawObs?.validityStatus === 'SUSPECT', rawObs?.validityStatus)

  // ═══════════ B5 — خروج از محاسبه با حفظ خام ═══════════
  console.log('\nB5) خروج مشاهده از محاسبه: خام حفظ + خارج از میانگین — FR-11')
  const before5 = (await api('GET', `/api/activities/${AID_B}/analysis`)).data?.analysis
  const otBefore = before5?.elements?.find((e: any) => e.id === el3)?.ot // شامل 35
  const exc = await api('PUT', `/api/observations/${suspect.observationId}/validity`, {
    validityStatus: 'EXCLUDED',
    exclusionReason: 'اختلال نوار نقاله در حین ثبت',
  })
  check('خروج با دلیل 200', exc.status === 200, exc.status)

  an = (await api('GET', `/api/activities/${AID_B}/analysis`)).data?.analysis
  const el3x = an?.elements?.find((e: any) => e.id === el3)
  check('خارج‌شده از مبنای محاسبات (5)', el3x?.counts?.calcBasis === 5 && el3x?.counts?.excluded === 1, `${el3x?.counts?.calcBasis}/${el3x?.counts?.excluded}`)
  check('OT بدون 35 → میانگین 10', approx(el3x?.ot, 10), el3x?.ot, 10)
  check('OT قبلی شامل 35 بود (≠ 10)', !approx(otBefore, 10, 1e-9), otBefore)
  const sheet2 = (await api('GET', `/api/sessions/${SSB1}`)).data?.sheet
  const rawObs2 = sheet2?.cycles?.find((c: any) => c.cycleNo === 7)?.observations?.find((o: any) => o.workElementId === el3)
  check('دادهٔ خام 35 همچنان در برگه است (EXCLUDED)', rawObs2?.rawDuration === 35 && rawObs2?.validityStatus === 'EXCLUDED', rawObs2?.validityStatus)

  // بازگشت به محاسبات → چون هنوز پرت است دوباره SUSPECT می‌شود
  const back = await api('PUT', `/api/observations/${suspect.observationId}/validity`, { validityStatus: 'VALID' })
  check('بازگشت به محاسبات 200', back.status === 200, back.status)
  an = (await api('GET', `/api/activities/${AID_B}/analysis`)).data?.analysis
  const el3r = an?.elements?.find((e: any) => e.id === el3)
  check('بازگشت: همچنان پرت → دوباره SUSPECT (تصمیم شفاف)', el3r?.counts?.suspect === 1 && el3r?.counts?.calcBasis === 6, `${el3r?.counts?.suspect}/${el3r?.counts?.calcBasis}`)

  // ═══════════ FR-16 — استاندارد کل فعالیت هم‌پوشان ═══════════
  console.log('\nF16) فعالیت هم‌پوشان: استاندارد کل = نیازمند قاعدهٔ تجمیع — FR-16 / ۱۰.۳')
  const acC = await api('POST', `/api/stations/${SID}/activities`, { name: 'فعالیت هم‌پوشان', targetSampleCount: 2 })
  const AID_C = acC.data?.activity?.id
  const ec1 = (await api('POST', `/api/activities/${AID_C}/elements`, { name: 'بارگذاری دستی', elementType: 'MANUAL' })).data?.element?.id
  const ec2 = (await api('POST', `/api/activities/${AID_C}/elements`, { name: 'کار خودکار ماشین', elementType: 'MACHINE' })).data?.element?.id
  const seC = await api('POST', `/api/activities/${AID_C}/sessions`, { operatorId: op1, timingMethod: 'SNAPBACK' })
  const cyC = (await api('POST', `/api/sessions/${seC.data?.session?.id}/cycles`, { count: 1 })).data?.created as { id: string }[]
  await api('PUT', `/api/cycles/${cyC[0].id}/cells`, {
    cells: [
      { workElementId: ec1, startOffset: 0, endOffset: 8 },
      { workElementId: ec2, startOffset: 5, endOffset: 25 },
    ],
  })

  an = (await api('GET', `/api/activities/${AID_C}/analysis`)).data?.analysis
  check('وضعیت کل فعالیت: نیازمند قاعدهٔ تجمیع', an?.activityTotal?.status === 'NEEDS_AGGREGATION_RULE', an?.activityTotal?.status)
  check('ST کل گزارش نمی‌شود (null)', an?.activityTotal?.st === null, an?.activityTotal?.st, null)
  check('دلیل شامل «جمع ساده» ممنوعیت است', String(an?.activityTotal?.reason ?? '').includes('جمع ساده'))
  check('شاخص کار دستی = 8 (OT عنصر)', approx(an?.elementTypeTotals?.manual, 8), an?.elementTypeTotals?.manual, 8)
  check('شاخص کار ماشینی = 20', approx(an?.elementTypeTotals?.machine, 20), an?.elementTypeTotals?.machine, 20)
  check('زمان سپری‌شدهٔ چرخه = 25 (گستره؛ نه ۲۸!)', approx(an?.cycleStats?.stats?.mean, 25), an?.cycleStats?.stats?.mean, 25)

  // فعالیت ترتیبی: ST کل = جمع عناصر — FR-16
  an = (await api('GET', `/api/activities/${AID_A}/analysis`)).data?.analysis
  check('فعالیت ترتیبی: ST کل = جمع ST عناصر = 10.40405', an?.activityTotal?.status === 'OK' && approx(an?.activityTotal?.st, 10.40405), an?.activityTotal?.st, 10.40405)

  // ═══════════ Snapshot نهایی ═══════════
  console.log('\nR2) Snapshot نهایی پروژه')
  const runF = await api('POST', `/api/projects/${PID}/calculations/run`)
  latest = (await api('GET', `/api/projects/${PID}/calculations/latest`)).data
  check('نسخهٔ سوم ثبت شد', runF.status === 201 && latest?.runsCount === 3, latest?.runsCount, 3)
  check('وضعیت نهایی: به‌روز', latest?.needsRecalc === false && latest?.run?.status === 'DONE', latest?.run?.status)
  const summary = (latest?.run?.result as any)?.summary
  check('خلاصهٔ نتیجه: ۱ فعالیت نیازمند قاعدهٔ تجمیع', summary?.needsAggregationRule === 1, summary?.needsAggregationRule, 1)

  // ═══════════ پاک‌سازی ═══════════
  const del = await api('DELETE', `/api/projects/${PID}`, { confirm: true })
  check('پاک‌سازی پروژهٔ آزمون', del.status === 200, del.status, 200)

  console.log('\n══════════════════════════════════════')
  console.log(`نتیجه: ${passed} موفق / ${failed} ناموفق`)
  if (failed > 0) {
    console.log('آزمون‌های ناموفق:')
    for (const f of failures) console.log(`  - ${f}`)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('خطای اجرای آزمون:', err)
  process.exit(1)
})
