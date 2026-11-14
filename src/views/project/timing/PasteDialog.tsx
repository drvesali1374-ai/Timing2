'use client'

// ═══════════════════════════════════════════════════════════
// Paste چندسلولی از Excel با پیش‌نمایش — FR-07 / v1.5.0 §۸.۳
// محور جدید: ردیف‌های داده = ردیف‌های شبکهٔ برگه (عنصر +
// زیرردیف رابطه)، ستون‌های داده = چرخه‌ها. لنگر بر اساس
// شناسهٔ ردیف و شمارهٔ چرخه است. پیش‌نمایش مشخص می‌کند هر
// مقدار به کدام عنصر/رابطه و کدام چرخه وارد می‌شود.
// Paste نامعتبر هرگز ثبت ناقص و پنهانی ایجاد نمی‌کند.
//
// v1.5.2 §۹ — دو مسیر مستقل و سازگار برای ورود اطلاعات:
//  ۱) Paste مستقیم متن/Clipboard (مسیر قبلی — دست‌نخورده)
//  ۲) دانلود قالب Excel اختصاصی جلسه → تکمیل → بارگذاری فایل؛
//     خروجی بارگذاری فقط «ورودی همین مسیر پیش‌نمایش/Commit»
//     است — هیچ ذخیرهٔ مستقیمی انجام نمی‌شود (§۹-۶).
// ═══════════════════════════════════════════════════════════
import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardPaste,
  FileSpreadsheet,
  FileUp,
  Loader2,
  MinusCircle,
  XCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { HelpDot } from '@/components/common/HelpDot'
import { timingApi, type PastePreviewDto, type SessionSheetDto } from '@/lib/api/endpoints'
import type { DisplayPrefs as Prefs } from '@/lib/format'
import { formatTimeValue, formatInt } from '@/lib/format'
import type { GridPasteAnchor } from './SheetGrid'
import type { ElementColumn } from './shared'

/** منبع فعال ورود داده — متن یا فایل قالب (v1.5.2 §۹) */
interface FileSource {
  data: string[][]
  anchor: GridPasteAnchor
  name: string
}

