import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setupServer } from 'msw/node'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { AppEvent } from '../../shared/events'
import { toKstIso } from '../../shared/time/kst'
import { createApiClient, registerDevice } from '../api/client'
import { createDeviceSession } from '../device'
import { createSender } from '../queue/sender'
import { createHandlers } from './handlers'

const BASE = 'https://api.test'
const DEVICE = '3f2b8c1e-6a4d-4e0b-9b7a-0c1d2e3f4a5b'
const server = setupServer(...createHandlers(BASE))
const secretOf: Record<string, string> = {}

const clientFor = (deviceId: string, deviceSecret = secretOf[deviceId] ?? 'unregistered') =>
  createApiClient(BASE, async () => ({ kind: 'ok', status: 200, body: { deviceId, deviceSecret } }))

const register = async (deviceId: string): Promise<string> => {
  const result = await registerDevice(BASE, deviceId)
  if (result.kind !== 'ok') throw new Error('register failed')
  secretOf[deviceId] = result.body.deviceSecret
  return result.body.deviceSecret
}

beforeAll(async () => {
  server.listen({ onUnhandledRequest: 'error' })
  await register(DEVICE)
})
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
    const api = clientFor(DEVICE)
    await api.postEvents([sessionStart(1)])
    const invalid = { ...sessionStart(3), payload: { pitch: 10 } } as unknown as AppEvent
    const result = await api.postEvents([sessionStart(1), sessionStart(2), invalid])
    expect(result).toMatchObject({
      kind: 'ok',
      body: { accepted: 1, duplicated: 1, rejected: [{ index: 2, eventId: invalid.eventId, code: 'FORBIDDEN_FIELD' }] },
    })
  })

  it('rejects a bad device ID and oversized batches', async () => {
    expect(await clientFor('not-a-uuid').postEvents([sessionStart(1)])).toMatchObject({
      kind: 'error',
      status: 400,
      body: { code: 'DEVICE_ID_INVALID' },
    })
    const many = Array.from({ length: 101 }, (_, i) => sessionStart(100 + i))
    expect(await clientFor(DEVICE).postEvents(many)).toMatchObject({ kind: 'error', status: 413 })
  })

  it('serves an empty summary for a new device', async () => {
    const deviceId = 'aaaaaaaa-0000-4000-8000-000000000000'
    await register(deviceId)
    const result = await clientFor(deviceId).getSummary()
    expect(result).toMatchObject({ kind: 'ok', body: { hasData: false, comment: null } })
  })

  it('issues a secret once per device ID', async () => {
    const deviceId = 'bbbbbbbb-0000-4000-8000-000000000000'
    expect(await registerDevice(BASE, deviceId)).toMatchObject({ kind: 'ok', status: 200 })
    expect(await registerDevice(BASE, deviceId)).toMatchObject({
      kind: 'error',
      status: 409,
      body: { code: 'DEVICE_ALREADY_REGISTERED' },
    })
    expect(await registerDevice(BASE, 'not-a-uuid')).toMatchObject({ status: 400, body: { code: 'DEVICE_ID_INVALID' } })
  })

  it('rejects a missing or wrong secret on both endpoints', async () => {
    const invalid = { kind: 'error', status: 401, body: { code: 'DEVICE_SECRET_INVALID' } }
    const wrong = clientFor(DEVICE, 'wrong')
    expect(await wrong.postEvents([sessionStart(500)])).toMatchObject(invalid)
    expect(await wrong.getSummary()).toMatchObject(invalid)
    const noSecret = await fetch(`${BASE}/api/reports/summary`, { headers: { 'X-Device-Id': DEVICE } })
    expect(noSecret.status).toBe(401)
  })

  it('delivers events queued before registration once the device registers', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pyeobugi-'))
    const device = createDeviceSession(dir, (id) => registerDevice(BASE, id))
    const api = createApiClient(BASE, device.credentials)
    const queue = { saved: [sessionStart(600)], load: () => queue.saved, save: (q: AppEvent[]) => (queue.saved = q) }
    await createSender(queue, api.postEvents).send()
    expect(queue.saved).toEqual([])
    expect(await api.getSummary()).toMatchObject({ kind: 'ok' })
  })

  it('lets the dev mock adopt a device remembered from before a restart', async () => {
    const adoptBase = 'https://adopt.test'
    server.use(...createHandlers(adoptBase, { adoptUnknownDevices: true }))
    const api = createApiClient(adoptBase, async () => ({
      kind: 'ok',
      status: 200,
      body: { deviceId: DEVICE, deviceSecret: 'from-disk' },
    }))
    expect(await api.getSummary()).toMatchObject({ kind: 'ok' })
    const wrong = createApiClient(adoptBase, async () => ({
      kind: 'ok',
      status: 200,
      body: { deviceId: DEVICE, deviceSecret: 'other' },
    }))
    expect(await wrong.getSummary()).toMatchObject({ status: 401 })
  })
})
