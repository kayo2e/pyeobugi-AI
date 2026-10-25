# 0002. Judge forward head and neck flexion as one bad-posture class

- Status: Accepted
- Date: 2026-10-25 21:00 KST

## Context

- Forward head posture (head translated in front of the shoulders, gaze level) and neck flexion (looking down at a
  phone or notes) are different postures, but both load the cervical spine. Neck flexion alone raises the load on
  the neck substantially as the angle grows (Hansraj, 2014).
- The engine scores pitch change plus a pitch-gated face-size term, so it already flags both.
- First labeled run (ADR 0001 follow-up, `docs/progress.md`): looking down separates from upright almost perfectly
  (balanced accuracy 99.4%), forward head less so (84.8%).
- Telling them apart would rely on face size, which also changes with sitting distance: the second forward-head
  session, recorded farther back, had a smaller face than the baseline.
- The API spec has a single `POSTURE_BAD` event with a severity and no posture kind.

## Options

| Option | Description | Spec change |
| --- | --- | --- |
| A. One class, accurate wording | Keep judgement; describe it as posture that strains the neck (forward head or looking down) | No |
| B. Separate kinds | Classify forward head vs looking down and add a kind to `POSTURE_BAD` | Yes |
| C. Longer hold for looking down | Ignore short look-downs such as note taking | No |

## Decision

- A for now. B needs a distance-robust signal and validation first. C needs data on how long normal look-downs
  last, so a `NOTE_TAKING` recording label is added to measure episode lengths before choosing a hold time.

## Consequences

- No spec change; the UI and docs no longer call every alert "turtle neck".
- Short, legitimate look-downs longer than the 3 s hold (writing notes, reading paper) still trigger alerts until C
  is decided.
- The report's "turtle neck count" label comes from the product plan and still counts both postures; that wording
  is for the product and frontend owners to decide.
