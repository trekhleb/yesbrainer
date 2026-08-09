/**
 * Renders one *persisted* turn in the chat thread.
 *
 * Two shapes, by social structure:
 *  - **Consensus**: user bubble + the interleaved Consensus debate
 *    (`<ConsensusTurn>`) — Roundtable, then alternating Mediator
 *    assessments and Participant re-answer rounds.
 *  - **Trial / Parallel**: user bubble + Roundtable panes + optional
 *    voting / judge blocks.
 *
 * Twin component to `<StreamingTurnView>` — same block sequence; this one
 * reads from the persisted `Turn.events` and surfaces the per-block "retry
 * failed votes" button. The streaming version reads from the
 * orchestrator's in-flight phase state.
 *
 * `votingTurnOverlay` is the retry-failed-votes mid-flight overlay:
 * when present and its id matches this turn's, voter cards merge
 * persisted votes with the in-flight retry state so the user sees
 * "voting…" on the seats being retried without losing the others.
 */

import { Fragment, memo, useState } from 'react'
import { JudgeBlock } from '@/components/judge-block'
import { ConsensusTurn } from '@/components/chat-thread/consensus-turn'
import { OpenAnchor } from '@/components/chat-thread/open-anchor'
import { PausedNotice } from '@/components/chat-thread/paused-notice'
import { RoundtableGroup } from '@/components/roundtable-group'
import { ShareVerdictModal } from '@/components/share-verdict-modal'
import { UserBubble } from '@/components/user-bubble'
import { VotingBlock } from '@/components/voting-block'
import { aggregateVotesByTarget } from '@/utils/vote-leaderboard'
import { consensusRoundsForTurn, panesForTurn } from '@/utils/chat-panes'
import { isFinishedEvent, isTurnShareable } from '@/utils/shareability'
import { findJudgeEvent, mergeVoterEntries } from '@/utils/voter-entries'
import type { Council, SocialStructure, Turn } from '@/types/council'
import type {
  RoundtablePane,
  SeatRetryState,
  SynthRetryState,
  VotingTurn,
} from '@/types/session'

export interface TurnViewProps {
  turn: Turn
  seats: Council['seats']
  socialStructure: SocialStructure
  /** Mediator config on the council (may differ from when the turn
   *  ran — we fall back to the turn's own mediator events for the
   *  historical identity). */
  councilMediatorModelId?: string
  /** Mid-flight retry overlay: present only if the orchestrator is
   *  currently retrying failed votes on *this* turn. */
  votingTurnOverlay: VotingTurn | null
  /** True iff nothing is currently in flight — gates the retry-failed-votes
   *  button (it fires fresh provider calls). */
  actionsEnabled: boolean
  /** Re-run errored voters in this turn (Trial only). */
  onRetryFailedVotes: (turnId: string) => void
  /** Mid-flight per-seat answer retry: present only while a retry targets
   *  *this* turn — its streaming output overlays the matching pane. */
  seatRetryOverlay: SeatRetryState | null
  /** Re-run one errored Participant answer. Supplied only where the retry
   *  is offered (latest turn whose answers no downstream phase consumed —
   *  see `chat-thread.tsx`); undefined hides the button. */
  onRetrySeatAnswer?: (turnId: string, seatId: string) => void
  /** Mid-flight synthesis retry: present only while a Judge / Mediator
   *  retry targets *this* turn — it overlays the matching block. */
  synthRetryOverlay: SynthRetryState | null
  /** Re-run an errored Judge verdict. Supplied on the latest turn only;
   *  undefined hides the button. */
  onRetryJudge?: (turnId: string) => void
  /** Pick this turn's interrupted run back up. Supplied only where a resume
   *  is possible (latest turn, nothing in flight); undefined hides the
   *  button but the paused card still explains the state. */
  onResume?: (turnId: string) => void
  /** A run for this council is already in flight from a previous mount —
   *  the card reports that rather than offering a dead Resume. */
  hasBackgroundRun?: boolean
  /** Re-run the final errored Mediator round. Supplied on the latest turn
   *  only; undefined hides the button. */
  onRetryMediatorRound?: (turnId: string) => void
  /** This is the thread's latest turn — gates the verdict/consensus arrival
   *  entrance (the "reveal") so only the freshest result
   *  animates, not every verdict on a multi-turn council open. */
  isLatestTurn?: boolean
  /** Open-landing marker (latest turn only): rendered at the start of this
   *  turn's last section — Judge verdict / final Consensus round / the
   *  answer fan-out — so opening the council lands on the result. */
  openAnchorRef?: React.RefObject<HTMLDivElement | null>
}

