/**
 * Council domain types — the shapes the app works with in memory. The
 * Dexie rows in `storage/db.ts` mirror them one-to-one:
 *
 *   councils  ──< seats
 *   councils  ──< turns ──< events (events JSON property on the turn row)
 */

import type { DimensionConfig } from '@/storage/behavior'
import type { InterruptionCause } from '@/utils/session/interruption'

export const SOCIAL_STRUCTURE_VALUES = [
  'roundtable',
  'trial',
  'consensus',
  'custom',
] as const

export type SocialStructure = (typeof SOCIAL_STRUCTURE_VALUES)[number]

/**
 * Coerce a persisted structure id onto the current union. IndexedDB rows
 * are written by whatever build was running at the time and are NOT
 * re-validated on read (zod guards only the import path) — so after an id
 * rename (`townhall` → `consensus`) stale rows still carry the
 * old string, typed as `SocialStructure` but off the union, and an
 * exhaustive keyed lookup (`SOCIAL_STRUCTURE_COLORS[id]`) dereferences
 * `undefined` and takes down the render. Every row→object mapper in
 * storage runs reads through this: unknown ids degrade to `custom`, the
 * one structure every surface already renders neutrally (no pill, slate
 * palette) — degraded display, never a crash.
 */
export function normalizeSocialStructure(value: unknown): SocialStructure {
  return (SOCIAL_STRUCTURE_VALUES as readonly unknown[]).includes(value)
    ? (value as SocialStructure)
    : 'custom'
}

/** Single runtime source for the reasoning-effort union — `SeatConfig`,
 *  the import schema's `z.enum`, and the run-options localStorage guard
 *  all derive from it, so a renamed effort id can't leave one of those
 *  lists silently accepting the old value.
 *
 *  One semantic dial, ordinal: how much deliberation the user
 *  pays for. `off` = as little thinking as the model legally allows; `max` =
 *  the most it offers. Each seat translates to its nearest native request
 *  shape in `providers/reasoning.ts` — there is deliberately no separate
 *  thinking on/off boolean (most providers encode on/off inside this same
 *  scale, and a toggle would be a fake affordance on seats without one). */
export const REASONING_EFFORT_VALUES = [
  'off',
  'low',
  'medium',
  'high',
  'max',
] as const

export type ReasoningEffort = (typeof REASONING_EFFORT_VALUES)[number]

type RoleType =
  | 'participant'
  | 'reanswer'
  | 'vote'
  | 'judge'
  | 'mediator'

/**
 * One Participant's rating of one *other* Participant's answer. Lives inside
 * `TurnEvent.vote` when `roleType === 'vote'` — the voter is identified by
 * the event's `seatId`, and each entry's `targetSeatId` points at the
 * Participant being rated.
 *
 * Dimensions are *dynamic*: the user configures them in Settings →
 * Behavior, and each becomes a 1-5 field in the vote schema. Defaults
 * are `accuracy / completeness / insight`; per-council customisation
 * supports domain-specific rubrics (legal-advice ≠ creative-writing
 * ≠ code-review).
 *
 * Storage uses real seat ids. The Model A/B/C anonymization that the
 * voter LLM sees is rebuilt per turn from `Turn.votingLabels` —
 * purely cosmetic inside the prompt, never persisted as the canonical
 * reference.
 */
export interface VoteEntry {
  targetSeatId: string
  /** Dimension name → 1-5 inclusive. Names come from the council's
   *  configured `votingDimensions` setting (default: accuracy /
   *  completeness / insight). The Record is open-ended; downstream
   *  consumers (leaderboard, Judge prompt, UI) iterate `Object.keys`
   *  rather than hardcoding dimension names. */
  ratings: Record<string, number>
  /** Short free text — fed to the Judge for richer synthesis. */
  comment: string
}

export interface TokenUsage {
  input: number
  output: number
}

/**
 * Aggregated token usage. Used at two levels:
 *  - `Turn.tokenTotal` — sum of every event in one turn.
 *  - `Council.tokenTotal` — sum across every turn of the council.
 *
 * Counts come straight from each event's provider-reported `tokens` — we
 * never estimate or fabricate. Local / free models still accumulate here.
 */
export interface TokenTotals {
  inputTokens: number
  outputTokens: number
}

