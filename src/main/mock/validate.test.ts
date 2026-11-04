import { describe, expect, it } from 'vitest'
import type { EventDraft } from '../../shared/events'
import { applyTransition, initialBuilderState, stop, tick } from '../usage/segment-builder'
import type { BuilderResult, BuilderState } from '../usage/segment-builder'
import { toAppEvent } from '../usage/tracker'
import { validateEvent } from './validate'

const SESSION = '0f0e0d0c-0b0a-4908-8706-050403020100'
const ms = (iso: string) => Date.parse(iso)
const NOW = ms('2026-10-05T00:10:00+09:00')

const segment = (payload: Record<string, unknown>, occurredAt = payload['endedAt']) => ({
  eventId: 'b1c2d3e4-0000-4000-8000-000000000003',
  type: 'USAGE_SEGMENT',
  sessionId: SESSION,
  occurredAt,
  payload,
})

const validSegment = {
  startedAt: '2026-10-04T23:59:00+09:00',
  endedAt: '2026-10-05T00:00:00+09:00',
  durationSec: 60,
  badDurationSec: 12,
}

describe('validateEvent', () => {
  it('accepts a segment that ends exactly at the next KST midnight', () => {
    expect(validateEvent(segment(validSegment), NOW)).toBeNull()
  })

  it('rejects segments that break the spec rules', () => {
    expect(validateEvent(segment({ ...validSegment, badDurationSec: 61 }), NOW)).toBe('INVALID_PAYLOAD')
    expect(validateEvent(segment({ ...validSegment, durationSec: 58 }), NOW)).toBe('INVALID_PAYLOAD')
    expect(validateEvent(segment(validSegment, '2026-10-04T23:59:59+09:00'), NOW)).toBe('INVALID_PAYLOAD')
    expect(
      validateEvent(segment({ ...validSegment, endedAt: '2026-10-05T00:00:30+09:00', durationSec: 90 }), NOW),
    ).toBe('INVALID_PAYLOAD')
  })

  it('rejects unknown types, extra fields and out-of-range times', () => {
    const base = { eventId: SESSION.replace('0f', '1f'), sessionId: SESSION, occurredAt: '2026-10-05T00:09:00+09:00' }
    expect(validateEvent({ ...base, type: 'BUBBLE_REACTED', payload: {} }, NOW)).toBe('UNKNOWN_TYPE')
    expect(validateEvent({ ...base, type: 'SESSION_START', payload: { pitch: 12 } }, NOW)).toBe('FORBIDDEN_FIELD')
    expect(validateEvent({ ...base, type: 'SESSION_START', payload: {}, faceImage: 'x' }, NOW)).toBe('FORBIDDEN_FIELD')
    expect(
      validateEvent({ ...base, type: 'SESSION_START', payload: {}, occurredAt: '2026-10-05T00:16:00+09:00' }, NOW),
    ).toBe('OCCURRED_AT_OUT_OF_RANGE')
  })
})

describe('client events against the server rules', () => {
  it('produces only events the server accepts', () => {
    type Step = (s: BuilderState) => BuilderResult
    const at = (time: string) => ms(`2026-10-${time}+09:00`)
    const steps: Step[] = [
      (s) => applyTransition(s, { type: 'PRESENCE_FOUND', at: at('04T23:58:10.4') }),
      (s) => applyTransition(s, { type: 'BAD_ENTER', at: at('04T23:58:30.7'), severity: 'MODERATE' }),
      (s) => tick(s, at('04T23:59:10.9')),
      (s) => applyTransition(s, { type: 'BAD_EXIT', at: at('05T00:00:20.2'), reason: 'RECOVERED' }),
      (s) => stop(s, at('05T00:05:00.5')),
    ]
    const drafts: EventDraft[] = []
    steps.reduce((state, step) => {
      const result = step(state)
      drafts.push(...result.drafts)
      return result.state
    }, initialBuilderState)
    drafts.push({ type: 'CALIBRATION_COMPLETED', payload: { isRecalibration: false }, occurredAtMs: NOW - 1000 })

    const events = drafts.map((d) => toAppEvent(d, SESSION))
    expect(events.map((e) => e.type)).toContain('USAGE_SEGMENT')
    expect(events.map((e) => [e.type, validateEvent(e, NOW)])).toEqual(events.map((e) => [e.type, null]))
  })
})