// `memo` so a streamed token in the in-flight turn doesn't re-render every
// *settled* turn above it. During a stream all props here resolve to stable
// values — `turn`/`seats` are referentially stable (the live answer lives in a
// separate `streamingTurn`), `actionsEnabled`/`isLatestTurn` are `false`, the
// overlays are `null`, and the retry callbacks are `useCallback`-stable at the
// council-view seam (or omitted entirely) — so the default shallow compare
// skips the whole settled turn. Combined with `memo(Markdown)`, a token now
// touches only the one growing pane instead of re-rendering + re-parsing the
// entire thread.
export const TurnView = memo(function TurnView({
  turn,
  seats,
  socialStructure,
  councilMediatorModelId,
  votingTurnOverlay,
  actionsEnabled,
  onRetryFailedVotes,
  seatRetryOverlay,
  onRetrySeatAnswer,
  synthRetryOverlay,
  onRetryJudge,
  onRetryMediatorRound,
  onResume,
  hasBackgroundRun = false,
  isLatestTurn = false,
  openAnchorRef,
}: TurnViewProps) {
  // An unfinished run is a property of the turn, so its card renders in
  // both shapes below rather than being duplicated into each.
  const pausedNotice = turn.runState ? (
    <PausedNotice
      runState={turn.runState}
      {...(turn.runState.cause ? { cause: turn.runState.cause } : {})}
      {...(onResume ? { onResume: () => onResume(turn.id) } : {})}
      resuming={hasBackgroundRun}
    />
  ) : null
  // Share-the-result modal — one per turn, opened
  // from the Judge verdict / final Mediator round header. Persisted turns
  // only (the streaming twin never offers it — nothing final to share).
  const [shareOpen, setShareOpen] = useState(false)
  const shareModal = shareOpen ? (
    <ShareVerdictModal
      structure={socialStructure}
      question={turn.userMsg}
      userImages={turn.userImages}
      events={turn.events}
      seats={seats}
      onClose={() => setShareOpen(false)}
    />
  ) : null

  // Per-seat retry decoration, shared by the Trial / Parallel panes and the
  // Consensus round-1 panes (both are `panesForTurn` shapes — re-answer
  // rounds carry no `seatId`, so they can never pick up the affordance):
  // overlay the in-flight retry's streaming output on its pane, and attach
  // the Retry action to errored panes where it's offered.
  const decorateAnswerPanes = (
    panes: RoundtablePane[],
  ): RoundtablePane[] =>
    panes.map((pane) => {
      if (seatRetryOverlay && pane.seatId === seatRetryOverlay.seatId) {
        return {
          ...pane,
          status: 'streaming' as const,
          error: null,
          output: seatRetryOverlay.output,
        }
      }
      if (
        onRetrySeatAnswer &&
        actionsEnabled &&
        pane.error &&
        pane.seatId &&
        // The seat must still be seated — a removed seat has no config to
        // re-run with (the hook re-checks; this just hides the affordance).
        seats.some((s) => s.id === pane.seatId)
      ) {
        const seatId = pane.seatId
        return { ...pane, onRetry: () => onRetrySeatAnswer(turn.id, seatId) }
      }
      return pane
    })

  if (socialStructure === 'consensus') {
    const baseRounds = consensusRoundsForTurn(turn, seats).map((r) =>
      // Round 1 is the participant fan-out — the only Consensus round the
      // per-seat answer retry applies to (the retry hook re-runs
      // `participant` events; re-answers belong to the debate loop).
      r.round === 1
        ? { ...r, answerPanes: decorateAnswerPanes(r.answerPanes) }
        : r,
    )
    // Only the turn's *final* Mediator round is retryable — an earlier
    // errored round was already survived by a later one. Mirrors the guard
    // in `useRetrySynthesis`.
    let lastMediatorRound = -1
    for (let i = baseRounds.length - 1; i >= 0; i--) {
      const m = baseRounds[i]?.mediator
      if (m) {
        lastMediatorRound = m.round
        break
      }
    }
    const mediatorRetry =
      synthRetryOverlay?.role === 'mediator' ? synthRetryOverlay : null
    const rounds = baseRounds.map((r) => {
      if (!r.mediator) return r
      // Overlay: the round being re-run renders as in-flight again.
      if (mediatorRetry && mediatorRetry.round === r.mediator.round) {
        return {
          ...r,
          mediator: {
            round: r.mediator.round,
            modelId: mediatorRetry.modelId,
            status: 'mediating' as const,
            synthesis: '',
            error: null,
          },
        }
      }
      if (
        onRetryMediatorRound &&
        actionsEnabled &&
        r.mediator.round === lastMediatorRound &&
        r.mediator.status === 'error'
      ) {
        return {
          ...r,
          mediator: {
            ...r.mediator,
            onRetry: () => onRetryMediatorRound(turn.id),
          },
        }
      }
      return r
    })
    // Council.mediator may have been swapped since the turn ran — fall back
    // to the modelId on the first mediator event for the historical identity.
    const mediatorModelId =
      councilMediatorModelId ??
      rounds.find((r) => r.mediator)?.mediator?.modelId ??
      ''
    // An interrupted debate knows its own cap from the run that was cut
    // off; without it, "of N" would be derived from the rounds that *did*
    // land and a debate paused at round 1 of 3 would announce itself as
    // "Round #1 of 1" — i.e. as finished. Same reason `isTurnShareable`
    // refuses an unfinished turn: a stopped debate is not a verdict.
    const maxRounds = Math.max(
      1,
      turn.runState?.maxRounds ?? 1,
      ...rounds.map((r) => r.round),
    )
    // Share rides the *final finished* round (same "only the last round"
    // rule as retry) — computed on the post-overlay rounds so a round
    // currently being re-run doesn't offer it.
    // …and never on an unfinished turn: the "final" round of a debate that
    // was interrupted is only the last one that happened to land.
    // `isTurnShareable` owns that rule for every other surface.
    let shareRound = -1
    if (isTurnShareable(turn, socialStructure)) {
      for (const r of rounds) {
        const m = r.mediator
        if (m && m.status === 'done' && m.synthesis.length > 0) {
          shareRound = Math.max(shareRound, m.round)
        }
      }
    }
    const roundsWithShare =
      shareRound < 0
        ? rounds
        : rounds.map((r) =>
            r.mediator && r.mediator.round === shareRound
              ? {
                  ...r,
                  mediator: {
                    ...r.mediator,
                    onShare: () => setShareOpen(true),
                    // Only the latest turn's consensus "arrives".
                    arrival: isLatestTurn,
                  },
                }
              : r,
          )
    return (
      <Fragment>
        <UserBubble content={turn.userMsg} images={turn.userImages} />
        <ConsensusTurn
          rounds={roundsWithShare}
          mediatorModelId={mediatorModelId}
          maxRounds={maxRounds}
          isUnfinished={turn.runState !== undefined}
          openAnchorRef={openAnchorRef}
        />
        {pausedNotice}
        {shareModal}
      </Fragment>
    )
  }

  // (exhaustiveness) Everything below is the answer-fan-out shape shared
  // by the remaining structures; a new structure must either join this
  // list or take a branch above — the `satisfies` fails typecheck until
  // it does.
  void (socialStructure satisfies 'roundtable' | 'trial' | 'custom')

  const persistedVoterEntries = mergeVoterEntries(turn, votingTurnOverlay)
  const judgeEvent = findJudgeEvent(turn)
  const hasVoting = persistedVoterEntries.length > 0
  const panes = decorateAnswerPanes(panesForTurn(turn, seats))

  // Parallel-shaped councils share the answer fan-out itself (their result
  // is the divergence panorama). Trial doesn't — its Roundtable is a phase
  // and the share lives on the verdict block below. The criterion is the
  // shared `isTurnShareable` rule.
  const parallelShare =
    socialStructure !== 'trial' && isTurnShareable(turn, socialStructure)

  // The open-landing anchor sits at the start of the turn's *last* section —
  // normally the verdict, but a turn whose downstream phases never ran (all
  // seats errored, keyless partial send) still lands on whatever it has.
  const judgeShown = synthRetryOverlay?.role === 'judge' || judgeEvent != null
  const lastSection = judgeShown ? 'judge' : hasVoting ? 'voting' : 'answers'

  return (
    <Fragment>
      <UserBubble content={turn.userMsg} images={turn.userImages} />
      {openAnchorRef && lastSection === 'answers' ? (
        <OpenAnchor anchorRef={openAnchorRef} />
      ) : null}
      <RoundtableGroup
        panes={panes}
        {...(parallelShare ? { onShare: () => setShareOpen(true) } : {})}
      />
      {openAnchorRef && lastSection === 'voting' ? (
        <OpenAnchor anchorRef={openAnchorRef} />
      ) : null}
      {hasVoting && (
        <VotingBlock
          seats={seats}
          voterEntries={persistedVoterEntries}
          targets={aggregateVotesByTarget(turn.events, seats)}
          onRetryFailed={
            actionsEnabled ? () => onRetryFailedVotes(turn.id) : undefined
          }
        />
      )}
      {openAnchorRef && lastSection === 'judge' ? (
        <OpenAnchor anchorRef={openAnchorRef} />
      ) : null}
      {synthRetryOverlay?.role === 'judge' ? (
        // The verdict is being re-run — render it as in-flight again, with
        // the retry's streaming output replacing the errored event.
        <JudgeBlock
          modelId={synthRetryOverlay.modelId}
          output={synthRetryOverlay.output}
          status="judging"
          error={null}
        />
      ) : judgeEvent ? (
        <JudgeBlock
          modelId={judgeEvent.modelId}
          output={judgeEvent.output}
          status={judgeEvent.error ? 'error' : 'done'}
          error={judgeEvent.error ?? null}
          {...(onRetryJudge && actionsEnabled && judgeEvent.error
            ? { onRetry: () => onRetryJudge(turn.id) }
            : {})}
          {...(isFinishedEvent(judgeEvent)
            ? { onShare: () => setShareOpen(true), arrival: isLatestTurn }
            : {})}
        />
      ) : null}
      {pausedNotice}
      {shareModal}
    </Fragment>
  )
})
