'use client'

// ═══════════════════════════════════════════════════════════
// قلاب ذخیره خودکار — FR-23 / ۶.۶
// batching با تأخیر کوتاه، وضعیت سه‌گانه (در حال ذخیره/
// ذخیره شد/خطا)، Retry صریح، صف ترتیب‌دار، Idempotency
// هیچ پیام موفقیت قبل از تأیید Backend نمایش داده نمی‌شود
// ═══════════════════════════════════════════════════════════
import { useCallback, useEffect, useRef, useState } from 'react'

export type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error'

interface UseAutosaveOptions<T> {
  /** مقدار فعلی داده */
  data: T
  /** آیا داده از ابتدا بارگذاری شده (از ارسال اولیه جلوگیری می‌کند) */
  ready: boolean
  /** تأخیر batching پیش‌فرض ۸۰۰ms — ۶.۶ */
  delayMs?: number
  /** تابع ذخیره؛ باید promise برگرداند؛ خطا با throw */
  save: (data: T) => Promise<void>
  /** مقایسه برای تشخیص تغییر */
  isEqual?: (a: T, b: T) => boolean
}

export function useAutosave<T>({ data, ready, delayMs = 800, save, isEqual }: UseAutosaveOptions<T>) {
  const [status, setStatus] = useState<SaveStatus>('idle')
  const [lastError, setLastError] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savingRef = useRef(false)
  const pendingRef = useRef(false)
  const latestRef = useRef(data)
  const lastSavedRef = useRef<T>(data)
  const mountedRef = useRef(true)

  const eq = useCallback(
    (a: T, b: T) => (isEqual ? isEqual(a, b) : JSON.stringify(a) === JSON.stringify(b)),
    [isEqual]
  )

  const doSave = useCallback(
    async (value: T) => {
      if (savingRef.current) {
        pendingRef.current = true
        latestRef.current = value
        return
      }
      savingRef.current = true
      setStatus('saving')
      setLastError(null)
      try {
        await save(value)
        if (!mountedRef.current) return
        lastSavedRef.current = value
        setStatus('saved')
      } catch (err) {
        if (!mountedRef.current) return
        setStatus('error')
        setLastError(err instanceof Error ? err.message : 'خطای نامشخص در ذخیره‌سازی')
        return // داده ناموفق در صف می‌ماند — Retry صریح
      } finally {
        savingRef.current = false
      }
      if (pendingRef.current) {
        pendingRef.current = false
        const next = latestRef.current
        if (!eq(next, lastSavedRef.current)) {
          void doSave(next)
        }
      }
    },
    [save, eq]
  )

  useEffect(() => {
    mountedRef.current = true
    latestRef.current = data
    if (!ready) return
    if (eq(data, lastSavedRef.current)) {
      if (status === 'dirty' || status === 'saving') return
      return
    }
    setStatus('dirty')
    if (timerRef.current) clearTimeout(timerRef.current)
    // batching: تغییرات متوالی در یک درخواست ادغام می‌شوند — FR-23
    timerRef.current = setTimeout(() => {
      void doSave(data)
    }, delayMs)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
     
  }, [data, ready, delayMs])

  /** تلاش مجدد صریح پس از خطا — FR-23 */
  const retry = useCallback(() => {
    setStatus('dirty')
    void doSave(latestRef.current)
  }, [doSave])

  /** flush هنگام خروج از صفحه — ۶.۶ */
  const flush = useCallback(async () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (!eq(latestRef.current, lastSavedRef.current)) {
      await doSave(latestRef.current)
    }
  }, [doSave, eq])

  useEffect(() => {
    return () => {
      mountedRef.current = false
    }
  }, [])

  return { status, lastError, retry, flush, setStatus }
}
