import { describe, expect, it } from 'vitest'
import type { EventDraft } from '../../shared/events'
import type { Transition } from '../../shared/posture/engine'
import { applyTransition, flush, initialBuilderState, stop, tick } from './segment-builder'
import type { BuilderState } from './segment-builder'

const ms = (kstTime: string): number => Date.parse(`2026-10-04T${kstTime}+09:00`)

type Step = Transition | { type: 'TICK'; at: number } | { type: 'FLUSH'; at: number } | { type: 'STOP'; at: number }

const run = (steps: Step[], start: BuilderState = initialBuilderState) =>
  steps.reduce(
    (acc, step) => {
      const result =
        step.type === 'TICK'
          ? tick(acc.state, step.at)
          : step.type === 'FLUSH'
            ? flush(acc.state, step.at)
            : step.type === 'STOP'
              ? stop(acc.state, step.at)
              : applyTransition(acc.state, step)
      return { state: result.state, drafts: [...acc.drafts, ...result.drafts] }
    },
    { state: start, drafts: [] as EventDraft[] },
  )

const seg = (startedAt: string, endedAt: string, durationSec: number, badDurationSec = 0) =>
  ({ startedAt: `2026-10-${startedAt}+09:00`, endedAt: `2026-10-${endedAt}+09:00`, durationSec, badDurationSec })

const segments = (drafts: EventDraft[]) => drafts.flatMap((d) => (d.type === 'USAGE_SEGMENT' ? [d.payload] : []))

describe('segment builder', () => {
  it('closes a segment every minute with contiguous seconds-floored bounds', () => {
    const { drafts } = run([
      { type: 'PRESENCE_FOUND', at: ms('09:22:00.700') },
      { type: 'TICK', at: ms('09:23:00.100') },
      { type: 'TICK', at: ms('09:24:05.000') },
    ])
    expect(segments(drafts)).toEqual([
      seg('04T09:22:00', '04T09:23:00', 60),
      seg('04T09:23:00', '04T09:24:00', 60),
    ])
    expect(drafts[0]?.occurredAtMs).toBe(ms('09:23:00'))
  })

  it('emits POSTURE_BAD on entry and accumulates bad time across segments', () => {
    const { drafts } = run([
      { type: 'PRESENCE_FOUND', at: ms('09:22:00') },
      { type: 'BAD_ENTER', at: ms('09:22:40'), severity: 'MODERATE' },
      { type: 'TICK', at: ms('09:23:00') },
      { type: 'BAD_EXIT', at: ms('09:23:12.600') },
      { type: 'STOP', at: ms('09:23:30') },
    ])
    expect(drafts.filter((d) => d.type === 'POSTURE_BAD')).toEqual([
      { type: 'POSTURE_BAD', occurredAtMs: ms('09:22:40'), payload: { severity: 'MODERATE' } },
    ])
    expect(segments(drafts).map((s) => [s.durationSec, s.badDurationSec])).toEqual([
      [60, 20],
      [30, 13],
    ])
  })

  it('splits at KST midnight', () => {
    const night = (t: string) => Date.parse(t)
    const { drafts } = run([
      { type: 'PRESENCE_FOUND', at: night('2026-10-04T23:59:30+09:00') },
      { type: 'TICK', at: night('2026-10-05T00:00:45+09:00') },
    ])
    expect(segments(drafts)).toEqual([
      seg('04T23:59:30', '05T00:00:00', 30),
    ])
  })

  it('ends the segment at the last seen face and reopens on return', () => {
    const { drafts, state } = run([
      { type: 'PRESENCE_FOUND', at: ms('09:22:00') },
      { type: 'PRESENCE_LOST', at: ms('09:22:20') },
      { type: 'TICK', at: ms('09:24:00') },
      { type: 'PRESENCE_FOUND', at: ms('09:25:00') },
    ])
    expect(segments(drafts).map((s) => s.durationSec)).toEqual([20])
    expect(state.segment?.startMs).toBe(ms('09:25:00'))
  })

  it('drops an absence dated before the current segment started', () => {
    const { drafts } = run([
      { type: 'PRESENCE_FOUND', at: ms('09:22:00') },
      { type: 'TICK', at: ms('09:23:01') },
      { type: 'PRESENCE_LOST', at: ms('09:22:58') },
    ])
    expect(segments(drafts).map((s) => s.durationSec)).toEqual([60])
  })

  it('flushes the open segment and keeps tracking from the flush time', () => {
    const { drafts, state } = run([
      { type: 'PRESENCE_FOUND', at: ms('09:22:00') },
      { type: 'BAD_ENTER', at: ms('09:22:10'), severity: 'MILD' },
      { type: 'FLUSH', at: ms('09:22:30.400') },
      { type: 'STOP', at: ms('09:22:40') },
    ])
    expect(segments(drafts).map((s) => [s.startedAt.slice(11, 19), s.durationSec, s.badDurationSec])).toEqual([
      ['09:22:00', 30, 20],
      ['09:22:30', 10, 10],
    ])
    expect(state).toEqual(initialBuilderState)
  })

  it('splits bad time correctly when a transition arrives before the minute tick', () => {
    const { drafts } = run([
      { type: 'PRESENCE_FOUND', at: ms('09:22:00') },
      { type: 'BAD_ENTER', at: ms('09:22:10'), severity: 'SEVERE' },
      { type: 'BAD_EXIT', at: ms('09:23:30') },
      { type: 'STOP', at: ms('09:23:40') },
    ])
    expect(segments(drafts).map((s) => [s.durationSec, s.badDurationSec])).toEqual([
      [60, 50],
      [40, 30],
    ])
  })
})
