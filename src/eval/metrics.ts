import type { PostureTruth, Recording } from '../shared/recording'

export type ReplayPoint = {
  at: number; until: number; bad: boolean; valid: boolean; entered: boolean; exited: boolean
}

export type ReplayMetrics = {
  falsePositiveCount: number | null
  falsePositiveSeconds: number | null
  detectionDelaysSec: number[]
  recoveryDelaysSec: number[]
  missedBadEpisodes: number
  unresolvedRecoveries: number
  invalidFraction: number
}

const truthFor = (r: Recording, end: number): PostureTruth[] => {
  if (r.groundTruth !== undefined) {
    r.groundTruth.forEach((s, i) => {
      const previous = r.groundTruth![i - 1]
      if (!Number.isFinite(s.fromMs) || !Number.isFinite(s.toMs) || s.fromMs < 0 || s.toMs <= s.fromMs
        || s.toMs > r.durationMs || (previous && previous.toMs > s.fromMs)
        || !['GOOD', 'BAD'].includes(s.posture)) throw new Error('Invalid groundTruth intervals')
    })
    // Adjacent annotations of the same posture describe a single episode.
    return r.groundTruth.reduce<PostureTruth[]>((out, s) => {
      const previous = out.at(-1)
      if (previous?.posture === s.posture && previous.toMs === s.fromMs) previous.toMs = s.toMs
      else out.push({ ...s })
      return out
    }, []).filter((s) => s.fromMs < end).map((s) => ({ ...s, toMs: Math.min(s.toMs, end) }))
  }
  if (r.label === 'NOTE_TAKING' || end === 0) return []
  return [{ fromMs: 0, toMs: end, posture: r.label === 'UPRIGHT' ? 'GOOD' : 'BAD' }]
}

export const evaluateReplay = (r: Recording, points: ReplayPoint[], end: number): ReplayMetrics => {
  const truth = truthFor(r, end)
  const good = truth.filter((s) => s.posture === 'GOOD')
  const bad = truth.filter((s) => s.posture === 'BAD')
  const overlap = (p: ReplayPoint, s: PostureTruth) => Math.max(0, Math.min(p.until, s.toMs) - Math.max(p.at, s.fromMs))
  const detectionDelaysSec: number[] = []
  const recoveryDelaysSec: number[] = []
  let missedBadEpisodes = 0
  let unresolvedRecoveries = 0
  for (const s of bad) {
    const p = points.find((p) => p.valid && p.bad && overlap(p, s) > 0)
    if (p) detectionDelaysSec.push(Math.max(0, p.at - s.fromMs) / 1000)
    else missedBadEpisodes += 1
  }
  for (let i = 1; i < truth.length; i += 1) {
    const s = truth[i]!
    const previous = truth[i - 1]!
    if (s.posture !== 'GOOD' || previous.posture !== 'BAD' || previous.toMs !== s.fromMs) continue
    const before = points.find((p) => p.at < s.fromMs && p.until >= s.fromMs)
    // Recovery delay is meaningful only if the engine was still bad at the annotated recovery.
    if (!before?.bad) continue
    const p = points.find((p) => p.exited && p.at >= s.fromMs && p.at < s.toMs)
    if (p) recoveryDelaysSec.push((p.at - s.fromMs) / 1000)
    else unresolvedRecoveries += 1
  }
  return {
    falsePositiveCount: good.length ? points.filter((p) => p.entered
      && good.some((s) => p.at >= s.fromMs && p.at < s.toMs)).length : null,
    falsePositiveSeconds: good.length ? good.reduce((sum, s) => sum
      + points.reduce((n, p) => n + (p.bad ? overlap(p, s) : 0), 0), 0) / 1000 : null,
    detectionDelaysSec, recoveryDelaysSec, missedBadEpisodes, unresolvedRecoveries,
    invalidFraction: end ? points.reduce((n, p) => n + (p.valid ? 0 : p.until - p.at), 0) / end : 0,
  }
}
