/* ═══════════════════════════════════════════════════════════
   لایه داده — نسخه آفلاین
   پورت وفادار از سرویس‌های نسخه وب + تمام اصلاحات باگ‌ها
   ذخیره‌سازی: localStorage (روی file:// پشتیبانی می‌شود)
   ⚠ هر تغییر در سرویس‌های وب باید همین‌جا هم اعمال شود.
   ═══════════════════════════════════════════════════════════ */
(function (g) {
  'use strict';

  var U = g.T2U, F = g.T2F;
  var STORAGE_KEY = 'timing2-offline-db-v1';
  var AUDIT_CAP = 300;

  // ═══════════ ثابت‌ها (از src/domain/types.ts) ═══════════
  var CONST = {
    PROCESS_TYPE_LABELS: { OPERATION: 'عملیات', INSPECTION: 'بازرسی', TRANSPORT: 'حمل‌ونقل', DELAY: 'تأخیر', STORAGE: 'انبارش' },
    PROCESS_TYPE_SYMBOLS: { OPERATION: '○', INSPECTION: '□', TRANSPORT: '⇨', DELAY: 'D', STORAGE: '▽' },
    PROCESS_TYPES: ['OPERATION', 'INSPECTION', 'TRANSPORT', 'DELAY', 'STORAGE'],
    ELEMENT_TYPE_LABELS: { MANUAL: 'دستی', MACHINE: 'خودکار ماشین', WAITING: 'انتظار', OVERLAP: 'هم‌زمان / دارای هم‌پوشانی' },
    ELEMENT_TYPES: ['MANUAL', 'MACHINE', 'WAITING', 'OVERLAP'],
    TIMING_METHOD_LABELS: { SNAPBACK: 'برگشت به صفر (Snapback)', CONTINUOUS: 'پیوسته (Continuous)' },
    SESSION_STATUS_LABELS: { OPEN: 'باز (قابل ثبت داده)', CLOSED: 'بسته (فقط‌خواندنی)' },
    VALIDITY_STATUS_LABELS: { VALID: 'معتبر برای محاسبات', SUSPECT: 'مشکوک و نیازمند بازبینی', EXCLUDED: 'خارج‌شده از محاسبات به انتخاب کاربر', INVALID: 'ناقص / نامعتبر' },
    ALLOWANCE_METHOD_LABELS: { PERCENT_OF_NT: 'مجاز به‌صورت درصدی از زمان نرمال', SHARE_OF_ST: 'مجاز به‌صورت سهمی از زمان استاندارد' },
    ALLOWANCE_METHOD_FORMULAS: { PERCENT_OF_NT: 'ST = NT × (1 + A)', SHARE_OF_ST: 'ST = NT / (1 − A)' },
    AGGREGATION_METHOD_LABELS: {
      WEIGHTED_BY_COUNT: 'میانگین وزنی بر اساس تعداد مشاهدات معتبر (پیش‌فرض)',
      EQUAL_OPERATOR_MEAN: 'میانگین اپراتورها با وزن برابر',
    },
    PROJECT_STATUS_LABELS: { DRAFT: 'پیش‌نویس', IN_PROGRESS: 'در حال انجام', FINALIZED: 'نهایی‌شده' },
    STAGE_STATUS_LABELS: { PENDING: 'انجام‌نشده', IN_PROGRESS: 'در حال انجام', DONE: 'تکمیل‌شده', NEEDS_REVIEW: 'نیازمند بررسی' },
    STUDY_STAGES: [
      { key: 'info', label: 'مشخصات پروژه', desc: 'نام، خط تولید، محصول و تنظیمات محاسبات' },
      { key: 'structure', label: 'ساختار تولید', desc: 'ایستگاه‌ها، فعالیت‌ها و عناصر کاری' },
      { key: 'operators', label: 'اپراتورها', desc: 'معرفی اپراتورهای شرکت‌کننده در مطالعه' },
      { key: 'allowances', label: 'مجازها و الونس‌ها', desc: 'تعریف مرکزی الونس، تخصیص سلسله‌مراتبی و گروه‌های فعالیت' },
      { key: 'westinghouse', label: 'ارزیابی وستینگهاوس', desc: 'جدول مرجع و ارزیابی عناصر کاری' },
      { key: 'timing', label: 'زمان‌سنجی', desc: 'جلسه، جدول چرخه‌محور، Paste از Excel' },
      { key: 'matrix', label: 'ماتریس هم‌پوشانی', desc: 'روابط موازی عناصر کاری و مقادیر هر چرخه' },
      { key: 'analysis', label: 'تحلیل نتایج', desc: 'آمار، داده غیرعادی و مقایسه اپراتورها' },
      { key: 'charts', label: 'نمودار فرایند', desc: 'OPC و FPC با گره‌های فعالیت' },
      { key: 'dashboard', label: 'داشبورد', desc: 'کارت‌های خلاصه و شاخص‌های تخصصی' },
      { key: 'reports', label: 'گزارش‌ها', desc: 'خروجی Excel و PDF رسمی' },
    ],
    RATING_FACTOR_LABELS: { SKILL: 'مهارت', EFFORT: 'تلاش', CONDITIONS: 'شرایط', CONSISTENCY: 'یکنواختی' },
    RATING_FACTORS: ['SKILL', 'EFFORT', 'CONDITIONS', 'CONSISTENCY'],
    FORMULA_VERSION: '1.0.0',
    FORMULAS: {
      ratingFactor: 'R = 1 + Skill + Effort + Conditions + Consistency',
      normalTime: 'NT = OT × R',
      standardTimeM1: 'ST = NT × (1 + A)',
      standardTimeM2: 'ST = NT / (1 − A)',
      continuousElement: 'زمان عنصر = قرائت تجمعی فعلی − قرائت تجمعی قبلی (در همان خط زمانی)',
      parallelDuration: 'مدت بازه = پایان − شروع',
      elapsedCycle: 'زمان سپری‌شده چرخه = دیرترین پایان − زودترین شروع',
    },
    EXCLUSION_REASONS: [
      'اپراتور کار را در میانهٔ چرخه متوقف کرد',
      'مداخلهٔ بیرونی در چرخه (سرپرست/مواد/قطعه)',
      'خطای ثبت یا خواندن زمان',
      'مواد یا قطعهٔ غیرمعیار',
      'چرخهٔ نمایندهٔ شرایط عادی نیست',
    ],
    APP_SETTING_DEFAULTS: {
      'ui.language': 'fa', 'ui.calendar': 'jalali', 'ui.digits': 'persian', 'ui.decimals': '2',
      'backup.autoEnabled': 'true', 'backup.intervalMinutes': '30', 'backup.retention': '10',
      'outlier.method': 'mad', 'outlier.threshold': '3.5',
    },
    SCHEMA_VERSION: 3,
    // ── جلسه اول: الونس‌های سلسله‌مراتبی ──
    ALLOWANCE_SCOPE_LABELS: { PROJECT: 'خط تولید', STATION: 'ایستگاه', ACTIVITY: 'فعالیت', WORK_ELEMENT: 'عنصر کاری' },
    ALLOWANCE_STATUS_LABELS: { INHERITED: 'ارث‌رسیده', OVERRIDDEN: 'جایگزین‌شده', CUSTOM: 'اختصاصی', EXCLUDED: 'حذف‌شده از ارث‌بری' },
    ALLOWANCE_VALUE_TYPE_LABELS: { PERCENT: 'درصدی', FIXED_TIME: 'زمان ثابت' },
    ALLOWANCE_BASIS_LABELS: { PER_ELEMENT_EXECUTION: 'به‌ازای هر اجرای عنصر', PER_CYCLE: 'یک‌بار در هر چرخه' },
    MAX_FIXED_TIME_SECONDS: 86400,
  };

  // ═══════════ وضعیت و ماندگاری ═══════════

  var TABLES = [
    'projects', 'projectSettings', 'stations', 'activities', 'workElements',
    'activityGroups', 'allowanceCategories', 'groupAllowances', 'activityAllowanceOverrides',
    'allowanceDefinitions', 'allowanceAssignments',
    'operators', 'studySessions', 'cycleObservations', 'timelineLanes', 'elementObservations',
    'ratingTables', 'ratingTableGrades', 'ratingAssessments',
    'calculationRuns', 'chartNodes', 'chartEdges', 'finalizationInfos',
    // ── جلسه دوم: روابط موازی و مقادیر هم‌پوشانی ──
    'overlapRelations', 'observationOverlaps',
    'auditEvents', 'deletionMarkers', 'appSettings', 'backups',
  ];

  function emptyState() {
    var s = { version: 1 };
    TABLES.forEach(function (t) { s[t] = []; });
    return s;
  }

  var state = null;
  var listeners = [];
  var storageOk = true;
  var dirtySinceBackup = false;

  function load() {
    try {
      var raw = g.localStorage ? g.localStorage.getItem(STORAGE_KEY) : null;
      if (raw) {
        var parsed = JSON.parse(raw);
        var s = emptyState();
        TABLES.forEach(function (t) { if (Array.isArray(parsed[t])) s[t] = parsed[t]; });
        // ارتقای schema درجا — v۱: مهاجرت الونس‌ها به مدل سلسله‌مراتبی (جلسه اول §۴)
        migrateAllowancesAll(s);
        // ارتقای v۳ — جلسه دوم: snapshot تشخیصی SUSPECT + anchorهای یال (پیش‌فرض تهی، بدون دادهٔ ساختگی)
        (s.elementObservations || []).forEach(function (o) { if (o.outlierSnapshot === undefined) o.outlierSnapshot = null; });
        (s.chartEdges || []).forEach(function (e) { if (e.sourceAnchor === undefined) e.sourceAnchor = null; if (e.targetAnchor === undefined) e.targetAnchor = null; });
        // ارتقای v1.5.0 — «نوع عنصر کاری» از UI حذف شد (§۳.۳):
        // backfill پیش‌فرض‌های فنی مستقل + آرشیو نرم روابط بین‌فعالیت (§۴.۳)
        migrateV150(s);
        return s;
      }
    } catch (e) { storageOk = false; }
    return emptyState();
  }

  /** مهاجرت الونس‌های همه پروژه‌ها — v۱ → v۲ (قابل تکرار با مارکر) */
  function migrateAllowancesAll(s) {
    (s.projects || []).forEach(function (p) { migrateProjectAllowancesIfNeeded(p.id, s); });
  }

  /** مهاجرت v1.5.0 — idempotent:
   *  ۱) elementType → defaultEntryMode / defaultLaneMode (MANUAL→SEQ/OPERATOR، MACHINE|OVERLAP→INT/MACHINE، WAITING→INT/OPERATOR)
   *  ۲) آرشیو نرم روابط فعال بین عناصر دو Activity با دلیل CROSS_ACTIVITY_NOT_SUPPORTED_BY_SESSION_SHEET —
   *     بدون حذف هیچ observationOverlap تاریخی */
  function migrateV150(s) {
    var CROSS = 'CROSS_ACTIVITY_NOT_SUPPORTED_BY_SESSION_SHEET';
    (s.workElements || []).forEach(function (e) {
      var entry = e.elementType === 'MANUAL' ? 'SEQ' : 'INT';
      var lane = (e.elementType === 'MACHINE' || e.elementType === 'OVERLAP') ? 'MACHINE' : 'OPERATOR';
      if (e.defaultEntryMode !== entry || e.defaultLaneType !== lane) {
        e.defaultEntryMode = entry;
        e.defaultLaneType = lane;
      }
    });
    var activityOf = {};
    (s.workElements || []).forEach(function (e) { activityOf[e.id] = e.activityId; });
    (s.overlapRelations || []).forEach(function (r) {
      if (!r.isActive) return;
      var a1 = activityOf[r.elementLowId];
      var a2 = activityOf[r.elementHighId];
      if (a1 && a2 && a1 !== a2) {
        r.isActive = false;
        r.archiveReason = CROSS;
        r.version = (r.version || 1) + 1;
      }
    });
  }

  function persist() {
    try {
      g.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      storageOk = true;
    } catch (e) {
      storageOk = false;
    }
  }

  function commit() {
    persist();
    dirtySinceBackup = true;
    listeners.slice().forEach(function (fn) { try { fn(); } catch (e) { console.error(e); } });
  }

  function subscribe(fn) {
    listeners.push(fn);
    return function () { listeners = listeners.filter(function (x) { return x !== fn; }); };
  }
  function getState() { return state; }

  function byId(table, id) {
    for (var i = 0; i < state[table].length; i++) if (state[table][i].id === id) return state[table][i];
    return null;
  }
  function filterBy(table, key, value) {
    return state[table].filter(function (r) { return r[key] === value; });
  }
  function nextSortOrder(table, key, value) {
    var rows = filterBy(table, key, value);
    return rows.length ? Math.max.apply(null, rows.map(function (r) { return r.sortOrder || 0; })) + 1 : 0;
  }
  function touch(row) { row.updatedAt = U.nowISO(); }
  function cmpStr(a, b) { return String(a).localeCompare(String(b), 'fa'); }
  function sortStations(projectId) {
    return filterBy('stations', 'projectId', projectId).sort(function (a, b) { return (a.sortOrder - b.sortOrder) || (a.createdAt < b.createdAt ? -1 : 1); });
  }
  function sortActivities(stationId) {
    return filterBy('activities', 'stationId', stationId).sort(function (a, b) { return (a.sortOrder - b.sortOrder) || (a.createdAt < b.createdAt ? -1 : 1); });
  }
  function sortElements(activityId) {
    return filterBy('workElements', 'activityId', activityId).sort(function (a, b) { return (a.sortOrder - b.sortOrder) || (a.createdAt < b.createdAt ? -1 : 1); });
  }
  function projectIdOfActivity(activityId) {
    var a = byId('activities', activityId);
    if (!a) return null;
    var st = byId('stations', a.stationId);
    return st ? st.projectId : null;
  }

  // ═══════════ Audit ═══════════
  function recordAudit(ev) {
    state.auditEvents.push({
      id: U.uid(),
      entityType: ev.entityType, entityId: ev.entityId, action: ev.action,
      entityName: ev.entityName || null,
      beforeJson: ev.before ? JSON.stringify(ev.before) : null,
      afterJson: ev.after ? JSON.stringify(ev.after) : null,
      projectId: ev.projectId || null,
      actor: 'کاربر محلی',
      occurredAt: U.nowISO(),
    });
    if (state.auditEvents.length > AUDIT_CAP) state.auditEvents = state.auditEvents.slice(-AUDIT_CAP);
  }
  function listAudit(limit, projectId) {
    var rows = state.auditEvents.slice().sort(function (a, b) { return a.occurredAt < b.occurredAt ? 1 : -1; });
    if (projectId) rows = rows.filter(function (r) { return r.projectId === projectId; });
    return rows.slice(0, limit || 100);
  }

  // ═══════════ نشانگر حذف دائمی ═══════════
  function markDeleted(entityType, ids) {
    ids.forEach(function (id) {
      var exists = state.deletionMarkers.some(function (m) { return m.entityType === entityType && m.entityId === id; });
      if (!exists) state.deletionMarkers.push({ id: U.uid(), entityType: entityType, entityId: id, deletedAt: U.nowISO() });
    });
  }
  function isDeleted(entityType, entityId) {
    return state.deletionMarkers.some(function (m) { return m.entityType === entityType && m.entityId === entityId; });
  }

  // ═══════════ Stale (FR-27) ═══════════
  function markProjectCalculationsStale(projectId) {
    if (!projectId) return;
    state.calculationRuns.forEach(function (r) {
      if (r.projectId === projectId && r.status === 'DONE') r.status = 'STALE';
    });
  }

  // ═══════════ تنظیمات ═══════════
  function getAppSettings() {
    var out = {};
    Object.keys(CONST.APP_SETTING_DEFAULTS).forEach(function (k) { out[k] = CONST.APP_SETTING_DEFAULTS[k]; });
    state.appSettings.forEach(function (s) { out[s.id] = s.value; });
    return out;
  }
  function setAppSettings(values) {
    Object.keys(values).forEach(function (k) {
      var existing = state.appSettings.find(function (s) { return s.id === k; });
      if (existing) existing.value = String(values[k]);
      else state.appSettings.push({ id: k, value: String(values[k]) });
    });
    commit();
  }
  function getDisplayPrefs() {
    var s = getAppSettings();
    return {
      calendar: s['ui.calendar'] === 'gregorian' ? 'gregorian' : 'jalali',
      digits: s['ui.digits'] === 'latin' ? 'latin' : 'persian',
      decimals: Math.max(1, Math.min(4, parseInt(s['ui.decimals'], 10) || 2)),
    };
  }
  function setDisplayPrefs(patch) {
    var values = {};
    if (patch.calendar) values['ui.calendar'] = patch.calendar;
    if (patch.digits) values['ui.digits'] = patch.digits;
    if (patch.decimals !== undefined) values['ui.decimals'] = String(patch.decimals);
    setAppSettings(values);
  }
  function getProjectSettings(projectId) {
    var out = { 'calc.allowanceMethod': 'PERCENT_OF_NT', 'calc.aggregationMethod': 'WEIGHTED_BY_COUNT' };
    filterBy('projectSettings', 'projectId', projectId).forEach(function (s) { out[s.key] = s.value; });
    return out;
  }
  function putProjectSettings(projectId, values) {
    Object.keys(values).forEach(function (k) {
      var existing = state.projectSettings.find(function (s) { return s.projectId === projectId && s.key === k; });
      if (existing) { existing.value = String(values[k]); existing.version = (existing.version || 1) + 1; touch(existing); }
      else state.projectSettings.push({ id: U.uid(), projectId: projectId, key: k, value: String(values[k]), version: 1, updatedAt: U.nowISO() });
    });
  }
  function getCalcSettings(projectId) {
    var s = getProjectSettings(projectId);
    return { allowanceMethod: s['calc.allowanceMethod'], aggregationMethod: s['calc.aggregationMethod'] };
  }
  function putCalcSettings(projectId, input) {
    var values = {};
    if (input.allowanceMethod) values['calc.allowanceMethod'] = input.allowanceMethod;
    if (input.aggregationMethod) values['calc.aggregationMethod'] = input.aggregationMethod;
    putProjectSettings(projectId, values);
    markProjectCalculationsStale(projectId);
    if (input.allowanceMethod === 'SHARE_OF_ST') {
      var violations = [];
      activitiesOfProject(projectId).forEach(function (a) {
        var resolution = resolveForActivity(a.id);
        var violated = false;
        Object.keys(resolution.elements).forEach(function (eid) {
          if (resolution.elements[eid].summary.totalPercent >= 1) violated = true;
        });
        if (violated) violations.push(a.name);
      });
      if (violations.length > 0) {
        putProjectSettings(projectId, { 'calc.allowanceMethod': 'PERCENT_OF_NT' });
        commit();
        throw new Error('در روش «سهم از زمان استاندارد» مجموع مجازها باید کمتر از ۱۰۰٪ باشد. ' + violations.length + ' فعالیت دارای مجموع غیرمجاز است و تغییر روش اعمال نشد: ' + violations.join('، '));
      }
    }
    recordAudit({ entityType: 'Project', entityId: projectId, action: 'UPDATE', entityName: 'تنظیمات محاسبات', after: input, projectId: projectId });
    commit();
    return getCalcSettings(projectId);
  }

  // ═══════════ پروژه‌ها ═══════════
  function listProjects(opts) {
    opts = opts || {};
    var rows = state.projects.slice();
    if (opts.q) {
      var q = opts.q.toLowerCase();
      rows = rows.filter(function (p) {
        return p.name.toLowerCase().includes(q) || p.lineName.toLowerCase().includes(q) || p.productName.toLowerCase().includes(q);
      });
    }
    var dir = opts.dir === 'asc' ? 1 : -1;
    rows.sort(function (a, b) {
      if (opts.sort === 'name') return cmpStr(a.name, b.name) * (opts.dir === 'desc' ? -1 : 1);
      if (opts.sort === 'progress') return (getProjectSummary(a.id).progress - getProjectSummary(b.id).progress) * (opts.dir === 'desc' ? -1 : 1);
      return (a.createdAt < b.createdAt ? -1 : 1) * dir;
    });
    return rows;
  }
  function createProject(input) {
    var now = U.nowISO();
    var p = {
      id: U.uid(), name: input.name, lineName: input.lineName, productName: input.productName,
      studyDate: input.studyDate || null, status: 'IN_PROGRESS', description: input.description || null,
      createdAt: now, updatedAt: now,
    };
    state.projects.push(p);
    getOrCreateSeedTable(p.id);
    recordAudit({ entityType: 'Project', entityId: p.id, action: 'CREATE', entityName: p.name, after: { name: p.name }, projectId: p.id });
    commit();
    return p;
  }
  function updateProject(id, patch) {
    var p = byId('projects', id);
    if (!p) throw new Error('پروژه یافت نشد.');
    ['name', 'lineName', 'productName', 'studyDate', 'description'].forEach(function (k) {
      if (patch[k] !== undefined) p[k] = patch[k];
    });
    touch(p);
    recordAudit({ entityType: 'Project', entityId: id, action: 'UPDATE', entityName: p.name, after: patch, projectId: id });
    commit();
    return p;
  }
  function deleteProject(id) {
    var p = byId('projects', id);
    if (!p) throw new Error('پروژه یافت نشد.');
    var stations = filterBy('stations', 'projectId', id);
    var acts = [], els = [], sessions = [], obs = 0;
    stations.forEach(function (st) {
      sortActivities(st.id).forEach(function (a) {
        acts.push(a);
        sortElements(a.id).forEach(function (e) {
          els.push(e);
          obs += filterBy('elementObservations', 'workElementId', e.id).length;
        });
        sessions = sessions.concat(filterBy('studySessions', 'activityId', a.id));
      });
    });
    var groups = filterBy('activityGroups', 'projectId', id);
    var categories = filterBy('allowanceCategories', 'projectId', id);
    var tables = filterBy('ratingTables', 'projectId', id);
    var deps = {
      'ایستگاه': stations.length, 'فعالیت': acts.length, 'عنصر کاری': els.length,
      'اپراتور': filterBy('operators', 'projectId', id).length,
      'گروه مجاز': groups.length,
      'جلسه زمان‌سنجی': sessions.length, 'مشاهده خام': obs,
    };
    var actIds = acts.map(function (a) { return a.id; });
    var elIds = els.map(function (e) { return e.id; });
    var sesIds = sessions.map(function (s) { return s.id; });
    var cycIds = [];
    sessions.forEach(function (s) { filterBy('cycleObservations', 'sessionId', s.id).forEach(function (c) { cycIds.push(c.id); }); });
    var grpIds = groups.map(function (x) { return x.id; });
    var catIds = categories.map(function (x) { return x.id; });
    var tblIds = tables.map(function (x) { return x.id; });
    state.elementObservations = state.elementObservations.filter(function (o) { return elIds.indexOf(o.workElementId) < 0 && cycIds.indexOf(o.cycleId) < 0; });
    state.timelineLanes = state.timelineLanes.filter(function (l) { return cycIds.indexOf(l.cycleId) < 0; });
    // §۹ ممیزی جلسه ۲ — حذف صریح روابط هم‌پوشانی و مقادیر چرخه‌ای پروژه (بدون رکورد یتیم)
    var projRelIds = {};
    state.overlapRelations.forEach(function (r) { if (r.projectId === id) projRelIds[r.id] = true; });
    state.observationOverlaps = state.observationOverlaps.filter(function (o) { return !projRelIds[o.relationId] && cycIds.indexOf(o.cycleId) < 0; });
    state.overlapRelations = state.overlapRelations.filter(function (r) { return r.projectId !== id; });
    state.cycleObservations = state.cycleObservations.filter(function (c) { return sesIds.indexOf(c.sessionId) < 0; });
    state.ratingAssessments = state.ratingAssessments.filter(function (r) { return elIds.indexOf(r.workElementId) < 0 && tblIds.indexOf(r.ratingTableId) < 0; });
    state.studySessions = state.studySessions.filter(function (s) { return actIds.indexOf(s.activityId) < 0; });
    state.workElements = state.workElements.filter(function (e) { return actIds.indexOf(e.activityId) < 0; });
    state.activityAllowanceOverrides = state.activityAllowanceOverrides.filter(function (o) { return actIds.indexOf(o.activityId) < 0 && catIds.indexOf(o.categoryId) < 0; });
    state.activities = state.activities.filter(function (a) { return actIds.indexOf(a.id) < 0; });
    state.groupAllowances = state.groupAllowances.filter(function (ga) { return grpIds.indexOf(ga.groupId) < 0 && catIds.indexOf(ga.categoryId) < 0; });
    state.ratingTableGrades = state.ratingTableGrades.filter(function (gr) { return tblIds.indexOf(gr.ratingTableId) < 0; });
    ['projectSettings', 'stations', 'activityGroups', 'allowanceCategories', 'operators', 'ratingTables', 'chartNodes', 'chartEdges', 'calculationRuns', 'finalizationInfos'].forEach(function (t) {
      state[t] = state[t].filter(function (r) { return r.projectId !== id; });
    });
    state.projects = state.projects.filter(function (x) { return x.id !== id; });
    markDeleted('Project', [id]);
    recordAudit({ entityType: 'Project', entityId: id, action: 'DELETE', entityName: p.name, projectId: id });
    commit();
    return deps;
  }
  function finalizeProject(id, reason) {
    var p = byId('projects', id);
    if (!p) throw new Error('پروژه یافت نشد.');
    p.status = 'FINALIZED'; touch(p);
    state.finalizationInfos = state.finalizationInfos.filter(function (f) { return f.projectId !== id; });
    state.finalizationInfos.push({ id: U.uid(), projectId: id, reason: reason || null, finalizedAt: U.nowISO() });
    recordAudit({ entityType: 'Project', entityId: id, action: 'FINALIZE', entityName: p.name, after: { reason: reason || null }, projectId: id });
    commit();
  }
  function unfinalizeProject(id) {
    var p = byId('projects', id);
    if (!p) throw new Error('پروژه یافت نشد.');
    p.status = 'IN_PROGRESS'; touch(p);
    state.finalizationInfos = state.finalizationInfos.filter(function (f) { return f.projectId !== id; });
    recordAudit({ entityType: 'Project', entityId: id, action: 'UPDATE', entityName: 'بازگشت از نهایی‌سازی', projectId: id });
    commit();
  }
  function activitiesOfProject(projectId) {
    var out = [];
    sortStations(projectId).forEach(function (st) { sortActivities(st.id).forEach(function (a) { out.push(a); }); });
    return out;
  }
  function getProjectSummary(id) {
    var p = byId('projects', id);
    if (!p) return null;
    var stg = computeStageSummary(id);
    return {
      project: p, finalized: p.status === 'FINALIZED',
      counts: stg.counts, progress: stg.progress, stages: stg.stages,
    };
  }

  // ═══════════ ساختار تولید ═══════════
  function createStation(projectId, input) {
    var st = {
      id: U.uid(), projectId: projectId, name: input.name, description: input.description || null,
      sortOrder: nextSortOrder('stations', 'projectId', projectId), createdAt: U.nowISO(), updatedAt: U.nowISO(),
    };
    state.stations.push(st);
    recordAudit({ entityType: 'Station', entityId: st.id, action: 'CREATE', entityName: st.name, after: { name: st.name }, projectId: projectId });
    commit();
    return st;
  }
  function updateStation(id, patch) {
    var st = byId('stations', id);
    if (!st) throw new Error('ایستگاه یافت نشد.');
    if (patch.name !== undefined) st.name = patch.name;
    if (patch.description !== undefined) st.description = patch.description;
    touch(st);
    recordAudit({ entityType: 'Station', entityId: id, action: 'UPDATE', entityName: st.name, projectId: st.projectId });
    commit();
  }
  function deleteStation(id) {
    var st = byId('stations', id);
    if (!st) throw new Error('ایستگاه یافت نشد.');
    var acts = sortActivities(id);
    var els = [], sessions = [];
    acts.forEach(function (a) {
      els = els.concat(sortElements(a.id));
      sessions = sessions.concat(filterBy('studySessions', 'activityId', a.id));
    });
    var deps = { 'فعالیت': acts.length, 'عنصر کاری': els.length, 'جلسه زمان‌سنجی': sessions.length };
    // §۹ ممیزی جلسه ۲ — آرشیو روابط موازی تمام عناصر کاری زیرمجموعه
    var archivedRelations = 0;
    els.forEach(function (e) { archivedRelations += archiveOverlapRelationsForElement(e.id); });
    if (archivedRelations > 0) deps['رابطهٔ موازی (آرشیو شد)'] = archivedRelations;
    var ids = [id].concat(acts.map(function (a) { return a.id; })).concat(els.map(function (e) { return e.id; })).concat(sessions.map(function (s) { return s.id; }));
    cascadeDelete(ids);
    markDeleted('Station', [id]);
    recordAudit({ entityType: 'Station', entityId: id, action: 'DELETE', entityName: st.name, projectId: st.projectId });
    commit();
    return deps;
  }
  function cascadeDelete(ids) {
    state.ratingAssessments = state.ratingAssessments.filter(function (r) { return ids.indexOf(r.workElementId) < 0; });
    state.elementObservations = state.elementObservations.filter(function (r) { return ids.indexOf(r.workElementId) < 0 && ids.indexOf(r.cycleId) < 0; });
    state.timelineLanes = state.timelineLanes.filter(function (r) { return ids.indexOf(r.cycleId) < 0; });
    // §۸/§۹ ممیزی جلسه ۲ — مقادیر هم‌پوشانی چرخه‌های حذف‌شده نیز حذف می‌شوند (بدون ردیف یتیم)؛
    // مقادیر روابط آرشیو‌شدهٔ عناصر (relationId) دست‌نخورده می‌مانند (حفظ تاریخچه)
    state.observationOverlaps = state.observationOverlaps.filter(function (r) { return ids.indexOf(r.cycleId) < 0; });
    state.cycleObservations = state.cycleObservations.filter(function (r) { return ids.indexOf(r.id) < 0 && ids.indexOf(r.sessionId) < 0; });
    state.studySessions = state.studySessions.filter(function (r) { return ids.indexOf(r.id) < 0 && ids.indexOf(r.activityId) < 0 && ids.indexOf(r.operatorId) < 0; });
    state.workElements = state.workElements.filter(function (r) { return ids.indexOf(r.id) < 0 && ids.indexOf(r.activityId) < 0; });
    state.activityAllowanceOverrides = state.activityAllowanceOverrides.filter(function (r) { return ids.indexOf(r.activityId) < 0; });
    state.activities = state.activities.filter(function (r) { return ids.indexOf(r.id) < 0 && ids.indexOf(r.stationId) < 0; });
    state.stations = state.stations.filter(function (r) { return ids.indexOf(r.id) < 0; });
    state.groupAllowances = state.groupAllowances.filter(function (r) { return ids.indexOf(r.groupId) < 0 && ids.indexOf(r.categoryId) < 0; });
    state.operators = state.operators.filter(function (r) { return ids.indexOf(r.id) < 0; });
    state.allowanceCategories = state.allowanceCategories.filter(function (r) { return ids.indexOf(r.id) < 0; });
    state.ratingTableGrades = state.ratingTableGrades.filter(function (r) { return ids.indexOf(r.ratingTableId) < 0; });
    state.ratingTables = state.ratingTables.filter(function (r) { return ids.indexOf(r.id) < 0; });
    state.chartEdges = state.chartEdges.filter(function (r) { return ids.indexOf(r.sourceNodeId) < 0 && ids.indexOf(r.targetNodeId) < 0; });
    state.chartNodes = state.chartNodes.filter(function (r) { return ids.indexOf(r.activityId) < 0; });
  }
  function reorderStations(projectId, ids) {
    ids.forEach(function (id, i) {
      var st = byId('stations', id);
      if (st) { st.sortOrder = i; touch(st); }
    });
    commit();
  }
  function createActivity(stationId, input) {
    var st = byId('stations', stationId);
    if (!st) throw new Error('ایستگاه یافت نشد.');
    var a = {
      id: U.uid(), stationId: stationId, groupId: input.groupId || null, name: input.name,
      description: input.description || null, processType: input.processType || 'OPERATION',
      sortOrder: nextSortOrder('activities', 'stationId', stationId),
      targetSampleCount: input.targetSampleCount !== undefined && input.targetSampleCount !== null ? input.targetSampleCount : null,
      createdAt: U.nowISO(), updatedAt: U.nowISO(),
    };
    state.activities.push(a);
    markProjectCalculationsStale(st.projectId);
    recordAudit({ entityType: 'Activity', entityId: a.id, action: 'CREATE', entityName: a.name, after: { name: a.name }, projectId: st.projectId });
    commit();
    return a;
  }
  function updateActivity(id, patch) {
    var a = byId('activities', id);
    if (!a) throw new Error('فعالیت یافت نشد.');
    var effective = false;
    ['name', 'description'].forEach(function (k) { if (patch[k] !== undefined) a[k] = patch[k]; });
    if (patch.processType !== undefined) a.processType = patch.processType;
    if (patch.groupId !== undefined) { a.groupId = patch.groupId || null; effective = true; }
    if (patch.targetSampleCount !== undefined) { a.targetSampleCount = patch.targetSampleCount === null || patch.targetSampleCount === '' ? null : patch.targetSampleCount; effective = true; }
    touch(a);
    if (effective) markProjectCalculationsStale(projectIdOfActivity(id));
    recordAudit({ entityType: 'Activity', entityId: id, action: 'UPDATE', entityName: a.name, projectId: projectIdOfActivity(id) });
    commit();
    return a;
  }
  function deleteActivity(id) {
    var a = byId('activities', id);
    if (!a) throw new Error('فعالیت یافت نشد.');
    var els = sortElements(id);
    var sessions = filterBy('studySessions', 'activityId', id);
    var deps = { 'عنصر کاری': els.length, 'جلسه زمان‌سنجی': sessions.length };
    // §۹ ممیزی جلسه ۲ — آرشیو روابط موازی تمام عناصر کاری زیرمجموعه
    var archivedRelations = 0;
    els.forEach(function (e) { archivedRelations += archiveOverlapRelationsForElement(e.id); });
    if (archivedRelations > 0) deps['رابطهٔ موازی (آرشیو شد)'] = archivedRelations;
    var ids = [id].concat(els.map(function (e) { return e.id; })).concat(sessions.map(function (s) { return s.id; }));
    cascadeDelete(ids);
    markDeleted('Activity', [id]);
    recordAudit({ entityType: 'Activity', entityId: id, action: 'DELETE', entityName: a.name, projectId: projectIdOfActivity(id) });
    commit();
    return deps;
  }
  function reorderActivities(stationId, ids) {
    ids.forEach(function (id, i) { var a = byId('activities', id); if (a) { a.sortOrder = i; touch(a); } });
    commit();
  }
  function createElement(activityId, input) {
    // v1.5.0 §۳ — عنصر جدید بدون «نوع»: ورود ترتیبی و خط اپراتور پیش‌فرض
    var e = {
      id: U.uid(), activityId: activityId, name: input.name, description: input.description || null,
      elementType: 'MANUAL', // LEGACY — فقط برای حفظ رفتار تحلیل تاریخی؛ در UI عرضه نمی‌شود
      defaultEntryMode: 'SEQ', defaultLaneType: 'OPERATOR',
      sortOrder: nextSortOrder('workElements', 'activityId', activityId),
      createdAt: U.nowISO(), updatedAt: U.nowISO(),
    };
    state.workElements.push(e);
    markProjectCalculationsStale(projectIdOfActivity(activityId));
    recordAudit({ entityType: 'WorkElement', entityId: e.id, action: 'CREATE', entityName: e.name, after: { name: e.name }, projectId: projectIdOfActivity(activityId) });
    commit();
    return e;
  }
  function updateElement(id, patch) {
    var e = byId('workElements', id);
    if (!e) throw new Error('عنصر کاری یافت نشد.');
    if (patch.name !== undefined) e.name = patch.name;
    if (patch.description !== undefined) e.description = patch.description;
    // v1.5.0 §۳ — elementType دیگر پارامتر ویرایش نیست (ستون legacy دست‌نخورده می‌ماند)
    touch(e);
    recordAudit({ entityType: 'WorkElement', entityId: id, action: 'UPDATE', entityName: e.name, projectId: projectIdOfActivity(e.activityId) });
    commit();
    return e;
  }
  function deleteElement(id) {
    var e = byId('workElements', id);
    if (!e) throw new Error('عنصر کاری یافت نشد.');
    var obs = filterBy('elementObservations', 'workElementId', id);
    // جلسه ۲ — آرشیو روابط موازی مرجع (حفظ تاریخچهٔ مقادیر چرخه‌ها)
    var archivedRelations = archiveOverlapRelationsForElement(id);
    var deps = { 'مشاهده': obs.length, 'ارزیابی وستینگهاوس این عنصر': state.ratingAssessments.filter(function (r) { return r.workElementId === id; }).length };
    if (archivedRelations > 0) deps['رابطهٔ موازی (آرشیو شد)'] = archivedRelations;
    cascadeDelete([id]);
    markDeleted('WorkElement', [id]);
    markProjectCalculationsStale(projectIdOfActivity(e.activityId));
    recordAudit({ entityType: 'WorkElement', entityId: id, action: 'DELETE', entityName: e.name, projectId: projectIdOfActivity(e.activityId) });
    commit();
    return deps;
  }
  function reorderElements(activityId, ids) {
    ids.forEach(function (id, i) { var e = byId('workElements', id); if (e) { e.sortOrder = i; touch(e); } });
    markProjectCalculationsStale(projectIdOfActivity(activityId));
    commit();
  }

  // ═══════════ اپراتورها ═══════════
  function listOperators(projectId) {
    return filterBy('operators', 'projectId', projectId).sort(function (a, b) { return cmpStr(a.displayName, b.displayName); });
  }
  function createOperator(projectId, input) {
    var o = {
      id: U.uid(), projectId: projectId, displayName: input.displayName, code: input.code || null,
      notes: input.notes || null, createdAt: U.nowISO(), updatedAt: U.nowISO(),
    };
    state.operators.push(o);
    recordAudit({ entityType: 'Operator', entityId: o.id, action: 'CREATE', entityName: o.displayName, after: { displayName: o.displayName }, projectId: projectId });
    commit();
    return o;
  }
  function updateOperator(id, patch) {
    var o = byId('operators', id);
    if (!o) throw new Error('اپراتور یافت نشد.');
    ['displayName', 'code', 'notes'].forEach(function (k) { if (patch[k] !== undefined) o[k] = patch[k]; });
    touch(o);
    recordAudit({ entityType: 'Operator', entityId: id, action: 'UPDATE', entityName: o.displayName, projectId: o.projectId });
    commit();
  }
  function deleteOperator(id) {
    var o = byId('operators', id);
    if (!o) throw new Error('اپراتور یافت نشد.');
    var sessions = filterBy('studySessions', 'operatorId', id);
    var deps = { 'جلسات زمان‌سنجی': sessions.length };
    cascadeDelete([id]);
    markDeleted('Operator', [id]);
    recordAudit({ entityType: 'Operator', entityId: id, action: 'DELETE', entityName: o.displayName, projectId: o.projectId });
    commit();
    return deps;
  }

  // ═══════════ گروه‌ها و مجازها ═══════════
  function listCategories(projectId) {
    return filterBy('allowanceCategories', 'projectId', projectId).sort(function (a, b) { return (a.sortOrder - b.sortOrder) || cmpStr(a.name, b.name); });
  }
  function createCategory(projectId, input) {
    var c = {
      id: U.uid(), projectId: projectId, name: input.name, code: input.code || null,
      isActive: input.isActive !== false, sortOrder: input.sortOrder !== undefined ? input.sortOrder : nextSortOrder('allowanceCategories', 'projectId', projectId),
      createdAt: U.nowISO(), updatedAt: U.nowISO(),
    };
    state.allowanceCategories.push(c);
    recordAudit({ entityType: 'AllowanceCategory', entityId: c.id, action: 'CREATE', entityName: c.name, after: { name: c.name, isActive: c.isActive }, projectId: projectId });
    commit();
    return c;
  }
  function updateCategory(id, patch) {
    var c = byId('allowanceCategories', id);
    if (!c) throw new Error('دسته مجاز یافت نشد.');
    var wasActive = c.isActive;
    if (patch.name !== undefined) c.name = patch.name;
    if (patch.code !== undefined) c.code = patch.code;
    if (patch.isActive !== undefined) c.isActive = patch.isActive;
    if (patch.sortOrder !== undefined) c.sortOrder = patch.sortOrder;
    touch(c);
    if (wasActive !== c.isActive) markProjectCalculationsStale(c.projectId);
    recordAudit({ entityType: 'AllowanceCategory', entityId: id, action: 'UPDATE', entityName: c.name, before: { isActive: wasActive }, after: { isActive: c.isActive }, projectId: c.projectId });
    commit();
  }
  function deleteCategory(id) {
    var c = byId('allowanceCategories', id);
    if (!c) throw new Error('دسته مجاز یافت نشد.');
    var gv = filterBy('groupAllowances', 'categoryId', id).length;
    var ov = filterBy('activityAllowanceOverrides', 'categoryId', id).length;
    state.groupAllowances = state.groupAllowances.filter(function (r) { return r.categoryId !== id; });
    state.activityAllowanceOverrides = state.activityAllowanceOverrides.filter(function (r) { return r.categoryId !== id; });
    state.allowanceCategories = state.allowanceCategories.filter(function (r) { return r.id !== id; });
    markDeleted('AllowanceCategory', [id]);
    markProjectCalculationsStale(c.projectId);
    recordAudit({ entityType: 'AllowanceCategory', entityId: id, action: 'DELETE', entityName: c.name, projectId: c.projectId });
    commit();
    return { 'مقدار ثبت‌شده در گروه‌ها': gv, 'بازنویسی اختصاصی فعالیت‌ها': ov };
  }
  function listGroups(projectId) {
    return filterBy('activityGroups', 'projectId', projectId).sort(function (a, b) { return a.createdAt < b.createdAt ? -1 : 1; }).map(function (grp) {
      var activeCats = {};
      listCategories(projectId).forEach(function (c) { if (c.isActive) activeCats[c.id] = true; });
      var gas = filterBy('groupAllowances', 'groupId', grp.id);
      var totalA = F.sumAllowances(gas.filter(function (ga) { return activeCats[ga.categoryId]; }).map(function (ga) { return { categoryId: ga.categoryId, percentValue: ga.percentValue }; }));
      return { group: grp, allowances: gas, totalA: totalA, activitiesCount: state.activities.filter(function (a) { return a.groupId === grp.id; }).length };
    });
  }
  function createGroup(projectId, input) {
    var grp = { id: U.uid(), projectId: projectId, name: input.name, description: input.description || null, createdAt: U.nowISO(), updatedAt: U.nowISO() };
    state.activityGroups.push(grp);
    recordAudit({ entityType: 'ActivityGroup', entityId: grp.id, action: 'CREATE', entityName: grp.name, after: { name: grp.name }, projectId: projectId });
    commit();
    return grp;
  }
  function updateGroup(id, patch) {
    var grp = byId('activityGroups', id);
    if (!grp) throw new Error('گروه فعالیت یافت نشد.');
    if (patch.name !== undefined) grp.name = patch.name;
    if (patch.description !== undefined) grp.description = patch.description;
    touch(grp);
    recordAudit({ entityType: 'ActivityGroup', entityId: id, action: 'UPDATE', entityName: grp.name, projectId: grp.projectId });
    commit();
  }
  function deleteGroup(id) {
    var grp = byId('activityGroups', id);
    if (!grp) throw new Error('گروه فعالیت یافت نشد.');
    var values = filterBy('groupAllowances', 'groupId', id).length;
    var acts = state.activities.filter(function (a) { return a.groupId === id; });
    state.groupAllowances = state.groupAllowances.filter(function (r) { return r.groupId !== id; });
    state.activityGroups = state.activityGroups.filter(function (r) { return r.id !== id; });
    acts.forEach(function (a) { a.groupId = null; touch(a); });
    markDeleted('ActivityGroup', [id]);
    markProjectCalculationsStale(grp.projectId);
    recordAudit({ entityType: 'ActivityGroup', entityId: id, action: 'DELETE', entityName: grp.name, projectId: grp.projectId });
    commit();
    return { 'مقدار مجاز ثبت‌شده در این گروه (حذف می‌شود)': values, 'فعالیت — فقط بدون گروه می‌شوند؛ داده آن‌ها حذف نمی‌شود': acts.length };
  }
  function setGroupAllowance(groupId, categoryId, percentValue) {
    var existing = state.groupAllowances.find(function (ga) { return ga.groupId === groupId && ga.categoryId === categoryId; });
    var grp = byId('activityGroups', groupId);
    if (percentValue === null || percentValue === undefined) {
      state.groupAllowances = state.groupAllowances.filter(function (ga) { return !(ga.groupId === groupId && ga.categoryId === categoryId); });
    } else if (existing) { existing.percentValue = percentValue; touch(existing); }
    else state.groupAllowances.push({ id: U.uid(), groupId: groupId, categoryId: categoryId, percentValue: percentValue, updatedAt: U.nowISO() });
    if (grp) markProjectCalculationsStale(grp.projectId);
    commit();
  }
  // ═══════════ الونس‌های سلسله‌مراتبی — جلسه اول ═══════════
  // پورت دقیق از src/application/effective-allowance-service.ts
  // تعریف مرکزی (allowanceDefinitions) از تخصیص (allowanceAssignments) جدا است.

  var MIGRATION_MARKER_KEY = 'migration.allowanceModel';
  var MIGRATION_MARKER_VALUE = 'v2';

  function listAllowanceDefinitions(projectId) {
    return state.allowanceDefinitions
      .filter(function (d) { return d.projectId === projectId; })
      .sort(function (a, b) { return a.sortOrder - b.sortOrder || (a.createdAt < b.createdAt ? -1 : 1); })
      .map(function (d) {
        return Object.assign({}, d, { assignmentCount: state.allowanceAssignments.filter(function (x) { return x.definitionId === d.id; }).length });
      });
  }
  function createAllowanceDefinition(projectId, input) {
    var def = {
      id: U.uid(), projectId: projectId,
      title: input.title, code: input.code || null, description: input.description || null,
      defaultValueType: input.defaultValueType || null,
      defaultValuePercent: input.defaultValueType === 'PERCENT' ? (input.defaultValuePercent ?? null) : null,
      defaultTimeSeconds: input.defaultValueType === 'FIXED_TIME' ? (input.defaultTimeSeconds ?? null) : null,
      isActive: input.isActive !== false, sortOrder: input.sortOrder || 0, isArchived: false,
      createdAt: U.nowISO(), updatedAt: U.nowISO(),
    };
    if (!def.title || !def.title.trim()) throw new Error('عنوان الونس الزامی است.');
    state.allowanceDefinitions.push(def);
    recordAudit({ entityType: 'AllowanceDefinition', entityId: def.id, action: 'CREATE', entityName: def.title, after: { title: def.title }, projectId: projectId });
    commit();
    return Object.assign({}, def, { assignmentCount: 0 });
  }
  function updateAllowanceDefinition(definitionId, input) {
    var d = byId('allowanceDefinitions', definitionId);
    if (!d) throw new Error('تعریف الونس یافت نشد.');
    if (input.title !== undefined) d.title = input.title;
    if (input.code !== undefined) d.code = input.code;
    if (input.description !== undefined) d.description = input.description;
    if (input.isActive !== undefined) d.isActive = input.isActive;
    if (input.sortOrder !== undefined) d.sortOrder = input.sortOrder;
    if (input.isArchived !== undefined) d.isArchived = input.isArchived;
    if (input.defaultValueType !== undefined) {
      d.defaultValueType = input.defaultValueType || null;
      d.defaultValuePercent = input.defaultValueType === 'PERCENT' ? (input.defaultValuePercent ?? null) : null;
      d.defaultTimeSeconds = input.defaultValueType === 'FIXED_TIME' ? (input.defaultTimeSeconds ?? null) : null;
    } else {
      if (input.defaultValuePercent !== undefined) d.defaultValuePercent = input.defaultValuePercent;
      if (input.defaultTimeSeconds !== undefined) d.defaultTimeSeconds = input.defaultTimeSeconds;
    }
    touch(d);
    markProjectCalculationsStale(d.projectId);
    recordAudit({ entityType: 'AllowanceDefinition', entityId: definitionId, action: 'UPDATE', entityName: d.title, projectId: d.projectId });
    commit();
    return Object.assign({}, d, { assignmentCount: state.allowanceAssignments.filter(function (x) { return x.definitionId === d.id; }).length });
  }
  /** حذف تعریف — سیاست آرشیو: دارای تخصیص/سابقه → بایگانی (§۲.۲) */
  function deleteAllowanceDefinition(definitionId) {
    var d = byId('allowanceDefinitions', definitionId);
    if (!d) throw new Error('تعریف الونس یافت نشد.');
    var assignmentCount = state.allowanceAssignments.filter(function (x) { return x.definitionId === definitionId; }).length;
    if (assignmentCount > 0) {
      d.isArchived = true; d.isActive = false; touch(d);
      markProjectCalculationsStale(d.projectId);
      recordAudit({ entityType: 'AllowanceDefinition', entityId: definitionId, action: 'UPDATE', entityName: d.title, before: { isArchived: false }, after: { isArchived: true, reason: 'حذف با سابقه → آرشیو' }, projectId: d.projectId });
      commit();
      return { archived: true, assignmentCount: assignmentCount };
    }
    state.allowanceDefinitions = state.allowanceDefinitions.filter(function (x) { return x.id !== definitionId; });
    recordAudit({ entityType: 'AllowanceDefinition', entityId: definitionId, action: 'DELETE', entityName: d.title, projectId: d.projectId });
    commit();
    return { archived: false, assignmentCount: 0 };
  }

  /** بافت scope — زنجیره والد + شمارش زیرشاخه‌ها (§۵) */
  function getScopeContext(scopeType, scopeId) {
    if (scopeType === 'PROJECT') {
      var p = byId('projects', scopeId);
      if (!p) throw new Error('پروژه یافت نشد.');
      var stCount = 0, actCount = 0;
      state.stations.filter(function (s) { return s.projectId === scopeId; }).forEach(function (s) {
        stCount++; actCount += state.activities.filter(function (a) { return a.stationId === s.id; }).length;
      });
      var elCount = state.workElements.filter(function (e) { return projectIdOfActivity(e.activityId) === scopeId; }).length;
      return { projectId: p.id, scopeLabel: p.name, chain: [{ type: 'PROJECT', id: p.id, label: p.name }], descendants: { stations: stCount, activities: actCount, elements: elCount } };
    }
    if (scopeType === 'STATION') {
      var st = byId('stations', scopeId);
      if (!st) throw new Error('ایستگاه یافت نشد.');
      var acts = state.activities.filter(function (a) { return a.stationId === scopeId; });
      var els = state.workElements.filter(function (e) { return acts.some(function (a) { return a.id === e.activityId; }); });
      return {
        projectId: st.projectId, scopeLabel: st.name,
        chain: [{ type: 'PROJECT', id: st.projectId, label: byId('projects', st.projectId) ? byId('projects', st.projectId).name : '؟' }, { type: 'STATION', id: st.id, label: st.name }],
        descendants: { stations: 0, activities: acts.length, elements: els.length },
      };
    }
    if (scopeType === 'ACTIVITY') {
      var act = byId('activities', scopeId);
      if (!act) throw new Error('فعالیت یافت نشد.');
      var stA = byId('stations', act.stationId);
      var prA = byId('projects', stA.projectId);
      return {
        projectId: stA.projectId, scopeLabel: act.name,
        chain: [{ type: 'PROJECT', id: prA.id, label: prA.name }, { type: 'STATION', id: stA.id, label: stA.name }, { type: 'ACTIVITY', id: act.id, label: act.name }],
        descendants: { stations: 0, activities: 0, elements: sortElements(scopeId).length },
      };
    }
    var el = byId('workElements', scopeId);
    if (!el) throw new Error('عنصر کاری یافت نشد.');
    var actE = byId('activities', el.activityId);
    var stE = byId('stations', actE.stationId);
    var prE = byId('projects', stE.projectId);
    return {
      projectId: stE.projectId, scopeLabel: el.name,
      chain: [{ type: 'PROJECT', id: prE.id, label: prE.name }, { type: 'STATION', id: stE.id, label: stE.name }, { type: 'ACTIVITY', id: actE.id, label: actE.name }, { type: 'WORK_ELEMENT', id: el.id, label: el.name }],
      descendants: { stations: 0, activities: 0, elements: 0 },
    };
  }

  /** بارگذاری بافت پروژه — self-heal migration + تعریف‌ها + تخصیص‌ها + روش */
  function loadProjectAllowanceContext(projectId) {
    migrateProjectAllowancesIfNeeded(projectId, state);
    var settings = getProjectSettings(projectId);
    var method = settings['calc.allowanceMethod'];
    var definitions = state.allowanceDefinitions
      .filter(function (d) { return d.projectId === projectId; })
      .map(function (d) {
        return {
          id: d.id, title: d.title, code: d.code, description: d.description,
          isActive: d.isActive && !d.isArchived, sortOrder: d.sortOrder,
          defaultValueType: d.defaultValueType, defaultValuePercent: d.defaultValuePercent, defaultTimeSeconds: d.defaultTimeSeconds,
        };
      });
    var defIds = {};
    definitions.forEach(function (d) { defIds[d.id] = true; });
    var assignments = state.allowanceAssignments
      .filter(function (a) { return defIds[a.definitionId]; })
      .map(function (a) {
        return {
          definitionId: a.definitionId, scopeType: a.scopeType, scopeId: a.scopeId, mode: a.mode,
          valueType: a.valueType, percentValue: a.percentValue, timeValueSeconds: a.timeValueSeconds, applicationBasis: a.applicationBasis,
        };
      });
    return { projectId: projectId, method: method, definitions: definitions, assignments: assignments };
  }

  /** الونس‌های یک scope: resolve کامل + تعریف‌ها + تخصیص‌های محلی (§۵/۶) */
  function getScopeAllowances(scopeType, scopeId) {
    var ctx = getScopeContext(scopeType, scopeId);
    var context = loadProjectAllowanceContext(ctx.projectId);
    var resolved = F.resolveEffectiveAllowances({ definitions: context.definitions, assignments: context.assignments, chain: ctx.chain });
    var locals = state.allowanceAssignments.filter(function (a) { return a.scopeType === scopeType && a.scopeId === scopeId; });
    var lastModifiedAt = null;
    locals.forEach(function (a) { if (a.updatedAt > (lastModifiedAt || '')) lastModifiedAt = a.updatedAt; });
    return {
      scope: { type: scopeType, id: scopeId, label: ctx.scopeLabel, projectId: ctx.projectId },
      chain: ctx.chain,
      descendants: ctx.descendants,
      settings: { method: context.method, methodLabel: CONST.ALLOWANCE_METHOD_LABELS[context.method], formula: CONST.ALLOWANCE_METHOD_FORMULAS[context.method] },
      definitions: listAllowanceDefinitions(ctx.projectId),
      resolved: { rows: resolved.rows, summary: resolved.summary },
      localAssignments: locals.map(function (a) {
        return { definitionId: a.definitionId, mode: a.mode, valueType: a.valueType, percentValue: a.percentValue, timeValueSeconds: a.timeValueSeconds, applicationBasis: a.applicationBasis, updatedAt: a.updatedAt };
      }),
      lastModifiedAt: lastModifiedAt,
    };
  }

  /** پیش‌فرض مبنا: عنصر → هر اجرا؛ سطح‌های بالاتر → هر چرخه (§۲.۳) */
  function defaultBasisForScope(scopeType) {
    return scopeType === 'WORK_ELEMENT' ? 'PER_ELEMENT_EXECUTION' : 'PER_CYCLE';
  }

  /** اعمال عملیات روی فهرست در حافظه — برای اعتبارسنجی پیش از commit */
  function applyOpsInMemory(assignments, ops, scopeType, scopeId, excludeTypes) {
    var map = {};
    assignments.forEach(function (a) { map[a.definitionId + '|' + a.scopeType + '|' + a.scopeId] = a; });
    ops.forEach(function (op) {
      var k = op.definitionId + '|' + scopeType + '|' + scopeId;
      if (op.action === 'SET') {
        var vt = op.valueType;
        var basis = vt === 'FIXED_TIME' ? (op.applicationBasis || defaultBasisForScope(scopeType)) : null;
        map[k] = { definitionId: op.definitionId, scopeType: scopeType, scopeId: scopeId, mode: 'ACTIVE', valueType: vt, percentValue: vt === 'PERCENT' ? (op.percentValue ?? null) : null, timeValueSeconds: vt === 'FIXED_TIME' ? (op.timeValueSeconds ?? null) : null, applicationBasis: basis };
      } else if (op.action === 'EXCLUDE') {
        // نوع نمایشی معنادار — نه PERCENT ساختگی (الزام ۴)
        map[k] = { definitionId: op.definitionId, scopeType: scopeType, scopeId: scopeId, mode: 'EXCLUDE', valueType: (excludeTypes && excludeTypes[op.definitionId]) || 'PERCENT', percentValue: null, timeValueSeconds: null, applicationBasis: null };
      } else {
        delete map[k];
      }
    });
    return Object.keys(map).map(function (k) { return map[k]; });
  }

  /** اعتبارسنجی روش ۲ روی عناصر متأثر scope (§۳) */
  function validateShareOfStForScope(ctx, definitions, assignments, method) {
    if (method !== 'SHARE_OF_ST') return;
    var elements;
    if (ctx.chain[ctx.chain.length - 1].type === 'PROJECT') elements = state.workElements.filter(function (e) { return projectIdOfActivity(e.activityId) === ctx.projectId; });
    else if (ctx.chain[ctx.chain.length - 1].type === 'STATION') elements = state.workElements.filter(function (e) { var a = byId('activities', e.activityId); return a && a.stationId === ctx.chain[1].id; });
    else if (ctx.chain[ctx.chain.length - 1].type === 'ACTIVITY') elements = state.workElements.filter(function (e) { return e.activityId === ctx.chain[2].id; });
    else elements = [byId('workElements', ctx.chain[3].id)];
    var violations = [];
    elements.forEach(function (el) {
      var act = byId('activities', el.activityId);
      var st = byId('stations', act.stationId);
      var r = F.resolveEffectiveAllowances({
        definitions: definitions, assignments: assignments,
        chain: [ctx.chain[0], { type: 'STATION', id: st.id, label: st.name }, { type: 'ACTIVITY', id: act.id, label: act.name }, { type: 'WORK_ELEMENT', id: el.id, label: el.name }],
      });
      if (r.summary.totalPercent >= 1) violations.push('«' + el.name + '» (' + act.name + ')');
    });
    if (violations.length > 0) {
      throw new Error('در روش «سهم از زمان استاندارد» مجموع مجازها باید کمتر از ۱۰۰٪ باشد. ' + violations.length + ' عنصر کاری زیرمجموعه دارای مجموع غیرمجاز است: ' + violations.slice(0, 5).join('، ') + (violations.length > 5 ? ' و …' : ''));
    }
  }

  /** ثبت عملیات تخصیص روی یک scope (§۶) */
  /**
   * نوع نمایشی ذخیره‌شده برای تخصیص EXCLUDE (الزام ۴ — هم‌ارز نسخه وب):
   * نزدیک‌ترین تصمیم «فعال» در سطح بالاترِ خود scope؛
   * وگرنه پیش‌فرض تعریف مرکزی؛ وگرنه PERCENT خنثی.
   */
  function computeExcludeValueType(ctx, context, definitionId, scopeType, scopeId) {
    for (var i = ctx.chain.length - 1; i >= 0; i--) {
      var link = ctx.chain[i];
      if (link.type === scopeType && link.id === scopeId) continue; // خود scope
      for (var j = 0; j < context.assignments.length; j++) {
        var a = context.assignments[j];
        if (a.definitionId === definitionId && a.scopeType === link.type && a.scopeId === link.id && a.mode === 'ACTIVE') {
          return a.valueType;
        }
      }
    }
    for (var k = 0; k < context.definitions.length; k++) {
      var def = context.definitions[k];
      if (def.id !== definitionId) continue;
      if (def.defaultValueType === 'PERCENT' || def.defaultValueType === 'FIXED_TIME') return def.defaultValueType;
      if (def.defaultTimeSeconds !== null && def.defaultTimeSeconds !== undefined) return 'FIXED_TIME';
      if (def.defaultValuePercent !== null && def.defaultValuePercent !== undefined) return 'PERCENT';
    }
    return 'PERCENT';
  }

  function putScopeAllowanceOps(scopeType, scopeId, ops, expectedUpdatedAt) {
    var ctx = getScopeContext(scopeType, scopeId);
    var context = loadProjectAllowanceContext(ctx.projectId);
    var method = context.method;

    // کنترل هم‌زمانی — آخرین تغییر تخصیص‌های همین scope
    if (expectedUpdatedAt) {
      var locals = state.allowanceAssignments.filter(function (a) { return a.scopeType === scopeType && a.scopeId === scopeId; });
      if (locals.length > 0) {
        var latest = locals.reduce(function (m, a) { return a.updatedAt > m ? a.updatedAt : m; }, '');
        if (Math.abs(new Date(latest).getTime() - new Date(expectedUpdatedAt).getTime()) > 1000) {
          throw new Error('تخصیص‌های این بخش جای دیگری تغییر کرده؛ تازه‌سازی کنید.');
        }
      }
    }

    // اعتبارسنجی تعلق تعریف‌ها به پروژه (§۵)
    ops.forEach(function (op) {
      var def = state.allowanceDefinitions.find(function (d) { return d.id === op.definitionId; });
      if (!def) throw new Error('تعریف الونس یافت نشد.');
      if (def.projectId !== ctx.projectId) throw new Error('تعریف الونس به این پروژه تعلق ندارد.');
    });

    // اعتبارسنجی مقدار و مجموع — قبل از commit
    ops.forEach(function (op) {
      if (op.action !== 'SET') return;
      var basis = op.valueType === 'FIXED_TIME' ? (op.applicationBasis || defaultBasisForScope(scopeType)) : null;
      F.validateAssignmentValue({ mode: 'ACTIVE', valueType: op.valueType, percentValue: op.percentValue ?? null, timeValueSeconds: op.timeValueSeconds ?? null, applicationBasis: basis });
    });
    // نوع نمایشی هر op Exclude — پیش از اعمال، از وضعیت فعلی محاسبه می‌شود (الزام ۴)
    var excludeTypes = {};
    ops.forEach(function (op) {
      if (op.action === 'EXCLUDE') excludeTypes[op.definitionId] = computeExcludeValueType(ctx, context, op.definitionId, scopeType, scopeId);
    });

    var virtualAssignments = applyOpsInMemory(context.assignments, ops, scopeType, scopeId, excludeTypes);
    validateShareOfStForScope(ctx, context.definitions, virtualAssignments, method);

    ops.forEach(function (op) {
      var existing = state.allowanceAssignments.find(function (a) { return a.definitionId === op.definitionId && a.scopeType === scopeType && a.scopeId === scopeId; });
      if (op.action === 'SET') {
        var basis = op.valueType === 'FIXED_TIME' ? (op.applicationBasis || defaultBasisForScope(scopeType)) : null;
        var data = { mode: 'ACTIVE', valueType: op.valueType, percentValue: op.valueType === 'PERCENT' ? op.percentValue : null, timeValueSeconds: op.valueType === 'FIXED_TIME' ? op.timeValueSeconds : null, applicationBasis: basis };
        if (existing) { Object.assign(existing, data); touch(existing); }
        else state.allowanceAssignments.push(Object.assign({ id: U.uid(), definitionId: op.definitionId, scopeType: scopeType, scopeId: scopeId, createdAt: U.nowISO() }, data, { updatedAt: U.nowISO() }));
      } else if (op.action === 'EXCLUDE') {
        // نوع نمایشی معنادار — نه PERCENT ساختگی (الزام ۴)
        var dataX = { mode: 'EXCLUDE', valueType: excludeTypes[op.definitionId] || 'PERCENT', percentValue: null, timeValueSeconds: null, applicationBasis: null };
        if (existing) { Object.assign(existing, dataX); touch(existing); }
        else state.allowanceAssignments.push(Object.assign({ id: U.uid(), definitionId: op.definitionId, scopeType: scopeType, scopeId: scopeId, createdAt: U.nowISO() }, dataX, { updatedAt: U.nowISO() }));
      } else {
        state.allowanceAssignments = state.allowanceAssignments.filter(function (a) { return !(a.definitionId === op.definitionId && a.scopeType === scopeType && a.scopeId === scopeId); });
      }
    });

    markProjectCalculationsStale(ctx.projectId);
    recordAudit({ entityType: 'AllowanceAssignment', entityId: scopeType + ':' + scopeId, action: 'UPDATE', entityName: 'تخصیص الونس — ' + CONST.ALLOWANCE_SCOPE_LABELS[scopeType] + ' «' + ctx.scopeLabel + '»', after: { ops: ops }, projectId: ctx.projectId });
    commit();
    return getScopeAllowances(scopeType, scopeId);
  }

  /** resolve برای تحلیل — سطح فعالیت + هر عنصر (§۳) */
  function resolveForActivity(activityId) {
    var activity = byId('activities', activityId);
    if (!activity) throw new Error('فعالیت یافت نشد.');
    var station = byId('stations', activity.stationId);
    var project = byId('projects', station.projectId);
    var context = loadProjectAllowanceContext(project.id);
    var pl = { type: 'PROJECT', id: project.id, label: project.name };
    var sl = { type: 'STATION', id: station.id, label: station.name };
    var al = { type: 'ACTIVITY', id: activity.id, label: activity.name };
    var activityResolution = F.resolveEffectiveAllowances({ definitions: context.definitions, assignments: context.assignments, chain: [pl, sl, al] });
    var elements = {};
    sortElements(activityId).forEach(function (el) {
      elements[el.id] = F.resolveEffectiveAllowances({ definitions: context.definitions, assignments: context.assignments, chain: [pl, sl, al, { type: 'WORK_ELEMENT', id: el.id, label: el.name }] });
    });
    return { projectId: project.id, method: context.method, methodLabel: CONST.ALLOWANCE_METHOD_LABELS[context.method], formula: CONST.ALLOWANCE_METHOD_FORMULAS[context.method], activity: activityResolution, elements: elements };
  }

  /**
   * مهاجرت مدل قدیمی → سلسله‌مراتبی (§۴) — قابل تکرار با مارکر.
   * s اختیاری است (برای migration در load قبل از انتساب state).
   */
  function migrateProjectAllowancesIfNeeded(projectId, s) {
    var store = s || state;
    if (!store) return { projectId: projectId, migrated: false };
    var marker = (store.projectSettings || []).find(function (x) { return x.projectId === projectId && x.key === MIGRATION_MARKER_KEY; });
    if (marker && marker.value === MIGRATION_MARKER_VALUE) {
      return { projectId: projectId, migrated: false, definitionsCreated: 0, assignmentsCreated: 0, issues: [] };
    }
    var issues = [];
    var definitionsCreated = 0, assignmentsCreated = 0, skippedInactive = 0;
    var categories = (store.allowanceCategories || []).filter(function (c) { return c.projectId === projectId; });
    var activities = (store.activities || []).filter(function (a) { return projectIdOfActivityIn(a, store) === projectId; });

    // ۱. دسته‌ها → تعریف مرکزی (حفظ ID — §۴.۱.۳)
    categories.forEach(function (cat) {
      var exists = (store.allowanceDefinitions || []).some(function (d) { return d.id === cat.id; });
      if (exists) return;
      store.allowanceDefinitions.push({
        id: cat.id, projectId: projectId, title: cat.name, code: cat.code || null, description: null,
        defaultValueType: null, defaultValuePercent: null, defaultTimeSeconds: null,
        isActive: cat.isActive, sortOrder: cat.sortOrder, isArchived: false,
        createdAt: cat.createdAt || U.nowISO(), updatedAt: U.nowISO(),
      });
      definitionsCreated++;
    });

    // ۲. مقدار مؤثر قدیم فعالیت‌ها → تخصیص ACTIVITY (§۴.۱.۵/۶)
    activities.forEach(function (activity) {
      var group = activity.groupId ? (store.activityGroups || []).find(function (x) { return x.id === activity.groupId; }) : null;
      var gas = group ? (store.groupAllowances || []).filter(function (x) { return x.groupId === group.id; }) : [];
      var ovs = (store.activityAllowanceOverrides || []).filter(function (x) { return x.activityId === activity.id; });
      categories.forEach(function (cat) {
        if (!cat.isActive) {
          if (gas.some(function (x) { return x.categoryId === cat.id; }) || ovs.some(function (x) { return x.categoryId === cat.id; })) skippedInactive++;
          return;
        }
        var gv = gas.find(function (x) { return x.categoryId === cat.id; });
        var ov = ovs.find(function (x) { return x.categoryId === cat.id; });
        var effective = ov ? ov.percentValue : (gv ? gv.percentValue : null);
        if (effective === null || effective === undefined) return;
        var exists = (store.allowanceAssignments || []).some(function (x) { return x.definitionId === cat.id && x.scopeType === 'ACTIVITY' && x.scopeId === activity.id; });
        if (exists) return; // اجرای مجدد داده را دوبرابر نمی‌کند (§۱۰.۳)
        store.allowanceAssignments.push({
          id: U.uid(), definitionId: cat.id, scopeType: 'ACTIVITY', scopeId: activity.id,
          mode: 'ACTIVE', valueType: 'PERCENT', percentValue: effective, timeValueSeconds: null, applicationBasis: null,
          createdAt: U.nowISO(), updatedAt: U.nowISO(),
        });
        assignmentsCreated++;
      });
    });

    // ۳. مارکر — تکرارپذیری
    var existingMarker = (store.projectSettings || []).find(function (x) { return x.projectId === projectId && x.key === MIGRATION_MARKER_KEY; });
    if (existingMarker) { existingMarker.value = MIGRATION_MARKER_VALUE; touch(existingMarker); }
    else (store.projectSettings || []).push({ id: U.uid(), projectId: projectId, key: MIGRATION_MARKER_KEY, value: MIGRATION_MARKER_VALUE, version: 1, updatedAt: U.nowISO() });

    if (skippedInactive > 0) issues.push(skippedInactive + ' مقدار متنعلق به دسته غیرفعال نادیده گرفته شد (مطابق قاعده قدیمی).');
    if (definitionsCreated > 0 || assignmentsCreated > 0) {
      (store.auditEvents || []).push({
        id: U.uid(), entityType: 'Project', entityId: projectId, action: 'UPDATE',
        entityName: 'مهاجرت الونس‌ها به مدل سلسله‌مراتبی',
        afterJson: JSON.stringify({ definitionsCreated: definitionsCreated, assignmentsCreated: assignmentsCreated }),
        projectId: projectId, actor: 'کاربر محلی', occurredAt: U.nowISO(),
      });
    }
    return { projectId: projectId, migrated: true, definitionsCreated: definitionsCreated, assignmentsCreated: assignmentsCreated, skippedInactive: skippedInactive, issues: issues };
  }
  function projectIdOfActivityIn(a, store) {
    var st = (store.stations || []).find(function (x) { return x.id === a.stationId; });
    return st ? st.projectId : null;
  }

  // ═══════════ وستینگهاوس ═══════════
  var SEED_GRADES = [
    { factor: 'SKILL', gradeCode: 'A1', label: 'عالی‌تر', value: 0.15, sortOrder: 1, hint: 'تسلط کامل و روان؛ حرکات دقیق، پیوسته و بدون مکث' },
    { factor: 'SKILL', gradeCode: 'A2', label: 'عالی', value: 0.13, sortOrder: 2, hint: 'تسلط بالا؛ هماهنگی عالی دست و چشم با توقف ناچیز' },
    { factor: 'SKILL', gradeCode: 'B1', label: 'خوب‌تر', value: 0.11, sortOrder: 3, hint: 'مهارت خوب؛ حرکات روان با مکث‌های گاه‌به‌گاه' },
    { factor: 'SKILL', gradeCode: 'B2', label: 'خوب', value: 0.08, sortOrder: 4, hint: 'مهارت قابل اتکا؛ روش کار منظم و پیوسته' },
    { factor: 'SKILL', gradeCode: 'C1', label: 'متوسط رو به بالا', value: 0.06, sortOrder: 5, hint: 'بالاتر از متوسط؛ با کمی تردید در حرکات' },
    { factor: 'SKILL', gradeCode: 'C2', label: 'متوسط', value: 0.03, sortOrder: 6, hint: 'مهارت متوسط؛ گاهی دقت و هماهنگی کم می‌شود' },
    { factor: 'SKILL', gradeCode: 'D', label: 'قابل قبول (مرجع)', value: 0.0, sortOrder: 7, hint: 'سطح مرجع ارزیابی؛ عملکرد معمول انتظارشده' },
    { factor: 'SKILL', gradeCode: 'E1', label: 'ضعیف‌تر', value: -0.05, sortOrder: 8, hint: 'کمی ضعیف‌تر از قابل قبول؛ مکث و تردید محسوس' },
    { factor: 'SKILL', gradeCode: 'E2', label: 'ضعیف', value: -0.1, sortOrder: 9, hint: 'مهارت ضعیف؛ حرکات ناهماهنگ و مکرر' },
    { factor: 'SKILL', gradeCode: 'F1', label: 'بسیار ضعیف‌تر', value: -0.16, sortOrder: 10, hint: 'آشنا با کار اما ناتوان در اجرای روان' },
    { factor: 'SKILL', gradeCode: 'F2', label: 'بسیار ضعیف', value: -0.22, sortOrder: 11, hint: 'ناآشنا با کار؛ حرکات بسیار ناکارآمد' },
    { factor: 'EFFORT', gradeCode: 'A1', label: 'کوشش فوق‌العاده', value: 0.13, sortOrder: 1, hint: 'تمرکز و سرعت بی‌وقفه در کل چرخه' },
    { factor: 'EFFORT', gradeCode: 'A2', label: 'کوشش بسیار زیاد', value: 0.12, sortOrder: 2, hint: 'مصمم و پرانگیزه با حداقل وقفه' },
    { factor: 'EFFORT', gradeCode: 'B1', label: 'کوشش زیاد', value: 0.1, sortOrder: 3, hint: 'از متوسط بیشتر؛ ریتم پایدار و هدفمند' },
    { factor: 'EFFORT', gradeCode: 'B2', label: 'کوشش خوب', value: 0.08, sortOrder: 4, hint: 'علاقه و توجه مشخص به کار' },
    { factor: 'EFFORT', gradeCode: 'C1', label: 'کوشش متوسط رو به بالا', value: 0.05, sortOrder: 5, hint: 'کمی بیش از متوسط' },
    { factor: 'EFFORT', gradeCode: 'C2', label: 'کوشش متوسط', value: 0.02, sortOrder: 6, hint: 'حالت معمول و روان کار' },
    { factor: 'EFFORT', gradeCode: 'D', label: 'قابل قبول (مرجع)', value: 0.0, sortOrder: 7, hint: 'سطح مرجع ارزیابی تلاش' },
    { factor: 'EFFORT', gradeCode: 'E1', label: 'کوشش کم', value: -0.04, sortOrder: 8, hint: 'بی‌میلی محسوس و کندی گاه‌به‌گاه' },
    { factor: 'EFFORT', gradeCode: 'E2', label: 'کوشش بسیار کم', value: -0.08, sortOrder: 9, hint: 'کند و بی‌انگیزه؛ وقفه‌های مکرر' },
    { factor: 'EFFORT', gradeCode: 'F1', label: 'کوشش ناچیز', value: -0.12, sortOrder: 10, hint: 'بی‌توجه به پیشرفت کار' },
    { factor: 'EFFORT', gradeCode: 'F2', label: 'بی‌انگیزه', value: -0.17, sortOrder: 11, hint: 'مقاومت آشکار در برابر کار' },
    { factor: 'CONDITIONS', gradeCode: 'A', label: 'ایده‌آل', value: 0.06, sortOrder: 1, hint: 'شرایط کاری ممتاز؛ روشنایی، دما و نظم عالی' },
    { factor: 'CONDITIONS', gradeCode: 'B', label: 'خوب', value: 0.04, sortOrder: 2, hint: 'شرایط مطلوب و راحت برای کار' },
    { factor: 'CONDITIONS', gradeCode: 'C', label: 'متوسط', value: 0.02, sortOrder: 3, hint: 'قابل تحمل؛ کمی بهتر از معمول' },
    { factor: 'CONDITIONS', gradeCode: 'D', label: 'قابل قبول (مرجع)', value: 0.0, sortOrder: 4, hint: 'سطح مرجع ارزیابی شرایط' },
    { factor: 'CONDITIONS', gradeCode: 'E', label: 'ضعیف', value: -0.03, sortOrder: 5, hint: 'عوامل مزاحم (سر و صدا، دما، نور ناکافی)' },
    { factor: 'CONDITIONS', gradeCode: 'F', label: 'بسیار ضعیف', value: -0.07, sortOrder: 6, hint: 'شرایط نامطلوب و خسته‌کننده؛ اثر محسوس بر عملکرد' },
    { factor: 'CONSISTENCY', gradeCode: 'A', label: 'کاملاً یکنواخت', value: 0.04, sortOrder: 1, hint: 'ریتم کار بدون تغییر محسوس در تمام چرخه‌ها' },
    { factor: 'CONSISTENCY', gradeCode: 'B', label: 'یکنواخت', value: 0.03, sortOrder: 2, hint: 'تغییرات بسیار جزئی بین چرخه‌ها' },
    { factor: 'CONSISTENCY', gradeCode: 'C', label: 'تقریباً یکنواخت', value: 0.01, sortOrder: 3, hint: 'پراکندگی کم در زمان‌های تکراری' },
    { factor: 'CONSISTENCY', gradeCode: 'D', label: 'قابل قبول (مرجع)', value: 0.0, sortOrder: 4, hint: 'سطح مرجع ارزیابی یکنواختی' },
    { factor: 'CONSISTENCY', gradeCode: 'E', label: 'ناپایدار', value: -0.02, sortOrder: 5, hint: 'نوسان قابل مشاهده در زمان‌ها؛ نیازمند بازبینی' },
    { factor: 'CONSISTENCY', gradeCode: 'F', label: 'بسیار ناپایدار', value: -0.04, sortOrder: 6, hint: 'نوسان شدید؛ احتمال داده غیرعادی یا نیاز به آموزش' },
  ];
  var SEED_META = {
    name: 'جدول وستینگهاوس — نسخه مرجع اولیه',
    source: 'نسخه رایج از نظام Westinghouse (در بازنشرهای آموزشی؛ در یکی از منابع به Lowry, Maynard & Stegemerten, 1940, p.233 نسبت داده شده). این نسخه صرفاً نقطه شروع است و استاندارد جهان‌شمول یا رویه مصوب شرکت نیست؛ پیش از استفاده عملی توسط کارشناس تأیید شود.',
    notes: 'Seed اولیه نرم‌افزار. مقادیر و برچسب‌ها قابل ویرایش است؛ هر تغییر باید با «ذخیره نسخه جدید» ثبت شود تا محاسبات تاریخی بی‌صدا تغییر نکند.',
  };

  function getOrCreateSeedTable(projectId) {
    var existing = filterBy('ratingTables', 'projectId', projectId);
    if (existing.length > 0) return existing[0];
    var t = {
      id: U.uid(), projectId: projectId, name: SEED_META.name, version: 1,
      source: SEED_META.source, notes: SEED_META.notes, isDefault: true,
      createdAt: U.nowISO(), updatedAt: U.nowISO(),
    };
    state.ratingTables.push(t);
    SEED_GRADES.forEach(function (gr) {
      state.ratingTableGrades.push({ id: U.uid(), ratingTableId: t.id, factor: gr.factor, gradeCode: gr.gradeCode, label: gr.label, value: gr.value, hint: gr.hint, sortOrder: gr.sortOrder });
    });
    commit();
    return t;
  }
  function listRatingTables(projectId) {
    return filterBy('ratingTables', 'projectId', projectId).sort(function (a, b) { return a.version - b.version; }).map(function (t) {
      return {
        table: t,
        grades: filterBy('ratingTableGrades', 'ratingTableId', t.id).sort(function (a, b) { return (a.factor === b.factor ? a.sortOrder - b.sortOrder : CONST.RATING_FACTORS.indexOf(a.factor) - CONST.RATING_FACTORS.indexOf(b.factor)); }),
        assessmentsCount: state.ratingAssessments.filter(function (r) { return r.ratingTableId === t.id; }).length,
      };
    });
  }
  function createRatingTableVersion(tableId) {
    var src = byId('ratingTables', tableId);
    if (!src) throw new Error('جدول ارزیابی یافت نشد.');
    var maxV = Math.max.apply(null, filterBy('ratingTables', 'projectId', src.projectId).map(function (t) { return t.version; }));
    var t = {
      id: U.uid(), projectId: src.projectId, name: src.name, version: maxV + 1,
      source: src.source, notes: src.notes, isDefault: true,
      createdAt: U.nowISO(), updatedAt: U.nowISO(),
    };
    state.ratingTables.push(t);
    filterBy('ratingTableGrades', 'ratingTableId', tableId).forEach(function (gr) {
      state.ratingTableGrades.push(Object.assign({}, gr, { id: U.uid(), ratingTableId: t.id }));
    });
    filterBy('ratingTables', 'projectId', src.projectId).forEach(function (x) { if (x.id !== t.id) { x.isDefault = false; touch(x); } });
    recordAudit({ entityType: 'RatingTable', entityId: t.id, action: 'CREATE', entityName: t.name + ' — نسخه ' + t.version, projectId: src.projectId });
    commit();
    return t;
  }
  function updateRatingTableMeta(id, patch) {
    var t = byId('ratingTables', id);
    if (!t) throw new Error('جدول ارزیابی یافت نشد.');
    if (patch.name !== undefined) t.name = patch.name;
    if (patch.source !== undefined) t.source = patch.source;
    if (patch.notes !== undefined) t.notes = patch.notes;
    if (patch.isDefault === true) {
      filterBy('ratingTables', 'projectId', t.projectId).forEach(function (x) { x.isDefault = x.id === id; touch(x); });
    }
    touch(t);
    commit();
  }
  function updateRatingTableGrade(gradeId, patch) {
    var gr = byId('ratingTableGrades', gradeId);
    if (!gr) throw new Error('درجه یافت نشد.');
    if (patch.label !== undefined) gr.label = patch.label;
    if (patch.value !== undefined) gr.value = Math.max(-0.5, Math.min(0.5, patch.value));
    if (patch.hint !== undefined) gr.hint = patch.hint;
    commit();
  }
  function deleteRatingTable(id) {
    var t = byId('ratingTables', id);
    if (!t) throw new Error('جدول ارزیابی یافت نشد.');
    var inUse = state.ratingAssessments.filter(function (r) { return r.ratingTableId === id; }).length;
    if (inUse > 0) {
      throw new Error('این جدول توسط ' + inUse + ' ارزیابی در حال استفاده است؛ حذف آن ممنوع می‌شود تا سابقه محاسباتی حفظ شود.');
    }
    state.ratingTableGrades = state.ratingTableGrades.filter(function (gr) { return gr.ratingTableId !== id; });
    state.ratingTables = state.ratingTables.filter(function (x) { return x.id !== id; });
    if (t.isDefault) {
      var remaining = filterBy('ratingTables', 'projectId', t.projectId).sort(function (a, b) { return b.version - a.version; });
      if (remaining.length > 0) { remaining[0].isDefault = true; touch(remaining[0]); }
    }
    markDeleted('RatingTable', [id]);
    recordAudit({ entityType: 'RatingTable', entityId: id, action: 'DELETE', entityName: t.name, projectId: t.projectId });
    commit();
    return { 'ارزیابی ارجاع‌دار به این جدول': inUse };
  }
  function getElementRating(elementId) {
    var ra = state.ratingAssessments.find(function (r) { return r.workElementId === elementId; });
    if (!ra) return null;
    var t = byId('ratingTables', ra.ratingTableId);
    return { assessment: ra, table: t || null };
  }
  function saveElementRating(elementId, input) {
    var e = byId('workElements', elementId);
    if (!e) throw new Error('عنصر کاری یافت نشد.');
    var t = byId('ratingTables', input.ratingTableId);
    if (!t) throw new Error('جدول ارزیابی یافت نشد.');
    var grades = filterBy('ratingTableGrades', 'ratingTableId', t.id);
    function valFor(factor, code) {
      if (!code) return 0;
      var gr = grades.find(function (x) { return x.factor === factor && x.gradeCode === code; });
      if (!gr) throw new Error('درجه انتخاب‌شده برای ' + CONST.RATING_FACTOR_LABELS[factor] + ' در جدول فعلی وجود ندارد؛ درجه را مجدداً انتخاب کنید یا جدول را عوض کنید.');
      return gr.value;
    }
    var vals = {
      skill: valFor('SKILL', input.skillGrade || null),
      effort: valFor('EFFORT', input.effortGrade || null),
      conditions: valFor('CONDITIONS', input.conditionsGrade || null),
      consistency: valFor('CONSISTENCY', input.consistencyGrade || null),
    };
    var totalFactor = F.computeRatingFactor(vals);
    var existing = state.ratingAssessments.find(function (r) { return r.workElementId === elementId; });
    if (existing) {
      Object.assign(existing, {
        ratingTableId: t.id,
        skillGrade: input.skillGrade || null, effortGrade: input.effortGrade || null,
        conditionsGrade: input.conditionsGrade || null, consistencyGrade: input.consistencyGrade || null,
        skillValue: vals.skill, effortValue: vals.effort, conditionsValue: vals.conditions, consistencyValue: vals.consistency,
        totalFactor: totalFactor, notes: input.notes !== undefined ? input.notes : existing.notes,
      });
      touch(existing);
    } else {
      state.ratingAssessments.push({
        id: U.uid(), workElementId: elementId, ratingTableId: t.id,
        skillGrade: input.skillGrade || null, effortGrade: input.effortGrade || null,
        conditionsGrade: input.conditionsGrade || null, consistencyGrade: input.consistencyGrade || null,
        skillValue: vals.skill, effortValue: vals.effort, conditionsValue: vals.conditions, consistencyValue: vals.consistency,
        totalFactor: totalFactor, notes: input.notes || null,
        createdAt: U.nowISO(), updatedAt: U.nowISO(),
      });
    }
    markProjectCalculationsStale(projectIdOfActivity(e.activityId));
    recordAudit({ entityType: 'RatingAssessment', entityId: elementId, action: 'CREATE', entityName: e.name, after: { totalFactor: totalFactor, table: t.name }, projectId: projectIdOfActivity(e.activityId) });
    commit();
    return totalFactor;
  }
  function deleteElementRating(elementId) {
    state.ratingAssessments = state.ratingAssessments.filter(function (r) { return r.workElementId !== elementId; });
    var e = byId('workElements', elementId);
    if (e) markProjectCalculationsStale(projectIdOfActivity(e.activityId));
    commit();
  }
  function getRatingMatrix(projectId) {
    var els = [];
    activitiesOfProject(projectId).forEach(function (a) {
      sortElements(a.id).forEach(function (e) { els.push({ element: e, activity: a }); });
    });
    return els.map(function (x) {
      var r = getElementRating(x.element.id);
      return {
        element: x.element, activity: x.activity,
        rated: !!r, totalFactor: r ? r.assessment.totalFactor : null,
        tableName: r && r.table ? r.table.name : null, tableVersion: r && r.table ? r.table.version : null,
      };
    });
  }

  // ═══════════ زمان‌سنجی ═══════════
  function listSessions(activityId) {
    return filterBy('studySessions', 'activityId', activityId).sort(function (a, b) { return a.startedAt < b.startedAt ? -1 : 1; });
  }
  function createSession(activityId, input) {
    var a = byId('activities', activityId);
    if (!a) throw new Error('فعالیت یافت نشد.');
    if (!input.operatorId) throw new Error('ابتدا اپراتور را انتخاب کنید.');
    var s = {
      id: U.uid(), activityId: activityId, operatorId: input.operatorId,
      timingMethod: input.timingMethod, status: 'OPEN', notes: input.notes || null,
      startedAt: U.nowISO(), endedAt: null, updatedAt: U.nowISO(),
    };
    state.studySessions.push(s);
    recordAudit({ entityType: 'StudySession', entityId: s.id, action: 'CREATE', entityName: 'جلسه زمان‌سنجی', after: { timingMethod: s.timingMethod }, projectId: projectIdOfActivity(activityId) });
    commit();
    return s;
  }
  function updateSession(id, patch) {
    var s = byId('studySessions', id);
    if (!s) throw new Error('جلسه یافت نشد.');
    if (patch.notes !== undefined) s.notes = patch.notes;
    touch(s);
    commit();
  }
  function closeSession(id) { var s = byId('studySessions', id); if (s) { s.status = 'CLOSED'; s.endedAt = U.nowISO(); touch(s); commit(); } }
  function reopenSession(id) { var s = byId('studySessions', id); if (s) { s.status = 'OPEN'; s.endedAt = null; touch(s); commit(); } }
  function deleteSession(id) {
    var s = byId('studySessions', id);
    if (!s) throw new Error('جلسه یافت نشد.');
    var cycles = filterBy('cycleObservations', 'sessionId', id);
    var deps = { 'چرخه‌های ثبت‌شده': cycles.length };
    cascadeDelete([id]);
    markDeleted('StudySession', [id]);
    markProjectCalculationsStale(projectIdOfActivity(s.activityId));
    recordAudit({ entityType: 'StudySession', entityId: id, action: 'DELETE', entityName: 'جلسه زمان‌سنجی', projectId: projectIdOfActivity(s.activityId) });
    commit();
    return deps;
  }

  function obsOfCycle(cycleId) { return filterBy('elementObservations', 'cycleId', cycleId); }
  function cyclesOfSession(sessionId) {
    return filterBy('cycleObservations', 'sessionId', sessionId).sort(function (a, b) { return a.cycleNo - b.cycleNo; });
  }

  // v1.5.0 §۳.۲ — پیش‌فرض‌های فنی مستقل از نوع عنصر (elementType فقط legacy برای مهاجرت)
  function defaultEntryFor(el) { return (el && el.defaultEntryMode === 'INT') ? 'INT' : 'SEQ'; }
  function laneTypeForElement(el) { return (el && el.defaultLaneType === 'MACHINE') ? 'MACHINE' : 'OPERATOR'; }
  function getOrCreateLane(cycleId, laneType) {
    var existing = state.timelineLanes.find(function (l) { return l.cycleId === cycleId && l.laneType === laneType; });
    if (existing) return existing.id;
    var lane = { id: U.uid(), cycleId: cycleId, laneType: laneType, label: laneType === 'OPERATOR' ? 'خط زمانی اپراتور' : 'خط زمانی ماشین' };
    state.timelineLanes.push(lane);
    return lane.id;
  }

  function computeCycleIndicators(observations, elementIds) {
    var byElement = {};
    observations.forEach(function (o) { byElement[o.workElementId] = o; });
    var fullIntervals = observations.filter(function (o) { return o.startOffset !== null && o.endOffset !== null; });
    var seqObs = observations.filter(function (o) { return o.rawDuration !== null || o.cumulativeReading !== null; });
    var elapsed = null, elapsedExcludesSequential = false;
    if (fullIntervals.length > 0) {
      var earliest = Math.min.apply(null, fullIntervals.map(function (o) { return o.startOffset; }));
      var latest = Math.max.apply(null, fullIntervals.map(function (o) { return o.endOffset; }));
      elapsed = F.round12(latest - earliest);
      elapsedExcludesSequential = seqObs.length > 0;
    } else if (seqObs.length > 0) {
      elapsed = F.round12(seqObs.reduce(function (s, o) { return s + (o.derivedDuration || 0); }, 0));
    }
    var hasIncompleteInterval = observations.some(function (o) { return (o.startOffset !== null) !== (o.endOffset !== null); });
    var hasExcluded = observations.some(function (o) { return o.validityStatus === 'EXCLUDED'; });
    var hasSuspect = observations.some(function (o) { return o.validityStatus === 'SUSPECT'; });
    var hasInvalid = observations.some(function (o) { return o.validityStatus === 'INVALID'; });
    var complete = elementIds.length > 0 && elementIds.every(function (eid) {
      var o = byElement[eid];
      return o !== undefined && o.derivedDuration !== null;
    });
    var isValidCycle = complete && !hasExcluded && !hasInvalid;
    return { elapsed: elapsed, elapsedExcludesSequential: elapsedExcludesSequential, hasExcluded: hasExcluded, hasSuspect: hasSuspect, hasInvalid: hasInvalid, hasIncompleteInterval: hasIncompleteInterval, complete: complete, isValidCycle: isValidCycle };
  }

  function recomputeSession(sessionId) {
    var session = byId('studySessions', sessionId);
    if (!session) throw new Error('جلسه زمان‌سنجی یافت نشد.');
    var elements = sortElements(session.activityId);
    var elementIds = elements.map(function (e) { return e.id; });
    var cycles = cyclesOfSession(sessionId);

    cycles.forEach(function (cycle) {
      obsOfCycle(cycle.id).forEach(function (o) {
        if (o.startOffset !== null && o.endOffset !== null) {
          var err = F.intervalError({ startOffset: o.startOffset, endOffset: o.endOffset });
          if (err) throw new Error('چرخه ' + cycle.cycleNo + ': ' + err);
          var derived = F.round12(o.endOffset - o.startOffset);
          if (o.derivedDuration !== derived) o.derivedDuration = derived;
        } else if (o.derivedDuration !== null && o.rawDuration === null && o.cumulativeReading === null) {
          o.derivedDuration = null;
        }
      });
    });

    if (session.timingMethod === 'CONTINUOUS') {
      var seq = [];
      cycles.forEach(function (cycle) {
        obsOfCycle(cycle.id).forEach(function (o) {
          if (o.cumulativeReading !== null) {
            var el = byId('workElements', o.workElementId);
            seq.push({ o: o, cycleNo: cycle.cycleNo, elSort: el ? el.sortOrder : 0 });
          }
        });
      });
      seq.sort(function (a, b) { return a.cycleNo !== b.cycleNo ? a.cycleNo - b.cycleNo : a.elSort - b.elSort; });
      var prev = 0;
      for (var i = 0; i < seq.length; i++) {
        var reading = seq[i].o.cumulativeReading;
        if (reading < prev) {
          throw new Error('قرائت تجمعی در چرخه ' + seq[i].cycleNo + ' از قرائت قبلی (' + prev + ') کمتر است (' + reading + ')؛ قرائت نزولی مجاز نیست. برای شروع مجدد، جلسه جدید ایجاد کنید.');
        }
        seq[i].o.derivedDuration = F.round12(reading - prev);
        prev = reading;
      }
    } else {
      /* v1.5.0: مشاهدهٔ دارای بازهٔ کامل، مدتش از بازه است؛ خام آن را بازنویسی نمی‌کند */
      cycles.forEach(function (cycle) {
        obsOfCycle(cycle.id).forEach(function (o) {
          if (o.startOffset !== null && o.endOffset !== null) return;
          if (o.rawDuration !== null && o.derivedDuration !== o.rawDuration) o.derivedDuration = o.rawDuration;
        });
      });
    }

    cycles.forEach(function (cycle) {
      var ind = computeCycleIndicators(obsOfCycle(cycle.id), elementIds);
      cycle.isComplete = ind.complete;
      touch(cycle);
    });
    return cycles;
  }

  function addCycles(sessionId, count) {
    var session = byId('studySessions', sessionId);
    if (!session) throw new Error('جلسه یافت نشد.');
    if (session.status !== 'OPEN') throw new Error('جلسه بسته است؛ برای ثبت داده، جلسهٔ جدید ایجاد کنید.');
    var existing = cyclesOfSession(sessionId);
    var nextNo = existing.length ? Math.max.apply(null, existing.map(function (c) { return c.cycleNo; })) + 1 : 1;
    var created = 0;
    for (var i = 0; i < count; i++) {
      state.cycleObservations.push({ id: U.uid(), sessionId: sessionId, cycleNo: nextNo + i, notes: null, isComplete: false, overlapRevision: 0, createdAt: U.nowISO(), updatedAt: U.nowISO() });
      created++;
    }
    commit();
    return created;
  }
  function deleteCycle(cycleId) {
    var c = byId('cycleObservations', cycleId);
    if (!c) throw new Error('چرخه یافت نشد.');
    cascadeDelete([cycleId]);
    commit();
    return c.cycleNo;
  }
  function updateCycleNotes(cycleId, notes) {
    var c = byId('cycleObservations', cycleId);
    if (!c) throw new Error('چرخه یافت نشد.');
    c.notes = notes || null;
    touch(c);
    commit();
  }

  function putCells(sessionId, cells) {
    var session = byId('studySessions', sessionId);
    if (!session) throw new Error('جلسه یافت نشد.');
    if (session.status !== 'OPEN') throw new Error('جلسه بسته است؛ برای ثبت داده، جلسهٔ جدید ایجاد کنید.');
    var cyclesByNo = {};
    cyclesOfSession(sessionId).forEach(function (c) { cyclesByNo[c.cycleNo] = c; });
    var touchedElements = {};
    cells.forEach(function (cell) {
      var cycle = cell.cycleId ? byId('cycleObservations', cell.cycleId) : cyclesByNo[cell.cycleNo];
      if (!cycle) throw new Error('چرخه یافت نشد.');
      var element = byId('workElements', cell.workElementId);
      if (!element) throw new Error('عنصر کاری یافت نشد.');
      var obs = obsOfCycle(cycle.id).find(function (o) { return o.workElementId === cell.workElementId; });
      var merged = {
        rawDuration: cell.rawDuration !== undefined ? cell.rawDuration : (obs ? obs.rawDuration : null),
        cumulativeReading: cell.cumulativeReading !== undefined ? cell.cumulativeReading : (obs ? obs.cumulativeReading : null),
        startOffset: cell.startOffset !== undefined ? cell.startOffset : (obs ? obs.startOffset : null),
        endOffset: cell.endOffset !== undefined ? cell.endOffset : (obs ? obs.endOffset : null),
      };
      var willHaveInterval = merged.startOffset !== null || merged.endOffset !== null;
      var willHaveReading = merged.cumulativeReading !== null;
      var laneId = null;
      var noDataAtAll = merged.rawDuration === null && merged.cumulativeReading === null && merged.startOffset === null && merged.endOffset === null;
      if (!noDataAtAll) {
        if (willHaveInterval) laneId = getOrCreateLane(cycle.id, laneTypeForElement(element));
        else if (willHaveReading && session.timingMethod === 'CONTINUOUS') laneId = getOrCreateLane(cycle.id, 'OPERATOR');
      }
      if (!obs) {
        var hasAny = merged.rawDuration !== null || merged.cumulativeReading !== null || merged.startOffset !== null || merged.endOffset !== null;
        if (!hasAny) return;
        obs = {
          id: U.uid(), cycleId: cycle.id, workElementId: cell.workElementId, laneId: laneId,
          rawDuration: merged.rawDuration, cumulativeReading: merged.cumulativeReading,
          startOffset: merged.startOffset, endOffset: merged.endOffset,
          derivedDuration: null, validityStatus: 'VALID', isUserExcluded: false,
          exclusionReason: null, outlierScore: null, outlierRule: null, updatedAt: U.nowISO(),
        };
        state.elementObservations.push(obs);
      } else {
        obs.rawDuration = merged.rawDuration;
        obs.cumulativeReading = merged.cumulativeReading;
        obs.startOffset = merged.startOffset;
        obs.endOffset = merged.endOffset;
        obs.laneId = laneId;
        if (obs.validityStatus === 'SUSPECT') { obs.validityStatus = 'VALID'; obs.outlierScore = null; obs.outlierRule = null; }
        if (obs.validityStatus === 'INVALID') obs.validityStatus = 'VALID';
        touch(obs);
      }
      touchedElements[cell.workElementId] = true;
    });
    recomputeSession(sessionId);
    Object.keys(touchedElements).forEach(function (eid) { refreshOutliersForElement(eid, { silent: true }); });
    markProjectCalculationsStale(projectIdOfActivity(session.activityId));
    commit();
  }

  function setObservationValidity(observationId, action, reason) {
    var o = byId('elementObservations', observationId);
    if (!o) throw new Error('مشاهده یافت نشد.');
    var cycle = byId('cycleObservations', o.cycleId);
    var session = cycle ? byId('studySessions', cycle.sessionId) : null;
    if (action === 'EXCLUDE') {
      o.validityStatus = 'EXCLUDED';
      o.isUserExcluded = true;
      o.exclusionReason = reason || null;
      touch(o);
    } else {
      o.validityStatus = 'VALID';
      o.isUserExcluded = false;
      o.exclusionReason = null;
      touch(o);
    }
    if (session) refreshOutliersForElement(o.workElementId, { silent: true });
    if (session) markProjectCalculationsStale(projectIdOfActivity(session.activityId));
    commit();
  }

  function getSheet(sessionId) {
    var session = byId('studySessions', sessionId);
    if (!session) throw new Error('جلسه یافت نشد.');
    var activity = byId('activities', session.activityId);
    var station = activity ? byId('stations', activity.stationId) : null;
    var operator = byId('operators', session.operatorId);
    var elements = sortElements(session.activityId);
    var elementIds = elements.map(function (e) { return e.id; });
    var cycles = cyclesOfSession(sessionId);

    // v1.5.0 §۱۰ — روابط موازی فعال میان عناصر همین Activity (batch) + مقادیر چرخه‌ها
    var projectId = station ? station.projectId : '';
    var elIdSet = {};
    elementIds.forEach(function (id) { elIdSet[id] = true; });
    var parallelRelations = state.overlapRelations
      .filter(function (r) { return r.isActive && r.projectId === projectId && elIdSet[r.elementLowId] && elIdSet[r.elementHighId]; })
      .map(function (r) {
        return {
          relationId: r.id, elementLowId: r.elementLowId, elementHighId: r.elementHighId,
          elementLowName: nameOfElement(r.elementLowId), elementHighName: nameOfElement(r.elementHighId),
          version: r.version || 1,
        };
      });
    var relIdSet = {};
    parallelRelations.forEach(function (r) { relIdSet[r.relationId] = true; });
    var cycleIdSet = {};
    cycles.forEach(function (c) { cycleIdSet[c.id] = true; });
    var overlapsByCycle = {};
    state.observationOverlaps.forEach(function (ov) {
      if (!cycleIdSet[ov.cycleId] || !relIdSet[ov.relationId]) return;
      if (!overlapsByCycle[ov.cycleId]) overlapsByCycle[ov.cycleId] = {};
      overlapsByCycle[ov.cycleId][ov.relationId] = { status: ov.status, overlapDuration: ov.overlapDuration, version: ov.version || 1 };
    });

    var perElement = {};
    elements.forEach(function (e) { perElement[e.id] = { calcCount: 0, excludedCount: 0, totalCount: 0 }; });
    var sessionValidCycles = 0;
    var cycleDtos = cycles.map(function (c) {
      var obs = obsOfCycle(c.id);
      var ind = computeCycleIndicators(obs, elementIds);
      if (ind.isValidCycle) sessionValidCycles++;
      var obsDtos = obs.map(function (o) {
        var lane = o.laneId ? byId('timelineLanes', o.laneId) : null;
        if (perElement[o.workElementId]) {
          perElement[o.workElementId].totalCount++;
          if (o.validityStatus === 'EXCLUDED') perElement[o.workElementId].excludedCount++;
          if ((o.validityStatus === 'VALID' || o.validityStatus === 'SUSPECT') && o.derivedDuration !== null) perElement[o.workElementId].calcCount++;
        }
        return {
          id: o.id, workElementId: o.workElementId, laneId: o.laneId, laneType: lane ? lane.laneType : null,
          rawDuration: o.rawDuration, cumulativeReading: o.cumulativeReading,
          startOffset: o.startOffset, endOffset: o.endOffset, derivedDuration: o.derivedDuration,
          validityStatus: o.validityStatus, isUserExcluded: o.isUserExcluded, exclusionReason: o.exclusionReason,
          outlierScore: o.outlierScore, outlierRule: o.outlierRule,
        };
      });
      return {
        id: c.id, cycleNo: c.cycleNo, notes: c.notes, isComplete: c.isComplete,
        createdAt: c.createdAt, updatedAt: c.updatedAt,
        elapsed: ind.elapsed, elapsedExcludesSequential: ind.elapsedExcludesSequential,
        hasExcluded: ind.hasExcluded, hasSuspect: ind.hasSuspect, hasIncompleteInterval: ind.hasIncompleteInterval,
        overlapRevision: c.overlapRevision || 0,
        overlaps: overlapsByCycle[c.id] || {},
        observations: obsDtos,
      };
    });

    var activityValidCycles = 0;
    filterBy('studySessions', 'activityId', session.activityId).forEach(function (se) {
      cyclesOfSession(se.id).forEach(function (c) {
        var obs = obsOfCycle(c.id);
        var ind = computeCycleIndicators(obs, elementIds);
        if (ind.isValidCycle) activityValidCycles++;
      });
    });

    return {
      session: {
        id: session.id, activityId: session.activityId, operatorId: session.operatorId,
        timingMethod: session.timingMethod, status: session.status, notes: session.notes,
        startedAt: session.startedAt, endedAt: session.endedAt, updatedAt: session.updatedAt,
      },
      activity: { id: activity.id, name: activity.name, stationName: station ? station.name : '', targetSampleCount: activity.targetSampleCount, projectId: station ? station.projectId : '' },
      operator: operator ? { id: operator.id, displayName: operator.displayName, code: operator.code } : { id: '', displayName: 'اپراتور حذف‌شده', code: null },
      elements: elements.map(function (e) { return { id: e.id, name: e.name, sortOrder: e.sortOrder, defaultEntry: defaultEntryFor(e), defaultLaneType: laneTypeForElement(e) }; }),
      parallelRelations: parallelRelations,
      cycles: cycleDtos,
      stats: {
        perElement: perElement, sessionCycles: cycles.length, sessionValidCycles: sessionValidCycles,
        activityValidCycles: activityValidCycles, targetSampleCount: activity.targetSampleCount,
      },
    };
  }

  function parseCellInput(raw) {
    var s = U.normalizeDigits(String(raw)).trim();
    if (s === '' || s === '-' || s === '—' || s === '–') return { kind: 'EMPTY' };
    var interval = /^([0-9]*\.?[0-9]+)\s*(?:-|\.\.|:|تا)\s*([0-9]*\.?[0-9]+)$/.exec(s);
    if (interval) {
      var st = Number(interval[1]), en = Number(interval[2]);
      if (!isFinite(st) || !isFinite(en)) return { kind: 'ERROR', message: 'عدد بازه معتبر نیست' };
      return { kind: 'INTERVAL', start: st, end: en };
    }
    var n = Number(s);
    if (!isFinite(n)) return { kind: 'ERROR', message: 'مقدار عددی معتبر نیست (ارقام فارسی یا لاتین)' };
    return { kind: 'NUMBER', value: n };
  }

  /** §۵.۲ — مدل ردیف‌های شبکهٔ برگه: عنصر + زیرردیف روابط فعال همان Activity */
  function sheetGridRows(sheet) {
    var rows = [];
    var indexOf = {};
    sheet.elements.forEach(function (e, i) { indexOf[e.id] = i; });
    sheet.elements.forEach(function (el) {
      rows.push({ kind: 'ELEMENT', elementId: el.id, elementIndex: indexOf[el.id], elementName: el.name });
      var rels = sheet.parallelRelations
        .filter(function (r) { return r.elementLowId === el.id || r.elementHighId === el.id; })
        .map(function (r) {
          var otherId = r.elementLowId === el.id ? r.elementHighId : r.elementLowId;
          var otherName = r.elementLowId === el.id ? r.elementHighName : r.elementLowName;
          return { r: r, otherId: otherId, otherName: otherName, otherSort: indexOf[otherId] !== undefined ? indexOf[otherId] : 9999 };
        })
        .sort(function (a, b) { return a.otherSort - b.otherSort; });
      rels.forEach(function (x) {
        rows.push({ kind: 'RELATION', elementId: el.id, relationId: x.r.relationId, otherElementId: x.otherId, elementName: el.name, otherElementName: x.otherName });
      });
    });
    return rows;
  }

  /** v1.5.0 §۸.۳ — Paste با محور جدید: ردیف داده = ردیف شبکه (عنصر/زیرردیف)، ستون داده = چرخه.
   *  لنگر بر اساس شناسهٔ ردیف و شمارهٔ چرخه است. زیرردیف: خالی→بدون تغییر، ۰→NO_OVERLAP، مثبت→OVERLAP. */
  function pastePreview(sessionId, anchor, text) {
    var sheet = getSheet(sessionId);
    var gridRows = sheetGridRows(sheet);
    var anchorIdx = -1;
    for (var i = 0; i < gridRows.length; i++) {
      var g = gridRows[i];
      if (anchor.relationId) {
        if (g.kind === 'RELATION' && g.relationId === anchor.relationId && g.elementId === anchor.elementId) { anchorIdx = i; break; }
      } else if (g.kind === 'ELEMENT' && g.elementId === anchor.elementId) { anchorIdx = i; break; }
    }
    if (anchorIdx < 0) throw new Error('ردیف مبدأ Paste معتبر نیست؛ عنصر یا رابطهٔ انتخاب‌شده در این فعالیت یافت نشد.');
    var startCycleNo = anchor.cycleNo;
    var lines = text.replace(/\r/g, '').split('\n').filter(function (l, i, arr) { return l.trim() !== '' || (i > 0 && i < arr.length - 1); });
    var maxCycle = sheet.cycles.length ? Math.max.apply(null, sheet.cycles.map(function (c) { return c.cycleNo; })) : 0;
    if (startCycleNo > maxCycle + 1) throw new Error('ستون مبدأ (چرخهٔ ' + startCycleNo + ') معتبر نیست؛ Paste باید از یک چرخهٔ موجود یا بلافاصله بعد از آخرین چرخه (' + maxCycle + ') شروع شود.');
    // شواهد هر چرخه برای مقایسه‌پذیری و بازهٔ واقعی زیرردیف‌ها
    var obsByNo = {};
    var cycleByNo = {};
    sheet.cycles.forEach(function (c) { obsByNo[c.cycleNo] = c.observations; cycleByNo[c.cycleNo] = c; });
    var relById = {};
    sheet.parallelRelations.forEach(function (r) { relById[r.relationId] = r; });

    var cells = [];
    var errors = 0, warnings = 0, healthy = 0, noChange = 0;
    var newCycleNos = {};
    for (var r = 0; r < lines.length; r++) {
      var cols = lines[r].split('\t');
      var grow = gridRows[anchorIdx + r] || null;
      for (var c = 0; c < cols.length; c++) {
        var cycNo = startCycleNo + c;
        if (cycNo > maxCycle) { if (!newCycleNos[cycNo]) { newCycleNos[cycNo] = true; } }
        var base = { row: r, colIndex: c, cycleNo: cycNo, isNew: cycNo > maxCycle, raw: cols[c], status: 'NO_CHANGE', message: null, value: null, interval: null, overlapStatus: null, overlapDuration: null, elementId: null, relationId: null, otherElementId: null };
        if (!grow) {
          base.status = 'ERROR'; base.message = 'ردیفی برای این داده وجود ندارد؛ تعداد ردیف‌های شبکه (عناصر و زیرردیف‌ها) کمتر است.'; errors++;
          cells.push(base); continue;
        }
        if (grow.kind === 'RELATION') {
          base.relationId = grow.relationId; base.elementId = grow.elementId; base.otherElementId = grow.otherElementId;
          var rel = relById[grow.relationId];
          var parsed = parseCellInput(cols[c]);
          if (parsed.kind === 'EMPTY') { base.status = 'NO_CHANGE'; base.message = 'خالی — بدون تغییر'; noChange++; }
          else if (parsed.kind === 'INTERVAL') { base.status = 'ERROR'; base.message = 'زیرردیف هم‌پوشانی فقط یک عدد می‌پذیرد: خالی، صفر یا مقدار مثبت.'; errors++; }
          else if (parsed.kind === 'ERROR') { base.status = 'ERROR'; base.message = parsed.message; errors++; }
          else if (parsed.value < 0) { base.status = 'ERROR'; base.message = 'مقدار هم‌پوشانی منفی مجاز نیست.'; errors++; }
          else if (cycNo > maxCycle) { base.status = 'ERROR'; base.message = 'چرخهٔ جدید هنوز مشاهده‌ای ندارد؛ ابتدا زمان عناصر را ثبت کنید.'; errors++; }
          else {
            var obsList = obsByNo[cycNo] || [];
            var byEl = {};
            obsList.forEach(function (o) { byEl[o.workElementId] = o; });
            var oLow = byEl[rel.elementLowId], oHigh = byEl[rel.elementHighId];
            var reasons = [];
            var nameLow = rel.elementLowName, nameHigh = rel.elementHighName;
            if (!oLow) reasons.push('«' + nameLow + '» در این چرخه مشاهده‌ای ندارد');
            else if (!((oLow.startOffset !== null && oLow.endOffset !== null) || (oLow.derivedDuration !== null || oLow.rawDuration !== null))) reasons.push('«' + nameLow + '» در این چرخه مدت یا بازهٔ قابل‌مقایسه ندارد');
            if (!oHigh) reasons.push('«' + nameHigh + '» در این چرخه مشاهده‌ای ندارد');
            else if (!((oHigh.startOffset !== null && oHigh.endOffset !== null) || (oHigh.derivedDuration !== null || oHigh.rawDuration !== null))) reasons.push('«' + nameHigh + '» در این چرخه مدت یا بازهٔ قابل‌مقایسه ندارد');
            if (reasons.length > 0) { base.status = 'ERROR'; base.message = 'در این چرخه قابل‌مقایسه نیست: ' + reasons.join('؛ '); errors++; }
            else {
              var computed = null;
              if (oLow && oHigh && oLow.startOffset !== null && oLow.endOffset !== null && oHigh.startOffset !== null && oHigh.endOffset !== null) {
                computed = Math.max(0, Math.min(oLow.endOffset, oHigh.endOffset) - Math.max(oLow.startOffset, oHigh.startOffset));
              }
              if (parsed.value === 0 && computed !== null && computed > 1e-9) {
                base.status = 'ERROR'; base.message = 'بازهٔ واقعی این چرخه هم‌پوشانی ' + computed + ' دارد؛ ثبت «بدون هم‌پوشانی» با بازهٔ واقعی نمی‌خواند.'; errors++;
              } else if (parsed.value > 0 && computed !== null && Math.abs(parsed.value - computed) > 1e-6) {
                base.status = 'ERROR'; base.message = 'مقدار واردشده (' + parsed.value + ') با هم‌پوشانی بازهٔ واقعی (' + computed + ') نمی‌خواند.'; errors++;
              } else {
                base.computedOverlap = computed;
                if (parsed.value === 0) { base.overlapStatus = 'NO_OVERLAP'; base.overlapDuration = 0; }
                else { base.overlapStatus = 'OVERLAP'; base.overlapDuration = parsed.value; }
                base.status = 'HEALTHY'; healthy++;
              }
            }
          }
          cells.push(base); continue;
        }
        // ردیف اصلی عنصر
        base.elementId = grow.elementId;
        var parsed2 = parseCellInput(cols[c]);
        if (parsed2.kind === 'ERROR') { base.status = 'ERROR'; base.message = parsed2.message; errors++; }
        else if (parsed2.kind === 'EMPTY') { base.status = 'NO_CHANGE'; base.message = 'خالی — بدون تغییر'; noChange++; }
        else if (parsed2.kind === 'INTERVAL') {
          if (parsed2.start < 0) { base.status = 'ERROR'; base.message = 'شروع بازه نمی‌تواند منفی باشد'; errors++; }
          else if (parsed2.end <= parsed2.start) { base.status = 'ERROR'; base.message = 'پایان بازه باید بزرگ‌تر از شروع آن باشد'; errors++; }
          else { base.interval = { start: parsed2.start, end: parsed2.end }; base.status = 'HEALTHY'; healthy++; }
        } else {
          if (parsed2.value < 0) { base.status = 'ERROR'; base.message = 'زمان منفی مجاز نیست'; errors++; }
          else { base.value = parsed2.value; base.status = 'HEALTHY'; healthy++; }
        }
        cells.push(base);
      }
    }
    return {
      anchorCycleNo: startCycleNo, anchor: { elementId: anchor.elementId, relationId: anchor.relationId || null },
      gridRows: gridRows.slice(anchorIdx, anchorIdx + lines.length),
      elements: sheet.elements, cells: cells,
      counts: { healthy: healthy, warnings: warnings, errors: errors, noChange: noChange, newCycles: Object.keys(newCycleNos).length },
    };
  }

  function pasteCommit(sessionId, preview, mode) {
    if (mode !== 'SKIP_INVALID' && preview.counts.errors > 0) {
      throw new Error('خطاها را اصلاح کنید؛ در حالت «همه یا هیچ» با وجود خطا هیچ داده‌ای ثبت نمی‌شود.');
    }
    var session = byId('studySessions', sessionId);
    if (!session) throw new Error('جلسه یافت نشد.');
    var existing = cyclesOfSession(sessionId);
    var maxCycle = existing.length ? Math.max.apply(null, existing.map(function (c) { return c.cycleNo; })) : 0;
    var needed = preview.cells.reduce(function (m, cell) { return Math.max(m, cell.cycleNo); }, 0);
    if (needed > maxCycle) addCycles(sessionId, needed - maxCycle);
    var applied = 0, skipped = 0;
    var cellsToApply = [];
    // v1.5.0 §۸.۳ — مقادیر هم‌پوشانی زیرردیف‌ها بر اساس چرخه گروه‌بندی و از مسیر مرکزی ثبت می‌شوند
    var overlapUpdatesByCycleNo = {};
    preview.cells.forEach(function (cell) {
      if (cell.status === 'ERROR') { skipped++; return; }
      if (cell.status === 'NO_CHANGE') { skipped++; return; }
      if (cell.relationId && cell.overlapStatus) {
        if (!overlapUpdatesByCycleNo[cell.cycleNo]) overlapUpdatesByCycleNo[cell.cycleNo] = [];
        overlapUpdatesByCycleNo[cell.cycleNo].push({ relationId: cell.relationId, status: cell.overlapStatus, overlapDuration: cell.overlapStatus === 'OVERLAP' ? cell.overlapDuration : cell.overlapStatus === 'NO_OVERLAP' ? 0 : null });
        applied++;
        return;
      }
      if (cell.interval !== null && cell.interval !== undefined) {
        cellsToApply.push({ cycleNo: cell.cycleNo, workElementId: cell.elementId, startOffset: cell.interval.start, endOffset: cell.interval.end });
      } else if (cell.value !== null && cell.value !== undefined) {
        if (session.timingMethod === 'CONTINUOUS') cellsToApply.push({ cycleNo: cell.cycleNo, workElementId: cell.elementId, cumulativeReading: cell.value });
        else cellsToApply.push({ cycleNo: cell.cycleNo, workElementId: cell.elementId, rawDuration: cell.value });
      }
      applied++;
    });

    if (cellsToApply.length > 0) putCells(sessionId, cellsToApply);
    // ثبت مقادیر هم‌پوشانی پس از عناصر — از همان مسیر مرکزی (§۵.۵)
    var cycleNoIds = {};
    cyclesOfSession(sessionId).forEach(function (c) { cycleNoIds[c.cycleNo] = c.id; });
    Object.keys(overlapUpdatesByCycleNo).forEach(function (no) {
      var cycleId = cycleNoIds[no];
      if (cycleId) setCycleOverlaps(cycleId, overlapUpdatesByCycleNo[no]);
    });
    return { applied: applied, skipped: skipped, newCycles: Math.max(0, needed - maxCycle) };
  }

  // ═══════════ تشخیص غیرعادی ═══════════
  function getOutlierConfig() {
    var s = getAppSettings();
    var method = s['outlier.method'] === 'iqr' ? 'iqr' : 'mad';
    var thresholdRaw = Number(s['outlier.threshold']);
    var threshold = isFinite(thresholdRaw) && thresholdRaw > 0 ? thresholdRaw : 3.5;
    return { method: method, threshold: threshold };
  }
  function setOutlierConfig(patch) {
    var values = {};
    if (patch.method) values['outlier.method'] = patch.method;
    if (patch.threshold !== undefined) values['outlier.threshold'] = String(Math.max(0.5, Math.min(10, patch.threshold)));
    setAppSettings(values);
    var projects = state.projects.map(function (p) { return p.id; });
    projects.forEach(function (pid) { refreshOutliersForProject(pid, { silent: true }); });
    commit();
  }
  function refreshOutliersForElement(elementId, opts) {
    var config = getOutlierConfig();
    var obs = filterBy('elementObservations', 'workElementId', elementId);
    var basis = obs.filter(function (o) { return (o.validityStatus === 'VALID' || o.validityStatus === 'SUSPECT') && o.derivedDuration !== null; });
    var flags = F.detectOutliers(basis.map(function (o) { return { value: o.derivedDuration, ref: o.id }; }), { method: config.method, threshold: config.threshold });
    var flaggedById = {};
    flags.forEach(function (f) { flaggedById[f.ref] = f; });
    var flagged = 0, unflagged = 0;
    basis.forEach(function (o) {
      var flag = flaggedById[o.id];
      if (flag) {
        if (o.validityStatus !== 'SUSPECT' || o.outlierScore !== flag.score || o.outlierRule !== flag.rule) {
          o.validityStatus = 'SUSPECT'; o.outlierScore = flag.score; o.outlierRule = flag.rule;
          flagged++;
        }
      } else if (o.validityStatus === 'SUSPECT' || o.outlierScore !== null || o.outlierRule !== null) {
        o.validityStatus = 'VALID'; o.outlierScore = null; o.outlierRule = null;
        unflagged++;
      }
    });
    if (flagged + unflagged > 0) {
      var e = byId('workElements', elementId);
      if (e) markProjectCalculationsStale(projectIdOfActivity(e.activityId));
      if (!(opts && opts.silent)) commit();
    }
    return { elementId: elementId, basisCount: basis.length, flagged: flagged, unflagged: unflagged };
  }
  function refreshOutliersForActivity(activityId, opts) {
    return sortElements(activityId).map(function (e) { return refreshOutliersForElement(e.id, opts); });
  }
  function refreshOutliersForProject(projectId, opts) {
    var out = [];
    activitiesOfProject(projectId).forEach(function (a) { out = out.concat(refreshOutliersForActivity(a.id, opts)); });
    return out;
  }

  // ═══════════ تحلیل فعالیت — پورت دقیق analysis-service ═══════════
  function isInCalc(o) { return (o.validityStatus === 'VALID' || o.validityStatus === 'SUSPECT') && o.derivedDuration !== null; }

  function buildHistogram(values) {
    if (values.length < 2) return [];
    var min = Math.min.apply(null, values), max = Math.max.apply(null, values);
    if (max === min) return [{ binStart: min, binEnd: max, count: values.length }];
    var bins = Math.min(12, Math.max(4, Math.ceil(1 + Math.log2(values.length))));
    var width = (max - min) / bins;
    var counts = new Array(bins).fill(0);
    values.forEach(function (v) {
      var idx = Math.floor((v - min) / width);
      if (idx >= bins) idx = bins - 1;
      if (idx < 0) idx = 0;
      counts[idx]++;
    });
    var out = [];
    for (var i = 0; i < bins; i++) out.push({ binStart: F.round12(min + i * width), binEnd: F.round12(min + (i + 1) * width), count: counts[i] });
    return out;
  }

  function cycleElapsedAnalysis(observations) {
    var fullIntervals = observations.filter(function (o) { return o.startOffset !== null && o.endOffset !== null; });
    if (fullIntervals.length > 0) {
      var earliest = Math.min.apply(null, fullIntervals.map(function (o) { return o.startOffset; }));
      var latest = Math.max.apply(null, fullIntervals.map(function (o) { return o.endOffset; }));
      return F.round12(latest - earliest);
    }
    var seq = observations.filter(isInCalc);
    if (seq.length === 0) return null;
    return F.round12(seq.reduce(function (s, o) { return s + o.derivedDuration; }, 0));
  }

  function getActivityAnalysis(activityId) {
    var activity = byId('activities', activityId);
    if (!activity) throw new Error('فعالیت یافت نشد.');
    var station = byId('stations', activity.stationId);
    var projectId = station.projectId;
    var group = activity.groupId ? byId('activityGroups', activity.groupId) : null;
    var elements = sortElements(activityId);
    var settingsRaw = getProjectSettings(projectId);
    var allowanceMethod = settingsRaw['calc.allowanceMethod'];
    var aggregationMethod = settingsRaw['calc.aggregationMethod'];
    var allowanceResolution = resolveForActivity(activityId);
    var outlierConfig = getOutlierConfig();
    var sessions = listSessions(activityId);
    var cycles = [];
    sessions.forEach(function (se) {
      cyclesOfSession(se.id).forEach(function (c) { cycles.push(c); });
    });

    var observationsByElement = {};
    var cycleCtx = {};
    cycles.forEach(function (c) {
      var session = byId('studySessions', c.sessionId);
      cycleCtx[c.id] = { cycle: c, session: session, operator: byId('operators', session.operatorId) };
      obsOfCycle(c.id).forEach(function (o) {
        if (!observationsByElement[o.workElementId]) observationsByElement[o.workElementId] = [];
        observationsByElement[o.workElementId].push(Object.assign({ ctx: cycleCtx[c.id] }, o));
      });
    });

    var elementIds = elements.map(function (e) { return e.id; });
    var validCycles = 0;
    cycles.forEach(function (c) {
      var obs = obsOfCycle(c.id);
      var hasBad = obs.some(function (o) { return o.validityStatus === 'EXCLUDED' || o.validityStatus === 'INVALID'; });
      var complete = elementIds.length > 0 && elementIds.every(function (eid) { return obs.some(function (o) { return o.workElementId === eid && o.derivedDuration !== null; }); });
      if (complete && !hasBad) validCycles++;
    });
    var target = activity.targetSampleCount;
    var sampleProgress = {
      targetSampleCount: target, validCycles: validCycles, totalCycles: cycles.length, sessionsCount: sessions.length,
      reached: target === null ? null : validCycles >= target,
      message: target === null
        ? 'تعداد نمونه هدف برای این فعالیت ثبت نشده است؛ در مشخصات فعالیت می‌توانید هدف را تعیین کنید.'
        : validCycles >= target
          ? 'هدف تعداد نمونه تکمیل شد (' + validCycles + ' از ' + target + ' چرخهٔ معتبر). توجه: رسیدن به هدف تعداد، تضمین کفایت آماری نیست — شاخص‌های پراکندی را بازبینی کنید.'
          : 'تا هدف تعداد نمونه ' + Math.max(0, target - validCycles) + ' چرخهٔ معتبر باقی مانده است (' + validCycles + ' از ' + target + ').',
    };

    var operatorById = {};
    sessions.forEach(function (s) {
      var op = byId('operators', s.operatorId);
      if (op) operatorById[s.operatorId] = op;
    });

    var elementDtos = elements.map(function (el) {
      var rows = observationsByElement[el.id] || [];
      var calcRows = rows.filter(isInCalc);
      var values = calcRows.map(function (o) { return o.derivedDuration; });
      var stats = F.descriptiveStats(values);
      var perOperatorSamples = {};
      calcRows.forEach(function (o) {
        var oid = o.ctx.session.operatorId;
        if (!perOperatorSamples[oid]) perOperatorSamples[oid] = [];
        perOperatorSamples[oid].push(o.derivedDuration);
      });
      var samplesArr = Object.keys(perOperatorSamples).map(function (oid) { return { operatorId: oid, values: perOperatorSamples[oid] }; });
      var agg = F.aggregateElement(samplesArr, aggregationMethod);
      var rating = state.ratingAssessments.find(function (r) { return r.workElementId === el.id; });
      var ratingDto = null;
      if (rating) {
        var t = byId('ratingTables', rating.ratingTableId);
        ratingDto = { totalFactor: rating.totalFactor, tableName: t ? t.name : '؟', tableVersion: t ? t.version : 0 };
      }
      var ot = agg.value;
      var nt = ot !== null && ratingDto !== null ? F.round12(ot * ratingDto.totalFactor) : null;
      // الونس‌های مؤثر این عنصر — resolve سلسله‌مراتبی (§۳)
      var elResolution = allowanceResolution.elements[el.id];
      var elFactors = {
        totalPercent: elResolution ? elResolution.summary.totalPercent : 0,
        perExecutionSeconds: elResolution ? elResolution.summary.perExecutionSeconds : 0,
        perCycleSeconds: elResolution ? elResolution.summary.perCycleSeconds : 0,
      };
      var st = null, stError = null, stExplanation = null;
      if (nt !== null) {
        try { var stRes = F.computeElementStandardTime(nt, elFactors, allowanceMethod); st = stRes.st; stExplanation = stRes.explanation; }
        catch (err) { stError = err.message; }
      }
      var operators = [];
      Object.keys(perOperatorSamples).forEach(function (oid) {
        var opStats = F.descriptiveStats(perOperatorSamples[oid]);
        var opMean = opStats.mean;
        var opNt = opMean !== null && ratingDto !== null ? F.round12(opMean * ratingDto.totalFactor) : null;
        var opSt = null;
        if (opNt !== null) { try { opSt = F.computeElementStandardTime(opNt, elFactors, allowanceMethod).st; } catch (e) { opSt = null; } }
        var opRows = rows.filter(function (r) { return r.ctx.session.operatorId === oid; });
        operators.push({
          operatorId: oid, operatorName: operatorById[oid] ? operatorById[oid].displayName : 'اپراتور حذف‌شده',
          count: perOperatorSamples[oid].length, mean: opMean, median: opStats.median, sampleSD: opStats.sampleSD,
          cvPercent: opStats.cvPercent, ci95: opStats.ci95,
          suspectCount: opRows.filter(function (r) { return r.validityStatus === 'SUSPECT'; }).length,
          excludedCount: opRows.filter(function (r) { return r.validityStatus === 'EXCLUDED'; }).length,
          nt: opNt, st: opSt,
        });
      });
      operators.sort(function (a, b) { return cmpStr(a.operatorName, b.operatorName); });
      var trend = rows
        .filter(function (o) { return o.derivedDuration !== null && o.validityStatus !== 'INVALID'; })
        .map(function (o) { return { cycleNo: o.ctx.cycle.cycleNo, operatorId: o.ctx.session.operatorId, value: o.derivedDuration, status: o.validityStatus }; });
      return {
        id: el.id, name: el.name,
        counts: {
          total: rows.length, calcBasis: calcRows.length,
          valid: rows.filter(function (r) { return r.validityStatus === 'VALID'; }).length,
          suspect: rows.filter(function (r) { return r.validityStatus === 'SUSPECT'; }).length,
          excluded: rows.filter(function (r) { return r.validityStatus === 'EXCLUDED'; }).length,
          invalid: rows.filter(function (r) { return r.validityStatus === 'INVALID'; }).length,
        },
        stats: stats, ot: ot, otAggregationMethod: aggregationMethod,
        otAggregationMethodLabel: CONST.AGGREGATION_METHOD_LABELS[aggregationMethod],
        rating: ratingDto, nt: nt, st: st, stError: stError,
        allowances: {
          totalPercent: elFactors.totalPercent,
          perExecutionSeconds: elFactors.perExecutionSeconds,
          perCycleSeconds: elFactors.perCycleSeconds,
          needsAggregationCount: elResolution ? elResolution.summary.needsAggregationCount : 0,
        },
        stExplanation: stExplanation,
        operators: operators, trend: trend, histogram: buildHistogram(values),
      };
    });

    var elapsedValues = [];
    var hasIntervalCycle = false;
    cycles.forEach(function (c) {
      var obs = obsOfCycle(c.id);
      var bad = obs.some(function (o) { return o.validityStatus === 'EXCLUDED' || o.validityStatus === 'INVALID'; });
      if (bad || !c.isComplete) return;
      if (obs.some(function (o) { return o.startOffset !== null && o.endOffset !== null; })) hasIntervalCycle = true;
      var e = cycleElapsedAnalysis(obs);
      if (e !== null) elapsedValues.push(e);
    });
    var cycleStats = {
      count: elapsedValues.length, stats: F.descriptiveStats(elapsedValues),
      methodNote: hasIntervalCycle
        ? 'چرخه‌های دارای بازهٔ هم‌زمان: زمان سپری‌شده = دیرترین پایان − زودترین شروع (گستره)؛ هرگز جمع مدت‌های هم‌پوشان گزارش نمی‌شود.'
        : 'چرخه‌های ترتیبی: زمان سپری‌شده = جمع مدت عناصر درون محاسبات.',
    };

    // v1.5.0 §۳ — elementTypeTotals (شاخص‌های نوع عنصر) حذف شد؛
    // قاعدهٔ NEEDS_AGGREGATION_RULE حفظ شد: legacy + رابطهٔ فعال + بازهٔ واقعی (§۱۰)
    var hasOverlapLegacy = elements.some(function (e) { return e.elementType === 'OVERLAP'; });
    var hasActiveOverlapRelations = state.overlapRelations.some(function (r) {
      if (!r.isActive) return false;
      return elementIds.indexOf(r.elementLowId) >= 0 && elementIds.indexOf(r.elementHighId) >= 0;
    });
    var hasAnyInterval = cycles.some(function (c) { return obsOfCycle(c.id).some(function (o) { return o.startOffset !== null; }); });
    var activityTotal;
    if (hasOverlapLegacy || hasActiveOverlapRelations || hasAnyInterval) {
      activityTotal = {
        st: null, status: 'NEEDS_AGGREGATION_RULE',
        reason: 'این فعالیت دارای کار هم‌زمان/هم‌پوشان است؛ جمع سادهٔ زمان استاندارد عناصر، زمان استاندارد کل چرخه را به دست نمی‌دهد. تا تعریف و تأیید قاعدهٔ تجمیع مهندسی، زمان استاندارد عناصر و زمان سپری‌شدهٔ مشاهده‌شدهٔ چرخه را ملاک قرار دهید.',
      };
    } else if (elementDtos.length === 0) {
      activityTotal = { st: null, status: 'INCOMPLETE', reason: 'برای این فعالیت عنصر کاری تعریف نشده است.' };
    } else {
      var missing = elementDtos.filter(function (e) { return e.st === null; });
      if (missing.length > 0) {
        activityTotal = {
          st: null, status: 'INCOMPLETE',
          reason: 'زمان استاندارد ' + missing.length + ' عنصر از ' + elementDtos.length + ' عنصر قابل محاسبه نیست (' + missing.slice(0, 3).map(function (e) { return '«' + e.name + '»'; }).join('، ') + (missing.length > 3 ? ' و …' : '') + '). علت رایج: نبود دادهٔ معتبر، نبود ارزیابی وستینگهاوس یا خطای مجازها.',
        };
      } else {
        // الونس‌های «هر چرخه» دقیقاً یک‌بار در سطح چرخه (§۳.۲) —
        // ردیف‌های per-cycle سطح فعالیت/ایستگاه/پروژه یک‌بار + ردیف‌های محلی عناصر (dedupe با ID)
        var actPerCycleRows = allowanceResolution.activity.rows.filter(function (r) {
          return r.status !== 'EXCLUDED' && !r.needsAggregationRule && r.valueType === 'FIXED_TIME' && r.applicationBasis === 'PER_CYCLE' && r.timeValueSeconds !== null;
        });
        var perCycleTotal = F.round12(actPerCycleRows.reduce(function (s, r) { return s + r.timeValueSeconds; }, 0));
        var seenPerCycleDefs = {};
        actPerCycleRows.forEach(function (r) { seenPerCycleDefs[r.definitionId] = true; });
        elementDtos.forEach(function (ed) {
          var elRes = allowanceResolution.elements[ed.id];
          if (!elRes) return;
          elRes.rows.forEach(function (r) {
            if (r.sourceScopeType !== 'WORK_ELEMENT') return;
            if (r.status === 'EXCLUDED' || r.needsAggregationRule) return;
            if (r.valueType !== 'FIXED_TIME' || r.applicationBasis !== 'PER_CYCLE' || r.timeValueSeconds === null) return;
            if (seenPerCycleDefs[r.definitionId]) return;
            seenPerCycleDefs[r.definitionId] = true;
            perCycleTotal = F.round12(perCycleTotal + r.timeValueSeconds);
          });
        });
        var elementsSt = F.round12(elementDtos.reduce(function (s, e) { return s + e.st; }, 0));
        activityTotal = {
          st: F.round12(elementsSt + perCycleTotal), status: 'OK',
          reason: perCycleTotal > 0
            ? 'فعالیت کاملاً ترتیبی است؛ زمان استاندارد کل = جمع زمان استاندارد عناصر (' + elementsSt + ') + الونس‌های زمانی «هر چرخه» که دقیقاً یک‌بار افزوده شدند (' + perCycleTotal + ' ثانیه).'
            : 'فعالیت کاملاً ترتیبی است؛ زمان استاندارد کل = جمع زمان استاندارد عناصر.',
        };
      }
    }

    var elementNameById = {};
    elements.forEach(function (e) { elementNameById[e.id] = e.name; });
    var suspects = [];
    cycles.forEach(function (c) {
      var ctx = cycleCtx[c.id];
      obsOfCycle(c.id).forEach(function (o) {
        if (o.validityStatus !== 'SUSPECT' && o.validityStatus !== 'EXCLUDED') return;
        if (o.derivedDuration === null) return;
        suspects.push({
          observationId: o.id, elementId: o.workElementId,
          elementName: elementNameById[o.workElementId] || 'عنصر حذف‌شده',
          cycleNo: c.cycleNo, sessionId: c.sessionId, operatorId: ctx.session.operatorId,
          operatorName: ctx.operator ? ctx.operator.displayName : 'اپراتور حذف‌شده',
          value: o.derivedDuration, score: o.outlierScore, rule: o.outlierRule,
          validityStatus: o.validityStatus, exclusionReason: o.exclusionReason,
        });
      });
    });

    return {
      activity: {
        id: activity.id, name: activity.name, stationName: station.name, processType: activity.processType,
        targetSampleCount: activity.targetSampleCount, groupId: activity.groupId,
        groupName: group ? group.name : null, projectId: projectId,
      },
      settings: {
        allowanceMethod: allowanceMethod, allowanceMethodLabel: CONST.ALLOWANCE_METHOD_LABELS[allowanceMethod],
        formula: CONST.ALLOWANCE_METHOD_FORMULAS[allowanceMethod],
        aggregationMethod: aggregationMethod, aggregationMethodLabel: CONST.AGGREGATION_METHOD_LABELS[aggregationMethod],
        formulaVersion: CONST.FORMULA_VERSION,
        outlierMethod: outlierConfig.method === 'iqr' ? 'iqr' : 'mad',
        outlierThreshold: outlierConfig.threshold,
      },
      allowances: {
        method: allowanceResolution.method,
        methodLabel: allowanceResolution.methodLabel,
        formula: allowanceResolution.formula,
        rows: allowanceResolution.activity.rows,
        summary: allowanceResolution.activity.summary,
        perCycleTotal: (function () {
          var rows = allowanceResolution.activity.rows.filter(function (r) {
            return r.status !== 'EXCLUDED' && !r.needsAggregationRule && r.valueType === 'FIXED_TIME' && r.applicationBasis === 'PER_CYCLE' && r.timeValueSeconds !== null;
          });
          var seen = {}; var total = 0;
          rows.forEach(function (r) { seen[r.definitionId] = true; total += r.timeValueSeconds; });
          Object.keys(allowanceResolution.elements).forEach(function (eid) {
            allowanceResolution.elements[eid].rows.forEach(function (r) {
              if (r.sourceScopeType !== 'WORK_ELEMENT') return;
              if (r.status === 'EXCLUDED' || r.needsAggregationRule) return;
              if (r.valueType !== 'FIXED_TIME' || r.applicationBasis !== 'PER_CYCLE' || r.timeValueSeconds === null) return;
              if (seen[r.definitionId]) return;
              seen[r.definitionId] = true; total += r.timeValueSeconds;
            });
          });
          return F.round12(total);
        })(),
        needsAggregation: (function () {
          var out = [];
          allowanceResolution.activity.rows.concat(Object.keys(allowanceResolution.elements).reduce(function (acc, eid) { return acc.concat(allowanceResolution.elements[eid].rows); }, [])).forEach(function (r) {
            if (r.needsAggregationRule) out.push({ title: r.title, sourceScopeLabel: r.sourceScopeLabel, timeValueSeconds: r.timeValueSeconds || 0 });
          });
          return out;
        })(),
      },
      sampleProgress: sampleProgress, elements: elementDtos,
      cycleStats: cycleStats, activityTotal: activityTotal,
      suspects: suspects, generatedAt: U.nowISO(),
    };
  }

  function listActivitiesForAnalysis(projectId) {
    return sortStations(projectId).map(function (st) {
      return {
        id: st.id, name: st.name,
        activities: sortActivities(st.id).map(function (a) {
          var cyclesCount = filterBy('studySessions', 'activityId', a.id).reduce(function (sum, se) { return sum + filterBy('cycleObservations', 'sessionId', se.id).length; }, 0);
          return { id: a.id, name: a.name, processType: a.processType, targetSampleCount: a.targetSampleCount, elementsCount: sortElements(a.id).length, cyclesCount: cyclesCount };
        }),
      };
    });
  }

  // ═══════════ Snapshot محاسبات — FR-27 ═══════════
  function compactActivity(a) {
    return {
      id: a.activity.id, name: a.activity.name, stationName: a.activity.stationName, groupName: a.activity.groupName,
      sampleProgress: { validCycles: a.sampleProgress.validCycles, totalCycles: a.sampleProgress.totalCycles, targetSampleCount: a.sampleProgress.targetSampleCount },
      // snapshot الونس‌ها — بازتولید تاریخچه (§۴.۲)
      allowances: {
        method: a.allowances.method,
        rows: a.allowances.rows.map(function (r) {
          return { definitionId: r.definitionId, title: r.title, status: r.status, valueType: r.valueType, percentValue: r.percentValue, timeValueSeconds: r.timeValueSeconds, applicationBasis: r.applicationBasis, sourceScopeType: r.sourceScopeType, sourceScopeLabel: r.sourceScopeLabel };
        }),
        summary: a.allowances.summary,
        perCycleTotal: a.allowances.perCycleTotal,
      },
      activityTotal: { st: a.activityTotal.st, status: a.activityTotal.status },
      elements: a.elements.map(function (e) {
        return {
          id: e.id, name: e.name,
          counts: { calcBasis: e.counts.calcBasis, suspect: e.counts.suspect, excluded: e.counts.excluded },
          ot: e.ot, nt: e.nt, st: e.st, stError: e.stError, ratingFactor: e.rating ? e.rating.totalFactor : null,
          allowanceP: e.allowances.totalPercent, allowanceT: e.allowances.perExecutionSeconds,
        };
      }),
      cycleStats: { count: a.cycleStats.count, mean: a.cycleStats.stats.mean },
    };
  }
  function runProjectCalculation(projectId) {
    var project = byId('projects', projectId);
    if (!project) throw new Error('پروژه یافت نشد.');
    var settings = getProjectSettings(projectId);
    var outlierConfig = getOutlierConfig();
    var analyses = activitiesOfProject(projectId).map(function (a) { return getActivityAnalysis(a.id); });
    var settingsSnapshot = {
      allowanceMethod: settings['calc.allowanceMethod'],
      allowanceMethodLabel: CONST.ALLOWANCE_METHOD_LABELS[settings['calc.allowanceMethod']],
      aggregationMethod: settings['calc.aggregationMethod'],
      aggregationMethodLabel: CONST.AGGREGATION_METHOD_LABELS[settings['calc.aggregationMethod']],
      outlierMethod: outlierConfig.method === 'iqr' ? 'iqr' : 'mad',
      outlierThreshold: outlierConfig.threshold,
      formulaVersion: CONST.FORMULA_VERSION,
      generatedAt: U.nowISO(),
    };
    var resultSnapshot = {
      activities: analyses.map(compactActivity),
      summary: {
        activitiesCount: analyses.length,
        needsAggregationRule: analyses.filter(function (a) { return a.activityTotal.status === 'NEEDS_AGGREGATION_RULE'; }).length,
        incomplete: analyses.filter(function (a) { return a.activityTotal.status === 'INCOMPLETE'; }).length,
        totalSuspects: analyses.reduce(function (s, a) { return s + a.suspects.filter(function (x) { return x.validityStatus === 'SUSPECT'; }).length; }, 0),
      },
    };
    var run = {
      id: U.uid(), projectId: projectId, formulaVersion: CONST.FORMULA_VERSION,
      settingsSnapshot: JSON.stringify(settingsSnapshot), resultSnapshot: JSON.stringify(resultSnapshot),
      status: 'DONE', createdAt: U.nowISO(), updatedAt: U.nowISO(),
    };
    state.calculationRuns.push(run);
    recordAudit({ entityType: 'CalculationRun', entityId: run.id, action: 'CREATE', entityName: 'اجرای محاسبهٔ پروژه «' + project.name + '»', after: { activitiesCount: analyses.length, formulaVersion: CONST.FORMULA_VERSION }, projectId: projectId });
    commit();
    return { id: run.id, createdAt: run.createdAt, status: run.status, formulaVersion: run.formulaVersion, settings: settingsSnapshot, result: resultSnapshot };
  }
  function getLatestCalculation(projectId) {
    var runs = filterBy('calculationRuns', 'projectId', projectId).sort(function (a, b) { return a.createdAt < b.createdAt ? 1 : -1; });
    var latest = runs[0] || null;
    var hasAnyData = state.studySessions.some(function (s) { return projectIdOfActivity(s.activityId) === projectId; });
    var run = null;
    if (latest) {
      run = {
        id: latest.id, createdAt: latest.createdAt, status: latest.status, formulaVersion: latest.formulaVersion,
        settings: safeParse(latest.settingsSnapshot), result: latest.resultSnapshot ? safeParse(latest.resultSnapshot) : null,
      };
    }
    return { run: run, needsRecalc: run === null ? hasAnyData : run.status === 'STALE', hasAnyData: hasAnyData, runsCount: runs.length };
  }
  function safeParse(json) { try { return JSON.parse(json); } catch (e) { return {}; } }

  // ═══════════ نمودار فرایند OPC/FPC ═══════════
  var NODE_W = 200, NODE_H_EST = 92, COL_GAP = 56, ROW_GAP = 72, CANVAS_MARGIN = 48;
  var OPC_TYPES = ['OPERATION', 'INSPECTION'];

  function computeAutoLayout(nodes, edges) {
    var positions = {};
    if (nodes.length === 0) return positions;
    var indeg = {}, out = {};
    nodes.forEach(function (n) { indeg[n.id] = 0; out[n.id] = []; });
    edges.forEach(function (e) {
      if (indeg.hasOwnProperty(e.sourceNodeId) && indeg.hasOwnProperty(e.targetNodeId)) {
        indeg[e.targetNodeId]++;
        out[e.sourceNodeId].push(e.targetNodeId);
      }
    });
    var layer = {};
    var queue = nodes.filter(function (n) { return indeg[n.id] === 0; }).map(function (n) { return n.id; });
    queue.forEach(function (id) { layer[id] = 0; });
    var maxLayer = 0;
    while (queue.length > 0) {
      var next = [];
      queue.forEach(function (id) {
        var cur = layer[id] || 0;
        (out[id] || []).forEach(function (succ) {
          layer[succ] = Math.max(layer[succ] || 0, cur + 1);
          maxLayer = Math.max(maxLayer, layer[succ]);
          indeg[succ]--;
          if (indeg[succ] === 0) next.push(succ);
        });
      });
      queue = next;
    }
    var cyclic = nodes.filter(function (n) { return !layer.hasOwnProperty(n.id); }).sort(function (a, b) { return a.sortOrder - b.sortOrder; });
    var fallbackLayer = maxLayer + 1;
    cyclic.forEach(function (n) { layer[n.id] = fallbackLayer++; });
    var byLayer = {};
    nodes.forEach(function (n) {
      var l = layer[n.id] || 0;
      if (!byLayer[l]) byLayer[l] = [];
      byLayer[l].push(n);
    });
    var minX = Infinity, minY = Infinity;
    Object.keys(byLayer).forEach(function (l) {
      var members = byLayer[l].sort(function (a, b) { return a.sortOrder - b.sortOrder; });
      var step = NODE_W + COL_GAP;
      var startX = -((members.length - 1) * step) / 2;
      members.forEach(function (m, i) {
        var x = startX + i * step;
        var y = Number(l) * (NODE_H_EST + ROW_GAP);
        positions[m.id] = { x: x, y: y };
        minX = Math.min(minX, x); minY = Math.min(minY, y);
      });
    });
    var dx = CANVAS_MARGIN - (isFinite(minX) ? minX : 0);
    var dy = CANVAS_MARGIN - (isFinite(minY) ? minY : 0);
    Object.keys(positions).forEach(function (id) {
      positions[id] = { x: Math.round(positions[id].x + dx), y: Math.round(positions[id].y + dy) };
    });
    return positions;
  }

  function loadProjectActivities(projectId) {
    var out = [];
    sortStations(projectId).forEach(function (st) {
      sortActivities(st.id).forEach(function (a) { out.push({ id: a.id, name: a.name, processType: a.processType, stationId: st.id, stationName: st.name }); });
    });
    return out;
  }

  function rebuildChain(projectId, chartType, orderedIds) {
    var edges = filterBy('chartEdges', 'chartType', chartType).filter(function (e) { return e.projectId === projectId; });
    var desired = [];
    for (var i = 0; i + 1 < orderedIds.length; i++) desired.push({ source: orderedIds[i], target: orderedIds[i + 1] });
    var desiredKeys = {};
    desired.forEach(function (d) { desiredKeys[d.source + '->' + d.target] = true; });
    edges.forEach(function (edge) {
      if (edge.isChain && !desiredKeys[edge.sourceNodeId + '->' + edge.targetNodeId]) {
        state.chartEdges = state.chartEdges.filter(function (e) { return e.id !== edge.id; });
      }
    });
    desired.forEach(function (d) {
      var existing = state.chartEdges.find(function (e) { return e.projectId === projectId && e.chartType === chartType && e.sourceNodeId === d.source && e.targetNodeId === d.target; });
      if (!existing) {
        state.chartEdges.push({ id: U.uid(), projectId: projectId, chartType: chartType, sourceNodeId: d.source, targetNodeId: d.target, isChain: true, sortOrder: 0 });
      } else if (!existing.isChain) existing.isChain = true;
    });
  }

  function syncChart(projectId, chartType) {
    var allActivities = loadProjectActivities(projectId);
    var qualifying = allActivities.filter(function (a) { return chartType === 'OPC' ? OPC_TYPES.indexOf(a.processType) >= 0 : true; });
    var qualifyingIds = {};
    qualifying.forEach(function (a) { qualifyingIds[a.id] = true; });
    var activityById = {};
    allActivities.forEach(function (a) { activityById[a.id] = a; });
    var existing = filterBy('chartNodes', 'chartType', chartType).filter(function (n) { return n.projectId === projectId; }).sort(function (a, b) { return a.sortOrder - b.sortOrder; });
    var orphans = existing.filter(function (n) { return !n.isManual && !(n.activityId && qualifyingIds[n.activityId]); });
    var kept = existing.filter(function (n) { return orphans.indexOf(n) < 0; });
    var keptActivityIds = {};
    kept.forEach(function (n) { if (!n.isManual) keptActivityIds[n.activityId] = true; });
    var missing = qualifying.filter(function (a) { return !keptActivityIds[a.id]; });

    if (orphans.length === 0 && missing.length === 0) {
      kept.forEach(function (node) {
        if (node.isManual || !node.activityId) return;
        var activity = activityById[node.activityId];
        if (!activity) return;
        if (node.label !== activity.name || node.nodeType !== activity.processType) {
          node.label = activity.name; node.nodeType = activity.processType; touch(node);
        }
      });
      return;
    }

    orphans.forEach(function (orphan) {
      state.chartEdges = state.chartEdges.filter(function (e) { return e.sourceNodeId !== orphan.id && e.targetNodeId !== orphan.id; });
      state.chartNodes = state.chartNodes.filter(function (n) { return n.id !== orphan.id; });
    });
    kept.forEach(function (node) {
      if (node.isManual || !node.activityId) return;
      var activity = activityById[node.activityId];
      if (!activity) return;
      if (node.label !== activity.name || node.nodeType !== activity.processType) {
        node.label = activity.name; node.nodeType = activity.processType; touch(node);
      }
    });
    if (missing.length > 0) {
      var wasEmpty = kept.length === 0;
      var nextOrder = kept.length > 0 ? Math.max.apply(null, kept.map(function (n) { return n.sortOrder; })) + 1 : 0;
      var created = [];
      missing.forEach(function (activity) {
        var node = {
          id: U.uid(), projectId: projectId, chartType: chartType, nodeType: activity.processType,
          activityId: activity.id, label: activity.name, isManual: false,
          sortOrder: nextOrder++, positionX: 0, positionY: 0, updatedAt: U.nowISO(),
        };
        state.chartNodes.push(node);
        created.push(node);
      });
      var allOrdered = kept.concat(created);
      if (wasEmpty) {
        var virtualEdges = [];
        for (var i = 0; i + 1 < allOrdered.length; i++) virtualEdges.push({ sourceNodeId: allOrdered[i].id, targetNodeId: allOrdered[i + 1].id });
        var positions = computeAutoLayout(allOrdered, virtualEdges);
        allOrdered.forEach(function (node) {
          var p = positions[node.id];
          if (p) { node.positionX = p.x; node.positionY = p.y; }
        });
      } else {
        var last = kept[kept.length - 1];
        var y = last.positionY;
        created.forEach(function (node) {
          node.positionX = last.positionX;
          node.positionY = y + NODE_H_EST + ROW_GAP;
          y += NODE_H_EST + ROW_GAP;
        });
      }
      kept = kept.concat(created);
    }
    var finalNodes = filterBy('chartNodes', 'chartType', chartType).filter(function (n) { return n.projectId === projectId; }).sort(function (a, b) { return a.sortOrder - b.sortOrder; });
    rebuildChain(projectId, chartType, finalNodes.map(function (n) { return n.id; }));
    commit();
  }

  function getChart(projectId, chartType) {
    if (chartType !== 'OPC' && chartType !== 'FPC') throw new Error('نوع نمودار معتبر نیست (OPC یا FPC).');
    syncChart(projectId, chartType);
    var nodes = filterBy('chartNodes', 'chartType', chartType).filter(function (n) { return n.projectId === projectId; }).sort(function (a, b) { return a.sortOrder - b.sortOrder; });
    var edges = filterBy('chartEdges', 'chartType', chartType).filter(function (e) { return e.projectId === projectId; });
    var allActivities = loadProjectActivities(projectId);
    var activityById = {};
    allActivities.forEach(function (a) { activityById[a.id] = a; });
    var byType = {};
    ['OPERATION', 'INSPECTION', 'TRANSPORT', 'DELAY', 'STORAGE', 'MANUAL', 'MATERIAL_INPUT'].forEach(function (t) { byType[t] = 0; });
    var maxX = CANVAS_MARGIN * 2, maxY = CANVAS_MARGIN * 2;
    var nodeDtos = nodes.map(function (n) {
      byType[n.nodeType] = (byType[n.nodeType] || 0) + 1;
      maxX = Math.max(maxX, n.positionX + NODE_W + CANVAS_MARGIN);
      maxY = Math.max(maxY, n.positionY + NODE_H_EST + CANVAS_MARGIN);
      var activity = n.activityId ? activityById[n.activityId] : null;
      return {
        id: n.id, nodeType: n.nodeType, label: n.label, activityId: n.activityId,
        activityName: activity ? activity.name : null, stationName: activity ? activity.stationName : null,
        isManual: n.isManual, sortOrder: n.sortOrder, positionX: n.positionX, positionY: n.positionY,
      };
    });
    var qualifyingCount = allActivities.filter(function (a) { return chartType === 'OPC' ? OPC_TYPES.indexOf(a.processType) >= 0 : true; }).length;
    return {
      chartType: chartType, nodes: nodeDtos,
      edges: edges.map(function (e) { return { id: e.id, sourceNodeId: e.sourceNodeId, targetNodeId: e.targetNodeId, isChain: e.isChain, sortOrder: e.sortOrder }; }),
      counts: {
        total: nodes.length, auto: nodes.filter(function (n) { return !n.isManual; }).length,
        manual: nodes.filter(function (n) { return n.isManual; }).length, byType: byType,
        activitiesIncluded: qualifyingCount, activitiesTotal: allActivities.length,
      },
      canvas: { width: maxX, height: maxY },
    };
  }
  function createManualNode(projectId, chartType, input) {
    // جلسه ۲ §۱۵.۱ — OPC توسعه‌یافته: ورودی مواد + انبار اختیاری؛ FPC: ۵ نوع + ورودی مواد
    var allowed = chartType === 'OPC'
      ? ['OPERATION', 'INSPECTION', 'MATERIAL_INPUT', 'STORAGE']
      : ['OPERATION', 'INSPECTION', 'TRANSPORT', 'DELAY', 'STORAGE', 'MATERIAL_INPUT'];
    if (allowed.indexOf(input.nodeType) < 0) {
      throw new Error(chartType === 'OPC'
        ? 'در نمودار OPC کلاسیک فقط گره عملیات و بازرسی مجاز است؛ «ورودی مواد» و «انبارش» به‌عنوان توسعهٔ اختیاری قابل افزودن‌اند.'
        : 'نوع گره معتبر نیست.');
    }
    var nodes = filterBy('chartNodes', 'chartType', chartType).filter(function (n) { return n.projectId === projectId; });
    var nextOrder = nodes.length ? Math.max.apply(null, nodes.map(function (n) { return n.sortOrder; })) + 1 : 0;
    var node = {
      id: U.uid(), projectId: projectId, chartType: chartType, nodeType: input.nodeType,
      activityId: null, label: input.label, isManual: true, sortOrder: nextOrder,
      positionX: 48, positionY: 48 + nextOrder * (NODE_H_EST + ROW_GAP), updatedAt: U.nowISO(),
    };
    state.chartNodes.push(node);
    recordAudit({ entityType: 'ChartNode', entityId: node.id, action: 'CREATE', entityName: node.label, projectId: projectId });
    commit();
    return node;
  }
  function updateChartNode(nodeId, patch) {
    var n = byId('chartNodes', nodeId);
    if (!n) throw new Error('گره یافت نشد.');
    if (patch.label !== undefined) n.label = patch.label;
    if (patch.nodeType !== undefined && n.isManual) n.nodeType = patch.nodeType;
    touch(n);
    commit();
  }
  function deleteChartNode(nodeId) {
    var n = byId('chartNodes', nodeId);
    if (!n) throw new Error('گره یافت نشد.');
    state.chartEdges = state.chartEdges.filter(function (e) { return e.sourceNodeId !== nodeId && e.targetNodeId !== nodeId; });
    state.chartNodes = state.chartNodes.filter(function (x) { return x.id !== nodeId; });
    commit();
  }
  function saveChartLayout(projectId, chartType, positions) {
    Object.keys(positions).forEach(function (nodeId) {
      var n = byId('chartNodes', nodeId);
      if (n && n.projectId === projectId && n.chartType === chartType) {
        n.positionX = Math.round(positions[nodeId].x);
        n.positionY = Math.round(positions[nodeId].y);
        touch(n);
      }
    });
    commit();
    // جلسه ۲ §۱۵.۵ — هر ذخیرهٔ چیدمان دستی، snapshot پایدار را هم به‌روز می‌کند
    var chart = getChart(projectId, chartType);
    var snapNodes = chart.nodes.map(function (n) { return { id: n.id, positionX: n.positionX, positionY: n.positionY }; });
    saveChartLayoutSnapshot(projectId, chartType, snapNodes, chart.canvas);
  }
  function moveChartNodeOrder(projectId, chartType, nodeId, dir) {
    var nodes = filterBy('chartNodes', 'chartType', chartType).filter(function (n) { return n.projectId === projectId; }).sort(function (a, b) { return a.sortOrder - b.sortOrder; });
    var idx = nodes.findIndex(function (n) { return n.id === nodeId; });
    if (idx < 0) return;
    var swapWith = dir === 'up' ? idx - 1 : idx + 1;
    if (swapWith < 0 || swapWith >= nodes.length) return;
    var tmp = nodes[idx].sortOrder;
    nodes[idx].sortOrder = nodes[swapWith].sortOrder;
    nodes[swapWith].sortOrder = tmp;
    touch(nodes[idx]); touch(nodes[swapWith]);
    var orderedIds = nodes.slice().sort(function (a, b) { return a.sortOrder - b.sortOrder; }).map(function (n) { return n.id; });
    rebuildChain(projectId, chartType, orderedIds);
    commit();
  }
  function createChartEdge(projectId, chartType, sourceNodeId, targetNodeId, anchors) {
    if (sourceNodeId === targetNodeId) throw new Error('اتصال یک گره به خودش معنا ندارد.');
    var exists = state.chartEdges.find(function (e) {
      return e.projectId === projectId && e.chartType === chartType &&
        ((e.sourceNodeId === sourceNodeId && e.targetNodeId === targetNodeId) ||
         (e.sourceNodeId === targetNodeId && e.targetNodeId === sourceNodeId));
    });
    if (exists) throw new Error('این اتصال قبلاً ثبت شده است.');
    state.chartEdges.push({
      id: U.uid(), projectId: projectId, chartType: chartType,
      sourceNodeId: sourceNodeId, targetNodeId: targetNodeId,
      sourceAnchor: (anchors && anchors.sourceAnchor) || null,
      targetAnchor: (anchors && anchors.targetAnchor) || null,
      isChain: false, sortOrder: 0,
    });
    commit();
  }
  function deleteChartEdge(edgeId) {
    state.chartEdges = state.chartEdges.filter(function (e) { return e.id !== edgeId; });
    commit();
  }
  function getChartsStageState(projectId) {
    var activitiesCount = loadProjectActivities(projectId).length;
    var opcNodes = filterBy('chartNodes', 'chartType', 'OPC').filter(function (n) { return n.projectId === projectId; });
    var opcEdges = filterBy('chartEdges', 'chartType', 'OPC').filter(function (e) { return e.projectId === projectId; });
    var connected = {};
    opcEdges.forEach(function (e) { connected[e.sourceNodeId] = true; connected[e.targetNodeId] = true; });
    var unconnected = opcNodes.filter(function (n) { return !connected[n.id]; }).length;
    return { activitiesCount: activitiesCount, opcNodes: opcNodes.length, unconnectedOpc: unconnected };
  }

  // ═══════════ داشبورد — پورت دقیق ═══════════
  function getProjectDashboard(projectId) {
    var project = byId('projects', projectId);
    if (!project) throw new Error('پروژه یافت نشد.');
    var finalization = state.finalizationInfos.find(function (f) { return f.projectId === projectId; });
    var operatorsList = listOperators(projectId);
    var sessionsCount = state.studySessions.filter(function (s) { return projectIdOfActivity(s.activityId) === projectId; }).length;
    var latestCalc = getLatestCalculation(projectId);
    var analyses = activitiesOfProject(projectId).map(function (a) { return getActivityAnalysis(a.id); });

    var rows = analyses.map(function (an) {
      var otParts = an.elements.filter(function (e) { return e.ot !== null; });
      return {
        activityId: an.activity.id, stationName: an.activity.stationName, activityName: an.activity.name,
        processType: an.activity.processType, elementsCount: an.elements.length,
        validCycles: an.sampleProgress.validCycles, totalCycles: an.sampleProgress.totalCycles,
        target: an.sampleProgress.targetSampleCount, targetReached: an.sampleProgress.reached,
        otSum: otParts.length === 0 ? null : otParts.length === an.elements.length ? F.round12(otParts.reduce(function (s, e) { return s + e.ot; }, 0)) : null,
        st: an.activityTotal.st, stStatus: an.activityTotal.status, stReason: an.activityTotal.reason,
        suspectsPending: an.suspects.filter(function (s) { return s.validityStatus === 'SUSPECT'; }).length,
      };
    });

    var blocking = rows.filter(function (r) { return r.stStatus !== 'OK'; });
    var stCard = rows.length === 0
      ? { key: 'st', title: 'زمان استاندارد کل پروژه', value: null, unit: 'ثانیه', denominator: null, reason: 'هنوز فعالیتی تعریف نشده است؛ ابتدا ساختار تولید را تکمیل کنید.', note: 'جمع زمان استاندارد فعالیت‌ها', tone: 'INFO' }
      : blocking.length > 0
        ? { key: 'st', title: 'زمان استاندارد کل پروژه', value: null, unit: 'ثانیه', denominator: null, reason: 'استاندارد ' + blocking.length + ' فعالیت از ' + rows.length + ' فعالیت قابل تعیین نیست (' + blocking.slice(0, 3).map(function (r) { return '«' + r.activityName + '»'; }).join('، ') + (blocking.length > 3 ? ' و …' : '') + '). ' + (blocking.some(function (r) { return r.stStatus === 'NEEDS_AGGREGATION_RULE'; }) ? 'فعالیت دارای کار هم‌زمان نیازمند قاعدهٔ تجمیع است؛ جمع ساده ممنوع.' : 'علت رایج: دادهٔ ناکافی یا ارزیابی وستینگهاوس ناقص.'), note: 'جمع زمان استاندارد فعالیت‌ها', tone: 'WARNING' }
        : { key: 'st', title: 'زمان استاندارد کل پروژه', value: F.round12(rows.reduce(function (s, r) { return s + r.st; }, 0)), unit: 'ثانیه', denominator: null, reason: null, note: 'جمع ' + rows.length + ' فعالیت — همهٔ فعالیت‌ها ترتیبی و کامل', tone: 'OK' };

    var cycleCount = 0, weightedSum = 0;
    analyses.forEach(function (an) {
      if (an.cycleStats.stats.mean !== null && an.cycleStats.count > 0) {
        cycleCount += an.cycleStats.count;
        weightedSum += an.cycleStats.stats.mean * an.cycleStats.count;
      }
    });
    var meanCycleCard = cycleCount === 0
      ? { key: 'meanCycle', title: 'میانگین زمان چرخه', value: null, unit: 'ثانیه', denominator: null, reason: rows.length === 0 ? 'فعالیتی تعریف نشده است.' : 'هنوز چرخهٔ کامل معتبری ثبت نشده است؛ در مرحلهٔ زمان‌سنجی داده ثبت کنید.', note: 'زمان سپری‌شدهٔ چرخه‌های قابل استفاده', tone: 'INFO' }
      : { key: 'meanCycle', title: 'میانگین زمان چرخه', value: F.round12(weightedSum / cycleCount), unit: 'ثانیه', denominator: null, reason: null, note: 'از ' + cycleCount + ' چرخهٔ قابل استفاده در کل پروژه — برای فعالیت‌های هم‌زمان، گسترهٔ بازه‌ها ملاک است نه جمع مدت‌ها', tone: 'OK' };

    var totalValid = rows.reduce(function (s, r) { return s + r.validCycles; }, 0);
    var totalCyclesAll = rows.reduce(function (s, r) { return s + r.totalCycles; }, 0);
    var samplesCard = rows.length === 0
      ? { key: 'samples', title: 'تعداد نمونهٔ معتبر', value: null, unit: 'چرخه', denominator: null, reason: 'فعالیتی تعریف نشده است.', note: 'چرخهٔ کامل بدون دادهٔ خارج/نامعتبر', tone: 'INFO' }
      : { key: 'samples', title: 'تعداد نمونهٔ معتبر', value: totalValid, unit: 'چرخه', denominator: null, reason: null, note: totalCyclesAll + ' چرخهٔ ثبت‌شده در ' + sessionsCount + ' جلسه — مبنای شمارش: چرخهٔ کامل بدون مشاهدهٔ خارج‌شده/نامعتبر', tone: totalValid === 0 ? 'WARNING' : 'OK' };

    var withTarget = rows.filter(function (r) { return r.target !== null; });
    var reached = withTarget.filter(function (r) { return r.targetReached === true; });
    var shortfall = withTarget.filter(function (r) { return r.targetReached !== true; }).map(function (r) { return { activityName: r.activityName, valid: r.validCycles, target: r.target }; });
    var targetCard = rows.length === 0
      ? { key: 'target', title: 'وضعیت هدف نمونه', value: null, unit: '', denominator: null, reason: 'فعالیتی تعریف نشده است.', note: 'بر اساس هدف ثبت‌شدهٔ هر فعالیت', tone: 'INFO' }
      : withTarget.length === 0
        ? { key: 'target', title: 'وضعیت هدف نمونه', value: null, unit: '', denominator: null, reason: 'برای هیچ فعالیتی هدف تعداد نمونه ثبت نشده است؛ در مشخصات فعالیت قابل تعیین است.', note: 'بر اساس هدف ثبت‌شدهٔ هر فعالیت', tone: 'WARNING' }
        : shortfall.length === 0
          ? { key: 'target', title: 'وضعیت هدف نمونه', value: reached.length, unit: 'فعالیت', denominator: withTarget.length, reason: null, note: 'هدف همهٔ ' + withTarget.length + ' فعالیت دارای هدف تکمیل شده — توجه: رسیدن به هدف تعداد، تضمین کفایت آماری نیست؛ شاخص‌های پراکندی را بازبینی کنید.', tone: 'OK' }
          : { key: 'target', title: 'وضعیت هدف نمونه', value: reached.length, unit: 'فعالیت', denominator: withTarget.length, reason: shortfall.length + ' فعالیت به هدف نمونه نرسیده است. توجه: هدف، کاربرمحور است و کفایت آماری را تضمین نمی‌کند.', note: shortfall.slice(0, 3).map(function (s) { return '«' + s.activityName + '»: ' + s.valid + '/' + s.target; }).join('، ') + (shortfall.length > 3 ? ' و …' : ''), tone: 'WARNING' };

    var observationStatus = { valid: 0, suspect: 0, excluded: 0, invalid: 0 };
    analyses.forEach(function (an) {
      an.elements.forEach(function (el) {
        observationStatus.valid += el.counts.valid;
        observationStatus.suspect += el.counts.suspect;
        observationStatus.excluded += el.counts.excluded;
        observationStatus.invalid += el.counts.invalid;
      });
    });

    var opAcc = {};
    var operatorNameById = {};
    operatorsList.forEach(function (o) { operatorNameById[o.id] = o.displayName; });
    analyses.forEach(function (an) {
      an.elements.forEach(function (el) {
        el.operators.forEach(function (op) {
          if (!opAcc[op.operatorId]) opAcc[op.operatorId] = { name: operatorNameById[op.operatorId] || 'اپراتور حذف‌شده', observations: 0, suspect: 0, excluded: 0, activities: {}, ratios: [] };
          var acc = opAcc[op.operatorId];
          acc.observations += op.count;
          acc.suspect += op.suspectCount;
          acc.excluded += op.excludedCount;
          if (op.count > 0) acc.activities[an.activity.id] = true;
          if (op.mean !== null && el.ot !== null && el.ot > 0) acc.ratios.push(op.mean / el.ot);
        });
      });
    });
    var operators = Object.keys(opAcc).map(function (oid) {
      var acc = opAcc[oid];
      return {
        operatorId: oid, operatorName: acc.name, observations: acc.observations,
        activitiesCount: Object.keys(acc.activities).length, suspectCount: acc.suspect, excludedCount: acc.excluded,
        relativeIndex: acc.ratios.length > 0 ? F.round12(acc.ratios.reduce(function (s, r) { return s + r; }, 0) / acc.ratios.length) : null,
      };
    }).sort(function (a, b) { return cmpStr(a.operatorName, b.operatorName); });

    var elementCv = [];
    analyses.forEach(function (an) {
      an.elements.forEach(function (el) {
        elementCv.push({ elementName: el.name, activityName: an.activity.name, cvPercent: el.stats.cvPercent, count: el.counts.calcBasis, ot: el.ot });
      });
    });
    elementCv.sort(function (a, b) { return (b.cvPercent === null ? -1 : b.cvPercent) - (a.cvPercent === null ? -1 : a.cvPercent); });
    elementCv = elementCv.slice(0, 20);

    var suspectsByActivity = rows.filter(function (r) { return r.suspectsPending > 0; }).map(function (r) { return { activityName: r.activityName, count: r.suspectsPending }; });
    var elementsWithoutRating = [];
    analyses.forEach(function (an) {
      an.elements.forEach(function (el) { if (!el.rating) elementsWithoutRating.push('«' + el.name + '» (' + an.activity.name + ')'); });
    });

    return {
      project: { id: project.id, name: project.name, lineName: project.lineName, productName: project.productName, studyDate: project.studyDate, finalized: !!finalization },
      settings: { allowanceMethod: analyses[0] ? analyses[0].settings.allowanceMethod : 'PERCENT_OF_NT', aggregationMethod: analyses[0] ? analyses[0].settings.aggregationMethod : 'WEIGHTED_BY_COUNT' },
      cards: [stCard, meanCycleCard, samplesCard, targetCard],
      activities: rows, observationStatus: observationStatus, operators: operators, elementCv: elementCv,
      reviewNeeds: {
        suspectsPending: suspectsByActivity.reduce(function (s, x) { return s + x.count; }, 0),
        suspectsByActivity: suspectsByActivity,
        elementsWithoutRating: elementsWithoutRating.slice(0, 12),
        activitiesNeedingAggregationRule: rows.filter(function (r) { return r.stStatus === 'NEEDS_AGGREGATION_RULE'; }).map(function (r) { return r.activityName; }),
        activitiesIncomplete: rows.filter(function (r) { return r.stStatus === 'INCOMPLETE'; }).map(function (r) { return r.activityName; }),
        sampleShortfall: shortfall,
        needsRecalc: latestCalc.needsRecalc,
        lastCalculationAt: latestCalc.run ? latestCalc.run.createdAt : null,
        lastCalculationStatus: latestCalc.run ? latestCalc.run.status : null,
      },
      cycleSummary: { count: cycleCount, weightedMean: cycleCount > 0 ? F.round12(weightedSum / cycleCount) : null },
      counts: {
        stations: sortStations(projectId).length, activities: rows.length,
        elements: analyses.reduce(function (s, an) { return s + an.elements.length; }, 0),
        operators: operatorsList.length, sessions: sessionsCount,
      },
      generatedAt: U.nowISO(),
    };
  }

  // ═══════════ وضعیت مراحل — پورت دقیق ═══════════
  function computeStageSummary(projectId) {
    var project = byId('projects', projectId);
    var stations = sortStations(projectId);
    var activities = activitiesOfProject(projectId);
    var elements = [];
    activities.forEach(function (a) { elements = elements.concat(sortElements(a.id)); });
    var operators = listOperators(projectId);
    var groups = listGroups(projectId);
    var categories = listCategories(projectId);
    var assessments = state.ratingAssessments.filter(function (r) {
      return elements.some(function (e) { return e.id === r.workElementId; });
    });
    var sessions = state.studySessions.filter(function (s) { return activities.some(function (a) { return a.id === s.activityId; }); });
    var finalized = !!(project && state.finalizationInfos.find(function (f) { return f.projectId === projectId; }));
    var chartsState = getChartsStageState(projectId);

    var elementCount = elements.length;
    var elementsWithRating = assessments.length;

    var validCycles = 0, suspectCount = 0;
    sessions.forEach(function (se) {
      cyclesOfSession(se.id).forEach(function (c) {
        var obs = obsOfCycle(c.id);
        var bad = obs.some(function (o) { return o.validityStatus === 'EXCLUDED' || o.validityStatus === 'INVALID'; });
        var act = byId('activities', se.activityId);
        var actElements = act ? sortElements(act.id) : [];
        var actComplete = actElements.length > 0 && actElements.every(function (el) { return obs.some(function (o) { return o.workElementId === el.id && o.derivedDuration !== null; }); });
        if (actComplete && !bad) validCycles++;
        suspectCount += obs.filter(function (o) { return o.validityStatus === 'SUSPECT'; }).length;
      });
    });

    var activitiesWithoutElements = activities.filter(function (a) { return sortElements(a.id).length === 0; });
    var stages = {};

    stages.info = project && project.studyDate
      ? { status: 'DONE', hint: 'مشخصات اصلی پروژه تکمیل شده است.' }
      : { status: 'IN_PROGRESS', hint: 'تاریخ مطالعه را در مشخصات پروژه ثبت کنید.' };

    if (stations.length === 0) stages.structure = { status: 'PENDING', hint: 'هنوز ایستگاهی ثبت نشده است.' };
    else if (activities.length === 0) stages.structure = { status: 'IN_PROGRESS', hint: 'برای ایستگاه‌ها فعالیت ثبت کنید.' };
    else if (activitiesWithoutElements.length > 0) stages.structure = { status: 'NEEDS_REVIEW', hint: activitiesWithoutElements.length + ' فعالیت بدون عنصر کاری است؛ عناصر را تکمیل کنید.' };
    else stages.structure = { status: 'DONE', hint: 'ساختار خط، ایستگاه‌ها و فعالیت‌ها کامل است.' };

    stages.operators = operators.length
      ? { status: 'DONE', hint: 'اپراتورهای مطالعه ثبت شده‌اند.' }
      : { status: 'PENDING', hint: 'حداقل یک اپراتور برای زمان‌سنجی لازم است.' };

    var activeCategories = categories.filter(function (c) { return c.isActive; }).length;
    if (activeCategories === 0 && groups.length === 0) stages.allowances = { status: 'PENDING', hint: 'دسته مجاز و گروه فعالیت تعریف نشده است.' };
    else if (groups.length === 0) stages.allowances = { status: 'IN_PROGRESS', hint: 'دسته‌ها ثبت شده؛ گروه فعالیت بسازید.' };
    else {
      var activeCatIds = {};
      categories.forEach(function (c) { if (c.isActive) activeCatIds[c.id] = true; });
      var groupsWithoutValues = groups.filter(function (g) {
        return g.allowances.filter(function (ga) { return activeCatIds[ga.categoryId]; }).length === 0;
      }).length;
      stages.allowances = groupsWithoutValues > 0
        ? { status: 'IN_PROGRESS', hint: groupsWithoutValues + ' گروه بدون مقدار مجاز فعال است.' }
        : { status: 'DONE', hint: 'گروه‌ها و دسته‌های مجاز تکمیل شده‌اند.' };
    }

    if (elementCount === 0) stages.westinghouse = { status: 'PENDING', hint: 'ابتدا عناصر کاری را در ساختار تولید تعریف کنید.' };
    else if (elementsWithRating === 0) stages.westinghouse = { status: 'PENDING', hint: 'هیچ عنصری ارزیابی نشده است.' };
    else if (elementsWithRating < elementCount) stages.westinghouse = { status: 'IN_PROGRESS', hint: elementsWithRating + ' از ' + elementCount + ' عنصر ارزیابی شده است.' };
    else stages.westinghouse = { status: 'DONE', hint: 'همه عناصر کاری ارزیابی شده‌اند.' };

    var activitiesWithElements = {};
    elements.forEach(function (e) { activitiesWithElements[e.activityId] = true; });
    var sessionActivityIds = {};
    sessions.forEach(function (s) { sessionActivityIds[s.activityId] = true; });
    var activitiesMissingSessions = activities.filter(function (a) { return activitiesWithElements[a.id] && !sessionActivityIds[a.id]; });
    if (elementCount === 0 || operators.length === 0) stages.timing = { status: 'PENDING', hint: 'برای زمان‌سنجی، ابتدا عناصر کاری و اپراتورها را تکمیل کنید.' };
    else if (sessions.length === 0) stages.timing = { status: 'PENDING', hint: 'هنوز جلسه‌ای ایجاد نشده است؛ جلسه = فعالیت × اپراتور × روش.' };
    else if (validCycles === 0) stages.timing = { status: 'IN_PROGRESS', hint: 'جلسه‌ها ایجاد شده‌اند؛ چرخه‌ها را در برگه ثبت کنید.' };
    else if (activitiesMissingSessions.length > 0) stages.timing = { status: 'NEEDS_REVIEW', hint: activitiesMissingSessions.length + ' فعالیت دارای عنصر، هنوز جلسه زمان‌سنجی ندارد.' };
    else stages.timing = { status: 'DONE', hint: 'تاکنون ' + validCycles + ' چرخهٔ معتبر ثبت شده است.' };

    if (validCycles === 0) stages.analysis = { status: 'PENDING', hint: 'برای تحلیل، ابتدا چرخهٔ معتبر در زمان‌سنجی ثبت کنید.' };
    else if (suspectCount > 0) stages.analysis = { status: 'NEEDS_REVIEW', hint: suspectCount + ' مشاهدهٔ مشکوک نیازمند تصمیم شماست (نگه‌داشتن یا خروج از محاسبات).' };
    else if (elementsWithRating < elementCount) stages.analysis = { status: 'IN_PROGRESS', hint: elementsWithRating + ' از ' + elementCount + ' عنصر ارزیابی وستینگهاوس دارد؛ بدون آن NT/ST قابل محاسبه نیست.' };
    else stages.analysis = { status: 'DONE', hint: 'تحلیل کامل است؛ ' + validCycles + ' چرخهٔ معتبر در محاسبات است. وضعیت هدف نمونه را در نمای تحلیل بازبینی کنید.' };

    if (chartsState.activitiesCount === 0) stages.charts = { status: 'PENDING', hint: 'برای ساخت نمودار، ابتدا فعالیت‌ها را در ساختار تولید تعریف کنید.' };
    else if (chartsState.opcNodes === 0) stages.charts = { status: 'IN_PROGRESS', hint: 'نمودار با بازکردن این مرحله به‌صورت خودکار از فعالیت‌ها ساخته می‌شود.' };
    else if (chartsState.unconnectedOpc > 0) stages.charts = { status: 'NEEDS_REVIEW', hint: chartsState.unconnectedOpc + ' گره بدون اتصال در نمودار است؛ توالی گره‌ها را کامل کنید.' };
    else stages.charts = { status: 'DONE', hint: 'نمودار فرایند ساخته شده و توالی کامل است (' + chartsState.opcNodes + ' گره).' };

    if (validCycles === 0) stages.dashboard = { status: 'PENDING', hint: 'برای مشاهدهٔ کارت‌ها و شاخص‌های تخصصی، ابتدا دادهٔ زمان‌سنجی ثبت کنید.' };
    else if (suspectCount > 0) stages.dashboard = { status: 'NEEDS_REVIEW', hint: suspectCount + ' مشاهدهٔ مشکوک نیازمند تصمیم است؛ تا بازبینی، شاخص‌های داشبورد بر مبنای آن‌ها محاسبه می‌شود.' };
    else if (elementsWithRating < elementCount) stages.dashboard = { status: 'IN_PROGRESS', hint: 'دادهٔ زمان‌سنجی موجود است؛ برای محاسبهٔ NT/ST در کارت‌ها، ارزیابی وستینگهاوس همهٔ عناصر لازم است.' };
    else stages.dashboard = { status: 'DONE', hint: 'داشبورد آماده است؛ کارت‌ها و شاخص‌ها هر بار از جدیدترین داده محاسبه می‌شوند.' };

    if (validCycles === 0) stages.reports = { status: 'PENDING', hint: 'برای تهیهٔ گزارش Excel/PDF، ابتدا دادهٔ زمان‌سنجی ثبت کنید.' };
    else if (suspectCount > 0) stages.reports = { status: 'NEEDS_REVIEW', hint: suspectCount + ' مشاهدهٔ مشکوک بازبینی نشده است؛ گزارش رسمی باید وضعیت بازبینی را شفاف بیان کند.' };
    else stages.reports = { status: 'DONE', hint: 'مرکز گزارش‌ها آماده است؛ خروجی Excel برای تحلیل و PDF برای گزارش رسمی.' };

    stages.data = { status: state.backups.length > 0 ? 'DONE' : 'PENDING', hint: state.backups.length > 0 ? 'حداقل یک نسخهٔ پشتیبان ثبت شده است.' : 'هنوز نسخهٔ پشتیبانی ثبت نشده است.' };

    var activeKeys = ['info', 'structure', 'operators', 'allowances', 'westinghouse', 'timing', 'analysis', 'charts', 'dashboard', 'reports'];
    function weight(s) { return s.status === 'DONE' ? 1 : (s.status === 'IN_PROGRESS' || s.status === 'NEEDS_REVIEW') ? 0.5 : 0; }
    var progress = activeKeys.reduce(function (sum, k) { return sum + weight(stages[k]); }, 0) / activeKeys.length;

    return {
      stages: stages, progress: progress,
      counts: {
        stations: stations.length, activities: activities.length, elements: elementCount,
        operators: operators.length, groups: groups.length, categories: categories.length,
        elementsWithRating: elementsWithRating, finalized: finalized,
      },
    };
  }

  // ═══════════ سریال‌سازی / بسته / پشتیبان ═══════════
  var SINGULAR = {
    projects: 'project', projectSettings: 'projectSetting', stations: 'station', activities: 'activity',
    workElements: 'workElement', activityGroups: 'activityGroup', allowanceCategories: 'allowanceCategory',
    groupAllowances: 'groupAllowance', activityAllowanceOverrides: 'activityAllowanceOverride',
    allowanceDefinitions: 'allowanceDefinition', allowanceAssignments: 'allowanceAssignment',
    operators: 'operator', studySessions: 'studySession', cycleObservations: 'cycleObservation',
    timelineLanes: 'timelineLane', elementObservations: 'elementObservation',
    ratingTables: 'ratingTable', ratingTableGrades: 'ratingTableGrade', ratingAssessments: 'ratingAssessment',
    calculationRuns: 'calculationRun', chartNodes: 'chartNode', chartEdges: 'chartEdge', finalizationInfos: 'finalizationInfo',
    // جلسه ۲ — روابط موازی و مقادیر هم‌پوشانی
    overlapRelations: 'overlapRelation', observationOverlaps: 'observationOverlap',
  };
  var PLURAL = {};
  Object.keys(SINGULAR).forEach(function (p) { PLURAL[SINGULAR[p]] = p; });
  var DOMAIN_ORDER = ['projects', 'projectSettings', 'stations', 'activityGroups', 'allowanceDefinitions', 'allowanceCategories', 'operators', 'ratingTables', 'activities', 'ratingTableGrades', 'groupAllowances', 'activityAllowanceOverrides', 'workElements', 'allowanceAssignments', 'studySessions', 'ratingAssessments', 'cycleObservations', 'timelineLanes', 'elementObservations', 'overlapRelations', 'observationOverlaps', 'chartNodes', 'chartEdges', 'calculationRuns', 'finalizationInfos'];

  function dumpDomain(projectId) {
    var snap = {};
    DOMAIN_ORDER.forEach(function (plural) {
      var rows = state[plural];
      if (projectId) {
        if (plural === 'projects') rows = rows.filter(function (r) { return r.id === projectId; });
        else if (['projectSettings', 'stations', 'activityGroups', 'allowanceCategories', 'allowanceDefinitions', 'operators', 'ratingTables', 'chartNodes', 'chartEdges', 'calculationRuns', 'finalizationInfos'].indexOf(plural) >= 0) {
          rows = rows.filter(function (r) { return r.projectId === projectId; });
        } else if (plural === 'activities') {
          var stIds = {};
          sortStations(projectId).forEach(function (s) { stIds[s.id] = true; });
          rows = rows.filter(function (r) { return stIds[r.stationId]; });
        } else if (plural === 'workElements' || plural === 'studySessions' || plural === 'activityAllowanceOverrides') {
          var actIds = {};
          activitiesOfProject(projectId).forEach(function (a) { actIds[a.id] = true; });
          rows = rows.filter(function (r) { return actIds[r.activityId]; });
        } else if (plural === 'ratingTableGrades') {
          var tIds = {};
          filterBy('ratingTables', 'projectId', projectId).forEach(function (t) { tIds[t.id] = true; });
          rows = rows.filter(function (r) { return tIds[r.ratingTableId]; });
        } else if (plural === 'groupAllowances') {
          var gIds = {};
          filterBy('activityGroups', 'projectId', projectId).forEach(function (x) { gIds[x.id] = true; });
          rows = rows.filter(function (r) { return gIds[r.groupId]; });
        } else if (plural === 'allowanceAssignments') {
          var defIds = {};
          filterBy('allowanceDefinitions', 'projectId', projectId).forEach(function (d) { defIds[d.id] = true; });
          rows = rows.filter(function (r) { return defIds[r.definitionId]; });
        } else if (plural === 'ratingAssessments') {
          var eIds = {};
          activitiesOfProject(projectId).forEach(function (a) { sortElements(a.id).forEach(function (e) { eIds[e.id] = true; }); });
          rows = rows.filter(function (r) { return eIds[r.workElementId]; });
        } else if (plural === 'cycleObservations') {
          var sIds = {};
          state.studySessions.forEach(function (s) { if (projectIdOfActivity(s.activityId) === projectId) sIds[s.id] = true; });
          rows = rows.filter(function (r) { return sIds[r.sessionId]; });
        } else if (plural === 'timelineLanes' || plural === 'elementObservations') {
          var cIds = {};
          state.cycleObservations.forEach(function (c) {
            var se = byId('studySessions', c.sessionId);
            if (se && projectIdOfActivity(se.activityId) === projectId) cIds[c.id] = true;
          });
          rows = rows.filter(function (r) { return cIds[r.cycleId]; });
        } else if (plural === 'observationOverlaps') {
          // جلسه ۲ — مقدار هر رابطه در چرخه‌های همین پروژه
          var ovRelIds = {};
          state.overlapRelations.forEach(function (r) { if (r.projectId === projectId) ovRelIds[r.id] = true; });
          var ovCIds = {};
          state.cycleObservations.forEach(function (c) {
            var se = byId('studySessions', c.sessionId);
            if (se && projectIdOfActivity(se.activityId) === projectId) ovCIds[c.id] = true;
          });
          rows = rows.filter(function (r) { return ovRelIds[r.relationId] && ovCIds[r.cycleId]; });
        }
      }
      snap[SINGULAR[plural]] = rows.map(function (r) { return Object.assign({}, r); });
    });
    return snap;
  }

  function checksumOf(data) {
    var canonical = JSON.stringify(data);
    return g.crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical)).then(function (digest) {
      return Array.from(new Uint8Array(digest)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
    });
  }

  function exportProjectPackage(projectId) {
    var project = byId('projects', projectId);
    if (!project) throw new Error('پروژه یافت نشد.');
    var data = dumpDomain(projectId);
    var manifest = {
      format: 'timing-project-package', schemaVersion: CONST.SCHEMA_VERSION,
      createdAt: U.nowISO(), appVersion: 'offline-1.0.0',
      includes: ['settings', 'structure', 'operators', 'groupsAndAllowances', 'ratingTables', 'rawObservations', 'overlaps', 'charts', 'calculations'],
      projectName: project.name,
    };
    return checksumOf({ manifest: manifest, data: data }).then(function (sum) {
      recordAudit({ entityType: 'Project', entityId: projectId, action: 'EXPORT', entityName: project.name, after: { checksum: sum }, projectId: projectId });
      commit();
      return { manifest: manifest, project: Object.assign({}, project), data: data, checksum: sum };
    });
  }

  function validateProjectPackage(parsed) {
    if (!parsed || !parsed.manifest || parsed.manifest.format !== 'timing-project-package') {
      throw new Error('این فایل یک بسته پروژه معتبر این نرم‌افزار نیست.');
    }
    if (parsed.manifest.schemaVersion > CONST.SCHEMA_VERSION) {
      throw new Error('نسخه ساختار بسته (' + parsed.manifest.schemaVersion + ') از نسخه فعلی (' + CONST.SCHEMA_VERSION + ') جدیدتر است.');
    }
    if (!parsed.data || typeof parsed.data !== 'object' || !parsed.project) {
      throw new Error('ساختار داده بسته نامعتبر است.');
    }
    return checksumOf({ manifest: parsed.manifest, data: parsed.data }).then(function (actual) {
      if (actual !== parsed.checksum) {
        throw new Error('checksum بسته با محتوای آن مطابقت ندارد؛ فایل آسیب دیده است.');
      }
      var stations = parsed.data.station || [];
      var activities = parsed.data.activity || [];
      var stationIds = {};
      stations.forEach(function (s) { stationIds[s.id] = true; });
      for (var i = 0; i < activities.length; i++) {
        if (typeof activities[i].stationId === 'string' && !stationIds[activities[i].stationId]) {
          throw new Error('ارجاع فعالیت به ایستگاه ناموجود در بسته یافت شد.');
        }
      }
      return parsed;
    });
  }

  var FK_MAP = {
    project: [], projectSetting: ['projectId'], station: ['projectId'], activityGroup: ['projectId'],
    allowanceCategory: ['projectId'], allowanceDefinition: ['projectId'], operator: ['projectId'], ratingTable: ['projectId'],
    activity: ['stationId', 'groupId'], ratingTableGrade: ['ratingTableId'],
    groupAllowance: ['groupId', 'categoryId'], activityAllowanceOverride: ['activityId', 'categoryId'],
    allowanceAssignment: ['definitionId'],
    workElement: ['activityId'], studySession: ['activityId', 'operatorId'],
    ratingAssessment: ['workElementId', 'ratingTableId'], cycleObservation: ['sessionId'],
    timelineLane: ['cycleId'], elementObservation: ['cycleId', 'workElementId', 'laneId'],
    overlapRelation: ['projectId', 'elementLowId', 'elementHighId'],
    observationOverlap: ['relationId', 'cycleId'],
    chartNode: ['projectId', 'activityId'], chartEdge: ['projectId', 'sourceNodeId', 'targetNodeId'],
    calculationRun: ['projectId'], finalizationInfo: ['projectId'],
  };
  var NULLABLE_FKS = { 'activity.groupId': true, 'chartNode.activityId': true, 'elementObservation.laneId': true, 'overlapRelation.elementLowId': true, 'overlapRelation.elementHighId': true, 'chartEdge.sourceAnchor': true, 'chartEdge.targetAnchor': true };
  var ASSIGNMENT_SCOPE_TABLE = { PROJECT: 'project', STATION: 'station', ACTIVITY: 'activity', WORK_ELEMENT: 'workElement' };
  function reverseFkTable(fk) {
    return { projectId: 'project', stationId: 'station', groupId: 'activityGroup', categoryId: 'allowanceCategory', definitionId: 'allowanceDefinition', activityId: 'activity', ratingTableId: 'ratingTable', operatorId: 'operator', workElementId: 'workElement', sessionId: 'studySession', cycleId: 'cycleObservation', laneId: 'timelineLane', sourceNodeId: 'chartNode', targetNodeId: 'chartNode' }[fk];
  }
  function remapProjectData(data) {
    var idMap = {};
    Object.keys(FK_MAP).forEach(function (table) {
      (data[table] || []).forEach(function (row) {
        idMap[table + ':' + row.id] = U.uid();
      });
    });
    var out = {};
    Object.keys(FK_MAP).forEach(function (table) {
      var rows = data[table] || [];
      var kept = [];
      rows.forEach(function (row) {
        var newRow = Object.assign({}, row);
        newRow.id = idMap[table + ':' + row.id] || row.id;
        var drop = false;
        FK_MAP[table].forEach(function (fk) {
          var oldFk = row[fk];
          if (oldFk === null || oldFk === undefined) { newRow[fk] = null; return; }
          var mapped = idMap[reverseFkTable(fk) + ':' + oldFk];
          if (mapped) newRow[fk] = mapped;
          else if (NULLABLE_FKS[table + '.' + fk]) newRow[fk] = null;
          else drop = true;
        });
        if (!drop && table === 'allowanceAssignment') {
          var scopeTable = ASSIGNMENT_SCOPE_TABLE[row.scopeType];
          var mappedScope = scopeTable ? idMap[scopeTable + ':' + row.scopeId] : undefined;
          if (mappedScope) newRow.scopeId = mappedScope;
          else drop = true;
        }
        if (!drop) kept.push(newRow);
      });
      out[table] = kept;
    });
    return out;
  }
  function loadDomainData(data) {
    Object.keys(FK_MAP).forEach(function (table) {
      var plural = PLURAL[table];
      if (!plural) return;
      (data[table] || []).forEach(function (row) { state[plural].push(row); });
    });
  }
  function importProjectPackage(parsed) {
    var newName = String(parsed.project.name) + ' (ورودی)';
    var data = remapProjectData(parsed.data);
    if (data.project && data.project[0]) {
      data.project[0].name = newName;
      data.project[0].createdAt = U.nowISO();
      data.project[0].updatedAt = U.nowISO();
    }
    delete data.finalizationInfo;
    loadDomainData(data);
    var newProjectId = data.project && data.project[0] ? data.project[0].id : '';
    if (!data.ratingTable || data.ratingTable.length === 0) getOrCreateSeedTable(newProjectId);
    migrateProjectAllowancesIfNeeded(newProjectId, state);
    recordAudit({ entityType: 'Project', entityId: newProjectId, action: 'IMPORT', entityName: newName, after: { source: parsed.manifest.projectName }, projectId: newProjectId });
    commit();
    return { projectId: newProjectId, name: newName };
  }
  function duplicateProject(projectId, newProjectName, sections) {
    var project = byId('projects', projectId);
    if (!project) throw new Error('پروژه یافت نشد.');
    var selected = ['project', 'projectSetting'];
    if (sections.structure) selected = selected.concat(['station', 'activity', 'workElement', 'activityAllowanceOverride', 'chartNode', 'chartEdge']);
    if (sections.operators) selected.push('operator');
    if (sections.groupsAndAllowances) selected = selected.concat(['activityGroup', 'allowanceCategory', 'groupAllowance', 'allowanceDefinition', 'allowanceAssignment']);
    if (sections.ratingTables) selected = selected.concat(['ratingTable', 'ratingTableGrade', 'ratingAssessment']);
    if (sections.rawObservations) selected = selected.concat(['studySession', 'cycleObservation', 'timelineLane', 'elementObservation']);
    var full = dumpDomain(projectId);
    var data = {};
    selected.forEach(function (t) { data[t] = full[t] || []; });
    var remapped = remapProjectData(data);
    if (remapped.project && remapped.project[0]) {
      remapped.project[0].name = newProjectName;
      remapped.project[0].createdAt = U.nowISO();
      remapped.project[0].updatedAt = U.nowISO();
    }
    delete remapped.finalizationInfo;
    loadDomainData(remapped);
    var newId = remapped.project && remapped.project[0] ? remapped.project[0].id : '';
    if (!remapped.ratingTable || remapped.ratingTable.length === 0) getOrCreateSeedTable(newId);
    // مبدأ مهاجرت‌نشده (داده قدیمی) — مهاجرت idempotent (§۴)
    migrateProjectAllowancesIfNeeded(newId, state);
    recordAudit({ entityType: 'Project', entityId: newId, action: 'DUPLICATE', entityName: newProjectName, after: { sourceProjectId: projectId, sections: sections }, projectId: newId });
    commit();
    return { projectId: newId };
  }

  // ═══════════ پشتیبان‌گیری ═══════════
  function createBackup(kind, note) {
    var snapshot = dumpDomain(null);
    var snapshotJson = JSON.stringify(snapshot);
    var settings = getAppSettings();
    var retention = parseInt(settings['backup.retention'], 10) || 10;
    var record = {
      id: U.uid(),
      fileName: 'timing-backup-' + U.nowISO().replace(/[:.]/g, '-') + '.json',
      kind: kind || 'MANUAL',
      sizeBytes: snapshotJson.length,
      checksum: null,
      schemaVersion: CONST.SCHEMA_VERSION,
      projectCount: state.projects.length,
      createdAt: U.nowISO(),
      note: note || null,
    };
    return checksumOf(snapshot).then(function (sum) {
      record.checksum = sum;
      state.backups.push({ record: record, snapshotJson: snapshotJson });
      if (kind === 'AUTO') {
        var autos = state.backups.filter(function (b) { return b.record.kind === 'AUTO'; }).sort(function (a, b) { return a.record.createdAt < b.record.createdAt ? -1 : 1; });
        while (autos.length > retention) {
          var oldest = autos.shift();
          state.backups = state.backups.filter(function (b) { return b !== oldest; });
        }
      }
      dirtySinceBackup = false;
      recordAudit({ entityType: 'BackupRecord', entityId: record.id, action: 'BACKUP', entityName: record.fileName, after: { kind: record.kind, sizeBytes: record.sizeBytes } });
      commit();
      return record;
    });
  }
  function listBackups() {
    return state.backups.slice().sort(function (a, b) { return a.record.createdAt < b.record.createdAt ? 1 : -1; }).map(function (b) { return b.record; });
  }
  function deleteBackup(id) {
    var b = state.backups.find(function (x) { return x.record.id === id; });
    state.backups = state.backups.filter(function (x) { return x.record.id !== id; });
    if (b) recordAudit({ entityType: 'BackupRecord', entityId: id, action: 'DELETE', entityName: b.record.fileName });
    commit();
  }
  function applyDeletionMarkersToSnapshot(snapshot) {
    var FK_DEPS = {
      projectSetting: [{ t: 'project', fk: 'projectId' }], station: [{ t: 'project', fk: 'projectId' }],
      activityGroup: [{ t: 'project', fk: 'projectId' }], allowanceCategory: [{ t: 'project', fk: 'projectId' }],
      operator: [{ t: 'project', fk: 'projectId' }], ratingTable: [{ t: 'project', fk: 'projectId' }],
      activity: [{ t: 'station', fk: 'stationId' }], ratingTableGrade: [{ t: 'ratingTable', fk: 'ratingTableId' }],
      groupAllowance: [{ t: 'activityGroup', fk: 'groupId' }, { t: 'allowanceCategory', fk: 'categoryId' }],
      activityAllowanceOverride: [{ t: 'activity', fk: 'activityId' }, { t: 'allowanceCategory', fk: 'categoryId' }],
      workElement: [{ t: 'activity', fk: 'activityId' }], studySession: [{ t: 'activity', fk: 'activityId' }, { t: 'operator', fk: 'operatorId' }],
      ratingAssessment: [{ t: 'workElement', fk: 'workElementId' }, { t: 'ratingTable', fk: 'ratingTableId' }],
      cycleObservation: [{ t: 'studySession', fk: 'sessionId' }], timelineLane: [{ t: 'cycleObservation', fk: 'cycleId' }],
      elementObservation: [{ t: 'cycleObservation', fk: 'cycleId' }, { t: 'workElement', fk: 'workElementId' }],
      chartNode: [{ t: 'project', fk: 'projectId' }], chartEdge: [{ t: 'chartNode', fk: 'sourceNodeId' }, { t: 'chartNode', fk: 'targetNodeId' }],
      calculationRun: [{ t: 'project', fk: 'projectId' }], finalizationInfo: [{ t: 'project', fk: 'projectId' }],
    };
    var ENTITY_OF_TABLE = { project: 'Project', station: 'Station', activity: 'Activity', workElement: 'WorkElement', operator: 'Operator', activityGroup: 'ActivityGroup', allowanceCategory: 'AllowanceCategory', ratingTable: 'RatingTable', studySession: 'StudySession' };
    Object.keys(snapshot).forEach(function (table) {
      var entity = ENTITY_OF_TABLE[table];
      if (entity) snapshot[table] = snapshot[table].filter(function (row) { return !isDeleted(entity, row.id); });
    });
    for (var pass = 0; pass < 3; pass++) {
      Object.keys(FK_DEPS).forEach(function (table) {
        if (!snapshot[table]) return;
        snapshot[table] = snapshot[table].filter(function (row) {
          return FK_DEPS[table].every(function (dep) {
            if (row[dep.fk] === null || row[dep.fk] === undefined) return true;
            var parents = snapshot[dep.t] || [];
            return parents.some(function (p) { return p.id === row[dep.fk]; });
          });
        });
      });
    }
    return snapshot;
  }
  function restoreSnapshot(snapshot) {
    return createBackup('PRE_RESTORE', 'پیش از بازیابی خودکار ایجاد شد').then(function () {
      DOMAIN_ORDER.forEach(function (plural) { state[plural] = []; });
      loadDomainData(snapshot);
      recordAudit({ entityType: 'BackupRecord', entityId: 'restore', action: 'RESTORE', entityName: 'بازیابی پشتیبان', after: { projectCount: snapshot.project ? snapshot.project.length : 0 } });
      commit();
    });
  }
  function restoreBackup(id) {
    var b = state.backups.find(function (x) { return x.record.id === id; });
    if (!b) throw new Error('نسخه پشتیبان یافت نشد.');
    var snapshot = JSON.parse(b.snapshotJson);
    snapshot = applyDeletionMarkersToSnapshot(snapshot);
    return restoreSnapshot(snapshot);
  }
  function restoreBackupFromJson(parsed) {
    if (!parsed || parsed.format !== 'timing-offline-backup' || !parsed.snapshot) {
      throw new Error('فایل پشتیبان معتبر نیست.');
    }
    return checksumOf(parsed.snapshot).then(function (actual) {
      if (actual !== parsed.checksum) throw new Error('checksum پشتیبان با محتوای آن مطابقت ندارد؛ فایل آسیب دیده است.');
      var snapshot = applyDeletionMarkersToSnapshot(parsed.snapshot);
      return restoreSnapshot(snapshot);
    });
  }
  function backupFileContent(id) {
    var b = state.backups.find(function (x) { return x.record.id === id; });
    if (!b) throw new Error('نسخه پشتیبان یافت نشد.');
    return JSON.stringify({ format: 'timing-offline-backup', createdAt: b.record.createdAt, record: b.record, snapshot: JSON.parse(b.snapshotJson), checksum: b.record.checksum });
  }
  function autoBackupTick() {
    var settings = getAppSettings();
    if (settings['backup.autoEnabled'] !== 'true') return Promise.resolve(null);
    if (!dirtySinceBackup) return Promise.resolve(null);
    var intervalMin = parseInt(settings['backup.intervalMinutes'], 10) || 30;
    var lastRaw = g.localStorage ? g.localStorage.getItem('timing2-last-backup-at') : null;
    var last = lastRaw ? new Date(lastRaw).getTime() : 0;
    if (Date.now() - last < intervalMin * 60 * 1000) return Promise.resolve(null);
    if (g.localStorage) g.localStorage.setItem('timing2-last-backup-at', new Date().toISOString());
    return createBackup('AUTO').then(function (r) {
      if (typeof g.T2Toast === 'function') g.T2Toast('پشتیبان‌گیری خودکار انجام شد', { description: 'نسخه پشتیبان در حافظهٔ همین مرورگر ذخیره شد.' });
      return r;
    });
  }

  // ═══════════ داده دمو ═══════════
  function seedDemo() {
    var p = createProject({
      name: 'دمو تحلیل — خط مونتاژ پمپ آب',
      lineName: 'خط مونتاژ ۱', productName: 'پمپ آب مدل A',
      studyDate: U.jalaliToISO(1404, 8, 13),
      description: 'پروژه نمایشی برای تست نسخهٔ آفلاین — شامل ساختار کامل، ارزیابی وستینگهاوس، دو جلسهٔ زمان‌سنجی و دادهٔ مشکوک.',
    });
    var projectId = p.id;

    var st1 = createStation(projectId, { name: 'ایستگاه مونتاژ بدنه', description: 'مونتاژ بدنه و روتور پمپ' });
    var st2 = createStation(projectId, { name: 'ایستگاه کنترل نهایی', description: 'بازرسی عملکرد و آب‌بندی' });

    // الونس‌ها — مدل سلسله‌مراتبی (جلسه اول): تعریف مرکزی + گروه فقط طبقه‌بندی
    var def1 = createAllowanceDefinition(projectId, { title: 'استراحت شخصی', code: 'PF', defaultValueType: 'PERCENT', defaultValuePercent: 0.05, sortOrder: 0 });
    var def2 = createAllowanceDefinition(projectId, { title: 'نیازهای طبیعی', code: 'NF', defaultValueType: 'PERCENT', defaultValuePercent: 0.03, sortOrder: 1 });
    var def3 = createAllowanceDefinition(projectId, { title: 'مزاحمت کاری', code: 'WI', isActive: true, sortOrder: 2 });
    var grp = createGroup(projectId, { name: 'کار دستی سبک', description: 'مونتاژ با ابزار دستی و پیچ‌گوشتی برقی' });

    var act1 = createActivity(st1.id, { name: 'بستن درب پنل', description: 'بستن ۴ پیچ با پیچ‌گوشتی برقی', processType: 'OPERATION', groupId: grp.id, targetSampleCount: 10 });
    // معادل مقادیر قدیمی گروه: ۵٪ + ۳٪ → تخصیص سطح فعالیت (P=0.08)
    putScopeAllowanceOps('ACTIVITY', act1.id, [
      { definitionId: def1.definition ? def1.definition.id : def1.id, action: 'SET', valueType: 'PERCENT', percentValue: 0.05 },
      { definitionId: def2.definition ? def2.definition.id : def2.id, action: 'SET', valueType: 'PERCENT', percentValue: 0.03 },
    ]);
    var act2 = createActivity(st1.id, { name: 'پرس اتوماتیک روتور', description: 'پرس کوبی روتور روی شفت', processType: 'OPERATION' });
    var act3 = createActivity(st2.id, { name: 'کنترل کیفیت نهایی', description: 'بازرسی عملکرد و آب‌بندی', processType: 'INSPECTION' });

    var e1 = createElement(act1.id, { name: 'برداشتن قطعه از گراناق' });
    var e2 = createElement(act1.id, { name: 'بستن چهار پیچ' });
    var e3 = createElement(act1.id, { name: 'پرس اتوماتیک' });
    var e4 = createElement(act2.id, { name: 'پرس کوبی روتور' });
    var e5 = createElement(act3.id, { name: 'بازرسی آب‌بندی' });
    // v1.5.0 §۳.۲ — پیش‌فرض‌های فنی seed برابر نگاشت قدیمی نوع عنصر (برای دادهٔ نمونه)
    e3.defaultEntryMode = 'INT'; e3.defaultLaneType = 'MACHINE';
    e4.defaultEntryMode = 'INT'; e4.defaultLaneType = 'MACHINE';

    var op1 = createOperator(projectId, { displayName: 'رضا محمدی', code: 'P-1042', notes: 'سابقه ۵ سال روی این ایستگاه' });
    var op2 = createOperator(projectId, { displayName: 'سمیه کریمی', code: 'P-1077' });

    // ارزیابی وستینگهاوس — R=1.09 برای e1 (S=+0.06, E=+0.02, C=0, Cons=+0.01) — آزمون مرجع PRD
    var table = getOrCreateSeedTable(projectId);
    saveElementRating(e1.id, { ratingTableId: table.id, skillGrade: 'C1', effortGrade: 'C2', conditionsGrade: 'D', consistencyGrade: 'C', notes: 'مبنا: مشاهسه سه چرخه در شیفت صبح' });
    saveElementRating(e2.id, { ratingTableId: table.id, skillGrade: 'C2', effortGrade: 'C2', conditionsGrade: 'D', consistencyGrade: 'D' });
    saveElementRating(e3.id, { ratingTableId: table.id, skillGrade: 'D', effortGrade: 'D', conditionsGrade: 'D', consistencyGrade: 'C' });
    saveElementRating(e4.id, { ratingTableId: table.id, skillGrade: 'C2', effortGrade: 'D', conditionsGrade: 'D', consistencyGrade: 'D' });
    saveElementRating(e5.id, { ratingTableId: table.id, skillGrade: 'C1', effortGrade: 'C2', conditionsGrade: 'C', consistencyGrade: 'C' });

    // جلسه ۱: رضا محمدی — برگشت به صفر، ۸ چرخه (با یک outlier 30.5)
    var s1 = createSession(act1.id, { operatorId: op1.id, timingMethod: 'SNAPBACK', notes: 'نوبت صبح، شرایط عادی کارگاه' });
    addCycles(s1.id, 8);
    var snap = [
      [8.2, 12.1, 6.4], [8.4, 11.8, 6.6], [8.1, 12.3, 6.5], [8.3, 12.0, 6.4],
      [8.2, 30.5, 6.5], [8.4, 12.2, 6.7], [8.1, 11.9, 6.3], [8.3, 12.4, 6.6],
    ];
    var cells1 = [];
    snap.forEach(function (row, i) {
      row.forEach(function (v, j) { cells1.push({ cycleNo: i + 1, workElementId: [e1.id, e2.id, e3.id][j], rawDuration: v }); });
    });
    putCells(s1.id, cells1);

    // جلسه ۲: سمیه کریمی — پیوسته، ۴ چرخه (قرائت تجمعی؛ زنجیره در طول جلسه ادامه دارد)
    var s2 = createSession(act1.id, { operatorId: op2.id, timingMethod: 'CONTINUOUS', notes: 'نوبت عصر' });
    addCycles(s2.id, 4);
    var cont = [
      [8.5, 21.0, 27.6], [36.0, 48.3, 54.8], [63.2, 75.6, 82.3], [90.8, 103.1, 109.6],
    ];
    var cells2 = [];
    cont.forEach(function (row, i) {
      row.forEach(function (v, j) { cells2.push({ cycleNo: i + 1, workElementId: [e1.id, e2.id, e3.id][j], cumulativeReading: v }); });
    });
    putCells(s2.id, cells2);

    // جلسه ۳: فعالیت پرس — کار هم‌پوشانی با بازه شروع/پایان
    var s3 = createSession(act2.id, { operatorId: op1.id, timingMethod: 'SNAPBACK', notes: 'پرس اتوماتیک با بارگذاری هم‌زمان' });
    addCycles(s3.id, 3);
    var cells3 = [];
    for (var i = 0; i < 3; i++) {
      cells3.push({ cycleNo: i + 1, workElementId: e4.id, startOffset: 2 + i * 0.2, endOffset: 14 + i * 0.3 });
    }
    putCells(s3.id, cells3);

    // جلسه ۴: بازرسی
    var s4 = createSession(act3.id, { operatorId: op2.id, timingMethod: 'SNAPBACK' });
    addCycles(s4.id, 4);
    var cells4 = [];
    var insp = [15.2, 14.8, 15.5, 15.1];
    insp.forEach(function (v, i) { cells4.push({ cycleNo: i + 1, workElementId: e5.id, rawDuration: v }); });
    putCells(s4.id, cells4);

    // ── جلسه دوم: روابط موازی نمونه با مقادیر چرخه‌ای (دموی ماتریس هم‌پوشانی) ──
    // v1.5.0 §۴.۳ — رابطهٔ موازی فقط بین عناصر «یک فعالیت» تعریف می‌شود؛
    // رابطهٔ بین‌فعالیت نمونه حذف شد (پس از مهاجرت v1.5.0 مجاز نیست).
    var relPE = createOverlapRelation(projectId, e3.id, e2.id); // «پرس اتوماتیک» ↔ «بستن چهار پیچ» (هم‌زمان مونتاژ — همان فعالیت)
    var s1cycles = filterBy('cycleObservations', 'sessionId', s1.id).sort(function (a, b) { return a.cycleNo - b.cycleNo; });
    if (s1cycles.length >= 2) {
      setCycleOverlaps(s1cycles[0].id, [{ relationId: relPE.id, status: 'OVERLAP', overlapDuration: 2.5 }]);
      setCycleOverlaps(s1cycles[1].id, [{ relationId: relPE.id, status: 'NO_OVERLAP' }]);
    }

    refreshOutliersForProject(projectId, { silent: true });
    commit();
    return p;
  }

  // ═══════════ راه‌اندازی و API عمومی ═══════════
  state = load();


  /* ═══════════════════════════════════════════════════════════
     جلسه دوم — سرویس مرکزی هم‌پوشانی عناصر کاری
     یک منبع دادهٔ معتبر: OverlapRelation (یگانی زوج) + ObservationOverlap
     (مقدار هر چرخه). فرم A، فرم B و ماتریس هر سه از همین توابع می‌خوانند.
     ═══════════════════════════════════════════════════════════ */

  function projectIdOfElement(elementId) {
    var e = byId('workElements', elementId);
    if (!e) return null;
    return projectIdOfActivity(e.activityId);
  }

  function nameOfElement(elementId) {
    var e = byId('workElements', elementId);
    return e ? e.name : '؟';
  }

  /** مرتب‌سازی عناصر مطابق ساختار پروژه: ایستگاه → فعالیت → sortOrder */
  function projectElementsSorted(projectId) {
    var stations = filterBy('stations', 'projectId', projectId).slice().sort(function (a, b) { return a.sortOrder - b.sortOrder; });
    var out = [];
    stations.forEach(function (st) {
      var acts = filterBy('activities', 'stationId', st.id).slice().sort(function (a, b) { return a.sortOrder - b.sortOrder; });
      acts.forEach(function (ac) {
        var els = filterBy('workElements', 'activityId', ac.id).slice().sort(function (a, b) { return a.sortOrder - b.sortOrder; });
        els.forEach(function (el) {
          out.push({ elementId: el.id, name: el.name, activityId: ac.id, activityName: ac.name, stationId: st.id, stationName: st.name, stationSort: st.sortOrder, activitySort: ac.sortOrder, elementSort: el.sortOrder });
        });
      });
    });
    return out;
  }

  function listOverlapRelations(projectId) {
    return filterBy('overlapRelations', 'projectId', projectId).slice().sort(function (a, b) { return (a.createdAt || '').localeCompare(b.createdAt || ''); });
  }

  function createOverlapRelation(projectId, elementAId, elementBId) {
    if (elementAId === elementBId) throw new Error('عنصر نمی‌تواند با خودش رابطهٔ موازی داشته باشد.');
    var elA = byId('workElements', elementAId);
    var elB = byId('workElements', elementBId);
    if (!elA || !elB) throw new Error('عنصر کاری یافت نشد.');
    var projA = projectIdOfElement(elementAId);
    var projB = projectIdOfElement(elementBId);
    if (projA !== projectId || projB !== projectId) throw new Error('هر دو عنصر باید متعلق به همین پروژه باشند.');
    // v1.5.0 §۴.۳ — دامنهٔ رابطه‌ها: هر دو عنصر باید متعلق به یک Activity باشند
    if (elA.activityId !== elB.activityId) {
      throw new Error('رابطهٔ موازی فقط بین عناصر یک فعالیت ممکن است؛ زیرردیف‌های برگهٔ زمان‌سنجی باید قابل‌مقایسه باشند.');
    }
    var low = elementAId < elementBId ? elementAId : elementBId;
    var high = elementAId < elementBId ? elementBId : elementAId;
    var existing = state.overlapRelations.find(function (r) { return r.projectId === projectId && r.elementLowId === low && r.elementHighId === high; });
    if (existing && existing.isActive) throw new Error('رابطهٔ موازی این دو عنصر از قبل تعریف شده است.');
    var relation;
    if (existing) {
      existing.isActive = true;
      existing.version = (existing.version || 1) + 1;
      existing.archiveReason = null;
      touch(existing);
      relation = existing;
    } else {
      relation = { id: U.uid(), projectId: projectId, elementLowId: low, elementHighId: high, isActive: true, archiveReason: null, version: 1, createdAt: U.nowISO(), updatedAt: U.nowISO() };
      state.overlapRelations.push(relation);
    }
    markProjectCalculationsStale(projectId);
    recordAudit({ entityType: 'OverlapRelation', entityId: relation.id, action: existing ? 'RESTORE' : 'CREATE', entityName: nameOfElement(low) + ' ↔ ' + nameOfElement(high), projectId: projectId });
    commit();
    return relation;
  }

  function archiveOverlapRelation(relationId) {
    var r = byId('overlapRelations', relationId);
    if (!r) throw new Error('رابطه یافت نشد.');
    if (!r.isActive) return r;
    r.isActive = false;
    r.version = (r.version || 1) + 1;
    touch(r);
    markProjectCalculationsStale(r.projectId);
    recordAudit({ entityType: 'OverlapRelation', entityId: relationId, action: 'DELETE', entityName: nameOfElement(r.elementLowId) + ' ↔ ' + nameOfElement(r.elementHighId), projectId: r.projectId });
    commit();
    return r;
  }

  function restoreOverlapRelation(relationId) {
    var r = byId('overlapRelations', relationId);
    if (!r) throw new Error('رابطه یافت نشد.');
    if (r.isActive) return r;
    // v1.5.0 §۴.۳ — بازگردانی رابطهٔ بین‌فعالیت ممنوع است تا وقتی هر دو عنصر در یک Activity نباشند
    var elLow = byId('workElements', r.elementLowId);
    var elHigh = byId('workElements', r.elementHighId);
    if (elLow && elHigh && elLow.activityId !== elHigh.activityId) {
      throw new Error('این رابطه بین عناصر دو فعالیت مختلف است و تا زمانی که هر دو عنصر در یک فعالیت نباشند قابل بازگردانی نیست.');
    }
    r.isActive = true;
    r.version = (r.version || 1) + 1;
    r.archiveReason = null;
    touch(r);
    markProjectCalculationsStale(r.projectId);
    recordAudit({ entityType: 'OverlapRelation', entityId: relationId, action: 'RESTORE', projectId: r.projectId });
    commit();
    return r;
  }

  function archiveOverlapRelationsForElement(elementId) {
    var affected = state.overlapRelations.filter(function (r) { return r.isActive && (r.elementLowId === elementId || r.elementHighId === elementId); });
    affected.forEach(function (r) {
      r.isActive = false;
      r.version = (r.version || 1) + 1;
      touch(r);
      recordAudit({ entityType: 'OverlapRelation', entityId: r.id, action: 'DELETE', entityName: 'آرشیو خودکار پس از حذف عنصر', projectId: r.projectId });
    });
    return affected.length;
  }

  /** مدت و بازهٔ هر عنصر در یک چرخه — از دادهٔ خام مشاهده */
  function cycleOverlapContext(cycleId) {
    var cycle = byId('cycleObservations', cycleId);
    if (!cycle) throw new Error('چرخه یافت نشد.');
    var session = byId('studySessions', cycle.sessionId);
    var durations = {};
    var intervals = {};
    filterBy('elementObservations', 'cycleId', cycleId).forEach(function (o) {
      var d = o.derivedDuration != null ? o.derivedDuration : (o.rawDuration != null ? o.rawDuration : null);
      durations[o.workElementId] = d;
      intervals[o.workElementId] = (o.startOffset != null && o.endOffset != null) ? { startOffset: o.startOffset, endOffset: o.endOffset } : null;
    });
    return { cycle: cycle, session: session, durations: durations, intervals: intervals };
  }

  function overlapValidationSummary(out, elementsSorted, memberList, pairLookup) {
    var nameOf = {};
    elementsSorted.forEach(function (e) { nameOf[e.elementId] = e.name; });
    // §۳ ممیزی جلسه ۲ — دو حکم مستقل: confirmedVerdict (سازگاری دادهٔ تأییدشده)
    // و overallVerdict (نتیجهٔ نهایی — روابط بررسی‌نشده/بازهٔ ناقص → INDETERMINATE)
    var verdicts = T2F.computeVerdicts(memberList, pairLookup, out);
    return {
      verdict: verdicts.overallVerdict,
      confirmedVerdict: verdicts.confirmedVerdict,
      overallVerdict: verdicts.overallVerdict,
      localFailures: out.localFailures.map(function (lf) {
        return { pair: lf.pair, failures: lf.failures, pairLabel: (nameOf[lf.pair[0]] || lf.pair[0]) + ' ↔ ' + (nameOf[lf.pair[1]] || lf.pair[1]) };
      }),
      tripleIssues: out.tripleIssues,
      globalIssues: out.confirmed.issues,
      intervalIssues: out.intervalIssues.map(function (i) {
        return { pair: i.pair, recorded: i.recorded, computed: i.computed, message: i.message, kind: i.kind };
      }),
      provisionalWarnings: out.provisional.warnings,
      multiOverlaps: Object.keys(out.multiOverlaps).map(function (key) {
        return { members: key.split('|'), memberNames: key.split('|').map(function (id) { return nameOf[id] || id; }), value: out.multiOverlaps[key].value, provisional: out.multiOverlaps[key].provisional };
      }),
      unions: Object.keys(out.unions).map(function (key) {
        return { members: key.split('|'), memberNames: key.split('|').map(function (id) { return nameOf[id] || id; }), value: out.unions[key].value, source: out.unions[key].source };
      }),
    };
  }

  /* §۵ ممیزی جلسه ۲ — مقایسه‌پذیری زوج‌ها در یک چرخه */
  function isObservedInCycle(elementId, durations) {
    return Object.prototype.hasOwnProperty.call(durations, elementId);
  }
  function hasComparableEvidence(elementId, durations, intervals) {
    var iv = intervals[elementId];
    if (iv && iv.startOffset != null && iv.endOffset != null) return true;
    return durations[elementId] != null;
  }
  function comparabilityForRelations(activeRelations, durations, intervals, nameOf) {
    var out = {};
    activeRelations.forEach(function (r) {
      var reasons = [];
      [r.elementLowId, r.elementHighId].forEach(function (eid) {
        if (!isObservedInCycle(eid, durations)) reasons.push('«' + nameOf(eid) + '» در این چرخه مشاهده‌ای ندارد');
        else if (!hasComparableEvidence(eid, durations, intervals)) reasons.push('«' + nameOf(eid) + '» در این چرخه مدت یا بازهٔ قابل‌مقایسه ندارد');
      });
      out[r.id] = reasons.length === 0
        ? { isComparable: true, notComparableReason: null }
        : { isComparable: false, notComparableReason: 'در این چرخه قابل‌مقایسه نیست: ' + reasons.join('؛ ') };
    });
    return out;
  }

  /** projection ماتریس — عضویت پویا از روابط فعال؛ مقادیر چرخهٔ انتخاب‌شده */
  function getOverlapMatrix(projectId, cycleId) {
    var elementsSorted = projectElementsSorted(projectId);
    var relations = listOverlapRelations(projectId);
    var activeRelations = relations.filter(function (r) { return r.isActive; });
    var memberIds = {};
    activeRelations.forEach(function (r) { memberIds[r.elementLowId] = true; memberIds[r.elementHighId] = true; });
    var members = elementsSorted.filter(function (e) { return !!memberIds[e.elementId]; });

    // فهرست چرخه‌ها برای انتخاب‌گر — گروه‌بندی جلسات (ادغام نمی‌شوند)
    var cycles = [];
    var sessions = [];
    state.studySessions.forEach(function (ss) {
      var act = byId('activities', ss.activityId);
      if (!act) return;
      var st = byId('stations', act.stationId);
      if (!st || st.projectId !== projectId) return;
      var op = byId('operators', ss.operatorId);
      filterBy('cycleObservations', 'sessionId', ss.id).sort(function (a, b) { return a.cycleNo - b.cycleNo; }).forEach(function (c) {
        cycles.push({
          cycleId: c.id, cycleNo: c.cycleNo, sessionId: ss.id, operatorId: ss.operatorId,
          operatorName: op ? op.displayName : '؟', timingMethod: ss.timingMethod, sessionStatus: ss.status,
          activityId: ss.activityId, activityName: act.name, createdAt: c.createdAt,
          overlapRevision: c.overlapRevision || 0,
        });
      });
    });

    var cells = {};
    var comparability = {};
    var selectedCycle = null;
    var validation = null;
    if (cycleId) {
      selectedCycle = cycles.find(function (c) { return c.cycleId === cycleId; }) || null;
      if (!selectedCycle) throw new Error('چرخه یافت نشد یا متعلق به این پروژه نیست.');
      filterBy('observationOverlaps', 'cycleId', cycleId).forEach(function (v) {
        cells[v.relationId] = { relationId: v.relationId, status: v.status, overlapDuration: v.overlapDuration, version: v.version || 1, updatedAt: v.updatedAt };
      });
      var ctx = cycleOverlapContext(cycleId);
      var nameOfFn = function (id) {
        var el = elementsSorted.find(function (e) { return e.elementId === id; });
        return el ? el.name : id;
      };
      var memberList = members.map(function (m) { return m.elementId; });
      // §۳ ممیزی جلسه ۲ — قرارداد یکسان: رابطهٔ فعال بدون رکورد = UNREVIEWED
      var pairLookup = function (a, b) {
        var rel = activeRelations.find(function (r) { return (r.elementLowId === a && r.elementHighId === b) || (r.elementLowId === b && r.elementHighId === a); });
        if (!rel) return undefined;
        var cell = cells[rel.id];
        if (!cell) return { status: 'UNREVIEWED', overlapDuration: null };
        return { status: cell.status, overlapDuration: cell.overlapDuration };
      };
      var out = T2F.runFullValidation(memberList, ctx.durations, ctx.intervals, pairLookup, nameOfFn);
      validation = overlapValidationSummary(out, elementsSorted, memberList, pairLookup);
      // مقایسه‌پذیری زوج‌ها در این چرخه — §۵ ممیزی جلسه ۲
      comparability = comparabilityForRelations(activeRelations, ctx.durations, ctx.intervals, nameOfFn);
    }

    return {
      projectId: projectId,
      members: members,
      relations: relations.map(function (r) { return { id: r.id, elementLowId: r.elementLowId, elementHighId: r.elementHighId, isActive: r.isActive, version: r.version || 1, createdAt: r.createdAt, updatedAt: r.updatedAt }; }),
      cells: cells,
      comparability: comparability,
      selectedCycle: selectedCycle,
      cycles: cycles,
      elementsCatalog: elementsSorted,
      validation: validation,
    };
  }

  /** ثبت مقادیر هم‌پوشانی یک چرخه — خط کامل اعتبارسنجی + rollback (§۱۰)
   *  §۵ ممیزی جلسه ۲: ثبت مقدار قطعی فقط برای زوج قابل‌مقایسه در چرخهٔ جاری.
   *  §۱۰ ممیزی جلسه ۲: opts.expectedOverlapRevision — اجرای آفلاین هم‌گام و اتمیک
   *  است (تک‌نخی/در حافظه)؛ نسخهٔ مجموعه برای هم‌ارزی قرارداد آنلاین کنترل می‌شود. */
  function setCycleOverlaps(cycleId, updates, opts) {
    if (!updates || updates.length === 0) throw new Error('تغییری برای ثبت وجود ندارد.');
    var ctx = cycleOverlapContext(cycleId);
    var projectId = projectIdOfActivity(ctx.session.activityId);
    var elementsSorted = projectElementsSorted(projectId);
    var nameOfFn = function (id) {
      var el = elementsSorted.find(function (e) { return e.elementId === id; });
      return el ? el.name : id;
    };
    var relationById = {};
    updates.forEach(function (u) {
      var rel = byId('overlapRelations', u.relationId);
      if (!rel) throw new Error('رابطه یافت نشد.');
      if (rel.projectId !== projectId) throw new Error('رابطه به پروژهٔ این چرخه تعلق ندارد.');
      if (!rel.isActive) throw new Error('رابطهٔ آرشیوشده قابل ویرایش نیست؛ ابتدا آن را بازگردانی کنید.');
      relationById[rel.id] = rel;
    });

    // §۵ ممیزی جلسه ۲ — مقایسه‌پذیری: هر دو عنصر باید در همین چرخه مشاهده
    // و شواهد قابل‌مقایسه (بازه یا مدت) داشته باشند؛ در غیر این صورت ثبت
    // مقدار قطعی رد می‌شود و هیچ رکورد ساختگی/NO_OVERLAP ساخته نمی‌شود.
    updates.forEach(function (u) {
      var rel = relationById[u.relationId];
      if (u.status === 'UNREVIEWED') return; // پاک‌کردن مقدار همیشه مجاز است
      [rel.elementLowId, rel.elementHighId].forEach(function (eid) {
        if (!isObservedInCycle(eid, ctx.durations)) {
          throw new Error('ثبت مقدار ممکن نیست — «' + nameOfFn(eid) + '» در چرخهٔ ' + ctx.cycle.cycleNo + ' مشاهده‌ای ندارد؛ این زوج در این چرخه قابل‌مقایسه نیست (در این چرخه قابل‌مقایسه نیست).');
        }
        if (!hasComparableEvidence(eid, ctx.durations, ctx.intervals)) {
          throw new Error('ثبت مقدار ممکن نیست — «' + nameOfFn(eid) + '» در چرخهٔ ' + ctx.cycle.cycleNo + ' مدت یا بازهٔ قابل‌مقایسه ندارد؛ این زوج در این چرخه قابل‌مقایسه نیست.');
        }
      });
    });

    // §۱۰ ممیزی جلسه ۲ — کنترل نسخهٔ مجموعهٔ مقادیر چرخه
    if (opts && opts.expectedOverlapRevision != null) {
      if ((ctx.cycle.overlapRevision || 0) !== opts.expectedOverlapRevision) {
        var conflict = new Error('مجموعهٔ مقادیر هم‌پوشانی این چرخه از محل دیگری هم‌زمان تغییر کرده است؛ صفحه را نوسازی کنید.');
        conflict.code = 'OVERLAP_REVISION_CONFLICT';
        throw conflict;
      }
    }

    var allActive = state.overlapRelations.filter(function (r) { return r.projectId === projectId && r.isActive; });
    var valueByKey = {};
    filterBy('observationOverlaps', 'cycleId', cycleId).forEach(function (v) { valueByKey[v.relationId] = v; });
    var newByKey = Object.assign({}, valueByKey);
    updates.forEach(function (u) {
      var normalized = u.status === 'NO_OVERLAP' ? 0 : (u.status === 'UNREVIEWED' ? null : (u.overlapDuration != null ? u.overlapDuration : null));
      newByKey[u.relationId] = { relationId: u.relationId, cycleId: cycleId, status: u.status, overlapDuration: normalized, version: (valueByKey[u.relationId] || {}).version || 0 };
    });

    var memberIds = {};
    allActive.forEach(function (r) { memberIds[r.elementLowId] = true; memberIds[r.elementHighId] = true; });
    var memberList = Object.keys(memberIds);
    // §۳ ممیزی جلسه ۲ — رابطهٔ فعال بدون رکورد چرخه = UNREVIEWED (نه undefined)
    var pairLookup = function (a, b) {
      var rel = allActive.find(function (r) { return (r.elementLowId === a && r.elementHighId === b) || (r.elementLowId === b && r.elementHighId === a); });
      if (!rel) return undefined;
      var v = newByKey[rel.id];
      if (!v) return { status: 'UNREVIEWED', overlapDuration: null };
      return { status: v.status, overlapDuration: v.overlapDuration };
    };
    var out = T2F.runFullValidation(memberList, ctx.durations, ctx.intervals, pairLookup, nameOfFn);
    var hasDefinite = out.localFailures.length > 0 || out.tripleIssues.length > 0 ||
      out.intervalIssues.some(function (i) { return i.kind === 'DEFINITE'; }) ||
      out.confirmed.verdict === 'INVALID';
    if (hasDefinite) {
      var msgs = [];
      out.localFailures.forEach(function (lf) {
        lf.failures.forEach(function (f) { msgs.push(nameOfFn(lf.pair[0]) + ' ↔ ' + nameOfFn(lf.pair[1]) + ': ' + f.message); });
      });
      out.tripleIssues.forEach(function (i) { msgs.push(i.message); });
      out.intervalIssues.forEach(function (i) { if (i.kind === 'DEFINITE') msgs.push(i.message); });
      out.confirmed.issues.forEach(function (i) { if (i.kind === 'DEFINITE') msgs.push(i.message); });
      var err = new Error('ثبت تغییرات ممکن نیست — دادهٔ غیرممکن رد شد:\n' + msgs.join('\n'));
      err.code = 'OVERLAP_VALIDATION_FAILED';
      err.details = { issues: msgs };
      throw err;
    }

    // ثبت (تراکنش ساده در حافظه — rollback با throw قبل از commit)
    updates.forEach(function (u) {
      var normalized = u.status === 'NO_OVERLAP' ? 0 : (u.status === 'UNREVIEWED' ? null : (u.overlapDuration != null ? u.overlapDuration : null));
      var existing = valueByKey[u.relationId];
      if (existing) {
        if (u.expectedVersion != null && (existing.version || 1) !== u.expectedVersion) {
          var conflict = new Error('مقدار این زوج هم‌پوشانی از محل دیگری هم‌زمان تغییر کرده است؛ صفحه را نوسازی کنید.');
          conflict.code = 'VERSION_CONFLICT';
          throw conflict;
        }
        existing.status = u.status;
        existing.overlapDuration = normalized;
        existing.version = (existing.version || 1) + 1;
        touch(existing);
      } else {
        state.observationOverlaps.push({ id: U.uid(), relationId: u.relationId, cycleId: cycleId, status: u.status, overlapDuration: normalized, version: 1, updatedAt: U.nowISO() });
      }
      var rel = relationById[u.relationId];
      recordAudit({
        entityType: 'ObservationOverlap', entityId: u.relationId + ':' + cycleId, action: 'UPDATE',
        entityName: nameOfFn(rel.elementLowId) + ' ↔ ' + nameOfFn(rel.elementHighId) + ' — چرخهٔ ' + ctx.cycle.cycleNo,
        projectId: projectId,
      });
    });
    // افزایش نسخهٔ مجموعهٔ مقادیر این چرخه — §۱۰ ممیزی جلسه ۲
    ctx.cycle.overlapRevision = (ctx.cycle.overlapRevision || 0) + 1;
    touch(ctx.cycle);
    markProjectCalculationsStale(projectId);
    commit();
    var after = getOverlapMatrix(projectId, cycleId);
    return { cells: after.cells, validation: after.validation, warnings: out.provisional.warnings.map(function (w) { return w.message; }) };
  }

  /** روابط یک عنصر برای فرم — منبع واحد (§۴.۲)
   *  §۶ ممیزی جلسه ۲ — opts.sessionId مقدار نمایشی را به چرخه‌های همان جلسه محدود می‌کند */
  function getElementRelations(elementId, opts) {
    var element = byId('workElements', elementId);
    if (!element) throw new Error('عنصر کاری یافت نشد.');
    var projectId = projectIdOfActivity(element.activityId);
    var sessionScoped = !!(opts && opts.sessionId);
    var relations = state.overlapRelations.filter(function (r) { return r.elementLowId === elementId || r.elementHighId === elementId; });
    var rows = relations.map(function (r) {
      var otherId = r.elementLowId === elementId ? r.elementHighId : r.elementLowId;
      var other = byId('workElements', otherId);
      var otherActivity = other ? byId('activities', other.activityId) : null;
      var otherStation = otherActivity ? byId('stations', otherActivity.stationId) : null;
      var latest = null;
      if (r.isActive) {
        var candidates = state.observationOverlaps.filter(function (v) {
          if (v.relationId !== r.id) return false;
          if (!sessionScoped) return true;
          var cyc = byId('cycleObservations', v.cycleId);
          return !!cyc && cyc.sessionId === opts.sessionId;
        }).sort(function (a, b) { return (b.updatedAt || '').localeCompare(a.updatedAt || ''); });
        var lastValue = candidates[0];
        if (lastValue) {
          var cyc = byId('cycleObservations', lastValue.cycleId);
          if (cyc) {
            var sess = byId('studySessions', cyc.sessionId);
            var op = sess ? byId('operators', sess.operatorId) : null;
            var sact = sess ? byId('activities', sess.activityId) : null;
            latest = {
              cycleNo: cyc.cycleNo,
              operatorName: op ? op.displayName : '؟',
              activityName: sact ? sact.name : '؟',
              status: lastValue.status,
              overlapDuration: lastValue.overlapDuration,
              cycleId: lastValue.cycleId,
            };
          }
        }
      }
      return {
        relationId: r.id,
        otherElementId: otherId,
        otherElementName: other ? other.name : '؟',
        otherActivityName: otherActivity ? otherActivity.name : '؟',
        otherStationName: otherStation ? otherStation.name : '؟',
        isActive: r.isActive,
        // v1.5.0 §۴.۳ — پرچم بین‌فعالیت برای جلوگیری از بازگردانی نامعتبر
        crossActivity: !!other && other.activityId !== element.activityId,
        archiveReason: r.archiveReason || null,
        latest: latest,
      };
    });
    return { elementId: elementId, elementName: element.name, rows: rows, projectId: projectId, scope: sessionScoped ? 'SESSION' : 'PROJECT' };
  }

  /** تنظیمات گزارش/بوم نمودار — بر پایهٔ projectSettings با پیش‌فرض امن */
  function getReportSettings(projectId) {
    var s = getProjectSettings(projectId);
    var mode = s['report.westinghouseMode'];
    if (mode !== 'GRADE' && mode !== 'NUMERIC' && mode !== 'BOTH') mode = 'BOTH';
    var paper = s['report.paperSize'] === 'A3' ? 'A3' : 'A4';
    var orientation = s['report.orientation'] === 'landscape' ? 'landscape' : 'portrait';
    return { westinghouseMode: mode, paperSize: paper, orientation: orientation };
  }

  function putReportSettings(projectId, input) {
    var values = {};
    if (input.westinghouseMode) values['report.westinghouseMode'] = input.westinghouseMode;
    if (input.paperSize) values['report.paperSize'] = input.paperSize;
    if (input.orientation) values['report.orientation'] = input.orientation;
    putProjectSettings(projectId, values);
    commit();
    return getReportSettings(projectId);
  }

  function getChartCanvasSetting(projectId, chartType) {
    var s = getProjectSettings(projectId);
    var raw = s['chart.canvas.' + chartType];
    if (!raw) return null;
    try {
      var parsed = JSON.parse(raw);
      if (parsed && parsed.width && parsed.height) return parsed;
      return null;
    } catch (e) { return null; }
  }

  function putChartCanvasSetting(projectId, chartType, width, height) {
    putProjectSettings(projectId, { ['chart.canvas.' + chartType]: JSON.stringify({ width: width, height: height }) });
    commit();
  }

  function resetChartCanvasSetting(projectId, chartType) {
    state.projectSettings = state.projectSettings.filter(function (s) { return !(s.projectId === projectId && s.key === 'chart.canvas.' + chartType); });
    commit();
  }

  function getChartLayoutSnapshot(projectId, chartType) {
    var s = getProjectSettings(projectId);
    var raw = s['chart.layoutSnapshot.' + chartType];
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  }

  function saveChartLayoutSnapshot(projectId, chartType, nodes, canvas) {
    putProjectSettings(projectId, { ['chart.layoutSnapshot.' + chartType]: JSON.stringify({ nodes: nodes, canvas: canvas, savedAt: U.nowISO() }) });
    commit();
  }

  g.T2DB = {
    CONST: CONST,
    getState: getState,
    subscribe: subscribe,
    isStorageOk: function () { return storageOk; },
    storageInfo: function () {
      try {
        var bytes = g.localStorage ? (g.localStorage.getItem(STORAGE_KEY) || '').length : 0;
        return { bytes: bytes, projects: state.projects.length, ok: storageOk };
      } catch (e) { return { bytes: 0, projects: state.projects.length, ok: false }; }
    },
    // ── جلسه دوم: ماتریس هم‌پوشانی ──
    listOverlapRelations: listOverlapRelations,
    createOverlapRelation: createOverlapRelation,
    archiveOverlapRelation: archiveOverlapRelation,
    restoreOverlapRelation: restoreOverlapRelation,
    getOverlapMatrix: getOverlapMatrix,
    setCycleOverlaps: setCycleOverlaps,
    getElementRelations: getElementRelations,
    getReportSettings: getReportSettings,
    putReportSettings: putReportSettings,
    getChartCanvasSetting: getChartCanvasSetting,
    putChartCanvasSetting: putChartCanvasSetting,
    resetChartCanvasSetting: resetChartCanvasSetting,
    getChartLayoutSnapshot: getChartLayoutSnapshot,
    saveChartLayoutSnapshot: saveChartLayoutSnapshot,
    resetAll: function () {
    },
    exportAll: function () { return JSON.stringify(state); },
    importAll: function (json) {
      var parsed = JSON.parse(json);
      var s = emptyState();
      TABLES.forEach(function (t) { if (Array.isArray(parsed[t])) s[t] = parsed[t]; });
      state = s;
      commit();
    },

    getAppSettings: getAppSettings, setAppSettings: setAppSettings,
    getDisplayPrefs: getDisplayPrefs, setDisplayPrefs: setDisplayPrefs,
    getProjectSettings: getProjectSettings, getCalcSettings: getCalcSettings, putCalcSettings: putCalcSettings,
    putProjectSettingRaw: function (projectId, values) { putProjectSettings(projectId, values); commit(); },

    snapshotSessionRows: function (sessionId) {
      var cycleIds = filterBy('cycleObservations', 'sessionId', sessionId).map(function (c) { return c.id; });
      var cidMap = {}; cycleIds.forEach(function (id) { cidMap[id] = true; });
      return {
        cycles: state.cycleObservations.filter(function (c) { return cidMap[c.id]; }).map(function (c) { return JSON.parse(JSON.stringify(c)); }),
        lanes: state.timelineLanes.filter(function (l) { return cidMap[l.cycleId]; }).map(function (l) { return JSON.parse(JSON.stringify(l)); }),
        observations: state.elementObservations.filter(function (o) { return cidMap[o.cycleId]; }).map(function (o) { return JSON.parse(JSON.stringify(o)); }),
        // §۸ ممیزی جلسه ۲ — مقادیر هم‌پوشانی چرخه‌های همین جلسه نیز در snapshot می‌آیند
        overlaps: state.observationOverlaps.filter(function (o) { return cidMap[o.cycleId]; }).map(function (o) { return JSON.parse(JSON.stringify(o)); }),
      };
    },
    replaceSessionRows: function (sessionId, snap) {
      var oldCycleIds = {};
      filterBy('cycleObservations', 'sessionId', sessionId).forEach(function (c) { oldCycleIds[c.id] = true; });
      state.cycleObservations = state.cycleObservations.filter(function (c) { return !oldCycleIds[c.id]; });
      state.timelineLanes = state.timelineLanes.filter(function (l) { return !oldCycleIds[l.cycleId]; });
      state.elementObservations = state.elementObservations.filter(function (o) { return !oldCycleIds[o.cycleId]; });
      // §۸ ممیزی جلسه ۲ — بازگردانی/حذف مقادیر هم‌پوشانی با همان relationId و cycleId قبلی؛ ردیف یتیم باقی نمی‌ماند
      state.observationOverlaps = state.observationOverlaps.filter(function (o) { return !oldCycleIds[o.cycleId]; });
      (snap.cycles || []).forEach(function (r) { state.cycleObservations.push(r); });
      (snap.lanes || []).forEach(function (r) { state.timelineLanes.push(r); });
      (snap.observations || []).forEach(function (r) { state.elementObservations.push(r); });
      (snap.overlaps || []).forEach(function (r) { state.observationOverlaps.push(r); });
      var se = byId('studySessions', sessionId);
      markProjectCalculationsStale(se ? projectIdOfActivity(se.activityId) : null);
      commit();
    },

    listProjects: listProjects, getProject: function (id) { return byId('projects', id); },
    createProject: createProject, updateProject: updateProject, deleteProject: deleteProject,
    duplicateProject: duplicateProject, finalizeProject: finalizeProject, unfinalizeProject: unfinalizeProject,
    getProjectSummary: getProjectSummary, getFinalization: function (pid) { return state.finalizationInfos.find(function (f) { return f.projectId === pid; }) || null; },

    sortStations: sortStations, sortActivities: sortActivities, sortElements: sortElements,
    createStation: createStation, updateStation: updateStation, deleteStation: deleteStation, reorderStations: reorderStations,
    createActivity: createActivity, updateActivity: updateActivity, deleteActivity: deleteActivity, reorderActivities: reorderActivities,
    createElement: createElement, updateElement: updateElement, deleteElement: deleteElement, reorderElements: reorderElements,
    getActivity: function (id) { return byId('activities', id); },
    getStation: function (id) { return byId('stations', id); },

    listOperators: listOperators, createOperator: createOperator, updateOperator: updateOperator, deleteOperator: deleteOperator,

    listCategories: listCategories, createCategory: createCategory, updateCategory: updateCategory, deleteCategory: deleteCategory,
    listGroups: listGroups, createGroup: createGroup, updateGroup: updateGroup, deleteGroup: deleteGroup,
    setGroupAllowance: setGroupAllowance,
    // ── الونس‌های سلسله‌مراتبی — جلسه اول ──
    listAllowanceDefinitions: listAllowanceDefinitions, createAllowanceDefinition: createAllowanceDefinition,
    updateAllowanceDefinition: updateAllowanceDefinition, deleteAllowanceDefinition: deleteAllowanceDefinition,
    getScopeAllowances: getScopeAllowances, putScopeAllowanceOps: putScopeAllowanceOps,
    resolveForActivity: resolveForActivity, migrateProjectAllowancesIfNeeded: migrateProjectAllowancesIfNeeded,

    listRatingTables: listRatingTables, getOrCreateSeedTable: getOrCreateSeedTable,
    createRatingTableVersion: createRatingTableVersion, updateRatingTableMeta: updateRatingTableMeta,
    updateRatingTableGrade: updateRatingTableGrade, deleteRatingTable: deleteRatingTable,
    getElementRating: getElementRating, saveElementRating: saveElementRating, deleteElementRating: deleteElementRating,
    getRatingMatrix: getRatingMatrix,

    listSessions: listSessions, createSession: createSession, updateSession: updateSession,
    closeSession: closeSession, reopenSession: reopenSession, deleteSession: deleteSession,
    getSheet: getSheet, addCycles: addCycles, deleteCycle: deleteCycle, updateCycleNotes: updateCycleNotes,
    putCells: putCells, parseCellInput: parseCellInput, pastePreview: pastePreview, pasteCommit: pasteCommit,
    setObservationValidity: setObservationValidity,

    getOutlierConfig: getOutlierConfig, setOutlierConfig: setOutlierConfig,
    refreshOutliersForElement: refreshOutliersForElement, refreshOutliersForActivity: refreshOutliersForActivity,
    refreshOutliersForProject: refreshOutliersForProject,

    getActivityAnalysis: getActivityAnalysis, listActivitiesForAnalysis: listActivitiesForAnalysis,
    runProjectCalculation: runProjectCalculation, getLatestCalculation: getLatestCalculation,

    getChart: getChart, createManualNode: createManualNode, updateChartNode: updateChartNode,
    deleteChartNode: deleteChartNode, saveChartLayout: saveChartLayout, moveChartNodeOrder: moveChartNodeOrder,
    createChartEdge: createChartEdge, deleteChartEdge: deleteChartEdge, getChartsStageState: getChartsStageState,
    autoLayout: computeAutoLayout,

    getProjectDashboard: getProjectDashboard, computeStageSummary: computeStageSummary,

    listAudit: listAudit,

    createBackup: createBackup, listBackups: listBackups, deleteBackup: deleteBackup,
    restoreBackup: restoreBackup, restoreBackupFromJson: restoreBackupFromJson, backupFileContent: backupFileContent,
    autoBackupTick: autoBackupTick,

    exportProjectPackage: exportProjectPackage, validateProjectPackage: validateProjectPackage,
    importProjectPackage: importProjectPackage, checksumOf: checksumOf,

    seedDemo: seedDemo,
    NODE_W: NODE_W, NODE_H_EST: NODE_H_EST,
  };
})(typeof window !== 'undefined' ? window : globalThis);
