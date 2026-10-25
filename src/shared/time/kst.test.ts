import { describe, expect, it } from 'vitest'
import { kstDayStartMs, nextKstMidnightMs, toKstIso } from './kst'

const ms = (iso: string): number => Date.parse(iso)

describe('kst', () => {
  it('formats with the KST offset and drops milliseconds', () => {
    expect(toKstIso(ms('2026-10-04T00:22:00.999Z'))).toBe('2026-10-04T09:22:00+09:00')
  })

  it('rolls the KST date at 15:00 UTC', () => {
    expect(toKstIso(ms('2026-10-04T15:00:00Z'))).toBe('2026-10-05T00:00:00+09:00')
  })

  it('finds KST day boundaries', () => {
    expect(kstDayStartMs(ms('2026-10-04T23:30:00+09:00'))).toBe(ms('2026-10-04T00:00:00+09:00'))
    expect(nextKstMidnightMs(ms('2026-10-04T23:30:00+09:00'))).toBe(ms('2026-10-05T00:00:00+09:00'))
    expect(nextKstMidnightMs(ms('2026-10-05T00:00:00+09:00'))).toBe(ms('2026-10-06T00:00:00+09:00'))
  })
})
