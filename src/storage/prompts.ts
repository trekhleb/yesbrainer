/**
 * User-overridable default prompts and message templates — every prompt the
 * app sends to an LLM is editable from here.
 *
 * **Project principle:** any string the app authors and feeds into a model
 * (system prompts, synthetic user messages, future Judge / Mediator / titler
 * prompts) must surface in Settings → Prompts. Hardcoded defaults are the
 * fallback, not the canonical source. When you add a new prompt site, add a
 * field here, a `DEFAULT_*` constant, a textarea in `<CouncilsTab>`, and read
 * via `getUserPrompts()` at the call site.
 *
 * Resolution order for a seat's system prompt:
 *
 *   seat.config.systemPrompt   (per-seat, set in SeatConfigModal)
 *     ?? userPrompts.participant   (per-user default, Settings → Prompts)
 *     ?? registry.defaultSystemPrompt   (hardcoded, per-model)
 *
 * Template strings (like `votingTemplate`) use `{placeholder}` markers that
 * the call site substitutes via `applyTemplate()`.
 */

import { createReactiveLocalStorage } from '@/storage/reactive-localstorage'
import type { CouncilDeliberation, SocialStructure } from '@/types/council'

const STORAGE_KEY = 'yesbrainer:prompts'

export interface UserPrompts {
  /**
   * Participant system prompt for **Parallel** councils (and the fallback for
   * custom). Independent of the Trial / Consensus answer-round prompts below —
   * empty → the model's registry default.
   */
  participant?: string
  /**
   * Participant prompts for the **Trial** / **Consensus** answer round, each
   * independent of the others (no shared base). Empty → the model's registry
   * default — so all three structures match by default and diverge only when
   * a user customises one. Resolved by `resolveParticipantDefault()`.
   */
  participantTrial?: string
  participantConsensus?: string

  // --- Trial mode ---

  /**
   * System prompt for the voter role. Each Participant is re-invoked with
   * this prompt to rate the *other* Participants' answers, with brand
   * identities hidden behind Model A / Model B / ... labels (cleared per
   * turn). Empty → DEFAULT_VOTING_SYSTEM_PROMPT.
   */
  votingSystem?: string
  /**
   * User-message template fed to the voter on top of the system prompt.
   * Placeholders: `{question}` (this turn's user message), `{answers}` (the
   * anonymized labeled answers). The structured response shape is enforced
   * by the AI SDK `generateObject` schema, so the template doesn't have to
   * dictate format — it carries context. Empty → DEFAULT_VOTING_TEMPLATE.
   */
  votingTemplate?: string
  /**
   * System prompt for the Judge role. Sees real names + the leaderboard;
   * anonymization is reserved for the voter role where it actually
   * debiases. Empty → DEFAULT_JUDGE_SYSTEM_PROMPT.
   */
  judgeSystem?: string
  /**
   * User-message template for the Judge synthesis. Placeholders:
   * `{question}`, `{answers}` (named), `{leaderboard}` (per-target average
   * ratings), `{comments}` (free-text voter comments). Empty →
   * DEFAULT_JUDGE_TEMPLATE.
   */
  judgeTemplate?: string

  // --- Consensus mode ---

  /**
   * System prompt for the Mediator role. The Mediator runs up to N
   * rounds per turn (per the council's max-rounds setting), each round
   * producing a synthesis attempt + a self-assessed convergence
   * verdict. Empty → DEFAULT_MEDIATOR_SYSTEM_PROMPT.
   */
  mediatorSystem?: string
  /**
   * User-message template for one Mediator round. Placeholders:
   * `{question}`, `{answers}` (this round's Participant answers, shown
   * to the Mediator under anonymized Model A/B/C labels), `{round}`
   * (1-indexed), `{maxRounds}`, `{priorTranscript}` (compressed
   * synthesis + divergence points from previous rounds in *this* turn;
   * empty on round 1). Empty → DEFAULT_MEDIATOR_TEMPLATE.
   */
  mediatorTemplate?: string
  /**
   * System prompt for the Participant **re-answer** role (Consensus
   * debate). Each round after the first, every Participant is re-invoked
   * with this prompt to reconsider its own answer in light of the
   * Mediator's anonymized divergence framing (and optionally peers'
   * anonymized answers). Task-shaped so it layers on top of a per-seat
   * persona. Empty → DEFAULT_REANSWER_SYSTEM_PROMPT.
   */
  reanswerSystem?: string
  /**
   * User-message template for one Participant re-answer. Placeholders:
   * `{question}`, `{ownAnswer}` (this Participant's prior-round answer
   * verbatim), `{divergence}` (the Mediator's distilled disagreements —
   * empty when `passDivergence` is off), `{peerAnswers}` (peers'
   * anonymized answers — empty when `passPeerAnswers` is off), `{round}`
   * (1-indexed), `{maxRounds}`. Empty → DEFAULT_REANSWER_TEMPLATE.
   */
  reanswerTemplate?: string

