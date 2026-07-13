import { streamText } from 'ai'
import { getProviderModel } from '@/providers'
import {
  effectiveSystemPrompt,
  promptContent,
  runFailure,
  samplingCallOptions,
} from '@/providers/run-support'
import {
  extractErrorMessage,
  logRedactedError,
} from '@/utils/extract-error'
import { toTokenUsage } from '@/providers/token-usage'
import { throttleAccumulated } from '@/utils/throttle-accumulated'
import { getModel } from '@/models/registry'
import type { ReasoningEffort, TokenUsage } from '@/types/council'

/**
 * Streams the Judge synthesis. Different shape from `runParticipantStream`
 * because the Judge isn't carrying conversational history per seat — it
 * sees one composed user message (assembled from the turn's answers +
 * leaderboard + comments) and streams a single text response.
 */

export interface RunJudgeArgs {
  modelId: string
  system: string
  prompt: string
  systemPromptOverride?: string
  temperature?: number
  /** Cap on Judge output tokens. Undefined → provider default. */
  maxOutputTokens?: number
  /** Per-Judge reasoning effort. Translated to provider-specific
   *  `providerOptions`; undefined or non-reasoning Judge models → no
   *  thinking budget applied. */
  reasoningEffort?: ReasoningEffort
  /** The turn's image attachments (`data:image/…` URIs). The verdict on an
   *  image turn must weigh the image itself, not just the answers about it
   *  (earlier gap). Caller guards on the Judge model's vision capability
   *  — the Judge slot accepts any model, including text-only ones. */
  images?: string[]
  abortSignal: AbortSignal
  onChunk: (accumulated: string) => void
}

export interface JudgeResult {
  text: string
  aborted: boolean
  error?: string
  tokens?: TokenUsage
}

export async function runJudgeStream({
  modelId,
  system,
  prompt,
  systemPromptOverride,
  temperature,
  maxOutputTokens,
  reasoningEffort,
  images,
  abortSignal,
  onChunk,
}: RunJudgeArgs): Promise<JudgeResult> {
  const entry = getModel(modelId)
  let acc = ''
  // Coalesce the per-token UI callback to ~16 fps (see throttleAccumulated);
  // `stream.flush(acc)` after the loop guarantees the final text.
  const stream = throttleAccumulated(onChunk)
  let capturedError: string | null = null
  try {
    const result = streamText({
      model: getProviderModel(entry),
      // Per-Judge override falls back to the user/default system prompt —
      // same cascade Participants use.
      system: effectiveSystemPrompt(systemPromptOverride, system),
      // With images the composed user message becomes text + image content
      // blocks; without, the plain prompt keeps the established path.
      ...promptContent(prompt, images),
      abortSignal,
      ...samplingCallOptions({
        entry,
        temperature,
        maxOutputTokens,
        reasoningEffort,
      }),
      onError: ({ error }) => {
        logRedactedError('runJudgeStream', error, modelId)
        capturedError = extractErrorMessage(error)
      },
    })
    for await (const delta of result.textStream) {
      acc += delta
      stream.push(acc)
    }
    stream.flush(acc)
    if (capturedError) return { text: acc, aborted: false, error: capturedError }
    let tokens: TokenUsage | undefined
    try {
      tokens = toTokenUsage(await result.usage)
    } catch {
      // Usage promise rejected (rare). Synthesis text already landed; treat
      // as "no usage reported" rather than failing the whole call.
    }
    return { text: acc, aborted: false, tokens }
  } catch (err) {
    const failure = runFailure(err, abortSignal, 'runJudgeStream', modelId)
    if (failure.aborted) return { text: acc, aborted: true }
    return {
      text: acc,
      aborted: false,
      error: capturedError ?? failure.message,
    }
  }
}
