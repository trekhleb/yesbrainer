# Demo councils — this folder is the inventory

Each `*.json` file here is **one demo council**, seeded into IndexedDB for
first-run (keyless) visitors so they can explore a real recorded
deliberation in the real UI. The files are in the app's own export format —
no editing required.

## Manage the inventory

| I want to… | Do this |
|---|---|
| **Add a demo** | In the app: sidebar row → ⋯ → **Export** (or Settings → Storage → Export all councils). Drop the downloaded JSON into this folder, renamed with a numeric prefix (see *Ordering*). Done. |
| **Replace a demo** | Overwrite its file (keep the filename). |
| **Remove a demo** | Delete its file. |

`index.ts` glob-imports everything, stamps `isDemo: true` on each council
(so raw exports work unedited), and hands the bundle to the seeder
(`src/storage/seed-demos.ts`), which pushes it through the same
zod-validated import path user backups use.

## Ordering

**The folder listing reads like the sidebar, top to bottom**: the first
file alphabetically (lowest numeric prefix) is the top demo. To put one
demo above another, give it a lower prefix — `index.ts` stamps descending
`createdAt` by file order and the import preserves it. Leave gaps in the
numbering (`10-…`, `20-…`) so future demos slot in without renaming.
Demos always sit *below* the user's own councils (their stamps are pinned
to a past epoch). Order changes apply on the next seed — factory reset
(Settings → Storage → Wipe everything) to see them locally.

## Recording a demo worth shipping

- **The question must be a yes-brainer** — costly if wrong, models genuinely
  disagree, one answer would feel insufficient.
- **Roster**: seats Claude Sonnet 4.6 + GPT-4o + Gemini 2.5 Pro; Judge /
  Mediator Claude Opus 4.8. All three seats are vision-capable, so photo
  demos run without ghosted seats.
- **Curate the take** (recordings are selected, re-roll freely):
  - Parallel: the three answers must *visibly differ*.
  - Consensus: round 2 must show real movement (`shifted`/`moved` chips).
  - Trial: vote spread (not all 5s) + a verdict that synthesizes.
  - **No errored events anywhere** — an error in a demo renders a Retry
    button that can't help a keyless visitor.
  - Photos: your own, no people, reasonably compressed (≲300 KB).

## Seeding rules (implemented in `src/storage/seed-demos.ts`)

- Seeds **once**, only on pristine profiles (no `yesbrainer:demos-seeded`
  flag **and** zero councils). Users who delete a demo never get it back —
  except via **factory reset** (Settings → Storage → Wipe everything), which
  clears the flag and re-seeds: wiped device = fresh first-run, demos
  included.
- Demos are ordinary councils afterwards: renamable, deletable, tagged
  `Demo` in the sidebar, read-only-with-a-keys-CTA while no model is
  usable, fully interactive the moment a key lands.

## Verify after changing this folder

1. `npm run typecheck && npm run lint`
2. Open the app in a **fresh browser profile** (or factory-reset a dev
   profile) — the demos should appear in the sidebar with `Demo` tags; check
   the devtools console for `demo seed errors` (zod reports a malformed
   file per-council there).
3. `npx playwright test 01-onboarding` re-renders the first-run gate with
   the seeded sidebar (refresh baselines if the change is intentional).
