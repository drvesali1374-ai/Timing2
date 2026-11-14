// آماده‌سازی fixture مرورگر — v1.5.2 بازطراحی رابط کاربری
// پروژهٔ «مرورگر v1.5.2» با ۴ ایستگاه / ۸ فعالیت / ۱۸ عنصر +
// تعریف‌های الونس + تخصیص چندسطحی + گروه‌های فعالیت (یکی پرتعداد)
const BASE = 'http://localhost:3000'

async function req(method: string, path: string, body?: unknown): Promise<{ status: number; data: any }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  let data: any = null
  try { data = await res.json() } catch { data = null }
  return { status: res.status, data }
}

async function main() {
  // حذف پروژهٔ قبلی در صورت وجود
  const list = await req('GET', '/api/projects')
  for (const p of list.data.projects ?? []) {
    if (p.name.includes('مرورگر v1.5.2')) await req('DELETE', `/api/projects/${p.id}`)
  }

  const proj = await req('POST', '/api/projects', {
    name: 'تست مرورگر v1.5.2 — رابط کاربری',
    lineName: 'خط مونتاژ نهایی',
    productName: 'دستگاه کولر مدل K25',
    studyDate: '2026-02-01',
  })
  const projectId = proj.data.project.id
  console.log('project:', projectId)

  // ── گروه‌های فعالیت (یکی پرتعداد برای آزمون «نمایش همه فعالیت‌ها») ──
  const g1 = (await req('POST', `/api/projects/${projectId}/groups`, { name: 'کار دستی سبک', description: 'فعالیت‌های سبک بدون نیاز به تجهیزات سنگین' })).data.group.id
  const g2 = (await req('POST', `/api/projects/${projectId}/groups`, { name: 'کار ماشینی سنگین', description: 'فعالیت‌های وابسته به پرس و تجهیزات پنوماتیک با الزامات ایمنی ویژه و نیاز به دوره‌آموزشی ویژه اپراتور' })).data.group.id

  // ── ساختار: ۴ ایستگاه × ۲-۳ فعالیت × ۲-۴ عنصر ──
  const mkStation = async (name: string) => (await req('POST', `/api/projects/${projectId}/stations`, { name })).data.station.id
  const mkAct = async (stId: string, name: string, processType: string, groupId?: string) =>
    (await req('POST', `/api/stations/${stId}/activities`, { name, processType, ...(groupId ? { groupId } : {}) })).data.activity.id
  const mkEl = async (actId: string, name: string) => (await req('POST', `/api/activities/${actId}/elements`, { name })).data.element.id

  const st1 = await mkStation('ایستگاه مونتاژ بدنه')
  const st2 = await mkStation('ایستگاه سیم‌کشی')
  const st3 = await mkStation('ایستگاه کنترل کیفیت')
  const st4 = await mkStation('ایستگاه بسته‌بندی نهایی')

  const acts: Record<string, string> = {}
  acts.a11 = await mkAct(st1, 'مونتاژ شاسی روی خط', 'OPERATION', g1)
  acts.a12 = await mkAct(st1, 'پیش‌خواب کاری و آماده‌سازی', 'OPERATION', g1)
  acts.a21 = await mkAct(st2, 'سیم‌کشی بخش برق', 'OPERATION', g1)
  acts.a22 = await mkAct(st2, 'آزمون پیوستگی مدار', 'INSPECTION', g2)
  acts.a23 = await mkAct(st2, 'انتقال به ایستگاه بعد', 'TRANSPORT')
  acts.a31 = await mkAct(st3, 'بازرسی چشمی نهایی', 'INSPECTION', g2)
  acts.a32 = await mkAct(st3, 'انتظار برای تأیید', 'DELAY')
  acts.a41 = await mkAct(st4, 'جای‌گذاری در کارتن', 'OPERATION', g1)
  acts.a42 = await mkAct(st4, 'انبارش پالت‌های کامل', 'STORAGE', g2)

  const els: Record<string, string> = {}
  const addEl = async (key: string, actKey: string, name: string) => { els[key] = await mkEl(acts[actKey], name) }
  await addEl('e1', 'a11', 'قراردادن شاسی روی گراناق')
  await addEl('e2', 'a11', 'بستن چهار پیچ پایه')
  await addEl('e3', 'a11', 'کنترل تراز اولیه')
  await addEl('e4', 'a12', 'برداشتن قطعات از پالت')
  await addEl('e5', 'a21', 'کشیدن هارنس اصلی')
  await addEl('e6', 'a21', 'اتصال کانکتورها')
  await addEl('e7', 'a21', 'بستن چنت هارنس')
  await addEl('e8', 'a22', 'اتصال مولتی‌متر')
  await addEl('e9', 'a22', 'ثبت مقادیر')
  await addEl('e10', 'a23', 'حرکت چرخ دستی به ایستگاه بعد')
  await addEl('e11', 'a31', 'چرخش قطعه و بازرسی سطوح')
  await addEl('e12', 'a31', 'ثبت نتیجه در چک‌لیست')
  await addEl('e13', 'a32', 'ایستادن در انتظار بازرس')
  await addEl('e14', 'a41', 'قراردادن محصول در کارتن')
  await addEl('e15', 'a41', 'درج بروشور و لیبل')
  await addEl('e16', 'a41', 'بستن کارتن با چسب')
  await addEl('e17', 'a42', 'جابه‌جایی پالت به انبار')
  await addEl('e18', 'a42', 'ثبت رسید انبار')

  // ── اپراتورها + جلسات + چرخه‌ها (برای ماتریس/تحلیل) ──
  const ops: string[] = []
  for (const n of ['اپراتور رضا', 'اپراتور مریم', 'اپراتور حسین']) {
    ops.push((await req('POST', `/api/projects/${projectId}/operators`, { displayName: n })).data.operator.id)
  }
  const mkSession = async (actKey: string, opIdx: number) =>
    (await req('POST', `/api/activities/${acts[actKey]}/sessions`, { operatorId: ops[opIdx], timingMethod: 'SNAPBACK' })).data.session.id
  const sA = await mkSession('a11', 0)
  const sB = await mkSession('a21', 1)
  for (const s of [sA, sB]) await req('POST', `/api/sessions/${s}/cycles`, { count: 3 })

  // رابطهٔ موازی هم‌فعالیتی برای ماتریس
  await req('POST', `/api/projects/${projectId}/overlap/relations`, { elementAId: els.e1, elementBId: els.e2 })
  await req('POST', `/api/projects/${projectId}/overlap/relations`, { elementAId: els.e5, elementBId: els.e6 })

  // دادهٔ چرخه‌ها برای e1/e2
  const shA = (await req('GET', `/api/sessions/${sA}`)).data.sheet
  for (const c of shA.cycles) {
    await req('PUT', `/api/cycles/${c.id}/cells`, {
      cells: [
        { cycleId: c.id, workElementId: els.e1, startOffset: 0, endOffset: 10 },
        { cycleId: c.id, workElementId: els.e2, startOffset: 4, endOffset: 10 },
      ],
    })
  }

  // ── الونس‌ها: تعریف مرکزی + تخصیص PROJECT + STATION + ACTIVITY ──
  const d1 = (await req('POST', `/api/projects/${projectId}/allowance-definitions`, { title: 'نیازهای شخصی', code: 'PP-1', defaultValueType: 'PERCENT', defaultValuePercent: 0.05, description: 'استراحت کوتاه شخصی در طول شیفت' })).data.definition.id
  const d2 = (await req('POST', `/api/projects/${projectId}/allowance-definitions`, { title: 'استراحت شیفت', code: 'BR-1', defaultValueType: 'FIXED_TIME', defaultTimeSeconds: 300, description: 'زمان ثابت استراحت هر شیفت کاری' })).data.definition.id
  const d3 = (await req('POST', `/api/projects/${projectId}/allowance-definitions`, { title: 'خستگی محیطی', code: 'FA-1', defaultValueType: 'PERCENT', defaultValuePercent: 0.04, description: 'جبران خستگی ناشی از گرما و سر و صدا' })).data.definition.id
  const d4 = (await req('POST', `/api/projects/${projectId}/allowance-definitions`, { title: 'تعویض ابزار', code: 'TC-1', defaultValueType: 'FIXED_TIME', defaultTimeSeconds: 45, description: 'زمان تعویض دوره‌ای ابزار فرسوده' })).data.definition.id

  // تخصیص سطح خط (PROJECT)
  await req('PUT', `/api/projects/${projectId}/allowances`, { allowances: [
    { definitionId: d1, valueType: 'PERCENT', percentValue: 0.06 },
    { definitionId: d2, valueType: 'FIXED_TIME', timeValueSeconds: 300, applicationBasis: 'PER_CYCLE' },
  ] })
  // تخصیص سطح ایستگاه (st2) — جایگزینی + استثنا
  await req('PUT', `/api/stations/${st2}/allowances`, { allowances: [
    { definitionId: d1, valueType: 'PERCENT', percentValue: 0.08 },
    { definitionId: d3, valueType: 'PERCENT', percentValue: 0.04 },
  ] })
  // تخصیص سطح فعالیت (a41)
  await req('PUT', `/api/activities/${acts.a41}/allowances`, { allowances: [
    { definitionId: d4, valueType: 'FIXED_TIME', timeValueSeconds: 45, applicationBasis: 'PER_ELEMENT_EXECUTION' },
  ] })

  console.log('fixture v1.5.2 ready — project:', projectId)
}

main().catch((e) => { console.error(e); process.exit(1) })
