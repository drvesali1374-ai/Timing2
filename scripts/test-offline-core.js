/* تست headless کامل هسته آفلاین — اجرا با bun
   مسیرها نسبی و قابل حمل‌اند (مستقل از محل کلون مخزن) */
// متغیر محیطی تست: بدون ذخیره‌سازی مرورگر
globalThis.localStorage = undefined;
await import(new URL('../offline/js/utils.js', import.meta.url).href);
await import(new URL('../offline/js/formulas.js', import.meta.url).href);
await import(new URL('../offline/js/db.js', import.meta.url).href);
await import(new URL('../offline/js/datepicker.js', import.meta.url).href);

const U = globalThis.T2U, F = globalThis.T2F, DB = globalThis.T2DB;
let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; } else { fail++; console.error('FAIL:', name); } }
function close(a, b, name, tol = 1e-9) { ok(Math.abs(a - b) <= tol, name + ` (got ${a}, want ${b})`); }

// ═══ ۱) آزمون‌های مرجع فرمول (PRD بخش ۸) ═══
const RT = F.REFERENCE_TESTS;
close(F.computeRatingFactor(RT.westinghouse.factors), RT.westinghouse.expectedR, 'R = 1.09');
close(F.computeNormalTime(RT.westinghouse.ot, 1.09), RT.westinghouse.expectedNT, 'NT(8.30, 1.09) = 9.047');
close(F.computeStandardTime(RT.allowance.nt, RT.allowance.a, 'PERCENT_OF_NT'), RT.allowance.expectedM1, 'ST m1 = 10.40405');
close(F.roundForDisplay(F.computeStandardTime(RT.allowance.nt, RT.allowance.a, 'SHARE_OF_ST'), 6), RT.allowance.expectedM2, 'ST m2 = 10.643529 (6dp)');
close(F.computeStandardTime(RT.allowance.nt, RT.allowance.a, 'SHARE_OF_ST'), 10.643529411765, 'ST m2 raw', 1e-10);
const dur = F.deriveContinuousSequence(RT.continuous.readings).map(r => r.duration);
ok(JSON.stringify(dur) === JSON.stringify([8, 12, 25]), 'continuous 8/20/45 -> 8/12/25');
close(F.sumIntervalDurations(RT.overlap.intervals), 28, 'sum intervals = 28');
close(F.elapsedCycleTime(RT.overlap.intervals), 25, 'elapsed = 25');
ok(F.formatForDisplay(RT.rounding.raw) === RT.rounding.expectedDisplay, 'rounding 12.357 -> 12.36');
try { F.computeStandardTime(9, 1.2, 'SHARE_OF_ST'); ok(false, 'A>=1 must throw'); } catch (e) { ok(true, 'A>=1 must throw'); }
const flags = F.detectOutliers([8.2, 8.4, 8.1, 8.3, 30.5, 8.4, 8.1, 8.3].map((v, i) => ({ value: v, ref: 'o' + i })), { method: 'mad', threshold: 3.5 });
ok(flags.length === 1 && flags[0].ref === 'o4' && flags[0].rule === 'MODIFIED_Z_MAD', 'MAD flags 30.5 only');
const stt = F.descriptiveStats([8, 12, 25]);
ok(stt.count === 3 && stt.sampleSD !== null && stt.cvPercent !== null, 'stats n=3');
ok(F.descriptiveStats([5]).sampleSD === null, 'n=1 SD = null');
close(F.aggregateElement([{ operatorId: 'a', values: [8, 12] }, { operatorId: 'b', values: [25] }], 'WEIGHTED_BY_COUNT').value, 15, 'weighted mean');
close(F.aggregateElement([{ operatorId: 'a', values: [8, 12] }, { operatorId: 'b', values: [25] }], 'EQUAL_OPERATOR_MEAN').value, (10 + 25) / 2, 'equal operator mean');

// ═══ ۲) جلالی roundtrip (اصلاح باگ d2g) ═══
let jFail = 0;
for (let jy = 1300; jy <= 1500; jy += 1) {
  for (const jm of [1, 6, 7, 12]) {
    for (const jd of [1, 15, 28]) {
      if (!U.isValidJalali(jy, jm, jd)) continue;
      const iso = U.jalaliToISO(jy, jm, jd);
      const back = U.isoToJalali(iso);
      if (back.jy !== jy || back.jm !== jm || back.jd !== jd) jFail++;
    }
  }
}
ok(jFail === 0, 'jalali roundtrip (900+ cases)');
ok(U.jalaliToISO(1404, 8, 13) === '2025-11-04', 'jalaliToISO(1404,8,13) = 2025-11-04');

