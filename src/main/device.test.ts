import { chmodSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { HttpResult, RegisterDeviceResponse } from '../shared/api'
import { createDeviceSession, isUuidV4, loadOrCreateDevice } from './device'

const tempDir = () => mkdtempSync(join(tmpdir(), 'pyeobugi-'))
const stored = (dir: string) => JSON.parse(readFileSync(join(dir, 'device.json'), 'utf8'))
const issued = (deviceSecret: string): HttpResult<RegisterDeviceResponse> => ({
  kind: 'ok',
  status: 200,
  body: { deviceSecret },
})
const alreadyRegistered: HttpResult<RegisterDeviceResponse> = {
  kind: 'error',
  status: 409,
  body: { code: 'DEVICE_ALREADY_REGISTERED', message: '', traceId: 't' },
  retryAfterSec: null,
}

describe('loadOrCreateDevice', () => {
  it('creates a missing user data directory and keeps the ID stable', () => {
    const dir = join(tempDir(), 'not-yet-created')
    const { deviceId } = loadOrCreateDevice(dir)
    expect(isUuidV4(deviceId)).toBe(true)
    expect(stored(dir)).toEqual({ deviceId, deviceSecret: null })
    expect(loadOrCreateDevice(dir).deviceId).toBe(deviceId)
  })

  it('replaces a corrupt file but never one it failed to read', () => {
    const corrupt = tempDir()
    writeFileSync(join(corrupt, 'device.json'), '{"deviceId":')
    expect(isUuidV4(loadOrCreateDevice(corrupt).deviceId)).toBe(true)
    const unreadable = tempDir()
    mkdirSync(join(unreadable, 'device.json'))
    expect(() => loadOrCreateDevice(unreadable)).toThrow()
  })
})

describe('createDeviceSession', () => {
  it('registers once, persists the secret privately and reuses it on the next launch', async () => {
    const dir = tempDir()
    const register = vi.fn(async () => issued('secret'))
    const first = await createDeviceSession(dir, register).credentials()
    const { deviceId } = stored(dir)
    expect(first).toEqual({ kind: 'ok', status: 200, body: { deviceId, deviceSecret: 'secret' } })
    expect(stored(dir)).toEqual({ deviceId, deviceSecret: 'secret' })
    if (process.platform !== 'win32') expect(statSync(join(dir, 'device.json')).mode & 0o777).toBe(0o600)

    const next = await createDeviceSession(dir, register).credentials()
    expect(next).toMatchObject({ kind: 'ok', body: { deviceId, deviceSecret: 'secret' } })
    expect(register).toHaveBeenCalledTimes(1)
  })

  it('registers an existing install under its current device ID', async () => {
    const dir = tempDir()
    const deviceId = '3f2b8c1e-6a4d-4e0b-9b7a-0c1d2e3f4a5b'
    writeFileSync(join(dir, 'device.json'), JSON.stringify({ deviceId }))
    const register = vi.fn(async () => issued('secret'))
    await createDeviceSession(dir, register).credentials()
    expect(register).toHaveBeenCalledWith(deviceId)
    expect(stored(dir)).toEqual({ deviceId, deviceSecret: 'secret' })
  })

  it('shares one registration between concurrent callers', async () => {
    const register = vi.fn(async () => issued('secret'))
    const session = createDeviceSession(tempDir(), register)
    await Promise.all([session.credentials(), session.credentials()])
    expect(register).toHaveBeenCalledTimes(1)
  })

  it('moves to a new device ID when the old one is already registered', async () => {
    const dir = tempDir()
    const lostId = loadOrCreateDevice(dir).deviceId
    const register = vi.fn(async (id: string) => (id === lostId ? alreadyRegistered : issued('fresh')))
    const result = await createDeviceSession(dir, register).credentials()
    const { deviceId, deviceSecret } = stored(dir)
    expect(deviceId).not.toBe(lostId)
    expect(isUuidV4(deviceId)).toBe(true)
    expect(deviceSecret).toBe('fresh')
    expect(result).toMatchObject({ kind: 'ok', body: { deviceId, deviceSecret: 'fresh' } })
  })

  it('does not keep generating IDs when every registration conflicts', async () => {
    const register = vi.fn(async () => alreadyRegistered)
    const result = await createDeviceSession(tempDir(), register).credentials()
    expect(result).toMatchObject({ kind: 'error', status: 409 })
    expect(register).toHaveBeenCalledTimes(2)
  })

  it('replaces the device ID at most once across retries', async () => {
    const dir = tempDir()
    const register = vi.fn(async (_id: string) => alreadyRegistered)
    const session = createDeviceSession(dir, register)
    await session.credentials()
    const { deviceId } = stored(dir)
    await session.credentials()
    expect(stored(dir).deviceId).toBe(deviceId)
    expect(register).toHaveBeenLastCalledWith(deviceId)
  })

  it.skipIf(process.platform === 'win32')('keeps an issued secret in memory and retries a failed save', async () => {
    const dir = tempDir()
    const register = vi.fn(async () => {
      chmodSync(dir, 0o500)
      return issued('secret')
    })
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const session = createDeviceSession(dir, register)
    expect(await session.credentials()).toMatchObject({ kind: 'ok', body: { deviceSecret: 'secret' } })
    expect(stored(dir).deviceSecret).toBeNull()
    expect(error).toHaveBeenCalled()
    chmodSync(dir, 0o700)
    error.mockRestore()
    expect(await session.credentials()).toMatchObject({ kind: 'ok', body: { deviceSecret: 'secret' } })
    expect(stored(dir).deviceSecret).toBe('secret')
    expect(register).toHaveBeenCalledTimes(1)
  })

  it('keeps the device ID and retries after a failed registration', async () => {
    const dir = tempDir()
    const register = vi
      .fn<() => Promise<HttpResult<RegisterDeviceResponse>>>()
      .mockResolvedValueOnce({ kind: 'network', message: 'offline' })
      .mockResolvedValueOnce(issued('secret'))
    const session = createDeviceSession(dir, register)
    const { deviceId } = stored(dir)
    expect(await session.credentials()).toEqual({ kind: 'network', message: 'offline' })
    expect(stored(dir)).toEqual({ deviceId, deviceSecret: null })
    expect(await session.credentials()).toMatchObject({ kind: 'ok', body: { deviceId, deviceSecret: 'secret' } })
  })

  it('treats a success without a secret as a failure and stores nothing', async () => {
    const dir = tempDir()
    const register = async () => ({ kind: 'ok', status: 200, body: {} }) as HttpResult<RegisterDeviceResponse>
    expect(await createDeviceSession(dir, register).credentials()).toMatchObject({ kind: 'network' })
    expect(stored(dir).deviceSecret).toBeNull()
  })
})
