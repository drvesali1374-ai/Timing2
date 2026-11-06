// ═══════════════════════════════════════════════════════════
// کلاینت HTTP مشترک — مدیریت خطای ساختاریافته فارسی — FR-23
// خطاها پنهان نمی‌شوند؛ وضعیت ذخیره سه‌گانه در UI نمایش داده می‌شود
// ═══════════════════════════════════════════════════════════

export class ApiError extends Error {
  code: string
  status: number
  details: unknown
  constructor(code: string, message: string, status: number, details?: unknown) {
    super(message)
    this.code = code
    this.status = status
    this.details = details
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  /** شناسه تغییر برای Idempotency — ۶.۶ */
  changeId?: string
  signal?: AbortSignal
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {}
  if (options.body !== undefined) headers['content-type'] = 'application/json'
  if (options.changeId) headers['x-change-id'] = options.changeId

  let res: Response
  try {
    res = await fetch(path, {
      method: options.method ?? 'GET',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
      cache: 'no-store',
    })
  } catch (err) {
    // قطع ارتباط با Backend — ورودی تأییدنشده حفظ و Retry ارائه می‌شود — FR-23
    throw new ApiError(
      'NETWORK_ERROR',
      'ارتباط با سرور برقرار نشد. تغییرات شما به‌صورت محلی نگه داشته می‌شود؛ اتصال را بررسی و دوباره تلاش کنید.',
      0
    )
  }

  const text = await res.text()
  let data: unknown = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = null
    }
  }

  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string; details?: unknown } })?.error
    throw new ApiError(
      err?.code ?? 'HTTP_ERROR',
      err?.message ?? `خطای سرور (کد ${res.status})`,
      res.status,
      err?.details
    )
  }
  return data as T
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>(path, { method: 'GET', signal }),
  post: <T>(path: string, body?: unknown, changeId?: string) =>
    request<T>(path, { method: 'POST', body, changeId }),
  put: <T>(path: string, body?: unknown, changeId?: string) =>
    request<T>(path, { method: 'PUT', body, changeId }),
  patch: <T>(path: string, body?: unknown, changeId?: string) =>
    request<T>(path, { method: 'PATCH', body, changeId }),
  del: <T>(path: string, changeId?: string) => request<T>(path, { method: 'DELETE', changeId }),
}
