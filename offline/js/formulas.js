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


  /* ═══════════════════════════════════════════════════════════
     جلسه دوم — موتور مرکزی هم‌پوشانی عناصر کاری
     پورت «دقیق و بدون تغییر» از src/calculation/overlap-matrix.ts
     مبانی: O(A,B) = max(0, min(E_A,E_B) − max(S_A,S_B))؛ چندتایی = کمینهٔ
     زوج‌ها؛ union با sweep-line؛ validator محلی/سه‌تایی/سراسری با solver
     قیود اختلافی + Bellman-Ford + شاخه‌وکران + مؤلفه‌های همبند.
     ═══════════════════════════════════════════════════════════ */

  function pairKey(a, b) { return a < b ? a + '|' + b : b + '|' + a; }

  function pairwiseOverlap(a, b) {
    var inter = Math.min(a.endOffset, b.endOffset) - Math.max(a.startOffset, b.startOffset);
    return round12(Math.max(0, inter));
  }

  function pairwiseOverlapFromDelta(dA, dB, delta) {
    var inter = delta >= 0 ? Math.min(dA - delta, dB) : Math.min(dA, dB + delta);
    return round12(Math.max(0, inter));
  }

  function multiOverlap(memberIds, pairLookup, durations) {
    if (memberIds.length === 0) return { value: null, provisional: false, missingPairs: [] };
    if (memberIds.length === 1) {
      return { value: durations[memberIds[0]] !== undefined ? durations[memberIds[0]] : null, provisional: false, missingPairs: [] };
    }
    var min = null;
    var missingPairs = [];
    for (var i = 0; i < memberIds.length; i++) {
      for (var j = i + 1; j < memberIds.length; j++) {
        var a = memberIds[i], b = memberIds[j];
        var p = pairLookup(a, b);
        if (!p || p.status === 'UNREVIEWED') { missingPairs.push([a, b]); continue; }
        var v = p.status === 'NO_OVERLAP' ? 0 : (p.overlapDuration != null ? p.overlapDuration : 0);
        if (min === null || v < min) min = v;
      }
    }
    if (min === null) return { value: null, provisional: missingPairs.length > 0, missingPairs: missingPairs };
    return { value: min, provisional: missingPairs.length > 0, missingPairs: missingPairs };
  }

  function unionOfIntervals(intervals) {
    if (intervals.length === 0) return null;
    var events = [];
    for (var k = 0; k < intervals.length; k++) {
      var iv = intervals[k];
      if (iv.startOffset == null || iv.endOffset == null || iv.endOffset <= iv.startOffset) return null;
      events.push({ t: iv.startOffset, delta: 1 });
      events.push({ t: iv.endOffset, delta: -1 });
    }
    events.sort(function (x, y) { return x.t - y.t || y.delta - x.delta; });
    var active = 0, total = 0, lastT = 0, started = false;
    for (var e = 0; e < events.length; e++) {
      if (active > 0 && started) total += events[e].t - lastT;
      active += events[e].delta;
      lastT = events[e].t;
      started = true;
    }
    return round12(total);
  }

  function unionByInclusionExclusion(durations, pairValues, memberIds) {
    var ds = memberIds.map(function (id) { return durations[id] !== undefined ? durations[id] : null; });
    for (var q = 0; q < ds.length; q++) if (ds[q] == null) return null;
    if (memberIds.length < 2 || memberIds.length > 3) return null;
    var sum = 0;
    for (var d = 0; d < ds.length; d++) sum += ds[d];
    var pair = function (a, b) { return pairValues[pairKey(a, b)]; };
    for (var i = 0; i < memberIds.length; i++) {
      for (var j = i + 1; j < memberIds.length; j++) {
        var p = pair(memberIds[i], memberIds[j]);
        if (!p || p.status === 'UNREVIEWED') return null;
        sum -= p.status === 'NO_OVERLAP' ? 0 : (p.overlapDuration != null ? p.overlapDuration : 0);
      }
    }
    if (memberIds.length === 3) {
      var triple = multiOverlap(memberIds, function (x, y) { return pairValues[pairKey(x, y)]; }, durations);
      if (triple.value == null || triple.provisional) return null;
      sum += triple.value;
    }
    return round12(sum);
  }

  function validatePairLocally(pair, durations) {
    var failures = [];
    if (pair.elementAId === pair.elementBId) {
      failures.push({ code: 'SELF_RELATION', message: 'عنصر نمی‌تواند با خودش رابطهٔ موازی داشته باشد.' });
      return failures;
    }
    var status = pair.status, overlapDuration = pair.overlapDuration;
    if (status === 'UNREVIEWED') {
      if (overlapDuration != null) {
        failures.push({ code: 'UNREVIEWED_WITH_VALUE', message: 'رابطهٔ بررسی‌نشده نباید مقدار هم‌پوشانی داشته باشد.' });
      }
      return failures;
    }
    if (status === 'NO_OVERLAP') {
      if (overlapDuration != null && overlapDuration !== 0) {
        failures.push({ code: 'NO_OVERLAP_WITH_POSITIVE', message: 'وضعیت «بدون هم‌پوشانی» با مقدار مثبت جمع نمی‌شود؛ مقدار باید صفر باشد.' });
      }
      return failures;
    }
    if (overlapDuration == null) {
      failures.push({ code: 'OVERLAP_WITHOUT_VALUE', message: 'وضعیت «دارای هم‌پوشانی» نیاز به مقدار مثبت دارد.' });
      return failures;
    }
    if (!isFinite(overlapDuration)) {
      failures.push({ code: 'NOT_A_NUMBER', message: 'مقدار هم‌پوشانی عدد معتبری نیست.' });
      return failures;
    }
    if (overlapDuration <= 0) {
      failures.push({ code: 'NON_POSITIVE_OVERLAP', message: 'مقدار هم‌پوشانی باید مثبت باشد؛ صفر یا منفی در وضعیت «دارای هم‌پوشانی» نامعتبر است.' });
      return failures;
    }
    var dA = durations[pair.elementAId] !== undefined ? durations[pair.elementAId] : null;
    var dB = durations[pair.elementBId] !== undefined ? durations[pair.elementBId] : null;
    if (dA != null && dB != null) {
      if (dA === 0 || dB === 0) {
        failures.push({ code: 'POSITIVE_FOR_ZERO_DURATION', message: 'عنصر با مدت صفر نمی‌تواند هم‌پوشانی مثبت داشته باشد.' });
      } else if (overlapDuration > Math.min(dA, dB) + 1e-9) {
        failures.push({ code: 'EXCEEDS_DURATION', message: 'مقدار هم‌پوشانی (' + overlapDuration + ') از مدت کوتاه‌تر عنصر (' + round12(Math.min(dA, dB)) + ') بیشتر است.' });
      }
    }
    return failures;
  }

  function tripleConstraintViolations(memberIds, durations, pairLookup, nameOf) {
    nameOf = nameOf || function (id) { return id; };
    var issues = [];
    var confirmed = function (a, b) {
      var p = pairLookup(a, b);
      if (!p || p.status === 'UNREVIEWED') return null;
      return p.status === 'NO_OVERLAP' ? 0 : (p.overlapDuration != null ? p.overlapDuration : 0);
    };
    var seen = {};
    for (var i = 0; i < memberIds.length; i++) {
      var a = memberIds[i];
      var dA = durations[a] !== undefined ? durations[a] : null;
      if (dA == null) continue;
      for (var j = 0; j < memberIds.length; j++) {
        for (var k = j + 1; k < memberIds.length; k++) {
          if (i === j || i === k) continue;
          var b = memberIds[j], c = memberIds[k];
          var oAB = confirmed(a, b), oAC = confirmed(a, c), oBC = confirmed(b, c);
          if (oAB == null || oAC == null || oBC == null) continue;
          var lowerBound = Math.max(0, oAB + oAC - dA);
          if (oBC + 1e-9 < lowerBound) {
            var key = [a, b, c].sort().join('|');
            if (seen[key]) continue;
            seen[key] = true;
            issues.push({
              message: 'هم‌پوشانی زوج «' + nameOf(b) + '» و «' + nameOf(c) + '» (' + oBC + ') کمتر از حداقل لازم (' + round12(lowerBound) + ') بر اساس مدت «' + nameOf(a) + '» و دو زوج دیگر است.',
              responsibleElementIds: [a, b, c],
              responsiblePairs: [[a, b], [a, c], [b, c]],
              kind: 'DEFINITE',
            });
          }
        }
      }
    }
    return issues;
  }

  function minimumRequiredOverlap(b, c, memberIds, durations, pairLookup) {
    var confirmed = function (x, y) {
      var p = pairLookup(x, y);
      if (!p || p.status === 'UNREVIEWED') return null;
      return p.status === 'NO_OVERLAP' ? 0 : (p.overlapDuration != null ? p.overlapDuration : 0);
    };
    var min = 0;
    for (var i = 0; i < memberIds.length; i++) {
      var a = memberIds[i];
      if (a === b || a === c) continue;
      var dA = durations[a] !== undefined ? durations[a] : null;
      var oAB = confirmed(a, b), oAC = confirmed(a, c);
      if (dA == null || oAB == null || oAC == null) continue;
      min = Math.max(min, oAB + oAC - dA);
    }
    return round12(Math.max(0, min));
  }

  function differenceConstraintsFeasible(vars, constraints) {
    var edges = [];
    for (var i = 0; i < constraints.length; i++) edges.push([constraints[i].u, constraints[i].v, constraints[i].c]);
    var dist = {};
    for (var v = 0; v < vars.length; v++) dist[vars[v]] = 0;
    var n = vars.length;
    for (var iter = 0; iter < n; iter++) {
      var changed = false;
      for (var e = 0; e < edges.length; e++) {
        var du = dist[edges[e][0]], dv = dist[edges[e][1]];
        if (du + edges[e][2] < dv - 1e-9) {
          dist[edges[e][1]] = du + edges[e][2];
          changed = true;
        }
      }
      if (!changed) return true;
      if (iter === n - 1) return false;
    }
    return true;
  }

  function solveComponent(comp, compPairs, durations, budget) {
    var choices = [];
    for (var i = 0; i < compPairs.length; i++) {
      var p = compPairs[i];
      var dA = durations[p.a] != null ? durations[p.a] : 0;
      var dB = durations[p.b] != null ? durations[p.b] : 0;
      var minD = Math.min(dA, dB);
      if (p.o > minD + 1e-9) return 'INFEASIBLE';
      if (p.o <= 1e-9) {
        choices.push({
          pair: p,
          options: [
            [{ u: p.b, v: p.a, c: -dA }],
            [{ u: p.a, v: p.b, c: -dB }],
          ],
        });
      } else if (Math.abs(p.o - minD) <= 1e-9) {
        var shortLong = dA <= dB ? [p.a, p.b] : [p.b, p.a];
        var diff = Math.abs(dA - dB);
        choices.push({
          pair: p,
          options: [[
            { u: shortLong[1], v: shortLong[0], c: diff },
            { u: shortLong[0], v: shortLong[1], c: 0 },
          ]],
        });
      } else {
        choices.push({
          pair: p,
          options: [
            [{ u: p.a, v: p.b, c: dA - p.o }, { u: p.b, v: p.a, c: -(dA - p.o) }],
            [{ u: p.b, v: p.a, c: dB - p.o }, { u: p.a, v: p.b, c: -(dB - p.o) }],
          ],
        });
      }
    }
    choices.sort(function (x, y) { return x.options.length - y.options.length; });
    var budgetOver = false;
    function search(idx, acc) {
      if (idx === choices.length) return differenceConstraintsFeasible(comp, acc);
      for (var oi = 0; oi < choices[idx].options.length; oi++) {
        if (!budget()) { budgetOver = true; return false; }
        var next = acc.concat(choices[idx].options[oi]);
        if (!differenceConstraintsFeasible(comp, next)) continue;
        if (search(idx + 1, next)) return true;
      }
      return false;
    }
    var feasible = search(0, []);
    if (budgetOver) return 'BUDGET';
    return feasible ? 'FEASIBLE' : 'INFEASIBLE';
  }

  function validateIntervalRealizability(memberIds, durations, pairLookup, options) {
    options = options || {};
    var searchBudget = options.searchBudget != null ? options.searchBudget : 200000;
    var nameOf = options.nameOf || function (id) { return id; };
    var issues = [];
    var missingDuration = [];
    var known = [];
    for (var m = 0; m < memberIds.length; m++) {
      if (durations[memberIds[m]] == null) missingDuration.push(memberIds[m]);
      else known.push(memberIds[m]);
    }
    var pairs = [];
    for (var i = 0; i < known.length; i++) {
      for (var j = i + 1; j < known.length; j++) {
        var p = pairLookup(known[i], known[j]);
        if (!p || p.status === 'UNREVIEWED') continue;
        var o = p.status === 'NO_OVERLAP' ? 0 : (p.overlapDuration != null ? p.overlapDuration : 0);
        pairs.push({ a: known[i], b: known[j], o: o });
      }
    }
    if (missingDuration.length > 0 && pairs.length > 0) {
      var names = [];
      for (var mm = 0; mm < missingDuration.length; mm++) names.push('«' + nameOf(missingDuration[mm]) + '»');
      issues.push({
        message: 'مدت عنصرهای ' + names.join(' و ') + ' در این چرخه ثبت نشده؛ اعتبارسنجی سراسری فقط برای عنصرهای دارای داده انجام شد.',
        responsibleElementIds: missingDuration.slice(),
        kind: 'INDETERMINATE',
      });
    }
    var comps = connectedComponents(known, function (a, b) {
      for (var q = 0; q < pairs.length; q++) {
        if ((pairs[q].a === a && pairs[q].b === b) || (pairs[q].a === b && pairs[q].b === a)) return true;
      }
      return false;
    });
    var searched = 0;
    var overflow = false;
    for (var ci = 0; ci < comps.length; ci++) {
      var comp = comps[ci];
      var compSet = {};
      for (var cc = 0; cc < comp.length; cc++) compSet[comp[cc]] = true;
      var compPairs = [];
      for (var pp = 0; pp < pairs.length; pp++) {
        if (compSet[pairs[pp].a] && compSet[pairs[pp].b]) compPairs.push(pairs[pp]);
      }
      if (compPairs.length === 0) continue;
      var res = solveComponent(comp, compPairs, durations, function () {
        searched++;
        return searched <= searchBudget;
      });
      if (res === 'BUDGET') {
        overflow = true;
        issues.push({
          message: 'پیچیدگی دادهٔ هم‌پوشانی از حد امن محاسباتی فراتر رفت؛ نتیجهٔ سراسری نامعین است (INDETERMINATE).',
          responsibleElementIds: comp.slice(),
          kind: 'INDETERMINATE',
        });
        continue;
      }
      if (res === 'INFEASIBLE') {
        var respPairs = [];
        for (var rp = 0; rp < compPairs.length; rp++) respPairs.push([compPairs[rp].a, compPairs[rp].b]);
        issues.push({
          message: 'نمی‌توان بازه‌های پیوسته‌ای روی محور زمانی مشترک یافت که همهٔ هم‌پوشانی‌های تأییدشدهٔ این مجموعه را دقیقاً برآورده کند.',
          responsibleElementIds: comp.slice(),
          responsiblePairs: respPairs,
          kind: 'DEFINITE',
        });
      }
    }
    var hasDefinite = false;
    for (var hi = 0; hi < issues.length; hi++) if (issues[hi].kind === 'DEFINITE') { hasDefinite = true; break; }
    if (hasDefinite) return { verdict: 'INVALID', issues: issues };
    if (overflow) return { verdict: 'INDETERMINATE', issues: issues };
    for (var ii = 0; ii < issues.length; ii++) if (issues[ii].kind === 'INDETERMINATE') return { verdict: 'INDETERMINATE', issues: issues };
    return { verdict: 'VALID', issues: issues };
  }

  function connectedComponents(memberIds, connected) {
    var adj = {};
    for (var i = 0; i < memberIds.length; i++) adj[memberIds[i]] = [];
    for (var a = 0; a < memberIds.length; a++) {
      for (var b = a + 1; b < memberIds.length; b++) {
        if (connected(memberIds[a], memberIds[b])) {
          adj[memberIds[a]].push(memberIds[b]);
          adj[memberIds[b]].push(memberIds[a]);
        }
      }
    }
    var seen = {};
    var out = [];
    for (var s = 0; s < memberIds.length; s++) {
      if (seen[memberIds[s]]) continue;
      var stack = [memberIds[s]];
      seen[memberIds[s]] = true;
      var comp = [];
      while (stack.length) {
        var cur = stack.pop();
        comp.push(cur);
        var nbs = adj[cur] || [];
        for (var nb = 0; nb < nbs.length; nb++) {
          if (!seen[nbs[nb]]) { seen[nbs[nb]] = true; stack.push(nbs[nb]); }
        }
      }
      comp.sort();
      out.push(comp);
    }
    return out;
  }

  function analyzeProvisional(memberIds, durations, pairLookup, nameOf) {
    nameOf = nameOf || function (id) { return id; };
    var warnings = [];
    for (var i = 0; i < memberIds.length; i++) {
      for (var j = i + 1; j < memberIds.length; j++) {
        var a = memberIds[i], b = memberIds[j];
        var p = pairLookup(a, b);
        if (p && p.status !== 'UNREVIEWED') continue;
        var min = minimumRequiredOverlap(a, b, memberIds, durations, pairLookup);
        if (min > 1e-9) {
          warnings.push({
            message: 'رابطهٔ بررسی‌نشده «' + nameOf(a) + '» و «' + nameOf(b) + '» بر اساس سایر داده‌های تأییدشده حداقل ' + min + ' ثانیه هم‌پوشانی لازم دارد؛ نتیجهٔ فعلی موقتی است.',
            responsiblePairs: [[a, b]],
            kind: 'PROVISIONAL',
          });
        }
      }
    }
    var assumedLookup = function (a, b) {
      var p = pairLookup(a, b);
      if (!p) return undefined;
      if (p.status === 'UNREVIEWED') return { status: 'NO_OVERLAP', overlapDuration: 0 };
      return p;
    };
    var realizability = validateIntervalRealizability(memberIds, durations, assumedLookup, { nameOf: nameOf });
    if (realizability.verdict === 'INVALID') {
      for (var w = 0; w < realizability.issues.length; w++) {
        warnings.push({
          message: 'با فرض موقت «بدون هم‌پوشانی» برای روابط بررسی‌نشده، داده‌ها قابل تحقق نیستند: ' + realizability.issues[w].message + ' روابط نیازمند بررسی را مشخص و مقداردهی کنید.',
          responsibleElementIds: realizability.issues[w].responsibleElementIds,
          responsiblePairs: realizability.issues[w].responsiblePairs,
          kind: 'PROVISIONAL',
        });
      }
    }
    var provisionalMultiOverlap = {};
    var assumed = {};
    for (var ai = 0; ai < memberIds.length; ai++) {
      for (var aj = ai + 1; aj < memberIds.length; aj++) {
        var k = pairKey(memberIds[ai], memberIds[aj]);
        var v = assumedLookup(memberIds[ai], memberIds[aj]);
        if (v) assumed[k] = v;
      }
    }
    var comps = connectedComponents(memberIds, function (a, b) { return !!pairLookup(a, b); });
    for (var ci = 0; ci < comps.length; ci++) {
      if (comps[ci].length < 3) continue;
      var key = comps[ci].slice().sort().join('|');
      provisionalMultiOverlap[key] = multiOverlap(comps[ci], function (a, b) { return assumed[pairKey(a, b)]; }, durations);
    }
    return { warnings: warnings, provisionalMultiOverlap: provisionalMultiOverlap };
  }

  function runFullValidation(memberIds, durations, intervals, pairLookup, nameOf) {
    nameOf = nameOf || function (id) { return id; };
    var localFailures = [];
    for (var i = 0; i < memberIds.length; i++) {
      for (var j = i + 1; j < memberIds.length; j++) {
        var a = memberIds[i], b = memberIds[j];
        var p = pairLookup(a, b);
        if (!p) continue;
        var failures = validatePairLocally({ elementAId: a, elementBId: b, status: p.status, overlapDuration: p.overlapDuration }, durations);
        if (failures.length > 0) localFailures.push({ pair: [a, b], failures: failures });
      }
    }
    /* ۱.۵) تطبیق مقدار ثبت‌شده با بازهٔ واقعی چرخه — §۴ ممیزی جلسه ۲
       برای هر زوج با مقدار قطعی: هر دو بازه موجود → باید با
       max(0, min(E_A,E_B) − max(S_A,S_B)) برابر باشد (اختلاف = خطای قطعی)؛
       بازهٔ ناقص → ادعای VALID قطعی ممکن نیست (INDETERMINATE). */
    var intervalIssues = [];
    for (var ii = 0; ii < memberIds.length; ii++) {
      for (var jj = ii + 1; jj < memberIds.length; jj++) {
        var ia = memberIds[ii], ib = memberIds[jj];
        var ip = pairLookup(ia, ib);
        if (!ip || ip.status === 'UNREVIEWED') continue;
        var recorded = ip.status === 'NO_OVERLAP' ? 0 : (ip.overlapDuration != null ? ip.overlapDuration : 0);
        var ivA = intervals[ia], ivB = intervals[ib];
        var completeA = !!ivA && ivA.startOffset != null && ivA.endOffset != null;
        var completeB = !!ivB && ivB.startOffset != null && ivB.endOffset != null;
        if (completeA && completeB) {
          var computed = pairwiseOverlap(ivA, ivB);
          if (Math.abs(recorded - computed) > 1e-6) {
            intervalIssues.push({
              pair: [ia, ib], recorded: recorded, computed: computed,
              message: 'مقدار ثبت‌شدهٔ هم‌پوشانی «' + nameOf(ia) + '» و «' + nameOf(ib) + '» (' + round12(recorded) + ') با هم‌پوشانی واقعی بازه‌های زمان‌سنجی این چرخه (' + round12(computed) + ' ثانیه) تطبیق ندارد؛ مقدار پیشنهادی ' + round12(computed) + ' است.',
              responsiblePairs: [[ia, ib]], kind: 'DEFINITE',
            });
          }
        } else {
          intervalIssues.push({
            pair: [ia, ib], recorded: recorded, computed: null,
            message: 'بازهٔ واقعی «' + nameOf(ia) + '» یا «' + nameOf(ib) + '» در این چرخه کامل نیست؛ مقدار ثبت‌شده با بازهٔ واقعی تطبیق داده نشد و اعتبارسنجی بر اساس مدت‌ها انجام شد.',
            responsiblePairs: [[ia, ib]], kind: 'INDETERMINATE',
          });
        }
      }
    }
    var tripleIssues = tripleConstraintViolations(memberIds, durations, pairLookup, nameOf);
    var confirmed = validateIntervalRealizability(memberIds, durations, pairLookup, { nameOf: nameOf });
    var provisional = analyzeProvisional(memberIds, durations, pairLookup, nameOf);
    var multiOverlaps = {};
    var unions = {};
    var relComponents = connectedComponents(memberIds, function (a, b) { return !!pairLookup(a, b); });
    for (var rc = 0; rc < relComponents.length; rc++) {
      var comp = relComponents[rc];
      if (comp.length < 2) continue;
      var key = comp.slice().sort().join('|');
      multiOverlaps[key] = multiOverlap(comp, pairLookup, durations);
      var realIntervals = [];
      for (var ci = 0; ci < comp.length; ci++) {
        var iv = intervals[comp[ci]];
        if (iv && iv.endOffset > iv.startOffset) realIntervals.push(iv);
      }
      if (realIntervals.length === comp.length) {
        unions[key] = { value: unionOfIntervals(realIntervals), source: 'INTERVALS' };
      } else {
        var pairValues = {};
        for (var pa = 0; pa < comp.length; pa++) {
          for (var pb = 0; pb < comp.length; pb++) {
            if (comp[pa] !== comp[pb]) pairValues[pairKey(comp[pa], comp[pb])] = pairLookup(comp[pa], comp[pb]);
          }
        }
        var byIE = unionByInclusionExclusion(durations, pairValues, comp);
        if (byIE != null) unions[key] = { value: byIE, source: 'INCLUSION_EXCLUSION' };
        else unions[key] = { value: null, source: 'NOT_COMPUTABLE' };
      }
    }
    return { confirmed: confirmed, localFailures: localFailures, tripleIssues: tripleIssues, intervalIssues: intervalIssues, provisional: provisional, multiOverlaps: multiOverlaps, unions: unions };
  }

  /* آیا در میان اعضا رابطهٔ فعال بررسی‌نشده هست؟ (رابطهٔ تعریف‌نشده ≠ بررسی‌نشده — §۳ ممیزی) */
  function hasUnreviewedRelation(memberIds, pairLookup) {
    for (var i = 0; i < memberIds.length; i++) {
      for (var j = i + 1; j < memberIds.length; j++) {
        var p = pairLookup(memberIds[i], memberIds[j]);
        if (p && p.status === 'UNREVIEWED') return true;
      }
    }
    return false;
  }

  /* دو حکم مستقل — §۳ ممیزی جلسه ۲:
     confirmedVerdict = سازگاری داده‌های تأییدشده؛ overallVerdict = نتیجهٔ نهایی
     با توجه به کامل‌بودن اعتبارسنجی (روابط بررسی‌نشده/بازهٔ ناقص → INDETERMINATE). */
  function computeVerdicts(memberIds, pairLookup, out) {
    var hasDefinite = out.localFailures.length > 0 || out.tripleIssues.length > 0 ||
      out.intervalIssues.some(function (i) { return i.kind === 'DEFINITE'; }) ||
      out.confirmed.verdict === 'INVALID';
    if (hasDefinite) return { confirmedVerdict: 'INVALID', overallVerdict: 'INVALID' };
    var confirmedVerdict = out.confirmed.verdict;
    var hasIncomplete = confirmedVerdict === 'INDETERMINATE' ||
      out.intervalIssues.some(function (i) { return i.kind === 'INDETERMINATE'; }) ||
      hasUnreviewedRelation(memberIds, pairLookup);
    if (hasIncomplete) return { confirmedVerdict: confirmedVerdict, overallVerdict: 'INDETERMINATE' };
    return { confirmedVerdict: confirmedVerdict, overallVerdict: 'VALID' };
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
    // ── جلسه دوم: موتور هم‌پوشانی ──
    pairKey: pairKey, pairwiseOverlap: pairwiseOverlap, pairwiseOverlapFromDelta: pairwiseOverlapFromDelta,
    multiOverlap: multiOverlap, unionOfIntervals: unionOfIntervals, unionByInclusionExclusion: unionByInclusionExclusion,
    validatePairLocally: validatePairLocally, tripleConstraintViolations: tripleConstraintViolations,
    minimumRequiredOverlap: minimumRequiredOverlap, validateIntervalRealizability: validateIntervalRealizability,
    connectedComponents: connectedComponents, analyzeProvisional: analyzeProvisional, runFullValidation: runFullValidation,
    hasUnreviewedRelation: hasUnreviewedRelation, computeVerdicts: computeVerdicts,
  };
})(typeof window !== 'undefined' ? window : globalThis);
