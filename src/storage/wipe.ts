/**
 * Destructive "factory reset".
 *
 * Drops the entire IndexedDB database, every `yesbrainer:*` localStorage
 * key, and the PWA service worker + Cache Storage.
 * The browser-data-clearing UI path users hit via DevTools, surfaced
 * in-app for users who never open DevTools.
 *
 * Reload after invocation so the next pageview rehydrates from a
 * clean slate (a pristine profile then re-seeds the demo councils and
 * lands on the first-run onboarding).
 */

import { db } from '@/storage/db'
import { setApiKeys } from '@/storage/keys'

/**
 * Partial wipe — every council (with its seats and turns), nothing else.
 * Keys, settings, and the demos-seeded flag stay untouched, so this lands in
 * the same state as deleting every council by hand: the demo councils do
 * **not** re-seed (the flag is what suppresses that — see `seed-demos.ts`).
 * Clears the three object stores wholesale inside one transaction; the caller
 * refreshes the sidebar afterwards — no page reload.
 */
export async function wipeAllCouncils(): Promise<void> {
  await db.transaction('rw', db.councils, db.seats, db.turns, async () => {
    await db.councils.clear()
    await db.seats.clear()
    await db.turns.clear()
  })
}

/**
 * Partial wipe — every BYOK key, nothing else. Routed through the reactive
 * keys adapter (not a raw `localStorage.removeItem`) so an open Settings →
 * Keys form and every key-gated control re-render in place — no page reload.
 */
export function wipeApiKeys(): void {
  setApiKeys({})
}

export async function wipeAllStorage(): Promise<void> {
  // Close the Dexie connection before delete; otherwise the delete
  // blocks waiting for the open handle and surfaces a "blocked" event
  // that we'd then have to plumb through.
  db.close()
  await db.delete()

  // Drop every yesbrainer:* localStorage entry. Iterate by key so
  // unrelated keys (other apps sharing the origin) stay untouched.
  const toRemove: string[] = []
  for (let i = 0; i < localStorage.length; i += 1) {
    const k = localStorage.key(i)
    if (k && k.startsWith('yesbrainer:')) toRemove.push(k)
  }
  for (const k of toRemove) localStorage.removeItem(k)

  // True factory reset also means fresh *assets*: unregister the PWA
  // service worker and drop its Cache Storage. A stale SW survives the
  // data wipe otherwise, and a precache that predates newly-added lazy
  // chunks made the post-wipe reload die with "Importing a module script
  // failed" (seen in the wild). Best-effort: none of this may
  // exist (plain tab, older browser), and a failure here must not block
  // the wipe — the reload proceeds either way.
  try {
    const regs =
      (await navigator.serviceWorker?.getRegistrations?.()) ?? []
    await Promise.all(regs.map((r) => r.unregister()))
  } catch {
    // ignore
  }
  try {
    if (typeof caches !== 'undefined') {
      const keys = await caches.keys()
      await Promise.all(keys.map((k) => caches.delete(k)))
    }
  } catch {
    // ignore
  }
}
