# Integration tests — the app actually running

The other two suites stop short of a send. `npm test` exercises the
orchestrator in jsdom with `runParticipantStream` mocked out; `npm run
test:visual` seeds councils that are *already finished* and photographs
them. Neither ever produces a turn.

These specs do. A real composer submit goes through the real
`@ai-sdk/anthropic` adapter, over a real `fetch`, into real IndexedDB —
with only the provider's HTTP response replaced.

```bash
npm run test:integration                          # the suite
npx playwright test --config=playwright.integration.config.ts 02-trial
```

## Why the seam is at HTTP

AI SDK ships `MockLanguageModel`, and using it would be less work. It's
the wrong layer: it needs a test seam in production code, and it skips the
adapter, `fetch`, streaming, and CSP — precisely the plumbing this suite
exists to cover. Mock any higher and you've rebuilt the unit tests in a
browser.

So `mock-anthropic.ts` intercepts `POST /v1/messages` with `page.route`
and answers in Anthropic's own wire format. The cost is real: the double
encodes assumptions about what the adapter sends and accepts, and an
`@ai-sdk/anthropic` bump can invalidate them. That coupling is the point —
those assumptions are load-bearing in production and nothing else checks
them.

## Served from `dist/`, not the dev server

`playwright.integration.config.ts` runs `vite preview` over a fresh build.
That's the deliberate difference from `playwright.config.ts`, and it's
about the CSP: `cspPlugin` is `apply: 'build'`, so the policy exists only
in the built bundle. A dev-server suite could never catch a `connect-src`
mistake, and that failure is total — the renderer blocks the provider call
before it reaches the network, so the app is broken in production while
every test stays green.

Running against the build inverts it: a blocked request never reaches
`page.route`, so a CSP regression fails these specs. `03-key-boundary`
additionally reads the shipped policy directly.

`reuseExistingServer` is off. `vite preview` serves whatever `dist/` held
when it booted and, unlike the dev server, never reloads — reusing a stale
one would silently test old code. The rebuild costs ~15s.

## One provider, three models

Every council is seated with Anthropic models, so the suite maintains one
wire format. Cross-provider coverage belongs in a thinner test that
asserts each adapter's outbound request without needing a valid response.

Seats are told apart by `body.model`, never by call order — fan-out is
concurrent, so arrival order is not deterministic. `SEAT_MODELS` in
`helpers.ts` holds the three, all ids `getModelCapabilities()` recognises
so `generateObject` stays on the native structured-output path.
`anthropic:claude-opus-5` is avoided on purpose: at
`@ai-sdk/anthropic@3.0.93` the adapter doesn't know that id and falls back
to a forced `json` tool call. The mock handles both shapes — pinning the
path just keeps the specs about the app rather than the negotiation.

## Determinism

- **`Math.random` is seeded** (`seedRandom`). `buildVotingLabels` shuffles
  the seat→label assignment every turn — deliberate, since it defeats
  cross-turn brand inference — and without a seed no vote assertion is
  stable.
- **Votes are scored by content, not label.** Each seat answers with a
  distinct marker and the vote handler rates whichever label sits above
  the marker it prefers. The expected winner is then fixed regardless of
  the shuffle, *and* an inverted label→seat mapping would crown the wrong
  seat — which is what makes `02-trial` a real anonymization test rather
  than a rendering one.
- **Unscripted calls fail loudly.** A role the script doesn't cover throws
  in the route handler instead of falling through to the network, so an
  unmocked call can't masquerade as a model error and quietly pass.

## Two things that will cost you an hour

- **The AI SDK retries 429s and 5xx itself.** A mocked rate limit that
  succeeds on the next attempt never surfaces as a seat error — the SDK
  swallows it and the run looks clean. Use a non-retryable status (400,
  401) whenever a spec needs the failed-seat state.
- **`addInitScript` re-runs on every load.** `seedKeys` / `suppressDemos`
  therefore reassert themselves after any reload, including the hard
  reload a factory reset performs. Don't write assertions about
  localStorage being *cleared* in a profile that seeds it this way — the
  wipe really happened, the init script just put it back.

## The flows

| Spec | Covers |
|---|---|
| `01-activation` | The first five minutes: no-key gate → paste key → create council → ask → answer persists across reload. Widest blast radius; runs on a pristine profile with demo seeding left on. |
| `02-trial` | Fan-out → anonymized peer voting → leaderboard → Judge verdict → persisted. The only flow driving both `streamText` and `generateObject`, and it asserts anonymization integrity: no brand cue reaches a voter, and `stripSelfIdentification` removes a planted "As Claude, …" opener. |
| `03-key-boundary` | The key reaches `api.anthropic.com` in a header and no other external origin is contacted at all; the shipped CSP allows the provider origins and stays an allowlist. |
| `04-error-redaction` | A 401 whose body echoes the key back surfaces as `[redacted]` in the UI, in the persisted event after reload, and in the console. |
| `05-demos` | The keyless path: demos seed and open with no credentials, every permalink the build published resolves in the app, and reading one costs zero provider calls. |
| `06-consensus` | The debate loop, both endings — converged on round 2, and stopped by the round cap while still divergent. Asserts the loop's shape (one Mediator call per round, one re-answer per seat) so it can't run away against the user's own key. |
| `07-multi-turn` | A follow-up turn puts the earlier question *and* answer on the wire for every seat; the titler runs once per council, not per turn. |
| `08-export-import` | Export → factory reset → re-import, the app's only recovery story. Also that the exported bundle carries no key material. |
| `09-seat-retry` | One failed seat retries alone — exactly one extra provider call, for the right seat, replacing the errored event rather than appending. |
| `10-routing` | React Router **history semantics** — push vs replace, and what back does about it. Written as upgrade insurance: path matching is covered elsewhere, but whether a navigation pushes or replaces is invisible on screen, untestable under the unit suite's `MemoryRouter`, and exactly what shifts between router majors. |

## Known limitation

`route.fulfill` sends a complete body, so SSE arrives buffered rather than
progressively. The stream is genuinely parsed and accumulated, but these
specs can't observe partial paint mid-stream. Serving from a local
streaming server is the upgrade path if that becomes worth testing.

> Container note: this repo's sandbox needs the Chromium staging recipe
> before the browser will launch — same constraint as the visual suite.
