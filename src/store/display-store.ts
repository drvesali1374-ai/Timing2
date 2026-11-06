// ═══════════════════════════════════════════════════════════
// وضعیت نمایش — تقویم/ارقام/اعشار (FR-29) + تم
// پیش‌فرض: شمسی + ارقام فارسی؛ از سرور hydrate می‌شود
// ═══════════════════════════════════════════════════════════
import { create } from 'zustand'
import type { CalendarMode, DigitsMode } from '@/domain/types'
import { DEFAULT_DISPLAY_PREFS, type DisplayPrefs } from '@/lib/format'

interface DisplayState extends DisplayPrefs {
  hydrated: boolean
  hydrate: (settings: Record<string, string>) => void
  setPrefs: (prefs: Partial<DisplayPrefs>) => void
}

export const useDisplayStore = create<DisplayState>((set) => ({
  ...DEFAULT_DISPLAY_PREFS,
  hydrated: false,
  hydrate: (settings) =>
    set({
      calendar: (settings['ui.calendar'] as CalendarMode) ?? 'jalali',
      digits: (settings['ui.digits'] as DigitsMode) ?? 'persian',
      decimals: Number(settings['ui.decimals'] ?? '2'),
      hydrated: true,
    }),
  setPrefs: (prefs) => set(prefs),
}))

/** دسترسی سریع به تنظیمات نمایش برای قالب‌بندی */
export function useDisplayPrefs(): DisplayPrefs {
  const { calendar, digits, decimals } = useDisplayStore()
  return { calendar, digits, decimals }
}
