/**
 * Canned AI SDK behaviors for runner tests. `vi.mock('ai', …)` in the
 * test file swaps `streamText` / `generateObject` for the fns configured
 * here — the error classes stay the real ones (run-support's
 * classification depends on their `isInstance` markers).
 */

import type { LanguageModelUsage } from 'ai'

/** A fully-populated AI SDK usage object — the constructor types for the
 *  SDK error classes require every detail field. */
export function fullUsage(): LanguageModelUsage {
  return {
    inputTokens: 1,
    outputTokens: 1,
    totalTokens: 2,
    inputTokenDetails: {
      noCacheTokens: undefined,
      cacheReadTokens: undefined,
      cacheWriteTokens: undefined,
    },
    outputTokenDetails: { textTokens: undefined, reasoningTokens: undefined },
  }
}

export interface FakeStreamOptions {
  /** Text deltas the stream yields, in order. */
  deltas?: string[]
  /** Extra `fullStream` parts (e.g. tool-call parts) appended after the
   *  text deltas. */
  extraParts?: unknown[]
  usage?: { inputTokens?: number; outputTokens?: number }
  /** Reject the usage promise (provider envelope malformed). */
  usageRejects?: boolean
  /** Invoke the caller's `onError` with this before streaming. */
  emitError?: unknown
}

/** Build the object `streamText` resolves to. */
export function fakeStreamResult(
  opts: FakeStreamOptions,
  callerOptions?: { onError?: (e: { error: unknown }) => void },
) {
  if (opts.emitError !== undefined) {
    callerOptions?.onError?.({ error: opts.emitError })
  }
  const deltas = opts.deltas ?? []
  const usage = opts.usageRejects
    ? Promise.reject(new Error('malformed usage envelope'))
    : Promise.resolve(opts.usage ?? {})
  // A rejected usage promise must not trip the unhandled-rejection
  // tracker when a test path never awaits it.
  usage.catch(() => {})
  return {
    textStream: (async function* () {
      for (const d of deltas) yield d
    })(),
    fullStream: (async function* () {
      for (const d of deltas) yield { type: 'text-delta', text: d }
      for (const part of opts.extraParts ?? []) yield part
    })(),
    usage,
  }
}
