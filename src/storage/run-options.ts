/**
 * Per-council composer run options — the popover's tool mutes + thinking
 * override. **Sticky**: they apply to every upcoming message in that
 * council until changed back (originally message-scoped with reset-after-
 * send; real use showed the common case is a durable stance — "keep search
 * off here" — so re-arming every message was pure friction).
 *
 * Per-device localStorage (`yesbrainer:run-options:<councilId>`), matching
 * the client-storage pattern: run *preferences* live in localStorage;
 * council data lives in Dexie. Absent key = no overrides. The key is not
 * cleaned up on council delete — a few orphaned bytes beat coupling the
 * council store to UI preferences.
 */

import { REASONING_EFFORT_VALUES } from '@/types/council'
import type { SeatConfig } from '@/types/council'

export interface RunOptionsValue {
  /** Provider tools muted for this council's sends. */
  mutedTools: string[]
  /** Thinking override for reasoning-capable seats; null = per-seat. */
  reasoningEffort: NonNullable<SeatConfig['reasoningEffort']> | null
}

const KEY_PREFIX = 'yesbrainer:run-options:'
// The shared union const, not a local list — a renamed effort id must
// invalidate stored options here, not silently keep the old value alive.
const EFFORTS = REASONING_EFFORT_VALUES

export function getRunOptions(councilId: string): RunOptionsValue {
  const empty: RunOptionsValue = { mutedTools: [], reasoningEffort: null }
  try {
    const raw = localStorage.getItem(KEY_PREFIX + councilId)
    if (!raw) return empty
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return empty
    const bag = parsed as Record<string, unknown>
    const mutedTools = Array.isArray(bag.mutedTools)
      ? bag.mutedTools.filter((t): t is string => typeof t === 'string')
      : []
    const reasoningEffort = EFFORTS.includes(
      bag.reasoningEffort as (typeof EFFORTS)[number],
    )
      ? (bag.reasoningEffort as RunOptionsValue['reasoningEffort'])
      : null
    return { mutedTools, reasoningEffort }
  } catch {
    return empty
  }
}

/** The sticky thinking override shaped for a `run*` call site: `undefined`
 *  (not `null`) when unset, so it feeds `resolveReasoningEffort` directly.
 *  Retries read this instead of threading composer state — the composer
 *  writes every dial change back here (`onRunOptionsChange`), so storage
 *  always holds the value the next send would use. */
export function getStickyReasoningEffort(
  councilId: string,
): NonNullable<SeatConfig['reasoningEffort']> | undefined {
  return getRunOptions(councilId).reasoningEffort ?? undefined
}

export function setRunOptions(councilId: string, value: RunOptionsValue): void {
  try {
    if (value.mutedTools.length === 0 && value.reasoningEffort === null) {
      // Back to all-defaults — drop the key so absence stays unambiguous.
      localStorage.removeItem(KEY_PREFIX + councilId)
      return
    }
    localStorage.setItem(KEY_PREFIX + councilId, JSON.stringify(value))
  } catch {
    // Quota/private-mode failures just lose stickiness, never the send.
  }
}
