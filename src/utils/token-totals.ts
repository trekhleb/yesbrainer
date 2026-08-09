import type { TokenTotals, TurnEvent } from '@/types/council'

/**
 * Token aggregation. Single source of truth so optimistic local updates
 * and the canonical Dexie recompute agree on the running total.
 *
 * Counts are authoritative: they come from each event's provider-reported
 * `tokens`. Events missing `tokens` (stream aborted before usage arrived)
 * contribute nothing — there's no honest way to estimate, so we skip
 * rather than guess.
 */

export const EMPTY_TOKENS: TokenTotals = {
  inputTokens: 0,
  outputTokens: 0,
}

/** Sum every event's tokens into a single `TokenTotals`. */
export function summarizeEvents(events: TurnEvent[]): TokenTotals {
  const out: TokenTotals = { ...EMPTY_TOKENS }
  for (const e of events) {
    if (!e.tokens) continue
    out.inputTokens += e.tokens.input
    out.outputTokens += e.tokens.output
  }
  return out
}

/**
 * Sum a council's turns into its running total.
 *
 * Used where a delta would be wrong: a turn can now be persisted several
 * times over its life (checkpoints, then a resume that adds to it), and
 * whether the in-memory council total already includes a given checkpoint
 * depends on whether the page reloaded in between. Re-summing the turns is
 * indifferent to all of that — the same reason `appendTurn` recomputes
 * rather than accumulating.
 */
export function summarizeTurns(
  turns: readonly { tokenTotal: TokenTotals }[],
): TokenTotals {
  const out: TokenTotals = { ...EMPTY_TOKENS }
  for (const t of turns) {
    out.inputTokens += t.tokenTotal.inputTokens
    out.outputTokens += t.tokenTotal.outputTokens
  }
  return out
}

export function addTokens(a: TokenTotals, b: TokenTotals): TokenTotals {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
  }
}

export function subtractTokens(a: TokenTotals, b: TokenTotals): TokenTotals {
  return {
    inputTokens: Math.max(0, a.inputTokens - b.inputTokens),
    outputTokens: Math.max(0, a.outputTokens - b.outputTokens),
  }
}
