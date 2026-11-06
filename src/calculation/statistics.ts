// ═══════════════════════════════════════════════════════════
// موتور محاسبات — آمار توصیفی — FR-17
// mean / median / min / max / range / sample variance / sample SD
// CV / quartiles / IQR / CI میانگین (t)
// در صورت n<2 → SD و واریانس «قابل محاسبه نیست» (null) نه صفر
// ═══════════════════════════════════════════════════════════
import { round12 } from './westinghouse'

export interface DescriptiveStats {
  count: number
  mean: number | null
  median: number | null
  min: number | null
  max: number | null
  range: number | null
  sampleVariance: number | null
  sampleSD: number | null
  cvPercent: number | null
  q1: number | null
  q3: number | null
  iqr: number | null
  /** بازه اطمینان ۹۵٪ میانگین (t-distribution, n≥2) — روش/سطح در نمایش ذکر شود */
  ci95: { lower: number; upper: number } | null
}

function quantileSorted(sorted: number[], p: number): number {
  // روش خطی (inclusive) — هفتمین روش NIST
  const n = sorted.length
  if (n === 0) return NaN
  const idx = (n - 1) * p
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sorted[lo]
  return sorted[lo] + (idx - lo) * (sorted[hi] - sorted[lo])
}

/** مقدار t بحرانی دوطرفه ۹۵٪ برای df کوچک (جدول t استاندارد) */
const T95: Record<number, number> = {
  1: 12.706, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571, 6: 2.447, 7: 2.365, 8: 2.306,
  9: 2.262, 10: 2.228, 11: 2.201, 12: 2.179, 13: 2.16, 14: 2.145, 15: 2.131,
  20: 2.086, 25: 2.06, 30: 2.042, 40: 2.021, 60: 2.0, 120: 1.98,
}
function tCritical95(df: number): number {
  if (df <= 0) return NaN
  if (T95[df] !== undefined) return T95[df]
  if (df < 120) return T95[120] // تقریب محافظه‌کارانه برای df میانی
  return 1.96
}

export function descriptiveStats(values: number[]): DescriptiveStats {
  const clean = values.filter((v) => Number.isFinite(v))
  const n = clean.length
  if (n === 0) {
    return {
      count: 0, mean: null, median: null, min: null, max: null, range: null,
      sampleVariance: null, sampleSD: null, cvPercent: null, q1: null, q3: null, iqr: null, ci95: null,
    }
  }
  const sorted = [...clean].sort((a, b) => a - b)
  const mean = round12(clean.reduce((s, v) => s + v, 0) / n)
  const median = round12(quantileSorted(sorted, 0.5))
  const min = sorted[0]
  const max = sorted[n - 1]

  // واریانس نمونه — برای n>1 ؛ در غیر این صورت «قابل محاسبه نیست»
  let sampleVariance: number | null = null
  let sampleSD: number | null = null
  let ci95: DescriptiveStats['ci95'] = null
  if (n > 1) {
    sampleVariance = round12(clean.reduce((s, v) => s + (v - mean) * (v - mean), 0) / (n - 1))
    sampleSD = round12(Math.sqrt(sampleVariance))
    const t = tCritical95(n - 1)
    const half = t * (sampleSD / Math.sqrt(n))
    ci95 = { lower: round12(mean - half), upper: round12(mean + half) }
  }

  const q1 = round12(quantileSorted(sorted, 0.25))
  const q3 = round12(quantileSorted(sorted, 0.75))

  return {
    count: n,
    mean,
    median,
    min,
    max,
    range: round12(max - min),
    sampleVariance,
    sampleSD,
    cvPercent: mean !== 0 && sampleSD !== null ? round12((sampleSD / mean) * 100) : null,
    q1,
    q3,
    iqr: round12(q3 - q1),
    ci95,
  }
}

/** میانه (برای outlier) */
export function median(values: number[]): number {
  return quantileSorted([...values].sort((a, b) => a - b), 0.5)
}
