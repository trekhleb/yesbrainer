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
import {
  classifyInterruption,
  type InterruptionCause,
  type VisibilityWatch,
} from '@/utils/session/interruption'
import {
  isUsableAnswer,
  type TurnProgress,
} from '@/utils/session/remaining-work'
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
   *  single `judge` event, in that order. Excludes anything an interrupted
   *  earlier attempt already persisted. */
  events: TurnEvent[]
  /** Per-turn anonymization map (label → seatId), or `undefined` when
   *  voting was skipped. Persisted on the turn for the voting UI. */
  labels: Record<string, string> | undefined
  /** Set when the phase stopped because the browser took the page away
   *  rather than because the phase finished. */
  interrupted: InterruptionCause | null
}

/** Checkpoint hook — see `ConsensusCheckpoint`. Called once voting has
 *  settled, so a page killed during the (slower) Judge synthesis keeps the
 *  votes it already paid for. Carries the anonymization map for the same
 *  reason the Consensus one does: a resume must re-label the remaining
 *  voters exactly as the interrupted attempt labelled the first ones. */
export type TrialCheckpoint = (
  events: readonly TurnEvent[],
  at: { labels?: Record<string, string> },
) => Promise<void>

/** Record the stage that is *starting* — see `ConsensusPhaseMarker`. */
export type TrialPhaseMarker = (at: { phase: 'voting' | 'judging' }) => void

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
  /** Work an interrupted earlier attempt already persisted. Omitted on a
   *  fresh run, where every step is pending and the flow is unchanged. */
  progress?: Pick<TurnProgress, 'pendingVoterSeats' | 'judgeDone'>
  /** The anonymization map the interrupted attempt used — reused so a
   *  resumed turn's votes stay addressed to the same labels. */
  existingLabels?: Record<string, string>
  watch: VisibilityWatch
  checkpoint: TrialCheckpoint
  markPhase: TrialPhaseMarker
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
    progress,
    existingLabels,
    watch,
    checkpoint,
    markPhase,
  } = args

  const newEvents: TurnEvent[] = []
  // Downstream context (the Judge) reads answers + votes together, so keep a
  // running combined view without mutating the caller's answer array. On a
  // resume the caller's `answerEvents` already include the votes an earlier
  // attempt persisted, so the Judge sees the full picture either way.
  const eventsForContext: TurnEvent[] = [...answerEvents]
  let labels: Record<string, string> | undefined = existingLabels
  let interrupted: InterruptionCause | null = null

  // Shared definition — see `isUsableAnswer`. A local copy of this
  // predicate that drifted from the one `remaining-work` uses would make a
  // resume disagree with the live run about who still owes an answer.
  const hasAnswer = (seatId: string) =>
    answerEvents.some(
      (e) =>
        e.roleType === 'participant' &&
        e.seatId === seatId &&
        isUsableAnswer(e),
    )

  // Re-checked at the Judge block itself, which also has to know whether
  // voting was interrupted.
  const willJudge =
    judge !== undefined &&
    progress?.judgeDone !== true &&
    activeSeats.some((s) => hasAnswer(s.id))

  // ── Voting ──────────────────────────────────────────────────────────
  if (!abortSignal.aborted) {
    const respondingSeats = activeSeats.filter((s) => hasAnswer(s.id))
    // On a resume only the voters whose slot is still empty run; a vote the
    // earlier attempt persisted (even an errored one) is done, and re-running
    // it would bill the user twice for a rating the turn already holds.
    const voters = progress?.pendingVoterSeats ?? respondingSeats
    if (respondingSeats.length >= 2 && voters.length > 0) {
      markPhase({ phase: 'voting' })
      labels ??= buildVotingLabels(respondingSeats.map((s) => s.id))
      const startedAt = Date.now()
      const outcomes = await runVotingPhase({
        turnId,
        voters,
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
      // what went wrong. Interrupted voters also leave no event — that empty
      // slot is exactly what tells the resume to re-issue this voter.
      for (const { voter, result } of outcomes) {
        if (result.aborted && result.vote.length === 0) continue
        const cause = classifyInterruption({
          error: result.error,
          startedAt,
          watch,
        })
        if (cause) {
          interrupted ??= cause
          continue
        }
        const ev = buildVoteEvent({ id: uuid(), voter, result })
        newEvents.push(ev)
        eventsForContext.push(ev)
      }
      if (newEvents.length > 0) await checkpoint(newEvents, { labels })
    }
  }

  // ── Judge ───────────────────────────────────────────────────────────
  // Runs after voting (which may have been skipped). Needs at least one
  // successful answer to synthesize from; an empty turn gets no Judge event.
  // A verdict the earlier attempt already produced is never re-run — and an
  // incomplete vote set means the verdict would be synthesized from a
  // half-rated field, so the resume stops and comes back for it.
  if (judge && willJudge && !interrupted && !abortSignal.aborted) {
    // The Judge call is the slow one and therefore the likely place to be
    // cut off; a turn killed there must not report "during peer review".
    markPhase({ phase: 'judging' })
    setJudgingTurn({
      id: turnId,
      modelId: judge.modelId,
      status: 'judging',
      error: null,
      output: '',
    })
    // Context, prompt, vision guard, and event shape all live in the
    // shared `runJudgeSynthesis` — one implementation with the retry path.
    const startedAt = Date.now()
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
    const cause = classifyInterruption({
      error: result.error,
      startedAt,
      watch,
    })
    if (cause) {
      // No verdict event, and the "judging" card is withdrawn rather than
      // flipped to red: nothing about the Judge failed, the page was taken
      // away mid-synthesis. The empty slot is what the resume re-runs.
      interrupted = cause
      setJudgingTurn((cur) => (cur && cur.id === turnId ? null : cur))
    } else {
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
  }

  return { events: newEvents, labels, interrupted }
}
