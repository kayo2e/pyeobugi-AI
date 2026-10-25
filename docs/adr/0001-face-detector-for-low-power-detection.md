# 0001. Use MediaPipe Face Detector with adaptive sampling for posture detection

- Status: Accepted
- Date: 2026-10-25 19:30 KST

## Context

- The app runs all day on laptops, so heat and battery drain are primary constraints, not just accuracy.
- The only outputs the server needs are face presence, bad-posture state with a 3-level severity, and bad-posture
  duration in whole seconds per 1-minute segment. No landmark, angle or image leaves the device.
- The Swift prototype (`m2nwo079/turtle-neck`) scores head pitch plus a gated face-size signal relative to a
  personal baseline from a front-facing webcam. Its accuracy has not been measured.
- The prototype's MediaPipe branch ran Pose Landmarker and Face Landmarker every animation frame, loaded from a CDN.

## Options

| Option | Model size | Pitch signal | Notes |
| --- | --- | --- | --- |
| Pose Landmarker + Face Landmarker | ~5-9 MB + ~3.7 MB | Transform matrix | Heaviest; adds a shoulder-relative head height signal |
| Face Landmarker only | ~3.7 MB | Transform matrix (accurate) | 478 landmarks we do not need |
| **Face Detector (BlazeFace short-range)** | **~0.23 MB** | Approximated from 6 keypoints | Lightest; pitch is an estimate |
| Apple Vision / native per OS | 0 (OS) | Native pitch | Not cross-platform for Electron |

## Decision

- Use the MediaPipe Face Detector (BlazeFace short-range, float16) on the CPU delegate, bundled with the app.
- Estimate pitch from the vertical drop of the nose tip below the ear line, normalized by eye distance
  (`src/shared/posture/face-geometry.ts`). Only changes from the personal baseline are scored, so a constant bias
  in the estimate cancels out.
- Open the camera at 320x240 and at most 10 fps, and drive inference with a timer instead of every frame:
  1 Hz when stable, 4 Hz only while a posture change is pending, 0.33 Hz after a minute of absence.
- Debounce face loss (3 s) and posture changes (3 s to enter, 2 s to exit, with separate score thresholds) so that
  detection flicker cannot inflate the turtle-neck count or fragment usage segments.

## Consequences

- About 7x fewer inferences than the prototype's 7.5 Hz and a much smaller model, which should reduce CPU load.
  This is not measured yet; power must be compared against the prototype before the claim is used.
- The keypoint pitch is an approximation with an assumed face proportion (`NOSE_DEPTH_PER_EYE_DISTANCE = 1.6`).
  Score weights were tuned on Apple Vision pitch and may need retuning. If accuracy is not good enough, switch to
  Face Landmarker with the same sampling schedule.
- CPU delegate was chosen on the assumption that waking the GPU once a second costs more than a sub-millisecond
  CPU inference. This needs measurement as well.
- Posture transitions are reported up to 3 s late but backdated to their onset, so durations stay accurate while
  the count only includes sustained bad posture.
