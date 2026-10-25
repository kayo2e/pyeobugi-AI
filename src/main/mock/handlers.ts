import { http, HttpResponse } from 'msw'
import type { PostEventsResponse, RejectedEvent } from '../../shared/api'
import type { AppEvent } from '../../shared/events'
import { isUuidV4 } from '../device'
import { summarize } from './summary'
import { validateEvent } from './validate'

const MAX_EVENTS = 100
const MAX_BODY_BYTES = 64 * 1024

let traceCounter = 0

const fail = (status: number, code: string, message: string) =>
  HttpResponse.json({ code, message, traceId: `req-${++traceCounter}` }, { status })

export const createHandlers = (baseUrl: string, store = new Map<string, Map<string, AppEvent>>()) => [
  http.post(`${baseUrl}/api/events`, async ({ request }) => {
    const deviceId = request.headers.get('X-Device-Id')
    if (!isUuidV4(deviceId)) return fail(400, 'DEVICE_ID_INVALID', 'X-Device-Id must be a UUID v4')

    const text = await request.text()
    if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) return fail(413, 'PAYLOAD_TOO_LARGE', 'Body over 64KB')
    let body: unknown
    try {
      body = JSON.parse(text)
    } catch {
      return fail(400, 'INVALID_REQUEST', 'Body is not JSON')
    }
    const top = body as { events?: unknown }
    if (typeof body !== 'object' || body === null || Object.keys(body).some((k) => k !== 'events')) {
      return fail(400, 'INVALID_REQUEST', 'Unexpected top-level fields')
    }
    if (!Array.isArray(top.events) || top.events.length === 0) return fail(400, 'INVALID_REQUEST', 'events required')
    if (top.events.length > MAX_EVENTS) return fail(413, 'PAYLOAD_TOO_LARGE', 'Over 100 events')

    const saved = store.get(deviceId) ?? new Map<string, AppEvent>()
    store.set(deviceId, saved)
    const result: PostEventsResponse = { accepted: 0, duplicated: 0, rejected: [] }
    top.events.forEach((raw: unknown, index) => {
      const code = validateEvent(raw, Date.now())
      const eventId = (raw as { eventId?: unknown } | null)?.eventId
      if (code) {
        const rejected: RejectedEvent = { index, code }
        if (isUuidV4(eventId)) rejected.eventId = eventId
        result.rejected.push(rejected)
      } else if (saved.has(eventId as string)) {
        result.duplicated += 1
      } else {
        saved.set(eventId as string, raw as AppEvent)
        result.accepted += 1
      }
    })
    return HttpResponse.json(result)
  }),

  http.get(`${baseUrl}/api/reports/summary`, ({ request }) => {
    const deviceId = request.headers.get('X-Device-Id')
    if (!isUuidV4(deviceId)) return fail(400, 'DEVICE_ID_INVALID', 'X-Device-Id must be a UUID v4')
    const events = [...(store.get(deviceId)?.values() ?? [])]
    return HttpResponse.json(summarize(events, Date.now()), { headers: { 'Cache-Control': 'no-store' } })
  }),
]
