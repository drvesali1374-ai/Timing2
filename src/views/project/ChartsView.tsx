'use client'

// ═══════════════════════════════════════════════════════════
// نمای نمودار فرایند — سطح پروژه — فاز ۵ / FR-20 + جلسه ۲ §۱۵
// ▸ جابه‌جایی بین OPC و FPC
// ▸ گره‌های پایه به‌صورت خودکار از فعالیت‌ها ساخته می‌شوند
// ▸ راهنمای نمادها و تفاوت دو نمودار + ورودی مواد و OPC توسعه‌یافته
// ═══════════════════════════════════════════════════════════
import { useState } from 'react'
import { Waypoints } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { HelpDot } from '@/components/common/HelpDot'
import type { ChartTypeValue } from '@/lib/api/endpoints'
import ChartCanvas from './charts/ChartCanvas'

export default function ChartsView({ projectId }: { projectId: string }) {
  const [chartType, setChartType] = useState<ChartTypeValue>('FPC')

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Waypoints className="size-5 text-brand" aria-hidden />
            نمودار فرایند — OPC / FPC
            <HelpDot
              label="نمودار فرایند"
              content={{
                what: 'نمودار فرایند، توالی رویدادهای تولید را نشان می‌دهد. OPC (نمودار فرایند عملیات) در تعریف کلاسیک فقط عملیات ○ و بازرسی □ را نمایش می‌دهد؛ FPC (نمودار فرایند جریان) هر پنج نوع رویداد استاندارد: عملیات ○، بازرسی □، حمل‌ونقل ⇨، تأخیر D و انبارش ▽.',
                input: 'گره‌های اصلی به‌صورت خودکار از فعالیت‌های تعریف‌شده در «ساختار تولید» ساخته می‌شوند و با تغییر آن‌ها به‌روز می‌مانند. برای رویدادهای فاقد فعالیت زمان‌سنجی، «گره دستی» بسازید. ورودی مواد اولیه، قطعات و نیم‌ساخته‌ها به‌صورت گره مستقل «ورودی مواد ⬡» تعریف می‌شوند و با خط تغذیه به مرحلهٔ موردنظر وصل می‌شوند. در OPC می‌توانید «انبار ▽» را نیز به‌صورت اختیاری بیفزایید — در این صورت حالت نمودار به «OPC توسعه‌یافته» تغییر می‌کند تا با تعریف کلاسیک اشتباه نشود.',
                example: 'مسیر یک قطعه: ورودی مواد ⬡ ← حمل به ایستگاه مونتاژ ⇨ ← عملیات مونتاژ ○ ← بازرسی کیفیت □ ← تأخیر در انتظار تأیید D.',
                note: 'زوم و جابه‌جایی بوم، مختصات ذخیره‌شدهٔ گره‌ها را تغییر نمی‌دهد. چیدمان دستی قبل از «چیدمان خودکار» ذخیره می‌شود و با «بازگردانی چیدمان دستی» قابل بازیابی است. حذف یا تغییر نمودار هیچ دادهٔ زمان‌سنجی را حذف نمی‌کند.',
              }}
            />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Tabs value={chartType} onValueChange={(v) => setChartType(v as ChartTypeValue)} dir="rtl">
            <TabsList className="grid w-full max-w-md grid-cols-2">
              <TabsTrigger value="OPC">OPC — عملیات و بازرسی</TabsTrigger>
              <TabsTrigger value="FPC">FPC — جریان کامل</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardContent>
      </Card>

      <ChartCanvas key={chartType} projectId={projectId} chartType={chartType} />
    </div>
  )
}
