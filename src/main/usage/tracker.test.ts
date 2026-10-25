import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AppEvent } from '../../shared/events'
import { createUsageTracker } from './tracker'

const SESSION = 'a9a9a9a9-0000-4000-8000-0000000000aa'

afterEach(() => vi.useRealTimers())

describe('usage tracker', () => {
  it('ignores transitions while stopped so a suspend gap is never counted', () => {
    vi.useFakeTimers()
    const start = Date.parse('2026-10-25T23:00:00+09:00')
    vi.setSystemTime(start)
    const events: AppEvent[] = []
    const tracker = createUsageTracker(SESSION, (e) => events.push(e))

    tracker.start()
    tracker.stop(start)
    tracker.transitions([{ type: 'PRESENCE_FOUND', at: start + 1000 }])
    vi.setSystemTime(start + 8 * 60 * 60_000)
    tracker.start()
    vi.advanceTimersByTime(1000)

    expect(events.filter((e) => e.type === 'USAGE_SEGMENT')).toEqual([])
    tracker.stop()
  })
})
