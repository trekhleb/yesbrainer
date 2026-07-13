import { generateObject } from 'ai'
import { z } from 'zod'
import { getProviderModel } from '@/providers'
import {
  describeProviderFailure,
  effectiveSystemPrompt,
  samplingCallOptions,
} from '@/providers/run-support'
import { logRedactedError } from '@/utils/extract-error'
import { toTokenUsage } from '@/providers/token-usage'
import { getModel } from '@/models/registry'
import type {
  ReasoningEffort,
  RoundDigest,
  TokenUsage,
} from '@/types/council'

/**
 * One Mediator round.
 *
 * Different shape from `runJudgeStream` because the Mediator must emit a
 * structured convergence verdict alongside its prose synthesis — the
 * orchestrator uses `convergent` to decide whether to stop early, and
 * `divergencePoints` to seed the next round's prompt. `generateObject`
 * gives us a strict schema for both; streaming is the cost — the
 * synthesis appears all at once instead of mid-prose. Acceptable: Mediator
 * outputs are typically shorter than Judge outputs, and the multi-round
 * structure already trains users to expect "round X arrives, round X+1
 * starts" rather than a continuous stream.
 *
 * Symmetric with `runJudgeStream`'s system-prompt override cascade —
 * per-Mediator config takes precedence over the user-default Mediator
 * system prompt.
 */
export interface RunMediatorRoundArgs {
  modelId: string
  system: string
  prompt: string
  systemPromptOverride?: string
  temperature?: number
  /** Cap on Mediator round output tokens. Undefined → provider
   *  default. */
  maxOutputTokens?: number
  /** Per-Mediator reasoning effort. */
  reasoningEffort?: ReasoningEffort
  abortSignal: AbortSignal
}

export interface MediatorRoundResult {
  synthesis: string
  convergent: boolean
  divergencePoints?: string
  /** Per-round transparency digest — who moved / who held. Optional:
   *  weaker models may omit it; the round still counts. */
  roundDigest?: RoundDigest
  aborted: boolean
  error?: string
  tokens?: TokenUsage
  /** Pretty-printed raw object / text when parsing failed. Surfaced in
   *  the UI via `<ErrorInspector>` so the user can see exactly what the
   *  model returned without instrumenting the network tab. */
  rawResponse?: string
  /** When set, the orchestrator treats subsequent rounds as doomed and
   *  bails the loop early — true for class-level "structured output
   *  unsupported" failures (`NoObjectGeneratedError`), false for
   *  potentially-transient failures (5xx, network) where retrying the
   *  next round is reasonable. */
  unrecoverable?: boolean
}

const roundDigestSchema = z.object({
  summary: z.string(),
  movements: z.array(
    z.object({
      label: z.string(),
      stance: z.enum(['converged', 'shifted', 'held', 'new-point']),
      note: z.string(),
    }),
  ),
})

const mediatorSchema = z.object({
  synthesis: z.string().min(1),
  convergent: z.boolean(),
  divergencePoints: z.string().max(20_000).optional(),
  // Optional so a model that omits the digest doesn't fail the whole
  // round — the synthesis + verdict are what's load-bearing.
  roundDigest: roundDigestSchema.optional(),
})

export async function runMediatorRound({
  modelId,
  system,
  prompt,
  systemPromptOverride,
  temperature,
  maxOutputTokens,
  reasoningEffort,
  abortSignal,
}: RunMediatorRoundArgs): Promise<MediatorRoundResult> {
  const entry = getModel(modelId)
  try {
    const result = await generateObject({
      model: getProviderModel(entry),
      system: effectiveSystemPrompt(systemPromptOverride, system),
      prompt,
      schema: mediatorSchema,
      abortSignal,
      ...samplingCallOptions({
        entry,
        temperature,
        maxOutputTokens,
        reasoningEffort,
      }),
    })
    const tokens = toTokenUsage(result.usage)
    return {
      synthesis: result.object.synthesis,
      convergent: result.object.convergent,
      ...(result.object.divergencePoints
        ? { divergencePoints: result.object.divergencePoints }
        : {}),
      ...(result.object.roundDigest
        ? { roundDigest: result.object.roundDigest }
        : {}),
      aborted: false,
      ...(tokens ? { tokens } : {}),
    }
  } catch (err) {
    if (abortSignal.aborted) {
      return { synthesis: '', convergent: false, aborted: true }
    }
    logRedactedError('runMediatorRound', err, modelId)
    // Rich classification (schema failure / 4xx / 5xx → message +
    // rawResponse + unrecoverable) is shared with every generateObject
    // runner — see `describeProviderFailure`.
    return {
      synthesis: '',
      convergent: false,
      aborted: false,
      ...describeProviderFailure(err, 'Mediator', modelId),
    }
  }
}
