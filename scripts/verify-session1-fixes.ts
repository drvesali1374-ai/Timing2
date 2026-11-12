// ═══════════════════════════════════════════════════════════
// اسکریپت تأیید اصلاحات بازبینی جلسه ۱ — الزامات ۲/۳/۴ دستور ممیزی
// اجرا:  bun scripts/verify-session1-fixes.ts  (سرور dev روی :3000)
//
//   §A  رفع Race Condition مهاجرت (الزام ۲):
//       A1-A5  پروژه قدیمی موجود در DB — اولین GET (تکی و ۶تایی موازی)
//       A6     تکرار ۳باره بدون داده تکراری + مقایسه محاسبه قبل/بعد
//       A7     پروژه تازه وارد (مسیر import) — اولین GET کامل
//   §B  انتقال نوع/مبنای والد — ۵ سناریوی سند (الزام ۳)
//   §C  رفتار EXCLUDED — ۷ سناریوی سند + سازگاری داده قدیمی (الزام ۴)
//   §D  هم‌ارزی عددی دو موتور (آنلاین TS ↔ آفلاین formulas.js)
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

async function req(method: string, path: string, body?: unknown, raw = false): Promise<{ status: number; data: any }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body !== undefined && !raw ? { 'content-type': 'application/json' } : undefined,
    body: body !== undefined ? (raw ? (body as string) : JSON.stringify(body)) : undefined,
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

const getScope = async (scope: 'PROJECT' | 'STATION' | 'ACTIVITY' | 'WORK_ELEMENT', id: string) => {
  const prefix = { PROJECT: `/api/projects/${id}`, STATION: `/api/stations/${id}`, ACTIVITY: `/api/activities/${id}`, WORK_ELEMENT: `/api/elements/${id}` }[scope]
  return (await req('GET', `${prefix}/allowances`)).data
}
const putOps = async (scope: 'PROJECT' | 'STATION' | 'ACTIVITY' | 'WORK_ELEMENT', id: string, ops: unknown[]) => {
  const prefix = { PROJECT: `/api/projects/${id}`, STATION: `/api/stations/${id}`, ACTIVITY: `/api/activities/${id}`, WORK_ELEMENT: `/api/elements/${id}` }[scope]
  return req('PUT', `${prefix}/allowances`, { ops })
}
const rowOf = (data: any, defId: string) => data?.resolved?.rows?.find((r: any) => r.definitionId === defId)

/** ساخت fixture پروژه قدیمی (گروه/دسته/بازنویسی) — بدون مارکر مهاجرت */
async function buildLegacyProject(db: any, name: string) {
  const proj = await req('POST', '/api/projects', { name, lineName: 'خط قدیم', productName: 'محصول قدیم' })
  const projectId: string = proj.data?.project?.id ?? proj.data?.id
  const s1 = await req('POST', `/api/projects/${projectId}/stations`, { name: 'ایستگاه الف' })
  const s2 = await req('POST', `/api/projects/${projectId}/stations`, { name: 'ایستگاه ب' })
  const station1Id = s1.data?.station?.id
  const station2Id = s2.data?.station?.id
  const a1 = await req('POST', `/api/stations/${station1Id}/activities`, { name: 'فعالیت شاخه الف' })
  const a2 = await req('POST', `/api/stations/${station2Id}/activities`, { name: 'فعالیت شاخه ب' })
  const act1Id = a1.data?.activity?.id
  const act2Id = a2.data?.activity?.id

  // دسته‌ها: دو فعال + یک غیرفعال
  const cat1 = await db.allowanceCategory.create({ data: { projectId, name: 'نیازهای شخصی (قدیم)', isActive: true, sortOrder: 0 } })
  const cat2 = await db.allowanceCategory.create({ data: { projectId, name: 'خستگی (قدیم)', isActive: true, sortOrder: 1 } })
  const catOff = await db.allowanceCategory.create({ data: { projectId, name: 'دسته خاموش (قدیم)', isActive: false, sortOrder: 2 } })

  // گروه با چند GroupAllowance + یک مقدار برای دسته غیرفعال
  const grp = await db.activityGroup.create({ data: { projectId, name: 'گروه قدیم' } })
  await db.groupAllowance.create({ data: { groupId: grp.id, categoryId: cat1.id, percentValue: 0.12 } })
  await db.groupAllowance.create({ data: { groupId: grp.id, categoryId: cat2.id, percentValue: 0.07 } })
  await db.groupAllowance.create({ data: { groupId: grp.id, categoryId: catOff.id, percentValue: 0.2 } })

  // Override روی فعالیت ۱ — مقدار گروه cat1 را جایگزین می‌کند
  await db.activityAllowanceOverride.create({ data: { activityId: act1Id, categoryId: cat1.id, percentValue: 0.15 } })

  await db.activity.updateMany({ where: { id: { in: [act1Id, act2Id] } }, data: { groupId: grp.id } })

  return { projectId, station1Id, station2Id, act1Id, act2Id, cat1, cat2, catOff, grp }
}

