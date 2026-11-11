/* تست اصلاحات بازبینی جلسه ۱ — نسخه آفلاین (الزامات ۲/۳/۴ + هم‌ارزی)
   اجرا:  bun scripts/test-offline-fixes.js
   ── آینه scripts/verify-session1-fixes.ts (بخش‌های B/C/migration/parity) ── */
globalThis.localStorage = undefined;
await import(new URL('../offline/js/utils.js', import.meta.url).href);
await import(new URL('../offline/js/formulas.js', import.meta.url).href);
await import(new URL('../offline/js/db.js', import.meta.url).href);
// موتور آنلاین برای هم‌ارزی عددی — همان ورودی‌ها، همان خروجی‌ها
const TSENGINE = await import('../src/calculation/effective-allowances.ts');

const U = globalThis.T2U, F = globalThis.T2F, DB = globalThis.T2DB;
let pass = 0, fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
  else { fail++; console.error('  ❌ ' + name + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
}
function close(a, b, name, tol = 1e-9) { ok(Math.abs(a - b) <= tol, name, { got: a, want: b }); }
const rowOf = (data, defId) => (data.resolved.rows || []).find((r) => r.definitionId === defId) || null;

console.log('════════════════════════════════════════════════');
console.log('  اصلاحات بازبینی جلسه ۱ — نسخه آفلاین');
console.log('════════════════════════════════════════════════');

// ── fixture ──
const p = DB.createProject({ name: 'تست اصلاحات آفلاین', lineName: 'خط تست', productName: 'محصول تست' });
const projectId = p.id ?? p.project?.id ?? p.projectId;
const st = DB.createStation(projectId, { name: 'ایستگاه' });
const stationId = st.id ?? st.station?.id;
const ac = DB.createActivity(stationId, { name: 'فعالیت' });
const activityId = ac.id ?? ac.activity?.id;
const el = DB.createElement(activityId, { name: 'عنصر' });
const elementId = el.id ?? el.element?.id;
ok(Boolean(projectId && stationId && activityId && elementId), 'fixture: پروژه/ایستگاه/فعالیت/عنصر ساخته شد');

const defP = DB.createAllowanceDefinition(projectId, { title: 'درصدی الف', defaultValueType: 'PERCENT', defaultValuePercent: 0.05, isActive: true, sortOrder: 0 });
const defPId = defP.id ?? defP.definition?.id;
const defT = DB.createAllowanceDefinition(projectId, { title: 'زمانی ب', defaultValueType: 'FIXED_TIME', defaultTimeSeconds: 45, isActive: true, sortOrder: 1 });
const defTId = defT.id ?? defT.definition?.id;
ok(Boolean(defPId && defTId), 'fixture: دو تعریف مرکزی');

const put = (scope, id, ops) => DB.putScopeAllowanceOps(scope, id, ops);
const get = (scope, id) => DB.getScopeAllowances(scope, id);

// ═══ §B — نوع/مبنای والد (الزام ۳) ═══
console.log('\n── §B نوع/مبنای والد — ۵ سناریوی سند ──');

// سناریو ۱: والد درصدی، فرزند درصدی
put('PROJECT', projectId, [{ definitionId: defPId, action: 'SET', valueType: 'PERCENT', percentValue: 0.05 }]);
put('WORK_ELEMENT', elementId, [{ definitionId: defPId, action: 'SET', valueType: 'PERCENT', percentValue: 0.06 }]);
{
  const row = rowOf(get('WORK_ELEMENT', elementId), defPId);
  ok(row.status === 'OVERRIDDEN' && Math.abs(row.parentValue - 0.05) < 1e-9 && row.parentValueType === 'PERCENT' && row.parentMode === 'ACTIVE' && row.parentDecisionExists === true && row.parentScopeType === 'PROJECT', 'B1. والد درصدی/فرزند درصدی: فیلدهای والد کامل و درست', { pv: row.parentValue, pvt: row.parentValueType });
  ok(Math.abs(row.percentValue - 0.06) < 1e-9, 'B1b. مقدار جاری فرزند 0.06 (با والد اشتباه نمی‌شود)');
}
put('WORK_ELEMENT', elementId, [{ definitionId: defPId, action: 'RESTORE' }]);

// سناریو ۲: والد درصدی، فرزند زمان ثابت
put('WORK_ELEMENT', elementId, [{ definitionId: defPId, action: 'SET', valueType: 'FIXED_TIME', timeValueSeconds: 3, applicationBasis: 'PER_ELEMENT_EXECUTION' }]);
{
  const row = rowOf(get('WORK_ELEMENT', elementId), defPId);
  ok(row.valueType === 'FIXED_TIME' && row.parentValueType === 'PERCENT' && Math.abs(row.parentValue - 0.05) < 1e-9, 'B2. والد درصدی/فرزند ثابت: والد همچنان ۵٪ (نه ۵ ثانیه)', { vt: row.valueType, pvt: row.parentValueType, pv: row.parentValue });
  ok(row.parentApplicationBasis === null, 'B2b. مبنای والد درصدی null');
}
put('WORK_ELEMENT', elementId, [{ definitionId: defPId, action: 'RESTORE' }]);

// سناریو ۳: والد زمان ثابت، فرزند درصدی
put('PROJECT', projectId, [{ definitionId: defTId, action: 'SET', valueType: 'FIXED_TIME', timeValueSeconds: 60, applicationBasis: 'PER_CYCLE' }]);
put('WORK_ELEMENT', elementId, [{ definitionId: defTId, action: 'SET', valueType: 'PERCENT', percentValue: 0.04 }]);
{
  const row = rowOf(get('WORK_ELEMENT', elementId), defTId);
  ok(row.valueType === 'PERCENT' && row.parentValueType === 'FIXED_TIME' && Math.abs(row.parentValue - 60) < 1e-9, 'B3. والد ثابت/فرزند درصدی: parentValueType=FIXED_TIME و parentValue=60', { vt: row.valueType, pvt: row.parentValueType, pv: row.parentValue });
  ok(row.parentApplicationBasis === 'PER_CYCLE', 'B3b. مبنای والد (PER_CYCLE) منتقل شد');
}
put('WORK_ELEMENT', elementId, [{ definitionId: defTId, action: 'RESTORE' }]);

// سناریو ۴: والد PER_ELEMENT_EXECUTION، فرزند PER_CYCLE
put('PROJECT', projectId, [{ definitionId: defTId, action: 'SET', valueType: 'FIXED_TIME', timeValueSeconds: 90, applicationBasis: 'PER_ELEMENT_EXECUTION' }]);
put('WORK_ELEMENT', elementId, [{ definitionId: defTId, action: 'SET', valueType: 'FIXED_TIME', timeValueSeconds: 25, applicationBasis: 'PER_CYCLE' }]);
{
  const row = rowOf(get('WORK_ELEMENT', elementId), defTId);
  ok(row.parentApplicationBasis === 'PER_ELEMENT_EXECUTION' && row.applicationBasis === 'PER_CYCLE' && Math.abs(row.parentValue - 90) < 1e-9 && Math.abs(row.timeValueSeconds - 25) < 1e-9, 'B4. والد PER_ELEMENT/فرزند PER_CYCLE: مبناها مستقل', { pb: row.parentApplicationBasis, b: row.applicationBasis });
}
put('WORK_ELEMENT', elementId, [{ definitionId: defTId, action: 'RESTORE' }]);

// سناریو ۵: والد PER_CYCLE، فرزند PER_ELEMENT_EXECUTION
put('PROJECT', projectId, [{ definitionId: defTId, action: 'SET', valueType: 'FIXED_TIME', timeValueSeconds: 90, applicationBasis: 'PER_CYCLE' }]);
put('WORK_ELEMENT', elementId, [{ definitionId: defTId, action: 'SET', valueType: 'FIXED_TIME', timeValueSeconds: 12, applicationBasis: 'PER_ELEMENT_EXECUTION' }]);
{
  const row = rowOf(get('WORK_ELEMENT', elementId), defTId);
  ok(row.parentApplicationBasis === 'PER_CYCLE' && row.applicationBasis === 'PER_ELEMENT_EXECUTION' && Math.abs(row.parentValue - 90) < 1e-9, 'B5. والد PER_CYCLE/فرزند PER_ELEMENT', { pb: row.parentApplicationBasis });
}
put('WORK_ELEMENT', elementId, [{ definitionId: defTId, action: 'RESTORE' }]);

// ردیف ارثی
{
  const row = rowOf(get('WORK_ELEMENT', elementId), defPId);
  ok(row.status === 'INHERITED' && Math.abs(row.parentValue - 0.05) < 1e-9 && row.parentValueType === 'PERCENT', 'B6. ردیف ارثی: والد مستقیم = منبع مقدار مؤثر', { s: row.status, pv: row.parentValue });
}

// ═══ §C — رفتار EXCLUDED (الزام ۴) ═══
console.log('\n── §C رفتار EXCLUDED — ۷ سناریوی سند ──');

const defQ = DB.createAllowanceDefinition(projectId, { title: 'مستقل ق', defaultValueType: 'PERCENT', defaultValuePercent: 0.02, isActive: true, sortOrder: 2 });
const defQId = defQ.id ?? defQ.definition?.id;
put('PROJECT', projectId, [{ definitionId: defQId, action: 'SET', valueType: 'PERCENT', percentValue: 0.02 }]);

// C1+C3: حذف درصدی با والد فعال
put('STATION', stationId, [{ definitionId: defPId, action: 'EXCLUDE' }]);
{
  const row = rowOf(get('ACTIVITY', activityId), defPId);
  ok(row.status === 'EXCLUDED', 'C1. حذف الونس درصدی از ارث‌بری: EXCLUDED');
  ok(row.valueType === 'PERCENT', 'C1b. نوع نمایشی همچنان درصدی', row.valueType);
  const stRow = rowOf(get('STATION', stationId), defPId);
  ok(stRow.status === 'EXCLUDED' && stRow.hasLocalDecision === true && stRow.parentMode === 'ACTIVE' && Math.abs(stRow.parentValue - 0.05) < 1e-9, 'C3. حذف با والد فعال (از دید scope تصمیم‌گیر)', { pm: stRow.parentMode, pv: stRow.parentValue });
  const raw = DB.getState().allowanceAssignments.find((a) => a.definitionId === defPId && a.scopeType === 'STATION' && a.scopeId === stationId);
  ok(raw && raw.valueType === 'PERCENT' && raw.mode === 'EXCLUDE', 'C1c. ذخیره پایدار EXCLUDE درصدی: valueType=PERCENT', raw && raw.valueType);
}

// C2: حذف زمان ثابت — باگ اصلی
put('STATION', stationId, [{ definitionId: defTId, action: 'EXCLUDE' }]);
{
  const row = rowOf(get('ACTIVITY', activityId), defTId);
  ok(row.status === 'EXCLUDED' && row.valueType === 'FIXED_TIME', 'C2. حذف الونس «زمان ثابت»: نوع نمایشی زمان ثابت ماند (نه درصدی)', { s: row.status, vt: row.valueType });
  ok(row.timeValueSeconds === null && row.percentValue === null, 'C2b. مقدار مؤثر حذف‌شده null');
  const raw = DB.getState().allowanceAssignments.find((a) => a.definitionId === defTId && a.scopeType === 'STATION' && a.scopeId === stationId);
  ok(raw && raw.valueType === 'FIXED_TIME', 'C2c. ذخیره پایدار EXCLUDE زمانی: valueType=FIXED_TIME (نه PERCENT ساختگی)', raw && raw.valueType);
  const scope = get('ACTIVITY', activityId);
  close(scope.resolved.summary.totalPercent, 0.02, 'C2d. الونس حذف‌شده در جمع درصدها نیست (0.02)');
}

// C4: حذف بدون والد فعال
const defN = DB.createAllowanceDefinition(projectId, { title: 'بدون پیش‌فرض و بدون والد', isActive: true, sortOrder: 3 });
const defNId = defN.id ?? defN.definition?.id;
{
  put('PROJECT', projectId, [{ definitionId: defNId, action: 'EXCLUDE' }]);
  const projRow = rowOf(get('PROJECT', projectId), defNId);
  ok(projRow.status === 'EXCLUDED' && projRow.parentDecisionExists === false && projRow.parentMode === null, 'C4. حذف بدون والد (از دید scope تصمیم‌گیر)', { pe: projRow.parentDecisionExists, pm: projRow.parentMode });
  ok(projRow.valueType === null, 'C4b. بدون منبع نوع → نمایش خنثی (null)', projRow.valueType);
  put('PROJECT', projectId, [{ definitionId: defNId, action: 'RESTORE' }]);

  put('PROJECT', projectId, [{ definitionId: defNId, action: 'EXCLUDE' }]);
  put('STATION', stationId, [{ definitionId: defNId, action: 'SET', valueType: 'PERCENT', percentValue: 0.01 }]);
  put('STATION', stationId, [{ definitionId: defNId, action: 'EXCLUDE' }]);
  const row2 = rowOf(get('ACTIVITY', activityId), defNId);
  ok(row2.status === 'EXCLUDED' && row2.parentMode === 'EXCLUDE' && row2.parentDecisionExists === true, 'C4c. حذف با والدِ EXCLUDE', { pm: row2.parentMode });
  ok(row2.parentValue === null && row2.parentValueType === null, 'C4d. والد EXCLUDE → parentValue=null');
  put('STATION', stationId, [{ definitionId: defNId, action: 'RESTORE' }]);
  put('PROJECT', projectId, [{ definitionId: defNId, action: 'RESTORE' }]);
}

// C5: بازگردانی
{
  put('STATION', stationId, [{ definitionId: defPId, action: 'RESTORE' }]);
  const row = rowOf(get('ACTIVITY', activityId), defPId);
  ok(row.status === 'INHERITED' && Math.abs(row.percentValue - 0.05) < 1e-9, 'C5. بازگردانی حذف‌شده با والد فعال → ارث 0.05', { s: row.status, v: row.percentValue });
  put('STATION', stationId, [{ definitionId: defTId, action: 'RESTORE' }]);
  const row2 = rowOf(get('ACTIVITY', activityId), defTId);
  ok(row2.status === 'INHERITED' && Math.abs(row2.timeValueSeconds - 90) < 1e-9 && row2.applicationBasis === 'PER_CYCLE', 'C5b. بازگردانی حذف‌شده زمانی → ارث 90s PER_CYCLE', { s: row2.status, t: row2.timeValueSeconds });
}

// C6: بازگردانی پس از تغییر والد
{
  put('STATION', stationId, [{ definitionId: defPId, action: 'EXCLUDE' }]);
  put('PROJECT', projectId, [{ definitionId: defPId, action: 'SET', valueType: 'PERCENT', percentValue: 0.08 }]);
  const mid = rowOf(get('ACTIVITY', activityId), defPId);
  ok(mid.status === 'EXCLUDED', 'C6. تغییر والد در حین حذف: همچنان EXCLUDED');
  put('STATION', stationId, [{ definitionId: defPId, action: 'RESTORE' }]);
  const row = rowOf(get('ACTIVITY', activityId), defPId);
  ok(row.status === 'INHERITED' && Math.abs(row.percentValue - 0.08) < 1e-9, 'C6b. بازگردانی پس از تغییر والد → 0.08', { s: row.status, v: row.percentValue });
}

// C7: حفظ مستقل‌ها
{
  const q = rowOf(get('ACTIVITY', activityId), defQId);
  ok(q && Math.abs(q.percentValue - 0.02) < 1e-9 && q.status === 'INHERITED', 'C7. الونس مستقل حفظ شد', { s: q && q.status, v: q && q.percentValue });
  ok(DB.listAllowanceDefinitions(projectId).length === 4, 'C7b. تعریف مرکزی هیچ‌کدام حذف نشد');
  const pa = DB.getState().allowanceAssignments.find((a) => a.definitionId === defPId && a.scopeType === 'PROJECT' && a.scopeId === projectId);
  ok(pa && Math.abs(pa.percentValue - 0.08) < 1e-9, 'C7c. تخصیص سطح خط دست‌نخورده');
}

// C8: داده قدیمی PERCENT ساختگی
{
  const raw = DB.getState().allowanceAssignments.find((a) => a.definitionId === defTId && a.scopeType === 'STATION' && a.scopeId === stationId);
  if (raw) { raw.valueType = 'PERCENT'; } // state درون‌حافظه‌ای — بدون نیاز به commit
  else DB.getState().allowanceAssignments.push({ id: U.uid(), definitionId: defTId, scopeType: 'STATION', scopeId: stationId, mode: 'EXCLUDE', valueType: 'PERCENT', percentValue: null, timeValueSeconds: null, applicationBasis: null, createdAt: U.nowISO(), updatedAt: U.nowISO() });
  const row = rowOf(get('ACTIVITY', activityId), defTId);
  ok(row.status === 'EXCLUDED' && row.valueType === 'FIXED_TIME', 'C8. داده قدیمی (PERCENT ساختگی): Resolver نوع واقعی (FIXED_TIME) را بازتولید می‌کند', row.valueType);
  put('STATION', stationId, [{ definitionId: defTId, action: 'RESTORE' }]);
}

// ═══ §M — مهاجرت در اولین درخواست (الزام ۲ — آفلاین synchronous) ═══
console.log('\n── §M مهاجرت پروژه قدیمی در اولین درخواست ──');
{
  const p2 = DB.createProject({ name: 'قدیمی آفلاین', lineName: 'خط قدیم', productName: 'محصول قدیم' });
  const p2Id = p2.id ?? p2.project?.id;
  const s2 = DB.createStation(p2Id, { name: 'ایستگاه قدیم' });
  const s2Id = s2.id ?? s2.station?.id;
  const a2 = DB.createActivity(s2Id, { name: 'فعالیت قدیمی' });
  const a2Id = a2.id ?? a2.activity?.id;

  const state = DB.getState();
  const cat1 = { id: U.uid(), projectId: p2Id, name: 'نیازهای شخصی (قدیم)', code: null, isActive: true, sortOrder: 0, createdAt: U.nowISO(), updatedAt: U.nowISO() };
  const cat2 = { id: U.uid(), projectId: p2Id, name: 'خستگی (قدیم)', code: null, isActive: true, sortOrder: 1, createdAt: U.nowISO(), updatedAt: U.nowISO() };
  const catOff = { id: U.uid(), projectId: p2Id, name: 'دسته خاموش (قدیم)', code: null, isActive: false, sortOrder: 2, createdAt: U.nowISO(), updatedAt: U.nowISO() };
  state.allowanceCategories.push(cat1, cat2, catOff);
  DB.createGroup(p2Id, { name: 'گروه قدیم', description: null });
  const grp = state.activityGroups.find((g) => g.projectId === p2Id);
  state.groupAllowances.push(
    { id: U.uid(), groupId: grp.id, categoryId: cat1.id, percentValue: 0.12, createdAt: U.nowISO(), updatedAt: U.nowISO() },
    { id: U.uid(), groupId: grp.id, categoryId: cat2.id, percentValue: 0.07, createdAt: U.nowISO(), updatedAt: U.nowISO() },
    { id: U.uid(), groupId: grp.id, categoryId: catOff.id, percentValue: 0.2, createdAt: U.nowISO(), updatedAt: U.nowISO() },
  );
  state.activityAllowanceOverrides.push({ id: U.uid(), activityId: a2Id, categoryId: cat1.id, percentValue: 0.15, createdAt: U.nowISO(), updatedAt: U.nowISO() });
  const actRow = state.activities.find((a) => a.id === a2Id);
  actRow.groupId = grp.id;
  // state درون‌حافظه‌ای — بدون نیاز به commit

  // اولین درخواست — مهاجرت باید کامل شده باشد
  const scope = get('ACTIVITY', a2Id);
  const r1 = rowOf(scope, cat1.id);
  ok(Boolean(r1) && r1.definitionId === cat1.id, 'M1. اولین GET: تعریف مهاجرت‌شده موجود');
  ok(r1.status === 'CUSTOM' && Math.abs(r1.percentValue - 0.15) < 1e-9, 'M2. Override بر گروه اولویت داشت (0.15)', { s: r1.status, v: r1.percentValue });
  const r2 = rowOf(scope, cat2.id);
  ok(r2 && Math.abs(r2.percentValue - 0.07) < 1e-9, 'M3. مقدار گروه cat2 = 0.07');
  const offRow = rowOf(scope, catOff.id);
  ok(!offRow || offRow.percentValue === null, 'M4. دسته غیرفعال مؤثر نیست');
  close(scope.resolved.summary.totalPercent, 0.22, 'M5. محاسبه قبل/بعد مهاجرت یکسان (0.22)');

  // اجرای مجدد — بدون تکرار
  const before = state.allowanceAssignments.filter((a) => a.definitionId === cat1.id || a.definitionId === cat2.id).length;
  get('ACTIVITY', a2Id);
  get('ACTIVITY', a2Id);
  const after = state.allowanceAssignments.filter((a) => a.definitionId === cat1.id || a.definitionId === cat2.id).length;
  ok(before === 2 && after === 2, 'M6. مهاجرت مکرر داده تکراری نمی‌سازد', { before, after });
}

// ═══ §P — هم‌ارزی عددی با موتور آنلاین (الزام ۶) ═══
console.log('\n── §P هم‌ارزی عددی resolver آفلاین ↔ آنلاین (TS) ──');
{
  const definitions = [
    { id: 'd1', title: 'درصدی', isActive: true, sortOrder: 0, defaultValueType: 'PERCENT', defaultValuePercent: 0.05, defaultTimeSeconds: null, code: null, description: null },
    { id: 'd2', title: 'زمانی', isActive: true, sortOrder: 1, defaultValueType: 'FIXED_TIME', defaultValuePercent: null, defaultTimeSeconds: 45, code: null, description: null },
    { id: 'd3', title: 'بدون پیش‌فرض', isActive: true, sortOrder: 2, defaultValueType: null, defaultValuePercent: null, defaultTimeSeconds: null, code: null, description: null },
    { id: 'd4', title: 'غیرفعال', isActive: false, sortOrder: 3, defaultValueType: 'PERCENT', defaultValuePercent: 0.5, defaultTimeSeconds: null, code: null, description: null },
  ];
  const assignments = [
    { definitionId: 'd1', scopeType: 'PROJECT', scopeId: 'p1', mode: 'ACTIVE', valueType: 'PERCENT', percentValue: 0.05, timeValueSeconds: null, applicationBasis: null },
    { definitionId: 'd2', scopeType: 'PROJECT', scopeId: 'p1', mode: 'ACTIVE', valueType: 'FIXED_TIME', percentValue: null, timeValueSeconds: 60, applicationBasis: 'PER_CYCLE' },
    { definitionId: 'd1', scopeType: 'STATION', scopeId: 's1', mode: 'EXCLUDE', valueType: 'PERCENT', percentValue: null, timeValueSeconds: null, applicationBasis: null },
    { definitionId: 'd2', scopeType: 'STATION', scopeId: 's1', mode: 'ACTIVE', valueType: 'FIXED_TIME', percentValue: null, timeValueSeconds: 30, applicationBasis: 'PER_ELEMENT_EXECUTION' },
    { definitionId: 'd1', scopeType: 'ACTIVITY', scopeId: 'a1', mode: 'ACTIVE', valueType: 'PERCENT', percentValue: 0.06, timeValueSeconds: null, applicationBasis: null },
    { definitionId: 'd3', scopeType: 'ACTIVITY', scopeId: 'a1', mode: 'EXCLUDE', valueType: 'PERCENT', percentValue: null, timeValueSeconds: null, applicationBasis: null },
    { definitionId: 'd3', scopeType: 'WORK_ELEMENT', scopeId: 'e1', mode: 'ACTIVE', valueType: 'PERCENT', percentValue: 0.01, timeValueSeconds: null, applicationBasis: null },
    { definitionId: 'd1', scopeType: 'WORK_ELEMENT', scopeId: 'e2', mode: 'ACTIVE', valueType: 'FIXED_TIME', percentValue: null, timeValueSeconds: 2.5, applicationBasis: 'PER_ELEMENT_EXECUTION' },
  ];
  const chains = [
    [{ type: 'PROJECT', id: 'p1', label: 'خط' }],
    [{ type: 'PROJECT', id: 'p1', label: 'خط' }, { type: 'STATION', id: 's1', label: 'ایستگاه' }],
    [{ type: 'PROJECT', id: 'p1', label: 'خط' }, { type: 'STATION', id: 's1', label: 'ایستگاه' }, { type: 'ACTIVITY', id: 'a1', label: 'فعالیت' }],
    [{ type: 'PROJECT', id: 'p1', label: 'خط' }, { type: 'STATION', id: 's1', label: 'ایستگاه' }, { type: 'ACTIVITY', id: 'a1', label: 'فعالیت' }, { type: 'WORK_ELEMENT', id: 'e1', label: 'عنصر۱' }],
    [{ type: 'PROJECT', id: 'p1', label: 'خط' }, { type: 'STATION', id: 's1', label: 'ایستگاه' }, { type: 'ACTIVITY', id: 'a1', label: 'فعالیت' }, { type: 'WORK_ELEMENT', id: 'e2', label: 'عنصر۲' }],
  ];
  let rowsEqual = true, sumEqual = true;
  for (const chain of chains) {
    const a = TSENGINE.resolveEffectiveAllowances({ definitions, assignments, chain });
    const b = F.resolveEffectiveAllowances({ definitions, assignments, chain });
    if (JSON.stringify(a.rows) !== JSON.stringify(b.rows)) { rowsEqual = false; console.error('     تفاوت ردیف:', JSON.stringify(a.rows), '↔', JSON.stringify(b.rows)); }
    if (JSON.stringify(a.summary) !== JSON.stringify(b.summary)) sumEqual = false;
  }
  ok(rowsEqual, 'P1. ردیف‌های resolve دو موتور در ۵ زنجیره یکسان (شامل فیلدهای جدید والد)');
  ok(sumEqual, 'P2. خلاصه‌های عددی یکسان');

  const stCases = [
    [100, { totalPercent: 0.08, perExecutionSeconds: 2.5, perCycleSeconds: 30 }, 'PERCENT_OF_NT', 110.5],
    [100, { totalPercent: 0.08, perExecutionSeconds: 0, perCycleSeconds: 0 }, 'SHARE_OF_ST', 100 / 0.92],
    [9.047, { totalPercent: 0.15, perExecutionSeconds: 0, perCycleSeconds: 0 }, 'PERCENT_OF_NT', 10.40405],
  ];
  let stEqual = true;
  for (const [nt, f, m, want] of stCases) {
    const a = TSENGINE.computeElementStandardTime(nt, f, m);
    const b = F.computeElementStandardTime(nt, f, m);
    if (Math.abs(a.st - b.st) > 1e-9 || Math.abs(a.st - want) > 1e-6) stEqual = false;
  }
  ok(stEqual, 'P3. computeElementStandardTime دو موتور + مقادیر مرجع یکسان');
}

// ═══ §DnD — سلامت کد Drag & Drop (آزمون رویدادی واقعی در مرورگر — گزارش جدا) ═══
console.log('\n── §DnD بررسی ایستایی کد درگ (مکمل آزمون مرورگر) ──');
{
  const fs = await import('node:fs');
  const code = fs.readFileSync(new URL('../offline/js/views-structure.js', import.meta.url), 'utf-8');
  ok(/^  var _drag = null;/m.test(code), 'DnD1. تعریف _drag مستقل است (نه کامنت)');
  ok(!/\/\/[^\n]*var _drag/.test(code), 'DnD2. var _drag دیگر داخل کامنت نیست (الگوی باگ اصلی)');
  ok(code.includes('data-sort-type') && code.includes('makeTouchSortable'), 'DnD3. زیرساخت درگ لمسی + data-attribute هدف موجود است');
  ok(code.includes("pointerdown") && code.includes('elementsFromPoint') && code.includes('t2-touch-ghost'), 'DnD4. Pointer Events + ghost + تشخیص هدف هنگام درگ لمسی موجود است');
}

console.log('\n════════════════════════════════════════════════');
console.log('  نتیجه: ' + pass + ' پاس / ' + fail + ' خطا');
console.log('════════════════════════════════════════════════');
if (fail > 0) process.exit(1);
