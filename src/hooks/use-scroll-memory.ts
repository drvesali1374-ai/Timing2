'use client'

// ═══════════════════════════════════════════════════════════
// حافظهٔ موقعیت اسکرول هر صفحه — v1.5.4 §۲
// آخرین موقعیت اسکرول کاربر در هر صفحه ذخیره می‌شود و با بازگشت به همان
// صفحه (از هر صفحهٔ دیگری)، دقیقاً به همان موقعیت هدایت می‌شود.
// در همهٔ صفحات (خانه و صفحات پروژه) اسکرول روی پنجرهٔ مرورگر انجام
// می‌شود (main-content ارتفاع ثابت ندارد) — هم‌ارز app.js نسخهٔ آفلاین.
// ═══════════════════════════════════════════════════════════
import { useEffect, useRef } from 'react'
import { useAppStore, type AppView } from '@/store/app-store'

/** کلید یکتای هر نما — هم‌ارز routeKeyOf نسخهٔ آفلاین */
export function viewScrollKey(view: AppView): string {
  if (view.name === 'home') return '/'
  if (view.name === 'activity') return `/p/${view.projectId}/activity/${view.activityId}`
  return `/p/${view.projectId}/${view.stage}`
}

/** آخرین موقعیت اسکرول هر صفحه — سطح ماژول؛ بین رندرها و جابه‌جایی‌ها می‌ماند */
const scrollMemory = new Map<string, number>()

export function useScrollMemory(view: AppView) {
  const key = viewScrollKey(view)
  // کلید جاری — شناسه‌ای که رویدادهای اسکرول زیر آن ذخیره می‌شوند
  const keyRef = useRef(key)

  // جمع/باز سایدبار و پنل راهنما نیز نباید موقعیت اسکرول صفحه را بپرانند
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed)
  const helpOpen = useAppStore((s) => s.helpOpen)

  // ذخیرهٔ پیوسته با هر رویداد اسکرول (فاز capture — رویداد اسکرول پنجره
  // و همهٔ نوارهای داخلی را می‌گیرد)
  useEffect(() => {
    const save = () => {
      scrollMemory.set(keyRef.current, window.scrollY)
    }
    document.addEventListener('scroll', save, true)
    return () => document.removeEventListener('scroll', save, true)
  }, [])

  // با هر تغییر نما/مسیر: بازگشت به همان موقعیت قبلی صفحه؛
  // صفحهٔ تازه از بالا شروع می‌شود (موقعیت ثبت‌نشده = صفر)
  useEffect(() => {
    keyRef.current = key
    const pos = scrollMemory.get(key) ?? 0
    const raf = requestAnimationFrame(() => window.scrollTo(0, pos))
    return () => cancelAnimationFrame(raf)
  }, [key])

  // تغییرهای شل (سایدبار/پنل راهنما): محتوا از نو چیده می‌شود؛
  // موقعیت ذخیره‌شدهٔ همین صفحه دوباره اعمال می‌شود
  useEffect(() => {
    const pos = scrollMemory.get(keyRef.current) ?? 0
    const raf = requestAnimationFrame(() => window.scrollTo(0, pos))
    return () => cancelAnimationFrame(raf)
  }, [sidebarCollapsed, helpOpen])
}
