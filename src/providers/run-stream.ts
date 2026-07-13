import { streamText, type ToolSet } from 'ai'
import { getProviderModel } from '@/providers'
import {
  effectiveSystemPrompt,
  imageContentBlocks,
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
import type {
  ReasoningEffort,
  TokenUsage,
  ToolCallSummary,
} from '@/types/council'

/**
 * Plain async function for one Participant's streamed response.
 *
 * Used to be a React hook (`useParticipantStream`), but with N seats per
 * council we can't call hooks in a dynamic loop — so the streaming primitive
 * is now state-free. The caller (`useCouncilSession`) tracks per-seat
 * status / error / accumulated output externally, in its own state.
 *
 * Aborts propagate through the shared `abortSignal`, which the caller wires
 * up to a council-wide AbortController so "Stop" cancels every in-flight
 * seat in one call.
 */

export interface PromptMessage {
  role: 'user' | 'assistant'
  content: string
  /** Image attachments paired with this message. Only meaningful
   *  on `role: 'user'` messages; assistant turns don't carry images.
   *  Each entry is a `data:image/<mime>;base64,…` URI. When set, AI
   *  SDK content blocks are emitted instead of a plain string content
   *  so the provider receives the images as multi-modal input. */
  images?: string[]
}


export interface StreamResult {
  text: string
  aborted: boolean
  error?: string
  /** Token counts reported by the provider when the stream completed
   *  cleanly. Undefined for aborted / errored / partial streams — we don't
   *  fabricate zeros because that would skew cost totals downward. */
  tokens?: TokenUsage
  /** Provider-native tool calls observed during this stream.
   *  Captured from AI SDK's `fullStream` `tool-call` parts. Empty
   *  when tools weren't enabled OR the model didn't choose to call
   *  one. */
  toolCalls?: ToolCallSummary[]
}

export interface RunParticipantStreamArgs {
  modelId: string
  history: PromptMessage[]
  abortSignal: AbortSignal
  onChunk: (accumulated: string) => void
  /** Live-only reasoning feed: the model's thinking summary / thoughts,
   *  accumulated like `onChunk`, throttled the same way. Deliberately NOT
   *  part of `StreamResult` — reasoning is never persisted, so it can't
   *  leak into seat histories, voter/judge prompts, exports, or share
   *  cards. It exists purely for the in-flight thinking strip. */
  onReasoning?: (accumulated: string) => void
  /** Optional override; falls back to the registry entry's default. */
  systemPrompt?: string
  /** Provider-specific creativity knob; left undefined → provider default. */
  temperature?: number
  /** Cap on output tokens for this call. Undefined → provider
   *  default. Threaded straight into AI SDK's `maxOutputTokens`. */
  maxOutputTokens?: number
  /** Per-seat reasoning effort. Translated into provider-specific
   *  `providerOptions` via `buildReasoningProviderOptions`. Undefined or
   *  non-reasoning models → no thinking budget applied. */
  reasoningEffort?: ReasoningEffort
  /** Provider-native tools to attach to this stream. Resolved
   *  by the orchestrator via `buildToolsForEntry` after the per-seat
   *  + per-message override gating in `isToolsEnabledForSeat`. Pass
   *  `undefined` to skip the `tools` param entirely (preserves the
   *  long-standing behaviour for non-tools seats). */
  tools?: ToolSet
}

export async function runParticipantStream({
  modelId,
  history,
  abortSignal,
  onChunk,
  onReasoning,
  systemPrompt,
  temperature,
  maxOutputTokens,
  reasoningEffort,
  tools,
}: RunParticipantStreamArgs): Promise<StreamResult> {
  const entry = getModel(modelId)
  let acc = ''
  // Coalesce the per-token UI callback to ~16 fps — see throttleAccumulated.
  // The final text is guaranteed by the `stream.flush(acc)` after the loop
  // (and again by the orchestrator writing `result.text` when the seat ends).
  const stream = throttleAccumulated(onChunk)
  // Reasoning (thinking summaries / thoughts) accumulates on its own track,
  // throttled independently — during a long think it's the *only* thing
  // moving, so it must not share the answer's frame budget.
  let reasoningAcc = ''
  const reasoningStream = onReasoning
    ? throttleAccumulated(onReasoning)
    : undefined
  // AI SDK v6 surfaces some failures (auth, CORS, network) through the
  // `onError` callback rather than the stream iterator — the iterator
  // completes normally with no text. Capturing both routes keeps a silent
  // empty-stream from looking like a successful turn.
  let capturedError: string | null = null
  // Tool-call capture. Reasoning capture widened the
  // loop to `fullStream` for every path — `textStream` would drop both the
  // `tool-call` and `reasoning-delta` parts.
  const toolCalls: ToolCallSummary[] = []
  try {
    const result = streamText({
      model: getProviderModel(entry),
      // Per-seat override falls back to the registry default — the same
      // "blank cascades down" rule as every other prompt tier.
      system: effectiveSystemPrompt(systemPrompt, entry.defaultSystemPrompt),
      messages: history.map(toModelMessage),
      abortSignal,
      ...samplingCallOptions({
        entry,
        temperature,
        maxOutputTokens,
        reasoningEffort,
      }),
      ...(tools ? { tools } : {}),
      onError: ({ error }) => {
        logRedactedError('runParticipantStream', error, modelId)
        capturedError = extractErrorMessage(error)
      },
    })
    for await (const part of result.fullStream) {
      if (part.type === 'text-delta') {
        acc += part.text
        stream.push(acc)
      } else if (part.type === 'reasoning-delta') {
        reasoningAcc += part.text
        reasoningStream?.push(reasoningAcc)
      } else if (part.type === 'reasoning-start') {
        // A fresh reasoning block (models can think in several segments,
        // e.g. between tool calls) — keep them readable as paragraphs.
        if (reasoningAcc.length > 0) reasoningAcc += '\n\n'
      } else if (part.type === 'tool-call') {
        const summary = summariseToolCall(part)
        if (summary) toolCalls.push(summary)
      }
    }
    // Guarantee the final accumulated text is painted even if the rate limit
    // dropped the last frame(s).
    stream.flush(acc)
    reasoningStream?.flush(reasoningAcc)
    if (capturedError) {
      return {
        text: acc,
        aborted: false,
        error: capturedError,
        ...(toolCalls.length > 0 ? { toolCalls } : {}),
      }
    }
    // Token usage arrives after the stream completes; in AI SDK 6 the promise
    // resolves with `{ inputTokens, outputTokens, ... }` where individual
    // fields can be undefined for providers that don't report them. Skip
    // recording usage rather than storing zeros — undefined is the honest
    // signal that we don't know.
    let tokens: TokenUsage | undefined
    try {
      tokens = toTokenUsage(await result.usage)
    } catch {
      // Usage promise rejected (rare; e.g. provider envelope was malformed).
      // Treat as "no usage reported" — the answer still came through fine.
    }
    return {
      text: acc,
      aborted: false,
      tokens,
      ...(toolCalls.length > 0 ? { toolCalls } : {}),
    }
  } catch (err) {
    const failure = runFailure(err, abortSignal, 'runParticipantStream', modelId)
    if (failure.aborted) {
      return {
        text: acc,
        aborted: true,
        ...(toolCalls.length > 0 ? { toolCalls } : {}),
      }
    }
    return {
      text: acc,
      aborted: false,
      error: capturedError ?? failure.message,
      ...(toolCalls.length > 0 ? { toolCalls } : {}),
    }
  }
}

/**
 * Compress an AI SDK `tool-call` part into the small `ToolCallSummary`
 * shape we persist on the event. We extract a best-effort
 * query string from common input shapes — every provider's web-search
 * tool puts the user's intent in a slightly different field (`query`,
 * `q`, `input`, sometimes nested under `action.query` for OpenAI). The
 * UI shows whatever we found; absence is fine (the tool name alone is
 * still informative).
 */
function summariseToolCall(part: unknown): ToolCallSummary | undefined {
  if (!part || typeof part !== 'object') return undefined
  const p = part as Record<string, unknown>
  const name =
    typeof p.toolName === 'string'
      ? p.toolName
      : typeof p.dynamicToolName === 'string'
        ? p.dynamicToolName
        : undefined
  if (!name) return undefined
  const input =
    (p.input as Record<string, unknown> | undefined) ??
    (p.args as Record<string, unknown> | undefined)
  let query: string | undefined
  if (input && typeof input === 'object') {
    if (typeof input.query === 'string') query = input.query
    else if (typeof input.q === 'string') query = input.q
    else if (typeof input.input === 'string') query = input.input
    else if (
      input.action &&
      typeof input.action === 'object' &&
      typeof (input.action as Record<string, unknown>).query === 'string'
    ) {
      query = (input.action as { query: string }).query
    }
  }
  return query ? { name, query } : { name }
}

/**
 * Convert a `PromptMessage` into the AI SDK 6 model-message shape.
 * Without images the content is a plain string (matches the
 * original shape exactly — keeps assistant messages and image-less
 * user messages on the well-trodden path). With images, the content
 * becomes an array of content blocks (text + image parts) so the
 * provider receives multi-modal input. The image string is passed
 * through verbatim — AI SDK accepts `data:image/...;base64,…` URIs
 * directly as the `image` field.
 */
function toModelMessage(
  m: PromptMessage,
):
  | { role: 'user'; content: ReturnType<typeof imageContentBlocks> }
  | { role: 'user' | 'assistant'; content: string } {
  if (m.role === 'user' && m.images && m.images.length > 0) {
    return { role: 'user', content: imageContentBlocks(m.content, m.images) }
  }
  return { role: m.role, content: m.content }
}

