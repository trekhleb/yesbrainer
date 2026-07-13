/**
 * Vote-event derivation helpers.
 *
 * Pure data transformations between the persisted `Turn.events`
 * (TurnEvent[]) — the canonical store — and the `VoterEntry[]` shape
 * the `<VotingBlock>` UI renders. The retry-vote overlay
 * merges in-flight voter state with the persisted answers so a
 * mid-retry turn renders the right mix of "still voting" and
 * "already voted" cards.
 */

import type { VoterEntry } from '@/types/session'
import type { Turn, TurnEvent } from '@/types/council'
import type { VotingTurn } from '@/types/session'

/** At most one Judge event per turn (Trial fires exactly one). Take the
 *  first match defensively in case a future role mixes multiple in. */
export function findJudgeEvent(turn: Turn): TurnEvent | null {
  return turn.events.find((e) => e.roleType === 'judge') ?? null
}

export function mergeVoterEntries(
  turn: Turn,
  retryOverlay: VotingTurn | null,
): VoterEntry[] {
  const persisted = voterEntriesFromTurn(turn)
  if (!retryOverlay) return persisted
  const overlay = voterEntriesFromVotingTurn(retryOverlay)
  const overlayBySeatId = new Map(overlay.map((e) => [e.voterSeatId, e]))
  return persisted.map((p) => overlayBySeatId.get(p.voterSeatId) ?? p)
}

function voterEntriesFromTurn(turn: Turn): VoterEntry[] {
  const entries: VoterEntry[] = []
  for (const ev of turn.events) {
    if (ev.roleType !== 'vote') continue
    if (!ev.seatId) continue
    entries.push({
      key: `${turn.id}:${ev.seatId}:vote`,
      voterSeatId: ev.seatId,
      modelId: ev.modelId,
      status: ev.error ? 'error' : 'done',
      error: ev.error ?? null,
      vote: ev.vote ?? null,
      rawResponse: ev.rawResponse ?? null,
    })
  }
  return entries
}

export function voterEntriesFromVotingTurn(turn: VotingTurn): VoterEntry[] {
  const entries: VoterEntry[] = []
  for (const [seatId, perVoter] of Object.entries(turn.perVoter)) {
    entries.push({
      key: `${turn.id}:${seatId}:vote`,
      voterSeatId: seatId,
      modelId: perVoter.modelId,
      status: perVoter.status,
      error: perVoter.error,
      vote: perVoter.vote,
      rawResponse: perVoter.rawResponse,
    })
  }
  return entries
}
