/**
 * Build the `vote` `TurnEvent` from a voter seat + its `VoteResult`.
 *
 * Two call sites must construct this identically: the live Trial voting
 * phase (`run-trial-phase.ts`, fresh uuid) and the failed-vote retry
 * (`use-retry-votes.ts`, which replaces in place and passes the errored
 * event's id). They used to carry parallel copies of the same spread; a
 * drift there means a retried vote persists a different shape than the
 * live one. One builder, id passed in — same pattern as `buildMediatorEvent`.
 */

import type { VoteResult } from '@/providers/run-vote'
import type { Seat, TurnEvent } from '@/types/council'

export function buildVoteEvent(args: {
  /** Fresh uuid on live votes; the errored event's id on retry. */
  id: string
  voter: Seat
  result: VoteResult
}): TurnEvent {
  const { id, voter, result } = args
  return {
    id,
    roleType: 'vote',
    seatId: voter.id,
    modelId: voter.modelId,
    output: '',
    ts: Date.now(),
    ...(result.tokens ? { tokens: result.tokens } : {}),
    ...(result.error ? { error: result.error } : {}),
    ...(result.vote.length > 0 ? { vote: result.vote } : {}),
    ...(result.rawResponse ? { rawResponse: result.rawResponse } : {}),
  }
}
