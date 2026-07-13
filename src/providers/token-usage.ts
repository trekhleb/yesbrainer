import type { TokenUsage } from '@/types/council'

/**
 * Normalize the AI SDK's usage object into our `TokenUsage` shape. Both
 * fields are optional — providers that don't report counts leave them
 * undefined — so we return undefined rather than fabricating zeros,
 * which would skew cost totals downward.
 */
export function toTokenUsage(
  usage: { inputTokens?: number; outputTokens?: number } | undefined,
): TokenUsage | undefined {
  if (!usage) return undefined
  const { inputTokens, outputTokens } = usage
  return typeof inputTokens === 'number' && typeof outputTokens === 'number'
    ? { input: inputTokens, output: outputTokens }
    : undefined
}
