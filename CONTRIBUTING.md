# Contributing to Pyeobugi AI

Webcam-based forward head posture coach for macOS/Windows (Electron + React + TypeScript).
Detection runs fully on-device; only anonymous event logs are sent to the server.

## Project Rules

- Video, face images, landmarks, pitch, face size and the calibration baseline NEVER leave the device.
  Only the events defined in the API spec (`src/shared/events.ts`) may be sent.
- MediaPipe wasm and model files are bundled with the app, never loaded from a CDN.
- Low power is a primary requirement: prefer lower detection frequency, smaller input resolution and
  lighter models. Record any change in power or accuracy in `docs/progress.md`.

## Commands

- `npm run dev` — run the Electron app with hot reload
- `npm test` — unit tests (Vitest)
- `npm run typecheck` — TypeScript check
- `npm run build` — production bundle into `out/`

# Workflow

## Branch Strategy

- `main`: release only. Merged from `dev` when a version is ready.
- `dev`: integration branch. Every feature branch starts here and merges back here.
- `feature/<short-name>`: one branch per feature, branched from `dev`, merged into `dev` with `--no-ff`.
- `fix/<short-name>`: bug fixes, same flow as feature branches.
- Never commit directly to `main`.

## Collaboration

### Code Styles

- Use modern language features
- Limit lines to 120 characters maximum.
- Prefer pure functions where possible.
- NEVER write docstrings, function descriptions, or line-by-line comments.
- Only add inline comments to explain the *why* of non-obvious business logic, not the *what* of the code.
- Code comments in English; UI strings in Korean.

### Commit Template

`<category>: <short_summary>`

- categories: 'feat', 'fix', 'refactor', 'docs', 'test', 'chore', 'perf'
- example: `feat: add validation to prevent crash on special chars`
- **70 chars max**, imperative, English only
- No body lines and no co-author trailers.

## Progress Log

- Keep a running log of work in `docs/progress.md`.
- One dated section per work session (`## YYYY-MM-DD — short title`), newest at the bottom.
- Each entry: what was done, key results (tables/numbers where relevant), and a `### Next` list of
  what's left. Write it so a teammate can pick up context without re-reading the whole diff history.

## Architectural Decision Record (ADR)

- Save all ADRs in the `docs/adr/` folder.
- Use 4-digit numbers so the ADRs stay in order: `docs/adr/NNNN-decision-title.md`

### ADR Template

- Title: A short name (e.g., Use PostgreSQL for Database)
- Status: Draft, Accepted, Rejected, or Deprecated
- Date: Date & time
- Context: What is the problem and what rules limit your choices?
- Options: What other choices did you think about?
- Decision: What is the final choice and why?
- Consequences: The pros, cons, and trade-offs of this choice.
