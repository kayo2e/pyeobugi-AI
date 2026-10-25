# Progress Log

## 2026-10-25 — Project scaffold, posture engine, usage events, face detection

### Done

- Electron 44 + React 19 + TypeScript + electron-vite scaffold. Dependencies are pinned to exact versions;
  `.npmrc` sets `legacy-peer-deps` because npm 10.9 crashes (`edgesOut`) resolving Vitest 4 optional peers.
- Posture engine (`src/shared/posture/`): pure reducer ported from the Swift prototype's score (pitch deadzone,
  gated face-size term, 3/10/18 severity bands). Adds face-loss debounce, enter/exit hysteresis with hold times,
  backdated transitions and an adaptive sampling interval.
- Usage events (`src/shared/events.ts`, `src/main/usage/`): event types from the API spec, KST helpers, and a
  segment builder that produces `USAGE_SEGMENT` (1-minute, KST-midnight split, seconds-floored contiguous bounds,
  bad time rounded and clamped) and `POSTURE_BAD` from engine transitions.
- Face detection (`src/renderer/src/detection/`): bundled BlazeFace short-range model and MediaPipe wasm,
  320x240 camera, timer-driven loop, keypoint pitch estimate, persisted calibration baseline, event log in the UI.
- Main process wiring: session events, calibration event, segment close on window close / reload / renderer
  crash / system suspend. Events are kept in an in-memory outbox and logged to the console.
- 29 unit tests passing (`npm test`), typecheck and production build passing.

### Notes

| Setting | Swift prototype | Now |
| --- | --- | --- |
| Model | Vision face rectangles | BlazeFace short-range (0.23 MB) |
| Camera | `.medium`, 15 fps | 320x240, ≤10 fps |
| Inference rate | 7.5 Hz fixed | 1 Hz / 4 Hz pending / 0.33 Hz away |
| Smoothing | 5-sample mean | 3-sample mean |
| Bad posture entry | 0.2 s | 3 s hold, exit 2 s, thresholds 3 / 2 |

- Not run with a real camera yet. Pitch estimate and score weights are unvalidated (see ADR 0001).
- A segment builder bug was caught by tests: a transition arriving before the minute tick put bad time into the
  older segment. Fixed by rolling segment boundaries before applying each transition.
- Packaged builds load assets over `file://`, which MediaPipe's fetch may reject. Only `npm run dev` is expected
  to work for now.

### Next

- Run `npm run dev` with a real camera, check detection, retune `NOSE_DEPTH_PER_EYE_DISTANCE` and score weights.
- Measure power: prototype vs this app, CPU vs GPU delegate (`powermetrics` on macOS, Task Manager on Windows).
- Persistent event queue in main (10 s / 20 events batches, 5,000 cap, backoff) and `POST /api/events` client.
- MSW mock for `/api/events` and `/api/reports/summary`, report screen with TanStack Query.
- Custom `app://` protocol so packaged builds can load the model and wasm.

## 2026-10-25 — First camera run fixes

### Done

- Face was never detected on the first real run: the MediaPipe CPU delegate returns zero detections when given a
  `<video>` element directly (GPU delegate and canvas input both work on the same frame). Frames are now copied to
  a 320x240 canvas before `detectForVideo`.
- Fixed a camera stream leak under React StrictMode: the stream opened by the discarded first effect run was never
  stopped.

### Notes

Measured in the dev app on a MacBook (30 runs, 320x240, BlazeFace short-range):

| Path | Detected | Median | p90 | First call |
| --- | --- | --- | --- | --- |
| CPU delegate, canvas input | 30/30 | 10.4 ms | 13.2 ms | 39 ms |
| GPU delegate, video input | 30/30 | 9.9 ms | 11.8 ms | 168 ms |
| CPU delegate, video input | 0/30 | – | – | – |

- At 1 Hz this is about 1% of one core for inference. CPU stays the default since the per-call cost is the same.
- Keypoint pitch while seated and typing ranged 6.5°–13.4° over 2 s, which looks noisy relative to the 1.5°
  pitch deadzone. Unclear yet whether that is head movement or estimate noise.

### Next

- Record a short labeled session (upright vs. forward head) to measure pitch noise and tune smoothing/weights.

## 2026-10-25 — Usage gating, event queue, report, demo mode

### Done

- Usage is tracked only after calibration (`tracking` state in the engine), so uncalibrated time no longer counts
  as perfect posture.
- Event queue in main: anonymous device ID, persistent file queue (write-then-rename, 5,000 cap), batches of up to
  100 every 10 s or at 20 events, spec response handling (200 / 400 / 413 split / 429 retryAfter / 5xx backoff),
  flush on quit. Quit uses `app.exit` after the flush because re-entering `quit()` stalled on macOS.
- MSW mock API (dev only, absent from the production bundle) implementing the spec's validation and summary
  formulas. A contract test feeds real segment-builder output through the validator.
- Report tab: flush + summary over IPC, TanStack Query, cached last success, retry, failure toast.
- Demo mode for recordings: mirrored camera preview with face box, keypoints and the ear-line/nose reference used
  for pitch; 60 s chart of pitch delta, score with entry/exit thresholds, and each detection tick (fast ticks show
  the 4 Hz pending window). Detection rate is unchanged in demo mode.
- 51 unit tests passing.

### Notes

- Scope going forward is the detection model only (accuracy and power). The event queue, mock API and report UI
  are kept for reference and handed over to the frontend and backend.
- In a live demo session, the chart showed short head drops (<3 s) staying below the bad-posture hold, and 83
  detections in 60 s with pending windows, versus 450 at the prototype's fixed 7.5 Hz.

## 2026-10-25 — Recording tool for accuracy evaluation

### Done

- Record panel in demo mode: label (upright / forward head / looking down) and 30 or 60 s, sampled at a fixed
  5 Hz. Saves keypoints, box, pitch and face size to `userData/recordings/*.json`; no image data.
- `npm run analyze`: per-label pitch noise and face detection rate, separation from upright (Cohen's d, best
  threshold, balanced accuracy), and an engine replay that follows the adaptive schedule over the recording.

### Notes

- First real 30 s "upright" recording (unlabeled behaviour, so indicative only): pitch std 14.9°, frame-to-frame
  jitter 7.4°, 99% face detection. The first 8 s were stable within -4°..5°; later spread is likely movement.
- One sample hit -90°: the asin input saturated, most likely from a turned head shrinking the eye distance.
  Such samples should probably be rejected, but that changes judgement and waits for labeled data.

### Next

- Record labeled sessions (2-3 per label, varied lighting and distance) and run `npm run analyze`.
- Decide on outlier rejection, smoothing window and score weights from those numbers.
