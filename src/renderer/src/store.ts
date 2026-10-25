import { create } from 'zustand'
import { persist } from 'zustand/middleware'
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
