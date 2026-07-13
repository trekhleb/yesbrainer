# CLAUDE.md

Operating manual for working on this project with Claude Code.

## Always start here

The living design doc spans three files — read the relevant ones before any non-trivial change:

- [`README.md`](./README.md) — the product: what the app is and why, roles, social structures, the data-and-keys story, competitors. Also the public repo's landing page, so the copy rules below apply throughout it.
- [`DEVELOPMENT.md`](./DEVELOPMENT.md) — how it's built: architecture, dev workflow, conventions, UX & design, code patterns. Follow its "Engineering principles" and "Security principles" for every change.
- [`SECURITY.md`](./SECURITY.md) — What's stored, where, and who can see it; Defenses in the code; Threat model; What this does NOT protect against; Vulnerability reporting.

## Update the docs as you work

After any design decision or scope change: update the owning doc in the same change — decisions, patterns, and principles land in `DEVELOPMENT.md`; product-facing changes in `README.md`; security-related changes in `SECURITY.md`. One fact, one file — the others link to it, never restate it. Keep it compact — edit stale lines, do not append next to them. Capture *why*, not *what*.

## Typecheck after every change

Run `npm run typecheck` after any edit that touches TypeScript — the canonical "did I break the build" check. The project runs with **`strict: true`**, **`noImplicitReturns: true`**, and **`noUncheckedIndexedAccess: true`** (see `tsconfig.app.json` / `tsconfig.tests.json`). Treat any new error from a tsc-strict flag as a real bug, not noise — those flags are tuned to catch off-by-one / null-deref / "this could be undefined" classes of issue.

`npm run lint` is the secondary check (eslint); run it before declaring a slice done. `npm run typecheck:coverage` enforces ≥ 99.7% strict type coverage (share of identifiers that aren't `any`) — run it whenever a change adds a cast or touches `any`; CI (`.github/workflows/ci.yml`) gates on all three.

Unit and snapshot tests may take some time to execute, so launch them sparingly, i.e. after the big chunk of feature is done (not on every change). When a UI change shifts visual baselines, regenerate **only the shots your change actually touches** (scope the Playwright run) — never blanket `--update-snapshots`: dense-text shots drift by sub-1% antialiasing noise across machines, and a blanket update silently blesses unrelated regressions.

## Copy rules (any user-facing text)

Every user-facing string (app UI, README, meta tags, share artifacts, error surfaces) follows this posture:

- **Mechanisms as facts, never outcomes as promises.** "Keys stay in this browser and go straight to the provider" — never "your keys are safe". Verification is offered ("the code is open source, so you can verify that claim"), outcomes stay the user's.
- **No absolutes a pedant can falsify.** Not "nothing leaves your device" (prompts go to providers); not "100% local"; not "free forever" (say "no subscription, no paywall" — present tense only).
- **AI output always carries a point-of-consumption caveat** (thread footer, share-card footer, About hero). Never present council output as advice or truth — the app shows the spread; the judgment is the user's.
- **Key handling names the user's duties** where pasting happens: official-domain check (cross-checkable against this repo's README) and a dedicated, spend-capped, revocable key.
- The software is **as-is, no warranty** (AGPL-3.0 §§15–16) — keep that phrase surfaced in human words (About colophon, README, SECURITY.md), and never add copy that reads as a guarantee of safety, correctness, or availability.
