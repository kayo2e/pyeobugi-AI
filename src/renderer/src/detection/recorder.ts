import type { Baseline } from '../../../shared/posture/score'
import type { RecordedFace, RecordedSample, Recording, RecordingLabel } from '../../../shared/recording'
import { toKstIso } from '../../../shared/time/kst'
import type { FaceDetection } from './face-detector'

export const RECORD_INTERVAL_MS = 200

export type ActiveRecording = {
  label: RecordingLabel
  startedAt: number
  durationMs: number
  baseline: Baseline | null
  video: { width: number; height: number }
  samples: RecordedSample[]
}

export type RecordStatus =
  | { phase: 'idle' }
  | { phase: 'recording'; label: RecordingLabel; endsAt: number; count: number }
  | { phase: 'saved'; label: RecordingLabel; count: number; path: string }
  | { phase: 'error'; message: string }

export const toRecordedFace = (face: FaceDetection | null): RecordedFace | null =>
  face && {
    box: face.box,
    keypoints: face.keypoints.map((k): [number, number] => [k.x, k.y]),
    pitch: face.sample?.pitch ?? null,
    size: face.sample?.size ?? null,
  }

export const finishRecording = (active: ActiveRecording): Recording => ({
  version: 1,
  label: active.label,
  startedAt: toKstIso(active.startedAt),
  durationMs: active.durationMs,
  intervalMs: RECORD_INTERVAL_MS,
  video: active.video,
  baseline: active.baseline,
  samples: active.samples,
})
