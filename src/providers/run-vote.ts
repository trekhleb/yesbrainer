import { generateObject } from 'ai'
import { z } from 'zod'
import { getProviderModel } from '@/providers'
import {
  describeProviderFailure,
  promptContent,
} from '@/providers/run-support'
import { applyTemplate } from '@/storage/prompts'
import { logRedactedError } from '@/utils/extract-error'
import { redactSecrets } from '@/utils/redact-secrets'
import { toTokenUsage } from '@/providers/token-usage'
import {
  formatLabeledAnswers,
  labelsForVoter,
} from '@/utils/voting-labels'
import { resolveAnonymizedLabel } from '@/utils/session/anonymized-label'
import { modelSeesImages } from '@/utils/session/vision'
import { getModel } from '@/models/registry'
import type {
  Seat,
  TokenUsage,
  TurnEvent,
  VoteEntry,
} from '@/types/council'

/**
 * Trial-mode peer-review runner. Issues one structured (`generateObject`)
 * call per voter and parses the response into `VoteEntry[]` keyed by real
 * seat ids — the LLM sees only anonymized labels (Model A/B/C), and we map
 * each returned `label` back to the underlying `targetSeatId` using the
 * provided `labels` mapping.
 *
 * Skipped failure modes (kept simple):
 *  - Provider returns `label`s outside the expected set → those entries are
 *    dropped silently; the rest land. If *none* are valid, returns an error
 *    so the voter shows up as errored in the UI.
 *  - Aborts propagate through `abortSignal` (Stop button).
 */

interface RunVoteArgs {
  modelId: string
  system: string
  prompt: string
  /** Labels the voter is allowed to refer to (excludes the voter's own).
   *  Used to validate the response and to map labels → seat ids. */
  labelToSeat: Record<string, string>
  /** Names of the dimensions to rate. Each becomes a 1-5
   *  integer field in the `generateObject` schema. Order is preserved
   *  in the generated schema so providers that follow declaration order
   *  surface keys consistently. The orchestrator resolves this from
   *  `getBehaviorSettings().votingDimensions`. */
  dimensions: string[]
  /** Minimum length (chars) enforced on the voter's free-text comment
   * . When > 0, the comment field becomes
   *  `z.string().min(N).max(2000)`; a too-short comment trips
   *  `NoObjectGeneratedError` and surfaces as a vote error. Resolved
   *  by the orchestrator from `getBehaviorSettings().minCommentLength`.
   *  Default (0) applies no minimum. */
  minCommentLength: number
  /** The turn's image attachments (`data:image/…` URIs). When present the
   *  vote call sends multi-modal content — a voter rating answers *about*
   *  an image must see the image, or its accuracy ratings are guesses
   *  (earlier gap: voters rated photo-location answers blind). Caller
   *  guards on the voter model's vision capability. */
  images?: string[]
  abortSignal: AbortSignal
}

export interface VoteResult {
  vote: VoteEntry[]
  aborted: boolean
  error?: string
  tokens?: TokenUsage
  /** Pretty-printed snapshot of whatever the model returned, captured when
   *  the schema-driven parse couldn't yield any usable entries. Surfaced
   *  in the UI as a click-to-inspect popover next to the error tag. */
  rawResponse?: string
}

/**
 * Build the `generateObject` schema for the voting call. Each dimension
 * becomes its own named 1-5 integer field on each vote — explicit field
 * names give the LLM stronger guidance than a `Record<string, number>`
 * shape would, at the cost of having to construct the schema per turn.
 *
 * `comment` stays mandatory: the Judge's free-text context relies on it.
 * The "minimum comment length" knob layers a `.min(N)` on top
 * when `minCommentLength > 0`.
 */
function buildVoteSchema(dimensions: string[], minCommentLength: number) {
  const dimFields: Record<string, z.ZodNumber> = {}
  for (const dim of dimensions) {
    dimFields[dim] = z.number().int().min(1).max(5)
  }
  const commentSchema =
    minCommentLength > 0
      ? z.string().min(minCommentLength).max(2000)
      : z.string().max(2000)
  return z.object({
    votes: z.array(
      z.object({
        label: z.string(),
        ...dimFields,
        comment: commentSchema,
      }),
    ),
  })
}

