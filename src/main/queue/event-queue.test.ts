import { describe, expect, it } from 'vitest'
import type { HttpResult, PostEventsResponse } from '../../shared/api'
import type { AppEvent } from '../../shared/events'
import { backoffMs, classify, enqueue, QUEUE_CAP, removeEvents } from './event-queue'

const event = (n: number): AppEvent => ({
  type: 'SESSION_START',
  payload: {},
  eventId: `id-${n}`,
  sessionId: 's',
  occurredAt: '2026-10-04T09:22:00+09:00',
})

const error = (status: number, code: string, retryAfterSec: number | null = null) =>
  ({ kind: 'error', status, body: { code, message: '', traceId: 'req-1' }, retryAfterSec }) as const

describe('event queue', () => {
  it('drops the oldest events beyond the cap', () => {
    const full = Array.from({ length: QUEUE_CAP }, (_, i) => event(i))
    const next = enqueue(full, [event(QUEUE_CAP)])
    expect(next).toHaveLength(QUEUE_CAP)
    expect(next[0]?.eventId).toBe('id-1')
    expect(next.at(-1)?.eventId).toBe(`id-${QUEUE_CAP}`)
  })

  it('removes only the events from the sent snapshot', () => {
    expect(removeEvents([event(1), event(2), event(3)], [event(1), event(2)]).map((e) => e.eventId)).toEqual(['id-3'])
  })

  it('backs off exponentially up to five minutes', () => {
    expect([0, 1, 2, 20].map(backoffMs)).toEqual([1000, 2000, 4000, 300_000])
  })

  it('maps responses to the spec actions', () => {
    const body = { accepted: 1, duplicated: 0, rejected: [] }
    const ok: HttpResult<PostEventsResponse> = { kind: 'ok', status: 200, body }
    expect(classify(ok, 1).kind).toBe('sent')
    expect(classify(error(400, 'INVALID_REQUEST'), 5).kind).toBe('discard')
    expect(classify(error(400, 'DEVICE_ID_INVALID'), 5).kind).toBe('retry')
    expect(classify(error(413, 'PAYLOAD_TOO_LARGE'), 5).kind).toBe('split')
    expect(classify(error(413, 'PAYLOAD_TOO_LARGE'), 1).kind).toBe('discard')
    expect(classify(error(429, 'RATE_LIMITED', 30), 5)).toMatchObject({ kind: 'retry', afterMs: 30_000 })
    expect(classify(error(503, 'INTERNAL_ERROR'), 5)).toMatchObject({ kind: 'retry', afterMs: null })
    expect(classify({ kind: 'network', message: 'offline' }, 5).kind).toBe('retry')
  })
})
