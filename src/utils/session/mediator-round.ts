/**
 * Shared builders for one Mediator round — the prompt the Mediator sees
 * and the `TurnEvent` its outcome persists as.
 *
 * Two call sites must stay byte-identical in how they frame a round: the
 * live debate loop (`hooks/session/run-consensus-phase.ts`) and the
 * final-round retry (`hooks/session/use-retry-synthesis.ts`). They used
 * to carry parallel copies of this code; any drift there means "retry the
 * failed round" quietly re-runs a *different* round than the one that
 * failed — same inputs, different framing. Single source kills the class.
 */

import { applyTemplate } from '@/storage/prompts'
import { formatLabeledAnswers } from '@/utils/voting-labels'
import { formatPriorTurnsForSynthesis } from '@/utils/judge-context'
import { formatMediatorPriorRounds } from '@/utils/session/format-mediator-prior-rounds'
import type { MediatorRoundResult } from '@/providers/run-mediator'
import type { Turn, TurnEvent } from '@/types/council'
import type { MediatorRoundOutcome } from '@/types/session'

export function buildMediatorRoundPrompt(args: {
  /** Resolved mediator user-message template (per-council ?? global ?? default). */
  template: string
  userMsg: string
  /** Per-turn anonymization map (label → seatId), stable across rounds. */
  labels: Record<string, string>
  /** The (re)answer events of the round being assessed. */
  roundEvents: TurnEvent[]
  /** Outcomes of the earlier rounds in this turn (for `{priorTranscript}`). */
  priorRounds: MediatorRoundOutcome[]
  round: number
  maxRounds: number
  stripSelfId: boolean
  /** Prior turns for the cross-turn continuity block; pass `undefined`
   *  when `includePriorMediator` is off. */
  priorTurns: Turn[] | undefined
}): string {
  const priorBlock = args.priorTurns
    ? formatPriorTurnsForSynthesis(args.priorTurns, 'mediator')
    : ''
  const currentAnswers = formatLabeledAnswers(
    args.labels,
    args.roundEvents,
    '',
    { stripSelfId: args.stripSelfId },
  )
  const answersBlock = priorBlock
    ? `${priorBlock}\n\n---\n\nCURRENT ROUND — Participant answers:\n${currentAnswers}`
    : currentAnswers
  return applyTemplate(args.template, {
    question: args.userMsg,
    answers: answersBlock,
    round: String(args.round),
    maxRounds: String(args.maxRounds),
    priorTranscript: formatMediatorPriorRounds(args.priorRounds),
  })
}

export function buildMediatorEvent(args: {
  /** Fresh uuid on live rounds; the errored event's id on retry
   *  (replace-in-place keeps the id). */
  id: string
  modelId: string
  round: number
  result: MediatorRoundResult
}): TurnEvent {
  const { id, modelId, round, result } = args
  return {
    id,
    roleType: 'mediator',
    modelId,
    output: result.synthesis,
    ts: Date.now(),
    round,
    ...(result.tokens ? { tokens: result.tokens } : {}),
    ...(result.error ? { error: result.error } : {}),
    ...(result.rawResponse ? { rawResponse: result.rawResponse } : {}),
    mediator: {
      round,
      convergent: result.convergent,
      ...(result.divergencePoints
        ? { divergencePoints: result.divergencePoints }
        : {}),
      ...(result.roundDigest ? { roundDigest: result.roundDigest } : {}),
    },
  }
}
