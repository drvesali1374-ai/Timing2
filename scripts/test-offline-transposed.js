// ═══════════════════════════════════════════════════════════
// آزمون‌های اجباری v1.5.0 — §۱۳ (نسخهٔ آفلاین) + هم‌ارزی §۱۵
// همان fixture و همان مقادیر مورد انتظارِ تست آنلاین
// (test-transposed-sheet.ts) — اثبات هم‌ارزی دو موتور.
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
  const proj = DB.createProject({ name: 'تست v1.5.0 آفلاین', lineName: 'خط آزمون', productName: 'محصول T', studyDate: '2026-01-01' })
  const projectId = proj.id
  const st = DB.createStation(projectId, { name: 'ایستگاه ۱' })
  const act = DB.createActivity(st.id, { name: 'فعالیت مونتاژ', processType: 'OPERATION' })
  const act2 = DB.createActivity(st.id, { name: 'فعالیت دیگر', processType: 'OPERATION' })

  // ── §۱۳.۱ ──
  console.log('── §۱۳.۱ حذف نوع عنصر کاری')
  const eA = DB.createElement(act.id, { name: 'عنصر A' })
  const eB = DB.createElement(act.id, { name: 'عنصر B' })
  const eC = DB.createElement(act.id, { name: 'عنصر C' })
  ok('ایجاد عنصر بدون type موفق', !!eA.id)
  const rawA = DB.getState().workElements.find((e) => e.id === eA.id)
  ok('ردیف خام عنصر elementType legacy دارد اما فرم آن را نمی‌گیرد', rawA.elementType === 'MANUAL')
  ok('عنصر جدید پیش‌فرض SEQ/OPERATOR دارد', rawA.defaultEntryMode === 'SEQ' && rawA.defaultLaneType === 'OPERATOR')
  DB.updateElement(eA.id, { name: 'عنصر A (ویرایش)' })
  ok('ویرایش عنصر بدون type موفق', DB.getState().workElements.find((e) => e.id === eA.id).name === 'عنصر A (ویرایش)')
  // ورودی legacy elementType نادیده گرفته می‌شود
  const eLegacy = DB.createElement(act.id, { name: 'عنصر legacy', elementType: 'MACHINE' })
  const rawLegacy = DB.getState().workElements.find((e) => e.id === eLegacy.id)
  ok('elementType در ورودی نادیده گرفته شد (پیش‌فرض فنی)', rawLegacy.defaultEntryMode === 'SEQ' && rawLegacy.defaultLaneType === 'OPERATOR')

  const op1 = DB.createOperator(projectId, { displayName: 'اپراتور ۱' })
  const op2 = DB.createOperator(projectId, { displayName: 'اپراتور ۲' })
  const s1 = DB.createSession(act.id, { operatorId: op1.id, timingMethod: 'SNAPBACK' })
  const sheet0 = DB.getSheet(s1.id)
  ok('برگه بدون elementType — عناصر با defaultEntry/defaultLaneType', sheet0.elements.every((e) => !('elementType' in e) && e.defaultEntry === 'SEQ' && e.defaultLaneType === 'OPERATOR'))

  // مهاجرت v1.5.0 → v1.5.1 — بستهٔ قدیمی: فقط مقدارهای ناموجود پر می‌شوند؛
  // رابطهٔ بین‌فعالیت دیگر آرشیو نمی‌شود؛ نشانگر اجرای یک‌باره (v1.5.1 §۹)
  {
    const st2 = DB.getState()
    const oldEl = { id: 'legacy-mig-el-1', activityId: act.id, name: 'عنصر مهاجرت', description: null, elementType: 'MACHINE', sortOrder: 99, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    const oldElKept = { id: 'legacy-mig-el-2', activityId: act.id, name: 'عنصر مهاجرت ۲', description: null, elementType: 'MACHINE', defaultEntryMode: 'SEQ', defaultLaneType: 'OPERATOR', sortOrder: 98, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    st2.workElements.push(oldEl, oldElKept)
    const zEl = DB.createElement(act2.id, { name: 'عنصر Z فعالیت ۲' })
    const relCross = { id: 'legacy-mig-rel-1', projectId: projectId, elementLowId: eA.id < zEl.id ? eA.id : zEl.id, elementHighId: eA.id < zEl.id ? zEl.id : eA.id, isActive: true, archiveReason: null, version: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    st2.overlapRelations.push(relCross)
    // شبیه‌سازی migrateV150 v1.5.1 (هم‌ارز db.js): فقط مقدار ناموجود + نشانگر یک‌باره
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
    ok('مهاجرت: مقدار معتبر موجود بازنویسی نشد (SEQ/OPERATOR ماند)', migKept.defaultEntryMode === 'SEQ' && migKept.defaultLaneType === 'OPERATOR')
    const migRel = snapshot.overlapRelations.find((r) => r.id === 'legacy-mig-rel-1')
    ok('مهاجرت v1.5.1: رابطهٔ بین‌فعالیت فعال ماند (سیاست آرشیو لغو شد)', migRel.isActive === true && !migRel.archiveReason)
    // اجرای دوم (نشانگر) → مقدار تغییرداده‌شده دست نمی‌خورد
    migEl.defaultEntryMode = 'SEQ'
    migrate(snapshot)
    ok('مهاجرت: نشانگر اجرای یک‌باره — اجرای دوم مقدارها را بازنویسی نمی‌کند', migEl.defaultEntryMode === 'SEQ')
    // پاک‌سازی عناصر مهاجرت از state زنده
    DB.getState().workElements = DB.getState().workElements.filter((e) => e.id !== 'legacy-mig-el-1' && e.id !== 'legacy-mig-el-2')
    DB.getState().overlapRelations = DB.getState().overlapRelations.filter((r) => r.id !== 'legacy-mig-rel-1')
  }

  // ── §۱۳.۲ ──
  console.log('── §۱۳.۲ رابطهٔ دوطرفه در برگهٔ زمان‌سنجی')
  const relAB = DB.createOverlapRelation(projectId, eA.id, eB.id)
  const relAC = DB.createOverlapRelation(projectId, eA.id, eC.id)
  ok('ایجاد A-B و A-C', !!relAB.id && !!relAC.id)
  const s2 = DB.createSession(act.id, { operatorId: op2.id, timingMethod: 'SNAPBACK' })
  DB.addCycles(s1.id, 2)
  const sh1 = DB.getSheet(s1.id)
  ok('برگه ۲ رابطهٔ فعال دارد (A-B و A-C)', sh1.parallelRelations.length === 2)
  ok('رابطه‌های canonical (low/high مرتب)', sh1.parallelRelations.every((r) => r.elementLowId < r.elementHighId))
  ok('تعداد OverlapRelation فعال دقیقاً ۲ (نه ۴)', DB.listOverlapRelations(projectId).filter((r) => r.isActive).length === 2)
  ok('زیرردیف‌ها WorkElement جدید نمی‌سازند (تعداد عناصر ثابت)', sh1.elements.length === 4)
  const relsOf = (id) => sh1.parallelRelations.filter((r) => r.elementLowId === id || r.elementHighId === id)
  ok('زیر A دو رابطه (B و C)', relsOf(eA.id).length === 2)
  ok('زیر B یک رابطه (A)', relsOf(eB.id).length === 1)
  ok('زیر C یک رابطه (A)', relsOf(eC.id).length === 1)

  // ── §۱۳.۳ ──
  console.log('── §۱۳.۳ مقداردهی دوطرفه')
  const cy1 = sh1.cycles[0]
  const cy2 = sh1.cycles[1]
  DB.putCells(s1.id, [
    { cycleNo: 1, workElementId: eA.id, rawDuration: 10 },
    { cycleNo: 1, workElementId: eB.id, rawDuration: 6 },
  ])
  DB.setCycleOverlaps(cy1.id, [{ relationId: relAB.id, status: 'OVERLAP', overlapDuration: 3 }])
  ok('ثبت ۳s از سمت A موفق', true)
  let sh1b = DB.getSheet(s1.id)
  ok('مقدار زیر B نیز ۳ است (همان رکورد)', sh1b.cycles[0].overlaps[relAB.id].overlapDuration === 3)
  DB.setCycleOverlaps(cy1.id, [{ relationId: relAB.id, status: 'OVERLAP', overlapDuration: 4 }])
  sh1b = DB.getSheet(s1.id)
  ok('تغییر به ۴s از سمت B موفق', sh1b.cycles[0].overlaps[relAB.id].overlapDuration === 4)
  ok('مقدار زیر A نیز ۴ شد (یک منبع واحد)', sh1b.cycles[0].overlaps[relAB.id].overlapDuration === 4)
  // فقط یک رکورد ObservationOverlap
  const ovRows = DB.getState().observationOverlaps.filter((o) => o.relationId === relAB.id && o.cycleId === cy1.id)
  ok('فقط یک رکورد ObservationOverlap برای A-B در چرخهٔ ۱', ovRows.length === 1)
  // چرخهٔ ۲ مقدار جداگانه
  DB.putCells(s1.id, [
    { cycleNo: 2, workElementId: eA.id, rawDuration: 10 },
    { cycleNo: 2, workElementId: eB.id, rawDuration: 6 },
  ])
  DB.setCycleOverlaps(cy2.id, [{ relationId: relAB.id, status: 'NO_OVERLAP' }])
  sh1b = DB.getSheet(s1.id)
  ok('ثبت جداگانه در چرخهٔ ۲ موفق (NO_OVERLAP)', sh1b.cycles[1].overlaps[relAB.id].status === 'NO_OVERLAP')
  ok('چرخهٔ ۱ همچنان ۴ است (استقلال چرخه‌ها)', sh1b.cycles[0].overlaps[relAB.id].overlapDuration === 4)

  // ── §۱۳.۴ ──
  console.log('── §۱۳.۴ استقلال اپراتورها')
  let sh2 = DB.getSheet(s2.id)
  ok('برگهٔ اپراتور ۲ همان روابط را می‌بیند', sh2.parallelRelations.length === 2)
  ok('برگهٔ اپراتور ۲ مقدار چرخهٔ اپراتور ۱ را ندارد', Object.keys(sh2.cycles[0] ? sh2.cycles[0].overlaps : {}).length === 0)
  DB.addCycles(s2.id, 1)
  sh2 = DB.getSheet(s2.id)
  const cyO2 = sh2.cycles[0]
  DB.putCells(s2.id, [
    { cycleNo: 1, workElementId: eA.id, rawDuration: 10 },
    { cycleNo: 1, workElementId: eB.id, rawDuration: 6 },
  ])
  DB.setCycleOverlaps(cyO2.id, [{ relationId: relAB.id, status: 'OVERLAP', overlapDuration: 2 }])
  sh2 = DB.getSheet(s2.id)
  ok('ثبت مقدار مستقل اپراتور ۲ موفق', sh2.cycles[0].overlaps[relAB.id].overlapDuration === 2)
  const sh1e = DB.getSheet(s1.id)
  ok('تغییر اپراتور ۲ اپراتور ۱ را تغییر نداد', sh1e.cycles[0].overlaps[relAB.id].overlapDuration === 4)

  // ── §۱۳.۷ ──
  console.log('── §۱۳.۷ سه وضعیت سلول')
  {
    const shNow = DB.getSheet(s1.id)
    ok('خالی = UNREVIEWED (نبود رکورد A-C)', shNow.cycles[0].overlaps[relAC.id] == null)
    ok('صفر = NO_OVERLAP (چرخهٔ ۲)', shNow.cycles[1].overlaps[relAB.id].status === 'NO_OVERLAP' && shNow.cycles[1].overlaps[relAB.id].overlapDuration === 0)
    ok('مثبت = OVERLAP (چرخهٔ ۱ = ۴)', shNow.cycles[0].overlaps[relAB.id].status === 'OVERLAP' && shNow.cycles[0].overlaps[relAB.id].overlapDuration === 4)
    const clr = DB.setCycleOverlaps(cy2.id, [{ relationId: relAB.id, status: 'UNREVIEWED' }])
    ok('پاک‌کردن → UNREVIEWED (null، نه صفر)', clr.cells[relAB.id].overlapDuration === null)
  }

  // ── §۱۳.۸ ──
  console.log('── §۱۳.۸ محاسبات دست‌نخورده')
  {
    // مقدار دستی ۴ در چرخهٔ ۲ (فقط-مدت)؛ سپس بازه‌ها → واقعی ۷ ≠ ۴
    DB.setCycleOverlaps(cy2.id, [{ relationId: relAB.id, status: 'OVERLAP', overlapDuration: 4 }])
    // فیلدهای غایب صریحاً null — هم‌ارز preprocess آنلاین (جایگزینی کامل سلول)
    DB.putCells(s1.id, [
      { cycleNo: 2, workElementId: eA.id, rawDuration: null, cumulativeReading: null, startOffset: 0, endOffset: 10 },
      { cycleNo: 2, workElementId: eB.id, rawDuration: null, cumulativeReading: null, startOffset: 3, endOffset: 10 },
    ])
    const shCalc = DB.getSheet(s1.id)
    ok('تعداد عناصر اصلی ثابت (زیرردیف‌ها شمرده نمی‌شوند)', shCalc.elements.length === 4)
    close(shCalc.cycles[1].elapsed, 10, 'elapsed از بازه‌ها = ۱۰ (بدون افزودن هم‌پوشانی)')
    const an = DB.getActivityAnalysis(act.id)
    ok('تحلیل بدون elementTypeTotals', !('elementTypeTotals' in an))
    ok('تحلیل: عناصر بدون فیلد elementType', an.elements.every((e) => !('elementType' in e)))
    ok('فعالیت دارای رابطهٔ فعال → NEEDS_AGGREGATION_RULE', an.activityTotal.status === 'NEEDS_AGGREGATION_RULE')
    const m = DB.getOverlapMatrix(projectId, cy2.id)
    const intervalIssue = (m.validation.intervalIssues || []).find((i) => i.pair.includes(eA.id) && i.pair.includes(eB.id))
    ok('اعتبارسنجی بازهٔ واقعی فعال است (۴ ≠ ۷ → issue)', !!intervalIssue && intervalIssue.kind === 'DEFINITE')
    throwsWith(() => DB.setCycleOverlaps(cy2.id, [{ relationId: relAB.id, status: 'OVERLAP', overlapDuration: 3 }]), 'تطبیق', 'اختلاف با بازهٔ واقعی رد شد (§۵.۵)')
    throwsWith(() => DB.setCycleOverlaps(cy1.id, [{ relationId: relAC.id, status: 'OVERLAP', overlapDuration: 2 }]), 'قابل‌مقایسه', 'زوج غیرقابل‌مقایسه → ثبت مقدار قطعی رد شد')
  }

  // ── §۱۳.۹ ──
  console.log('── §۱۳.۹ Paste روی زیرردیف هم‌پوشانی')
  {
    const pv = DB.pastePreview(s1.id, { cycleNo: 2, elementId: eA.id, relationId: null }, ['-', '7'].join('\n'))
    ok('پیش‌نمایش Paste با محور جدید موفق', pv.counts.healthy + pv.counts.errors + pv.counts.noChange >= 1)
    ok('ردیف ۲ پیش‌نمایش زیرردیف رابطه است', pv.gridRows[1] && pv.gridRows[1].kind === 'RELATION')
    const ovCell = pv.cells.find((c) => c.row === 1 && c.colIndex === 0)
    ok('سلول زیرردیف → OVERLAP با مقدار ۷', ovCell && ovCell.overlapStatus === 'OVERLAP' && ovCell.overlapDuration === 7, JSON.stringify(ovCell).slice(0, 120))
    const cm = DB.pasteCommit(s1.id, pv, 'ALL_OR_NOTHING')
    ok('ثبت Paste شامل زیرردیف موفق', cm.applied >= 1)
    const shP = DB.getSheet(s1.id)
    ok('مقدار A-B پس از Paste = ۷ (منبع واحد)', shP.cycles[1].overlaps[relAB.id].overlapDuration === 7)
    const bad = DB.pastePreview(s1.id, { cycleNo: 2, elementId: eA.id, relationId: null }, ['-', '3'].join('\n'))
    const badCell = bad.cells.find((c) => c.row === 1 && c.colIndex === 0)
    ok('رد مقدار نامعتبر در زیرردیف (۳ ≠ ۷)', badCell && badCell.status === 'ERROR')
    // حذف چرخه + بازگردانی (Undo واقعی آفلاین: snapshot + replaceSessionRows)
    const preDelete = DB.snapshotSessionRows(s1.id) // تصویر کامل پیش از حذف (شامل overlaps)
    const snapDel = DB.snapshotSessionRows(s1.id)
    snapDel.cycles = snapDel.cycles.filter((c) => c.id !== cy2.id)
    snapDel.lanes = snapDel.lanes.filter((l) => l.cycleId !== cy2.id)
    snapDel.observations = snapDel.observations.filter((o) => o.cycleId !== cy2.id)
    snapDel.overlaps = (snapDel.overlaps || []).filter((o) => o.cycleId !== cy2.id)
    DB.replaceSessionRows(s1.id, snapDel)
    const shDel = DB.getSheet(s1.id)
    ok('حذف چرخهٔ دارای مقدار — مقدار حذف شد', shDel.cycles.every((c) => c.id !== cy2.id))
    // Undo — بازگردانی snapshot کامل (معادل doUndo در UI آفلاین)
    DB.replaceSessionRows(s1.id, preDelete)
    const shU = DB.getSheet(s1.id)
    const restored = shU.cycles.find((c) => c.cycleNo === 2)
    ok('بازگردانی چرخه (Undo) با مقادیر هم‌پوشانی موفق', restored && restored.overlaps[relAB.id] && restored.overlaps[relAB.id].overlapDuration === 7)
    ok('هیچ ردیف یتیم نماند (رابطه‌ها فعال)', shU.parallelRelations.length === 2)
  }

  // ── §۱۳.۶ ──
  console.log('── §۱۳.۶ حذف و بازگردانی رابطه')
  {
    DB.archiveOverlapRelation(relAB.id)
    const shArch = DB.getSheet(s1.id)
    ok('زیرردیف A-B (هر دو سمت) حذف شد', shArch.parallelRelations.length === 1 && !shArch.parallelRelations.some((r) => r.relationId === relAB.id))
    const rawOv = DB.getState().observationOverlaps.filter((o) => o.relationId === relAB.id)
    ok('مقادیر تاریخی با آرشیو حفظ شد', rawOv.length > 0)
    DB.restoreOverlapRelation(relAB.id)
    const shRest = DB.getSheet(s1.id)
    ok('بازگردانی A-B موفق — زیرردیف‌ها برگشتند', shRest.parallelRelations.length === 2)
    const restored = shRest.cycles.find((c) => c.cycleNo === 2)
    ok('مقدار تاریخی پس از بازگردانی برگشت (۷)', restored.overlaps[relAB.id].overlapDuration === 7)
  }

  // ── §۱۳.۵ ──
  console.log('── §۱۳.۵ افزودن رابطه — دیده‌شدن در همهٔ جلسات')
  {
    const relCL = DB.createOverlapRelation(projectId, eC.id, eLegacy.id)
    ok('افزودن رابطهٔ جدید (C-legacy) موفق', !!relCL.id)
    const sh1f = DB.getSheet(s1.id)
    const sh2f = DB.getSheet(s2.id)
    ok('برگهٔ اپراتور ۱ رابطهٔ جدید را می‌بیند', sh1f.parallelRelations.some((r) => r.relationId === relCL.id))
    ok('برگهٔ اپراتور ۲ نیز همان رابطه را می‌بیند (§۷)', sh2f.parallelRelations.some((r) => r.relationId === relCL.id))
    throwsWith(() => DB.createOverlapRelation(projectId, eC.id, eLegacy.id), 'از قبل', 'رابطهٔ تکراری رد شد')
    throwsWith(() => DB.createOverlapRelation(projectId, eC.id, eC.id), 'خودش', 'خود-رابطه رد شد')
  }

  // ── §۱۳.۱۰ v1.5.1 — روابط موازی بین‌فعالیت (آفلاین — هم‌ارز تست آنلاین) ──
  console.log('── §۱۳.۱۰ روابط بین‌فعالیت (Cross-Activity)')
  {
    const st2x = DB.createStation(projectId, { name: 'ایستگاه ۲' })
    const actC = DB.createActivity(st2x.id, { name: 'فعالیت مونتاژ', processType: 'OPERATION' })
    const actB2 = DB.createActivity(st.id, { name: 'فعالیت دیگر', processType: 'OPERATION' })
    const B1 = DB.createElement(act2.id, { name: 'عنصر B1' })
    const B2 = DB.createElement(act2.id, { name: 'عنصر B2' })
    const C1 = DB.createElement(actC.id, { name: 'عنصر C1' })
    const NB1 = DB.createElement(actB2.id, { name: 'عنصر B1' })

    // ── انتخاب‌گرها — کاتالوگ کامل پروژه ──
    const mCat = DB.getOverlapMatrix(projectId, null)
    const catalog = mCat.elementsCatalog
    ok('کاتالوگ: عناصر فعالیت B قابل انتخاب‌اند', catalog.some((c) => c.elementId === B1.id && c.activityId === act2.id))
    ok('کاتالوگ: عناصر فعالیت C (ایستگاه دیگر) قابل انتخاب‌اند', catalog.some((c) => c.elementId === C1.id && c.activityId === actC.id))
    ok('فعالیت‌های هم‌نام با شناسهٔ متفاوت تفکیک می‌شوند', catalog.filter((c) => c.activityName === 'فعالیت دیگر').length === 4 && new Set(catalog.filter((c) => c.activityName === 'فعالیت دیگر').map((c) => c.activityId)).size === 2)
    ok('عنصر هم‌نام NB1 با شناسهٔ مستقل در کاتالوگ است', catalog.some((c) => c.elementId === NB1.id) && NB1.id !== B1.id)
    ok('کاتالوگ شامل همهٔ ایستگاه‌هاست', new Set(catalog.map((c) => c.stationId)).size === 2)

    // ── API و سرویس ──
    const relA1B1 = DB.createOverlapRelation(projectId, eA.id, B1.id)
    ok('ایجاد رابطهٔ بین‌فعالیت A-B1 موفق (v1.5.1 §۶)', !!relA1B1.id)
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

    // آرشیو و بازگردانی بین‌فعالیت
    DB.archiveOverlapRelation(relB1C1.id)
    ok('آرشیو رابطهٔ بین‌فعالیت (B1-C1) موفق', DB.getState().overlapRelations.find((r) => r.id === relB1C1.id).isActive === false)
    DB.restoreOverlapRelation(relB1C1.id)
    ok('بازگردانی رابطهٔ بین‌فعالیت موفق (v1.5.1 §۶)', DB.getState().overlapRelations.find((r) => r.id === relB1C1.id).isActive === true)
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
    ok('DTO روابط: نام/فعالیت/ایستگاه هر دو endpoint', relDtoA && relDtoA.elementLowName && relDtoA.elementHighName && relDtoA.elementLowActivityName && relDtoA.elementHighActivityName && relDtoA.elementLowStationName && relDtoA.elementHighStationName && ![relDtoA.elementLowName, relDtoA.elementHighName].includes('؟'))
    ok('فرم A برچسب بین‌فعالیت دارد (crossActivity)', DB.getElementRelations(eA.id).rows.find((r) => r.relationId === relA1B1.id).crossActivity === true)
    ok('فرم B1 همان رابطه را می‌بیند', DB.getElementRelations(B1.id).rows.some((r) => r.relationId === relA1B1.id))
    ok('عناصر برگهٔ B همان فعالیت B است (A ستون نیست)', !shB1s.elements.some((e) => e.id === eA.id))
    ok('WorkElement جدید ساخته نشد (فعالیت B: ۳ عنصر — Z، B1، B2)', DB.getState().workElements.filter((e) => e.activityId === act2.id).length === 3)
    const activeABpairs = DB.listOverlapRelations(projectId).filter((r) => r.isActive && ((r.elementLowId === eA.id && r.elementHighId === B1.id) || (r.elementLowId === B1.id && r.elementHighId === eA.id)))
    ok('هیچ رکورد رابطهٔ معکوس ساخته نشد', activeABpairs.length === 1)

    // ── مقایسه‌پذیری ──
    throwsWith(() => DB.setCycleOverlaps(cy1.id, [{ relationId: relA1B1.id, status: 'OVERLAP', overlapDuration: 3 }]), 'قابل‌مقایسه', 'زوج بین‌فعالیت بدون مشاهدهٔ B1 → ثبت قطعی رد شد')
    throwsWith(() => DB.setCycleOverlaps(cy1.id, [{ relationId: relA1B1.id, status: 'NO_OVERLAP' }]), 'قابل‌مقایسه', 'ثبت NO_OVERLAP جعلی نیز رد شد')
    const mCmp = DB.getOverlapMatrix(projectId, cy1.id)
    ok('ماتریس: زوج بین‌فعالیت غیرقابل‌مقایسه با دلیل فارسی', mCmp.comparability[relA1B1.id] && mCmp.comparability[relA1B1.id].isComparable === false && /قابل‌مقایسه نیست/.test(mCmp.comparability[relA1B1.id].notComparableReason || ''))

    // ── حفظ داده ──
    const rawOvBefore = DB.getState().observationOverlaps.filter((o) => o.cycleId === cy1.id).map((o) => o.id).sort().join(',')
    DB.archiveOverlapRelation(relA1B1.id)
    ok('پس از آرشیو، زیرردیف A-B1 از برگهٔ A حذف شد', !DB.getSheet(s1.id).parallelRelations.some((r) => r.relationId === relA1B1.id))
    ok('پس از آرشیو، زیرردیف از برگهٔ B نیز حذف شد (هر دو سمت)', !DB.getSheet(sB1.id).parallelRelations.some((r) => r.relationId === relA1B1.id))
    DB.restoreOverlapRelation(relA1B1.id)
    const rawOvAfter = DB.getState().observationOverlaps.filter((o) => o.cycleId === cy1.id).map((o) => o.id).sort().join(',')
    ok('مقادیر تاریخی چرخه‌ها پس از آرشیو/بازگردانی تغییر نکرد', rawOvBefore === rawOvAfter && rawOvBefore.length > 0)
  }

  console.log('\n═══ نتیجهٔ v1.5.0 (آفلاین): ' + pass + ' پاس / ' + fail + ' خطا ═══')
  if (fail > 0) process.exit(1)
})()
