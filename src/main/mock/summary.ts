import type { Mood, ReportPeriod, ReportSummary } from '../../shared/api'
import type { AppEvent } from '../../shared/events'
import { DAY_MS, KST_OFFSET_MS, kstDayStartMs, toKstIso } from '../../shared/time/kst'

export const kstWeekStartMs = (ms: number): number => {
  const weekday = new Date(ms + KST_OFFSET_MS).getUTCDay()
  return kstDayStartMs(ms) - ((weekday + 6) % 7) * DAY_MS
}

const period = (events: AppEvent[], fromMs: number, nowMs: number): ReportPeriod => {
  const within = (iso: string) => {
    const ms = Date.parse(iso)
    return ms >= fromMs && ms <= nowMs
  }
  let usage = 0
  let bad = 0
  let turtleNeckCount = 0
  let pomodoroCount = 0
  for (const e of events) {
    if (e.type === 'USAGE_SEGMENT' && within(e.payload.startedAt)) {
      usage += e.payload.durationSec
      bad += e.payload.badDurationSec
    }
    if (e.type === 'POSTURE_BAD' && within(e.occurredAt)) turtleNeckCount += 1
    if (e.type === 'POMODORO_COMPLETED' && within(e.occurredAt)) pomodoroCount += 1
  }
  // Rounded once over summed seconds, never as an average of daily rates
  const postureKeepRate = usage === 0 ? null : Math.round(((usage - bad) / usage) * 100)
  return { postureKeepRate, turtleNeckCount, pomodoroCount, usageSeconds: usage }
}

const commentFor = (today: ReportPeriod): ReportSummary['comment'] => {
  if (today.usageSeconds === 0 || today.postureKeepRate === null) return null
  const [message, mood]: [string, Mood] =
    today.postureKeepRate >= 80
      ? ['오늘 잘했어요', 'GOOD']
      : today.postureKeepRate >= 50
        ? ['조금만 더 신경 써 볼까요?', 'NORMAL']
        : ['목을 쭉 펴 볼 시간이에요', 'BAD']
  return { message, mood }
}

export const summarize = (events: AppEvent[], nowMs: number): ReportSummary => {
  const today = period(events, kstDayStartMs(nowMs), nowMs)
  const week = period(events, kstWeekStartMs(nowMs), nowMs)
  const hasData = events.some(
    (e) =>
      (e.type === 'USAGE_SEGMENT' && e.payload.durationSec > 0) ||
      e.type === 'POSTURE_BAD' ||
      e.type === 'POMODORO_COMPLETED',
  )
  return { hasData, generatedAt: toKstIso(nowMs), today, week, comment: commentFor(today) }
}