  // --- Titler ---

  /**
   * System prompt for the LLM-generated council-title runner. Should
   * encourage *concise, distinguishable, memorable* phrases — the
   * sidebar truncates around 60 chars. Empty →
   * DEFAULT_TITLE_SYSTEM_PROMPT.
   */
  titleSystem?: string
  /**
   * User-message template for the titler. Placeholders: `{question}`
   * (the user's first message), `{firstAnswer}` (a representative
   * Roundtable answer if available — gives the titler context the
   * question alone may lack). Empty → DEFAULT_TITLE_TEMPLATE.
   */
  titleTemplate?: string
}

/**
 * Defaults for Trial mode. Voting uses anonymized labels (Model A/B/C)
 * so the voter LLM can't bias on brand; Judge sees real names since brand
 * identity helps the synthesis weight strengths/weaknesses honestly.
 */
/**
 * Voting system prompt — generic across dimensions. The
 * dimension names + descriptions are substituted into the *user-message*
 * template via `{dimensionsDescription}` instead of being hardcoded in
 * the system prompt, so per-council dimension configuration is picked up
 * without users having to rewrite this prompt.
 */
export const DEFAULT_VOTING_SYSTEM_PROMPT =
  "You are a Participant in a council, asked to vote on other Participants' answers to the user's question. " +
  'Each other Participant is shown to you under an anonymized single-letter label (Model A, Model B, Model C, …) so you can rate them on merit without brand bias. ' +
  'When you produce a vote, the `label` field MUST be exactly the bare letter shown to you — `"A"`, `"B"`, `"C"`, etc. — with no `Model ` prefix, no quotes, no extra punctuation. Use only labels that appear in the answers you were given. ' +
  'For each answer, rate every dimension listed in the user message on a 1-5 scale, and add a short, constructive comment explaining your reasoning. ' +
  'Be honest. Self-promotion is not the goal; helping the user is.'

/**
 * Voting user-message template — `{dimensionsDescription}` resolves to a
 * multi-line block of `- name: description` lines, one per configured
 * dimension. `{commentRequirement}` is empty when the operator hasn't
 * set a minimum comment length and otherwise resolves to one
 * sentence ("Each comment must be at least N characters long.") so the
 * model sees the requirement instead of just being penalised by the
 * schema after the fact.
 *
 * Existing user-overridden templates that don't include the placeholders
 * will silently drop the corresponding guidance; the Custom badge in
 * the Prompts tab flags overrides so users know to add new placeholders
 * when they don't match the defaults.
 */
export const DEFAULT_VOTING_TEMPLATE =
  "User's question:\n{question}\n\n" +
  "Other Participants' answers:\n{answers}\n\n" +
  'Rate each answer on these dimensions (1-5):\n{dimensionsDescription}\n\n' +
  '{commentRequirement}'

export const DEFAULT_JUDGE_SYSTEM_PROMPT =
  'You are the Judge of a council deliberation. ' +
  "You see all Participants' answers (named — the user wants you to weigh model strengths honestly), the peer-rating leaderboard (averages across voters on accuracy / completeness / insight), and the voters' free-text comments. " +
  'Synthesize the strongest final answer for the user: combine the best of each contribution, address gaps the leaderboard exposes, and briefly explain which inputs you weighted most heavily and why. ' +
  'Aim for a single coherent answer, not a rundown of who said what. ' +
  // The opener does double duty: it makes the in-thread verdict scannable
  // and it's what the shareable result card excerpts — so it must stand
  // alone if quoted (see utils/share-card.ts `verdictExcerpt`).
  'Open with a single sentence that states your verdict and could stand alone if quoted on its own, then give the reasoning that supports it.'

export const DEFAULT_JUDGE_TEMPLATE =
  "User's question:\n{question}\n" +
  '\n---\n\nParticipant answers:\n{answers}\n' +
  '\n---\n\nPeer-rating leaderboard (averages, 1-5):\n{leaderboard}\n' +
  '\n---\n\nVoter comments:\n{comments}\n' +
  '\n---\n\nWrite the synthesized final answer.'

