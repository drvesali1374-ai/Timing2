// آماده‌سازی fixture مرورگر — v1.5.2 نهایی (بازبینی اصلاحات ۵گانه)
// پروژهٔ تست با ۳ ایستگاه / ۶ فعالیت + جلسهٔ زمان‌سنجی با داده
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
  const list = await req('GET', '/api/projects')
  for (const p of list.data.items ?? []) {
    if (p.name.includes('بازبینی نهایی v1.5.2')) await req('DELETE', `/api/projects/${p.id}`)
  }

  const proj = await req('POST', '/api/projects', {
    name: 'تست بازبینی نهایی v1.5.2 — نمودار',
    lineName: 'خط مونتاژ نهایی',
    productName: 'دستگاه کولر مدل K25',
    studyDate: '2026-02-01',
  })
  const projectId = proj.data.project.id
  console.log('project:', projectId)

  const mkStation = async (name: string) => (await req('POST', `/api/projects/${projectId}/stations`, { name })).data.station.id
  const mkAct = async (stId: string, name: string, processType: string) =>
    (await req('POST', `/api/stations/${stId}/activities`, { name, processType })).data.activity.id
  const mkEl = async (actId: string, name: string) => (await req('POST', `/api/activities/${actId}/elements`, { name })).data.element.id

  const st1 = await mkStation('ایستگاه مونتاژ بدنه')
  const st2 = await mkStation('ایستگاه سیم‌کشی')
  const st3 = await mkStation('ایستگاه کنترل کیفیت')

  const a11 = await mkAct(st1, 'قرار دادن شاسی روی فیکسچر مونتاژ', 'OPERATION')
  const a12 = await mkAct(st1, 'پیش‌خواب کاری و آماده‌سازی ابزار', 'OPERATION')
  const a21 = await mkAct(st2, 'سیم‌کشی هارنس اصلی کولر', 'OPERATION')
  const a22 = await mkAct(st2, 'حمل بدنه به ایستگاه کنترل', 'TRANSPORT')
  const a31 = await mkAct(st3, 'کنترل کیفیت نهایی محصول', 'INSPECTION')
  const a32 = await mkAct(st3, 'انبارش محصول نهایی در پالت', 'STORAGE')

  const e111 = await mkEl(a11, 'قرار دادن شاسی روی فیکسچر و قفل کردن گیره‌ها')
  const e112 = await mkEl(a11, 'بستن چهار پیچ قید خودکار')
  const e113 = await mkEl(a11, 'کنترل صافی سطح با گیج')
  await mkEl(a12, 'آماده‌سازی ابزار و تمیزکاری محل')
  await mkEl(a12, 'بررسی نقشه و دستور کار')
  await mkEl(a21, 'مسیریابی هارنس در کانال')
  await mkEl(a21, 'اتصال کانکتورهای اصلی')
  await mkEl(a22, 'خروج بدنه از خط')
  await mkEl(a31, 'بازرسی چشمی قطعات')
  await mkEl(a31, 'تست عملکرد نهایی')
  await mkEl(a32, 'چیدن محصول در پالت')

  // گره دستی برای تست ابزارهای هاور (ویرایش/حذف) + یال دستی با ظاهر سفارشی
  const chart = await req('GET', `/api/projects/${projectId}/charts/FPC`)
  const nodes = chart.data.nodes
  console.log('FPC nodes:', nodes.length)

  // جلسهٔ زمان‌سنجی برای تست ارتفاع جدول
  const op = await req('POST', `/api/projects/${projectId}/operators`, { displayName: 'اپراتور الف' })
  const operatorId = op.data.operator?.id ?? op.data.id
  const session = await req('POST', `/api/activities/${a11}/sessions`, {
    operatorId,
    timingMethod: 'SNAPBACK',
  })
  const sessionId = session.data.session.id
  const cycles = await req('POST', `/api/sessions/${sessionId}/cycles`, { count: 3 })
  const cycleList = cycles.data.created
  const sheet = (await req('GET', `/api/sessions/${sessionId}`)).data.sheet
  const sheetElements = sheet.elements.filter((e: any) => [e111, e112, e113].includes(e.id))
  let ci = 0
  for (const cyc of cycleList) {
    const cells = sheetElements.map((el: any, idx: number) => ({
      workElementId: el.id,
      rawDuration: Math.round((5.2 + idx * 1.7 + ci * 0.4) * 100) / 100,
    }))
    await req('PUT', `/api/cycles/${cyc.id}/cells`, { cells })
    ci++
  }
  console.log('cycles created:', ci)

  console.log(JSON.stringify({ projectId }))
}

main().catch((e) => { console.error(e); process.exit(1) })