export interface SeatConfig {
  systemPrompt?: string
  temperature?: number
  /**
   * Provider-native tools for this seat. Three-state with a string-list
   * extension:
   *
   *   - `undefined` → all available tools for the model (default).
   *   - `true`      → all available tools (explicit; same effect).
   *   - `false`     → no tools.
   *   - `string[]`  → allow-list (only these tool names from the
   *                   model's available set; unknown names ignored).
   *
   * The reader is `getEnabledToolNamesForSeat` in
   * `src/providers/tools/enabled.ts` — single source of truth.
   * Tool names match the keys of the per-provider tool packs in
   * `src/providers/tools/index.ts` (`web_search`,
   * `code_execution`, `url_context`).
   */
  tools?: boolean | string[]
  /**
   * Cap on the model's output tokens for this seat. Bounds verbose
   * Participants whose long answers drown the voter prompt's
   * signal-to-noise. Passed through to the AI SDK's `maxOutputTokens`.
   * Undefined → provider default.
   */
  maxOutputTokens?: number
  /**
   * Reasoning / extended-thinking knob for this seat. Only
   * meaningful when the model's `capabilities.reasoning === true` —
   * applied via provider-specific `providerOptions` (Anthropic
   * `thinking`, OpenAI `reasoningEffort`, Google `thinkingConfig`).
   * Undefined → provider default (no thinking budget / default effort).
   */
  reasoningEffort?: ReasoningEffort
}

export interface Seat {
  id: string
  modelId: string
  config: SeatConfig
}

/**
 * Persisted seat / synthesiser config with off-union enum values dropped.
 * Same contract as `normalizeSocialStructure`, applied per field: Dexie
 * rows are not re-validated on read, so after an effort-id rename a stale
 * row would flow into `THINKING_BUDGET_TOKENS[effort]`
 * (`providers/reasoning.ts`) and produce a thinking request with an
 * `undefined` budget — a per-call provider error. Unknown → the knob is
 * unset (provider default): degraded, never broken.
 */
export function normalizeSeatConfig(config: SeatConfig): SeatConfig {
  if (
    config.reasoningEffort === undefined ||
    (REASONING_EFFORT_VALUES as readonly unknown[]).includes(
      config.reasoningEffort,
    )
  ) {
    return config
  }
  const { reasoningEffort: _stale, ...rest } = config
  return rest
}

/** `normalizeSeatConfig` lifted over the Judge / Mediator slot shape.
 *  Applied by every row→domain mapper that reads a synthesiser
 *  (`getCouncil`, `toBundleCouncil`) — the export path especially, since
 *  a stale value that exports raw fails the import schema's `z.enum` and
 *  breaks the "exports always round-trip" contract. */
export function normalizeSynthesiser<T extends { config: SeatConfig }>(
  slot: T,
): T {
  const config = normalizeSeatConfig(slot.config)
  return config === slot.config ? slot : { ...slot, config }
}

/**
 * Compact record of one provider-native tool call made by a Participant
 * during its stream. Captured from AI SDK 6's `fullStream` and
 * stored on the participant event so the chat thread can surface "what
 * the model actually looked up" without re-running. `query` is best-
 * effort: pulled from common arg shapes (`query`, `q`, `input`) — when
 * the tool's input shape doesn't match, only `name` lands.
 */
export interface ToolCallSummary {
  /** Tool identifier as it appeared in the stream (e.g. `web_search`). */
  name: string
  /** Extracted query string when the tool was a search-shaped tool. */
  query?: string
}

export interface TurnEvent {
  id: string
  roleType: RoleType
  seatId?: string
  modelId: string
  output: string
  ts: number
  /** Consensus debate round this event belongs to (1-indexed). Set on
   *  `reanswer` events (rounds ≥ 2) and on `mediator` events (mirrors
   *  `mediator.round`). Absent on round-1 `participant` events, which are
   *  implicitly round 1. */
  round?: number
  tokens?: TokenUsage
  /** Error message captured from the provider. Set when the seat tried to
   *  answer but failed — the event still exists in the turn so the UI can
   *  show "this Participant errored" rather than silently dropping the seat. */
  error?: string
  /** Set when `roleType === 'vote'` — the ratings this voter (seatId) gave
   *  to every *other* Participant. Storage is one event per voter,
   *  with one VoteEntry per target inside. */
  vote?: VoteEntry[]
  /** Raw model response (typically pretty-printed JSON) preserved when the
   *  schema-driven parser couldn't extract usable entries. Surfaced in the
   *  UI via an inspector popover so users can debug what the model actually
   *  sent back. Only set on vote-parse failures today; other roles may
   *  populate it later if a similar debug surface helps. */
  rawResponse?: string
  /** Set when `roleType === 'mediator'` — the per-round metadata the
   *  Mediator emits alongside its synthesis text. One
   *  event per round; `round` is 1-indexed. `convergent: true` means the
   *  Mediator self-assessed consensus and the orchestrator stopped
   *  early; `convergent: false` carries the next round's prompt input
   *  via `divergencePoints`. The synthesis text itself stays in
   *  `output`. */
  mediator?: MediatorRoundMetadata
  /** Provider-native tool calls captured during streaming.
   *  Surfaces in the chat thread as a small "🌐 Searched: 'X'"
   *  annotation under the model output. Empty / undefined when the
   *  seat didn't run tools (model lacks capability, user disabled,
   *  or the model didn't choose to call one). */
  toolCalls?: ToolCallSummary[]
}

