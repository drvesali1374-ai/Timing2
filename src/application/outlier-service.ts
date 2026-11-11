// ═══════════════════════════════════════════════════════════
// سرویس تشخیص مشاهدات غیرعادی — FR-18 / FR-11
// • مبنای تشخیص: مشاهدات عنصر با وضعیت VALID یا SUSPECT و مدت
//   محاسبه‌شده (در سراسر جلسات و اپراتورهای همان عنصر — همسو با OT)
// • علامت‌گذاری فقط «مشکوک» است؛ حذف خودکار ممنوع و داده خام
//   هرگز تغییر نمی‌کند.
// • تصمیم EXCLUDED فقط از آن کاربر است و هرگز بازنویسی نمی‌شود.
// • پس از هر تغییر داده (سلول، Paste، خروج/بازگشت) بازمحاسبه می‌شود؛
//   اگر مشاهده دیگر پرت نباشد، برچسب مشکوک به‌صورت شفاف برداشته
//   می‌شود (SUSPECT → VALID) و امتیاز پاک می‌گردد.
// ═══════════════════════════════════════════════════════════
import { db } from '@/lib/db'
import { detectOutliers, mad, type OutlierOptions } from '@/calculation/outlier'
import { descriptiveStats } from '@/calculation/statistics'
import { getAppSettings } from './settings-service'
import { markProjectCalculationsStale } from './calc-stale'

/** خواندن پیکربندی تشخیص از تنظیمات سراسری — FR-18 (آستانه/روش قابل تغییر) */
export async function getOutlierConfig(): Promise<OutlierOptions & { methodKey: string; thresholdKey: number }> {
  const settings = await getAppSettings()
  const method = settings['outlier.method'] === 'iqr' ? 'iqr' : 'mad'
  const thresholdRaw = Number(settings['outlier.threshold'])
  const threshold = Number.isFinite(thresholdRaw) && thresholdRaw > 0 ? thresholdRaw : 3.5
  return { method, threshold, methodKey: method, thresholdKey: threshold }
}

export interface OutlierRefreshResult {
  elementId: string
  basisCount: number
  flagged: number
  unflagged: number
}

/** بازمحاسبه پرچم‌های غیرعادی برای یک عنصر — داده خام دست‌نخورده می‌ماند */
export async function refreshOutliersForElement(elementId: string): Promise<OutlierRefreshResult> {
  const config = await getOutlierConfig()

  const observations = await db.elementObservation.findMany({
    where: { workElementId: elementId },
    select: {
      id: true,
      derivedDuration: true,
      validityStatus: true,
      outlierScore: true,
      outlierRule: true,
    },
  })

  // مبنای تشخیص: در محاسبات (VALID+SUSPECT) و دارای مدت — FR-14 همسو
  const basis = observations.filter(
    (o) => (o.validityStatus === 'VALID' || o.validityStatus === 'SUSPECT') && o.derivedDuration !== null
  )

  const flags = detectOutliers(
    basis.map((o) => ({ value: o.derivedDuration as number, ref: o.id })),
    { method: config.method, threshold: config.threshold }
  )
  const flaggedById = new Map(flags.map((f) => [f.ref as string, f]))

  // جلسه ۲ — snapshot تشخیصی در لحظهٔ پرچم‌گذاری (§۱۲.۳):
  // مقدار، روش، آستانهٔ واقعی استفاده‌شده و آمار مبنای flag ذخیره می‌شود
  // تا گزارش بعدی همان مبنای واقعی زمان flag را نشان دهد.
  const basisValues = basis.map((o) => o.derivedDuration as number)
  const basisStats = descriptiveStats(basisValues)
  const basisMedian = basisStats.median ?? null
  const basisMad = basisValues.length > 0 ? mad(basisValues) : null

  function buildSnapshot(flag: { value: number; score: number; rule: string; reason: string }): string {
    const iqrFallback = flag.rule === 'IQR_FENCE'
    const snapshot = {
      value: flag.value,
      method: config.method === 'iqr' ? 'iqr' : 'mad',
      methodLabel: config.method === 'iqr' ? 'حصار IQR' : 'امتیاز Z تعدیل‌شده (میانه و MAD)',
      threshold: config.method === 'iqr' ? 1.5 : config.threshold,
      thresholdLabel: config.method === 'iqr' ? 'ضریب حصار' : 'آستانهٔ امتیاز Z',
      score: flag.score,
      rule: flag.rule,
      reason: flag.reason,
      n: basisValues.length,
      statistics: {
        median: basisMedian,
        mad: basisMad,
        mean: basisStats.mean,
        sampleSD: basisStats.sampleSD,
        q1: basisStats.q1,
        q3: basisStats.q3,
        iqr: basisStats.iqr,
        // حصارهای IQR برای حالت fallback
        lowerFence: basisStats.q1 != null && basisStats.iqr != null ? basisStats.q1 - 1.5 * basisStats.iqr : null,
        upperFence: basisStats.q3 != null && basisStats.iqr != null ? basisStats.q3 + 1.5 * basisStats.iqr : null,
      },
      // در fallback به IQR این پرچم روش تشخیص واقعی است
      appliedRule: iqrFallback ? 'IQR_FENCE' : 'MODIFIED_Z_MAD',
      flaggedAt: new Date().toISOString(),
    }
    return JSON.stringify(snapshot)
  }

  let flagged = 0
  let unflagged = 0

  for (const o of basis) {
    const flag = flaggedById.get(o.id)
    if (flag) {
      const changed =
        o.validityStatus !== 'SUSPECT' ||
        o.outlierScore !== flag.score ||
        o.outlierRule !== flag.rule
      if (changed) {
        await db.elementObservation.update({
          where: { id: o.id },
          data: {
            validityStatus: 'SUSPECT',
            outlierScore: flag.score,
            outlierRule: flag.rule,
            outlierSnapshot: buildSnapshot(flag),
          },
        })
        flagged++
      }
    } else if (o.validityStatus === 'SUSPECT' || o.outlierScore !== null || o.outlierRule !== null) {
      // دیگر پرت نیست → برداشتن برچسب مشکوک به‌صورت شفاف
      await db.elementObservation.update({
        where: { id: o.id },
        data: { validityStatus: 'VALID', outlierScore: null, outlierRule: null, outlierSnapshot: null },
      })
      unflagged++
    }
  }

  // اگر تغییری رخ داده، پروژه‌ی صاحب عنصر باید STALE شود — FR-27
  if (flagged + unflagged > 0) {
    const el = await db.workElement.findUnique({
      where: { id: elementId },
      select: { activity: { select: { station: { select: { projectId: true } } } } },
    })
    if (el) await markProjectCalculationsStale(el.activity.station.projectId)
  }

  return { elementId, basisCount: basis.length, flagged, unflagged }
}

/** بازمحاسبه برای همه عناصر یک فعالیت */
export async function refreshOutliersForActivity(activityId: string): Promise<OutlierRefreshResult[]> {
  const elements = await db.workElement.findMany({
    where: { activityId },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: { id: true },
  })
  const results: OutlierRefreshResult[] = []
  for (const e of elements) {
    results.push(await refreshOutliersForElement(e.id))
  }
  return results
}

/** بازمحاسبه برای همه عناصر یک پروژه (پس از تغییر تنظیمات آستانه/روش) */
export async function refreshOutliersForProject(projectId: string): Promise<OutlierRefreshResult[]> {
  const elements = await db.workElement.findMany({
    where: { activity: { station: { projectId } } },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: { id: true },
  })
  const results: OutlierRefreshResult[] = []
  for (const e of elements) {
    results.push(await refreshOutliersForElement(e.id))
  }
  return results
}
