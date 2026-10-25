import type { FaceDetector } from '@mediapipe/tasks-vision'
import { useEffect, useRef, useState } from 'react'
import { initialEngineState, nextIntervalMs, resetPosture, stepEngine } from '../../../shared/posture/engine'
import type { EngineState, Transition } from '../../../shared/posture/engine'
import { useCalibration } from '../store'
import { closeCamera, openCamera } from './camera'
import { createFaceDetector, detectFace } from './face-detector'
import type { FaceDetection } from './face-detector'

export type HistoryPoint = { at: number; pitch: number | null; score: number; bad: boolean; intervalMs: number }

export type DetectionView = {
  engine: EngineState
  intervalMs: number
  error: string | null
  face: FaceDetection | null
  history: HistoryPoint[]
}

const HISTORY_MS = 60_000

const initialView: DetectionView = { engine: initialEngineState, intervalMs: 0, error: null, face: null, history: [] }

const send = (transitions: Transition[]): void => {
  if (transitions.length > 0) window.pyeobugi.sendTransitions(transitions)
}

export const useDetection = (video: HTMLVideoElement | null) => {
  const engineRef = useRef<EngineState>(initialEngineState)
  const historyRef = useRef<HistoryPoint[]>([])
  const [view, setView] = useState<DetectionView>(initialView)

  useEffect(() => {
    if (!video) return
    let cancelled = false
    let timer: number | undefined
    let stream: MediaStream | null = null
    let detector: FaceDetector | null = null

    const loop = () => {
      if (cancelled || !detector) return
      const now = Date.now()
      const face = detectFace(detector, video)
      const baseline = useCalibration.getState().baseline
      const { state, transitions } = stepEngine(engineRef.current, { at: now, face: face?.sample ?? null }, baseline)
      engineRef.current = state
      send(transitions)
      const intervalMs = nextIntervalMs(state, now)
      const pitch = state.present && state.pitch !== null ? state.pitch - (baseline?.pitch ?? 0) : null
      historyRef.current = [
        ...historyRef.current.filter((p) => now - p.at <= HISTORY_MS),
        { at: now, pitch, score: state.score, bad: state.bad, intervalMs },
      ]
      setView({ engine: state, intervalMs, error: null, face, history: historyRef.current })
      timer = window.setTimeout(loop, intervalMs)
    }

    const unsubscribe = window.pyeobugi.onResetEngine(() => {
      engineRef.current = initialEngineState
    })

    Promise.all([openCamera(video), createFaceDetector()])
      .then(([s, d]) => {
        if (cancelled) {
          closeCamera(s)
          d.close()
          return
        }
        stream = s
        detector = d
        loop()
      })
      .catch((e: unknown) => setView((v) => ({ ...v, error: e instanceof Error ? e.message : String(e) })))

    return () => {
      cancelled = true
      window.clearTimeout(timer)
      unsubscribe()
      closeCamera(stream)
      detector?.close()
    }
  }, [video])

  const calibrate = (): boolean => {
    const { pitch, size } = engineRef.current
    if (pitch === null || size === null) return false
    const isRecalibration = useCalibration.getState().baseline !== null
    useCalibration.getState().setBaseline({ pitch, size })
    const { state, transitions } = resetPosture(engineRef.current, Date.now())
    engineRef.current = state
    send(transitions)
    window.pyeobugi.calibrationCompleted(isRecalibration)
    return true
  }

  return { view, calibrate }
}
