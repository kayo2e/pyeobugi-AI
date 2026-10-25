import type { HttpResult, PostEventsResponse } from '../../shared/api'
import type { AppEvent } from '../../shared/events'
import { backoffMs, classify, enqueue, MAX_BATCH, removeEvents, SEND_INTERVAL_MS, SEND_THRESHOLD } from './event-queue'
import type { QueueStore } from './queue-store'

export type PostEvents = (events: AppEvent[]) => Promise<HttpResult<PostEventsResponse>>

type BatchResult = 'done' | 'retry'

export const createSender = (store: QueueStore, postEvents: PostEvents, now = () => Date.now()) => {
  let queue = store.load()
  let inFlight: Promise<void> | null = null
  let retryAt = 0
  let attempt = 0
  let timer: NodeJS.Timeout | null = null

  const update = (next: AppEvent[]) => {
    queue = next
    store.save(queue)
  }

  const sendBatch = async (batch: AppEvent[]): Promise<BatchResult> => {
    const outcome = classify(await postEvents(batch), batch.length)
    switch (outcome.kind) {
      case 'sent':
        outcome.rejected.forEach((r) => console.error('[events] rejected', r))
        update(removeEvents(queue, batch))
        attempt = 0
        return 'done'
      case 'discard':
        console.error('[events] discarded batch', outcome.reason)
        update(removeEvents(queue, batch))
        return 'done'
      case 'split': {
        const half = Math.ceil(batch.length / 2)
        if ((await sendBatch(batch.slice(0, half))) === 'retry') return 'retry'
        return sendBatch(batch.slice(half))
      }
      case 'retry':
        retryAt = now() + (outcome.afterMs ?? backoffMs(attempt))
        attempt += 1
        return 'retry'
    }
  }

  const drain = async () => {
    while (queue.length > 0 && now() >= retryAt) {
      if ((await sendBatch(queue.slice(0, MAX_BATCH))) === 'retry') return
    }
  }

  const send = (): Promise<void> => {
    inFlight ??= drain()
      .catch((e: unknown) => console.error('[events] send failed', e))
      .finally(() => {
        inFlight = null
      })
    return inFlight
  }

  return {
    size: () => queue.length,
    enqueue: (event: AppEvent) => {
      update(enqueue(queue, [event]))
      if (queue.length >= SEND_THRESHOLD) void send()
    },
    send,
    flush: (timeoutMs: number) =>
      Promise.race([send(), new Promise<void>((resolve) => setTimeout(resolve, timeoutMs))]),
    start: () => {
      timer ??= setInterval(() => void send(), SEND_INTERVAL_MS)
    },
    stop: () => {
      if (timer) clearInterval(timer)
      timer = null
    },
  }
}