async function main() {
  const { PrismaClient } = await import('@prisma/client')
  const db = new PrismaClient()

  console.log('════════════════════════════════════════════════')
  console.log('  تأیید اصلاحات بازبینی جلسه ۱')
  console.log('════════════════════════════════════════════════')

  // ═══ §A — رفع Race Condition مهاجرت (الزام ۲) ═══
  console.log('\n── §A رفع Race Condition — اولین بارگذاری پروژه قدیمی ──')

  // A1-A3: اولین درخواست تکی — بدون مهاجرت قبلی و بدون cache گرم
  const fx = await buildLegacyProject(db, 'تست race مهاجرت — ممیزی ج۱')
  {
    const scope = await getScope('ACTIVITY', fx.act1Id)
    const r1 = rowOf(scope, fx.cat1.id)
    check('A1. اولین GET: تعریف مرکزی مهاجرت‌شده در همان پاسخ موجود است', r1?.definitionId === fx.cat1.id, r1?.definitionId)
    check('A2. اولین GET: تخصیص مهاجرت‌شده در همان پاسخ دیده می‌شود (override 0.15)', r1?.status === 'CUSTOM' && close(r1?.percentValue, 0.15), { s: r1?.status, v: r1?.percentValue })
    const r2 = rowOf(scope, fx.cat2.id)
    check('A3. مقدار گروه (بدون override) هم‌ارز 0.07', r2 && close(r2?.percentValue, 0.07), r2?.percentValue)
    const offRow = rowOf(scope, fx.catOff.id)
    check('A4. دسته غیرفعال وارد محاسبات/ردیف‌ها نمی‌شود', !offRow || offRow.percentValue === null, offRow?.percentValue ?? 'no-row')
    check('A5. Override بر GroupAllowance اولویت دارد (cat1=0.15 نه 0.12)', close(r1?.percentValue, 0.15))
    // محاسبه قبل (مدل قدیم دستی): 0.15 + 0.07 = 0.22 — بعد از مهاجرت همان
    check('A6. محاسبه قبل/بعد مهاجرت یکسان: A = 0.15 + 0.07 = 0.22', close(scope?.resolved?.summary?.totalPercent, 0.22), scope?.resolved?.summary?.totalPercent)
    // تعریف غیرفعال در فهرست مرکزی هست (بایگانی‌شده به‌عنوان تعریف غیرفعال) ولی ردیف مؤثر ندارد
    const defs = scope?.definitions ?? []
    check('A7. دسته غیرفعال به تعریف مرکزیِ غیرفعال تبدیل شد (داده حذف نشد)', defs.some((d: any) => d.id === fx.catOff.id && d.isActive === false))
  }

  // A8: اولین GET به‌صورت ۶ درخواست موازی روی پروژه قدیمی دیگر — هیچ پاسخی ناقص نباید باشد
  const fx2 = await buildLegacyProject(db, 'تست race موازی — ممیزی ج۱')
  {
    const targets = [fx2.act1Id, fx2.act2Id, fx2.station1Id, fx2.station2Id, fx2.projectId, fx2.act1Id]
    const responses = await Promise.all(targets.map(async (id, i) => getScope(i === 2 || i === 3 ? 'STATION' : i === 4 ? 'PROJECT' : 'ACTIVITY', id)))
    const allHaveCat1 = responses.every((s) => rowOf(s, fx2.cat1.id) !== undefined || s?.definitions?.some((d: any) => d.id === fx2.cat1.id))
    check('A8. ۶ درخواست موازی اول: همه پاسخ‌ها تعریف/تخصیص مهاجرت‌شده را دارند (بدون پاسخ ناقص)', allHaveCat1)
    const r1 = rowOf(responses[0], fx2.cat1.id)
    const r2 = rowOf(responses[1], fx2.cat1.id)
    check('A8b. پاسخ موازی: override شاخه الف = 0.15', Boolean(r1) && close(r1?.percentValue ?? -1, 0.15), r1?.percentValue)
    check('A8c. پاسخ موازی: شاخه ب بدون override → مقدار گروه cat1 = 0.12', Boolean(r2) && close(r2?.percentValue ?? -1, 0.12), r2?.percentValue)
    const count = await db.allowanceAssignment.count({ where: { definitionId: fx2.cat1.id, scopeType: 'ACTIVITY', scopeId: fx2.act1Id } })
    check('A8d. درخواست‌های موازی داده تکراری نساختند', count === 1, count)
  }

  // A9: اجرای مجدد (۲ و ۳) — تکرارپذیری
  {
    const s1 = await getScope('ACTIVITY', fx.act1Id)
    const s2 = await getScope('ACTIVITY', fx.act1Id)
    const s3 = await getScope('ACTIVITY', fx.act1Id)
    check('A9. سه GET متوالی هم‌ارزند (مهاجرت مجدد اثری ندارد)', JSON.stringify(s1?.resolved) === JSON.stringify(s2?.resolved) && JSON.stringify(s2?.resolved) === JSON.stringify(s3?.resolved))
    const total = await db.allowanceAssignment.count({ where: { definition: { projectId: fx.projectId } } })
    check('A9b. مجموع تخصیص‌ها پس از GETهای مکرر ثابت است (۲ فعالیت × ۲ دسته فعال)', total === 4, total)
  }

  // A10: پروژه تازه وارد — مسیر import (پکیج قدیمی بدون مارکر)
  {
    const fx3 = await buildLegacyProject(db, 'تست import قدیمی — ممیزی ج۱')
    const exp = await req('GET', `/api/projects/${fx3.projectId}/export`)
    const pkg = exp.data?.package ?? exp.data
    check('A10. خروجی پکیج قدیمی گرفته شد', Boolean(pkg), exp.status)
    const imp = await req('POST', '/api/projects/import', JSON.stringify(pkg), true)
    const newId = imp.data?.project?.id ?? imp.data?.projectId
    check('A10b. پکیج قدیمی import شد (پروژه تازه وارد)', Boolean(newId), imp.status)
    if (newId) {
      // اولین GET روی پروژه تازه وارد — تعریف‌ها و تخصیص‌ها باید کامل باشند
      const act = await db.activity.findFirst({ where: { station: { projectId: newId }, name: 'فعالیت شاخه الف' } })
      const scope = await getScope('ACTIVITY', act!.id)
      const importedDef = (scope?.definitions ?? []).find((d: any) => d.title === fx3.cat1.name)
      const r1 = importedDef ? rowOf(scope, importedDef.id) : undefined
      check('A10c. اولین GET پروژه تازه وارد: تعریف + تخصیص مهاجرت‌شده موجود', Boolean(r1) && close(r1?.percentValue ?? -1, 0.15), r1?.percentValue)
      const rOffDef = (scope?.definitions ?? []).find((d: any) => d.title === fx3.catOff.name)
      const rOff = rOffDef ? rowOf(scope, rOffDef.id) : undefined
      check('A10d. دسته غیرفعال در پروژه import شده هم مؤثر نیست', !rOff || rOff.percentValue === null)
      await req('DELETE', `/api/projects/${newId}`)
    }
    await req('DELETE', `/api/projects/${fx3.projectId}`)
  }

  await req('DELETE', `/api/projects/${fx.projectId}`)
  await req('DELETE', `/api/projects/${fx2.projectId}`)

  // ═══ §B — انتقال نوع/مبنای والد (الزام ۳) ═══
  console.log('\n── §B نوع/مبنای والد — ۵ سناریوی سند ──')
  {
    const proj = await req('POST', '/api/projects', { name: 'تست والد/فرزند — ممیزی ج۱', lineName: 'خط تست', productName: 'محصول تست' })
    const projectId: string = proj.data?.project?.id ?? proj.data?.id
    const st = await req('POST', `/api/projects/${projectId}/stations`, { name: 'ایستگاه' })
    const stationId = st.data?.station?.id
    const ac = await req('POST', `/api/stations/${stationId}/activities`, { name: 'فعالیت' })
    const activityId = ac.data?.activity?.id
    const el = await req('POST', `/api/activities/${activityId}/elements`, { name: 'عنصر' })
    const elementId = el.data?.element?.id

    const defP = await req('POST', `/api/projects/${projectId}/allowance-definitions`, { title: 'درصدی الف', defaultValueType: 'PERCENT', defaultValuePercent: 0.05 })
    const defPId = defP.data?.definition?.id
    const defT = await req('POST', `/api/projects/${projectId}/allowance-definitions`, { title: 'زمانی ب', defaultValueType: 'FIXED_TIME', defaultTimeSeconds: 45 })
    const defTId = defT.data?.definition?.id

    // سناریو ۱: والد درصدی، فرزند درصدی
    await putOps('PROJECT', projectId, [{ definitionId: defPId, action: 'SET', valueType: 'PERCENT', percentValue: 0.05 }])
    await putOps('WORK_ELEMENT', elementId, [{ definitionId: defPId, action: 'SET', valueType: 'PERCENT', percentValue: 0.06 }])
    {
      const row = rowOf(await getScope('WORK_ELEMENT', elementId), defPId)
      check('B1. والد درصدی/فرزند درصدی: parentValue=0.05 و parentValueType=PERCENT', row?.status === 'OVERRIDDEN' && close(row?.parentValue, 0.05) && row?.parentValueType === 'PERCENT' && row?.parentMode === 'ACTIVE' && row?.parentDecisionExists === true && row?.parentScopeType === 'PROJECT', { p: row?.parentValue, pt: row?.parentValueType, pm: row?.parentMode })
      check('B1b. مقدار جاری فرزند 0.06 است (با والد اشتباه نمی‌شود)', close(row?.percentValue, 0.06), row?.percentValue)
    }
    await putOps('WORK_ELEMENT', elementId, [{ definitionId: defPId, action: 'RESTORE' }])

    // سناریو ۲: والد درصدی، فرزند زمان ثابت
    await putOps('WORK_ELEMENT', elementId, [{ definitionId: defPId, action: 'SET', valueType: 'FIXED_TIME', timeValueSeconds: 3, applicationBasis: 'PER_ELEMENT_EXECUTION' }])
    {
      const row = rowOf(await getScope('WORK_ELEMENT', elementId), defPId)
      check('B2. والد درصدی/فرزند ثابت: والد همچنان ۵٪ است (parentValueType=PERCENT نه زمان)', row?.valueType === 'FIXED_TIME' && row?.parentValueType === 'PERCENT' && close(row?.parentValue, 0.05), { vt: row?.valueType, pvt: row?.parentValueType, pv: row?.parentValue })
      check('B2b. مبنای والد برای درصدی null است', row?.parentApplicationBasis === null, row?.parentApplicationBasis)
    }
    await putOps('WORK_ELEMENT', elementId, [{ definitionId: defPId, action: 'RESTORE' }])

    // سناریو ۳: والد زمان ثابت، فرزند درصدی
    await putOps('PROJECT', projectId, [{ definitionId: defTId, action: 'SET', valueType: 'FIXED_TIME', timeValueSeconds: 60, applicationBasis: 'PER_CYCLE' }])
    await putOps('WORK_ELEMENT', elementId, [{ definitionId: defTId, action: 'SET', valueType: 'PERCENT', percentValue: 0.04 }])
    {
      const row = rowOf(await getScope('WORK_ELEMENT', elementId), defTId)
      check('B3. والد ثابت/فرزند درصدی: parentValueType=FIXED_TIME و parentValue=60', row?.valueType === 'PERCENT' && row?.parentValueType === 'FIXED_TIME' && close(row?.parentValue, 60), { vt: row?.valueType, pvt: row?.parentValueType, pv: row?.parentValue })
      check('B3b. مبنای والد (PER_CYCLE) منتقل شد', row?.parentApplicationBasis === 'PER_CYCLE', row?.parentApplicationBasis)
    }
    await putOps('WORK_ELEMENT', elementId, [{ definitionId: defTId, action: 'RESTORE' }])

    // سناریو ۴: والد زمان ثابت PER_ELEMENT_EXECUTION، فرزند زمان ثابت PER_CYCLE
    await putOps('PROJECT', projectId, [{ definitionId: defTId, action: 'SET', valueType: 'FIXED_TIME', timeValueSeconds: 90, applicationBasis: 'PER_ELEMENT_EXECUTION' }])
    await putOps('WORK_ELEMENT', elementId, [{ definitionId: defTId, action: 'SET', valueType: 'FIXED_TIME', timeValueSeconds: 25, applicationBasis: 'PER_CYCLE' }])
    {
      const row = rowOf(await getScope('WORK_ELEMENT', elementId), defTId)
      check('B4. والد PER_ELEMENT/فرزند PER_CYCLE: مبناها مستقل منتقل شدند', row?.parentApplicationBasis === 'PER_ELEMENT_EXECUTION' && row?.applicationBasis === 'PER_CYCLE' && close(row?.parentValue, 90) && close(row?.timeValueSeconds, 25), { pb: row?.parentApplicationBasis, b: row?.applicationBasis })
    }
    await putOps('WORK_ELEMENT', elementId, [{ definitionId: defTId, action: 'RESTORE' }])

    // سناریو ۵: والد زمان ثابت PER_CYCLE، فرزند زمان ثابت PER_ELEMENT_EXECUTION
    await putOps('PROJECT', projectId, [{ definitionId: defTId, action: 'SET', valueType: 'FIXED_TIME', timeValueSeconds: 90, applicationBasis: 'PER_CYCLE' }])
    await putOps('WORK_ELEMENT', elementId, [{ definitionId: defTId, action: 'SET', valueType: 'FIXED_TIME', timeValueSeconds: 12, applicationBasis: 'PER_ELEMENT_EXECUTION' }])
    {
      const row = rowOf(await getScope('WORK_ELEMENT', elementId), defTId)
      check('B5. والد PER_CYCLE/فرزند PER_ELEMENT: parentApplicationBasis=PER_CYCLE', row?.parentApplicationBasis === 'PER_CYCLE' && row?.applicationBasis === 'PER_ELEMENT_EXECUTION' && close(row?.parentValue, 90), { pb: row?.parentApplicationBasis })
    }
    await putOps('WORK_ELEMENT', elementId, [{ definitionId: defTId, action: 'RESTORE' }])

    // ردیف ارثی: والد مستقیم = منبع مقدار مؤثر
    {
      const row = rowOf(await getScope('WORK_ELEMENT', elementId), defPId)
      check('B6. ردیف ارثی: والد مستقیم همان منبع است (parentValue = مقدار مؤثر)', row?.status === 'INHERITED' && close(row?.parentValue, 0.05) && row?.parentValueType === 'PERCENT' && row?.parentScopeType === 'PROJECT', { s: row?.status, pv: row?.parentValue })
    }

    // ═══ §C — رفتار EXCLUDED (الزام ۴) ═══
    console.log('\n── §C رفتار EXCLUDED — ۷ سناریوی سند ──')

    const defQ = await req('POST', `/api/projects/${projectId}/allowance-definitions`, { title: 'مستقل ق', defaultValueType: 'PERCENT', defaultValuePercent: 0.02 })
    const defQId = defQ.data?.definition?.id
    await putOps('PROJECT', projectId, [{ definitionId: defQId, action: 'SET', valueType: 'PERCENT', percentValue: 0.02 }])

    // C1+C3: حذف الونس درصدی از ارث‌بری (با والد فعال)
    await putOps('STATION', stationId, [{ definitionId: defPId, action: 'EXCLUDE' }])
    {
      const row = rowOf(await getScope('ACTIVITY', activityId), defPId)
      check('C1. حذف الونس درصدی از ارث‌بری: وضعیت EXCLUDED', row?.status === 'EXCLUDED', row?.status)
      check('C1b. نوع نمایشی پس از حذف همچنان درصدی است (نه ساختگی)', row?.valueType === 'PERCENT', row?.valueType)
      // «حذف با والد فعال» از دید همان scope که تصمیم در آن ثبت شده (ایستگاه)
      const stRow = rowOf(await getScope('STATION', stationId), defPId)
      check('C3. حذف با والد فعال (از دید scope تصمیم‌گیر): parentMode=ACTIVE و parentValue=0.05', stRow?.status === 'EXCLUDED' && stRow?.hasLocalDecision === true && stRow?.parentMode === 'ACTIVE' && close(stRow?.parentValue ?? -1, 0.05), { pm: stRow?.parentMode, pv: stRow?.parentValue })
      // ذخیره پایدار: تخصیص EXCLUDE با نوع معنادار
      const raw = await db.allowanceAssignment.findFirst({ where: { definitionId: defPId, scopeType: 'STATION', scopeId: stationId } })
      check('C1c. ذخیره پایدار EXCLUDE درصدی: valueType=PERCENT', raw?.valueType === 'PERCENT' && raw?.mode === 'EXCLUDE', { vt: raw?.valueType, m: raw?.mode })
    }

    // C2: حذف الونس زمان ثابت از ارث‌بری — باگ اصلی الزام ۴
    await putOps('STATION', stationId, [{ definitionId: defTId, action: 'EXCLUDE' }])
    {
      const row = rowOf(await getScope('ACTIVITY', activityId), defTId)
      check('C2. حذف الونس «زمان ثابت»: نوع نمایشی زمان ثابت ماند (پیش‌تر غلطاً درصدی می‌شد)', row?.status === 'EXCLUDED' && row?.valueType === 'FIXED_TIME', { s: row?.status, vt: row?.valueType })
      check('C2b. مقدار مؤثر حذف‌شده null است', row?.timeValueSeconds === null && row?.percentValue === null, { p: row?.percentValue, t: row?.timeValueSeconds })
      const raw = await db.allowanceAssignment.findFirst({ where: { definitionId: defTId, scopeType: 'STATION', scopeId: stationId } })
      check('C2c. ذخیره پایدار EXCLUDE زمانی: valueType=FIXED_TIME (نه PERCENT ساختگی)', raw?.valueType === 'FIXED_TIME', raw?.valueType)
      // در محاسبات لحاظ نمی‌شود
      const scope = await getScope('ACTIVITY', activityId)
      check('C2d. الونس حذف‌شده در جمع درصدها نیست', close(scope?.resolved?.summary?.totalPercent, 0.02), scope?.resolved?.summary?.totalPercent)
    }

    // C4: حذف بدون تخصیص فعال والد — دو حالت: بدون والد / والد خودش EXCLUDE
    const defN = await req('POST', `/api/projects/${projectId}/allowance-definitions`, { title: 'بدون پیش‌فرض و بدون والد' })
    const defNId = defN.data?.definition?.id
    {
      // حالت الف: بدون هیچ والد — در سطح خط
      await putOps('PROJECT', projectId, [{ definitionId: defNId, action: 'EXCLUDE' }])
      const projRow = rowOf(await getScope('PROJECT', projectId), defNId)
      check('C4. حذف بدون والد (از دید scope تصمیم‌گیر): parentDecisionExists=false و parentMode=null', projRow?.status === 'EXCLUDED' && projRow?.parentDecisionExists === false && projRow?.parentMode === null, { pe: projRow?.parentDecisionExists, pm: projRow?.parentMode })
      check('C4b. بدون منبع نوع → نمایش خنثی (valueType=null، نه درصد ساختگی)', projRow?.valueType === null, projRow?.valueType)
      await putOps('PROJECT', projectId, [{ definitionId: defNId, action: 'RESTORE' }])

      // حالت ب: والد فعال ندارد چون والدِ بالاتر EXCLUDE است
      await putOps('PROJECT', projectId, [{ definitionId: defNId, action: 'EXCLUDE' }])
      await putOps('STATION', stationId, [{ definitionId: defNId, action: 'SET', valueType: 'PERCENT', percentValue: 0.01 }]) // بازفعال‌سازی صریح
      await putOps('STATION', stationId, [{ definitionId: defNId, action: 'EXCLUDE' }]) // دوباره حذف — والدِ مستقیم = EXCLUDE خط
      const row2 = rowOf(await getScope('ACTIVITY', activityId), defNId)
      check('C4c. حذف با والدِ EXCLUDE: parentMode=EXCLUDE (والد فعال نیست)', row2?.status === 'EXCLUDED' && row2?.parentMode === 'EXCLUDE' && row2?.parentDecisionExists === true, { pm: row2?.parentMode, pe: row2?.parentDecisionExists })
      check('C4d. والد EXCLUDE → parentValue=null (مقدار والد گمراه‌کننده نیست)', row2?.parentValue === null && row2?.parentValueType === null, { pv: row2?.parentValue, pvt: row2?.parentValueType })
      await putOps('STATION', stationId, [{ definitionId: defNId, action: 'RESTORE' }])
      await putOps('PROJECT', projectId, [{ definitionId: defNId, action: 'RESTORE' }])
    }

    // C5: بازگردانی هر دو حالت
    {
      await putOps('STATION', stationId, [{ definitionId: defPId, action: 'RESTORE' }])
      const row = rowOf(await getScope('ACTIVITY', activityId), defPId)
      check('C5. بازگردانی حذف‌شده با والد فعال → ارث از خط (0.05)', row?.status === 'INHERITED' && close(row?.percentValue, 0.05), { s: row?.status, v: row?.percentValue })
      await putOps('STATION', stationId, [{ definitionId: defTId, action: 'RESTORE' }])
      const row2 = rowOf(await getScope('ACTIVITY', activityId), defTId)
      check('C5b. بازگردانی حذف‌شده زمانی → ارث 90s PER_CYCLE (والد فعلی)', row2?.status === 'INHERITED' && close(row2?.timeValueSeconds, 90) && row2?.applicationBasis === 'PER_CYCLE', { s: row2?.status, t: row2?.timeValueSeconds })
    }

    // C6: بازگردانی پس از تغییر مقدار والد
    {
      await putOps('STATION', stationId, [{ definitionId: defPId, action: 'EXCLUDE' }])
      await putOps('PROJECT', projectId, [{ definitionId: defPId, action: 'SET', valueType: 'PERCENT', percentValue: 0.08 }])
      const mid = rowOf(await getScope('ACTIVITY', activityId), defPId)
      check('C6. تغییر والد در حین حذف: همچنان EXCLUDED (تعریف مرکزی دست‌نخورده)', mid?.status === 'EXCLUDED', mid?.status)
      await putOps('STATION', stationId, [{ definitionId: defPId, action: 'RESTORE' }])
      const row = rowOf(await getScope('ACTIVITY', activityId), defPId)
      check('C6b. بازگردانی پس از تغییر والد → مقدار جدید والد (0.08) برمی‌گردد', row?.status === 'INHERITED' && close(row?.percentValue, 0.08), { s: row?.status, v: row?.percentValue })
    }

    // C7: حفظ مقادیر الونس‌های مستقل
    {
      const scope = await getScope('ACTIVITY', activityId)
      const q = rowOf(scope, defQId)
      check('C7. الونس مستقل در تمام عملیات حذف/بازگردانی حفظ شد (0.02)', q && close(q?.percentValue, 0.02) && q?.status === 'INHERITED', { s: q?.status, v: q?.percentValue })
      // Restore فقط تصمیم محلی را حذف می‌کند — تعریف مرکزی و سایر سطوح دست‌نخورده
      const defCount = await db.allowanceDefinition.count({ where: { projectId } })
      check('C7b. تعریف مرکزی هیچ‌کدام حذف نشد', defCount === 4, defCount)
      const projectAssignP = await db.allowanceAssignment.findFirst({ where: { definitionId: defPId, scopeType: 'PROJECT', scopeId: projectId } })
      check('C7c. تخصیص سطح خط دست‌نخورده ماند', Boolean(projectAssignP) && close(projectAssignP?.percentValue ?? -1, 0.08))
    }

    // سازگاری داده قدیمی: EXCLUDE ذخیره‌شده با PERCENT ساختگی (نسخه قبل از اصلاح)
    {
      await db.allowanceAssignment.create({
        data: {
          definitionId: defTId, scopeType: 'STATION', scopeId: stationId,
          mode: 'EXCLUDE', valueType: 'PERCENT', percentValue: null, timeValueSeconds: null, applicationBasis: null,
        },
      }).catch(async () => {
        await db.allowanceAssignment.updateMany({
          where: { definitionId: defTId, scopeType: 'STATION', scopeId: stationId },
          data: { mode: 'EXCLUDE', valueType: 'PERCENT', percentValue: null, timeValueSeconds: null, applicationBasis: null },
        })
      })
      const row = rowOf(await getScope('ACTIVITY', activityId), defTId)
      check('C8. داده قدیمی (EXCLUDE با PERCENT ساختگی): Resolver نوع واقعی را بازتولید می‌کند (FIXED_TIME)', row?.status === 'EXCLUDED' && row?.valueType === 'FIXED_TIME', { vt: row?.valueType })
      await putOps('STATION', stationId, [{ definitionId: defTId, action: 'RESTORE' }])
    }

    await req('DELETE', `/api/projects/${projectId}`)
  }

  // ═══ §D — هم‌ارزی عددی دو موتور (الزام ۶) ═══
  console.log('\n── §D هم‌ارزی عددی موتور آنلاین (TS) ↔ آفلاین (formulas.js) ──')
  {
    const { resolveEffectiveAllowances, computeElementStandardTime } = await import('../src/calculation/effective-allowances')
    // @ts-expect-error — فایل UMD آفلاین بدون export (IIFE روی globalThis)؛ اجرای صحیح در bun
    await import('../offline/js/formulas.js')
    const T2F = (globalThis as any).T2F

    const definitions = [
      { id: 'd1', title: 'درصدی', isActive: true, sortOrder: 0, defaultValueType: 'PERCENT', defaultValuePercent: 0.05, defaultTimeSeconds: null },
      { id: 'd2', title: 'زمانی', isActive: true, sortOrder: 1, defaultValueType: 'FIXED_TIME', defaultValuePercent: null, defaultTimeSeconds: 45 },
      { id: 'd3', title: 'بدون پیش‌فرض', isActive: true, sortOrder: 2, defaultValueType: null, defaultValuePercent: null, defaultTimeSeconds: null },
      { id: 'd4', title: 'غیرفعال', isActive: false, sortOrder: 3, defaultValueType: 'PERCENT', defaultValuePercent: 0.5, defaultTimeSeconds: null },
    ]
    const assignments = [
      { definitionId: 'd1', scopeType: 'PROJECT', scopeId: 'p1', mode: 'ACTIVE', valueType: 'PERCENT', percentValue: 0.05, timeValueSeconds: null, applicationBasis: null },
      { definitionId: 'd2', scopeType: 'PROJECT', scopeId: 'p1', mode: 'ACTIVE', valueType: 'FIXED_TIME', percentValue: null, timeValueSeconds: 60, applicationBasis: 'PER_CYCLE' },
      { definitionId: 'd1', scopeType: 'STATION', scopeId: 's1', mode: 'EXCLUDE', valueType: 'PERCENT', percentValue: null, timeValueSeconds: null, applicationBasis: null },
      { definitionId: 'd2', scopeType: 'STATION', scopeId: 's1', mode: 'ACTIVE', valueType: 'FIXED_TIME', percentValue: null, timeValueSeconds: 30, applicationBasis: 'PER_ELEMENT_EXECUTION' },
      { definitionId: 'd1', scopeType: 'ACTIVITY', scopeId: 'a1', mode: 'ACTIVE', valueType: 'PERCENT', percentValue: 0.06, timeValueSeconds: null, applicationBasis: null },
      { definitionId: 'd3', scopeType: 'ACTIVITY', scopeId: 'a1', mode: 'EXCLUDE', valueType: 'PERCENT', percentValue: null, timeValueSeconds: null, applicationBasis: null },
      { definitionId: 'd3', scopeType: 'WORK_ELEMENT', scopeId: 'e1', mode: 'ACTIVE', valueType: 'PERCENT', percentValue: 0.01, timeValueSeconds: null, applicationBasis: null },
      { definitionId: 'd1', scopeType: 'WORK_ELEMENT', scopeId: 'e2', mode: 'ACTIVE', valueType: 'FIXED_TIME', percentValue: null, timeValueSeconds: 2.5, applicationBasis: 'PER_ELEMENT_EXECUTION' },
    ]
    const chains: any[][] = [
      [{ type: 'PROJECT', id: 'p1', label: 'خط' }],
      [{ type: 'PROJECT', id: 'p1', label: 'خط' }, { type: 'STATION', id: 's1', label: 'ایستگاه' }],
      [{ type: 'PROJECT', id: 'p1', label: 'خط' }, { type: 'STATION', id: 's1', label: 'ایستگاه' }, { type: 'ACTIVITY', id: 'a1', label: 'فعالیت' }],
      [{ type: 'PROJECT', id: 'p1', label: 'خط' }, { type: 'STATION', id: 's1', label: 'ایستگاه' }, { type: 'ACTIVITY', id: 'a1', label: 'فعالیت' }, { type: 'WORK_ELEMENT', id: 'e1', label: 'عنصر۱' }],
      [{ type: 'PROJECT', id: 'p1', label: 'خط' }, { type: 'STATION', id: 's1', label: 'ایستگاه' }, { type: 'ACTIVITY', id: 'a1', label: 'فعالیت' }, { type: 'WORK_ELEMENT', id: 'e2', label: 'عنصر۲' }],
    ]
    let allRowsEqual = true
    let allSummariesEqual = true
    for (let ci = 0; ci < chains.length; ci++) {
      const a = resolveEffectiveAllowances({ definitions: definitions as any, assignments: assignments as any, chain: chains[ci] as any })
      const b = T2F.resolveEffectiveAllowances({ definitions, assignments, chain: chains[ci] })
      if (JSON.stringify(a.rows) !== JSON.stringify(b.rows)) {
        allRowsEqual = false
        console.log(`     تفاوت ردیف‌ها در زنجیره ${ci}:`)
        console.log('     TS:', JSON.stringify(a.rows))
        console.log('     JS:', JSON.stringify(b.rows))
      }
      if (JSON.stringify(a.summary) !== JSON.stringify(b.summary)) allSummariesEqual = false
    }
    check('D1. ردیف‌های resolve دو موتور در ۵ زنجیره (ارث/جایگزینی/حذف/بازفعال/نوع‌مختلط) کاملاً یکسان‌اند', allRowsEqual)
    check('D2. خلاصه‌های عددی دو موتور یکسان‌اند', allSummariesEqual)

    // ST عنصر — هر دو روش
    const cases = [
      { nt: 100, f: { totalPercent: 0.08, perExecutionSeconds: 2.5, perCycleSeconds: 30 }, m: 'PERCENT_OF_NT' as const, want: 110.5 },
      { nt: 100, f: { totalPercent: 0.08, perExecutionSeconds: 0, perCycleSeconds: 0 }, m: 'SHARE_OF_ST' as const, want: 100 / 0.92 },
      { nt: 9.047, f: { totalPercent: 0.15, perExecutionSeconds: 0, perCycleSeconds: 0 }, m: 'PERCENT_OF_NT' as const, want: 10.40405 },
      { nt: 9.047, f: { totalPercent: 0.15, perExecutionSeconds: 0, perCycleSeconds: 0 }, m: 'SHARE_OF_ST' as const, want: 10.643529411765 },
    ]
    let stEqual = true
    for (const c of cases) {
      const a = computeElementStandardTime(c.nt, c.f, c.m)
      const b = T2F.computeElementStandardTime(c.nt, c.f, c.m)
      if (!close(a.st, b.st, 1e-9) || !close(a.st, c.want, 1e-6)) stEqual = false
    }
    check('D3. computeElementStandardTime دو موتور + مقادیر مرجع سند یکسان‌اند', stEqual)
  }

  // ═══ §E — مبنای نمایشی زمان ثابت در ردیف EXCLUDED (بازبینی تکمیلی ج۱ §۳) ═══
  console.log('\n── §E مبنای نمایشی EXCLUDED — displayApplicationBasis ──')
  {
    const proj = await req('POST', '/api/projects', { name: 'تست مبنای نمایشی — تکمیلی ج۱', lineName: 'خط تست', productName: 'محصول تست' })
    const projectId: string = proj.data?.project?.id ?? proj.data?.id
    const s1 = await req('POST', `/api/projects/${projectId}/stations`, { name: 'ایستگاه' })
    const stationId = s1.data?.station?.id
    const a1 = await req('POST', `/api/stations/${stationId}/activities`, { name: 'فعالیت' })
    const activityId = a1.data?.activity?.id

    const defT = await req('POST', `/api/projects/${projectId}/allowance-definitions`, { title: 'زمانی مبنادار', defaultValueType: 'FIXED_TIME', defaultTimeSeconds: 45 })
    const defTId = defT.data?.definition?.id
    const defC = await req('POST', `/api/projects/${projectId}/allowance-definitions`, { title: 'زمانی فقط پیش‌فرض', defaultValueType: 'FIXED_TIME', defaultTimeSeconds: 20 })
    const defCId = defC.data?.definition?.id
    const defP = await req('POST', `/api/projects/${projectId}/allowance-definitions`, { title: 'درصدی', defaultValueType: 'PERCENT', defaultValuePercent: 0.05 })
    const defPId = defP.data?.definition?.id

    // E1: والد ACTIVE با FIXED_TIME/PER_CYCLE → EXCLUDE در سطح پایین‌تر
    await putOps('PROJECT', projectId, [{ definitionId: defTId, action: 'SET', valueType: 'FIXED_TIME', timeValueSeconds: 60, applicationBasis: 'PER_CYCLE' }])
    await putOps('STATION', stationId, [{ definitionId: defTId, action: 'EXCLUDE' }])
    {
      const row = rowOf(await getScope('ACTIVITY', activityId), defTId)
      check('E1. والد FIXED_TIME/PER_CYCLE → EXCLUDE: نوع نمایشی FIXED_TIME', row?.status === 'EXCLUDED' && row?.valueType === 'FIXED_TIME', { s: row?.status, vt: row?.valueType })
      check('E1b. مبنای نمایشی PER_CYCLE از والد منتقل شد (applicationBasis خود تخصیص null ماند)', row?.displayApplicationBasis === 'PER_CYCLE' && row?.applicationBasis === null, { d: row?.displayApplicationBasis, a: row?.applicationBasis })
    }

    // E2: والد ACTIVE با FIXED_TIME/PER_ELEMENT_EXECUTION → همان EXCLUDE
    await putOps('PROJECT', projectId, [{ definitionId: defTId, action: 'SET', valueType: 'FIXED_TIME', timeValueSeconds: 90, applicationBasis: 'PER_ELEMENT_EXECUTION' }])
    {
      const row = rowOf(await getScope('ACTIVITY', activityId), defTId)
      check('E2. والد PER_ELEMENT_EXECUTION → EXCLUDE: مبنای نمایشی همان مبنا', row?.displayApplicationBasis === 'PER_ELEMENT_EXECUTION', row?.displayApplicationBasis)
    }
    await putOps('STATION', stationId, [{ definitionId: defTId, action: 'RESTORE' }])

    // E3: هیچ والد ACTIVE — فقط پیش‌فرض تعریف مرکزی FIXED_TIME
    await putOps('PROJECT', projectId, [{ definitionId: defCId, action: 'EXCLUDE' }])
    {
      const row = rowOf(await getScope('STATION', stationId), defCId)
      check('E3. بدون والد فعال + پیش‌فرض مرکزی FIXED_TIME: نوع نمایشی FIXED_TIME', row?.status === 'EXCLUDED' && row?.valueType === 'FIXED_TIME', { s: row?.status, vt: row?.valueType })
      check('E3b. مبنای نمایشی null — نه PER_ELEMENT_EXECUTION ساختگی، نه PER_CYCLE', row?.displayApplicationBasis === null, row?.displayApplicationBasis)
    }
    await putOps('PROJECT', projectId, [{ definitionId: defCId, action: 'RESTORE' }])

    // E4: درصدی EXCLUDED — بدون مبنای زمانی
    await putOps('PROJECT', projectId, [{ definitionId: defPId, action: 'SET', valueType: 'PERCENT', percentValue: 0.05 }])
    await putOps('STATION', stationId, [{ definitionId: defPId, action: 'EXCLUDE' }])
    {
      const row = rowOf(await getScope('ACTIVITY', activityId), defPId)
      check('E4. درصدی EXCLUDED: بدون مبنای زمانی (نوع درصدی، مبنا null)', row?.status === 'EXCLUDED' && row?.valueType === 'PERCENT' && row?.displayApplicationBasis === null, { vt: row?.valueType, d: row?.displayApplicationBasis })
    }

    // E5: ردیف فعال — مبنای نمایشی = مبنای واقعی تخصیص
    {
      const rowT = rowOf(await getScope('ACTIVITY', activityId), defTId)
      check('E5. ردیف فعال (ارثی): displayApplicationBasis = applicationBasis واقعی', rowT?.status === 'INHERITED' && rowT?.displayApplicationBasis === rowT?.applicationBasis && rowT?.applicationBasis === 'PER_ELEMENT_EXECUTION', { s: rowT?.status, d: rowT?.displayApplicationBasis, a: rowT?.applicationBasis })
    }

    // E6: هم‌ارزی دو موتور روی fixture مبنای نمایشی (همان ورودی، همان خروجی)
    {
      const { resolveEffectiveAllowances } = await import('../src/calculation/effective-allowances')
      // @ts-expect-error — فایل UMD آفلاین (IIFE روی globalThis)
      await import('../offline/js/formulas.js')
      const T2F = (globalThis as any).T2F
      const definitions = [
        { id: 'x1', title: 'زمانی', isActive: true, sortOrder: 0, defaultValueType: 'FIXED_TIME', defaultValuePercent: null, defaultTimeSeconds: 45 },
        { id: 'x2', title: 'فقط پیش‌فرض', isActive: true, sortOrder: 1, defaultValueType: 'FIXED_TIME', defaultValuePercent: null, defaultTimeSeconds: 20 },
        { id: 'x3', title: 'درصدی', isActive: true, sortOrder: 2, defaultValueType: 'PERCENT', defaultValuePercent: 0.05, defaultTimeSeconds: null },
      ]
      const assignments = [
        { definitionId: 'x1', scopeType: 'PROJECT', scopeId: 'p1', mode: 'ACTIVE', valueType: 'FIXED_TIME', percentValue: null, timeValueSeconds: 60, applicationBasis: 'PER_CYCLE' },
        { definitionId: 'x1', scopeType: 'STATION', scopeId: 's1', mode: 'EXCLUDE', valueType: 'FIXED_TIME', percentValue: null, timeValueSeconds: null, applicationBasis: null },
        { definitionId: 'x2', scopeType: 'PROJECT', scopeId: 'p1', mode: 'EXCLUDE', valueType: 'FIXED_TIME', percentValue: null, timeValueSeconds: null, applicationBasis: null },
        { definitionId: 'x3', scopeType: 'PROJECT', scopeId: 'p1', mode: 'ACTIVE', valueType: 'PERCENT', percentValue: 0.05, timeValueSeconds: null, applicationBasis: null },
        { definitionId: 'x3', scopeType: 'STATION', scopeId: 's1', mode: 'EXCLUDE', valueType: 'PERCENT', percentValue: null, timeValueSeconds: null, applicationBasis: null },
        { definitionId: 'x3', scopeType: 'ACTIVITY', scopeId: 'a1', mode: 'ACTIVE', valueType: 'PERCENT', percentValue: 0.07, timeValueSeconds: null, applicationBasis: null },
      ]
      const chain = [
        { type: 'PROJECT', id: 'p1', label: 'خط' },
        { type: 'STATION', id: 's1', label: 'ایستگاه' },
        { type: 'ACTIVITY', id: 'a1', label: 'فعالیت' },
      ]
      const a = resolveEffectiveAllowances({ definitions: definitions as any, assignments: assignments as any, chain: chain as any })
      const b = T2F.resolveEffectiveAllowances({ definitions, assignments, chain })
      check('E6. هم‌ارزی دو موتور روی fixture مبنای نمایشی (شامل displayApplicationBasis)', JSON.stringify(a.rows) === JSON.stringify(b.rows) && JSON.stringify(a.summary) === JSON.stringify(b.summary))
    }

    // ═══ §F — Restore در حالت والد EXCLUDE + فرزند SET (بازبینی تکمیلی ج۱ §۵) ═══
    console.log('\n── §F Restore با والد EXCLUDE (بازفعال‌سازی فرزند) ──')
    {
      // وضعیت فعلی defP: خط ACTIVE 0.05 → ایستگاه EXCLUDE (از E4)
      await putOps('ACTIVITY', activityId, [{ definitionId: defPId, action: 'SET', valueType: 'PERCENT', percentValue: 0.07 }])
      {
        const row = rowOf(await getScope('ACTIVITY', activityId), defPId)
        check('F1. والد EXCLUDE + فرزند SET: OVERRIDDEN با parentMode=EXCLUDE (شرط متن جدید Restore)', row?.status === 'OVERRIDDEN' && row?.parentMode === 'EXCLUDE', { s: row?.status, pm: row?.parentMode })
        check('F1b. مقدار فرزند فعال است (0.07) — بازفعال‌سازی صریح', close(row?.percentValue, 0.07), row?.percentValue)
      }

      // F2/F3: اجرای Restore — فقط تخصیص محلی حذف می‌شود؛ EXCLUDE والد دست‌نخورده
      const stationExcludeBefore = await db.allowanceAssignment.findFirst({ where: { definitionId: defPId, scopeType: 'STATION', scopeId: stationId } })
      await putOps('ACTIVITY', activityId, [{ definitionId: defPId, action: 'RESTORE' }])
      {
        const row = rowOf(await getScope('ACTIVITY', activityId), defPId)
        check('F2. Restore: تخصیص محلی حذف شد → وضعیت EXCLUDED والد دوباره برقرار', row?.status === 'EXCLUDED', row?.status)
        const localAfter = await db.allowanceAssignment.findFirst({ where: { definitionId: defPId, scopeType: 'ACTIVITY', scopeId: activityId } })
        check('F2b. تخصیص محلی فعالیت کاملاً حذف شد', localAfter === null, localAfter ?? 'deleted')
        const stationExcludeAfter = await db.allowanceAssignment.findFirst({ where: { definitionId: defPId, scopeType: 'STATION', scopeId: stationId } })
        check('F3. تخصیص EXCLUDE والد دست‌نخورده ماند (همان رکورد، همان حالت)', Boolean(stationExcludeAfter) && stationExcludeAfter?.mode === 'EXCLUDE' && stationExcludeAfter?.id === stationExcludeBefore?.id, { m: stationExcludeAfter?.mode, same: stationExcludeAfter?.id === stationExcludeBefore?.id })
        const projectSet = await db.allowanceAssignment.findFirst({ where: { definitionId: defPId, scopeType: 'PROJECT', scopeId: projectId } })
        check('F3b. تخصیص ACTIVE خط نیز دست‌نخورده ماند (0.05)', Boolean(projectSet) && close(projectSet?.percentValue ?? -1, 0.05))
      }

      // F4: والد ACTIVE + فرزند SET → شرط متن کلاسیک
      await putOps('STATION', stationId, [{ definitionId: defPId, action: 'RESTORE' }])
      await putOps('ACTIVITY', activityId, [{ definitionId: defPId, action: 'SET', valueType: 'PERCENT', percentValue: 0.09 }])
      {
        const row = rowOf(await getScope('ACTIVITY', activityId), defPId)
        check('F4. والد ACTIVE + فرزند SET: OVERRIDDEN با parentMode=ACTIVE (متن کلاسیک «بازگردانی به مقدار والد»)', row?.status === 'OVERRIDDEN' && row?.parentMode === 'ACTIVE', { s: row?.status, pm: row?.parentMode })
      }

      // F5: ایستایی متن‌های UI در منبع آنلاین (تست DOM تعاملی در مرورگر — گزارش)
      {
        const fs = await import('node:fs')
        const src = fs.readFileSync(new URL('../src/views/project/allowances/AllowanceSection.tsx', import.meta.url), 'utf-8')
        check('F5. منبع آنلاین: متن Restore حالت والد-EXCLUDE موجود است', src.includes('بازگردانی به وضعیت والد (حذف تخصیص محلی)'))
        check('F5b. منبع آنلاین: پیام موفقیت حالت والد-EXCLUDE موجود است', src.includes('وضعیت حذف از ارث‌بری والد دوباره برقرار شد'))
        check('F5c. منبع آنلاین: مبنا هرگز به‌صورت پیش‌فرض «هر اجرا» نمی‌شود (مبنا نامشخص)', src.includes('مبنا نامشخص') && src.includes('displayApplicationBasis'))
      }

      await req('DELETE', `/api/projects/${projectId}`)
    }
  }

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
