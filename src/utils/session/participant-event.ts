import type { Seat, TurnEvent } from '@/types/council'
import type { StreamResult } from '@/providers/run-stream'

/**
 * A Participant answer's `TurnEvent` from its stream result. One builder
 * for the turn fan-out (fresh event id) and the per-seat retry (which
 * reuses the errored event's id), so the persisted field set can't drift
 * between the two paths. Sibling of `buildVoteEvent` / `buildMediatorEvent`.
 */
export function buildParticipantEvent(args: {
  id: string
  seat: Seat
  result: StreamResult
}): TurnEvent {
  const { id, seat, result } = args
  return {
    id,
    roleType: 'participant',
    seatId: seat.id,
    modelId: seat.modelId,
    output: result.text,
    ts: Date.now(),
    ...(result.tokens ? { tokens: result.tokens } : {}),
    ...(result.error ? { error: result.error } : {}),
    ...(result.toolCalls && result.toolCalls.length > 0
      ? { toolCalls: result.toolCalls }
      : {}),
  }
}