// ═══ ۲ب) روز هفتهٔ جلالی — مبنای شبکهٔ تقویم DatePicker (۰=شنبه) ═══
const WD = globalThis.T2DATE.weekDay;
ok(typeof WD === 'function', 'datepicker module exports weekDay');
ok(WD(1404, 8, 13) === 3, 'weekday(1404,8,13) = سه‌شنبه (2025-11-04)');
ok(WD(1404, 1, 1) === 6, 'weekday(1404,1,1) = جمعه (نوروز ۲۰۲۵)');
ok(WD(1403, 12, 29) === 4, 'weekday(1403,12,29) = پنج‌شنبه (2025-03-20)');
let wdFail = 0;
for (let jy = 1390; jy <= 1410; jy += 1) {
  for (let jm = 1; jm <= 12; jm += 1) {
    const len = U.jalCalMonthLength(jy, jm);
    if (WD(jy, jm, 1) < 0 || WD(jy, jm, 1) > 6) wdFail++;
    if ((WD(jy, jm, 1) + len - 1) % 7 !== WD(jy, jm, len)) wdFail++;
    if (WD(jy, jm, 2) !== (WD(jy, jm, 1) + 1) % 7) wdFail++;
  }
}
ok(wdFail === 0, 'weekday grid consistency (21 years × 12 months)');

// ═══ ۳) لایه داده — seed دمو ═══
const p = DB.seedDemo();
ok(!!p && p.name.includes('دمو'), 'demo project created');
const projectId = p.id;
const stations = DB.sortStations(projectId);
ok(stations.length === 2, '2 stations');
const acts = DB.sortActivities(stations[0].id).concat(DB.sortActivities(stations[1].id));
ok(acts.length === 3, '3 activities');
const act1 = acts.find(a => a.name === 'بستن درب پنل');
const act2 = acts.find(a => a.name === 'پرس اتوماتیک روتور');
const act3 = acts.find(a => a.name === 'کنترل کیفیت نهایی');
const sessions1 = DB.listSessions(act1.id);
ok(sessions1.length === 2, 'act1: 2 sessions');

// زنجیره پیوسته
const contSession = sessions1.find(s => s.timingMethod === 'CONTINUOUS');
const sheet = DB.getSheet(contSession.id);
const c1 = sheet.cycles[0];
const obsByEl = {};
c1.observations.forEach(o => { obsByEl[o.workElementId] = o; });
const els = sheet.elements;
close(obsByEl[els[0].id].derivedDuration, 8.5, 'continuous el1 = 8.5');
close(obsByEl[els[1].id].derivedDuration, 21.0 - 8.5, 'continuous el2 = 12.5');
close(obsByEl[els[2].id].derivedDuration, 27.6 - 21.0, 'continuous el3 = 6.6');
ok(c1.isComplete === true, 'cycle 1 complete');

// outlier
const snapSession = sessions1.find(s => s.timingMethod === 'SNAPBACK');
const sheet1 = DB.getSheet(snapSession.id);
let suspectFound = null;
sheet1.cycles.forEach(c => c.observations.forEach(o => { if (o.validityStatus === 'SUSPECT') suspectFound = o; }));
ok(!!suspectFound && Math.abs(suspectFound.derivedDuration - 30.5) < 1e-9, '30.5 flagged SUSPECT');
ok(suspectFound.outlierRule === 'MODIFIED_Z_MAD', 'SUSPECT rule = MAD');
ok(suspectFound.rawDuration === 30.5, 'raw data preserved');

// تحلیل
const an1 = DB.getActivityAnalysis(act1.id);
ok(an1.elements.length === 3, 'analysis: 3 elements');
const e2 = an1.elements.find(e => e.name === 'بستن چهار پیچ');
const expectedVals = [12.1, 11.8, 12.3, 12.0, 30.5, 12.2, 11.9, 12.4, 12.5, 12.3, 12.4, 12.3];
close(e2.ot, expectedVals.reduce((s, v) => s + v, 0) / 12, 'OT weighted (incl. suspect)');
ok(e2.counts.suspect === 1, 'counts.suspect = 1');
const e1 = an1.elements.find(e => e.name === 'برداشتن قطعه از گراناق');
close(e1.rating.totalFactor, 1.09, 'demo e1 R = 1.09');
const e1vals = [8.2, 8.4, 8.1, 8.3, 8.2, 8.4, 8.1, 8.3, 8.5, 8.4, 8.4, 8.5];
const e1ot = e1vals.reduce((s, v) => s + v, 0) / 12;
close(e1.ot, e1ot, 'e1 OT');
close(e1.nt, F.round12(e1ot * 1.09), 'e1 NT = OT x 1.09');
close(an1.allowances.totalA, 0.08, 'totalA = 8%');
close(e1.st, F.round12(e1.nt * 1.08), 'e1 ST m1');
ok(an1.activityTotal.status === 'OK', 'act1 sequential -> OK');
ok(an1.activityTotal.st !== null, 'act1 total ST computed');

