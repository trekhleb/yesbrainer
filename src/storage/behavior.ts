/**
 * User-overridable orchestrator behaviour knobs — every quality-affecting
 * toggle that the orchestrator consults at runtime lives here.
 *
 * **Project principle (mirrors `prompts.ts`):** any knob that materially
 * affects how well the council performs must surface in the right user-
 * facing surface. Global defaults live in **Settings → Behavior**;
 * per-council choices live in the **New council** modal; per-seat overrides
 * live in the **seat-config modal**. Hardcoded constants are the fallback,
 * not the canonical source. When you add a new behaviour knob, add a field
 * here, a `DEFAULT_*` constant if it has a richer shape than a boolean, a
 * control in `<CouncilsTab>`, and read via `getBehaviorSettings()` (or the
 * `useBehaviorSettings` hook) at the call site.
 *
 * Resolution order at the orchestrator call site:
 *
 *   behavior.<knob>   (per-user override, Settings → Behavior)
 *     ?? DEFAULT_<KNOB>   (hardcoded, mirrors current orchestrator behaviour)
 *
 * Knobs default to current orchestrator behaviour so adopting the
 * Behavior tab is opt-in — nothing changes for users who never open it.
 *
 * Knob fields land per sub-slice.
 */

import type { NativeModelId } from '@/models/registry'
import { createReactiveLocalStorage } from '@/storage/reactive-localstorage'

const STORAGE_KEY = 'yesbrainer:behavior'

// Knob fields are optional and cascade to hardcoded `DEFAULT_*` constants at
// the call site, so absence means "use the orchestrator's built-in behaviour"
// and a future release that ships an improved default propagates to users
// who haven't explicitly overridden.
export interface BehaviorSettings {
  /**
   * Strip model self-identification ("As Claude, …", trailing "— GPT-4")
   * from each Participant's output before it enters the peer-voting pool.
   * Closes the anonymization leak flagged in DEVELOPMENT.md's security
   * principles — labels would otherwise be trivially de-anonymisable from
   * the first sentence. Default → `DEFAULT_STRIP_SELF_ID` (`true`).
   */
  stripSelfId?: boolean
  /**
   * Include each prior turn's user message + Judge synthesis as a
   * compressed "PRIOR TURNS" block in the Judge's `{answers}` substitution
   * for follow-up turns. Without this, the Judge sees only the current
   * turn and "expand on that" loses the antecedent. Default →
   * `DEFAULT_INCLUDE_PRIOR_JUDGE` (`true`). Compressed by design — full
   * Participant outputs from prior turns would balloon context cost and
   * the Judge synthesis already distils them.
   */
  includePriorJudge?: boolean
  /**
   * Consensus debate: pass the Mediator's distilled divergence
   * framing into each Participant re-answer prompt. Default →
   * `DEFAULT_PASS_DIVERGENCE` (`true`). At least one of this /
   * `passPeerAnswers` is always effectively on (the resolver forces
   * divergence back on if both are cleared).
   */
  passDivergence?: boolean
  /**
   * Consensus debate: also pass the peers' anonymized answers into
   * each re-answer prompt, so a Participant can check the Mediator's
   * framing against the source. Default → `DEFAULT_PASS_PEER_ANSWERS`
   * (`false`) — leaner by default; the framing usually suffices.
   */
  passPeerAnswers?: boolean
  /**
   * Per-council voting rating dimensions. Each entry becomes a
   * 1-5 integer field in the voting schema and contributes a line to the
   * `{dimensionsDescription}` substitution in the voting template.
   * Default → `DEFAULT_VOTING_DIMENSIONS` (the original `accuracy /
   * completeness / insight` triple, with their original descriptions).
   * Per-council customisation supports domain-specific rubrics —
   * legal-advice ≠ creative-writing ≠ code-review.
   */
  votingDimensions?: DimensionConfig[]
  /**
   * Maximum number of Mediator rounds per Consensus turn. The
   * Mediator can declare convergence early on any round; this caps the
   * total when convergence isn't reached. Default →
   * `DEFAULT_MEDIATOR_MAX_ROUNDS` (3).
   */
  mediatorMaxRounds?: number
  /**
   * Include prior turns' Mediator final synthesis as compressed context
   * for follow-up Consensus turns. Same pattern (and same rationale) as
   * `includePriorJudge`. Default → `DEFAULT_INCLUDE_PRIOR_MEDIATOR`
   * (`true`).
   */
  includePriorMediator?: boolean
  /**
   * Drop the `{leaderboard}` substitution payload from the synthesis
   * prompt (Judge in Trial, Mediator in Consensus — both consume
   * `buildJudgeContext`). Lets users A/B "synthesise from prose alone"
   * vs "with the numbers". Default → `DEFAULT_SHOW_LEADERBOARD_TO_JUDGE`
   * (`true`).
   */
  showLeaderboardToJudge?: boolean
  /**
   * Drop the `{comments}` substitution payload from the synthesis
   * prompt (Judge / Mediator — both use `buildJudgeContext`). Off
   * when the operator wants a cleaner prompt or has reason to think the
   * comments are low-signal noise. Default →
   * `DEFAULT_SHOW_COMMENTS_TO_JUDGE` (`true`).
   */
  showCommentsToJudge?: boolean
  /**
   * Minimum length (chars) for a voter's free-text comment. Enforced
   * via the `generateObject` zod schema (`z.string().min(N)`), so a
   * voter that returns a too-short comment trips
   * `NoObjectGeneratedError` and surfaces as a vote error. Combined with
   * `stripSelfId`, raises the quality of the Judge / Mediator's
   * free-text context. Default → `DEFAULT_MIN_COMMENT_LENGTH` (0, no
   * enforcement).
   */
  minCommentLength?: number
  /**
   * Preferred model for the LLM title-generator chain. When set,
   * the orchestrator tries this model first; falls back to the built-in
   * priority chain (gpt-5.4-nano → gemini-3.1-flash-lite → haiku-4.5 → ollama:llama3.1)
   * on auth / network / parse error. Undefined (the default) means
   * "use the chain from the top". Useful when an operator wants a
   * deterministic titler — e.g. always Ollama for offline work, or
   * always a specific cloud model for predictable cost.
   */
  titleModelId?: string
  /**
   * UI theme. Three values:
   *   - `'system'` — follow `prefers-color-scheme`. Default.
   *   - `'light'` — force the Base Web `LightTheme`.
   *   - `'dark'` — force the Base Web `DarkTheme`.
   * Undefined falls back to `'system'` so existing installs keep the
   * historic light-on-light look on machines with no OS dark pref.
   */
  themeMode?: 'system' | 'light' | 'dark'
}

