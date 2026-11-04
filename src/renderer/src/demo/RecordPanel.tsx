import { useEffect, useState } from 'react'
import { RECORDING_LABELS } from '../../../shared/recording'
import type { RecordingLabel } from '../../../shared/recording'
import type { RecordStatus } from '../detection/recorder'

const DURATIONS_SEC = [30, 60]

const useSecondsLeft = (status: RecordStatus): number | null => {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (status.phase !== 'recording') return
    const timer = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(timer)
  }, [status.phase])
  return status.phase === 'recording' ? Math.max(0, Math.ceil((status.endsAt - now) / 1000)) : null
}

const describe = (status: RecordStatus, secondsLeft: number | null): string => {
  switch (status.phase) {
    case 'idle':
      return '자세를 잡고 기록을 시작하세요. 영상은 저장하지 않아요.'
    case 'recording':
      return `${RECORDING_LABELS[status.label]} 기록 중… ${secondsLeft}초 남음 (샘플 ${status.count}개)`
    case 'saved':
      return `${RECORDING_LABELS[status.label]} ${status.count}개 저장됨: ${status.path.split('/').pop()}`
    case 'error':
      return `저장 실패: ${status.message}`
  }
}

type Props = { disabled?: boolean; status: RecordStatus; onStart: (label: RecordingLabel, durationMs: number) => void }

export const RecordPanel = ({ status, onStart, disabled = false }: Props) => {
  const [label, setLabel] = useState<RecordingLabel>('UPRIGHT')
  const [seconds, setSeconds] = useState(DURATIONS_SEC[0]!)
  const secondsLeft = useSecondsLeft(status)
  const recording = status.phase === 'recording'

  return (
    <section className="record">
      <div className="record-controls">
        <select
          value={label} disabled={recording || disabled} onChange={(e) => setLabel(e.target.value as RecordingLabel)}
        >
          {Object.entries(RECORDING_LABELS).map(([value, text]) => (
            <option key={value} value={value}>
              {text}
            </option>
          ))}
        </select>
        <select value={seconds} disabled={recording || disabled} onChange={(e) => setSeconds(Number(e.target.value))}>
          {DURATIONS_SEC.map((s) => (
            <option key={s} value={s}>
              {s}초
            </option>
          ))}
        </select>
        <button type="button" disabled={recording || disabled} onClick={() => onStart(label, seconds * 1000)}>
          기록 시작
        </button>
        <button type="button" onClick={() => void window.pyeobugi.openRecordings()}>
          폴더 열기
        </button>
      </div>
      <p className="record-status">{describe(status, secondsLeft)}</p>
    </section>
  )
}
