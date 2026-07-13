/**
 * Resolve a council's deliberation knobs to concrete values via the
 * three-tier cascade:
 *
 *   council.deliberation?.X  ??  global (Settings → Behavior / Prompts)  ??  DEFAULT_X
 *
 * This is the per-council extension of the global-vs-hardcoded cascade the
 * `behavior.ts` / `prompts.ts` modules already document — one extra level on
 * top. Read once per turn (or per phase) and the resolved values fed to every
 * orchestration site, so a council can override the voting rubric, round cap,
 * Consensus pass-back toggles, and the role prompts/templates without touching
 * the user's global defaults.
 *
 * Out of scope here (stays global / per-seat, by design):
 *  - `stripSelfId`, `includePriorJudge/Mediator`, `showLeaderboard/Comments` —
 *    correctness / cost knobs, not council-domain choices.
 *  - The Judge / Mediator *system* prompts — already per-council via
 *    `judge.config.systemPrompt` / `mediator.config.systemPrompt`.
 */

import {
  DEFAULT_MEDIATOR_MAX_ROUNDS,
  DEFAULT_MIN_COMMENT_LENGTH,
  DEFAULT_PASS_DIVERGENCE,
  DEFAULT_PASS_PEER_ANSWERS,
  DEFAULT_VOTING_DIMENSIONS,
  getBehaviorSettings,
  type DimensionConfig,
} from '@/storage/behavior'
import {
  DEFAULT_JUDGE_TEMPLATE,
  DEFAULT_MEDIATOR_TEMPLATE,
  DEFAULT_REANSWER_SYSTEM_PROMPT,
  DEFAULT_REANSWER_TEMPLATE,
  DEFAULT_VOTING_SYSTEM_PROMPT,
  DEFAULT_VOTING_TEMPLATE,
  getUserPrompts,
} from '@/storage/prompts'
import type { CouncilDeliberation } from '@/types/council'

// Completeness check (compile-time): the resolver must consume every
// `CouncilDeliberation` field except `participant` (resolved separately —
// see the header's scope note). A field added to the type but missed in
// `ResolvedDeliberation` would silently never take effect at run time.
type UnresolvedDeliberationKey = Exclude<
  keyof CouncilDeliberation,
  keyof ResolvedDeliberation | 'participant'
>
void (undefined as unknown as UnresolvedDeliberationKey satisfies never)

export interface ResolvedDeliberation {
  // Structural knobs.
  votingDimensions: DimensionConfig[]
  /** Raw resolved value; call sites still clamp via `clampMinCommentLength`. */
  minCommentLength: number
  /** Raw resolved value; call sites still clamp via `clampMediatorRounds`. */
  mediatorMaxRounds: number
  /** Consensus pass-back toggles. The resolver guarantees at least one is
   *  `true` (both-off would feed Participants nothing from their peers). */
  passDivergence: boolean
  passPeerAnswers: boolean
  // Role prompts / templates.
  votingSystem: string
  votingTemplate: string
  reanswerSystem: string
  reanswerTemplate: string
  judgeTemplate: string
  mediatorTemplate: string
}

/** council override ?? global override ?? hardcoded default, for strings —
 *  empty/whitespace at either level falls through (matches the orchestrator's
 *  existing `?.trim() || …` pattern). */
function pickString(
  council: string | undefined,
  global: string | undefined,
  fallback: string,
): string {
  return council?.trim() || global?.trim() || fallback
}

export function resolveDeliberation(
  deliberation: CouncilDeliberation | undefined,
): ResolvedDeliberation {
  const o = deliberation ?? {}
  const prompts = getUserPrompts()
  const behavior = getBehaviorSettings()

  // Dimensions: an empty array at either level is treated as "unset" so a
  // cleared rubric can never blank the voting schema.
  const councilDims = o.votingDimensions?.length ? o.votingDimensions : undefined
  const globalDims = behavior.votingDimensions?.length
    ? behavior.votingDimensions
    : undefined

  // Consensus pass-back, with the both-off guard: if both resolve false,
  // force divergence back on so the re-answer prompt always carries some
  // peer signal.
  const passPeerAnswers =
    o.passPeerAnswers ?? behavior.passPeerAnswers ?? DEFAULT_PASS_PEER_ANSWERS
  let passDivergence =
    o.passDivergence ?? behavior.passDivergence ?? DEFAULT_PASS_DIVERGENCE
  if (!passDivergence && !passPeerAnswers) passDivergence = true

  return {
    votingDimensions: councilDims ?? globalDims ?? DEFAULT_VOTING_DIMENSIONS,
    minCommentLength:
      o.minCommentLength ??
      behavior.minCommentLength ??
      DEFAULT_MIN_COMMENT_LENGTH,
    mediatorMaxRounds:
      o.mediatorMaxRounds ??
      behavior.mediatorMaxRounds ??
      DEFAULT_MEDIATOR_MAX_ROUNDS,
    passDivergence,
    passPeerAnswers,
    votingSystem: pickString(
      o.votingSystem,
      prompts.votingSystem,
      DEFAULT_VOTING_SYSTEM_PROMPT,
    ),
    votingTemplate: pickString(
      o.votingTemplate,
      prompts.votingTemplate,
      DEFAULT_VOTING_TEMPLATE,
    ),
    reanswerSystem: pickString(
      o.reanswerSystem,
      prompts.reanswerSystem,
      DEFAULT_REANSWER_SYSTEM_PROMPT,
    ),
    reanswerTemplate: pickString(
      o.reanswerTemplate,
      prompts.reanswerTemplate,
      DEFAULT_REANSWER_TEMPLATE,
    ),
    judgeTemplate: pickString(
      o.judgeTemplate,
      prompts.judgeTemplate,
      DEFAULT_JUDGE_TEMPLATE,
    ),
    mediatorTemplate: pickString(
      o.mediatorTemplate,
      prompts.mediatorTemplate,
      DEFAULT_MEDIATOR_TEMPLATE,
    ),
  }
}
