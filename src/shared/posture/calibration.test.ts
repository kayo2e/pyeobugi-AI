import { describe, expect, it } from 'vitest'
import { evaluateCalibration } from './calibration'
import type { Sample } from './engine'

const stable = (): Sample[] => Array.from({ length: 11 }, (_, i) => ({
  at: i * 500, face: { pitch: i === 5 ? 12 : 10, size: 0.3 },
}))

describe('calibration', () => {
  it('waits for the full collection period and saves the median', () => {
    expect(evaluateCalibration(stable().slice(0, 10), 0)).toEqual({ phase: 'collecting', remainingSec: 1 })
    expect(evaluateCalibration(stable(), 0)).toEqual({ phase: 'complete', baseline: { pitch: 10, size: 0.3 } })
  })

  it('rejects head motion and distance changes instead of saving a moving baseline', () => {
    const samples = stable()
    samples[5]!.face!.pitch = 18
    expect(evaluateCalibration(samples, 0).phase).toBe('failed')
    samples[5]!.face = { pitch: 10, size: 0.4 }
    expect(evaluateCalibration(samples, 0).phase).toBe('failed')
  })

  it('rejects missing faces, invalid values and interrupted sampling', () => {
    const missing = stable()
    missing[3]!.face = null
    expect(evaluateCalibration(missing, 0).phase).toBe('failed')
    const invalid = stable()
    invalid[3]!.face!.pitch = Number.NaN
    expect(evaluateCalibration(invalid, 0).phase).toBe('failed')
    expect(evaluateCalibration([stable()[0]!, stable()[10]!], 0).phase).toBe('failed')
    expect(evaluateCalibration(stable().map((s) => ({ ...s, at: s.at + 2000 })), 0).phase).toBe('failed')
  })
})
