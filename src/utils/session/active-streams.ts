/**
 * In-flight AbortControllers, keyed by council id.
 *
 * A run deliberately outlives its council view — switching away lets the
 * turn finish in the background and persist (see DEVELOPMENT.md →
 * Orchestration hook pattern) — so the view's own `stop()` can't be the
 * only abort path.
 * Deleting a council is the one case where letting its runs finish is pure
 * waste: the rows the results would land on are gone, and the user's BYOK
 * tokens keep burning on an answer that can never be saved. The delete
 * flow calls `abortCouncilStreams(id)` to cancel everything the council
 * still has in flight — the turn fan-out, retries, and the fire-and-forget
 * titler alike.
 *
 * A Set per council because runs can overlap: a background-completing turn
 * from a previous mount plus a fresh run in a remounted view.
 *
 * The registry is also the app's one truth for "this council is working":
 * it sees every run kind and — unlike the session hook's `isStreaming`,
 * which unmounts with the view — keeps reporting a run that continues in
 * the background. `subscribe` + `getStreamingCouncilIds` are the
 * `useSyncExternalStore` pair behind `useStreamingCouncilIds()`, which the
 * sidebar reads to put a busy row's ⋯ button into its loading state.
 */

const inFlight = new Map<string, Set<AbortController>>()

/**
 * Runs that are driving a specific *turn*, counted by turn id.
 *
 * The council-level view above can't answer "is this turn being worked on?"
 * — it also counts the fire-and-forget titler, so a council whose title is
 * still generating reads as busy. That imprecision matters for the paused
 * card: it would announce "picking up where it stopped" over a turn nobody
 * is resuming, and hide a Resume button that would have worked.
 */
const inFlightTurns = new Map<string, number>()

const listeners = new Set<() => void>()
/** Frozen key-set snapshots; a new instance only when the *set* changes
 *  (`useSyncExternalStore` compares by identity, and a second controller
 *  joining a council's set changes nothing observable). */
let streamingIds: ReadonlySet<string> = new Set()
let streamingTurnIds: ReadonlySet<string> = new Set()

function sameKeys(snapshot: ReadonlySet<string>, live: Map<string, unknown>) {
  return (
    snapshot.size === live.size && [...live.keys()].every((k) => snapshot.has(k))
  )
}

function notifyIfChanged(): void {
  const councilsSame = sameKeys(streamingIds, inFlight)
  const turnsSame = sameKeys(streamingTurnIds, inFlightTurns)
  if (councilsSame && turnsSame) return
  if (!councilsSame) streamingIds = new Set(inFlight.keys())
  if (!turnsSame) streamingTurnIds = new Set(inFlightTurns.keys())
  for (const listener of listeners) listener()
}

/** `useSyncExternalStore` subscribe half — see `useStreamingCouncilIds`. */
export function subscribeCouncilStreams(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Ids of councils with any run in flight (turn fan-out, retry, titler). */
export function getStreamingCouncilIds(): ReadonlySet<string> {
  return streamingIds
}

/** Ids of turns a run is currently driving — the precise question the
 *  paused card asks. Excludes the titler, which belongs to no turn. */
export function getStreamingTurnIds(): ReadonlySet<string> {
  return streamingTurnIds
}

/** Track a controller for the duration of a run. Every registration must
 *  be paired with a `releaseCouncilStream` in the run's `finally`. */
export function registerCouncilStream(
  councilId: string,
  controller: AbortController,
  /** The turn this run is producing, when it has one. Counted rather than
   *  set-of-controllers because a resume and its predecessor can briefly
   *  overlap on the same turn id. */
  turnId?: string,
): void {
  const set = inFlight.get(councilId) ?? new Set()
  set.add(controller)
  inFlight.set(councilId, set)
  if (turnId) inFlightTurns.set(turnId, (inFlightTurns.get(turnId) ?? 0) + 1)
  notifyIfChanged()
}

export function releaseCouncilStream(
  councilId: string,
  controller: AbortController,
  turnId?: string,
): void {
  const set = inFlight.get(councilId)
  if (set) {
    set.delete(controller)
    if (set.size === 0) inFlight.delete(councilId)
  }
  if (turnId) {
    const next = (inFlightTurns.get(turnId) ?? 0) - 1
    if (next > 0) inFlightTurns.set(turnId, next)
    else inFlightTurns.delete(turnId)
  }
  notifyIfChanged()
}

/** Abort every in-flight run for the council. Called by the delete flow. */
export function abortCouncilStreams(councilId: string): void {
  const set = inFlight.get(councilId)
  if (!set) return
  for (const controller of set) controller.abort()
}

/** Abort every in-flight run across *all* councils. The bulk council wipe
 *  (Settings → Storage → "Wipe councils") drops the rows any of these would
 *  persist to — so, exactly as with a single delete, letting them finish
 *  just burns BYOK tokens on answers that can never be saved. */
export function abortAllCouncilStreams(): void {
  for (const set of inFlight.values()) {
    for (const controller of set) controller.abort()
  }
}
