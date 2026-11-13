/* تست ممیزی جلسه دوم — نسخهٔ آفلاین (§۱۲/§۱۴ سند اصلاحی)
   هم‌ارز scripts/test-overlap-review.ts آنلاین — اجرا با bun.
   پوشش: UNREVIEWED، بازهٔ واقعی، مقایسه‌پذیری، چند Session/Operator،
   Undo/Redo مقادیر هم‌پوشانی، حذف ساختاری، بدون رکورد یتیم. */
globalThis.localStorage = undefined;
await import(new URL('../offline/js/utils.js', import.meta.url).href);
await import(new URL('../offline/js/formulas.js', import.meta.url).href);
await import(new URL('../offline/js/db.js', import.meta.url).href);

const U = globalThis.T2U, DB = globalThis.T2DB;
let pass = 0, fail = 0;
function ok(cond, name, detail) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (detail ? ' — ' + detail : '')); }
}
function throwsWith(fn, substr, name) {
  try { fn(); ok(false, name, 'خطا پرتاب نشد'); }
  catch (e) { ok(String(e && e.message ? e.message : e).includes(substr), name, String(e && e.message ? e.message : e).slice(0, 120)); }
}

// ═══ fixture ═══
const proj = DB.createProject({ name: 'تست ممیزی ج۲ آفلاین', lineName: 'L', productName: 'P' });
const projectId = proj.id;
const st1 = DB.createStation(projectId, { name: 'ایستگاه ۱' });
const st2 = DB.createStation(projectId, { name: 'ایستگاه ۲' });
const actMain = DB.createActivity(st1.id, { name: 'فعالیت اصلی', processType: 'OPERATION' });
const actOther = DB.createActivity(st1.id, { name: 'فعالیت دیگر', processType: 'OPERATION' });
const actDel = DB.createActivity(st2.id, { name: 'فعالیت حذف‌شدنی', processType: 'OPERATION' });
const A = DB.createElement(actMain.id, { name: 'A', elementType: 'OVERLAP' });
const B = DB.createElement(actMain.id, { name: 'B', elementType: 'OVERLAP' });
const C = DB.createElement(actMain.id, { name: 'C', elementType: 'MANUAL' });
const Z = DB.createElement(actOther.id, { name: 'Z', elementType: 'MANUAL' });
const P = DB.createElement(actDel.id, { name: 'P', elementType: 'MANUAL' });
const Q = DB.createElement(actDel.id, { name: 'Q', elementType: 'MANUAL' });
const op1 = DB.createOperator(projectId, { displayName: 'اپراتور ۱' });
const op2 = DB.createOperator(projectId, { displayName: 'اپراتور ۲' });
const s1 = DB.createSession(actMain.id, { operatorId: op1.id, timingMethod: 'SNAPBACK' });
const s2 = DB.createSession(actMain.id, { operatorId: op2.id, timingMethod: 'SNAPBACK' });
DB.addCycles(s1.id, 3);
const sheet1 = DB.getSheet(s1.id);
const [cy1, cy2, cy3] = sheet1.cycles;
// چرخهٔ ۱: A=[0,10) B=[5,15) C=[20,30) → AB=5 (واقعی)، AC=0 (جدا)
DB.putCells(s1.id, [
  { cycleNo: 1, workElementId: A.id, startOffset: 0, endOffset: 10 },
  { cycleNo: 1, workElementId: B.id, startOffset: 5, endOffset: 15 },
  { cycleNo: 1, workElementId: C.id, startOffset: 20, endOffset: 30 },
]);
// چرخهٔ ۲: فقط A و B (بدون C → غیرقابل‌مقایسه برای A-C)
DB.putCells(s1.id, [
  { cycleNo: 2, workElementId: A.id, startOffset: 0, endOffset: 10 },
  { cycleNo: 2, workElementId: B.id, startOffset: 5, endOffset: 15 },
]);
// چرخهٔ ۳: فقط مدت
DB.putCells(s1.id, [
  { cycleNo: 3, workElementId: A.id, rawDuration: 10 },
  { cycleNo: 3, workElementId: B.id, rawDuration: 10 },
]);
DB.addCycles(s2.id, 1);
const sheet2 = DB.getSheet(s2.id);
const cyS2 = sheet2.cycles[0];
DB.putCells(s2.id, [
  { cycleNo: 1, workElementId: A.id, startOffset: 0, endOffset: 10 },
  { cycleNo: 1, workElementId: B.id, startOffset: 5, endOffset: 15 },
]);

