/**
 * One Judge verdict, from persisted/derived turn context to a finished
 * `TurnEvent` — the single implementation behind both the live Trial phase
 * (`run-trial-phase.ts`) and the Judge retry (`use-retry-synthesis.ts`).
 *
 * The two used to assemble the context, prompt, vision guard, and event
 * shape separately ("same context the orchestrator builds", said a comment
 * — the classic drift setup). Callers now differ only in what they wire:
 * the event id (fresh uuid vs the errored event's id, for in-place
 * replacement) and where `onChunk` streams progress (the judging-turn
 * block vs the retry overlay).
 */

import { resolveDeliberation } from '@/hooks/session/resolve-deliberation'
import { runJudgeStream, type JudgeResult } from '@/providers/run-judge'
import {
  DEFAULT_INCLUDE_PRIOR_JUDGE,
  DEFAULT_SHOW_COMMENTS_TO_JUDGE,
  DEFAULT_SHOW_LEADERBOARD_TO_JUDGE,
  getBehaviorSettings,
} from '@/storage/behavior'
import {
  applyTemplate,
  DEFAULT_JUDGE_SYSTEM_PROMPT,
  getUserPrompts,
} from '@/storage/prompts'
import { buildJudgeContext } from '@/utils/judge-context'
import {
  resolveReasoningEffort,
  samplingArgs,
} from '@/utils/session/sampling-args'
import { modelSeesImages } from '@/utils/session/vision'
import type {
  CouncilDeliberation,
  Judge,
  Seat,
  SeatConfig,
  Turn,
  TurnEvent,
} from '@/types/council'

export interface JudgeSynthesisArgs {
  /** Id for the produced event — a fresh uuid on the live path, the
   *  errored event's id on the retry path (in-place replacement). */
  eventId: string
  judge: Judge
  /** Full roster — named leaderboard labels in the Judge context. */
  seats: Seat[]
  /** The turn's answer + vote events the verdict synthesizes from. */
  events: TurnEvent[]
  userMsg: string
  /** The turn's image attachments; attached only when the Judge model is
   *  vision-capable (the Judge slot accepts any model). */
  userImages?: string[]
  /** Turns before this one — compressed prior context, behavior-gated. */
  priorTurns: Turn[]
  /** Raw per-council overrides; resolved inside (council ?? global ?? default). */
  deliberation: CouncilDeliberation | undefined
  /** The composer's sticky thinking override — wins over the Judge's own
   *  `reasoningEffort` where the Judge model supports reasoning (live path
   *  gets it from the send's run options, the retry from storage). */
  reasoningEffortOverride?: NonNullable<SeatConfig['reasoningEffort']>
  abortSignal: AbortSignal
  onChunk: (accumulated: string) => void
}

export interface JudgeSynthesisOutcome {
  result: JudgeResult
  /** The finished judge event — `null` for a pure abort with no text
   *  (same "no record for a pure abort" rule as every other role). */
  event: TurnEvent | null
}

export async function runJudgeSynthesis(
  args: JudgeSynthesisArgs,
): Promise<JudgeSynthesisOutcome> {
  const behavior = getBehaviorSettings()
  const includePrior =
    behavior.includePriorJudge ?? DEFAULT_INCLUDE_PRIOR_JUDGE
  const subs = buildJudgeContext(args.events, args.seats, {
    priorTurns: includePrior ? args.priorTurns : undefined,
    showLeaderboard:
      behavior.showLeaderboardToJudge ?? DEFAULT_SHOW_LEADERBOARD_TO_JUDGE,
    showComments:
      behavior.showCommentsToJudge ?? DEFAULT_SHOW_COMMENTS_TO_JUDGE,
  })
  const judgeSystem =
    getUserPrompts().judgeSystem?.trim() || DEFAULT_JUDGE_SYSTEM_PROMPT
  const prompt = applyTemplate(
    resolveDeliberation(args.deliberation).judgeTemplate,
    {
      question: args.userMsg,
      answers: subs.answers,
      leaderboard: subs.leaderboard,
      comments: subs.comments || '(no voter comments)',
    },
  )
  const result = await runJudgeStream({
    modelId: args.judge.modelId,
    system: judgeSystem,
    systemPromptOverride: args.judge.config.systemPrompt,
    ...samplingArgs(
      args.judge.config,
      resolveReasoningEffort(args.judge, args.reasoningEffortOverride),
    ),
    prompt,
    ...(modelSeesImages(args.judge.modelId, args.userImages)
      ? { images: args.userImages }
      : {}),
    abortSignal: args.abortSignal,
    onChunk: args.onChunk,
  })
  const event: TurnEvent | null =
    result.aborted && result.text.length === 0
      ? null
      : {
          id: args.eventId,
          roleType: 'judge',
          modelId: args.judge.modelId,
          output: result.text,
          ts: Date.now(),
          ...(result.tokens ? { tokens: result.tokens } : {}),
          ...(result.error ? { error: result.error } : {}),
        }
  return { result, event }
}
