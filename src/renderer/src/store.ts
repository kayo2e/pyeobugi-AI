import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ReportSummary } from '../../shared/api'
import type { Baseline } from '../../shared/posture/score'

type CalibrationStore = {
  baseline: Baseline | null
  setBaseline: (baseline: Baseline) => void
}

export const useCalibration = create<CalibrationStore>()(
  persist((set) => ({ baseline: null, setBaseline: (baseline) => set({ baseline }) }), {
    name: 'pyeobugi-calibration',
  }),
)

type ReportCacheStore = {
  lastReport: ReportSummary | null
  setLastReport: (report: ReportSummary) => void
}

export const useReportCache = create<ReportCacheStore>()(
  persist((set) => ({ lastReport: null, setLastReport: (lastReport) => set({ lastReport }) }), {
    name: 'pyeobugi-report-cache',
  }),
)