interface MediatorRoundMetadata {
  round: number
  convergent: boolean
  /** Points the Mediator flagged as still divergent on this round.
   *  Threaded into the next round's prompt as the "what still needs to
   *  be reconciled" context. Absent when `convergent === true`. */
  divergencePoints?: string
  /** Compact "what happened this round" record the Mediator authors
   *  alongside its verdict — drives the per-round transparency digest in
   *  the UI (who moved toward consensus, who held). Optional because
   *  weaker models may omit it without failing the whole round. */
  roundDigest?: RoundDigest
}

/**
 * Per-round transparency digest authored by the Mediator. One line
 * of summary plus a movement entry per Participant, so the UI can show
 * "GPT moved, Claude held" at a glance and the full notes on expand.
 * Movements reference the anonymized Model A/B/C labels (the Mediator
 * works in label space); the UI maps them back to real seats via
 * `Turn.votingLabels`.
 */
export interface RoundDigest {
  /** 1-2 sentence recap of what shifted this round. */
  summary: string
  movements: MovementEntry[]
}

interface MovementEntry {
  /** Anonymized label (`A`, `B`, …) — resolved to a real seat by the UI. */
  label: string
  /** How this Participant's position moved relative to the prior round. */
  stance: 'converged' | 'shifted' | 'held' | 'new-point'
  /** Short note on what changed (or why they held). */
  note: string
}

/**
 * Lifecycle of the run that produces a turn.
 *
 * A council run is a chain of live provider streams that can last minutes.
 * The browser can take that chain away at any moment — iOS suspends the
 * whole process on lock, desktop discards backgrounded tabs — and a run
 * whose progress lived only in React state died with it, surfacing as a
 * wall of provider errors (or silently missing work) on return.
 *
 * So the turn row carries the run's own state, and every completed unit of
 * work is checkpointed into `events` as it lands. Presence of `runState`
 * means exactly one thing: **this turn has not finished**. The orchestrator
 * deletes it on completion (and on an explicit Stop), which keeps the
 * `runState.status` index sparse and makes "what needs recovering?" a
 * single indexed read.
 *
 * The fields beyond `status` exist so a *different page load* can rebuild
 * the run's inputs — the original closure is gone, so anything the resume
 * can't re-derive from the council or the turn has to be written down.
 */
export const RUN_STATUS_VALUES = ['running', 'interrupted'] as const

export type RunStatus = (typeof RUN_STATUS_VALUES)[number]

/** Which stage of the pipeline the run was in — drives the resume copy
 *  ("paused while the mediator was deliberating"), not the resume logic
 *  itself. What actually gets re-run is derived from the persisted events
 *  (`utils/session/remaining-work.ts`), which can't drift from reality the
 *  way a written-down phase marker can. */
export const RUN_PHASE_VALUES = [
  'answers',
  'voting',
  'judging',
  'mediating',
  'reanswering',
] as const

export type RunPhase = (typeof RUN_PHASE_VALUES)[number]

