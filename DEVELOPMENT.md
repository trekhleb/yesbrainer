# Developing Yes-Brainer

How the app is built and how to work on it. The product story — what the app is and why — lives in [README.md](./README.md).

## Architecture

```
user turn
    │
    ▼  fan-out: one parallel stream per seat, browser → provider API (BYOK, direct)
Participant answers
    │
    ├─ Parallel:  done — the answers are the result
    ├─ Trial:     anonymize → peers vote → Judge synthesizes one verdict
    └─ Consensus: debate rounds until convergence (or round cap) → Mediator summary
    │
    ▼
Dexie / IndexedDB (on-device) — every completed event persisted; reload rehydrates
```

**Key property:** the app is a static bundle. There is no server we operate. Every provider call is made directly from the browser to the provider's own domain (`api.anthropic.com`, `api.openai.com`, …, or `localhost:11434` for Ollama). The "BYOK keys never leak server-side" property holds *because there is no server-side*.

## Dev workflow

- **First-time setup:** `nvm use`, then `npm install`. Node/npm are pinned (see [Conventions](#conventions)); `npm install` fails fast on a mismatch (`engine-strict`). The visual suite additionally needs a one-time `npx playwright install chromium` per machine (browser binaries live in a global cache, not `node_modules`).
- `npm run dev` — Vite dev server at http://localhost:5173. That's the whole loop.
- `npm run dev-secure` — HTTPS dev for testing on a phone over the LAN (a LAN IP over plain http is not a secure context, so `crypto.randomUUID` / clipboard are unavailable). Self-signed cert minted by `scripts/gen-dev-cert.mjs` (git-ignored `certs/`); the browser warns once. PWA *install* needs a trusted cert — test that against the deployed site.
- `npm run lan-relay` — only when the dev server runs inside a sandboxed container (port forwarded to the host's `127.0.0.1` only). Run it natively on the laptop; it pipes raw TCP from the LAN IP to `127.0.0.1:5173`.
- `npm run build` — `tsc -b` + Vite build + `scripts/prerender.mjs`, which emits `dist/404.html` (the GitHub Pages SPA fallback for per-user paths — served with an HTTP 404 status, so crawlers rightly skip them), one static file per public document route, and `dist/sitemap.xml`. See [Public documents & prerendering](#public-documents--prerendering). Deployed by `.github/workflows/deploy.yml` on push to `main`.
- `npm run typecheck`, `npm run lint`, `npm run typecheck:coverage` — the last enforces ≥ 99.7% strict type coverage (share of identifiers that aren't `any`); the remainder is deliberate cast-at-the-boundary sites.
- `npm test` — unit + component tests (Vitest + Testing Library + jsdom, `tests/unit/`). Provider-mocked and DB-in-memory (`fake-indexeddb`), so fully offline and deterministic; covers the orchestrator, phase modules, retries, provider runners, storage, import/export defences, pure utils, and load-bearing components. `npm run test:coverage` enforces the floor (95% lines); runs files sequentially (`fileParallelism: false` — the jsdom + coverage combination OOMs otherwise). Rendered-pixel correctness is the visual suite's job, not duplicated here.
- `npm run test:visual` — Playwright visual snapshots (`tests/visual/`): a regression net *and* a browsable inventory of every important screen/state, at desktop 1440×900 + mobile 390×844 viewports, against committed baselines in `tests/visual/__screenshots__/`. Fully offline: fake keys + a fixture bundle injected through the app's own zod-validated import. After a deliberate UI change, `npm run test:visual:update` refreshes baselines; `npm run test:visual:gallery` builds a contact sheet. Strategy in [`tests/visual/README.md`](./tests/visual/README.md).

To wipe local state: DevTools → Application → IndexedDB → delete `yesbrainer`, plus `localStorage` keys prefixed `yesbrainer:`. A fresh browser with no usable model shows the [first-run onboarding](./README.md#first-run-onboarding-no-usable-model).

### Model registry

`src/models/registry.ts`: each entry has `modelId`, label, provider adapter, tier (paid/free/local), `country`/`developer` (editorial — powers the *diverse council* angle), capability hints (tools, vision, reasoning), context window. Adding a native model = one entry (+ a provider package if new).

**Unlisted ids resolve to a fallback entry, never a throw.** Every persisted `TurnEvent` snapshots its `modelId` and councils/imports outlive catalog churn, so `getModel()` on an unknown id returns a cached stub (label = `"<id tail> (unlisted)"`, provider parsed from the prefix, capabilities off) instead of throwing. Registry policy stays "prefer never removing entries" — the fallback is the safety net, not licence to churn.

**The OpenRouter slice is generated.** Native providers are hand-maintained in `registry.ts`; OpenRouter models live in `registry.generated.ts`, written by `npm run update-models-catalog` (fetches the public model list, filters to a curated allowlist, derives capabilities; committed so the bundle never fetches at runtime). It also prints newly discovered models from tracked vendors — the nudge when something new ships. Native `providerModelId`s are bumped by hand.

### Provider packages

`@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google`, `@ai-sdk/groq`, and `ollama-ai-provider-v2` (community). OpenRouter needs no package — it speaks OpenAI's API, so the OpenAI adapter is re-pointed at `https://openrouter.ai/api/v1`. Every provider's origin is recorded in `src/providers/endpoints.ts` (`satisfies Record<ProviderId, string>`), and the production build **asserts each origin is in the CSP `connect-src` allowlist** — a wired provider that skipped the CSP edit fails the build. These run only in the browser (`dangerouslyAllowBrowser: true` or equivalent per provider); there is no other bundle.

### Persistence

[Dexie.js](https://dexie.org/) on IndexedDB — a single on-device database (`yesbrainer`). Typed queries, compound indexes, version-based migrations, ~25 KB.

- `councils` — `{ id, title, createdAt, updatedAt, socialStructure, judge?, mediator?, deliberation?, tokenTotal }`; indexed by `updatedAt` and `createdAt`.
- `seats` — `{ id, councilId, modelId, config, order }`; indexed by `councilId`.
- `turns` — `{ id, councilId, idx, userMsg, userImages?, events, tokenTotal }`; indexed by `[councilId+idx]`.

`turns.events` is an append-only list — adding a new role type needs no schema migration. **Event write timing:** Dexie `put` happens once a role's stream completes, never incrementally; a reload mid-stream discards the in-flight event and persisted state stays consistent.

**Durability.** Browsers treat IndexedDB as best-effort cache (evictable under disk pressure; Safari iOS wipes after ~7 days of PWA non-use). The app calls `navigator.storage.persist()` on the first meaningful write (idempotent helper — safe to call repeatedly), which moves the origin into the user-data bucket where only explicit user actions can wipe it; it re-checks `persisted()` each launch and nudges via the Settings storage badge when not granted, and surfaces `estimate()` as a quota meter in Settings → Storage. What persist does *not* fix — clear-site-data, PWA uninstall, device loss — is covered by JSON export/import (Settings → Storage); there is no "we lost your data" recovery, only the export you keep. Cross-device sync is export/import until BYOS (sync via the user's own cloud) lands.

## Conventions

- **Named exports/imports only** (no `export default`).
- **Lowercase component filenames** (`app.tsx`, not `App.tsx`).
- **Node pinned** (exact version in `.nvmrc` — the single source of truth; `package.json` `engines` major-locks node + npm; `.npmrc` `engine-strict=true` makes a mismatch a hard install failure; CI reads `.nvmrc` and installs with `npm ci`). Bump deliberately: edit `.nvmrc` + `engines` together and regenerate the lockfile.
- **Flat `src/` layout.** One root, feature folders inside; `@/*` → `src/*` for both type and value imports.
- **`import type` for type-only imports.**

## Engineering principles

- **Simplicity over complexity.** Default to the smallest design that works; no abstractions unjustified by code that exists today. Clear, linear flow beats clever indirection.
- **DRY.** Shared logic in one place; a third copy is one too many.
- **SRP + small modules.** Each module/function does one thing; no thousand-line files.
- **Type-safe boundaries.** Single source of truth for shared types — registry, role I/O, storage schemas, zod validators. `strict: true`, `noImplicitReturns`, `noUncheckedIndexedAccess` — every array/record access is `T | undefined`; prefer `arr.at(-1)` over `arr[arr.length - 1]`. Casts from `unknown` (JSON.parse, Dexie reads, imports) go through a runtime shape guard, never a typed lie.
- **Test the load-bearing parts.** New logic ships with a unit test; new screen states ship with a visual baseline. Don't duplicate render assertions across both suites.
- **Readable > clever; no premature abstraction.** Optimize for the next reader; wait for the third use case before extracting.


## UX & design

The README carries the product-facing UX story; this section holds the principles UX decisions are held against and a map of the design system. Per-surface layout detail lives in each component's header comment.

### UX principles

- **Mobile-friendly first.** Designed for phones as much as desktops; the sidebar collapses to a drawer.
- **Minimalistic and intuitive.** Obvious primary actions; power controls in optional panels; sensible defaults handle 80%.
- **Familiar patterns.** Borrow from ChatGPT / Claude / Gemini where the convention works (composer placement, sidebar, bubbles); save novelty for the genuinely new — roster, social structures, leaderboard.
- **Accessible.** Keyboard navigation, screen-reader labels on icon-only controls, WCAG AA contrast. Baseline, not a polish pass.
- **Fast.** Streaming starts the instant a model produces tokens; no spinners where progress can be shown.
- **No functionality limiter.** Each LLM's native capabilities (variants, tools, attachments, reasoning) are exposed per role assignment.

### Design language

One coherent visual system instead of stock Base Web (theme pair in `src/styles/app-theme.ts`):

- **One accent, used sparingly** — indigo-violet on primary actions, focus, links, the user bubble; everything else neutral, so "what's interactive" is scannable.
- **Colour = council type.** Each in-chat phase wears its council type's colour (`utils/role-colors.ts` reads `structureColorSet`): Judge wears Trial's, Mediator wears Consensus's, the answer fan-out wears Parallel's. Voting keeps its own gold — the "score" cue, deliberately distinct from the verdict it precedes. The tint lives on the answer *card* (border + header bar), never a frame around the block; stage headers stay neutral with a gradient role icon-chip (`role-icon-chip.tsx`).
- **No fake affordances; banners are for problems.** Read-only controls that look clickable, and permanent info banners, get demoted to plain text — the two deliberate exceptions are the Keys/Storage privacy banners (the headline product property, stressed on purpose).
- **One shared type chip** (`structure-pill.tsx`) reused by sidebar cards, the New-council picker, and /about, so the type reads identically everywhere.
- **Unified geometry & iconography.** One radius scale (10/12/14–16px); two stroke-compatible icon families (Feather + Lucide) with one deliberate exception (filled trophy = winner). Modal headers wear the icon of the trigger that opened them; sliders = council settings everywhere, the gear stays reserved for app-level Settings.
- **Edge-to-edge installed PWA.** The app draws under a transparent status bar (metas + full rationale in `index.html`), so every full-bleed surface owns its `env(safe-area-inset-*)` padding: header and mobile drawer (top), composer and error overlay (bottom / both). iOS bakes the status-bar metas in at Add-to-Home-Screen time — re-add the app when testing changes to them.

## Code patterns

Concrete rules and reusable building blocks. **Reach for these before writing your own copy** — duplication is the most common source of drift in this codebase.

### Storage layers

Two persistence layers, each for a different lifetime + reactivity story:

- **IndexedDB via Dexie** for council content — canonical app state, survives reloads. See *Dexie persistence patterns* below.
- **`localStorage`** for view prefs, BYOK keys (`yesbrainer:keys`), the Ollama toggle, and tunable knobs — small, synchronous, "set once" data.

Rules across both:

- **Shape-guard every `JSON.parse`.** Cast-only is a typed lie — corrupt payloads (DevTools edits, hostile imports) flow through silently.
- **Use `createReactiveLocalStorage<T>()` for any new keyed-shape store** — it owns the guarded read, the write, and the in-tab change event; `useReactiveStorage` is the matching React subscription. Never hand-write `getItem`/`setItem` + `dispatchEvent` boilerplate.
- **Behavior knobs live in `src/storage/behavior.ts`**, each optional, resolved `?? DEFAULT_*` at the call site so untouched settings never change orchestrator output.
- **Call `navigator.storage.persist()` on first meaningful write** — the helper is idempotent (see [Persistence](#persistence)).

### Read-boundary normalization

Dexie rows are **not re-validated on read** (zod guards only the import path), so persisted enum-ish fields are coerced onto the current union at the read boundary — a stale row written by an older build must degrade, never crash. Live instances, in `src/types/council.ts`, applied by every row→domain mapper: `normalizeSocialStructure` (unknown ids → `custom`, the structure every surface renders neutrally) and `normalizeSeatConfig` / `normalizeSynthesiser` (off-union `reasoningEffort` dropped). The export mapper normalizes too, so a bundle written from stale rows still round-trips the import schema.

The recipe for the next one: put the normalizer next to its union in `types/council.ts` (the zod enum derives from the same `*_VALUES` const), wire it into every read-path mapper, and keep Dexie *writes* on the new shape only. Keyed lookups that render must stay total regardless (`structureColorSet` falls back to `custom`).

### Dexie persistence patterns

- **Zod validation guards the untrusted boundary, not every write.** The JSON import path is validated to the leaves (`storage/bundle-schema.ts`); ordinary orchestrator writes carry values our own code just constructed and are not re-validated.
- **Token aggregation inside a Dexie transaction.** When mutating a turn's events, recompute its `tokenTotal` and apply the council delta in the *same* transaction — use `applyTurnEventsUpdate(...)` in `src/storage/councils.ts`, which owns the sequence.
- **Schema migrations via Dexie versioning** (`db.version(N).stores().upgrade()`) for additive index changes; data-shape changes layer at the read boundary instead, so historical rows stay legible without rewriting.
- **Imports are all-or-nothing per council** — one transaction per council; a failure on turn *k* rolls back to nothing and lands in the report's `errors[]`, never a stranded partial council.

### Orchestration hook pattern

`useCouncilSession` is the orchestrator. The conventions:

- **Optimistic local update + revert on error.** Mutate local state immediately, fire the Dexie write, revert on rejection (`use-seat-crud.ts` carries the shape).
- **Single `AbortController` per in-flight phase**, stored in `abortRef`, cancelled by `stop()`, registered in the per-council stream registry (`utils/session/active-streams.ts`): runs deliberately outlive the council view — switching away lets a turn finish and persist — but deleting a council aborts everything it still has in flight. Cleanup lives in a `finally`, so a thrown phase can't wedge `busy`.
- **Phase state is independent.** `streamingTurn`, `votingTurn`, `mediatingTurn`, `judgingTurn`, `seatRetry` each represent one in-flight phase; `busy = !!any-of-them` gates new turns.
- **`EMPTY_TOKENS`-aware reducers.** Subtract the previous total and add the new one — don't re-sum every event.

**Sub-hooks in `src/hooks/session/`.** The orchestrator owns the per-turn pipeline; orthogonal concerns live in hooks it composes: `use-seat-crud.ts` (config writes), the retry-hook family (`use-retry-seat.ts` / `use-retry-synthesis.ts` / `use-retry-votes.ts` — one hook per recoverable failure, all the same shape, sharing `retry-run.ts` mechanics and replacing errored events in place), and the **phase modules** (`run-trial-phase.ts`, `run-consensus-phase.ts`, `run-voting-phase.ts`) — pure functions that own their state machine and **return events for the orchestrator to persist**, never writing storage themselves. Shared event builders in `utils/session/` (`participant-event.ts`, `vote-event.ts`, `mediator-round.ts`, `sampling-args.ts`) are the single constructors for their event types, so a live phase and its retry can't drift in prompt framing or event shape.

When you add a new role/phase, pick the same shape: orthogonal concern → a `use-*.ts` hook; per-turn phase → a `run-*-phase.ts` pure function; an event two call sites build → a `build*Event` in `utils/session/`.

### Logging discipline

- `console.warn` / `console.error` in **error paths only**; no `console.log` in committed code.
- Prefix with the call site (`[runVoteGeneration]`) so the line is greppable; include the `modelId` when a model is involved.

### Public documents & prerendering

Most routes are per-user client state (`/council/:id`, `/settings`) and are deliberately unindexable — they fall through to `dist/404.html`, which Pages serves with a 404 status. A handful are *documents*: the same content for everybody, worth finding from outside. Those get a prerendered file.

The shape, and why:

- **`scripts/seo-routes.mjs` is the manifest** — the single source for which paths get a file *and* what lands in `sitemap.xml`, so a page and its sitemap entry can't drift. `scripts/prerender.mjs` consumes it. The sitemap is generated, never hand-written; there is no `public/sitemap.xml`.
- **Every manifest `path` must also be a real client route** (`src/hooks/use-app-route.ts`) — a prerendered file without one renders the shell's fallback after mount, i.e. a visible content swap. This pairing is manual; nothing enforces it.
- **Prerendering is head rewrites plus body text, not SSR.** Each file is `index.html` with its own title/description/canonical/OG-Twitter tags, and content routes additionally get real text inside `#root`, replacing the boot splash. `createRoot` clears `#root` on mount, so React swaps it for the live app — no hydration contract, no styletron SSR, and the pre-mount window shows content instead of a splash. Prerendered text may be *shorter* than the app's (demo answers are excerpted); it must never be *different*.
- **Every rewrite asserts exactly one match** and fails the build otherwise, so head drift in `index.html` breaks CI rather than silently shipping homepage meta on a subpage.
- **Content that appears in both places lives in one file.** `/vs/:slug` prose is in `src/models/comparisons.json`, read by the app *and* the build script; `resolveJsonModule` is on so the typed assignment in `comparisons.ts` fails typecheck if the JSON drifts from `Comparison`.
- **`slugify` is duplicated on purpose** — `src/utils/slug.ts` for the app, `scripts/slugify.mjs` for the build (a `.mjs` can't import `.ts`). `tests/unit/utils/slug.test.ts` asserts parity over the demo titles that actually ship; without it, a drift emits `dist/demo/<slug>.html` at a URL the app resolves to nothing.
- **Demo councils are addressed by title slug (`/demo/:slug`), not by council id** — ids are per-device local state and meaningless in another browser. Resolved against the live list, so deleting a demo stops resolving rather than dangling.
- **No QAPage/Question structured data on demo pages.** Google scopes that type to pages where *people* submit answers; these are model output, and marking them up as community Q&A to chase a rich result is structured-data misuse. They inherit the shell's `WebApplication` block.
- **Known, accepted: the service worker swallows non-precached root files in-browser.** Workbox answers every navigation with the precached `index.html`, so `/llms.txt`, `/robots.txt` and `/sitemap.xml` render the app shell for anyone who has the SW installed. It affects humans typing those URLs and nothing else: the origin serves the files correctly (`curl` proves it), and crawlers — the only real consumers — don't run service workers. A `navigateFallbackDenylist` fixes it if it ever becomes worth doing; scope it to *root-level* paths with an extension, not "any path with a dot", since an imported council id is only `z.string().min(1).max(1_000)` (`bundle-schema.ts`) and `/council/notes.v2` must keep reaching the shell offline.
- **Standalone document routes must be added to `chromelessPage` in `app.tsx`** — that flag also guards the "land on a valid council" effect, so a visitor arriving from search stays on the page they asked for instead of being bounced to their most recent council.

### Workflow

- **Run `npm run typecheck` after every TypeScript change.** The canonical "did I break the build" check; any new strict-family error is a real bug, not noise.
- **Run `npm run lint` before declaring a slice done.** The count is zero — keep it there. Lint is type-aware: `no-floating-promises`, `no-misused-promises`, `await-thenable`, and `switch-exhaustiveness-check` are errors.
- **Run `npm run typecheck:coverage` when a change adds a cast or touches `any`.** CI enforces the 99.7% floor; a new `any` is a deliberate boundary exception, not a shortcut.
- **The docs are part of the change.** Update the owning doc in the same commit — a design decision or code-pattern change lands here, a product-facing change in `README.md`. One fact, one file. Edit stale lines rather than appending alongside them. Capture *why*, not *what*.


## Security principles

Stability and safety are non-negotiable. The app must hold these properties at all times.

- **No backend = no backend surface.** No auth, no sessions, no server-side state — the properties we used to *enforce* server-side are replaced by the absence of the system that would have needed enforcement.
- **API keys never reach our server — because there's no server.** LLM calls go browser → provider directly.
- **Defensive against prompt / output injection.** All model output is untrusted: sanitized markdown rendering only, no `dangerouslySetInnerHTML` or `eval` on model content, tool-call arguments schema-validated before execution.
- **Validated boundaries.** Anything entering the system (model output, URLs, JSON from localStorage / IndexedDB / imported files) is shape-checked at the boundary; fail early with sanitized errors that never leak secrets. A hostile JSON import is the app's closest thing to an untrusted-input vector.
- **Anonymization integrity.** Model self-identification is stripped from Participant outputs before the peer-review pool (`strip-self-identification.ts`), unconditionally — a correctness property of anonymized voting, not a preference. The reverse direction has a contract too: display-time de-anonymization of Mediator prose (`deanonymize` in `utils/chat-panes.ts`) is a literal `Model X` string replace, so the Mediator prompt pins prose references to that exact singular form — plurals or bare letters otherwise reach the user half-translated.
- **Dependency hygiene.** Lockfile-pinned, first-party preferred, periodic `npm audit`. The dep surface shrank substantially when the backend was deleted — keep it that way.

### Security checklist for every new feature

Users trust this app with two things — **their API keys and their conversations** — and when a leak channel appears, it appears through one of a small set of recurring doors. Every new feature walks this list, and updates `SECURITY.md` in the same commit when the posture shifts:

- **New outbound endpoint?** Extend the CSP `connect-src` allowlist in `vite.config.ts` deliberately — never a wildcard. If the endpoint isn't a model provider the user chose, it doesn't belong in this app (no CDNs, no font hosts, no third-party telemetry) — the single carve-out is the self-hosted analytics collector (env-injected so forks default to none; closed pageview payload; the full disclosure lives in `SECURITY.md`). A new provider is build-asserted via `src/providers/endpoints.ts`. Verify the built `dist/index.html` still carries the meta-CSP and zero inline scripts.
- **New error path?** Every `unknown` error that is persisted, rendered, **or logged** goes through `extractErrorMessage` / `logRedactedError` — never `console.*(err)` with the raw object. Provider SDK errors can serialize the failing request's auth header; the console is a leak channel too.
- **New render of model output / imported text?** Through `<Markdown>` (sanitized) or plain text nodes only. Never add `rehype-raw` — the sanitize schema's `style` allowance is only safe because raw HTML in model output never parses into elements (invariant documented in `markdown.tsx`).
- **New data crossing in from outside?** Zod-validate at the boundary down to the leaves before any write — `storage/bundle-schema.ts` is the template, including its length ceilings (a crafted file can't smuggle unbounded payloads). Merge semantics must never let crafted input overwrite existing rows. URL params stay presence-flags / opaque id lookups.
- **New storage?** localStorage via `createReactiveLocalStorage` under a `yesbrainer:*` key — the factory-reset path wipes by prefix, so the prefix is load-bearing. Nothing sensitive ever enters rows that feed the export bundle: **exports must stay key-free by construction** (`transfer.ts` maps explicit fields, never spreads).
- **New external link?** `target="_blank"` pairs with `rel="noopener noreferrer"`, always.
- **New build script consuming remote data?** If it writes committed source (like `update-models-catalog.mjs`), every interpolated value must be inert — or a compromised API response becomes code in the bundle.
- **New dependency?** First-party preferred; `npm audit` clean; the entire dep tree executes in-page with key-reading rights — CSP bounds *exfiltration*, not execution. A new dep is a bigger decision here than in a server app.
