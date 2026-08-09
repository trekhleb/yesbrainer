---
name: review
description: Yes-Brainer's code-review checklist and doc-routing table. Load whenever asked to review code in this repo — a diff, the working tree, a branch, a commit, or a PR — before reporting any findings, and use it to vet findings produced by the generic /code-review flow. Focus areas — safety (keys, privacy, CSP, unrecoverable on-device data), backward compatibility of persisted shapes, correctness with corner cases, right-sized design, project conventions, right-layer tests, green gates, staff-level readability.
---

# Code review — Yes-Brainer

How to review a change in this repo. The three docs — [README.md](../../../README.md), [DEVELOPMENT.md](../../../DEVELOPMENT.md), [SECURITY.md](../../../SECURITY.md) — are canonical; this file is the reviewer's lens over them, not a second copy. Where they disagree, the docs win — and fixing this file is part of the review.

**The bar.** This is a live, open-source app: real users hold the *only* copy of their data in their browsers, and every diff is public. Review the way a staff engineer at a top-tier shop would: the change must be correct, safe, minimal, and something its author would proudly showcase. "It works" is the floor, not the bar.

## Step 0 — establish intent

State in one sentence what problem the change solves (from the request, issue, or commit message). If you can't, that's already a finding. Then hold the whole diff against that sentence:

- **Solves the actual problem** — the cause, not a symptom, with the original issue's own corner cases covered.
- **Contains nothing that doesn't serve it** — no scope creep, drive-by refactors, or reformatting noise that buries the real change.
- **Breaks nothing that works** — unless changing that behaviour *is* the point, existing flows and existing users' data must behave exactly as before.

## Step 1 — read the owning docs for what the diff touches

| Diff touches | Read first |
|---|---|
| Persisted shapes — `src/storage/`, `src/types/council.ts`, export/import | DEVELOPMENT.md → "The app is live" principle, Persistence, Dexie persistence patterns, Read-boundary normalization |
| Network, providers, CSP — `src/providers/`, `vite.config.ts` | DEVELOPMENT.md → Provider packages, Security principles + per-feature checklist; SECURITY.md → Defenses |
| Orchestration — `src/hooks/session/`, `use-council-session.ts`, `src/utils/session/` | DEVELOPMENT.md → Orchestration hook pattern, Interrupted runs |
| UI components, styles | DEVELOPMENT.md → UX & design |
| Any user-facing string (UI, README, meta tags, share artifacts, error surfaces) | CLAUDE.md → Copy rules |
| Errors, logging | DEVELOPMENT.md → Logging discipline + Security checklist "new error path" |
| Analytics — `src/analytics/` | README → "One counter, fully disclosed"; SECURITY.md → the first-party counter |
| Routes, SEO, prerender — `scripts/`, `use-app-route.ts` | DEVELOPMENT.md → Public documents & prerendering |
| Model catalog — `src/models/` | DEVELOPMENT.md → Model registry |
| Dependencies — `package.json` | DEVELOPMENT.md → Security principles "Dependency hygiene" + checklist "new dependency" |
| Tests | DEVELOPMENT.md → Dev workflow; `tests/visual/README.md`, `tests/integration/README.md` |

Read the full diff *and* enough surrounding code to judge it: the call sites of every changed function, the read path of every write, and the existing building blocks the new code might be duplicating.

## Step 2 — the checklist

### Safety — blockers, zero tolerance

Users trust the app with exactly two assets: **API keys and conversations**. There is no backend copy — corrupted or lost data is unrecoverable, so a data bug *is* a data-loss bug.

- **Secrets.** Every new error path goes through `extractErrorMessage` / `logRedactedError` — never `console.*(err)` with a raw provider object (provider SDK errors can serialize the auth header). Exports stay key-free *by construction*: `transfer.ts` maps explicit fields, never spreads.
- **Network.** No new outbound host unless it's a model provider the user chose. A new provider means `src/providers/endpoints.ts` plus a deliberate CSP `connect-src` edit in `vite.config.ts` — the build asserts the pairing and the key-boundary integration spec re-checks the shipped policy. No CDNs, no font hosts, no third-party telemetry, ever.
- **Untrusted input.** Anything crossing in — imported bundles, URLs, model output, `JSON.parse` of localStorage — is shape-checked at the boundary: zod to the leaves with length ceilings for imports (`storage/bundle-schema.ts` is the template); `<Markdown>` (sanitized) or plain text nodes for model output; no `dangerouslySetInnerHTML`, no `eval`, never `rehype-raw`. Crafted input must not be able to overwrite existing rows.
- **Persisted-shape backward compatibility.** New fields additive, optional, non-indexed; avoid Dexie `version()` bumps (a stale tab gets `VersionError`); absence of a new field must mean the old behaviour; normalize at the read boundary and degrade to the safest inert default — "safest" meaning *can't spend the user's money or lose their work*; export/import keeps round-tripping. A truly unavoidable migration is forward-only, idempotent, and ships with a test opening an old-shape fixture.
- **Privacy.** Nothing new enters the analytics payload without a closed-type change *and* disclosure in README + SECURITY.md in the same commit; content, ids, raw URLs, and titles never qualify.
- **Dependencies.** A new dep executes in-page with key-reading rights — CSP bounds exfiltration, not execution. First-party preferred, `npm audit` clean, explicitly justified. Borrowed code must be AGPL-compatible and attributed.
- **The small doors.** `target="_blank"` always pairs with `rel="noopener noreferrer"`; build scripts interpolating remote data emit only inert values; when voting or Mediator prose is touched, anonymization stripping (`strip-self-identification.ts`) and the literal `Model X` de-anonymization contract stay intact.

