/**
 * One-shot demo-council seeding. On boot, a pristine
 * profile — no seed flag, zero councils — gets the three recorded demo
 * councils imported through the same zod-validated path user backups use.
 *
 * The flag makes every outcome intentional:
 *  - **Fresh install** → seed once, set flag. Deleting a demo is permanent
 *    (no zombie re-seeding on the next load).
 *  - **Existing user with councils** → never seeded; the flag is still set
 *    so demos don't appear later if they delete all their real councils.
 *  - **Factory reset** → `wipeAllStorage` clears every `yesbrainer:*` key,
 *    flag included, so the next load re-seeds — a wiped device returns to
 *    the pristine first-run state, demos and all.
 */

import { db } from '@/storage/db'
import { importCouncils } from '@/storage/transfer'

const SEEDED_FLAG = 'yesbrainer:demos-seeded'

/** In-flight memo: React StrictMode double-fires the boot effect in dev,
 *  and two concurrent seed runs both pass the "no flag, zero councils"
 *  check before either writes — the racing imports then collide on
 *  `appendTurn: conflict_idx` (caught by the factory-reset spec).
 *  One promise per page load; both callers await the same
 *  run. */
let inFlight: Promise<boolean> | null = null

/** Returns true when the demos were seeded on this call. */
export function seedDemoCouncilsIfNeeded(): Promise<boolean> {
  inFlight ??= seedOnce()
  return inFlight
}

async function seedOnce(): Promise<boolean> {
  try {
    if (localStorage.getItem(SEEDED_FLAG)) return false
  } catch {
    // No localStorage (exotic embedder) → no way to make seeding one-shot;
    // skip rather than re-seed forever.
    return false
  }
  try {
    const existing = await db.councils.count()
    if (existing > 0) {
      localStorage.setItem(SEEDED_FLAG, '1')
      return false
    }
    // Dynamic import so the demo payloads (JSON recordings — potentially
    // including base64 photos) live in their own chunk, fetched only on the
    // pristine-profile path, never in the main bundle.
    const { demoCouncilBundle } = await import('@/data/demo-councils')
    const report = await importCouncils(demoCouncilBundle())
    localStorage.setItem(SEEDED_FLAG, '1')
    if (report.errors.length > 0) {
      // A demo failing validation is a build defect (the bundle is code),
      // not a user problem — log loudly for dev, never block boot.
      console.error('demo seed errors:', report.errors)
    }
    return report.imported > 0
  } catch (err) {
    // Seeding is decoration — it must NEVER take the app down. The chunk
    // fetch can fail for real-world reasons (a stale service worker whose
    // precache predates the demo chunk, flaky network on a lazy import):
    // the error boundary listens to `unhandledrejection`, so an uncaught
    // throw here rendered the full-app error screen on boot (seen in the
    // wild after a factory reset). Log and boot demo-less; the
    // flag is deliberately NOT set, so the next healthy load seeds.
    console.error('demo seed skipped:', err)
    return false
  }
}