async function runVoteGeneration({
  modelId,
  system,
  prompt,
  labelToSeat,
  dimensions,
  minCommentLength,
  images,
  abortSignal,
}: RunVoteArgs): Promise<VoteResult> {
  const entry = getModel(modelId)
  const voteSchema = buildVoteSchema(dimensions, minCommentLength)
  try {
    const result = await generateObject({
      model: getProviderModel(entry),
      system,
      schema: voteSchema,
      abortSignal,
      // With images the single user message becomes text + image content
      // blocks (same shape every runner sends); without, the plain
      // `prompt` string keeps the well-trodden path.
      ...promptContent(prompt, images),
    })
    const validLabels = new Set(Object.keys(labelToSeat))
    const vote: VoteEntry[] = []
    const droppedLabels: string[] = []
    for (const v of result.object.votes) {
      const normalized = resolveAnonymizedLabel(v.label, validLabels)
      const targetSeatId = normalized ? labelToSeat[normalized] : undefined
      if (!normalized || !targetSeatId) {
        droppedLabels.push(v.label)
        continue
      }
      // Per-dimension fields are added dynamically to the schema above
      // and don't appear in the inferred type — narrow `v` to a record
      // so we can pull each dimension by name. Missing dimensions
      // (model produced a partial object) are simply omitted from
      // `ratings`; the aggregator's union-of-keys logic handles that.
      const ratings: Record<string, number> = {}
      const vRecord = v as unknown as Record<string, unknown>
      for (const dim of dimensions) {
        const r = vRecord[dim]
        if (typeof r === 'number') ratings[dim] = r
      }
      vote.push({
        targetSeatId,
        ratings,
        comment: v.comment,
      })
    }
    const tokens = toTokenUsage(result.usage)
    if (vote.length === 0) {
      // Log the raw object so the user can inspect what the model actually
      // returned without having to instrument anything. Small models
      // (Ollama-hosted Llama 3.1 8B, etc.) routinely fail structured-output
      // schemas — this is the failure mode that surfaces it.
      console.warn(
        `[runVoteGeneration] ${modelId} returned no valid entries`,
        { valid: Object.keys(labelToSeat), dropped: droppedLabels, raw: result.object },
      )
      // Persisted + exported alongside the error — redacted like every
      // other error-path string (see utils/redact-secrets.ts).
      const rawResponse = redactSecrets(
        safeStringify(result.object).slice(0, 20_000),
      )
      return {
        vote,
        aborted: false,
        error:
          droppedLabels.length > 0
            ? `voter returned labels [${droppedLabels.join(', ')}] — expected ${Object.keys(labelToSeat).join('/')}. Small models often struggle with structured output; check the model or simplify the prompt.`
            : 'voter returned no entries (model may not support structured output)',
        tokens,
        rawResponse,
      }
    }
    return { vote, aborted: false, tokens }
  } catch (err) {
    if (abortSignal.aborted) {
      return { vote: [], aborted: true }
    }
    logRedactedError('runVoteGeneration', err, modelId)
    // Shared rich classification: a voter failing the structured-output
    // schema (`NoObjectGeneratedError`) now surfaces the model's raw text
    // and actionable guidance, same as the Mediator always did.
    const failure = describeProviderFailure(err, 'Voter', modelId)
    return {
      vote: [],
      aborted: false,
      error: failure.error,
      ...(failure.rawResponse ? { rawResponse: failure.rawResponse } : {}),
    }
  }
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

/**
 * One full per-voter pass: pick the labels the voter is allowed to see,
 * substitute them into the voting template, and invoke `runVoteGeneration`.
 * Used by both the initial Trial voting phase and the retry path so they
 * stay in lockstep — adding a new field to the substitution (or changing
 * how labels are filtered) lands in one place.
 */
export interface RunVoteForVoterArgs {
  voter: Seat
  votingLabels: Record<string, string>
  /** All events in the turn so far (used to format the labeled answers). */
  events: TurnEvent[]
  userMsg: string
  voteSystem: string
  voteTemplate: string
  /** Dimension names to rate. Threaded down to
   *  `runVoteGeneration` for the dynamic schema. */
  dimensions: string[]
  /** Already-formatted dimension description block — substituted into
   *  the voting template via `{dimensionsDescription}`. The orchestrator
   *  formats this once per turn (same text for every voter) so the prompt
   *  matches what the schema expects. */
  dimensionsDescription: string
  /** Min length enforced on the voter's `comment` field.
   *  Threaded down to `runVoteGeneration`'s dynamic schema. The
   *  orchestrator also surfaces it in the prompt via
   *  `{commentRequirement}` so the model sees the requirement, not
   *  just gets penalised by the schema after the fact. */
  minCommentLength: number
  /**
   * Whether to strip "As Claude, …" / "— GPT-4" self-identification from
   * each Participant's output before it enters the labeled answers block.
   * Resolved by the orchestrator from the Settings → Behavior toggle, so
   * the user's preference is respected in one place rather than re-read
   * here. Omitting falls through to `formatLabeledAnswers`'s safer
   * default (ON).
   */
  stripSelfId?: boolean
  /** The turn's image attachments. Attached to the vote call only when
   *  the voter's model is vision-capable (checked here, so the initial
   *  phase and the retry path can't diverge on the rule). */
  userImages?: string[]
  abortSignal: AbortSignal
}

export async function runVoteForVoter(
  args: RunVoteForVoterArgs,
): Promise<VoteResult> {
  const {
    voter,
    votingLabels,
    events,
    userMsg,
    voteSystem,
    voteTemplate,
    dimensions,
    dimensionsDescription,
    minCommentLength,
    stripSelfId,
    userImages,
    abortSignal,
  } = args
  const visibleLabels = labelsForVoter(votingLabels, voter.id)
  const labelToSeat: Record<string, string> = {}
  for (const l of visibleLabels) {
    const seatId = votingLabels[l]
    if (seatId) labelToSeat[l] = seatId
  }
  const answersBlock = formatLabeledAnswers(votingLabels, events, voter.id, {
    stripSelfId,
  })
  const commentRequirement =
    minCommentLength > 0
      ? `Each comment must be at least ${minCommentLength} characters long.`
      : ''
  const prompt = applyTemplate(voteTemplate, {
    question: userMsg,
    answers: answersBlock,
    dimensionsDescription,
    commentRequirement,
  })
  return runVoteGeneration({
    modelId: voter.modelId,
    system: voteSystem,
    prompt,
    labelToSeat,
    dimensions,
    minCommentLength,
    // Voters on an image turn are answer-producing seats, so in practice
    // they're vision-capable — but the guard keeps a mixed roster (or a
    // future voter-pool change) from sending images to a text-only model.
    ...(modelSeesImages(voter.modelId, userImages)
      ? { images: userImages }
      : {}),
    abortSignal,
  })
}