/**
 * Defaults for the Participant re-answer role (Consensus debate).
 * Each round after the first, every Participant reconsiders its own prior
 * answer in light of the Mediator's anonymized divergence framing (and
 * optionally the peers' anonymized answers). The system prompt is
 * task-shaped (no "You are X" claim) so it composes cleanly on top of a
 * per-seat persona, and is deliberately **hardened against sycophancy**:
 * the failure mode of a participant-driven debate is models capitulating
 * to a confident majority, so the prompt tells them to move only on merit
 * and to hold a well-argued minority position.
 */
export const DEFAULT_REANSWER_SYSTEM_PROMPT =
  'You are in a multi-round council debate. A mediator has read every participant’s answer and surfaced where you disagree. ' +
  'Reconsider your own answer in light of the other positions: if another argument genuinely changes your mind, update it — and say briefly what changed it. ' +
  'But do not cave to a confident-sounding majority. If you remain convinced, hold your position and sharpen the reasoning for it — false agreement is worse than honest, well-argued disagreement. ' +
  'Write your updated answer in full — not a diff, not a list of changes, not commentary about revising. Your output replaces your previous answer for the next round.'

/**
 * `{divergence}` and `{peerAnswers}` resolve to *complete blocks*
 * (section header + content) when enabled, or empty strings when their
 * pass-back toggle is off — same convention as `{priorTranscript}` in the
 * Mediator template, so toggling a section never leaves a dangling header.
 */
export const DEFAULT_REANSWER_TEMPLATE =
  "User's question:\n{question}\n" +
  '\n---\n\nYour previous answer:\n{ownAnswer}\n' +
  '{divergence}' +
  '{peerAnswers}' +
  '\n---\n\nThis is round {round} of {maxRounds}. Write your updated answer below.'

/**
 * Default Mediator system prompt — the **referee** of a multi-round
 * Participant debate. The Mediator does not deliberate for the
 * Participants; each round it reads their (anonymized) answers and judges
 * whether they have converged. Three load-bearing outputs: (1) the
 * `convergent` verdict — `true` stops the loop, `false` sends
 * `divergencePoints` back to the Participants to reconsider next round;
 * (2) a `roundDigest` recording who moved toward consensus and who held,
 * for the user-facing transparency view; (3) a `synthesis` — the current
 * best consensus answer, which becomes the council's answer on the final
 * round.
 *
 * Label contract for prose fields: display-time de-anonymization
 * (`deanonymize` in `src/utils/chat-panes.ts`) is a literal replace of the
 * exact string `Model X`, so the prompt pins the Mediator to that singular
 * form — plurals ("Models A and B") or bare letters ("A and C") would leak
 * anonymized labels into the UI half-translated.
 *
 * The prompt asks for Markdown in `synthesis` / `divergencePoints`
 * explicitly because the Mediator runs `generateObject` (JSON mode) — in
 * free-text generation models fall into their formatted chat register on
 * their own, but writing into schema string fields they default to flat
 * prose. The render path (`round-card.tsx`) is Markdown either way, and
 * the share card strips it (`markdownToPlain`), so the opening-sentence
 * excerpt stays safe.
 */
export const DEFAULT_MEDIATOR_SYSTEM_PROMPT =
  'You are the Mediator refereeing a multi-round debate between council Participants (shown to you under anonymized labels Model A, Model B, …). ' +
  "Each round you see the Participants' current answers and, after the first round, your own prior read + the divergence points you flagged. " +
  'Produce: (1) `convergent` — `true` only when the Participants genuinely agree on substance, `false` while real disagreement remains; (2) `divergencePoints` — when not convergent, the specific open disagreements, stated concisely so the Participants can reconsider them next round; (3) `roundDigest` — a one-to-two sentence summary plus, for each Participant, a movement entry whose `label` is the bare letter shown to you (`A`, `B`, …) and whose `stance` is `converged` / `shifted` / `held` / `new-point` with a short note; (4) `synthesis` — your best current consensus answer, opening with a single sentence that states the current consensus and reads well if quoted alone (it is what the shareable result card excerpts), then the supporting detail. ' +
  'Write `synthesis` and `divergencePoints` in Markdown where structure helps readability — bullet lists for parallel points, **bold** for key phrases — as you would in a normal chat answer; keep the opening consensus sentence plain prose, not a heading. ' +
  'In all prose (synthesis, divergence points, digest summary and notes), refer to a Participant only by its full singular label — `Model A`, `Model B` — never a bare letter ("A and C agree") and never a plural ("Models A and B"; write "Model A and Model B" instead). The exact string is later replaced with the real model name for display, so any other phrasing breaks that substitution. ' +
  'Judge convergence honestly: distinguish genuine agreement from a weaker model simply capitulating to a confident one, and preserve a well-argued minority position rather than declaring false consensus — false convergence wastes the user\'s chance to see a real conflict. ' +
  'At max rounds without convergence, your final synthesis stands as the council\'s answer alongside the remaining divergence points.'

