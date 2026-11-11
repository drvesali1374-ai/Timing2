/* ═══════════════════════════════════════════════════════════
   موتور محاسبات — نسخه آفلاین
   پورت «دقیق و بدون تغییر» از src/calculation/* نسخه وب
   ⚠ هر تغییر در این فایل باید همزمان در نسخه وب انجام شود.
   ═══════════════════════════════════════════════════════════ */
(function (g) {
  'use strict';

  function round12(value) {
    if (!isFinite(value)) return value;
    return Math.round(value * 1e12) / 1e12;
  }

  function computeRatingFactor(v) {
    return round12(1 + v.skill + v.effort + v.conditions + v.consistency);
  }

  function computeNormalTime(observedTime, ratingFactor) {
    return round12(observedTime * ratingFactor);
  }

  function sumAllowances(values) {
    return round12(values.reduce(function (s, v) { return s + v.percentValue; }, 0));
  }

  function allowanceError(totalA, method) {
    if (totalA < 0) return 'مجموع مجازها نمی‌تواند منفی باشد.';
    if (method === 'SHARE_OF_ST' && totalA >= 1) {
      return 'در روش «سهم از زمان استاندارد»، مجموع مجازها باید کمتر از ۱۰۰٪ باشد؛ در غیر این صورت محاسبه ممکن نیست.';
    }
    if (method === 'PERCENT_OF_NT' && totalA > 10) {
      return 'مجموع مجازها غیرمعقول است (بیش از ۱۰۰۰٪).';
    }
    return null;
  }

  function computeStandardTime(normalTime, totalA, method) {
    var err = allowanceError(totalA, method);
    if (err) throw new Error(err);
    if (method === 'PERCENT_OF_NT') return round12(normalTime * (1 + totalA));
    return round12(normalTime / (1 - totalA));
  }

  function deriveContinuousDuration(r) {
    var prev = r.previousReading !== undefined ? r.previousReading : 0;
    if (r.cumulativeReading < prev) {
      throw new Error('قرائت تجمعی (' + r.cumulativeReading + ') نمی‌تواند از قرائت قبلی (' + prev + ') کمتر باشد؛ برای شروع مجدد، جلسه جدید ایجاد کنید.');
    }
    return { rawReading: r.cumulativeReading, duration: round12(r.cumulativeReading - prev) };
  }

  function deriveContinuousSequence(readings) {
    var out = [];
    var prev = 0;
    for (var i = 0; i < readings.length; i++) {
      out.push(deriveContinuousDuration({ cumulativeReading: readings[i], previousReading: prev }));
      prev = readings[i];
    }
    return out;
  }

  function intervalError(interval) {
    if (interval.endOffset <= interval.startOffset) {
      return 'پایان بازه (' + interval.endOffset + ') باید بزرگ‌تر از شروع آن (' + interval.startOffset + ') باشد.';
    }
    if (interval.startOffset < 0) {
      return 'شروع بازه (' + interval.startOffset + ') نمی‌تواند منفی باشد؛ آفست‌ها نسبت به مبدأ چرخه اندازه‌گیری می‌شوند.';
    }
    return null;
  }

  function intervalDuration(interval) {
    var err = intervalError(interval);
    if (err) throw new Error(err);
    return round12(interval.endOffset - interval.startOffset);
  }

  function sumIntervalDurations(intervals) {
    return round12(intervals.reduce(function (s, i) { return s + intervalDuration(i); }, 0));
  }

  function elapsedCycleTime(intervals) {
    if (intervals.length === 0) return null;
    var earliest = Infinity, latest = -Infinity;
    for (var i = 0; i < intervals.length; i++) {
      var err = intervalError(intervals[i]);
      if (err) throw new Error(err);
      earliest = Math.min(earliest, intervals[i].startOffset);
      latest = Math.max(latest, intervals[i].endOffset);
    }
    return round12(latest - earliest);
  }

  function hasOverlapIntervals(intervals) {
    var sorted = intervals.slice().sort(function (a, b) { return a.startOffset - b.startOffset; });
    for (var i = 1; i < sorted.length; i++) {
      if (sorted[i].startOffset < sorted[i - 1].endOffset) return true;
    }
    return false;
  }

  function quantileSorted(sorted, p) {
    var n = sorted.length;
    if (n === 0) return NaN;
    var idx = (n - 1) * p;
    var lo = Math.floor(idx), hi = Math.ceil(idx);
    if (lo === hi) return sorted[lo];
    return sorted[lo] + (idx - lo) * (sorted[hi] - sorted[lo]);
  }

  var T95 = {
    1: 12.706, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571, 6: 2.447, 7: 2.365, 8: 2.306,
    9: 2.262, 10: 2.228, 11: 2.201, 12: 2.179, 13: 2.16, 14: 2.145, 15: 2.131,
    20: 2.086, 25: 2.06, 30: 2.042, 40: 2.021, 60: 2.0, 120: 1.98,
  };
  function tCritical95(df) {
    if (df <= 0) return NaN;
    if (T95[df] !== undefined) return T95[df];
    if (df < 120) return T95[120];
    return 1.96;
  }

  function descriptiveStats(values) {
    var clean = values.filter(function (v) { return isFinite(v); });
    var n = clean.length;
    if (n === 0) {
      return { count: 0, mean: null, median: null, min: null, max: null, range: null, sampleVariance: null, sampleSD: null, cvPercent: null, q1: null, q3: null, iqr: null, ci95: null };
    }
    var sorted = clean.slice().sort(function (a, b) { return a - b; });
    var mean = round12(clean.reduce(function (s, v) { return s + v; }, 0) / n);
    var median = round12(quantileSorted(sorted, 0.5));
    var min = sorted[0], max = sorted[n - 1];
    var sampleVariance = null, sampleSD = null, ci95 = null;
    if (n > 1) {
      sampleVariance = round12(clean.reduce(function (s, v) { return s + (v - mean) * (v - mean); }, 0) / (n - 1));
      sampleSD = round12(Math.sqrt(sampleVariance));
      var t = tCritical95(n - 1);
      var half = t * (sampleSD / Math.sqrt(n));
      ci95 = { lower: round12(mean - half), upper: round12(mean + half) };
    }
    var q1 = round12(quantileSorted(sorted, 0.25));
    var q3 = round12(quantileSorted(sorted, 0.75));
    return {
      count: n, mean: mean, median: median, min: min, max: max, range: round12(max - min),
      sampleVariance: sampleVariance, sampleSD: sampleSD,
      cvPercent: mean !== 0 && sampleSD !== null ? round12((sampleSD / mean) * 100) : null,
      q1: q1, q3: q3, iqr: round12(q3 - q1), ci95: ci95,
    };
  }

  function median(values) {
    return quantileSorted(values.slice().sort(function (a, b) { return a - b; }), 0.5);
  }

  function mad(values, med) {
    var m = med !== undefined ? med : median(values);
    return median(values.map(function (v) { return Math.abs(v - m); }));
  }

  function detectOutliers(inputs, options) {
    options = options || {};
    var method = options.method || 'mad';
    var threshold = options.threshold !== undefined ? options.threshold : 3.5;
    var madMinCount = options.madMinCount !== undefined ? options.madMinCount : 4;
    var iqrK = options.iqrK !== undefined ? options.iqrK : 1.5;

    var values = inputs.map(function (i) { return i.value; });
    var n = values.length;
    var flags = [];

    function round2(v) { return Math.round(v * 100) / 100; }

    if (method === 'mad') {
      if (n < madMinCount) return flags;
      var med = median(values);
      var madValue = mad(values, med);
      if (madValue === 0) {
        return detectOutliers(inputs, { method: 'iqr', threshold: threshold, madMinCount: madMinCount, iqrK: iqrK });
      }
      inputs.forEach(function (item) {
        var score = Math.abs((0.6745 * (item.value - med)) / madValue);
        if (score > threshold) {
          flags.push({
            ref: item.ref, value: item.value, score: score, rule: 'MODIFIED_Z_MAD',
            reason: 'امتیاز Z تعدیل‌شده ' + score.toFixed(2) + ' از آستانه ' + threshold + ' فراتر است (میانه=' + med + '، MAD=' + madValue + ').',
          });
        }
      });
      return flags;
    }

    if (n < 4) return flags;
    var sorted = values.slice().sort(function (a, b) { return a - b; });
    var q1 = quantileSorted(sorted, 0.25);
    var q3 = quantileSorted(sorted, 0.75);
    var iqr = q3 - q1;
    if (iqr === 0) return flags;
    var lower = q1 - iqrK * iqr;
    var upper = q3 + iqrK * iqr;
    var med2 = median(values);
    inputs.forEach(function (item) {
      if (item.value < lower || item.value > upper) {
        var score = round2(Math.abs(item.value - med2) / iqr);
        flags.push({
          ref: item.ref, value: item.value, score: score, rule: 'IQR_FENCE',
          reason: 'مقدار خارج از حصار IQR است (حصارها: ' + round2(lower) + ' تا ' + round2(upper) + '؛ IQR=' + round2(iqr) + ').',
        });
      }
    });
    return flags;
  }

  function weightedMeanByCount(samples) {
    var all = [];
    samples.forEach(function (s) { all = all.concat(s.values); });
    if (all.length === 0) return null;
    return round12(all.reduce(function (s, v) { return s + v; }, 0) / all.length);
  }

  function equalOperatorMean(samples) {
    var means = samples
      .filter(function (s) { return s.values.length > 0; })
      .map(function (s) { return s.values.reduce(function (x, v) { return x + v; }, 0) / s.values.length; });
    if (means.length === 0) return null;
    return round12(means.reduce(function (s, v) { return s + v; }, 0) / means.length);
  }

  function aggregateElement(samples, method) {
    var perOperator = samples.map(function (s) {
      return {
        operatorId: s.operatorId,
        count: s.values.length,
        mean: s.values.length > 0 ? round12(s.values.reduce(function (x, v) { return x + v; }, 0) / s.values.length) : null,
      };
    });
    var value = method === 'EQUAL_OPERATOR_MEAN' ? equalOperatorMean(samples) : weightedMeanByCount(samples);
    return { value: value, method: method, perOperator: perOperator };
  }

  function roundForDisplay(value, decimals) {
    if (decimals === undefined) decimals = 2;
    if (!isFinite(value)) return value;
    var factor = Math.pow(10, decimals);
    var cleaned = Math.round((value + Number.EPSILON) * 1e12) / 1e12;
    return isFinite(cleaned)
      ? cleaned >= 0
        ? Math.round(cleaned * factor + Number.EPSILON * factor) / factor
        : -Math.round(-cleaned * factor + Number.EPSILON * factor) / factor
      : cleaned;
  }

  function formatForDisplay(value, decimals) {
    if (decimals === undefined) decimals = 2;
    if (!isFinite(value)) return '—';
    return roundForDisplay(value, decimals).toFixed(decimals);
  }

  var REFERENCE_TESTS = {
    westinghouse: { factors: { skill: 0.06, effort: 0.02, conditions: 0, consistency: 0.01 }, expectedR: 1.09, ot: 8.3, expectedNT: 9.047 },
    allowance: { nt: 9.047, a: 0.15, expectedM1: 10.40405, expectedM2: 10.643529 },
    continuous: { readings: [8, 20, 45], expectedDurations: [8, 12, 25] },
    overlap: { intervals: [{ startOffset: 0, endOffset: 8 }, { startOffset: 5, endOffset: 25 }], expectedSumDurations: 28, expectedElapsed: 25 },
    rounding: { raw: 12.357, expectedDisplay: '12.36' },
  };


  /* ═══════════════════════════════════════════════════════════
     الونس‌های مؤثر سلسله‌مراتبی — جلسه اول
     پورت «دقیق و بدون تغییر» از src/calculation/effective-allowances.ts
     زنجیره: Project/Line → Station → Activity → WorkElement
     ⚠ هر تغییر در این بخش باید همزمان در نسخه وب انجام شود.
     ═══════════════════════════════════════════════════════════ */

  function AllowanceValueError(code, message) {
    var err = new Error(message);
    err.code = code;
    err.isAllowanceValueError = true;
    return err;
  }

  /** اعتبارسنجی سازگاری نوع و مقدار تخصیص (§۲.۳) */
  function validateAssignmentValue(input) {
    if (input.mode === 'EXCLUDE') return;
    if (input.valueType === 'PERCENT') {
      if (input.percentValue === null || input.percentValue === undefined) {
        throw AllowanceValueError('VALUE_REQUIRED', 'مقدار درصدی الزامی است.');
      }
      if (!isFinite(input.percentValue)) {
        throw AllowanceValueError('VALUE_INVALID', 'مقدار درصدی معتبر نیست (NaN/Infinity).');
      }
      if (input.percentValue < 0) {
        throw AllowanceValueError('VALUE_NEGATIVE', 'مقدار درصدی نمی‌تواند منفی باشد.');
      }
      if (input.percentValue >= 1) {
        throw AllowanceValueError('VALUE_TOO_HIGH', 'درصد الونس باید کمتر از ۱۰۰ باشد.');
      }
      if (input.timeValueSeconds !== null && input.timeValueSeconds !== undefined) {
        throw AllowanceValueError('VALUE_TYPE_MISMATCH', 'الونس درصدی نباید مقدار زمان ثابت داشته باشد.');
      }
    } else if (input.valueType === 'FIXED_TIME') {
      if (input.timeValueSeconds === null || input.timeValueSeconds === undefined) {
        throw AllowanceValueError('VALUE_REQUIRED', 'مقدار زمان ثابت الزامی است.');
      }
      if (!isFinite(input.timeValueSeconds)) {
        throw AllowanceValueError('VALUE_INVALID', 'مقدار زمان ثابت معتبر نیست (NaN/Infinity).');
      }
      if (input.timeValueSeconds < 0) {
        throw AllowanceValueError('VALUE_NEGATIVE', 'مقدار زمان ثابت نمی‌تواند منفی باشد.');
      }
      if (input.percentValue !== null && input.percentValue !== undefined) {
        throw AllowanceValueError('VALUE_TYPE_MISMATCH', 'الونس زمان ثابت نباید مقدار درصدی داشته باشد.');
      }
      if (input.applicationBasis !== 'PER_ELEMENT_EXECUTION' && input.applicationBasis !== 'PER_CYCLE') {
        throw AllowanceValueError('BASIS_REQUIRED', 'مبنای وقوع زمان ثابت الزامی است (هر اجرا / هر چرخه).');
      }
    } else {
      throw AllowanceValueError('VALUE_TYPE_INVALID', 'نوع مقدار الونس معتبر نیست.');
    }
  }

  function assignmentValueOf(a) {
    if (a.mode !== 'ACTIVE') return null;
    return a.valueType === 'PERCENT' ? a.percentValue : a.timeValueSeconds;
  }

  /**
   * نوع نمایشی یک تخصیص EXCLUDE — مستقل از نوع مقدار فعال (الزام ۴ — هم‌ارز نسخه وب):
   *  ۱. نزدیک‌ترین تصمیم «فعال» در سطح بالاترِ خود scope،
   *  ۲. وگرنه نوع/مقدار پیش‌فرض تعریف مرکزی،
   *  ۳. وگرنه null — وضعیت حذف‌شده به‌صورت خنثی نمایش داده می‌شود.
   */
  function deriveExcludedDisplayType(nearestActiveAbove, def) {
    if (nearestActiveAbove && nearestActiveAbove.mode === 'ACTIVE') return nearestActiveAbove.valueType;
    if (def.defaultValueType === 'PERCENT' || def.defaultValueType === 'FIXED_TIME') return def.defaultValueType;
    if (def.defaultTimeSeconds !== null && def.defaultTimeSeconds !== undefined) return 'FIXED_TIME';
    if (def.defaultValuePercent !== null && def.defaultValuePercent !== undefined) return 'PERCENT';
    return null;
  }

  /**
   * الونس‌های مؤثر یک scope با پیمایش زنجیره والد (از برگ به ریشه).
   * قواعد ۱ تا ۱۰ سند §۲.۴ — مطابق نسخه وب.
   */
  function resolveEffectiveAllowances(params) {
    var definitions = params.definitions;
    var assignments = params.assignments;
    var chain = params.chain;
    var target = chain[chain.length - 1];
    if (!target) throw new Error('زنجیره scope خالی است.');

    var rows = [];
    var count = 0, totalPercent = 0, perExecutionSeconds = 0, perCycleSeconds = 0, needsAggregationCount = 0;

    var sortedDefs = definitions.slice().sort(function (a, b) {
      return a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, 'fa');
    });

    for (var di = 0; di < sortedDefs.length; di++) {
      var def = sortedDefs[di];
      if (!def.isActive) continue;

      var decision = null, parentDecision = null;
      for (var i = chain.length - 1; i >= 0; i--) {
        var link = chain[i];
        var found = null;
        for (var ai = 0; ai < assignments.length; ai++) {
          var a = assignments[ai];
          if (a.definitionId === def.id && a.scopeType === link.type && a.scopeId === link.id &&
              (a.mode === 'ACTIVE' || a.mode === 'EXCLUDE')) { found = a; break; }
        }
        if (!found) continue;
        if (!decision) decision = found;
        else if (!parentDecision) parentDecision = found;
        if (decision && parentDecision) break;
      }

      if (!decision) continue;

      var isLocal = decision.scopeType === target.type && decision.scopeId === target.id;
      var sourceLink = null;
      for (var ci = 0; ci < chain.length; ci++) {
        if (chain[ci].type === decision.scopeType && chain[ci].id === decision.scopeId) { sourceLink = chain[ci]; break; }
      }

      // نزدیک‌ترین تصمیم «فعال» در سطح بالاترِ خود scope — برای نوع نمایشی EXCLUDED (الزام ۴)
      var nearestActiveAbove = null;
      for (var ni = chain.length - 1; ni >= 0; ni--) {
        var nLink = chain[ni];
        if (nLink.type === target.type && nLink.id === target.id) continue; // خود scope
        for (var na = 0; na < assignments.length; na++) {
          var aA = assignments[na];
          if (aA.definitionId === def.id && aA.scopeType === nLink.type && aA.scopeId === nLink.id && aA.mode === 'ACTIVE') {
            nearestActiveAbove = aA;
            break;
          }
        }
        if (nearestActiveAbove) break;
      }

      // والد مستقیم scope (نه والد تصمیم):
      //  • تصمیم محلی وجود دارد → والد = نزدیک‌ترین تصمیم بالاتر (parentDecision)
      //  • تصمیم ارثی است → خود تصمیم از والد می‌آید؛ والد مستقیم همان است.
      var directParent = isLocal ? parentDecision : decision;
      var parentIsActive = directParent !== null && directParent.mode === 'ACTIVE';

      var status;
      if (decision.mode === 'EXCLUDE') status = 'EXCLUDED';
      else if (isLocal && parentDecision) status = 'OVERRIDDEN';
      else if (isLocal) status = 'CUSTOM';
      else status = 'INHERITED';

      var excluded = decision.mode === 'EXCLUDE';
      // نوع نمایشی ردیف — برای EXCLUDED از منابع معنادار مشتق می‌شود (الزام ۴)
      var rowValueType = excluded ? deriveExcludedDisplayType(nearestActiveAbove, def) : decision.valueType;
      // مبنای نمایشی — بازبینی تکمیلی ج۱ (هم‌ارز نسخه وب): برای EXCLUDED از تخصیص فعال
      // بالادست منتقل می‌شود؛ پیش‌فرض مرکزی مبنای واقعی ندارد → null.
      var displayApplicationBasis = excluded
        ? (nearestActiveAbove && nearestActiveAbove.mode === 'ACTIVE' && nearestActiveAbove.valueType === 'FIXED_TIME'
            ? nearestActiveAbove.applicationBasis : null)
        : (decision.valueType === 'FIXED_TIME' ? decision.applicationBasis : null);
      var needsAggregationRule =
        !excluded &&
        decision.valueType === 'FIXED_TIME' &&
        decision.applicationBasis === 'PER_ELEMENT_EXECUTION' &&
        decision.scopeType !== 'WORK_ELEMENT';

      var note = null;
      if (excluded) {
        note = isLocal
          ? 'این الونس در همین سطح از ارث‌بری حذف شده و روی این شاخه و زیرمجموعه‌هایش اعمال نمی‌شود.'
          : 'حذف از ارث‌بری در سطح «' + (sourceLink ? sourceLink.label : decision.scopeType) + '» اعلام شده و در این شاخه غیرفعال است.';
      } else if (needsAggregationRule) {
        note = 'زمان ثابت «به‌ازای هر اجرا» در سطح بالاتر از عنصر تعریف شده است؛ قاعده تجمیع مهندسی تعیین نشده و مقدار بی‌صدا حذف یا چندبار اعمال نمی‌شود — در ST عنصر لحاظ نشد.';
      } else if (isLocal && parentDecision && parentDecision.mode === 'EXCLUDE') {
        note = 'این شاخه پس از حذف از ارث‌بری در سطح بالاتر، با تعریف مجدد صریح دوباره فعال شده است.';
      } else if (status === 'OVERRIDDEN') {
        var pLink = null;
        for (var pi = 0; pi < chain.length; pi++) {
          if (chain[pi].type === parentDecision.scopeType && chain[pi].id === parentDecision.scopeId) { pLink = chain[pi]; break; }
        }
        note = 'مقدار سطح «' + (pLink ? pLink.label : parentDecision.scopeType) + '» در همین سطح جایگزین شده است.';
      }

      var row = {
        definitionId: def.id,
        title: def.title,
        code: def.code || null,
        status: status,
        valueType: rowValueType,
        percentValue: !excluded && decision.valueType === 'PERCENT' ? decision.percentValue : null,
        timeValueSeconds: !excluded && decision.valueType === 'FIXED_TIME' ? decision.timeValueSeconds : null,
        applicationBasis: decision.valueType === 'FIXED_TIME' ? decision.applicationBasis : null,
        displayApplicationBasis: displayApplicationBasis,
        sourceScopeType: decision.scopeType,
        sourceScopeLabel: sourceLink ? sourceLink.label : null,
        hasLocalDecision: isLocal,
        parentValue: parentIsActive ? assignmentValueOf(directParent) : null,
        parentValueType: parentIsActive ? directParent.valueType : null,
        parentApplicationBasis: parentIsActive && directParent.valueType === 'FIXED_TIME' ? directParent.applicationBasis : null,
        parentScopeType: directParent ? directParent.scopeType : null,
        parentDecisionExists: directParent !== null,
        parentMode: directParent ? directParent.mode : null,
        needsAggregationRule: needsAggregationRule,
        note: note,
      };
      rows.push(row);

      if (!excluded && !needsAggregationRule) {
        count++;
        if (decision.valueType === 'PERCENT' && row.percentValue !== null) {
          totalPercent += row.percentValue;
        } else if (decision.valueType === 'FIXED_TIME' && row.timeValueSeconds !== null) {
          if (row.applicationBasis === 'PER_CYCLE') perCycleSeconds += row.timeValueSeconds;
          else perExecutionSeconds += row.timeValueSeconds;
        }
      } else if (needsAggregationRule) {
        needsAggregationCount++;
      }
    }

    return {
      scopeType: target.type,
      scopeId: target.id,
      rows: rows,
      summary: {
        count: count,
        totalPercent: round12(totalPercent),
        perExecutionSeconds: round12(perExecutionSeconds),
        perCycleSeconds: round12(perCycleSeconds),
        needsAggregationCount: needsAggregationCount,
      },
    };
  }

  /**
   * ST عنصر با ترتیب قطعی (§۳):
   *  ۱. درصدها مطابق روش پروژه روی NT اعمال می‌شوند.
   *  ۲. سپس ثانیه‌های ثابت per-execution اضافه می‌شوند.
   * per-cycle جداگانه — در ST عنصر ضرب نمی‌شود.
   */
  function computeElementStandardTime(normalTime, factors, method) {
    var percentPart = computeStandardTime(normalTime, factors.totalPercent, method);
    var st = round12(percentPart + factors.perExecutionSeconds);
    var stFormula = method === 'PERCENT_OF_NT' ? 'NT × (1 + A)' : 'NT / (1 − A)';
    var explanation = factors.perExecutionSeconds > 0
      ? 'ST = (' + stFormula + ' با A=' + factors.totalPercent + ') + ' + factors.perExecutionSeconds + 's زمان ثابت هر اجرا'
      : 'ST = ' + stFormula + ' با A=' + factors.totalPercent;
    return { st: st, explanation: explanation };
  }

  g.T2F = {
    round12: round12, computeRatingFactor: computeRatingFactor, computeNormalTime: computeNormalTime,
    sumAllowances: sumAllowances, allowanceError: allowanceError, computeStandardTime: computeStandardTime,
    deriveContinuousDuration: deriveContinuousDuration, deriveContinuousSequence: deriveContinuousSequence,
    intervalError: intervalError, intervalDuration: intervalDuration, sumIntervalDurations: sumIntervalDurations,
    elapsedCycleTime: elapsedCycleTime, hasOverlapIntervals: hasOverlapIntervals,
    descriptiveStats: descriptiveStats, median: median, mad: mad, detectOutliers: detectOutliers,
    weightedMeanByCount: weightedMeanByCount, equalOperatorMean: equalOperatorMean, aggregateElement: aggregateElement,
    roundForDisplay: roundForDisplay, formatForDisplay: formatForDisplay, REFERENCE_TESTS: REFERENCE_TESTS,
    // ── جلسه اول: الونس‌های سلسله‌مراتبی ──
    validateAssignmentValue: validateAssignmentValue, AllowanceValueError: AllowanceValueError,
    resolveEffectiveAllowances: resolveEffectiveAllowances, computeElementStandardTime: computeElementStandardTime,
  };
})(typeof window !== 'undefined' ? window : globalThis);
