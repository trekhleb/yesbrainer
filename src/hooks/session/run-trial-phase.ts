/**
 * Trial deliberation orchestration — the peer-vote + Judge phases that run
 * after the Participant fan-out on a Trial council.
 *
 * 1. **Voting** (skipped for <2 responding Participants — ≤1 makes peer
 *    rating trivial): each responder rates the *others'* anonymized answers;
 *    the per-turn Model A/B/C map is returned so the UI can render real names.
 * 2. **Judge** (skipped with no successful answer, or no configured Judge):
 *    reads the named answers + leaderboard + comments and streams one verdict.
 *
 * **Why a phase module** (mirrors `run-consensus-phase.ts`): keeps the
 * orchestrator (`use-council-session.ts`) a thin fan-out → phase → persist
 * pipeline. It returns the new events (votes + the Judge event) for the
 * orchestrator to append to the turn, plus the anonymization map. It reads
 * but never mutates the passed answer events.
 *
 * Reuses: `runVotingPhase` (the voter fan-out), `buildVoteEvent` (shared
 * with the failed-vote retry), `buildJudgeContext` (shared with the Judge
 * retry so the in-chat leaderboard and the prompt can't drift).
 */

import type { Dispatch, SetStateAction } from 'react'
import { runVotingPhase } from '@/hooks/session/run-voting-phase'
import { runJudgeSynthesis } from '@/hooks/session/run-judge-synthesis'
import { buildVotingLabels } from '@/utils/voting-labels'
import { buildVoteEvent } from '@/utils/session/vote-event'
import { uuid } from '@/utils/uuid'
import type {
  CouncilDeliberation,
  Judge,
  Seat,
  SeatConfig,
  Turn,
  TurnEvent,
} from '@/types/council'
import type { JudgingTurn, VotingTurn } from '@/types/session'

export interface TrialPhaseResult {
  /** New events to append to the turn — `vote` (one per voter) then the
   *  single `judge` event, in that order. */
  events: TurnEvent[]
  /** Per-turn anonymization map (label → seatId), or `undefined` when
   *  voting was skipped. Persisted on the turn for the voting UI. */
  labels: Record<string, string> | undefined
}

export async function runTrialPhase(args: {
  turnId: string
  /** The council's Judge slot (or undefined — then no Judge phase runs). */
  judge: Judge | undefined
  /** Full roster (for named leaderboard labels in the Judge context). */
  seats: Seat[]
  /** Seats whose participant answer landed this turn — the vote pool. */
  activeSeats: Seat[]
  /** The participant answer events built this turn (read, never mutated). */
  answerEvents: TurnEvent[]
  userMsg: string
  /** The turn's image attachments — threaded to voters (per-voter vision
   *  guard in `runVoteForVoter`) and to a vision-capable Judge, so the
   *  raters and the verdict see what the answers are about. */
  userImages?: string[]
  priorTurns: Turn[]
  /** Raw per-council overrides; resolved inside (council ?? global ?? default). */
  deliberation: CouncilDeliberation | undefined
  /** Per-turn extended-thinking override (the composer's run options) —
   *  applied to the Judge where its model supports reasoning. Voters take
   *  no sampling knobs, so voting is unaffected. */
  reasoningEffortOverride?: NonNullable<SeatConfig['reasoningEffort']>
  abortSignal: AbortSignal
  setVotingTurn: Dispatch<SetStateAction<VotingTurn | null>>
  setJudgingTurn: Dispatch<SetStateAction<JudgingTurn | null>>
}): Promise<TrialPhaseResult> {
  const {
    turnId,
    judge,
    seats,
    activeSeats,
    answerEvents,
    userMsg,
    userImages,
    priorTurns,
    deliberation,
    reasoningEffortOverride,
    abortSignal,
    setVotingTurn,
    setJudgingTurn,
  } = args

  const newEvents: TurnEvent[] = []
  // Downstream context (the Judge) reads answers + votes together, so keep a
  // running combined view without mutating the caller's answer array.
  const eventsForContext: TurnEvent[] = [...answerEvents]
  let labels: Record<string, string> | undefined

  const hasAnswer = (seatId: string) =>
    answerEvents.some(
      (e) =>
        e.roleType === 'participant' &&
        e.seatId === seatId &&
        !e.error &&
        e.output.length > 0,
    )

  // ── Voting ──────────────────────────────────────────────────────────
  if (!abortSignal.aborted) {
    const respondingSeats = activeSeats.filter((s) => hasAnswer(s.id))
    if (respondingSeats.length >= 2) {
      labels = buildVotingLabels(respondingSeats.map((s) => s.id))
      const outcomes = await runVotingPhase({
        turnId,
        voters: respondingSeats,
        votingLabels: labels,
        events: answerEvents,
        userMsg,
        ...(userImages && userImages.length > 0 ? { userImages } : {}),
        abortSignal,
        deliberation,
        setVotingTurn,
      })
      // Aborted voters leave no event (same rule as a pure abort during the
      // answer phase); errored voters still land an event so the UI can show
      // what went wrong.
      for (const { voter, result } of outcomes) {
        if (result.aborted && result.vote.length === 0) continue
        const ev = buildVoteEvent({ id: uuid(), voter, result })
        newEvents.push(ev)
        eventsForContext.push(ev)
      }
    }
  }

  // ── Judge ───────────────────────────────────────────────────────────
  // Runs after voting (which may have been skipped). Needs at least one
  // successful answer to synthesize from; an empty turn gets no Judge event.
  if (judge && !abortSignal.aborted && activeSeats.some((s) => hasAnswer(s.id))) {
    setJudgingTurn({
      id: turnId,
      modelId: judge.modelId,
      status: 'judging',
      error: null,
      output: '',
    })
    // Context, prompt, vision guard, and event shape all live in the
    // shared `runJudgeSynthesis` — one implementation with the retry path.
    const { result, event } = await runJudgeSynthesis({
      eventId: uuid(),
      judge,
      seats,
      events: eventsForContext,
      userMsg,
      ...(userImages && userImages.length > 0 ? { userImages } : {}),
      priorTurns,
      deliberation,
      ...(reasoningEffortOverride ? { reasoningEffortOverride } : {}),
      abortSignal,
      onChunk: (acc) =>
        setJudgingTurn((cur) =>
          cur && cur.id === turnId ? { ...cur, output: acc } : cur,
        ),
    })
    setJudgingTurn((cur) =>
      cur && cur.id === turnId
        ? {
            ...cur,
            output: result.text,
            status: result.error ? 'error' : 'done',
            error: result.error ?? null,
          }
        : cur,
    )
    // `event` is null only for a pure abort with no text — no record then.
    if (event) newEvents.push(event)
  }

  return { events: newEvents, labels }
}
