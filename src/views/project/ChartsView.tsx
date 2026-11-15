'use client'

// ═══════════════════════════════════════════════════════════
// نمای نمودار فرایند — سطح پروژه
// ▸ مالکیت زبانهٔ فعال (OPC/FPC)؛ رندر کامل (هدر چسبان + زبانه‌ها +
//   نوار ابزار + بوم) در ChartCanvas انجام می‌شود تا همه در یک بلوک
//   چسبان واحد زیر TopBar فریز شوند (v1.5.2 نهایی §۴).
// ═══════════════════════════════════════════════════════════
import { useState } from 'react'
import type { ChartTypeValue } from '@/lib/api/endpoints'
import ChartCanvas from './charts/ChartCanvas'

export default function ChartsView({ projectId }: { projectId: string }) {
  const [chartType, setChartType] = useState<ChartTypeValue>('FPC')
  return (
    <ChartCanvas
      key={chartType}
      projectId={projectId}
      chartType={chartType}
      onChartTypeChange={setChartType}
    />
  )
}
