export type Baseline = { pitch: number; size: number }

export type Severity = 'MILD' | 'MODERATE' | 'SEVERE'

const PITCH_DEADZONE = 1.5
const PITCH_WEIGHT = 1.4
const SIZE_WEIGHT = 120
const SIZE_GATE_START = 6
const SIZE_GATE_SPAN = 5
const SCORE_DEADZONE = 4

export const BAD_ENTER_SCORE = 3
export const BAD_EXIT_SCORE = 2

const SEVERITY_RANK: Record<Severity, number> = { MILD: 0, MODERATE: 1, SEVERE: 2 }

export const postureScore = (pitch: number, size: number, baseline: Baseline): number => {
  const dPitch = pitch - baseline.pitch
  const pitchTerm = dPitch > PITCH_DEADZONE ? (dPitch - PITCH_DEADZONE) * PITCH_WEIGHT : 0
  // Face size also grows when simply leaning toward the screen, so it only counts once the head is pitched down
  const gate = dPitch > SIZE_GATE_START ? Math.min(1, (dPitch - SIZE_GATE_START) / SIZE_GATE_SPAN) : 0
  const sizeTerm = Math.max(0, (size - baseline.size) * SIZE_WEIGHT) * gate
  const total = pitchTerm + sizeTerm
  return total < SCORE_DEADZONE ? 0 : total - SCORE_DEADZONE
}

export const severityOf = (score: number): Severity => (score >= 18 ? 'SEVERE' : score >= 10 ? 'MODERATE' : 'MILD')

export const maxSeverity = (a: Severity | null, b: Severity): Severity =>
  a !== null && SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b
