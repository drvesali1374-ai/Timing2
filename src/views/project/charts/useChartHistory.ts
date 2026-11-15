'use client'

// ═══════════════════════════════════════════════════════════
// تاریخچهٔ Undo/Redo بوم نمودار — v1.5.2 §۱۰.۸
// ▸ هر عملیات ساختاری نمودار (افزودن/حذف/ویرایش گره، جابه‌جایی،
//   تغییر ترتیب، ایجاد/حذف یال، تغییر ظاهر یال) با عمل معکوس خود
//   در پشته ثبت می‌شود.
// ▸ Ctrl+Z = Undo · Ctrl+Y / Ctrl+Shift+Z = Redo — فقط وقتی کاربر
//   داخل فیلد متنی تایپ نمی‌کند و دیالوگی باز نیست.
// ▸ عملیات Undo/Redo خودشان وارد History نمی‌شوند؛ تغییر جدید پس از
//   Undo، شاخهٔ Redo را مطابق رفتار استاندارد پاک می‌کند.
// ▸ سقف ۶۰ مرحله برای جلوگیری از مصرف غیرضروری حافظه.
// هم‌ارز آفلاین: chartHistory در views-charts.js
// ═══════════════════════════════════════════════════════════
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

export interface HistoryEntry {
  /** برچسب فارسی برای tooltip دکمه‌ها */
  label: string
  undo: () => Promise<void>
  redo: () => Promise<void>
}

const HISTORY_LIMIT = 60

export function useChartHistory(busy: () => boolean) {
  const [entries, setEntries] = useState<HistoryEntry[]>([])
  const [index, setIndex] = useState(-1) // اشاره‌گر فعلی؛ -1 = ته پشتهٔ redo نیست، یعنی آخرین状态
  const [pending, setPending] = useState(false)
  const busyRef = useRef(busy)
  busyRef.current = busy
  const indexRef = useRef(-1)
  indexRef.current = index

  /** ثبت یک عملیات جدید — شاخهٔ Redo قبلی پاک می‌شود (رفتار استاندارد) */
  const push = useCallback((entry: HistoryEntry) => {
    setEntries((prev) => {
      const kept = prev.slice(0, indexRef.current + 1)
      kept.push(entry)
      const trimmed = kept.length > HISTORY_LIMIT ? kept.slice(kept.length - HISTORY_LIMIT) : kept
      indexRef.current = trimmed.length - 1
      setIndex(trimmed.length - 1)
      return trimmed
    })
  }, [])

  const undo = useCallback(async () => {
    if (indexRef.current < 0 || pending || busyRef.current()) return
    const entry = entries[indexRef.current]
    setPending(true)
    try {
      await entry.undo()
      indexRef.current -= 1
      setIndex(indexRef.current)
      toast.success(`واگردانی شد: ${entry.label}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'واگردانی ناموفق بود')
    } finally {
      setPending(false)
    }
  }, [entries, pending])

  const redo = useCallback(async () => {
    if (indexRef.current >= entries.length - 1 || pending || busyRef.current()) return
    const entry = entries[indexRef.current + 1]
    setPending(true)
    try {
      await entry.redo()
      indexRef.current += 1
      setIndex(indexRef.current)
      toast.success(`ازنو اعمال شد: ${entry.label}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'ازنو ناموفق بود')
    } finally {
      setPending(false)
    }
  }, [entries, pending])

  /** میانبرهای کیبورد — با کار در Input/Textarea/Select تداخل نمی‌کنند */
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (!(ev.ctrlKey || ev.metaKey)) return
      const k = ev.key.toLowerCase()
      const isUndo = k === 'z' && !ev.shiftKey
      const isRedo = k === 'y' || (k === 'z' && ev.shiftKey)
      if (!isUndo && !isRedo) return
      const t = ev.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return
      if (document.querySelector('[data-state="open"] [role="dialog"]')) return
      ev.preventDefault()
      if (isUndo) void undo()
      else void redo()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo])

  const canUndo = index >= 0 && !pending
  const canRedo = index < entries.length - 1 && !pending
  const undoLabel = index >= 0 ? `واگردانی: ${entries[index].label}` : 'واگردانی'
  const redoLabel = index < entries.length - 1 ? `ازنو: ${entries[index + 1].label}` : 'ازنو'

  return { push, undo, redo, canUndo, canRedo, undoLabel, redoLabel, pending }
}