export type ThemeMode = 'system' | 'light' | 'dark'
export const DEFAULT_THEME_MODE: ThemeMode = 'system'

/**
 * One rating dimension on the voting rubric. `name` is the canonical
 * identifier (used as the schema field name and the leaderboard key);
 * `description` is optional prose shown to the voter to disambiguate
 * what's being asked.
 */
export interface DimensionConfig {
  name: string
  description?: string
}

/**
 * Default for `stripSelfId`. ON by design: anonymization is a correctness
 * property of the voting protocol, not a stylistic preference — opting OUT
 * is the unusual choice, so the absence-means-default cascade points at
 * `true`.
 */
export const DEFAULT_STRIP_SELF_ID = true

/**
 * Default for `includePriorJudge`. ON by design: follow-up Trial turns
 * lose continuity without it ("expand on that" → expand on what?), and the
 * cost of a few extra paragraphs of prior-synthesis context is small next
 * to the cost of a re-run because the Judge missed the antecedent.
 */
export const DEFAULT_INCLUDE_PRIOR_JUDGE = true

/**
 * Defaults for the Consensus pass-back toggles. Divergence framing
 * is ON — it's the Mediator's value-add and the leanest useful signal;
 * peer answers are OFF — a fidelity opt-in. The resolver guarantees at
 * least one stays on (both-off would feed Participants nothing from their
 * peers and collapse the debate into blind re-answering).
 */
export const DEFAULT_PASS_DIVERGENCE = true
export const DEFAULT_PASS_PEER_ANSWERS = false

