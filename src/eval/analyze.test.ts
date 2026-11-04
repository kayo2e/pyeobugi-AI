import { describe, expect, it } from 'vitest'
import type { Recording, RecordingLabel } from '../shared/recording'
import { analyze, episodeDurations, nearestIndex, replay, resolveBaseline, separation } from './analyze'
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

  it('finds samples by recorded time when spacing drifts from the nominal interval', () => {
    const r = recording('UPRIGHT', 0, 0, 2)
    r.samples.forEach((s, i) => (s.t = i * 230))
    expect([0, 229, 1000, 2070, 99_000].map((t) => nearestIndex(r, t))).toEqual([0, 1, 4, 9, 9])
  })

  it('measures how long each look-down lasts', () => {
    const r = recording('NOTE_TAKING', 0, 0, 20)
    r.samples.forEach((s, i) => {
      const t = i * 200
      if (s.face) s.face.pitch = (t >= 5000 && t < 7000) || (t >= 12_000 && t < 18_000) ? 20 : 0
    })
    expect(episodeDurations(r, { pitch: 0, size: 0.3 })).toEqual([2, 6])
  })

  it('reports detection rate and noise per label', () => {
    const report = analyze([recording('UPRIGHT', 0, 1), recording('FORWARD_HEAD', 15, 1, 30, 7)])
    const upright = report.labels.find((l) => l.label === 'UPRIGHT')!
    expect(upright.detectionRate).toBeCloseTo(0.98)
    expect(upright.pitchStd).toBeGreaterThan(0.3)
    expect(report.separations[0]).toMatchObject({ against: 'FORWARD_HEAD', balancedAccuracy: 1 })
    expect(formatReport(report)).toContain('| 거북목(머리 내밀기) |')
  })
})

describe('per-recording evaluation', () => {
  it('keeps differently calibrated upright recordings aligned independent of file order', () => {
    const a = { ...recording('UPRIGHT', 5, 0), baseline: { pitch: 5, size: 0.3 } }
    const b = { ...recording('UPRIGHT', 25, 0), baseline: { pitch: 25, size: 0.3 } }
    for (const rs of [[a, b], [b, a]]) {
      const report = analyze(rs)
      expect(report.labels[0]!.pitchMean).toBe(0)
      expect(report.replays[0]!.badFraction).toBe(0)
    }
  })

  it('uses an uncalibrated upright fallback only for records without a baseline', () => {
    const a = recording('UPRIGHT', 5, 0)
    const b = { ...recording('UPRIGHT', 25, 0), baseline: { pitch: 25, size: 0.3 } }
    expect(analyze([a, b])).toMatchObject({ baselineSource: 'mixed', labels: [{ pitchMean: 0 }] })
    expect(() => analyze([b, recording('FORWARD_HEAD', 15, 0)])).toThrow()
  })

  it('distinguishes detected faces from usable posture samples', () => {
    const r = { ...recording('UPRIGHT', 0, 0), baseline: { pitch: 0, size: 0.3 } }
    r.samples.forEach((s) => { if (s.face) s.face.pitch = 90 })
    const report = analyze([r])
    expect(report.labels[0]!.detectionRate).toBeGreaterThan(0.9)
    expect(report.labels[0]!.invalidFraction).toBe(1)
    expect(report.replays[0]!.invalidFraction).toBe(1)
  })

  it('weights replay coverage by duration rather than averaging short and long clips equally', () => {
    const baseline = { pitch: 0, size: 0.3 }
    const a = { ...recording('UPRIGHT', 0, 0, 10), baseline }
    const b = { ...recording('UPRIGHT', 20, 0, 30), baseline }
    const ar = replay(a, baseline)
    const br = replay(b, baseline)
    expect(analyze([a, b]).replays[0]!.badFraction)
      .toBeCloseTo((ar.badSeconds + br.badSeconds) / (ar.durationSec + br.durationSec))
  })

  it('measures detection at decision time and counts false alarms in upright clips', () => {
    const baseline = { pitch: 0, size: 0.3 }
    const bad = replay(recording('FORWARD_HEAD', 20, 0), baseline)
    expect(bad.detectionDelaysSec).toEqual([3])
    expect(bad.missedBadEpisodes).toBe(0)
    const upright = replay(recording('UPRIGHT', 20, 0), baseline)
    expect(upright.falsePositiveCount).toBe(1)
    expect(upright.falsePositiveSeconds).toBeGreaterThan(20)
    expect(upright.recoveryDelaysSec).toEqual([])
  })

  it('requires annotations to score note taking and measures recovery without backdating', () => {
    const r = recording('NOTE_TAKING', 20, 0, 20)
    const baseline = { pitch: 0, size: 0.3 }
    expect(replay(r, baseline).falsePositiveCount).toBeNull()
    r.samples.forEach((s) => { if (s.face && s.t >= 8000) s.face.pitch = 0 })
    r.groundTruth = [
      { fromMs: 0, toMs: 8000, posture: 'BAD' },
      { fromMs: 8000, toMs: 20_000, posture: 'GOOD' },
    ]
    const result = replay(r, baseline)
    expect(result.detectionDelaysSec).toEqual([3])
    expect(result.recoveryDelaysSec[0]).toBeGreaterThanOrEqual(2)
    expect(result.recoveryDelaysSec[0]).toBeLessThan(5)
    expect(result.unresolvedRecoveries).toBe(0)
  })

  it('does not count absence as recovery and reports missed bad episodes', () => {
    const r = recording('NOTE_TAKING', 20, 0, 20)
    r.samples.forEach((s) => { if (s.t >= 8000) s.face = null })
    r.groundTruth = [
      { fromMs: 0, toMs: 8000, posture: 'BAD' },
      { fromMs: 8000, toMs: 20_000, posture: 'GOOD' },
    ]
    const result = replay(r, { pitch: 0, size: 0.3 })
    expect(result.recoveryDelaysSec).toEqual([])
    expect(result.unresolvedRecoveries).toBe(1)
    expect(replay(recording('FORWARD_HEAD', 0, 0), { pitch: 0, size: 0.3 }).missedBadEpisodes).toBe(1)
  })

  it('rejects overlapping truth annotations', () => {
    const r = recording('NOTE_TAKING', 0, 0)
    r.groundTruth = [
      { fromMs: 0, toMs: 5000, posture: 'BAD' },
      { fromMs: 4000, toMs: 9000, posture: 'GOOD' },
    ]
    expect(() => replay(r, { pitch: 0, size: 0.3 })).toThrow('Invalid groundTruth')
  })
})

describe('recorded geometry replay', () => {
  it('reapplies current geometry checks to old recordings with raw keypoints', () => {
    const r = { ...recording('UPRIGHT', 0, 0), baseline: { pitch: 0, size: 0.3 } }
    r.samples.forEach((s) => {
      if (s.face) s.face.keypoints = [[0.4, 0.4], [0.41, 0.4], [0.405, 0.45],
        [0.405, 0.5], [0.3, 0.4], [0.5, 0.4]]
    })
    expect(analyze([r]).labels[0]!.invalidFraction).toBe(1)
  })
})
