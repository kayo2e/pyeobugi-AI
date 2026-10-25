import type { Severity } from './posture/score'

export type BubbleType = 'POSTURE' | 'STRETCH' | 'TIMER_BREAK' | 'ENCOURAGE' | 'GREETING'

export type SettingsPayload = { studyTimer: boolean; stretch: boolean; awayPause: boolean; overlay: boolean }

export type UsageSegmentPayload = { startedAt: string; endedAt: string; durationSec: number; badDurationSec: number }

export type EventBody =
  | { type: 'SESSION_START'; payload: Record<string, never> }
  | { type: 'SESSION_END'; payload: Record<string, never> }
  | { type: 'USAGE_SEGMENT'; payload: UsageSegmentPayload }
  | { type: 'POSTURE_BAD'; payload: { severity: Severity } }
  | { type: 'POMODORO_COMPLETED'; payload: Record<string, never> }
  | { type: 'CALIBRATION_COMPLETED'; payload: { isRecalibration: boolean } }
  | { type: 'BUBBLE_SHOWN'; payload: { bubbleType: BubbleType } }
  | { type: 'SETTINGS_CHANGED'; payload: SettingsPayload }

export type EventDraft = EventBody & { occurredAtMs: number }

export type AppEvent = EventBody & { eventId: string; sessionId: string; occurredAt: string }
