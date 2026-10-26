import { initialEngineState, nextIntervalMs, stepEngine, TIMING } from '../shared/posture/engine'
import type { FaceSample } from '../shared/posture/engine'
import { BAD_ENTER_SCORE, postureScore } from '../shared/posture/score'
import type { Baseline } from '../shared/posture/score'
import { toFaceSample } from '../shared/posture/face-geometry'
import { evaluateReplay } from './metrics'
import type { ReplayPoint, ReplayMetrics } from './metrics'
import type { Recording, RecordingLabel } from '../shared/recording'

export type LabelStats = {
  label: RecordingLabel
  files: number
  samples: number
  detectionRate: number
  invalidFraction: number
  pitchMean: number
  pitchStd: number
  pitchJitter: number
  sizeMean: number
}

export type Separation = {
  against: RecordingLabel
  cohensD: number
  bestThreshold: number
  balancedAccuracy: number
}

export type ReplayStats = ReplayMetrics & {
  label: RecordingLabel
  badFraction: number
  postureBadCount: number
  inferenceHz: number
  durationSec: number
  badSeconds: number
  inferenceCount: number
}

export type EpisodeStats = {
  label: RecordingLabel
  count: number
  medianSec: number
  p90Sec: number
  maxSec: number
  overHold: number
}

export type Report = {
  baselineSource: 'calibrated' | 'upright-mean' | 'mixed'
  labels: LabelStats[]
  separations: Separation[]
  replays: ReplayStats[]
  episodes: EpisodeStats[]
}

type Delta = { pitch: number; size: number }

const mean = (xs: number[]): number => (xs.length === 0 ? Number.NaN : xs.reduce((a, b) => a + b, 0) / xs.length)

const std = (xs: number[]): number => {
  const m = mean(xs)
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)))
}

const faceSample = (r: Recording, i: number): FaceSample | null => {
  const face = r.samples[i]?.face
  if (face && face.keypoints.length >= 6 && r.video.width > 0 && r.video.height > 0) {
    const points = face.keypoints.map(([x, y]) => ({ x: x * r.video.width, y: y * r.video.height }))
    const [rightEye, leftEye, noseTip, , rightEar, leftEar] = points
    return toFaceSample({ rightEye: rightEye!, leftEye: leftEye!, noseTip: noseTip!,
      rightEar: rightEar!, leftEar: leftEar! }, face.box.height)
  }
  return face && face.pitch !== null && face.size !== null
    && Number.isFinite(face.pitch) && Math.abs(face.pitch) < 90
    && Number.isFinite(face.size) && face.size > 0 && face.size <= 1
    ? { pitch: face.pitch, size: face.size } : null
}

const faceSamples = (r: Recording): FaceSample[] =>
  r.samples.flatMap((_, i) => {
    const s = faceSample(r, i)
    return s ? [s] : []
  })

export const resolveBaseline = (recordings: Recording[]): { baseline: Baseline; source: Report['baselineSource'] } => {
  const calibrated = recordings.find((r) => r.baseline !== null)?.baseline
  if (calibrated) return { baseline: calibrated, source: 'calibrated' }
  const upright = recordings.filter((r) => r.label === 'UPRIGHT').flatMap(faceSamples)
  if (upright.length === 0) {
    throw new Error('Missing baseline: include uncalibrated UPRIGHT recordings from the same person/setup')
  }
  const baseline = { pitch: mean(upright.map((s) => s.pitch)), size: mean(upright.map((s) => s.size)) }
  return { baseline, source: 'upright-mean' }
}

const deltas = (r: Recording, baseline: Baseline): Delta[] =>
  faceSamples(r).map((s) => ({ pitch: s.pitch - baseline.pitch, size: s.size - baseline.size }))