### Correctness — bug-free, corner cases covered

- **Hunt the edges**: empty roster / zero events / first / last; `undefined` from every indexed access (`noUncheckedIndexedAccess` flags the site — the reviewer confirms the handling is *right*, not merely present); unknown ids from old rows (fallback entries, never a throw); ceilings and unicode in user text.
- **Interruption at every `await`.** The invariant every phase upholds: *persisted event = done, absent = never happened*. Checkpoints land only at phase boundaries; resume is the same code path as a fresh run; `Turn.runState` present ⟺ the turn is unfinished.
- **Concurrency**: double-submit guards, multi-tab access (Web Locks via `utils/session/run-lock.ts`), one `AbortController` per in-flight phase actually cancelled, cleanup in `finally` so a throw can't wedge `busy`, optimistic updates that revert on rejection.
- **Async discipline**: every promise awaited or deliberately, visibly not (lint errors on floating/misused promises); token totals recomputed in the *same* Dexie transaction via `applyTurnEventsUpdate`.
- **Performance where it's load-bearing**: stream, don't spinner; delta reducers over re-summing; Dexie queries on indexes; no heavyweight dependency for a small utility — the whole app is a static bundle someone's phone downloads.

### Design — right-sized, reusable, not fragile

- **Smallest design that works.** Clear linear flow beats clever indirection; no abstraction before the third use case; no speculative config, parameters, or generality. Overengineering is a finding with the same standing as a bug.
- **DRY through the named building blocks** — duplication is this codebase's top drift source, but the cure is *reuse*, not fresh abstraction: `createReactiveLocalStorage`, `applyTurnEventsUpdate`, the `build*Event` constructors, the `normalize*` read-boundary recipe, the `use-*.ts` / `run-*-phase.ts` shapes, shared UI atoms (`structure-pill`, `role-icon-chip`, `role-colors`).
- **SRP and small modules**, new code landing in the established folder shape.
- **Not fragile**: keyed lookups stay total (explicit fallback), magic values named, invariants typed or asserted — ask "what breaks this silently next year?" and make sure the answer is "nothing quiet".
- **Type-safe boundaries**: no new `any` or cast without a boundary justification (`typecheck:coverage` holds the floor); `unknown` goes through a runtime shape guard, never a typed lie; shared types keep a single source of truth.

### Conventions & readability — the public-showcase bar

- Named exports only; lowercase component filenames; flat `src/` with `@/*` imports; `import type` for type-only imports.
- Reads like the surrounding code: self-explanatory names; comments only for constraints the code can't show; no dead or commented-out code, no debug leftovers; `console.warn`/`console.error` in error paths only, `[callSite]`-prefixed, with the `modelId` when a model is involved.
- **Copy rules govern every user-facing string**: mechanisms as facts, never outcomes as promises; no absolutes a pedant can falsify; AI output carries its point-of-consumption caveat; key-pasting surfaces name the user's duties; nothing that reads as a warranty.
- **UI changes**: hold up at 390×844 and 1440×900; keyboard-reachable; icon-only controls carry screen-reader labels; WCAG AA contrast; full-bleed surfaces own their safe-area insets; design-language tokens respected (one accent used sparingly, structure colours, the radius scale, the two icon families); no fake affordances, no permanent info banners.

### Tests — right layer, no duplication

- Logic → unit (Vitest, offline and deterministic: mocked providers, `fake-indexeddb`). A new screen state → a visual baseline. A change to how a turn actually reaches a provider — adapters, request shape, error paths, CSP, persistence — → an integration spec. Never assert the same thing in two suites.
- Tests assert behaviour, not implementation; concise but explicit, covering the corner cases from the correctness pass — an untested edge found in review names the exact test to ask for.
- A persisted-shape change ships with a test that reads an old-shape fixture.
- Visual baselines: regenerate only the shots the change touches — never blanket `--update-snapshots`.
- Coverage floors hold: 95% lines (unit), ≥ 99.7% strict type coverage.

### Gates — must be green

`npm run typecheck` (any strict-family error is a real bug) · `npm run lint` (zero, type-aware) · `npm run typecheck:coverage` when a cast or `any` is touched · `npm test` once the slice is done · visual / integration suites when their domain moved. Run them — don't take the change description's word for it — and when a user-visible change is still in doubt, run the app.

### Docs — part of the diff

The owning doc is updated in the same change: decisions and patterns → DEVELOPMENT.md; product-facing → README.md; posture shifts → SECURITY.md. One fact, one file; stale lines edited in place, never appended next to; capture *why*, not *what*.

## Step 3 — report

- **Verify before reporting.** Re-read the actual code path behind every suspected bug and check that an existing layer — a read-boundary normalizer, a zod schema, a redaction wrapper, a fallback entry — doesn't already cover it; this codebase's defenses are deliberately layered and generic findings often die here. No speculative "might be an issue" without a concrete triggering scenario.
- **Rank findings**: **Blocker** (safety, key or privacy leak, data loss, persisted-shape break) → **Major** (bug, regression, missed corner case, missing load-bearing test, red gate) → **Minor** (style, simplification, docs) → **Question**. Lead with the verdict: ship / ship after fixes / needs rework.
- Every finding carries `file:line`, what breaks, the concrete scenario that triggers it, and a suggested fix. Batch the minor nits; don't flood.
- Stay in scope: adjacent landmines are notes, not demands. And briefly say what's *good* — a review that can't recognize quality can't rank its absence.

For an extra-deep pass, the user can run `/code-review` (effort levels) or `/code-review ultra` (multi-agent, cloud, billed); findings from those flows still pass through Step 3 before reaching the user.