const relAB = DB.createOverlapRelation(projectId, A.id, B.id);
const relAC = DB.createOverlapRelation(projectId, A.id, C.id);
// v1.5.0 §۴.۳ — ایجاد رابطهٔ بین‌فعالیت در سرور رد می‌شود (دامنه: یک Activity).
// برای سناریوی آرشیو/بازگردانیِ بین‌فعالیت (مهاجرت v1.5.0)، رابطه به‌صورت مستقیم
// در state ساخته و آرشیو می‌شود تا مسیر «دادهٔ قدیمی» شبیه‌سازی شود.
let relCross = { id: 'rel-cross-legacy-' + A.id.slice(0, 4), projectId: projectId, elementLowId: A.id < Z.id ? A.id : Z.id, elementHighId: A.id < Z.id ? Z.id : A.id, isActive: true, archiveReason: null, version: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
DB.getState().overlapRelations.push(relCross);
throwsWith(() => DB.createOverlapRelation(projectId, A.id, Z.id), 'یک فعالیت', 'ایجاد رابطهٔ بین‌فعالیت → خطا (v1.5.0 §۴.۳)');

// ═══ §۱۲ UNREVIEWED ═══
console.log('── UNREVIEWED: تفکیک سه حالت');
{
  const m = DB.getOverlapMatrix(projectId, cy1.id);
  ok(m.cells[relAB.id] == null, 'رابطهٔ فعال بدون رکورد چرخه → سلول خالی (UNREVIEWED نمایشی)');
  ok(m.validation.overallVerdict === 'INDETERMINATE', 'overallVerdict = INDETERMINATE (بررسی‌نشده)', m.validation.overallVerdict);
  ok(m.validation.confirmedVerdict === 'VALID', 'confirmedVerdict = VALID (سازگاری دادهٔ تأییدشده)', m.validation.confirmedVerdict);
  const res = DB.setCycleOverlaps(cy1.id, [{ relationId: relAB.id, status: 'UNREVIEWED' }]);
  ok(res.cells[relAB.id].overlapDuration === null, 'ثبت UNREVIEWED صریح مجاز است (null)');
  const m2 = DB.getOverlapMatrix(projectId, cy1.id);
  ok(m2.validation.overallVerdict === 'INDETERMINATE', 'رکورد UNREVIEWED صریح = همان وضعیت بررسی‌نشده');
}

// ═══ §۱۲ بازهٔ واقعی ═══
console.log('── بازهٔ واقعی: تطبیق، مرز، تعارض، ناقص');
{
  DB.setCycleOverlaps(cy1.id, [{ relationId: relAB.id, status: 'OVERLAP', overlapDuration: 5 }]);
  ok(true, 'AB=5 (بازهٔ واقعی) پذیرفته شد');
  throwsWith(() => DB.setCycleOverlaps(cy1.id, [{ relationId: relAB.id, status: 'OVERLAP', overlapDuration: 3 }]), 'تطبیق', 'AB=3 به‌جای ۵ → خطا با پیام تطبیق');
  throwsWith(() => DB.setCycleOverlaps(cy1.id, [{ relationId: relAB.id, status: 'OVERLAP', overlapDuration: 8 }]), 'تطبیق', 'AB=8 به‌جای ۵ → خطا');
  throwsWith(() => DB.setCycleOverlaps(cy1.id, [{ relationId: relAB.id, status: 'NO_OVERLAP' }]), 'تطبیق', 'NO_OVERLAP با بازهٔ مثبت → خطا');
  const m = DB.getOverlapMatrix(projectId, cy1.id);
  ok(m.cells[relAB.id].overlapDuration === 5, 'مقدار AB همچنان ۵ است (rollback)');
  DB.setCycleOverlaps(cy1.id, [{ relationId: relAC.id, status: 'NO_OVERLAP' }]);
  ok(true, 'AC جدا (واقعی صفر) → NO_OVERLAP پذیرفته شد');
  DB.setCycleOverlaps(cy3.id, [{ relationId: relAB.id, status: 'OVERLAP', overlapDuration: 4 }]);
  const m3 = DB.getOverlapMatrix(projectId, cy3.id);
  ok(m3.validation.overallVerdict === 'INDETERMINATE' && (m3.validation.intervalIssues || []).some(i => i.kind === 'INDETERMINATE'),
    'چرخهٔ فقط-مدت: ادعای تطبیق با بازه نمی‌شود (INDETERMINATE)');
}

// ═══ §۱۲ مقایسه‌پذیری ═══
console.log('── مقایسه‌پذیری چرخه');
{
  const m = DB.getOverlapMatrix(projectId, cy2.id);
  ok(m.comparability[relAC.id] && m.comparability[relAC.id].isComparable === false, 'A-C در چرخهٔ بدون مشاهدهٔ C → غیرقابل‌مقایسه');
  ok((m.comparability[relAC.id].notComparableReason || '').includes('مشاهده'), 'دلیل فارسی ارائه شد', m.comparability[relAC.id].notComparableReason);
  throwsWith(() => DB.setCycleOverlaps(cy2.id, [{ relationId: relAC.id, status: 'OVERLAP', overlapDuration: 2 }]), 'قابل‌مقایسه', 'ثبت OVERLAP برای زوج غیرقابل‌مقایسه → خطا');
  const m2 = DB.getOverlapMatrix(projectId, cy2.id);
  ok(m2.cells[relAC.id] == null, 'هیچ رکورد جعلی ساخته نشد');
  ok(m.comparability[relAB.id].isComparable === true, 'A-B با مشاهدهٔ هر دو → قابل‌مقایسه');
  ok(m.comparability[relCross.id].isComparable === false, 'رابطهٔ بین‌فعالیتتی در چرخهٔ فعالیت دیگر → غیرقابل‌مقایسه');
  // v1.5.0 §۴.۳ — بازگردانی رابطهٔ بین‌فعالیت (هر دو عنصر موجود ولی در فعالیت‌های متفاوت) ممنوع است
  DB.archiveOverlapRelation(relCross.id);
  throwsWith(() => DB.restoreOverlapRelation(relCross.id), 'دو فعالیت', 'بازگردانی رابطهٔ بین‌فعالیت → خطا (§۴.۳)');
  const crossRelState = DB.getState().overlapRelations.find(r => r.id === relCross.id);
  ok(crossRelState && crossRelState.isActive === false, 'رابطهٔ بین‌فعالیت آرشیو ماند');
}

// ═══ §۱۲ چند Session/Operator مستقل + Undo/Redo ═══
console.log('── فرم عنصر و Session/Operator + Undo/Redo');
{
  DB.setCycleOverlaps(cy2.id, [{ relationId: relAB.id, status: 'OVERLAP', overlapDuration: 5 }]);
  const mS2 = DB.getOverlapMatrix(projectId, cyS2.id);
  ok(mS2.cells[relAB.id] == null, 'چرخهٔ جلسهٔ ۲ مقدار ندارد (استقلال جلسه/اپراتور)');
  const relsGlobal = DB.getElementRelations(B.id);
  ok(relsGlobal.scope === 'PROJECT' && relsGlobal.rows[0].latest && relsGlobal.rows[0].latest.cycleNo === 2 && relsGlobal.rows[0].latest.overlapDuration === 5,
    'فرم عنصر (بدون Session): آخرین مقدار کل پروژه', JSON.stringify(relsGlobal.rows[0] && relsGlobal.rows[0].latest));
  const relsS2 = DB.getElementRelations(B.id, { sessionId: s2.id });
  ok(relsS2.scope === 'SESSION' && relsS2.rows[0].latest == null, 'فرم زمان‌سنجی جلسهٔ ۲: مقدار جلسهٔ ۱ نشت نمی‌کند', JSON.stringify(relsS2.rows[0] && relsS2.rows[0].latest));
  const relsS1 = DB.getElementRelations(B.id, { sessionId: s1.id });
  ok(relsS1.rows[0].latest && relsS1.rows[0].latest.overlapDuration === 5 && relsS1.rows[0].latest.cycleNo === 2,
    'فرم زمان‌سنجی جلسهٔ ۱: مقدار همین جلسه');

  // Undo/Redo از مسیر snapshot/replace (همان جریان views-timing)
  const snap = DB.snapshotSessionRows(s1.id);
  ok(Array.isArray(snap.overlaps) && snap.overlaps.length >= 2, 'snapshot شامل مقادیر هم‌پوشانی جلسه است', 'len=' + (snap.overlaps || []).length);
  const mBefore = DB.getOverlapMatrix(projectId, cy1.id);
  ok(mBefore.cells[relAB.id].overlapDuration === 5 && mBefore.cells[relAC.id].status === 'NO_OVERLAP', 'پیش از حذف: AB=5 و AC=NO_OVERLAP');
  // حذف چرخهٔ ۱ (deleteCycleSafe معادل views-timing)
  const snapDel = DB.snapshotSessionRows(s1.id);
  snapDel.cycles = snapDel.cycles.filter(c => c.id !== cy1.id);
  snapDel.lanes = snapDel.lanes.filter(l => l.cycleId !== cy1.id);
  snapDel.observations = snapDel.observations.filter(o => o.cycleId !== cy1.id);
  snapDel.overlaps = (snapDel.overlaps || []).filter(o => o.cycleId !== cy1.id);
  DB.replaceSessionRows(s1.id, snapDel);
  const st1del = DB.getState();
  ok(!st1del.observationOverlaps.some(o => o.cycleId === cy1.id), 'مقادیر چرخهٔ حذف‌شده حذف شدند (بدون یتیم)');
  ok(st1del.observationOverlaps.some(o => o.cycleId === cy2.id && o.relationId === relAB.id), 'مقادیر چرخهٔ ۲ دست‌نخورده');
  // Undo: بازگردانی snapshot
  DB.replaceSessionRows(s1.id, snap);
  const mRestored = DB.getOverlapMatrix(projectId, cy1.id);
  ok(mRestored.cells[relAB.id] && mRestored.cells[relAB.id].overlapDuration === 5, 'Undo: AB=5 با relationId/cycleId قبلی بازگشت');
  ok(mRestored.cells[relAC.id] && mRestored.cells[relAC.id].status === 'NO_OVERLAP', 'Undo: AC=NO_OVERLAP بازگشت');
  ok(mRestored.cells[relAB.id].version === mBefore.cells[relAB.id].version, 'Undo: version حفظ شد');
  // Redo
  const snapRedo = DB.snapshotSessionRows(s1.id);
  snapRedo.cycles = snapRedo.cycles.filter(c => c.id !== cy1.id);
  snapRedo.overlaps = (snapRedo.overlaps || []).filter(o => o.cycleId !== cy1.id);
  snapRedo.observations = snapRedo.observations.filter(o => o.cycleId !== cy1.id);
  snapRedo.lanes = snapRedo.lanes.filter(l => l.cycleId !== cy1.id);
  DB.replaceSessionRows(s1.id, snapRedo);
  const st1redo = DB.getState();
  ok(!st1redo.observationOverlaps.some(o => o.cycleId === cy1.id), 'Redo: حذف دوباره — بدون ردیف یتیم');
  DB.replaceSessionRows(s1.id, snap); // بازگردانی برای ادامه
}

// ═══ §۱۲ تناقض سه‌تایی (در سطح سرویس آفلاین) ═══
console.log('── تناقض سه‌تایی D=10 AB=8 AC=8 BC=1');
{
  const proj3 = DB.createProject({ name: 'سه‌تایی آفلاین', lineName: 'L', productName: 'P' });
  const st3 = DB.createStation(proj3.id, { name: 'S' });
  const act3 = DB.createActivity(st3.id, { name: 'A3', processType: 'OPERATION' });
  const e1 = DB.createElement(act3.id, { name: 'E1', elementType: 'MANUAL' });
  const e2 = DB.createElement(act3.id, { name: 'E2', elementType: 'MANUAL' });
  const e3 = DB.createElement(act3.id, { name: 'E3', elementType: 'MANUAL' });
  const op3 = DB.createOperator(proj3.id, { displayName: 'OP3' });
  const s3 = DB.createSession(act3.id, { operatorId: op3.id, timingMethod: 'SNAPBACK' });
  DB.addCycles(s3.id, 1);
  const c3 = DB.getSheet(s3.id).cycles[0];
  DB.putCells(s3.id, [
    { cycleNo: 1, workElementId: e1.id, startOffset: 0, endOffset: 10 },
    { cycleNo: 1, workElementId: e2.id, startOffset: 2, endOffset: 12 },
    { cycleNo: 1, workElementId: e3.id, startOffset: 2, endOffset: 12 },
  ]);
  const r12 = DB.createOverlapRelation(proj3.id, e1.id, e2.id);
  const r13 = DB.createOverlapRelation(proj3.id, e1.id, e3.id);
  const r23 = DB.createOverlapRelation(proj3.id, e2.id, e3.id);
  DB.setCycleOverlaps(c3.id, [
    { relationId: r12.id, status: 'OVERLAP', overlapDuration: 8 },
    { relationId: r13.id, status: 'OVERLAP', overlapDuration: 8 },
  ]);
  ok(true, 'ثبت AB=8 و AC=8 موفق');
  throwsWith(() => DB.setCycleOverlaps(c3.id, [{ relationId: r23.id, status: 'OVERLAP', overlapDuration: 1 }]), '', 'ثبت BC=1 رد شد');
  const m3 = DB.getOverlapMatrix(proj3.id, c3.id);
  ok(m3.cells[r12.id].overlapDuration === 8 && m3.cells[r13.id].overlapDuration === 8, 'مقادیر قبلی AB/AC حفظ شدند');
  ok(m3.cells[r23.id] == null, 'مقدار نامعتبر BC ذخیره نشد');
  DB.deleteProject(proj3.id);
}

// ═══ §۱۲ حذف ساختاری ═══
console.log('── حذف ساختاری: عنصر / فعالیت / ایستگاه / پروژه');
{
  const relPQ = DB.createOverlapRelation(projectId, P.id, Q.id);
  DB.deleteElement(P.id);
  const pqAfter = DB.getState().overlapRelations.find(r => r.id === relPQ.id);
  ok(pqAfter && pqAfter.isActive === false, 'رابطهٔ P-Q پس از حذف عنصر آرشیو شد');
  DB.deleteActivity(actDel.id);
  const pqAfterAct = DB.getState().overlapRelations.find(r => r.id === relPQ.id);
  ok(pqAfterAct && pqAfterAct.isActive === false, 'رابطه پس از حذف فعالیت همچنان آرشیو است (بدون endpoint فعال حذف‌شده)');
  // حذف فعالیت دیگر → آرشیو رابطهٔ بین‌فعالیتتی
  DB.deleteActivity(actOther.id);
  const crossAfter = DB.getState().overlapRelations.find(r => r.id === relCross.id);
  ok(crossAfter && crossAfter.isActive === false, 'رابطهٔ بین‌فعالیتتی پس از حذف فعالیت آرشیو شد');
  // حذف ایستگاه → روابط همهٔ عناصر همهٔ فعالیت‌های زیرمجموعه آرشیو
  const st3 = DB.createStation(projectId, { name: 'ایستگاه حذف‌شدنی' });
  const actSt3 = DB.createActivity(st3.id, { name: 'فعالیت ایستگاه حذف', processType: 'OPERATION' });
  const eM = DB.createElement(actSt3.id, { name: 'M', elementType: 'MANUAL' });
  const eN = DB.createElement(actSt3.id, { name: 'N', elementType: 'MANUAL' });
  const relMN = DB.createOverlapRelation(projectId, eM.id, eN.id);
  DB.deleteStation(st3.id);
  const mnAfter = DB.getState().overlapRelations.find(r => r.id === relMN.id);
  ok(mnAfter && mnAfter.isActive === false, 'رابطهٔ M-N پس از حذف ایستگاه آرشیو شد (بدون endpoint فعال)');
  // حذف پروژه → بدون یتیم
  DB.deleteProject(projectId);
  const st = DB.getState();
  ok(!st.overlapRelations.some(r => r.projectId === projectId), 'هیچ رابطه‌ای از پروژهٔ حذف‌شده نماند');
  ok(!st.observationOverlaps.some(o => {
    const rel = st.overlapRelations.find(r => r.id === o.relationId);
    return rel && rel.projectId === projectId;
  }), 'هیچ مقدار چرخه‌ای یتیم از پروژهٔ حذف‌شده نماند');
}

console.log('\n═══ نتیجهٔ ممیزی ج۲ (آفلاین): ' + pass + ' پاس / ' + fail + ' خطا ═══');
if (fail > 0) process.exit(1);
