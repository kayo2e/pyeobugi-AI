import type { ApiErrorBody, HttpResult, PostEventsResponse, ReportSummary } from '../../shared/api'
import type { AppEvent } from '../../shared/events'

const TIMEOUT_MS = 10_000

const parseRetryAfter = (body: unknown, header: string | null): number | null => {
  const fromBody = (body as { retryAfter?: unknown } | null)?.retryAfter
  if (Number.isInteger(fromBody)) return fromBody as number
  const fromHeader = header === null ? Number.NaN : Number(header)
  return Number.isFinite(fromHeader) ? fromHeader : null
}

const request = async <T>(url: string, init: RequestInit): Promise<HttpResult<T>> => {
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) })
    const body: unknown = await res.json().catch(() => null)
    if (res.ok) return { kind: 'ok', status: res.status, body: body as T }
    return {
      kind: 'error',
      status: res.status,
      body: body as ApiErrorBody | null,
      retryAfterSec: parseRetryAfter(body, res.headers.get('retry-after')),
    }
  } catch (e) {
    return { kind: 'network', message: e instanceof Error ? e.message : String(e) }
  }
}

export const createApiClient = (baseUrl: string, deviceId: string) => {
  const headers = { 'X-Device-Id': deviceId }
  return {
    postEvents: (events: AppEvent[]) =>
      request<PostEventsResponse>(`${baseUrl}/api/events`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ events }),
      }),
    getSummary: () => request<ReportSummary>(`${baseUrl}/api/reports/summary`, { headers }),
  }
}
