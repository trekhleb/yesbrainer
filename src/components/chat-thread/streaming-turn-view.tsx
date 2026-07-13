/**
 * Renders the *in-flight* turn (the one currently being deliberated on).
 * Twin of `<TurnView>`: same block shapes, but reads from the
 * orchestrator's in-flight phase states (`streamingTurn` / `votingTurn` /
 * `mediatingTurn` / `judgingTurn`) instead of from a persisted `Turn`.
 *
 *  - **Consensus**: once the Mediator phase starts, the whole turn renders
 *    through `<ConsensusTurn>` (round-1 answers + alternating Mediator
 *    assessments and re-answer rounds, live). Before that — during the
 *    round-1 answer fan-out — it's just the Roundtable.
 *  - **Trial / Parallel**: Roundtable + optional voting / judge.
 *
 * Per-turn actions (retry failed votes) are omitted on streaming panes —
 * the events aren't persisted yet, so there's no event id to act on.
 */

import { Fragment } from 'react'
import { JudgeBlock } from '@/components/judge-block'
import { ConsensusTurn } from '@/components/chat-thread/consensus-turn'
import { RoundtableGroup } from '@/components/roundtable-group'
import { UserBubble } from '@/components/user-bubble'
import { VotingBlock } from '@/components/voting-block'
import {
  consensusRoundsForMediating,
  panesForStreamingTurn,
} from '@/utils/chat-panes'
import { voterEntriesFromVotingTurn } from '@/utils/voter-entries'
import type { Council } from '@/types/council'
import type {
  JudgingTurn,
  MediatingTurn,
  StreamingTurn,
  VotingTurn,
} from '@/types/session'

export interface StreamingTurnViewProps {
  streamingTurn: StreamingTurn
  votingTurn: VotingTurn | null
  mediatingTurn: MediatingTurn | null
  judgingTurn: JudgingTurn | null
  seats: Council['seats']
}

export function StreamingTurnView({
  streamingTurn,
  votingTurn,
  mediatingTurn,
  judgingTurn,
  seats,
}: StreamingTurnViewProps) {
  // Each downstream phase only renders when its in-flight state matches the
  // same turn id. Two simultaneous turns can't happen today (the
  // orchestrator gates new turns on `busy`), but the id check keeps the
  // render honest if that ever changes.
  const hasVoting = !!votingTurn && votingTurn.id === streamingTurn.id
  const hasMediator = !!mediatingTurn && mediatingTurn.id === streamingTurn.id
  const hasJudge = !!judgingTurn && judgingTurn.id === streamingTurn.id

  return (
    <Fragment>
      <UserBubble
        content={streamingTurn.userMsg}
        images={streamingTurn.userImages}
      />
      {hasMediator && mediatingTurn ? (
        // Consensus debate in flight — the interleaved timeline owns the
        // round-1 answers too (it reads them from `streamingTurn`).
        <ConsensusTurn
          rounds={consensusRoundsForMediating(
            streamingTurn,
            mediatingTurn,
            seats,
          )}
          mediatorModelId={mediatingTurn.modelId}
          maxRounds={mediatingTurn.maxRounds}
        />
      ) : (
        <>
          <RoundtableGroup panes={panesForStreamingTurn(streamingTurn, seats)} />
          {hasVoting && votingTurn && (
            <VotingBlock
              seats={seats}
              voterEntries={voterEntriesFromVotingTurn(votingTurn)}
            />
          )}
          {hasJudge && judgingTurn && (
            <JudgeBlock
              modelId={judgingTurn.modelId}
              output={judgingTurn.output}
              status={judgingTurn.status}
              error={judgingTurn.error}
            />
          )}
        </>
      )}
    </Fragment>
  )
}
