import { useEffect, useState } from 'react'
import type { AppEvent } from '../../shared/events'
import { severityOf } from '../../shared/posture/score'
import { useDetection } from './detection/useDetection'
import { ReportView } from './report/ReportView'
import type { DetectionView } from './detection/useDetection'
import { useCalibration } from './store'

const MAX_LOG = 8

const SEVERITY_LABEL = {
  MILD: '경증 거북목',
  MODERATE: '중등도 거북목',
  SEVERE: '중증 거북목',
} as const

const statusOf = ({ engine, error }: DetectionView, calibrated: boolean): string => {
  if (error) return `오류: ${error}`
  if (!engine.present) return '얼굴을 찾는 중…'
  if (!calibrated) return '바르게 앉아 ‘기준 잡기’를 눌러 주세요'
  return engine.bad ? SEVERITY_LABEL[severityOf(engine.score)] : '정자세'
}

const hz = (intervalMs: number): string => (intervalMs ? `${(1000 / intervalMs).toFixed(1)}Hz` : '—')

const describe = (e: AppEvent): string => {
  const time = e.occurredAt.slice(11, 19)
  if (e.type === 'USAGE_SEGMENT') {
    return `${time} ${e.type} ${e.payload.durationSec}s (bad ${e.payload.badDurationSec}s)`
  }
  if (e.type === 'POSTURE_BAD') return `${time} ${e.type} ${e.payload.severity}`
  return `${time} ${e.type}`
}

export const App = () => {
  const [video, setVideo] = useState<HTMLVideoElement | null>(null)
  const [log, setLog] = useState<AppEvent[]>([])
  const [tab, setTab] = useState<'detect' | 'report'>('detect')
  const calibrated = useCalibration((s) => s.baseline !== null)
  const { view, calibrate } = useDetection(video)

  useEffect(() => window.pyeobugi.onEvent((e) => setLog((prev) => [e, ...prev].slice(0, MAX_LOG))), [])

  return (
    <main className="app">
      <h1>펴부기</h1>
      <video ref={setVideo} className="camera" muted playsInline />
      <nav className="tabs">
        <button type="button" aria-pressed={tab === 'detect'} onClick={() => setTab('detect')}>
          자세
        </button>
        <button type="button" aria-pressed={tab === 'report'} onClick={() => setTab('report')}>
          리포트
        </button>
      </nav>
      {tab === 'report' ? (
        <ReportView />
      ) : (
        <>
          <p className={view.engine.bad ? 'status bad' : 'status'}>{statusOf(view, calibrated)}</p>
          <p className="metrics">
            점수 {calibrated ? view.engine.score.toFixed(1) : '—'} · 감지 {hz(view.intervalMs)}
          </p>
          <button type="button" onClick={calibrate} disabled={!view.engine.present}>
            {calibrated ? '기준 다시 잡기' : '기준 잡기'}
          </button>
          <ol className="log">
            {log.map((e) => (
              <li key={e.eventId}>{describe(e)}</li>
            ))}
          </ol>
        </>
      )}
    </main>
  )
}