const labelStats = (
  label: RecordingLabel, recordings: Recording[], baselineFor: (r: Recording) => Baseline,
): LabelStats => {
  const ds = recordings.flatMap((r) => deltas(r, baselineFor(r)))
  const total = recordings.reduce((n, r) => n + r.samples.length, 0)
  const jitter = recordings.flatMap((r) => {
    const pitches = faceSamples(r).map((s) => s.pitch)
    return pitches.slice(1).map((p, i) => p - pitches[i]!)
  })
  return {
    label,
    files: recordings.length,
    samples: total,
    detectionRate: total === 0 ? 0 : recordings.reduce((n, r) => n + r.samples.filter((s) => s.face).length, 0) / total,
    invalidFraction: total === 0 ? 0 : 1 - ds.length / total,
    pitchMean: mean(ds.map((d) => d.pitch)),
    pitchStd: std(ds.map((d) => d.pitch)),
    pitchJitter: std(jitter),
    sizeMean: mean(ds.map((d) => d.size)),
  }
}

export const separation = (upright: number[], other: number[], against: RecordingLabel): Separation => {
  const pooled = Math.sqrt((std(upright) ** 2 + std(other) ** 2) / 2)
  const cohensD = pooled === 0 ? Number.POSITIVE_INFINITY : (mean(other) - mean(upright)) / pooled
  const candidates = [...new Set([...upright, ...other])].sort((a, b) => a - b)
  let best = { threshold: Number.NaN, accuracy: 0 }
  for (const threshold of candidates) {
    const specificity = upright.filter((x) => x < threshold).length / upright.length
    const sensitivity = other.filter((x) => x >= threshold).length / other.length
    const accuracy = (specificity + sensitivity) / 2
    if (accuracy > best.accuracy) best = { threshold, accuracy }
  }
  return { against, cohensD, bestThreshold: best.threshold, balancedAccuracy: best.accuracy }
}

// Real spacing drifts above intervalMs (timer delay plus inference), so search by recorded time instead of index math
export const nearestIndex = (r: Recording, t: number): number => {
  let lo = 0
  let hi = r.samples.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (r.samples[mid]!.t < t) lo = mid + 1
    else hi = mid
  }
  const prev = r.samples[lo - 1]
  return prev && t - prev.t <= r.samples[lo]!.t - t ? lo - 1 : lo
}

// Replays the engine with its own adaptive schedule, picking the recorded sample nearest to each requested time
export const replay = (r: Recording, baseline: Baseline): Omit<ReplayStats, 'label'> => {
  const points: ReplayPoint[] = []
  let state = initialEngineState
  let t = 0
  let badMs = 0
  let postureBadCount = 0
  let inferences = 0
  const end = r.samples.at(-1)?.t ?? 0
  while (t < end) {
    const face = faceSample(r, nearestIndex(r, t))
    const result = stepEngine(state, { at: t, face }, baseline)
    postureBadCount += result.transitions.filter((x) => x.type === 'BAD_ENTER').length
    const interval = nextIntervalMs(result.state, t)
    points.push({ at: t, until: Math.min(end, t + interval), bad: result.state.bad, valid: face !== null,
      entered: result.transitions.some((x) => x.type === 'BAD_ENTER'),
      exited: face !== null && result.transitions.some((x) => x.type === 'BAD_EXIT' && x.reason === 'RECOVERED') })
    if (result.state.bad) badMs += Math.min(interval, end - t)
    state = result.state
    inferences += 1
    t += interval
  }
  return {
    ...evaluateReplay(r, points, end),
    durationSec: end / 1000,
    badSeconds: badMs / 1000,
    inferenceCount: inferences,
    badFraction: end === 0 ? 0 : badMs / end,
    postureBadCount,
    inferenceHz: end === 0 ? 0 : inferences / (end / 1000),
  }
}

const percentile = (sorted: number[], q: number): number =>
  sorted.length === 0 ? Number.NaN : sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))]!

const median3 = (a: number, b: number, c: number): number => Math.max(Math.min(a, b), Math.min(Math.max(a, b), c))

