'use client'

// ═══════════════════════════════════════════════════════════
// خروجی PDF نمودار — جلسه ۲ §۱۵.۷ + بازطراحی حرفه‌ای
// دو حالت الزامی با انتخاب کاربر:
//   • Fit to One Page — کل نمودار در یک صفحه با حفظ aspect ratio + هشدار ناخوانا
//   • Tiled Multi-page — تقسیم به چند صفحه با ترتیب ردیف/ستون، نشانه‌های برش،
//     هم‌پوشانی چسباندن، شمارهٔ صفحه و عنوان بخش
// ▸ سند چاپ از «دادهٔ» نمودار ساخته می‌شود (chart-print.ts) — نه کلون DOM:
//   بدون شبکهٔ نقطه‌ای/قاب خط‌چین/اسکرول‌بار، برچسب کامل چندخطی، خروجی برداری.
// ابعاد بوم طراحی و اندازهٔ کاغذ PDF دو تنظیم مستقل‌اند.
// ═══════════════════════════════════════════════════════════
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { FileText } from 'lucide-react'
import {
  buildChartPrintDocument,
  layoutChartPrint,
  type ChartPrintSource,
} from './chart-print'

type PaperSize = 'A4' | 'A3'
type Orientation = 'portrait' | 'landscape'
type Mode = 'fit' | 'tiled'

export type { ChartPrintSource }

