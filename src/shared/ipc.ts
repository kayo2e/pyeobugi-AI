import type { ReportResult } from './api'
import type { AppEvent } from './events'
import type { Transition } from './posture/engine'
import type { Recording } from './recording'

export const IPC = {
  transitions: 'posture:transitions',
  calibrated: 'posture:calibrated',
  resetEngine: 'posture:reset-engine',
  eventEmitted: 'events:emitted',
  getReport: 'report:get',
  saveRecording: 'recording:save',
  openRecordings: 'recording:open-folder',
} as const

export type PyeobugiApi = {
  sendTransitions: (transitions: Transition[]) => void
  calibrationCompleted: (isRecalibration: boolean) => void
  onResetEngine: (listener: () => void) => () => void
  onEvent: (listener: (event: AppEvent) => void) => () => void
  getReport: () => Promise<ReportResult>
  saveRecording: (recording: Recording) => Promise<string>
  openRecordings: () => Promise<void>
}
