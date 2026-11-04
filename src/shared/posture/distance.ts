import type { Baseline } from './score'

export const DISTANCE = { enterRatio: 0.25, exitRatio: 0.15, holdMs: 8000, maxGapMs: 1600 }

export type DistanceState = {
  changedSince: number | null
  lastAt: number | null
  direction: 'CLOSER' | 'FARTHER' | null
  suggested: boolean
}

export const initialDistanceState: DistanceState = {
  changedSince: null, lastAt: null, direction: null, suggested: false,
}

export const stepDistance = (
  state: DistanceState, at: number, size: number | null, baseline: Baseline | null,
): DistanceState => {
  if (!baseline || !Number.isFinite(baseline.size) || baseline.size <= 0
    || size === null || !Number.isFinite(size) || size <= 0) return initialDistanceState
  const delta = size / baseline.size - 1
  const magnitude = Math.abs(delta)
  const direction = delta >= 0 ? 'CLOSER' : 'FARTHER'
  const interrupted = state.lastAt === null || at - state.lastAt > DISTANCE.maxGapMs || at < state.lastAt
  if (magnitude < DISTANCE.exitRatio || (state.direction !== null && state.direction !== direction)) {
    return { ...initialDistanceState, lastAt: at }
  }
  if (state.suggested && !interrupted) return { ...state, lastAt: at }
  if (magnitude < DISTANCE.enterRatio) return { ...initialDistanceState, lastAt: at }
  const changedSince = interrupted ? at : state.changedSince ?? at
  return { changedSince, lastAt: at, direction, suggested: at - changedSince >= DISTANCE.holdMs }
}
