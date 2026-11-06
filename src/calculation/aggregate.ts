// ═══════════════════════════════════════════════════════════
// موتور محاسبات — تجمیع چند اپراتور — FR-14 / ۱۰.۱
// پیش‌فرض: میانگین وزنی بر اساس تعداد مشاهدات معتبر
//   (همه مشاهدات معتبر وزن یکسان دارند)
// روش جایگزین: میانگین اپراتورها با وزن برابر
// روش انتخابی باید در گزارش ثبت شود.
// ═══════════════════════════════════════════════════════════
import { round12 } from './westinghouse'

export interface OperatorSample {
  operatorId: string
  values: number[] // مشاهدات معتبر
}

/** میانگین وزنی بر اساس تعداد مشاهدات (پیش‌فرض PRD) */
export function weightedMeanByCount(samples: OperatorSample[]): number | null {
  const all = samples.flatMap((s) => s.values)
  if (all.length === 0) return null
  return round12(all.reduce((s, v) => s + v, 0) / all.length)
}

/** میانگین اپراتورها با وزن برابر (روش جایگزین — ۱۰.۱) */
export function equalOperatorMean(samples: OperatorSample[]): number | null {
  const means = samples
    .filter((s) => s.values.length > 0)
    .map((s) => s.values.reduce((x, v) => x + v, 0) / s.values.length)
  if (means.length === 0) return null
  return round12(means.reduce((s, v) => s + v, 0) / means.length)
}

/** میانگین تجمیعی عنصر با روش انتخابی */
export function aggregateElement(
  samples: OperatorSample[],
  method: 'WEIGHTED_BY_COUNT' | 'EQUAL_OPERATOR_MEAN'
): { value: number | null; method: string; perOperator: { operatorId: string; count: number; mean: number | null }[] } {
  const perOperator = samples.map((s) => ({
    operatorId: s.operatorId,
    count: s.values.length,
    mean:
      s.values.length > 0
        ? round12(s.values.reduce((x, v) => x + v, 0) / s.values.length)
        : null,
  }))
  const value =
    method === 'EQUAL_OPERATOR_MEAN' ? equalOperatorMean(samples) : weightedMeanByCount(samples)
  return { value, method, perOperator }
}
