import { TIMING } from '../shared/posture/engine'
import { RECORDING_LABELS } from '../shared/recording'
import type { Report } from './analyze'

const pct = (x: number): string => `${(x * 100).toFixed(1)}%`
const num = (x: number, digits = 2): string => (Number.isFinite(x) ? x.toFixed(digits) : '–')

const delay = (xs: number[]): string => xs.length
  ? `${num(xs.reduce((a, b) => a + b, 0) / xs.length)} (${xs.length})` : '–'

const row = (cells: string[]): string => `| ${cells.join(' | ')} |`

const table = (header: string[], rows: string[][]): string =>
  [row(header), row(header.map(() => '---')), ...rows.map(row)].join('\n')

export const formatReport = (report: Report): string =>
  [
    `Baseline: ${report.baselineSource}; each recording uses its own saved baseline.`,
    'Missing baselines use the pooled mean of uncalibrated UPRIGHT recordings; analyze one person/setup at a time.',
    '',
    '### Signal per label (pitch in degrees relative to baseline)',
    table(
      ['Label', 'Files', 'Samples', 'Face detected', 'Invalid sample',
        'Pitch mean', 'Pitch std', 'Frame jitter', 'Size Δ mean'],
      report.labels.map((l) => [
        RECORDING_LABELS[l.label],
        String(l.files),
        String(l.samples),
        pct(l.detectionRate),
        pct(l.invalidFraction),
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
    '',
    '### Replay quality and latency',
    'False positives use GOOD truth only. NOTE_TAKING needs explicit groundTruth; otherwise metrics are unavailable.',
    'Without annotations, the clip label is assumed constant from t=0. Delay uses decision time, not backdated events.',
    'Recovery requires an annotated BAD → GOOD boundary while the engine is bad. – means unavailable, not zero.',
    'Delays show mean seconds (measured episodes); missed/unresolved episodes are reported separately.',
    table(
      ['Label', 'False alerts', 'False bad (s)', 'Invalid time',
        'Detection (s)', 'Missed', 'Recovery (s)', 'Unresolved'],
      report.replays.map((r) => [
        RECORDING_LABELS[r.label],
        r.falsePositiveCount === null ? '–' : String(r.falsePositiveCount),
        r.falsePositiveSeconds === null ? '–' : num(r.falsePositiveSeconds),
        pct(r.invalidFraction), delay(r.detectionDelaysSec), String(r.missedBadEpisodes),
        delay(r.recoveryDelaysSec), String(r.unresolvedRecoveries),
      ]),
    ),
    '',
    '### Episodes above the entry score (input for the hold time)',
    `Raw 5 Hz scores, stricter than the engine's smoothing (see replay for actual alerts). Over hold = episodes long`,
    `enough to alert with the current ${TIMING.enterAfterMs / 1000} s hold.`,
    table(
      ['Label', 'Episodes', 'Median (s)', 'p90 (s)', 'Max (s)', 'Over hold'],
      report.episodes.map((e) => [
        RECORDING_LABELS[e.label],
        String(e.count),
        num(e.medianSec, 1),
        num(e.p90Sec, 1),
        num(e.maxSec, 1),
        String(e.overHold),
      ]),
    ),
  ].join('\n')
