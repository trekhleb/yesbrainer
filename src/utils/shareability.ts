import type { SocialStructure, Turn, TurnEvent } from '@/types/council'

/**
 * The one home for "does this turn have a shareable result?" — the rule
 * used to be encoded three ways (the sidebar share action, the in-chat
 * per-block share triggers, and the share-card builder's null returns),
 * which is how a change to what counts as "final" lands in one surface
 * and not the others.
 */

/** A successful, non-empty event — the shareable unit. */
export function isFinishedEvent(e: TurnEvent): boolean {
  return !e.error && e.output.length > 0
}

/**
 * Whether the turn holds a finished result for its structure. Exhaustive
 * on purpose (no default): adding a social structure must force a
 * decision here, at compile time.
 */
export function isTurnShareable(
  turn: Turn,
  structure: SocialStructure,
): boolean {
  // An unfinished run has no *result* to share, whatever it has produced
  // so far. A debate stopped at round 1 of 3 holds a real synthesis, but
  // sharing it as the council's conclusion would misrepresent an
  // interruption as an outcome — and the share card carries no way to say
  // "this one didn't finish". Centralised here so the sidebar action, the
  // in-chat triggers and the card builder all refuse it together.
  if (turn.runState) return false
  switch (structure) {
    // Parallel-shaped turns share the answer fan-out itself — their
    // result IS the divergence panorama. `custom` runs the plain parallel
    // path (see `normalizeSocialStructure`), so it shares the same way.
    case 'roundtable':
    case 'custom':
      return turn.events.some(
        (e) => e.roleType === 'participant' && isFinishedEvent(e),
      )
    // Deliberating structures share only the final synthesis.
    case 'trial':
      return turn.events.some(
        (e) => e.roleType === 'judge' && isFinishedEvent(e),
      )
    case 'consensus':
      return turn.events.some(
        (e) => e.roleType === 'mediator' && isFinishedEvent(e),
      )
  }
}

/** The most recent turn with a shareable result, or undefined. */
export function latestShareableTurn(
  turns: readonly Turn[],
  structure: SocialStructure,
): Turn | undefined {
  for (let i = turns.length - 1; i >= 0; i--) {
    const t = turns[i]
    if (t && isTurnShareable(t, structure)) return t
  }
  return undefined
}
