'use client'

// ═══════════════════════════════════════════════════════════
// انتخاب‌گر تاریخ جلالی — FR-29
// تقویم شمسی محلی + پذیرش ورود دستی؛ مقدار ISO میلادی برمی‌گرداند
// ═══════════════════════════════════════════════════════════
import { useMemo, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import {
  JALALI_MONTH_NAMES,
  JALALI_WEEKDAY_SHORT,
  isValidJalali,
  isoToJalali,
  jalaliToISO,
  jalaliMonthLength,
  jalaliWeekDay,
  todayJalali,
} from '@/lib/jalali'
import { normalizeDigits } from '@/lib/persian'
import { useDisplayStore } from '@/store/display-store'
import { formatNumberByMode } from '@/lib/persian'

interface JalaliDatePickerProps {
  value: string | null | undefined // ISO yyyy-mm-dd
  onChange: (iso: string | null) => void
  label?: string
  disabled?: boolean
  id?: string
  'aria-label'?: string
}

export function JalaliDatePicker({ value, onChange, label, disabled, id }: JalaliDatePickerProps) {
  const [open, setOpen] = useState(false)
  const { calendar, digits } = useDisplayStore()
  const initial = useMemo(() => {
    const j = value ? isoToJalali(value) : null
    return j ?? todayJalali()
  }, [value])
  const [view, setView] = useState(initial)
  const [manual, setManual] = useState('')

  const selected = value ? isoToJalali(value) : null

  const displayText = value ? formatJalali(value, calendar, digits) : ''

  const monthDays = useMemo(() => {
    const len = jalaliMonthLength(view.jy, view.jm)
    const firstWeekday = jalaliWeekDay(view.jy, view.jm, 1)
    return { len, firstWeekday }
  }, [view])

  const moveMonth = (delta: number) => {
    setView((v) => {
      let jm = v.jm + delta
      let jy = v.jy
      if (jm > 12) {
        jm = 1
        jy += 1
      }
      if (jm < 1) {
        jm = 12
        jy -= 1
      }
      return { jy, jm, jd: 1 }
    })
  }

  const pick = (jd: number) => {
    onChange(jalaliToISO(view.jy, view.jm, jd))
    setOpen(false)
  }

  /** ورود دستی: ۱۴۰۴/۰۸/۱۳ یا 1404-08-13 */
  const applyManual = () => {
    const s = normalizeDigits(manual).trim()
    const m = /^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/.exec(s)
    if (m) {
      const jy = Number(m[1])
      const jm = Number(m[2])
      const jd = Number(m[3])
      if (isValidJalali(jy, jm, jd)) {
        onChange(jalaliToISO(jy, jm, jd))
        setManual('')
        setOpen(false)
        return
      }
    }
    setManual('نامعتبر')
  }

  if (calendar === 'gregorian') {
    return (
      <div className="space-y-1.5">
        {label && <Label htmlFor={id}>{label}</Label>}
        <Input
          id={id}
          type="date"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value || null)}
          disabled={disabled}
          dir="ltr"
        />
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      {label && <Label htmlFor={id ?? 'jalali-date'}>{label}</Label>}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id ?? 'jalali-date'}
            variant="outline"
            disabled={disabled}
            className={cn(
              'w-full justify-between font-normal',
              !value && 'text-muted-foreground'
            )}
          >
            <span className={value ? '' : 'text-muted-foreground'}>
              {displayText || 'انتخاب تاریخ…'}
            </span>
            <CalendarDays className="size-4 opacity-60" aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-0" align="start" dir="rtl">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <Button variant="ghost" size="icon" className="size-7" onClick={() => moveMonth(-1)} aria-label="ماه قبل">
              <ChevronRight className="size-4" aria-hidden />
            </Button>
            <div className="flex items-center gap-1 text-sm font-bold">
              <button
                type="button"
                className="rounded px-1 hover:bg-muted"
                onClick={() => setView((v) => ({ ...v, jy: v.jy - 1 }))}
                aria-label="سال قبل"
              >
                ‹
              </button>
              <span>{formatNumberByMode(view.jy, digits, { decimals: 0 })}</span>
              <button
                type="button"
                className="rounded px-1 hover:bg-muted"
                onClick={() => setView((v) => ({ ...v, jy: v.jy + 1 }))}
                aria-label="سال بعد"
              >
                ›
              </button>
              <span className="mx-1 text-muted-foreground">|</span>
              <span>{JALALI_MONTH_NAMES[view.jm - 1]}</span>
            </div>
            <Button variant="ghost" size="icon" className="size-7" onClick={() => moveMonth(1)} aria-label="ماه بعد">
              <ChevronLeft className="size-4" aria-hidden />
            </Button>
          </div>
          <div className="p-2">
            <div className="mb-1 grid grid-cols-7 text-center">
              {JALALI_WEEKDAY_SHORT.map((d, i) => (
                <span key={i} className="py-1 text-[11px] font-bold text-faint">
                  {d}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-0.5">
              {Array.from({ length: monthDays.firstWeekday }).map((_, i) => (
                <span key={`e${i}`} />
              ))}
              {Array.from({ length: monthDays.len }).map((_, i) => {
                const jd = i + 1
                const isSelected =
                  selected && selected.jy === view.jy && selected.jm === view.jm && selected.jd === jd
                const isToday = (() => {
                  const t = todayJalali()
                  return t.jy === view.jy && t.jm === view.jm && t.jd === jd
                })()
                return (
                  <button
                    key={jd}
                    type="button"
                    onClick={() => pick(jd)}
                    className={cn(
                      'num aspect-square rounded-lg text-xs font-medium transition-colors hover:bg-brand-soft hover:text-brand',
                      isSelected && 'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground',
                      !isSelected && isToday && 'ring-1 ring-brand/50'
                    )}
                  >
                    {formatNumberByMode(jd, digits, { decimals: 0 })}
                  </button>
                )
              })}
            </div>
          </div>
          <div className="flex items-center gap-1.5 border-t p-2">
            <Input
              value={manual.startsWith('نامعتبر') ? '' : manual}
              placeholder="ورود دستی: ۱۴۰۴/۰۸/۱۳"
              className="h-8 text-xs"
              onChange={(e) => setManual(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') applyManual()
              }}
            />
            <Button size="sm" variant="secondary" className="h-8" onClick={applyManual}>
              ثبت
            </Button>
            <Button size="sm" variant="ghost" className="h-8" onClick={() => { onChange(null); setOpen(false) }}>
              پاک‌کردن
            </Button>
          </div>
          {manual === 'نامعتبر' && (
            <p className="px-3 pb-2 text-[11px] text-red">قالب تاریخ نامعتبر است. مثال: ۱۴۰۴/۰۸/۱۳</p>
          )}
        </PopoverContent>
      </Popover>
    </div>
  )
}

import { toPersianDigits } from '@/lib/persian'

function formatJalali(iso: string, calendar: string, digits: string): string {
  const j = isoToJalali(iso)
  if (!j) return iso
  const text = `${j.jd} ${JALALI_MONTH_NAMES[j.jm - 1]} ${j.jy}`
  return digits === 'persian' ? toPersianDigits(text) : text
}
