import { useEffect, useState } from 'react'
import type { AppEvent } from '../../shared/events'
import { useDetection } from './detection/useDetection'
import { FaceOverlay, HistoryChart } from './demo/DemoPanel'
import { RecordPanel } from './demo/RecordPanel'
import { ReportView } from './report/ReportView'
import type { DetectionView } from './detection/useDetection'
import { useCalibration } from './store'

const MAX_LOG = 8

const SEVERITY_LABEL = {
  MILD: '목에 부담 주는 자세 (경증)',
  MODERATE: '목에 부담 주는 자세 (중등도)',
  SEVERE: '목에 부담 주는 자세 (중증)',
} as const

const statusOf = ({ feedback, error }: DetectionView, calibrated: boolean): string => {
  if (error) return `오류: ${error}`
  if (feedback.phase === 'UNAVAILABLE') return '자세를 확인할 수 없어요. 얼굴을 정면으로 보여 주세요.'
  if (!calibrated) return '바르게 앉아 ‘기준 잡기’를 눌러 주세요'
  if (feedback.phase === 'PENDING_BAD') return '자세 변화를 확인하고 있어요'
  if (feedback.phase === 'RECOVERING') return '바른 자세를 조금만 유지해 주세요'
  return feedback.severity ? SEVERITY_LABEL[feedback.severity] : '정자세'
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
  const [demo, setDemo] = useState(false)
  const calibrated = useCalibration((s) => s.baseline !== null)
  const { view, calibrate, calibration, recordStatus, startRecording } = useDetection(video)

  useEffect(() => window.pyeobugi.onEvent((e) => setLog((prev) => [e, ...prev].slice(0, MAX_LOG))), [])

  return (
    <main className="app">
      <h1>펴부기</h1>
      <div className={demo ? 'preview' : 'preview hidden'}>
        <video ref={setVideo} muted playsInline />
        {demo && <FaceOverlay view={view} />}
      </div>
      <nav className="tabs">
        <button type="button" aria-pressed={tab === 'detect'} onClick={() => setTab('detect')}>
          자세
        </button>
        <button type="button" aria-pressed={tab === 'report'} onClick={() => setTab('report')}>
          리포트
        </button>
        <label className="demo-toggle">
          <input type="checkbox" checked={demo} onChange={(e) => setDemo(e.target.checked)} />
          데모 모드
        </label>
      </nav>
      {tab === 'report' ? (
        <ReportView />
      ) : (
        <>
          <p className={view.feedback.phase === 'BAD' ? 'status bad' : 'status'}>{statusOf(view, calibrated)}</p>
          <p className="metrics">
            점수 {view.feedback.score?.toFixed(1) ?? '—'} · 감지 {hz(view.intervalMs)}
          </p>
          <button
            type="button" onClick={calibrate}
            disabled={!view.engine.present || calibration.phase === 'collecting' || recordStatus.phase === 'recording'}
          >
            {calibration.phase === 'collecting' ? '기준 잡는 중…' : calibrated ? '기준 다시 잡기' : '기준 잡기'}
          </button>
          <p role="status">
            {calibration.phase === 'collecting' && `바르게 앉아 정면을 봐 주세요. ${calibration.remainingSec}초 남았어요.`}
            {calibration.phase === 'failed' && calibration.message}
            {calibration.phase === 'complete' && '기준 자세를 저장했어요.'}
          </p>
          {view.distance.suggested && calibration.phase !== 'collecting' && (
            <p role="status">
              화면과의 거리가 달라진 것 같아요. 바르게 앉은 뒤 ‘기준 다시 잡기’를 눌러 주세요.
            </p>
          )}
          {demo && (
            <p className="metrics">
              상태 {view.feedback.phase} · 지속 {(view.feedback.badDurationMs / 1000).toFixed(1)}초
            </p>
          )}
          {demo && <HistoryChart view={view} />}
          {demo && <RecordPanel
            status={recordStatus} onStart={startRecording} disabled={calibration.phase === 'collecting'}
          />}
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
