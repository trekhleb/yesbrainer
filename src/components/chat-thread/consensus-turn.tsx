/**
 * The interleaved Consensus debate timeline for one Consensus turn:
 *
 *   Roundtable (round 1) → Mediator (round 1) → Re-answer (round 2) →
 *   Mediator (round 2) → … → final Mediator synthesis
 *
 * Reads the pre-derived `ConsensusRoundView[]` (see `chat-panes.ts`), so
 * the persisted and in-flight callers share one renderer — they differ
 * only in how the rounds were built.
 */

import { Fragment } from 'react'
import { Notification, KIND as NotificationKind } from 'baseui/notification'
import { MediatorRoundBlock } from '@/components/mediator/round-block'
import { OpenAnchor } from '@/components/chat-thread/open-anchor'
import { RoundtableGroup } from '@/components/roundtable-group'
import { FULL_BLEED_NOTIFICATION_OVERRIDES } from '@/utils/notification-styles'
import type { MediatorRoundView } from '@/types/session'
import type { ConsensusRoundView } from '@/utils/chat-panes'

export function ConsensusTurn({
  rounds,
  mediatorModelId,
  maxRounds,
  isUnfinished = false,
  openAnchorRef,
}: {
  rounds: ConsensusRoundView[]
  /** Mediator model identity for the round headers. */
  mediatorModelId: string
  /** Configured round cap — rendered as "Round X of N" on each card. */
  maxRounds: number
  /** The run that produced this turn never finished (it was interrupted).
   *  Suppresses the "Final" badge: the last round that happened to land is
   *  not the debate's conclusion, and badging it as one would present an
   *  interruption as an outcome. */
  isUnfinished?: boolean
  /** Open-landing marker (latest turn only) — placed at the start of the
   *  last round's Mediator block (the deliberation's result), or of its
   *  answer lanes when the Mediator never ran. See `OpenAnchor`. */
  openAnchorRef?: React.RefObject<HTMLDivElement | null>
}) {
  // The final round is the latest whose Mediator produced synthesis text —
  // that's the council's answer. -1 when none did (don't badge an error),
  // and -1 throughout while the debate is merely paused part-way.
  let finalRound = -1
  for (let i = rounds.length - 1; !isUnfinished && i >= 0; i--) {
    const m = rounds[i]?.mediator
    if (m && m.status !== 'error' && m.synthesis.length > 0) {
      finalRound = m.round
      break
    }
  }

  const mediatorOutcomes = rounds
    .map((r) => r.mediator)
    .filter((m): m is MediatorRoundView => m !== undefined)
  const allErrored =
    mediatorOutcomes.length > 0 &&
    mediatorOutcomes.every((m) => m.status === 'error')

  return (
    <Fragment>
      {rounds.map((r, i) => {
        // Open-landing anchor at the turn's last section: the last round's
        // Mediator block, or its answer lanes when that round has no
        // Mediator (errored / never ran).
        const isLastRound = i === rounds.length - 1
        const anchor =
          openAnchorRef && isLastRound ? (
            <OpenAnchor anchorRef={openAnchorRef} />
          ) : null
        return (
          <Fragment key={r.round}>
            {r.mediator ? null : anchor}
            {r.round === 1 ? (
              <RoundtableGroup panes={r.answerPanes} />
            ) : (
              <RoundtableGroup
                panes={r.answerPanes}
                variant="reanswer"
                round={r.round}
              />
            )}
            {r.mediator && (
              <Fragment>
                {anchor}
                <MediatorRoundBlock
                  round={r.mediator}
                  maxRounds={maxRounds}
                  modelId={mediatorModelId}
                  isFinal={r.round === finalRound}
                />
              </Fragment>
            )}
          </Fragment>
        )
      })}
      {allErrored && (
        <Notification
          kind={NotificationKind.negative}
          overrides={FULL_BLEED_NOTIFICATION_OVERRIDES}
        >
          <strong>Mediator phase failed.</strong> Every round errored before
          producing a consensus — see the round cards above for the error and
          the raw model response. Most often the Mediator model can't produce
          JSON matching the required schema (typical with small Ollama-class
          models — try a stronger model like Claude / GPT / Gemini for the
          Mediator role).
        </Notification>
      )}
    </Fragment>
  )
}
