// آماده‌سازی fixture مرورگر — v1.5.2 بازبینی نهایی
// پروژهٔ «مرورگر نهایی v1.5.2» با ۳ ایستگاه / ۶ فعالیت / ۱۴ عنصر +
// تعریف‌های مرکزی الونس + تخصیص چندسطحی + اپراتور + جلسه و دادهٔ زمان‌سنجی
const BASE = 'http://localhost:3000'

async function req(method: string, path: string, body?: unknown): Promise<{ status: number; data: any }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  let data: any = null
  try { data = await res.json() } catch { data = null }
  return { status: res.status, data }
}

async function main() {
  // حذف پروژهٔ قبلی در صورت وجود
  const list = await req('GET', '/api/projects')
  for (const p of list.data.projects ?? []) {
    if (p.name.includes('مرورگر نهایی v1.5.2')) await req('DELETE', `/api/projects/${p.id}`)
  }

  const proj = await req('POST', '/api/projects', {
    name: 'تست مرورگر نهایی v1.5.2 — بازبینی',
    lineName: 'خط مونتاژ نهایی',
    productName: 'دستگاه کولر مدل K25',
    studyDate: '2026-02-01',
  })
  const projectId = proj.data.project.id
  console.log('project:', projectId)

  // ── تعریف‌های مرکزی الونس ──
  const d1 = (await req('POST', `/api/projects/${projectId}/allowance-definitions`, { title: 'نیازهای شخصی', code: 'PP', defaultValueType: 'PERCENT', defaultValuePercent: 0.05, sortOrder: 0 })).data.definition.id
  const d2 = (await req('POST', `/api/projects/${projectId}/allowance-definitions`, { title: 'خستگی پایه', code: 'FB', defaultValueType: 'PERCENT', defaultValuePercent: 0.04, sortOrder: 1 })).data.definition.id
  const d3 = (await req('POST', `/api/projects/${projectId}/allowance-definitions`, { title: 'استراحت شیفت', code: 'SR', defaultValueType: 'FIXED_TIME', defaultTimeSeconds: 120, sortOrder: 2 })).data.definition.id

  // ── ساختار: ۳ ایستگاه × ۲ فعالیت × عناصر ──
  const mkStation = async (name: string) => (await req('POST', `/api/projects/${projectId}/stations`, { name })).data.station.id
  const mkAct = async (stId: string, name: string, processType: string) =>
    (await req('POST', `/api/stations/${stId}/activities`, { name, processType })).data.activity.id
  const mkEl = async (actId: string, name: string) => (await req('POST', `/api/activities/${actId}/elements`, { name })).data.element.id

  const st1 = await mkStation('ایستگاه مونتاژ بدنه')
  const st2 = await mkStation('ایستگاه سیم‌کشی')
  const st3 = await mkStation('ایستگاه کنترل کیفیت')

  const a11 = await mkAct(st1, 'مونتاژ شاسی روی خط', 'OPERATION')
  const a12 = await mkAct(st1, 'پیش‌خواب کاری', 'OPERATION')
  const a21 = await mkAct(st2, 'سیم‌کشی هارنس اصلی', 'OPERATION')
  const a22 = await mkAct(st2, 'حمل به ایستگاه بعدی', 'TRANSPORT')
  const a31 = await mkAct(st3, 'کنترل کیفیت نهایی', 'INSPECTION')
  const a32 = await mkAct(st3, 'انبارش محصول نهایی', 'STORAGE')

  const e111 = await mkEl(a11, 'قرار دادن شاسی روی فیکسچر')
  const e112 = await mkEl(a11, 'بستن چهار پیچ قید')
  const e113 = await mkEl(a11, 'کنترل صافی سطح')
  await mkEl(a12, 'آماده‌سازی ابزار')
  await mkEl(a12, 'بررسی نقشه')
  const e211 = await mkEl(a21, 'مسیریابی هارنس')
  const e212 = await mkEl(a21, 'اتصال کانکتورها')
  const e213 = await mkEl(a21, 'بستن بست‌های سیم')
  await mkEl(a22, 'بارگیری روی چرخ دستی')
  await mkEl(a22, 'انتقال به ایستگاه کنترل')
  const e311 = await mkEl(a31, 'آزمون عملکرد')
  const e312 = await mkEl(a31, 'بازرسی آب‌بندی')
  const e313 = await mkEl(a31, 'برچسب‌گذاری')

  // ── تخصیص الونس سلسله‌مراتتی ──
  // سطح ایستگاه: PP 5٪
  await req('PUT', `/api/stations/${st1}/allowances`, { ops: [{ definitionId: d1, action: 'SET', valueType: 'PERCENT', percentValue: 0.05 }] })
  await req('PUT', `/api/stations/${st2}/allowances`, { ops: [{ definitionId: d1, action: 'SET', valueType: 'PERCENT', percentValue: 0.05 }] })
  // سطح فعالیت: FB 4٪ + استراحت هر چرخه
  await req('PUT', `/api/activities/${a11}/allowances`, { ops: [
    { definitionId: d2, action: 'SET', valueType: 'PERCENT', percentValue: 0.04 },
    { definitionId: d3, action: 'SET', valueType: 'FIXED_TIME', timeValueSeconds: 120, applicationBasis: 'PER_CYCLE' },
  ] })
  await req('PUT', `/api/activities/${a21}/allowances`, { ops: [
    { definitionId: d2, action: 'SET', valueType: 'PERCENT', percentValue: 0.06 },
  ] })

  // ── اپراتورها ──
  const op1 = (await req('POST', `/api/projects/${projectId}/operators`, { displayName: 'رضا محمدی', code: 'OP-01' })).data.operator.id
  const op2 = (await req('POST', `/api/projects/${projectId}/operators`, { displayName: 'سمیرا احمدی', code: 'OP-02' })).data.operator.id

  // ── ارزیابی وستینگهاوس برای عناصر a11 ──
  const tables = (await req('GET', `/api/projects/${projectId}/rating-tables`)).data.items
  const t = tables[0]
  const put = async (elId: string, skill: string, effort: string, cond: string, cons: string) => {
    const res = await req('PUT', `/api/elements/${elId}/rating`, { ratingTableId: t.id, skillGrade: skill, effortGrade: effort, conditionsGrade: cond, consistencyGrade: cons })
    if (res.status !== 200) console.error('rating fail', elId, res.status, JSON.stringify(res.data).slice(0, 200))
  }
  await put(e111, 'B2', 'C1', 'C', 'C')
  await put(e112, 'B1', 'C2', 'C', 'D')
  await put(e113, 'C1', 'C1', 'C', 'C')
  await put(e211, 'B2', 'B1', 'C', 'C')
  await put(e212, 'C2', 'C1', 'C', 'D')
  await put(e213, 'B2', 'C2', 'C', 'C')
  await put(e311, 'B1', 'C1', 'C', 'C')
  await put(e312, 'B2', 'C1', 'C', 'C')
  await put(e313, 'C1', 'C2', 'C', 'D')

  // ── جلسات زمان‌سنجی + دادهٔ چرخه‌ها ──
  const mkSession = async (actId: string, opId: string) =>
    (await req('POST', `/api/activities/${actId}/sessions`, { operatorId: opId, timingMethod: 'SNAPBACK' })).data.session.id
  const addCycles = async (sid: string, n: number) => (await req('POST', `/api/sessions/${sid}/cycles`, { count: n })).data
  const putCell = async (sid: string, cycleNo: number, elId: string, v: number) =>
    req('PUT', `/api/sessions/${sid}/cells/${cycleNo}`, { cells: [{ cycleNo, workElementId: elId, rawDuration: v }] })

  const s1 = await mkSession(a11, op1)
  await addCycles(s1, 8)
  for (let c = 1; c <= 8; c++) {
    await putCell(s1, c, e111, 4.2 + (c % 3) * 0.1)
    await putCell(s1, c, e112, 6.8 + (c % 4) * 0.2)
    await putCell(s1, c, e113, 2.5 + (c % 2) * 0.05)
  }
  // یک مقدار مشکوک
  await putCell(s1, 4, e112, 14.9)

  const s2 = await mkSession(a21, op2)
  await addCycles(s2, 6)
  for (let c = 1; c <= 6; c++) {
    await putCell(s2, c, e211, 8.1 + (c % 3) * 0.15)
    await putCell(s2, c, e212, 5.4 + (c % 2) * 0.1)
    await putCell(s2, c, e213, 3.3 + (c % 3) * 0.08)
  }

  // ── رابطهٔ موازی بین‌فعالیت: e112 (مونتاژ) ↔ e311 (کنترل) ──
  const rel = await req('POST', `/api/projects/${projectId}/parallel-relations`, { elementAId: e112, elementBId: e311 })
  if (rel.status !== 201) console.error('relation fail:', rel.status, JSON.stringify(rel.data).slice(0, 300))

  console.log('FIXTURE-DONE')
  console.log('projectId=' + projectId)
}

main().catch((e) => { console.error(e); process.exit(1) })
export {}