export interface TurnRunState {
  status: RunStatus
  phase: RunPhase
  /** Consensus debate round in flight (1-indexed). */
  round?: number
  maxRounds?: number
  startedAt: number
  /** Bumped periodically while a run is driving this turn. Informational
   *  only — "paused 4 minutes ago" copy. Liveness itself is decided by run
   *  ownership (`utils/session/run-lock.ts`), because a hidden tab's timers
   *  are throttled to ~1/min and a stale heartbeat would libel a perfectly
   *  healthy background run. */
  heartbeatAt: number
  /** The seats this turn fanned out to. Not derivable after the fact: the
   *  roster is editable, and an image-bearing turn skips non-vision seats,
   *  so "who was supposed to answer" is a property of the run, not of the
   *  council as it stands now. */
  activeSeatIds: string[]
  /** Composer run options captured at send. Sticky in localStorage today,
   *  but a resume must reproduce the run the user *started*, not the one
   *  their current settings would produce. */
  mutedTools?: string[]
  reasoningEffort?: ReasoningEffort
  /** Auto-resume attempts already spent on this turn. Capped so an unlock
   *  with no connectivity retries a couple of times and then waits for the
   *  user instead of burning tokens in a loop. */
  resumeAttempts?: number
  /** Why the run stopped, when the page lived long enough to notice. Absent
   *  after a hard kill — nothing ran to write it — which is why the UI
   *  treats backgrounding as the default explanation rather than claiming
   *  a cause it can't know. */
  cause?: InterruptionCause
}

/**
 * Read-boundary normalization for `runState` — same contract as
 * `normalizeSocialStructure` / `normalizeSeatConfig`: Dexie rows are
 * written by whatever build was running at the time and are never
 * re-validated on read.
 *
 * An unrecognised status or phase degrades to **no run state at all**, i.e.
 * "this turn is finished". That direction is deliberate: the failure mode of
 * guessing "unfinished" is an app that spends the user's BYOK tokens
 * re-running work it doesn't understand, which is strictly worse than an
 * old turn that simply never offers to resume.
 */
export function normalizeRunState(
  runState: TurnRunState | undefined,
): TurnRunState | undefined {
  if (!runState) return undefined
  const statusOk = (RUN_STATUS_VALUES as readonly unknown[]).includes(
    runState.status,
  )
  const phaseOk = (RUN_PHASE_VALUES as readonly unknown[]).includes(
    runState.phase,
  )
  if (!statusOk || !phaseOk) return undefined
  if (!Array.isArray(runState.activeSeatIds)) return undefined
  // Same hazard `normalizeSeatConfig` exists for, reached by a different
  // road: on a resume this effort becomes the run-wide override and lands in
  // `THINKING_BUDGET_TOKENS[effort]`, so a value from a build that spelled
  // the rungs differently would request a thinking budget of `undefined`.
  if (
    runState.reasoningEffort !== undefined &&
    !(REASONING_EFFORT_VALUES as readonly unknown[]).includes(
      runState.reasoningEffort,
    )
  ) {
    const { reasoningEffort: _stale, ...rest } = runState
    return rest
  }
  return runState
}

export interface Turn {
  id: string
  idx: number
  userMsg: string
  events: TurnEvent[]
  /** Present only while the turn is unfinished — see `TurnRunState`. */
  runState?: TurnRunState
  /** Aggregated token usage for this turn's events — summed from each
   *  event's provider-reported `tokens`. */
  tokenTotal: TokenTotals
  /**
   * Anonymized voting labels for this turn — `label → seatId` (e.g.
   * `{ A: 'seat-1', B: 'seat-2' }`). Built fresh and shuffled each turn so
   * Participants can't infer brand identity across turns. Persisted purely
   * for audit / debugging; the canonical voter→target reference inside
   * `TurnEvent.vote` always uses real seat ids.
   */
  votingLabels?: Record<string, string>
  /**
   * Image attachments the user sent with `userMsg`. Each entry
   * is a base64 `data:image/<mime>;base64,…` URI. Vision-capable seats
   * receive these alongside the text as AI SDK content blocks; non-
   * vision seats are skipped from the turn entirely (no event), and
   * the chat thread renders a small ghosted placeholder for them.
   * Inline base64 on the turn row is the v1 store — fine for the ~1.5 MiB
   * per-image cap the attach pipeline enforces; a content-addressed blob
   * store (separate Dexie table) can replace it if turn sizes bloat.
   */
  userImages?: string[]
}

/**
 * The Judge slot on a Trial council. Distinct from the Participant roster:
 * any reachable model, not constrained to the seats, picked at council
 * creation. Mirrors `Seat`'s `modelId` + `config` shape so the same per-seat
 * config UI (system prompt override, temperature, tools) can be reused.
 */
export interface Judge {
  modelId: string
  config: SeatConfig
}

/**
 * The Mediator slot on a Consensus council. Mirrors `Judge`'s
 * shape for the same reason — the same per-seat config UI (system prompt
 * override, temperature) can be reused. The Mediator referees a multi-round
 * Participant debate (up to `mediatorMaxRounds` per turn): each round it
 * judges convergence and, if not converged, surfaces the disagreements for
 * the Participants to reconsider — one `roleType: 'mediator'` event per round.
 */
