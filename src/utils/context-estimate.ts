import { getModel } from '@/models/registry'
import type { Council, Seat, Turn } from '@/types/council'

/**
 * Context-window pre-flight. For each seat, estimates the prompt
 * size (history + system + upcoming user message) and compares it against
 * the model's `contextWindow`. Returns the *worst* (highest-percent) seat,
 * used by the composer to surface a single "Context: ~60% / 200k" hint.
 *
 * Token counts here are a deliberate approximation (`chars / 4`) computed
 * locally so the hint updates instantly on every keystroke — no provider
 * tokenizer calls. It feeds a visual warning only; nothing bills off it.
 */

/** Standard chars-per-token rule of thumb. Real tokenizers run hotter
 *  than this for code/JSON-heavy text and cooler for short English, but
 *  for a pre-flight hint it's the right ballpark. */
const CHARS_PER_TOKEN = 4

/** Estimate of the unspecified system-prompt size when a seat hasn't
 *  configured one — accounts for the registry / user default
 *  cascading in. ~300 chars / 4 ≈ 75 tokens. */
const ASSUMED_DEFAULT_SYSTEM_TOKENS = 75

/** Rough role-formatting overhead added per message in chat history
 *  (assistant/user role tags, separators, etc. that providers wrap
 *  around content). */
const PER_MESSAGE_OVERHEAD_TOKENS = 12

function estimateInputTokensForSeat(
  seat: Seat,
  priorTurns: Turn[],
  upcomingUserMsg: string,
): number {
  // System prompt — if the seat has an explicit override, use its size;
  // otherwise approximate the registry / user default at a small fixed
  // estimate.
  const systemTokens = seat.config.systemPrompt
    ? approxTokens(seat.config.systemPrompt)
    : ASSUMED_DEFAULT_SYSTEM_TOKENS

  let historyTokens = 0
  for (const turn of priorTurns) {
    historyTokens += approxTokens(turn.userMsg) + PER_MESSAGE_OVERHEAD_TOKENS
    // Each seat sees only its own latest answer-bearing output per turn
    // (round-1 answer, or its final Consensus re-answer) — mirror
    // `buildSeatHistory` so the estimate tracks what's actually sent.
    let latest: { output: string } | undefined
    for (let i = turn.events.length - 1; i >= 0; i--) {
      const ev = turn.events[i]
      if (
        ev &&
        ev.seatId === seat.id &&
        (ev.roleType === 'participant' || ev.roleType === 'reanswer') &&
        !ev.error
      ) {
        latest = ev
        break
      }
    }
    if (latest) {
      historyTokens += approxTokens(latest.output) + PER_MESSAGE_OVERHEAD_TOKENS
    }
  }

  const userTokens = approxTokens(upcomingUserMsg) + PER_MESSAGE_OVERHEAD_TOKENS

  return systemTokens + historyTokens + userTokens
}

function approxTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}

export interface ContextUsageHint {
  seatId: string
  modelId: string
  /** Resolved display label — usually the model's registry `label`. */
  displayLabel: string
  /** Estimated input tokens for the upcoming turn on this seat. */
  used: number
  /** Model's advertised context window (tokens). */
  max: number
  /** Convenience: `used / max` clamped to [0, 1]. */
  pct: number
}

/**
 * We use input-side tokens only — the model still has to budget output
 * inside the same window, but adding `maxOutputTokens` would double-count
 * the budget the user hasn't committed yet. The provider hard-fails at
 * request time if input + output overruns the window, which is the right
 * level of feedback for those. Returns `null` when the council has no
 * seats or no seat resolves a context window.
 */
export function estimateContextUsage(
  council: Council,
  upcomingUserMsg: string,
): ContextUsageHint | null {
  if (council.seats.length === 0) return null

  let worst: ContextUsageHint | null = null
  for (const seat of council.seats) {
    const used = estimateInputTokensForSeat(seat, council.turns, upcomingUserMsg)
    const model = getModel(seat.modelId)
    const max = model.contextWindow
    if (!max || max <= 0) continue
    const pct = Math.min(1, used / max)
    if (!worst || pct > worst.pct) {
      worst = {
        seatId: seat.id,
        modelId: seat.modelId,
        displayLabel: model.label,
        used,
        max,
        pct,
      }
    }
  }
  return worst
}