// هم‌پوشانی
const an2 = DB.getActivityAnalysis(act2.id);
ok(an2.activityTotal.status === 'NEEDS_AGGREGATION_RULE', 'overlap activity -> NEEDS_AGGREGATION_RULE');
const s3 = DB.listSessions(act2.id)[0];
const sheet3 = DB.getSheet(s3.id);
ok(sheet3.cycles.every(c => c.elapsed !== null), 'overlap cycles have elapsed');
close(sheet3.cycles[0].elapsed, 12, 'elapsed cycle1 = 12 (per-cycle range)');
const an3 = DB.getActivityAnalysis(act3.id);
ok(an3.activityTotal.status === 'OK', 'act3 OK');

// Snapshot
const latest0 = DB.getLatestCalculation(projectId);
ok(latest0.run === null && latest0.needsRecalc === true, 'no run yet -> needsRecalc');
const run = DB.runProjectCalculation(projectId);
ok(run.status === 'DONE' && run.result.activities.length === 3, 'calc run created');
const latest1 = DB.getLatestCalculation(projectId);
ok(latest1.run.status === 'DONE' && latest1.needsRecalc === false, 'latest DONE');
DB.updateElement(an1.elements[0].id, { elementType: 'WAITING' });
const latest2 = DB.getLatestCalculation(projectId);
ok(latest2.run.status === 'STALE' && latest2.needsRecalc === true, 'elementType change -> STALE');
ok(latest2.run.result !== null, 'STALE snapshot preserved');
DB.runProjectCalculation(projectId);
DB.updateElement(an1.elements[1].id, { name: 'بستن چهار پیچ (ویرایش نام)' });
const latestName = DB.getLatestCalculation(projectId);
ok(latestName.run.status === 'DONE', 'name change -> NOT stale (web parity)');

// نمودار
const opc = DB.getChart(projectId, 'OPC');
ok(opc.nodes.length === 3, 'OPC 3 nodes');
ok(opc.nodes.every(n => n.positionY >= 48), 'auto layout applied');
ok(opc.edges.filter(e => e.isChain).length === 2, 'chain edges = 2');
const fpc = DB.getChart(projectId, 'FPC');
ok(fpc.nodes.length === 3, 'FPC 3 nodes');
DB.saveChartLayout(projectId, 'OPC', { [opc.nodes[0].id]: { x: 500, y: 300 } });
const opc2 = DB.getChart(projectId, 'OPC');
const moved = opc2.nodes.find(n => n.id === opc.nodes[0].id);
ok(moved.positionX === 500 && moved.positionY === 300, 'manual layout persisted');
const manual = DB.createManualNode(projectId, 'OPC', { nodeType: 'INSPECTION', label: 'کنترل کیفیت میانی' });
const opc3 = DB.getChart(projectId, 'OPC');
ok(opc3.nodes.length === 4 && opc3.counts.manual === 1, 'manual node created');

// داشبورد + مراحل
const dash = DB.getProjectDashboard(projectId);
ok(dash.cards.length === 4, 'dashboard 4 cards');
ok(dash.operators.length === 2, 'dashboard 2 operators');
const stg = DB.computeStageSummary(projectId);
ok(stg.stages.info.status === 'DONE', 'stage info DONE');
ok(stg.progress > 0.5, 'progress > 50%');

// بکاپ + بسته
const rec = await DB.createBackup('MANUAL');
ok(DB.listBackups().length >= 1, 'backup created');
const content = JSON.parse(DB.backupFileContent(rec.id));
ok(content.format === 'timing-offline-backup', 'backup file format');
const pkg = await DB.exportProjectPackage(projectId);
ok(pkg.manifest.format === 'timing-project-package', 'package manifest');
ok(pkg.data.workElement.length === 5, 'package 5 elements');
await DB.validateProjectPackage(pkg);
const before = DB.getState().projects.length;
const imp = DB.importProjectPackage(JSON.parse(JSON.stringify(pkg)));
ok(DB.getState().projects.length === before + 1, 'import creates new project');
ok(imp.name.includes('(ورودی)'), 'import name suffixed');

