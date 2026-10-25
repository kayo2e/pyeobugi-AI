import { useQuery } from '@tanstack/react-query'
import { useReportCache } from '../store'

export class ReportError extends Error {}

export const useReport = (enabled: boolean) =>
  useQuery({
    queryKey: ['report-summary'],
    enabled,
    retry: false,
    gcTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const result = await window.pyeobugi.getReport()
      if (!result.ok) {
        console.error('[report] failed', result.status, result.code, `traceId=${result.traceId ?? '-'}`)
        throw new ReportError(result.message)
      }
      useReportCache.getState().setLastReport(result.data)
      return result.data
    },
  })
