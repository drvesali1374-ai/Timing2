'use client'

// ═══════════════════════════════════════════════════════════
// نمای نمودار فرایند — سطح پروژه — فاز ۵ / FR-20 + جلسه ۲ §۱۵
// ▸ جابه‌جایی بین OPC و FPC
// ▸ گره‌های پایه به‌صورت خودکار از فعالیت‌ها ساخته می‌شوند
// ▸ راهنمای نمادها و تفاوت دو نمودار + ورودی مواد و OPC توسعه‌یافته
// ▸ v1.5.2 §۱۰.۲ — بلوک چسبان واحد: هدر صفحه + نوار زبانه‌های
//   OPC/FPC هنگام اسکرول هم‌اهنگ زیر TopBar (top-14) ثابت می‌مانند؛
//   محتوای نمودار از زیر آن عبور می‌کند (استثنای آگاهانهٔ این صفحه).
// ═══════════════════════════════════════════════════════════
import { useRef, useState } from 'react'
import { Waypoints } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { HelpDot } from '@/components/common/HelpDot'
import { useStuck } from '@/components/common/SectionHeading'
import type { ChartTypeValue } from '@/lib/api/endpoints'
import ChartCanvas from './charts/ChartCanvas'

export default function ChartsView({ projectId }: { projectId: string }) {
  const [chartType, setChartType] = useState<ChartTypeValue>('FPC')
  const headRef = useRef<HTMLDivElement>(null)
  const headStuck = useStuck(headRef)

  return (
    <div className="space-y-4">
      {/* §۱۰.۲ — بلوک چسبان: هدر + زبانه‌های OPC/FPC (زیر TopBar) */}
      <div
        ref={headRef}
        data-stuck={headStuck ? 'true' : 'false'}
        className="sticky-heading -mx-1 px-1 pb-3 pt-1"
      >
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="chip-icon bg-brand-soft text-brand">
              <Waypoints className="size-6" aria-hidden />
            </div>
            <div>
              <h1 className="text-xl font-extrabold">نمودار فرایند — OPC / FPC</h1>
              <p className="text-xs text-muted-foreground">
                گره‌ها به‌صورت خودکار از فعالیت‌ها ساخته می‌شوند؛ ابزارهای ویرایش نزدیک خود نمودارند.
              </p>
            </div>
            <HelpDot
              label="نمودار فرایند"
              content={{
                what: 'نمودار فرایند، توالی رویدادهای تولید را نشان می‌دهد. OPC (نمودار فرایند عملیات) در تعریف کلاسیک فقط عملیات ○ و بازرسی □ را نمایش می‌دهد؛ FPC (نمودار فرایند جریان) هر پنج نوع رویداد استاندارد: عملیات ○، بازرسی □، حمل‌ونقل ⇨، تأخیر D و انبارش ▽.',
                input: 'گره‌های اصلی به‌صورت خودکار از فعالیت‌های تعریف‌شده در «ساختار تولید» ساخته می‌شوند و با تغییر آن‌ها به‌روز می‌مانند. برای رویدادهای فاقد فعالیت زمان‌سنجی، «گره دستی» بسازید. ورودی مواد اولیه، قطعات و نیم‌ساخته‌ها به‌صورت گره مستقل «ورودی مواد ⬡» تعریف می‌شوند و با خط تغذیه به مرحلهٔ موردنظر وصل می‌شوند. در OPC می‌توانید «انبار ▽» را نیز به‌صورت اختیاری بیفزایید — در این حالت حالت نمودار به «OPC توسعه‌یافته» تغییر می‌کند تا با تعریف کلاسیک اشتباه نشود.',
                example: 'مسیر یک قطعه: ورودی مواد ⬡ ← حمل به ایستگاه مونتاژ ⇨ ← عملیات مونتاژ ○ ← بازرسی کیفیت □ ← تأخیر در انتظار تأیید D.',
                note: 'زوم و جابه‌جایی بوم، مختصات ذخیره‌شدهٔ گره‌ها را تغییر نمی‌دهد. چیدمان دستی قبل از «چیدمان خودکار» ذخیره می‌شود و با «بازگردانی چیدمان دستی» قابل بازیابی است. حذف یا تغییر نمودار هیچ دادهٔ زمان‌سنجی را حذف نمی‌کند.',
              }}
            />
          </div>
        </header>

        <Tabs value={chartType} onValueChange={(v) => setChartType(v as ChartTypeValue)} dir="rtl" className="mt-3">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="OPC">OPC — عملیات و بازرسی</TabsTrigger>
            <TabsTrigger value="FPC">FPC — جریان کامل</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <ChartCanvas key={chartType} projectId={projectId} chartType={chartType} />
    </div>
  )
}
