'use client'

// ═══════════════════════════════════════════════════════════
// ورودی عدد با ارقام فارسی/لاتین — FR-07 / FR-29
// پذیرش ۰-۹ فارسی و عربی و لاتین؛ نمایش مطابق تنظیمات
// ═══════════════════════════════════════════════════════════
import { useEffect, useState, type ComponentProps } from 'react'
import { Input } from '@/components/ui/input'
import { normalizeDigits, parseNumber, toPersianDigits } from '@/lib/persian'
import { useDisplayStore } from '@/store/display-store'
import { cn } from '@/lib/utils'

interface PersianNumberInputProps extends Omit<ComponentProps<typeof Input>, 'value' | 'onChange' | 'type'> {
  value: number | null
  onChange: (value: number | null) => void
  /** اعشار مجاز؟ (پیش‌فرض بله) */
  decimals?: boolean
  min?: number
  max?: number
  suffix?: string
}

export function PersianNumberInput({
  value,
  onChange,
  decimals = true,
  min,
  max,
  suffix,
  className,
  ...props
}: PersianNumberInputProps) {
  const { digits } = useDisplayStore()
  const [text, setText] = useState(() => renderValue(value, digits))

  useEffect(() => {
    setText(renderValue(value, digits))
  }, [value, digits])

  const handleText = (raw: string) => {
    // اجازه ورود ارقام فارسی/عربی/لاتین + نقطه
    const normalized = normalizeDigits(raw)
    if (normalized === '') {
      setText('')
      onChange(null)
      return
    }
    const isValidFormat = decimals ? /^-?\d*\.?\d*$/.test(normalized) : /^-?\d*$/.test(normalized)
    if (!isValidFormat) return
    setText(raw)
    const n = parseNumber(normalized)
    if (!Number.isNaN(n)) {
      let v = n
      if (min !== undefined) v = Math.max(min, v)
      if (max !== undefined) v = Math.min(max, v)
      onChange(v)
    }
  }

  return (
    <div className="relative w-full">
      <Input
        {...props}
        type="text"
        inputMode={decimals ? 'decimal' : 'numeric'}
        dir="ltr"
        className={cn('num text-left', suffix && 'pl-8', className)}
        value={text}
        onChange={(e) => handleText(e.target.value)}
        onFocus={(e) => e.target.select()}
      />
      {suffix && (
        <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-xs text-faint">
          {suffix}
        </span>
      )}
    </div>
  )
}

function renderValue(value: number | null, digits: string): string {
  if (value === null || value === undefined || Number.isNaN(value)) return ''
  const s = String(value)
  return digits === 'persian' ? toPersianDigits(s) : s
}

/** ورودی درصد — کاربر عدد درصد وارد می‌کند؛ مقدار اعشاری برمی‌گرداند (۱۵ → 0.15) — FR-15 */
export function PercentInput({
  value,
  onChange,
  ...props
}: {
  value: number | null
  onChange: (decimalValue: number | null) => void
} & Omit<PersianNumberInputProps, 'value' | 'onChange' | 'suffix' | 'decimals'>) {
  return (
    <PersianNumberInput
      {...props}
      value={value === null ? null : Math.round(value * 10000) / 100}
      onChange={(v) => onChange(v === null ? null : Math.round((v / 100) * 10000) / 10000)}
      decimals
      min={0}
      max={100}
      suffix="٪"
    />
  )
}
