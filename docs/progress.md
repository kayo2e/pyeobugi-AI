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