export default function PdfExportDialog({
  open,
  onOpenChange,
  sourceFactory,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** دادهٔ نمودار هنگام باز بودن دیالوگ خوانده می‌شود (نه در رندر زودهنگام) */
  sourceFactory: () => ChartPrintSource | null
}) {
  const [mode, setMode] = useState<Mode>('fit')
  const [paper, setPaper] = useState<PaperSize>('A4')
  const [orientation, setOrientation] = useState<Orientation>('landscape')
  const [marginMm, setMarginMm] = useState(10)
  const [tiledScale, setTiledScale] = useState(100)
  const [showTitle, setShowTitle] = useState(true)
  const [showPageNumbers, setShowPageNumbers] = useState(true)

  const sourcePreview = useMemo(() => (open ? sourceFactory() : null), [open, sourceFactory])
  /** چیدمان چاپ: برچسب‌ها کامل اندازه‌گیری می‌شوند و مسیر یال‌ها بازمحاسبه */
  const layout = useMemo(
    () => (sourcePreview && sourcePreview.nodes.length > 0 ? layoutChartPrint(sourcePreview) : null),
    [sourcePreview]
  )

  const chartW = layout?.width ?? 0
  const chartH = layout?.height ?? 0

  const pageMm = useMemo(() => {
    const base = paper === 'A4' ? { w: 210, h: 297 } : { w: 297, h: 420 }
    return orientation === 'landscape' ? { w: base.h, h: base.w } : { w: base.w, h: base.h }
  }, [paper, orientation])

  // قاب محتوا (کاغذ منهای حاشیه) برحسب پیکسل — عنوان + تاریخ چاپ
  const frame = useMemo(
    () => ({
      w: Math.max((pageMm.w - marginMm * 2) * (96 / 25.4), 100),
      h: Math.max((pageMm.h - marginMm * 2) * (96 / 25.4) - (showTitle ? 68 : 22), 100),
    }),
    [pageMm, marginMm, showTitle]
  )

  const fitScale = layout ? Math.min(frame.w / chartW, frame.h / chartH) : 1
  const fitScalePct = Math.round(fitScale * 100)
  const unreadable = fitScale < 0.4

  const tiled = useMemo(() => {
    if (!layout) return { cols: 1, rows: 1, pages: 1, overlapPx: 24 }
    const s = tiledScale / 100
    const overlap = 24 // هم‌پوشانی برای چسباندن صفحات — پیوستن فیزیکی روشن
    const cols = Math.max(1, Math.ceil((chartW * s) / (frame.w - overlap)))
    const rows = Math.max(1, Math.ceil((chartH * s) / (frame.h - overlap)))
    return { cols, rows, pages: cols * rows, overlapPx: overlap }
  }, [layout, tiledScale, frame, chartW, chartH])

  const print = () => {
    const source = sourceFactory()
    if (!source || source.nodes.length === 0) return
    const printLayout = layoutChartPrint(source)
    const built = buildChartPrintDocument(source, printLayout, {
      mode,
      paper,
      orientation,
      marginMm,
      tiledScale,
      showTitle,
      showPageNumbers,
    })

    const cleanup = () => {
      built.cleanup()
      window.removeEventListener('afterprint', cleanup)
    }
    window.addEventListener('afterprint', cleanup)
    window.print()
    // پاک‌سازی پشتیبان برای مرورگرهایی که afterprint نمی‌دهند
    setTimeout(cleanup, 60_000)

    toast.success(
      mode === 'fit'
        ? 'خروجی تک‌صفحه‌ای آماده شد — در پنجرهٔ چاپ، «Save as PDF» را انتخاب کنید.'
        : `خروجی تایل‌دار (${built.pagesCount.toLocaleString('fa-IR')} صفحه) آماده شد — صفحات را با نشانه‌های برش به هم بچسبانید.`,
      { duration: 8000 }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="size-5 text-brand" aria-hidden />
            خروجی PDF نمودار
          </DialogTitle>
          <DialogDescription>
            سند چاپ به‌صورت برداری از دادهٔ نمودار ساخته می‌شود — بدون اسکرول‌بار و با برچسب‌های کامل.
            ابعاد بوم طراحی مستقل از اندازهٔ کاغذ است.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <RadioGroup value={mode} onValueChange={(v) => setMode(v as Mode)} className="gap-2">
            <Label className="flex items-start gap-2 rounded-lg border p-3 text-sm font-normal">
              <RadioGroupItem value="fit" className="mt-0.5" />
              <span className="space-y-1">
                <span className="block font-bold">جا دادن در یک صفحه (Fit to One Page)</span>
                <span className="block text-xs text-muted-foreground">
                  کل نمودار با حفظ تناسب در یک صفحه کوچک می‌شود؛ بدون برش یا سرریز.
                  {layout && (
                    <span className={unreadable ? 'font-bold text-red' : ''}>
                      {' '}مقیاس نهایی ≈ {fitScalePct.toLocaleString('fa-IR')}٪
                      {unreadable ? ' — هشدار: کوچک‌تر از حد خوانا!' : ''}
                    </span>
                  )}
                </span>
              </span>
            </Label>
            <Label className="flex items-start gap-2 rounded-lg border p-3 text-sm font-normal">
              <RadioGroupItem value="tiled" className="mt-0.5" />
              <span className="space-y-1">
                <span className="block font-bold">چندصفحه‌ای تایل‌دار (Tiled)</span>
                <span className="block text-xs text-muted-foreground">
                  نمودار بزرگ به چند صفحه با ترتیب ردیف/ستون تقسیم می‌شود؛ هر صفحه نشانهٔ برش و
                  هم‌پوشانی چسباندن دارد
                  {layout && ` — ${tiled.rows.toLocaleString('fa-IR')}×${tiled.cols.toLocaleString('fa-IR')} = ${tiled.pages.toLocaleString('fa-IR')} صفحه`}.
                </span>
              </span>
            </Label>
          </RadioGroup>

          {unreadable && mode === 'fit' && (
            <p className="rounded-lg bg-red-soft/70 p-2.5 text-xs leading-5">
              نمودار تا حد ناخوانا کوچک می‌شود. پیشنهاد: حالت تایل‌دار یا کاغذ A3 افقی را امتحان کنید.
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">اندازهٔ کاغذ</Label>
              <Select value={paper} onValueChange={(v) => setPaper(v as PaperSize)}>
                <SelectTrigger size="sm"><SelectValue /></SelectTrigger>
                <SelectContent dir="rtl">
                  <SelectItem value="A4">A4</SelectItem>
                  <SelectItem value="A3">A3</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">جهت</Label>
              <Select value={orientation} onValueChange={(v) => setOrientation(v as Orientation)}>
                <SelectTrigger size="sm"><SelectValue /></SelectTrigger>
                <SelectContent dir="rtl">
                  <SelectItem value="landscape">افقی</SelectItem>
                  <SelectItem value="portrait">عمودی</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="pdf-margin" className="text-xs">حاشیه (میلی‌متر)</Label>
              <Input
                id="pdf-margin"
                dir="ltr"
                type="number"
                min={5}
                max={25}
                value={marginMm}
                onChange={(e) => setMarginMm(Math.min(25, Math.max(5, Number(e.target.value) || 10)))}
              />
            </div>
            {mode === 'tiled' && (
              <div className="space-y-1.5">
                <Label htmlFor="pdf-scale" className="text-xs">مقیاس محتوا (٪)</Label>
                <Input
                  id="pdf-scale"
                  dir="ltr"
                  type="number"
                  min={25}
                  max={200}
                  step={5}
                  value={tiledScale}
                  onChange={(e) => setTiledScale(Math.min(200, Math.max(25, Number(e.target.value) || 100)))}
                />
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-4">
            <Label className="flex items-center gap-2 text-xs font-normal">
              <Switch checked={showTitle} onCheckedChange={setShowTitle} />
              عنوان و تاریخ چاپ
            </Label>
            <Label className="flex items-center gap-2 text-xs font-normal">
              <Switch checked={showPageNumbers} onCheckedChange={setShowPageNumbers} />
              شمارهٔ صفحه
            </Label>
          </div>

          {/* پیش‌نمایش شماتیک صفحه‌بندی */}
          {layout && (
            <div className="rounded-xl border bg-surface-2 p-3">
              <p className="mb-2 text-xs font-bold">
                پیش‌نمایش صفحه‌بندی — ابعاد محتوای نمودار: {chartW.toLocaleString('fa-IR')}×{chartH.toLocaleString('fa-IR')} پیکسل
              </p>
              <div
                className="grid gap-1"
                style={{
                  gridTemplateColumns: `repeat(${mode === 'tiled' ? tiled.cols : 1}, minmax(0, 1fr))`,
                  width: mode === 'tiled' ? '100%' : '40%',
                  marginInline: 'auto',
                }}
                dir="ltr"
                aria-hidden
              >
                {Array.from({ length: mode === 'tiled' ? tiled.pages : 1 }).map((_, i) => (
                  <div
                    key={i}
                    className="flex aspect-[3/4] items-center justify-center rounded border border-dashed border-brand/50 bg-brand-soft/30 text-[9px] text-brand"
                    style={{ aspectRatio: `${pageMm.w} / ${pageMm.h}` }}
                  >
                    {i + 1}
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
                پیش‌نمایش دقیق در پنجرهٔ چاپ مرورگر نمایش داده می‌شود. در صورت قطع شدن یال در مرز صفحه،
                ادامهٔ مسیر در صفحهٔ مجاور (با هم‌پوشانی چسباندن) مشخص است.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>انصراف</Button>
          <Button onClick={print} disabled={!layout}>
            چاپ / ذخیرهٔ PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
