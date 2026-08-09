/**
 * Voting phase orchestration — fans out `runVoteForVoter` over a set
 * of voter seats in parallel, reports per-voter progress through the
 * `setVotingTurn` setter, and returns the outcomes.
 *
 * **Why a shared function.** The initial-vote block inside `runTurn`
 * and the `retryFailedVotes` callback used to duplicate ~130 LOC of
 * orchestration (resolve prompts + behavior + dimensions, seed
 * `votingTurn`, fan out `runVoteForVoter`, report per-voter progress)
 * even though they only differed in *which voters* to run and *what
 * to do with the results*. This helper owns the shared scaffolding;
 * the caller picks the voters and the result-handling.
 *
 * What this function does NOT do:
 * - Build TurnEvents from the results (initial creates new event
 *   ids; retry replaces by existing id — caller-specific).
 * - Persist anything (initial defers to a single appendTurn;
 *   retry calls `apiReplaceEvent` per outcome).
 * - Clear `votingTurn` at the end (the orchestrator's `finally` block
 *   does that for runTurn; retryFailedVotes does it inline).
 */

import type { CouncilDeliberation, Seat, TurnEvent } from '@/types/council'
import type { PerVoterStream, VotingTurn } from '@/types/session'
import { runVoteForVoter, type VoteResult } from '@/providers/run-vote'
import {
  DEFAULT_STRIP_SELF_ID,
  formatDimensionsDescription,
  getBehaviorSettings,
} from '@/storage/behavior'
import { resolveDeliberation } from '@/hooks/session/resolve-deliberation'
import { clampMinCommentLength } from '@/utils/session/clamps'
import { fanOutSeats } from '@/utils/session/fan-out'

export interface VoterOutcome {
  voter: Seat
  result: VoteResult
}

export async function runVotingPhase(args: {
  turnId: string
  /** Voter seats to fan out over. */
  voters: Seat[]
  /** Per-turn anonymisation map (label → seatId). Caller decides
   *  whether to build a fresh map (initial voting) or reuse the
   *  turn's persisted map (retry). */
  votingLabels: Record<string, string>
  /** Event context fed to the voter prompt — the Participant answers
   *  the voter is asked to rate. */
  events: TurnEvent[]
  userMsg: string
  /** The turn's image attachments — voters must see what the answers are
   *  about. `runVoteForVoter` applies the per-voter vision guard. */
  userImages?: string[]
  abortSignal: AbortSignal
  /** Per-council deliberation overrides for this turn's council. The
   *  voter prompt / rubric / min-comment knobs resolve through it via
   *  the council ?? global ?? default cascade. */
  deliberation: CouncilDeliberation | undefined
  /** Phase-state setter from the orchestrator. The helper seeds it
   *  with the initial per-voter state before fanning out and updates
   *  each voter's slot as `runVoteForVoter` resolves. */
  setVotingTurn: React.Dispatch<React.SetStateAction<VotingTurn | null>>
}): Promise<VoterOutcome[]> {
  const {
    turnId,
    voters,
    votingLabels,
    events,
    userMsg,
    userImages,
    abortSignal,
    deliberation,
    setVotingTurn,
  } = args

  // Seed the per-voter state machine. Every voter starts in 'voting'
  // status; the per-voter callback below transitions each to 'done'
  // or 'error' as `runVoteForVoter` resolves.
  const initialPerVoter: Record<string, PerVoterStream> = {}
  for (const voter of voters) {
    initialPerVoter[voter.id] = {
      status: 'voting',
      error: null,
      vote: null,
      modelId: voter.modelId,
      rawResponse: null,
    }
  }
  // Merged, not replaced: a resumed turn seeds this state with the votes an
  // interrupted attempt already landed, and only the *pending* voters reach
  // this fan-out. Clobbering would blank those settled cards for the length
  // of the resume. (On a fresh run there is nothing to merge and the result
  // is identical to the previous assignment.)
  setVotingTurn((cur) =>
    cur && cur.id === turnId
      ? { ...cur, perVoter: { ...cur.perVoter, ...initialPerVoter }, votingLabels }
      : { id: turnId, perVoter: initialPerVoter, votingLabels },
  )

  const updatePerVoter = (
    seatId: string,
    patch: Partial<PerVoterStream>,
  ) => {
    setVotingTurn((cur) => {
      if (!cur || cur.id !== turnId) return cur
      const existing = cur.perVoter[seatId]
      if (!existing) return cur
      return {
        ...cur,
        perVoter: {
          ...cur.perVoter,
          [seatId]: { ...existing, ...patch },
        },
      }
    })
  }

  // Resolve prompts + dimensions once per phase — same values apply to
  // every voter in the fan-out. The voter prompt / rubric / min-comment
  // knobs go through the per-council cascade; `stripSelfId` is a global
  // correctness knob, so it stays read straight from behavior settings.
  const resolved = resolveDeliberation(deliberation)
  const voteSystem = resolved.votingSystem
  const voteTemplate = resolved.votingTemplate
  const stripSelfId = getBehaviorSettings().stripSelfId ?? DEFAULT_STRIP_SELF_ID
  const dimensionConfigs = resolved.votingDimensions
  const dimensions = dimensionConfigs.map((d) => d.name)
  const dimensionsDescription = formatDimensionsDescription(dimensionConfigs)
  const minCommentLength = clampMinCommentLength(resolved.minCommentLength)

  const settled = await fanOutSeats(voters, async (voter) => {
    const result = await runVoteForVoter({
      voter,
      votingLabels,
      events,
      userMsg,
      voteSystem,
      voteTemplate,
      dimensions,
      dimensionsDescription,
      minCommentLength,
      stripSelfId,
      ...(userImages && userImages.length > 0 ? { userImages } : {}),
      abortSignal,
    })
    updatePerVoter(voter.id, {
      status: result.error ? 'error' : 'done',
      error: result.error ?? null,
      vote: result.vote.length > 0 ? result.vote : null,
      rawResponse: result.rawResponse ?? null,
    })
    return result
  })
  return settled.map(({ seat, result }) => ({ voter: seat, result }))
}
