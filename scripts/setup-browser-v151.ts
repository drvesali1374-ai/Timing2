// آماده‌سازی fixture مرورگر — v1.5.1 روابط بین‌فعالیت
// پروژهٔ «بروزرسانی مرورگر v1.5.1» با ۲ ایستگاه / ۳ فعالیت / روابط cross-activity
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
    if (p.name.includes('مرورگر v1.5.1')) await req('DELETE', `/api/projects/${p.id}`)
  }

  const proj = await req('POST', '/api/projects', { name: 'تست مرورگر v1.5.1 — بین‌فعالیت', lineName: 'خط مونتاژ', productName: 'محصول X', studyDate: '2026-01-15' })
  const projectId = proj.data.project.id
  const st1 = (await req('POST', `/api/projects/${projectId}/stations`, { name: 'ایستگاه مونتاژ' })).data.station.id
  const st2 = (await req('POST', `/api/projects/${projectId}/stations`, { name: 'ایستگاه بسته‌بندی' })).data.station.id
  const actA = (await req('POST', `/api/stations/${st1}/activities`, { name: 'فعالیت مونتاژ بدنه', processType: 'OPERATION' })).data.activity.id
  const actB = (await req('POST', `/api/stations/${st1}/activities`, { name: 'فعالیت کنترل کیفیت', processType: 'INSPECTION' })).data.activity.id
  const actC = (await req('POST', `/api/stations/${st2}/activities`, { name: 'فعالیت بسته‌بندی', processType: 'OPERATION' })).data.activity.id

  const el = async (actId: string, name: string) => (await req('POST', `/api/activities/${actId}/elements`, { name })).data.element.id
  const A1 = await el(actA, 'قراردادن قطعه')
  const A2 = await el(actA, 'پیش‌خواب کاری')
  const B1 = await el(actB, 'بازرسی چشمی')
  const C1 = await el(actC, 'جای‌گذاری در کارتن')

  const ops: string[] = []
  for (const n of ['اپراتور رضا', 'اپراتور مریم']) {
    ops.push((await req('POST', `/api/projects/${projectId}/operators`, { displayName: n })).data.operator.id)
  }
  const sA = (await req('POST', `/api/activities/${actA}/sessions`, { operatorId: ops[0], timingMethod: 'SNAPBACK' })).data.session.id
  const sA2 = (await req('POST', `/api/activities/${actA}/sessions`, { operatorId: ops[1], timingMethod: 'SNAPBACK' })).data.session.id
  const sB = (await req('POST', `/api/activities/${actB}/sessions`, { operatorId: ops[0], timingMethod: 'SNAPBACK' })).data.session.id
  const sC = (await req('POST', `/api/activities/${actC}/sessions`, { operatorId: ops[0], timingMethod: 'SNAPBACK' })).data.session.id
  for (const s of [sA, sA2, sB, sC]) await req('POST', `/api/sessions/${s}/cycles`, { count: 3 })

  // رابطه‌ها: A1-A2 هم‌فعالیت؛ A1-B1 بین‌فعالیت (هم‌ایستگاه)؛ B1-C1 بین‌فعالیت + بین‌ایستگاه
  const r1 = await req('POST', `/api/projects/${projectId}/overlap/relations`, { elementAId: A1, elementBId: A2 })
  const r2 = await req('POST', `/api/projects/${projectId}/overlap/relations`, { elementAId: A1, elementBId: B1 })
  const r3 = await req('POST', `/api/projects/${projectId}/overlap/relations`, { elementAId: B1, elementBId: C1 })
  console.log('relations:', r1.status, r2.status, r3.status)

  // دادهٔ چرخه‌ها: A1=[0,10) A2=[4,10) در همهٔ چرخه‌های sA → هم‌پوشانی ۶
  const shA = (await req('GET', `/api/sessions/${sA}`)).data.sheet
  for (const c of shA.cycles) {
    await req('PUT', `/api/cycles/${c.id}/cells`, {
      cells: [
        { cycleId: c.id, workElementId: A1, startOffset: 0, endOffset: 10 },
        { cycleId: c.id, workElementId: A2, startOffset: 4, endOffset: 10 },
      ],
    })
  }
  // مقدار قطعی A1-A2 در چرخهٔ ۱ = ۶ (قابل‌مقایسه)
  await req('PUT', `/api/cycles/${shA.cycles[0].id}/overlaps`, {
    updates: [{ relationId: r1.data.relation.id, status: 'OVERLAP', overlapDuration: 6 }],
  })
  await req('PUT', `/api/cycles/${shA.cycles[1].id}/overlaps`, {
    updates: [{ relationId: r1.data.relation.id, status: 'NO_OVERLAP' }],
  })

  console.log(JSON.stringify({ projectId, actA, actB, actC, A1, A2, B1, C1, sA, sA2, sB, sC, relA1B1: r2.data.relation.id, relB1C1: r3.data.relation.id }, null, 2))
}

main().catch((e) => { console.error(e); process.exit(1) })

export {}
