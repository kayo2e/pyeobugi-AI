import type { HttpResult, ReportResult, ReportSummary } from '../shared/api'

export const toReportResult = (result: HttpResult<ReportSummary>): ReportResult => {
  if (result.kind === 'ok') return { ok: true, data: result.body }
  if (result.kind === 'network') return { ok: false, status: null, code: null, traceId: null, message: result.message }
  return {
    ok: false,
    status: result.status,
    code: result.body?.code ?? null,
    traceId: result.body?.traceId ?? null,
    message: result.body?.message ?? `HTTP ${result.status}`,
  }
}
