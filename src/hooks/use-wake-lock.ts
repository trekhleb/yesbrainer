/**
 * Hold a screen wake lock while a council is running.
 *
 * This does not make the app run in the background — nothing can, on the
 * web. What it does is remove the most common *cause* of an interrupted
 * run: a phone put down mid-debate and auto-locked thirty seconds later.
 * A deliberate lock (power button) still ends the run, and recovery is the
 * resume path's job.
 *
 * Two properties of the API shape this hook:
 *  - the browser releases the lock whenever the page hides, so it has to be
 *    re-acquired on the way back, which is also why it can never keep a
 *    screen awake for an app the user isn't looking at;
 *  - `request` rejects for reasons that are all normal (no user activation,
 *    battery saver, an unsupported engine), so every failure here is
 *    swallowed. A council that can't dim-proof the screen still runs.
 */

import { useEffect } from 'react'

export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active) return
    // Typed as always-present in lib.dom but absent on older WebKit; widen
    // by assignment rather than casting (see `utils/session/run-lock.ts`).
    const wakeLock: WakeLock | undefined = navigator.wakeLock
    if (!wakeLock) return

    let released = false
    let sentinel: WakeLockSentinel | null = null

    const acquire = async () => {
      if (released || sentinel || document.visibilityState !== 'visible') return
      try {
        sentinel = await wakeLock.request('screen')
        // The effect can tear down while `request` is in flight; without
        // this the lock would outlive the run that asked for it.
        if (released) {
          void sentinel.release()
          sentinel = null
          return
        }
        sentinel.addEventListener('release', () => {
          sentinel = null
        })
      } catch {
        // Not available right now — no user activation, power saving, or an
        // engine without the API. Never worth surfacing.
      }
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible') void acquire()
    }

    void acquire()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      released = true
      document.removeEventListener('visibilitychange', onVisibility)
      if (sentinel) {
        void sentinel.release()
        sentinel = null
      }
    }
  }, [active])
}
