import type { Sample } from './engine'
import type { Baseline } from './score'

export const CALIBRATION = { durationMs: 5000, minSamples: 6, maxGapMs: 1600, maxPitchRange: 6, maxSizeRange: 0.12 }

export type CalibrationResult =
  | { phase: 'collecting'; remainingSec: number }
  | { phase: 'failed'; message: string }
  | { phase: 'complete'; baseline: Baseline }

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

export const evaluateCalibration = (samples: Sample[], startedAt: number): CalibrationResult => {
  const failed: CalibrationResult = { phase: 'failed', message: '얼굴을 정면으로 두고 움직임을 줄여 다시 시도해 주세요.' }
  if (samples.some((s, i) => !s.face || !Number.isFinite(s.face.pitch) || !Number.isFinite(s.face.size)
    || s.face.size <= 0 || (i > 0 && s.at - samples[i - 1]!.at > CALIBRATION.maxGapMs))) return failed
  const last = samples.at(-1)
  if (!last) return { phase: 'collecting', remainingSec: CALIBRATION.durationMs / 1000 }
  if (samples[0]!.at - startedAt > CALIBRATION.maxGapMs) return failed
  const pitches = samples.map((s) => s.face!.pitch)
  const sizes = samples.map((s) => s.face!.size)
  const size = median(sizes)
  if (Math.max(...pitches) - Math.min(...pitches) > CALIBRATION.maxPitchRange
    || (Math.max(...sizes) - Math.min(...sizes)) / size > CALIBRATION.maxSizeRange) return failed
  const elapsed = last.at - startedAt
  if (elapsed < CALIBRATION.durationMs) {
    return { phase: 'collecting', remainingSec: Math.ceil((CALIBRATION.durationMs - elapsed) / 1000) }
  }
  if (samples.length < CALIBRATION.minSamples) return failed
  return { phase: 'complete', baseline: { pitch: median(pitches), size } }
}
