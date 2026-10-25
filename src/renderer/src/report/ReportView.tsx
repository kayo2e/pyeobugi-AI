import { useEffect, useState } from 'react'
import type { ReportPeriod, ReportSummary } from '../../../shared/api'
import { formatUsage } from '../../../shared/format'
import { useReportCache } from '../store'
import { Toast } from '../Toast'
import { useReport } from './useReport'

const EMPTY_MESSAGE = '아직 기록이 없어요. 바르게 앉아 펴부기를 시작해 볼까요?'
const DEFAULT_COMMENT = '오늘도 바른 자세로 시작해 봐요'

const Period = ({ title, period }: { title: string; period: ReportPeriod }) => (
  <section className="period">
    <h2>{title}</h2>
    <dl>
      <dt>정자세 유지율</dt>
      <dd>{period.postureKeepRate === null ? '—' : `${period.postureKeepRate}%`}</dd>
      <dt>거북목</dt>
      <dd>{period.turtleNeckCount}회</dd>
      <dt>뽀모도로</dt>
      <dd>{period.pomodoroCount}회</dd>
      <dt>사용 시간</dt>
      <dd>{formatUsage(period.usageSeconds)}</dd>
    </dl>
  </section>
)

const Summary = ({ report }: { report: ReportSummary }) =>
  report.hasData ? (
    <>
      <p className={`comment ${report.comment?.mood.toLowerCase() ?? ''}`}>
        {report.comment?.message ?? DEFAULT_COMMENT}
      </p>
      <Period title="오늘" period={report.today} />
      <Period title="이번 주" period={report.week} />
    </>
  ) : (
    <p className="empty">{EMPTY_MESSAGE}</p>
  )

export const ReportView = () => {
  const query = useReport(true)
  const cached = useReportCache((s) => s.lastReport)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    if (query.isError) setToast('리포트 조회에 실패했어요')
  }, [query.isError, query.errorUpdatedAt])

  const retry = (
    <button type="button" onClick={() => void query.refetch()} disabled={query.isFetching}>
      다시 시도
    </button>
  )

  return (
    <div className="report">
      {query.isPending && query.isFetching && <p className="loading">기록을 불러오는 중...</p>}
      {query.isSuccess && <Summary report={query.data} />}
      {query.isError && cached && (
        <>
          <p className="stale">마지막으로 불러온 기록이에요</p>
          <Summary report={cached} />
          {retry}
        </>
      )}
      {query.isError && !cached && (
        <>
          <p className="empty">기록을 불러올 수 없어요</p>
          {retry}
        </>
      )}
      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </div>
  )
}
