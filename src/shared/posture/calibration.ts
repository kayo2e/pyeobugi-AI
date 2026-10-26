import type { FaceSample, Sample } from './engine'
import type { Baseline } from './score'

export const CALIBRATION = {
  durationMs: 5000, minSamples: 6, maxMissing: 2, maxGapMs: 1600, maxPitchRange: 6, maxSizeRange: 0.12,
}

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
  const usable = (s: Sample): s is Sample & { face: FaceSample } => s.face !== null
    && Number.isFinite(s.face.pitch) && Number.isFinite(s.face.size) && s.face.size > 0
  if (samples.some((s, i) => i > 0 && s.at - samples[i - 1]!.at > CALIBRATION.maxGapMs)) return failed
  // Face detectors drop the odd frame even when the user sits still, so a few misses must not fail the attempt
  if (samples.filter((s) => !usable(s)).length > CALIBRATION.maxMissing) return failed
  const last = samples.at(-1)
  if (!last) return { phase: 'collecting', remainingSec: CALIBRATION.durationMs / 1000 }
  if (samples[0]!.at - startedAt > CALIBRATION.maxGapMs) return failed
  const elapsed = last.at - startedAt
  const collecting: CalibrationResult = {
    phase: 'collecting', remainingSec: Math.ceil((CALIBRATION.durationMs - elapsed) / 1000),
  }
  const faces = samples.filter(usable).map((s) => s.face)
  if (faces.length === 0) return collecting
  const pitches = faces.map((f) => f.pitch)
  const sizes = faces.map((f) => f.size)
  const size = median(sizes)
  if (Math.max(...pitches) - Math.min(...pitches) > CALIBRATION.maxPitchRange
    || (Math.max(...sizes) - Math.min(...sizes)) / size > CALIBRATION.maxSizeRange) return failed
  if (elapsed < CALIBRATION.durationMs) return collecting
  if (faces.length < CALIBRATION.minSamples) return failed
  return { phase: 'complete', baseline: { pitch: median(pitches), size } }
}
