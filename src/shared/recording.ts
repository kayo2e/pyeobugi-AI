export type RecordingLabel = 'UPRIGHT' | 'FORWARD_HEAD' | 'LOOKING_DOWN'

export type RecordedFace = {
  box: { x: number; y: number; width: number; height: number }
  keypoints: [number, number][]
  pitch: number | null
  size: number | null
}

export type RecordedSample = { t: number; face: RecordedFace | null }

export type Recording = {
  version: 1
  label: RecordingLabel
  startedAt: string
  durationMs: number
  intervalMs: number
  video: { width: number; height: number }
  baseline: { pitch: number; size: number } | null
  samples: RecordedSample[]
}

export const RECORDING_LABELS: Record<RecordingLabel, string> = {
  UPRIGHT: '바른 자세',
  FORWARD_HEAD: '거북목',
  LOOKING_DOWN: '고개 숙임',
}