export interface Mediator {
  modelId: string
  config: SeatConfig
}

/**
 * Per-council overrides for the deliberation knobs that otherwise resolve
 * from the global Settings (Behavior / Prompts). Every field is optional and
 * cascades — `council.deliberation?.X ?? global ?? hardcoded DEFAULT_X`,
 * resolved once per turn by `resolveDeliberation()`. An absent field (and an
 * absent `deliberation` entirely) means "use the global default", so councils
 * created before this existed behave exactly as they did.
 *
 * Scope note: the Judge's and Mediator's *system* prompts are deliberately
 * NOT here — those already have a per-council home on `judge.config.systemPrompt`
 * / `mediator.config.systemPrompt`, edited on their tabs in the settings modal.
 * These fields cover only the knobs with no seat to own them: the voting
 * rubric, the round cap, the Consensus pass-back toggles, and the role
 * prompts/templates that aren't a seat's system prompt.
 */
export interface CouncilDeliberation {
  /** All structures: the Participant answer-round voice for *this* council —
   *  one field, since a council has a single known structure (unlike the
   *  global three-way `participant` / `participantTrial` /
   *  `participantConsensus` split). Sits as a middle tier in the participant
   *  cascade: `seat.config.systemPrompt ?? deliberation.participant ?? global
   *  per-structure default ?? registry default`. Empty/absent → falls to the
   *  global per-structure default. */
  participant?: string
  /** Trial: rating rubric. Empty/absent → global `votingDimensions`. */
  votingDimensions?: DimensionConfig[]
  /** Trial: minimum voter-comment length (chars). */
  minCommentLength?: number
  /** Consensus: cap on debate rounds per turn. */
  mediatorMaxRounds?: number
  /** Consensus: pass the Mediator's distilled divergence framing into each
   *  Participant re-answer prompt. At least one of this / `passPeerAnswers`
   *  is always effectively on (the resolver enforces it). */
  passDivergence?: boolean
  /** Consensus: also pass the peers' anonymized answers into each re-answer
   *  prompt, so a Participant can check the framing against the source. */
  passPeerAnswers?: boolean
  /** Trial: voter-role system prompt. */
  votingSystem?: string
  /** Trial: voter-role user-message template. */
  votingTemplate?: string
  /** Consensus: Participant re-answer system prompt. */
  reanswerSystem?: string
  /** Consensus: Participant re-answer user-message template. */
  reanswerTemplate?: string
  /** Trial: Judge user-message template (the Judge *system* prompt lives on
   *  `judge.config.systemPrompt`). */
  judgeTemplate?: string
  /** Consensus: Mediator user-message template (the Mediator *system* prompt
   *  lives on `mediator.config.systemPrompt`). */
  mediatorTemplate?: string
}

export interface Council {
  id: string
  title: string | null
  createdAt: number
  socialStructure: SocialStructure
  seats: Seat[]
  turns: Turn[]
  /** Denormalized sum of every turn's tokenTotal. Updated atomically
   *  inside the Dexie transaction on turn append / event replace. */
  tokenTotal: TokenTotals
  /** Judge config, present for Trial councils. Roundtable / Consensus
   *  councils leave it undefined. Editable post-creation via `setJudge`
   *  (`storage/councils.ts`, structure-guarded). */
  judge?: Judge
  /** Mediator config, present for Consensus councils. Roundtable /
   *  Trial councils leave it undefined. Editable post-creation via
   *  `setMediator` (`storage/councils.ts`, structure-guarded). */
  mediator?: Mediator
  /** Per-council deliberation overrides (voting rubric, round cap, Consensus
   *  pass-back toggles, role prompt/template overrides). Absent → every knob cascades to
   *  the global Settings defaults. Chosen in the New-council modal and edited
   *  in the settings modal's Deliberation tab. */
  deliberation?: CouncilDeliberation
  /** Seeded demo council (a recorded real deliberation shipped with the
   *  app, so a keyless first visit has something real to feel). Drives the sidebar Demo
   *  tag + the in-thread demo banner, and is excluded from the "has
   *  councils → skip onboarding" gate. Demo councils are otherwise
   *  ordinary councils: deletable, renamable, and fully interactive once
   *  a usable model exists. The flag survives export/import round-trips
   *  so the recording claim stays honest. */
  isDemo?: boolean
}
