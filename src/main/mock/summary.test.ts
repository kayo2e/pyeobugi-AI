import { describe, expect, it } from 'vitest'
import type { AppEvent } from '../../shared/events'
import { kstWeekStartMs, summarize } from './summary'

const base = { eventId: 'e', sessionId: 's' }
const usage = (startedAt: string, durationSec: number, badDurationSec: number): AppEvent => ({
  ...base,
  type: 'USAGE_SEGMENT',
  occurredAt: startedAt,
  payload: { startedAt, endedAt: startedAt, durationSec, badDurationSec },
})
const bad = (occurredAt: string): AppEvent => ({
  ...base,
  type: 'POSTURE_BAD',
  occurredAt,
  payload: { severity: 'MILD' },
})

const NOW = Date.parse('2026-10-07T14:05:00+09:00')

describe('summarize', () => {
  it('starts the week on Monday 00:00 KST', () => {
    expect(kstWeekStartMs(NOW)).toBe(Date.parse('2026-10-05T00:00:00+09:00'))
  })

  it('reports no data as hasData false with null rates and comment', () => {
    const s = summarize([{ ...base, type: 'SESSION_START', occurredAt: '2026-10-07T09:00:00+09:00', payload: {} }], NOW)
    expect(s).toMatchObject({ hasData: false, comment: null, today: { postureKeepRate: null, usageSeconds: 0 } })
  })

  it('computes the weekly rate from summed seconds, not the mean of daily rates', () => {
    const events = [
      usage('2026-10-05T10:00:00+09:00', 3600, 3600),
      usage('2026-10-07T10:00:00+09:00', 60, 0),
      usage('2026-10-04T10:00:00+09:00', 600, 0),
      bad('2026-10-07T10:00:30+09:00'),
    ]
    const s = summarize(events, NOW)
    expect(s.today).toEqual({ postureKeepRate: 100, turtleNeckCount: 1, pomodoroCount: 0, usageSeconds: 60 })
    expect(s.week).toEqual({ postureKeepRate: 2, turtleNeckCount: 1, pomodoroCount: 0, usageSeconds: 3660 })
    expect(s.comment).toEqual({ message: '오늘 잘했어요', mood: 'GOOD' })
  })
})
