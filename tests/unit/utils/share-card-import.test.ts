/**
 * Guards the share-card *lazy import* itself — the thing that failed in the
 * wild with "Failed to fetch dynamically imported module:
 * .../share-card/index.ts" when the Share modal was first opened.
 *
 * Two independent failure classes hide behind that one browser error, so
 * there are two guards:
 *
 *  1. A broken lazy import graph (a renamed/removed barrel export, a moved
 *     `@/models/*` path, a syntax error in data.ts/paint.ts) — this breaks
 *     the real `import('@/utils/share-card')` in *production* too, yet the
 *     modal test mocks the module and share-card.test.ts imports the
 *     submodules directly, so neither exercises the barrel the modal loads.
 *     The contract test below imports the real barrel (the exact specifier
 *     share-verdict-modal.tsx loads) and asserts the functions the modal
 *     calls. A *static* top-level import on purpose: it resolves through the
 *     same path a dynamic `import()` would, and paying the chunk's slow
 *     `react-dom/server` transform at file-load time keeps it off the test's
 *     timeout budget (share-card.test.ts imports paint.ts the same way).
 *
 *  2. A Vite *dev*-only re-optimization race: `react-dom/server` is reachable
 *     only through this lazy chunk, so unless it's pre-bundled the first
 *     Share open makes Vite discover it, re-optimize, and reload — aborting
 *     the in-flight import. The config guard asserts the fix
 *     (`optimizeDeps.include`) stays in place. See vite.config.ts.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import * as shareCard from '@/utils/share-card'

describe('share-card lazy import', () => {
  it('barrel exposes every function the Share modal calls', () => {
    // Mirror the modal's usage (share-verdict-modal.tsx): a missing or
    // renamed export here is the code-level cause of "Failed to fetch
    // dynamically imported module" — catch it deterministically, in prod
    // terms, not just when a human happens to click Share. (A broken barrel
    // would already have thrown on the top-level import above.)
    expect(typeof shareCard.buildShareCardData).toBe('function')
    expect(typeof shareCard.renderShareCard).toBe('function')
    expect(typeof shareCard.buildShareText).toBe('function')
    expect(typeof shareCard.shareCardFilename).toBe('function')
  })

  it('pre-bundles react-dom/server so the first Share open cannot dev-reoptimize', () => {
    // Vitest runs from the project root, so resolve the config against cwd
    // (import.meta.url isn't a file: URL under Vite's module server).
    const config = readFileSync(resolve(process.cwd(), 'vite.config.ts'), 'utf8')
    // Assert react-dom/server is listed under optimizeDeps.include. If a
    // refactor drops it, the dev-only "Failed to fetch dynamically imported
    // module" on first Share comes back — fail here instead of in the wild.
    expect(config).toMatch(
      /optimizeDeps\s*:\s*\{[\s\S]*?include\s*:\s*\[[\s\S]*?['"]react-dom\/server['"]/,
    )
  })
})
