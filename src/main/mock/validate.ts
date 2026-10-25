import type { RejectedCode } from '../../shared/api'
import { kstDayStartMs } from '../../shared/time/kst'

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?[+-]\d{2}:\d{2}$/
const EVENT_FIELDS = ['eventId', 'type', 'sessionId', 'occurredAt', 'payload']
const FUTURE_LIMIT_MS = 5 * 60_000
const PAST_LIMIT_MS = 30 * 24 * 60 * 60_000
const MAX_SEGMENT_SEC = 3600

type Payload = Record<string, unknown>

const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_V4.test(v)
const isInt = (v: unknown): v is number => Number.isInteger(v)
const isBool = (v: unknown): v is boolean => typeof v === 'boolean'
const oneOf = (values: string[]) => (v: unknown) => typeof v === 'string' && values.includes(v)

export const parseIso = (v: unknown): number | null =>
  typeof v === 'string' && ISO_WITH_OFFSET.test(v) && !Number.isNaN(Date.parse(v)) ? Date.parse(v) : null

const PAYLOAD_FIELDS: Record<string, Record<string, (v: unknown) => boolean>> = {
  SESSION_START: {},
  SESSION_END: {},
  POMODORO_COMPLETED: {},
  USAGE_SEGMENT: {
    startedAt: (v) => parseIso(v) !== null,
    endedAt: (v) => parseIso(v) !== null,
    durationSec: isInt,
    badDurationSec: isInt,
  },
  POSTURE_BAD: { severity: oneOf(['MILD', 'MODERATE', 'SEVERE']) },
  CALIBRATION_COMPLETED: { isRecalibration: isBool },
  BUBBLE_SHOWN: { bubbleType: oneOf(['POSTURE', 'STRETCH', 'TIMER_BREAK', 'ENCOURAGE', 'GREETING']) },
  SETTINGS_CHANGED: { studyTimer: isBool, stretch: isBool, awayPause: isBool, overlay: isBool },
}

const inRange = (ms: number, nowMs: number): boolean => ms <= nowMs + FUTURE_LIMIT_MS && ms >= nowMs - PAST_LIMIT_MS

const validateSegment = (p: Payload, occurredAtMs: number, nowMs: number): RejectedCode | null => {
  const started = parseIso(p['startedAt'])!
  const ended = parseIso(p['endedAt'])!
  if (!inRange(started, nowMs) || !inRange(ended, nowMs)) return 'OCCURRED_AT_OUT_OF_RANGE'
  const duration = p['durationSec'] as number
  const bad = p['badDurationSec'] as number
  const endsAtNextMidnight = ended === kstDayStartMs(started) + 24 * 60 * 60_000
  const sameDay = kstDayStartMs(started) === kstDayStartMs(ended) || endsAtNextMidnight
  const valid =
    bad >= 0 &&
    bad <= duration &&
    duration <= MAX_SEGMENT_SEC &&
    started < ended &&
    sameDay &&
    Math.abs(duration - (ended - started) / 1000) <= 1 &&
    occurredAtMs === ended
  return valid ? null : 'INVALID_PAYLOAD'
}

export const validateEvent = (raw: unknown, nowMs: number): RejectedCode | null => {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return 'INVALID_PAYLOAD'
  const e = raw as Record<string, unknown>
  if (Object.keys(e).some((k) => !EVENT_FIELDS.includes(k))) return 'FORBIDDEN_FIELD'
  if (!isUuid(e['eventId']) || !isUuid(e['sessionId'])) return 'INVALID_PAYLOAD'

  const fields = typeof e['type'] === 'string' ? PAYLOAD_FIELDS[e['type']] : undefined
  if (!fields) return 'UNKNOWN_TYPE'

  const occurredAtMs = parseIso(e['occurredAt'])
  if (occurredAtMs === null) return 'INVALID_PAYLOAD'
  if (!inRange(occurredAtMs, nowMs)) return 'OCCURRED_AT_OUT_OF_RANGE'

  const payload = e['payload']
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return 'INVALID_PAYLOAD'
  const p = payload as Payload
  if (Object.keys(p).some((k) => !(k in fields))) return 'FORBIDDEN_FIELD'
  if (Object.entries(fields).some(([k, check]) => !check(p[k]))) return 'INVALID_PAYLOAD'

  return e['type'] === 'USAGE_SEGMENT' ? validateSegment(p, occurredAtMs, nowMs) : null
}
