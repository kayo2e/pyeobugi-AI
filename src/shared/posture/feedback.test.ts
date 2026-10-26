import { describe, expect, it } from 'vitest'
import { initialEngineState } from './engine'
import { initialFeedback, updateFeedback } from './feedback'

const good = { ...initialEngineState, present: true, tracking: true, pitch: 0, size: 0.3 }
const bad = { ...good, bad: true, badSince: 1000, score: 12 }

describe('local feedback contract', () => {
  it('exposes pending, confirmed bad and recovering states with sustained duration', () => {
    expect(updateFeedback(initialFeedback, { ...good, pendingSince: 1000 }, 2000, true, true, []).phase)
      .toBe('PENDING_BAD')
    expect(updateFeedback(initialFeedback, bad, 6000, true, true, [])).toMatchObject({
      phase: 'BAD', score: 12, severity: 'MODERATE', badSince: 1000, badDurationMs: 5000,
    })
    expect(updateFeedback(initialFeedback, { ...bad, pendingSince: 5000 }, 6000, true, true, []).phase)
      .toBe('RECOVERING')
  })

  it('suppresses actionable feedback immediately on invalid observations or absent calibration', () => {
    expect(updateFeedback(initialFeedback, bad, 6000, false, true, [])).toMatchObject({
      phase: 'UNAVAILABLE', score: null, severity: null, badSince: null, badDurationMs: 0,
    })
    expect(updateFeedback(initialFeedback, good, 6000, true, false, []).phase).toBe('UNCALIBRATED')
  })

  it('distinguishes exit reasons and provides an event ID for exactly-once reward consumption', () => {
    const recovered = updateFeedback(initialFeedback, good, 6000, true, true,
      [{ type: 'BAD_EXIT', at: 4000, reason: 'RECOVERED' }])
    expect(recovered.lastExit).toEqual({ id: 1, occurredAt: 4000, detectedAt: 6000, reason: 'RECOVERED' })
    const next = updateFeedback(recovered, good, 7000, true, true, [])
    expect(next.lastExit).toEqual(recovered.lastExit)
    const absent = updateFeedback(next, initialEngineState, 8000, false, true,
      [{ type: 'BAD_EXIT', at: 5000, reason: 'FACE_LOST' }])
    expect(absent.lastExit).toMatchObject({ id: 2, reason: 'FACE_LOST' })
    const reset = updateFeedback(absent, good, 9000, true, true,
      [{ type: 'BAD_EXIT', at: 9000, reason: 'RECALIBRATED' }])
    expect(reset.lastExit).toMatchObject({ id: 3, reason: 'RECALIBRATED' })
  })

  it('retains sequence numbers after a session reset clears the last event', () => {
    const reset = { ...initialFeedback, exitSequence: 8 }
    expect(updateFeedback(reset, good, 9000, true, true,
      [{ type: 'BAD_EXIT', at: 7000, reason: 'RECOVERED' }]).lastExit?.id).toBe(9)
  })
})
