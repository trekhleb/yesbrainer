/**
 * Linear chat view.
 *
 * Outer scaffold + the turns-list map. Per-turn rendering lives in
 * `src/components/chat-thread/turn-view.tsx` (persisted turns) and
 * `streaming-turn-view.tsx` (the in-flight turn).
 *
 * Each turn renders as: one user bubble + one Roundtable block +
 * optional voting / judge blocks (Trial) or the interleaved Consensus
 * debate (Mediator rounds + re-answers). Quiet
 * uppercase group labels (not frames or connector graphics) are what
 * signal "this is one round" — the decorative bezier connector strips
 * were removed in iteration 2 (noisy, and their
 * measurement plumbing wasn't paying for itself).
 */

import { useStyletron } from 'baseui'
import { Notification, KIND as NotificationKind } from 'baseui/notification'
import { ParagraphMedium } from 'baseui/typography'
import { StreamingTurnView } from '@/components/chat-thread/streaming-turn-view'
import { TurnView } from '@/components/chat-thread/turn-view'
import { useChatAutoScroll } from '@/hooks/use-chat-auto-scroll'
import { FULL_BLEED_NOTIFICATION_OVERRIDES } from '@/utils/notification-styles'
import type {
  JudgingTurn,
  MediatingTurn,
  SeatRetryState,
  SynthRetryState,
  StreamingTurn,
  VotingTurn,
} from '@/types/session'
import type { Council } from '@/types/council'

export interface ChatThreadProps {
  council: Council
  streamingTurn: StreamingTurn | null
  /** In-flight Trial voting phase (after answers, before turn
   *  persists). Also used as the retry-overlay on persisted turns
   *  when its id matches a persisted turn (retry-failed-votes
   *  flow). */
  votingTurn: VotingTurn | null
  /** In-flight Consensus debate — Mediator rounds interleaved with
   *  per-round Participant re-answers. */
  mediatingTurn: MediatingTurn | null
  /** In-flight Trial Judge synthesis (after voting, before turn
   *  persists). */
  judgingTurn: JudgingTurn | null
  /** Re-run errored voters in a persisted Trial turn. */
  onRetryFailedVotes: (turnId: string) => void
  /** In-flight per-seat answer retry (its output overlays the pane). */
  seatRetry: SeatRetryState | null
  /** Re-run one errored Participant answer in a persisted turn. */
  onRetrySeatAnswer: (turnId: string, seatId: string) => void
  /** In-flight synthesis retry (Judge / final Mediator round) — overlays
   *  the matching block on its persisted turn. */
  synthRetry: SynthRetryState | null
  /** Re-run an errored Judge verdict in a persisted Trial turn. */
  onRetryJudge: (turnId: string) => void
  /** Re-run the final errored Mediator round in a persisted Consensus turn. */
  onRetryMediatorRound: (turnId: string) => void
  /** Pick an interrupted turn's run back up. */
  onResume: (turnId: string) => void
  /** A run for this council is in flight but owned by a previous mount of
   *  this view — see `useCouncilSession`. */
  hasBackgroundRun: boolean
  error: string | null
  /** Extra bottom padding (px) so the last message can scroll clear of the
   *  composer, which floats over the thread's lower edge (ChatGPT-style).
   *  Measured from the live composer height by `CouncilView`. */
  bottomInset?: number
}

