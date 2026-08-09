/**
 * What a half-finished turn still owes — derived purely from its persisted
 * events.
 *
 * **The invariant this rests on: a persisted event means that unit of work is
 * done, and its absence means it never happened.** That holds because the
 * runners persist an event for every outcome the user should see — including
 * failures — while an *interruption* (`utils/session/interruption.ts`) is
 * recorded as nothing at all. So "errored" and "pending" stay distinct
 * without a separate bookkeeping field that could drift from the events it
 * describes: a genuine provider error is done (the user retries it
 * deliberately, and a resume must not silently re-bill them for it), whereas
 * a call the browser cut off left no trace and simply gets re-issued.
 *
 * Kept pure and separate from the phase modules so the recovery rules can be
 * unit-tested against hand-built event sets — this is the code that decides
 * whether a resume re-runs a seat or double-bills it.
 */

import type { Seat, TurnEvent } from '@/types/council'
import type { MediatorRoundOutcome } from '@/types/session'

export interface ConsensusProgress {
  /** Mediator assessments already persisted, keyed by round (1-indexed). */
  rounds: Map<number, MediatorRoundOutcome>
  /** Persisted re-answer events keyed by the round they belong to (≥ 2).
   *  A round can be partially present — some seats answered before the
   *  interruption — so the value is the events that *did* land, not a
   *  "round complete" flag. */
  reanswers: Map<number, TurnEvent[]>
}

export interface TurnProgress {
  /** Round-1 answers already persisted. */
  answerEvents: TurnEvent[]
  /** Seats from the run's roster still owing a round-1 answer. */
  pendingAnswerSeats: Seat[]
  /** Seats that produced a *usable* round-1 answer — the pool that votes
   *  (Trial) or debates (Consensus). Mirrors the live phases' own rule so a
   *  resumed turn deliberates with exactly the voices the original would. */
  respondingSeats: Seat[]
  consensus: ConsensusProgress
  /** Responding seats with no persisted vote event yet. */
  pendingVoterSeats: Seat[]
  /** A Judge verdict is already on the turn (successful or errored). */
  judgeDone: boolean
}

/**
 * Is this event an answer worth building on?
 *
 * The single definition of "usable", exported because every phase needs it
 * and drift between copies decides *double-billing*: a seat one phase counts
 * as having answered and another counts as pending gets re-run and re-charged.
 * It had grown three near-identical inline copies before this.
 */
export function isUsableAnswer(event: TurnEvent): boolean {
  return !event.error && event.output.length > 0
}

/** Did this seat land a round-1 answer worth building on? */
function hasUsableAnswer(events: readonly TurnEvent[], seatId: string): boolean {
  return events.some(
    (e) =>
      e.roleType === 'participant' && e.seatId === seatId && isUsableAnswer(e),
  )
}

export function readTurnProgress(args: {
  /** The seats the run fanned out to — from `runState.activeSeatIds`, not
   *  the council's current roster, which the user may have edited since. */
  activeSeats: readonly Seat[]
  events: readonly TurnEvent[]
}): TurnProgress {
  const { activeSeats, events } = args

  const answerEvents = events.filter((e) => e.roleType === 'participant')
  const answered = new Set(
    answerEvents.map((e) => e.seatId).filter((id) => id !== undefined),
  )
  const pendingAnswerSeats = activeSeats.filter((s) => !answered.has(s.id))
  const respondingSeats = activeSeats.filter((s) =>
    hasUsableAnswer(answerEvents, s.id),
  )

  const rounds = new Map<number, MediatorRoundOutcome>()
  for (const e of events) {
    if (e.roleType !== 'mediator') continue
    const round = e.mediator?.round ?? e.round
    if (round === undefined) continue
    rounds.set(round, {
      round,
      status: e.error ? 'error' : 'done',
      synthesis: e.output,
      ...(e.mediator?.convergent !== undefined
        ? { convergent: e.mediator.convergent }
        : {}),
      ...(e.mediator?.divergencePoints
        ? { divergencePoints: e.mediator.divergencePoints }
        : {}),
      ...(e.mediator?.roundDigest ? { roundDigest: e.mediator.roundDigest } : {}),
      ...(e.rawResponse ? { rawResponse: e.rawResponse } : {}),
      error: e.error ?? null,
    })
  }

  const reanswers = new Map<number, TurnEvent[]>()
  for (const e of events) {
    if (e.roleType !== 'reanswer' || e.round === undefined) continue
    const bucket = reanswers.get(e.round)
    if (bucket) bucket.push(e)
    else reanswers.set(e.round, [e])
  }

  const voted = new Set(
    events
      .filter((e) => e.roleType === 'vote')
      .map((e) => e.seatId)
      .filter((id) => id !== undefined),
  )

  return {
    answerEvents,
    pendingAnswerSeats,
    respondingSeats,
    consensus: { rounds, reanswers },
    pendingVoterSeats: respondingSeats.filter((s) => !voted.has(s.id)),
    judgeDone: events.some((e) => e.roleType === 'judge'),
  }
}

/** Seats in `round`'s re-answer set that still owe an answer. */
export function pendingReanswerSeats(
  progress: ConsensusProgress,
  round: number,
  respondingSeats: readonly Seat[],
): Seat[] {
  const done = new Set(
    (progress.reanswers.get(round) ?? [])
      .map((e) => e.seatId)
      .filter((id) => id !== undefined),
  )
  return respondingSeats.filter((s) => !done.has(s.id))
}
