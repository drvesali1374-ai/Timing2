// اصلاح تخصیص الونس‌های fixture v1.5.2 — قالب صحیح ops
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
  const list = await req('GET', '/api/projects')
  const p = (list.data.items ?? []).find((x: any) => x.name.includes('مرورگر v1.5.2'))
  if (!p) throw new Error('project not found')
  const projectId = p.id

  const defs = (await req('GET', `/api/projects/${projectId}/allowance-definitions`)).data.items
  const byCode = (c: string) => defs.find((d: any) => d.code === c)?.id
  const d1 = byCode('PP-1'), d2 = byCode('BR-1'), d3 = byCode('FA-1'), d4 = byCode('TC-1')

  // سطح خط (PROJECT)
  let r = await req('PUT', `/api/projects/${projectId}/allowances`, { ops: [
    { definitionId: d1, action: 'SET', valueType: 'PERCENT', percentValue: 0.06 },
    { definitionId: d2, action: 'SET', valueType: 'FIXED_TIME', timeValueSeconds: 300, applicationBasis: 'PER_CYCLE' },
  ] })
  console.log('project:', r.status)

  // سطح ایستگاه سیم‌کشی — جایگزینی PP + افزودنی FA
  const stations = (await req('GET', `/api/projects/${projectId}/structure`)).data.stations
  const st2 = stations.find((s: any) => s.name.includes('سیم‌کشی'))
  r = await req('PUT', `/api/stations/${st2.id}/allowances`, { ops: [
    { definitionId: d1, action: 'SET', valueType: 'PERCENT', percentValue: 0.08 },
    { definitionId: d3, action: 'SET', valueType: 'PERCENT', percentValue: 0.04 },
  ] })
  console.log('station:', r.status)

  // سطح فعالیت «جای‌گذاری در کارتن» — زمان ثابت هر اجرا
  const st4 = stations.find((s: any) => s.name.includes('بسته‌بندی'))
  const a41 = st4.activities.find((a: any) => a.name.includes('جای‌گذاری'))
  r = await req('PUT', `/api/activities/${a41.id}/allowances`, { ops: [
    { definitionId: d4, action: 'SET', valueType: 'FIXED_TIME', timeValueSeconds: 45, applicationBasis: 'PER_ELEMENT_EXECUTION' },
  ] })
  console.log('activity:', r.status)

  // استثنا: حذف از ارث‌بری «استراحت شیفت» در فعالیت بسته‌بندی — برای ستون وضعیت/توضیح
  const a42 = st4.activities.find((a: any) => a.name.includes('انبارش'))
  r = await req('PUT', `/api/activities/${a42.id}/allowances`, { ops: [
    { definitionId: d2, action: 'EXCLUDE' },
  ] })
  console.log('exclude:', r.status)

  const chk = (await req('GET', `/api/projects/${projectId}/allowances`)).data
  console.log('project rows:', chk.resolved.rows.length, 'summary:', JSON.stringify(chk.resolved.summary))
}

main().catch((e) => { console.error(e); process.exit(1) })
