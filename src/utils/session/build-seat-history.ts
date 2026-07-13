/**
 * History sent to one seat for the next turn. Per the architectural
 * principle, each seat sees only its own prior assistant outputs — no
 * cross-contamination between Participants. If a seat errored on a prior
 * turn (no matching event), the user message stays in history but no
 * assistant turn fills in for it.
 *
 * Image attachments ride along only for vision-capable seats. The
 * orchestrator already skips non-vision seats on the image-bearing turn
 * itself, but *prior* turns' images would otherwise replay into every
 * seat's history on follow-ups — and a non-vision provider rejects image
 * content blocks outright, bricking that seat for the rest of the
 * conversation. So the capability gate lives here, on every message.
 */

import { getModel } from '@/models/registry'
import type { PromptMessage } from '@/providers/run-stream'
import type { Seat, Turn, TurnEvent } from '@/types/council'

/** A seat's final answer for a turn: its round-1 Participant answer, or —
 *  in a Consensus debate — its last re-answer. Iterate in reverse so the
 *  latest answer-bearing event wins; vote / mediator events are skipped. */
function latestSeatAnswer(
  turn: Turn,
  seatId: string,
): TurnEvent | undefined {
  for (let i = turn.events.length - 1; i >= 0; i--) {
    const e = turn.events[i]
    if (
      e &&
      e.seatId === seatId &&
      (e.roleType === 'participant' || e.roleType === 'reanswer') &&
      !e.error
    ) {
      return e
    }
  }
  return undefined
}

export function buildSeatHistory(
  priorTurns: Turn[],
  seat: Seat,
  userMsg: string,
  userImages?: string[],
): PromptMessage[] {
  const vision = getModel(seat.modelId).capabilities.vision
  const history: PromptMessage[] = []
  for (const t of priorTurns) {
    history.push({
      role: 'user',
      content: t.userMsg,
      ...(vision && t.userImages && t.userImages.length > 0
        ? { images: t.userImages }
        : {}),
    })
    const event = latestSeatAnswer(t, seat.id)
    if (event) history.push({ role: 'assistant', content: event.output })
  }
  history.push({
    role: 'user',
    content: userMsg,
    ...(vision && userImages && userImages.length > 0
      ? { images: userImages }
      : {}),
  })
  return history
}
