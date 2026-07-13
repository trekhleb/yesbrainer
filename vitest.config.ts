import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Deliberately NOT reusing vite.config.ts: its plugins are build/dev
// concerns (PWA service worker, the CSP meta injection) with no place in
// a unit run. Only the pieces tests actually need are duplicated — the
// React transform and the `@` alias.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.{ts,tsx}'],
    setupFiles: ['tests/unit/setup.ts'],
    restoreMocks: true,
    // Base Web renders through Styletron's atomic engine, which warns —
    // once per emitted class — whenever a component mixes a shorthand and
    // a longhand border property (`border` + `borderBottomWidth`, …). It's
    // third-party noise we can't fix from here and it buries the real test
    // output, so drop just that line. Returning `false` suppresses it;
    // anything else (incl. undefined) prints as normal.
    onConsoleLog(log) {
      if (/Mixing shorthand and longhand properties/.test(log)) return false
    },
    // Files run in parallel, capped at 4 workers (local `npm run test`).
    // The cap is the whole point: an *unbounded* parallel run under v8
    // coverage OOM-kills this jsdom suite. So coverage stays sequential —
    // `test:coverage` passes `--no-file-parallelism`, and that's the path
    // CI runs (ci.yml runs test:coverage, not test). Without coverage, 4
    // workers is ~40% faster than a single worker on this box and stays
    // memory-safe; tests are process-isolated so nothing shares globals.
    maxWorkers: 4,
    server: {
      deps: {
        // @lobehub's ESM build uses extensionless directory imports that
        // Node's resolver rejects — inline them so Vite's resolver (which
        // the browser build already relies on) handles the files.
        inline: [/@lobehub/],
      },
    },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        // Bootstrap: mounts the tree into the real DOM — exercised by the
        // Playwright visual suite, nothing to unit-test.
        'src/main.tsx',
        // Generated OpenRouter catalog snapshot (data, no logic) — see
        // scripts/update-models-catalog.mjs.
        'src/models/registry.generated.ts',
        'src/vite-env.d.ts',
      ],
      reporter: ['text-summary', 'html', 'json-summary'],
      // Enforced floor, kept a touch below the live numbers so a normal
      // refactor doesn't trip it but a real coverage regression does. Lines
      // are the headline gate at 95% (the suite currently sits ~96.5%). The
      // last stretch to 100% is presentational rendering + the canvas share-
      // card painter + streaming-orchestrator callbacks, which the Playwright
      // visual suite owns — unit tests there would just re-assert "this JSX
      // renders". Raise these as coverage climbs.
      thresholds: {
        lines: 95,
        functions: 90,
        branches: 78,
        statements: 93,
      },
    },
  },
})
