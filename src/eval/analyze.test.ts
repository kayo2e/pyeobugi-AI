import { describe, expect, it } from 'vitest'
import type { Recording, RecordingLabel } from '../shared/recording'
import { analyze, replay, resolveBaseline, separation } from './analyze'
import { formatReport } from './format'

const seeded = (seed: number) => () => {
  seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31
  return seed / 2 ** 31
}

const recording = (label: RecordingLabel, pitch: number, noise: number, seconds = 30, seed = 1): Recording => {
  const random = seeded(seed)
  return {
    version: 1,
    label,
    startedAt: '2026-10-25T20:00:00+09:00',
    durationMs: seconds * 1000,
    intervalMs: 200,
    video: { width: 320, height: 240 },
    baseline: null,
    samples: Array.from({ length: seconds * 5 }, (_, i) => ({
      t: i * 200,
      face:
        i % 50 === 49
          ? null
          : {
              box: { x: 0.3, y: 0.2, width: 0.4, height: 0.5 },
              keypoints: [],
              pitch: pitch + (random() - 0.5) * 2 * noise,
              size: 0.3,
            },
    })),
  }
}

describe('analyze', () => {
  it('falls back to the mean of upright samples without a calibrated baseline', () => {
    const { baseline, source } = resolveBaseline([recording('UPRIGHT', 10, 0)])
    expect(source).toBe('upright-mean')
    expect(baseline.pitch).toBeCloseTo(10)
  })

  it('prefers the baseline calibrated in the app', () => {
    const calibrated = { ...recording('FORWARD_HEAD', 20, 0), baseline: { pitch: 5, size: 0.3 } }
    expect(resolveBaseline([recording('UPRIGHT', 10, 0), calibrated])).toEqual({
      baseline: { pitch: 5, size: 0.3 },
      source: 'calibrated',
    })
  })

  it('finds a perfect threshold for well separated distributions', () => {
    const s = separation([0, 1, 2], [10, 11, 12], 'FORWARD_HEAD')
    expect(s.balancedAccuracy).toBe(1)
    expect(s.bestThreshold).toBe(10)
    expect(s.cohensD).toBeGreaterThan(5)
  })

  it('keeps steady upright posture good and sustained forward head bad in replay', () => {
    const baseline = { pitch: 0, size: 0.3 }
    const upright = replay(recording('UPRIGHT', 0, 1), baseline)
    const forward = replay(recording('FORWARD_HEAD', 15, 1), baseline)
    expect(upright).toMatchObject({ badFraction: 0, postureBadCount: 0 })
    expect(forward.postureBadCount).toBe(1)
    expect(forward.badFraction).toBeGreaterThan(0.8)
    expect(upright.inferenceHz).toBeCloseTo(1, 0)
  })

  it('reports detection rate and noise per label', () => {
    const report = analyze([recording('UPRIGHT', 0, 1), recording('FORWARD_HEAD', 15, 1, 30, 7)])
    const upright = report.labels.find((l) => l.label === 'UPRIGHT')!
    expect(upright.detectionRate).toBeCloseTo(0.98)
    expect(upright.pitchStd).toBeGreaterThan(0.3)
    expect(report.separations[0]).toMatchObject({ against: 'FORWARD_HEAD', balancedAccuracy: 1 })
    expect(formatReport(report)).toContain('| 거북목 |')
  })
})
