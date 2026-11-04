import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { setupServer } from 'msw/node'
import { createApiClient } from '../src/main/api/client'
import { createHandlers } from '../src/main/mock/handlers'
import { applyTransition, initialBuilderState, stop, tick } from '../src/main/usage/segment-builder'
import type { BuilderResult, BuilderState } from '../src/main/usage/segment-builder'
import { toAppEvent } from '../src/main/usage/tracker'
import type { HttpResult } from '../src/shared/api'
import type { AppEvent, EventDraft } from '../src/shared/events'

const BASE = 'https://api.example'
const DEVICE = '3f2b8c1e-6a4d-4e0b-9b7a-0c1d2e3f4a5b'
const SESSION = 'a9a9a9a9-0000-4000-8000-0000000000aa'
const OUT = 'docs/api/examples'

let counter = 0
const eventId = () => `b1c2d3e4-0000-4000-8000-${String(++counter).padStart(12, '0')}`
const stable = (event: AppEvent): AppEvent => ({ ...event, eventId: eventId() })

// Anchor the session to "now" so the mock accepts it (occurredAt must be within -30 days / +5 minutes)
const kstMidnight = (() => {
  const day = 24 * 60 * 60_000
  const offset = 9 * 60 * 60_000
  return Math.floor((Date.now() + offset) / day) * day - offset
})()
const at = (minutesFromMidnight: number, seconds = 0) => kstMidnight + (minutesFromMidnight * 60 + seconds) * 1000
const start = at(-2, 10.4)

const steps: ((s: BuilderState) => BuilderResult)[] = [
  (s) => applyTransition(s, { type: 'PRESENCE_FOUND', at: start }),
  (s) => applyTransition(s, { type: 'BAD_ENTER', at: at(-1, -29.3), severity: 'MODERATE' }),
  (s) => tick(s, at(-1, 0.9)),
  (s) => applyTransition(s, { type: 'BAD_EXIT', at: at(0, 20.2), reason: 'RECOVERED' }),
  (s) => applyTransition(s, { type: 'PRESENCE_LOST', at: at(1, 5.7) }),
  (s) => stop(s, at(1, 30)),
]

const drafts: EventDraft[] = [{ type: 'SESSION_START', payload: {}, occurredAtMs: start - 5000 }]
drafts.push({ type: 'CALIBRATION_COMPLETED', payload: { isRecalibration: false }, occurredAtMs: start - 1000 })
steps.reduce((state, step) => {
  const result = step(state)
  drafts.push(...result.drafts)
  return result.state
}, initialBuilderState)
drafts.push({ type: 'SESSION_END', payload: {}, occurredAtMs: at(1, 31) })
const events = drafts.map((d) => stable(toAppEvent(d, SESSION)))

const write = (name: string, value: unknown) => writeFileSync(join(OUT, name), `${JSON.stringify(value, null, 2)}\n`)

const response = <T>(result: HttpResult<T>) =>
  result.kind === 'network' ? { error: result.message } : { status: result.status, body: result.body }

const main = async () => {
  mkdirSync(OUT, { recursive: true })
  const server = setupServer(...createHandlers(BASE))
  server.listen({ onUnhandledRequest: 'error' })
  const api = createApiClient(BASE, DEVICE)

  write('post-events.request.json', { events })
  write('post-events.response.json', response(await api.postEvents(events)))

  const pomodoro = stable(toAppEvent({ type: 'POMODORO_COMPLETED', payload: {}, occurredAtMs: at(1, 40) }, SESSION))
  const sessionStart = stable(toAppEvent({ type: 'SESSION_START', payload: {}, occurredAtMs: at(1, 41) }, SESSION))
  const withPitch = { ...sessionStart, payload: { pitch: 12.5 } } as unknown as AppEvent
  const mixed = [events[0]!, pomodoro, withPitch]
  write('post-events-mixed.request.json', { events: mixed })
  write('post-events-mixed.response.json', response(await api.postEvents(mixed)))

  const emptyDevice = createApiClient(BASE, 'aaaaaaaa-0000-4000-8000-000000000000')
  write('reports-summary.response.json', response(await api.getSummary()))
  write('reports-summary-empty.response.json', response(await emptyDevice.getSummary()))
  write('error-device-id.response.json', response(await createApiClient(BASE, 'not-a-uuid').postEvents([events[0]!])))
  server.close()
}

void main()
