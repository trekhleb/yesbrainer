/**
 * Storage persistence opt-in.
 *
 * By default browsers treat IndexedDB / localStorage as best-effort
 * cache: under disk pressure they can evict origins LRU-style, and
 * Safari iOS clears a PWA's storage after ~7 days of non-use.
 * `navigator.storage.persist()` moves the origin into the
 * "persistent" bucket — the browser commits to keeping the data
 * around until the user takes an explicit action (clearing site data,
 * uninstalling the PWA).
 *
 * Call sites: anywhere the user has just produced data worth keeping
 * — first BYOK key save, first council create. Idempotent and
 * safe-to-spam: a no-op once the origin is already persistent, and
 * never throws on browsers that lack the API.
 */

import { analytics } from '@/analytics'

/**
 * Ensure the origin is in the persistent storage bucket. Resolves to
 * `true` if storage is (or just became) persistent, `false`
 * otherwise — including when the API is missing or the user/browser
 * declined the upgrade.
 *
 * Behavior by browser:
 *  - Chrome / Edge: auto-grants once the site is "installed" (PWA),
 *    bookmarked, has notification permission, or has high
 *    engagement. Silent.
 *  - Firefox: shows a permission prompt the first time. Call this
 *    from a user-gesture (form submit, button click) so the prompt
 *    lands in obvious context.
 *  - Safari: typically auto-grants once storage is non-trivial; no
 *    prompt.
 *  - Older browsers without the Storage API: returns false; no
 *    error, no fallback.
 */
export async function ensurePersistedStorage(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) {
    return false
  }
  try {
    if (await navigator.storage.persisted()) return true
    const granted = await navigator.storage.persist()
    // Counted only on a real upgrade attempt (the already-persisted early
    // return above never reaches here) — the grant/deny ratio is the live
    // measure of how real the silent-eviction risk is for actual visitors.
    // A grant can only reach this line once (the early return takes over),
    // but denials repeat — Settings auto-saves per keystroke and re-asks —
    // so the denied count is capped at one per page load.
    if (granted) {
      analytics.event('storage-persist-granted')
    } else if (!deniedReported) {
      deniedReported = true
      analytics.event('storage-persist-denied')
    }
    return granted
  } catch (err) {
    console.warn('[ensurePersistedStorage] failed', err)
    return false
  }
}

let deniedReported = false
/** Test-only reset for the once-per-page-load denied guard. */
export function resetPersistDeniedReportedForTests(): void {
  deniedReported = false
}

/**
 * Best-effort read of current persistence state — does NOT request
 * the upgrade. Used by Settings → Storage to render the badge.
 */
export async function isStoragePersisted(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persisted) {
    return false
  }
  try {
    return await navigator.storage.persisted()
  } catch {
    return false
  }
}

/**
 * Bytes the origin is using and the total bytes it's permitted (best-
 * effort or persistent, whichever the bucket is in). Returns null if
 * the API is missing.
 */
export async function estimateStorage(): Promise<
  { usage: number; quota: number } | null
> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) {
    return null
  }
  try {
    const r = await navigator.storage.estimate()
    return {
      usage: r.usage ?? 0,
      quota: r.quota ?? 0,
    }
  } catch (err) {
    console.warn('[estimateStorage] failed', err)
    return null
  }
}
