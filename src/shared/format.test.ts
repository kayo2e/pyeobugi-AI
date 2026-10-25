import { describe, expect, it } from 'vitest'
import { formatUsage } from './format'

describe('formatUsage', () => {
  it('formats seconds as Nh MMm', () => {
    expect([0, 59, 300, 12_600, 71_400].map(formatUsage)).toEqual(['0h 00m', '0h 00m', '0h 05m', '3h 30m', '19h 50m'])
  })
})
