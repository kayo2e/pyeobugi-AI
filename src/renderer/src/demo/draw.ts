import { BAD_ENTER_SCORE, BAD_EXIT_SCORE } from '../../../shared/posture/score'
import type { FaceDetection } from '../detection/face-detector'
import type { HistoryPoint } from '../detection/useDetection'

const GOOD = '#2f9e44'
const BAD = '#e8590c'
const PITCH = '#1c7ed6'
const WINDOW_MS = 60_000
// Fixed and clipped so the entry and exit thresholds stay visually apart; anything above is clearly bad anyway
const SCORE_AXIS_MAX = 12

type Palette = { text: string; grid: string }

const palette = (): Palette =>
  window.matchMedia('(prefers-color-scheme: dark)').matches
    ? { text: '#c9c9c9', grid: '#444' }
    : { text: '#555', grid: '#ddd' }

export const prepareCanvas = (canvas: HTMLCanvasElement): CanvasRenderingContext2D => {
  const ratio = window.devicePixelRatio || 1
  const { clientWidth: w, clientHeight: h } = canvas
  if (canvas.width !== w * ratio || canvas.height !== h * ratio) {
    canvas.width = w * ratio
    canvas.height = h * ratio
  }
  const ctx = canvas.getContext('2d')!
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
  ctx.clearRect(0, 0, w, h)
  return ctx
}

export const drawFace = (canvas: HTMLCanvasElement, face: FaceDetection | null, bad: boolean): void => {
  const ctx = prepareCanvas(canvas)
  if (!face) return
  const { clientWidth: w, clientHeight: h } = canvas
  const color = bad ? BAD : GOOD
  const at = (i: number) => {
    const k = face.keypoints[i]
    return k ? { x: k.x * w, y: k.y * h } : null
  }

  ctx.lineWidth = 2
  ctx.strokeStyle = color
  ctx.strokeRect(face.box.x * w, face.box.y * h, face.box.width * w, face.box.height * h)

  // The ear line and nose tip are the two references the pitch estimate is computed from
  const [nose, rightEar, leftEar] = [at(2), at(4), at(5)]
  if (nose && rightEar && leftEar) {
    ctx.setLineDash([4, 4])
    ctx.beginPath()
    ctx.moveTo(rightEar.x, rightEar.y)
    ctx.lineTo(leftEar.x, leftEar.y)
    ctx.moveTo(nose.x, nose.y)
    ctx.lineTo(nose.x, (rightEar.y + leftEar.y) / 2)
    ctx.stroke()
    ctx.setLineDash([])
  }

  ctx.fillStyle = color
  face.keypoints.forEach((_, i) => {
    const p = at(i)
    if (!p) return
    ctx.beginPath()
    ctx.arc(p.x, p.y, i === 2 ? 4 : 3, 0, Math.PI * 2)
    ctx.fill()
  })
}

type Panel = { top: number; height: number }

const line = (ctx: CanvasRenderingContext2D, y: number, width: number, color: string, dash: number[] = []) => {
  ctx.strokeStyle = color
  ctx.setLineDash(dash)
  ctx.beginPath()
  ctx.moveTo(0, y)
  ctx.lineTo(width, y)
  ctx.stroke()
  ctx.setLineDash([])
}

export const drawHistory = (canvas: HTMLCanvasElement, history: HistoryPoint[], now: number): void => {
  const ctx = prepareCanvas(canvas)
  const { clientWidth: width } = canvas
  const colors = palette()
  const x = (at: number) => ((at - (now - WINDOW_MS)) / WINDOW_MS) * width
  const pitchPanel: Panel = { top: 16, height: 54 }
  const scorePanel: Panel = { top: 94, height: 70 }
  const tickTop = 184

  ctx.font = '11px -apple-system, sans-serif'
  ctx.lineWidth = 1

  const pitches = history.flatMap((p) => (p.pitch === null ? [] : [p.pitch]))
  const pitchMax = Math.max(10, ...pitches.map(Math.abs))
  const pitchY = (v: number) => pitchPanel.top + pitchPanel.height / 2 - (v / pitchMax) * (pitchPanel.height / 2)
  ctx.fillStyle = colors.text
  ctx.fillText(`pitch 변화 (기준 대비, ±${pitchMax.toFixed(0)}°)`, 0, pitchPanel.top - 4)
  line(ctx, pitchY(0), width, colors.grid)
  ctx.strokeStyle = PITCH
  ctx.lineWidth = 2
  ctx.beginPath()
  history.forEach((p, i) => {
    if (p.pitch === null) return
    const prev = history[i - 1]
    if (!prev || prev.pitch === null) ctx.moveTo(x(p.at), pitchY(p.pitch))
    else ctx.lineTo(x(p.at), pitchY(p.pitch))
  })
  ctx.stroke()

  const scoreY = (v: number) =>
    scorePanel.top + scorePanel.height - (Math.min(v, SCORE_AXIS_MAX) / SCORE_AXIS_MAX) * scorePanel.height
  ctx.lineWidth = 1
  ctx.fillStyle = colors.text
  const scoreLabel = `점수 (진입 ${BAD_ENTER_SCORE} / 회복 ${BAD_EXIT_SCORE}, ${SCORE_AXIS_MAX} 이상은 위로 고정)`
  ctx.fillText(scoreLabel, 0, scorePanel.top - 4)
  line(ctx, scoreY(0), width, colors.grid)
  line(ctx, scoreY(BAD_ENTER_SCORE), width, BAD, [4, 3])
  line(ctx, scoreY(BAD_EXIT_SCORE), width, GOOD, [4, 3])
  ctx.lineWidth = 2
  history.forEach((p, i) => {
    const prev = history[i - 1]
    if (!prev) return
    ctx.strokeStyle = p.bad ? BAD : colors.text
    ctx.beginPath()
    ctx.moveTo(x(prev.at), scoreY(prev.score))
    ctx.lineTo(x(p.at), scoreY(p.score))
    ctx.stroke()
  })

  const latest = history.at(-1)
  ctx.fillStyle = colors.text
  const hz = latest ? (1000 / latest.intervalMs).toFixed(1) : '—'
  ctx.fillText(`감지 시점 (현재 ${hz}Hz, 최근 60초 ${history.length}회)`, 0, tickTop - 4)
  ctx.lineWidth = 1
  history.forEach((p) => {
    ctx.strokeStyle = p.intervalMs < 1000 ? BAD : PITCH
    ctx.beginPath()
    ctx.moveTo(x(p.at), tickTop)
    ctx.lineTo(x(p.at), tickTop + 12)
    ctx.stroke()
  })
}
