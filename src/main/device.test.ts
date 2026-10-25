import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isUuidV4, loadOrCreateDeviceId } from './device'

describe('loadOrCreateDeviceId', () => {
  it('creates a missing user data directory and keeps the ID stable', () => {
    const dir = join(mkdtempSync(join(tmpdir(), 'pyeobugi-')), 'not-yet-created')
    const id = loadOrCreateDeviceId(dir)
    expect(isUuidV4(id)).toBe(true)
    expect(JSON.parse(readFileSync(join(dir, 'device.json'), 'utf8'))).toEqual({ deviceId: id })
    expect(loadOrCreateDeviceId(dir)).toBe(id)
  })
})
