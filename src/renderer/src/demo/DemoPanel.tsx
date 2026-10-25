import { useEffect, useRef } from 'react'
import type { DetectionView } from '../detection/useDetection'
import { drawFace, drawHistory } from './draw'

export const FaceOverlay = ({ view }: { view: DetectionView }) => {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (ref.current) drawFace(ref.current, view.engine.present ? view.face : null, view.engine.bad)
  }, [view])
  return <canvas ref={ref} className="overlay" />
}

export const HistoryChart = ({ view }: { view: DetectionView }) => {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (ref.current) drawHistory(ref.current, view.history, Date.now())
  }, [view])
  return <canvas ref={ref} className="chart" />
}
