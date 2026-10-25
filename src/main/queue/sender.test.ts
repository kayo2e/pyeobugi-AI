import { describe, expect, it, vi } from 'vitest'
import type { HttpResult, PostEventsResponse } from '../../shared/api'
import type { AppEvent } from '../../shared/events'
import type { QueueStore } from './queue-store'
import { createSender } from './sender'

const event = (n: number): AppEvent => ({
  type: 'SESSION_START',
  payload: {},
  eventId: `id-${n}`,
  sessionId: 's',
  occurredAt: '2026-10-04T09:22:00+09:00',
})

const memoryStore = (initial: AppEvent[] = []): QueueStore & { saved: AppEvent[] } => {
  const store = { saved: initial, load: () => store.saved, save: (q: AppEvent[]) => (store.saved = q) }
  return store
}

const ok = (events: AppEvent[]): HttpResult<PostEventsResponse> => ({
  kind: 'ok',
  status: 200,
  body: { accepted: events.length, duplicated: 0, rejected: [] },
})

const tooLarge = { code: 'PAYLOAD_TOO_LARGE', message: '', traceId: 't' }

describe('sender', () => {
  it('sends the persisted queue and clears it on success', async () => {
    const store = memoryStore([event(1), event(2)])
    const post = vi.fn(async (events: AppEvent[]) => ok(events))
    await createSender(store, post).send()
    expect(post).toHaveBeenCalledTimes(1)
    expect(store.saved).toEqual([])
  })

  it('keeps events enqueued while a batch is in flight', async () => {
    const store = memoryStore([event(1)])
    const sender = createSender(store, async (events) => {
      if (events[0]?.eventId === 'id-1') {
        sender.enqueue(event(2))
        return ok(events)
      }
      return { kind: 'network', message: 'offline' }
    })
    await sender.send()
    expect(store.saved.map((e) => e.eventId)).toEqual(['id-2'])
  })

  it('splits a too-large batch and discards a single oversized event', async () => {
    const store = memoryStore([event(1), event(2), event(3)])
    const post = vi.fn(async (events: AppEvent[]): Promise<HttpResult<PostEventsResponse>> =>
      events.length > 1 || events[0]?.eventId === 'id-2'
        ? { kind: 'error', status: 413, body: tooLarge, retryAfterSec: null }
        : ok(events),
    )
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await createSender(store, post).send()
    expect(store.saved).toEqual([])
    expect(post.mock.calls.map(([events]) => events.map((e) => e.eventId).join())).toEqual([
      'id-1,id-2,id-3',
      'id-1,id-2',
      'id-1',
      'id-2',
      'id-3',
    ])
  })

  it('waits for retryAfter before sending again', async () => {
    let now = 0
    const store = memoryStore([event(1)])
    const post = vi.fn(async (): Promise<HttpResult<PostEventsResponse>> => ({
      kind: 'error',
      status: 429,
      body: { code: 'RATE_LIMITED', message: '', traceId: 't' },
      retryAfterSec: 30,
    }))
    const sender = createSender(store, post, () => now)
    await sender.send()
    now = 29_000
    await sender.send()
    expect(post).toHaveBeenCalledTimes(1)
    now = 30_000
    post.mockImplementation(async () => ok([event(1)]))
    await sender.send()
    expect(store.saved).toEqual([])
  })

  it('sends as soon as 20 events are queued', async () => {
    const post = vi.fn(async (events: AppEvent[]) => ok(events))
    const sender = createSender(memoryStore(), post)
    Array.from({ length: 19 }, (_, i) => sender.enqueue(event(i)))
    expect(post).not.toHaveBeenCalled()
    sender.enqueue(event(19))
    await sender.send()
    expect(post).toHaveBeenCalledTimes(1)
  })
})
