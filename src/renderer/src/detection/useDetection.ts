import type { FaceDetector } from '@mediapipe/tasks-vision'
import { useEffect, useRef, useState } from 'react'
import { initialEngineState, nextIntervalMs, resetPosture, stepEngine } from '../../../shared/posture/engine'
import { evaluateCalibration } from '../../../shared/posture/calibration'
import type { CalibrationResult } from '../../../shared/posture/calibration'
import type { Sample } from '../../../shared/posture/engine'
import type { EngineState, Transition } from '../../../shared/posture/engine'
import type { RecordingLabel } from '../../../shared/recording'
import { initialFeedback, updateFeedback } from '../../../shared/posture/feedback'
import type { PostureFeedback } from '../../../shared/posture/feedback'
import { initialDistanceState, stepDistance } from '../../../shared/posture/distance'
import type { DistanceState } from '../../../shared/posture/distance'
import { useCalibration } from '../store'
import { attachCamera, closeCamera, requestCamera } from './camera'
import { createFaceDetector, detectFace } from './face-detector'
import type { FaceDetection } from './face-detector'
import { finishRecording, RECORD_INTERVAL_MS, toRecordedFace } from './recorder'
import type { ActiveRecording, RecordStatus } from './recorder'

export type HistoryPoint = { at: number; pitch: number | null; score: number; bad: boolean; intervalMs: number }

export type DetectionView = {
  engine: EngineState
  feedback: PostureFeedback
  distance: DistanceState
  intervalMs: number
  error: string | null
  face: FaceDetection | null
  history: HistoryPoint[]
}

const HISTORY_MS = 60_000

const initialView: DetectionView = {
  engine: initialEngineState, feedback: initialFeedback, distance: initialDistanceState,
  intervalMs: 0, error: null, face: null, history: [],
}

const send = (transitions: Transition[]): void => {
  if (transitions.length > 0) window.pyeobugi.sendTransitions(transitions)
}

