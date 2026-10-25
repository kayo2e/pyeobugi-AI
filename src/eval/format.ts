import { RECORDING_LABELS } from '../shared/recording'
import type { Report } from './analyze'

const pct = (x: number): string => `${(x * 100).toFixed(1)}%`
const num = (x: number, digits = 2): string => (Number.isFinite(x) ? x.toFixed(digits) : '–')

const row = (cells: string[]): string => `| ${cells.join(' | ')} |`

const table = (header: string[], rows: string[][]): string =>
  [row(header), row(header.map(() => '---')), ...rows.map(row)].join('\n')

export const formatReport = (report: Report): string =>
  [
    `Baseline: ${report.baselineSource === 'calibrated' ? 'calibrated in the app' : 'mean of UPRIGHT samples'}`,
    '',
    '### Signal per label (pitch in degrees relative to baseline)',
    table(
      ['Label', 'Files', 'Samples', 'Face detected', 'Pitch mean', 'Pitch std', 'Frame jitter', 'Size Δ mean'],
      report.labels.map((l) => [
        RECORDING_LABELS[l.label],
        String(l.files),
        String(l.samples),
        pct(l.detectionRate),
        num(l.pitchMean),
        num(l.pitchStd),
        num(l.pitchJitter),
        num(l.sizeMean, 3),
      ]),
    ),
    '',
    '### Separation from UPRIGHT on raw pitch',
    table(
      ['Against', "Cohen's d", 'Best threshold (°)', 'Balanced accuracy'],
      report.separations.map((s) => [
        RECORDING_LABELS[s.against],
        num(s.cohensD),
        num(s.bestThreshold, 1),
        pct(s.balancedAccuracy),
      ]),
    ),
    '',
    '### Engine replay with the adaptive schedule',
    'Bad fraction includes the 3 s entry hold and smoothing, so a sustained bad posture stays below 100%.',
    table(
      ['Label', 'Judged bad', 'POSTURE_BAD events', 'Inference rate'],
      report.replays.map((r) => [
        RECORDING_LABELS[r.label],
        pct(r.badFraction),
        String(r.postureBadCount),
        `${num(r.inferenceHz)} Hz`,
      ]),
    ),
  ].join('\n')
