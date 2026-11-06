// ═══════════════════════════════════════════════════════════
// زیرساخت — Idempotency برای عملیات نوشتن — ۶.۶
// «API باید برای عملیات قابل تکرار، idempotency یا سازوکار
//  جلوگیری از ثبت دوباره داشته باشد»
// پیاده‌سازی: نگهداری درخواست‌های اخیر در حافظه (تک‌نمونه)
// ═══════════════════════════════════════════════════════════

interface CachedResult {
  status: number
  body: unknown
  at: number
}

const globalForIdem = globalThis as unknown as {
  __idemStore?: Map<string, CachedResult>
}

const store: Map<string, CachedResult> = (globalForIdem.__idemStore ??= new Map())

const TTL_MS = 10 * 60 * 1000 // ۱۰ دقیقه

/** اگر این changeId قبلاً پردازش شده، نتیجه ذخیره‌شده برمی‌گردد */
export function getIdempotentResult(changeId: string): CachedResult | null {
  const hit = store.get(changeId)
  if (!hit) return null
  if (Date.now() - hit.at > TTL_MS) {
    store.delete(changeId)
    return null
  }
  return hit
}

/** ذخیره نتیجه یک changeId */
export function storeIdempotentResult(changeId: string, status: number, body: unknown): void {
  if (!changeId) return
  store.set(changeId, { status, body, at: Date.now() })
  // پاکسازی دوره‌ای برای جلوگیری از رشد حافظه
  if (store.size > 500) {
    const now = Date.now()
    for (const [k, v] of store) {
      if (now - v.at > TTL_MS) store.delete(k)
    }
  }
}
