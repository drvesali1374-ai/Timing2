'use client'

// ═══════════════════════════════════════════════════════════
// پوسته پروژه — ۷.۲
// سایدبار مراحل + فضای کاری + پنل راهنما + فوتر چسبان
// + پشتیبان‌گیری خودکار زمان‌بندی‌شده (FR-24)
// ═══════════════════════════════════════════════════════════
import { useEffect, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { StageSidebar, StageSidebarMobile } from './StageSidebar'
import { TopBar, OPEN_MOBILE_MENU_EVENT } from './TopBar'
import { HelpPanel } from './HelpPanel'
import { AppFooter } from './AppFooter'
import { useAppStore } from '@/store/app-store'
import { backupsApi, settingsApi } from '@/lib/api/endpoints'
import { qk } from '@/lib/api/keys'
import { useIsMobile } from '@/hooks/use-mobile'

export function AppShell({ projectId, children }: { projectId: string; children: ReactNode }) {
  const view = useAppStore((s) => s.view)
  const activeStage = view.name === 'project' ? view.stage : 'structure'
  const isMobile = useIsMobile()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const qc = useQueryClient()

  // گوش دادن به دکمه منوی موبایل
  useEffect(() => {
    const handler = () => setMobileMenuOpen(true)
    window.addEventListener(OPEN_MOBILE_MENU_EVENT, handler)
    return () => window.removeEventListener(OPEN_MOBILE_MENU_EVENT, handler)
  }, [])

  // پشتیبان‌گیری خودکار — سرویس فاصله زمانی را کنترل می‌کند (FR-24)
  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setInterval> | null = null
    const tick = async () => {
      try {
        const result = await backupsApi.autoTick()
        if (!cancelled && result && !('skipped' in result && result.skipped)) {
          await qc.invalidateQueries({ queryKey: qk.backups() })
          toast.success('پشتیبان‌گیری خودکار انجام شد', {
            description: 'نسخه پشتیبان روی دیسک محلی سرور ذخیره شد.',
          })
        }
      } catch {
        // قطعی موقت — در تیک بعدی دوباره تلاش می‌شود؛ کاربر مزاحم نمی‌شود
      }
    }
    // فاصله بررسی: ۵ دقیقه (سرور فاصله واقعی تنظیم‌شده را اعمال می‌کند)
    const start = async () => {
      const settings = await settingsApi.get().catch(() => null)
      if (cancelled || !settings) return
      if (settings.settings['backup.autoEnabled'] !== 'true') return
      timer = setInterval(tick, 5 * 60 * 1000)
    }
    void start()
    return () => {
      cancelled = true
      if (timer) clearInterval(timer)
    }
  }, [qc])

  return (
    <div className="flex min-h-screen flex-col">
      <TopBar projectId={projectId} />
      <div className="flex flex-1">
        <StageSidebar projectId={projectId} activeStage={activeStage} />
        <div className="flex min-w-0 flex-1">
          <main className="scroll-slim min-w-0 flex-1 p-4 pb-8 md:p-6" id="main-content">
            {children}
          </main>
          <HelpPanel projectId={projectId} />
        </div>
      </div>
      <AppFooter />
      {isMobile && (
        <StageSidebarMobile
          projectId={projectId}
          activeStage={activeStage}
          open={mobileMenuOpen}
          onOpenChange={setMobileMenuOpen}
        />
      )}
    </div>
  )
}
