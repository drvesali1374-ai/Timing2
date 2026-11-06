// ═══════════════════════════════════════════════════════════
// موتور محاسبات — تشخیص مشاهدات غیرعادی — FR-18
// روش پیش‌فرض: امتیاز Z تعدیل‌شده بر پایه Median و MAD
//   M_i = 0.6745 × (x_i − median) / MAD    ، |M_i| > 3.5
// اگر MAD صفر یا نمونه بسیار کم → fallback کنترل‌شده به IQR
// یا هشدار «داده ناکافی» — تقسیم بر صفر ممنوع
// ⚠ تشخیص آماری فقط علامت‌گذاری است؛ حذف خودکار ممنوع — FR-11
// ═══════════════════════════════════════════════════════════
import { median } from './statistics'

export interface OutlierInput {
  value: number
  /** شناسه برای گزارش دقیق هشدار (عنصر، چرخه، اپراتور در لایه بالاتر تکمیل می‌شود) */
  ref?: string
}

export interface OutlierFlag {
  ref?: string
  value: number
  score: number
  rule: 'MODIFIED_Z_MAD' | 'IQR_FENCE' | 'INSUFFICIENT_DATA'
  reason: string
}

export interface OutlierOptions {
  method?: 'mad' | 'iqr'
  threshold?: number // پیش‌فرض 3.5
  /** حداقل تعداد نمونه برای اجرای MAD */
  madMinCount?: number // پیش‌فرض 4
  iqrK?: number // ضریب حصار IQR — پیش‌فرض 1.5
}

/** میانگین انحراف مطلق از میانه */
export function mad(values: number[], med?: number): number {
  const m = med ?? median(values)
  return median(values.map((v) => Math.abs(v - m)))
}

/** اجرای تشخیص غیرعادی روی مجموعه مقادیر */
export function detectOutliers(inputs: OutlierInput[], options: OutlierOptions = {}): OutlierFlag[] {
  const method = options.method ?? 'mad'
  const threshold = options.threshold ?? 3.5
  const madMinCount = options.madMinCount ?? 4
  const iqrK = options.iqrK ?? 1.5

  const values = inputs.map((i) => i.value)
  const n = values.length
  const flags: OutlierFlag[] = []

  const pushFlag = (i: OutlierInput, score: number, rule: OutlierFlag['rule'], reason: string) => {
    flags.push({ ref: i.ref, value: i.value, score, rule, reason })
  }

  if (method === 'mad') {
    if (n < madMinCount) {
      // نمونه بسیار کم → تشخیص آماری مطمئن ممکن نیست؛ هیچ علامتی نمی‌گذاریم (بدون هشدار جعلی)
      return flags
    }
    const med = median(values)
    const madValue = mad(values, med)
    if (madValue === 0) {
      // MAD صفر → fallback کنترل‌شده به IQR — FR-18
      return detectOutliers(inputs, { ...options, method: 'iqr' })
    }
    for (const item of inputs) {
      const score = Math.abs((0.6745 * (item.value - med)) / madValue)
      if (score > threshold) {
        pushFlag(
          item,
          score,
          'MODIFIED_Z_MAD',
          `امتیاز Z تعدیل‌شده ${score.toFixed(2)} از آستانه ${threshold} فراتر است (میانه=${med}، MAD=${madValue}).`
        )
      }
    }
    return flags
  }

  // ── روش IQR (fallback) ──
  if (n < 4) return flags // داده ناکافی
  const sorted = [...values].sort((a, b) => a - b)
  const q1 = quantile(sorted, 0.25)
  const q3 = quantile(sorted, 0.75)
  const iqr = q3 - q1
  if (iqr === 0) return flags // پراکندگی صفر → داده ناکافی برای تشخیص
  const lower = q1 - iqrK * iqr
  const upper = q3 + iqrK * iqr
  for (const item of inputs) {
    if (item.value < lower || item.value > upper) {
      const score = round2(Math.abs(item.value - median(values)) / iqr)
      pushFlag(
        item,
        score,
        'IQR_FENCE',
        `مقدار خارج از حصار IQR است (حصارها: ${round2(lower)} تا ${round2(upper)}؛ IQR=${round2(iqr)}).`
      )
    }
  }
  return flags
}

function quantile(sorted: number[], p: number): number {
  const n = sorted.length
  const idx = (n - 1) * p
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sorted[lo]
  return sorted[lo] + (idx - lo) * (sorted[hi] - sorted[lo])
}

function round2(v: number): number {
  return Math.round(v * 100) / 100
}
