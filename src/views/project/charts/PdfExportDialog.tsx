'use client'

// ═══════════════════════════════════════════════════════════
// خروجی PDF نمودار — جلسه ۲ §۱۵.۷
// دو حالت الزامی با انتخاب کاربر:
//   • Fit to One Page — کل نمودار در یک صفحه با حفظ aspect ratio + هشدار ناخوانا
//   • Tiled Multi-page — تقسیم به چند صفحه با ترتیب ردیف/ستون، نشانه‌های برش،
//     هم‌پوشانی چسباندن، شمارهٔ صفحه و عنوان بخش
// ابعاد بوم طراحی و اندازهٔ کاغذ PDF دو تنظیم مستقل‌اند.
// پیاده‌سازی: کلون DOM نمودار داخل صفحات با اندازهٔ فیزیکی mm + @page تزریقی.
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

type PaperSize = 'A4' | 'A3'
type Orientation = 'portrait' | 'landscape'
type Mode = 'fit' | 'tiled'

/** ابعاد کاغذ برحسب میلی‌متر */
const PAPER_MM: Record<PaperSize, { w: number; h: number }> = {
  A4: { w: 210, h: 297 },
  A3: { w: 297, h: 420 },
}

const MM_TO_PX = 96 / 25.4

export interface ChartPdfSource {
  /** عنصر DOM محتوای نمودار (گره‌ها + یال‌ها) برای کلون */
  contentEl: HTMLElement
  /** ابعاد محتوای نمودار برحسب پیکسل */
  chartWidth: number
  chartHeight: number
  chartTitle: string
}

