const KST_OFFSET_MS = 9 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

const pad = (n: number): string => String(n).padStart(2, '0')

export const floorToSecondMs = (ms: number): number => Math.floor(ms / 1000) * 1000

export const kstDayStartMs = (ms: number): number => Math.floor((ms + KST_OFFSET_MS) / DAY_MS) * DAY_MS - KST_OFFSET_MS

export const nextKstMidnightMs = (ms: number): number => kstDayStartMs(ms) + DAY_MS

export const toKstIso = (ms: number): string => {
  const d = new Date(floorToSecondMs(ms) + KST_OFFSET_MS)
  const date = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
  const time = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
  return `${date}T${time}+09:00`
}
