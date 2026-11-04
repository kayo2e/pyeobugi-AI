import { BAD_ENTER_SCORE, BAD_EXIT_SCORE, maxSeverity, postureScore, severityOf } from './score'
import type { Baseline, Severity } from './score'

export type FaceSample = { pitch: number; size: number }

export type Sample = { at: number; face: FaceSample | null }

export type ExitReason = 'RECOVERED' | 'FACE_LOST' | 'RECALIBRATED'

export type Transition =
  | { type: 'PRESENCE_FOUND'; at: number }
  | { type: 'PRESENCE_LOST'; at: number }
  | { type: 'BAD_ENTER'; at: number; severity: Severity }
  | { type: 'BAD_EXIT'; at: number; reason: ExitReason }

export type EngineState = {
  present: boolean
  tracking: boolean
  lastSeenAt: number | null
  lostAt: number | null
  bad: boolean
  pendingSince: number | null
  pendingSeverity: Severity | null
  badSince: number | null
  pitch: number | null
  size: number | null
  score: number
}

export type StepResult = { state: EngineState; transitions: Transition[] }

export const TIMING = {
  lostAfterMs: 3000,
  enterAfterMs: 3000,
  exitAfterMs: 2000,
  idleIntervalMs: 1000,
  pendingIntervalMs: 250,
  awayIntervalMs: 3000,
  awaySlowdownAfterMs: 60_000,
}

export const SMOOTHING_TIME_MS = 1000

export const smoothSignal = (previous: number | null, value: number, elapsedMs: number): number => {
  if (previous === null) return value
  const alpha = -Math.expm1(-Math.max(0, elapsedMs) / SMOOTHING_TIME_MS)
  return previous + alpha * (value - previous)
}

export const initialEngineState: EngineState = {
  present: false,
  tracking: false,
  lastSeenAt: null,
  lostAt: null,
  bad: false,
  pendingSince: null,
  pendingSeverity: null,
  badSince: null,
  pitch: null,
  size: null,
  score: 0,
}

const stepMissing = (state: EngineState, at: number): StepResult => {
  if (!state.present || state.lastSeenAt === null || at - state.lastSeenAt < TIMING.lostAfterMs) {
    return { state, transitions: [] }
  }
  // Absence is dated from the last confirmed face so undetected time is excluded from usage
  const lostAt = state.lastSeenAt
  const transitions: Transition[] = state.bad ? [{ type: 'BAD_EXIT', at: lostAt, reason: 'FACE_LOST' }] : []
  if (state.tracking) transitions.push({ type: 'PRESENCE_LOST', at: lostAt })
  return { state: { ...initialEngineState, lostAt }, transitions }
}

const stepPosture = (state: EngineState, at: number, score: number): StepResult => {
  const wantsBad = state.bad ? score >= BAD_EXIT_SCORE : score >= BAD_ENTER_SCORE
  if (wantsBad === state.bad) return { state: { ...state, pendingSince: null, pendingSeverity: null }, transitions: [] }

  const pendingSince = state.pendingSince ?? at
  const pendingSeverity = wantsBad ? maxSeverity(state.pendingSeverity, severityOf(score)) : null
  const holdMs = wantsBad ? TIMING.enterAfterMs : TIMING.exitAfterMs
  if (at - pendingSince < holdMs) return { state: { ...state, pendingSince, pendingSeverity }, transitions: [] }

  // Transitions are backdated to when the change started, so bad-posture time is not cut short by the hold
  const transition: Transition = wantsBad
    ? { type: 'BAD_ENTER', at: pendingSince, severity: pendingSeverity ?? severityOf(score) }
    : { type: 'BAD_EXIT', at: pendingSince, reason: 'RECOVERED' }
  return {
    state: { ...state, bad: wantsBad, badSince: wantsBad ? pendingSince : null,
      pendingSince: null, pendingSeverity: null },
    transitions: [transition],
  }
}

export const stepEngine = (state: EngineState, sample: Sample, baseline: Baseline | null): StepResult => {
  if (sample.face === null) return stepMissing(state, sample.at)

  const elapsedMs = state.lastSeenAt === null ? 0 : sample.at - state.lastSeenAt
  const stale = elapsedMs >= TIMING.lostAfterMs
  const pitch = smoothSignal(stale ? null : state.pitch, sample.face.pitch, elapsedMs)
  const size = smoothSignal(stale ? null : state.size, sample.face.size, elapsedMs)
  const seen: EngineState = {
    ...state,
    present: true,
    lastSeenAt: sample.at,
    lostAt: null,
    pendingSince: stale ? null : state.pendingSince,
    pendingSeverity: stale ? null : state.pendingSeverity,
    pitch,
    size,
  }

  if (baseline === null) return { state: { ...seen, score: 0 }, transitions: [] }

  // Usage is only tracked once a baseline exists; uncalibrated time would count as perfect posture
  const transitions: Transition[] = state.tracking ? [] : [{ type: 'PRESENCE_FOUND', at: sample.at }]
  const score = postureScore(pitch, size, baseline)
  const posture = stepPosture({ ...seen, tracking: true, score }, sample.at, score)
  return { state: posture.state, transitions: [...transitions, ...posture.transitions] }
}

export const resetPosture = (state: EngineState, at: number): StepResult => ({
  state: { ...state, bad: false, badSince: null, pendingSince: null, pendingSeverity: null,
    pitch: null, size: null, score: 0 },
  transitions: state.bad ? [{ type: 'BAD_EXIT', at, reason: 'RECALIBRATED' }] : [],
})

export const nextIntervalMs = (state: EngineState, now: number): number => {
  if (state.pendingSince !== null) return TIMING.pendingIntervalMs
  if (!state.present && state.lostAt !== null && now - state.lostAt >= TIMING.awaySlowdownAfterMs) {
    return TIMING.awayIntervalMs
  }
  return TIMING.idleIntervalMs
}