// Lengths of continuous stretches above the entry score; a centered 3-sample median fills single-frame dips
// without shifting episode edges the way a trailing mean would
export const episodeDurations = (r: Recording, baseline: Baseline): number[] => {
  const scores = r.samples.map((_, i) => {
    const s = faceSample(r, i)
    return s ? postureScore(s.pitch, s.size, baseline) : Number.NEGATIVE_INFINITY
  })
  const durations: number[] = []
  let start: number | null = null
  scores.forEach((score, i) => {
    const above = median3(scores[i - 1] ?? score, score, scores[i + 1] ?? score) >= BAD_ENTER_SCORE
    const t = r.samples[i]!.t
    if (above && start === null) start = t
    if (!above && start !== null) {
      durations.push(t - start)
      start = null
    }
  })
  if (start !== null) durations.push(r.samples.at(-1)!.t + r.intervalMs - start)
  return durations.map((ms) => ms / 1000)
}

const episodeStats = (
  label: RecordingLabel, recordings: Recording[], baselineFor: (r: Recording) => Baseline,
): EpisodeStats => {
  const durations = recordings.flatMap((r) => episodeDurations(r, baselineFor(r))).sort((a, b) => a - b)
  return {
    label,
    count: durations.length,
    medianSec: percentile(durations, 0.5),
    p90Sec: percentile(durations, 0.9),
    maxSec: durations.at(-1) ?? Number.NaN,
    overHold: durations.filter((d) => d * 1000 >= TIMING.enterAfterMs).length,
  }
}

export const analyze = (recordings: Recording[]): Report => {
  const missing = recordings.filter((r) => r.baseline === null)
  const fallback = missing.length ? resolveBaseline(missing).baseline : null
  const baselineFor = (r: Recording): Baseline => r.baseline ?? fallback!
  const source = missing.length === 0 ? 'calibrated'
    : missing.length === recordings.length ? 'upright-mean' : 'mixed'
  const byLabel = new Map<RecordingLabel, Recording[]>()
  recordings.forEach((r) => byLabel.set(r.label, [...(byLabel.get(r.label) ?? []), r]))

  const labels = [...byLabel].map(([label, rs]) => labelStats(label, rs, baselineFor))
  const uprightPitch = (byLabel.get('UPRIGHT') ?? []).flatMap((r) => deltas(r, baselineFor(r)).map((d) => d.pitch))
  const separations = [...byLabel]
    .filter(([label]) => label !== 'UPRIGHT' && uprightPitch.length > 0)
    .map(([label, rs]) =>
      separation(
        uprightPitch,
        rs.flatMap((r) => deltas(r, baselineFor(r)).map((d) => d.pitch)),
        label,
      ),
    )
  const replays = [...byLabel].map(([label, rs]) => {
    const runs = rs.map((r) => replay(r, baselineFor(r)))
    const durationSec = runs.reduce((n, r) => n + r.durationSec, 0)
    const badSeconds = runs.reduce((n, r) => n + r.badSeconds, 0)
    const inferenceCount = runs.reduce((n, r) => n + r.inferenceCount, 0)
    const known = runs.filter((r) => r.falsePositiveCount !== null)
    return {
      label, durationSec, badSeconds, inferenceCount,
      falsePositiveCount: known.length ? known.reduce((n, r) => n + r.falsePositiveCount!, 0) : null,
      falsePositiveSeconds: known.length ? known.reduce((n, r) => n + r.falsePositiveSeconds!, 0) : null,
      detectionDelaysSec: runs.flatMap((r) => r.detectionDelaysSec),
      recoveryDelaysSec: runs.flatMap((r) => r.recoveryDelaysSec),
      missedBadEpisodes: runs.reduce((n, r) => n + r.missedBadEpisodes, 0),
      unresolvedRecoveries: runs.reduce((n, r) => n + r.unresolvedRecoveries, 0),
      invalidFraction: durationSec ? runs.reduce((n, r) => n + r.invalidFraction * r.durationSec, 0) / durationSec : 0,
      badFraction: durationSec ? badSeconds / durationSec : 0,
      postureBadCount: runs.reduce((n, x) => n + x.postureBadCount, 0),
      inferenceHz: durationSec ? inferenceCount / durationSec : 0,
    }
  })
  const episodes = [...byLabel].map(([label, rs]) => episodeStats(label, rs, baselineFor))
  return { baselineSource: source, labels, separations, replays, episodes }
}
