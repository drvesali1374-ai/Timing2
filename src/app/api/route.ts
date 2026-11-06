import { NextResponse } from 'next/server'

/** بررسی سلامت سرویس — بدون تماس خارجی */
export function GET() {
  return NextResponse.json({
    status: 'ok',
    app: 'زمان‌سنجی صنعتی',
    version: '1.0.0-phase1-2',
    offline: true,
  })
}
