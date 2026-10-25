export type ApiErrorBody = { code: string; message: string; traceId: string }

export type RejectedCode = 'INVALID_PAYLOAD' | 'FORBIDDEN_FIELD' | 'UNKNOWN_TYPE' | 'OCCURRED_AT_OUT_OF_RANGE'

export type RejectedEvent = { index: number; eventId?: string; code: RejectedCode }

export type PostEventsResponse = { accepted: number; duplicated: number; rejected: RejectedEvent[] }

export type Mood = 'GOOD' | 'NORMAL' | 'BAD'

export type ReportPeriod = {
  postureKeepRate: number | null
  turtleNeckCount: number
  pomodoroCount: number
  usageSeconds: number
}

export type ReportSummary = {
  hasData: boolean
  generatedAt: string
  today: ReportPeriod
  week: ReportPeriod
  comment: { message: string; mood: Mood } | null
}

export type HttpResult<T> =
  | { kind: 'ok'; status: number; body: T }
  | { kind: 'error'; status: number; body: ApiErrorBody | null; retryAfterSec: number | null }
  | { kind: 'network'; message: string }
