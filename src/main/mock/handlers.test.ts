import { setupServer } from 'msw/node'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { AppEvent } from '../../shared/events'
import { toKstIso } from '../../shared/time/kst'
import { createApiClient } from '../api/client'
import { createHandlers } from './handlers'

const BASE = 'https://api.test'
const DEVICE = '3f2b8c1e-6a4d-4e0b-9b7a-0c1d2e3f4a5b'
const server = setupServer(...createHandlers(BASE))

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterAll(() => server.close())

const sessionStart = (n: number): AppEvent => ({
  type: 'SESSION_START',
  payload: {},
  eventId: `b1c2d3e4-0000-4000-8000-${String(n).padStart(12, '0')}`,
  sessionId: 'a9a9a9a9-0000-4000-8000-0000000000aa',
  occurredAt: toKstIso(Date.now()),
})

describe('mock API', () => {
  it('counts accepted, duplicated and rejected events with request indexes', async () => {
    const api = createApiClient(BASE, DEVICE)
    await api.postEvents([sessionStart(1)])
    const invalid = { ...sessionStart(3), payload: { pitch: 10 } } as unknown as AppEvent
    const result = await api.postEvents([sessionStart(1), sessionStart(2), invalid])
    expect(result).toMatchObject({
      kind: 'ok',
      body: { accepted: 1, duplicated: 1, rejected: [{ index: 2, eventId: invalid.eventId, code: 'FORBIDDEN_FIELD' }] },
    })
  })

  it('rejects a bad device ID and oversized batches', async () => {
    expect(await createApiClient(BASE, 'not-a-uuid').postEvents([sessionStart(1)])).toMatchObject({
      kind: 'error',
      status: 400,
      body: { code: 'DEVICE_ID_INVALID' },
    })
    const many = Array.from({ length: 101 }, (_, i) => sessionStart(100 + i))
    expect(await createApiClient(BASE, DEVICE).postEvents(many)).toMatchObject({ kind: 'error', status: 413 })
  })

  it('serves an empty summary for a new device', async () => {
    const result = await createApiClient(BASE, 'aaaaaaaa-0000-4000-8000-000000000000').getSummary()
    expect(result).toMatchObject({ kind: 'ok', body: { hasData: false, comment: null } })
  })
})
