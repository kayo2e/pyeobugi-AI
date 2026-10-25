import { randomUUID } from 'node:crypto'
import type { AppEvent, EventBody, EventDraft } from '../../shared/events'
import type { Transition } from '../../shared/posture/engine'
import { toKstIso } from '../../shared/time/kst'
import { applyTransition, flush, initialBuilderState, stop, tick } from './segment-builder'
import type { BuilderResult, BuilderState } from './segment-builder'

const TICK_MS = 1000

export const toAppEvent = (draft: EventDraft, sessionId: string): AppEvent => {
  const { occurredAtMs, ...body } = draft
  return { ...body, eventId: randomUUID(), sessionId, occurredAt: toKstIso(occurredAtMs) } as AppEvent
}

export const createUsageTracker = (sessionId: string, emit: (event: AppEvent) => void) => {
  let state: BuilderState = initialBuilderState
  let timer: NodeJS.Timeout | null = null

  const commit = (result: BuilderResult) => {
    state = result.state
    result.drafts.forEach((draft) => emit(toAppEvent(draft, sessionId)))
  }

  return {
    start: () => {
      timer ??= setInterval(() => commit(tick(state, Date.now())), TICK_MS)
    },
    transitions: (transitions: Transition[]) => transitions.forEach((t) => commit(applyTransition(state, t))),
    flush: (now = Date.now()) => commit(flush(state, now)),
    stop: (now = Date.now()) => {
      if (timer) clearInterval(timer)
      timer = null
      commit(stop(state, now))
    },
    record: (body: EventBody, now = Date.now()) =>
      emit(toAppEvent({ ...body, occurredAtMs: now } as EventDraft, sessionId)),
  }
}
