/**
 * Integration tests (tests/integration) — the app actually running.
 *
 * The other two suites stop short of this: `npm test` exercises the
 * orchestrator in jsdom with module-level mocks, and `npm run test:visual`
 * photographs councils it seeded as already-finished. Neither ever
 * performs a send. These specs do, with only the provider's HTTP response
 * replaced (`tests/integration/mock-anthropic.ts`), so the real AI SDK
 * adapter, real `fetch`, real streaming, and real IndexedDB all
 * participate.
 *
 * **Served from `dist/`, not the dev server.** That is the deliberate
 * difference from `playwright.config.ts`. The CSP is injected at build
 * only (`cspPlugin` is `apply: 'build'`), so a dev-server suite can never
 * catch a `connect-src` mistake — and the failure mode is total: the
 * renderer refuses the provider call before it reaches the network, so the
 * app is simply broken in production while every test stays green. Running
 * against the built bundle means a CSP regression fails these specs, since
 * a blocked request never reaches `page.route` at all.
 *
 * `reuseExistingServer` is off on purpose. `vite preview` serves whatever
 * `dist/` held when it booted — unlike the dev server it does not reload —
 * so reusing a stale preview would silently test old code. The build is
 * ~15s; correctness is worth it.
 */

import { defineConfig } from '@playwright/test'

const PORT = 5200

export default defineConfig({
  testDir: 'tests/integration',
  fullyParallel: true,
  reporter: [['list']],
  // A full council run is several sequential provider round-trips; the
  // default 30s is tight on a loaded CI box.
  timeout: 60_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
    colorScheme: 'light',
    // The PWA service worker isn't under test here and its precache is a
    // flake source across reloads. Blocking it doesn't affect the CSP,
    // which arrives in the document's own meta tag.
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    {
      // Behaviour, not pixels — one form factor is enough. Mobile layout
      // is the visual suite's job.
      name: 'integration',
      use: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
    },
  ],
})
