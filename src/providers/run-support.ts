/**
 * Shared scaffolding for the `run*` provider runners (Participant stream,
 * Judge, Mediator, votes, titles). Each runner keeps its own result shape
 * and control flow — these helpers centralise the *rules* every runner
 * must apply identically, so a fix lands once instead of five times:
 *
 *  - how sampling knobs + reasoning effort become call options,
 *  - how a prompt + image attachments become multi-modal content,
 *  - the per-role system-prompt override cascade,
 *  - the catch-tail contract (aborted → silent; anything else → redacted
 *    log + redacted message),
 *  - rich provider-failure classification for `generateObject` runners.
 */

import { APICallError, NoObjectGeneratedError } from 'ai'
import type { SharedV3ProviderOptions } from '@ai-sdk/provider'
import { buildReasoningProviderOptions } from '@/providers/reasoning'
import {
  extractErrorMessage,
  logRedactedError,
} from '@/utils/extract-error'
import { redactSecrets } from '@/utils/redact-secrets'
import type { ModelEntry } from '@/models/registry'
import type { ReasoningEffort } from '@/types/council'

/**
 * The optional sampling knobs shaped for spreading into a `streamText` /
 * `generateObject` call. Conditional spreads keep an unset knob *absent*
 * rather than an explicit `undefined` (some providers reject explicit
 * nulls), and the reasoning effort is folded into `providerOptions` here
 * so no runner can forget the translation step.
 */
export function samplingCallOptions(args: {
  entry: ModelEntry
  temperature?: number
  maxOutputTokens?: number
  reasoningEffort?: ReasoningEffort
}): {
  temperature?: number
  maxOutputTokens?: number
  providerOptions?: SharedV3ProviderOptions
} {
  const providerOptions = buildReasoningProviderOptions(
    args.entry,
    args.reasoningEffort,
  )
  return {
    ...(args.temperature !== undefined
      ? { temperature: args.temperature }
      : {}),
    ...(args.maxOutputTokens !== undefined
      ? { maxOutputTokens: args.maxOutputTokens }
      : {}),
    ...(providerOptions ? { providerOptions } : {}),
  }
}

/** One user message's content as AI SDK content blocks: the text plus one
 *  image part per attachment. Images are `data:image/…;base64,…` URIs,
 *  passed through verbatim — AI SDK accepts them as the `image` field. */
export function imageContentBlocks(
  text: string,
  images: readonly string[],
): Array<{ type: 'text'; text: string } | { type: 'image'; image: string }> {
  return [
    { type: 'text', text },
    ...images.map((image) => ({ type: 'image' as const, image })),
  ]
}

/**
 * A composed one-shot prompt as `streamText` / `generateObject` input:
 * plain `{ prompt }` without images (the well-trodden path), a single
 * multi-modal user message with them. Used by every runner that sends one
 * composed message (Judge, votes); the Participant stream builds per-turn
 * history messages itself via `imageContentBlocks`.
 */
export function promptContent(
  prompt: string,
  images: readonly string[] | undefined,
):
  | { prompt: string }
  | {
      messages: Array<{
        role: 'user'
        content: ReturnType<typeof imageContentBlocks>
      }>
    } {
  if (!images || images.length === 0) return { prompt }
  return {
    messages: [{ role: 'user', content: imageContentBlocks(prompt, images) }],
  }
}

/** The per-role system-prompt cascade: a configured override wins, but an
 *  empty / whitespace-only override falls through to the resolved default
 *  — the same "blank cascades down" rule as every other prompt tier. */
export function effectiveSystemPrompt(
  override: string | undefined,
  fallback: string,
): string {
  return override?.trim() ? override : fallback
}

/**
 * The catch-tail contract for a failed run: an abort is silent (the user
 * clicked Stop — not an error), anything else is logged *redacted* and
 * returned as a *redacted* message for the caller's result shape. Runners
 * keep their own shapes; this keeps the rule itself from drifting.
 */
export function runFailure(
  err: unknown,
  abortSignal: AbortSignal,
  site: string,
  modelId: string,
): { aborted: true } | { aborted: false; message: string } {
  if (abortSignal.aborted) return { aborted: true }
  logRedactedError(site, err, modelId)
  return { aborted: false, message: extractErrorMessage(err) }
}

