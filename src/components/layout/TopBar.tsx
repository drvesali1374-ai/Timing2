'use client'

// ═══════════════════════════════════════════════════════════
// نوار بالای پوسته پروژه — ۷.۲
// نام پروژه، وضعیت، نشانگر ذخیره، تنظیمات نمایش، راهنما، منوی موبایل
// ═══════════════════════════════════════════════════════════
import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTheme } from 'next-themes'
import {
  Home,
  Lightbulb,
  Menu,
  Moon,
  Settings,
  Sun,
  Flag,
  Undo2,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { ProjectStatusBadge } from '@/components/common/StatusBadge'
import { projectsApi, settingsApi } from '@/lib/api/endpoints'
import { qk } from '@/lib/api/keys'
import { useAppStore } from '@/store/app-store'
import { useDisplayStore } from '@/store/display-store'
import { useIsMobile } from '@/hooks/use-mobile'
import { StageSidebarMobile } from '@/components/layout/StageSidebar'
import { useQueryClient } from '@tanstack/react-query'
import { cn } from '@/lib/utils'

/** رویداد بازکردن منوی موبایل — AppShell به آن گوش می‌دهد */
export const OPEN_MOBILE_MENU_EVENT = 'open-mobile-menu'

export function TopBar({ projectId }: { projectId: string }) {
  const { navigate, setHelpOpen, helpOpen } = useAppStore()
  const isMobile = useIsMobile()
  const { data, isLoading } = useQuery({
    queryKey: qk.project(projectId),
    queryFn: () => projectsApi.get(projectId),
  })

  return (
    <header className="glass-bar sticky top-0 z-40 flex h-14 items-center gap-2 border-b px-3 no-print">
      {isMobile ? (
        <MobileMenuButton projectId={projectId} />
      ) : null}
      <Button
        variant="ghost"
        size="sm"
        className="gap-1.5 text-muted-foreground hover:text-foreground"
        onClick={() => navigate({ name: 'home' })}
        aria-label="بازگشت به فهرست پروژه‌ها"
      >
        <Home className="size-4" aria-hidden />
        {!isMobile && 'پروژه‌ها'}
      </Button>
      <div className="mx-1 h-6 w-px bg-border" aria-hidden />
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {isLoading ? (
          <Skeleton className="h-6 w-40" />
        ) : (
          <>
            <p className="truncate text-sm font-extrabold">{data?.project.name}</p>
            <span className="hidden truncate text-xs text-muted-foreground sm:inline">
              {data?.project.lineName} · {data?.project.productName}
            </span>
            <ProjectStatusBadge
              status={data?.project.status ?? 'IN_PROGRESS'}
              finalized={data?.stageSummary.counts.finalized}
            />
          </>
        )}
      </div>
      <div className="flex items-center gap-0.5">
        {data && !data.stageSummary.counts.finalized && (
          <FinalizeButton projectId={projectId} projectName={data.project.name} />
        )}
        <ThemeToggle />
        <DisplaySettingsDialog />
        <Button
          variant="ghost"
          size="icon"
          aria-label={helpOpen ? 'بستن راهنمای مرحله' : 'نمایش راهنمای مرحله'}
          aria-pressed={helpOpen}
          onClick={() => setHelpOpen(!helpOpen)}
          className={cn('size-9', helpOpen && 'bulb-on')}
        >
          <Lightbulb className="size-4.5" aria-hidden />
        </Button>
      </div>
    </header>
  )
}

function MobileMenuButton({ projectId }: { projectId: string }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="بازکردن منوی مراحل"
      onClick={() => window.dispatchEvent(new CustomEvent(OPEN_MOBILE_MENU_EVENT))}
    >
      <Menu className="size-5" aria-hidden />
    </Button>
  )
}

export function ThemeToggle() {
  const { setTheme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    // پرش هیدراسیون تم با تأخیر یک فریم
    const id = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(id)
  }, [])
  if (!mounted) return <Button variant="ghost" size="icon" aria-label="تغییر تم" className="size-9" />
  const isDark = resolvedTheme === 'dark'
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={isDark ? 'تم روشن' : 'تم تیره'}
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className="size-9"
    >
      {isDark ? <Sun className="size-4.5" aria-hidden /> : <Moon className="size-4.5" aria-hidden />}
    </Button>
  )
}

