/**
 * Visual snapshot tests (tests/visual) — Playwright's built-in screenshot
 * comparison as the regression net for UI work, and as the app's living
 * screen inventory (see tests/visual/README.md for the strategy and
 * `npm run test:visual:gallery` for a browsable contact sheet).
 *
 * The loop: `npm run test:visual` renders each spec's screenshots and
 * compares them against the committed baselines; a brand-new screenshot has
 * no baseline, so its first run *writes* one (and fails that one test as a
 * reminder to eyeball the image before committing it). After a deliberate
 * UI change, `npm run test:visual:update` refreshes the affected baselines.
 * Baselines are platform-suffixed (`-linux` / `-darwin`) because font
 * rasterisation differs per OS — each platform compares only against its
 * own baselines.
 *
 * Projects: `seed` imports the fixture-council bundle once through the
 * app's own Settings → Storage restore path and saves the browser state
 * (localStorage keys + IndexedDB councils); `desktop` and `mobile` depend
 * on it and re-render every spec at both form factors. Specs opt into the
 * seeded state per-file via `test.use({ storageState: SEEDED_STATE })` —
 * the onboarding specs deliberately run on a fresh profile instead.
 *
 * The suite runs against its own Vite instance on a dedicated port (5199)
 * over plain http, so an interactive `npm run dev`/`dev-secure` session on
 * 5173 never collides with it; an already-running 5199 server is reused.
 */

import { defineConfig } from '@playwright/test'

const PORT = 5199

export default defineConfig({
  testDir: 'tests/visual',
  // Keep baselines out of the spec dir: tests/visual/__screenshots__/…
  snapshotPathTemplate:
    '{testDir}/__screenshots__/{testFileName}/{arg}-{projectName}-{platform}{ext}',
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    // Deterministic renders: fixed light scheme (the dark-mode spec
    // overrides via `test.use({ colorScheme: 'dark' })`).
    colorScheme: 'light',
  },
  expect: {
    toHaveScreenshot: {
      // Kill motion, allow a whisper of anti-aliasing noise. The budget is
      // an *absolute* pixel count: a ratio budget scales with the shot, and
      // on a full-viewport image even 1% (~13k px) silently swallowed a
      // whole changed caption.
      animations: 'disabled',
      maxDiffPixels: 50,
    },
  },
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
  projects: [
    {
      // Seeds fixture councils via the app's import path and saves the
      // browser state the visual projects restore from (see seed.setup.ts).
      name: 'seed',
      testMatch: /seed\.setup\.ts/,
    },
    {
      name: 'desktop',
      testIgnore: /seed\.setup\.ts/,
      dependencies: ['seed'],
      use: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
    },
    {
      // iPhone-ish: the app's mobile breakpoint is < 768px; 2x DPR catches
      // the subpixel issues phones actually show.
      name: 'mobile',
      testIgnore: /seed\.setup\.ts/,
      dependencies: ['seed'],
      use: {
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
})
