import type { FaceDetector } from '@mediapipe/tasks-vision'
import { useEffect, useRef, useState } from 'react'
import { initialEngineState, nextIntervalMs, resetPosture, stepEngine } from '../../../shared/posture/engine'
import type { EngineState, Transition } from '../../../shared/posture/engine'
import { useCalibration } from '../store'
import { closeCamera, openCamera } from './camera'
import { createFaceDetector, detectFace } from './face-detector'

export type DetectionView = { engine: EngineState; intervalMs: number; error: string | null }

const send = (transitions: Transition[]): void => {
  if (transitions.length > 0) window.pyeobugi.sendTransitions(transitions)
}

export const useDetection = (video: HTMLVideoElement | null) => {
  const engineRef = useRef<EngineState>(initialEngineState)
  const [view, setView] = useState<DetectionView>({ engine: initialEngineState, intervalMs: 0, error: null })

  useEffect(() => {
    if (!video) return
    let cancelled = false
    let timer: number | undefined
    let stream: MediaStream | null = null
    let detector: FaceDetector | null = null

    const loop = () => {
      if (cancelled || !detector) return
      const now = Date.now()
      const { state, transitions } = stepEngine(
        engineRef.current,
        { at: now, face: detectFace(detector, video) },
        useCalibration.getState().baseline,
      )
      engineRef.current = state
      send(transitions)
      const intervalMs = nextIntervalMs(state, now)
      setView({ engine: state, intervalMs, error: null })
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
