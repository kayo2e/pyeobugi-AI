import { BAD_ENTER_SCORE, BAD_EXIT_SCORE, maxSeverity, postureScore, severityOf } from './score'
import type { Baseline, Severity } from './score'

export type FaceSample = { pitch: number; size: number }

export type Sample = { at: number; face: FaceSample | null }

export type Transition =
  | { type: 'PRESENCE_FOUND'; at: number }
  | { type: 'PRESENCE_LOST'; at: number }
  | { type: 'BAD_ENTER'; at: number; severity: Severity }
  | { type: 'BAD_EXIT'; at: number }

export type EngineState = {
  present: boolean
  lastSeenAt: number | null
  lostAt: number | null
  bad: boolean
  pendingSince: number | null
  pendingSeverity: Severity | null
  pitches: number[]
  sizes: number[]
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

export const SMOOTHING_WINDOW = 3

export const initialEngineState: EngineState = {
  present: false,
  lastSeenAt: null,
  lostAt: null,
  bad: false,
  pendingSince: null,
  pendingSeverity: null,
  pitches: [],
  sizes: [],
  pitch: null,
  size: null,
  score: 0,
}

const pushWindow = (values: number[], value: number): number[] => [...values, value].slice(-SMOOTHING_WINDOW)

const mean = (values: number[]): number => values.reduce((sum, v) => sum + v, 0) / values.length

const stepMissing = (state: EngineState, at: number): StepResult => {
  if (!state.present || state.lastSeenAt === null || at - state.lastSeenAt < TIMING.lostAfterMs) {
    return { state, transitions: [] }
  }
  // Absence is dated from the last confirmed face so undetected time is excluded from usage
  const lostAt = state.lastSeenAt
  const transitions: Transition[] = state.bad ? [{ type: 'BAD_EXIT', at: lostAt }] : []
  transitions.push({ type: 'PRESENCE_LOST', at: lostAt })
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
    : { type: 'BAD_EXIT', at: pendingSince }
  return {
    state: { ...state, bad: wantsBad, pendingSince: null, pendingSeverity: null },
    transitions: [transition],
  }
}

export const stepEngine = (state: EngineState, sample: Sample, baseline: Baseline | null): StepResult => {
  if (sample.face === null) return stepMissing(state, sample.at)

  const transitions: Transition[] = state.present ? [] : [{ type: 'PRESENCE_FOUND', at: sample.at }]
  const pitches = pushWindow(state.pitches, sample.face.pitch)
  const sizes = pushWindow(state.sizes, sample.face.size)
  const pitch = mean(pitches)
  const size = mean(sizes)
  const seen: EngineState = {
    ...state,
    present: true,
    lastSeenAt: sample.at,
    lostAt: null,
    pitches,
    sizes,
    pitch,
    size,
  }

  if (baseline === null) return { state: { ...seen, score: 0 }, transitions }

  const score = postureScore(pitch, size, baseline)
  const posture = stepPosture({ ...seen, score }, sample.at, score)
  return { state: posture.state, transitions: [...transitions, ...posture.transitions] }
}

export const resetPosture = (state: EngineState, at: number): StepResult => ({
  state: { ...state, bad: false, pendingSince: null, pendingSeverity: null, score: 0 },
  transitions: state.bad ? [{ type: 'BAD_EXIT', at }] : [],
})

export const nextIntervalMs = (state: EngineState, now: number): number => {
  if (state.pendingSince !== null) return TIMING.pendingIntervalMs
  if (!state.present && state.lostAt !== null && now - state.lostAt >= TIMING.awaySlowdownAfterMs) {
    return TIMING.awayIntervalMs
  }
  return TIMING.idleIntervalMs
}