export function PasteDialog({
  open,
  onOpenChange,
  sessionId,
  anchor,
  sheet,
  columns,
  prefs,
  initialText,
  onCommit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  sessionId: string
  anchor: GridPasteAnchor
  sheet: SessionSheetDto
  columns: ElementColumn[]
  prefs: Prefs
  initialText?: string
  /** ثبت واقعی توسط پنل انجام می‌شود (سازگار با Undo) */
  onCommit: (data: string[][], mode: 'ALL_OR_NOTHING' | 'SKIP_INVALID') => Promise<void>
}) {
  const [text, setText] = useState('')
  const [mode, setMode] = useState<'ALL_OR_NOTHING' | 'SKIP_INVALID'>('ALL_OR_NOTHING')
  const [preview, setPreview] = useState<PastePreviewDto | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [committing, setCommitting] = useState(false)
  // v1.5.2 §۹ — بارگذاری فایل قالب
  const [fileSource, setFileSource] = useState<FileSource | null>(null)
  const [fileLoading, setFileLoading] = useState(false)
  const [fileError, setFileError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setText('')
      setPreview(null)
      setMode('ALL_OR_NOTHING')
      setFileSource(null)
      setFileError(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      if (initialText) {
        setText(initialText)
      } else {
        // تمرکز برای چسباندن مستقیم
        setTimeout(() => textareaRef.current?.focus(), 50)
      }
    }
  }, [open, initialText])

  // تجزیهٔ محلی متن به سطر×ستون (TSV/جدول) — سطر=ردیف شبکه، ستون=چرخه
  const parsedData = useMemo(() => {
    const t = text.replace(/\r\n?/g, '\n').replace(/\n+$/, '')
    if (!t.trim()) return null
    return t.split('\n').map((line) => line.split('\t'))
  }, [text])

  /** منبع فعال: فایل قالب یا متن — لنگر فایل همیشه مخصوص قالب است */
  const activeData = fileSource ? fileSource.data : parsedData
  const activeAnchor = fileSource ? fileSource.anchor : anchor

  const runPreview = useMutation({
    mutationFn: async (override?: { data: string[][]; anchor: GridPasteAnchor }) => {
      const d = override?.data ?? activeData
      const a = override?.anchor ?? activeAnchor
      if (!d) throw new Error('متن Paste خالی است')
      const res = await timingApi.pastePreview(sessionId, {
        startCycleNo: a.cycleNo,
        startElementId: a.elementId,
        startRelationId: a.relationId ?? undefined,
        data: d,
      })
      return res.preview
    },
    onSuccess: (p) => setPreview(p),
    onError: (err) => toast.error(err instanceof Error ? err.message : 'پیش‌نمایش ناموفق بود'),
  })

  const doCommit = async () => {
    if (!activeData) return
    setCommitting(true)
    try {
      await onCommit(activeData, mode)
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'ثبت Paste ناموفق بود')
    } finally {
      setCommitting(false)
    }
  }

  const doPreview = async () => {
    setPreviewing(true)
    try {
      await runPreview.mutateAsync()
    } finally {
      setPreviewing(false)
    }
  }

  // ── v1.5.2 §۹-۶ — بارگذاری فایل قالب تکمیل‌شده ──
  const onFileSelected = async (file: File) => {
    setFileError(null)
    setFileLoading(true)
    setPreview(null)
    setFileSource(null)
    try {
      const res = await timingApi.parseExcelTemplate(sessionId, file)
      const r = res.result
      const fileAnchor: GridPasteAnchor = {
        cycleNo: r.startCycleNo,
        elementId: r.startElementId,
        relationId: r.startRelationId,
      }
      setFileSource({ data: r.data, anchor: fileAnchor, name: r.sourceName ?? file.name })
      setText('')
      for (const w of r.warnings) toast.warning(w)
      // پیش‌نمایش خودکار — داده‌ها پیش از Commit قابل بررسی‌اند (§۹-۶)
      await runPreview.mutateAsync({ data: r.data, anchor: fileAnchor })
    } catch (err) {
      setFileSource(null)
      const msg = err instanceof Error ? err.message : 'بارگذاری فایل ناموفق بود'
      setFileError(msg)
      toast.error(msg)
    } finally {
      setFileLoading(false)
    }
  }

  const backToText = () => {
    setFileSource(null)
    setFileError(null)
    setPreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const anchorRelation = activeAnchor.relationId
    ? sheet.parallelRelations.find((r) => r.relationId === activeAnchor.relationId)
    : null
  const anchorElementName =
    columns.find((c) => c.id === activeAnchor.elementId)?.name ??
    sheet.elements.find((e) => e.id === activeAnchor.elementId)?.name

  const maxCols = preview ? Math.max(...preview.rows.map((r) => r.cells.length), 0) : 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-h-[90vh] sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardPaste className="size-5 text-brand" aria-hidden />
            ورود اطلاعات از Excel
            <HelpDot
              label="ورود اطلاعات از Excel"
              content={{
                what: 'ثبت هم‌زمان چند سطر و ستون از Excel در برگهٔ زمان‌سنجی — با چیدمان جدید: هر سطر داده یک ردیف شبکه (عنصر یا زیرردیف هم‌پوشانی) و هر ستون داده یک چرخه.',
                input:
                  'دو مسیر مستقل: (۱) محدودهٔ موردنظر را در Excel کپی کنید (Ctrl+C) و همین‌جا بچسبانید (Ctrl+V)؛ (۲) «قالب Excel» این جلسه را دانلود کنید، تکمیل کنید و فایل را بارگذاری کنید.',
                example:
                  'اگر ۳ عنصر دارید و ۵ چرخه Paste می‌کنید، یک محدودهٔ ۳ سطر × ۵ ستون کپی کنید. برای عنصر هم‌زمان به‌جای یک عدد «۳-۹» (شروع تا پایان) و برای زیرردیف هم‌پوشانی خالی/۰/مقدار مثبت بنویسید.',
                note: 'هیچ داده‌ای بدون پیش‌نمایش و تأیید شما ثبت نمی‌شود؛ خطای هر سلول با محل و علت دقیق نمایش داده می‌شود. بارگذاری فایل هم فقط ورودی همین مسیر را می‌سازد و به‌صورت مستقیم ذخیره نمی‌کند.',
              }}
            />
          </DialogTitle>
          <DialogDescription>
            {fileSource ? (
              <>
                فایل قالب: «{fileSource.name}» — مبدأ نگاشت: چرخهٔ {formatInt(activeAnchor.cycleNo, prefs)} از ابتدای
                برگه
              </>
            ) : (
              <>
                مبدأ: چرخهٔ {formatInt(activeAnchor.cycleNo, prefs)}
                {anchorElementName
                  ? `، ردیف «${anchorRelation ? `هم‌پوشانی (${anchorElementName} ↔ ${anchorRelation.elementLowId === activeAnchor.elementId ? anchorRelation.elementHighName : anchorRelation.elementLowName})` : anchorElementName}»`
                  : '، بدون ردیف (ابتدا سلولی از برگه انتخاب کنید)'}
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto" style={{ maxHeight: '55vh' }}>
          {/* ── مسیر ۱: Paste مستقیم (§۹-۱ — دست‌نخورده) ── */}
          {fileSource ? (
            <div className="space-y-2 rounded-xl border border-brand/40 bg-brand-soft/30 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex min-w-0 items-center gap-2 text-xs font-bold text-brand">
                  <FileSpreadsheet className="size-4 shrink-0" aria-hidden />
                  <span className="truncate">فایل بارگذاری‌شده: {fileSource.name}</span>
                </p>
                <Button variant="outline" size="sm" onClick={backToText} className="shrink-0">
                  بازگشت به Paste متنی
                </Button>
              </div>
              <p className="num text-xs text-muted-foreground">
                {formatInt(fileSource.data.length, prefs)} ردیف ×{' '}
                {formatInt(Math.max(...fileSource.data.map((r) => r.length), 0), prefs)} چرخه خوانده شد — پیش‌نمایش
                زیر را بررسی و پس از رفع خطاها ثبت نهایی کنید.
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="paste-text">محتوای Excel را اینجا بچسبانید</Label>
              <textarea
                id="paste-text"
                ref={textareaRef}
                dir="ltr"
                value={text}
                onChange={(e) => {
                  setText(e.target.value)
                  setPreview(null)
                }}
                onPaste={(e) => {
                  // چسباندن واقعی از کلیپبورد
                  const pasted = e.clipboardData.getData('text')
                  if (pasted) {
                    e.preventDefault()
                    setText(pasted)
                    setPreview(null)
                  }
                }}
                placeholder={'12.5\t8.3\t9.1\n11.9\t8.4\t9.0\n…'}
                className="num min-h-24 w-full rounded-xl border bg-background p-3 font-mono text-xs focus-visible:outline-2 focus-visible:outline-ring"
              />
              <p className="text-[11px] text-muted-foreground">
                هر سطر = یک ردیف شبکه (عنصر یا زیرردیف هم‌پوشانی) — هر ستون = یک چرخه — جداکنندهٔ ستون: Tab — اعشار:
                نقطه یا «٫» — بازهٔ عنصر: «۳-۹» — زیرردیف هم‌پوشانی: خالی/۰/مقدار مثبت — خالی = بدون تغییر
              </p>
              <Button
                variant="outline"
                onClick={doPreview}
                disabled={!parsedData || previewing || runPreview.isPending}
                className="gap-1.5"
              >
                {(previewing || runPreview.isPending) && <Loader2 className="size-4 animate-spin" aria-hidden />}
                پیش‌نمایش و اعتبارسنجی
              </Button>
            </div>
          )}

          {/* ── مسیر ۲: قالب Excel — v1.5.2 §۹ ── */}
          <div className="space-y-2 rounded-xl border border-dashed p-3">
            <p className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
              <span className="flex size-6 items-center justify-center rounded-full bg-muted text-[11px] font-extrabold">یا</span>
              ورود از طریق قالب Excel این جلسه
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => window.open(timingApi.excelTemplateUrl(sessionId))}
                title="دانلود قالب Excel متناسب با این جلسه — شامل نام واقعی عناصر، روابط موازی و چرخه‌ها"
              >
                <FileSpreadsheet className="size-4" aria-hidden />
                دانلود قالب Excel
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                disabled={fileLoading}
                onClick={() => fileInputRef.current?.click()}
                title="بارگذاری فایل xlsx تکمیل‌شدهٔ همان قالب — داده‌ها وارد پیش‌نمایش می‌شوند"
              >
                {fileLoading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <FileUp className="size-4" aria-hidden />}
                بارگذاری فایل Excel
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void onFileSelected(f)
                }}
              />
            </div>
            <p className="text-[11px] leading-5 text-muted-foreground">
              قالب شامل نام واقعی عناصر و روابط موازی همین جلسه و ستون‌های چرخه است (شناسه‌های پایدار در شیت مخفی
              Metadata). پس از تکمیل، فایل را بارگذاری کنید یا محدودهٔ داده‌ها را کپی و در همان مسیر Paste بالا
              بچسبانید.
            </p>
            {fileError && (
              <p className="whitespace-pre-line rounded-lg bg-red-soft/60 px-2.5 py-2 text-[11px] leading-5 text-red">
                {fileError}
              </p>
            )}
          </div>

          {/* پیش‌نمایش — چیدمان مطابق جدول جدید (§۸.۳) */}
          {preview && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="num flex items-center gap-1 rounded-full bg-green-soft px-2 py-0.5 font-bold text-green">
                  <CheckCircle2 className="size-3.5" aria-hidden /> {formatInt(preview.okCount, prefs)} سالم
                </span>
                {preview.warnCount > 0 && (
                  <span className="num flex items-center gap-1 rounded-full bg-amber-soft px-2 py-0.5 font-bold text-amber">
                    <AlertTriangle className="size-3.5" aria-hidden /> {formatInt(preview.warnCount, prefs)} هشدار
                  </span>
                )}
                {preview.errorCount > 0 && (
                  <span className="num flex items-center gap-1 rounded-full bg-red-soft px-2 py-0.5 font-bold text-red">
                    <XCircle className="size-3.5" aria-hidden /> {formatInt(preview.errorCount, prefs)} خطا
                  </span>
                )}
                <span className="num flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                  <MinusCircle className="size-3.5" aria-hidden /> {formatInt(preview.skipCount, prefs)} بدون تغییر
                </span>
                {preview.createdCycles > 0 && (
                  <span className="num rounded-full bg-brand-soft px-2 py-0.5 font-bold text-brand">
                    {formatInt(preview.createdCycles, prefs)} چرخهٔ جدید
                  </span>
                )}
              </div>

              {/* جدول پیش‌نمایش — ردیف=شبکه، ستون=چرخه */}
              <div className="overflow-x-auto rounded-xl border">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-surface-2/70 text-right">
                      <th className="px-2 py-2 font-bold">عنصر / رابطه</th>
                      {Array.from({ length: maxCols }).map((_, i) => (
                        <th key={i} className="num px-2 py-2 text-center font-bold">
                          چرخهٔ {formatInt(preview.startCycleNo + i, prefs)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((row) => (
                      <tr key={row.row} className={`border-b last:border-0 ${row.kind === 'RELATION' ? 'bg-surface-2/40' : ''}`}>
                        <td className="px-2 py-1.5 font-bold">
                          {row.kind === 'RELATION' ? (
                            /* v1.5.2 §۸ — فلش رو به چپ به طرف عنصر والد */
                            <span className="text-[11px] text-muted-foreground">↲ هم‌پوشانی با {row.otherElementName}</span>
                          ) : (
                            row.elementName
                          )}
                        </td>
                        {Array.from({ length: maxCols }).map((_, ci) => {
                          const cell = row.cells[ci]
                          if (!cell) return <td key={ci} className="px-2 py-1.5" />
                          return (
                            <td
                              key={ci}
                              className={`px-2 py-1.5 text-center ${
                                cell.status === 'ERROR'
                                  ? 'bg-red-soft/60 text-red'
                                  : cell.status === 'WARN'
                                    ? 'bg-amber-soft/60 text-amber'
                                    : cell.status === 'SKIP'
                                      ? 'text-faint'
                                      : 'text-foreground'
                              }`}
                              title={cell.message}
                            >
                              <div className="space-y-0.5">
                                <p className="num">
                                  {cell.status === 'SKIP'
                                    ? '—'
                                    : cell.relationId
                                      ? cell.overlapStatus === 'NO_OVERLAP'
                                        ? '۰ (بدون هم‌پوشانی)'
                                        : cell.overlapStatus === 'OVERLAP'
                                          ? formatTimeValue(cell.overlapDuration ?? null, prefs)
                                          : '—'
                                      : cell.startOffset !== undefined
                                        ? `${formatTimeValue(cell.startOffset ?? 0, prefs)}–${formatTimeValue(cell.endOffset ?? 0, prefs)}`
                                        : formatTimeValue(
                                            cell.cumulativeReading ?? cell.rawDuration ?? cell.previewDerived ?? null,
                                            prefs
                                          )}
                                </p>
                                {(() => {
                                  const isOkWithDerived =
                                    cell.status === 'OK' &&
                                    !cell.relationId &&
                                    cell.cumulativeReading !== undefined &&
                                    cell.previewDerived !== undefined &&
                                    cell.previewDerived !== null
                                  if (isOkWithDerived) {
                                    return (
                                      <p className="num text-[10px] leading-4 text-green">
                                        → مدت: {formatTimeValue(cell.previewDerived ?? null, prefs)}
                                      </p>
                                    )
                                  }
                                  if (cell.message) return <p className="text-[10px] leading-4">{cell.message}</p>
                                  return null
                                })()}
                              </div>
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* حالت ثبت — FR-07 */}
              <div className="space-y-2 rounded-xl border p-3">
                <div className="flex items-center gap-1">
                  <p className="text-xs font-bold">در صورت وجود خطا:</p>
                  <HelpDot
                    label="حالت ثبت Paste"
                    content={{
                      what: 'رفتار سیستم هنگامی که برخی سلول‌های Paste نامعتبر باشند.',
                      input: '«همه یا هیچ»: تا وقتی حتی یک سلول خطا دارد، هیچ چیزی ثبت نمی‌شود. «رد سلول‌های مشکل‌دار»: فقط سلول‌های سالم ثبت و سلول‌های خطادار رد می‌شوند.',
                      example: 'در یک Paste با یک سلول منفی، حالت اول هیچ چیزی ثبت نمی‌کند؛ حالت دوم بقیهٔ سلول‌ها را ثبت و همان سلول را رد می‌کند.',
                      note: 'این انتخاب مطابق الزام PRD است که Paste نامعتبر نباید باعث ثبت ناقص و پنهانی کل محدوده شود.',
                    }}
                  />
                </div>
                <RadioGroup value={mode} onValueChange={(v) => setMode(v as typeof mode)} className="gap-2">
                  <label className="flex cursor-pointer items-start gap-2 rounded-lg p-2 hover:bg-muted/50">
                    <RadioGroupItem value="ALL_OR_NOTHING" className="mt-0.5" />
                    <span className="space-y-0.5 text-xs">
                      <span className="block font-bold">همه یا هیچ (پیش‌فرض)</span>
                      <span className="block text-muted-foreground">
                        با وجود خطا، هیچ داده‌ای ثبت نمی‌شود تا کلیشهٔ ناقص پنهان نماند.
                      </span>
                    </span>
                  </label>
                  <label className="flex cursor-pointer items-start gap-2 rounded-lg p-2 hover:bg-muted/50">
                    <RadioGroupItem value="SKIP_INVALID" className="mt-0.5" />
                    <span className="space-y-0.5 text-xs">
                      <span className="block font-bold">رد سلول‌های مشکل‌دار</span>
                      <span className="block text-muted-foreground">
                        سلول‌های سالم ثبت و سلول‌های خطادار رد می‌شوند؛ فهرست ردشده‌ها اطلاع‌داده می‌شود.
                      </span>
                    </span>
                  </label>
                </RadioGroup>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            انصراف
          </Button>
          <Button
            className="btn-brand border-0 gap-1.5"
            disabled={!preview || preview.okCount + preview.warnCount === 0 || committing}
            onClick={() => void doCommit()}
          >
            {committing && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {mode === 'ALL_OR_NOTHING' && preview && preview.errorCount > 0
              ? 'خطاها را اصلاح کنید'
              : `ثبت ${preview ? formatInt(preview.okCount + preview.warnCount, prefs) : ''} سلول`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
