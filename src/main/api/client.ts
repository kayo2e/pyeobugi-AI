import type {
  ApiErrorBody,
  HttpResult,
  PostEventsResponse,
  RegisterDeviceResponse,
  ReportSummary,
} from '../../shared/api'
import type { AppEvent } from '../../shared/events'
import type { DeviceCredentials } from '../device'

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

export const registerDevice = (baseUrl: string, deviceId: string) =>
  request<RegisterDeviceResponse>(`${baseUrl}/api/devices/register`, {
    method: 'POST',
    headers: { 'X-Device-Id': deviceId },
  })

export const createApiClient = (baseUrl: string, credentials: () => Promise<HttpResult<DeviceCredentials>>) => {
  const authorized = async <T>(call: (headers: Record<string, string>) => Promise<HttpResult<T>>) => {
    const result = await credentials()
    if (result.kind !== 'ok') return result
    return call({ 'X-Device-Id': result.body.deviceId, 'X-Device-Secret': result.body.deviceSecret })
  }
  return {
    postEvents: (events: AppEvent[]) =>
      authorized((headers) =>
        request<PostEventsResponse>(`${baseUrl}/api/events`, {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ events }),
        }),
      ),
    getSummary: () => authorized((headers) => request<ReportSummary>(`${baseUrl}/api/reports/summary`, { headers })),
  }
}
