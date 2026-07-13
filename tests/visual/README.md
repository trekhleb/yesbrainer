# Visual tests — the app's screen inventory

Playwright screenshot tests that double as a **living inventory of every
important screen and state** the UI can render. They're a regression net
(a diff fails CI when a shot changes), but they're also meant to be
*browsed* — for UX review, design work, or grabbing figures for a blog
post. `npm run test:visual:gallery` assembles all the baselines into one
contact-sheet page.

## How it works

Everything renders **offline** against a throwaway Vite server on port
`5199`. No provider is ever called:

- **Fake BYOK keys** (`seedFakeKeys`) unlock seats, pickers, and composer
  controls — cloud reachability is optimistic, so a key that *looks*
  present is enough for the UI (the app only makes a real call on send).
- **A fixture bundle** (`fixtures/bundle.ts`) supplies five mocked
  councils covering every persisted chat state. It's injected once, in
  `seed.setup.ts`, through the app's **own** Settings → Storage import
  path — the same zod-validated restore a real user runs — and the
  resulting browser state (localStorage + IndexedDB) is saved to
  `.state/seeded.json`. Seeded specs restore it with
  `test.use({ storageState: SEEDED_STATE })`.

Because the fixtures ride the real import path, a fixture that drifts from
the app's schema fails **loudly at the seed step** ("Imported N … 0
errors" is asserted) rather than quietly producing a blank screenshot.

Every spec runs at **both form factors** — desktop (1440×900) and mobile
(390×844, 2× DPR, touch). This is a mobile-first app, so the phone
baselines are first-class, not an afterthought.

## The fixture councils

| id | structure | what it exercises |
|---|---|---|
| `vf-trial` | Trial verdict | answers → peer votes (leaderboard, agreement, winner) → Judge verdict; a 2nd turn with an **errored voter** (retry + raw-response inspector). Most-recent, so `/` lands here. |
| `vf-consensus-a` | Consensus | debate that **converges on round 2** — divergence framing, per-round movement digest, final summary. |
| `vf-parallel` | Parallel | markdown-rich fan-out, a **web-search tool-call strip**, an **image-attachment turn** with a ghosted non-vision seat, and an **errored seat**. |
| `vf-consensus-b` | Consensus | debate that **hits the round cap** still divergent (agreements + remaining conflicts), plus a turn with an **errored Mediator round**. |
| `vf-solo` | Parallel of one | the degenerate single-seat "plain chat", with fenced code blocks (Shiki). |

Import order is recency (`createCouncil` stamps a fresh `createdAt`), so
the array order in `buildFixtureBundle` decides which council `/` opens.

One fixture lives **outside** the seed bundle: `vf-markdown`
(`fixtures/markdown-council.ts`), the markdown prose inventory used by
`13-markdown.spec.ts`. It's imported at runtime inside that spec's own
browser context — a sixth council in the seed bundle would add a sidebar
row to every full-page baseline in the suite, and the markdown shots are
element-scoped (`.md-content`) so they don't need to be seeded. The spec
also hides the composer dock + scrim and pins sticky pane headers before
shooting: floating chrome overlaps tall prose at scroll-dependent
offsets, which flakes element screenshots.

## Running

```bash
npm run test:visual            # compare against committed baselines
npm run test:visual:update     # rewrite baselines after a deliberate UI change
npm run test:visual:gallery    # build __screenshots__/index.html contact sheet
npx playwright test 05-council-trial   # one spec file
npx playwright test --project=mobile   # one form factor
```

Baselines live in `__screenshots__/<spec>/<shot>-<project>-<platform>.png`
and **are committed**; `.state/` and the generated `index.html` are not.
First run of a brand-new shot writes its baseline and fails that one test
as a nudge to eyeball the image before committing it.

> Container note: this repo's sandbox needs
> `source ~/.local/chromium-libs/env.sh` before the browser will launch.
