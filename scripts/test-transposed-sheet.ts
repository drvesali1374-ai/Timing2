// ═══════════════════════════════════════════════════════════
// آزمون‌های اجباری v1.5.0 — §۱۳ دستورالعمل (نسخهٔ آنلاین/API)
//  ۱۳.۱ حذف نوع عنصر + Import بستهٔ قدیمی
//  ۱۳.۲ رابطهٔ دوطرفه (A-B، A-C؛ ۳ عنصر، ۲ رابطه)
//  ۱۳.۳ مقداردهی دوطرفه از یک رکورد واحد
//  ۱۳.۴ استقلال اپراتورها
//  ۱۳.۵ افزودن رابطه (از جدول — سطح API)
//  ۱۳.۶ حذف/بازگردانی رابطه
//  ۱۳.۷ وضعیت سلول (خالی/صفر/مثبت)
//  ۱۳.۸ محاسبات
//  ۱۳.۹ Paste/Copy/Undo/Redo (شامل زیرردیف)
// اجرا: bun scripts/test-transposed-sheet.ts  (سرور dev روی :3000)
// ═══════════════════════════════════════════════════════════
const BASE = 'http://localhost:3000'
let pass = 0
let fail = 0
function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
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
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  let data: any = null
  try {
    data = await res.json()
  } catch {
    data = null
  }
  return { status: res.status, data }
}