// حذف ایزوله + نشانگر
DB.deleteProject(projectId);
ok(!DB.getProject(projectId), 'project deleted');
await DB.restoreBackup(rec.id);
ok(!DB.getProject(projectId), 'deletion marker prevents restore');
ok(!DB.getProject(imp.projectId), 'restore replaces whole DB (web parity)');
ok(DB.getState().projects.length === 0, 'after restore: empty');

// خروج/بازگشت
const p2 = DB.seedDemo();
const acts2 = DB.sortActivities(DB.sortStations(p2.id)[0].id);
const snap2 = DB.listSessions(acts2[0].id).find(s => s.timingMethod === 'SNAPBACK');
const sheet2 = DB.getSheet(snap2.id);
let suspect2 = null;
sheet2.cycles.forEach(c => c.observations.forEach(o => { if (o.validityStatus === 'SUSPECT') suspect2 = o; }));
DB.setObservationValidity(suspect2.id, 'EXCLUDE', 'اختلال نوار نقاله');
const sheet2b = DB.getSheet(snap2.id);
let excluded = null;
sheet2b.cycles.forEach(c => c.observations.forEach(o => { if (o.id === suspect2.id) excluded = o; }));
ok(excluded.validityStatus === 'EXCLUDED' && excluded.rawDuration === 30.5, 'excluded keeps raw 30.5');
const an1b = DB.getActivityAnalysis(acts2[0].id);
const e2b = an1b.elements.find(e => e.name === 'بستن چهار پیچ');
const valsNo30 = [12.1, 11.8, 12.3, 12.0, 12.2, 11.9, 12.4, 12.5, 12.3, 12.4, 12.3];
close(e2b.ot, valsNo30.reduce((s, v) => s + v, 0) / 11, 'OT excludes EXCLUDED value');
DB.setObservationValidity(suspect2.id, 'RESTORE');
const sheet2c = DB.getSheet(snap2.id);
let restored = null;
sheet2c.cycles.forEach(c => c.observations.forEach(o => { if (o.id === suspect2.id) restored = o; }));
ok(restored.validityStatus === 'SUSPECT', 'restore -> re-flagged SUSPECT');

// ═══ ۴) رگرسیون cascade ═══
const pR = DB.seedDemo();
const stR = DB.sortStations(pR.id);
const actR = DB.sortActivities(stR[0].id)[0];
const elR = DB.sortElements(actR.id)[0];
DB.deleteElement(elR.id);
ok(DB.getState().workElements.every(e => e.id !== elR.id), 'deleteElement removes root');
const actR2 = DB.sortActivities(stR[0].id).find(a => a.name === 'پرس اتوماتیک روتور');
DB.deleteActivity(actR2.id);
ok(DB.getState().activities.every(a => a.id !== actR2.id), 'deleteActivity removes root');
const tblR = DB.listRatingTables(pR.id);
ok(tblR.length >= 1 && tblR[0].table.isDefault === true, 'seed table + default');

// حذف ایزوله پروژه
const pA = DB.seedDemo();
const pB = DB.seedDemo();
const bStations = DB.sortStations(pB.id).length;
const bEls = DB.sortActivities(DB.sortStations(pB.id)[0].id).flatMap(a => DB.sortElements(a.id)).length;
const bSess = DB.listSessions(DB.sortActivities(DB.sortStations(pB.id)[0].id)[0].id).length;
DB.deleteProject(pA.id);
ok(DB.sortStations(pB.id).length === bStations, 'delete isolation: stations');
ok(DB.sortActivities(DB.sortStations(pB.id)[0].id).flatMap(a => DB.sortElements(a.id)).length === bEls, 'delete isolation: elements');
ok(DB.listSessions(DB.sortActivities(DB.sortStations(pB.id)[0].id)[0].id).length === bSess, 'delete isolation: sessions');

// ═══ ۵) رگرسیون deleteCycle/deleteSession ═══
const pS = DB.seedDemo();
const actS = DB.sortActivities(DB.sortStations(pS.id)[0].id)[0];
const sesS = DB.listSessions(actS.id)[0];
const beforeCycles = DB.getSheet(sesS.id).cycles.length;
DB.deleteCycle(DB.getSheet(sesS.id).cycles[0].id);
ok(DB.getSheet(sesS.id).cycles.length === beforeCycles - 1, 'deleteCycle removes row');
DB.deleteSession(sesS.id);
ok(DB.getState().studySessions.every(s => s.id !== sesS.id), 'deleteSession removes row');
ok(DB.listSessions(actS.id).length === 1, 'other session intact');

console.log(`\n========== RESULT: ${pass} passed / ${fail} failed ==========`);
if (fail > 0) process.exit(1);
