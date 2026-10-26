import { describe, expect, it } from 'vitest'
import { initialDistanceState, stepDistance } from './distance'
import type { DistanceState } from './distance'

const baseline = { pitch: 0, size: 0.3 }
const run = (size: number, end = 8000): DistanceState => {
  let state = initialDistanceState
  for (let t = 0; t <= end; t += 1000) state = stepDistance(state, t, size, baseline)
  return state
}

describe('distance change suggestion', () => {
  it('waits for a sustained change in either direction', () => {
    expect(run(0.4, 7000).suggested).toBe(false)
    expect(run(0.4)).toMatchObject({ suggested: true, direction: 'CLOSER' })
    expect(run(0.2)).toMatchObject({ suggested: true, direction: 'FARTHER' })
    expect(run(0.33).suggested).toBe(false)
  })

  it('uses hysteresis to keep a visible suggestion stable and clears it near baseline', () => {
    const changed = run(0.4)
    const nearThreshold = stepDistance(changed, 9000, 0.36, baseline)
    expect(nearThreshold.suggested).toBe(true)
    expect(stepDistance(nearThreshold, 10_000, 0.32, baseline).suggested).toBe(false)
  })

  it('does not accumulate missing time or changes in opposite directions', () => {
    const pending = run(0.4, 7000)
    expect(stepDistance(pending, 8000, null, baseline)).toEqual(initialDistanceState)
    expect(stepDistance(pending, 10_000, 0.4, baseline).suggested).toBe(false)
    expect(stepDistance(pending, 8000, 0.2, baseline).suggested).toBe(false)
  })

  it('clears after recalibration without altering the baseline automatically', () => {
    const changed = run(0.4)
    expect(stepDistance(changed, 9000, 0.4, { pitch: 0, size: 0.4 }).suggested).toBe(false)
    expect(baseline.size).toBe(0.3)
    expect(stepDistance(changed, 9000, 0.4, null)).toEqual(initialDistanceState)
  })
})
