/**
 * Pure validation and source-generation helpers for the OpenRouter catalog.
 *
 * This module has no network or filesystem side effects so unit tests can
 * exercise the untrusted-JSON boundary independently of the refresh script.
 */

import { z } from 'zod'

export const MAX_CATALOG_MODELS = 10_000

const boundedString = (max) => z.string().max(max)
const numericValue = z.union([
  z.number().finite(),
  boundedString(100).refine((value) => Number.isFinite(Number(value))),
])

export function normalizeContextWindow(value) {
  const n = Math.trunc(Number(value))
  return Number.isFinite(n) && n >= 0 ? Math.min(n, 100_000_000) : 0
}

const modelSchema = z
  .object({
    id: boundedString(512).min(1),
    name: boundedString(1_000).nullish(),
    pricing: z.object({ prompt: numericValue.nullish() }).nullish(),
    architecture: z
      .object({
        input_modalities: z.array(boundedString(64)).max(32).nullish(),
      })
      .nullish(),
    supported_parameters: z
      .array(boundedString(128))
      .max(256)
      .nullish(),
    context_length: numericValue.nullish(),
    top_provider: z
      .object({ context_length: numericValue.nullish() })
      .nullish(),
  })
  .refine(
    (model) =>
      normalizeContextWindow(
        model.context_length ?? model.top_provider?.context_length,
      ) > 0,
    { message: 'model must have a positive context window' },
  )

const catalogSchema = z.object({
  data: z.array(z.unknown()).max(MAX_CATALOG_MODELS),
})

/**
 * Validate the response envelope once, then validate rows independently:
 * one malformed remote record must not suppress every valid model.
 */
export function parseOpenRouterCatalog(payload) {
  const catalog = catalogSchema.safeParse(payload)
  if (!catalog.success) {
    return { ok: false, error: catalog.error.message }
  }

  const models = []
  const rejectedIndexes = []
  for (const [index, candidate] of catalog.data.data.entries()) {
    const model = modelSchema.safeParse(candidate)
    if (model.success) models.push(model.data)
    else rejectedIndexes.push(index)
  }
  return { ok: true, models, rejectedIndexes }
}

/**
 * Emit an inert single-quoted TypeScript literal from an untrusted scalar.
 * Normalize every JavaScript line terminator, including a standalone CR.
 */
export function quoteTsString(value) {
  return `'${String(value)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r\n|\r|\n|[\u2028\u2029]/g, '\\n')}'`
}

/** Locale-independent ordering for deterministic generated source. */
export function compareCatalogEntries(a, b) {
  const compareText = (left, right) =>
    left < right ? -1 : left > right ? 1 : 0
  return (
    compareText(a.label, b.label) ||
    compareText(a.providerModelId, b.providerModelId)
  )
}
