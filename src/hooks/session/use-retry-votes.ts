/**
 * Failed-vote retry for `useCouncilSession`.
 *
 * Re-runs only the voters that errored in a persisted Trial turn (a small
 * model's structured-output parse failing is the common cause) and replaces
 * each errored vote event **in place** (same event id), so the successful
 * votes stay put. Completes the retry-hook family alongside `use-retry-seat`
 * (a failed answer) and `use-retry-synthesis` (a failed Judge / Mediator).
 *
 * Extracted from the orchestrator so `use-council-session.ts` stays
 * a thin turn pipeline. Controller acquisition/release and the
 * replace-in-place tail ride the shared `runSessionRetry` /
 * `replaceRetriedEvent` mechanics; progress reports through `setVotingTurn`;
 * `isBusy` spans every parent phase because "busy" is not one phase's
 * concern.
 */

import { useCallback } from 'react'
import {
  replaceRetriedEvent,
  runSessionRetry,
} from '@/hooks/session/retry-run'
import { runVotingPhase } from '@/hooks/session/run-voting-phase'
import { buildVoteEvent } from '@/utils/session/vote-event'
import type { Council, Seat } from '@/types/council'
import type { VotingTurn } from '@/types/session'

export function useRetryVotes({
  council,
  setCouncil,
  abortRef,
  runStartingRef,
  isBusy,
  setVotingTurn,
}: {
  council: Council | null
  setCouncil: React.Dispatch<React.SetStateAction<Council | null>>
  abortRef: React.MutableRefObject<AbortController | null>
  /** Set, synchronously, while a resume is being started. `isBusy` can't
   *  cover that window: it only flips once the run's first `setState`
   *  commits, and auto-resume fires without a click — so a retry tapped in
   *  between would become a second writer, and `appendTurn` replaces a
   *  turn's events wholesale. Same ref shape as `abortRef` above. */
  runStartingRef: React.MutableRefObject<string | null>
  /** True while any parent phase is in flight — a retry must not race them. */
  isBusy: boolean
  setVotingTurn: React.Dispatch<React.SetStateAction<VotingTurn | null>>
}): {
  retryFailedVotes: (turnId: string) => Promise<void>
} {
  const retryFailedVotes = useCallback(
    async (turnId: string) => {
      if (!council || isBusy || runStartingRef.current !== null) return

      const turn = council.turns.find((t) => t.id === turnId)
      if (!turn || !turn.votingLabels) return
      const votingLabels = turn.votingLabels

      // Voters that errored *and* still have a place at the table — find
      // their seats and existing vote events so we can replace them in place.
      const failedVoteEvents = turn.events.filter(
        (e) => e.roleType === 'vote' && !!e.error && !!e.seatId,
      )
      if (failedVoteEvents.length === 0) return

      const failedVoterSeats: Seat[] = []
      for (const ev of failedVoteEvents) {
        const seat = council.seats.find((s) => s.id === ev.seatId)
        if (seat) failedVoterSeats.push(seat)
      }
      if (failedVoterSeats.length === 0) return

      await runSessionRetry(
        council.id,
        abortRef,
        async (signal) => {
          const outcomes = await runVotingPhase({
            turnId,
            voters: failedVoterSeats,
            votingLabels,
            events: turn.events,
            userMsg: turn.userMsg,
            // Same rule as the initial vote: raters of an image turn see
            // the image (per-voter vision guard inside `runVoteForVoter`).
            ...(turn.userImages && turn.userImages.length > 0
              ? { userImages: turn.userImages }
              : {}),
            abortSignal: signal,
            deliberation: council.deliberation,
            setVotingTurn,
          })

          // Replace each failed event in place (by id), then mirror locally.
          for (const { voter, result } of outcomes) {
            if (result.aborted && result.vote.length === 0) continue
            const oldEvent = failedVoteEvents.find(
              (e) => e.seatId === voter.id,
            )
            if (!oldEvent) continue
            await replaceRetriedEvent({
              councilId: council.id,
              turnId,
              event: buildVoteEvent({ id: oldEvent.id, voter, result }),
              site: 'retryFailedVotes',
              setCouncil,
            })
          }
        },
        () => setVotingTurn(null),
      )
    },
    [council, setCouncil, abortRef, runStartingRef, isBusy, setVotingTurn],
  )

  return { retryFailedVotes }
}