export function ChatThread({
  council,
  streamingTurn,
  votingTurn,
  mediatingTurn,
  judgingTurn,
  onRetryFailedVotes,
  seatRetry,
  onRetrySeatAnswer,
  synthRetry,
  onRetryJudge,
  onRetryMediatorRound,
  onResume,
  hasBackgroundRun,
  error,
  bottomInset = 0,
}: ChatThreadProps) {
  const [css, theme] = useStyletron()
  const empty = council.turns.length === 0 && !streamingTurn
  // Per-turn actions (retry failed votes / one seat's answer / a failed
  // synthesis) fire fresh provider calls, so they're only offered when
  // nothing else is in flight — otherwise the new work would conflict with
  // the in-flight guards and silently no-op.
  const actionsEnabled = !streamingTurn && !seatRetry && !synthRetry
  // Pin-to-top auto-scroll: a fresh turn's question jumps to the top and the
  // answers stream in below it. `streamingTurn.id` is the pin signal — it
  // changes once per send. Opening lands on the latest turn's result (the
  // `openAnchorRef` marker rendered inside the last TurnView) — except demo
  // councils, which open at the *top*: a recording reads start-to-finish.
  // See `useChatAutoScroll`.
  // A *resumed* turn is streaming but not new: it is already in the mirror
  // (its earlier attempt checkpointed it), which is exactly what tells the
  // two apart. Pinning is for a question the user just asked — doing it on
  // a resume yanks them from the paused card they just clicked, up to a
  // question that can be a whole debate away.
  const isResumedTurn =
    streamingTurn !== null &&
    council.turns.some((t) => t.id === streamingTurn.id)
  const { scrollRef, anchorRef, spacerRef, openAnchorRef } = useChatAutoScroll(
    isResumedTurn ? null : (streamingTurn?.id ?? null),
    { openAtTop: council.isDemo === true },
  )

  return (
    <section
      ref={scrollRef}
      // Named landmark: this is the page's scrollable log, and an unlabelled
      // <section> is not exposed as a region at all.
      aria-label="Council thread"
      className={css({
        flex: 1,
        minHeight: 0,
        overflowY: 'auto',
        // Scope the sticky stage-headers' z-index *inside* the thread. They
        // need to layer over the scrolling answers, but their `z-index: 3`
        // must not escape to paint over the floating composer or Base Web's
        // tooltip / popover layers (both live outside this subtree). Making
        // the thread its own stacking context contains them — sticky still
        // works; the composer (positioned sibling) and portalled layers now
        // always win.
        isolation: 'isolate',
        // Edge-to-edge, no card chrome (border / radius / bg) — the thread
        // owns the whole area and the composer floats *over* it, so the chat
        // reads like ChatGPT / Gemini and no border band steals space.
        // paddingTop is 0 (not a few px) on purpose: `position: sticky;
        // top: 0` stage headers pin at the scroller's *content-box* top, so
        // any top padding becomes a transparent strip above the pinned
        // header where scrolling answer text bleeds through. The header
        // carries its own top padding for breathing room instead.
        paddingTop: '0',
        paddingLeft: '12px',
        paddingRight: '12px',
        // Bottom padding = the floating composer's measured height (+ a small
        // gap) so the last message scrolls clear of the input (see CouncilView).
        paddingBottom: `${8 + bottomInset}px`,
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      })}
    >
      {empty ? (
        <div className={css({ margin: 'auto', textAlign: 'center' })}>
          <ParagraphMedium
            marginTop="0"
            marginBottom="0"
            color={theme.colors.contentTertiary}
          >
            {`Ask the council a question — ${council.seats.length} ${
              council.seats.length === 1 ? 'member' : 'members'
            } will answer.`}
          </ParagraphMedium>
        </div>
      ) : (
        <>
          {council.turns.map((turn, i) => {
            // Overlay in-flight retry state on top of persisted
            // entries when a retry is targeting *this* persisted
            // turn (votingTurn shares the turn id and streamingTurn
            // is null since the answer phase already landed).
            const retryOverlay =
              !streamingTurn && votingTurn && votingTurn.id === turn.id
                ? votingTurn
                : null
            // Per-seat answer retry is offered on the latest turn while its
            // answers are still unconsumed — i.e. the turn holds participant
            // events only. Parallel turns always qualify; a Trial / Consensus
            // turn qualifies exactly when every downstream phase was skipped
            // (all seats failed — e.g. their providers' keys are missing), so
            // the partially-keyed first send is recoverable there too. Once
            // votes / a verdict / debate rounds exist, a late answer would be
            // invisible to them, and later turns' seat histories may have
            // consumed this one — so the affordance disappears.
            // A resumed turn is persisted *and* in flight at the same time
            // — it was checkpointed by the attempt that got interrupted.
            // The streaming view owns it for the duration (it is seeded
            // with the persisted work, so nothing disappears), and skipping
            // it here is what stops the turn rendering twice.
            if (streamingTurn?.id === turn.id) return null
            const isLatestTurn = i === council.turns.length - 1
            const answersUnconsumed = turn.events.every(
              (e) => e.roleType === 'participant',
            )
            const canRetrySeat =
              answersUnconsumed && isLatestTurn && !streamingTurn
            // Synthesis retry (Judge / final Mediator round) is latest-turn
            // only for the same reason: a later turn's synthesis context may
            // already have consumed this turn's (prior-turns block).
            const canRetrySynth = isLatestTurn && !streamingTurn
            return (
              <TurnView
                key={turn.id}
                turn={turn}
                seats={council.seats}
                socialStructure={council.socialStructure}
                councilMediatorModelId={council.mediator?.modelId}
                votingTurnOverlay={retryOverlay}
                actionsEnabled={actionsEnabled}
                // No arrival while a fresh turn is streaming below — the
                // reveal is for a settled latest result, not a stale one
                // under an in-flight send.
                isLatestTurn={isLatestTurn && !streamingTurn}
                // Open-landing marker on the latest persisted turn (the ref
                // is stable, so memo(TurnView) is undisturbed). Only read
                // during the open settle — see `useChatAutoScroll`.
                {...(isLatestTurn ? { openAnchorRef } : {})}
                onRetryFailedVotes={onRetryFailedVotes}
                seatRetryOverlay={
                  seatRetry && seatRetry.turnId === turn.id ? seatRetry : null
                }
                {...(canRetrySeat
                  ? { onRetrySeatAnswer }
                  : {})}
                synthRetryOverlay={
                  synthRetry && synthRetry.turnId === turn.id
                    ? synthRetry
                    : null
                }
                {...(canRetrySynth
                  ? { onRetryJudge, onRetryMediatorRound }
                  : {})}
                {...(isLatestTurn && actionsEnabled && !hasBackgroundRun
                  ? { onResume }
                  : {})}
                hasBackgroundRun={hasBackgroundRun}
              />
            )
          })}
          {streamingTurn && (
            <>
              {/* Pin target: the top of the just-sent turn. `marginTop`
                  cancels the flex gap above it so the anchor doesn't add
                  space. The auto-scroll hook scrolls this to the top — and
                  sizes its bottom reserve from it, so a resumed turn (which
                  is never pinned) doesn't render one at all. */}
              {isResumedTurn ? null : (
                <div
                  ref={anchorRef}
                  aria-hidden
                  className={css({ height: 0, marginTop: '-12px' })}
                />
              )}
              <StreamingTurnView
                streamingTurn={streamingTurn}
                votingTurn={votingTurn}
                mediatingTurn={mediatingTurn}
                judgingTurn={judgingTurn}
                seats={council.seats}
              />
            </>
          )}
          {/* Point-of-consumption AI caveat: the one
              disclaimer that's read exactly where a verdict is consumed —
              About/README warn those who go looking, this line warns on
              every thread, at the moment of deciding to act. Same
              vocabulary as the hero + share-card caveats. */}
          <div
            className={css({
              textAlign: 'center',
              fontSize: '11px',
              lineHeight: 1.4,
              color: theme.colors.contentTertiary,
              // Quieter than plain tertiary on purpose —
              // present on every thread, but never competing
              // with the content. Keep it legible: its job is "the user
              // was warned where they read the answer".
              opacity: 0.75,
            })}
          >
            AI can make mistakes — even a full council. Verify before acting
            on it.
          </div>
          {/* Bottom-reserve spacer: the hook grows it so a fresh question
              can pin to the very top, and collapses it to 0 otherwise. */}
          <div ref={spacerRef} aria-hidden className={css({ flexShrink: 0 })} />
        </>
      )}
      {error && (
        <Notification
          kind={NotificationKind.negative}
          overrides={FULL_BLEED_NOTIFICATION_OVERRIDES}
        >
          {error}
        </Notification>
      )}
    </section>
  )
}