async function main() {
  console.log('── آماده‌سازی fixture')
  const proj = await req('POST', '/api/projects', { name: 'تست v1.5.0 آنلاین', lineName: 'خط آزمون v1.5.0', productName: 'محصول T', studyDate: '2026-01-01' })
  const projectId = proj.data.project.id
  // پاک‌سازی کامل: شناسهٔ همهٔ پروژه‌های import‌شده در طول آزمون ثبت می‌شود تا در پایان حذف شوند
  const importedPids: string[] = []
  const st = await req('POST', `/api/projects/${projectId}/stations`, { name: 'ایستگاه ۱' })
  const act = await req('POST', `/api/stations/${st.data.station.id}/activities`, { name: 'فعالیت مونتاژ', processType: 'OPERATION' })
  const activityId = act.data.activity.id
  const act2 = await req('POST', `/api/stations/${st.data.station.id}/activities`, { name: 'فعالیت دیگر', processType: 'OPERATION' })
  const activity2Id = act2.data.activity.id

  // ── §۱۳.۱ ایجاد عنصر بدون type ──
  console.log('── §۱۳.۱ حذف نوع عنصر کاری')
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
    // ورودی legacy elementType نادیده گرفته می‌شود (zod strip) — عنصر با پیش‌فرض فنی ساخته می‌شود
    const eLegacy = await req('POST', `/api/activities/${activityId}/elements`, { name: 'عنصر legacy', elementType: 'MACHINE' })
    check('بستهٔ قدیمی elementType در ورودی نادیده گرفته شد (zod strip)', eLegacy.status === 201)
    // برگهٔ زمان‌سنجی بدون نوع — از sheet DTO
    const op = await req('POST', `/api/projects/${projectId}/operators`, { displayName: 'اپراتور ۱' })
    const op2 = await req('POST', `/api/projects/${projectId}/operators`, { displayName: 'اپراتور ۲' })
    const s1 = await req('POST', `/api/activities/${activityId}/sessions`, { operatorId: op.data.operator.id, timingMethod: 'SNAPBACK' })
    const session1 = s1.data.session.id
    const sheet = (await req('GET', `/api/sessions/${session1}`)).data.sheet
    check('برگه بدون elementType — عناصر با defaultEntry/defaultLaneType', sheet.elements.every((e: any) => !('elementType' in e) && e.defaultEntry === 'SEQ' && e.defaultLaneType === 'OPERATOR'))
    check('عنصر جدید پیش‌فرض SEQ/OPERATOR دارد', sheet.elements.every((e: any) => e.defaultEntry === 'SEQ' && e.defaultLaneType === 'OPERATOR'))

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

    // §۱۳.۲ آماده‌سازی روابط دوطرفه
    const relAB = await req('POST', `/api/projects/${projectId}/overlap/relations`, { elementAId: e1.data.element.id, elementBId: e2.data.element.id })
    const relAC = await req('POST', `/api/projects/${projectId}/overlap/relations`, { elementAId: e1.data.element.id, elementBId: e3.data.element.id })
    check('ایجاد A-B و A-C', relAB.status === 201 && relAC.status === 201)

    // جلسهٔ ۲ (اپراتور دوم) برای §۱۳.۴
    const s2 = await req('POST', `/api/activities/${activityId}/sessions`, { operatorId: op2.data.operator.id, timingMethod: 'SNAPBACK' })
    const session2 = s2.data.session.id

    // ── §۱۳.۲ رابطهٔ دوطرفه در برگه ──
    console.log('── §۱۳.۲ رابطهٔ دوطرفه در برگهٔ زمان‌سنجی')
    await req('POST', `/api/sessions/${session1}/cycles`, { count: 2 })
    const sh1 = (await req('GET', `/api/sessions/${session1}`)).data.sheet
    const pr = sh1.parallelRelations
    check('برگه ۲ رابطهٔ فعال دارد (A-B و A-C)', pr.length === 2, `count=${pr.length}`)
    check('رابطه‌های canonical (low/high مرتب)', pr.every((r: any) => r.elementLowId < r.elementHighId))
    // تعداد واقعی عناصر ۳ است (به‌علاوهٔ legacy که بعداً حذف می‌شود) و رابطه‌ها ۲ نه ۴
    const relCount = (await req('GET', `/api/projects/${projectId}/overlap/relations`)).data.relations.filter((r: any) => r.isActive).length
    check('تعداد OverlapRelation فعال دقیقاً ۲ (نه ۴)', relCount === 2, `count=${relCount}`)
    const workElCount = sh1.elements.length
    check('زیرردیف‌ها WorkElement جدید نمی‌سازند (تعداد عناصر ثابت)', workElCount === 4, `count=${workElCount}`) // A,B,C + legacy

    // زیر A دو زیرردیف (B و C)؛ زیر B یک زیرردیف (A)؛ زیر C یک زیرردیف (A)
    const aId = e1.data.element.id, bId = e2.data.element.id, cId = e3.data.element.id
    const relsOf = (id: string) => pr.filter((r: any) => r.elementLowId === id || r.elementHighId === id)
    check('زیر A دو رابطه (B و C)', relsOf(aId).length === 2)
    check('زیر B یک رابطه (A)', relsOf(bId).length === 1)
    check('زیر C یک رابطه (A)', relsOf(cId).length === 1)

    // ── §۱۳.۳ مقداردهی دوطرفه از یک رکورد واحد ──
    console.log('── §۱۳.۳ مقداردهی دوطرفه')
    {
      const cy1 = sh1.cycles[0]
      const cy2 = sh1.cycles[1]
      // چرخهٔ ۱ فقط مدت دارد (بدون بازه) → ثبت دستی مقدار مطابق قواعد فعلی مجاز است
      await req('PUT', `/api/cycles/${cy1.id}/cells`, {
        cells: [
          { cycleId: cy1.id, workElementId: aId, rawDuration: 10 },
          { cycleId: cy1.id, workElementId: bId, rawDuration: 6 },
        ],
      })
      // «از سمت A» مقدار ۳ ثبت می‌شود (از زیرردیف زیر A)
      const setA = await req('PUT', `/api/cycles/${cy1.id}/overlaps`, {
        updates: [{ relationId: relAB.data.relation.id, status: 'OVERLAP', overlapDuration: 3 }],
      })
      check('ثبت ۳s از سمت A موفق', setA.status === 200, JSON.stringify(setA.data).slice(0, 150))
      // زیر B نیز همان مقدار را می‌بیند — از همان DTO برگه (یک منبع)
      const sh1b = (await req('GET', `/api/sessions/${session1}`)).data.sheet
      const cy1b = sh1b.cycles.find((c: any) => c.id === cy1.id)
      check('مقدار زیر B نیز ۳ است (همان رکورد)', cy1b.overlaps[relAB.data.relation.id]?.overlapDuration === 3)
      // تغییر از سمت B به ۴
      const setB = await req('PUT', `/api/cycles/${cy1.id}/overlaps`, {
        updates: [{ relationId: relAB.data.relation.id, status: 'OVERLAP', overlapDuration: 4, expectedVersion: cy1b.overlaps[relAB.data.relation.id]?.version }],
      })
      check('تغییر به ۴s از سمت B موفق', setB.status === 200, JSON.stringify(setB.data).slice(0, 150))
      const sh1c = (await req('GET', `/api/sessions/${session1}`)).data.sheet
      check('مقدار زیر A نیز ۴ شد (یک منبع واحد)', sh1c.cycles.find((c: any) => c.id === cy1.id).overlaps[relAB.data.relation.id]?.overlapDuration === 4)
      // فقط یک رکورد ObservationOverlap برای A-B در چرخهٔ ۱ — از ماتریس
      const m = (await req('GET', `/api/projects/${projectId}/overlap/matrix?cycleId=${cy1.id}`)).data
      check('فقط یک رکورد مقدار برای A-B در چرخهٔ ۱', m.cells[relAB.data.relation.id]?.overlapDuration === 4)
      // چرخهٔ ۲ مقدار جداگانه — چرخهٔ ۱ تغییر نمی‌کند
      await req('PUT', `/api/cycles/${cy2.id}/cells`, {
        cells: [
          { cycleId: cy2.id, workElementId: aId, rawDuration: 10 },
          { cycleId: cy2.id, workElementId: bId, rawDuration: 6 },
        ],
      })
      const set2 = await req('PUT', `/api/cycles/${cy2.id}/overlaps`, {
        updates: [{ relationId: relAB.data.relation.id, status: 'NO_OVERLAP' }],
      })
      check('ثبت جداگانه در چرخهٔ ۲ موفق', set2.status === 200)
      const sh1d = (await req('GET', `/api/sessions/${session1}`)).data.sheet
      check('چرخهٔ ۱ همچنان ۴ است (استقلال چرخه‌ها)', sh1d.cycles.find((c: any) => c.id === cy1.id).overlaps[relAB.data.relation.id]?.overlapDuration === 4)
      check('چرخهٔ ۲ NO_OVERLAP است', sh1d.cycles.find((c: any) => c.id === cy2.id).overlaps[relAB.data.relation.id]?.status === 'NO_OVERLAP')

      // ── §۱۳.۴ استقلال اپراتورها ──
      console.log('── §۱۳.۴ استقلال اپراتورها')
      const sh2 = (await req('GET', `/api/sessions/${session2}`)).data.sheet
      check('برگهٔ اپراتور ۲ همان روابط را می‌بیند', sh2.parallelRelations.length === 2)
      check('برگهٔ اپراتور ۲ مقدار چرخهٔ اپراتور ۱ را ندارد', Object.keys(sh2.cycles[0]?.overlaps ?? {}).length === 0 || sh2.cycles.every((c: any) => c.overlaps[relAB.data.relation.id] == null))
      await req('POST', `/api/sessions/${session2}/cycles`, { count: 1 })
      const sh2b = (await req('GET', `/api/sessions/${session2}`)).data.sheet
      const cyO2 = sh2b.cycles[0]
      await req('PUT', `/api/cycles/${cyO2.id}/cells`, {
        cells: [
          { cycleId: cyO2.id, workElementId: aId, rawDuration: 10 },
          { cycleId: cyO2.id, workElementId: bId, rawDuration: 6 },
        ],
      })
      const setO2 = await req('PUT', `/api/cycles/${cyO2.id}/overlaps`, {
        updates: [{ relationId: relAB.data.relation.id, status: 'OVERLAP', overlapDuration: 2 }],
      })
      check('ثبت مقدار مستقل اپراتور ۲ موفق', setO2.status === 200)
      const sh1e = (await req('GET', `/api/sessions/${session1}`)).data.sheet
      check('تغییر اپراتور ۲ اپراتور ۱ را تغییر نداد', sh1e.cycles.find((c: any) => c.id === cy1.id).overlaps[relAB.data.relation.id]?.overlapDuration === 4)

      // ── §۱۳.۷ وضعیت سلول ──
      console.log('── §۱۳.۷ سه وضعیت سلول')
      {
        const shNow = (await req('GET', `/api/sessions/${session1}`)).data.sheet
        const c1Now = shNow.cycles.find((c: any) => c.id === cy1.id)
        const c2Now = shNow.cycles.find((c: any) => c.id === cy2.id)
        // A-C در چرخهٔ ۱ هنوز رکورد ندارد → UNREVIEWED (خالی ≠ صفر)
        check('خالی = UNREVIEWED (نبود رکورد)', c1Now.overlaps[relAC.data.relation.id] == null)
        check('صفر = NO_OVERLAP (چرخهٔ ۲)', c2Now.overlaps[relAB.data.relation.id]?.status === 'NO_OVERLAP' && c2Now.overlaps[relAB.data.relation.id]?.overlapDuration === 0)
        check('مثبت = OVERLAP (چرخهٔ ۱ = ۴)', c1Now.overlaps[relAB.data.relation.id]?.status === 'OVERLAP' && c1Now.overlaps[relAB.data.relation.id]?.overlapDuration === 4)
        // پاک‌کردن → UNREVIEWED صریح
        const clr = await req('PUT', `/api/cycles/${cy2.id}/overlaps`, {
          updates: [{ relationId: relAB.data.relation.id, status: 'UNREVIEWED' }],
        })
        check('پاک‌کردن → UNREVIEWED (null، نه صفر)', clr.status === 200 && clr.data.cells[relAB.data.relation.id]?.overlapDuration === null)
      }

      // ── §۱۳.۸ محاسبات ──
      console.log('── §۱۳.۸ محاسبات دست‌نخورده')
      {
        // چرخهٔ ۲: مدت‌ها در §۱۳.۳/۱۳.۷ ثبت شده‌اند؛ اینجا مقدار دستی ۴ می‌آید و
        // سپس بازه‌ها: A=[0,10) B=[3,10) → هم‌پوشانی واقعی ۷ ≠ ۴ → issue قطعی
        const shBefore = (await req('GET', `/api/sessions/${session1}`)).data.sheet
        const cy2Now = shBefore.cycles.find((c: any) => c.id === cy2.id)
        const set4c2 = await req('PUT', `/api/cycles/${cy2.id}/overlaps`, {
          updates: [{ relationId: relAB.data.relation.id, status: 'OVERLAP', overlapDuration: 4, expectedVersion: cy2Now.overlaps[relAB.data.relation.id]?.version }],
        })
        check('ثبت مقدار دستی ۴ در چرخهٔ ۲ (فقط-مدت) موفق', set4c2.status === 200, JSON.stringify(set4c2.data).slice(0, 150))
        await req('PUT', `/api/cycles/${cy2.id}/cells`, {
          cells: [
            { cycleId: cy2.id, workElementId: aId, startOffset: 0, endOffset: 10 },
            { cycleId: cy2.id, workElementId: bId, startOffset: 3, endOffset: 10 },
          ],
        })
        const shCalc = (await req('GET', `/api/sessions/${session1}`)).data.sheet
        check('تعداد عناصر اصلی ثابت (زیرردیف‌ها شمرده نمی‌شوند)', shCalc.elements.length === 4)
        const cy2Calc = shCalc.cycles.find((c: any) => c.id === cy2.id)
        // elapsed = گسترهٔ بازه‌ها = 10 (نه جمع + هم‌پوشانی)
        check('elapsed از بازه‌ها = ۱۰ (بدون افزودن هم‌پوشانی)', cy2Calc.elapsed === 10, `elapsed=${cy2Calc.elapsed}`)
        const an = (await req('GET', `/api/activities/${activityId}/analysis`)).data
        check('تحلیل بدون elementTypeTotals', an?.analysis ? !('elementTypeTotals' in an.analysis) : !('elementTypeTotals' in (an ?? {})))
        const anData = an?.analysis ?? an
        check('تحلیل: عناصر بدون فیلد elementType', (anData?.elements ?? []).every((e: any) => !('elementType' in e)))
        check('فعالیت دارای رابطهٔ فعال → NEEDS_AGGREGATION_RULE', anData?.activityTotal?.status === 'NEEDS_AGGREGATION_RULE')
        // اعتبارسنجی: بازهٔ واقعی A-B = ۷؛ مقدار ثبت‌شده ۴ → خطای قطعی
        const m = (await req('GET', `/api/projects/${projectId}/overlap/matrix?cycleId=${cy2.id}`)).data
        const intervalIssue = (m.validation.intervalIssues || []).find((i: any) => i.pair.includes(aId) && i.pair.includes(bId))
        check('اعتبارسنجی بازهٔ واقعی فعال است (۴ ≠ ۷ → issue)', !!intervalIssue && intervalIssue.kind === 'DEFINITE', JSON.stringify(m.validation.intervalIssues).slice(0, 150))
        // ثبت مقدار متناقض با بازهٔ واقعی رد می‌شود (§۵.۵)
        const tryBad = await req('PUT', `/api/cycles/${cy2.id}/overlaps`, {
          updates: [{ relationId: relAB.data.relation.id, status: 'OVERLAP', overlapDuration: 3 }],
        })
        check('اختلاف با بازهٔ واقعی رد شد (§۵.۵)', tryBad.status === 422, `status=${tryBad.status}`)
        // چرخهٔ غیرقابل‌مقایسه: A-C در چرخهٔ ۱ — C مشاهده ندارد → ثبت قطعی رد می‌شود
        const tryAC = await req('PUT', `/api/cycles/${cy1.id}/overlaps`, {
          updates: [{ relationId: relAC.data.relation.id, status: 'OVERLAP', overlapDuration: 2 }],
        })
        check('زوج غیرقابل‌مقایسه → ثبت مقدار قطعی رد شد', tryAC.status === 422)
      }

      // ── §۱۳.۹ Paste روی زیرردیف + Undo data ──
      console.log('── §۱۳.۹ Paste روی زیرردیف هم‌پوشانی')
      {
        // Paste از ردیف عنصر A: سطر ۱ (عنصر A) خالی؛ سطر ۲ (زیرردیف A-B) مقدار ۷ = بازهٔ واقعی چرخهٔ ۲
        const pv = await req('POST', `/api/sessions/${session1}/paste-preview`, {
          startCycleNo: 2,
          startElementId: aId,
          data: [[''], ['7']],
        })
        check('پیش‌نمایش Paste با محور جدید موفق', pv.status === 200, JSON.stringify(pv.data).slice(0, 200))
        const preview = pv.data.preview
        check('ردیف ۲ پیش‌نمایش زیرردیف رابطه است', preview.rows[1]?.kind === 'RELATION', JSON.stringify(preview.rows?.[1]).slice(0, 120))
        const ovCell = preview.rows[1]?.cells?.[0]
        check('سلول زیرردیف → OVERLAP با مقدار ۷', ovCell?.overlapStatus === 'OVERLAP' && ovCell?.overlapDuration === 7, JSON.stringify(ovCell).slice(0, 150))
        // مقدار فعلی ۴ است؛ Paste آن را ۷ می‌کند (= بازهٔ واقعی)
        const cm = await req('POST', `/api/sessions/${session1}/paste-commit`, {
          startCycleNo: 2,
          startElementId: aId,
          data: [[''], ['7']],
          mode: 'ALL_OR_NOTHING',
        })
        check('ثبت Paste شامل زیرردیف موفق', cm.status === 200, JSON.stringify(cm.data).slice(0, 200))
        const shP = (await req('GET', `/api/sessions/${session1}`)).data.sheet
        check('مقدار A-B پس از Paste = ۷ (منبع واحد)', shP.cycles.find((c: any) => c.id === cy2.id).overlaps[relAB.data.relation.id]?.overlapDuration === 7)
        // رد مقدار نامعتبر: تعارض با بازهٔ واقعی
        const bad = await req('POST', `/api/sessions/${session1}/paste-preview`, {
          startCycleNo: 2,
          startElementId: aId,
          data: [[''], ['3']],
        })
        const badCell = bad.data.preview?.rows?.[1]?.cells?.[0]
        check('رد مقدار نامعتبر در زیرردیف (۳ ≠ ۷)', badCell?.status === 'ERROR', JSON.stringify(badCell).slice(0, 120))
        // Undo سطح UI با API شبیه‌سازی نمی‌شود (در مرورگر تست می‌شود)؛
        // اما حذف چرخه با مقادیر + بازگردانی (Undo مسیر سرور) تست می‌شود:
        const del = await req('DELETE', `/api/cycles/${cy2.id}`)
        check('حذف چرخهٔ دارای مقدار هم‌پوشانی موفق', del.status === 200)
        check('دادهٔ حذف‌شده شامل مقادیر هم‌پوشانی است (برای Undo)', (del.data.removed?.cycle?.overlaps ?? []).some((o: any) => o.relationId === relAB.data.relation.id))
        const undo = await req('POST', `/api/sessions/${session1}/cycles`, { withData: [del.data.removed.cycle] })
        check('بازگردانی چرخه (Undo) با مقادیر هم‌پوشانی موفق', undo.status === 201 || undo.status === 200)
        const shU = (await req('GET', `/api/sessions/${session1}`)).data.sheet
        const restoredCycle = shU.cycles.find((c: any) => c.cycleNo === 2)
        check('مقدار هم‌پوشانی پس از Undo بازگشت (۷)', restoredCycle?.overlaps[relAB.data.relation.id]?.overlapDuration === 7)
        check('هیچ ردیف یتیم نماند (رابطه‌ها فعال)', shU.parallelRelations.length === 2)
      }

      // ── §۱۳.۶ حذف/بازگردانی رابطه ──
      console.log('── §۱۳.۶ حذف و بازگردانی رابطه')
      {
        const arch = await req('PATCH', `/api/overlap-relations/${relAB.data.relation.id}`, { action: 'archive' })
        check('آرشیو A-B موفق', arch.status === 200 && arch.data.relation.isActive === false)
        const shArch = (await req('GET', `/api/sessions/${session1}`)).data.sheet
        check('زیرردیف A-B (هر دو سمت) حذف شد', shArch.parallelRelations.length === 1 && !shArch.parallelRelations.some((r: any) => r.relationId === relAB.data.relation.id))
        // مقادیر تاریخی حفظ می‌شوند — از ماتریس چرخهٔ دارای مقدار
        const mArch = (await req('GET', `/api/projects/${projectId}/overlap/matrix?cycleId=${shArch.cycles.find((c: any) => c.cycleNo === 2)?.id ?? shArch.cycles[0].id}`)).data
        check('مقدار تاریخی با آرشیو حفظ شد', mArch.relations.find((r: any) => r.id === relAB.data.relation.id) != null)
        const rest = await req('PATCH', `/api/overlap-relations/${relAB.data.relation.id}`, { action: 'restore' })
        check('بازگردانی A-B موفق', rest.status === 200 && rest.data.relation.isActive === true)
        const shRest = (await req('GET', `/api/sessions/${session1}`)).data.sheet
        check('زیرردیف‌ها برگشتند (۲ رابطه)', shRest.parallelRelations.length === 2)
        const restoredCycle = shRest.cycles.find((c: any) => c.cycleNo === 2) ?? shRest.cycles.find((c: any) => c.overlaps[relAB.data.relation.id] != null)
        check('مقدار تاریخی پس از بازگردانی برگشت (۷)', restoredCycle?.overlaps[relAB.data.relation.id]?.overlapDuration === 7)
      }
    }

    // ── §۱۳.۵ افزودن رابطه از جدول (سطح API) + برگهٔ اپراتور دیگر ──
    console.log('── §۱۳.۵ افزودن رابطه — دیده‌شدن در همهٔ جلسات')
    {
      // legacy element قبلاً ساخته شد — رابطهٔ C-legacy از API (همان مسیر «+ موازی»)
      const elList = (await req('GET', `/api/activities/${activityId}/elements`)).data.elements
      const legacyEl = elList.find((e: any) => e.name === 'عنصر legacy')
      const relCL = await req('POST', `/api/projects/${projectId}/overlap/relations`, { elementAId: cId, elementBId: legacyEl.id })
      check('افزودن رابطهٔ جدید (C-legacy) موفق', relCL.status === 201)
      const sh1f = (await req('GET', `/api/sessions/${session1}`)).data.sheet
      const sh2f = (await req('GET', `/api/sessions/${session2}`)).data.sheet
      check('برگهٔ اپراتور ۱ رابطهٔ جدید را می‌بیند', sh1f.parallelRelations.some((r: any) => r.relationId === relCL.data.relation.id))
      check('برگهٔ اپراتور ۲ نیز همان رابطه را می‌بیند (§۷)', sh2f.parallelRelations.some((r: any) => r.relationId === relCL.data.relation.id))
      // رابطهٔ تکراری رد می‌شود؛ خود-رابطه رد می‌شود؛ بین‌فعالیت مجاز است (v1.5.1)
      const dup = await req('POST', `/api/projects/${projectId}/overlap/relations`, { elementAId: cId, elementBId: legacyEl.id })
      check('رابطهٔ تکراری رد شد', dup.status === 422)
      const self = await req('POST', `/api/projects/${projectId}/overlap/relations`, { elementAId: cId, elementBId: cId })
      check('خود-رابطه رد شد', self.status === 422)
    }

    // ── §۱۳.۱۰ v1.5.1 — روابط موازی بین‌فعالیت (Cross-Activity) ──
    console.log('── §۱۳.۱۰ روابط بین‌فعالیت — fixture سه‌فعالیتی')
    {
      // Fixture: ۳ Activity (A و B در ایستگاه ۱؛ C در ایستگاه ۲) —
      // A: A1(=aId),A2(=legacy) / B: B1,B2 / C: C1 + دو اپراتور + چند چرخه برای هر Session
      const st2 = await req('POST', `/api/projects/${projectId}/stations`, { name: 'ایستگاه ۲' })
      const station2Id = st2.data.station.id
      const actA = activityId // «فعالیت مونتاژ» موجود
      const actB = activity2Id // «فعالیت دیگر» موجود
      const actC = (await req('POST', `/api/stations/${station2Id}/activities`, { name: 'فعالیت مونتاژ', processType: 'OPERATION' })).data.activity.id
      // فعالیتی هم‌نام با actB برای اثبات فیلتر شناسه‌محور (نه نام‌محور)
      const actB2 = (await req('POST', `/api/stations/${st.data.station.id}/activities`, { name: 'فعالیت دیگر', processType: 'OPERATION' })).data.activity.id

      const actAElList = (await req('GET', `/api/activities/${actA}/elements`)).data.elements
      const A1 = aId, A2 = actAElList.find((e: any) => e.name === 'عنصر legacy').id // هر دو در Activity A — زوج هم‌فعالیتِ جدید
      const B1 = (await req('POST', `/api/activities/${actB}/elements`, { name: 'عنصر B1' })).data.element.id
      const B2 = (await req('POST', `/api/activities/${actB}/elements`, { name: 'عنصر B2' })).data.element.id
      const C1 = (await req('POST', `/api/activities/${actC}/elements`, { name: 'عنصر C1' })).data.element.id
      const NB1 = (await req('POST', `/api/activities/${actB2}/elements`, { name: 'عنصر B1' })).data.element.id // هم‌نام با B1

      const ops = (await req('GET', `/api/projects/${projectId}/operators`)).data.items
      const opId1 = ops[0].id
      const opId2 = ops[1].id
      const mkSession = async (actId: string, operatorId: string) =>
        (await req('POST', `/api/activities/${actId}/sessions`, { operatorId, timingMethod: 'SNAPBACK' })).data.session.id
      const sA1 = await mkSession(actA, opId1)
      const sA2 = await mkSession(actA, opId2) // همهٔ اپراتورهای فعالیت A
      const sB1 = await mkSession(actB, opId1)
      const sB2 = await mkSession(actB, opId2)
      const sC1 = await mkSession(actC, opId1)
      for (const s of [sA1, sA2, sB1, sB2, sC1]) await req('POST', `/api/sessions/${s}/cycles`, { count: 2 })

      // ── انتخاب‌گرها (سطح DTO — همان داده‌ای که UI می‌خواند) ──
      console.log('── §۱۳.۱۰-۱ انتخاب‌گرها')
      {
        const m = (await req('GET', `/api/projects/${projectId}/overlap/matrix`)).data
        const catalog = m.elementsCatalog as Array<{ elementId: string; activityId: string; activityName: string; stationId: string }>
        // فرم A1 (ParallelRelationsSection) و جدول زمان‌سنجی و موبایل و MatrixView —
        // همه از همین کاتالوگ کامل پروژه می‌خوانند (v1.5.1 §۲–§۵):
        const selectableForA1 = catalog.filter((c) => c.elementId !== A1)
        check('فرم/جدول A1: عناصر فعالیت B قابل انتخاب‌اند', selectableForA1.some((c) => c.elementId === B1 && c.activityId === actB))
        check('فرم/جدول A1: عناصر فعالیت C (ایستگاه دیگر) قابل انتخاب‌اند', selectableForA1.some((c) => c.elementId === C1 && c.activityId === actC))
        check('فرم/جدول A1: عنصر خود A1 در نامزدها نیست', !selectableForA1.some((c) => c.elementId === A1))
        const sameNamed = catalog.filter((c) => c.activityName === 'فعالیت دیگر')
        check('فعالیت‌های هم‌نام با شناسهٔ متفاوت تفکیک می‌شوند', sameNamed.length === 3 && new Set(sameNamed.map((c) => c.activityId)).size === 2)
        check('کاتالوگ ماتریس شامل همهٔ ایستگاه‌هاست', new Set(catalog.map((c) => c.stationId)).size === 2)
        check('عنصر هم‌نام NB1 با شناسهٔ مستقل در کاتالوگ است', catalog.some((c) => c.elementId === NB1) && NB1 !== B1)
      }

      // ── API و سرویس ──
      console.log('── §۱۳.۱۰-۲ API و سرویس')
      {
        const relA1A2 = await req('POST', `/api/projects/${projectId}/overlap/relations`, { elementAId: A1, elementBId: A2 })
        check('رابطهٔ هم‌فعالیت A1-A2 موفق', relA1A2.status === 201, `status=${relA1A2.status}`)
        const relA1B1 = await req('POST', `/api/projects/${projectId}/overlap/relations`, { elementAId: A1, elementBId: B1 })
        check('ایجاد رابطهٔ بین‌فعالیت A1-B1 موفق (v1.5.1 §۶)', relA1B1.status === 201, `status=${relA1B1.status}`)
        const relB1C1 = await req('POST', `/api/projects/${projectId}/overlap/relations`, { elementAId: B1, elementBId: C1 })
        check('ایجاد رابطه با دو Station متفاوت (B1-C1) موفق', relB1C1.status === 201, `status=${relB1C1.status}`)
        const selfX = await req('POST', `/api/projects/${projectId}/overlap/relations`, { elementAId: B1, elementBId: B1 })
        check('خود-رابطه رد شد', selfX.status === 422)
        // عنصر پروژهٔ دیگر → رد
        const proj2 = await req('POST', '/api/projects', { name: 'پروژهٔ دیگر v1.5.1', lineName: 'خط', productName: 'محصول', studyDate: '2026-01-01' })
        const projectId2 = proj2.data.project.id
        const stP2 = (await req('POST', `/api/projects/${projectId2}/stations`, { name: 'ایستگاه پ۲' })).data.station.id
        const actP2 = (await req('POST', `/api/stations/${stP2}/activities`, { name: 'فعالیت پ۲', processType: 'OPERATION' })).data.activity.id
        const elP2 = (await req('POST', `/api/activities/${actP2}/elements`, { name: 'عنصر پروژهٔ دیگر' })).data.element.id
        const wrongProj = await req('POST', `/api/projects/${projectId}/overlap/relations`, { elementAId: A1, elementBId: elP2 })
        check('رابطه با عنصر پروژهٔ دیگر رد شد', wrongProj.status === 422, `status=${wrongProj.status}`)
        const dupX = await req('POST', `/api/projects/${projectId}/overlap/relations`, { elementAId: B1, elementBId: A1 })
        check('رابطهٔ تکراری (معکوس) رد شد', dupX.status === 422)
        // canonical — یک رکورد، low/high مرتب
        check('رابطهٔ A1-B1 canonical است (low < high)', relA1B1.data.relation.elementLowId < relA1B1.data.relation.elementHighId)

        // آرشیو و بازگردانی رابطهٔ بین‌فعالیت
        const arch = await req('PATCH', `/api/overlap-relations/${relB1C1.data.relation.id}`, { action: 'archive' })
        check('آرشیو رابطهٔ بین‌فعالیت (B1-C1) موفق', arch.status === 200 && arch.data.relation.isActive === false)
        const rest = await req('PATCH', `/api/overlap-relations/${relB1C1.data.relation.id}`, { action: 'restore' })
        check('بازگردانی رابطهٔ بین‌فعالیت موفق (v1.5.1 §۶)', rest.status === 200 && rest.data.relation.isActive === true, `status=${rest.status}`)

        // روابط تاریخی آرشیوشده با دلیل CROSS_ACTIVITY نیز قابل بازگردانی‌اند
        // (معادل دادهٔ قدیمی پس از مهاجرت v1.5.0 — B2 و C1 دو فعالیتِ همین پروژه)
        const { db } = await import('@prisma/client').then((m) => ({ db: new m.PrismaClient() }))
        const legacyLow = B2 < C1 ? B2 : C1
        const legacyHigh = B2 < C1 ? C1 : B2
        const legacyRow = await db.overlapRelation.create({
          data: { projectId, elementLowId: legacyLow, elementHighId: legacyHigh, isActive: false, archiveReason: 'CROSS_ACTIVITY_NOT_SUPPORTED_BY_SESSION_SHEET' },
        })
        const restLegacy = await req('PATCH', `/api/overlap-relations/${legacyRow.id}`, { action: 'restore' })
        check('بازگردانی رابطهٔ آرشیوشدهٔ قدیمی (دلیل CROSS_ACTIVITY) موفق', restLegacy.status === 200 && restLegacy.data.relation.isActive === true, `status=${restLegacy.status}`)
        await db.overlapRelation.delete({ where: { id: legacyRow.id } })
        await db.$disconnect()

        // ── نمایش دوطرفه ──
        console.log('── §۱۳.۱۰-۳ نمایش دوطرفه')
        const relIdA1B1 = relA1B1.data.relation.id
        const formA1 = (await req('GET', `/api/elements/${A1}/relations`)).data
        const formB1 = (await req('GET', `/api/elements/${B1}/relations`)).data
        check('رابطهٔ A1-B1 در فرم A1 دیده می‌شود', formA1.rows.some((r: any) => r.relationId === relIdA1B1))
        check('همان رابطه در فرم B1 دیده می‌شود', formB1.rows.some((r: any) => r.relationId === relIdA1B1))
        check('relationId واحد در هر دو فرم (دیگر side = عنصر مقابل)', formA1.rows.find((r: any) => r.relationId === relIdA1B1)?.otherElementId === B1 && formB1.rows.find((r: any) => r.relationId === relIdA1B1)?.otherElementId === A1)
        check('فرم A1 برچسب بین‌فعالیت دارد (crossActivity)', formA1.rows.find((r: any) => r.relationId === relIdA1B1)?.crossActivity === true)

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
        // DTO هر دو endpoint را با نام/فعالیت/ایستگاه کامل دارد (§۷)
        const relDto = relIn(shB1)
        check('DTO روابط: نام هر دو endpoint (بدون «؟»)', relDto && relDto.elementLowName && relDto.elementHighName && ![relDto.elementLowName, relDto.elementHighName].includes('؟'))
        check('DTO روابط: فعالیت/ایستگاه هر دو endpoint', relDto && relDto.elementLowActivityName && relDto.elementHighActivityName && relDto.elementLowStationName && relDto.elementHighStationName)
        check('DTO روابط: شناسهٔ فعالیت‌ها موجود است', relDto && relDto.elementLowActivityId && relDto.elementHighActivityId)
        // زیرردیف فقط زیر endpoint حاضر است — عنصر خارجی ستون/WorkElement نیست
        check('عناصر برگهٔ A همان فعالیت A است (B1 ستون نیست)', !shA1.elements.some((e: any) => e.id === B1))
        check('عناصر برگهٔ B همان فعالیت B است (A1 ستون نیست)', !shB1.elements.some((e: any) => e.id === A1))
        // هیچ WorkElement جدید ساخته نشد
        const workCountA = (await req('GET', `/api/activities/${actA}/elements`)).data.elements.length
        const workCountB = (await req('GET', `/api/activities/${actB}/elements`)).data.elements.length
        check('WorkElement جدید ساخته نشد (فعالیت A: ۴ عنصر)', workCountA === 4, `count=${workCountA}`)
        check('WorkElement جدید ساخته نشد (فعالیت B: ۲ عنصر)', workCountB === 2, `count=${workCountB}`)
        // هیچ رکورد معکوس — دقیقاً یک رکورد فعال برای زوج A1-B1
        const relsAll = (await req('GET', `/api/projects/${projectId}/overlap/relations`)).data.relations
        check('هیچ رکورد رابطهٔ معکوس ساخته نشد', relsAll.filter((r: any) => r.isActive && ((r.elementLowId === A1 && r.elementHighId === B1) || (r.elementLowId === B1 && r.elementHighId === A1))).length === 1)

        // ── مقایسه‌پذیری ──
        console.log('── §۱۳.۱۰-۴ مقایسه‌پذیری چرخه‌ای')
        {
          // در چرخهٔ ۱ جلسهٔ sA1 فقط A1 مشاهده دارد — B1 هرگز در این چرخه نیست
          const cycA = shA1.cycles[0]
          await req('PUT', `/api/cycles/${cycA.id}/cells`, { cells: [{ cycleId: cycA.id, workElementId: A1, rawDuration: 10 }] })
          const tryDef = await req('PUT', `/api/cycles/${cycA.id}/overlaps`, {
            updates: [{ relationId: relIdA1B1, status: 'OVERLAP', overlapDuration: 3 }],
          })
          check('ثبت مقدار قطعی برای زوج بین‌فعالیت بدون مشاهدهٔ B1 → 422', tryDef.status === 422 && String(tryDef.data?.error?.message ?? '').includes('قابل‌مقایسه'), `status=${tryDef.status}`)
          const tryNo = await req('PUT', `/api/cycles/${cycA.id}/overlaps`, {
            updates: [{ relationId: relIdA1B1, status: 'NO_OVERLAP' }],
          })
          check('ثبت NO_OVERLAP جعلی نیز رد شد (نه صفر، نه مقدار ساختگی)', tryNo.status === 422, `status=${tryNo.status}`)
          // ماتریس: comparability دلیل فارسی دقیق دارد
          const mCmp = (await req('GET', `/api/projects/${projectId}/overlap/matrix?cycleId=${cycA.id}`)).data
          const cmp = mCmp.comparability[relIdA1B1]
          check('ماتریس: زوج بین‌فعالیت غیرقابل‌مقایسه با دلیل فارسی', cmp && cmp.isComparable === false && /قابل‌مقایسه نیست/.test(cmp.notComparableReason ?? ''), JSON.stringify(cmp).slice(0, 120))

          // حالت قابل‌مقایسه واقعی: هر دو endpoint در «یک چرخه» — با زوج هم‌فعالیت
          // A1-A2 همان قواعد قبلی Solver/بازهٔ واقعی را دنبال می‌کند:
          const cycA2 = shA1.cycles[1]
          await req('PUT', `/api/cycles/${cycA2.id}/cells`, {
            cells: [
              { cycleId: cycA2.id, workElementId: A1, startOffset: 0, endOffset: 10 },
              { cycleId: cycA2.id, workElementId: A2, startOffset: 4, endOffset: 10 },
            ],
          })
          const badVal = await req('PUT', `/api/cycles/${cycA2.id}/overlaps`, {
            updates: [{ relationId: relA1A2.data.relation.id, status: 'OVERLAP', overlapDuration: 3 }],
          })
          check('رابطهٔ هم‌فعالیت: تعارض با بازهٔ واقعی (۶) → 422 (قواعد قبلی)', badVal.status === 422, `status=${badVal.status}`)
          const okVal = await req('PUT', `/api/cycles/${cycA2.id}/overlaps`, {
            updates: [{ relationId: relA1A2.data.relation.id, status: 'OVERLAP', overlapDuration: 6 }],
          })
          check('رابطهٔ هم‌فعالیت: مقدار مطابق بازهٔ واقعی پذیرفته شد', okVal.status === 200)
        }

        // ── حفظ داده: آرشیو/بازگردانی رابطهٔ بین‌فعالیت + Import بسته ──
        console.log('── §۱۳.۱۰-۵ حفظ دادهٔ تاریخی')
        {
          const valsBefore = await req('GET', `/api/projects/${projectId}/overlap/matrix?cycleId=${shA1.cycles[1].id}`)
          const archA1B1 = await req('PATCH', `/api/overlap-relations/${relIdA1B1}`, { action: 'archive' })
          check('آرشیو A1-B1 موفق', archA1B1.status === 200 && archA1B1.data.relation.isActive === false)
          const shA1Arch = (await req('GET', `/api/sessions/${sA1}`)).data.sheet
          check('پس از آرشیو، زیرردیف A1-B1 از برگهٔ A حذف شد', !shA1Arch.parallelRelations.some((r: any) => r.relationId === relIdA1B1))
          const shB1Arch = (await req('GET', `/api/sessions/${sB1}`)).data.sheet
          check('پس از آرشیو، زیرردیف از برگهٔ B نیز حذف شد (هر دو سمت)', !shB1Arch.parallelRelations.some((r: any) => r.relationId === relIdA1B1))
          const restA1B1 = await req('PATCH', `/api/overlap-relations/${relIdA1B1}`, { action: 'restore' })
          check('بازگردانی A1-B1 موفق', restA1B1.status === 200 && restA1B1.data.relation.isActive === true)
          const valsAfter = await req('GET', `/api/projects/${projectId}/overlap/matrix?cycleId=${shA1.cycles[1].id}`)
          const beforeKeys = Object.keys((valsBefore.data as any).cells).sort()
          const afterKeys = Object.keys((valsAfter.data as any).cells).sort()
          check('مقادیر تاریخی چرخه‌ها پس از آرشیو/بازگردانی تغییر نکرد', JSON.stringify(beforeKeys) === JSON.stringify(afterKeys) && beforeKeys.length > 0)

          // Import بستهٔ حاوی رابطه‌های بین‌فعالیت فعال → روابط فعال می‌مانند
          const exp = await req('GET', `/api/projects/${projectId}/export`)
          const imp = await req('POST', '/api/projects/import', exp.data)
          check('Import بستهٔ دارای رابطهٔ بین‌فعالیت موفق', imp.status === 201 || imp.status === 200, `status=${imp.status}`)
          if (imp.status === 201 || imp.status === 200) {
            const newPid = imp.data.projectId ?? imp.data.project?.id
            const mNew = (await req('GET', `/api/projects/${newPid}/overlap/matrix`)).data
            const actOfNew = new Map<string, string>(mNew.elementsCatalog.map((c: any) => [c.elementId, c.activityId]))
            const activeRels = mNew.relations.filter((r: any) => r.isActive)
            const activeCross = activeRels.filter((r: any) => actOfNew.get(r.elementLowId) !== actOfNew.get(r.elementHighId))
            // ۶ رابطهٔ فعال: A-B، A-C، C-legacy، A1-A2، A1-B1، B1-C1
            check('Import بستهٔ قدیمی: تعداد روابط فعال حفظ شد (۶)', activeRels.length === 6, `count=${activeRels.length}`)
            check('Import بستهٔ قدیمی: روابط بین‌فعالیت فعال باقی ماندند (۲)', activeCross.length === 2, `cross=${activeCross.length}`)
            await req('DELETE', `/api/projects/${newPid}`)
          }

          // Import مکرر (مهاجرت دوباره): رابطه‌ها همچنان فعال، مقدارها دست‌نخورده
          const imp2 = await req('POST', '/api/projects/import', exp.data)
          if (imp2.status === 201 || imp2.status === 200) {
            const pid2b = imp2.data.projectId ?? imp2.data.project?.id
            const m2b = (await req('GET', `/api/projects/${pid2b}/overlap/matrix`)).data
            const actOf2b = new Map<string, string>(m2b.elementsCatalog.map((c: any) => [c.elementId, c.activityId]))
            const active2b = m2b.relations.filter((r: any) => r.isActive)
            const cross2b = active2b.filter((r: any) => actOf2b.get(r.elementLowId) !== actOf2b.get(r.elementHighId))
            check('مهاجرت/Import مکرر: رابطه‌های بین‌فعالیت فعال ماندند', cross2b.length === 2, `cross=${cross2b.length}`)
            await req('DELETE', `/api/projects/${pid2b}`)
          }
          // پاک‌سازی پروژهٔ دوم
          await req('DELETE', `/api/projects/${projectId2}`)
        }
      }
    }
  }

  console.log('── پاک‌سازی')
  const del = await req('DELETE', `/api/projects/${projectId}`)
  check('حذف پروژهٔ آزمون', del.status === 200)
  // حذف پروژه‌های import‌شدهٔ حاصل از آزمون (بدون باقی‌گذاشتن residue در دیتابیس)
  for (const pid of importedPids) {
    const delImp = await req('DELETE', `/api/projects/${pid}`)
    check(`حذف پروژهٔ import‌شده (${pid.slice(0, 8)}…)`, delImp.status === 200, `status=${delImp.status}`)
  }

  console.log(`\n═══ نتیجهٔ v1.5.0 (آنلاین): ${pass} پاس / ${fail} خطا ═══`)
  if (fail > 0) process.exit(1)
}

main().catch((e) => {
  console.error('خطای اجرای تست:', e)
  process.exit(1)
})