/** تنظیمات نمایش — FR-29 (تقویم/ارقام/اعشار) */
export function DisplaySettingsDialog() {
  const { calendar, digits, decimals, setPrefs, hydrated } = useDisplayStore()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)

  const apply = async (values: Record<string, string>) => {
    try {
      await settingsApi.put(values)
      await qc.invalidateQueries({ queryKey: qk.settings() })
      toast.success('تنظیمات نمایش ذخیره شد')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'ذخیره تنظیمات ناموفق بود')
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="تنظیمات نمایش" className="size-9">
          <Settings className="size-4.5" aria-hidden />
        </Button>
      </DialogTrigger>
      <DialogContent dir="rtl" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>تنظیمات نمایش</DialogTitle>
          <DialogDescription>
            این تنظیمات فقط نحوه نمایش را تغییر می‌دهند؛ داده‌های ذخیره‌شده و محاسبات دست‌نخورده می‌مانند.
          </DialogDescription>
        </DialogHeader>
        {hydrated && (
          <div className="space-y-5">
            <div className="space-y-2">
              <Label>تقویم</Label>
              <RadioGroup
                dir="rtl"
                value={calendar}
                onValueChange={(v) => {
                  setPrefs({ calendar: v as 'jalali' | 'gregorian' })
                  void apply({ 'ui.calendar': v })
                }}
                className="flex gap-4"
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="jalali" id="cal-jalali" />
                  <Label htmlFor="cal-jalali" className="font-normal">شمسی (پیش‌فرض)</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="gregorian" id="cal-greg" />
                  <Label htmlFor="cal-greg" className="font-normal">میلادی</Label>
                </div>
              </RadioGroup>
            </div>
            <div className="space-y-2">
              <Label>ارقام</Label>
              <RadioGroup
                dir="rtl"
                value={digits}
                onValueChange={(v) => {
                  setPrefs({ digits: v as 'persian' | 'latin' })
                  void apply({ 'ui.digits': v })
                }}
                className="flex gap-4"
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="persian" id="dig-fa" />
                  <Label htmlFor="dig-fa" className="font-normal">فارسی (۱۲۳)</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="latin" id="dig-en" />
                  <Label htmlFor="dig-en" className="font-normal">لاتین (123)</Label>
                </div>
              </RadioGroup>
            </div>
            <div className="space-y-2">
              <Label>ارقام اعشار نمایش زمان‌ها</Label>
              <Select
                dir="rtl"
                value={String(decimals)}
                onValueChange={(v) => {
                  setPrefs({ decimals: Number(v) })
                  void apply({ 'ui.decimals': v })
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {['1', '2', '3', '4'].map((d) => (
                    <SelectItem key={d} value={d} className="num">
                      {d} رقم
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] leading-5 text-muted-foreground">
                گردکردن فقط نمایشی است؛ مقدار خام و محاسبات با دقت کامل ذخیره می‌شوند.
              </p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** نهایی‌سازی مطالعه — FR-12 / FR-27 */
function FinalizeButton({ projectId, projectName }: { projectId: string; projectName: string }) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)

  const finalize = async () => {
    setLoading(true)
    try {
      await projectsApi.finalize(projectId, reason || null)
      await qc.invalidateQueries({ queryKey: qk.project(projectId) })
      await qc.invalidateQueries({ queryKey: qk.projectSummary(projectId) })
      toast.success(`مطالعه «${projectName}» نهایی شد. ویرایش همچنان باز است.`)
      setOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'نهایی‌سازی ناموفق بود')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="hidden gap-1.5 text-green hover:text-green sm:inline-flex"
        onClick={() => setOpen(true)}
      >
        <Flag className="size-3.5" aria-hidden />
        نهایی‌سازی
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>نهایی‌سازی مطالعه</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-3 text-right text-sm leading-6">
                <p>
                  وضعیت مطالعه «نهایی‌شده» می‌شود اما ویرایش قفل نمی‌شود؛ پس از هر تغییر مؤثر، نتایج
                  «نیازمند محاسبه مجدد» خواهند شد.
                </p>
                <p className="rounded-xl bg-amber-soft p-3 text-xs leading-6">
                  اگر تعداد نمونه به هدف نرسیده، رسیدن به هدف فقط به معنای «تکمیل تعداد ثبت‌شده» است و
                  اثبات کفایت آماری محسوب نمی‌شود. دلیل نهایی‌سازی را ثبت کنید.
                </p>
                <textarea
                  className="min-h-20 w-full rounded-xl border bg-background p-3 text-sm"
                  placeholder="مثال: به دلیل محدودیت دسترسی به خط، با ۱۲ نمونه از ۱۵ نمونه هدف نهایی شد."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  dir="rtl"
                />
              </div>
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-start gap-2">
            <Button onClick={finalize} disabled={loading} className="btn-brand border-0">
              {loading ? 'در حال ثبت…' : 'نهایی‌سازی مطالعه'}
            </Button>
            <Button variant="outline" onClick={() => setOpen(false)}>
              انصراف
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

/** دکمه بازگشت از نهایی‌سازی */
export function UnfinalizeButton({ projectId }: { projectId: string }) {
  const qc = useQueryClient()
  return (
    <Button
      variant="ghost"
      size="sm"
      className="gap-1.5 text-muted-foreground"
      onClick={async () => {
        try {
          await projectsApi.unfinalize(projectId)
          await qc.invalidateQueries()
          toast.success('مطالعه به حالت در حال انجام بازگشت')
        } catch (err) {
          toast.error(err instanceof Error ? err.message : 'عملیات ناموفق بود')
        }
      }}
    >
      <Undo2 className="size-3.5" aria-hidden />
      بازگشت از نهایی‌سازی
    </Button>
  )
}
