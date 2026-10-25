import type { HttpResult, PostEventsResponse, RejectedEvent } from '../../shared/api'
import type { AppEvent } from '../../shared/events'

export const QUEUE_CAP = 5000
export const MAX_BATCH = 100
export const SEND_THRESHOLD = 20
export const SEND_INTERVAL_MS = 10_000
const BACKOFF_BASE_MS = 1000
const BACKOFF_MAX_MS = 5 * 60_000

export const enqueue = (queue: AppEvent[], events: AppEvent[]): AppEvent[] => [...queue, ...events].slice(-QUEUE_CAP)

export const removeEvents = (queue: AppEvent[], sent: AppEvent[]): AppEvent[] => {
  const ids = new Set(sent.map((e) => e.eventId))
  return queue.filter((e) => !ids.has(e.eventId))
}

export const backoffMs = (attempt: number): number => Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** attempt)

export type Outcome =
  | { kind: 'sent'; rejected: RejectedEvent[] }
  | { kind: 'discard'; reason: string }
  | { kind: 'split' }
  | { kind: 'retry'; afterMs: number | null; reason: string }

export const classify = (result: HttpResult<PostEventsResponse>, batchSize: number): Outcome => {
  if (result.kind === 'ok') {
    // A 2xx means the batch was stored; tolerate an empty or malformed body instead of resending forever
    const rejected = (result.body as Partial<PostEventsResponse> | null)?.rejected
    return { kind: 'sent', rejected: Array.isArray(rejected) ? rejected : [] }
  }
  if (result.kind === 'network') return { kind: 'retry', afterMs: null, reason: result.message }

  const reason = `${result.status} ${result.body?.code ?? ''} traceId=${result.body?.traceId ?? '-'}`
  if (result.status === 413) return batchSize > 1 ? { kind: 'split' } : { kind: 'discard', reason }
  if (result.status === 429) {
    return { kind: 'retry', afterMs: result.retryAfterSec === null ? null : result.retryAfterSec * 1000, reason }
  }
  // A malformed batch would fail forever if retried; a bad device ID is a client bug, so keep the events
  if (result.status === 400 && result.body?.code !== 'DEVICE_ID_INVALID') return { kind: 'discard', reason }
  return { kind: 'retry', afterMs: null, reason }
}
