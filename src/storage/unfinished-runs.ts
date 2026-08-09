/**
 * Hint index of councils with an unfinished run — `councilId → turnId`.
 *
 * The *truth* about an unfinished run is `Turn.runState` on the Dexie row.
 * This is only a pointer set, so recovery doesn't have to scan the `turns`
 * table: turn rows carry inline base64 images, and a full-table read on every
 * app start is precisely the cost that can't be paid. `getUnfinishedTurns`
 * turns these ids into rows with primary-key lookups.
 *
 * **Deliberately lossy.** Nothing here is authoritative: a failed write
 * (quota, private mode) or a hand-cleared localStorage costs a sidebar dot
 * and an auto-resume, never data or correctness. The council the user
 * actually opens always detects its own unfinished turn from the row itself,
 * because `getCouncil` reads that council's turns regardless. Treat a hint
 * that resolves to nothing as normal, not as an error.
 *
 * Per-device localStorage matches the split documented in `drafts.ts` /
 * `run-options.ts`: device-scoped run state lives here, council data lives in
 * Dexie. Going through the reactive adapter buys cross-tab notification for
 * free — a run finishing in one tab clears the other tab's sidebar dot.
 */

import { createReactiveLocalStorage } from '@/storage/reactive-localstorage'

const adapter = createReactiveLocalStorage<Record<string, string>>({
  storageKey: 'yesbrainer:unfinished-runs',
  eventName: 'yesbrainer:unfinished-runs-changed',
  defaultValue: {},
})

export const unfinishedRunsAdapter = adapter
export const getUnfinishedRunHints = adapter.get

/** Turn ids to probe, with non-string values from a corrupt / hand-edited
 *  row filtered out — they'd otherwise reach Dexie's `bulkGet` as invalid
 *  keys and throw where a missing hint should just be a no-op. */
export function getUnfinishedRunTurnIds(): string[] {
  return Object.values(adapter.get()).filter((id) => typeof id === 'string')
}

/** Point at a council's in-flight turn. One entry per council: a council
 *  runs one turn at a time, and a *new* send supersedes any older unfinished
 *  turn (which stops being resumable the moment it isn't the latest turn —
 *  the same rule the retry affordances follow). */
export function markRunUnfinished(councilId: string, turnId: string): void {
  const current = adapter.get()
  if (current[councilId] === turnId) return
  adapter.set({ ...current, [councilId]: turnId })
}

export function clearRunUnfinished(councilId: string): void {
  const current = adapter.get()
  if (!(councilId in current)) return
  const { [councilId]: _finished, ...rest } = current
  adapter.set(rest)
}
