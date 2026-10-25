import { describe, expect, it } from 'vitest'
import { initialEngineState, nextIntervalMs, resetPosture, stepEngine, TIMING } from './engine'
import type { EngineState, Sample, Transition } from './engine'
import { postureScore, severityOf } from './score'
import type { Baseline } from './score'

const BASELINE = { pitch: 0, size: 0.3 }
const GOOD = { pitch: 0, size: 0.3 }
const BAD = { pitch: 20, size: 0.3 }

const run = (samples: Sample[], start: EngineState = initialEngineState, baseline: Baseline | null = BASELINE) =>
  samples.reduce(
    (acc, sample) => {
      const { state, transitions } = stepEngine(acc.state, sample, baseline)
      return { state, transitions: [...acc.transitions, ...transitions] }
    },
    { state: start, transitions: [] as Transition[] },
  )

const series = (from: number, to: number, stepMs: number, face: Sample['face']): Sample[] =>
  Array.from({ length: Math.floor((to - from) / stepMs) + 1 }, (_, i) => ({ at: from + i * stepMs, face }))

describe('postureScore', () => {
  it('is zero at the baseline', () => {
    expect(postureScore(0, 0.3, BASELINE)).toBe(0)
  })

  it('ignores a larger face when the head is not pitched down', () => {
    expect(postureScore(3, 0.5, BASELINE)).toBe(postureScore(3, 0.3, BASELINE))
  })

  it('maps scores to severity bands', () => {
    expect([severityOf(3), severityOf(10), severityOf(18)]).toEqual(['MILD', 'MODERATE', 'SEVERE'])
  })
})

describe('stepEngine presence', () => {
  it('reports presence on the first face', () => {
    expect(run([{ at: 0, face: GOOD }]).transitions).toEqual([{ type: 'PRESENCE_FOUND', at: 0 }])
  })

  it('ignores a short detection miss', () => {
    const { transitions } = run([...series(0, 2000, 1000, GOOD), ...series(3000, 4000, 1000, null)])
    expect(transitions).toEqual([{ type: 'PRESENCE_FOUND', at: 0 }])
  })

  it('reports absence dated to the last seen face after the miss hold', () => {
    const { state, transitions } = run([...series(0, 2000, 1000, GOOD), ...series(3000, 5000, 1000, null)])
    expect(transitions.at(-1)).toEqual({ type: 'PRESENCE_LOST', at: 2000 })
    expect(state.present).toBe(false)
  })

  it('closes bad posture before reporting absence', () => {
    const bad = run(series(0, 4000, 250, BAD))
    const { transitions } = run(series(5000, 8000, 1000, null), bad.state)
    expect(transitions).toEqual([
      { type: 'BAD_EXIT', at: 4000 },
      { type: 'PRESENCE_LOST', at: 4000 },
    ])
  })
})

describe('stepEngine posture', () => {
  it('does not count a short bad spike', () => {
    const samples = [...series(0, 2000, 1000, GOOD), ...series(2250, 4000, 250, BAD), ...series(4250, 8000, 250, GOOD)]
    const { transitions } = run(samples)
    expect(transitions.filter((t) => t.type === 'BAD_ENTER')).toEqual([])
  })

  it('enters bad posture once, backdated to the onset, with the worst severity seen', () => {
    const { transitions } = run([...series(0, 2000, 1000, GOOD), ...series(3000, 8000, 250, BAD)])
    expect(transitions.filter((t) => t.type === 'BAD_ENTER')).toEqual([
      { type: 'BAD_ENTER', at: 3000, severity: 'SEVERE' },
    ])
  })

  it('stays bad between the exit and entry thresholds', () => {
    const between = { pitch: 6, size: 0.3 }
    expect(postureScore(between.pitch, between.size, BASELINE)).toBeGreaterThanOrEqual(2)
    expect(postureScore(between.pitch, between.size, BASELINE)).toBeLessThan(3)
    const bad = run(series(0, 4000, 250, BAD))
    const { transitions } = run(series(4250, 12_000, 250, between), bad.state)
    expect(transitions).toEqual([])
  })

  it('exits after good posture holds, backdated to when the smoothed score recovered', () => {
    const bad = run(series(0, 4000, 250, BAD))
    const { state, transitions } = run(series(5000, 9000, 250, GOOD), bad.state)
    expect(transitions).toEqual([{ type: 'BAD_EXIT', at: 5500 }])
    expect(state.bad).toBe(false)
  })

  it('does not track usage or posture before calibration', () => {
    const { state, transitions } = run(series(0, 8000, 250, BAD), initialEngineState, null)
    expect(transitions).toEqual([])
    expect(state.present).toBe(true)
  })

  it('starts tracking on the first sample after calibration', () => {
    const uncalibrated = run(series(0, 2000, 1000, GOOD), initialEngineState, null)
    const { transitions } = run([{ at: 3000, face: GOOD }], uncalibrated.state)
    expect(transitions).toEqual([{ type: 'PRESENCE_FOUND', at: 3000 }])
  })

  it('reports no absence for a face that was never tracked', () => {
    const uncalibrated = run(series(0, 2000, 1000, GOOD), initialEngineState, null)
    const { state, transitions } = run(series(3000, 6000, 1000, null), uncalibrated.state, null)
    expect(transitions).toEqual([])
    expect(state.present).toBe(false)
  })

  it('closes bad posture on reset', () => {
    const bad = run(series(0, 4000, 250, BAD))
    expect(resetPosture(bad.state, 4100).transitions).toEqual([{ type: 'BAD_EXIT', at: 4100 }])
  })
})

describe('nextIntervalMs', () => {
  it('samples fast only while a change is pending', () => {
    const idle = run(series(0, 2000, 1000, GOOD))
    const pending = run([{ at: 3000, face: BAD }], idle.state)
    expect(nextIntervalMs(idle.state, 2000)).toBe(TIMING.idleIntervalMs)
    expect(nextIntervalMs(pending.state, 3000)).toBe(TIMING.pendingIntervalMs)
  })

  it('slows down after a long absence', () => {
    const away = run([...series(0, 1000, 1000, GOOD), ...series(2000, 5000, 1000, null)])
    expect(nextIntervalMs(away.state, 30_000)).toBe(TIMING.idleIntervalMs)
    expect(nextIntervalMs(away.state, 70_000)).toBe(TIMING.awayIntervalMs)
  })
})