export const useDetection = (video: HTMLVideoElement | null) => {
  const calibrationRef = useRef<{ startedAt: number; samples: Sample[] } | null>(null)
  const [calibration, setCalibration] = useState<CalibrationResult | { phase: 'idle' }>({ phase: 'idle' })
  const feedbackRef = useRef<PostureFeedback>(initialFeedback)
  const distanceRef = useRef<DistanceState>(initialDistanceState)
  const engineRef = useRef<EngineState>(initialEngineState)
  const historyRef = useRef<HistoryPoint[]>([])
  const recordingRef = useRef<ActiveRecording | null>(null)
  const [view, setView] = useState<DetectionView>(initialView)
  const [recordStatus, setRecordStatus] = useState<RecordStatus>({ phase: 'idle' })

  useEffect(() => {
    if (!video) return
    let cancelled = false
    let timer: number | undefined
    let stream: MediaStream | null = null
    let detector: FaceDetector | null = null

    // Recording samples at a fixed rate so noise and separation are measured independently of the adaptive schedule
    const record = (now: number, face: FaceDetection | null): boolean => {
      const active = recordingRef.current
      if (!active) return false
      active.samples.push({ t: now - active.startedAt, face: toRecordedFace(face) })
      active.video = { width: video.videoWidth, height: video.videoHeight }
      const { label, startedAt, durationMs, samples } = active
      if (now - startedAt < durationMs) {
        setRecordStatus({ phase: 'recording', label, endsAt: startedAt + durationMs, count: samples.length })
        return true
      }
      recordingRef.current = null
      window.pyeobugi
        .saveRecording(finishRecording(active))
        .then((path) => setRecordStatus({ phase: 'saved', label, count: samples.length, path }))
        .catch((e: unknown) => setRecordStatus({ phase: 'error', message: e instanceof Error ? e.message : String(e) }))
      return false
    }

    const loop = () => {
      if (cancelled || !detector) return
      const now = Date.now()
      const face = detectFace(detector, video)
      const localTransitions: Transition[] = []
      const activeCalibration = calibrationRef.current
      if (activeCalibration) {
        activeCalibration.samples.push({ at: now, face: face?.sample ?? null })
        const result = evaluateCalibration(activeCalibration.samples, activeCalibration.startedAt)
        setCalibration(result)
        if (result.phase !== 'collecting') calibrationRef.current = null
        if (result.phase === 'complete') {
          const isRecalibration = useCalibration.getState().baseline !== null
          useCalibration.getState().setBaseline(result.baseline)
          const reset = resetPosture(engineRef.current, now)
          engineRef.current = reset.state
          send(reset.transitions)
          localTransitions.push(...reset.transitions)
          distanceRef.current = initialDistanceState
          window.pyeobugi.calibrationCompleted(isRecalibration)
        }
      }
      const baseline = useCalibration.getState().baseline
      const { state, transitions } = stepEngine(engineRef.current, { at: now, face: face?.sample ?? null }, baseline)
      engineRef.current = state
      send(transitions)
      localTransitions.push(...transitions)
      const feedback = updateFeedback(feedbackRef.current, state, now, face?.sample != null,
        baseline !== null, localTransitions)
      feedbackRef.current = feedback
      const distance = calibrationRef.current ? initialDistanceState
        : stepDistance(distanceRef.current, now, face?.sample?.size ?? null, baseline)
      distanceRef.current = distance
      const intervalMs = record(now, face) ? RECORD_INTERVAL_MS
        : calibrationRef.current ? 500 : nextIntervalMs(state, now)
      const pitch = state.present && state.pitch !== null ? state.pitch - (baseline?.pitch ?? 0) : null
      historyRef.current = [
        ...historyRef.current.filter((p) => now - p.at <= HISTORY_MS),
        { at: now, pitch, score: state.score, bad: state.bad, intervalMs },
      ]
      setView({ engine: state, feedback, distance, intervalMs, error: null, face, history: historyRef.current })
      timer = window.setTimeout(loop, intervalMs)
    }

    const unsubscribe = window.pyeobugi.onResetEngine(() => {
      engineRef.current = initialEngineState
      calibrationRef.current = null
      setCalibration({ phase: 'idle' })
      distanceRef.current = initialDistanceState
      feedbackRef.current = { ...initialFeedback, exitSequence: feedbackRef.current.exitSequence }
      setView({ ...initialView, feedback: feedbackRef.current })
    })

    // Attach only after confirming this run is still live, or a discarded StrictMode run could swap in its stream
    Promise.all([requestCamera(), createFaceDetector()])
      .then(async ([s, d]) => {
        if (cancelled) {
          closeCamera(s)
          d.close()
          return
        }
        stream = s
        detector = d
        await attachCamera(video, s)
        if (!cancelled) loop()
      })
      .catch((e: unknown) => setView((v) => ({ ...v, error: e instanceof Error ? e.message : String(e) })))

    return () => {
      cancelled = true
      calibrationRef.current = null
      window.clearTimeout(timer)
      unsubscribe()
      closeCamera(stream)
      detector?.close()
    }
  }, [video])

  const calibrate = (): void => {
    if (!engineRef.current.present || calibrationRef.current || recordingRef.current) return
    calibrationRef.current = { startedAt: Date.now(), samples: [] }
    setCalibration({ phase: 'collecting', remainingSec: 5 })
  }

  const startRecording = (label: RecordingLabel, durationMs: number): void => {
    if (!video || recordingRef.current || calibrationRef.current) return
    recordingRef.current = {
      label,
      startedAt: Date.now(),
      durationMs,
      baseline: useCalibration.getState().baseline,
      video: { width: 0, height: 0 },
      samples: [],
    }
    setRecordStatus({ phase: 'recording', label, endsAt: Date.now() + durationMs, count: 0 })
  }

  return { view, calibrate, calibration, recordStatus, startRecording }
}