/** Role-neutral description of a provider failure — see
 *  `describeProviderFailure`. */
export interface ProviderFailure {
  error: string
  /** Redacted raw model text / response body / error dump for the UI's
   *  click-to-inspect popover. */
  rawResponse?: string
  /** True for class-level failures (schema never parses, 4xx client
   *  errors) where re-running against the same inputs is doomed; callers
   *  that cascade (the Consensus round loop) bail early on it. */
  unrecoverable?: boolean
}

/**
 * Coerce whatever the provider / AI SDK threw into an actionable message
 * (+ raw response when available). `generateObject` is *much* less
 * forgiving than `streamText`: the model must produce JSON matching the
 * zod schema after AI SDK's internal retries. Two failure shapes dominate:
 *
 *  1. **`NoObjectGeneratedError`** — model returned text but it didn't
 *     parse / validate. The raw `.text` is the gold for debugging;
 *     `unrecoverable` because re-running the same doomed schema costs the
 *     same and fails the same (small Ollama-class models hit this).
 *  2. **`APICallError`** — provider HTTP error. 4xx = client-side (wrong
 *     key, bad request; unrecoverable), 5xx = provider trouble
 *     (transient; worth retrying).
 *
 * Everything else falls back to a generic message + the raw error
 * pretty-printed into `rawResponse`, so the user always has *something*
 * to inspect. Every string is redacted — `rawResponse` and `error` are
 * persisted and exported.
 */
export function describeProviderFailure(
  err: unknown,
  role: string,
  modelId: string,
): ProviderFailure {
  if (NoObjectGeneratedError.isInstance(err)) {
    // Model text, not a request dump — but `rawResponse` is persisted and
    // exported, so it goes through the same redaction as every sibling
    // branch rather than relying on that distinction staying true.
    const raw = err.text ? redactSecrets(err.text) : undefined
    return {
      error:
        `${role} (${modelId}) failed to produce valid structured output. ` +
        'Small local models (Ollama 8B-class, etc.) routinely struggle with strict JSON schemas — pick a stronger model (Claude / GPT / Gemini) for this role in Settings, or simplify the prompt to encourage shorter, more disciplined output. ' +
        'Click the red file icon to see what the model actually returned.',
      ...(raw ? { rawResponse: raw } : {}),
      unrecoverable: true,
    }
  }

  if (APICallError.isInstance(err)) {
    const status = err.statusCode
    const body = err.responseBody
      ? redactSecrets(err.responseBody.slice(0, 2000))
      : undefined
    if (status && status >= 400 && status < 500) {
      return {
        error:
          `${role} (${modelId}) provider returned ${status} ${redactSecrets(err.message)}. ` +
          'Likely client-side: check the model id / API key / request shape. Click the red file icon for the provider response body.',
        ...(body ? { rawResponse: body } : {}),
        unrecoverable: true,
      }
    }
    if (status && status >= 500) {
      return {
        error:
          `${role} (${modelId}) provider returned ${status} ${redactSecrets(err.message)}. ` +
          'Likely transient (server overload, timeout). A retry may recover; if not, try a different model.',
        ...(body ? { rawResponse: body } : {}),
        // Not unrecoverable — 5xx really can be transient.
      }
    }
    return {
      error: `${role} (${modelId}) provider call failed: ${redactSecrets(err.message)}`,
      ...(body ? { rawResponse: body } : {}),
    }
  }

  let rawDump: string | undefined
  try {
    rawDump = redactSecrets(
      JSON.stringify(err, errorReplacer, 2).slice(0, 20_000),
    )
  } catch {
    rawDump = undefined
  }
  return {
    error: `${role} (${modelId}) failed: ${extractErrorMessage(err)}`,
    ...(rawDump ? { rawResponse: rawDump } : {}),
  }
}

/** JSON-stringify replacer that preserves Error fields (name/message)
 *  which would otherwise be dropped — `JSON.stringify(new Error(...))` is
 *  `"{}"` by default. */
function errorReplacer(_key: string, value: unknown): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      ...(value.cause ? { cause: value.cause } : {}),
    }
  }
  return value
}
