/**
 * Replace one persisted event in place, in the local `Council` mirror, and
 * re-aggregate the affected turn's + council's token totals.
 *
 * Both retry paths (failed votes, a failed seat answer) persist a replacement
 * event by id, then need the exact same local-state update — this is the one
 * copy of that reducer so the two can't drift. `EMPTY_TOKENS`-aware: it
 * subtracts the turn's previous total and adds the recomputed one rather than
 * re-summing every turn (the orchestration-hook convention).
 *
 * A no-op (`c` unchanged reference) when the council/turn/event isn't found,
 * so it's safe to pass straight to `setCouncil`.
 */

import {
  addTokens,
  EMPTY_TOKENS,
  subtractTokens,
  summarizeEvents,
} from '@/utils/token-totals'
import type { Council, TurnEvent } from '@/types/council'

export function replaceEventInCouncil(
  council: Council,
  turnId: string,
  nextEvent: TurnEvent,
): Council {
  let prevTotal = EMPTY_TOKENS
  let nextTotal = prevTotal
  let touched = false
  const turns = council.turns.map((t) => {
    if (t.id !== turnId) return t
    if (!t.events.some((e) => e.id === nextEvent.id)) return t
    touched = true
    const events = t.events.map((e) =>
      e.id === nextEvent.id ? nextEvent : e,
    )
    prevTotal = t.tokenTotal
    nextTotal = summarizeEvents(events)
    return { ...t, events, tokenTotal: nextTotal }
  })
  if (!touched) return council
  return {
    ...council,
    turns,
    tokenTotal: addTokens(
      subtractTokens(council.tokenTotal, prevTotal),
      nextTotal,
    ),
  }
}
