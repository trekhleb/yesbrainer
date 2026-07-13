/**
 * Render the prior-rounds block injected into a Mediator round's prompt
 * as `{priorTranscript}`. Round 1 sees an empty string; round N>1 sees a
 * compressed "Round K synthesis / divergence" block per prior round so
 * the Mediator can build on its own earlier attempts. Errored rounds
 * are skipped — including them would just confuse the next round.
 */

import type { MediatorRoundOutcome } from '@/types/session'

export function formatMediatorPriorRounds(
  rounds: MediatorRoundOutcome[],
): string {
  const blocks: string[] = []
  for (const r of rounds) {
    if (r.status === 'error' || r.synthesis.length === 0) continue
    const verdict =
      r.convergent === true
        ? 'convergent'
        : r.convergent === false
          ? 'not convergent'
          : 'verdict unknown'
    const divergence = r.divergencePoints
      ? `Divergence points flagged: ${r.divergencePoints}`
      : ''
    blocks.push(
      `Round ${r.round} synthesis (${verdict}):\n${r.synthesis}${divergence ? `\n${divergence}` : ''}`,
    )
  }
  if (blocks.length === 0) return ''
  return `\nPrior rounds in this turn:\n${blocks.join('\n\n')}\n`
}
