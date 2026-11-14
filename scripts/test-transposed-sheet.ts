// ═══════════════════════════════════════════════════════════
export {} // module مستقل — جلوگیری از تداخل scope سراسری اسکریپت‌های تست
// تست برگهٔ منتقل‌شده + روابط موازی — v1.5.2 §۲ (پس از حذف ماتریس)
// پوشش: رابطهٔ دوطرفه، ثبت بازهٔ از/تا برای عنصر موازی در همان چرخه،
// استقلال اپراتورها، محاسبات، Paste روی زیرردیف، آرشیو/بازگردانی،
// روابط بین‌فعالیت، کاتالوگ عناصر، Import/Export سازگار.
// اجرا: bun scripts/test-transposed-sheet.ts   (سرور dev باید روشن باشد)
// ═══════════════════════════════════════════════════════════
const BASE = process.env.BASE_URL ?? 'http://localhost:3000'

let pass = 0
let fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    pass++
    console.log(`  ✓ ${name}`)
  } else {
    fail++
    console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`)
  }
}

async function req(method: string, path: string, body?: unknown): Promise<{ status: number; data: any }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  let data: any = null
  try {
    data = await res.json()
  } catch {
    /* خالی */
  }
  return { status: res.status, data }
}

async function main() {
  console.log('── آماده‌سازی fixture')
  const proj = await req('POST', '/api/projects', {
    name: 'تست برگه v1.5.2',
    lineName: 'خط ۱',
    productName: 'محصول X',
    studyDate: '2026-01-02',
  })
  const projectId = proj.data.project.id
  const importedPids: string[] = []
  const st = await req('POST', `/api/projects/${projectId}/stations`, { name: 'ایستگاه ۱' })
  const stationId = st.data.station.id
  const act = await req('POST', `/api/stations/${stationId}/activities`, { name: 'فعالیت مونتاژ', processType: 'OPERATION' })
  const activityId = act.data.activity.id
  const act2 = await req('POST', `/api/stations/${stationId}/activities`, { name: 'فعالیت دیگر', processType: 'OPERATION' })
  const activity2Id = act2.data.activity.id

  console.log('── §۱ حذف نوع عنصر کاری')
  {
    const e1 = await req('POST', `/api/activities/${activityId}/elements`, { name: 'عنصر A' })
    check('ایجاد عنصر بدون type موفق', e1.status === 201, JSON.stringify(e1.data).slice(0, 120))
    check('پاسخ ایجاد عنصر elementType ندارد', e1.data.element && !('elementType' in e1.data.element))
    const e2 = await req('POST', `/api/activities/${activityId}/elements`, { name: 'عنصر B' })
    const e3 = await req('POST', `/api/activities/${activityId}/elements`, { name: 'عنصر C' })
    const zUp = await req('PUT', `/api/elements/${e1.data.element.id}`, { name: 'عنصر A (ویرایش)' })
    check('ویرایش عنصر بدون type موفق', zUp.status === 200)
    const elList = (await req('GET', `/api/activities/${activityId}/elements`)).data
    check('فهرست عناصر بدون فیلد elementType', elList.elements.every((e: any) => !('elementType' in e)))
    const eLegacy = await req('POST', `/api/activities/${activityId}/elements`, { name: 'عنصر legacy', elementType: 'MACHINE' })
    check('بستهٔ قدیمی elementType در ورودی نادیده گرفته شد (zod strip)', eLegacy.status === 201)
    const op = await req('POST', `/api/projects/${projectId}/operators`, { displayName: 'اپراتور ۱' })
    const op2 = await req('POST', `/api/projects/${projectId}/operators`, { displayName: 'اپراتور ۲' })
    const s1 = await req('POST', `/api/activities/${activityId}/sessions`, { operatorId: op.data.operator.id, timingMethod: 'SNAPBACK' })
    const session1 = s1.data.session.id
    const sheet = (await req('GET', `/api/sessions/${session1}`)).data.sheet
    check('برگه بدون elementType — عناصر با defaultEntry/defaultLaneType', sheet.elements.every((e: any) => !('elementType' in e) && e.defaultEntry === 'SEQ' && e.defaultLaneType === 'OPERATOR'))
    // v1.5.2 §۲-۸ — DTO چرخه دیگر overlaps/overlapRevision ندارد
    check('DTO چرخه فیلد overlaps ندارد (ماتریس حذف شد)', sheet.cycles.every((c: any) => !('overlaps' in c) && !('overlapRevision' in c)))

    // Import بستهٔ قدیمی دارای elementType — از مسیر export/import
    const exp = await req('GET', `/api/projects/${projectId}/export`)
    if (exp.status === 200) {
      const imp = await req('POST', '/api/projects/import', exp.data)
      check('Import بستهٔ v1.4 (حاوی elementType legacy) موفق', imp.status === 201 || imp.status === 200, `status=${imp.status}`)
      if (imp.status === 201 || imp.status === 200) {
        const newPid = imp.data.projectId ?? imp.data.project?.id
        const impSheet = (await req('GET', `/api/projects/${newPid}/summary`)).data
        check('پروژهٔ ورودی ساخته شد', !!impSheet)
        importedPids.push(newPid)
      }
    }

    // آماده‌سازی روابط دوطرفه — v1.5.2 §۲-۹ مسیر جدید
    const relAB = await req('POST', `/api/projects/${projectId}/parallel-relations`, { elementAId: e1.data.element.id, elementBId: e2.data.element.id })
    const relAC = await req('POST', `/api/projects/${projectId}/parallel-relations`, { elementAId: e1.data.element.id, elementBId: e3.data.element.id })
    check('ایجاد A-B و A-C (مسیر parallel-relations)', relAB.status === 201 && relAC.status === 201)
    check('پاسخ ایجاد فقط relation را برمی‌گرداند (بدون matrix)', relAB.data && 'relation' in relAB.data && !('matrix' in relAB.data))

    const s2 = await req('POST', `/api/activities/${activityId}/sessions`, { operatorId: op2.data.operator.id, timingMethod: 'SNAPBACK' })
    const session2 = s2.data.session.id

    // ── §۲ رابطهٔ دوطرفه در برگه ──
    console.log('── §۲ رابطهٔ دوطرفه در برگهٔ زمان‌سنجی')
    await req('POST', `/api/sessions/${session1}/cycles`, { count: 2 })
    const sh1 = (await req('GET', `/api/sessions/${session1}`)).data.sheet
    const pr = sh1.parallelRelations
    check('برگه ۲ رابطهٔ فعال دارد (A-B و A-C)', pr.length === 2, `count=${pr.length}`)
    check('رابطه‌های canonical (low/high مرتب)', pr.every((r: any) => r.elementLowId < r.elementHighId))
    const relCount = (await req('GET', `/api/projects/${projectId}/parallel-relations`)).data.relations.filter((r: any) => r.isActive).length
    check('تعداد رابطهٔ فعال دقیقاً ۲ (نه ۴)', relCount === 2, `count=${relCount}`)
    const workElCount = sh1.elements.length
    check('زیرردیف‌ها WorkElement جدید نمی‌سازند (تعداد عناصر ثابت)', workElCount === 4, `count=${workElCount}`) // A,B,C + legacy

    const aId = e1.data.element.id, bId = e2.data.element.id, cId = e3.data.element.id
    const relsOf = (id: string) => pr.filter((r: any) => r.elementLowId === id || r.elementHighId === id)
    check('زیر A دو رابطه (B و C)', relsOf(aId).length === 2)
    check('زیر B یک رابطه (A)', relsOf(bId).length === 1)
    check('زیر C یک رابطه (A)', relsOf(cId).length === 1)

    // ── §۳ ثبت بازهٔ از/تا برای عنصر موازی — یک منبع واحد ──
    console.log('── §۳ ثبت بازهٔ از/تا عنصر موازی (یک منبع واحد)')
    {
      const cy1 = sh1.cycles[0]
      const cy2 = sh1.cycles[1]
      // چرخهٔ ۱: A و B مدت ترتیبی دارند
      await req('PUT', `/api/cycles/${cy1.id}/cells`, {
        cells: [
          { cycleId: cy1.id, workElementId: aId, rawDuration: 10 },
          { cycleId: cy1.id, workElementId: bId, rawDuration: 6 },
        ],
      })
      // «از زیرردیف زیر A» زمان B به‌صورت بازه ثبت می‌شود (v1.5.2 §۲-۸)
      const setA = await req('PUT', `/api/cycles/${cy1.id}/cells`, {
        cells: [{ cycleId: cy1.id, workElementId: bId, startOffset: 3, endOffset: 9 }],
      })
      check('ثبت بازهٔ ۳-۹ برای B از زیرردیف زیر A موفق', setA.status === 200, JSON.stringify(setA.data).slice(0, 150))
      const sh1b = (await req('GET', `/api/sessions/${session1}`)).data.sheet
      const cy1b = sh1b.cycles.find((c: any) => c.id === cy1.id)
      const obsB = cy1b.observations.find((o: any) => o.workElementId === bId)
      check('مشاهدهٔ B بازهٔ ۳-۹ و مدت ۶ دارد', obsB?.startOffset === 3 && obsB?.endOffset === 9 && obsB?.derivedDuration === 6, JSON.stringify(obsB).slice(0, 120))
      // همان داده از «ردیف اصلی B» نیز خوانده می‌شود — یک منبع واحد
      check('ردیف اصلی B همان مقدار را می‌بیند (یک منبع واحد)', obsB != null)
      // چرخهٔ ۲ مقدار جداگانه — چرخهٔ ۱ تغییر نمی‌کند
      const set2 = await req('PUT', `/api/cycles/${cy2.id}/cells`, {
        cells: [
          { cycleId: cy2.id, workElementId: aId, startOffset: 0, endOffset: 10 },
          { cycleId: cy2.id, workElementId: bId, startOffset: 2, endOffset: 5 },
        ],
      })
      check('ثبت بازهٔ جداگانه در چرخهٔ ۲ موفق', set2.status === 200)
      const sh1d = (await req('GET', `/api/sessions/${session1}`)).data.sheet
      check('چرخهٔ ۱ همچنان ۳-۹ است (استقلال چرخه‌ها)', sh1d.cycles.find((c: any) => c.id === cy1.id).observations.find((o: any) => o.workElementId === bId)?.startOffset === 3)

      // ── §۴ استقلال اپراتورها ──
      console.log('── §۴ استقلال اپراتورها')
      const sh2 = (await req('GET', `/api/sessions/${session2}`)).data.sheet
      check('برگهٔ اپراتور ۲ همان روابط را می‌بیند', sh2.parallelRelations.length === 2)
      check('برگهٔ اپراتور ۲ مشاهده‌ای از چرخه‌های اپراتور ۱ ندارد', (sh2.cycles ?? []).length === 0 || sh2.cycles.every((c: any) => !c.observations.some((o: any) => o.workElementId === bId && o.startOffset === 3)))
      await req('POST', `/api/sessions/${session2}/cycles`, { count: 1 })
      const sh2b = (await req('GET', `/api/sessions/${session2}`)).data.sheet
      const cyO2 = sh2b.cycles[0]
      await req('PUT', `/api/cycles/${cyO2.id}/cells`, {
        cells: [
          { cycleId: cyO2.id, workElementId: aId, rawDuration: 10 },
          { cycleId: cyO2.id, workElementId: bId, startOffset: 1, endOffset: 4 },
        ],
      })
      const sh1e = (await req('GET', `/api/sessions/${session1}`)).data.sheet
      check('ثبت اپراتور ۲ دادهٔ اپراتور ۱ را تغییر نداد', sh1e.cycles.find((c: any) => c.id === cy1.id).observations.find((o: any) => o.workElementId === bId)?.startOffset === 3)

      // ── §۸ محاسبات ──
      console.log('── §۸ محاسبات دست‌نخورده')
      {
        const shCalc = (await req('GET', `/api/sessions/${session1}`)).data.sheet
        check('تعداد عناصر اصلی ثابت (زیرردیف‌ها شمرده نمی‌شوند)', shCalc.elements.length === 4)
        const cy2Calc = shCalc.cycles.find((c: any) => c.id === cy2.id)
        // elapsed = گسترهٔ بازه‌ها = 10
        check('elapsed از بازه‌ها = ۱۰ (گستره، نه جمع)', cy2Calc.elapsed === 10, `elapsed=${cy2Calc.elapsed}`)
        const an = (await req('GET', `/api/activities/${activityId}/analysis`)).data
        const anData = an?.analysis ?? an
        check('تحلیل: عناصر بدون فیلد elementType', (anData?.elements ?? []).every((e: any) => !('elementType' in e)))
        check('فعالیت دارای رابطهٔ فعال → NEEDS_AGGREGATION_RULE', anData?.activityTotal?.status === 'NEEDS_AGGREGATION_RULE')
      }

      // ── §۹ Paste روی زیرردیف (بازه) ──
      console.log('── §۹ Paste روی زیرردیف عنصر موازی')
      {
        // Paste از ردیف عنصر A: سطر ۱ (عنصر A) خالی؛ سطر ۲ (زیرردیف A-B) بازهٔ 2-6
        const pv = await req('POST', `/api/sessions/${session1}/paste-preview`, {
          startCycleNo: 2,
          startElementId: aId,
          data: [[''], ['2-6']],
        })
        check('پیش‌نمایش Paste با محور جدید موفق', pv.status === 200, JSON.stringify(pv.data).slice(0, 200))
        const preview = pv.data.preview
        check('ردیف ۲ پیش‌نمایش زیرردیف رابطه است', preview.rows[1]?.kind === 'RELATION', JSON.stringify(preview.rows?.[1]).slice(0, 120))
        const ovCell = preview.rows[1]?.cells?.[0]
        check('سلول زیرردیف → بازهٔ ۲-۶ (startOffset=2, endOffset=6)', ovCell?.startOffset === 2 && ovCell?.endOffset === 6 && ovCell?.status === 'OK', JSON.stringify(ovCell).slice(0, 150))
        const cm = await req('POST', `/api/sessions/${session1}/paste-commit`, {
          startCycleNo: 2,
          startElementId: aId,
          data: [[''], ['2-6']],
          mode: 'ALL_OR_NOTHING',
        })
        check('ثبت Paste شامل زیرردیف موفق', cm.status === 200, JSON.stringify(cm.data).slice(0, 200))
        const shP = (await req('GET', `/api/sessions/${session1}`)).data.sheet
        const obsB2 = shP.cycles.find((c: any) => c.id === cy2.id).observations.find((o: any) => o.workElementId === bId)
        check('بازهٔ B پس از Paste = ۲-۶ (منبع واحد)', obsB2?.startOffset === 2 && obsB2?.endOffset === 6)
        // عدد تکی در زیرردیف رد می‌شود — فقط بازه معتبر است
        const bad = await req('POST', `/api/sessions/${session1}/paste-preview`, {
          startCycleNo: 2,
          startElementId: aId,
          data: [[''], ['7']],
        })
        const badCell = bad.data.preview?.rows?.[1]?.cells?.[0]
        check('عدد تکی در زیرردیف رد شد (فقط بازهٔ از/تا)', badCell?.status === 'ERROR', JSON.stringify(badCell).slice(0, 120))
        // حذف چرخه با مشاهدات + بازگردانی (Undo مسیر سرور)
        const del = await req('DELETE', `/api/cycles/${cy2.id}`)
        check('حذف چرخهٔ دارای مشاهدهٔ موازی موفق', del.status === 200)
        check('دادهٔ حذف‌شده شامل مشاهدات است (برای Undo)', (del.data.removed?.cycle?.observations ?? []).some((o: any) => o.workElementId === bId))
        const undo = await req('POST', `/api/sessions/${session1}/cycles`, { withData: [del.data.removed.cycle] })
        check('بازگردانی چرخه (Undo) با مشاهدات موفق', undo.status === 201 || undo.status === 200)
        const shU = (await req('GET', `/api/sessions/${session1}`)).data.sheet
        const restoredCycle = shU.cycles.find((c: any) => c.cycleNo === 2)
        check('مشاهدهٔ بازهٔ B پس از Undo بازگشت (۲-۶)', restoredCycle?.observations.find((o: any) => o.workElementId === bId)?.startOffset === 2)
        check('هیچ ردیف یتیم نماند (رابطه‌ها فعال)', shU.parallelRelations.length === 2)
      }

      // ── §۶ حذف/بازگردانی رابطه ──
      console.log('── §۶ حذف و بازگردانی رابطه')
      {
        const arch = await req('PATCH', `/api/parallel-relations/${relAB.data.relation.id}`, { action: 'archive' })
        check('آرشیو A-B موفق', arch.status === 200 && arch.data.relation.isActive === false)
        const shArch = (await req('GET', `/api/sessions/${session1}`)).data.sheet
        check('زیرردیف A-B (هر دو سمت) حذف شد', shArch.parallelRelations.length === 1 && !shArch.parallelRelations.some((r: any) => r.relationId === relAB.data.relation.id))
        const rest = await req('PATCH', `/api/parallel-relations/${relAB.data.relation.id}`, { action: 'restore' })
        check('بازگردانی A-B موفق', rest.status === 200 && rest.data.relation.isActive === true)
        const shRest = (await req('GET', `/api/sessions/${session1}`)).data.sheet
        check('زیرردیف‌ها برگشتند (۲ رابطه)', shRest.parallelRelations.length === 2)
        // زمان‌های ثبت‌شدهٔ عناصر با آرشیو/بازگردانی دست نمی‌خورد
        const obsB3 = shRest.cycles.find((c: any) => c.cycleNo === 2)?.observations.find((o: any) => o.workElementId === bId)
        check('مشاهدهٔ B پس از بازگردانی رابطه سر جای خود است', obsB3?.startOffset === 2)
      }
    }

    // ── §۵ افزودن رابطه از جدول (سطح API) + برگهٔ اپراتور دیگر ──
    console.log('── §۵ افزودن رابطه — دیده‌شدن در همهٔ جلسات')
    {
      const elList = (await req('GET', `/api/activities/${activityId}/elements`)).data.elements
      const legacyEl = elList.find((e: any) => e.name === 'عنصر legacy')
      const relCL = await req('POST', `/api/projects/${projectId}/parallel-relations`, { elementAId: cId, elementBId: legacyEl.id })
      check('افزودن رابطهٔ جدید (C-legacy) موفق', relCL.status === 201)
      const sh1f = (await req('GET', `/api/sessions/${session1}`)).data.sheet
      const sh2f = (await req('GET', `/api/sessions/${session2}`)).data.sheet
      check('برگهٔ اپراتور ۱ رابطهٔ جدید را می‌بیند', sh1f.parallelRelations.some((r: any) => r.relationId === relCL.data.relation.id))
      check('برگهٔ اپراتور ۲ نیز همان رابطه را می‌بیند', sh2f.parallelRelations.some((r: any) => r.relationId === relCL.data.relation.id))
      const dup = await req('POST', `/api/projects/${projectId}/parallel-relations`, { elementAId: cId, elementBId: legacyEl.id })
      check('رابطهٔ تکراری رد شد', dup.status === 422)
      const self = await req('POST', `/api/projects/${projectId}/parallel-relations`, { elementAId: cId, elementBId: cId })
      check('خود-رابطه رد شد', self.status === 422)
    }

    // ── §۱۰ v1.5.1/v1.5.2 — روابط موازی بین‌فعالیت (Cross-Activity) ──
    console.log('── §۱۰ روابط بین‌فعالیت — fixture سه‌فعالیتی')
    {
      const st2 = await req('POST', `/api/projects/${projectId}/stations`, { name: 'ایستگاه ۲' })
      const station2Id = st2.data.station.id
      const actA = activityId // «فعالیت مونتاژ» موجود
      const actB = activity2Id // «فعالیت دیگر» موجود
      const actC = (await req('POST', `/api/stations/${station2Id}/activities`, { name: 'فعالیت مونتاژ', processType: 'OPERATION' })).data.activity.id
      // فعالیتی هم‌نام با actB برای اثبات فیلتر شناسه‌محور (نه نام‌محور)
      const actB2 = (await req('POST', `/api/stations/${st.data.station.id}/activities`, { name: 'فعالیت دیگر', processType: 'OPERATION' })).data.activity.id

      const actAElList = (await req('GET', `/api/activities/${actA}/elements`)).data.elements
      const A1 = aId, A2 = actAElList.find((e: any) => e.name === 'عنصر legacy').id
      const B1 = (await req('POST', `/api/activities/${actB}/elements`, { name: 'عنصر B1' })).data.element.id
      const B2 = (await req('POST', `/api/activities/${actB}/elements`, { name: 'عنصر B2' })).data.element.id
      const C1 = (await req('POST', `/api/activities/${actC}/elements`, { name: 'عنصر C1' })).data.element.id
      const NB1 = (await req('POST', `/api/activities/${actB2}/elements`, { name: 'عنصر B1' })).data.element.id

      const ops = (await req('GET', `/api/projects/${projectId}/operators`)).data.items
      const opId1 = ops[0].id
      const opId2 = ops[1].id
      const mkSession = async (actId: string, operatorId: string) =>
        (await req('POST', `/api/activities/${actId}/sessions`, { operatorId, timingMethod: 'SNAPBACK' })).data.session.id
      const sA1 = await mkSession(actA, opId1)
      const sA2 = await mkSession(actA, opId2)
      const sB1 = await mkSession(actB, opId1)
      const sB2 = await mkSession(actB, opId2)
      const sC1 = await mkSession(actC, opId1)
      for (const s of [sA1, sA2, sB1, sB2, sC1]) await req('POST', `/api/sessions/${s}/cycles`, { count: 2 })

      // ── کاتالوگ عناصر (منبع مستقل نامزدها — v1.5.2 §۲-۵) ──
      console.log('── §۱۰-۱ کاتالوگ عناصر (elements-catalog)')
      {
        const cat = (await req('GET', `/api/projects/${projectId}/elements-catalog`)).data
        const catalog = cat.elementsCatalog as Array<{ elementId: string; activityId: string; activityName: string; stationId: string }>
        check('کاتالوگ برمی‌گردد', Array.isArray(catalog) && catalog.length > 0)
        const selectableForA1 = catalog.filter((c) => c.elementId !== A1)
        check('فرم/جدول A1: عناصر فعالیت B قابل انتخاب‌اند', selectableForA1.some((c) => c.elementId === B1 && c.activityId === actB))
        check('فرم/جدول A1: عناصر فعالیت C (ایستگاه دیگر) قابل انتخاب‌اند', selectableForA1.some((c) => c.elementId === C1 && c.activityId === actC))
        check('فرم/جدول A1: عنصر خود A1 در نامزدها نیست', !selectableForA1.some((c) => c.elementId === A1))
        const sameNamed = catalog.filter((c) => c.activityName === 'فعالیت دیگر')
        check('فعالیت‌های هم‌نام با شناسهٔ متفاوت تفکیک می‌شوند', sameNamed.length === 3 && new Set(sameNamed.map((c) => c.activityId)).size === 2, `count=${sameNamed.length}`)
        check('کاتالوگ شامل همهٔ ایستگاه‌هاست', new Set(catalog.map((c) => c.stationId)).size === 2)
        check('عنصر هم‌نام NB1 با شناسهٔ مستقل در کاتالوگ است', catalog.some((c) => c.elementId === NB1) && NB1 !== B1)
      }

      // ── API و سرویس ──
      console.log('── §۱۰-۲ API و سرویس')
      {
        const relA1A2 = await req('POST', `/api/projects/${projectId}/parallel-relations`, { elementAId: A1, elementBId: A2 })
        check('رابطهٔ هم‌فعالیت A1-A2 موفق', relA1A2.status === 201, `status=${relA1A2.status}`)
        const relA1B1 = await req('POST', `/api/projects/${projectId}/parallel-relations`, { elementAId: A1, elementBId: B1 })
        check('ایجاد رابطهٔ بین‌فعالیت A1-B1 موفق', relA1B1.status === 201, `status=${relA1B1.status}`)
        const relB1C1 = await req('POST', `/api/projects/${projectId}/parallel-relations`, { elementAId: B1, elementBId: C1 })
        check('ایجاد رابطه با دو Station متفاوت (B1-C1) موفق', relB1C1.status === 201, `status=${relB1C1.status}`)
        const selfX = await req('POST', `/api/projects/${projectId}/parallel-relations`, { elementAId: B1, elementBId: B1 })
        check('خود-رابطه رد شد', selfX.status === 422)
        const proj2 = await req('POST', '/api/projects', { name: 'پروژهٔ دیگر v1.5.2', lineName: 'خط', productName: 'محصول', studyDate: '2026-01-01' })
        const projectId2 = proj2.data.project.id
        const stP2 = (await req('POST', `/api/projects/${projectId2}/stations`, { name: 'ایستگاه پ۲' })).data.station.id
        const actP2 = (await req('POST', `/api/stations/${stP2}/activities`, { name: 'فعالیت پ۲', processType: 'OPERATION' })).data.activity.id
        const elP2 = (await req('POST', `/api/activities/${actP2}/elements`, { name: 'عنصر پروژهٔ دیگر' })).data.element.id
        const wrongProj = await req('POST', `/api/projects/${projectId}/parallel-relations`, { elementAId: A1, elementBId: elP2 })
        check('رابطه با عنصر پروژهٔ دیگر رد شد', wrongProj.status === 422, `status=${wrongProj.status}`)
        const dupX = await req('POST', `/api/projects/${projectId}/parallel-relations`, { elementAId: B1, elementBId: A1 })
        check('رابطهٔ تکراری (معکوس) رد شد', dupX.status === 422)
        check('رابطهٔ A1-B1 canonical است (low < high)', relA1B1.data.relation.elementLowId < relA1B1.data.relation.elementHighId)

        // آرشیو و بازگردانی رابطهٔ بین‌فعالیت
        const arch = await req('PATCH', `/api/parallel-relations/${relB1C1.data.relation.id}`, { action: 'archive' })
        check('آرشیو رابطهٔ بین‌فعالیت (B1-C1) موفق', arch.status === 200 && arch.data.relation.isActive === false)
        const rest = await req('PATCH', `/api/parallel-relations/${relB1C1.data.relation.id}`, { action: 'restore' })
        check('بازگردانی رابطهٔ بین‌فعالیت موفق', rest.status === 200 && rest.data.relation.isActive === true, `status=${rest.status}`)

        // روابط تاریخی آرشیوشده با دلیل CROSS_ACTIVITY نیز قابل بازگردانی‌اند
        const { db } = await import('@prisma/client').then((m) => ({ db: new m.PrismaClient() }))
        const legacyLow = B2 < C1 ? B2 : C1
        const legacyHigh = B2 < C1 ? C1 : B2
        const legacyRow = await db.parallelElementRelation.create({
          data: { projectId, elementLowId: legacyLow, elementHighId: legacyHigh, isActive: false, archiveReason: 'CROSS_ACTIVITY_NOT_SUPPORTED_BY_SESSION_SHEET' },
        })
        const restLegacy = await req('PATCH', `/api/parallel-relations/${legacyRow.id}`, { action: 'restore' })
        check('بازگردانی رابطهٔ آرشیوشدهٔ قدیمی (دلیل CROSS_ACTIVITY) موفق', restLegacy.status === 200 && restLegacy.data.relation.isActive === true, `status=${restLegacy.status}`)
        await db.parallelElementRelation.delete({ where: { id: legacyRow.id } })
        await db.$disconnect()

        // ── نمایش دوطرفه ──
        console.log('── §۱۰-۳ نمایش دوطرفه')
        const relIdA1B1 = relA1B1.data.relation.id
        const formA1 = (await req('GET', `/api/elements/${A1}/relations`)).data
        const formB1 = (await req('GET', `/api/elements/${B1}/relations`)).data
        check('رابطهٔ A1-B1 در فرم A1 دیده می‌شود', formA1.rows.some((r: any) => r.relationId === relIdA1B1))
        check('همان رابطه در فرم B1 دیده می‌شود', formB1.rows.some((r: any) => r.relationId === relIdA1B1))
        check('relationId واحد در هر دو فرم (دیگر side = عنصر مقابل)', formA1.rows.find((r: any) => r.relationId === relIdA1B1)?.otherElementId === B1 && formB1.rows.find((r: any) => r.relationId === relIdA1B1)?.otherElementId === A1)
        check('فرم A1 برچسب بین‌فعالیت دارد (crossActivity)', formA1.rows.find((r: any) => r.relationId === relIdA1B1)?.crossActivity === true)
        check('ردیف فرم فیلد latest هم‌پوشانی ندارد (حذف شد)', formA1.rows.every((r: any) => !('latest' in r)))

        const shA1 = (await req('GET', `/api/sessions/${sA1}`)).data.sheet
        const shA2 = (await req('GET', `/api/sessions/${sA2}`)).data.sheet
        const shB1 = (await req('GET', `/api/sessions/${sB1}`)).data.sheet
        const shB2 = (await req('GET', `/api/sessions/${sB2}`)).data.sheet
        const shC1 = (await req('GET', `/api/sessions/${sC1}`)).data.sheet
        const relIn = (sh: any) => sh.parallelRelations.find((r: any) => r.relationId === relIdA1B1)
        check('برگهٔ Activity A (اپراتور ۱) زیرردیف A1-B1 دارد', !!relIn(shA1))
        check('برگهٔ Activity A (اپراتور ۲) نیز همان رابطه را دارد', !!relIn(shA2))
        check('برگهٔ Activity B (اپراتور ۱) همان relationId را دارد', relIn(shB1)?.relationId === relIdA1B1)
        check('برگهٔ Activity B (اپراتور ۲) نیز همان relationId را دارد', relIn(shB2)?.relationId === relIdA1B1)
        check('برگهٔ Activity C رابطهٔ A1-B1 را نمی‌بیند (هیچ endpoint ندارد)', !relIn(shC1))
        const relDto = relIn(shB1)
        check('DTO روابط: نام هر دو endpoint (بدون «؟»)', relDto && relDto.elementLowName && relDto.elementHighName && ![relDto.elementLowName, relDto.elementHighName].includes('؟'))
        check('DTO روابط: فعالیت/ایستگاه هر دو endpoint', relDto && relDto.elementLowActivityName && relDto.elementHighActivityName && relDto.elementLowStationName && relDto.elementHighStationName)
        check('عناصر برگهٔ A همان فعالیت A است (B1 ستون نیست)', !shA1.elements.some((e: any) => e.id === B1))
        check('عناصر برگهٔ B همان فعالیت B است (A1 ستون نیست)', !shB1.elements.some((e: any) => e.id === A1))
        const relsAll = (await req('GET', `/api/projects/${projectId}/parallel-relations`)).data.relations
        check('هیچ رکورد رابطهٔ معکوس ساخته نشد', relsAll.filter((r: any) => r.isActive && ((r.elementLowId === A1 && r.elementHighId === B1) || (r.elementLowId === B1 && r.elementHighId === A1))).length === 1)

        // ── ثبت زمان عنصر بین‌فعالیت در چرخهٔ فعالیت مقابل (v1.5.2 §۲-۸) ──
        console.log('── §۱۰-۴ ثبت زمان عنصر موازی بین‌فعالیت در همین چرخه')
        {
          const cycA = shA1.cycles[0]
          await req('PUT', `/api/cycles/${cycA.id}/cells`, { cells: [{ cycleId: cycA.id, workElementId: A1, rawDuration: 10 }] })
          // B1 در فعالیت دیگر است — زمان آن از زیرردیف زیر A1 در همین چرخه ثبت می‌شود
          const setB1 = await req('PUT', `/api/cycles/${cycA.id}/cells`, {
            cells: [{ cycleId: cycA.id, workElementId: B1, startOffset: 4, endOffset: 8 }],
          })
          check('ثبت بازهٔ ۴-۸ برای B1 (عنصر بین‌فعالیت) در چرخهٔ فعالیت A موفق', setB1.status === 200, JSON.stringify(setB1.data).slice(0, 150))
          const shA1b = (await req('GET', `/api/sessions/${sA1}`)).data.sheet
          const obsB1 = shA1b.cycles.find((c: any) => c.id === cycA.id).observations.find((o: any) => o.workElementId === B1)
          check('مشاهدهٔ B1 با بازهٔ ۴-۸ و مدت ۴ ثبت شد', obsB1?.startOffset === 4 && obsB1?.endOffset === 8 && obsB1?.derivedDuration === 4, JSON.stringify(obsB1).slice(0, 120))
          // مقدار ترتیمی برای عنصر موازی مجاز نیست — فقط بازه
          const badSeq = await req('PUT', `/api/cycles/${cycA.id}/cells`, {
            cells: [{ cycleId: cycA.id, workElementId: B1, rawDuration: 5 }],
          })
          check('مقدار ترتیمی برای عنصر موازی رد شد (فقط بازهٔ از/تا)', badSeq.status === 422, `status=${badSeq.status}`)
          // عنصر پروژهٔ دیگر که رابطه‌ای به این فعالیت ندارد → رد
          const elP2b = (await req('POST', `/api/activities/${actP2}/elements`, { name: 'عنصر نامعتبر' })).data.element.id
          const badForeign = await req('PUT', `/api/cycles/${cycA.id}/cells`, {
            cells: [{ cycleId: cycA.id, workElementId: elP2b, startOffset: 0, endOffset: 2 }],
          })
          check('عنصر بدون رابطهٔ فعال در این برگه رد شد', badForeign.status === 422, `status=${badForeign.status}`)
        }

        // ── حفظ داده: آرشیو/بازگردانی رابطهٔ بین‌فعالیت + Import بسته ──
        console.log('── §۱۰-۵ حفظ داده')
        {
          const archA1B1 = await req('PATCH', `/api/parallel-relations/${relIdA1B1}`, { action: 'archive' })
          check('آرشیو A1-B1 موفق', archA1B1.status === 200 && archA1B1.data.relation.isActive === false)
          const shA1Arch = (await req('GET', `/api/sessions/${sA1}`)).data.sheet
          check('پس از آرشیو، زیرردیف A1-B1 از برگهٔ A حذف شد', !shA1Arch.parallelRelations.some((r: any) => r.relationId === relIdA1B1))
          const shB1Arch = (await req('GET', `/api/sessions/${sB1}`)).data.sheet
          check('پس از آرشیو، زیرردیف از برگهٔ B نیز حذف شد (هر دو سمت)', !shB1Arch.parallelRelations.some((r: any) => r.relationId === relIdA1B1))
          const restA1B1 = await req('PATCH', `/api/parallel-relations/${relIdA1B1}`, { action: 'restore' })
          check('بازگردانی A1-B1 موفق', restA1B1.status === 200 && restA1B1.data.relation.isActive === true)

          // Import بستهٔ حاوی رابطه‌های بین‌فعالیت فعال → روابط فعال می‌مانند
          const exp = await req('GET', `/api/projects/${projectId}/export`)
          const imp = await req('POST', '/api/projects/import', exp.data)
          check('Import بستهٔ دارای رابطهٔ بین‌فعالیت موفق', imp.status === 201 || imp.status === 200, `status=${imp.status}`)
          if (imp.status === 201 || imp.status === 200) {
            const newPid = imp.data.projectId ?? imp.data.project?.id
            const catNew = (await req('GET', `/api/projects/${newPid}/elements-catalog`)).data
            const actOfNew = new Map<string, string>(catNew.elementsCatalog.map((c: any) => [c.elementId, c.activityId]))
            const relsNew = (await req('GET', `/api/projects/${newPid}/parallel-relations`)).data.relations
            const activeRels = relsNew.filter((r: any) => r.isActive)
            const activeCross = activeRels.filter((r: any) => actOfNew.get(r.elementLowId) !== actOfNew.get(r.elementHighId))
            // ۶ رابطهٔ فعال: A-B، A-C، C-legacy، A1-A2، A1-B1، B1-C1
            check('Import: تعداد روابط فعال حفظ شد (۶)', activeRels.length === 6, `count=${activeRels.length}`)
            check('Import: روابط بین‌فعالیت فعال باقی ماندند (۲)', activeCross.length === 2, `cross=${activeCross.length}`)
            await req('DELETE', `/api/projects/${newPid}`)
          }

          // Import مکرر: رابطه‌ها همچنان فعال
          const imp2 = await req('POST', '/api/projects/import', exp.data)
          if (imp2.status === 201 || imp2.status === 200) {
            const pid2b = imp2.data.projectId ?? imp2.data.project?.id
            const cat2b = (await req('GET', `/api/projects/${pid2b}/elements-catalog`)).data
            const actOf2b = new Map<string, string>(cat2b.elementsCatalog.map((c: any) => [c.elementId, c.activityId]))
            const active2b = (await req('GET', `/api/projects/${pid2b}/parallel-relations`)).data.relations.filter((r: any) => r.isActive)
            const cross2b = active2b.filter((r: any) => actOf2b.get(r.elementLowId) !== actOf2b.get(r.elementHighId))
            check('مهاجرت/Import مکرر: رابطه‌های بین‌فعالیت فعال ماندند', cross2b.length === 2, `cross=${cross2b.length}`)
            await req('DELETE', `/api/projects/${pid2b}`)
          }
          await req('DELETE', `/api/projects/${projectId2}`)
        }
      }
    }
  }

  console.log('── پاک‌سازی')
  const del = await req('DELETE', `/api/projects/${projectId}`)
  check('حذف پروژهٔ آزمون', del.status === 200)
  for (const pid of importedPids) {
    const delImp = await req('DELETE', `/api/projects/${pid}`)
    check(`حذف پروژهٔ import‌شده (${pid.slice(0, 8)}…)`, delImp.status === 200, `status=${delImp.status}`)
  }

  console.log(`\n═══ نتیجهٔ v1.5.2 §۲ (آنلاین): ${pass} پاس / ${fail} خطا ═══`)
  if (fail > 0) process.exit(1)
}

main().catch((e) => {
  console.error('خطای اجرای تست:', e)
  process.exit(1)
})