export const DEFAULT_MEDIATOR_TEMPLATE =
  "User's question:\n{question}\n" +
  '\n---\n\nParticipant answers:\n{answers}\n' +
  '\n---\n\nThis is round {round} of {maxRounds}.\n' +
  '{priorTranscript}' +
  '\n---\n\nProduce your synthesis attempt and your convergence verdict.'

/**
 * Default titler system prompt — task-shaped so it stays useful when
 * the user's question and first Roundtable answer are pasted in. Calls
 * out the three quality cues the README's product spec uses: concise,
 * distinguishable, memorable.
 */
export const DEFAULT_TITLE_SYSTEM_PROMPT =
  'You generate short, memorable titles for conversations between an AI council and a user. ' +
  'Each title becomes the sidebar label for the conversation. ' +
  'Aim for 3-7 words, in headline case (no period). Be concise, distinguishable from other generic chats, and easy to recognise later. ' +
  'Capture the *topic* of the question, not the answer; do not include the words "council", "conversation", "chat", or the model name. ' +
  'Output only the title text — no quotes, no markdown, no explanation.'

export const DEFAULT_TITLE_TEMPLATE =
  "User's first question to the council:\n{question}\n" +
  '\n---\n\nOne representative answer (for context — may be empty if no Participant succeeded yet):\n{firstAnswer}\n' +
  '\n---\n\nGive the title.'

/**
 * Tiny mustache-style substitution — no regex escaping needed since our
 * placeholder keys are alphabetic and the values are model labels / answer
 * text (the substituted text is left verbatim, including any literal
 * "{model}" string the model itself might produce).
 */
export function applyTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  let out = template
  for (const [k, v] of Object.entries(vars)) {
    out = out.split(`{${k}}`).join(v)
  }
  return out
}

/**
 * Resolve the user-level Participant default for a council's social structure.
 * Each structure is **independent** — its own field, falling straight through
 * to the model's registry default (returns `undefined`) when unset, with no
 * cross-structure inheritance. They're identical by default only because all
 * three start from the same hardcoded `DEFAULT_PARTICIPANT_PROMPT`. The
 * per-seat `systemPrompt` override (when present) still wins over this and is
 * applied by the caller first.
 */
export function resolveParticipantDefault(
  structure: SocialStructure,
  prompts: UserPrompts,
): string | undefined {
  if (structure === 'trial') return prompts.participantTrial?.trim() || undefined
  if (structure === 'consensus') {
    return prompts.participantConsensus?.trim() || undefined
  }
  // roundtable (Parallel) + custom use the `participant` field.
  return prompts.participant?.trim() || undefined
}

/**
 * The participant voice's baseline for one council, folding the per-council
 * override in front of the global per-structure default:
 *
 *   deliberation.participant ?? global per-structure default ?? undefined
 *
 * Returns `undefined` when neither tier is set, so the caller's per-seat
 * resolution still falls through to the model's registry default. The per-seat
 * `systemPrompt` override (when present) wins over this and is applied first by
 * the caller. Shared by the orchestrator (per-turn resolution) and the
 * seat-config modal (the "your default" baseline / Reset target) so the two
 * never disagree about a seat's effective default.
 */
export function resolveCouncilParticipantDefault(
  deliberation: CouncilDeliberation | undefined,
  structure: SocialStructure,
  prompts: UserPrompts,
): string | undefined {
  return (
    deliberation?.participant?.trim() ||
    resolveParticipantDefault(structure, prompts)
  )
}

const adapter = createReactiveLocalStorage<UserPrompts>({
  storageKey: STORAGE_KEY,
  eventName: 'yesbrainer:prompts-changed',
  defaultValue: {},
  // Strip empty/whitespace strings so absence is unambiguous —
  // `?? userDefault` in the orchestrator should resolve to undefined,
  // not to "".
  sanitize: (prompts) => {
    const clean: UserPrompts = {}
    for (const [k, v] of Object.entries(prompts)) {
      if (typeof v === 'string' && v.trim().length > 0) {
        clean[k as keyof UserPrompts] = v
      }
    }
    return clean
  },
})

export const getUserPrompts = adapter.get
export const setUserPrompts = adapter.set
export const promptsAdapter = adapter
