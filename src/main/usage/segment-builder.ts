import type { EventDraft } from '../../shared/events'
import type { Transition } from '../../shared/posture/engine'
import { floorToSecondMs, nextKstMidnightMs, toKstIso } from '../../shared/time/kst'

export const SEGMENT_MS = 60_000

type OpenSegment = { startMs: number; badMs: number }

export type BuilderState = { segment: OpenSegment | null; badSince: number | null }

export type BuilderResult = { state: BuilderState; drafts: EventDraft[] }

export const initialBuilderState: BuilderState = { segment: null, badSince: null }

// Bad time before the segment start was already counted (or lost) in the previous segment
const ongoingBadMs = (state: BuilderState, segment: OpenSegment, untilMs: number): number =>
  state.badSince === null ? 0 : Math.max(0, untilMs - Math.max(state.badSince, segment.startMs))

const closeSegment = (state: BuilderState, atMs: number): BuilderResult => {
  const { segment } = state
  if (segment === null) return { state, drafts: [] }

  const endMs = Math.max(segment.startMs, floorToSecondMs(atMs))
  const durationSec = (endMs - segment.startMs) / 1000
  const closed: BuilderState = { ...state, segment: null }
  if (durationSec === 0) return { state: closed, drafts: [] }

  const badMs = segment.badMs + ongoingBadMs(state, segment, endMs)
  return {
    state: closed,
    drafts: [
      {
        type: 'USAGE_SEGMENT',
        occurredAtMs: endMs,
        payload: {
          startedAt: toKstIso(segment.startMs),
          endedAt: toKstIso(endMs),
          durationSec,
          badDurationSec: Math.min(Math.round(badMs / 1000), durationSec),
        },
      },
    ],
  }
}

const openSegment = (state: BuilderState, atMs: number): BuilderState => ({
  ...state,
  segment: { startMs: floorToSecondMs(atMs), badMs: 0 },
})

const applyRolled = (state: BuilderState, transition: Transition): BuilderResult => {
  switch (transition.type) {
    case 'PRESENCE_FOUND':
      return { state: state.segment ? state : openSegment(state, transition.at), drafts: [] }
    case 'PRESENCE_LOST': {
      const closed = closeSegment(state, transition.at)
      return { state: { ...closed.state, badSince: null }, drafts: closed.drafts }
    }
    case 'BAD_ENTER':
      return {
        state: { ...state, badSince: transition.at },
        drafts: [{ type: 'POSTURE_BAD', occurredAtMs: transition.at, payload: { severity: transition.severity } }],
      }
    case 'BAD_EXIT': {
      if (state.segment === null) return { state: { ...state, badSince: null }, drafts: [] }
      const badMs = state.segment.badMs + ongoingBadMs(state, state.segment, transition.at)
      return { state: { segment: { ...state.segment, badMs }, badSince: null }, drafts: [] }
    }
  }
}

const boundaryOf = (segment: OpenSegment): number =>
  Math.min(segment.startMs + SEGMENT_MS, nextKstMidnightMs(segment.startMs))

export const tick = (state: BuilderState, nowMs: number): BuilderResult => {
  let current = state
  const drafts: EventDraft[] = []
  while (current.segment !== null && nowMs >= boundaryOf(current.segment)) {
    const boundary = boundaryOf(current.segment)
    const closed = closeSegment(current, boundary)
    drafts.push(...closed.drafts)
    current = openSegment(closed.state, boundary)
  }
  return { state: current, drafts }
}

export const applyTransition = (state: BuilderState, transition: Transition): BuilderResult => {
  // Roll minute boundaries first so a late transition does not pile its time into an older segment
  const rolled = tick(state, transition.at)
  const applied = applyRolled(rolled.state, transition)
  return { state: applied.state, drafts: [...rolled.drafts, ...applied.drafts] }
}

export const flush = (state: BuilderState, nowMs: number): BuilderResult => {
  const rolled = tick(state, nowMs)
  if (rolled.state.segment === null) return rolled
  const closed = closeSegment(rolled.state, nowMs)
  return { state: openSegment(closed.state, nowMs), drafts: [...rolled.drafts, ...closed.drafts] }
}

export const stop = (state: BuilderState, nowMs: number): BuilderResult => {
  const rolled = tick(state, nowMs)
  const closed = closeSegment(rolled.state, nowMs)
  return { state: initialBuilderState, drafts: [...rolled.drafts, ...closed.drafts] }
}
