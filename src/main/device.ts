import { randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const isUuidV4 = (value: unknown): value is string => typeof value === 'string' && UUID_V4.test(value)

export const loadOrCreateDeviceId = (dir: string): string => {
  const file = join(dir, 'device.json')
  try {
    const { deviceId } = JSON.parse(readFileSync(file, 'utf8')) as { deviceId?: unknown }
    if (isUuidV4(deviceId)) return deviceId
  } catch {
    // Missing or corrupt file: the spec accepts a new ID and a break in history
  }
  const deviceId = randomUUID()
  writeFileSync(file, JSON.stringify({ deviceId }))
  return deviceId
}
