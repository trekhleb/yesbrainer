/**
 * Cross-page ownership of a turn's run, via the Web Locks API.
 *
 * `utils/session/active-streams.ts` answers "is this council busy?" for the
 * *current* page. This answers the question that survives the page: after a
 * reload — or in a second tab — is anyone actually driving this turn?
 *
 * Web Locks is the right primitive because the browser releases a held lock
 * automatically when the holding page dies, with no timeout to tune. That
 * matters here: the alternative signal, a heartbeat timestamp, is unusable
 * as a liveness test because a hidden tab's timers are throttled to roughly
 * one tick a minute — a perfectly healthy backgrounded desktop run would
 * look dead. So the lock decides liveness and the heartbeat is only ever
 * shown to the user ("paused 4 minutes ago").
 *
 * The lock also serialises resumes: two tabs open on the same council must
 * not both re-issue the same provider calls and bill the user twice.
 *
 * Supported everywhere the app targets (Safari 15.4+, Chrome 69+, Firefox
 * 96+). Where it is missing, `isRunOwned` reports "not owned" — a resume
 * still works, it just loses the multi-tab interlock. That degradation is
 * the right way round: a rarely-doubled resume beats a run that can never
 * be recovered.
 */

const lockName = (turnId: string) => `yesbrainer:run:${turnId}`

/** `navigator.locks` is typed as always-present but genuinely is not on
 *  older WebKit. Widening to `| undefined` (an assignment, not a cast —
 *  casts are what `typecheck:coverage` polices) makes the real contract
 *  checkable without punching a hole in the types. */
function locks(): LockManager | undefined {
  const manager: LockManager | undefined = navigator.locks
  return manager
}

/**
 * Is some live page currently driving this turn?
 *
 * Implemented as a non-blocking probe: `ifAvailable` hands back `null`
 * instead of queueing when the lock is already held, so this resolves
 * immediately either way and never waits on the run it is asking about.
 */
export async function isRunOwned(turnId: string): Promise<boolean> {
  const manager = locks()
  if (!manager) return false
  try {
    return await manager.request(
      lockName(turnId),
      { ifAvailable: true },
      // `lock === null` means someone else holds it — i.e. it is owned.
      (lock) => lock === null,
    )
  } catch {
    // A SecurityError here means the API exists but this context can't use
    // it. Same call as the unsupported case: claim nothing, let the resume
    // proceed without the interlock.
    return false
  }
}

/**
 * Run `fn` while holding the turn's lock, so a concurrent page can see the
 * run is owned. Returns `null` without running `fn` when another page
 * already holds it.
 *
 * Where Web Locks is unavailable, `fn` runs unguarded — see the module note.
 */
export async function withRunLock<T>(
  turnId: string,
  fn: () => Promise<T>,
): Promise<T | null> {
  const manager = locks()
  if (!manager) return await fn()
  // `request` rejects both when the lock can't be acquired *and* when `fn`
  // itself throws — and the fallback for the first is "run `fn` unguarded",
  // which for the second would silently run the user's council turn a second
  // time. This flag is what keeps those two apart.
  let started = false
  try {
    return await manager.request(
      lockName(turnId),
      { ifAvailable: true },
      async (lock) => {
        if (lock === null) return null
        started = true
        return await fn()
      },
    )
  } catch (err) {
    if (started) throw err
    console.warn('run lock unavailable, proceeding unguarded', err)
    return await fn()
  }
}