/**
 * Default voting dimensions — the original hardcoded triple, kept as
 * defaults so behaviour is identical for users who never touch the
 * setting. Names are lowercase by convention (used as schema field
 * names + dimension keys throughout); the UI title-cases for display.
 */
export const DEFAULT_VOTING_DIMENSIONS: DimensionConfig[] = [
  { name: 'accuracy', description: 'does it get the facts right?' },
  {
    name: 'completeness',
    description: 'does it cover the question fully?',
  },
  {
    name: 'insight',
    description: 'does it bring perspective you would have missed?',
  },
]

/**
 * Format the configured dimensions as a bullet list suitable for the
 * `{dimensionsDescription}` substitution in the voting template. One
 * `- name: description` line per dimension; description omitted when
 * absent so users who only care about names get a clean list.
 */
export function formatDimensionsDescription(
  dimensions: DimensionConfig[],
): string {
  return dimensions
    .map((d) => (d.description ? `- ${d.name}: ${d.description}` : `- ${d.name}`))
    .join('\n')
}

/**
 * Default Mediator round cap. Three is what the README's social-structure
 * description names ("up to 3 rounds"); also a practical cost ceiling on
 * multi-cloud councils since each round is one Mediator LLM call.
 */
export const DEFAULT_MEDIATOR_MAX_ROUNDS = 3

/**
 * Default for `includePriorMediator`. Same rationale as
 * `DEFAULT_INCLUDE_PRIOR_JUDGE`: follow-up Consensus turns lose
 * continuity without it.
 */
export const DEFAULT_INCLUDE_PRIOR_MEDIATOR = true

/**
 * Default for `showLeaderboardToJudge`. ON by design: numeric peer
 * ratings are signal the synthesis role uses to weight strengths /
 * weaknesses. Turning it off is a power-user A/B move, not the safer
 * default.
 */
export const DEFAULT_SHOW_LEADERBOARD_TO_JUDGE = true

/**
 * Default for `showCommentsToJudge`. ON for the same reason — voter
 * free-text typically carries the most useful synthesis signal (why
 * each rating landed where it did).
 */
export const DEFAULT_SHOW_COMMENTS_TO_JUDGE = true

/**
 * Default minimum voter-comment length. Zero = no enforcement, matching
 * previous behaviour where the comment field was `.max(2000)` only.
 * Operators who want a higher quality bar can crank this up; small
 * models will fail more often as a result (graceful via the existing
 * `runVoteGeneration` error path).
 */
export const DEFAULT_MIN_COMMENT_LENGTH = 0

/**
 * Built-in priority chain for the LLM title-generator. The
 * orchestrator walks this list and picks the first model whose
 * provider has a reachable BYOK key. A user-set `titleModelId`
 * preempts the chain (tried first); on its failure the chain runs as
 * a fallback. Ordered cheap → cheap → local so titler cost stays in
 * the noise.
 *
 * Models referenced here must exist in `registry.ts` — keep this list
 * trimmed when a registry entry is renamed or removed.
 */
export const TITLE_GENERATOR_CHAIN: readonly NativeModelId[] = [
  'openai:gpt-5.4-nano',
  'google:gemini-3.1-flash-lite',
  'anthropic:claude-haiku-4-5',
  'ollama:llama3.1',
] as const

const adapter = createReactiveLocalStorage<BehaviorSettings>({
  storageKey: STORAGE_KEY,
  eventName: 'yesbrainer:behavior-changed',
  defaultValue: {},
  // Strip empty/whitespace strings so absence is unambiguous —
  // `?? DEFAULT_X` at the call site should resolve to the hardcoded
  // fallback, not to "". Booleans and numbers pass through verbatim
  // (including `false` and `0`).
  sanitize: (settings) => {
    const clean: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(settings)) {
      if (typeof v === 'string') {
        if (v.trim().length > 0) clean[k] = v
      } else if (v !== undefined) {
        clean[k] = v
      }
    }
    return clean as BehaviorSettings
  },
})

export const getBehaviorSettings = adapter.get
export const setBehaviorSettings = adapter.set
export const behaviorAdapter = adapter