export default function PdfExportDialog({
  open,
  onOpenChange,
  sourceFactory,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** منبع DOM هنگام چاپ خوانده می‌شود (نه در رندر — دسترسی به ref در رندر ممنوع) */
  sourceFactory: () => ChartPdfSource | null
}) {
  const [mode, setMode] = useState<Mode>('fit')
  const [paper, setPaper] = useState<PaperSize>('A4')
  const [orientation, setOrientation] = useState<Orientation>('landscape')
  const [marginMm, setMarginMm] = useState(10)
  const [tiledScale, setTiledScale] = useState(100)
  const [showTitle, setShowTitle] = useState(true)
  const [showPageNumbers, setShowPageNumbers] = useState(true)

  const pageMm = useMemo(() => {
    const base = PAPER_MM[paper]
    return orientation === 'landscape' ? { w: base.h, h: base.w } : { w: base.w, h: base.h }
  }, [paper, orientation])

  // قاب محتوا (کاغذ منهای حاشیه) برحسب پیکسل
  const frame = useMemo(
    () => ({
      w: Math.max((pageMm.w - marginMm * 2) * MM_TO_PX, 100),
      h: Math.max((pageMm.h - marginMm * 2) * MM_TO_PX - (showTitle ? 34 : 6), 100),
    }),
    [pageMm, marginMm, showTitle]
  )

  const sourcePreview = open ? sourceFactory() : null
  const fitScale = sourcePreview ? Math.min(frame.w / sourcePreview.chartWidth, frame.h / sourcePreview.chartHeight) : 1
  const fitScalePct = Math.round(fitScale * 100)
  const unreadable = fitScale < 0.4

  const tiled = useMemo(() => {
    if (!sourcePreview) return { cols: 1, rows: 1, pages: 1, overlapPx: 24 }
    const s = tiledScale / 100
    const scaledW = sourcePreview.chartWidth * s
    const scaledH = sourcePreview.chartHeight * s
    const overlap = 24 // هم‌پوشانی برای چسباندن صفحات — پیوستن فیزیکی روشن
    const cols = Math.max(1, Math.ceil(scaledW / (frame.w - overlap)))
    const rows = Math.max(1, Math.ceil(scaledH / (frame.h - overlap)))
    return { cols, rows, pages: cols * rows, overlapPx: overlap }
  }, [sourcePreview, tiledScale, frame])

  const print = () => {
    const source = sourceFactory()
    if (!source) return
    const s = mode === 'fit' ? fitScale : tiledScale / 100
    const style = document.createElement('style')
    style.id = 'chart-pdf-page-style'
    style.textContent = `@page { size: ${pageMm.w}mm ${pageMm.h}mm; margin: 0 }`
    document.head.appendChild(style)

    const root = document.createElement('div')
    root.id = 'chart-pdf-root'
    const pages: string[] = []
    const mkPage = (col: number, row: number, idx: number, total: number, inner: string) => `
      <div class="chart-pdf-page" style="width:${pageMm.w}mm;height:${pageMm.h}mm">
        <div class="chart-pdf-crop chart-pdf-crop-tl"></div><div class="chart-pdf-crop chart-pdf-crop-tr"></div>
        <div class="chart-pdf-crop chart-pdf-crop-bl"></div><div class="chart-pdf-crop chart-pdf-crop-br"></div>
        <div class="chart-pdf-frame" style="position:absolute;inset:${marginMm}mm;overflow:hidden">
          ${
            showTitle
              ? `<div class="chart-pdf-title">${source.chartTitle}${mode === 'tiled' ? ` — بخش (ردیف ${row + 1}، ستون ${col + 1})` : ''}</div>`
              : ''
          }
          <div class="chart-pdf-viewport" style="width:${frame.w}px;height:${frame.h}px;overflow:hidden;position:relative">
            ${inner}
          </div>
          ${
            showPageNumbers
              ? `<div class="chart-pdf-num">صفحهٔ ${idx} از ${total}${mode === 'tiled' ? ' — ردیف ' + (row + 1) + '، ستون ' + (col + 1) : ''}</div>`
              : ''
          }
        </div>
      </div>`

    const content = source.contentEl.outerHTML
    if (mode === 'fit') {
      const offX = Math.max(0, (frame.w - source.chartWidth * s) / 2)
      const offY = Math.max(0, (frame.h - source.chartHeight * s) / 2)
      const inner = `<div style="position:absolute;left:${offX}px;top:${offY}px;width:${source.chartWidth}px;height:${source.chartHeight}px;transform:scale(${s});transform-origin:0 0">${content}</div>`
      pages.push(mkPage(0, 0, 1, 1, inner))
    } else {
      const vw = frame.w - tiled.overlapPx
      const vh = frame.h - tiled.overlapPx
      let idx = 1
      for (let row = 0; row < tiled.rows; row++) {
        for (let col = 0; col < tiled.cols; col++) {
          const tx = -(col * vw) / s
          const ty = -(row * vh) / s
          const inner = `<div style="position:absolute;left:0;top:0;width:${source.chartWidth}px;height:${source.chartHeight}px;transform:translate(${tx}px,${ty}px) scale(${s});transform-origin:0 0">${content}</div>`
          pages.push(mkPage(col, row, idx, tiled.pages, inner))
          idx++
        }
      }
    }
    root.innerHTML = pages.join('')

    // استایل چاپ اختصاصی — مستقل از UI برنامه
    const css = document.createElement('style')
    css.id = 'chart-pdf-print-css'
    css.textContent = `
      #chart-pdf-root .chart-pdf-page { position: relative; background: #fff; overflow: hidden; box-sizing: border-box; }
      #chart-pdf-root .chart-pdf-page + .chart-pdf-page { page-break-before: always; }
      #chart-pdf-root .chart-pdf-title { font: bold 12px Vazirmatn, sans-serif; color: #111; text-align: center; margin-bottom: 6px; direction: rtl; }
      #chart-pdf-root .chart-pdf-num { font: 10px Vazirmatn, sans-serif; color: #444; text-align: center; margin-top: 4px; direction: rtl; }
      #chart-pdf-root .chart-pdf-crop { position: absolute; width: 10mm; height: 10mm; border-color: #555; }
      #chart-pdf-root .chart-pdf-crop-tl { top: 3mm; left: 3mm; border-top: 1px solid #555; border-left: 1px solid #555; }
      #chart-pdf-root .chart-pdf-crop-tr { top: 3mm; right: 3mm; border-top: 1px solid #555; border-right: 1px solid #555; }
      #chart-pdf-root .chart-pdf-crop-bl { bottom: 3mm; left: 3mm; border-bottom: 1px solid #555; border-left: 1px solid #555; }
      #chart-pdf-root .chart-pdf-crop-br { bottom: 3mm; right: 3mm; border-bottom: 1px solid #555; border-right: 1px solid #555; }
      @media print {
        body > *:not(#chart-pdf-root) { display: none !important; }
        #chart-pdf-root { display: block !important; }
        #chart-pdf-root .chart-pdf-page { break-inside: avoid; }
      }
      @media screen { #chart-pdf-root { display: none; } }
    `
    document.head.appendChild(css)
    document.body.appendChild(root)

    const cleanup = () => {
      root.remove()
      css.remove()
      style.remove()
      window.removeEventListener('afterprint', cleanup)
    }
    window.addEventListener('afterprint', cleanup)
    window.print()
    // پاک‌سازی پشتیبان برای مرورگرهایی که afterprint نمی‌دهند
    setTimeout(cleanup, 60_000)

    toast.success(
      mode === 'fit'
        ? 'خروجی تک‌صفحه‌ای آماده شد — در پنجرهٔ چاپ، «Save as PDF» را انتخاب کنید.'
        : `خروجی تایل‌دار (${tiled.pages} صفحه) آماده شد — صفحات را با نشانه‌های برش به هم بچسبانید.`,
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
            ابعاد بوم طراحی مستقل از اندازهٔ کاغذ است؛ این تنظیمات فقط چاپ را تغییر می‌دهند.
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
                  {sourcePreview && (
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
                  {sourcePreview && ` — ${tiled.rows.toLocaleString('fa-IR')}×${tiled.cols.toLocaleString('fa-IR')} = ${tiled.pages.toLocaleString('fa-IR')} صفحه`}.
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
              عنوان روی هر صفحه
            </Label>
            <Label className="flex items-center gap-2 text-xs font-normal">
              <Switch checked={showPageNumbers} onCheckedChange={setShowPageNumbers} />
              شمارهٔ صفحه
            </Label>
          </div>

          {/* پیش‌نمایش شماتیک صفحه‌بندی */}
          {sourcePreview && (
            <div className="rounded-xl border bg-surface-2 p-3">
              <p className="mb-2 text-xs font-bold">
                پیش‌نمایش صفحه‌بندی — ابعاد بوم: {Math.round(sourcePreview.chartWidth)}×{Math.round(sourcePreview.chartHeight)} پیکسل
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
          <Button onClick={print} disabled={!sourcePreview}>
            چاپ / ذخیرهٔ PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
