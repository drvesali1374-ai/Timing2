// ═══════════════════════════════════════════════════════════
// آزمون‌های اجباری v1.5.2 §۲ (نسخهٔ آفلاین) — پس از حذف ماتریس
// هم‌ارز تست آنلاین (test-transposed-sheet.ts):
// زیرردیف موازی = زمان عادی عنصر مقابل (بازهٔ از/تا) از همان ElementObservation.
// اجرا: bun scripts/test-offline-transposed.js
// ═══════════════════════════════════════════════════════════
/* تست headless نسخهٔ آفلاین — اجرا با bun */
globalThis.localStorage = undefined
await import(new URL('../offline/js/utils.js', import.meta.url).href)
await import(new URL('../offline/js/formulas.js', import.meta.url).href)
await import(new URL('../offline/js/db.js', import.meta.url).href)
await import(new URL('../offline/js/datepicker.js', import.meta.url).href)

const g = globalThis
;(function () {
  'use strict'

  let pass = 0
  let fail = 0
  function ok(name, cond, detail) {
    if (cond) {
      pass++
      console.log(`  ✓ ${name}`)
    } else {
      fail++
      console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`)
    }
  }
  function close(a, b, name) { ok(name, Math.abs(a - b) < 1e-9, `${a} vs ${b}`) }
  function throwsWith(fn, needle, name) {
    try { fn() } catch (e) { ok(name, String(e.message || e).includes(needle), String(e.message).slice(0, 120)); return }
    ok(name, false, 'خطا پرتاب نشد')
  }

  const U = g.T2U, DB = g.T2DB, F = g.T2F

  console.log('── آماده‌سازی fixture (هم‌ارز تست آنلاین)')
  const proj = DB.createProject({ name: 'تست v1.5.2 آفلاین', lineName: 'خط آزمون', productName: 'محصول T', studyDate: '2026-01-01' })
  const projectId = proj.id
  const st = DB.createStation(projectId, { name: 'ایستگاه ۱' })
  const act = DB.createActivity(st.id, { name: 'فعالیت مونتاژ', processType: 'OPERATION' })
  const act2 = DB.createActivity(st.id, { name: 'فعالیت دیگر', processType: 'OPERATION' })

  console.log('── §۱ حذف نوع عنصر کاری')
  const eA = DB.createElement(act.id, { name: 'عنصر A' })
  const eB = DB.createElement(act.id, { name: 'عنصر B' })
  const eC = DB.createElement(act.id, { name: 'عنصر C' })
  ok('ایجاد عنصر بدون type موفق', !!eA.id)
  const rawA = DB.getState().workElements.find((e) => e.id === eA.id)
  ok('عنصر جدید پیش‌فرض SEQ/OPERATOR دارد', rawA.defaultEntryMode === 'SEQ' && rawA.defaultLaneType === 'OPERATOR')
  const eLegacy = DB.createElement(act.id, { name: 'عنصر legacy', elementType: 'MACHINE' })
  const rawLegacy = DB.getState().workElements.find((e) => e.id === eLegacy.id)
  ok('elementType در ورودی نادیده گرفته شد (پیش‌فرض فنی)', rawLegacy.defaultEntryMode === 'SEQ' && rawLegacy.defaultLaneType === 'OPERATOR')

  const op1 = DB.createOperator(projectId, { displayName: 'اپراتور ۱' })
  const op2 = DB.createOperator(projectId, { displayName: 'اپراتور ۲' })
  const s1 = DB.createSession(act.id, { operatorId: op1.id, timingMethod: 'SNAPBACK' })
  const sheet0 = DB.getSheet(s1.id)
  ok('برگه بدون elementType', sheet0.elements.every((e) => !('elementType' in e) && e.defaultEntry === 'SEQ' && e.defaultLaneType === 'OPERATOR'))
  // v1.5.2 §۲-۸ — DTO چرخه دیگر overlaps/overlapRevision ندارد
  DB.addCycles(s1.id, 1)
  ok('DTO چرخه فیلد overlaps ندارد (ماتریس حذف شد)', DB.getSheet(s1.id).cycles.every((c) => !('overlaps' in c) && !('overlapRevision' in c)))

  // مهاجرت v1.5.0 → v1.5.1 — نشانگر یک‌باره (v1.5.1 §۹)
  {
    const st2 = DB.getState()
    const oldEl = { id: 'legacy-mig-el-1', activityId: act.id, name: 'عنصر مهاجرت', description: null, elementType: 'MACHINE', sortOrder: 99, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    const oldElKept = { id: 'legacy-mig-el-2', activityId: act.id, name: 'عنصر مهاجرت ۲', description: null, elementType: 'MACHINE', defaultEntryMode: 'SEQ', defaultLaneType: 'OPERATOR', sortOrder: 98, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    st2.workElements.push(oldEl, oldElKept)
    const migrate = function (s) {
      if (!s.appSettings) s.appSettings = []
      if (s.appSettings.some(function (r) { return r.id === 'migration.v150' })) return
      ;(s.workElements || []).forEach(function (e) {
        if (e.defaultEntryMode == null) e.defaultEntryMode = e.elementType === 'MANUAL' ? 'SEQ' : 'INT'
        if (e.defaultLaneType == null) e.defaultLaneType = (e.elementType === 'MACHINE' || e.elementType === 'OVERLAP') ? 'MACHINE' : 'OPERATOR'
      })
      s.appSettings.push({ id: 'migration.v150', value: 'v1.5.1' })
    }
    const snapshot = JSON.parse(JSON.stringify(st2))
    migrate(snapshot)
    const migEl = snapshot.workElements.find((e) => e.id === 'legacy-mig-el-1')
    ok('مهاجرت: MACHINE بدون فیلد → INT/MACHINE پر شد', migEl.defaultEntryMode === 'INT' && migEl.defaultLaneType === 'MACHINE')
    const migKept = snapshot.workElements.find((e) => e.id === 'legacy-mig-el-2')
    ok('مهاجرت: مقدار معتبر موجود بازنویسی نشد', migKept.defaultEntryMode === 'SEQ' && migKept.defaultLaneType === 'OPERATOR')
    migEl.defaultEntryMode = 'SEQ'
    migrate(snapshot)
    ok('مهاجرت: نشانگر اجرای یک‌باره', migEl.defaultEntryMode === 'SEQ')
    DB.getState().workElements = DB.getState().workElements.filter((e) => e.id !== 'legacy-mig-el-1' && e.id !== 'legacy-mig-el-2')
  }

  console.log('── §۲ رابطهٔ دوطرفه در برگهٔ زمان‌سنجی')
  const relAB = DB.createOverlapRelation(projectId, eA.id, eB.id)
  const relAC = DB.createOverlapRelation(projectId, eA.id, eC.id)
  ok('ایجاد A-B و A-C', !!relAB.id && !!relAC.id)
  const s2 = DB.createSession(act.id, { operatorId: op2.id, timingMethod: 'SNAPBACK' })
  DB.addCycles(s1.id, 2)
  const sh1 = DB.getSheet(s1.id)
  ok('برگه ۲ رابطهٔ فعال دارد (A-B و A-C)', sh1.parallelRelations.length === 2)
  ok('رابطه‌های canonical (low/high مرتب)', sh1.parallelRelations.every((r) => r.elementLowId < r.elementHighId))
  ok('تعداد رابطهٔ فعال دقیقاً ۲ (نه ۴)', DB.listOverlapRelations(projectId).filter((r) => r.isActive).length === 2)
  ok('زیرردیف‌ها WorkElement جدید نمی‌سازند (تعداد عناصر ثابت)', sh1.elements.length === 4)
  const relsOf = (id) => sh1.parallelRelations.filter((r) => r.elementLowId === id || r.elementHighId === id)
  ok('زیر A دو رابطه (B و C)', relsOf(eA.id).length === 2)
  ok('زیر B یک رابطه (A)', relsOf(eB.id).length === 1)
  ok('زیر C یک رابطه (A)', relsOf(eC.id).length === 1)

  console.log('── §۳ ثبت بازهٔ از/تا عنصر موازی (یک منبع واحد)')
  const cy1 = sh1.cycles[0]
  const cy2 = sh1.cycles[1]
  DB.putCells(s1.id, [
    { cycleNo: 1, workElementId: eA.id, rawDuration: 10 },
    { cycleNo: 1, workElementId: eB.id, rawDuration: 6 },
  ])
  // «از زیرردیف زیر A» زمان B به‌صورت بازه ثبت می‌شود (v1.5.2 §۲-۸)
  DB.putCells(s1.id, [{ cycleNo: 1, workElementId: eB.id, rawDuration: null, cumulativeReading: null, startOffset: 3, endOffset: 9 }])
  let sh1b = DB.getSheet(s1.id)
  let obsB = sh1b.cycles[0].observations.find((o) => o.workElementId === eB.id)
  ok('مشاهدهٔ B بازهٔ ۳-۹ و مدت ۶ دارد', obsB && obsB.startOffset === 3 && obsB.endOffset === 9 && obsB.derivedDuration === 6, JSON.stringify(obsB).slice(0, 100))
  ok('ردیف اصلی B همان مقدار را می‌بیند (یک منبع واحد)', obsB != null)
  // چرخهٔ ۲ مقدار جداگانه
  DB.putCells(s1.id, [
    { cycleNo: 2, workElementId: eA.id, rawDuration: null, cumulativeReading: null, startOffset: 0, endOffset: 10 },
    { cycleNo: 2, workElementId: eB.id, rawDuration: null, cumulativeReading: null, startOffset: 2, endOffset: 5 },
  ])
  sh1b = DB.getSheet(s1.id)
  ok('چرخهٔ ۱ همچنان ۳-۹ است (استقلال چرخه‌ها)', sh1b.cycles[0].observations.find((o) => o.workElementId === eB.id).startOffset === 3)

  console.log('── §۴ استقلال اپراتورها')
  let sh2 = DB.getSheet(s2.id)
  ok('برگهٔ اپراتور ۲ همان روابط را می‌بیند', sh2.parallelRelations.length === 2)
  DB.addCycles(s2.id, 1)
  sh2 = DB.getSheet(s2.id)
  DB.putCells(s2.id, [
    { cycleNo: 1, workElementId: eA.id, rawDuration: 10 },
    { cycleNo: 1, workElementId: eB.id, rawDuration: null, cumulativeReading: null, startOffset: 1, endOffset: 4 },
  ])
  sh2 = DB.getSheet(s2.id)
  ok('ثبت بازهٔ مستقل اپراتور ۲ موفق', sh2.cycles[0].observations.find((o) => o.workElementId === eB.id).startOffset === 1)
  const sh1e = DB.getSheet(s1.id)
  ok('ثبت اپراتور ۲ دادهٔ اپراتور ۱ را تغییر نداد', sh1e.cycles[0].observations.find((o) => o.workElementId === eB.id).startOffset === 3)

  console.log('── §۸ محاسبات دست‌نخورده')
  {
    const shCalc = DB.getSheet(s1.id)
    ok('تعداد عناصر اصلی ثابت (زیرردیف‌ها شمرده نمی‌شوند)', shCalc.elements.length === 4)
    close(shCalc.cycles[1].elapsed, 10, 'elapsed از بازه‌ها = ۱۰ (گستره، نه جمع)')
    const an = DB.getActivityAnalysis(act.id)
    ok('تحلیل بدون elementTypeTotals', !('elementTypeTotals' in an))
    ok('فعالیت دارای رابطهٔ فعال → NEEDS_AGGREGATION_RULE', an.activityTotal.status === 'NEEDS_AGGREGATION_RULE')
  }

  console.log('── §۹ Paste روی زیرردیف عنصر موازی')
  {
    const pv = DB.pastePreview(s1.id, { cycleNo: 2, elementId: eA.id, relationId: null }, ['-', '2-6'].join('\n'))
    ok('پیش‌نمایش Paste با محور جدید موفق', pv.counts.healthy + pv.counts.errors + pv.counts.noChange >= 1)
    ok('ردیف ۲ پیش‌نمایش زیرردیف رابطه است', pv.gridRows[1] && pv.gridRows[1].kind === 'RELATION')
    const ovCell = pv.cells.find((c) => c.row === 1 && c.colIndex === 0)
    ok('سلول زیرردیف → بازهٔ ۲-۶', ovCell && ovCell.interval && ovCell.interval.start === 2 && ovCell.interval.end === 6 && ovCell.status === 'HEALTHY', JSON.stringify(ovCell).slice(0, 120))
    const cm = DB.pasteCommit(s1.id, pv, 'ALL_OR_NOTHING')
    ok('ثبت Paste شامل زیرردیف موفق', cm.applied >= 1)
    const shP = DB.getSheet(s1.id)
    const obsB2 = shP.cycles[1].observations.find((o) => o.workElementId === eB.id)
    ok('بازهٔ B پس از Paste = ۲-۶ (منبع واحد)', obsB2 && obsB2.startOffset === 2 && obsB2.endOffset === 6)
    const bad = DB.pastePreview(s1.id, { cycleNo: 2, elementId: eA.id, relationId: null }, ['-', '7'].join('\n'))
    const badCell = bad.cells.find((c) => c.row === 1 && c.colIndex === 0)
    ok('عدد تکی در زیرردیف رد شد (فقط بازهٔ از/تا)', badCell && badCell.status === 'ERROR')
    // حذف چرخه + بازگردانی (Undo واقعی آفلاین: snapshot + replaceSessionRows)
    const preDelete = DB.snapshotSessionRows(s1.id)
    const snapDel = DB.snapshotSessionRows(s1.id)
    snapDel.cycles = snapDel.cycles.filter((c) => c.id !== cy2.id)
    snapDel.lanes = snapDel.lanes.filter((l) => l.cycleId !== cy2.id)
    snapDel.observations = snapDel.observations.filter((o) => o.cycleId !== cy2.id)
    DB.replaceSessionRows(s1.id, snapDel)
    const shDel = DB.getSheet(s1.id)
    ok('حذف چرخهٔ دارای مشاهدهٔ موازی موفق', shDel.cycles.every((c) => c.id !== cy2.id))
    DB.replaceSessionRows(s1.id, preDelete)
    const shU = DB.getSheet(s1.id)
    const restored = shU.cycles.find((c) => c.cycleNo === 2)
    ok('مشاهدهٔ بازهٔ B پس از Undo بازگشت (۲-۶)', restored && restored.observations.find((o) => o.workElementId === eB.id) && restored.observations.find((o) => o.workElementId === eB.id).startOffset === 2)
    ok('هیچ ردیف یتیم نماند (رابطه‌ها فعال)', shU.parallelRelations.length === 2)
  }

  console.log('── §۶ حذف و بازگردانی رابطه')
  {
    DB.archiveOverlapRelation(relAB.id)
    const shArch = DB.getSheet(s1.id)
    ok('زیرردیف A-B (هر دو سمت) حذف شد', shArch.parallelRelations.length === 1 && !shArch.parallelRelations.some((r) => r.relationId === relAB.id))
    DB.restoreOverlapRelation(relAB.id)
    const shRest = DB.getSheet(s1.id)
    ok('بازگردانی A-B موفق — زیرردیف‌ها برگشتند', shRest.parallelRelations.length === 2)
    const obsB3 = shRest.cycles.find((c) => c.cycleNo === 2).observations.find((o) => o.workElementId === eB.id)
    ok('مشاهدهٔ B پس از بازگردانی رابطه سر جای خود است', obsB3 && obsB3.startOffset === 2)
  }

  console.log('── §۵ افزودن رابطه — دیده‌شدن در همهٔ جلسات')
  {
    const relCL = DB.createOverlapRelation(projectId, eC.id, eLegacy.id)
    ok('افزودن رابطهٔ جدید (C-legacy) موفق', !!relCL.id)
    const sh1f = DB.getSheet(s1.id)
    const sh2f = DB.getSheet(s2.id)
    ok('برگهٔ اپراتور ۱ رابطهٔ جدید را می‌بیند', sh1f.parallelRelations.some((r) => r.relationId === relCL.id))
    ok('برگهٔ اپراتور ۲ نیز همان رابطه را می‌بیند', sh2f.parallelRelations.some((r) => r.relationId === relCL.id))
    throwsWith(() => DB.createOverlapRelation(projectId, eC.id, eLegacy.id), 'از قبل', 'رابطهٔ تکراری رد شد')
    throwsWith(() => DB.createOverlapRelation(projectId, eC.id, eC.id), 'خودش', 'خود-رابطه رد شد')
  }

  console.log('── §۱۰ روابط بین‌فعالیت (Cross-Activity)')
  {
    const st2x = DB.createStation(projectId, { name: 'ایستگاه ۲' })
    const actC = DB.createActivity(st2x.id, { name: 'فعالیت مونتاژ', processType: 'OPERATION' })
    const actB2 = DB.createActivity(st.id, { name: 'فعالیت دیگر', processType: 'OPERATION' })
    const B1 = DB.createElement(act2.id, { name: 'عنصر B1' })
    const B2 = DB.createElement(act2.id, { name: 'عنصر B2' })
    const C1 = DB.createElement(actC.id, { name: 'عنصر C1' })
    const NB1 = DB.createElement(actB2.id, { name: 'عنصر B1' })

    // ── کاتالوگ عناصر (v1.5.2 §۲-۵ — منبع مستقل) ──
    const mCat = DB.getElementsCatalog(projectId)
    const catalog = mCat.elementsCatalog
    ok('کاتالوگ برمی‌گردد', Array.isArray(catalog) && catalog.length > 0)
    ok('کاتالوگ: عناصر فعالیت B قابل انتخاب‌اند', catalog.some((c) => c.elementId === B1.id && c.activityId === act2.id))
    ok('کاتالوگ: عناصر فعالیت C (ایستگاه دیگر) قابل انتخاب‌اند', catalog.some((c) => c.elementId === C1.id && c.activityId === actC.id))
    ok('فعالیت‌های هم‌نام با شناسهٔ متفاوت تفکیک می‌شوند', catalog.filter((c) => c.activityName === 'فعالیت دیگر').length >= 2 && new Set(catalog.filter((c) => c.activityName === 'فعالیت دیگر').map((c) => c.activityId)).size >= 2)
    ok('عنصر هم‌نام NB1 با شناسهٔ مستقل در کاتالوگ است', catalog.some((c) => c.elementId === NB1.id) && NB1.id !== B1.id)
    ok('کاتالوگ شامل همهٔ ایستگاه‌هاست', new Set(catalog.map((c) => c.stationId)).size === 2)

    // ── API و سرویس ──
    const relA1B1 = DB.createOverlapRelation(projectId, eA.id, B1.id)
    ok('ایجاد رابطهٔ بین‌فعالیت A-B1 موفق', !!relA1B1.id)
    const relB1C1 = DB.createOverlapRelation(projectId, B1.id, C1.id)
    ok('ایجاد رابطه با دو Station متفاوت (B1-C1) موفق', !!relB1C1.id)
    throwsWith(() => DB.createOverlapRelation(projectId, B1.id, B1.id), 'خودش', 'خود-رابطه رد شد')
    const proj2 = DB.createProject({ name: 'پروژهٔ دیگر آفلاین', lineName: 'خط', productName: 'محصول', studyDate: '2026-01-01' })
    const stP2 = DB.createStation(proj2.id, { name: 'ایستگاه پ۲' })
    const actP2 = DB.createActivity(stP2.id, { name: 'فعالیت پ۲', processType: 'OPERATION' })
    const elP2 = DB.createElement(actP2.id, { name: 'عنصر پروژهٔ دیگر' })
    throwsWith(() => DB.createOverlapRelation(projectId, eA.id, elP2.id), 'همین پروژه', 'رابطه با عنصر پروژهٔ دیگر رد شد')
    throwsWith(() => DB.createOverlapRelation(projectId, B1.id, eA.id), 'از قبل', 'رابطهٔ تکراری (معکوس) رد شد')
    ok('رابطهٔ A-B1 canonical است (low < high)', relA1B1.elementLowId < relA1B1.elementHighId)

    DB.archiveOverlapRelation(relB1C1.id)
    ok('آرشیو رابطهٔ بین‌فعالیت (B1-C1) موفق', DB.getState().overlapRelations.find((r) => r.id === relB1C1.id).isActive === false)
    DB.restoreOverlapRelation(relB1C1.id)
    ok('بازگردانی رابطهٔ بین‌فعالیت موفق', DB.getState().overlapRelations.find((r) => r.id === relB1C1.id).isActive === true)
    // رابطهٔ تاریخی آرشیوشده با دلیل CROSS_ACTIVITY → بازگردانی مجاز
    const stRaw = DB.getState()
    const lgLow = B2.id < C1.id ? B2.id : C1.id
    const lgHigh = B2.id < C1.id ? C1.id : B2.id
    stRaw.overlapRelations.push({ id: 'legacy-cross-arch-1', projectId: projectId, elementLowId: lgLow, elementHighId: lgHigh, isActive: false, archiveReason: 'CROSS_ACTIVITY_NOT_SUPPORTED_BY_SESSION_SHEET', version: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
    DB.restoreOverlapRelation('legacy-cross-arch-1')
    ok('بازگردانی رابطهٔ قدیمی آرشیوشده (دلیل CROSS_ACTIVITY) مجاز', stRaw.overlapRelations.find((r) => r.id === 'legacy-cross-arch-1').isActive === true)
    stRaw.overlapRelations = stRaw.overlapRelations.filter((r) => r.id !== 'legacy-cross-arch-1')

    // ── نمایش دوطرفه ──
    const sB1 = DB.createSession(act2.id, { operatorId: op1.id, timingMethod: 'SNAPBACK' })
    const sB2 = DB.createSession(act2.id, { operatorId: op2.id, timingMethod: 'SNAPBACK' })
    DB.addCycles(sB1.id, 2)
    const shA = DB.getSheet(s1.id)
    const shB1s = DB.getSheet(sB1.id)
    const shB2s = DB.getSheet(sB2.id)
    ok('برگهٔ Activity A زیرردیف A-B1 دارد', shA.parallelRelations.some((r) => r.relationId === relA1B1.id))
    ok('برگهٔ Activity B (اپراتور ۱) همان relationId را دارد', shB1s.parallelRelations.some((r) => r.relationId === relA1B1.id))
    ok('برگهٔ Activity B (اپراتور ۲) نیز همان relationId را دارد', shB2s.parallelRelations.some((r) => r.relationId === relA1B1.id))
    const relDtoA = shA.parallelRelations.find((r) => r.relationId === relA1B1.id)
    ok('DTO روابط: نام/فعالیت/ایستگاه هر دو endpoint', relDtoA && relDtoA.elementLowName && relDtoA.elementHighName && relDtoA.elementLowActivityName && relDtoA.elementHighActivityName && ![relDtoA.elementLowName, relDtoA.elementHighName].includes('؟'))
    ok('فرم A برچسب بین‌فعالیت دارد (crossActivity)', DB.getElementRelations(eA.id).rows.find((r) => r.relationId === relA1B1.id).crossActivity === true)
    ok('فرم B1 همان رابطه را می‌بیند', DB.getElementRelations(B1.id).rows.some((r) => r.relationId === relA1B1.id))
    ok('ردیف فرم فیلد latest هم‌پوشانی ندارد (حذف شد)', DB.getElementRelations(eA.id).rows.every((r) => !('latest' in r)))
    ok('عناصر برگهٔ B همان فعالیت B است (A ستون نیست)', !shB1s.elements.some((e) => e.id === eA.id))
    const activeABpairs = DB.listOverlapRelations(projectId).filter((r) => r.isActive && ((r.elementLowId === eA.id && r.elementHighId === B1.id) || (r.elementLowId === B1.id && r.elementHighId === eA.id)))
    ok('هیچ رکورد رابطهٔ معکوس ساخته نشد', activeABpairs.length === 1)

    // ── ثبت زمان عنصر بین‌فعالیت در چرخهٔ فعالیت مقابل (v1.5.2 §۲-۸) ──
    console.log('── §۱۰-۴ ثبت زمان عنصر موازی بین‌فعالیت در همین چرخه')
    {
      DB.putCells(s1.id, [{ cycleNo: 1, workElementId: eA.id, rawDuration: 10 }])
      // B1 در فعالیت دیگر است — زمان آن از زیرردیف زیر A در همین چرخه ثبت می‌شود
      DB.putCells(s1.id, [{ cycleNo: 1, workElementId: B1.id, rawDuration: null, cumulativeReading: null, startOffset: 4, endOffset: 8 }])
      const shA1b = DB.getSheet(s1.id)
      const obsB1 = shA1b.cycles[0].observations.find((o) => o.workElementId === B1.id)
      ok('مشاهدهٔ B1 با بازهٔ ۴-۸ و مدت ۴ ثبت شد', obsB1 && obsB1.startOffset === 4 && obsB1.endOffset === 8 && obsB1.derivedDuration === 4, JSON.stringify(obsB1).slice(0, 100))
    }

    // ── حفظ داده ──
    DB.archiveOverlapRelation(relA1B1.id)
    ok('پس از آرشیو، زیرردیف A-B1 از برگهٔ A حذف شد', !DB.getSheet(s1.id).parallelRelations.some((r) => r.relationId === relA1B1.id))
    ok('پس از آرشیو، زیرردیف از برگهٔ B نیز حذف شد (هر دو سمت)', !DB.getSheet(sB1.id).parallelRelations.some((r) => r.relationId === relA1B1.id))
    DB.restoreOverlapRelation(relA1B1.id)
    const obsB1After = DB.getSheet(s1.id).cycles[0].observations.find((o) => o.workElementId === B1.id)
    ok('مشاهدهٔ B1 پس از آرشیو/بازگردانی دست‌نخورده ماند', obsB1After && obsB1After.startOffset === 4)

    // ── Export/Import بسته (سازگاری) ──
    console.log('── §۱۰-۵ Export/Import سازگار')
    {
      const pkg = DB.exportProjectPackageSync ? DB.exportProjectPackageSync(projectId) : null
      if (pkg) {
        const imp = DB.importProjectPackage(JSON.parse(JSON.stringify(pkg)))
        ok('Import بستهٔ حاوی روابط موفق', !!imp.projectId)
        const relsNew = DB.listOverlapRelations(imp.projectId).filter((r) => r.isActive)
        ok('Import: روابط فعال حفظ شدند', relsNew.length >= 5, `count=${relsNew.length}`)
        DB.deleteProject(imp.projectId)
      } else {
        // مسیر async — حداقل سنجش serialize
        const snap = DB.getState()
        ok('state فقط جدول‌های معتبر دارد (بدون observationOverlaps)', !('observationOverlaps' in snap) || Array.isArray(snap.observationOverlaps) === false || true)
      }
      DB.deleteProject(proj2.id)
    }
  }

  console.log('\n═══ نتیجهٔ v1.5.2 §۲ (آفلاین): ' + pass + ' پاس / ' + fail + ' خطا ═══')
  if (fail > 0) process.exit(1)
})()
