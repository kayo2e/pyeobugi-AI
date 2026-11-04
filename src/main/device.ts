import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { HttpResult, RegisterDeviceResponse } from '../shared/api'

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type Device = { deviceId: string; deviceSecret: string | null }
export type DeviceCredentials = { deviceId: string; deviceSecret: string }
export type RegisterDevice = (deviceId: string) => Promise<HttpResult<RegisterDeviceResponse>>

export const isUuidV4 = (value: unknown): value is string => typeof value === 'string' && UUID_V4.test(value)

const saveDevice = (dir: string, device: Device): void => {
  const file = join(dir, 'device.json')
  // Runs before app ready, when Electron may not have created the user data directory on a fresh install
  mkdirSync(dir, { recursive: true })
  // Write-then-rename because a truncated file loses the secret, and the server never reissues it
  writeFileSync(`${file}.tmp`, JSON.stringify(device), { mode: 0o600 })
  renameSync(`${file}.tmp`, file)
}

const newDevice = (): Device => ({ deviceId: randomUUID(), deviceSecret: null })

export const loadOrCreateDevice = (dir: string): Device => {
  try {
    const { deviceId, deviceSecret } = JSON.parse(readFileSync(join(dir, 'device.json'), 'utf8')) as Partial<Device>
    if (isUuidV4(deviceId)) return { deviceId, deviceSecret: typeof deviceSecret === 'string' ? deviceSecret : null }
  } catch (e) {
    // Missing or corrupt file: the spec accepts a new ID and a break in history. Any other read failure may be
    // temporary, and overwriting the file would destroy a secret the server never reissues
    const replaceable = e instanceof SyntaxError || (e as NodeJS.ErrnoException).code === 'ENOENT'
    if (!replaceable) throw e
  }
  const device = newDevice()
  saveDevice(dir, device)
  return device
}

export const createDeviceSession = (dir: string, register: RegisterDevice) => {
  let device = loadOrCreateDevice(dir)
  let registering: Promise<HttpResult<DeviceCredentials>> | null = null
  let unsaved = false
  let replacedId = false

  const persist = (): void => {
    try {
      saveDevice(dir, device)
      unsaved = false
    } catch (e) {
      // Keep using the device in memory and retry, since losing an issued secret would cost the device its history
      unsaved = true
      console.error('[device] save failed', e)
    }
  }

  const registerOnce = async (): Promise<HttpResult<RegisterDeviceResponse>> => {
    const result = await register(device.deviceId)
    if (result.kind !== 'error' || result.body?.code !== 'DEVICE_ALREADY_REGISTERED' || replacedId) return result
    // The secret is gone and cannot be reissued, so the spec treats this like a lost device ID
    console.warn('[device] already registered without a local secret, moving to a new device ID')
    replacedId = true
    device = newDevice()
    persist()
    return register(device.deviceId)
  }

  const registerDevice = async (): Promise<HttpResult<DeviceCredentials>> => {
    const result = await registerOnce()
    if (result.kind !== 'ok') return result
    const deviceSecret = (result.body as Partial<RegisterDeviceResponse> | null)?.deviceSecret
    if (typeof deviceSecret !== 'string' || deviceSecret === '') {
      return { kind: 'network', message: 'Register response has no deviceSecret' }
    }
    device = { deviceId: device.deviceId, deviceSecret }
    persist()
    return { kind: 'ok', status: result.status, body: { deviceId: device.deviceId, deviceSecret } }
  }

  const credentials = (): Promise<HttpResult<DeviceCredentials>> => {
    if (unsaved) persist()
    const { deviceId, deviceSecret } = device
    if (deviceSecret) return Promise.resolve({ kind: 'ok', status: 200, body: { deviceId, deviceSecret } })
    registering ??= registerDevice().finally(() => {
      registering = null
    })
    return registering
  }

  return { credentials }
}
